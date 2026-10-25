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
  CREATE TABLE IF NOT EXISTS content_types (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    fields_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (site_id, slug)
  );
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    url TEXT NOT NULL,
    alt_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_media_site ON media(site_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS library_media (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    url TEXT NOT NULL,
    alt_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_library_media_created ON library_media(created_at DESC);
`);

// Keep the local development database upgradeable when a Sitemaster volume
// survives an image rebuild. SQLite cannot add a CHECK constraint in place,
// so these additive columns are intentionally migration-safe.
const siteColumns = new Set(db.prepare('PRAGMA table_info(sites)').all().map((column) => column.name));
if (!siteColumns.has('deployment_status')) db.exec("ALTER TABLE sites ADD COLUMN deployment_status TEXT NOT NULL DEFAULT 'un-deployed'");
if (!siteColumns.has('deployment_path')) db.exec("ALTER TABLE sites ADD COLUMN deployment_path TEXT NOT NULL DEFAULT ''");
if (!siteColumns.has('deployed_at')) db.exec('ALTER TABLE sites ADD COLUMN deployed_at TEXT');
if (!siteColumns.has('origin_url')) db.exec("ALTER TABLE sites ADD COLUMN origin_url TEXT NOT NULL DEFAULT ''");
const contentColumns = new Set(db.prepare('PRAGMA table_info(content_entries)').all().map((column) => column.name));
if (!contentColumns.has('title')) db.exec("ALTER TABLE content_entries ADD COLUMN title TEXT NOT NULL DEFAULT ''");
if (!contentColumns.has('excerpt')) db.exec("ALTER TABLE content_entries ADD COLUMN excerpt TEXT NOT NULL DEFAULT ''");
if (!contentColumns.has('sort_order')) db.exec('ALTER TABLE content_entries ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
if (!contentColumns.has('cover_image')) db.exec("ALTER TABLE content_entries ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''");
if (!contentColumns.has('blocks_json')) db.exec("ALTER TABLE content_entries ADD COLUMN blocks_json TEXT NOT NULL DEFAULT '[]'");
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
  return {
    id: row.id,
    siteSlug: row.site_slug,
    contentType: row.content_type,
    slug: row.slug,
    title: row.title || '',
    excerpt: row.excerpt || '',
    status: row.status,
    sortOrder: Number(row.sort_order || 0),
    coverImage: row.cover_image || '',
    blocks: parseJson(row.blocks_json, []),
    data: parseJson(row.data_json, {}),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContentType(row) {
  if (!row) return null;
  return {
    id: row.id,
    siteSlug: row.site_slug,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    fields: parseJson(row.fields_json, []),
    entryCount: Number(row.entry_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMedia(row) {
  if (!row) return null;
  return {
    id: row.id,
    siteSlug: row.site_slug || null,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: Number(row.size || 0),
    url: row.url,
    altText: row.alt_text || '',
    createdAt: row.created_at,
  };
}

export const DEFAULT_CONTENT_TYPES = [
  {
    slug: 'general',
    name: 'General',
    description: 'Free-form records for any structured content a page needs.',
    fields: [
      { key: 'summary', label: 'Summary', type: 'textarea', required: false },
      { key: 'body', label: 'Body', type: 'richtext', required: false },
      { key: 'icon', label: 'Icon URL', type: 'image', required: false },
    ],
  },
  {
    slug: 'article',
    name: 'Article',
    description: 'Long-form editorial content such as blog posts and news.',
    fields: [
      { key: 'summary', label: 'Summary', type: 'textarea', required: false },
      { key: 'body', label: 'Body', type: 'richtext', required: false },
      { key: 'tags', label: 'Tags', type: 'tags', required: false },
      { key: 'featured', label: 'Featured', type: 'boolean', required: false },
    ],
  },
];

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
    footerNote: 'Published with Sitemaster',
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

/** Registers the starter collections for every site that is missing them. */
export function ensureDefaultContentTypes() {
  const insert = db.prepare('INSERT OR IGNORE INTO content_types (id, site_id, slug, name, description, fields_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const timestamp = now();
  for (const site of db.prepare('SELECT id FROM sites').all()) {
    for (const type of DEFAULT_CONTENT_TYPES) {
      insert.run(id(), site.id, type.slug, type.name, type.description, JSON.stringify(type.fields), timestamp, timestamp);
    }
  }
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

const CONTENT_SORTS = {
  updated: 'content_entries.updated_at',
  created: 'content_entries.created_at',
  title: 'content_entries.title',
  slug: 'content_entries.slug',
  order: 'content_entries.sort_order',
};

/**
 * List entries for one collection. Every filter is a bound parameter and every
 * sort key is resolved through CONTENT_SORTS, so no request value reaches SQL.
 */
/** Lists entries for one collection, or for every collection when the type is empty. */
export function queryContent(siteSlug, contentType, {
  publishedOnly = false, status = '', q = '', sort = 'updated', dir = 'desc', limit = 0, offset = 0,
} = {}) {
  const where = ['sites.slug = ?'];
  const params = [siteSlug];
  if (contentType) { where.push('content_entries.content_type = ?'); params.push(contentType); }
  if (publishedOnly) where.push("content_entries.status = 'published'");
  else if (status) { where.push('content_entries.status = ?'); params.push(status); }
  if (q) {
    where.push('(content_entries.title LIKE ? OR content_entries.slug LIKE ? OR content_entries.data_json LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS total FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE ${clause}`).get(...params).total;
  const column = CONTENT_SORTS[sort] || CONTENT_SORTS.updated;
  const direction = dir === 'asc' ? 'ASC' : 'DESC';
  const secondary = column === CONTENT_SORTS.updated ? '' : ', content_entries.updated_at DESC';
  const rows = limit > 0
    ? db.prepare(`SELECT content_entries.*, sites.slug AS site_slug FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE ${clause} ORDER BY ${column} ${direction}${secondary} LIMIT ? OFFSET ?`).all(...params, limit, offset)
    : db.prepare(`SELECT content_entries.*, sites.slug AS site_slug FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE ${clause} ORDER BY ${column} ${direction}${secondary}`).all(...params);
  return { entries: rows.map(mapContent), total: Number(total) };
}

