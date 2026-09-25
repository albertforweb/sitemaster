import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH, DEFAULT_SITE_SLUG } from './config.js';

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    settings_json TEXT NOT NULL,
    origin_url TEXT NOT NULL DEFAULT '',
    deployment_status TEXT NOT NULL DEFAULT 'un-deployed' CHECK (deployment_status IN ('un-deployed', 'deployed', 'archived')),
    deployment_path TEXT NOT NULL DEFAULT '',
    deployed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    template TEXT NOT NULL DEFAULT 'default',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    blocks_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (site_id, slug)
  );
  CREATE INDEX IF NOT EXISTS idx_pages_public ON pages(site_id, status, slug);
  CREATE TABLE IF NOT EXISTS content_entries (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    data_json TEXT NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (site_id, content_type, slug)
  );
  CREATE INDEX IF NOT EXISTS idx_content_public ON content_entries(site_id, content_type, status, slug);
`);

// Keep the local development database upgradeable when a Sitemaster volume
// survives an image rebuild. SQLite cannot add a CHECK constraint in place,
// so these additive columns are intentionally migration-safe.
const siteColumns = new Set(db.prepare('PRAGMA table_info(sites)').all().map((column) => column.name));
if (!siteColumns.has('deployment_status')) db.exec("ALTER TABLE sites ADD COLUMN deployment_status TEXT NOT NULL DEFAULT 'un-deployed'");
if (!siteColumns.has('deployment_path')) db.exec("ALTER TABLE sites ADD COLUMN deployment_path TEXT NOT NULL DEFAULT ''");
if (!siteColumns.has('deployed_at')) db.exec('ALTER TABLE sites ADD COLUMN deployed_at TEXT');
if (!siteColumns.has('origin_url')) db.exec("ALTER TABLE sites ADD COLUMN origin_url TEXT NOT NULL DEFAULT ''");
db.prepare("UPDATE sites SET deployment_path = '/' WHERE slug = 'mainsite' AND (deployment_path = '' OR deployment_path = '/sites/mainsite/')").run();
db.prepare("UPDATE sites SET origin_url = 'http://localhost:8080' WHERE slug = 'mainsite' AND origin_url = ''").run();

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const deploymentPath = (slug) => slug === 'mainsite' ? '/' : `/sites/${slug}/`;
const parseJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

function mapSite(row) {
  if (!row) return null;
  return { id: row.id, slug: row.slug, name: row.name, originUrl: row.origin_url || '', status: row.status, settings: parseJson(row.settings_json, {}), deployment: { status: row.deployment_status || 'un-deployed', path: row.deployment_path || deploymentPath(row.slug), deployedAt: row.deployed_at || null }, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapPage(row) {
  if (!row) return null;
  return { id: row.id, siteSlug: row.site_slug, slug: row.slug, title: row.title, excerpt: row.excerpt, template: row.template, status: row.status, blocks: parseJson(row.blocks_json, []), metadata: parseJson(row.metadata_json, {}), publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapContent(row) {
  if (!row) return null;
  return { id: row.id, siteSlug: row.site_slug, contentType: row.content_type, slug: row.slug, status: row.status, data: parseJson(row.data_json, {}), publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function initDb() {
  const exists = db.prepare('SELECT id FROM sites WHERE slug = ?').get(DEFAULT_SITE_SLUG);
  if (exists) return;
  const timestamp = now();
  const siteId = id();
  const settings = {
    siteName: 'Mainsite',
    logoText: 'M',
    logoUrl: '',
    fontFamily: 'Inter, system-ui, sans-serif',
    theme: {
      backgroundColor: '#070b18', surfaceColor: '#111a31', textColor: '#f5f7ff', mutedTextColor: '#9aa7c7',
      accentColor: '#6366f1', accentStrongColor: '#4f46e5', inputBackgroundColor: '#0c1327',
      inputBorderColor: '#2c3d69', inputTextColor: '#f5f7ff', buttonTextColor: '#ffffff',
      linkColor: '#a5b4fc', linkHoverColor: '#c7d2fe',
    },
  };
  db.prepare('INSERT INTO sites (id, slug, name, settings_json, origin_url, deployment_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(siteId, DEFAULT_SITE_SLUG, 'Mainsite', JSON.stringify(settings), 'http://localhost:8080', deploymentPath(DEFAULT_SITE_SLUG), timestamp, timestamp);
  db.prepare(`INSERT INTO pages (id, site_id, slug, title, excerpt, template, status, blocks_json, metadata_json, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)`)
    .run(id(), siteId, 'home', 'Welcome', 'Managed by Adventure Sitemaster', 'default', JSON.stringify([
      { type: 'heading', level: 1, text: 'Welcome' },
      { type: 'paragraph', text: 'This page is managed by the Sitemaster website platform.' },
    ]), JSON.stringify({}), timestamp, timestamp, timestamp);
}

export function getSite(slug) { return mapSite(db.prepare('SELECT * FROM sites WHERE slug = ?').get(slug)); }
export function listSites() { return db.prepare('SELECT * FROM sites ORDER BY slug').all().map(mapSite); }

export function createSite({ slug, name, settings, originUrl = '' }) {
  const timestamp = now();
  const siteId = id();
  db.prepare('INSERT INTO sites (id, slug, name, settings_json, origin_url, deployment_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(siteId, slug, name, JSON.stringify(settings), originUrl, deploymentPath(slug), timestamp, timestamp);
  return getSite(slug);
}

export function updateSite(slug, { name, settings, status, originUrl }) {
  const current = getSite(slug);
  if (!current) return null;
  const updated = { name: name ?? current.name, settings: settings ?? current.settings, status: status ?? current.status, originUrl: originUrl ?? current.originUrl };
  db.prepare('UPDATE sites SET name = ?, status = ?, settings_json = ?, origin_url = ?, updated_at = ? WHERE slug = ?')
    .run(updated.name, updated.status, JSON.stringify(updated.settings), updated.originUrl, now(), slug);
  return getSite(slug);
}

export function deploySite(slug) {
  const current = getSite(slug);
  if (!current) return null;
  const timestamp = now();
  db.prepare("UPDATE sites SET deployment_status = 'deployed', deployment_path = ?, deployed_at = ?, updated_at = ? WHERE slug = ?")
    .run(deploymentPath(slug), timestamp, timestamp, slug);
  return getSite(slug);
}

export function undeploySite(slug) {
  const current = getSite(slug);
  if (!current) return null;
  db.prepare("UPDATE sites SET deployment_status = 'un-deployed', deployed_at = NULL, updated_at = ? WHERE slug = ?")
    .run(now(), slug);
  return getSite(slug);
}

export function upsertImportedPage(siteSlug, page) {
  const current = getPage(siteSlug, page.slug);
  return current ? updatePage(siteSlug, page.slug, page) : createPage(siteSlug, page);
}

function pageRow(siteSlug, slug) {
  return db.prepare(`SELECT pages.*, sites.slug AS site_slug FROM pages JOIN sites ON sites.id = pages.site_id WHERE sites.slug = ? AND pages.slug = ?`).get(siteSlug, slug);
}

export function listPages(siteSlug, { publishedOnly = false } = {}) {
  const query = `SELECT pages.*, sites.slug AS site_slug FROM pages JOIN sites ON sites.id = pages.site_id WHERE sites.slug = ? ${publishedOnly ? "AND pages.status = 'published'" : ''} ORDER BY pages.updated_at DESC`;
  return db.prepare(query).all(siteSlug).map(mapPage);
}
export function getPage(siteSlug, slug, { publishedOnly = false } = {}) {
  const row = pageRow(siteSlug, slug);
  if (publishedOnly && row?.status !== 'published') return null;
  return mapPage(row);
}

export function createPage(siteSlug, page) {
  const site = getSite(siteSlug);
  if (!site) return null;
  const timestamp = now();
  db.prepare(`INSERT INTO pages (id, site_id, slug, title, excerpt, template, status, blocks_json, metadata_json, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id(), site.id, page.slug, page.title, page.excerpt, page.template, page.status, JSON.stringify(page.blocks), JSON.stringify(page.metadata), page.status === 'published' ? timestamp : null, timestamp, timestamp);
  return getPage(siteSlug, page.slug);
}

