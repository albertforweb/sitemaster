import { SITEMASTER_IMPORT_MAX_BYTES, SITEMASTER_IMPORT_ORIGIN_MAP, SITEMASTER_IMPORT_TIMEOUT } from './config.js';
import { upsertImportedPage, updateSite } from './db.js';
import { assertSlug, validateSiteUrl } from './validation.js';

function parsedLocalUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('site URL is invalid'); }
  validateSiteUrl(parsed.origin);
  if (parsed.search || parsed.hash) throw new Error('site URL must not contain a query or fragment');
  return parsed;
}

function mappedUrl(sourceUrl) {
  const parsed = parsedLocalUrl(sourceUrl);
  const mapping = SITEMASTER_IMPORT_ORIGIN_MAP.find(([publicOrigin]) => parsed.origin === publicOrigin);
  return mapping ? `${mapping[1]}${parsed.pathname || '/'}` : parsed.toString();
}

async function fetchDocument(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITEMASTER_IMPORT_TIMEOUT);
  try {
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/html' } });
    if (!response.ok || response.status >= 300 && response.status < 400) throw new Error(`site returned HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > SITEMASTER_IMPORT_MAX_BYTES) throw new Error('site document is too large');
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > SITEMASTER_IMPORT_MAX_BYTES) throw new Error('site document is too large');
    return html;
  } finally {
    clearTimeout(timer);
  }
}

function textContent(html) {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim().slice(0, 20000);
}

function titleOf(html, fallback) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) || fallback;
}

function pageSlug(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (!clean || clean === 'index.html') return 'home';
  const last = clean.split('/').pop().replace(/\.html?$/i, '');
  return assertSlug(last.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'page');
}

export async function importSite({ site, sourceUrl }) {
  const publicOrigin = parsedLocalUrl(sourceUrl || site.originUrl).origin;
  const source = new URL(publicOrigin);
  const internalRoot = mappedUrl(publicOrigin);
  const rootHtml = await fetchDocument(internalRoot);
  const discovered = new Set(['/']);
  const linkPattern = /(?:href|action)=["']([^"']+)["']/gi;
  for (const match of rootHtml.matchAll(linkPattern)) {
    try {
      const url = new URL(match[1], source);
      if (url.origin === source.origin && !url.search && !url.hash && (/\/$/.test(url.pathname) || /\.html?$/i.test(url.pathname))) discovered.add(url.pathname);
    } catch { /* ignore malformed or external links */ }
  }
  const pages = [];
  const importedSlugs = new Set();
  for (const pathname of [...discovered].slice(0, 50)) {
    const publicUrl = new URL(pathname, source).toString();
    const internalUrl = mappedUrl(publicUrl);
    const html = pathname === '/' ? rootHtml : await fetchDocument(internalUrl);
    const slug = pageSlug(pathname);
    if (importedSlugs.has(slug)) continue;
    importedSlugs.add(slug);
    const title = titleOf(html, slug === 'home' ? site.name : slug.replace(/-/g, ' '));
    const text = textContent(html);
    pages.push(upsertImportedPage(site.slug, {
      slug,
      title,
      excerpt: text.slice(0, 240),
      template: 'imported',
      status: 'draft',
      blocks: [{ type: 'heading', level: 1, text: title }, ...(text ? [{ type: 'paragraph', text }] : [])],
      metadata: { importedFrom: publicUrl, importedAt: new Date().toISOString() },
    }));
  }
  updateSite(site.slug, { originUrl: publicOrigin });
  return { sourceUrl: publicOrigin, pages };
}
