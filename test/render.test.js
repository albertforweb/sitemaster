import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSite } from '../src/render.js';

test('renders selected multi-column layout with header and footer', () => {
  const html = renderSite({
    name: 'Demo',
    settings: { siteName: 'Demo site', theme: {} },
  }, {
    title: 'Home',
    blocks: [
      { type: 'heading', text: 'Primary', level: 1, data: { column: 1 } },
      { type: 'paragraph', text: 'Secondary', data: { column: 2 } },
    ],
    metadata: { layout: { template: 'standard-2', columns: 2, showTopbar: true, showFooter: true } },
  });

  assert.match(html, /class="page-columns columns-2(?: layout-[^"]+)?"/);
  assert.match(html, /class="site-topbar"/);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /Primary/);
  assert.match(html, /Secondary/);
});

test('renders a blank single-column layout without chrome', () => {
  const html = renderSite({ name: 'Demo', settings: { siteName: 'Demo', theme: {} } }, {
    title: 'Blank',
    blocks: [{ type: 'paragraph', text: 'Content' }],
    metadata: { layout: { template: 'blank-1' } },
  });

  assert.doesNotMatch(html, /class="site-topbar"/);
  assert.doesNotMatch(html, /class="site-footer"/);
  assert.match(html, /class="page-columns columns-1(?: layout-[^"]+)?"/);
});

test('renders nested visual elements with safe appearance styles', () => {
  const html = renderSite({ name: 'Demo', settings: { siteName: 'Demo', theme: {} } }, {
    title: 'Nested',
    blocks: [{
      type: 'section',
      style: { backgroundColor: '#112233', padding: '24px', color: '#ffffff' },
      children: [
        { type: 'heading', level: 2, text: 'Nested heading' },
        { type: 'paragraph', text: 'Nested paragraph', style: { fontSize: '18px', textAlign: 'center' } },
      ],
    }],
  });

  assert.match(html, /<section style="color:#ffffff;background-color:#112233;padding:24px">/);
  assert.match(html, /<h2>Nested heading<\/h2>/);
  assert.match(html, /<p style="font-size:18px;text-align:center">Nested paragraph<\/p>/);
});

test('renders generic HTML elements and reusable components', () => {
  const html = renderSite({ name: 'Demo', settings: { siteName: 'Demo', theme: {} } }, {
    title: 'Components',
    blocks: [
      { type: 'html_element', data: { tag: 'section' }, children: [{ type: 'html_element', data: { tag: 'h2' }, text: 'HTML heading' }] },
      { type: 'navbar', text: 'Demo brand' },
      { type: 'accordion', text: 'Details' },
    ],
  });

  assert.match(html, /<section><h2>HTML heading<\/h2><\/section>/);
  assert.match(html, /class="component-navbar"/);
  assert.match(html, /class="component-accordion"/);
});
