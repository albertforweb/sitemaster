import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSlug, validateBlocks, validatePagePayload, validateSettings, validateSiteUrl } from '../src/validation.js';

test('validates safe page and theme payloads', () => {
  assert.equal(assertSlug('about-us'), 'about-us');
  assert.deepEqual(validateSettings({
    siteName: 'Example', logoText: 'E', logoUrl: '/assets/logo.svg', fontFamily: 'system-ui',
    theme: { backgroundColor: '#ffffff', accentColor: null },
  }).siteName, 'Example');
  assert.equal(validatePagePayload({ slug: 'home', title: 'Home', blocks: [{ type: 'heading', text: 'Hello' }] }).title, 'Home');
});

test('validates visual layout and trusted page code fields', () => {
  const page = validatePagePayload({
    slug: 'dynamic',
    title: 'Dynamic page',
    blocks: [],
    metadata: {
      layout: { template: 'standard-2', showTopbar: true, showFooter: true, showLogo: false, contentWidth: 'wide', columns: 2 },
      customHtml: '<section data-content></section>',
      customCss: '[data-content] { min-height: 10rem; }',
      customScript: "document.querySelector('[data-content]').textContent = 'Loaded';",
    },
  });
  assert.equal(page.metadata.layout.contentWidth, 'wide');
  assert.equal(page.metadata.layout.template, 'standard-2');
  assert.equal(page.metadata.layout.columns, 2);
  assert.match(page.metadata.customScript, /Loaded/);
});

test('validates nested visual elements and their appearance settings', () => {
  const page = validatePagePayload({
    slug: 'nested',
    title: 'Nested page',
    blocks: [{
      id: 'section-1',
      type: 'section',
      style: { backgroundColor: '#112233', padding: '24px' },
      children: [{ id: 'heading-1', type: 'heading', level: 2, text: 'Nested heading' }],
    }],
  });

  assert.equal(page.blocks[0].children[0].text, 'Nested heading');
  assert.equal(page.blocks[0].style.padding, '24px');
});

test('validates the HTML palette and reusable component blocks', () => {
  const page = validatePagePayload({
    slug: 'elements',
    title: 'Elements',
    blocks: [
      { type: 'html_element', data: { tag: 'section' }, children: [{ type: 'html_element', data: { tag: 'button' }, text: 'Continue' }] },
      { type: 'navbar', text: 'Brand' },
      { type: 'stats', children: [] },
    ],
  });

  assert.equal(page.blocks[0].data.tag, 'section');
  assert.equal(page.blocks[1].type, 'navbar');
  assert.throws(() => validateBlocks([{ type: 'html_element', data: { tag: 'script' } }]));
});

test('rejects unsafe identifiers, URLs, and block types', () => {
  assert.throws(() => assertSlug('../users'));
  assert.throws(() => validateSettings({
    siteName: 'Example', logoText: 'E', logoUrl: 'javascript:alert(1)', fontFamily: 'system-ui', theme: {},
  }));
  assert.throws(() => validateBlocks([{ type: 'html', data: '<script>alert(1)</script>' }]));
  assert.throws(() => validateSettings({ siteName: 'Example', logoText: 'E', logoUrl: '', fontFamily: '</style><script>alert(1)</script>', theme: {} }));
});

test('rejects prototype-pollution keys in content data', () => {
  assert.throws(() => validatePagePayload({
    slug: 'home', title: 'Home', blocks: [{ type: 'paragraph', data: { constructor: 'bad' } }],
  }));
});

test('limits site import registration to approved local origins', () => {
  assert.equal(validateSiteUrl('http://localhost:8080'), 'http://localhost:8080');
  assert.throws(() => validateSiteUrl('https://example.com'));
  assert.throws(() => validateSiteUrl('http://localhost:8080/?url=https://example.com'));
});
