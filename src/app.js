import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_ORIGINS, CONTENT_PAGE_MAX, CONTENT_PAGE_SIZE, MEDIA_MAX_BYTES, SITES_DIR, UPLOADS_DIR } from './config.js';
import {
  bulkContent, countContent, createContent, createContentType, createMedia, createPage, createSite,
  deleteContent, deleteContentType, deleteMedia, deletePage, deploySite, duplicateContent, getContent, getContentType, getMedia,
  getMediaByFilename,
  getPage, getSite, listContent, listContentCollections, listContentPlacements, listContentTypes, listMedia, listPages, listSites,
  publishedContentByType, repointContentReferences, setContentPlacements,
  queryContent, undeploySite, updateContent, updateContentType, updateMedia, updatePage, updateSite,
} from './db.js';
import {
  beginAdminLogin, clearSession, consumeLoginState, establishSession, exchangeCode, getLoginState, requireAuth,
  requireCsrf, requirePermission, requestId,
} from './auth.js';
import {
  parseValidationError, assertSlug, assertText, validateBlocks, validateBulkContentPayload, validateContentData, validateContentPayload,
  validateContentTypePayload, validatePlacementsPayload,
  validateMediaPayload, validatePagePayload, validateSettings, validateSiteUrl, validationError,
} from './validation.js';
import { copyMediaToSite, mediaUpload, removeMediaFile, storeMediaUpload } from './media.js';
import { importSite } from './importer.js';
import { publishSite, unpublishSite } from './publisher.js';
import { renderBlocks, renderSite } from './render.js';

const CONTENT_STATUS_FILTERS = ['draft', 'published', 'archived'];
const CONTENT_SORTS = ['updated', 'created', 'title', 'slug', 'order'];

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// node:sqlite reports UNIQUE and PRIMARY KEY collisions through errcode/errstr.
function isUniqueViolation(error) {
  return error?.errcode === 2067 || error?.errcode === 1555 || /UNIQUE constraint failed|PRIMARY KEY must be unique/i.test(String(error?.message || ''));
}

