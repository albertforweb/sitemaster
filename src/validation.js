const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FONT_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ,.'"-]{0,119}$/;
const MAX_JSON_DEPTH = 8;
const BLOCK_TYPES = new Set(['heading', 'paragraph', 'rich_text', 'image', 'link', 'button', 'list', 'quote', 'hr', 'video', 'html_element', 'container', 'section', 'div', 'span', 'form', 'nav', 'hero', 'card', 'feature-grid', 'alert', 'cta', 'callout', 'spacer', 'navbar', 'badge', 'button-group', 'breadcrumb', 'list-group', 'accordion', 'pricing', 'stats']);
const HTML_ELEMENT_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'button', 'code', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'hr', 'iframe', 'img', 'input', 'label', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'section', 'select', 'small', 'span', 'strong', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'ul', 'video']);
const PAGE_LAYOUT_TEMPLATES = new Set(['blank-1', 'blank-2', 'blank-3', 'standard', 'standard-2', 'standard-3', 'sidebar-left', 'sidebar-right', 'sidebar-both', 'landing', 'grid-3', 'content-rail']);
const SITE_SETTING_KEYS = new Set(['siteName', 'logoText', 'logoUrl', 'fontFamily', 'theme']);
const THEME_KEYS = new Set([
  'backgroundColor', 'surfaceColor', 'textColor', 'mutedTextColor', 'accentColor',
  'accentStrongColor', 'inputBackgroundColor', 'inputBorderColor', 'inputTextColor',
  'buttonTextColor', 'linkColor', 'linkHoverColor',
]);

export function validationError(message, field = null) {
  return { message, field };
}

export function assertSlug(value, field = 'slug') {
  if (typeof value !== 'string' || value.length < 1 || value.length > 120 || !SLUG_RE.test(value)) {
    throw validationError(`${field} must use lowercase letters, numbers, and single hyphens`, field);
  }
  return value;
}

export function validateSiteUrl(value, field = 'originUrl') {
  if (typeof value !== 'string' || value.length > 2048) throw validationError(`${field} must be a valid local HTTP URL`, field);
  let url;
  try { url = new URL(value); } catch { throw validationError(`${field} must be a valid local HTTP URL`, field); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw validationError(`${field} must be an HTTP URL without credentials, query, or fragment`, field);
  }
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'mainsite']);
  if (!allowedHosts.has(url.hostname.toLowerCase())) throw validationError(`${field} must target an approved local host`, field);
  return url.origin;
}

export function assertText(value, field, { max = 500, required = true } = {}) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw validationError(`${field} must be a ${required ? 'non-empty ' : ''}string of at most ${max} characters`, field);
  }
  return value;
}

function assertSafeUrl(value, field) {
  if (value === '') return value;
  if (value.startsWith('/')) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('unsupported protocol');
    return value;
  } catch {
    throw validationError(`${field} must be a relative path or HTTPS URL`, field);
  }
}

function validateJsonShape(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) throw validationError('content nesting is too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return;
  if (Array.isArray(value)) {
    if (value.length > 200) throw validationError('content arrays may contain at most 200 items');
    for (const item of value) validateJsonShape(item, depth + 1);
    return;
  }
  if (typeof value !== 'object') throw validationError('content must be JSON data');
  const keys = Object.keys(value);
  if (keys.length > 50) throw validationError('content objects may contain at most 50 fields');
  for (const key of keys) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw validationError('reserved object keys are not allowed');
    }
    validateJsonShape(value[key], depth + 1);
  }
}

export function validateBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length > 100) throw validationError('blocks must be an array with at most 100 items', 'blocks');
  return blocks.map((block, index) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) throw validationError(`block ${index} must be an object`, 'blocks');
    const keys = Object.keys(block);
    if (keys.some((key) => !['id', 'type', 'text', 'level', 'url', 'alt', 'tone', 'style', 'children', 'data'].includes(key))) {
      throw validationError(`block ${index} contains an unsupported field`, 'blocks');
    }
    if (typeof block.type !== 'string' || !BLOCK_TYPES.has(block.type)) throw validationError(`block ${index} has an unsupported type`, 'blocks');
    if (block.text !== undefined) assertText(block.text, `blocks[${index}].text`, { max: 20000, required: false });
    if (block.url !== undefined) assertSafeUrl(assertText(block.url, `blocks[${index}].url`, { max: 2048 }), `blocks[${index}].url`);
    if (block.alt !== undefined) assertText(block.alt, `blocks[${index}].alt`, { max: 300, required: false });
    if (block.level !== undefined && (!Number.isInteger(block.level) || block.level < 1 || block.level > 6)) {
      throw validationError(`blocks[${index}].level must be an integer from 1 to 6`, 'blocks');
    }
    if (block.tone !== undefined && (typeof block.tone !== 'string' || !['info', 'success', 'warning', 'danger'].includes(block.tone))) {
      throw validationError(`blocks[${index}].tone is invalid`, 'blocks');
    }
    if (block.id !== undefined && (typeof block.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(block.id))) throw validationError(`blocks[${index}].id is invalid`, 'blocks');
    if (block.style !== undefined) validateJsonShape(block.style);
    if (block.children !== undefined) validateBlocks(block.children);
    if (block.data !== undefined) validateJsonShape(block.data);
    if (block.type === 'html_element' && (!block.data || typeof block.data.tag !== 'string' || !HTML_ELEMENT_TAGS.has(block.data.tag))) {
      throw validationError(`blocks[${index}].data.tag is not a supported HTML element`, 'blocks');
    }
    return structuredClone(block);
  });
}