export function updatePage(siteSlug, slug, page) {
  const current = getPage(siteSlug, slug);
  if (!current) return null;
  const updated = { ...current, ...page };
  const timestamp = now();
  db.prepare(`UPDATE pages SET slug = ?, title = ?, excerpt = ?, template = ?, status = ?, blocks_json = ?, metadata_json = ?, published_at = ?, updated_at = ?
    WHERE id = ?`).run(updated.slug, updated.title, updated.excerpt, updated.template, updated.status, JSON.stringify(updated.blocks), JSON.stringify(updated.metadata), updated.status === 'published' ? (current.publishedAt || timestamp) : null, timestamp, current.id);
  return getPage(siteSlug, updated.slug);
}

export function deletePage(siteSlug, slug) {
  const result = db.prepare('DELETE FROM pages WHERE id IN (SELECT pages.id FROM pages JOIN sites ON sites.id = pages.site_id WHERE sites.slug = ? AND pages.slug = ?)').run(siteSlug, slug);
  return result.changes > 0;
}

function contentRow(siteSlug, contentType, slug) {
  return db.prepare(`SELECT content_entries.*, sites.slug AS site_slug FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE sites.slug = ? AND content_type = ? AND content_entries.slug = ?`).get(siteSlug, contentType, slug);
}