export const app = express();
const ADMIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/admin');
app.disable('x-powered-by');
app.enable('strict routing');
app.use((req, res, next) => {
  req.id = requestId();
  res.set({
    'X-Request-Id': req.id,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' });
  }
  if (req.method === 'OPTIONS') {
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) return res.status(403).end();
    res.set({ 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' });
    return res.status(204).end();
  }
  return next();
});
app.use(express.json({ limit: '256kb', strict: true }));

const buckets = new Map();
app.use((req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const current = buckets.get(key) || { count: 0, resetAt: Date.now() + 60_000 };
  if (current.resetAt <= Date.now()) { current.count = 0; current.resetAt = Date.now() + 60_000; }
  current.count += 1;
  buckets.set(key, current);
  if (current.count > 240) return res.status(429).json({ error: 'Too many requests' });
  return next();
});

function handleValidation(res, error) {
  if (isUniqueViolation(error)) return res.status(409).json({ error: 'That slug is already in use' });
  if (error?.validation) return res.status(400).json(parseValidationError(error));
  console.error(JSON.stringify({ event: 'write_error', requestId: res.req?.id, error: error.message }));
  return res.status(500).json({ error: 'Internal server error' });
}
function requireSite(req, res, next) {
  const site = getSite(req.params.siteSlug);
  if (!site || site.status !== 'active') return res.status(404).json({ error: 'Site not found' });
  req.site = site;
  return next();
}
function requireContentType(req, res, next) {
  try { assertSlug(req.params.contentType, 'contentType'); } catch (error) { return handleValidation(res, error); }
  return next();
}

app.get('/admin', (req, res) => res.redirect('/admin/'));
app.get('/login', (req, res) => res.redirect(beginAdminLogin(req.query.return_to || '/')));
app.get('/admin/login', (req, res) => res.redirect(beginAdminLogin(req.query.return_to || '/admin/')));
app.get('/admin/callback', async (req, res) => {
  const state = getLoginState(req.query.state);
  if (!state || typeof req.query.code !== 'string') return res.status(400).type('html').send('The Sitemaster sign-in request is invalid or expired.');
  try {
    const tokenSet = await exchangeCode(req.query.code, state.verifier);
    consumeLoginState(req.query.state);
    establishSession(res, tokenSet);
    res.set('Cache-Control', 'no-store');
    return res.redirect(state.returnTo);
  } catch (error) {
    console.error(JSON.stringify({ event: 'sitemaster_admin_login_failed', requestId: req.id, error: error.message }));
    return res.status(502).type('html').send('Sitemaster sign-in could not be completed. Please try again.');
  }
});
app.get('/admin/logout', (req, res) => {
  clearSession(req, res);
  return res.redirect('/');
});
app.get('/logout', (req, res) => {
  clearSession(req, res);
  return res.redirect('/');
});
app.use('/admin', express.static(ADMIN_DIR, { index: 'index.html', fallthrough: false, redirect: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));
// Sitemaster is a standalone control plane. Keep /admin as a compatibility
// alias, but make the root URL the canonical entry point for direct access.
app.use('/', express.static(ADMIN_DIR, { index: 'index.html', fallthrough: true, redirect: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));
// Uploaded media is public so deployed sites can reference it. Stored names are
// random and the response is locked down so a direct visit cannot run scripts.
app.use('/media', express.static(UPLOADS_DIR, {
  index: false,
  dotfiles: 'deny',
  redirect: false,
  maxAge: '7d',
  setHeaders: (res) => {
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.set('X-Content-Type-Options', 'nosniff');
  },
}));

// Working copies of library assets live inside each site's folder. They are
// referenced with site-relative URLs (media/<file>) so the same markup works in
// the designer preview and in the published output.
app.get('/sites/:siteSlug/media/:file', requireSite, (req, res) => {
  const file = path.basename(req.params.file);
  if (!file || file === '.' || file === '..') return res.status(404).end();
  const target = path.join(SITES_DIR, req.params.siteSlug, 'media', file);
  if (!fs.existsSync(target)) return res.status(404).end();
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  return res.sendFile(target);
});

// Local website delivery surface. Deployment only changes the published
// delivery state; all rendered values still come from validated records.
app.get('/sites/:siteSlug', requireSite, (req, res) => res.redirect(`/sites/${req.params.siteSlug}/`));
app.get('/sites/:siteSlug/', requireSite, (req, res) => {
  if (req.site.deployment.status !== 'deployed') return res.status(404).type('html').send('This website is not deployed.');
  const page = getPage(req.params.siteSlug, 'home', { publishedOnly: true });
  if (!page) return res.status(404).type('html').send('The deployed website has no published home page.');
  res.set('Cache-Control', 'no-store');
  return res.type('html').send(renderSite(req.site, page));
});

// Public delivery surface: only active sites and published records are exposed.
app.get('/api/public/sites/:siteSlug', requireSite, (req, res) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.json({ site: req.site });
});
app.get('/api/public/sites/:siteSlug/pages', requireSite, (req, res) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  return res.json({ pages: listPages(req.params.siteSlug, { publishedOnly: true }) });
});
app.get('/api/public/sites/:siteSlug/pages/:slug', requireSite, (req, res) => {
  const page = getPage(req.params.siteSlug, req.params.slug, { publishedOnly: true });
  if (!page) return res.status(404).json({ error: 'Page not found' });
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  return res.json({ page });
});
app.get('/api/public/sites/:siteSlug/content', requireSite, (req, res) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  return res.json({ collections: publishedContentByType(req.params.siteSlug) });
});
app.get('/api/public/sites/:siteSlug/content/:contentType', requireSite, requireContentType, (req, res) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  return res.json({ entries: listContent(req.params.siteSlug, req.params.contentType, { publishedOnly: true }) });
});
app.get('/api/public/sites/:siteSlug/content/:contentType/:slug', requireSite, requireContentType, (req, res) => {
  const entry = getContent(req.params.siteSlug, req.params.contentType, req.params.slug, { publishedOnly: true });
  if (!entry) return res.status(404).json({ error: 'Content not found' });
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  return res.json({ entry });
});

