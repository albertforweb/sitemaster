import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { validateBlocks, validateBulkContentPayload, validateContentData, validateContentFields, validateContentPayload, validateContentTypePayload } from '../src/validation.js';

const ARTICLE_FIELDS = validateContentFields([
  { key: 'summary', label: 'Summary', type: 'textarea' },
  { key: 'body', label: 'Body', type: 'richtext' },
  { key: 'tags', label: 'Tags', type: 'tags' },
  { key: 'featured', label: 'Featured', type: 'boolean' },
  { key: 'section', label: 'Section', type: 'select', options: ['news', 'guides'] },
  { key: 'publishOn', label: 'Publish on', type: 'date' },
]);

test('validates a content type definition', () => {
  const type = validateContentTypePayload({
    slug: 'article',
    name: 'Article',
    description: 'Editorial content',
    fields: ARTICLE_FIELDS,
  });
  assert.equal(type.slug, 'article');
  assert.equal(type.fields.length, 6);
  assert.throws(() => validateContentFields([{ key: 'bad key', type: 'text' }]), (error) => error.field === 'fields');
  assert.throws(() => validateContentFields([{ key: 'dup', type: 'text' }, { key: 'dup', type: 'text' }]), (error) => /duplicates/.test(error.message));
  assert.throws(() => validateContentFields([{ key: 'pick', type: 'select' }]), (error) => /choices/.test(error.message));
  assert.throws(() => validateContentFields([{ key: 'body', type: 'richtext', options: ['a'] }]), (error) => /only supported for select/.test(error.message));
});

test('validates entry data against its collection schema', () => {
  const data = validateContentData({
    summary: 'Intro copy',
    body: [{ type: 'paragraph', text: 'Body copy' }],
    tags: ['news', 'news', ' launch '],
    featured: true,
    section: 'guides',
    publishOn: '2026-02-01',
  }, ARTICLE_FIELDS);
  assert.deepEqual(data.tags, ['news', 'launch']);
  assert.equal(data.featured, true);
  assert.throws(() => validateContentData({ tags: 'news' }, ARTICLE_FIELDS), (error) => error.field === 'data.tags');
  assert.throws(() => validateContentData({ section: 'other' }, ARTICLE_FIELDS), (error) => error.field === 'data.section');
  assert.throws(() => validateContentData({ body: [{ type: 'script' }] }, ARTICLE_FIELDS), (error) => /unsupported type/.test(error.message));
  assert.throws(() => validateContentData({ publishOn: 'yesterday' }, ARTICLE_FIELDS), (error) => error.field === 'data.publishOn');
  assert.throws(() => validateContentPayload({ slug: 'x', title: 'X', data: {} }, { fields: validateContentFields([{ key: 'headline', type: 'text', required: true }]) }), (error) => error.field === 'data.headline');
});

test('keeps data that predates the collection schema', () => {
  const data = validateContentData({ legacyKey: { nested: [1, 2] } }, ARTICLE_FIELDS);
  assert.deepEqual(data, { legacyKey: { nested: [1, 2] } });
  assert.throws(() => validateContentData(JSON.parse('{"__proto__":{"polluted":true}}'), []), (error) => /reserved/.test(error.message));
  assert.throws(() => validateContentData(JSON.parse('{"nested":{"constructor":"bad"}}'), []), (error) => /reserved/.test(error.message));
});

test('validates bulk workflow payloads', () => {
  assert.deepEqual(validateBulkContentPayload({ action: 'unpublish', slugs: ['one', 'two'] }), { action: 'unpublish', slugs: ['one', 'two'] });
  assert.throws(() => validateBulkContentPayload({ action: 'explode', slugs: ['one'] }), (error) => error.field === 'action');
  assert.throws(() => validateBulkContentPayload({ action: 'publish', slugs: [] }), (error) => error.field === 'slugs');
  assert.throws(() => validateBulkContentPayload({ action: 'publish', slugs: ['Not A Slug'] }), (error) => error.field === 'slugs[0]');
});

