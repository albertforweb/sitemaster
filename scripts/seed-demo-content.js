import { createContent, ensureDefaultContentTypes, getContent, getContentType, initDb, listContent } from '../src/db.js';
import { validateContentPayload } from '../src/validation.js';

/**
 * Seeds demo entries so the console has something to show. Running it twice is
 * safe: entries are matched by slug and existing records are left untouched.
 * Usage: npm run seed
 */

const GENERAL = [
  { slug: 'company-address', title: 'Company address', excerpt: 'Registered office and visiting hours', status: 'published', sortOrder: 1, data: { summary: 'Adventure Studio\n18 Harbour Lane\nBristol BS1 4TR', body: [{ type: 'paragraph', text: 'Visits by appointment on weekdays between 10:00 and 16:00.' }], icon: '' }, coverImage: '' },
  { slug: 'opening-hours', title: 'Opening hours', excerpt: 'Weekday and weekend availability', status: 'published', sortOrder: 2, data: { summary: 'Monday to Friday 09:00–17:30\nSaturday 10:00–14:00\nSunday closed', body: [{ type: 'heading', level: 3, text: 'Weekday hours' }, { type: 'list', text: 'Monday 09:00–17:30\nTuesday 09:00–17:30\nWednesday 09:00–17:30' }] } },
  { slug: 'support-email', title: 'Support email', excerpt: 'Where customers reach the support team', status: 'published', sortOrder: 3, data: { summary: 'help@adventure.example', body: [{ type: 'paragraph', text: 'We answer support requests within one working day.' }] } },
  { slug: 'refund-policy', title: 'Refund policy', excerpt: 'Returns, refunds, and cancellations', status: 'draft', sortOrder: 4, data: { summary: 'Unused items can be returned within 30 days for a full refund.', body: [{ type: 'quote', text: 'Refunds are issued to the original payment method within five working days.' }] } },
  { slug: 'shipping-zones', title: 'Shipping zones', excerpt: 'Domestic and international delivery zones', status: 'draft', sortOrder: 5, data: { summary: 'United Kingdom — 2 working days\nEurope — 5 working days\nWorldwide — 7 to 10 working days', body: [{ type: 'paragraph', text: 'Tracked delivery is included in every zone.' }] } },
  { slug: 'brand-voice', title: 'Brand voice', excerpt: 'Tone of copy across every channel', status: 'published', sortOrder: 6, data: { summary: 'Plain, warm, and specific. We avoid jargon and never shout.', body: [{ type: 'alert', text: 'Write for a reader who is busy but curious.', tone: 'info' }] } },
  { slug: 'press-kit', title: 'Press kit', excerpt: 'Logos, photography, and boilerplate', status: 'draft', sortOrder: 7, data: { summary: 'Download the current logo pack and company boilerplate.', body: [] } },
  { slug: 'accessibility-statement', title: 'Accessibility statement', excerpt: 'Conformance target and known gaps', status: 'published', sortOrder: 8, data: { summary: 'We target WCAG 2.2 AA across this website.', body: [{ type: 'heading', level: 3, text: 'Known gaps' }, { type: 'list', text: 'Some archived pages are not yet reflowed for small screens\nThird-party embeds are outside our control' }] } },
  { slug: 'privacy-notice', title: 'Privacy notice', excerpt: 'What we collect and why', status: 'archived', sortOrder: 9, data: { summary: 'Superseded by the 2026 privacy notice.', body: [] } },
  { slug: 'terms-summary', title: 'Terms summary', excerpt: 'Plain-language terms of use', status: 'draft', sortOrder: 10, data: { summary: 'Use the site lawfully, keep your account secure, and pay invoices on time.', body: [{ type: 'paragraph', text: 'The full terms are available on request.' }] } },
];

