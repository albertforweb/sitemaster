import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = join(ROOT, 'public', 'admin');
const HARNESS = join(ADMIN, '__harness.html');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || null;
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolvePort(port)); });
  });
}

const CHROME = findChrome();
if (!CHROME) {
  console.log('SKIP  browser harness: no Chrome found (set CHROME_PATH to enable).');
  process.exit(0);
}

const PORT = await freePort();
const now = new Date().toISOString();
const DATA = {
  sites: [{ slug: 'mainsite', name: 'Mainsite', originUrl: 'http://localhost:4000', deployment: { status: 'deployed', path: './deploy' }, settings: { siteName: 'Mainsite', theme: {} } }],
  pages: [{ slug: 'home', title: 'Home', template: 'default', status: 'published', updatedAt: now, blocks: [{ type: 'heading', level: 1, text: 'Welcome' }, { type: 'paragraph', text: 'Hello world' }] }],
  collections: [{ slug: 'article', name: 'Article', total: 1, fields: [{ key: 'summary', label: 'Summary', type: 'text' }, { key: 'body', label: 'Body', type: 'richtext' }] }],
  contentTypes: [{ slug: 'article', name: 'Article', fields: [{ key: 'summary', label: 'Summary', type: 'text' }, { key: 'body', label: 'Body', type: 'richtext' }] }],
  entries: [{ contentType: 'article', slug: 'terms-summary', title: 'Terms summary', status: 'published', sortOrder: 0, updatedAt: now, excerpt: 'A summary', blocks: [], data: { summary: 'A summary', body: [{ type: 'paragraph', text: 'Body copy' }] } }],
  media: [],
};

const STUB = `
window.__calls = [];
window.__consoleErrors = [];
window.addEventListener('error', (e) => window.__consoleErrors.push(e.error && e.error.stack ? e.error.stack : String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__consoleErrors.push(String(e.reason)));
window.fetch = async function (url, opts) {
  window.__calls.push(String(url));
  const u = String(url);
  const send = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj });
  if (u.includes('/api/sites') && !/\\/api\\/sites\\/[^/]+\\//.test(u)) return send({ sites: ${JSON.stringify(DATA.sites)} });
  if (u.includes('/pages')) return send({ pages: ${JSON.stringify(DATA.pages)} });
  if (u.includes('/content-types')) return send({ types: ${JSON.stringify(DATA.contentTypes)} });
  if (u.includes('/content/all')) return send({ entries: ${JSON.stringify(DATA.entries)}, total: 1, pages: 1 });
  if (u.includes('/media')) return send({ media: ${JSON.stringify(DATA.media)} });
  if (u.includes('/content')) return send({ collections: ${JSON.stringify(DATA.collections)} });
  return send({}, 200);
};
`;

