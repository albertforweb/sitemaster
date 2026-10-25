import fs from 'node:fs';
import path from 'node:path';
import { DEPLOYMENTS_DIR, SITES_DIR, UPLOADS_DIR } from './config.js';
import { getSite, listPages, publishedContentByType } from './db.js';
import { renderSite } from './render.js';

const MANIFEST_NAME = '.sitemaster-manifest.json';
const CONTENT_FILE = 'content.json';
// Matches the site-relative and legacy absolute forms of a media reference.
const MEDIA_FILENAME_RE = /^(?:https?:\/\/[^/]+)?\/?media\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;

function collectMedia(value, found) {
  if (typeof value === 'string') {
    const match = value.trim().match(MEDIA_FILENAME_RE);
    if (match) found.add(match[1]);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMedia(item, found);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) collectMedia(value[key], found);
  }
}

/**
 * Copies each referenced library asset into the deployed output under media/ so
 * published pages resolve their relative media references without the control
 * plane. Site working copies win over the shared library original.
 */
function copyDeployedMedia(slug, outputDir, filenames) {
  if (!filenames.length) return [];
  const siteDir = path.join(SITES_DIR, slug, 'media');
  const mediaDir = path.join(outputDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true, mode: 0o755 });
  fs.chmodSync(mediaDir, 0o755);
  const copied = [];
  for (const filename of filenames) {
    const source = path.join(siteDir, filename);
    const fallback = path.join(UPLOADS_DIR, filename);
    const from = fs.existsSync(source) ? source : (fs.existsSync(fallback) ? fallback : null);
    if (!from) continue;
    fs.copyFileSync(from, path.join(mediaDir, filename));
    copied.push(`media/${filename}`);
  }
  return copied;
}

function outputDirectory(slug) {
  // Mainsite is mounted at Nginx's root. Other local sites are mounted below
  // /sites/<slug>/ by the same Nginx document root.
  return slug === 'mainsite'
    ? DEPLOYMENTS_DIR
    : path.join(DEPLOYMENTS_DIR, 'sites', slug);
}

function readManifest(outputDir) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(outputDir, MANIFEST_NAME), 'utf8'));
    return Array.isArray(value?.files)
      ? value.files.filter((file) => /^[a-z0-9-]+\.html$/.test(file) || file === 'index.html' || file === CONTENT_FILE)
      : [];
  } catch {
    return [];
  }
}

export function publishSite(slug) {
  const site = getSite(slug);
  if (!site) return null;
  const pages = listPages(slug, { publishedOnly: true });
  if (!pages.length) throw new Error('Publish requires at least one published page');
  const outputDir = outputDirectory(slug);
  // Published collections ship as one JSON document so a deployed site can read
  // content without an API call. Draft and archived entries are never included.
  const collections = publishedContentByType(slug);
  const resolveContent = (contentType, entrySlug) => (collections[contentType] || []).find((entry) => entry.slug === entrySlug) || null;
  // Published files are public website artifacts. They must be readable by
  // the Nginx worker, which runs as a different user from Sitemaster.
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
  if (slug !== 'mainsite') fs.chmodSync(path.dirname(outputDir), 0o755);
  fs.chmodSync(outputDir, 0o755);
  const previousFiles = readManifest(outputDir);
  const files = [];
  for (const page of pages) {
    const filename = page.slug === 'home' ? 'index.html' : `${page.slug}.html`;
    fs.writeFileSync(path.join(outputDir, filename), renderSite(site, page, { resolveContent }), { encoding: 'utf8', mode: 0o644 });
    files.push(filename);
  }
  for (const filename of previousFiles.filter((filename) => !files.includes(filename))) {
    fs.rmSync(path.join(outputDir, filename), { force: true });
  }
  fs.writeFileSync(
    path.join(outputDir, CONTENT_FILE),
    JSON.stringify({ site: site.slug, publishedAt: new Date().toISOString(), collections }, null, 2),
    { encoding: 'utf8', mode: 0o644 },
  );
  files.push(CONTENT_FILE);
  // Ship every media asset the published pages/settings/content reference.
  const referencedMedia = new Set();
  collectMedia(pages, referencedMedia);
  collectMedia(site.settings, referencedMedia);
  collectMedia(collections, referencedMedia);
  const media = copyDeployedMedia(slug, outputDir, [...referencedMedia]);
  fs.writeFileSync(path.join(outputDir, MANIFEST_NAME), JSON.stringify({ files, publishedAt: new Date().toISOString() }), { encoding: 'utf8', mode: 0o644 });
  return { site, files, outputDir, collections: Object.keys(collections), media };
}

export function unpublishSite(slug) {
  const outputDir = outputDirectory(slug);
  const files = readManifest(outputDir);
  for (const filename of files) fs.rmSync(path.join(outputDir, filename), { force: true });
  fs.rmSync(path.join(outputDir, MANIFEST_NAME), { force: true });
  return { files, outputDir };
}