const ARTICLES = [
  { slug: 'designing-for-speed', title: 'Designing for speed', excerpt: 'Why the fastest interface is usually the simplest one', status: 'published', sortOrder: 1, data: { summary: 'Performance is a design decision, not an engineering afterthought. We measure first, then cut anything that does not earn its place on the page.', tags: ['performance', 'design'], featured: true, body: [{ type: 'heading', level: 2, text: 'Start with the critical path' }, { type: 'paragraph', text: 'Most pages render in under a second until someone adds a carousel, three trackers, and a web font nobody asked for.' }, { type: 'list', text: 'Ship the smallest useful payload\nDefer anything below the fold\nMeasure on real hardware' }] } },
  { slug: 'a-year-of-sitemaster', title: 'A year of Sitemaster', excerpt: 'What we learned building a multi-site control plane', status: 'published', sortOrder: 2, data: { summary: 'Twelve months of shipping websites from one console, and the three decisions that mattered most.', tags: ['engineering', 'milestone'], featured: true, body: [{ type: 'paragraph', text: 'One console now runs every site we manage, from the design system to the deployed output.' }, { type: 'quote', text: 'The best content model is the one a colleague can understand without a manual.' }] } },
  { slug: 'writing-accessible-forms', title: 'Writing accessible forms', excerpt: 'Labels, errors, and focus order without the guesswork', status: 'published', sortOrder: 3, data: { summary: 'Accessible forms are mostly a labelling problem. Here is the checklist we now use before shipping any form.', tags: ['accessibility', 'design'], featured: false, body: [{ type: 'heading', level: 2, text: 'The checklist' }, { type: 'list', text: 'Every input has a visible label\nErrors sit next to the field and in a summary\nFocus moves to the first error after submit\nNothing depends on colour alone' }] } },
  { slug: 'shipping-less-javascript', title: 'Shipping less JavaScript', excerpt: 'A practical budget for the browser', status: 'draft', sortOrder: 4, data: { summary: 'We set a per-page JavaScript budget and treat every kilobyte as a decision someone has to justify.', tags: ['performance'], featured: false, body: [{ type: 'paragraph', text: 'Draft: waiting on the final numbers from the last two launches.' }] } },
  { slug: 'content-models-that-age-well', title: 'Content models that age well', excerpt: 'Schema first, page layout second', status: 'published', sortOrder: 5, data: { summary: 'Pages are disposable; the content behind them is not. Designing the schema first keeps redesigns cheap.', tags: ['content', 'design'], featured: true, body: [{ type: 'heading', level: 2, text: 'Model the content, not the page' }, { type: 'paragraph', text: 'If a field only exists because a layout needs it, it will fight you at the next redesign.' }] } },
  { slug: 'deploying-statically', title: 'Deploying statically without losing the API', excerpt: 'Published HTML plus a JSON content document', status: 'published', sortOrder: 6, data: { summary: 'Static output is fast and reviewable. The content API stays available for anything interactive.', tags: ['deployment', 'engineering'], featured: false, body: [{ type: 'list', text: 'Render reviewed blocks to HTML\nWrite content.json for interactive sections\nKeep drafts out of the published output' }] } },
  { slug: 'working-with-clients', title: 'Working with clients on content', excerpt: 'Editorial guardrails that prevent rework', status: 'draft', sortOrder: 7, data: { summary: 'Agreeing who writes what, and when, saved more hours than any template change.', tags: ['process'], featured: false, body: [] } },
  { slug: 'the-case-for-blocks', title: 'The case for blocks', excerpt: 'Why we compose pages from small validated pieces', status: 'archived', sortOrder: 8, data: { summary: 'An earlier argument for the block editor, kept for reference.', tags: ['design'], featured: false, body: [{ type: 'quote', text: 'A page is a document, not a layout.' }] } },
  { slug: 'search-that-finishes-the-job', title: 'Search that finishes the job', excerpt: 'Filtering, sorting, and pagination in the console', status: 'published', sortOrder: 9, data: { summary: 'Editors work with lists all day, so the list view had to grow up: filters, sort order, and pagination.', tags: ['content', 'design'], featured: false, body: [{ type: 'paragraph', text: 'Search covers title, slug, and stored field values so old entries stay findable after a schema change.' }] } },
  { slug: 'measuring-what-matters', title: 'Measuring what matters', excerpt: 'Four numbers worth watching after a launch', status: 'draft', sortOrder: 10, data: { summary: 'Draft notes on the metrics we now review weekly.', tags: ['process', 'performance'], featured: false, body: [] } },
];

function seed(siteSlug, typeSlug, records) {
  const type = getContentType(siteSlug, typeSlug);
  if (!type) throw new Error(`Collection ${typeSlug} is not registered for ${siteSlug}`);
  const report = { created: [], skipped: [] };
  for (const record of records) {
    if (getContent(siteSlug, typeSlug, record.slug)) { report.skipped.push(record.slug); continue; }
    const entry = createContent(siteSlug, typeSlug, validateContentPayload({ coverImage: '', ...record }, { fields: type.fields }));
    report.created.push(entry.slug);
  }
  return report;
}

export function seedDemoContent(siteSlug = 'mainsite') {
  initDb();
  ensureDefaultContentTypes();
  const general = seed(siteSlug, 'general', GENERAL);
  const article = seed(siteSlug, 'article', ARTICLES);
  return {
    site: siteSlug,
    general: { created: general.created.length, skipped: general.skipped.length },
    article: { created: article.created.length, skipped: article.skipped.length },
    totals: {
      general: listContent(siteSlug, 'general').length,
      article: listContent(siteSlug, 'article').length,
    },
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const site = process.argv[2] || 'mainsite';
  const result = seedDemoContent(site);
  console.log(`Seeded ${result.general.created} general and ${result.article.created} article entries for ${result.site}.`);
  console.log(`Existing entries were skipped. Collection totals: general ${result.totals.general}, article ${result.totals.article}.`);
}