// Authenticated management surface. Permissions are application-owned and
// come from the Sitemaster audience token issued by IAM.
app.use('/api', requireAuth);
app.use('/api', requireCsrf);
app.get('/api/sites', requirePermission('sitemaster:site:read'), (req, res) => res.json({ sites: listSites() }));
app.post('/api/sites', requirePermission('sitemaster:site:manage'), (req, res) => {
  try {
    const slug = assertSlug(req.body?.slug);
    const name = assertText(req.body?.name, 'name', { max: 120 });
    const originUrl = req.body?.originUrl ? validateSiteUrl(req.body.originUrl) : '';
    const settings = validateSettings(req.body?.settings || {
      siteName: name, logoText: name.slice(0, 1).toUpperCase(), logoUrl: '', fontFamily: 'Inter, system-ui, sans-serif', theme: {},
    });
    return res.status(201).json({ site: createSite({ slug, name, originUrl, settings }) });
  } catch (error) {
    if (String(error?.code || '').includes('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Site slug already exists' });
    return handleValidation(res, error);
  }
});
app.patch('/api/sites/:siteSlug', requirePermission('sitemaster:site:manage'), requireSite, (req, res) => {
  try {
    const allowed = new Set(['name', 'status', 'originUrl', 'settings']);
    if (Object.keys(req.body || {}).some((key) => !allowed.has(key))) throw new Error('request body contains an unsupported field');
    const name = req.body.name === undefined ? undefined : assertText(req.body.name, 'name', { max: 120 });
    const status = req.body.status === undefined ? undefined : (['active', 'archived'].includes(req.body.status) ? req.body.status : (() => { throw new Error('status must be active or archived'); })());
    const originUrl = req.body.originUrl === undefined ? undefined : validateSiteUrl(req.body.originUrl);
    const settings = req.body.settings === undefined ? undefined : validateSettings(req.body.settings, { partial: true });
    const mergedSettings = settings ? { ...req.site.settings, ...settings, theme: { ...req.site.settings.theme, ...(settings.theme || {}) } } : undefined;
    return res.json({ site: updateSite(req.params.siteSlug, { name, status, originUrl, settings: mergedSettings }) });
  } catch (error) { return handleValidation(res, error); }
});
app.post('/api/sites/:siteSlug/import', requirePermission('sitemaster:site:manage'), requireSite, async (req, res) => {
  try {
    const result = await importSite({ site: req.site, sourceUrl: req.body?.sourceUrl || req.site.originUrl });
    return res.json(result);
  } catch (error) {
    console.error(JSON.stringify({ event: 'site_import_failed', siteSlug: req.params.siteSlug, requestId: req.id, error: error.message }));
    return res.status(400).json({ error: error.message || 'Site import failed' });
  }
});
app.post('/api/sites/:siteSlug/deploy', requirePermission('sitemaster:deploy'), requireSite, (req, res) => {
  try {
    const published = publishSite(req.params.siteSlug);
    const site = deploySite(req.params.siteSlug);
    return res.json({ site, files: published.files });
  } catch (error) { return res.status(400).json({ error: error.message || 'Site deployment failed' }); }
});
app.post('/api/sites/:siteSlug/undeploy', requirePermission('sitemaster:deploy'), requireSite, (req, res) => {
  unpublishSite(req.params.siteSlug);
  return res.json({ site: undeploySite(req.params.siteSlug) });
});

app.get('/api/sites/:siteSlug/pages', requirePermission('sitemaster:page:read'), requireSite, (req, res) => res.json({ pages: listPages(req.params.siteSlug) }));
app.post('/api/sites/:siteSlug/pages', requirePermission('sitemaster:page:create'), requireSite, (req, res) => {
  try { return res.status(201).json({ page: createPage(req.params.siteSlug, validatePagePayload(req.body)) }); }
  catch (error) { return handleValidation(res, error); }
});
app.patch('/api/sites/:siteSlug/pages/:slug', requirePermission('sitemaster:page:update'), requireSite, (req, res) => {
  try {
    const page = validatePagePayload(req.body, { partial: true });
    const updated = updatePage(req.params.siteSlug, req.params.slug, page);
    if (!updated) return res.status(404).json({ error: 'Page not found' });
    return res.json({ page: updated });
  } catch (error) { return handleValidation(res, error); }
});
app.delete('/api/sites/:siteSlug/pages/:slug', requirePermission('sitemaster:page:delete'), requireSite, (req, res) => {
  if (!deletePage(req.params.siteSlug, req.params.slug)) return res.status(404).json({ error: 'Page not found' });
  return res.status(204).end();
});
app.post('/api/sites/:siteSlug/pages/:slug/publish', requirePermission('sitemaster:publish'), requireSite, (req, res) => {
  const updated = updatePage(req.params.siteSlug, req.params.slug, { status: 'published' });
  if (!updated) return res.status(404).json({ error: 'Page not found' });
  return res.json({ page: updated });
});

