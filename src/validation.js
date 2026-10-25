const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEY_RE = /^[a-z][a-zA-Z0-9]*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FONT_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ,.'"-]{0,119}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_JSON_DEPTH = 8;
const BLOCK_TYPES = new Set(['heading', 'paragraph', 'rich_text', 'image', 'link', 'button', 'list', 'quote', 'hr', 'video', 'html_element', 'container', 'section', 'div', 'span', 'form', 'nav', 'hero', 'card', 'feature-grid', 'alert', 'cta', 'callout', 'spacer', 'navbar', 'badge', 'button-group', 'breadcrumb', 'list-group', 'accordion', 'pricing', 'stats', 'content']);
const HTML_ELEMENT_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'button', 'code', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'hr', 'iframe', 'img', 'input', 'label', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'section', 'select', 'small', 'span', 'strong', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'ul', 'video']);
const PAGE_LAYOUT_TEMPLATES = new Set(['blank-1', 'blank-2', 'blank-3', 'standard', 'standard-2', 'standard-3', 'sidebar-left', 'sidebar-right', 'sidebar-both', 'landing', 'grid-3', 'content-rail']);
const CONTENT_FIELD_TYPES = new Set(['text', 'textarea', 'richtext', 'number', 'boolean', 'select', 'image', 'url', 'date', 'tags']);
const CONTENT_STATUSES = ['draft', 'published', 'archived'];
const SITE_SETTING_KEYS = new Set(['siteName', 'logoText', 'logoUrl', 'fontFamily', 'footerNote', 'theme', 'shellBlocks', 'shellStyles', 'templateStyles', 'shellBrandingMoved', 'shellOrder']);
const THEME_KEYS = new Set([
  'backgroundColor', 'surfaceColor', 'textColor', 'mutedTextColor', 'accentColor',
  'accentStrongColor', 'inputBackgroundColor', 'inputBorderColor', 'inputTextColor',
  'buttonTextColor', 'linkColor', 'linkHoverColor',
]);
const SHELL_STYLE_PROPS = new Set(['color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle', 'gap', 'justifyContent', 'alignItems', 'display', 'flexDirection', 'flexWrap']);
const TEMPLATE_STYLE_PROPS = new Set(['color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'letterSpacing', 'textTransform', 'borderRadius', 'padding']);
const SHELL_NAMES = new Set(['header', 'footer']);
const SAFE_STYLE_RE = /^[#a-zA-Z0-9.%(), -]+$/;

export function validationError(message, field = null) {
  return Object.assign(new Error(message), { message, field, validation: true });
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
  if (value.startsWith('//')) throw validationError(`${field} must be a relative path or HTTPS URL`, field);
  if (value.startsWith('/')) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('unsupported protocol');
    return value;
  } catch {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) throw validationError(`${field} must be a relative path or HTTPS URL`, field);
    return value;
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
    if (keys.some((key) => !['id', 'type', 'text', 'level', 'url', 'alt', 'tone', 'style', 'children', 'data', 'contentType', 'slug'].includes(key))) {
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
    if (block.type === 'content') {
      if (block.contentType !== undefined) assertSlug(block.contentType, `blocks[${index}].contentType`);
      if (block.slug !== undefined) assertSlug(block.slug, `blocks[${index}].slug`);
      if (Array.isArray(block.children) && block.children.length) {
        throw validationError(`block ${index} content blocks cannot contain child elements`, 'blocks');
      }
    }
    return structuredClone(block);
  });
}

function validateStyleBag(input, props, field) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError(`${field} must be an object`, field);
  const output = {};
  for (const key of Object.keys(input)) {
    if (!props.has(key)) throw validationError(`${field}.${key} is not a supported style`, field);
    if (input[key] === null || input[key] === '') continue;
    if (typeof input[key] !== 'string' || !SAFE_STYLE_RE.test(input[key])) throw validationError(`${field}.${key} has an unsupported value`, field);
    output[key] = input[key];
  }
  return output;
}

function validateShellBlocks(input) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('settings.shellBlocks must be an object', 'settings.shellBlocks');
  const output = {};
  for (const key of Object.keys(input)) {
    if (!SHELL_NAMES.has(key)) throw validationError(`settings.shellBlocks.${key} is not supported`, 'settings.shellBlocks');
    output[key] = validateBlocks(input[key] ?? []);
  }
  return output;
}

function validateShellStyles(input) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('settings.shellStyles must be an object', 'settings.shellStyles');
  const output = {};
  for (const key of Object.keys(input)) {
    if (!SHELL_NAMES.has(key)) throw validationError(`settings.shellStyles.${key} is not supported`, 'settings.shellStyles');
    output[key] = validateStyleBag(input[key], SHELL_STYLE_PROPS, `settings.shellStyles.${key}`);
  }
  return output;
}

function validateTemplateStyles(input) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('settings.templateStyles must be an object', 'settings.templateStyles');
  const output = {};
  for (const key of Object.keys(input)) {
    if (!['header.logo', 'header.name', 'footer.name', 'footer.note'].includes(key)) {
      throw validationError(`settings.templateStyles.${key} is not supported`, 'settings.templateStyles');
    }
    output[key] = validateStyleBag(input[key], TEMPLATE_STYLE_PROPS, `settings.templateStyles.${key}`);
  }
  return output;
}