export function listContent(siteSlug, contentType, { publishedOnly = false, ...options } = {}) {
  return queryContent(siteSlug, contentType, { publishedOnly, ...options }).entries;
}

export function getContent(siteSlug, contentType, slug, { publishedOnly = false } = {}) {
  const row = contentRow(siteSlug, contentType, slug);
  if (publishedOnly && row?.status !== 'published') return null;
  return mapContent(row);
}

/** Published entries of every collection, used for static deployment output. */
export function publishedContentByType(siteSlug) {
  const rows = db.prepare(`SELECT content_entries.*, sites.slug AS site_slug FROM content_entries JOIN sites ON sites.id = content_entries.site_id
    WHERE sites.slug = ? AND content_entries.status = 'published' ORDER BY content_entries.content_type, content_entries.sort_order, content_entries.published_at`).all(siteSlug);
  const grouped = {};
  for (const row of rows) {
    const entry = mapContent(row);
    grouped[entry.contentType] = grouped[entry.contentType] || [];
    grouped[entry.contentType].push(entry);
  }
  // Every registered collection is present so consumers can rely on the shape.
  for (const type of listContentTypes(siteSlug)) grouped[type.slug] = grouped[type.slug] || [];
  return grouped;
}

export function countContent(siteSlug, contentType, status = '') {
  const params = [siteSlug, contentType];
  let sql = 'SELECT COUNT(*) AS total FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE sites.slug = ? AND content_entries.content_type = ?';
  if (status) { sql += ' AND content_entries.status = ?'; params.push(status); }
  return Number(db.prepare(sql).get(...params).total);
}