app.get('/api/sites/:siteSlug/content', requirePermission('sitemaster:content:read'), requireSite, (req, res) => {
  const collections = listContentCollections(req.params.siteSlug);
  for (const collection of collections) {
    const type = getContentType(req.params.siteSlug, collection.slug);
    collection.name = type?.name || collection.slug;
    collection.description = type?.description || '';
    collection.registered = Boolean(type);
    collection.fields = type?.fields || [];
    collection.draft = countContent(req.params.siteSlug, collection.slug, 'draft');
    collection.published = countContent(req.params.siteSlug, collection.slug, 'published');
    collection.archived = countContent(req.params.siteSlug, collection.slug, 'archived');
  }
  for (const type of listContentTypes(req.params.siteSlug)) {
    if (collections.some((collection) => collection.slug === type.slug)) continue;
    collections.push({
      slug: type.slug, name: type.name, description: type.description, registered: true, fields: type.fields,
      total: type.entryCount, draft: 0, published: 0, archived: 0,
    });
  }
  return res.json({ collections });
});
app.get('/api/sites/:siteSlug/content-types', requirePermission('sitemaster:content:read'), requireSite, (req, res) => res.json({ types: listContentTypes(req.params.siteSlug) }));
app.post('/api/sites/:siteSlug/content-types', requirePermission('sitemaster:content:manage'), requireSite, (req, res) => {
  try {
    const type = createContentType(req.params.siteSlug, validateContentTypePayload(req.body));
    if (!type) return res.status(404).json({ error: 'Site not found' });
    return res.status(201).json({ type });
  } catch (error) { return handleValidation(res, error); }
});
app.patch('/api/sites/:siteSlug/content-types/:contentType', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  try {
    const updated = updateContentType(req.params.siteSlug, req.params.contentType, validateContentTypePayload(req.body, { partial: true }));
    if (!updated) return res.status(404).json({ error: 'Content type not found' });
    return res.json({ type: updated });
  } catch (error) { return handleValidation(res, error); }
});
app.delete('/api/sites/:siteSlug/content-types/:contentType', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  if (countContent(req.params.siteSlug, req.params.contentType) > 0) {
    return res.status(409).json({ error: 'Delete or move the entries in this collection first' });
  }
  if (!deleteContentType(req.params.siteSlug, req.params.contentType)) return res.status(404).json({ error: 'Content type not found' });
  return res.status(204).end();
});
// Registered before /content/:contentType so "preview" is never read as a collection.
app.post('/api/sites/:siteSlug/content/preview', requirePermission('sitemaster:content:read'), requireSite, (req, res) => {
  try {
    const blocks = validateBlocks(req.body?.blocks ?? []);
    res.set('Cache-Control', 'no-store');
    return res.json({ html: renderBlocks(blocks) });
  } catch (error) { return handleValidation(res, error); }
});
// "all" lists every collection together so the console can show one mixed table.
// It is registered before /content/:contentType so "all" is never read as a collection.
app.get('/api/sites/:siteSlug/content/all', requirePermission('sitemaster:content:read'), requireSite, (req, res) => {
  const limit = clampInteger(req.query.limit, CONTENT_PAGE_SIZE, 1, CONTENT_PAGE_MAX);
  const page = clampInteger(req.query.page, 1, 1, 100000);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  if (type) assertSlug(type, 'type');
  const status = typeof req.query.status === 'string' && CONTENT_STATUS_FILTERS.includes(req.query.status) ? req.query.status : '';
  const sort = typeof req.query.sort === 'string' && CONTENT_SORTS.includes(req.query.sort) ? req.query.sort : 'updated';
  const dir = req.query.dir === 'asc' ? 'asc' : 'desc';
  const { entries, total } = queryContent(req.params.siteSlug, type, { status, q, sort, dir, limit, offset: (page - 1) * limit });
  return res.json({ entries, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});
app.get('/api/sites/:siteSlug/content/:contentType', requirePermission('sitemaster:content:read'), requireSite, requireContentType, (req, res) => {
  const limit = clampInteger(req.query.limit, CONTENT_PAGE_SIZE, 1, CONTENT_PAGE_MAX);
  const page = clampInteger(req.query.page, 1, 1, 100000);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
  const status = typeof req.query.status === 'string' && CONTENT_STATUS_FILTERS.includes(req.query.status) ? req.query.status : '';
  const sort = typeof req.query.sort === 'string' && CONTENT_SORTS.includes(req.query.sort) ? req.query.sort : 'updated';
  const dir = req.query.dir === 'asc' ? 'asc' : 'desc';
  const { entries, total } = queryContent(req.params.siteSlug, req.params.contentType, { status, q, sort, dir, limit, offset: (page - 1) * limit });
  return res.json({ entries, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});
app.get('/api/sites/:siteSlug/content/:contentType/:slug', requirePermission('sitemaster:content:read'), requireSite, requireContentType, (req, res) => {
  const entry = getContent(req.params.siteSlug, req.params.contentType, req.params.slug);
  if (!entry) return res.status(404).json({ error: 'Content not found' });
  return res.json({ entry, placements: listContentPlacements(req.params.siteSlug, req.params.contentType, req.params.slug) });
});
app.post('/api/sites/:siteSlug/content/:contentType', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  try {
    const fields = getContentType(req.params.siteSlug, req.params.contentType)?.fields ?? [];
    return res.status(201).json({ entry: createContent(req.params.siteSlug, req.params.contentType, validateContentPayload(req.body, { fields })) });
  } catch (error) { return handleValidation(res, error); }
});
app.post('/api/sites/:siteSlug/content/:contentType/bulk', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  try {
    const { action, slugs } = validateBulkContentPayload(req.body);
    return res.json({ updated: bulkContent(req.params.siteSlug, req.params.contentType, slugs, action) });
  } catch (error) { return handleValidation(res, error); }
});
app.post('/api/sites/:siteSlug/content/:contentType/:slug/duplicate', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  const copy = duplicateContent(req.params.siteSlug, req.params.contentType, req.params.slug);
  if (!copy) return res.status(404).json({ error: 'Content not found' });
  return res.status(201).json({ entry: copy });
});
app.post('/api/sites/:siteSlug/content/:contentType/:slug/publish', requirePermission('sitemaster:publish'), requireSite, requireContentType, (req, res) => {
  const updated = updateContent(req.params.siteSlug, req.params.contentType, req.params.slug, { status: 'published' });
  if (!updated) return res.status(404).json({ error: 'Content not found' });
  return res.json({ entry: updated });
});
app.post('/api/sites/:siteSlug/content/:contentType/:slug/unpublish', requirePermission('sitemaster:publish'), requireSite, requireContentType, (req, res) => {
  const updated = updateContent(req.params.siteSlug, req.params.contentType, req.params.slug, { status: 'draft' });
  if (!updated) return res.status(404).json({ error: 'Content not found' });
  return res.json({ entry: updated });
});
app.patch('/api/sites/:siteSlug/content/:contentType/:slug', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  try {
    const payload = validateContentPayload(req.body, { partial: true, fields: getContentType(req.params.siteSlug, req.params.contentType)?.fields ?? [] });
    const target = payload.contentType || req.params.contentType;
    if (target !== req.params.contentType) {
      // Moving a collection revalidates the stored data against the new schema
      // and keeps any page placement pointing at the entry.
      payload.data = validateContentData(payload.data ?? getContent(req.params.siteSlug, req.params.contentType, req.params.slug)?.data ?? {}, getContentType(req.params.siteSlug, target)?.fields ?? []);
    }
    const updated = updateContent(req.params.siteSlug, req.params.contentType, req.params.slug, payload);
    if (!updated) return res.status(404).json({ error: 'Content not found' });
    const pages = target === req.params.contentType ? [] : repointContentReferences(req.params.siteSlug, req.params.contentType, req.params.slug, target);
    return res.json({ entry: updated, pages });
  } catch (error) { return handleValidation(res, error); }
});
// Publishing places an entry on the chosen pages: each page gains a reference
// block, and every other page loses it.
app.post('/api/sites/:siteSlug/content/:contentType/:slug/place', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  try {
    if (!getContent(req.params.siteSlug, req.params.contentType, req.params.slug)) return res.status(404).json({ error: 'Content not found' });
    const pages = validatePlacementsPayload(req.body);
    return res.json({ pages: setContentPlacements(req.params.siteSlug, req.params.contentType, req.params.slug, pages), placements: listContentPlacements(req.params.siteSlug, req.params.contentType, req.params.slug) });
  } catch (error) { return handleValidation(res, error); }
});
app.delete('/api/sites/:siteSlug/content/:contentType/:slug', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  if (!deleteContent(req.params.siteSlug, req.params.contentType, req.params.slug)) return res.status(404).json({ error: 'Content not found' });
  return res.status(204).end();
});

