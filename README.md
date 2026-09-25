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
- reusable typed content entries for dynamic sections;
- draft/published visibility with public delivery restricted to published data;
- explicit deployment state and local delivery; `mainsite` deploys to `/` on
  the Mainsite server at port `8080`, while additional sites use
  `/sites/<site-slug>/`;
- registration/import of an approved local site URL, with discovered pages
  saved as drafts for review;
- publish/undeploy output written to the shared local deployment volume read by
  Mainsite's Nginx server;
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
GET /api/public/sites/:site/content/:type
GET /api/public/sites/:site/content/:type/:slug
GET /api/public/sites/:site

POST /api/sites/:site/deploy
POST /api/sites/:site/undeploy
POST /api/sites/:site/import
```

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
```

The service listens on container port `5000` and is published on host port
`5001` by default. Use `SITEMASTER_PORT` to change the host port. Use the
repository's Docker Compose stack for the integrated IAM, Mainsite, Blogs, and
Sitemaster flow.