export function createContent(siteSlug, contentType, entry) {
  const site = getSite(siteSlug);
  if (!site) return null;
  const timestamp = now();
  db.prepare(`INSERT INTO content_entries (id, site_id, content_type, slug, title, excerpt, status, sort_order, cover_image, blocks_json, data_json, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id(), site.id, contentType, entry.slug, entry.title ?? '', entry.excerpt ?? '', entry.status, entry.sortOrder ?? 0, entry.coverImage ?? '', JSON.stringify(entry.blocks ?? []), JSON.stringify(entry.data), entry.status === 'published' ? timestamp : null, timestamp, timestamp);
  return getContent(siteSlug, contentType, entry.slug);
}

export function updateContent(siteSlug, contentType, slug, entry) {
  const current = getContent(siteSlug, contentType, slug);
  if (!current) return null;
  const updated = { ...current, ...entry };
  const timestamp = now();
  db.prepare(`UPDATE content_entries SET content_type = ?, slug = ?, title = ?, excerpt = ?, status = ?, sort_order = ?, cover_image = ?, blocks_json = ?, data_json = ?, published_at = ?, updated_at = ?
    WHERE id = ?`)
    .run(updated.contentType || current.contentType, updated.slug, updated.title, updated.excerpt, updated.status, updated.sortOrder, updated.coverImage, JSON.stringify(updated.blocks), JSON.stringify(updated.data),
      updated.status === 'published' ? (current.publishedAt || timestamp) : null, timestamp, current.id);
  return getContent(siteSlug, updated.contentType || current.contentType, updated.slug);
}

export function deleteContent(siteSlug, contentType, slug) {
  const result = db.prepare('DELETE FROM content_entries WHERE id IN (SELECT content_entries.id FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE sites.slug = ? AND content_type = ? AND content_entries.slug = ?)').run(siteSlug, contentType, slug);
  return result.changes > 0;
}

/** Apply one workflow action to many entries at once. Returns affected slugs. */
export function bulkContent(siteSlug, contentType, slugs, action) {
  const affected = [];
  for (const slug of slugs) {
    const current = getContent(siteSlug, contentType, slug);
    if (!current) continue;
    if (action === 'delete') { deleteContent(siteSlug, contentType, slug); affected.push(slug); continue; }
    const status = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : action === 'archive' ? 'archived' : null;
    if (!status || status === current.status) continue;
    updateContent(siteSlug, contentType, slug, { status });
    affected.push(slug);
  }
  return affected;
}

export function duplicateContent(siteSlug, contentType, slug) {
  const current = getContent(siteSlug, contentType, slug);
  if (!current) return null;
  let candidate = `${current.slug}-copy`;
  let suffix = 2;
  while (getContent(siteSlug, contentType, candidate)) {
    candidate = `${current.slug}-copy-${suffix}`;
    suffix += 1;
  }
  return createContent(siteSlug, contentType, {
    ...current,
    slug: candidate,
    title: `${current.title || current.slug} (copy)`,
    status: 'draft',
    publishedAt: null,
  });
}

function contentTypeRow(siteSlug, slug) {
  return db.prepare(`SELECT content_types.*, sites.slug AS site_slug FROM content_types JOIN sites ON sites.id = content_types.site_id WHERE sites.slug = ? AND content_types.slug = ?`).get(siteSlug, slug);
}

export function listContentTypes(siteSlug) {
  return db.prepare(`SELECT content_types.*, sites.slug AS site_slug,
      (SELECT COUNT(*) FROM content_entries WHERE content_entries.site_id = content_types.site_id AND content_entries.content_type = content_types.slug) AS entry_count
    FROM content_types JOIN sites ON sites.id = content_types.site_id WHERE sites.slug = ? ORDER BY content_types.slug`).all(siteSlug).map(mapContentType);
}

export function getContentType(siteSlug, slug) {
  return mapContentType(contentTypeRow(siteSlug, slug));
}

export function createContentType(siteSlug, type) {
  const site = getSite(siteSlug);
  if (!site) return null;
  const timestamp = now();
  db.prepare('INSERT INTO content_types (id, site_id, slug, name, description, fields_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id(), site.id, type.slug, type.name, type.description ?? '', JSON.stringify(type.fields ?? []), timestamp, timestamp);
  return getContentType(siteSlug, type.slug);
}

export function updateContentType(siteSlug, slug, type) {
  const current = getContentType(siteSlug, slug);
  if (!current) return null;
  db.prepare('UPDATE content_types SET name = ?, description = ?, fields_json = ?, updated_at = ? WHERE id = ?')
    .run(type.name ?? current.name, type.description ?? current.description, JSON.stringify(type.fields ?? current.fields), now(), current.id);
  return getContentType(siteSlug, slug);
}

export function deleteContentType(siteSlug, slug) {
  const result = db.prepare('DELETE FROM content_types WHERE id IN (SELECT content_types.id FROM content_types JOIN sites ON sites.id = content_types.site_id WHERE sites.slug = ? AND content_types.slug = ?)').run(siteSlug, slug);
  return result.changes > 0;
}

/** Walks a block tree, letting the visitor replace or drop nodes. */
function rewriteBlocks(blocks, rewrite) {
  const output = [];
  for (const block of blocks || []) {
    const replacement = rewrite(block);
    if (replacement === null) continue;
    if (Array.isArray(replacement)) { output.push(...replacement); continue; }
    output.push(replacement.children ? { ...replacement, children: rewriteBlocks(replacement.children, rewrite) } : replacement);
  }
  return output;
}

function isReferenceTo(block, contentType, slug) {
  return block?.type === 'content' && block.contentType === contentType && block.slug === slug;
}

function contentReference(contentType, slug) {
  return { id: `content-${contentType}-${slug}`.slice(0, 80), type: 'content', contentType, slug, children: [] };
}

/** Pages that currently show an entry, so the publish dialog can pre-tick them. */
export function listContentPlacements(siteSlug, contentType, slug) {
  const contains = (blocks) => (blocks || []).some((block) => isReferenceTo(block, contentType, slug) || contains(block.children));
  return listPages(siteSlug).filter((page) => contains(page.blocks)).map((page) => page.slug);
}

/** Adds the entry to the chosen pages and removes it from every other page. */
export function setContentPlacements(siteSlug, contentType, slug, pageSlugs) {
  const wanted = new Set(pageSlugs);
  const placed = new Set(listContentPlacements(siteSlug, contentType, slug));
  const updated = [];
  for (const page of listPages(siteSlug)) {
    const shouldShow = wanted.has(page.slug);
    if (placed.has(page.slug) === shouldShow) continue;
    const next = shouldShow
      ? [...(page.blocks || []), contentReference(contentType, slug)]
      : rewriteBlocks(page.blocks || [], (block) => (isReferenceTo(block, contentType, slug) ? null : block));
    const saved = updatePage(siteSlug, page.slug, { blocks: next });
    if (saved) updated.push(saved);
  }
  return updated;
}

/** Keeps page placements intact when an entry moves to another collection. */
export function repointContentReferences(siteSlug, fromType, slug, toType) {
  const updated = [];
  for (const page of listPages(siteSlug)) {
    let changed = false;
    const blocks = rewriteBlocks(page.blocks || [], (block) => {
      if (!isReferenceTo(block, fromType, slug)) return block;
      changed = true;
      return contentReference(toType, slug);
    });
    if (!changed) continue;
    const saved = updatePage(siteSlug, page.slug, { blocks });
    if (saved) updated.push(saved);
  }
  return updated;
}

/**
 * Media lives in one app-level library shared by every site. A site that uses an
 * asset gets a copy in its own working folder; these records describe the
 * library original. The siteSlug argument is kept so existing callers keep
 * working, but it is intentionally ignored.
 */
export function listMedia(_siteSlug, { limit = 100 } = {}) {
  return db.prepare('SELECT * FROM library_media ORDER BY created_at DESC LIMIT ?').all(limit).map(mapMedia);
}

export function getMedia(_siteSlug, mediaId) {
  return mapMedia(db.prepare('SELECT * FROM library_media WHERE id = ?').get(mediaId));
}

export function getMediaByFilename(filename) {
  return mapMedia(db.prepare('SELECT * FROM library_media WHERE filename = ?').get(filename));
}

export function createMedia(_siteSlug, media) {
  const mediaId = id();
  db.prepare('INSERT INTO library_media (id, filename, original_name, mime_type, size, url, alt_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(mediaId, media.filename, media.originalName, media.mimeType, media.size, media.url, media.altText ?? '', now());
  return getMedia(_siteSlug, mediaId);
}

export function updateMedia(_siteSlug, mediaId, { altText }) {
  const current = getMedia(_siteSlug, mediaId);
  if (!current) return null;
  db.prepare('UPDATE library_media SET alt_text = ? WHERE id = ?').run(altText ?? current.altText, current.id);
  return getMedia(_siteSlug, mediaId);
}

export function deleteMedia(_siteSlug, mediaId) {
  const result = db.prepare('DELETE FROM library_media WHERE id = ?').run(mediaId);
  return result.changes > 0;
}

/** Collections that actually hold entries, even if no type record exists yet. */
export function listContentCollections(siteSlug) {
  const rows = db.prepare(`SELECT content_type, COUNT(*) AS total FROM content_entries JOIN sites ON sites.id = content_entries.site_id WHERE sites.slug = ? GROUP BY content_type ORDER BY content_type`).all(siteSlug);
  return rows.map((row) => ({ slug: row.content_type, total: Number(row.total) }));
}

initDb();
ensureDefaultContentTypes();