app.get('/api/sites/:siteSlug/media', requirePermission('sitemaster:content:read'), requireSite, (req, res) => res.json({ media: listMedia(req.params.siteSlug, { limit: clampInteger(req.query.limit, 60, 1, 200) }) }));
app.post('/api/sites/:siteSlug/media', requirePermission('sitemaster:content:manage'), requireSite, mediaUpload.single('file'), (req, res) => {
  if (!req.file) return handleValidation(res, validationError('a file upload is required', 'file'));
  return res.status(201).json({ media: storeMediaUpload(req.params.siteSlug, req.file) });
});
app.patch('/api/sites/:siteSlug/media/:mediaId', requirePermission('sitemaster:content:manage'), requireSite, (req, res) => {
  try {
    const updated = updateMedia(req.params.siteSlug, req.params.mediaId, validateMediaPayload(req.body, { partial: true }));
    if (!updated) return res.status(404).json({ error: 'Media not found' });
    return res.json({ media: updated });
  } catch (error) { return handleValidation(res, error); }
});
app.delete('/api/sites/:siteSlug/media/:mediaId', requirePermission('sitemaster:content:manage'), requireSite, (req, res) => {
  const removed = removeMediaFile(req.params.siteSlug, req.params.mediaId);
  if (!removed) return res.status(404).json({ error: 'Media not found' });
  deleteMedia(req.params.siteSlug, req.params.mediaId);
  return res.status(204).end();
});

