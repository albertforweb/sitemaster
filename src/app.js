import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_ORIGINS } from './config.js';
import {
  createContent, createPage, createSite, deleteContent, deletePage, deploySite, undeploySite,
  getContent, getPage, getSite, listContent, listPages, listSites, updateContent, updatePage, updateSite,
} from './db.js';
import {
  beginAdminLogin, clearSession, consumeLoginState, establishSession, exchangeCode, getLoginState, requireAuth,
  requireCsrf, requirePermission, requestId,
} from './auth.js';
import { parseValidationError, assertSlug, assertText, validateContentPayload, validatePagePayload, validateSettings, validateSiteUrl } from './validation.js';
import { importSite } from './importer.js';
import { publishSite, unpublishSite } from './publisher.js';
import { renderSite } from './render.js';

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

function handleValidation(res, error) { return res.status(400).json(parseValidationError(error)); }
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

app.get('/api/sites/:siteSlug/content/:contentType', requirePermission('sitemaster:content:read'), requireSite, requireContentType, (req, res) => res.json({ entries: listContent(req.params.siteSlug, req.params.contentType) }));
app.post('/api/sites/:siteSlug/content/:contentType', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  try { return res.status(201).json({ entry: createContent(req.params.siteSlug, req.params.contentType, validateContentPayload(req.body)) }); }
  catch (error) { return handleValidation(res, error); }
});
app.patch('/api/sites/:siteSlug/content/:contentType/:slug', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  try {
    const updated = updateContent(req.params.siteSlug, req.params.contentType, req.params.slug, validateContentPayload(req.body, { partial: true }));
    if (!updated) return res.status(404).json({ error: 'Content not found' });
    return res.json({ entry: updated });
  } catch (error) { return handleValidation(res, error); }
});
app.delete('/api/sites/:siteSlug/content/:contentType/:slug', requirePermission('sitemaster:content:manage'), requireSite, requireContentType, (req, res) => {
  if (!deleteContent(req.params.siteSlug, req.params.contentType, req.params.slug)) return res.status(404).json({ error: 'Content not found' });
  return res.status(204).end();
});
app.post('/api/sites/:siteSlug/content/:contentType/:slug/publish', requirePermission('sitemaster:publish'), requireSite, requireContentType, (req, res) => {
  const updated = updateContent(req.params.siteSlug, req.params.contentType, req.params.slug, { status: 'published' });
  if (!updated) return res.status(404).json({ error: 'Content not found' });
  return res.json({ entry: updated });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sitemaster' }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(JSON.stringify({ event: 'request_error', requestId: req.id, error: error.message }));
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'Request body must be valid JSON' });
  return res.status(500).json({ error: 'Internal server error' });
});