function validateShellOrder(input) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('settings.shellOrder must be an object', 'settings.shellOrder');
  const output = {};
  for (const shell of Object.keys(input)) {
    if (!SHELL_NAMES.has(shell)) throw validationError(`settings.shellOrder.${shell} is not supported`, 'settings.shellOrder');
    const list = input[shell];
    if (!Array.isArray(list) || list.length > 200) throw validationError(`settings.shellOrder.${shell} must be an array`, 'settings.shellOrder');
    output[shell] = list.map((token) => {
      if (typeof token !== 'string') throw validationError('shell order entries must be strings', 'settings.shellOrder');
      const branding = ['branding:logo', 'branding:name', 'branding:note'];
      if (branding.includes(token)) return token;
      if (/^block:\d+$/.test(token)) return token;
      throw validationError('shell order entries must reference a branding element or a block', 'settings.shellOrder');
    });
  }
  return output;
}

function validateShellBrandingMoved(input) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('settings.shellBrandingMoved must be an object', 'settings.shellBrandingMoved');
  const output = {};
  for (const key of Object.keys(input)) {
    if (!['header.logo', 'header.name', 'footer.name', 'footer.note'].includes(key)) {
      throw validationError(`settings.shellBrandingMoved.${key} is not supported`, 'settings.shellBrandingMoved');
    }
    output[key] = Boolean(input[key]);
  }
  return output;
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
  if (!partial || input.footerNote !== undefined) output.footerNote = assertText(input.footerNote ?? '', 'settings.footerNote', { max: 300, required: false });
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
  if (!partial || input.shellBlocks !== undefined) output.shellBlocks = validateShellBlocks(input.shellBlocks);
  if (!partial || input.shellStyles !== undefined) output.shellStyles = validateShellStyles(input.shellStyles);
  if (!partial || input.templateStyles !== undefined) output.templateStyles = validateTemplateStyles(input.templateStyles);
  if (!partial || input.shellBrandingMoved !== undefined) output.shellBrandingMoved = validateShellBrandingMoved(input.shellBrandingMoved);
  if (!partial || input.shellOrder !== undefined) output.shellOrder = validateShellOrder(input.shellOrder);
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
    if (!CONTENT_STATUSES.includes(status)) throw validationError('status must be draft, published, or archived', 'status');
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

export function validateContentFields(fields) {
  if (!Array.isArray(fields) || fields.length > 50) throw validationError('fields must be an array with at most 50 items', 'fields');
  const seen = new Set();
  return fields.map((field) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) throw validationError('each field must be an object', 'fields');
    const allowed = new Set(['key', 'label', 'type', 'required', 'options', 'help']);
    if (Object.keys(field).some((key) => !allowed.has(key))) throw validationError('field contains an unsupported property', 'fields');
    if (typeof field.key !== 'string' || !KEY_RE.test(field.key) || field.key.length > 60) {
      throw validationError('each field key must be an identifier', 'fields');
    }
    if (seen.has(field.key)) throw validationError(`field key ${field.key} duplicates another field`, 'fields');
    seen.add(field.key);
    if (typeof field.type !== 'string' || !CONTENT_FIELD_TYPES.has(field.type)) {
      throw validationError(`field ${field.key} has an unsupported type`, 'fields');
    }
    const output = { key: field.key, label: field.label === undefined ? field.key : String(field.label), type: field.type, required: Boolean(field.required) };
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || !field.options.length) throw validationError(`select field ${field.key} needs choices`, 'fields');
      output.options = field.options.map((option) => {
        if (typeof option !== 'string' || !option.trim() || option.length > 120) throw validationError(`select field ${field.key} choices must be short strings`, 'fields');
        return option;
      });
    } else if (field.options !== undefined) {
      throw validationError(`field ${field.key} options are only supported for select fields`, 'fields');
    }
    if (field.help !== undefined) output.help = assertText(field.help, 'help', { max: 300, required: false });
    return output;
  });
}

export function validateContentTypePayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('request body must be an object');
  const allowed = new Set(['slug', 'name', 'description', 'fields']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw validationError('request body contains an unsupported field');
  const result = {};
  if (!partial || body.slug !== undefined) result.slug = assertSlug(body.slug);
  if (!partial || body.name !== undefined) result.name = assertText(body.name, 'name', { max: 120 });
  if (!partial || body.description !== undefined) result.description = assertText(body.description ?? '', 'description', { max: 500, required: false });
  if (!partial || body.fields !== undefined) result.fields = validateContentFields(body.fields ?? []);
  return result;
}

