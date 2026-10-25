# Adventure Sitemaster

Sitemaster is the local website factory and control plane for Adventure. It
creates and manages any number of websites, records each site's deployment
metadata, and provides the content APIs consumed by the generated sites. It
supports both static presentation data (branding, navigation, pages, theme
tokens) and dynamic content collections (for example articles or products).

Blogs remains a separate application. It owns blog-specific posts, comments,
and moderation workflows; Sitemaster owns the website shell and reusable site
content. A site can consume both Sitemaster content and Blogs APIs.

## Current capabilities

- multi-site workspaces identified by a stable site slug;
- validated site settings and theme tokens;
- static pages represented by validated visual content blocks;
- a visual page designer with selectable one-, two-, and three-column layout
  templates, header/footer options, drag-to-reorder canvas elements, inline
  text editing, live preview, HTML/CSS overrides, and a JavaScript module
  editor for API-driven pages;
- reusable typed content entries for dynamic sections, listed as one flat table
  where the content type is an attribute of the entry rather than a separate
  screen: a toolbar filter narrows the list and a badge shows each entry's type;
- registered content types (collections) with a field schema of text, long text,
  rich text blocks, number, yes/no, choice list, image URL, link URL, date, and
  tags; entry data is validated against its collection schema and values that
  predate a schema are preserved;
- moving an entry to another content type validates its data against the target
  schema and repoints any page that already renders it;
- a publish workflow for entries: preview the rendered result, tick the pages
  that should show it, publish, and deploy the site in one step;
- page placement of published entries through a validated `content` block that
  renders the entry inside the page body at deploy time (draft entries are never
  rendered into a deployed page);
- one shared visual editor for both pages and content entries: entries use the
  same canvas, layers tree, and inspector, with schema fields rendered from the
  content type instead of the page layout controls;
- content workflows with search, status filters, sorting, pagination, selection,
  bulk publish/unpublish/archive/delete across types, entry duplication, and
  manual ordering;
- a shared media library with validated uploads, alternative text, and a picker
  for cover images and URL fields;
- draft/published visibility with public delivery restricted to published data;
- explicit deployment state and local delivery; `mainsite` deploys to `/` on
  the Mainsite server at port `8080`, while additional sites use
  `/sites/<site-slug>/`;
- registration/import of an approved local site URL, with discovered pages
  saved as drafts for review;
- publish/undeploy output written to the shared local deployment volume read by
  Mainsite's Nginx server; each deployment also writes `content.json` with the
  published entries of every collection;
- an IAM-protected administration UI and API;
- standalone local administration at `http://localhost:5001/` (the canonical
  entry point; `/admin/` remains a compatibility alias);
- optional same-origin integration through the Mainsite Nginx proxy at `/sitemaster/`.

The current implementation stores site and content records in SQLite. Imported
HTML is converted into safe draft blocks rather than copied as executable
markup. Publishing renders reviewed, published blocks into static HTML. A
page may additionally contain explicitly authored custom HTML, CSS, and
JavaScript; those fields are treated as trusted site-owner code and should be
reviewed before publishing.

## API surfaces

Public delivery is read-only and publishes only records with
`status=published`:

```text
GET /api/public/sites/:site/pages
GET /api/public/sites/:site/pages/:slug
GET /api/public/sites/:site/content
GET /api/public/sites/:site/content/:type
GET /api/public/sites/:site/content/:type/:slug
GET /api/public/sites/:site

POST /api/sites/:site/deploy
POST /api/sites/:site/undeploy
POST /api/sites/:site/import
```

Authenticated management routes for content and media:

```text
GET    /api/sites/:site/content                       collections with counts
GET    /api/sites/:site/content-types                 collection definitions
POST   /api/sites/:site/content-types
PATCH  /api/sites/:site/content-types/:type
DELETE /api/sites/:site/content-types/:type
POST   /api/sites/:site/content/preview               renders blocks to HTML
GET    /api/sites/:site/content/all?page&limit&status&q&sort&dir&type
                                                   entries of every type, optional type filter
GET    /api/sites/:site/content/:type?page&limit&status&q&sort&dir
POST   /api/sites/:site/content/:type
GET    /api/sites/:site/content/:type/:slug            includes page placements
PATCH  /api/sites/:site/content/:type/:slug            accepts contentType to move an entry
DELETE /api/sites/:site/content/:type/:slug
POST   /api/sites/:site/content/:type/bulk            publish|unpublish|archive|delete
POST   /api/sites/:site/content/:type/:slug/publish
POST   /api/sites/:site/content/:type/:slug/unpublish
POST   /api/sites/:site/content/:type/:slug/duplicate
POST   /api/sites/:site/content/:type/:slug/place     body: { pages: [page slugs] }
GET    /api/sites/:site/media
POST   /api/sites/:site/media                         multipart field: file
PATCH  /api/sites/:site/media/:id
DELETE /api/sites/:site/media/:id
```

Uploads are limited to PNG, JPEG, GIF, WebP, AVIF, SVG, and PDF files within
`SITEMASTER_MEDIA_MAX_BYTES`. Stored files use random names under
`SITEMASTER_UPLOADS_DIR` and are served read-only from `/media/<filename>`.

Management routes are protected by an IAM opaque bearer token whose audience
is `sitemaster-api`. Sitemaster permissions are application-owned and
reconciled into IAM from `authorization-manifest.json`; Sitemaster does not
treat IAM's system administrator role as a Sitemaster permission.

The local Compose deployment registers `sitemaster-api` in IAM, reads its
generated client secret from IAM's protected `.vaults` file, and exposes the
service through `/sitemaster/` on the Mainsite reverse proxy. The first seeded
site is `mainsite`.

Sitemaster is the owner of website workspaces and deployment. Mainsite is the
primary deployed website and consumes Sitemaster's public APIs; it does not
host or administer the Sitemaster console.

## Local development

```sh
npm ci
npm test
npm start
npm run seed
```

`npm run seed` adds demo Article and General entries to the first site; it is
idempotent and matches entries by slug, so it is safe to run repeatedly.

The service listens on container port `5000` and is published on host port
`5001` by default. Use `SITEMASTER_PORT` to change the host port. Use the
repository's Docker Compose stack for the integrated IAM, Mainsite, Blogs, and
Sitemaster flow.
