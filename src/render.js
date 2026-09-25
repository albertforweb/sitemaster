function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function renderStyle(style = {}) {
  const allowed = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'marginTop', 'marginBottom', 'padding', 'borderRadius', 'width'];
  return allowed.filter((key) => typeof style[key] === 'string' && /^[#a-zA-Z0-9.%(), -]+$/.test(style[key])).map((key) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${escapeHtml(style[key])}`).join(';');
}

const HTML_ELEMENT_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'button', 'code', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'hr', 'iframe', 'img', 'input', 'label', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'section', 'select', 'small', 'span', 'strong', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'ul', 'video']);
const VOID_HTML_ELEMENT_TAGS = new Set(['br', 'hr', 'img', 'input']);

function renderBlock(block) {
  const text = escapeHtml(block.text || '');
  const style = renderStyle(block.style);
  const children = (block.children || []).map(renderBlock).join('');
  const attributes = style ? ` style="${style}"` : '';
  if (block.type === 'heading') {
    const level = Math.min(6, Math.max(1, Number(block.level) || 2));
    return `<h${level}${attributes}>${text}</h${level}>`;
  }
  if (block.type === 'paragraph' || block.type === 'rich_text') return `<p${attributes}>${text}</p>`;
  if (block.type === 'image') return `<img${attributes} src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" loading="lazy">`;
  if (block.type === 'link') return `<p${attributes}><a href="${escapeHtml(block.url)}">${text || escapeHtml(block.url)}</a></p>`;
  if (block.type === 'button') return `<p${attributes}><a class="button-link" href="${escapeHtml(block.url || '#')}">${text || 'Button'}</a></p>`;
  if (block.type === 'list') return `<ul${attributes}>${text.split('\n').filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  if (block.type === 'quote') return `<blockquote${attributes}>${text}</blockquote>`;
  if (block.type === 'hr') return `<hr${attributes}>`;
  if (block.type === 'video') return `<div class="media-placeholder"${attributes}>Video: ${escapeHtml(block.url || 'Add a video URL')}</div>`;
  if (block.type === 'html_element') {
    const tag = HTML_ELEMENT_TAGS.has(block.data?.tag) ? block.data.tag : 'div';
    if (VOID_HTML_ELEMENT_TAGS.has(tag)) return `<${tag}${attributes}${tag === 'img' ? ` src="${escapeHtml(block.url || '')}" alt="${escapeHtml(block.alt || '')}"` : ''}>`;
    return `<${tag}${attributes}>${text}${children}</${tag}>`;
  }
  if (['container', 'section', 'div', 'span'].includes(block.type)) return `<${block.type}${attributes}>${text}${children}</${block.type}>`;
  if (block.type === 'form') return `<form${attributes}>${children || `<p>${text || 'Form content'}</p>`}</form>`;
  if (block.type === 'nav') return `<nav${attributes}>${children || `<a href="${escapeHtml(block.url || '#')}">${text || 'Navigation'}</a>`}</nav>`;
  if (block.type === 'navbar') return `<nav class="component-navbar"${attributes}><strong>${text || 'Brand'}</strong>${children || '<div class="component-navbar-links"><a href="#">Home</a><a href="#">About</a><a href="#">Contact</a></div>'}</nav>`;
  if (block.type === 'badge') return `<span class="component-badge"${attributes}>${text || 'Badge'}</span>`;
  if (block.type === 'button-group') return `<div class="component-button-group"${attributes}>${children || '<a class="button-link" href="#">Primary</a><a class="button-link secondary" href="#">Secondary</a>'}</div>`;
  if (block.type === 'breadcrumb') return `<nav aria-label="Breadcrumb"${attributes}><ol class="component-breadcrumb">${(text || 'Home\nLibrary\nCurrent page').split('\n').filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></nav>`;
  if (block.type === 'list-group') return `<ul class="component-list-group"${attributes}>${children || (text || 'First item\nSecond item\nThird item').split('\n').filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  if (block.type === 'accordion') return `<div class="component-accordion"${attributes}>${children || `<details open><summary>${text || 'Accordion item'}</summary><p>Expandable content goes here.</p></details>`}</div>`;
  if (block.type === 'pricing') return `<article class="component-pricing"${attributes}><p class="component-kicker">${escapeHtml(block.tone || 'Plan')}</p><h3>${text || 'Professional'}</h3><strong class="component-price">$29 <small>/ month</small></strong>${children || '<p>Everything you need to get started.</p><a class="button-link" href="#">Choose plan</a>'}</article>`;
  if (block.type === 'stats') return `<div class="component-stats"${attributes}>${children || `<div><strong>12K</strong><span>${text || 'Active users'}</span></div><div><strong>98%</strong><span>Availability</span></div><div><strong>24/7</strong><span>Support</span></div>`}</div>`;
  if (block.type === 'hero') return `<section class="component-hero"${attributes}><h1>${text || 'Hero headline'}</h1>${children}</section>`;
  if (block.type === 'card') return `<article class="component-card"${attributes}><h3>${text || 'Card title'}</h3>${children}</article>`;
  if (block.type === 'feature-grid') return `<section class="component-feature-grid"${attributes}>${children || `<article><h3>${text || 'Feature'}</h3></article>`}</section>`;
  if (block.type === 'alert') return `<aside class="callout ${escapeHtml(block.tone || 'info')}"${attributes}>${text || 'Alert message'}</aside>`;
  if (block.type === 'cta') return `<section class="component-cta"${attributes}><h2>${text || 'Call to action'}</h2>${children}</section>`;
  if (block.type === 'callout') return `<aside class="callout ${escapeHtml(block.tone || 'info')}"${attributes}>${text}</aside>`;
  if (block.type === 'spacer') return `<div class="spacer"${attributes} aria-hidden="true"></div>`;
  return '';
}

function renderLogo(settings, siteName) {
  if (settings.logoUrl) return `<img class="site-logo" src="${escapeHtml(settings.logoUrl)}" alt="${siteName}" loading="eager">`;
  return `<span class="site-logo site-logo-text">${escapeHtml(settings.logoText || siteName.slice(0, 1))}</span>`;
}

const LAYOUT_TEMPLATES = {
  'blank-1': { showTopbar: false, showFooter: false, showLogo: false, contentWidth: 'standard', columns: 1, columnMode: 'single' },
  'blank-2': { showTopbar: false, showFooter: false, showLogo: false, contentWidth: 'wide', columns: 2, columnMode: 'split' },
  'blank-3': { showTopbar: false, showFooter: false, showLogo: false, contentWidth: 'full', columns: 3, columnMode: 'triple' },
  standard: { showTopbar: true, showFooter: true, showLogo: true, contentWidth: 'standard', columns: 1, columnMode: 'single' },
  'standard-2': { showTopbar: true, showFooter: true, showLogo: true, contentWidth: 'wide', columns: 2, columnMode: 'split' },
  'standard-3': { showTopbar: true, showFooter: true, showLogo: true, contentWidth: 'full', columns: 3, columnMode: 'triple' },
  'sidebar-left': { showTopbar: true, showFooter: true, showLogo: true, contentWidth: 'wide', columns: 2, columnMode: 'rail-left' },
  'sidebar-right': { showTopbar: true, showFooter: true, showLogo: true, contentWidth: 'wide', columns: 2, columnMode: 'rail-right' },
  'sidebar-both': { showTopbar: true, showFooter: true, showLogo: true, contentWidth: 'full', columns: 3, columnMode: 'rail-both' },
  landing: { showTopbar: true, showFooter: false, showLogo: true, contentWidth: 'wide', columns: 1, columnMode: 'single' },
  'grid-3': { showTopbar: false, showFooter: false, showLogo: false, contentWidth: 'full', columns: 3, columnMode: 'triple' },
  'content-rail': { showTopbar: false, showFooter: false, showLogo: false, contentWidth: 'wide', columns: 2, columnMode: 'rail-right' },
};

function resolveLayout(input = {}) {
  const legacyTemplate = input.showTopbar === false ? 'blank-1' : 'standard';
  const template = LAYOUT_TEMPLATES[input.template] ? input.template : legacyTemplate;
  return { ...LAYOUT_TEMPLATES[template], ...input, template, columnMode: LAYOUT_TEMPLATES[template].columnMode };
}

function renderColumns(blocks, columns, columnMode = 'single') {
  const buckets = Array.from({ length: columns }, () => []);
  for (const block of blocks || []) {
    const requested = Number(block.data?.column) || 1;
    const column = Math.min(columns, Math.max(1, requested)) - 1;
    buckets[column].push(renderBlock(block));
  }
  return `<div class="page-columns columns-${columns} layout-${columnMode}">${buckets.map((items) => `<section class="page-column">${items.join('')}</section>`).join('')}</div>`;
}

export function renderSite(site, page) {
  const settings = site.settings || {};
  const theme = settings.theme || {};
  const title = escapeHtml(page.title || settings.siteName || site.name);
  const siteName = escapeHtml(settings.siteName || site.name);
  const fontFamily = escapeHtml(settings.fontFamily || 'system-ui, sans-serif');
  const colors = {
    background: theme.backgroundColor || '#070b18', surface: theme.surfaceColor || '#111a31',
    text: theme.textColor || '#f5f7ff', muted: theme.mutedTextColor || '#9aa7c7',
    accent: theme.accentColor || '#6366f1', link: theme.linkColor || theme.accentColor || '#a5b4fc',
  };
  const metadata = page.metadata || {};
  const layout = resolveLayout(metadata.layout || {});
  const pageMarkup = metadata.customHtml ? metadata.customHtml : renderColumns(page.blocks, layout.columns, layout.columnMode);
  const customCss = metadata.customCss || '';
  const customScript = metadata.customScript || '';
  const topbar = layout.showTopbar === false ? '' : `<header class="site-topbar">${layout.showLogo === false ? '' : renderLogo(settings, siteName)}<span class="site-name">${siteName}</span></header>`;
  const footer = layout.showFooter === false ? '' : `<footer class="site-footer"><span>${siteName}</span><span>Published with Sitemaster</span></footer>`;
  const width = { narrow: '680px', standard: '860px', wide: '1120px', full: 'none' }[layout.contentWidth || 'standard'] || '860px';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · ${siteName}</title><style>
    :root{--background:${colors.background};--surface:${colors.surface};--text:${colors.text};--muted:${colors.muted};--accent:${colors.accent};--link:${colors.link}}
    *{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--text);font:16px/1.6 ${fontFamily}}main{width:min(${width},100% - 32px);margin:32px auto;padding:40px;border:1px solid color-mix(in srgb,var(--text) 18%,transparent);border-radius:20px;background:var(--surface);box-shadow:0 24px 70px #0005}.site-topbar{display:flex;align-items:center;gap:12px;margin:-8px 0 38px;padding-bottom:20px;border-bottom:1px solid color-mix(in srgb,var(--text) 16%,transparent);font-weight:700}.site-logo{width:42px;height:42px;display:grid;place-items:center;object-fit:contain;border-radius:12px;background:var(--accent);color:#fff;font-weight:800}.site-name{font-size:18px}.page-columns{display:grid;gap:28px}.columns-1{grid-template-columns:1fr}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.layout-rail-left.columns-2{grid-template-columns:minmax(150px,.34fr) minmax(0,1fr)}.layout-rail-right.columns-2{grid-template-columns:minmax(0,1fr) minmax(150px,.34fr)}.layout-rail-both.columns-3{grid-template-columns:minmax(140px,.3fr) minmax(0,1fr) minmax(140px,.3fr)}.page-column{min-width:0}h1,h2,h3,h4,h5,h6{line-height:1.2}a{color:var(--link)}img{max-width:100%;border-radius:12px}.callout{padding:16px;border-left:4px solid var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent);border-radius:8px}.spacer{height:32px}.component-navbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 18px;border:1px solid color-mix(in srgb,var(--text) 18%,transparent);border-radius:12px;background:color-mix(in srgb,var(--accent) 10%,transparent)}.component-navbar-links{display:flex;gap:14px}.component-badge{display:inline-block;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--link);font-size:12px;font-weight:700}.component-button-group{display:flex;gap:8px;flex-wrap:wrap}.component-button-group .secondary{background:transparent;border:1px solid color-mix(in srgb,var(--text) 20%,transparent)}.component-breadcrumb{display:flex;gap:10px;list-style:none;padding:0;color:var(--muted);font-size:14px}.component-breadcrumb li+li::before{content:'/';margin-right:10px;color:var(--muted)}.component-list-group{list-style:none;margin:0;padding:0;border:1px solid color-mix(in srgb,var(--text) 16%,transparent);border-radius:10px;overflow:hidden}.component-list-group li{padding:11px 14px;border-bottom:1px solid color-mix(in srgb,var(--text) 12%,transparent)}.component-list-group li:last-child{border-bottom:0}.component-accordion details{padding:12px 14px;border:1px solid color-mix(in srgb,var(--text) 16%,transparent);border-radius:9px}.component-accordion summary{cursor:pointer;font-weight:700}.component-pricing{padding:22px;border:1px solid color-mix(in srgb,var(--text) 18%,transparent);border-radius:14px}.component-kicker{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em}.component-price{display:block;margin:12px 0;font-size:30px}.component-price small{color:var(--muted);font-size:13px;font-weight:400}.component-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.component-stats>div{padding:18px;border-radius:12px;background:color-mix(in srgb,var(--accent) 10%,transparent)}.component-stats strong,.component-stats span{display:block}.component-stats strong{font-size:24px}.component-stats span{color:var(--muted);font-size:13px}.site-footer{display:flex;justify-content:space-between;gap:16px;margin:38px 0 -12px;padding-top:20px;border-top:1px solid color-mix(in srgb,var(--text) 16%,transparent);color:var(--muted);font-size:13px}@media(max-width:760px){.columns-2,.columns-3,.component-stats{grid-template-columns:1fr}.component-navbar,.component-navbar-links{align-items:flex-start;flex-direction:column}.site-footer{align-items:flex-start;flex-direction:column}}${customCss}@media(max-width:600px){main{margin:16px auto;padding:24px}}
  </style></head><body><main>${topbar}${pageMarkup}${footer}</main>${customScript ? `<script type="module">${customScript}</script>` : ''}</body></html>`;
}