export function validateSettings(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('settings must be an object', 'settings');
  const output = {};
  for (const key of Object.keys(input)) {
    if (!SITE_SETTING_KEYS.has(key)) throw validationError(`settings.${key} is not supported`, 'settings');
  }
  if (!partial || input.siteName !== undefined) output.siteName = assertText(input.siteName, 'settings.siteName', { max: 120 });
  if (!partial || input.logoText !== undefined) output.logoText = assertText(input.logoText, 'settings.logoText', { max: 12 });
  if (!partial || input.logoUrl !== undefined) output.logoUrl = assertSafeUrl(assertText(input.logoUrl, 'settings.logoUrl', { max: 2048, required: false }), 'settings.logoUrl');
  if (!partial || input.fontFamily !== undefined) {
    output.fontFamily = assertText(input.fontFamily, 'settings.fontFamily', { max: 120 });
    if (!FONT_FAMILY_RE.test(output.fontFamily)) throw validationError('settings.fontFamily contains unsupported characters', 'settings.fontFamily');
  }
  if (!partial || input.theme !== undefined) {
    if (!input.theme || typeof input.theme !== 'object' || Array.isArray(input.theme)) throw validationError('settings.theme must be an object', 'settings.theme');
    output.theme = {};
    for (const key of Object.keys(input.theme)) {
      if (!THEME_KEYS.has(key)) throw validationError(`settings.theme.${key} is not supported`, 'settings.theme');
      if (input.theme[key] !== null && !HEX_RE.test(input.theme[key])) throw validationError(`settings.theme.${key} must be a six-digit hex color or null`, 'settings.theme');
      output.theme[key] = input.theme[key];
    }
  }
  return output;
}

export function validatePagePayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('request body must be an object');
  const allowed = new Set(['slug', 'title', 'excerpt', 'template', 'status', 'blocks', 'metadata']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw validationError('request body contains an unsupported field');
  const result = {};
  if (!partial || body.slug !== undefined) result.slug = assertSlug(body.slug);
  if (!partial || body.title !== undefined) result.title = assertText(body.title, 'title', { max: 200 });
  if (!partial || body.excerpt !== undefined) result.excerpt = assertText(body.excerpt ?? '', 'excerpt', { max: 1000, required: false });
  if (!partial || body.template !== undefined) result.template = assertText(body.template ?? 'default', 'template', { max: 80 });
  if (!partial || body.status !== undefined) {
    const status = body.status ?? 'draft';
    if (!['draft', 'published', 'archived'].includes(status)) throw validationError('status must be draft, published, or archived', 'status');
    result.status = status;
  }
  if (!partial || body.blocks !== undefined) result.blocks = validateBlocks(body.blocks ?? []);
  if (!partial || body.metadata !== undefined) {
    validateJsonShape(body.metadata ?? {});
    result.metadata = structuredClone(body.metadata ?? {});
    for (const [field, max] of [['customHtml', 100000], ['customCss', 50000], ['customScript', 50000]]) {
      if (result.metadata[field] !== undefined) assertText(result.metadata[field], `metadata.${field}`, { max, required: false });
    }
    if (result.metadata.layout !== undefined) {
      if (!result.metadata.layout || typeof result.metadata.layout !== 'object' || Array.isArray(result.metadata.layout)) {
        throw validationError('metadata.layout must be an object', 'metadata.layout');
      }
      for (const field of ['showTopbar', 'showFooter', 'showLogo']) {
        if (result.metadata.layout[field] !== undefined && typeof result.metadata.layout[field] !== 'boolean') {
          throw validationError(`metadata.layout.${field} must be a boolean`, 'metadata.layout');
        }
      }
      if (result.metadata.layout.template !== undefined && !PAGE_LAYOUT_TEMPLATES.has(result.metadata.layout.template)) {
        throw validationError('metadata.layout.template is invalid', 'metadata.layout');
      }
      if (result.metadata.layout.columns !== undefined && (!Number.isInteger(result.metadata.layout.columns) || result.metadata.layout.columns < 1 || result.metadata.layout.columns > 3)) {
        throw validationError('metadata.layout.columns must be an integer from 1 to 3', 'metadata.layout');
      }
      if (result.metadata.layout.contentWidth !== undefined && !['narrow', 'standard', 'wide', 'full'].includes(result.metadata.layout.contentWidth)) {
        throw validationError('metadata.layout.contentWidth is invalid', 'metadata.layout');
      }
    }
  }
  return result;
}

export function validateContentPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('request body must be an object');
  const allowed = new Set(['slug', 'status', 'data']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw validationError('request body contains an unsupported field');
  const result = {};
  if (!partial || body.slug !== undefined) result.slug = assertSlug(body.slug);
  if (!partial || body.status !== undefined) {
    const status = body.status ?? 'draft';
    if (!['draft', 'published', 'archived'].includes(status)) throw validationError('status must be draft, published, or archived', 'status');
    result.status = status;
  }
  if (!partial || body.data !== undefined) {
    validateJsonShape(body.data ?? {});
    result.data = structuredClone(body.data ?? {});
  }
  return result;
}

export function parseValidationError(error) {
  return error?.field ? { error: error.message, field: error.field } : { error: error?.message || 'Invalid request' };
}