export function listContent(siteSlug, contentType, { publishedOnly = false } = {}) {
  const query = `SELECT content_entries.*, sites.slug AS site_slug FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE sites.slug = ? AND content_type = ? ${publishedOnly ? "AND content_entries.status = 'published'" : ''} ORDER BY updated_at DESC`;
  return db.prepare(query).all(siteSlug, contentType).map(mapContent);
}
export function getContent(siteSlug, contentType, slug, { publishedOnly = false } = {}) {
  const row = contentRow(siteSlug, contentType, slug);
  if (publishedOnly && row?.status !== 'published') return null;
  return mapContent(row);
}

export function createContent(siteSlug, contentType, entry) {
  const site = getSite(siteSlug);
  if (!site) return null;
  const timestamp = now();
  db.prepare(`INSERT INTO content_entries (id, site_id, content_type, slug, status, data_json, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id(), site.id, contentType, entry.slug, entry.status, JSON.stringify(entry.data), entry.status === 'published' ? timestamp : null, timestamp, timestamp);
  return getContent(siteSlug, contentType, entry.slug);
}

export function updateContent(siteSlug, contentType, slug, entry) {
  const current = getContent(siteSlug, contentType, slug);
  if (!current) return null;
  const updated = { ...current, ...entry };
  const timestamp = now();
  db.prepare(`UPDATE content_entries SET slug = ?, status = ?, data_json = ?, published_at = ?, updated_at = ? WHERE id = ?`)
    .run(updated.slug, updated.status, JSON.stringify(updated.data), updated.status === 'published' ? (current.publishedAt || timestamp) : null, timestamp, current.id);
  return getContent(siteSlug, contentType, updated.slug);
}

export function deleteContent(siteSlug, contentType, slug) {
  const result = db.prepare('DELETE FROM content_entries WHERE id IN (SELECT content_entries.id FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE sites.slug = ? AND content_type = ? AND content_entries.slug = ?)').run(siteSlug, contentType, slug);
  return result.changes > 0;
}

initDb();