export function validateContentData(data, fields = []) {
  if (data === undefined || data === null) data = {};
  if (typeof data !== 'object' || Array.isArray(data)) throw validationError('content data must be an object', 'data');
  validateJsonShape(data);
  const output = structuredClone(data);
  for (const field of fields) {
    const value = output[field.key];
    const missing = value === undefined || value === null || value === '';
    if (missing) {
      if (field.required) throw validationError(`${field.key} is required`, `data.${field.key}`);
      continue;
    }
    if (field.type === 'tags') {
      if (!Array.isArray(value)) throw validationError(`${field.key} must be a list`, `data.${field.key}`);
      const seen = new Set();
      const tags = [];
      for (const tag of value) {
        if (typeof tag !== 'string') throw validationError(`${field.key} must be a list of tags`, `data.${field.key}`);
        const trimmed = tag.trim();
        if (trimmed && !seen.has(trimmed)) { seen.add(trimmed); tags.push(trimmed); }
      }
      output[field.key] = tags;
      continue;
    }
    if (field.type === 'richtext') {
      output[field.key] = validateBlocks(Array.isArray(value) ? value : []);
      continue;
    }
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw validationError(`${field.key} must be true or false`, `data.${field.key}`);
      continue;
    }
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw validationError(`${field.key} must be a number`, `data.${field.key}`);
      continue;
    }
    if (field.type === 'select') {
      if (!field.options || !field.options.includes(value)) throw validationError(`${field.key} must be one of its choices`, `data.${field.key}`);
      continue;
    }
    if (field.type === 'date') {
      if (typeof value !== 'string' || !DATE_RE.test(value)) throw validationError(`${field.key} must be a date as YYYY-MM-DD`, `data.${field.key}`);
      continue;
    }
    if (field.type === 'url') {
      if (typeof value !== 'string') throw validationError(`${field.key} must be a string`, `data.${field.key}`);
      output[field.key] = assertSafeUrl(value, `data.${field.key}`);
      continue;
    }
    if (field.type === 'image') {
      if (typeof value !== 'string') throw validationError(`${field.key} must be a string`, `data.${field.key}`);
      output[field.key] = assertSafeUrl(value, `data.${field.key}`);
      continue;
    }
    if (typeof value !== 'string') throw validationError(`${field.key} must be a string`, `data.${field.key}`);
    if (value.length > 20000) throw validationError(`${field.key} is too long`, `data.${field.key}`);
  }
  return output;
}

export function validateContentPayload(body, { partial = false, fields = [] } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('request body must be an object');
  const allowed = new Set(['slug', 'title', 'excerpt', 'status', 'sortOrder', 'coverImage', 'blocks', 'data', 'contentType']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw validationError('request body contains an unsupported field');
  const result = {};
  if (!partial || body.slug !== undefined) result.slug = assertSlug(body.slug);
  if (!partial || body.title !== undefined) result.title = assertText(body.title, 'title', { max: 200 });
  if (!partial || body.excerpt !== undefined) result.excerpt = assertText(body.excerpt ?? '', 'excerpt', { max: 1000, required: false });
  if (!partial || body.status !== undefined) {
    const status = body.status ?? 'draft';
    if (!CONTENT_STATUSES.includes(status)) throw validationError('status must be draft, published, or archived', 'status');
    result.status = status;
  }
  if (!partial || body.sortOrder !== undefined) {
    const order = body.sortOrder ?? 0;
    if (!Number.isInteger(order) || order < 0 || order > 100000) throw validationError('sortOrder must be a non-negative integer', 'sortOrder');
    result.sortOrder = order;
  }
  if (!partial || body.coverImage !== undefined) result.coverImage = assertSafeUrl(assertText(body.coverImage ?? '', 'coverImage', { max: 2048, required: false }), 'coverImage');
  if (!partial || body.blocks !== undefined) result.blocks = validateBlocks(body.blocks ?? []);
  if (body.contentType !== undefined) result.contentType = assertSlug(body.contentType, 'contentType');
  if (!partial || body.data !== undefined) result.data = validateContentData(body.data ?? {}, fields);
  return result;
}

export function validateBulkContentPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('request body must be an object');
  const allowed = new Set(['action', 'slugs']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw validationError('request body contains an unsupported field');
  const actions = ['publish', 'unpublish', 'archive', 'delete'];
  if (typeof body.action !== 'string' || !actions.includes(body.action)) throw validationError('action is not supported', 'action');
  if (!Array.isArray(body.slugs) || !body.slugs.length || body.slugs.length > 200) throw validationError('slugs must be a non-empty array of slugs', 'slugs');
  const slugs = body.slugs.map((slug, index) => assertSlug(slug, `slugs[${index}]`));
  return { action: body.action, slugs };
}

export function validatePlacementsPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('request body must be an object');
  const allowed = new Set(['pages']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw validationError('request body contains an unsupported field');
  if (!Array.isArray(body.pages) || body.pages.length > 200) throw validationError('pages must be an array of slugs', 'pages');
  return body.pages.map((slug, index) => assertSlug(slug, `pages[${index}]`));
}

export function validateMediaPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw validationError('request body must be an object');
  const allowed = new Set(['altText']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw validationError('request body contains an unsupported field');
  const result = {};
  if (!partial || body.altText !== undefined) result.altText = assertText(body.altText ?? '', 'altText', { max: 300, required: false });
  return result;
}

export function parseValidationError(error) {
  return error?.field ? { error: error.message, field: error.field } : { error: error?.message || 'Invalid request' };
}
