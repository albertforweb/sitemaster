function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

const SAFE_STYLE_RE = /^[#a-zA-Z0-9.%(), -]+$/;
const STYLE_PROPS = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'fontStyle', 'textAlign', 'textTransform', 'letterSpacing', 'lineHeight', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle', 'width', 'maxWidth', 'minHeight', 'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'gap'];

function styleToCss(style, allowed = STYLE_PROPS) {
  if (!style || typeof style !== 'object') return '';
  return allowed
    .filter((key) => typeof style[key] === 'string' && style[key] && SAFE_STYLE_RE.test(style[key]))
    .map((key) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${escapeHtml(style[key])}`)
    .join(';');
}

const SHELL_STYLE_PROPS = ['padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius', 'textAlign', 'minHeight', 'gap', 'width', 'maxWidth', 'color', 'fontSize', 'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems'];
const TEMPLATE_STYLE_PROPS = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'letterSpacing', 'textTransform', 'borderRadius', 'padding'];

function renderShellStyle(settings, shell) {
  const css = styleToCss(settings.shellStyles?.[shell], SHELL_STYLE_PROPS);
  return css ? ` style="${css}"` : '';
}

function renderTemplateStyle(settings, key) {
  const css = styleToCss(settings.templateStyles?.[key], TEMPLATE_STYLE_PROPS);
  return css ? ` style="${css}"` : '';
}

const HTML_ELEMENT_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'button', 'code', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'hr', 'iframe', 'img', 'input', 'label', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'section', 'select', 'small', 'span', 'strong', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'ul', 'video']);
const VOID_HTML_ELEMENT_TAGS = new Set(['br', 'hr', 'img', 'input']);

function renderBlock(block, context = {}) {
  if (!block || typeof block !== 'object') return '';
  const text = escapeHtml(block.text || '');
  const style = styleToCss(block.style);
  const children = (block.children || []).map((child) => renderBlock(child, context)).join('');
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
  if (block.type === 'content') {
    const entry = typeof context.resolveContent === 'function' ? context.resolveContent(block.contentType, block.slug) : null;
    if (!entry) return '';
    const entryBlocks = (entry.blocks || []).map((child) => renderBlock(child, context)).join('');
    return `<article class="content-entry" data-content-type="${escapeHtml(entry.contentType || block.contentType || '')}"><h2 class="content-entry-title">${escapeHtml(entry.title || entry.slug || '')}</h2>${entry.excerpt ? `<p class="content-entry-excerpt">${escapeHtml(entry.excerpt)}</p>` : ''}${entryBlocks}</article>`;
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

function renderShellBlocks(settings, shell, context) {
  return (settings.shellBlocks?.[shell] || []).map((block) => renderBlock(block, context)).join('');
}

const SHELL_BRANDING_IDS = { header: ['logo', 'name'], footer: ['name', 'note'] };

function shellOrderTokens(settings, shell) {
  const branding = SHELL_BRANDING_IDS[shell] || [];
  const moved = settings.shellBrandingMoved || {};
  const blockCount = (settings.shellBlocks?.[shell] || []).length;
  const provided = Array.isArray(settings.shellOrder?.[shell]) ? settings.shellOrder[shell] : null;
  const seen = new Set();
  const tokens = [];
  const candidates = provided && provided.length ? provided : branding.map((id) => `branding:${id}`);
  for (const token of candidates) {
    if (seen.has(token)) continue;
    if (token.startsWith('branding:')) {
      const id = token.slice(9);
      if (!branding.includes(id) || moved[`${shell}.${id}`]) continue;
    } else if (token.startsWith('block:')) {
      const index = Number(token.slice(6));
      if (!Number.isInteger(index) || index < 0 || index >= blockCount) continue;
    } else continue;
    seen.add(token); tokens.push(token);
  }
  for (const id of branding) {
    const token = `branding:${id}`;
    if (!moved[`${shell}.${id}`] && !seen.has(token)) { seen.add(token); tokens.push(token); }
  }
  for (let index = 0; index < blockCount; index += 1) {
    const token = `block:${index}`;
    if (!seen.has(token)) { seen.add(token); tokens.push(token); }
  }
  return tokens;
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

function renderColumns(blocks, columns, columnMode, context) {
  const buckets = Array.from({ length: columns }, () => []);
  for (const block of blocks || []) {
    const requested = Number(block.data?.column) || 1;
    const column = Math.min(columns, Math.max(1, requested)) - 1;
    buckets[column].push(renderBlock(block, context));
  }
  return `<div class="page-columns columns-${columns} layout-${columnMode}">${buckets.map((items) => `<section class="page-column">${items.join('')}</section>`).join('')}</div>`;
}

export function renderBlocks(blocks, context = {}) {
  return (blocks || []).map((block) => renderBlock(block, context)).join('');
}

export function renderSite(site, page, options = {}) {
  const settings = site.settings || {};
  const theme = settings.theme || {};
  const context = { resolveContent: options.resolveContent };
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
  const moved = settings.shellBrandingMoved || {};
  const pageMarkup = metadata.customHtml ? metadata.customHtml : renderColumns(page.blocks, layout.columns, layout.columnMode, context);
  const customCss = metadata.customCss || '';
  const customScript = metadata.customScript || '';
  const footerNote = settings.footerNote === undefined ? 'Published with Sitemaster' : settings.footerNote;
  const headerChild = (token) => {
    if (token === 'branding:logo') return layout.showLogo === false || moved['header.logo'] ? '' : renderLogo(settings, siteName);
    if (token === 'branding:name') return moved['header.name'] ? '' : `<span class="site-name"${renderTemplateStyle(settings, 'header.name')}>${siteName}</span>`;
    if (token.startsWith('block:')) { const index = Number(token.slice(6)); return (settings.shellBlocks?.header || [])[index] ? renderBlock((settings.shellBlocks.header)[index], context) : ''; }
    return '';
  };
  const footerChild = (token) => {
    if (token === 'branding:name') return moved['footer.name'] ? '' : `<span${renderTemplateStyle(settings, 'footer.name')}>${siteName}</span>`;
    if (token === 'branding:note') return footerNote && !moved['footer.note'] ? `<span${renderTemplateStyle(settings, 'footer.note')}>${escapeHtml(footerNote)}</span>` : '';
    if (token.startsWith('block:')) { const index = Number(token.slice(6)); return (settings.shellBlocks?.footer || [])[index] ? renderBlock((settings.shellBlocks.footer)[index], context) : ''; }
    return '';
  };
  const topbar = layout.showTopbar === false ? '' : `<header class="site-topbar"${renderShellStyle(settings, 'header')}>${shellOrderTokens(settings, 'header').map(headerChild).join('')}</header>`;
  const footer = layout.showFooter === false ? '' : `<footer class="site-footer"${renderShellStyle(settings, 'footer')}>${shellOrderTokens(settings, 'footer').map(footerChild).join('')}</footer>`;
  const width = { narrow: '680px', standard: '860px', wide: '1120px', full: 'none' }[layout.contentWidth || 'standard'] || '860px';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · ${siteName}</title><style>
    :root{--background:${colors.background};--surface:${colors.surface};--text:${colors.text};--muted:${colors.muted};--accent:${colors.accent};--link:${colors.link}}
    *{box-sizing:border-box}body{margin:0;background:var(--background);color:var(--text);font:16px/1.6 ${fontFamily}}main{width:min(${width},100% - 32px);margin:32px auto;padding:40px;border:1px solid color-mix(in srgb,var(--text) 18%,transparent);border-radius:20px;background:var(--surface);box-shadow:0 24px 70px #0005}.site-topbar{display:flex;align-items:center;gap:12px;margin:-8px 0 38px;padding-bottom:20px;border-bottom:1px solid color-mix(in srgb,var(--text) 16%,transparent);font-weight:700}.site-topbar .site-name{font-size:18px}.site-logo{width:42px;height:42px;display:grid;place-items:center;object-fit:contain;border-radius:12px;background:var(--accent);color:#fff;font-weight:800}.site-footer{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:42px;padding-top:20px;border-top:1px solid color-mix(in srgb,var(--text) 16%,transparent);color:var(--muted);font-size:14px}.page-columns{display:grid;gap:28px}.columns-1{grid-template-columns:1fr}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.layout-rail-left.columns-2{grid-template-columns:minmax(150px,.34fr) minmax(0,1fr)}.layout-rail-right.columns-2{grid-template-columns:minmax(0,1fr) minmax(150px,.34fr)}.layout-rail-both.columns-3{grid-template-columns:minmax(140px,.3fr) minmax(0,1fr) minmax(140px,.3fr)}.page-column{min-width:0}h1,h2,h3,h4,h5,h6{line-height:1.2}a{color:var(--link)}img{max-width:100%;border-radius:12px}.callout{padding:16px;border-left:4px solid var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent);border-radius:8px}.spacer{height:32px}.component-navbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 18px;border:1px solid color-mix(in srgb,var(--text) 18%,transparent);border-radius:12px;background:color-mix(in srgb,var(--accent) 10%,transparent)}.component-navbar-links{display:flex;gap:14px}.component-badge{display:inline-block;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--link);font-size:12px;font-weight:700}.component-button-group{display:flex;gap:8px;flex-wrap:wrap}.button-link{display:inline-block;padding:10px 16px;border-radius:10px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}.button-link.secondary{background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--link)}.component-pricing,.component-card,.component-hero,.component-cta,.component-feature-grid,.component-stats,.media-placeholder,.image-placeholder{border-radius:14px}
  </style></head><body><main>${topbar}${pageMarkup}${footer}</main>${customScript ? `<script type="module">${customScript}</script>` : ''}</body></html>`;
}