// App-level media library: one shared pool every site draws from. Uploading and
// browsing here is site-independent; a site only gets copies of what it uses.
app.get('/api/media', requirePermission('sitemaster:content:read'), (req, res) => res.json({ media: listMedia('', { limit: clampInteger(req.query.limit, 120, 1, 200) }) }));
app.post('/api/media', requirePermission('sitemaster:content:manage'), mediaUpload.single('file'), (req, res) => {
  if (!req.file) return handleValidation(res, validationError('a file upload is required', 'file'));
  return res.status(201).json({ media: storeMediaUpload('', req.file) });
});
app.patch('/api/media/:mediaId', requirePermission('sitemaster:content:manage'), (req, res) => {
  try {
    const updated = updateMedia('', req.params.mediaId, validateMediaPayload(req.body, { partial: true }));
    if (!updated) return res.status(404).json({ error: 'Media not found' });
    return res.json({ media: updated });
  } catch (error) { return handleValidation(res, error); }
});
app.delete('/api/media/:mediaId', requirePermission('sitemaster:content:manage'), (req, res) => {
  const removed = removeMediaFile('', req.params.mediaId);
  if (!removed) return res.status(404).json({ error: 'Media not found' });
  deleteMedia('', req.params.mediaId);
  return res.status(204).end();
});

// Copy-on-use: place a library asset into a site's working folder and hand back
// the site-relative URL the designer and publisher both resolve.
app.post('/api/sites/:siteSlug/media/use', requirePermission('sitemaster:content:manage'), requireSite, (req, res) => {
  try {
    const filename = String(assertText(req.body?.filename, 'filename', { max: 200 })).trim();
    const record = getMediaByFilename(filename);
    if (!record) return res.status(404).json({ error: 'Media not found' });
    return res.json(copyMediaToSite(req.params.siteSlug, record.filename));
  } catch (error) { return handleValidation(res, error); }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sitemaster' }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'Request body must be valid JSON' });
  if (error?.validation) return res.status(400).json(parseValidationError(error));
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: `file exceeds the ${MEDIA_MAX_BYTES} byte upload limit`, field: 'file' });
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'unexpected upload field', field: 'file' });
  console.error(JSON.stringify({ event: 'request_error', requestId: req.id, error: error.message }));
  return res.status(500).json({ error: 'Internal server error' });
});