let html = readFileSync(join(ADMIN, 'index.html'), 'utf8');
const sandboxIsScriptsOnly = html.includes('sandbox="allow-scripts"');
html = html.replace('<script src="app.js', `<script>${STUB}</script>\n  <script src="app.js`);
html = html.replace('sandbox="allow-scripts"', 'sandbox="allow-scripts allow-same-origin"');
writeFileSync(HARNESS, html, 'utf8');

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    const data = readFileSync(join(ADMIN, url === '/' ? '__harness.html' : url));
    res.writeHead(200, { 'content-type': MIME[extname(url)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const APP_URL = `http://127.0.0.1:${server.address().port}/__harness.html`;

const profile = mkdtempSync(join(tmpdir(), 'sm-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  APP_URL,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome target not available');
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

const checks = [];
const check = (name, cond, detail = '') => checks.push({ name, pass: Boolean(cond), detail });

let ws;
let send;
try {
  const target = await getTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  send = cdp(ws);
  await send('Runtime.enable');
  await send('Page.enable');

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('Eval error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
    return r.result.value;
  };

  await sleep(900);

  const bootErrors = await evaluate(`(window.__consoleErrors||[])`);
  check('no boot errors', bootErrors.length === 0, JSON.stringify(bootErrors));

  const loadingHidden = await evaluate(`document.getElementById('app-loading').classList.contains('hidden')`);
  const workspaceVisible = await evaluate(`!document.getElementById('workspace').classList.contains('hidden')`);
  const authHidden = await evaluate(`document.getElementById('auth-view').classList.contains('hidden')`);
  check('loading layer removed after auth', loadingHidden);
  check('workspace revealed after auth', workspaceVisible);
  check('auth view stays hidden when logged in', authHidden);

  await evaluate(`document.querySelector('[data-view="pages"]').click()`);
  await sleep(300);
  check('pages view active', await evaluate(`document.getElementById('view-pages').classList.contains('active-view')`));
  check('navigation records the active view in the URL hash', await evaluate(`location.hash === '#/pages'`));
  check('a hash change switches the active view', await evaluate(`(function(){location.hash='#/dashboard';window.dispatchEvent(new Event('hashchange'));return document.getElementById('view-dashboard').classList.contains('active-view');})()`));
  await evaluate(`(function(){location.hash='#/pages';window.dispatchEvent(new Event('hashchange'));})()`);
  await sleep(150);
  check('pages view restored after hash round-trip', await evaluate(`document.getElementById('view-pages').classList.contains('active-view')`));

  check('merged list shows a page row', await evaluate(`!!document.querySelector('#view-pages [data-page-edit]')`));
  check('merged list shows a content row', await evaluate(`!!document.querySelector('#view-pages [data-content-edit]')`));
  check('page row shows Page type badge', await evaluate(`!!document.querySelector('#view-pages .type-badge.type-page')`));
  check('entry row shows its type badge', await evaluate(`!!document.querySelector('#view-pages .type-badge.type-article')`));
  check('type filter offers Pages', await evaluate(`Array.from(document.querySelectorAll('#content-type-filter option')).some(o=>o.value==='page')`));
  check('no separate Content nav item', await evaluate(`!document.querySelector('.nav-item[data-view="content"]')`));

  await evaluate(`document.querySelector('#view-pages [data-content-edit]').click()`);
  await sleep(400);
  check('content editor opens from merged list', await evaluate(`document.getElementById('view-designer').classList.contains('active-view') && !document.getElementById('content-schema-fields').classList.contains('hidden')`));
  const dbg = await evaluate(`(function(){var s=document.getElementById('visual-preview').srcdoc||'';return {hasPreview:/entry-preview/.test(s),hasTitle:/Terms summary/.test(s),hasLabel:/Summary/.test(s),hasValue:/A summary/.test(s),editableTitle:/data-sitemaster-field="__title"/.test(s),editableField:/data-sitemaster-field="summary"/.test(s),fieldHandler:/action:'field'/.test(s)};})()`);
  check('content canvas renders inline-editable field preview', dbg.hasPreview && dbg.hasTitle && dbg.hasLabel && dbg.hasValue && dbg.editableTitle && dbg.editableField && dbg.fieldHandler, JSON.stringify(dbg));
  await evaluate(`document.getElementById('back-to-pages').click()`);
  await sleep(400);

  await evaluate(`document.querySelector('#view-pages [data-page-edit]').click()`);
  await sleep(500);
  check('designer view active', await evaluate(`document.getElementById('view-designer').classList.contains('active-view')`));
  const canvasHint = await evaluate(`document.querySelector('#designer-visual .canvas-toolbar .toolbar-hint')?.textContent.trim()`);
  check('canvas advertises inline editing (not preview-only)', /edit/i.test(canvasHint) && !/preview only/i.test(canvasHint), canvasHint);
  const buttons = await evaluate(`Array.from(document.querySelectorAll('#designer-tool-buttons [data-tool-button]')).map(b=>b.dataset.toolButton).join(',')`);
  check('toolbar exposes layers,components,properties', buttons === 'layers,components,properties', buttons);
  check('layers + components dock to the left (pinned)', await evaluate(`document.querySelectorAll('#designer-dock-left .dock-stack .designer-tool-window').length`) === 2);
  check('stacked tool windows expose a resize splitter', await evaluate(`document.querySelectorAll('#designer-dock-left .dock-stack > .tw-splitter').length`) === 1);
  check('stack divider is visible without hover', await evaluate(`(function(){var s=document.querySelector('#designer-dock-left .dock-stack > .tw-splitter');return !!s && getComputedStyle(s).backgroundColor !== 'rgba(0, 0, 0, 0)';})()`));
  check('dock/canvas divider is present and visible', await evaluate(`(function(){var b=document.querySelector('#designer-dock-left .dock-resizer');if(!b)return false;var cs=getComputedStyle(b);return cs.cursor==='col-resize' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';})()`));
  check('dragging the dock divider resizes the tool window column', await evaluate(`(function(){var bar=document.querySelector('#designer-dock-left .dock-resizer');if(!bar)return false;var stack=document.querySelector('#designer-dock-left .dock-stack');var before=stack.getBoundingClientRect().width;var x=bar.getBoundingClientRect().left+2;bar.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:x}));window.dispatchEvent(new MouseEvent('pointermove',{bubbles:true,clientX:x+50}));window.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientX:x+50}));return stack.getBoundingClientRect().width-before>30;}())`));
  check('component buttons keep their size when the dock resizes', await evaluate(`(function(){var btn=document.querySelector('#designer-dock-left .designer-tool-window[data-tool-window="components"] .palette-button');if(!btn)return false;var before=btn.getBoundingClientRect().width;var bar=document.querySelector('#designer-dock-left .dock-resizer');var x=bar.getBoundingClientRect().left+2;bar.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientX:x}));window.dispatchEvent(new MouseEvent('pointermove',{bubbles:true,clientX:x+140}));window.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientX:x+140}));return Math.abs(btn.getBoundingClientRect().width-before)<1.5;}())`));
  check('dragging the splitter resizes the stacked windows', await evaluate(`(function(){var bar=document.querySelector('#designer-dock-left .dock-stack > .tw-splitter');if(!bar)return false;var wins=[].slice.call(document.querySelectorAll('#designer-dock-left .dock-stack > .designer-tool-window'));var before=wins.map(function(w){return w.getBoundingClientRect().height;});var y=bar.getBoundingClientRect().top+2;bar.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientY:y}));window.dispatchEvent(new MouseEvent('pointermove',{bubbles:true,clientY:y+40}));window.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,clientY:y+40}));var after=wins.map(function(w){return w.getBoundingClientRect().height;});return after[0]-before[0]>20 && before[1]-after[1]>20;}())`));
  check('properties docks to the right', await evaluate(`!!document.querySelector('#designer-dock-right .dock-stack .designer-tool-window[data-tool-window="properties"]')`));
  check('layers tree inside layers window', await evaluate(`!!document.querySelector('#designer-dock-left .designer-tool-window[data-tool-window="layers"] #page-tree')`));
  const shells = await evaluate(`Array.from(document.querySelectorAll('#page-tree [data-select-shell] strong')).map(n=>n.textContent.trim())`);
  check('layers tree shows Header, Main, and Footer as sibling shells', Array.isArray(shells) && shells.join(',') === 'Header,Main content,Footer', JSON.stringify(shells));
  const templateChildren = await evaluate(`Array.from(document.querySelectorAll('#page-tree [data-select-shell-child] strong')).map(n=>n.textContent.trim())`);
  check('header/footer expose template child nodes', Array.isArray(templateChildren) && templateChildren.join(',') === 'Logo,Site name,Site name,Footer note', JSON.stringify(templateChildren));
  await evaluate(`document.querySelector('#page-tree [data-select-shell-child="header.logo"]').click()`);
  check('selecting a template child reveals site-branding fields', await evaluate(`!!document.getElementById('selected-element-fields').querySelector('[data-branding-field="logoText"]') && !!document.getElementById('selected-element-fields').querySelector('[data-branding-field="logoUrl"]')`));
  check('page elements nest under Main content (not flat siblings)', await evaluate(`!!document.querySelector('#page-tree .tree-shell-main .tree-children [data-select-path]:not([data-select-path="page"])') && !document.querySelector('#page-tree > .tree-children > .tree-entry [data-select-path]')`));
  check('component palette inside components window', await evaluate(`!!document.querySelector('#designer-dock-left .designer-tool-window[data-tool-window="components"] #canvas-element-toolbar')`));
  check('designer has no media tool window (moved to top-level view)', await evaluate(`!document.querySelector('#designer-dock-left .designer-tool-window[data-tool-window="assets"]') && !document.querySelector('#designer-tool-buttons [data-tool-button="assets"]')`));

  await evaluate(`document.querySelector('#designer-dock-right .designer-tool-window[data-tool-window="properties"] .tw-dock').click()`);
  await sleep(250);
  check('dock button flips a window to the other edge', await evaluate(`!!document.querySelector('#designer-dock-left .designer-tool-window[data-tool-window="properties"]') && !document.querySelector('#designer-dock-right .designer-tool-window')`));
  check('layers window remains after dock moves', await evaluate(`!!document.querySelector('.designer-tool-window[data-tool-window="layers"] #page-tree')`));

  await evaluate(`document.querySelector('.designer-tool-window[data-tool-window="layers"] [data-select-path]:not([data-select-path="page"])').click()`);
  await sleep(300);
  check('selecting a layer reveals element fields in Properties', await evaluate(`!document.getElementById('element-inspector').classList.contains('hidden') && document.getElementById('selected-element-fields').children.length > 0`));
  check('Properties groups HTML and CSS into accordion sections', await evaluate(`(function(){var t=document.getElementById('properties-mode-tabs');var groups=document.querySelectorAll('#element-inspector details.inspector-group');return !t && groups.length>=2;})()`));
  check('style and content panes are both visible in the accordion', await evaluate(`!document.getElementById('selected-style-fields').hidden && !document.getElementById('selected-element-fields').hidden`));
  check('selected element shows layout fields in the CSS pane', await evaluate(`!!document.getElementById('selected-style-fields').querySelector('[data-block-style]')`));
  check('element properties expose per-edge box inputs', await evaluate(`(function(){var f=document.getElementById('selected-style-fields');return !!f.querySelector('[data-block-style="paddingTop"]') && !!f.querySelector('[data-block-style="paddingLeft"]') && !!f.querySelector('[data-block-style="marginRight"]') && !!f.querySelector('[data-block-style="borderTopWidth"]') && !!f.querySelector('[data-block-style="borderLeftColor"]');})()`));
  await evaluate(`(function(){var i=document.getElementById('selected-style-fields').querySelector('[data-block-style="paddingLeft"]');i.value='18px';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(300);
  check('editing one box edge applies only that edge', await evaluate(`document.getElementById('visual-preview').srcdoc.includes('padding-left:18px')`));
  check('element inspector exposes typography, flex, and effect style groups', await evaluate(`(function(){var f=document.getElementById('selected-style-fields');return !!f.querySelector('[data-block-style="fontFamily"]') && !!f.querySelector('[data-block-style="lineHeight"]') && !!f.querySelector('[data-block-style="flexDirection"]') && !!f.querySelector('[data-block-style="justifyContent"]') && !!f.querySelector('[data-block-style="position"]') && !!f.querySelector('[data-block-style="boxShadow"]') && !!f.querySelector('[data-block-style="maxWidth"]');})()`));
  check('content and attribute pane stays visible alongside styles', await evaluate(`!document.getElementById('selected-element-fields').hidden`));
  check('element inspector exposes context-aware HTML attribute fields', await evaluate(`(function(){var f=document.getElementById('selected-element-fields');return !!f.querySelector('[data-attr-ctx="id"]') && !!f.querySelector('[data-attr-ctx="class"]') && !!f.querySelector('[data-attr-ctx="title"]');})()`));
  await evaluate(`(function(){var i=document.getElementById('selected-element-fields').querySelector('[data-attr-ctx="id"]');i.value='welcome-block';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(300);
  check('context attribute writes to the canvas element', await evaluate(`document.getElementById('visual-preview').srcdoc.includes('id="welcome-block"')`));
  check('page settings hide when an element is selected', await evaluate(`document.querySelector('.properties-panel .inspector-fields').classList.contains('hidden')`));
  check('properties panel has a single outer scroll container', await evaluate(`(function(){var p=document.querySelector('.tw-body > .properties-panel');var b=document.querySelector('[data-tool-window="properties"] .tw-body');return p && b && getComputedStyle(p).overflow === 'visible' && getComputedStyle(b).overflow === 'auto';})()`));
  check('properties controls do not overflow at minimum width', await evaluate(`(function(){var win=document.querySelector('.designer-tool-window[data-tool-window="properties"]');if(!win)return false;var stack=win.closest('.dock-stack');stack.style.flex='0 0 auto';stack.style.width='220px';var body=win.querySelector('.tw-body');var panel=win.querySelector('.properties-panel');var grid=win.querySelector('.box-grid');var single=!grid||getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length===1;return single && body.scrollWidth<=body.clientWidth+2 && panel.scrollWidth<=panel.clientWidth+2;})()`));

  await evaluate(`document.querySelector('#page-tree [data-select-path="page"]').click()`);
  await sleep(250);
  check('page settings show when the page itself is selected', await evaluate(`!document.querySelector('.properties-panel .inspector-fields').classList.contains('hidden')`));

  await evaluate(`document.querySelector('[data-select-shell-child="header.name"]').click()`);
  await sleep(200);
  check('selecting a template child reveals style controls', await evaluate(`!!document.getElementById('selected-style-fields').querySelector('[data-branding-style]')`));
  await evaluate(`document.querySelector('[data-select-shell="main"]').click()`);
  await sleep(200);
  check('selecting the main content area reveals container appearance controls', await evaluate(`!!document.getElementById('selected-style-fields').querySelector('[data-shell-style]')`));
  check('selecting a container shell never leaves the style pane blank', await evaluate(`document.getElementById('selected-style-fields').textContent.trim().length > 0`));

  await evaluate(`document.querySelector('.designer-tool-window[data-tool-window="layers"] [data-select-path]:not([data-select-path="page"])').click()`);
  await sleep(250);
  check('selected element exposes an HTML attributes editor', await evaluate(`!!document.getElementById('selected-element-fields').querySelector('[data-attr-add]')`));
  await evaluate(`document.getElementById('selected-element-fields').querySelector('[data-attr-add]').click()`);
  await sleep(200);
  await evaluate(`(() => { const input = document.getElementById('selected-element-fields').querySelector('[data-attr-name]'); input.value = 'data-test'; input.dispatchEvent(new Event('input', { bubbles: true })); const value = document.getElementById('selected-element-fields').querySelector('[data-attr-value]'); value.value = 'yes'; value.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(200);
  check('custom attribute is rendered on the canvas element', await evaluate(`document.getElementById('visual-preview').srcdoc.includes('data-test="yes"')`));
  check('design canvas uses a white artboard', await evaluate(`document.getElementById('visual-preview').srcdoc.includes('--bg:#ffffff') && document.getElementById('visual-preview').srcdoc.includes('--text:#1f2937')`));
  check('designer tabs sit below the editor surface', await evaluate(`(function(){var t=document.querySelector('.designer-tabs').getBoundingClientRect();var v=document.getElementById('designer-visual').getBoundingClientRect();return t.top >= v.bottom - 2;})()`));

  const beforeSwitch = await evaluate(`({len:(document.getElementById('visual-preview').srcdoc||'').length,blocks:(document.getElementById('visual-preview').srcdoc||'').includes('data-sitemaster-block')})`);
  await evaluate(`document.querySelector('[data-editor-tab="code"]').click()`); await sleep(250);
  check('HTML & CSS tab shows the code editor', await evaluate(`!document.getElementById('designer-code').classList.contains('hidden') && document.getElementById('custom-html')?.value !== undefined`));
  check('HTML & CSS tab pre-fills clean generated page markup', await evaluate(`(function(){var v=document.getElementById('custom-html').value;return v.trim().length>0 && v.includes('<') && !v.includes('data-sitemaster-') && !v.includes('contenteditable');})()`));
  await evaluate(`document.querySelector('[data-editor-tab="script"]').click()`); await sleep(250);
  check('JavaScript tab shows the script editor', await evaluate(`!document.getElementById('designer-script').classList.contains('hidden')`));
  await evaluate(`document.querySelector('[data-editor-tab="visual"]').click()`); await sleep(500);
  const afterSwitch = await evaluate(`({hidden:document.getElementById('designer-visual').classList.contains('hidden'),len:(document.getElementById('visual-preview').srcdoc||'').length,blocks:(document.getElementById('visual-preview').srcdoc||'').includes('data-sitemaster-block'),frameH:document.querySelector('.canvas-frame')?.offsetHeight||0,iframeH:document.getElementById('visual-preview').offsetHeight||0,visualH:document.getElementById('designer-visual').offsetHeight||0})`);
  check('canvas still renders after switching back to Visual canvas', afterSwitch.hidden === false && afterSwitch.blocks === beforeSwitch.blocks && afterSwitch.len >= beforeSwitch.len, JSON.stringify({ beforeSwitch, afterSwitch }));

  await evaluate(`document.querySelector('#page-tree [data-select-path="page"]').click()`); await sleep(200);
  await evaluate(`document.querySelector('[data-add-html="h3"]').click()`); await sleep(500);
  const h3Info = await evaluate(`(function(){var d=document.getElementById('visual-preview').contentDocument;var h=d&&d.querySelector('h3[data-sitemaster-block]');return h?{editable:h.getAttribute('contenteditable'),placeholder:!!h.querySelector('.canvas-placeholder')}:{none:true};})()`);
  check('a new H3 element renders as an editable block', h3Info.editable === 'true' && h3Info.placeholder === true, JSON.stringify(h3Info));

  const lenBeforeClick = await evaluate(`(document.getElementById('visual-preview').srcdoc||'').length`);
  await evaluate(`(function(){document.getElementById('visual-preview').contentDocument.querySelector('h3[data-sitemaster-block]').click();})()`);
  await sleep(250);
  const selectState = await evaluate(`(function(){var f=document.getElementById('visual-preview');var d=f.contentDocument;var h=d.querySelector('h3[data-sitemaster-block]');return {len:(f.srcdoc||'').length,outlined:h.getAttribute('data-sitemaster-selected')};})()`);
  check('selecting a block on the canvas does not reload the canvas', selectState.len === lenBeforeClick && selectState.outlined === 'true', JSON.stringify({ lenBeforeClick, selectState }));

  await evaluate(`(function(){document.getElementById('visual-preview').contentDocument.querySelector('h3[data-sitemaster-block]').focus();})()`);
  await send('Input.insertText', { text: 'Hello' });
  await sleep(400);
  const typed = await evaluate(`(function(){var h=document.getElementById('visual-preview').contentDocument.querySelector('h3[data-sitemaster-block]');return {text:h.innerText.trim(),placeholder:!!h.querySelector('.canvas-placeholder')};})()`);
  check('typing into a focused element replaces the placeholder', typed.text === 'Hello' && typed.placeholder === false, JSON.stringify(typed));
  check('canvas iframe stays sandboxed to scripts only', sandboxIsScriptsOnly);

  await evaluate(`document.querySelector('#page-tree [data-select-path="page"]').click()`);
  await sleep(200);
  await evaluate(`document.querySelector('#canvas-element-toolbar [data-add-html="section"]').click()`);
  await sleep(300);
  await evaluate(`document.querySelector('#page-tree [data-select-path="page"]').click()`);
  await sleep(200);
  await evaluate(`document.querySelector('#canvas-element-toolbar [data-add-html="p"]').click()`);
  await sleep(300);
  const layersToolbar = `document.querySelector('#layers-toolbar')`;
  check('layers toolbar exposes move controls', await evaluate(`(function(){var t=${layersToolbar};return !!t && !!t.querySelector('[data-layer-op="up"]') && !!t.querySelector('[data-layer-op="down"]') && !!t.querySelector('[data-layer-op="in"]') && !!t.querySelector('[data-layer-op="out"]');})()`));
  const rootLabels = () => evaluate(`Array.from(document.querySelectorAll('#page-tree .tree-shell-main > .tree-children > .tree-entry > .tree-node-row > .tree-node strong')).map(n=>n.textContent.trim())`);
  const labelsBefore = await rootLabels();
  await evaluate(`${layersToolbar}.querySelector('[data-layer-op="up"]').click()`);
  await sleep(300);
  const labelsAfterUp = await rootLabels();
  check('move-up reorders a layer among its siblings', labelsBefore.length === labelsAfterUp.length && labelsBefore[labelsBefore.length - 1] === labelsAfterUp[labelsAfterUp.length - 2] && labelsBefore[labelsBefore.length - 2] === labelsAfterUp[labelsAfterUp.length - 1], JSON.stringify({ labelsBefore, labelsAfterUp }));
  await evaluate(`${layersToolbar}.querySelector('[data-layer-op="in"]').click()`);
  await sleep(300);
  const labelsAfterIn = await rootLabels();
  check('move-in nests a layer into its previous sibling', labelsAfterIn.length === labelsAfterUp.length - 1, JSON.stringify({ labelsAfterUp, labelsAfterIn }));
  await evaluate(`${layersToolbar}.querySelector('[data-layer-op="out"]').click()`);
  await sleep(300);
  const labelsAfterOut = await rootLabels();
  check('move-out returns a nested layer to its parent', labelsAfterOut.length === labelsAfterIn.length + 1, JSON.stringify({ labelsAfterIn, labelsAfterOut }));
  const selectionBox = await evaluate(`(function(){var d=document.getElementById('visual-preview').contentDocument;if(!d)return {found:false};var el=d.querySelector('[data-sitemaster-selected="true"]');if(!el)return {found:false};var cs=d.defaultView.getComputedStyle(el);return {found:true,style:cs.outlineStyle,width:cs.outlineWidth};})()`);
  check('selected element shows a bounding box on the canvas', selectionBox.found && selectionBox.style !== 'none' && selectionBox.width !== '0px', JSON.stringify(selectionBox));

  const dndResult = await evaluate(`(function(){
    var all = Array.from(document.querySelectorAll('#page-tree [data-tree-path]'));
    var src = all.filter(function(n){ return n.getAttribute('data-block-type') === 'html_element' && n.getAttribute('data-block-tag') === 'p'; })[0];
    var dst = all.filter(function(n){ return n.getAttribute('data-block-type') === 'html_element' && n.getAttribute('data-block-tag') === 'section'; })[0];
    if (!src || !dst) return { error: 'nodes', types: all.map(function(n){ return (n.getAttribute('data-block-type') || '?') + ':' + (n.getAttribute('data-block-tag') || '?'); }) };
    var s = src.getBoundingClientRect();
    var d = dst.getBoundingClientRect();
    src.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: s.left + 5, clientY: s.top + s.height / 2 }));
    dst.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: d.left + 5, clientY: d.top + d.height / 2 }));
    dst.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: d.left + 5, clientY: d.top + d.height / 2 }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { source: src.getAttribute('data-block-tag'), target: dst.getAttribute('data-block-tag') };
  })()`);
  await sleep(300);
  const labelsAfterDnd = await rootLabels();
  const nestedAfterDnd = await evaluate(`(function(){var sec=document.querySelector('#page-tree [data-block-type="html_element"][data-block-tag="section"]');if(!sec)return false;var entry=sec.closest('.tree-entry');return !!entry && !!entry.querySelector('.tree-children [data-block-type="html_element"][data-block-tag="p"]');})()`);
  check('dragging a layer onto a container nests it', nestedAfterDnd && labelsAfterDnd.includes('section'), JSON.stringify({ labelsAfterOut, labelsAfterDnd, dndResult }));

  const chrome = await evaluate(`(function(){var d=document.getElementById('visual-preview').contentDocument;if(!d)return {};var dim=d.querySelector('.sm-label .sm-dim');var sc=d.querySelectorAll('script');return {toolbar:!!d.querySelector('.sm-toolbar [data-sm-op="duplicate"]'),label:!!d.querySelector('.sm-label'),bands:d.querySelectorAll('.sm-band').length,dim:dim?dim.textContent:'',hasChrome:!!d.querySelector('[data-sm-chrome]'),marked:!!d.querySelector('[data-sitemaster-selected="true"]'),selCount:d.querySelectorAll('[data-sitemaster-selected="true"]').length,ready:d.readyState,scripts:sc.length,lastScript:(sc[sc.length-1]?sc[sc.length-1].textContent.slice(0,30):'')};})()`);
  check('canvas renders an element toolbar and box-model overlay', chrome.toolbar && chrome.label && chrome.bands >= 8, JSON.stringify(chrome));
  check('canvas renders a live dimension badge', /\d+\u00d7\d+/.test(chrome.dim || ''), JSON.stringify({ dim: chrome.dim }));
  const entryCount = () => evaluate(`document.querySelectorAll('#page-tree [data-select-path]').length`);
  const entriesBeforeDup = await entryCount();
  await evaluate(`document.getElementById('visual-preview').contentDocument.querySelector('.sm-toolbar [data-sm-op="duplicate"]').click()`);
  await sleep(300);
  const entriesAfterDup = await entryCount();
  check('canvas element toolbar duplicates the selected block', entriesAfterDup === entriesBeforeDup + 1, JSON.stringify({ entriesBeforeDup, entriesAfterDup }));
  await evaluate(`(function(){var w=document.getElementById('visual-preview').contentWindow;window.dispatchEvent(new MessageEvent('message',{data:{source:'sitemaster-canvas',action:'drag-move',from:'2',to:'3',zone:'inside'},source:w}));})()`);
  await sleep(300);
  const labelsAfterCanvasDrag = await rootLabels();
  check('canvas drag nests a block into its drop target', !labelsAfterCanvasDrag.includes('h3') && labelsAfterCanvasDrag.includes('section'), JSON.stringify({ labelsAfterCanvasDrag }));

  await evaluate(`document.querySelector('#page-tree [data-select-shell="main"]').click()`);
  await sleep(300);
  const shellChrome = await evaluate(`(function(){var d=document.getElementById('visual-preview').contentDocument;var l=d.querySelector('.sm-label');var t=d.querySelector('.sm-toolbar');return {label:l?l.textContent:'',toolbar:t?getComputedStyle(t).display:'',shellSel:d.querySelectorAll('[data-sitemaster-shell-selected="true"]').length};})()`);
  check('selecting Main content shows a bounding-box label on the canvas', shellChrome.label.indexOf('Main content') >= 0 && shellChrome.shellSel === 1, JSON.stringify(shellChrome));
  check('shell containers hide the block-only toolbar', shellChrome.toolbar === 'none', JSON.stringify(shellChrome));
  await evaluate(`document.querySelector('#page-tree [data-select-shell-child="header.logo"]').click()`);
  await sleep(300);
  const childChrome = await evaluate(`(function(){var d=document.getElementById('visual-preview').contentDocument;var l=d.querySelector('.sm-label');return {label:l?l.textContent:'',childSel:d.querySelectorAll('[data-sitemaster-shell-child-selected="true"]').length};})()`);
  check('selecting a header child shows a bounding-box label on the canvas', childChrome.label.indexOf('Logo') >= 0 && childChrome.childSel === 1, JSON.stringify(childChrome));

  const headerTokenOrder = () => evaluate(`Array.from(document.querySelectorAll('#page-tree [data-select-shell="header"] + .tree-children [data-tree-token]')).map(n => n.dataset.treeToken)`);
  const orderBefore = await headerTokenOrder();
  await evaluate(`document.querySelector('#page-tree [data-tree-token="header:branding:name"]').click()`);
  await sleep(150);
  check('selecting a header branding child enables layer reordering', await evaluate(`!document.querySelector('#layers-toolbar [data-layer-op="up"]').disabled`));
  await evaluate(`document.querySelector('#layers-toolbar [data-layer-op="up"]').click()`);
  await sleep(250);
  const orderAfter = await headerTokenOrder();
  check('moving a header child up reorders it above its sibling', orderAfter.indexOf('header:branding:name') < orderAfter.indexOf('header:branding:logo') && orderBefore.indexOf('header:branding:logo') < orderBefore.indexOf('header:branding:name'), JSON.stringify({ orderBefore, orderAfter }));
  check('reordering a header child updates the canvas order', await evaluate(`document.getElementById('visual-preview').srcdoc.indexOf('data-sitemaster-shell-child="header.name"') < document.getElementById('visual-preview').srcdoc.indexOf('data-sitemaster-shell-child="header.logo"')`));
  await evaluate(`document.querySelector('#layers-toolbar [data-layer-op="down"]').click()`);
  await sleep(250);

  await evaluate(`document.querySelector('#page-tree [data-select-shell="header"]').click()`);
  await sleep(200);
  await evaluate(`document.querySelector('#canvas-element-toolbar [data-add-html="section"]').click()`);
  await sleep(300);
  check('adding an element while a shell is selected creates a header block', await evaluate(`!!document.querySelector('#page-tree [data-select-path="header:0"]')`));
  check('shell block renders inside the header on the canvas', await evaluate(`document.getElementById('visual-preview').srcdoc.includes('data-sitemaster-block="header:0"')`));
  await evaluate(`document.querySelector('#page-tree [data-select-path="header:0"]').click()`);
  await sleep(200);
  check('selecting a shell block reveals its element inspector', await evaluate(`!document.getElementById('element-inspector').classList.contains('hidden') && document.getElementById('selected-element-fields').children.length > 0`));
  await evaluate(`document.querySelector('#layers-toolbar [data-layer-op="delete"]').click()`);
  await sleep(200);
  check('deleting a shell block removes it from the header', await evaluate(`!document.querySelector('#page-tree [data-select-path="header:0"]') && !document.getElementById('visual-preview').srcdoc.includes('data-sitemaster-block="header:0"')`));

  check('layers toolbar stays fixed above a scrollable tree', await evaluate(`(function(){
    var win = document.querySelector('.designer-tool-window[data-tool-window="layers"]');
    var toolbar = document.getElementById('layers-toolbar');
    var tree = document.getElementById('page-tree');
    if (!win || !toolbar || !tree) return false;
    var body = win.querySelector('.tw-body');
    return getComputedStyle(body).overflow === 'hidden' && getComputedStyle(tree).overflowY === 'auto' && (toolbar.compareDocumentPosition(tree) & 4) === 4;
  })()`));

  const layersScroll = await evaluate(`(function(){
    var tree = document.getElementById('page-tree');
    if (!tree) return { error: 'tree' };
    tree.style.flex = '0 0 auto';
    tree.style.height = '64px';
    tree.scrollTop = Math.min(40, Math.max(0, tree.scrollHeight - tree.clientHeight));
    var before = tree.scrollTop;
    if (before <= 0) { tree.style.height = ''; tree.style.flex = ''; return { error: 'no-scroll', scrollHeight: tree.scrollHeight, clientHeight: tree.clientHeight }; }
    var nodes = document.querySelectorAll('#page-tree [data-select-path]:not([data-select-path="page"])');
    var target = nodes[nodes.length - 1];
    if (!target) { tree.style.height = ''; tree.style.flex = ''; return { error: 'no-node' }; }
    target.click();
    var after = tree.scrollTop;
    tree.style.height = ''; tree.style.flex = '';
    return { before: before, after: after };
  })()`);
  check('selecting a layer keeps the layers scroll position', layersScroll.before > 0 && layersScroll.after === layersScroll.before, JSON.stringify(layersScroll));

  await evaluate(`document.querySelector('[data-view="media"]').click()`);
  await sleep(300);
  check('media library is a top-level view with a grid', await evaluate(`document.getElementById('view-media').classList.contains('active-view') && !!document.getElementById('media-library-grid')`));
  check('media library view offers an upload control', await evaluate(`!!document.getElementById('media-upload-page')`));

  const consoleErrors = await evaluate(`(window.__consoleErrors||[])`);
  check('no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors));
} catch (error) {
  check('harness exception', false, error.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  server.close();
  await sleep(200);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  try { rmSync(HARNESS, { force: true }); } catch {}
}

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed += 1;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  :: ' + c.detail : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