const PERMISSIONS = [
  'sitemaster:site:read', 'sitemaster:page:read', 'sitemaster:page:create', 'sitemaster:page:update',
  'sitemaster:page:delete', 'sitemaster:content:read', 'sitemaster:content:manage', 'sitemaster:deploy', 'sitemaster:publish',
];

function startStubIam() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ active: true, aud: 'sitemaster-api', sub: 'user-1', username: 'admin', roles: ['admin'], permissions: PERMISSIONS }));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/oauth/introspect` })));
}

/**
 * The API reads its configuration once at import time, so the whole file shares
 * one database, one uploads directory and one stub introspection endpoint.
 */
let shared = null;

async function apiContext() {
  if (shared) return shared;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemaster-cms-'));
  const iam = await startStubIam();
  process.env.SITEMASTER_DB_PATH = path.join(workspace, 'test.db');
  process.env.SITEMASTER_DEPLOYMENTS_DIR = path.join(workspace, 'deployments');
  process.env.SITEMASTER_UPLOADS_DIR = path.join(workspace, 'uploads');
  process.env.SITEMASTER_SITES_DIR = path.join(workspace, 'sites');
  process.env.IAM_INTROSPECT_URL = iam.url;
  process.env.IAM_CLIENT_SECRET = 'test-secret';
  process.env.SITEMASTER_PUBLIC_BASE_URL = 'http://localhost:5000';
  const { app } = await import('../src/app.js');
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, options = {}) => {
    const headers = { Authorization: 'Bearer test-token', ...options.headers };
    let payload = body;
    if (body !== undefined && !(body instanceof Uint8Array) && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(base + url, { method, headers, body: payload });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  shared = { call, base, workspace, server, iam };
  return shared;
}

test.after(async () => {
  if (!shared) return;
  await new Promise((resolve) => shared.server.close(resolve));
  shared.iam.server.close();
  try {
    fs.rmSync(shared.workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Windows keeps the SQLite handle open until the process exits.
  }
});

async function withContext(run) {
  return run(await apiContext());
}

test('manages content types over the API', async () => {
  await withContext(async ({ call }) => {
    const listed = await call('GET', '/api/sites/mainsite/content-types');
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.types.map((type) => type.slug), ['article', 'general']);

    const created = await call('POST', '/api/sites/mainsite/content-types', {
      slug: 'product', name: 'Product', description: 'Sellable items', fields: [{ key: 'price', label: 'Price', type: 'number' }],
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.type.fields[0].type, 'number');

    const rejected = await call('POST', '/api/sites/mainsite/content-types', { slug: 'product', name: 'Duplicate' });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error, 'That slug is already in use');

    const renamed = await call('PATCH', '/api/sites/mainsite/content-types/product', { name: 'Catalogue' });
    assert.equal(renamed.body.type.name, 'Catalogue');
    assert.equal(renamed.body.type.slug, 'product');

    const invalidField = await call('PATCH', '/api/sites/mainsite/content-types/product', { fields: [{ key: 'price', type: 'currency' }] });
    assert.equal(invalidField.status, 400);
    assert.equal(invalidField.body.field, 'fields');

    const removed = await call('DELETE', '/api/sites/mainsite/content-types/product');
    assert.equal(removed.status, 204);
  });
});

test('creates, filters and paginates content entries', async () => {
  await withContext(async ({ call }) => {
    for (let index = 0; index < 25; index += 1) {
      const created = await call('POST', '/api/sites/mainsite/content/article', {
        slug: `post-${String(index).padStart(2, '0')}`,
        title: `Post ${index}`,
        excerpt: `Excerpt ${index}`,
        status: index % 3 === 0 ? 'published' : 'draft',
        sortOrder: index,
        blocks: [{ type: 'heading', level: 2, text: `Post ${index}` }],
        data: { summary: `Summary ${index}`, tags: index % 2 ? ['odd'] : ['even'], section: 'news' },
      });
      assert.equal(created.status, 201, created.body?.error);
    }

    const blocked = await call('POST', '/api/sites/mainsite/content/article', { slug: 'bad-tags', title: 'Bad', data: { tags: 'odd' } });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.field, 'data.tags');

    const firstPage = await call('GET', '/api/sites/mainsite/content/article?limit=10&page=1&sort=title&dir=asc');
    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.entries.length, 10);
    assert.equal(firstPage.body.total, 25);
    assert.equal(firstPage.body.pages, 3);
    assert.equal(firstPage.body.entries[0].title, 'Post 0');

    const searched = await call('GET', '/api/sites/mainsite/content/article?q=Post%201&limit=50');
    assert.equal(searched.body.total, 11);

    const publishedOnly = await call('GET', '/api/sites/mainsite/content/article?status=published&limit=50');
    assert.equal(publishedOnly.body.total, 9);
    assert.ok(publishedOnly.body.entries.every((entry) => entry.status === 'published'));

    const ignoredSort = await call('GET', '/api/sites/mainsite/content/article?sort=slug;DROP%20TABLE%20pages&limit=5');
    assert.equal(ignoredSort.status, 200);
    assert.equal(ignoredSort.body.total, 25);

    const collections = await call('GET', '/api/sites/mainsite/content');
    const article = collections.body.collections.find((collection) => collection.slug === 'article');
    assert.equal(article.total, 25);
    assert.equal(article.published, 9);
    assert.equal(article.name, 'Article');
    assert.ok(article.fields.some((field) => field.key === 'body' && field.type === 'richtext'));
    assert.ok(collections.body.collections.some((collection) => collection.slug === 'general' && collection.total === 0));

    const single = await call('GET', '/api/sites/mainsite/content/article/post-01');
    assert.equal(single.status, 200);
    assert.equal(single.body.entry.title, 'Post 1');
    assert.equal((await call('GET', '/api/sites/mainsite/content/article/not-here')).status, 404);
  });
});

test('runs entry workflow actions and block previews', async () => {
  await withContext(async ({ call }) => {
    await call('POST', '/api/sites/mainsite/content/article', { slug: 'launch', title: 'Launch', status: 'draft', data: {} });
    await call('POST', '/api/sites/mainsite/content/article', { slug: 'archive-me', title: 'Archive me', status: 'draft', data: {} });

    const published = await call('POST', '/api/sites/mainsite/content/article/launch/publish');
    assert.equal(published.body.entry.status, 'published');
    assert.ok(published.body.entry.publishedAt);

    const unpublished = await call('POST', '/api/sites/mainsite/content/article/launch/unpublish');
    assert.equal(unpublished.body.entry.status, 'draft');

    const copy = await call('POST', '/api/sites/mainsite/content/article/launch/duplicate');
    assert.equal(copy.status, 201);
    assert.equal(copy.body.entry.slug, 'launch-copy');
    assert.equal(copy.body.entry.status, 'draft');

    const bulk = await call('POST', '/api/sites/mainsite/content/article/bulk', { action: 'archive', slugs: ['archive-me'] });
    assert.deepEqual(bulk.body.updated, ['archive-me']);

    const bulkDeleted = await call('POST', '/api/sites/mainsite/content/article/bulk', { action: 'delete', slugs: ['archive-me', 'missing'] });
    assert.deepEqual(bulkDeleted.body.updated, ['archive-me']);
    const missing = await call('GET', '/api/sites/mainsite/content/article/archive-me');
    assert.equal(missing.status, 404);

    const preview = await call('POST', '/api/sites/mainsite/content/preview', { blocks: [{ type: 'heading', level: 3, text: 'Preview <script>' }] });
    assert.equal(preview.status, 200);
    assert.match(preview.body.html, /<h3>Preview &lt;script&gt;<\/h3>/);

    const unsafePreview = await call('POST', '/api/sites/mainsite/content/preview', { blocks: [{ type: 'html_element', data: { tag: 'script' } }] });
    assert.equal(unsafePreview.status, 400);
  });
});

test('uploads, lists and removes media', async () => {
  await withContext(async ({ call, workspace }) => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'Company Logo.png');
    const uploaded = await call('POST', '/api/sites/mainsite/media', form);
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.media.mimeType, 'image/png');
    assert.match(uploaded.body.media.url, /^http:\/\/localhost:5000\/media\/[a-z0-9]+-[0-9a-f]+\.png$/);
    assert.equal(uploaded.body.media.originalName, 'Company-Logo.png');
    assert.ok(fs.readFileSync(path.join(workspace, 'uploads', uploaded.body.media.filename)).equals(png));

    const listed = await call('GET', '/api/sites/mainsite/media');
    assert.equal(listed.body.media.length, 1);

    const renamed = await call('PATCH', `/api/sites/mainsite/media/${uploaded.body.media.id}`, { altText: 'Company logo' });
    assert.equal(renamed.body.media.altText, 'Company logo');

    const rejected = await call('POST', '/api/sites/mainsite/media', (() => {
      const bad = new FormData();
      bad.append('file', new Blob([Buffer.from('MZ')], { type: 'application/x-msdownload' }), 'payload.exe');
      return bad;
    })());
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.field, 'file');

    const removed = await call('DELETE', `/api/sites/mainsite/media/${uploaded.body.media.id}`);
    assert.equal(removed.status, 204);
    assert.equal(fs.existsSync(path.join(workspace, 'uploads', uploaded.body.media.filename)), false);
    assert.equal((await call('GET', '/api/sites/mainsite/media')).body.media.length, 0);
  });
});

test('shares one media library and copies assets into a site on use', async () => {
  await withContext(async ({ call, workspace, base }) => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'Hero.png');
    const uploaded = await call('POST', '/api/media', form);
    assert.equal(uploaded.status, 201);
    const asset = uploaded.body.media;

    // The library is app-level: it is listed without naming a site.
    const library = await call('GET', '/api/media');
    assert.ok(library.body.media.some((item) => item.id === asset.id));

    // Copy-on-use lands the file in the site folder and returns a relative URL.
    const used = await call('POST', '/api/sites/mainsite/media/use', { filename: asset.filename });
    assert.equal(used.status, 200);
    assert.equal(used.body.url, `media/${asset.filename}`);
    assert.ok(fs.existsSync(path.join(workspace, 'sites', 'mainsite', 'media', asset.filename)));

    // The working copy is served for the designer preview and the published site.
    const served = await fetch(`${base}/sites/mainsite/media/${asset.filename}`, { headers: { Authorization: 'Bearer test-token' } });
    assert.equal(served.status, 200);
    assert.ok(Buffer.from(await served.arrayBuffer()).equals(png));

    const missing = await call('POST', '/api/sites/mainsite/media/use', { filename: 'missing.png' });
    assert.equal(missing.status, 404);

    await call('DELETE', `/api/media/${asset.id}`);
  });
});

test('copies referenced media into the deployed output', async () => {
  await withContext(async ({ call, workspace }) => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'Banner.png');
    const asset = (await call('POST', '/api/media', form)).body.media;
    await call('POST', '/api/sites/mainsite/media/use', { filename: asset.filename });
    await call('POST', '/api/sites/mainsite/pages', {
      slug: 'gallery',
      title: 'Gallery',
      status: 'published',
      blocks: [{ type: 'image', url: `media/${asset.filename}`, alt: 'Banner' }],
    });
    const deployed = await call('POST', '/api/sites/mainsite/deploy');
    assert.equal(deployed.status, 200);
    assert.ok(fs.existsSync(path.join(workspace, 'deployments', 'media', asset.filename)));
    await call('DELETE', `/api/media/${asset.id}`);
  });
});

test('publishes collections to a static content document', async () => {
  await withContext(async ({ call, workspace }) => {
    await call('POST', '/api/sites/mainsite/content-types', { slug: 'release', name: 'Release notes', fields: [{ key: 'body', label: 'Body', type: 'richtext' }] });
    await call('POST', '/api/sites/mainsite/content/release', { slug: 'live', title: 'Live', status: 'published', data: { body: [{ type: 'paragraph', text: 'Shipped' }] } });
    await call('POST', '/api/sites/mainsite/content/release', { slug: 'hidden', title: 'Hidden', status: 'draft', data: {} });

    const published = await call('POST', '/api/sites/mainsite/deploy');
    assert.equal(published.status, 200);
    assert.ok(published.body.files.includes('content.json'));
    const document = JSON.parse(fs.readFileSync(path.join(workspace, 'deployments', 'content.json'), 'utf8'));
    assert.deepEqual(document.collections.release.map((entry) => entry.slug), ['live']);
    assert.deepEqual(document.collections.release[0].data.body, [{ type: 'paragraph', text: 'Shipped' }]);

    const served = await call('GET', '/api/public/sites/mainsite/content/release');
    assert.deepEqual(served.body.entries.map((entry) => entry.slug), ['live']);

    const allCollections = await call('GET', '/api/public/sites/mainsite/content');
    assert.ok(Object.keys(allCollections.body.collections).includes('release'));

    await call('POST', '/api/sites/mainsite/content/release/live/unpublish');
    await call('POST', '/api/sites/mainsite/deploy');
    const afterUnpublish = JSON.parse(fs.readFileSync(path.join(workspace, 'deployments', 'content.json'), 'utf8'));
    assert.deepEqual(afterUnpublish.collections.release, []);
  });
});

test('blocks a collection delete while entries exist and rejects unknown fields', async () => {
  await withContext(async ({ call }) => {
    await call('POST', '/api/sites/mainsite/content/general', { slug: 'kept', title: 'Kept', data: {} });
    const blocked = await call('DELETE', '/api/sites/mainsite/content-types/general');
    assert.equal(blocked.status, 409);

    const rejected = await call('POST', '/api/sites/mainsite/content/general', { slug: 'x', isAdmin: true });
    assert.equal(rejected.status, 400);

    const badBlocks = await call('POST', '/api/sites/mainsite/content/general', { slug: 'x', blocks: [{ type: 'heading', level: 9, text: 'Deep' }] });
    assert.equal(badBlocks.status, 400);

    const previewOnly = await call('POST', '/api/sites/mainsite/content/preview', { blocks: validateBlocks([{ type: 'quote', text: 'Safe' }]) });
    assert.match(previewOnly.body.html, /<blockquote>Safe<\/blockquote>/);
  });
});

test('lists every collection together and moves an entry between them', async () => {
  await withContext(async ({ call }) => {
    await call('POST', '/api/sites/mainsite/content/general', { slug: 'faq-one', title: 'FAQ one', data: { summary: 'Hours' } });
    await call('POST', '/api/sites/mainsite/content/article', { slug: 'faq-two', title: 'FAQ two', data: { tags: ['news'] } });

    const mixed = await call('GET', '/api/sites/mainsite/content/all?limit=50');
    assert.equal(mixed.status, 200);
    assert.ok(mixed.body.entries.some((entry) => entry.slug === 'faq-one' && entry.contentType === 'general'));
    assert.ok(mixed.body.entries.some((entry) => entry.slug === 'faq-two' && entry.contentType === 'article'));

    const narrowed = await call('GET', '/api/sites/mainsite/content/all?type=article&limit=50');
    assert.ok(narrowed.body.entries.every((entry) => entry.contentType === 'article'));

    const searched = await call('GET', '/api/sites/mainsite/content/all?q=FAQ&limit=50');
    assert.equal(searched.body.total, 2);

    const badType = await call('GET', '/api/sites/mainsite/content/all?type=Not%20A%20Slug');
    assert.equal(badType.status, 400);

    const moved = await call('PATCH', '/api/sites/mainsite/content/general/faq-one', { contentType: 'article', data: { tags: ['faq'] } });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.entry.contentType, 'article');
    assert.deepEqual(moved.body.entry.data.tags, ['faq']);
    assert.equal((await call('GET', '/api/sites/mainsite/content/general/faq-one')).status, 404);

    // The new collection's schema is enforced on the way in.
    const invalidMove = await call('PATCH', '/api/sites/mainsite/content/article/faq-two', { contentType: 'general', data: { tags: 'news' } });
    assert.equal(invalidMove.status, 400);
    assert.equal(invalidMove.body.field, 'data.tags');
  });
});

test('places an entry on pages and renders it when the site is deployed', async () => {
  await withContext(async ({ call, workspace }) => {
    await call('POST', '/api/sites/mainsite/pages', {
      slug: 'landing', title: 'Landing', status: 'published', blocks: [{ type: 'heading', level: 1, text: 'Landing' }],
    });
    await call('POST', '/api/sites/mainsite/content/article', {
      slug: 'launch-day', title: 'Launch day', excerpt: 'What shipped', status: 'draft', blocks: [{ type: 'paragraph', text: 'Everything shipped.' }],
    });

    const placed = await call('POST', '/api/sites/mainsite/content/article/launch-day/place', { pages: ['landing'] });
    assert.equal(placed.status, 200);
    assert.deepEqual(placed.body.placements, ['landing']);
    assert.ok(placed.body.pages[0].blocks.some((block) => block.type === 'content' && block.slug === 'launch-day'));

    const single = await call('GET', '/api/sites/mainsite/content/article/launch-day');
    assert.deepEqual(single.body.placements, ['landing']);

    // A draft entry is never rendered into a deployed page.
    await call('POST', '/api/sites/mainsite/deploy');
    const draftHtml = fs.readFileSync(path.join(workspace, 'deployments', 'landing.html'), 'utf8');
    assert.equal(draftHtml.includes('class="content-entry"'), false);

    await call('POST', '/api/sites/mainsite/content/article/launch-day/publish');
    await call('POST', '/api/sites/mainsite/deploy');
    const liveHtml = fs.readFileSync(path.join(workspace, 'deployments', 'landing.html'), 'utf8');
    assert.match(liveHtml, /class="content-entry"/);
    assert.match(liveHtml, /Launch day/);
    assert.match(liveHtml, /Everything shipped\./);

    // Untick the page and the reference disappears again.
    const removed = await call('POST', '/api/sites/mainsite/content/article/launch-day/place', { pages: [] });
    assert.deepEqual(removed.body.placements, []);
    await call('POST', '/api/sites/mainsite/deploy');
    assert.equal(fs.readFileSync(path.join(workspace, 'deployments', 'landing.html'), 'utf8').includes('class="content-entry"'), false);

    const badPages = await call('POST', '/api/sites/mainsite/content/article/launch-day/place', { pages: ['Not A Slug'] });
    assert.equal(badPages.status, 400);
    assert.equal(badPages.body.field, 'pages[0]');

    const moved = await call('PATCH', '/api/sites/mainsite/content/article/launch-day', { contentType: 'general' });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.entry.contentType, 'general');

    const badRef = await call('PATCH', '/api/sites/mainsite/pages/landing', { blocks: [{ type: 'content', contentType: 'article', slug: 'launch-day', children: [{ type: 'paragraph', text: 'nested' }] }] });
    assert.equal(badRef.status, 400);
    assert.match(badRef.body.error, /cannot contain child elements/);

    const badVariant = await call('PATCH', '/api/sites/mainsite/pages/landing', { blocks: [{ type: 'content', contentType: 'article', slug: 'launch-day', variant: 'gigantic' }] });
    assert.equal(badVariant.status, 400);
  });
});
