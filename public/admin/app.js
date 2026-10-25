(function () {
  'use strict';


  const appBase = location.pathname.startsWith('/sitemaster') ? '/sitemaster' : '';
  const state = { siteSlug: 'mainsite', site: null, sites: [], pages: [], content: [], collections: [], contentTypes: [], contentFilter: '', contentPage: 1, contentLimit: 20, contentPages: 1, contentTotal: 0, contentStatus: '', contentQuery: '', contentSort: 'updated', contentDirection: 'desc', contentSelection: [], collectionEditing: null, collectionFieldsDraft: [], media: [], mediaTarget: null, editor: null, selectedBlockPath: null, selectedShell: null, selectedShellChild: null, settingsTimer: null, structureOpen: true, propertiesOpen: false, view: 'dashboard', editorTab: 'visual', layoutCategory: 'all', device: 'desktop', history: [], historyIndex: -1, historyTimer: null, historySuspended: false, publishState: null };
  const el = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const LAYOUT_TEMPLATES = [
    { key: 'blank-1', name: 'Blank canvas', description: 'No shell · one column', category: 'blank', icon: 'single', columns: 1, header: false, footer: false, width: 'standard' },
    { key: 'blank-2', name: 'Blank split', description: 'No shell · two columns', category: 'blank', icon: 'split', columns: 2, header: false, footer: false, width: 'wide' },
    { key: 'blank-3', name: 'Blank grid', description: 'No shell · three columns', category: 'blank', icon: 'triple', columns: 3, header: false, footer: false, width: 'full' },
    { key: 'standard', name: 'Standard page', description: 'Header + footer · one column', category: 'shell', icon: 'single', columns: 1, header: true, footer: true, width: 'standard' },
    { key: 'standard-2', name: 'Editorial split', description: 'Header + footer · two columns', category: 'shell', icon: 'split', columns: 2, header: true, footer: true, width: 'wide' },
    { key: 'standard-3', name: 'Portal grid', description: 'Header + footer · three columns', category: 'shell', icon: 'triple', columns: 3, header: true, footer: true, width: 'full' },
    { key: 'sidebar-left', name: 'Left rail', description: 'Navigation rail · main content', category: 'advanced', icon: 'rail-left', columns: 2, header: true, footer: true, width: 'wide' },
    { key: 'sidebar-right', name: 'Right rail', description: 'Main content · utility rail', category: 'advanced', icon: 'rail-right', columns: 2, header: true, footer: true, width: 'wide' },
    { key: 'sidebar-both', name: 'Three rails', description: 'Left rail · content · right rail', category: 'advanced', icon: 'rail-both', columns: 3, header: true, footer: true, width: 'full' },
    { key: 'landing', name: 'Landing page', description: 'Brand shell · wide content', category: 'shell', icon: 'single', columns: 1, header: true, footer: false, width: 'wide' },
    { key: 'grid-3', name: 'Card gallery', description: 'No shell · equal content cards', category: 'advanced', icon: 'triple', columns: 3, header: false, footer: false, width: 'full' },
    { key: 'content-rail', name: 'Content + rail', description: 'Main content · related links', category: 'advanced', icon: 'rail-right', columns: 2, header: false, footer: false, width: 'wide' },
  ];
  const HTML_ELEMENT_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'code', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'header', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'hr', 'iframe', 'img', 'input', 'label', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'section', 'select', 'small', 'span', 'strong', 'summary', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'ul', 'video', 'button']);
  const VOID_HTML_ELEMENT_TAGS = new Set(['br', 'hr', 'img', 'input']);
  const HTML_TEXT_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'button', 'code', 'dd', 'dt', 'em', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'li', 'mark', 'p', 'pre', 'small', 'span', 'strong', 'summary', 'td', 'th', 'time']);
  const apiUrl = (path) => `${appBase}/api${path}`;
  const publicUrl = (path) => `${appBase}${path}`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const notice = (message, kind = 'success') => { const node = el('notice'); node.textContent = message; node.className = `notice ${kind}`; window.clearTimeout(notice.timer); notice.timer = window.setTimeout(() => node.classList.add('hidden'), 4200); };
  const csrfToken = () => document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('sitemaster_csrf='))?.slice('sitemaster_csrf='.length) || '';


  async function api(path, options = {}) {
    const response = await fetch(apiUrl(path), { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrfToken() ? { 'X-CSRF-Token': csrfToken() } : {}), ...(options.headers || {}) } });
    if (response.status === 401) { showLoggedOut(); return null; }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Sitemaster request failed');
    return body;
  }


  function hideLoading() { el('app-loading')?.classList.add('hidden'); }
  function showLoggedOut() { hideLoading(); el('auth-view').classList.remove('hidden'); el('workspace').classList.add('hidden'); }
  function showLoggedIn() { hideLoading(); el('auth-view').classList.add('hidden'); el('workspace').classList.remove('hidden'); }
  function setValue(id, value, fallback = '') { if (el(id)) el(id).value = value ?? fallback; }
  function setText(id, value) { if (el(id)) el(id).textContent = value ?? ''; }
  function siteTheme() { return state.site?.settings?.theme || {}; }
  /** The visual editor edits one document at a time: a page or a content entry. */
  function currentDocument() { return state.editor?.doc || defaultPage(); }
  function isContentEditor() { return state.editor?.kind === 'content'; }
  function currentTypeFields() {
    if (!isContentEditor()) return [];
    return (state.contentTypes.find((type) => type.slug === state.editor.doc.contentType)?.fields
      || state.collections.find((type) => type.slug === state.editor.doc.contentType)?.fields) || [];
  }
  function setDesignerStatus(message, kind = '') { const node = el('designer-save-status'); if (!node) return; node.textContent = message; node.className = `designer-save-status ${kind}`; }
  function updateHistoryControls() { const undo = el('designer-history-undo'); const redo = el('designer-history-redo'); if (undo) undo.disabled = state.historyIndex <= 0; if (redo) redo.disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1; }
  function pushHistory() { if (state.historySuspended || !state.editor) return; const snapshot = clone(state.editor.doc); const current = state.history[state.historyIndex]; if (current && JSON.stringify(current) === JSON.stringify(snapshot)) return; state.history = state.history.slice(0, state.historyIndex + 1); state.history.push(snapshot); state.historyIndex = state.history.length - 1; updateHistoryControls(); setDesignerStatus('Unsaved changes', 'dirty'); }
  function scheduleHistory() { window.clearTimeout(state.historyTimer); state.historyTimer = window.setTimeout(() => { pushHistory(); state.historyTimer = null; }, 450); setDesignerStatus('Unsaved changes', 'dirty'); persistShellBlocks(activeScope()); }
  function restoreHistory(index) { const snapshot = state.history[index]; if (!snapshot) return; state.historySuspended = true; state.editor.doc = clone(snapshot); state.historyIndex = index; state.selectedBlockPath = null; state.historySuspended = false; setDesignerFields(); renderBlockEditor(); renderPreview(); updateHistoryControls(); setDesignerStatus('Unsaved changes', 'dirty'); }


  const ROUTABLE_VIEWS = new Set(['dashboard', 'sites', 'pages', 'media', 'site', 'deploy']);
  function viewFromHash() { const match = location.hash.match(/^#\/?([a-z-]+)/); const name = match ? match[1] : ''; return ROUTABLE_VIEWS.has(name) ? name : null; }
  function setView(view) {
    state.view = view;
    if (ROUTABLE_VIEWS.has(view)) { const next = `#/${view}`; if (location.hash !== next) location.hash = next; }
    const workspace = el('workspace'); workspace?.classList.toggle('designer-focus-mode', view === 'designer'); if (view === 'designer') setSidebarState(false); else if (!window.matchMedia('(max-width: 760px)').matches) setSidebarState(true);
    document.querySelectorAll('.view').forEach((node) => node.classList.toggle('active-view', node.id === `view-${view}`));
    document.querySelectorAll('.nav-item').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
    const titles = { dashboard: 'Overview', sites: 'Sites', pages: 'Pages', media: 'Media library', designer: 'Page designer', site: 'Site design', deploy: 'Deployments', deployment: 'Deployment' };
    setText('view-title', titles[view] || 'Workspace');
    if (view === 'sites') renderSiteDirectory();
    if (view === 'pages') loadContentWorkspace().catch((error) => notice(error.message, 'error'));
    if (view === 'media') loadMediaWorkspace().catch((error) => notice(error.message, 'error'));
    if (view === 'site') renderSiteSettings();
    if (view === 'deploy' || view === 'deployment') renderDeployment();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  function renderSites() {
    const select = el('site-select');
    select.textContent = '';
    for (const site of state.sites) { const option = document.createElement('option'); option.value = site.slug; option.textContent = `${site.name} · ${site.slug}`; option.selected = site.slug === state.siteSlug; select.append(option); }
    if (!state.sites.some((site) => site.slug === state.siteSlug) && state.sites[0]) state.siteSlug = state.sites[0].slug;
    select.value = state.siteSlug;
    renderSiteDirectory();
  }


  function renderSiteDirectory() {
    const target = el('sites-table');
    if (!target) return;
    target.textContent = '';
    if (!state.sites.length) { target.innerHTML = '<div class="empty-state"><strong>No sites registered</strong><span>Create a site workspace or import a running local website.</span></div>'; return; }
    const table = document.createElement('table'); table.className = 'table';
    table.innerHTML = '<thead><tr><th>Site</th><th>Origin</th><th>Deployment</th><th></th></tr></thead>';
    const body = document.createElement('tbody');
    for (const site of state.sites) {
      const row = document.createElement('tr'); const deployment = site.deployment || {};
      row.innerHTML = `<td><div class="table-title"><span class="site-glyph">◎</span><span><strong>${escapeHtml(site.name)}</strong><small>${escapeHtml(site.slug)}</small></span></div></td><td>${escapeHtml(site.originUrl || 'Not connected')}</td><td><span class="status-text ${deployment.status === 'deployed' ? 'published' : 'draft'}">${escapeHtml(deployment.status || 'un-deployed')}</span></td><td><div class="row-actions"><button class="button secondary small-button" data-site-open="${escapeHtml(site.slug)}">Open</button><button class="button secondary small-button" data-site-import="${escapeHtml(site.slug)}">Import</button></div></td>`;
      body.append(row);
    }
    table.append(body); target.append(table);
    target.querySelectorAll('[data-site-open]').forEach((button) => { button.onclick = async () => { state.siteSlug = button.dataset.siteOpen; await loadWorkspace(); setView('dashboard'); }; });
    target.querySelectorAll('[data-site-import]').forEach((button) => { button.onclick = () => { state.siteSlug = button.dataset.siteImport; const site = state.sites.find((item) => item.slug === state.siteSlug); setValue('import-url', site?.originUrl || ''); setView('sites'); el('import-url').focus(); }; });
  }


  function renderDashboard() {
    const site = state.site || {};
    const deployment = site.deployment || {};
    setText('dashboard-site-name', site.name || 'Website');
    setText('dashboard-site-description', site.originUrl ? `Registered from ${site.originUrl}` : 'Your site workspace is ready for design and content.');
    setText('stat-pages', state.pages.length);
    setText('stat-content', (state.collections || []).reduce((total, collection) => total + (collection.total || 0), 0));
    setText('stat-deployment', deployment.status === 'deployed' ? 'Live' : 'Offline');
    setText('stat-deployment-path', deployment.status === 'deployed' ? deployment.path : 'Not published');
    setText('dashboard-status', deployment.status || 'un-deployed');
    el('dashboard-status').className = `status-pill ${deployment.status === 'deployed' ? 'published' : 'draft'}`;
  }


  const pageKey = (page) => `page/${page.slug}`;
  const isPageKey = (key) => String(key).startsWith('page/');
  /** Merged list rows: pages (type "page") plus content entries, honoring the current filters. */
  function itemRows() {
    const query = (state.contentQuery || '').toLowerCase();
    const pages = state.pages.filter((page) => (!state.contentStatus || page.status === state.contentStatus) && (!query || `${page.title} ${page.slug}`.toLowerCase().includes(query)));
    const showPages = !state.contentFilter || state.contentFilter === 'page';
    const showEntries = !state.contentFilter || state.contentFilter !== 'page';
    const rows = [];
    if (showPages && (state.contentPage || 1) === 1) for (const page of pages) rows.push({ kind: 'page', page });
    if (showEntries) for (const entry of state.content) rows.push({ kind: 'content', entry });
    return rows;
  }


  function templateByKey(key) { return LAYOUT_TEMPLATES.find((template) => template.key === key) || LAYOUT_TEMPLATES[3]; }
  function layoutFromTemplate(template) { return { template: template.key, showTopbar: template.header, showFooter: template.footer, showLogo: template.header, contentWidth: template.width, columns: template.columns, columnMode: template.icon }; }
  function normalizedLayout(layout = {}) { const template = templateByKey(layout.template || (layout.showTopbar === false ? 'blank-1' : 'standard')); return { ...layoutFromTemplate(template), ...layout, template: template.key, columns: Number(layout.columns || template.columns) }; }
  function defaultPage() { return { slug: `new-page-${Date.now().toString(36)}`, title: 'New page', excerpt: '', template: 'default', status: 'draft', blocks: [{ type: 'heading', level: 1, text: 'Your new page' }, { type: 'paragraph', text: 'Start designing this page with visual elements.' }], metadata: { layout: layoutFromTemplate(templateByKey('standard')), customHtml: '', customCss: '', customScript: '' } }; }
  function assignBlockIds(blocks, prefix = 'block') { let counter = 0; const visit = (items, parent = prefix) => (items || []).map((block) => { const next = { ...block, id: block.id || `${parent}-${counter++}`, style: { ...(block.style || {}) }, children: visit(block.children || [], `${parent}-${counter}`) }; return next; }); return visit(blocks); }
  function defaultContentDocument(contentType) {
    const data = {};
    for (const field of currentTypeFieldsFor(contentType)) if (field.type === 'boolean') data[field.key] = false;
    return { contentType: contentType || state.contentFilter || (state.contentTypes[0]?.slug ?? ''), slug: `entry-${Date.now().toString(36)}`, title: '', excerpt: '', status: 'draft', sortOrder: 0, coverImage: '', blocks: [], data, placements: [] };
  }
  function currentTypeFieldsFor(contentType) {
    return (state.contentTypes.find((type) => type.slug === contentType)?.fields
      || state.collections.find((type) => type.slug === contentType)?.fields) || [];
  }
  /** Opens the shared visual editor for a page or a content entry. */
  function openEditor(kind, source = null) {
    const settings = state.site?.settings || {};
    const doc = kind === 'content'
      ? (source ? { ...clone(source), blocks: clone(source.blocks || []), data: clone(source.data || {}), placements: [...(source.placements || [])] } : defaultContentDocument())
      : clone(source || defaultPage());
    const metadata = kind === 'content'
      ? { layout: layoutFromTemplate(templateByKey('blank-1')), customHtml: '', customCss: '', customScript: '' }
      : { layout: normalizedLayout(doc.metadata?.layout || {}), customHtml: doc.metadata?.customHtml || '', customCss: doc.metadata?.customCss || '', customScript: doc.metadata?.customScript || '' };
    state.editor = { kind, doc: { ...doc, metadata } };
    state.selectedBlockPath = null;
    state.selectedShell = null;
    state.selectedShellChild = null;
    state.editor.doc.blocks = assignBlockIds(state.editor.doc.blocks || [], kind === 'content' ? 'entry' : 'block');
    state.history = [clone(state.editor.doc)];
    state.historyIndex = 0;
    state.device = 'desktop';
    setView('designer');
    renderDocking();
    setDesignerFields();
    renderBlockEditor();
    renderPreview();
    updateHistoryControls();
    setDesignerStatus('Ready to edit');
  }
  function openDesigner(page) { openEditor('page', page); }
  function openContentEditor(entry) {
    if (!entry?.contentType && !(state.contentFilter || state.contentTypes[0]?.slug)) { notice('Create a content type before adding entries.', 'error'); return; }
    openEditor('content', entry);
  }


  function renderLayoutTemplates() {
    const activeLayout = normalizedLayout(currentDocument().metadata?.layout);
    const activeTemplate = templateByKey(activeLayout.template);
    const mini = el('layout-template-mini');
    if (mini) mini.className = `template-mini layout-icon-${activeTemplate.icon} ${activeTemplate.header ? 'has-header' : ''} ${activeTemplate.footer ? 'has-footer' : ''}`;
    setText('layout-template-name', activeTemplate.name); setText('layout-template-description', activeTemplate.description);
    const target = el('layout-picker-options');
    if (!target) return;
    const active = activeLayout.template;
    const templates = LAYOUT_TEMPLATES.filter((template) => state.layoutCategory === 'all' || template.category === state.layoutCategory);
    target.innerHTML = templates.map((template) => `<button type="button" class="layout-template-card ${template.key === active ? 'active' : ''}" data-layout-template="${template.key}"><span class="template-mini layout-icon-${template.icon} ${template.header ? 'has-header' : ''} ${template.footer ? 'has-footer' : ''}"><span class="layout-region layout-header"></span><span class="layout-region layout-left"></span><span class="layout-region layout-center"></span><span class="layout-region layout-right"></span><span class="layout-region layout-footer"></span></span><span class="layout-template-copy"><strong>${template.name}</strong><small>${template.description}</small></span></button>`).join('');
    target.querySelectorAll('[data-layout-template]').forEach((button) => { button.onclick = () => { const page = currentDocument(); page.metadata.layout = layoutFromTemplate(templateByKey(button.dataset.layoutTemplate)); closeLayoutPicker(); setDesignerFields(); renderBlockEditor(); renderPreview(); pushHistory(); }; });
  }


  function openLayoutPicker() { state.layoutCategory = el('layout-picker-category')?.value || 'all'; el('layout-picker-modal').classList.remove('hidden'); renderLayoutTemplates(); }
  function closeLayoutPicker() { el('layout-picker-modal').classList.add('hidden'); }
  function setCanvasDevice(device) { state.device = device; const frame = document.querySelector('.canvas-frame'); if (frame) { frame.classList.remove('device-desktop', 'device-tablet', 'device-mobile'); frame.classList.add(`device-${device}`); } document.querySelectorAll('[data-canvas-device]').forEach((button) => { const active = button.dataset.canvasDevice === device; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); }); applyCanvasZoom(); }
  function applyCanvasZoom() {
    const stage = document.querySelector('.canvas-zoom-stage'); const label = document.querySelector('.zoom-value'); if (!stage) return;
    const frame = document.querySelector('.canvas-frame');
    const sheet = stage.querySelector('.preview-frame');
    state.canvasZoom = Math.max(0.25, Math.min(2, Number(state.canvasZoom) || 1));
    const frameW = frame ? Math.max(0, frame.clientWidth - 24) : 0;
    const device = state.device || 'desktop';
    let baseW = device === 'desktop' ? frameW : (sheet && sheet.offsetWidth) || (device === 'tablet' ? 768 : 390);
    if (!(baseW > 8)) baseW = frameW;
    stage.style.transform = `scale(${state.canvasZoom})`;
    stage.style.width = `${Math.round(baseW * state.canvasZoom)}px`;
    if (sheet) stage.style.height = `${Math.round(Math.max(sheet.offsetHeight, 620) * state.canvasZoom)}px`;
    if (label) label.textContent = `${Math.round(state.canvasZoom * 100)}%`;
  }
  function zoomCanvas(delta) { state.canvasZoom = Math.max(0.25, Math.min(2, (Number(state.canvasZoom) || 1) + delta)); applyCanvasZoom(); }
  function zoomCanvasFit() { const frame = document.querySelector('.canvas-frame'); const stage = document.querySelector('.canvas-zoom-stage'); if (!frame || !stage) return; const sheet = stage.querySelector('.preview-frame'); const frameW = Math.max(0, frame.clientWidth - 24); const device = state.device || 'desktop'; let baseW = device === 'desktop' ? frameW : (sheet && sheet.offsetWidth) || (device === 'tablet' ? 768 : 390); if (!(baseW > 8)) baseW = frameW; const fit = Math.max(0.25, Math.min(1, frameW / baseW)); state.canvasZoom = fit; applyCanvasZoom(); }
  function setupDesignerToolbar() {
    const actions = document.querySelector('.designer-panel-actions'); const canvasToolbar = document.querySelector('.canvas-toolbar');
    if (!actions || !canvasToolbar || el('designer-history-undo')) return;
    const history = document.createElement('div'); history.className = 'designer-history-controls'; history.innerHTML = '<button id="designer-history-undo" class="icon-button" type="button" title="Undo last change" aria-label="Undo last change">↶</button><button id="designer-history-redo" class="icon-button" type="button" title="Redo last change" aria-label="Redo last change">↷</button>';
    actions.prepend(history);
    const status = document.createElement('span'); status.id = 'designer-save-status'; status.className = 'designer-save-status'; status.textContent = 'Ready'; actions.append(status);
    const devices = document.createElement('div'); devices.className = 'canvas-device-tabs'; devices.setAttribute('role', 'tablist'); devices.innerHTML = '<button type="button" class="device-tab active" data-canvas-device="desktop" aria-selected="true">Desktop</button><button type="button" class="device-tab" data-canvas-device="tablet" aria-selected="false">Tablet</button><button type="button" class="device-tab" data-canvas-device="mobile" aria-selected="false">Mobile</button>';
    canvasToolbar.querySelector('.device-pill')?.remove(); canvasToolbar.append(devices);
    const zoom = document.createElement('div'); zoom.className = 'canvas-zoom-controls'; zoom.innerHTML = '<button type="button" class="zoom-btn" data-zoom-out title="Zoom out" aria-label="Zoom out">−</button><span class="zoom-value" title="Canvas zoom level">100%</span><button type="button" class="zoom-btn" data-zoom-in title="Zoom in" aria-label="Zoom in">+</button><button type="button" class="zoom-btn" data-zoom-fit title="Fit canvas to width" aria-label="Fit canvas to width">⤢</button><button type="button" class="zoom-btn" data-zoom-reset title="Actual size" aria-label="Actual size">1:1</button>';
    canvasToolbar.append(zoom);
    const breadcrumb = document.createElement('div'); breadcrumb.id = 'canvas-breadcrumb'; breadcrumb.className = 'canvas-breadcrumb'; breadcrumb.title = 'Path to the selected element';
    const toolbarLabels = canvasToolbar.firstElementChild; if (toolbarLabels) toolbarLabels.appendChild(breadcrumb);
    const frame = document.querySelector('.canvas-frame'); if (frame) { frame.id = 'canvas-frame'; frame.classList.add('device-desktop'); }
    el('designer-history-undo').onclick = () => restoreHistory(state.historyIndex - 1);
    el('designer-history-redo').onclick = () => restoreHistory(state.historyIndex + 1);
    devices.querySelectorAll('[data-canvas-device]').forEach((button) => { button.onclick = () => setCanvasDevice(button.dataset.canvasDevice); });
    zoom.querySelector('[data-zoom-out]').onclick = () => zoomCanvas(-0.1);
    zoom.querySelector('[data-zoom-in]').onclick = () => zoomCanvas(0.1);
    zoom.querySelector('[data-zoom-fit]').onclick = zoomCanvasFit;
    zoom.querySelector('[data-zoom-reset]').onclick = () => { state.canvasZoom = 1; applyCanvasZoom(); };
    window.addEventListener('resize', () => { if (state.view === 'designer') applyCanvasZoom(); });
    state.canvasZoom = 1; applyCanvasZoom();
  }
  const TOOL_WINDOWS = [
    { key: 'layers', title: 'Layers', icon: '☷', dock: 'left', pinned: true },
    { key: 'components', title: 'Components', icon: '＋', dock: 'left', pinned: true },
    { key: 'properties', title: 'Properties', icon: '⚙', dock: 'right', pinned: true },
  ];
  const dockBodies = {};


  function toolDef(key) { return TOOL_WINDOWS.find((def) => def.key === key); }
  function toolState() {
    state.tools ||= {};
    for (const def of TOOL_WINDOWS) state.tools[def.key] ||= { dock: def.dock, pinned: def.pinned, enabled: true, peek: false };
    return state.tools;
  }
  function closeAllPeeks() { const tools = toolState(); for (const key of Object.keys(tools)) tools[key].peek = false; }
  function mountToolBody(key, container) { const body = dockBodies[key]; if (body) container.append(body); }
  function toolActionButton(cls, label, glyph) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tw-action ${cls}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.textContent = glyph;
    return button;
  }
  function buildToolWindow(key, floating = false) {
    const def = toolDef(key); const tool = toolState()[key];
    const win = document.createElement('section');
    win.className = `designer-tool-window${floating ? ' floating' : ''}`;
    win.dataset.toolWindow = key;
    const head = document.createElement('header'); head.className = 'tw-head';
    const title = document.createElement('span'); title.className = 'tw-title';
    title.innerHTML = `<span class="tw-icon" aria-hidden="true">${def.icon}</span><span>${def.title}</span>`;
    if (key === 'layers') { const count = el('block-count'); if (count) title.append(count); }
    const actions = document.createElement('div'); actions.className = 'tw-actions';
    const pin = toolActionButton('tw-pin', tool.pinned ? 'Unpin (auto-hide)' : 'Pin (keep visible)', '📌');
    pin.classList.toggle('active', tool.pinned);
    pin.onclick = () => { const t = toolState()[key]; t.pinned = !t.pinned; t.enabled = true; if (t.pinned) t.peek = false; renderDocking(); };
    const flip = toolActionButton('tw-dock', `Dock to ${tool.dock === 'left' ? 'right' : 'left'} edge`, '⇄');
    flip.onclick = () => { const t = toolState()[key]; t.dock = t.dock === 'left' ? 'right' : 'left'; t.peek = false; t.enabled = true; renderDocking(); };
    const close = toolActionButton('tw-close', 'Hide tool window', '✕');
    close.onclick = () => { const t = toolState()[key]; t.enabled = false; t.peek = false; renderDocking(); };
    actions.append(pin, flip, close);
    head.append(title, actions);
    const body = document.createElement('div'); body.className = 'tw-body';
    mountToolBody(key, body);
    if (state.tools?.[key]?.size) win.style.flex = `0 0 ${state.tools[key].size}px`;
    win.append(head, body);
    return win;
  }
  function buildDockResizer(side, dock) {
    const bar = document.createElement('div');
    bar.className = 'dock-resizer';
    bar.title = 'Drag to resize';
    bar.setAttribute('role', 'separator');
    bar.setAttribute('aria-orientation', 'vertical');
    bar.onpointerdown = (event) => {
      event.preventDefault();
      const stack = dock.querySelector('.dock-stack');
      if (!stack) return;
      const startX = event.clientX;
      const startW = stack.getBoundingClientRect().width;
      const dir = side === 'left' ? 1 : -1;
      const move = (moveEvent) => {
        const width = Math.round(Math.max(220, Math.min(560, startW + dir * (moveEvent.clientX - startX))));
        stack.style.flex = '0 0 auto';
        stack.style.width = `${width}px`;
        state.dockWidths ||= {};
        state.dockWidths[side] = width;
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    return bar;
  }
  function buildSplitter(aboveKey, stack) {
    const bar = document.createElement('div');
    bar.className = 'tw-splitter';
    bar.title = 'Drag to resize';
    bar.setAttribute('role', 'separator');
    bar.setAttribute('aria-orientation', 'horizontal');
    bar.onpointerdown = (event) => {
      event.preventDefault();
      const windows = [...stack.querySelectorAll(':scope > .designer-tool-window')];
      const keys = windows.map((win) => win.dataset.toolWindow);
      const index = keys.indexOf(aboveKey);
      if (index < 0 || !windows[index + 1]) return;
      const startY = event.clientY;
      const heights = windows.map((win) => win.getBoundingClientRect().height);
      windows.forEach((win, i) => { state.tools[keys[i]].size = Math.round(heights[i]); win.style.flex = `0 0 ${Math.round(heights[i])}px`; });
      const move = (moveEvent) => {
        const delta = moveEvent.clientY - startY;
        const above = Math.max(70, heights[index] + delta);
        const below = Math.max(70, heights[index + 1] - delta);
        state.tools[keys[index]].size = Math.round(above);
        state.tools[keys[index + 1]].size = Math.round(below);
        windows[index].style.flex = `0 0 ${Math.round(above)}px`;
        windows[index + 1].style.flex = `0 0 ${Math.round(below)}px`;
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    return bar;
  }
  function buildRailTab(key) {
    const def = toolDef(key);
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'tw-rail-tab';
    tab.innerHTML = `<span class="tw-rail-icon" aria-hidden="true">${def.icon}</span>`;
    tab.title = def.title;
    tab.setAttribute('aria-label', `Open ${def.title}`);
    tab.onclick = () => { const tool = toolState()[key]; const next = !tool.peek; closeAllPeeks(); tool.peek = next; renderDocking(); };
    return tab;
  }
  function captureToolScroll() {
    const map = {};
    document.querySelectorAll('.designer-tool-window[data-tool-window]').forEach((win) => {
      const entry = {};
      const body = win.querySelector('.tw-body'); if (body) entry.body = body.scrollTop;
      const tree = win.querySelector('#page-tree'); if (tree) entry.tree = tree.scrollTop;
      map[win.dataset.toolWindow] = entry;
    });
    return map;
  }
  function restoreToolScroll(map) {
    document.querySelectorAll('.designer-tool-window[data-tool-window]').forEach((win) => {
      const entry = map[win.dataset.toolWindow]; if (!entry) return;
      const body = win.querySelector('.tw-body'); if (body && entry.body != null) body.scrollTop = entry.body;
      const tree = win.querySelector('#page-tree'); if (tree && entry.tree != null) tree.scrollTop = entry.tree;
    });
  }
  function renderDocking() {
    const workspace = el('designer-workspace'); if (!workspace) return;
    const scrollSnapshot = captureToolScroll();
    const tools = toolState();
    for (const side of ['left', 'right']) {
      const dock = el(`designer-dock-${side}`); if (!dock) continue;
      dock.textContent = '';
      const pinned = TOOL_WINDOWS.filter((def) => tools[def.key].dock === side && tools[def.key].enabled && tools[def.key].pinned);
      const hidden = TOOL_WINDOWS.filter((def) => tools[def.key].dock === side && tools[def.key].enabled && !tools[def.key].pinned);
      const stack = document.createElement('div'); stack.className = 'dock-stack';
      pinned.forEach((def, i) => {
        stack.append(buildToolWindow(def.key));
        if (i < pinned.length - 1) stack.append(buildSplitter(def.key, stack));
      });
      const storedWidth = state.dockWidths?.[side];
      if (storedWidth) { stack.style.flex = '0 0 auto'; stack.style.width = `${storedWidth}px`; }
      if (pinned.length) dock.append(buildDockResizer(side, dock));
      dock.append(stack);
      const rail = document.createElement('div'); rail.className = 'dock-rail';
      for (const def of hidden) rail.append(buildRailTab(def.key));
      dock.append(rail);
      const peeking = hidden.find((def) => tools[def.key].peek);
      if (peeking) { const flyout = document.createElement('div'); flyout.className = 'dock-flyout'; flyout.append(buildToolWindow(peeking.key, true)); dock.append(flyout); }
      dock.classList.toggle('dock-empty', pinned.length === 0 && hidden.length === 0);
    }
    workspace.classList.toggle('structure-collapsed', !TOOL_WINDOWS.some((def) => tools[def.key].dock === 'left' && tools[def.key].enabled));
    workspace.classList.toggle('properties-collapsed', !TOOL_WINDOWS.some((def) => tools[def.key].dock === 'right' && tools[def.key].enabled));
    renderToolbarButtons();
    if (state.editor) { renderPageTree(currentDocument().blocks || []); renderElementInspector(); }
    restoreToolScroll(scrollSnapshot);
  }
  function renderToolbarButtons() {
    const host = el('designer-tool-buttons'); if (!host) return;
    const tools = toolState(); host.textContent = '';
    for (const def of TOOL_WINDOWS) {
      const tool = tools[def.key];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tool-tab'; button.dataset.toolButton = def.key;
      button.innerHTML = `<span aria-hidden="true">${def.icon}</span> <span>${def.title}</span>`;
      const visible = tool.enabled && (tool.pinned || tool.peek);
      button.classList.toggle('active', visible);
      button.setAttribute('aria-pressed', String(visible));
      button.title = `${tool.enabled ? 'Hide' : 'Show'} the ${def.title.toLowerCase()} window`;
      button.onclick = () => toggleToolWindow(def.key);
      host.append(button);
    }
  }
  function toggleToolWindow(key) {
    const tool = toolState()[key];
    if (!tool.enabled) { tool.enabled = true; if (!tool.pinned) { closeAllPeeks(); tool.peek = true; } }
    else if (!tool.pinned) { if (tool.peek) { tool.peek = false; } else { closeAllPeeks(); tool.peek = true; } }
    else { tool.enabled = false; tool.peek = false; }
    renderDocking();
  }
  function showToolWindow(key) {
    const tool = toolState()[key];
    if (tool.enabled && (tool.pinned || tool.peek)) return;
    tool.enabled = true;
    if (!tool.pinned) { closeAllPeeks(); tool.peek = true; }
    renderDocking();
  }
  function buildPropertiesPanel(host) {
    const fields = host.querySelector('.inspector-fields');
    const elementInspector = host.querySelector('#element-inspector');
    if (!fields || !elementInspector) return;
    if (!el('selected-style-fields')) {
      const styleFields = document.createElement('div'); styleFields.id = 'selected-style-fields'; styleFields.className = 'block-fields';
      const styleHint = document.createElement('p'); styleHint.id = 'style-selection-hint'; styleHint.className = 'inspector-empty'; styleHint.textContent = 'Select an element in the navigator or canvas to edit its appearance.';
      elementInspector.append(styleFields, styleHint);
    }
    state.propertiesFields = fields;
    host.textContent = '';
    host.append(fields, elementInspector);
  }
  function setupDesignerDocking() {
    const workspace = el('designer-workspace');
    if (!workspace || workspace.dataset.dockReady === 'true') return;
    workspace.classList.add('webstudio-mode');
    toolState();


    const layersBody = document.createElement('div'); layersBody.className = 'tw-content';
    let tree = el('page-tree');
    if (!tree) { tree = document.createElement('div'); tree.id = 'page-tree'; tree.className = 'page-tree'; }
    let layersToolbar = el('layers-toolbar');
    if (!layersToolbar) {
      layersToolbar = document.createElement('div'); layersToolbar.id = 'layers-toolbar'; layersToolbar.className = 'layers-toolbar';
      layersToolbar.setAttribute('role', 'toolbar'); layersToolbar.setAttribute('aria-label', 'Layer actions');
      layersToolbar.innerHTML = '<button type="button" class="layer-op" data-layer-op="up" title="Move up" aria-label="Move up">↑</button><button type="button" class="layer-op" data-layer-op="down" title="Move down" aria-label="Move down">↓</button><button type="button" class="layer-op" data-layer-op="out" title="Move out of container" aria-label="Move out of container">⇤</button><button type="button" class="layer-op" data-layer-op="in" title="Move into previous element" aria-label="Move into previous element">⇥</button><span class="layer-sep" aria-hidden="true"></span><button type="button" class="layer-op" data-layer-op="add" title="Add child element" aria-label="Add child element">+</button><button type="button" class="layer-op" data-layer-op="duplicate" title="Duplicate element" aria-label="Duplicate element">⧉</button><button type="button" class="layer-op danger" data-layer-op="delete" title="Delete element" aria-label="Delete element">×</button>';
      layersToolbar.querySelectorAll('[data-layer-op]').forEach((node) => { node.onclick = () => runLayerOp(node.dataset.layerOp); });
    }
    layersBody.append(layersToolbar, tree);
    dockBodies.layers = layersBody;
    updateLayersToolbar();


    const componentsBody = document.createElement('div'); componentsBody.className = 'tw-content';
    dockBodies.components = componentsBody;


    const propertiesBody = document.createElement('div'); propertiesBody.className = 'tw-content properties-panel';
    const source = el('designer-properties-source');
    if (source) { while (source.firstChild) propertiesBody.append(source.firstChild); }
    buildPropertiesPanel(propertiesBody);
    dockBodies.properties = propertiesBody;


    renderElementPalette();
    workspace.dataset.dockReady = 'true';
    renderDocking();
  }


  function renderContentTypeSelect() {
    const select = el('content-type-select');
    if (!select) return;
    const types = state.contentTypes || [];
    if (!types.some((type) => type.slug === state.editor.doc.contentType)) state.editor.doc.contentType = types[0]?.slug || '';
    select.textContent = '';
    for (const type of types) select.append(new Option(type.name, type.slug, false, type.slug === state.editor.doc.contentType));
  }


  function setDesignerFields() {
    const doc = currentDocument();
    const content = isContentEditor();
    const layout = normalizedLayout(doc.metadata?.layout || {});
    document.body.classList.toggle('content-document-editor', content);
    el('page-settings')?.classList.toggle('hidden', content);
    el('content-settings')?.classList.toggle('hidden', !content);
    el('content-schema-fields')?.classList.toggle('hidden', !content);
    document.querySelectorAll('.page-only-tab').forEach((tab) => tab.classList.toggle('hidden', content));
    el('save-page').textContent = content ? 'Save entry' : 'Save page';
    el('publish-entry').classList.toggle('hidden', !content);
    el('back-to-pages').textContent = '← Pages';
    setText('designer-eyebrow', content ? 'Content entry designer' : 'Visual page designer');
    setText('designer-subtitle', content ? 'Compose the entry visually. Its type is an attribute, so you can change it or place the entry on any page.' : 'Compose the page visually, then refine it with HTML, CSS, or JavaScript.');
    setText('designer-title', content ? (doc.title || doc.slug || 'New entry') : (doc.slug === 'new-page' ? 'New page' : `Design ${doc.title}`));
    setValue('designer-slug', doc.slug); setValue('designer-page-title', doc.title); setValue('designer-status', doc.status); setValue('layout-width', layout.contentWidth || 'standard');
    el('layout-topbar').checked = layout.showTopbar !== false; el('layout-footer').checked = layout.showFooter !== false; el('layout-logo').checked = layout.showLogo !== false;
    setValue('custom-html', doc.metadata?.customHtml || ''); setValue('custom-css', doc.metadata?.customCss || ''); setValue('custom-script', doc.metadata?.customScript || '');
    const htmlBox = el('custom-html'); if (htmlBox) { delete htmlBox.dataset.generated; delete htmlBox.dataset.userHtml; }
    state.customHtmlBaseline = null;
    if (content) {
      renderContentTypeSelect();
      setValue('designer-content-title', doc.title);
      setValue('designer-content-slug', doc.slug);
      setValue('designer-content-status', doc.status);
      setValue('designer-content-order', doc.sortOrder ?? 0);
      setValue('designer-content-excerpt', doc.excerpt);
      setValue('designer-content-cover', doc.coverImage);
      setValue('content-data', JSON.stringify(doc.data || {}, null, 2));
      renderSchemaFields();
    }
    renderLayoutTemplates();
  }


  function renderSchemaFields() {
    const target = el('content-schema-fields');
    if (!target) return;
    target.textContent = '';
    const fields = currentTypeFields();
    const heading = document.createElement('details');
    heading.className = 'inspector-group';
    heading.open = true;
    heading.innerHTML = `<summary>${escapeHtml(contentTypeName(state.editor.doc.contentType) || 'Fields')}</summary><div class="inspector-body"><p class="toolbar-hint">Values saved with this entry through the content type schema.</p><div class="schema-field-list"></div></div>`;
    const list = heading.querySelector('.schema-field-list');
    if (!fields.length) list.innerHTML = '<p class="toolbar-hint">This content type has no fields yet. Add them under Content types.</p>';
    for (const field of fields) list.append(schemaFieldControl(field));
    target.append(heading);
  }


  function contentTypeName(slug) { return state.contentTypes.find((type) => type.slug === slug)?.name || slug || ''; }


  /** One schema field bound to the editing document. */
  function schemaFieldControl(field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'content-field';
    const id = `schema-${field.key}`;
    const value = state.editor.doc.data?.[field.key];
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = `${field.label}${field.required ? ' *' : ''}`;
    wrapper.append(label);
    const commit = (next) => { state.editor.doc.data ||= {}; state.editor.doc.data[field.key] = next; setValue('content-data', JSON.stringify(state.editor.doc.data, null, 2)); };
    if (field.type === 'textarea') {
      const input = document.createElement('textarea');
      input.id = id; input.rows = 3; input.value = value ?? '';
      input.oninput = () => commit(input.value);
      wrapper.append(input);
    } else if (field.type === 'boolean') {
      const row = document.createElement('div');
      row.className = 'check-row';
      const input = document.createElement('input');
      input.id = id; input.type = 'checkbox'; input.checked = Boolean(value);
      input.onchange = () => commit(input.checked);
      row.append(input);
      wrapper.append(row);
    } else if (field.type === 'select') {
      const select = document.createElement('select');
      select.id = id;
      select.append(new Option('—', ''));
      for (const option of field.options || []) select.append(new Option(option, option));
      select.value = value ?? '';
      select.onchange = () => commit(select.value);
      wrapper.append(select);
    } else if (field.type === 'number') {
      const input = document.createElement('input');
      input.id = id; input.type = 'number'; input.value = value ?? '';
      input.oninput = () => commit(input.value === '' ? '' : Number(input.value));
      wrapper.append(input);
    } else if (field.type === 'date') {
      const input = document.createElement('input');
      input.id = id; input.type = 'date'; input.value = typeof value === 'string' ? value.slice(0, 10) : '';
      input.oninput = () => commit(input.value);
      wrapper.append(input);
    } else if (field.type === 'tags') {
      const input = document.createElement('input');
      input.id = id; input.value = Array.isArray(value) ? value.join(', ') : '';
      input.placeholder = 'news, launch, guides';
      input.oninput = () => commit(input.value.split(',').map((tag) => tag.trim()).filter(Boolean));
      wrapper.append(input, Object.assign(document.createElement('small'), { textContent: 'Separate tags with commas.' }));
    } else if (field.type === 'richtext') {
      const hint = document.createElement('p');
      hint.className = 'toolbar-hint';
      hint.textContent = 'Rich text renders as entry blocks in the canvas.';
      const host = document.createElement('div');
      host.className = 'block-host';
      wrapper.append(hint, host);
      renderInlineBlockEditor(host, { get: () => state.editor.doc.data?.[field.key] || [], set: (blocks) => commit(blocks) });
      return wrapper;
    } else {
      const row = document.createElement('div');
      row.className = 'input-with-action';
      const input = document.createElement('input');
      input.id = id; input.value = value ?? '';
      input.placeholder = field.type === 'image' ? '/media/image.png or https://…' : 'https://…';
      input.oninput = () => commit(input.value);
      row.append(input);
      if (field.type === 'image' || field.type === 'url') {
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'button secondary small-button';
        pick.textContent = 'Library';
        pick.onclick = () => openMediaLibrary(input);
        row.append(pick);
      }
      wrapper.append(row);
    }
    wrapper.querySelectorAll('input,textarea,select').forEach((node) => { node.addEventListener('change', scheduleHistory); });
    return wrapper;
  }


  function blockLabel(type, block = null) { if (type === 'html_element') return block?.data?.tag ? `<${block.data.tag}>` : 'HTML element'; return ({ heading: 'Heading', paragraph: 'Paragraph', rich_text: 'Rich text', image: 'Image', link: 'Link', button: 'Button', list: 'List', quote: 'Quote', hr: 'Divider', video: 'Video', container: 'Container', section: 'Section', div: 'Div', span: 'Span', form: 'Form', nav: 'Navigation', hero: 'Hero', card: 'Card', 'feature-grid': 'Feature grid', alert: 'Alert', cta: 'Call to action', callout: 'Callout', spacer: 'Spacer', navbar: 'Navbar', badge: 'Badge', 'button-group': 'Button group', breadcrumb: 'Breadcrumb', 'list-group': 'List group', accordion: 'Accordion', pricing: 'Pricing card', stats: 'Stats' })[type] || type;
  }
  function blockTag(block) {
    const type = block?.type;
    if (type === 'heading') return `h${Math.min(6, Math.max(1, Number(block.level) || 2))}`;
    if (type === 'html_element') return HTML_ELEMENT_TAGS.has(block?.data?.tag) ? block.data.tag : 'div';
    const map = { paragraph: 'p', rich_text: 'p', image: 'img', link: 'a', button: 'a', list: 'ul', quote: 'blockquote', hr: 'hr', video: 'video', container: 'div', section: 'section', div: 'div', span: 'span', form: 'form', nav: 'nav', hero: 'section', card: 'article', 'feature-grid': 'section', alert: 'aside', cta: 'section', callout: 'aside', spacer: 'div', navbar: 'nav', badge: 'span', 'button-group': 'div', breadcrumb: 'nav', 'list-group': 'ul', accordion: 'div', pricing: 'article', stats: 'div' };
    return map[type] || (type || 'element');
  }
  function paletteIcon(value) {
    return ({ header: '⌂', nav: '≡', main: '▣', section: '▤', article: '▥', aside: '◧', footer: '⌄', div: '□', h1: 'H₁', h2: 'H₂', h3: 'H₃', h4: 'H₄', h5: 'H₅', h6: 'H₆', p: '¶', blockquote: '❝', pre: '≡', code: '‹›', strong: 'B', em: 'I', small: 'A', mark: '▧', span: 'S', time: '◷', ul: '•', ol: '1·', li: '·', dl: '≡', dt: 'T', dd: 'D', table: '▦', thead: '▤', tbody: '▤', tr: '—', th: 'T', td: '□', img: '▧', video: '▶', iframe: '↗', figure: '▥', figcaption: 'T', form: '▤', label: 'L', input: '▭', textarea: '▤', select: '⌄', details: '▾', summary: '☰', dialog: '▢', button: '●', navbar: '☰', hero: '✦', card: '▣', 'feature-grid': '▦', alert: '!', badge: '●', 'button-group': '▤', breadcrumb: '›', 'list-group': '☷', accordion: '≡', pricing: '$', stats: '▥', cta: '↗', callout: '❝', spacer: '↕' })[value] || '＋';
  }
  function pathKey(path) { return path?.length ? path.join('.') : 'page'; }
  function parsePath(value) { return value === 'page' || value === '' ? null : value.split('.').map(Number); }
  // Header/footer shells hold site-wide blocks (settings.shellBlocks); the page
  // body holds the document blocks. The scope selects which root a path uses.
  function activeScope() { return state.selectedShell === 'header' || state.selectedShell === 'footer' ? state.selectedShell : ''; }
  function shellBlocks(shell) { state.site.settings ||= {}; state.site.settings.shellBlocks ||= {}; return (state.site.settings.shellBlocks[shell] ||= []); }
  function shellBlockList(shell) { const list = state.site?.settings?.shellBlocks?.[shell]; return Array.isArray(list) ? list : []; }
  function rootFor(scope) { return scope === 'header' || scope === 'footer' ? shellBlocks(scope) : (currentDocument().blocks ||= []); }
  function blockInScope(scope, path) { let blocks = rootFor(scope); let block = null; for (const index of path || []) { block = blocks[index]; if (!block) return null; blocks = block.children || []; } return block; }
  function siblingsInScope(scope, path) { if (!path?.length || path.length === 1) return rootFor(scope); const parent = blockInScope(scope, path.slice(0, -1)); return parent ? (parent.children ||= []) : null; }
  function resolveScope(rawKey) { const value = String(rawKey || ''); if (value.startsWith('header:')) return { shell: 'header', path: parsePath(value.slice(7)) }; if (value.startsWith('footer:')) return { shell: 'footer', path: parsePath(value.slice(7)) }; return { shell: '', path: parsePath(value) }; }
  function scopeKey(shell, path) { return shell ? `${shell}:${pathKey(path)}` : pathKey(path); }
  function currentSelectionKey() { return scopeKey(activeScope(), state.selectedBlockPath); }
  function persistShellBlocks(scope) {
    if (scope !== 'header' && scope !== 'footer') return;
    scheduleSaveSettings('shellBlocks', state.site?.settings?.shellBlocks || {});
    const normalized = shellOrder(scope);
    (state.site.settings.shellOrder ||= {})[scope] = normalized;
    scheduleSaveSettings('shellOrder', state.site.settings.shellOrder);
  }
  const SHELL_BRANDING = { header: ['logo', 'name'], footer: ['name', 'note'] };
  function shellOrder(shell) {
    const settings = (state.site.settings ||= {});
    const order = (settings.shellOrder ||= {});
    const branding = SHELL_BRANDING[shell] || [];
    const count = shellBlockList(shell).length;
    let tokens = Array.isArray(order[shell]) ? order[shell].filter((token) => typeof token === 'string') : null;
    if (!tokens) tokens = [...branding.map((id) => `branding:${id}`)];
    const seen = new Set();
    const next = [];
    for (const token of tokens) {
      if (seen.has(token)) continue;
      if (token.startsWith('branding:')) {
        const id = token.slice(9);
        if (!branding.includes(id)) continue;
        if (settings.shellBrandingMoved?.[`${shell}.${id}`]) continue;
      } else if (token.startsWith('block:')) {
        const index = Number(token.slice(6));
        if (!Number.isInteger(index) || index < 0 || index >= count) continue;
      } else continue;
      seen.add(token); next.push(token);
    }
    for (const id of branding) {
      const token = `branding:${id}`;
      if (!settings.shellBrandingMoved?.[`${shell}.${id}`] && !seen.has(token)) { seen.add(token); next.push(token); }
    }
    for (let index = 0; index < count; index += 1) {
      const token = `block:${index}`;
      if (!seen.has(token)) { seen.add(token); next.push(token); }
    }
    return next;
  }
  function persistShellOrder(shell) { scheduleSaveSettings('shellOrder', state.site?.settings?.shellOrder || {}); }
  function moveShellOrderToken(shell, token, delta) {
    const order = shellOrder(shell);
    const index = order.indexOf(token);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return false;
    [order[target], order[index]] = [order[index], order[target]];
    (state.site.settings.shellOrder ||= {})[shell] = order;
    persistShellOrder(shell);
    return true;
  }
  function moveShellOrderTokenTo(shell, token, toIndex) {
    const order = shellOrder(shell);
    const index = order.indexOf(token);
    if (index < 0) return false;
    const bounded = Math.max(0, Math.min(order.length - 1, toIndex));
    if (index === bounded) return false;
    order.splice(index, 1); order.splice(bounded, 0, token);
    (state.site.settings.shellOrder ||= {})[shell] = order;
    persistShellOrder(shell);
    return true;
  }
  function moveShellChildTokenTo(fromShell, token, toShell, toParentPath, zone) {
    if (fromShell === toShell) {
      let index = shellOrder(fromShell).indexOf(token);
      if (index < 0) return;
      if (Array.isArray(toParentPath) && toParentPath.length) {
        const target = `block:${toParentPath[0]}`;
        const at = shellOrder(fromShell).indexOf(target);
        if (at >= 0) index = zone === 'after' ? at + 1 : at;
      }
      moveShellOrderTokenTo(fromShell, token, index);
      return;
    }
    if (token.startsWith('branding:')) { moveShellChildToScope(fromShell, token.slice(9), toShell, toParentPath, zone); return; }
    const at = Array.isArray(toParentPath) && toParentPath.length ? toParentPath[0] : undefined;
    moveBlockToScope(fromShell, [Number(token.slice(6))], toShell, Array.isArray(toParentPath) ? toParentPath : null, zone);
    void at;
  }
  function blockAtPath(path) { return blockInScope(activeScope(), path); }
  function siblingsAtPath(path) { return siblingsInScope(activeScope(), path); }
  function countBlocks(blocks) { return (blocks || []).reduce((count, block) => count + 1 + countBlocks(block.children), 0); }
  const TEMPLATE_STYLE_FIELDS = {
    text: [['color', 'Text color', 'color'], ['fontSize', 'Font size', 'text'], ['fontWeight', 'Font weight', 'weight'], ['textAlign', 'Alignment', 'align'], ['letterSpacing', 'Letter spacing', 'text'], ['textTransform', 'Text transform', 'case'], ['backgroundImage', 'Background image', 'image']],
    logo: [['color', 'Glyph color', 'color'], ['backgroundColor', 'Background', 'color'], ['fontSize', 'Font size', 'text'], ['borderRadius', 'Corner radius', 'text'], ['backgroundImage', 'Background image', 'image']],
  };
  const SHELL_DISPLAY_OPTIONS = [['block', 'Block'], ['flex', 'Flex'], ['inline-flex', 'Inline flex'], ['grid', 'Grid'], ['inline-grid', 'Inline grid'], ['inline-block', 'Inline block'], ['inline', 'Inline'], ['none', 'None']];
  const SHELL_FLEX_DIRECTIONS = [['row', 'Row'], ['column', 'Column'], ['row-reverse', 'Row reverse'], ['column-reverse', 'Column reverse']];
  const SHELL_JUSTIFY_OPTIONS = [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['space-evenly', 'Space evenly']];
  const SHELL_ALIGN_OPTIONS = [['stretch', 'Stretch'], ['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['baseline', 'Baseline']];
  const SHELL_FLEX_FIELDS = [['display', 'Display', SHELL_DISPLAY_OPTIONS], ['flexDirection', 'Direction', SHELL_FLEX_DIRECTIONS], ['flexWrap', 'Wrap', [['nowrap', 'No wrap'], ['wrap', 'Wrap'], ['wrap-reverse', 'Wrap reverse']]], ['justifyContent', 'Justify (main axis)', SHELL_JUSTIFY_OPTIONS], ['alignItems', 'Align items (cross axis)', SHELL_ALIGN_OPTIONS]];
  const SHELL_STYLE_FIELDS = {
    page: [['backgroundColor', 'Background', 'color'], ['backgroundImage', 'Background image', 'image'], ['color', 'Text color', 'color'], ['fontSize', 'Font size', 'text'], ['padding', 'Padding', 'text'], ['margin', 'Margin', 'text'], ['textAlign', 'Text alignment', 'align'], ['minHeight', 'Minimum height', 'text'], ['display', 'Display', SHELL_DISPLAY_OPTIONS]],
    header: [['padding', 'Padding', 'text'], ['margin', 'Margin', 'text'], ['gap', 'Gap between items', 'text'], ['backgroundColor', 'Background', 'color'], ['backgroundImage', 'Background image', 'image'], ['borderColor', 'Border color', 'color'], ['borderWidth', 'Border width', 'text'], ['borderRadius', 'Corner radius', 'text'], ['textAlign', 'Text alignment', 'align'], ...SHELL_FLEX_FIELDS],
    main: [['padding', 'Padding', 'text'], ['margin', 'Margin', 'text'], ['backgroundColor', 'Background', 'color'], ['backgroundImage', 'Background image', 'image'], ['borderColor', 'Border color', 'color'], ['borderWidth', 'Border width', 'text'], ['borderRadius', 'Corner radius', 'text'], ['width', 'Width', 'text'], ['maxWidth', 'Max width', 'text'], ['minHeight', 'Minimum height', 'text'], ...SHELL_FLEX_FIELDS],
    footer: [['padding', 'Padding', 'text'], ['margin', 'Margin', 'text'], ['gap', 'Gap between items', 'text'], ['backgroundColor', 'Background', 'color'], ['backgroundImage', 'Background image', 'image'], ['color', 'Text color', 'color'], ['borderColor', 'Border color', 'color'], ['borderWidth', 'Border width', 'text'], ['borderRadius', 'Corner radius', 'text'], ['textAlign', 'Text alignment', 'align'], ...SHELL_FLEX_FIELDS],
  };
  const BOX_EDGE_KEYS = {
    padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
    margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
    borderWidth: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'],
    borderColor: ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'],
    borderRadius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'],
  };
  const BOX_EDGE_PROP = {}; Object.keys(BOX_EDGE_KEYS).forEach((prop) => BOX_EDGE_KEYS[prop].forEach((key) => { BOX_EDGE_PROP[key] = prop; }));
  const BOX_EDGE_LABELS = ['Top', 'Right', 'Bottom', 'Left'];
  function expandBoxShorthand(value) {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return ['', '', '', ''];
    if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
    if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
    if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
    return [parts[0], parts[1], parts[2], parts[3]];
  }
  function boxEdgeValues(style, prop) {
    const keys = BOX_EDGE_KEYS[prop];
    if (keys.some((key) => style[key] !== undefined)) return keys.map((key) => style[key] || '');
    return expandBoxShorthand(style[prop]);
  }
  function boxEditor(prop, label, style, dataAttr, kind = 'text') {
    const values = boxEdgeValues(style, prop);
    const inputs = BOX_EDGE_KEYS[prop].map((key, index) => {
      if (kind === 'color') return `<label class="box-input"><span>${BOX_EDGE_LABELS[index]}</span><input type="color" ${dataAttr}="${key}" value="${escapeHtml(values[index] || '#cbd5e1')}"></label>`;
      return `<label class="box-input"><span>${BOX_EDGE_LABELS[index]}</span><input ${dataAttr}="${key}" value="${escapeHtml(values[index])}" placeholder="0px"></label>`;
    }).join('');
    return `<div class="box-field"><span class="box-field-label">${label}</span><div class="box-grid">${inputs}</div></div>`;
  }
  function applyBoxEdge(style, key, value) {
    const prop = BOX_EDGE_PROP[key];
    if (!prop) return false;
    const keys = BOX_EDGE_KEYS[prop];
    if (!keys.some((edge) => style[edge] !== undefined)) {
      const expanded = expandBoxShorthand(style[prop]);
      keys.forEach((edge, index) => { if (expanded[index]) style[edge] = expanded[index]; });
    }
    delete style[prop];
    style[key] = value;
    return true;
  }
  // Input paired with a button that opens the shared media library and writes a
  // site-relative URL back into the field.
  function assetInput(attrs, value, placeholder = 'media/file.png or https://…') {
    return `<div class="asset-input"><input ${attrs} value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}"><button type="button" class="button ghost small-button" data-library-pick title="Choose from the media library">Library</button></div>`;
  }
  function backgroundFitControls(dataAttr, style = {}) {
    const fitSelect = (key, label, options) => `<label>${label}<select data-${dataAttr}="${key}">${[['', 'Default'], ...options].map(([value, text]) => `<option value="${value}" ${String(style[key] || '') === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
    return `<div class="style-grid">${fitSelect('backgroundSize', 'Fill', [['cover', 'Cover (crop)'], ['contain', 'Contain (fit)'], ['100% 100%', 'Stretch'], ['auto', 'Original size']])}${fitSelect('backgroundRepeat', 'Repeat', [['no-repeat', 'No repeat'], ['repeat', 'Repeat'], ['repeat-x', 'Repeat X'], ['repeat-y', 'Repeat Y']])}</div>${fitSelect('backgroundPosition', 'Position', [['center', 'Center'], ['top', 'Top'], ['top left', 'Top left'], ['top right', 'Top right'], ['left', 'Left'], ['right', 'Right'], ['bottom', 'Bottom'], ['bottom left', 'Bottom left'], ['bottom right', 'Bottom right']])}`;
  }
  function templateStyleFields(child, settings) {
    const style = settings.templateStyles?.[child] || {};
    const kind = child === 'header.logo' ? 'logo' : 'text';
    const field = ([key, label, type]) => {
      if (type === 'color') return `<label>${label}<input type="color" data-branding-style="${key}" value="${escapeHtml(style[key] || (key === 'backgroundColor' ? '#6366f1' : '#f5f7ff'))}"></label>`;
      if (type === 'weight') return `<label>${label}<select data-branding-style="fontWeight">${[['', 'Default'], ['400', 'Regular'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Heavy']].map(([value, text]) => `<option value="${value}" ${(style.fontWeight || '') === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
      if (type === 'align') return `<label>${label}<select data-branding-style="textAlign">${[['', 'Default'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([value, text]) => `<option value="${value}" ${(style.textAlign || '') === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
      if (type === 'case') return `<label>${label}<select data-branding-style="textTransform">${[['', 'Default'], ['none', 'None'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase'], ['capitalize', 'Capitalize']].map(([value, text]) => `<option value="${value}" ${(style.textTransform || '') === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
      if (type === 'image') return `<label class="wide">${label}${assetInput(`data-branding-style="${key}"`, style[key])}</label>${backgroundFitControls('branding-style', style)}`;
      return `<label>${label}<input data-branding-style="${key}" value="${escapeHtml(style[key] || '')}" placeholder="e.g. 20px"></label>`;
    };
    return `<details class="inspector-group" open><summary>Appearance <span>⌃</span></summary><fieldset class="style-fields">${TEMPLATE_STYLE_FIELDS[kind].map(field).join('')}<button type="button" class="button secondary" data-branding-style-reset>Reset to default</button><p class="toolbar-hint">Applies site-wide to every page and the published site.</p></fieldset></details>`;
  }
  // Context-aware HTML attributes, keyed by the rendered element so only
  // attributes that make sense for the selected element are surfaced. Values
  // are stored as { name, value } pairs in block.data.attributes and flow
  // through the same safe attribute pipeline as custom rows.
  const ATTR_CONTEXT_FIELDS = {
    generic: [['id', 'ID'], ['class', 'Class'], ['title', 'Title'], ['lang', 'Language'], ['dir', 'Direction', [['ltr', 'LTR'], ['rtl', 'RTL'], ['auto', 'Auto']]]],
    a: [['href', 'Destination URL'], ['target', 'Open in', [['_self', 'Same tab'], ['_blank', 'New tab'], ['_parent', 'Parent frame'], ['_top', 'Top frame']]], ['rel', 'Relationship'], ['hreflang', 'Language code'], ['download', 'Download', 'bool']],
    img: [['src', 'Image source'], ['alt', 'Alt text'], ['width', 'Width'], ['height', 'Height'], ['loading', 'Loading', [['lazy', 'Lazy'], ['eager', 'Eager']]], ['decoding', 'Decoding', [['async', 'Async'], ['sync', 'Sync'], ['auto', 'Auto']]], ['sizes', 'Sizes'], ['srcset', 'Srcset']],
    button: [['type', 'Type', [['submit', 'Submit'], ['button', 'Button'], ['reset', 'Reset']]], ['name', 'Name'], ['value', 'Value'], ['disabled', 'Disabled', 'bool'], ['form', 'Form ID'], ['formaction', 'Form action URL'], ['autofocus', 'Autofocus', 'bool']],
    input: [['type', 'Type', [['text', 'Text'], ['email', 'Email'], ['password', 'Password'], ['number', 'Number'], ['url', 'URL'], ['tel', 'Telephone'], ['search', 'Search'], ['checkbox', 'Checkbox'], ['radio', 'Radio'], ['date', 'Date'], ['time', 'Time'], ['file', 'File'], ['color', 'Color'], ['range', 'Range'], ['hidden', 'Hidden']]], ['name', 'Name'], ['placeholder', 'Placeholder'], ['value', 'Value'], ['required', 'Required', 'bool'], ['disabled', 'Disabled', 'bool'], ['readonly', 'Readonly', 'bool'], ['min', 'Min'], ['max', 'Max'], ['step', 'Step'], ['pattern', 'Pattern'], ['size', 'Size'], ['autocomplete', 'Autocomplete', [['on', 'On'], ['off', 'Off'], ['name', 'Name'], ['email', 'Email'], ['url', 'URL'], ['tel', 'Telephone'], ['organization', 'Organization'], ['street-address', 'Street address'], ['postal-code', 'Postal code'], ['country', 'Country']]]],
    textarea: [['name', 'Name'], ['placeholder', 'Placeholder'], ['rows', 'Rows'], ['cols', 'Cols'], ['required', 'Required', 'bool'], ['disabled', 'Disabled', 'bool'], ['readonly', 'Readonly', 'bool'], ['maxlength', 'Max length'], ['wrap', 'Wrap', [['soft', 'Soft'], ['hard', 'Hard']]]],
    select: [['name', 'Name'], ['multiple', 'Multiple', 'bool'], ['required', 'Required', 'bool'], ['disabled', 'Disabled', 'bool'], ['size', 'Size']],
    iframe: [['src', 'Source URL'], ['width', 'Width'], ['height', 'Height'], ['title', 'Title'], ['loading', 'Loading', [['lazy', 'Lazy'], ['eager', 'Eager']]], ['allow', 'Allow list'], ['allowfullscreen', 'Allow fullscreen', 'bool'], ['sandbox', 'Sandbox', [['allow-scripts', 'Allow scripts'], ['allow-same-origin', 'Allow same origin'], ['allow-forms', 'Allow forms'], ['allow-popups', 'Allow popups']]], ['referrerpolicy', 'Referrer policy', [['no-referrer', 'No referrer'], ['no-referrer-when-downgrade', 'Downgrade'], ['origin', 'Origin only'], ['same-origin', 'Same origin'], ['strict-origin', 'Strict origin'], ['strict-origin-when-cross-origin', 'Strict cross origin'], ['unsafe-url', 'Unsafe URL']]]],
    video: [['src', 'Source URL'], ['width', 'Width'], ['height', 'Height'], ['poster', 'Poster URL'], ['controls', 'Controls', 'bool'], ['autoplay', 'Autoplay', 'bool'], ['muted', 'Muted', 'bool'], ['loop', 'Loop', 'bool'], ['playsinline', 'Plays inline', 'bool']],
    ol: [['reversed', 'Reversed', 'bool'], ['start', 'Start'], ['type', 'Type', [['1', '1'], ['a', 'a'], ['A', 'A'], ['i', 'i'], ['I', 'I']]]],
    li: [['value', 'Value']],
    th: [['colspan', 'Column span'], ['rowspan', 'Row span'], ['scope', 'Scope', [['col', 'Column'], ['row', 'Row'], ['colgroup', 'Column group'], ['rowgroup', 'Row group']]], ['abbr', 'Abbreviation'], ['headers', 'Headers']],
    td: [['colspan', 'Column span'], ['rowspan', 'Row span'], ['headers', 'Headers']],
    form: [['action', 'Action URL'], ['method', 'Method', [['get', 'GET'], ['post', 'POST']]], ['name', 'Name'], ['target', 'Target', [['_self', 'Same tab'], ['_blank', 'New tab'], ['_parent', 'Parent frame'], ['_top', 'Top frame']]], ['enctype', 'Encoding', [['application/x-www-form-urlencoded', 'URL encoded'], ['multipart/form-data', 'Multipart form'], ['text/plain', 'Plain text']]], ['autocomplete', 'Autocomplete', [['on', 'On'], ['off', 'Off']]], ['novalidate', 'No validation', 'bool']],
    label: [['for', 'For (control ID)']],
    details: [['name', 'Name'], ['open', 'Open', 'bool']],
    dialog: [['open', 'Open', 'bool']],
    time: [['datetime', 'Datetime']],
    blockquote: [['cite', 'Citation URL']],
    nav: [['aria-label', 'Accessible label']],
  };
  const TEXT_BLOCK_TYPES = new Set(['heading', 'paragraph', 'rich_text', 'quote', 'link', 'button', 'list', 'callout', 'alert', 'hero', 'card', 'cta', 'badge', 'breadcrumb', 'list-group', 'accordion', 'pricing', 'stats', 'span', 'nav', 'form', 'navbar']);
  const TEXT_HTML_TAGS = new Set(['a', 'address', 'blockquote', 'button', 'code', 'dd', 'dt', 'em', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'li', 'mark', 'ol', 'p', 'pre', 'small', 'span', 'strong', 'summary', 'td', 'textarea', 'th', 'time', 'ul']);
  function isTextContext(block) { if (block.type === 'html_element') return TEXT_HTML_TAGS.has(block.data?.tag); return TEXT_BLOCK_TYPES.has(block.type); }
  function isImageContext(block) { if (block.type === 'html_element') return ['img', 'video'].includes(block.data?.tag); return ['image', 'video'].includes(block.type); }
  const BLOCK_TYPE_CONTEXT = { image: 'img', link: 'a' };
  function elementContext(block) { if (block.type === 'html_element') return HTML_ELEMENT_TAGS.has(block.data?.tag) ? block.data.tag : 'generic'; return BLOCK_TYPE_CONTEXT[block.type] || 'generic'; }
  function elementAttrDefs(block) {
    const ctx = elementContext(block);
    const specific = (block.type === 'html_element' || ctx === 'img' || ctx === 'a') && ATTR_CONTEXT_FIELDS[ctx] ? ATTR_CONTEXT_FIELDS[ctx] : [];
    const skip = new Set(ctx === 'img' ? ['src', 'alt'] : ctx === 'a' ? ['href'] : []);
    return [...specific.filter((def) => !skip.has(def[0])), ...ATTR_CONTEXT_FIELDS.generic];
  }
  function managedAttrNames(block) { return new Set(elementAttrDefs(block).map((def) => def[0])); }
  function attrValue(block, name) { const list = Array.isArray(block.data?.attributes) ? block.data.attributes : []; const pair = list.find((item) => item && item.name === name); return pair ? String(pair.value ?? '') : ''; }
  function attrPresent(block, name) { return (Array.isArray(block.data?.attributes) ? block.data.attributes : []).some((item) => item && item.name === name); }
  function contextAttributeFields(block, key) {
    const inputs = elementAttrDefs(block).map(([name, label, options]) => {
      if (options === 'bool') return `<label class="check-row"><input type="checkbox" data-attr-ctx="${name}" data-block-path="${key}" ${attrPresent(block, name) ? 'checked' : ''}> ${label}</label>`;
      if (Array.isArray(options)) { const value = attrValue(block, name); return `<label>${label}<select data-attr-ctx="${name}" data-block-path="${key}">${[['', 'Default'], ...options].map(([option, text]) => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`; }
      return `<label>${label}<input data-attr-ctx="${name}" data-block-path="${key}" value="${escapeHtml(attrValue(block, name))}" placeholder="${escapeHtml(label)}"></label>`;
    }).join('');
    return inputs ? `<div class="style-grid">${inputs}</div>` : '';
  }
function blockStyleFields(block) {
    const style = block.style || {};
    const select = (key, label, options) => `<label>${label}<select data-block-style="${key}">${[['', 'Default'], ...options].map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(style[key] || '') === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;
    const input = (key, label, placeholder = '', value = style[key] || '') => `<label>${label}<input data-block-style="${key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></label>`;
    const color = (key, label, fallback) => `<label>${label}<input type="color" data-block-style="${key}" value="${style[key] || fallback}"></label>`;
    const textContext = isTextContext(block);
    const imageContext = isImageContext(block);
    const layout = `<div class="style-grid"><label>Width<input data-block-style="width" value="${escapeHtml(style.width || 'auto')}" placeholder="auto, 100%, 320px"></label><label>Height<input data-block-style="height" value="${escapeHtml(style.height || 'auto')}" placeholder="auto, 100%, 320px"></label></div><div class="style-grid">${input('minWidth', 'Min width', 'auto, 100%, 320px')}${input('maxWidth', 'Max width', 'none, 100%, 720px')}</div><div class="style-grid">${input('minHeight', 'Min height', 'auto, 100%, 320px')}${input('maxHeight', 'Max height', 'none, 100%, 720px')}</div>${boxEditor('padding', 'Padding', style, 'data-block-style')}${boxEditor('margin', 'Margin', style, 'data-block-style')}${select('position', 'Position', [['static', 'Static'], ['relative', 'Relative'], ['absolute', 'Absolute'], ['fixed', 'Fixed'], ['sticky', 'Sticky']])}<div class="style-grid">${input('top', 'Top', 'auto')}${input('right', 'Right', 'auto')}</div><div class="style-grid">${input('bottom', 'Bottom', 'auto')}${input('left', 'Left', 'auto')}</div><div class="style-grid">${input('zIndex', 'Z-index', 'auto')}${select('overflow', 'Overflow', [['visible', 'Visible'], ['hidden', 'Hidden'], ['clip', 'Clip'], ['scroll', 'Scroll'], ['auto', 'Auto']])}</div><div class="style-grid">${select('float', 'Float', [['none', 'None'], ['left', 'Left'], ['right', 'Right']])}${select('clear', 'Clear', [['none', 'None'], ['left', 'Left'], ['right', 'Right'], ['both', 'Both']])}</div><div class="style-grid">${select('boxSizing', 'Box sizing', [['content-box', 'Content box'], ['border-box', 'Border box']])}${select('display', 'Display', [['block', 'Block'], ['inline', 'Inline'], ['inline-block', 'Inline block'], ['flex', 'Flex'], ['inline-flex', 'Inline flex'], ['grid', 'Grid'], ['inline-grid', 'Inline grid'], ['flow-root', 'Flow root'], ['contents', 'Contents'], ['none', 'None']])}</div>`;
    const flex = `<div class="style-grid">${select('flexDirection', 'Direction', [['row', 'Row'], ['row-reverse', 'Row reverse'], ['column', 'Column'], ['column-reverse', 'Column reverse']])}${select('flexWrap', 'Wrap', [['nowrap', 'No wrap'], ['wrap', 'Wrap'], ['wrap-reverse', 'Wrap reverse']])}</div><div class="style-grid">${select('justifyContent', 'Justify (main axis)', [['flex-start', 'Flex start'], ['center', 'Center'], ['flex-end', 'Flex end'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['space-evenly', 'Space evenly']])}${select('alignItems', 'Align items (cross axis)', [['stretch', 'Stretch'], ['flex-start', 'Flex start'], ['center', 'Center'], ['flex-end', 'Flex end'], ['baseline', 'Baseline']])}</div><div class="style-grid">${select('alignSelf', 'Align self', [['auto', 'Auto'], ['stretch', 'Stretch'], ['flex-start', 'Flex start'], ['center', 'Center'], ['flex-end', 'Flex end'], ['baseline', 'Baseline']])}${input('gap', 'Gap', '8px')}</div><div class="style-grid">${input('flex', 'Flex', '1, 1 1 auto, 0 0 240px')}${input('order', 'Order', '0')}</div>`;
    const typography = textContext ? `<div class="style-grid">${input('fontFamily', 'Font family', 'Arial, Helvetica, sans-serif')}${input('fontSize', 'Font size', '16px')}</div><div class="style-grid">${select('fontWeight', 'Weight', [['100', 'Thin'], ['200', 'Extra light'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Heavy'], ['900', 'Black']])}${select('fontStyle', 'Style', [['normal', 'Normal'], ['italic', 'Italic'], ['oblique', 'Oblique']])}</div><div class="style-grid">${input('lineHeight', 'Line height', '1.5')}${input('letterSpacing', 'Letter spacing', '0px')}</div><div class="style-grid">${input('wordSpacing', 'Word spacing', '0px')}${select('textAlign', 'Text align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']])}</div><div class="style-grid">${select('textTransform', 'Case', [['none', 'None'], ['uppercase', 'UPPERCASE'], ['lowercase', 'lowercase'], ['capitalize', 'Capitalize']])}${select('textDecoration', 'Decoration', [['none', 'None'], ['underline', 'Underline'], ['line-through', 'Line through'], ['overline', 'Overline']])}</div><div class="style-grid">${select('whiteSpace', 'White space', [['normal', 'Normal'], ['nowrap', 'No wrap'], ['pre', 'Pre'], ['pre-wrap', 'Pre wrap'], ['pre-line', 'Pre line']])}${select('wordBreak', 'Word break', [['normal', 'Normal'], ['break-all', 'Break all'], ['keep-all', 'Keep all'], ['break-word', 'Break word']])}</div>${input('textShadow', 'Text shadow', '1px 1px 2px rgba(0,0,0,0.5)')}${color('textDecorationColor', 'Decoration color', '#cbd5e1')}` : '';
    const image = imageContext ? `<div class="style-grid">${select('objectFit', 'Object fit', [['fill', 'Fill'], ['contain', 'Contain'], ['cover', 'Cover'], ['none', 'None'], ['scale-down', 'Scale down']])}${input('objectPosition', 'Object position', 'center')}</div>` : '';
    const appearance = `<div class="style-grid">${color('color', 'Text color', '#f5f7ff')}${color('backgroundColor', 'Background', '#111a31')}</div><label>Background image${assetInput('data-block-style="backgroundImage"', style.backgroundImage)}</label>${backgroundFitControls('block-style', style)}<div class="style-grid">${input('opacity', 'Opacity', '1')}${select('cursor', 'Cursor', [['auto', 'Auto'], ['default', 'Default'], ['pointer', 'Pointer'], ['text', 'Text'], ['move', 'Move'], ['grab', 'Grab'], ['not-allowed', 'Not allowed'], ['wait', 'Wait']])}</div>${input('boxShadow', 'Box shadow', '0 4px 12px rgba(0,0,0,0.2)')}${input('filter', 'Filter', 'blur(2px) brightness(0.9)…')}${input('transform', 'Transform', 'rotate(2deg) scale(1.05)…')}${input('transition', 'Transition', 'all 0.3s ease')}`;
    return `<details class="inspector-group" open><summary>Layout & spacing <span>⌃</span></summary><fieldset class="style-fields">${layout}<div class="align-toolbar"><span class="toolbar-label">Alignment</span><button type="button" class="align-btn ${!style.textAlign || style.textAlign === 'left' ? 'active' : ''}" data-align-style="left">Left</button><button type="button" class="align-btn ${style.textAlign === 'center' ? 'active' : ''}" data-align-style="center">Center</button><button type="button" class="align-btn ${style.textAlign === 'right' ? 'active' : ''}" data-align-style="right">Right</button></div><div class="align-toolbar"><span class="toolbar-label">Arrangement</span><button type="button" class="align-btn ${style.display === 'flex' && style.flexDirection === 'row' ? 'active' : ''}" data-flow-style="row">Row</button><button type="button" class="align-btn ${style.display === 'flex' && style.flexDirection !== 'row' ? 'active' : ''}" data-flow-style="stack">Stack</button><button type="button" class="align-btn" data-flow-style="equal">= widths</button><span class="toolbar-hint">Layouts children with flexbox</span></div></fieldset></details><details class="inspector-group" open><summary>Flex layout <span>⌃</span></summary><fieldset class="style-fields">${flex}</fieldset></details>${typography ? `<details class="inspector-group" open><summary>Typography <span>⌃</span></summary><fieldset class="style-fields">${typography}</fieldset></details>` : ''}${image ? `<details class="inspector-group" open><summary>Image <span>⌃</span></summary><fieldset class="style-fields">${image}</fieldset></details>` : ''}<details class="inspector-group" open><summary>Border <span>⌃</span></summary><fieldset class="style-fields">${boxEditor('borderWidth', 'Border width', style, 'data-block-style')}${boxEditor('borderColor', 'Border color', style, 'data-block-style', 'color')}${boxEditor('borderRadius', 'Corner radius', style, 'data-block-style')}${select('borderStyle', 'Border style', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double'], ['none', 'None']])}</fieldset></details><details class="inspector-group" open><summary>Appearance & effects <span>⌃</span></summary><fieldset class="style-fields">${appearance}</fieldset></details>`;
  }
  function blockFields(block, path, includeStyle = true) {
    const key = pathKey(path); const field = (name, label, value, extra = '') => `<label${extra ? ' class="wide"' : ''}>${label}<input data-block-field="${name}" data-block-path="${key}" value="${escapeHtml(value)}"></label>`;
    const textField = (label = 'Text') => `<label class="wide">${label}<textarea data-block-field="text" data-block-path="${key}" rows="4">${escapeHtml(block.text || '')}</textarea></label>`;
    const columns = Math.max(1, Math.min(3, Number(normalizedLayout(currentDocument().metadata?.layout).columns) || 1)); const columnField = columns > 1 ? `<label>Column<select data-block-field="column" data-block-path="${key}">${Array.from({ length: columns }, (_, column) => `<option value="${column + 1}" ${Number(block.data?.column || 1) === column + 1 ? 'selected' : ''}>Column ${column + 1}</option>`).join('')}</select></label>` : '';
    let content = '';
    if (block.type === 'heading') content = `${textField('Heading text')}<label>Level<select data-block-field="level" data-block-path="${key}">${[1, 2, 3, 4, 5, 6].map((level) => `<option value="${level}" ${Number(block.level) === level ? 'selected' : ''}>H${level}</option>`).join('')}</select></label>`;
    else if (['paragraph', 'rich_text', 'quote', 'callout', 'alert', 'hero', 'card', 'cta'].includes(block.type)) content = textField(block.type === 'quote' ? 'Quote' : 'Content');
    else if (['link', 'button'].includes(block.type)) content = `${field('text', block.type === 'button' ? 'Button label' : 'Link label', block.text || '')}${field('url', 'Destination URL', block.url || '')}`;
    else if (block.type === 'image') content = `<label class="wide">Image URL${assetInput(`data-block-field="url" data-block-path="${key}"`, block.url)}</label><label>Alt text<input data-block-field="alt" data-block-path="${key}" value="${escapeHtml(block.alt || '')}"></label>`;
    else if (block.type === 'video') content = field('url', 'Video URL', block.url || '', 'wide');
    else if (block.type === 'list') content = textField('List items (one per line)');
    else if (block.type === 'html_element') {
      const tag = HTML_ELEMENT_TAGS.has(block.data?.tag) ? block.data.tag : 'div';
      const tagOptions = Array.from(HTML_ELEMENT_TAGS).sort().map((option) => `<option value="${option}" ${option === tag ? 'selected' : ''}>${option}</option>`).join('');
      content = `<label>HTML element<select data-block-field="tag" data-block-path="${key}">${tagOptions}</select></label>`;
      if (tag === 'img') content += `<label class="wide">Image URL${assetInput(`data-block-field="url" data-block-path="${key}"`, block.url)}</label><label>Alt text<input data-block-field="alt" data-block-path="${key}" value="${escapeHtml(block.alt || '')}"></label>`;
      else if (!VOID_HTML_ELEMENT_TAGS.has(tag)) content += textField('Element text');
    } else if (['container', 'section', 'div', 'span', 'form', 'nav', 'feature-grid', 'navbar', 'button-group', 'list-group', 'accordion', 'stats'].includes(block.type)) content = `<p class="muted block-note">This element can contain child elements. Use the + action beside it in the hierarchy.</p>`;
    else if (['badge', 'breadcrumb', 'pricing'].includes(block.type)) content = textField('Content');
    if (['callout', 'alert'].includes(block.type)) content += `<label>Tone<select data-block-field="tone" data-block-path="${key}">${['info', 'success', 'warning', 'danger'].map((tone) => `<option value="${tone}" ${block.tone === tone ? 'selected' : ''}>${tone}</option>`).join('')}</select></label>`;
    const contentGroup = (content || columnField) ? `<details class="inspector-group" open><summary>Content <span>⌃</span></summary><fieldset class="style-fields">${content}${columnField}</fieldset></details>` : '';
    return `${contentGroup}${blockAttributeFields(block, key)}${includeStyle ? blockStyleFields(block) : ''}`;
  }
  function blockAttributeFields(block, key) {
    const list = Array.isArray(block.data?.attributes) ? block.data.attributes : [];
    const managed = managedAttrNames(block);
    const rawList = list.filter((pair) => !(pair && managed.has(pair.name)));
    const rows = rawList.map((pair, index) => {
      const actual = list.indexOf(pair);
      return `<div class="attr-row"><input data-attr-name="${actual}" data-block-path="${key}" value="${escapeHtml(pair.name || '')}" placeholder="name" aria-label="Attribute name"><input data-attr-value="${actual}" data-block-path="${key}" value="${escapeHtml(pair.value || '')}" placeholder="value" aria-label="Attribute value"><button type="button" class="tree-action danger" data-attr-remove="${actual}" data-block-path="${key}" title="Remove attribute">×</button></div>`;
    }).join('');
    const context = contextAttributeFields(block, key);
    return `<details class="inspector-group" open><summary>HTML attributes <span>⌃</span></summary><fieldset class="style-fields">${context ? `<p class="muted block-note">Common attributes for ${block.type === 'html_element' ? '&lt;' + escapeHtml(elementContext(block)) + '&gt;' : 'this element'} — empty fields are omitted.</p>${context}` : ''}${rows || '<p class="muted block-note">No custom attributes on this element.</p>'}<button type="button" class="button secondary" data-attr-add="${key}">+ Add attribute</button><p class="toolbar-hint">id, class, data-*, aria-*, role, title… applied to the rendered element. Event handlers (on*) and style are ignored.</p></fieldset></details>`;
  }
  function bindBlockFields(target) {
    const selectedBlock = () => blockAtPath(state.selectedBlockPath);
    target.querySelectorAll('[data-block-field],[data-block-style]').forEach((node) => { const update = () => { const path = node.dataset.blockPath ? parsePath(node.dataset.blockPath) : state.selectedBlockPath; const block = blockAtPath(path); if (!block) return; if (node.dataset.blockStyle) { const style = (block.style ||= {}); const key = node.dataset.blockStyle; const value = node.value; applyBoxEdge(style, key, value); if (!value.trim()) delete style[key]; else if (!BOX_EDGE_PROP[key]) style[key] = value; } else { let value = node.value; if (['level', 'column'].includes(node.dataset.blockField)) value = Number(value); if (node.dataset.blockField === 'tag') block.data = { ...(block.data || {}), tag: value }; else if (node.dataset.blockField === 'column') block.data = { ...(block.data || {}), column: value }; else block[node.dataset.blockField] = value; } renderBlockEditor(); renderPreview(); scheduleHistory(); }; node.onchange = update; node.oninput = update; });
    target.querySelectorAll('[data-align-style]').forEach((node) => { node.onclick = () => { const block = selectedBlock(); if (!block) return; block.style ||= {}; block.style.textAlign = node.dataset.alignStyle; renderBlockEditor(); renderPreview(); scheduleHistory(); }; });
    target.querySelectorAll('[data-flow-style]').forEach((node) => { node.onclick = () => { const block = selectedBlock(); if (!block) return; block.style ||= {}; const mode = node.dataset.flowStyle; if (mode === 'row') { block.style.display = 'flex'; block.style.flexDirection = 'row'; block.style.gap = block.style.gap || '16px'; } else if (mode === 'stack') { block.style.display = 'flex'; block.style.flexDirection = 'column'; block.style.gap = block.style.gap || '8px'; } else if (mode === 'equal') { block.style.display = 'flex'; block.style.flexDirection = 'row'; block.style.gap = block.style.gap || '16px'; (block.children || []).forEach((child) => { child.style ||= {}; child.style.flex = '1'; child.style.minWidth = '0'; }); } renderBlockEditor(); renderPreview(); scheduleHistory(); }; });
    target.querySelectorAll('[data-attr-name],[data-attr-value]').forEach((node) => { const update = () => { const block = blockAtPath(parsePath(node.dataset.blockPath)); if (!block) return; const index = Number(node.hasAttribute('data-attr-name') ? node.dataset.attrName : node.dataset.attrValue); block.data ||= {}; block.data.attributes ||= []; const pair = (block.data.attributes[index] ||= { name: '', value: '' }); if (node.hasAttribute('data-attr-name')) pair.name = node.value; else pair.value = node.value; renderPreview(); scheduleHistory(); }; node.oninput = update; node.onchange = update; });
    target.querySelectorAll('[data-attr-remove]').forEach((node) => { node.onclick = () => { const block = blockAtPath(parsePath(node.dataset.blockPath)); if (!block?.data?.attributes) return; block.data.attributes.splice(Number(node.dataset.attrRemove), 1); renderBlockEditor(); renderPreview(); scheduleHistory(); }; });
    target.querySelectorAll('[data-attr-add]').forEach((node) => { node.onclick = () => { const block = blockAtPath(parsePath(node.dataset.attrAdd)); if (!block) return; block.data ||= {}; block.data.attributes ||= []; block.data.attributes.push({ name: '', value: '' }); renderBlockEditor(); renderPreview(); scheduleHistory(); }; });
    target.querySelectorAll('[data-attr-ctx]').forEach((node) => { const update = () => { const block = blockAtPath(parsePath(node.dataset.blockPath)); if (!block) return; block.data ||= {}; block.data.attributes ||= []; const name = node.dataset.attrCtx; const isBool = node.type === 'checkbox'; const value = isBool ? '' : node.value; const keep = isBool ? node.checked : Boolean(value.trim()); if (!keep) block.data.attributes = block.data.attributes.filter((pair) => !(pair && pair.name === name)); else { let pair = block.data.attributes.find((item) => item && item.name === name); if (!pair) { block.data.attributes.push({ name: '', value: '' }); pair = block.data.attributes[block.data.attributes.length - 1]; } pair.name = name; pair.value = value; } renderPreview(); scheduleHistory(); }; node.oninput = update; node.onchange = update; });
  }
  function bindBrandingStyles(child, container) {
    const apply = () => {
      state.site.settings ||= {}; state.site.settings.templateStyles ||= {}; const target = (state.site.settings.templateStyles[child] ||= {});
      for (const key of Object.keys(target)) if (!String(target[key] || '').trim()) delete target[key];
      renderPreview();
      scheduleSaveSettings('templateStyles', state.site.settings.templateStyles);
    };
    container.querySelectorAll('[data-branding-style]').forEach((node) => { node.oninput = node.onchange = () => { state.site.settings ||= {}; state.site.settings.templateStyles ||= {}; const target = (state.site.settings.templateStyles[child] ||= {}); target[node.dataset.brandingStyle] = node.value; apply(); }; });
    container.querySelectorAll('[data-branding-style-reset]').forEach((node) => { node.onclick = () => { state.site.settings ||= {}; if (state.site.settings.templateStyles) delete state.site.settings.templateStyles[child]; renderElementInspector(); renderPreview(); scheduleSaveSettings('templateStyles', state.site.settings.templateStyles || {}); }; });
  }
  function shellStyleFields(shell, settings) {
    const style = settings.shellStyles?.[shell] || {};
    const field = ([key, label, type]) => {
      if (BOX_EDGE_KEYS[key]) return boxEditor(key, label, style, 'data-shell-style', type === 'color' ? 'color' : 'text');
      if (Array.isArray(type)) return `<label>${label}<select data-shell-style="${key}">${[['', 'Default'], ...type].map(([value, text]) => `<option value="${escapeHtml(value)}" ${String(style[key] || '') === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;
      if (type === 'color') return `<label>${label}<input type="color" data-shell-style="${key}" value="${escapeHtml(style[key] || (key === 'backgroundColor' ? '#ffffff' : key === 'color' ? '#1f2937' : '#cbd5e1'))}"></label>`;
      if (type === 'align') return `<label>${label}<select data-shell-style="textAlign">${[['', 'Default'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([value, text]) => `<option value="${value}" ${(style.textAlign || '') === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
      if (type === 'image') return `<label class="wide">${label}${assetInput(`data-shell-style="${key}"`, style[key])}</label>${backgroundFitControls('shell-style', style)}`;
      return `<label>${label}<input data-shell-style="${key}" value="${escapeHtml(style[key] || '')}" placeholder="e.g. 24px"></label>`;
    };
    const label = { page: 'Page', header: 'Header', main: 'Main content', footer: 'Footer' }[shell] || shell;
    return `<details class="inspector-group" open><summary>${label} appearance <span>⌃</span></summary><fieldset class="style-fields">${SHELL_STYLE_FIELDS[shell].map(field).join('')}<button type="button" class="button secondary" data-shell-style-reset>Reset to default</button><p class="toolbar-hint">Applies to this container on every page and the published site.</p></fieldset></details>`;
  }
  function bindShellStyles(shell, container) {
    const apply = () => {
      state.site.settings ||= {}; state.site.settings.shellStyles ||= {}; const target = (state.site.settings.shellStyles[shell] ||= {});
      for (const key of Object.keys(target)) if (!String(target[key] || '').trim()) delete target[key];
      renderPreview();
      scheduleSaveSettings('shellStyles', state.site.settings.shellStyles);
    };
    container.querySelectorAll('[data-shell-style]').forEach((node) => { node.oninput = node.onchange = () => { state.site.settings ||= {}; state.site.settings.shellStyles ||= {}; const target = (state.site.settings.shellStyles[shell] ||= {}); if (!applyBoxEdge(target, node.dataset.shellStyle, node.value)) target[node.dataset.shellStyle] = node.value; apply(); }; });
    container.querySelectorAll('[data-shell-style-reset]').forEach((node) => { node.onclick = () => { state.site.settings ||= {}; if (state.site.settings.shellStyles) delete state.site.settings.shellStyles[shell]; renderElementInspector(); renderPreview(); scheduleSaveSettings('shellStyles', state.site.settings.shellStyles || {}); }; });
  }
  function renderElementInspector() { renderElementInspectorInner(); }
  function renderElementInspectorInner() {
    const target = el('element-inspector'); const fields = el('selected-element-fields'); const styleFields = el('selected-style-fields'); const styleHint = el('style-selection-hint'); const path = state.selectedBlockPath; const block = path ? blockAtPath(path) : null; const shell = state.selectedShell; const shellChild = state.selectedShellChild;
    if (!target || !fields) return;
    const selectionKey = block ? `block:${pathKey(path)}` : shellChild ? `shell-child:${shellChild}` : shell ? `shell:${shell}` : '';
    state.inspectorSelectionKey = selectionKey;
    if (state.propertiesFields) state.propertiesFields.classList.toggle('hidden', Boolean(block || shell || shellChild));
    if (!block && shellChild) {
      const settings = state.site?.settings || {};
      const defs = {
        'header.logo': { title: 'Header logo', hint: 'Site-wide branding', inputs: [['logoText', 'Logo letter', settings.logoText || ''], ['logoUrl', 'Logo image URL', settings.logoUrl || '']] },
        'header.name': { title: 'Header site name', hint: 'Site-wide branding', inputs: [['siteName', 'Site name', settings.siteName || state.site?.name || '']] },
        'footer.name': { title: 'Footer site name', hint: 'Site-wide branding', inputs: [['siteName', 'Site name', settings.siteName || state.site?.name || '']] },
        'footer.note': { title: 'Footer note', hint: 'Site-wide branding', inputs: [['footerNote', 'Footer note', settings.footerNote === undefined ? 'Published with Sitemaster' : settings.footerNote]] },
      }[shellChild];
      if (defs) {
        target.classList.remove('hidden'); setText('selected-element-title', defs.title);
        fields.innerHTML = defs.inputs.map(([key, label, value]) => `<label class="wide">${label}<input data-branding-field="${key}" value="${escapeHtml(value)}"></label>`).join('') + `<p class="muted block-note">Site-wide branding — this change applies to every page and the published site.</p>`;
        fields.querySelectorAll('[data-branding-field]').forEach((input) => { input.oninput = () => { const key = input.dataset.brandingField; state.site.settings ||= {}; state.site.settings[key] = input.value; renderPageTree(currentDocument().blocks || []); renderPreview(); scheduleSaveSettings(key, input.value); }; });
        if (styleFields) { styleFields.innerHTML = templateStyleFields(shellChild, settings); bindBrandingStyles(shellChild, styleFields); }
        if (styleHint) styleHint.hidden = true;
        return;
      }
    }
    if (!block && shell) {
      const settings = state.site?.settings || {};
      target.classList.remove('hidden'); setText('selected-element-title', { header: 'Header', main: 'Main content', footer: 'Footer' }[shell] || shell);
      const hint = { header: 'This template shell groups the header elements. Select a child (logo or site name) to change its content.', main: 'The main content area holds the page blocks. Select a block in the Layers tree or on the canvas to edit it.', footer: 'This template shell groups the footer elements. Select a child (site name or footer note) to change its content.' }[shell] || '';
      fields.innerHTML = `<p class="muted block-note">${hint}</p>`;
      if (styleFields) { styleFields.innerHTML = shellStyleFields(shell, settings); bindShellStyles(shell, styleFields); }
      if (styleHint) styleHint.hidden = true;
      return;
    }
    if (!block) {
      const settings = state.site?.settings || {};
      target.classList.remove('hidden'); setText('selected-element-title', isContentEditor() ? 'Entry' : 'Page');
      fields.innerHTML = '<p class="muted block-note">These properties apply to the whole document. Select an element in the Layers tree or on the canvas to edit that element instead.</p>';
      if (styleFields) { styleFields.innerHTML = shellStyleFields('page', settings); bindShellStyles('page', styleFields); }
      if (styleHint) styleHint.hidden = true;
      return;
    }
    target.classList.remove('hidden'); setText('selected-element-title', `${blockLabel(block.type)}`); fields.innerHTML = blockFields(block, path, false); bindBlockFields(fields); if (styleFields) { styleFields.innerHTML = blockStyleFields(block); bindBlockFields(styleFields); } if (styleHint) styleHint.hidden = true;
  }
  function runLayerOp(op) {
    const shellToken = selectedShellToken();
    if (shellToken) {
      if (op === 'up') { moveShellOrderToken(shellToken.shell, shellToken.token, -1); renderBlockEditor(); renderPreview(); }
      else if (op === 'down') { moveShellOrderToken(shellToken.shell, shellToken.token, 1); renderBlockEditor(); renderPreview(); }
      else if (op === 'delete' && shellToken.token.startsWith('block:')) { deleteBlock([Number(shellToken.token.slice(6))]); }
      else if (op === 'add') { addBlock('paragraph', null, { shell: shellToken.shell }); }
      return;
    }
    const path = state.selectedBlockPath;
    if (!path) return;
    if (op === 'up') moveBlockUp(path);
    else if (op === 'down') moveBlockDown(path);
    else if (op === 'out') outdentBlock(path);
    else if (op === 'in') indentBlock(path);
    else if (op === 'duplicate') duplicateBlock(path);
    else if (op === 'delete') deleteBlock(path);
    else if (op === 'add') addBlock('paragraph', path, { shell: state.selectedShell || undefined });
  }
  function selectedShellToken() {
    if (state.selectedShellChild) {
      const [shell, child] = state.selectedShellChild.split('.');
      return { shell, token: `branding:${child}` };
    }
    const shell = activeScope();
    if (shell && state.selectedBlockPath && state.selectedBlockPath.length === 1) {
      return { shell, token: `block:${state.selectedBlockPath[0]}` };
    }
    return null;
  }
  function updateLayersToolbar() {
    const toolbar = el('layers-toolbar'); if (!toolbar) return;
    const path = state.selectedBlockPath;
    const shellToken = selectedShellToken();
    toolbar.querySelectorAll('[data-layer-op]').forEach((node) => {
      const op = node.dataset.layerOp;
      let enabled;
      if (shellToken) {
        const order = shellOrder(shellToken.shell);
        const index = order.indexOf(shellToken.token);
        enabled = op === 'up' ? index > 0
          : op === 'down' ? index >= 0 && index < order.length - 1
          : op === 'delete' ? shellToken.token.startsWith('block:')
          : op === 'add' ? true
          : false;
      } else {
        enabled = !!path && (op !== 'out' || path.length >= 2);
      }
      node.disabled = !enabled;
      node.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    });
  }
  function treeNodeMarkup(block, path, scope = '', token = '') { const key = scopeKey(scope, path); const children = block.children || []; const dragAttrs = ` data-tree-path="${key}"` + (token ? ` data-tree-token="${scope}:${token}" data-shell-token-index="${path[path.length - 1]}"` : ''); return `<div class="tree-entry"><div class="tree-node-row"><button type="button" class="tree-node ${currentSelectionKey() === key ? 'active' : ''}"${dragAttrs} data-select-path="${key}" data-block-type="${escapeHtml(block.type || '')}" data-block-tag="${escapeHtml(blockTag(block))}"><span class="tree-branch">└</span><span class="tree-drag">⠿</span><span class="tree-type-icon" aria-hidden="true">${paletteIcon(block.type === 'html_element' ? block.data?.tag : block.type)}</span><span><strong>${escapeHtml(blockTag(block))}</strong><small>${escapeHtml(blockLabel(block.type, block))} · Element ${path[path.length - 1] + 1}</small></span></button></div>${children.length ? `<div class="tree-children">${children.map((child, index) => treeNodeMarkup(child, [...path, index], scope)).join('')}</div>` : ''}</div>`; }
  function renderPageTree(blocks) {
    const tree = el('page-tree'); if (!tree) return; const prevScroll = tree.scrollTop; const layout = normalizedLayout(currentDocument().metadata?.layout || {}); const rootLabel = isContentEditor() ? 'Entry body' : 'Page canvas'; const total = countBlocks(blocks); const settings = state.site?.settings || {}; const siteName = settings.siteName || state.site?.name || 'Website'; const shellNode = (shell, label, icon, subtitle, children = []) => `<div class="tree-shell-entry${shell === 'main' ? ' tree-shell-main' : ''}"><button type="button" class="tree-node shell-node ${state.selectedShell === shell && !state.selectedShellChild ? 'active' : ''}" data-select-shell="${shell}"><span class="tree-type-icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong><small>${subtitle}</small></span></button>${children.length ? `<div class="tree-children">${children.join('')}</div>` : ''}</div>`; const brandingLabels = { logo: ['Logo', '▣', settings.logoUrl ? 'Logo image' : 'Logo letter'], name: ['Site name', 'T', escapeHtml(siteName)], note: ['Footer note', '¶', escapeHtml(settings.footerNote === undefined ? 'Published with Sitemaster' : settings.footerNote) || 'Empty'] }; const childNode = (shell, child, tokenIndex) => { const [label, icon, subtitle] = brandingLabels[child] || [child, '▢', '']; const moved = settings.shellBrandingMoved?.[`${shell}.${child}`]; return `<div class="tree-entry"><button type="button" class="tree-node shell-node ${state.selectedShellChild === `${shell}.${child}` ? 'active' : ''}" data-select-shell-child="${shell}.${child}" data-tree-token="${shell}:branding:${child}" data-shell-token-index="${tokenIndex}"><span class="tree-drag">⠿</span><span class="tree-type-icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong><small>${subtitle}${moved ? ' · moved' : ''}</small></span></button></div>`; }; const shellChildNodes = (shell) => shellOrder(shell).map((token, tokenIndex) => token.startsWith('branding:') ? childNode(shell, token.slice(9), tokenIndex) : treeNodeMarkup(shellBlockList(shell)[Number(token.slice(6))], [Number(token.slice(6))], shell, token)).join(''); const headerShell = layout.showTopbar === false ? '' : shellNode('header', 'Header', '⌂', 'Template shell', [shellChildNodes('header')]); const footerShell = layout.showFooter === false ? '' : shellNode('footer', 'Footer', '⌄', 'Template shell', [shellChildNodes('footer')]); const blockNodes = (blocks || []).map((block, index) => treeNodeMarkup(block, [index])).join(''); const emptyNote = `<p class="inspector-empty">${isContentEditor() ? 'This entry has no body blocks yet. Add one from the Components panel to shape how it renders.' : 'This page has no elements yet. Add one from the Components panel.'}</p>`; const mainShell = shellNode('main', 'Main content', '▤', `Template shell · ${total} ${total === 1 ? 'layer' : 'layers'}`, [blockNodes || emptyNote]); tree.innerHTML = `<button type="button" class="tree-root ${state.selectedBlockPath === null && !state.selectedShell && !state.selectedShellChild ? 'active' : ''}" data-select-path="page"><span>▾</span><strong>${rootLabel}</strong><small>${total} layers</small></button><div class="tree-children">${headerShell}${mainShell}${footerShell}</div>`;
    tree.querySelector('[data-select-path="page"]').onclick = () => { state.selectedBlockPath = null; state.selectedShell = null; state.selectedShellChild = null; renderBlockEditor(); renderPreview(); };
    tree.querySelectorAll('[data-select-shell]').forEach((node) => { node.onclick = () => { state.selectedBlockPath = null; state.selectedShellChild = null; state.selectedShell = node.dataset.selectShell; renderBlockEditor(); renderPreview(); showToolWindow('properties'); }; });
    tree.querySelectorAll('[data-select-shell-child]').forEach((node) => { node.onclick = () => { state.selectedBlockPath = null; state.selectedShell = null; state.selectedShellChild = node.dataset.selectShellChild; renderBlockEditor(); renderPreview(); showToolWindow('properties'); }; });
    tree.querySelectorAll('[data-select-path]:not([data-select-path="page"])').forEach((node) => { node.onclick = () => { const { shell, path } = resolveScope(node.dataset.selectPath); state.selectedShell = shell || null; state.selectedShellChild = null; state.selectedBlockPath = path; renderBlockEditor(); renderPreview(); showToolWindow('properties'); }; });
    updateLayersToolbar();
    const treeZoneAt = (target, clientY) => { const rect = target.getBoundingClientRect(); const y = clientY - rect.top; return y < rect.height * 0.25 ? 'before' : y > rect.height * 0.75 ? 'after' : 'inside'; };
    const clearTreeDrop = () => { tree.querySelectorAll('.dragging, .drag-over-inside, .drop-before, .drop-after').forEach((n) => n.classList.remove('dragging', 'drag-over-inside', 'drop-before', 'drop-after')); };
    const treeDropTarget = (moveEvent) => { const under = moveEvent.target && moveEvent.target.closest ? moveEvent.target : document.elementFromPoint(moveEvent.clientX, moveEvent.clientY); if (!under || !under.closest) return null; const tokenNode = under.closest('[data-tree-token]'); if (tokenNode) { const raw = tokenNode.dataset.treeToken; const sep = raw.indexOf(':'); return { key: tokenNode.dataset.treePath || raw, node: tokenNode, zone: treeZoneAt(tokenNode, moveEvent.clientY), token: raw.slice(sep + 1), tokenShell: raw.slice(0, sep) }; } const pathNode = under.closest('[data-tree-path]'); if (pathNode) return { key: pathNode.dataset.treePath, node: pathNode, zone: treeZoneAt(pathNode, moveEvent.clientY) }; const shellNode = under.closest('[data-select-shell]'); if (shellNode) return { key: null, node: shellNode, zone: 'root', shell: shellNode.dataset.selectShell }; return null; };
  const beginTokenDrag = (node, sourceToken, sourceShell) => { node.onpointerdown = (event) => { if (event.button !== 0) return; const startX = event.clientX; const startY = event.clientY; let dragging = false; let target = null; const onMove = (moveEvent) => { if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return; dragging = true; const hit = treeDropTarget(moveEvent); clearTreeDrop(); node.classList.add('dragging'); target = hit && !(hit.tokenShell === sourceShell && hit.token === sourceToken) ? hit : null; if (target) { if (target.zone === 'inside' || target.zone === 'root') target.node.classList.add('drag-over-inside'); else target.node.classList.add(target.zone === 'before' ? 'drop-before' : 'drop-after'); } }; const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if (!dragging) return; window.addEventListener('click', (clickEvent) => { clickEvent.preventDefault(); clickEvent.stopImmediatePropagation(); }, { capture: true, once: true }); const hit = target; clearTreeDrop(); if (!hit) return; if (hit.tokenShell === sourceShell && hit.token) { const order = shellOrder(sourceShell); const from = order.indexOf(sourceToken); const toToken = order.indexOf(hit.token); const dest = hit.zone === 'after' ? toToken + 1 : toToken; if (from >= 0 && toToken >= 0) { const destIndex = dest > from ? dest - 1 : dest; if (moveShellOrderTokenTo(sourceShell, sourceToken, destIndex)) { state.selectedShell = sourceShell; state.selectedShellChild = null; state.selectedBlockPath = sourceToken.startsWith('block:') ? [Number(sourceToken.slice(6))] : null; state.selectedShellChild = sourceToken.startsWith('branding:') ? `${sourceShell}.${sourceToken.slice(9)}` : null; renderBlockEditor(); renderPreview(); } } return; } if (hit.zone === 'root') { const destScope = hit.shell === 'main' ? '' : hit.shell; moveShellChildTokenTo(sourceShell, sourceToken, destScope, null, undefined); return; } if (hit.key && hit.key.includes(':')) { const dest = resolveScope(hit.key); const destShell = dest.shell; const targetToken = `block:${dest.path[0]}`; if (destShell && dest.path.length === 1) { moveShellChildTokenTo(sourceShell, sourceToken, destShell, shellOrder(destShell).indexOf(targetToken) + (hit.zone === 'after' ? 1 : 0)); return; } } const dest = resolveScope(hit.key); moveShellChildTokenTo(sourceShell, sourceToken, dest.shell, dest.path, hit.zone); }; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }; };
  tree.querySelectorAll('[data-tree-path]').forEach((node) => { node.onpointerdown = (event) => { if (event.button !== 0) return; const sourceKey = node.dataset.treePath; const source = resolveScope(sourceKey); const startX = event.clientX; const startY = event.clientY; let dragging = false; let target = null; const onMove = (moveEvent) => { if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return; dragging = true; const hit = treeDropTarget(moveEvent); clearTreeDrop(); node.classList.add('dragging'); target = hit && hit.key !== sourceKey ? hit : null; if (target) { if (target.zone === 'inside' || target.zone === 'root') target.node.classList.add('drag-over-inside'); else target.node.classList.add(target.zone === 'before' ? 'drop-before' : 'drop-after'); } }; const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if (!dragging) return; window.addEventListener('click', (clickEvent) => { clickEvent.preventDefault(); clickEvent.stopImmediatePropagation(); }, { capture: true, once: true }); const hit = target; clearTreeDrop(); if (!hit) return; if (source.shell && source.path.length === 1 && hit.tokenShell === source.shell && hit.token) { const order = shellOrder(source.shell); const fromToken = `block:${source.path[0]}`; const from = order.indexOf(fromToken); const toToken = order.indexOf(hit.token); const dest = hit.zone === 'after' ? toToken + 1 : toToken; if (from >= 0 && toToken >= 0) { const destIndex = dest > from ? dest - 1 : dest; if (moveShellOrderTokenTo(source.shell, fromToken, destIndex)) { state.selectedShell = source.shell; state.selectedBlockPath = [Number(fromToken.slice(6))]; renderBlockEditor(); renderPreview(); } } return; } if (hit.zone === 'root') { const destScope = hit.shell === 'main' ? '' : hit.shell; moveBlockToScope(source.shell, source.path, destScope, null, undefined); return; } const dest = resolveScope(hit.key); moveBlockToScope(source.shell, source.path, dest.shell, dest.path, hit.zone); };     window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }; });
  tree.querySelectorAll('[data-tree-token]:not([data-tree-path])').forEach((node) => { const raw = node.dataset.treeToken; const sep = raw.indexOf(':'); beginTokenDrag(node, raw.slice(sep + 1), raw.slice(0, sep)); });
    tree.scrollTop = prevScroll;
  }
  function renderBlockEditor() { const blocks = currentDocument().blocks || []; setText('block-count', `${countBlocks(blocks)} ${countBlocks(blocks) === 1 ? 'element' : 'elements'}`); const paletteHint = document.querySelector('#canvas-element-toolbar .toolbar-hint'); if (paletteHint) paletteHint.textContent = `Add to ${state.selectedBlockPath ? 'the selected element' : 'the page root'} · drag layers to nest`; renderPageTree(blocks); renderElementInspector(); renderBreadcrumb(); }
  function renderBreadcrumb() {
    const breadcrumb = el('canvas-breadcrumb'); if (!breadcrumb) return;
    const actions = [];
    const rootLabel = isContentEditor() ? 'Entry body' : (currentDocument().title ? `Page · ${currentDocument().title}` : 'Page canvas');
    actions.push({ label: rootLabel, run: () => { state.selectedBlockPath = null; state.selectedShell = null; state.selectedShellChild = null; renderBlockEditor(); renderPreview(); } });
    if (state.selectedShell) actions.push({ label: state.selectedShell === 'header' ? 'Header' : state.selectedShell === 'footer' ? 'Footer' : 'Main', run: () => { state.selectedBlockPath = null; state.selectedShellChild = null; renderBlockEditor(); renderPreview(); showToolWindow('properties'); } });
    if (state.selectedShellChild) { const [shell, child] = state.selectedShellChild.split('.'); const label = child === 'logo' ? 'Logo' : child === 'name' ? 'Site name' : child === 'note' ? 'Footer note' : child; actions.push({ label, run: () => { state.selectedBlockPath = null; state.selectedShell = shell; renderBlockEditor(); renderPreview(); showToolWindow('properties'); } }); }
    if (state.selectedBlockPath) { const scope = activeScope(); let blocks = rootFor(scope); let cum = []; state.selectedBlockPath.forEach((index) => { if (!blocks[index]) return; cum = [...cum, index]; const prefix = cum.slice(); actions.push({ label: blockLabel(blocks[index].type, blocks[index]), run: () => { state.selectedShell = scope || null; state.selectedShellChild = null; state.selectedBlockPath = prefix; renderBlockEditor(); renderPreview(); showToolWindow('properties'); } }); blocks = blocks[index].children || []; }); }
    breadcrumb.innerHTML = actions.map((item, index) => `${index ? '<span class="crumb-sep">›</span>' : ''}<button type="button" class="crumb" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</button>`).join('');
    breadcrumb.querySelectorAll('.crumb').forEach((button, index) => { button.onclick = () => actions[index].run(); });
  }
  function removeAtPath(path) { const siblings = siblingsAtPath(path); return siblings?.splice(path[path.length - 1], 1)[0] || null; }
  function deleteBlock(path) { if (!path) return; const scope = activeScope(); removeAtPath(path); state.selectedBlockPath = null; renderBlockEditor(); renderPreview(); pushHistory(); persistShellBlocks(scope); }
  function duplicateBlock(path) { if (!path) return; const scope = activeScope(); const siblings = siblingsAtPath(path); if (!siblings) return; const index = path[path.length - 1]; const source = siblings[index]; if (!source) return; const copy = clone(JSON.parse(JSON.stringify(source))); siblings.splice(index + 1, 0, copy); state.selectedBlockPath = path.slice(0, -1).concat(index + 1); renderBlockEditor(); renderPreview(); pushHistory(); persistShellBlocks(scope); }
  const NESTABLE_TYPES = ['container', 'section', 'div', 'span', 'form', 'nav', 'html_element', 'hero', 'card', 'feature-grid', 'cta', 'callout', 'alert', 'accordion', 'pricing', 'stats', 'button-group', 'navbar', 'list-group', 'breadcrumb'];
  function canNest(type) { return NESTABLE_TYPES.includes(type); }
  function pathStartsWith(path, prefix) { return prefix.length <= path.length && prefix.every((value, index) => value === path[index]); }
  function pathOfBlock(nodes, target, prefix = []) { for (let i = 0; i < (nodes || []).length; i += 1) { const node = nodes[i]; if (node === target) return [...prefix, i]; const found = pathOfBlock(node.children || [], target, [...prefix, i]); if (found) return found; } return null; }
  function moveShellChildToScope(fromShell, child, toScope, toParentPath, zone) {
    const settings = state.site?.settings || {};
    const siteName = settings.siteName || state.site?.name || 'Website';
    let block = null;
    if (child === 'logo') {
      if (settings.logoUrl) block = { type: 'image', url: settings.logoUrl, alt: siteName, children: [] };
      else block = { type: 'span', text: settings.logoText || siteName.slice(0, 1), children: [] };
    } else if (child === 'name') {
      block = { type: 'span', text: siteName, children: [] };
    } else if (child === 'note') {
      const footerNote = settings.footerNote === undefined ? 'Published with Sitemaster' : settings.footerNote;
      block = { type: 'span', text: footerNote, children: [] };
    }
    if (!block) return;
    const newPath = insertBlockInScope(toScope, block, toParentPath, zone);
    state.selectedShell = toScope || null; state.selectedShellChild = null;
    state.selectedBlockPath = newPath;
    settings.shellBrandingMoved ||= {};
    settings.shellBrandingMoved[`${fromShell}.${child}`] = true;
    renderBlockEditor(); renderPreview(); pushHistory();
    persistShellBlocks(toScope);
    scheduleSaveSettings('shellBrandingMoved', settings.shellBrandingMoved);
  }
  function insertBlockInScope(scope, block, parentPath, zone) {
    if (!parentPath || !parentPath.length) {
      const root = rootFor(scope);
      const at = zone === 'before' ? 0 : root.length;
      root.splice(at, 0, block);
      return parentPath && parentPath.length === 0 ? [at] : [at];
    }
    const parent = blockInScope(scope, parentPath);
    if (!parent) {
      const root = rootFor(scope);
      root.push(block);
      return [root.length - 1];
    }
    if (zone === 'inside') {
      if (canNest(parent.type)) {
        parent.children ||= [];
        parent.children.push(block);
        return [...parentPath, parent.children.length - 1];
      }
      zone = 'after';
    }
    const parentSibs = siblingsInScope(scope, parentPath);
    if (!parentSibs) {
      const root = rootFor(scope);
      root.push(block);
      return [root.length - 1];
    }
    const idx = parentPath[parentPath.length - 1];
    const at = zone === 'before' ? idx : idx + 1;
    parentSibs.splice(at, 0, block);
    return [...parentPath.slice(0, -1), at];
  }
  function moveBlockToScope(fromScope, fromPath, toScope, toParentPath, zone) {
    if (!fromPath) return;
    if (fromScope === toScope) {
      state.selectedShell = fromScope || null; state.selectedShellChild = null;
      if (zone === 'root') {
        moveBlock(fromPath, null, undefined);
        return;
      }
      if (toParentPath === null) {
        moveBlock(fromPath, null, zone === 'before' ? 0 : undefined);
        return;
      }
      dropBlock(fromPath, toParentPath, zone);
      return;
    }
    const fromSibs = siblingsInScope(fromScope, fromPath);
    if (!fromSibs) return;
    const idxFrom = fromPath[fromPath.length - 1];
    const [block] = fromSibs.splice(idxFrom, 1);
    if (!block) return;
    const newPath = insertBlockInScope(toScope, block, toParentPath, zone);
    state.selectedShell = toScope || null; state.selectedShellChild = null;
    state.selectedBlockPath = newPath;
    renderBlockEditor(); renderPreview(); pushHistory();
    persistShellBlocks(fromScope); persistShellBlocks(toScope);
  }
  function moveBlock(from, targetParent, index) {
    if (!from) return;
    const scope = activeScope();
    const siblings = siblingsInScope(scope, from);
    if (!siblings) return;
    const parent = targetParent && targetParent.length ? blockInScope(scope, targetParent) : null;
    if (targetParent && targetParent.length && !parent) return;
    if (parent && pathStartsWith(from, targetParent)) return;
    const [block] = siblings.splice(from[from.length - 1], 1);
    if (!block) return;
    const list = parent ? (parent.children ||= []) : rootFor(scope);
    const at = index === undefined ? list.length : Math.max(0, Math.min(list.length, index));
    list.splice(at, 0, block);
    state.selectedShell = scope || null; state.selectedShellChild = null;
    state.selectedBlockPath = pathOfBlock(rootFor(scope), block) || (parent ? [...targetParent, at] : [at]);
    renderBlockEditor(); renderPreview(); pushHistory(); persistShellBlocks(scope);
  }
  function moveBlockUp(path) { if (!path) return; const sibs = siblingsInScope(activeScope(), path); const i = path[path.length - 1]; if (!sibs || i <= 0) return; [sibs[i - 1], sibs[i]] = [sibs[i], sibs[i - 1]]; state.selectedBlockPath = [...path.slice(0, -1), i - 1]; renderBlockEditor(); renderPreview(); pushHistory(); persistShellBlocks(activeScope()); }
  function moveBlockDown(path) { if (!path) return; const sibs = siblingsInScope(activeScope(), path); const i = path[path.length - 1]; if (!sibs || i >= sibs.length - 1) return; [sibs[i + 1], sibs[i]] = [sibs[i], sibs[i + 1]]; state.selectedBlockPath = [...path.slice(0, -1), i + 1]; renderBlockEditor(); renderPreview(); pushHistory(); persistShellBlocks(activeScope()); }
  function outdentBlock(path) { if (!path || path.length < 2) return; const scope = activeScope(); const parentPath = path.slice(0, -1); const sibs = siblingsInScope(scope, path); const parentSibs = siblingsInScope(scope, parentPath); if (!sibs || !parentSibs) return; const [block] = sibs.splice(path[path.length - 1], 1); if (!block) return; const pIndex = parentPath[parentPath.length - 1]; parentSibs.splice(pIndex + 1, 0, block); state.selectedBlockPath = [...parentPath.slice(0, -1), pIndex + 1]; renderBlockEditor(); renderPreview(); pushHistory(); persistShellBlocks(scope); }
  function indentBlock(path) { if (!path) return; const scope = activeScope(); const sibs = siblingsInScope(scope, path); const i = path[path.length - 1]; if (!sibs || i <= 0) return; const prev = sibs[i - 1]; if (!prev) return; const [block] = sibs.splice(i, 1); if (!block) return; prev.children ||= []; prev.children.push(block); state.selectedBlockPath = [...path.slice(0, -1), i - 1, prev.children.length - 1]; renderBlockEditor(); renderPreview(); pushHistory(); persistShellBlocks(scope); }
  function dropBlock(from, target, zone) {
    if (!from || !target || pathKey(from) === pathKey(target)) return;
    const scope = activeScope();
    if (zone === 'inside') {
      if (pathStartsWith(target, from)) return;
      const targetBlock = blockInScope(scope, target);
      if (targetBlock && canNest(targetBlock.type)) { moveBlock(from, target, undefined); return; }
      zone = 'after';
    }
    const parentPath = target.slice(0, -1);
    let index = target[target.length - 1] + (zone === 'after' ? 1 : 0);
    if (pathKey(parentPath) === pathKey(from.slice(0, -1))) { const fi = from[from.length - 1]; if (fi < index) index -= 1; if (fi === index) return; }
    moveBlock(from, parentPath.length ? parentPath : null, index);
  }
  function addBlock(type, parentPath = null, options = {}) { const defaults = { heading: { type, level: 2, text: 'Section heading' }, paragraph: { type, text: 'Write something meaningful for your visitors.' }, rich_text: { type, text: 'Write rich text content.' }, image: { type, url: '', alt: '' }, link: { type, text: 'Learn more', url: '/' }, button: { type, text: 'Get started', url: '/' }, list: { type, text: 'First item\nSecond item' }, quote: { type, text: 'A thoughtful quote.' }, hr: { type }, video: { type, url: '' }, html_element: { type, data: { tag: options.tag || 'div' } }, container: { type }, section: { type }, div: { type }, span: { type, text: 'Inline text' }, form: { type }, nav: { type }, hero: { type, text: 'A strong headline' }, card: { type, text: 'Card title' }, 'feature-grid': { type }, alert: { type, tone: 'info', text: 'An important message.' }, cta: { type, text: 'Ready to get started?' }, callout: { type, tone: 'info', text: 'A helpful note for your visitors.' }, spacer: { type }, navbar: { type, text: 'Brand' }, badge: { type, text: 'New' }, 'button-group': { type }, breadcrumb: { type, text: 'Home\nLibrary\nCurrent page' }, 'list-group': { type, text: 'First item\nSecond item\nThird item' }, accordion: { type, text: 'Accordion item' }, pricing: { type, text: 'Professional', tone: 'Plan' }, stats: { type, text: 'Active users' } }; const block = { ...(defaults[type] || { type, text: '' }), children: [] }; const scope = options.shell !== undefined ? options.shell : activeScope(); const target = parentPath ? blockInScope(scope, parentPath) : null; const siblings = target ? (target.children ||= []) : rootFor(scope); siblings.push(block); state.selectedShell = scope || null; state.selectedShellChild = null; state.selectedBlockPath = target ? [...parentPath, siblings.length - 1] : [siblings.length - 1]; renderBlockEditor(); renderPreview(); pushHistory(); persistShellBlocks(scope); }


  function safePreviewImage(value) { const trimmed = typeof value === 'string' ? value.trim() : ''; if (!trimmed) return ''; if (/^media\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed) || /^\/[A-Za-z0-9._/-]*$/.test(trimmed) || /^https:\/\/[^\s"'()<>]+$/.test(trimmed)) return trimmed; return ''; }
  function previewBackground(style = {}) { const image = safePreviewImage(style.backgroundImage); if (!image) return []; const safeValue = (value) => typeof value === 'string' && value.trim() && /^[#a-zA-Z0-9.%(), -]+$/.test(value); const size = safeValue(style.backgroundSize) ? style.backgroundSize : 'cover'; const position = safeValue(style.backgroundPosition) ? style.backgroundPosition : 'center'; const repeat = safeValue(style.backgroundRepeat) ? style.backgroundRepeat : 'no-repeat'; return [`background-image:url('${escapeHtml(image)}')`, `background-size:${escapeHtml(size)}`, `background-position:${escapeHtml(position)}`, `background-repeat:${escapeHtml(repeat)}`]; }
  function previewStyle(style = {}) { const allowed = ['color', 'backgroundColor', 'objectFit', 'objectPosition', 'display', 'flex', 'flexDirection', 'flexWrap', 'gap', 'justifyContent', 'alignItems', 'alignSelf', 'order', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textTransform', 'textDecoration', 'textDecorationColor', 'textShadow', 'whiteSpace', 'wordBreak', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderStyle', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'boxSizing', 'position', 'top', 'right', 'bottom', 'left', 'zIndex', 'float', 'clear', 'overflow', 'opacity', 'cursor', 'boxShadow', 'filter', 'transform', 'transition']; const parts = allowed.filter((key) => typeof style[key] === 'string' && style[key].trim()).map((key) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${escapeHtml(style[key])}`); const hasBorder = allowed.some((key) => key.indexOf('border') === 0 && key !== 'borderRadius' && typeof style[key] === 'string' && style[key].trim()); if (hasBorder && !String(style.borderStyle || '').trim()) parts.push('border-style:solid'); parts.push(...previewBackground(style)); return parts.join(';'); }
  const ATTRIBUTE_NAME_RE = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;
  function previewAttributes(block) { const list = Array.isArray(block.data?.attributes) ? block.data.attributes : []; return list.filter((pair) => pair && typeof pair.name === 'string' && ATTRIBUTE_NAME_RE.test(pair.name) && !/^on/i.test(pair.name) && !/^(style|srcdoc)$/i.test(pair.name) && !pair.name.toLowerCase().startsWith('data-sitemaster-')).map((pair) => `${pair.name}="${escapeHtml(String(pair.value ?? ''))}"`).join(' '); }
  function canvasPlaceholder(tag, textTag = false) { return `<span class="canvas-placeholder">${textTag ? `Edit &lt;${tag}&gt; text` : `Empty &lt;${tag}&gt; · use + in the structure tree to add children`}</span>`; }
  function previewBlock(block, path, scope = '') {
    const text = escapeHtml(block.text || ''); const key = scopeKey(scope, path); const marker = `data-sitemaster-block="${key}"`; const selected = currentSelectionKey() === key ? ' data-sitemaster-selected="true"' : ''; const style = previewStyle(block.style); const custom = previewAttributes(block); const attributes = `${marker}${selected}${style ? ` style="${style}"` : ''}${custom ? ` ${custom}` : ''}`; const editable = `${marker}${selected}${style ? ` style="${style}"` : ''}${custom ? ` ${custom}` : ''} contenteditable="true" spellcheck="true"`;
    const children = (block.children || []).map((child, index) => previewBlock(child, [...path, index], scope)).join('');
    if (block.type === 'heading') { const level = Math.min(6, Math.max(1, Number(block.level) || 2)); return `<h${level} ${editable}>${text}</h${level}>`; }
    if (block.type === 'paragraph' || block.type === 'rich_text') return `<p ${editable}>${text}</p>`;
    if (block.type === 'image') return block.url ? `<img ${attributes} src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || '')}">` : `<div class="image-placeholder" ${attributes}>Image URL</div>`;
    if (block.type === 'link') return `<p ${marker}${selected}${style ? ` style="${style}"` : ''}><a ${marker}${selected}${custom ? ` ${custom}` : ''} href="${escapeHtml(block.url || '#')}" contenteditable="true" spellcheck="true">${text || escapeHtml(block.url || 'Link')}</a></p>`;
    if (block.type === 'button') return `<p ${attributes}><a class="button-link" href="${escapeHtml(block.url || '#')}" ${editable}>${text || 'Button'}</a></p>`;
    if (block.type === 'list') return `<ul ${attributes}>${text.split('\n').filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    if (block.type === 'quote') return `<blockquote ${editable}>${text}</blockquote>`;
    if (block.type === 'hr') return `<hr ${attributes}>`;
    if (block.type === 'video') return `<div class="media-placeholder" ${attributes}>Video: ${escapeHtml(block.url || 'Add a video URL')}</div>`;
    if (block.type === 'html_element') {
      const tag = HTML_ELEMENT_TAGS.has(block.data?.tag) ? block.data.tag : 'div';
      if (VOID_HTML_ELEMENT_TAGS.has(tag)) return tag === 'img' ? `<img ${attributes} src="${escapeHtml(block.url || '')}" alt="${escapeHtml(block.alt || '')}">` : `<${tag} ${attributes}>`;
      return `<${tag} ${HTML_TEXT_TAGS.has(tag) ? editable : attributes}>${text || children || canvasPlaceholder(tag, HTML_TEXT_TAGS.has(tag))}</${tag}>`;
    }
    if (['container', 'section', 'div', 'span'].includes(block.type)) return `<${block.type} ${attributes}>${text || children || canvasPlaceholder(block.type)}</${block.type}>`;
    if (block.type === 'form') return `<form ${attributes}>${children || `<p ${editable}>${text || 'Form content'}</p>`}</form>`;
    if (block.type === 'nav') return `<nav ${attributes}>${children || `<a href="${escapeHtml(block.url || '#')}" ${editable}>${text || 'Navigation'}</a>`}</nav>`;
    if (block.type === 'navbar') return `<nav class="component-navbar" ${attributes}><strong ${editable}>${text || 'Brand'}</strong>${children || '<div class="component-navbar-links"><a href="#">Home</a><a href="#">About</a><a href="#">Contact</a></div>'}</nav>`;
    if (block.type === 'badge') return `<span class="component-badge" ${editable}>${text || 'Badge'}</span>`;
    if (block.type === 'button-group') return `<div class="component-button-group" ${attributes}>${children || '<a class="button-link" href="#">Primary</a><a class="button-link secondary" href="#">Secondary</a>'}</div>`;
    if (block.type === 'breadcrumb') return `<nav aria-label="Breadcrumb" ${attributes}><ol class="component-breadcrumb">${(text || 'Home\nLibrary\nCurrent page').split('\n').filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol></nav>`;
    if (block.type === 'list-group') return `<ul class="component-list-group" ${attributes}>${children || (text || 'First item\nSecond item\nThird item').split('\n').filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    if (block.type === 'accordion') return `<div class="component-accordion" ${attributes}>${children || `<details open><summary ${editable}>${text || 'Accordion item'}</summary><p>Expandable content goes here.</p></details>`}</div>`;
    if (block.type === 'pricing') return `<article class="component-pricing" ${attributes}><p class="component-kicker">${escapeHtml(block.tone || 'Plan')}</p><h3 ${editable}>${text || 'Professional'}</h3><strong class="component-price">$29 <small>/ month</small></strong>${children || '<p>Everything you need to get started.</p><a class="button-link" href="#">Choose plan</a>'}</article>`;
    if (block.type === 'stats') return `<div class="component-stats" ${attributes}>${children || `<div><strong>12K</strong><span ${editable}>${text || 'Active users'}</span></div><div><strong>98%</strong><span>Availability</span></div><div><strong>24/7</strong><span>Support</span></div>`}</div>`;
    if (block.type === 'hero') return `<section class="component-hero" ${attributes}><h1 ${editable}>${text || 'A strong headline'}</h1>${children}</section>`;
    if (block.type === 'card') return `<article class="component-card" ${attributes}><h3 ${editable}>${text || 'Card title'}</h3>${children}</article>`;
    if (block.type === 'feature-grid') return `<section class="component-feature-grid" ${attributes}>${children || `<article><h3 ${editable}>${text || 'Feature'}</h3></article>`}</section>`;
    if (['callout', 'alert'].includes(block.type)) return `<aside class="callout ${escapeHtml(block.tone || 'info')}" ${editable}>${text || 'Alert message'}</aside>`;
    if (block.type === 'cta') return `<section class="component-cta" ${attributes}><h2 ${editable}>${text || 'Ready to get started?'}</h2>${children}</section>`;
    if (block.type === 'spacer') return `<div class="spacer" ${attributes}></div>`;
    return '';
  }


  function entryPlainText(item) { return Array.isArray(item) ? item.map((block) => block?.text || '').filter(Boolean).join('\n') : String(item ?? ''); }


  /** Inline-editable preview of a content entry's title, excerpt, and schema fields, shown above any layout blocks on the canvas. */
  function renderEntryFieldPreview(doc) {
    const value = (field) => doc.data?.[field.key];
    const isEmpty = (item) => item === undefined || item === null || item === '' || (Array.isArray(item) && !item.length);
    const textAttr = (key) => `contenteditable="true" spellcheck="true" data-sitemaster-field="${escapeHtml(key)}"`;
    const rows = currentTypeFields().map((field) => {
      const item = value(field);
      const empty = isEmpty(item);
      let control;
      if (field.type === 'boolean') {
        control = `<label class="entry-field-toggle"><input type="checkbox" data-sitemaster-field-check="${escapeHtml(field.key)}" ${item ? 'checked' : ''}><span>${item ? 'Yes' : 'No'}</span></label>`;
      } else if (field.type === 'select') {
        const options = (field.options || []).map((option) => `<option value="${escapeHtml(option)}" ${option === item ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('');
        control = `<select class="entry-field-select" data-sitemaster-field-select="${escapeHtml(field.key)}"><option value="" ${empty ? 'selected' : ''}>—</option>${options}</select>`;
      } else if (field.type === 'image') {
        const image = empty ? '' : `<img class="entry-field-image" src="${escapeHtml(String(item))}" alt="">`;
        control = `${image}<div class="entry-field-input" ${textAttr(field.key)}>${empty ? '' : escapeHtml(String(item))}</div>`;
      } else if (field.type === 'richtext') {
        control = `<div class="entry-field-input" ${textAttr(field.key)}>${empty ? '' : escapeHtml(entryPlainText(item))}</div>`;
      } else if (Array.isArray(item)) {
        control = `<div class="entry-field-input" ${textAttr(field.key)}>${escapeHtml(item.join(', '))}</div>`;
      } else {
        control = `<div class="entry-field-input" ${textAttr(field.key)}>${empty ? '' : escapeHtml(String(item))}</div>`;
      }
      return `<div class="entry-field${empty ? ' is-empty' : ''}"><span class="entry-field-label">${escapeHtml(field.label || field.key)}</span><div class="entry-field-value">${control}</div></div>`;
    }).join('');
    const cover = doc.coverImage ? `<img class="entry-cover" src="${escapeHtml(doc.coverImage)}" alt="">` : '';
    return `<article class="entry-preview">${cover}<h1 class="entry-title entry-field-input${doc.title ? '' : ' is-empty'}" ${textAttr('__title')}>${escapeHtml(doc.title || '')}</h1><p class="entry-excerpt entry-field-input${doc.excerpt ? '' : ' is-empty'}" ${textAttr('__excerpt')}>${escapeHtml(doc.excerpt || '')}</p>${rows}</article>`;
  }


  /** Applies an inline canvas edit to the current entry (title, excerpt, or a schema field) and mirrors it into the inspector. */
  function applyEntryField(key, raw) {
    const doc = currentDocument(); if (!doc) return;
    if (key === '__title') { doc.title = String(raw); setValue('designer-content-title', doc.title); setText('designer-title', doc.title || doc.slug || 'New entry'); }
    else if (key === '__excerpt') { doc.excerpt = String(raw); setValue('designer-content-excerpt', doc.excerpt); }
    else {
      const field = currentTypeFields().find((item) => item.key === key);
      let next = raw;
      if (field?.type === 'number') next = String(raw).trim() === '' ? '' : Number(raw);
      else if (field?.type === 'tags') next = String(raw).split(',').map((tag) => tag.trim()).filter(Boolean);
      else if (field?.type === 'richtext') next = String(raw).split('\n').map((line) => line.trim()).filter(Boolean).map((text) => ({ type: 'paragraph', text }));
      doc.data ||= {}; doc.data[key] = next;
      const control = el(`schema-${key}`);
      if (control) { if (control.type === 'checkbox') control.checked = Boolean(next); else if (Array.isArray(next)) control.value = next.join(', '); else control.value = next ?? ''; }
      setValue('content-data', JSON.stringify(doc.data, null, 2));
    }
    scheduleHistory();
  }


  const CANVAS_CHROME_STYLE = `
    .sm-chrome{position:fixed;inset:0;z-index:2147483000;pointer-events:none}
    .sm-band{position:fixed;pointer-events:none;border-radius:2px}
    .sm-band.sm-margin{background:rgba(251,146,60,.30)}
    .sm-band.sm-padding{background:rgba(52,211,153,.34)}
    .sm-label{position:fixed;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:6px;background:var(--accent);color:#fff;font:700 11px/22px system-ui,sans-serif;white-space:nowrap;pointer-events:auto;cursor:grab;box-shadow:0 6px 16px #00000059;user-select:none}
    .sm-label .sm-dim{font-weight:600;color:#ffffffcc}
    .sm-label:active{cursor:grabbing}
    .sm-toolbar{position:fixed;display:inline-flex;align-items:center;gap:1px;padding:3px;border-radius:9px;background:#0b1220f2;border:1px solid #ffffff24;box-shadow:0 12px 28px #000000a6;pointer-events:auto}
    .sm-toolbar button{display:grid;place-items:center;min-width:26px;height:26px;padding:0 5px;border:0;border-radius:6px;background:transparent;color:#dbe4ff;font-size:14px;line-height:1;cursor:pointer}
    .sm-toolbar button:hover{background:#ffffff1f;color:#fff}
    .sm-toolbar button.sm-danger:hover{background:#7f1d3a;color:#fff}
    .sm-guide{position:fixed;background:#f43f5e;pointer-events:none;z-index:2147483000}
    .sm-guide.v{width:1px}
    .sm-guide.h{height:1px}
    .sm-drop{position:fixed;height:3px;border-radius:2px;background:var(--accent);box-shadow:0 0 0 3px #6366f155;pointer-events:none;z-index:2147483000}
    .sm-chosen{opacity:.5}
  `;


  const CANVAS_CHROME = `<script>(function(){
  var SEL='data-sitemaster-selected';
  var chromeEl=null,labelEl=null,toolbarEl=null,dropEl=null,current=null;
  var marginBands=[],paddingBands=[],guides=[];
  function q(s,r){return (r||document).querySelector(s)}
  function px(v){var n=parseFloat(v);return isNaN(n)?0:n}
  function marked(){return q('['+SEL+'="true"]')||q('[data-sitemaster-shell-selected="true"]')||q('[data-sitemaster-shell-child-selected="true"]');}
  function rectOf(n){return n.getBoundingClientRect()}
  function typeName(n){var b=n.getAttribute&&n.getAttribute('data-sitemaster-block');if(b)return (n.tagName||'element').toLowerCase();var s=n.getAttribute&&n.getAttribute('data-sitemaster-shell');if(s)return s==='main'?'Main content':s.charAt(0).toUpperCase()+s.slice(1);var c=n.getAttribute&&n.getAttribute('data-sitemaster-shell-child');if(c){var p=c.split('.');return p[1]?p[1].charAt(0).toUpperCase()+p[1].slice(1):c}return (n.tagName||'element').toLowerCase()}
  function ensure(){
    if(chromeEl&&document.body.contains(chromeEl))return;
    chromeEl=document.createElement('div');chromeEl.className='sm-chrome';chromeEl.setAttribute('data-sm-chrome','1');
    for(var i=0;i<4;i++){var m=document.createElement('div');m.className='sm-band sm-margin';chromeEl.appendChild(m);marginBands.push(m)}
    for(var k=0;k<4;k++){var p=document.createElement('div');p.className='sm-band sm-padding';chromeEl.appendChild(p);paddingBands.push(p)}
    for(var g=0;g<2;g++){var gd=document.createElement('div');gd.className='sm-guide '+(g?'h':'v');gd.style.display='none';chromeEl.appendChild(gd);guides.push(gd)}
    dropEl=document.createElement('div');dropEl.className='sm-drop';dropEl.style.display='none';chromeEl.appendChild(dropEl);
    labelEl=document.createElement('div');labelEl.className='sm-label';labelEl.setAttribute('data-sm-handle','1');labelEl.title='Drag to move';chromeEl.appendChild(labelEl);
    toolbarEl=document.createElement('div');toolbarEl.className='sm-toolbar';
    toolbarEl.innerHTML='<button type="button" data-sm-op="up" title="Move up">\u2191</button><button type="button" data-sm-op="down" title="Move down">\u2193</button><button type="button" data-sm-op="duplicate" title="Duplicate">\u29c9</button><button type="button" data-sm-op="delete" class="sm-danger" title="Delete">\u2715</button>';
    chromeEl.appendChild(toolbarEl);
    document.body.appendChild(chromeEl);
    chromeEl.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-sm-op]'):null;if(!b)return;e.preventDefault();e.stopPropagation();if(!current)return;var path=current.getAttribute('data-sitemaster-block');if(!path)return;parent.postMessage({source:'sitemaster-canvas',action:'block-action',op:b.getAttribute('data-sm-op'),path:path},'*')},true);
    labelEl.addEventListener('pointerdown',startDrag);
  }
  function setBand(b,left,top,width,height){if(width<=0||height<=0){b.style.display='none';return}b.style.display='block';b.style.left=left+'px';b.style.top=top+'px';b.style.width=width+'px';b.style.height=height+'px'}
  function renderChrome(n){
    ensure();
    if(!n||!document.body.contains(n)){chromeEl.style.display='none';return}
    chromeEl.style.display='block';
    var r=rectOf(n),cs=getComputedStyle(n);
    var mt=px(cs.marginTop),mr=px(cs.marginRight),mb=px(cs.marginBottom),ml=px(cs.marginLeft);
    var bt=px(cs.borderTopWidth),br=px(cs.borderRightWidth),bb=px(cs.borderBottomWidth),bl=px(cs.borderLeftWidth);
    var pt=px(cs.paddingTop),prr=px(cs.paddingRight),pb=px(cs.paddingBottom),pl=px(cs.paddingLeft);
    setBand(marginBands[0],r.left-ml,r.top-mt,r.width+ml+mr,mt);
    setBand(marginBands[1],r.right,r.top,mr,r.height);
    setBand(marginBands[2],r.left-ml,r.bottom,r.width+ml+mr,mb);
    setBand(marginBands[3],r.left-ml,r.top,ml,r.height);
    var iw=Math.max(0,r.width-bl-br),ih=Math.max(0,r.height-bt-bb);
    setBand(paddingBands[0],r.left+bl,r.top+bt,iw,pt);
    setBand(paddingBands[1],r.right-br-prr,r.top+bt,prr,ih);
    setBand(paddingBands[2],r.left+bl,r.bottom-bb-pb,iw,pb);
    setBand(paddingBands[3],r.left+bl,r.top+bt,pl,ih);
    labelEl.textContent='';
    var name=document.createElement('span');name.textContent=typeName(n);
    var dim=document.createElement('span');dim.className='sm-dim';dim.textContent=Math.round(r.width)+'\u00d7'+Math.round(r.height);
    labelEl.appendChild(name);labelEl.appendChild(dim);
    toolbarEl.style.display=n.hasAttribute('data-sitemaster-block')?'inline-flex':'none';
    var lw=labelEl.getBoundingClientRect().width;
    labelEl.style.left=Math.max(2,r.left)+'px';labelEl.style.top=(r.top-22)+'px';
    var tw=toolbarEl.getBoundingClientRect().width,vw=document.documentElement.clientWidth;
    var tleft=Math.min(Math.max(2,r.left+lw+8),Math.max(2,vw-tw-4));
    toolbarEl.style.left=tleft+'px';toolbarEl.style.top=(r.top-26)+'px';
  }
  function hideDrop(){if(dropEl)dropEl.style.display='none'}
  function hideGuides(){for(var i=0;i<guides.length;i++)guides[i].style.display='none'}
  function zoneFor(el,clientY){var r=rectOf(el),y=clientY-r.top;return y<r.height*0.28?'before':y>r.height*0.72?'after':'inside'}
  function showDrop(el,zone){var r=rectOf(el);dropEl.style.display='block';dropEl.style.left=r.left+'px';dropEl.style.width=r.width+'px';dropEl.style.top=(zone==='after'?r.bottom-2:zone==='inside'?r.top+2:r.top)+'px';dropEl.style.background=zone==='inside'?'#22d3ee':'var(--accent)'}
  function showGuides(from){
    hideGuides();
    var p=from.parentElement,pr=null;
    while(p&&p!==document.body){if(getComputedStyle(p).display!=='contents'){pr=rectOf(p);break}p=p.parentElement}
    if(!pr)pr=rectOf(document.body);
    var fr=rectOf(from);
    var fcx=fr.left+fr.width/2,pcx=pr.left+pr.width/2;
    if(Math.abs(fcx-pcx)<4){var g=guides[0];g.style.display='block';g.style.left=pcx+'px';g.style.top=Math.min(pr.top,fr.top)+'px';g.style.height=Math.max(pr.bottom,fr.bottom)-Math.min(pr.top,fr.top)+'px'}
    var fcy=fr.top+fr.height/2,pcy=pr.top+pr.height/2;
    if(Math.abs(fcy-pcy)<4){var h=guides[1];h.style.display='block';h.style.top=pcy+'px';h.style.left=pr.left+'px';h.style.width=pr.width+'px'}
  }
  function startDrag(e){
    if(e.button!==0||!current||!current.hasAttribute('data-sitemaster-block'))return;e.preventDefault();
    var from=current,startX=e.clientX,startY=e.clientY,dragging=false,target=null,zone=null;
    function move(ev){
      if(!dragging&&Math.hypot(ev.clientX-startX,ev.clientY-startY)<4)return;
      dragging=true;from.classList.add('sm-chosen');
      var under=document.elementFromPoint(ev.clientX,ev.clientY);
      var dest=under&&under.closest?under.closest('[data-sitemaster-block],[data-sitemaster-shell="main"]'):null;
      if(dest&&dest!==from&&!from.contains(dest)){target=dest;zone=zoneFor(dest,ev.clientY);showDrop(dest,zone)}else{target=null;hideDrop()}
      showGuides(from);
    }
    function up(){
      document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);
      from.classList.remove('sm-chosen');hideDrop();hideGuides();
      if(dragging&&target){var toPath=target.getAttribute('data-sitemaster-block');var fromPath=from.getAttribute('data-sitemaster-block');
        if(toPath&&fromPath)parent.postMessage({source:'sitemaster-canvas',action:'drag-move',from:fromPath,to:toPath,zone:zone},'*');
        else if(fromPath&&target.getAttribute('data-sitemaster-shell')==='main')parent.postMessage({source:'sitemaster-canvas',action:'drag-root',from:fromPath},'*');}
    }
    document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);
  }
  document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-sm-chrome]'))return;setTimeout(function(){var m=marked();current=m;renderChrome(m||null)},0)},true);
  window.addEventListener('scroll',function(){if(current)renderChrome(current)},true);
  window.addEventListener('resize',function(){if(current)renderChrome(current)});
  setTimeout(function(){var m=marked();current=m;renderChrome(m||null)},0);
  window.addEventListener('load',function(){var m=marked();if(m){current=m;renderChrome(m)}});
})();</script>`;


  function renderPreview() {
    if (!el('visual-preview') || !state.site) return;
    const page = currentDocument(); const settings = state.site.settings || {}; const theme = settings.theme || {}; const layout = normalizedLayout(page.metadata?.layout || {});
    const colors = { background: '#ffffff', surface: '#ffffff', text: '#1f2937', muted: '#64748b', accent: theme.accentColor || '#4f46e5', link: theme.linkColor || theme.accentColor || '#4f46e5' };
    const siteName = settings.siteName || state.site.name;
    const childFlag = (id) => (state.selectedShellChild === id ? ' data-sitemaster-shell-child-selected="true"' : '');
    const templateStyle = (target) => { const style = settings.templateStyles?.[target]; if (!style) return ''; const props = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'letterSpacing', 'textTransform', 'borderRadius', 'padding']; const css = props.filter((key) => typeof style[key] === 'string' && style[key].trim() && /^[#a-zA-Z0-9.%(), -]+$/.test(style[key])).map((key) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${escapeHtml(style[key])}`).join(';'); const background = previewBackground(style).join(';'); const combined = [css, background].filter(Boolean).join(';'); return combined ? ` style="${combined}"` : ''; };
    const shellStyle = (target) => { const style = settings.shellStyles?.[target]; if (!style) return ''; const props = ['padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius', 'textAlign', 'minHeight', 'gap', 'width', 'maxWidth', 'color', 'fontSize', 'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems']; const safe = (value) => typeof value === 'string' && value.trim() && /^[#a-zA-Z0-9.%(), -]+$/.test(value); const parts = props.filter((key) => safe(style[key])).map((key) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${escapeHtml(style[key])}`); const background = previewBackground(style); if (background.length) parts.push(...background); if (props.some((key) => key.indexOf('border') === 0 && key !== 'borderRadius' && safe(style[key]))) parts.push('border-style:solid'); return parts.length ? ` style="${parts.join(';')}"` : ''; };
    const logoMarkup = settings.logoUrl ? `<img class="site-logo" data-sitemaster-shell-child="header.logo"${childFlag('header.logo')} src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(siteName)}"${templateStyle('header.logo')}>` : `<span class="site-logo" data-sitemaster-shell-child="header.logo"${childFlag('header.logo')}${templateStyle('header.logo')}>${escapeHtml(settings.logoText || siteName.slice(0, 1))}</span>`;
    const headerChildMarkup = (token) => { if (token === 'branding:logo') return layout.showLogo === false ? '' : logoMarkup; if (token === 'branding:name') return `<span class="site-name" data-sitemaster-shell-child="header.name" data-sitemaster-shell-text="header.name"${childFlag('header.name')}${templateStyle('header.name')} contenteditable="true" spellcheck="true">${escapeHtml(siteName)}</span>`; if (token.startsWith('block:')) { const index = Number(token.slice(6)); const block = shellBlockList('header')[index]; return block ? previewBlock(block, [index], 'header') : ''; } return ''; };
    const topbar = layout.showTopbar === false ? '' : `<header class="site-topbar" data-sitemaster-shell="header"${state.selectedShell === 'header' && !state.selectedShellChild && !state.selectedBlockPath ? ' data-sitemaster-shell-selected="true"' : ''}${shellStyle('header')}>${shellOrder('header').map(headerChildMarkup).join('')}</header>`;
    const columns = Math.max(1, Math.min(3, Number(layout.columns) || 1)); const buckets = Array.from({ length: columns }, () => []);
    (page.blocks || []).forEach((block, index) => buckets[Math.min(columns, Math.max(1, Number(block.data?.column) || 1)) - 1].push(previewBlock(block, [index])));
    const fieldPreview = isContentEditor() ? renderEntryFieldPreview(page) : '';
    const body = page.metadata?.customHtml ? page.metadata.customHtml : `${fieldPreview}<div class="page-columns columns-${columns} layout-${escapeHtml(layout.columnMode || 'single')}">${buckets.map((items) => `<section class="page-column">${items.join('')}</section>`).join('')}</div>`;
    state.lastGeneratedBody = body;
    const footerNote = settings.footerNote === undefined ? 'Published with Sitemaster' : settings.footerNote;
    const footerChildMarkup = (token) => { if (token === 'branding:name') return `<span data-sitemaster-shell-child="footer.name" data-sitemaster-shell-text="footer.name"${childFlag('footer.name')}${templateStyle('footer.name')} contenteditable="true" spellcheck="true">${escapeHtml(siteName)}</span>`; if (token === 'branding:note') return `<span data-sitemaster-shell-child="footer.note" data-sitemaster-shell-text="footer.note"${childFlag('footer.note')}${templateStyle('footer.note')} contenteditable="true" spellcheck="true">${escapeHtml(footerNote)}</span>`; if (token.startsWith('block:')) { const index = Number(token.slice(6)); const block = shellBlockList('footer')[index]; return block ? previewBlock(block, [index], 'footer') : ''; } return ''; };
    const footer = layout.showFooter === false ? '' : `<footer class="site-footer" data-sitemaster-shell="footer"${state.selectedShell === 'footer' && !state.selectedShellChild && !state.selectedBlockPath ? ' data-sitemaster-shell-selected="true"' : ''}${shellStyle('footer')}>${shellOrder('footer').map(footerChildMarkup).join('')}</footer>`;
    const width = { narrow: '680px', standard: '860px', wide: '1120px', full: '100%' }[layout.contentWidth || 'standard'] || '860px';
    const canvasScript = `<script>(function(){var mark=function(t,a){document.querySelectorAll('[data-sitemaster-selected],[data-sitemaster-shell-selected],[data-sitemaster-shell-child-selected]').forEach(function(n){n.removeAttribute('data-sitemaster-selected');n.removeAttribute('data-sitemaster-shell-selected');n.removeAttribute('data-sitemaster-shell-child-selected')});if(t)t.setAttribute(a,'true')};document.addEventListener('click',function(event){var node=event.target.closest('[data-sitemaster-block]');if(node){mark(node,'data-sitemaster-selected');event.preventDefault();event.stopPropagation();parent.postMessage({source:'sitemaster-canvas',action:'select',path:node.getAttribute('data-sitemaster-block')},'*');return}var shell=event.target.closest('[data-sitemaster-shell]');if(shell){var child=event.target.closest('[data-sitemaster-shell-child]');mark(child||shell,child?'data-sitemaster-shell-child-selected':'data-sitemaster-shell-selected');parent.postMessage({source:'sitemaster-canvas',action:'shell-select',shell:shell.getAttribute('data-sitemaster-shell'),child:child?child.getAttribute('data-sitemaster-shell-child'):null},'*');if(event.target.closest('[data-sitemaster-shell-text]'))return;event.preventDefault();event.stopPropagation();return}});document.addEventListener('focusin',function(event){var node=event.target.closest('[contenteditable="true"][data-sitemaster-block]');if(node){var ph=node.querySelector('.canvas-placeholder');if(ph)ph.remove()}});document.querySelectorAll('[data-sitemaster-shell-text]').forEach(function(node){node.addEventListener('input',function(){parent.postMessage({source:'sitemaster-canvas',action:'shell-child-text',child:node.getAttribute('data-sitemaster-shell-text'),text:node.innerText},'*')})});document.querySelectorAll('[contenteditable="true"][data-sitemaster-block]').forEach(function(node){node.addEventListener('input',function(){parent.postMessage({source:'sitemaster-canvas',action:'text',path:node.getAttribute('data-sitemaster-block'),text:node.innerText},'*')})});document.querySelectorAll('[contenteditable="true"][data-sitemaster-field]').forEach(function(node){node.addEventListener('input',function(){parent.postMessage({source:'sitemaster-canvas',action:'field',field:node.getAttribute('data-sitemaster-field'),text:node.innerText},'*')})});document.querySelectorAll('[data-sitemaster-field-select]').forEach(function(node){node.addEventListener('change',function(){parent.postMessage({source:'sitemaster-canvas',action:'field-select',field:node.getAttribute('data-sitemaster-field-select'),value:node.value},'*')})});document.querySelectorAll('[data-sitemaster-field-check]').forEach(function(node){node.addEventListener('change',function(){parent.postMessage({source:'sitemaster-canvas',action:'field-check',field:node.getAttribute('data-sitemaster-field-check'),checked:node.checked},'*')})})})();</script>`;
    el('visual-preview').srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtml(publicUrl(`/sites/${state.siteSlug}/`))}"><style>:root{--bg:${colors.background};--surface:${colors.surface};--text:${colors.text};--muted:${colors.muted};--accent:${colors.accent};--link:${colors.link}}*{box-sizing:border-box}body{margin:0;padding:0;background:var(--bg);color:var(--text);font:16px/1.6 ${escapeHtml(settings.fontFamily || 'system-ui,sans-serif')} }main{width:min(${width},100%);margin:0 auto;padding:22px}.site-topbar{display:flex;align-items:center;gap:10px;width:min(${width},100%);margin:0 auto 22px;padding-bottom:14px;border-bottom:1px solid #e2e8f0;font-weight:700}.site-logo{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--accent);color:white;font-weight:800;object-fit:contain}.site-name{font-size:18px}[data-sitemaster-shell-child-selected="true"]{outline:2px solid var(--accent);outline-offset:3px;border-radius:5px}[data-sitemaster-shell-selected="true"]{outline:2px dashed var(--accent);outline-offset:3px;border-radius:6px}.page-columns{display:grid;gap:22px}.columns-1{grid-template-columns:1fr}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.layout-rail-left.columns-2{grid-template-columns:minmax(100px,.34fr) minmax(0,1fr)}.layout-rail-right.columns-2{grid-template-columns:minmax(0,1fr) minmax(100px,.34fr)}.layout-rail-both.columns-3{grid-template-columns:minmax(88px,.3fr) minmax(0,1fr) minmax(88px,.3fr)}.page-column{min-width:0}h1,h2,h3{line-height:1.15}a{color:var(--link)}img{max-width:100%;border-radius:10px}.callout{padding:12px;border-left:4px solid var(--accent);background:#f1f5f9;border-radius:7px}.button-link{display:inline-block;padding:8px 14px;border-radius:8px;background:var(--accent);color:#fff;text-decoration:none}.button-link.secondary{background:transparent;border:1px solid #cbd5e1}.component-hero,.component-cta,.component-card,.component-pricing{padding:22px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.component-feature-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.component-navbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 15px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}.component-navbar-links{display:flex;gap:12px}.component-badge{display:inline-block;padding:3px 9px;border-radius:999px;background:#6366f133;color:var(--link);font-size:12px;font-weight:700}.component-button-group{display:flex;gap:7px;flex-wrap:wrap}.component-breadcrumb{display:flex;gap:9px;list-style:none;padding:0;color:var(--muted);font-size:13px}.component-breadcrumb li+li:before{content:'/';margin-right:9px}.component-list-group{list-style:none;margin:0;padding:0;border:1px solid #e2e8f0;border-radius:9px;overflow:hidden}.component-list-group li{padding:10px 12px;border-bottom:1px solid #eef2f7}.component-list-group li:last-child{border-bottom:0}.component-accordion details{padding:11px 13px;border:1px solid #e2e8f0;border-radius:8px}.component-accordion summary{cursor:pointer;font-weight:700}.component-kicker{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em}.component-price{display:block;margin:10px 0;font-size:28px}.component-price small{color:var(--muted);font-size:12px;font-weight:400}.component-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.component-stats>div{padding:15px;border-radius:10px;background:#6366f11a}.component-stats strong,.component-stats span{display:block}.component-stats strong{font-size:22px}.component-stats span{color:var(--muted);font-size:12px}.media-placeholder,.image-placeholder{display:grid;place-items:center;min-height:100px;border:1px dashed #cbd5e1;color:var(--muted)}.canvas-placeholder{display:block;min-height:32px;padding:7px 10px;border:1px dashed var(--accent);border-radius:6px;color:var(--muted);background:#f8fafc;font-size:12px;font-style:italic}.spacer{height:30px}[data-sitemaster-block]:hover,[data-sitemaster-shell]:hover{outline:1px dashed var(--accent);outline-offset:3px}[data-sitemaster-block]{position:relative}[data-sitemaster-selected="true"],[data-sitemaster-shell-selected="true"]{outline:2px solid var(--accent)!important;outline-offset:2px;box-shadow:0 0 0 3px ${colors.accent}33!important}main,.page-columns,.page-column,.page-columns>section{overflow:visible}[contenteditable="true"]:focus{outline:2px solid var(--accent);outline-offset:3px}.site-footer{display:flex;justify-content:space-between;gap:12px;width:min(${width},100%);margin:22px auto -2px;padding-top:14px;border-top:1px solid #e2e8f0;color:var(--muted);font-size:12px}@media(max-width:640px){main{padding:16px}.columns-2,.columns-3,.component-feature-grid,.component-stats{grid-template-columns:1fr}.component-navbar{align-items:flex-start;flex-direction:column}.site-footer{flex-direction:column}}.entry-preview{margin:0 0 22px}.entry-title{margin:0 0 8px}.entry-cover{margin:0 0 14px;max-width:100%;border-radius:10px}.entry-excerpt{margin:0 0 16px;color:var(--muted);font-size:18px;line-height:1.5}.entry-field{margin:0 0 14px}.entry-field-label{display:block;margin:0 0 4px;color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.entry-field-value{white-space:pre-wrap}.entry-field-value img{max-width:100%;border-radius:8px}.entry-field-image{display:block;margin:0 0 6px;max-width:100%;border-radius:8px}.entry-empty{padding:14px;border:1px dashed #cbd5e1;border-radius:10px;color:var(--muted)}.entry-field-input[contenteditable]{border-radius:6px;transition:box-shadow .12s ease,background .12s ease}.entry-field-input[contenteditable]:hover{box-shadow:0 0 0 1px #cbd5e1}.entry-field-input[contenteditable]:focus{outline:2px solid var(--accent);outline-offset:3px}.entry-field-input.is-empty:empty::before,.entry-title.is-empty:empty::before{content:'Untitled entry';color:#6b7aa1}.entry-field.is-empty .entry-field-input:empty::before{content:'Click to add…';color:#6b7aa1}.entry-excerpt.is-empty:empty::before{content:'Add an excerpt…'}.entry-field-select{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;color:inherit;background:#f1f5f9;font:inherit}.entry-field-toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer}${page.metadata?.customCss || ''}${CANVAS_CHROME_STYLE}</style></head><body${shellStyle('page')}>${topbar}<main data-sitemaster-shell="main"${state.selectedShell === 'main' && !state.selectedShellChild ? ' data-sitemaster-shell-selected="true"' : ''}${shellStyle('main')}>${body}</main>${footer}${page.metadata?.customScript ? `<script type="module">${page.metadata.customScript}</script>` : ''}${canvasScript}${CANVAS_CHROME}</body></html>`;
  if (typeof applyCanvasZoom === 'function') requestAnimationFrame(applyCanvasZoom);
  }


  function cleanGeneratedMarkup(html) {
    return String(html || '')
      .replace(/\s+data-sitemaster-[a-z-]+(?:="[^"]*")?/gi, '')
      .replace(/\s+(?:contenteditable|spellcheck)="[^"]*"/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+>/g, '>')
      .trim();
  }


  function prefillGeneratedMarkup() {
    const box = el('custom-html');
    if (!box) return;
    const doc = currentDocument();
    if (doc.metadata?.customHtml || box.dataset.userHtml === 'true' || box.value.trim()) return;
    const markup = cleanGeneratedMarkup(state.lastGeneratedBody);
    if (!markup) return;
    box.value = markup;
    box.dataset.generated = 'true';
    state.customHtmlBaseline = markup;
  }


  function scheduleSaveSettings(key, value) {
    window.clearTimeout(state.settingsTimer);
    setDesignerStatus('Unsaved changes', 'dirty');
    state.settingsTimer = window.setTimeout(async () => {
      try { await api(`/sites/${state.siteSlug}`, { method: 'PATCH', body: JSON.stringify({ settings: { [key]: value } }) }); setDesignerStatus('Site branding saved'); }
      catch (error) { notice(error.message, 'error'); }
    }, 700);
  }


  function applyShellChildText(child, text) {
    const [shell, part] = String(child).split('.');
    if (!['header', 'footer'].includes(shell) || !part) return;
    const key = part === 'note' ? 'footerNote' : 'siteName';
    state.site.settings ||= {}; state.site.settings[key] = text;
    state.selectedBlockPath = null; state.selectedShell = shell; state.selectedShellChild = String(child);
    renderPageTree(currentDocument().blocks || []); renderElementInspector();
    scheduleSaveSettings(key, text);
  }


  window.addEventListener('message', (event) => {
    if (event.source !== el('visual-preview')?.contentWindow || event.data?.source !== 'sitemaster-canvas') return;
    if (event.data.action === 'shell-select') { state.selectedBlockPath = null; const shell = ['header', 'main', 'footer'].includes(event.data.shell) ? event.data.shell : null; state.selectedShell = shell; state.selectedShellChild = shell && event.data.child ? String(event.data.child) : null; renderBlockEditor(); if (state.selectedShell || state.selectedShellChild) showToolWindow('properties'); return; }
    if (event.data.action === 'shell-child-text') { applyShellChildText(String(event.data.child || ''), String(event.data.text || '')); return; }
    if (event.data.action === 'field') { applyEntryField(event.data.field, String(event.data.text || '')); return; }
    if (event.data.action === 'field-select') { applyEntryField(event.data.field, String(event.data.value || '')); return; }
    if (event.data.action === 'field-check') { applyEntryField(event.data.field, Boolean(event.data.checked)); return; }
    if (event.data.action === 'block-action') { const scope = resolveScope(event.data.path); const path = scope.path; if (!path) return; state.selectedShell = scope.shell || null; state.selectedShellChild = null; state.selectedBlockPath = path; const op = event.data.op; if (op === 'up') moveBlockUp(path); else if (op === 'down') moveBlockDown(path); else if (op === 'duplicate') duplicateBlock(path); else if (op === 'delete') deleteBlock(path); return; }
    if (event.data.action === 'drag-move') { const from = resolveScope(event.data.from); const to = resolveScope(event.data.to); if (!from.path) return; state.selectedBlockPath = from.path; if (to.path) { moveBlockToScope(from.shell, from.path, to.shell, to.path, event.data.zone || 'after'); return; } if (to.shell || from.shell === 'header' || from.shell === 'footer') { const destScope = to.shell || (from.shell === 'main' ? '' : from.shell); moveBlockToScope(from.shell, from.path, destScope === 'main' ? '' : destScope, null, event.data.zone || 'after'); return; } state.selectedShell = from.shell || null; state.selectedShellChild = null; dropBlock(from.path, from.path, event.data.zone || 'after'); return; }
    if (event.data.action === 'drag-root') { const from = resolveScope(event.data.from); if (!from.path) return; moveBlockToScope(from.shell, from.path, '', null, undefined); return; }
    const scope = resolveScope(event.data.path); const path = scope.path; if (scope.shell) { state.selectedShell = scope.shell; state.selectedShellChild = null; } const block = path ? blockInScope(scope.shell, path) : null; if (!block) return;
    if (event.data.action === 'select') { state.selectedBlockPath = path; if (!scope.shell) { state.selectedShell = null; state.selectedShellChild = null; } renderBlockEditor(); }
    if (event.data.action === 'text') { block.text = String(event.data.text || ''); if (!scope.shell) { state.selectedShell = null; state.selectedShellChild = null; } if (scopeKey(scope.shell, state.selectedBlockPath) !== scopeKey(scope.shell, path)) { state.selectedBlockPath = path; renderBlockEditor(); } else renderPageTree(currentDocument().blocks || []); scheduleHistory(); }
  });


  async function changePage(slug, action) { try { await api(`/sites/${state.siteSlug}/pages/${encodeURIComponent(slug)}${action === 'delete' ? '' : '/publish'}`, { method: action === 'delete' ? 'DELETE' : 'POST' }); notice(action === 'delete' ? 'Page deleted.' : 'Page published.'); await loadWorkspace(); } catch (error) { notice(error.message, 'error'); } }


  function renderSiteSettings() {
    const site = state.site || {}; const settings = site.settings || {}; const theme = settings.theme || {};
    setValue('site-name', settings.siteName || site.name); setValue('logo-text', settings.logoText || ''); setValue('logo-url', settings.logoUrl || ''); setValue('font-family', settings.fontFamily || 'Inter, system-ui, sans-serif');
    for (const [id, key, fallback] of [['background-color', 'backgroundColor', '#070b18'], ['surface-color', 'surfaceColor', '#111a31'], ['accent-color', 'accentColor', '#6366f1'], ['text-color', 'textColor', '#f5f7ff'], ['muted-text-color', 'mutedTextColor', '#9aa7c7'], ['input-background-color', 'inputBackgroundColor', '#0c1327']]) setValue(id, theme[key] || fallback);
    setText('design-preview-title', settings.siteName || site.name || 'Your site'); setText('design-preview-copy', settings.fontFamily ? `Using ${settings.fontFamily}` : 'A shared design system gives every page a coherent foundation.');
  }


  function renderDeployment() { const site = state.site || {}; const deployment = site.deployment || {}; setText('deploy-site-name', site.name || 'Website'); setText('deploy-description', deployment.status === 'deployed' ? `Published at ${deployment.path} on ${new Date(deployment.deployedAt).toLocaleString()}.` : 'No deployment has been created yet.'); setText('deploy-status', deployment.status || 'un-deployed'); el('deploy-status').className = `status-pill ${deployment.status === 'deployed' ? 'published' : 'draft'}`; el('deploy-now').textContent = deployment.status === 'deployed' ? 'Undeploy selected site' : 'Deploy selected site'; el('header-deploy').textContent = deployment.status === 'deployed' ? 'Undeploy' : 'Deploy'; }


  const CONTENT_STATUSES = ['draft', 'published', 'archived'];
  const CONTENT_FIELD_TYPES = [
    { key: 'text', label: 'Short text' }, { key: 'textarea', label: 'Long text' }, { key: 'richtext', label: 'Rich text blocks' },
    { key: 'number', label: 'Number' }, { key: 'boolean', label: 'Yes / no' }, { key: 'select', label: 'Choice list' },
    { key: 'image', label: 'Image URL' }, { key: 'url', label: 'Link URL' }, { key: 'date', label: 'Date' }, { key: 'tags', label: 'Tags' },
  ];
  const BLOCK_PALETTE = ['heading', 'paragraph', 'rich_text', 'image', 'link', 'button', 'list', 'quote', 'hr', 'alert', 'callout', 'spacer', 'card', 'cta', 'hero'];
  const BLOCK_LABELS = { heading: 'Heading', paragraph: 'Paragraph', rich_text: 'Rich text', image: 'Image', link: 'Link', button: 'Button', list: 'List', quote: 'Quote', hr: 'Divider', alert: 'Alert', callout: 'Callout', spacer: 'Spacer', card: 'Card', cta: 'Call to action', hero: 'Hero' };


  function contentPath(contentType, slug) { return `/sites/${state.siteSlug}/content/${encodeURIComponent(contentType)}/${encodeURIComponent(slug)}`; }
  /** Selection keys are type-qualified so the same slug in two types never collides. */
  const selectionKey = (entry) => `${entry.contentType}/${entry.slug}`;


  async function loadContentWorkspace() {
    await loadContentTypes();
    await loadCollections();
    await loadContent();
  }


  async function loadCollections() {
    const result = await api(`/sites/${state.siteSlug}/content`);
    if (!result) return;
    state.collections = result.collections || [];
    renderTypeFilter();
    renderDashboard();
  }


  function renderTypeFilter() {
    const filter = el('content-type-filter');
    if (!filter) return;
    const value = state.contentFilter;
    filter.textContent = '';
    const total = state.collections.reduce((sum, collection) => sum + (collection.total || 0), 0) + state.pages.length;
    filter.append(new Option(`All items (${total})`, ''));
    filter.append(new Option(`Pages (${state.pages.length})`, 'page'));
    for (const collection of state.collections) filter.append(new Option(`${collection.name} (${collection.total})`, collection.slug));
    filter.value = (value === 'page' || state.collections.some((collection) => collection.slug === value)) ? value : '';
    state.contentFilter = filter.value;
    const editorSelect = el('content-type-select');
    if (editorSelect && state.contentTypes.length) {
      const current = state.editor?.doc?.contentType;
      editorSelect.textContent = '';
      for (const type of state.contentTypes) editorSelect.append(new Option(type.name, type.slug));
      if (current) editorSelect.value = current;
    }
  }


  async function loadContent(page) {
    if (page) state.contentPage = page;
    if (state.contentFilter === 'page') { state.content = []; state.contentTotal = 0; state.contentPages = 1; renderContent(); return; }
    if (!state.collections.length) { renderContent(); return; }
    const params = new URLSearchParams({
      page: String(state.contentPage || 1),
      limit: String(state.contentLimit || 20),
      sort: state.contentSort || 'updated',
      dir: state.contentDirection || 'desc',
    });
    if (state.contentFilter) params.set('type', state.contentFilter);
    if (state.contentStatus) params.set('status', state.contentStatus);
    if (state.contentQuery) params.set('q', state.contentQuery);
    const result = await api(`/sites/${state.siteSlug}/content/all?${params.toString()}`);
    if (!result) return;
    state.content = result.entries || [];
    state.contentTotal = result.total || 0;
    state.contentPages = result.pages || 1;
    state.contentSelection = (state.contentSelection || []).filter((key) => isPageKey(key) || state.content.some((entry) => selectionKey(entry) === key));
    renderContent();
    renderDashboard();
  }


  function renderContent() {
    const target = el('content-table');
    if (!target) return;
    target.textContent = '';
    renderBulkBar();
    renderPagination();
    const rows = itemRows();
    if (!rows.length) {
      if (!state.collections.length && !state.pages.length) { target.innerHTML = '<div class="empty-state"><strong>Nothing here yet</strong><span>Create a page or a content type to get started.</span></div>'; return; }
      const label = state.contentFilter === 'page' ? 'pages' : state.contentFilter ? contentTypeName(state.contentFilter) : 'this site';
      target.innerHTML = `<div class="empty-state"><strong>No items in ${escapeHtml(label)}</strong><span>${state.contentQuery || state.contentStatus || state.contentFilter ? 'Nothing matches the current filters.' : 'Create something to get started.'}</span></div>`;
      return;
    }
    const rowKey = (row) => (row.kind === 'page' ? pageKey(row.page) : selectionKey(row.entry));
    const table = document.createElement('table');
    table.className = 'table';
    table.innerHTML = '<thead><tr><th class="select-cell"><input type="checkbox" id="content-select-all" aria-label="Select all items"></th><th>Item</th><th>Type</th><th>Status</th><th>Updated</th><th></th></tr></thead>';
    const body = document.createElement('tbody');
    for (const row of rows) {
      const key = rowKey(row);
      const selected = (state.contentSelection || []).includes(key);
      const tr = document.createElement('tr');
      tr.className = selected ? 'selected' : '';
      if (row.kind === 'page') {
        const page = row.page;
        tr.innerHTML = `<td class="select-cell"><input type="checkbox" data-item-select="${escapeHtml(key)}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(page.title)}"></td><td><div class="table-title"><span class="page-glyph">▤</span><span><strong>${escapeHtml(page.title)}</strong><small>/${escapeHtml(page.slug)} · ${page.blocks?.length || 0} elements</small></span></div></td><td><span class="type-badge type-page">Page</span></td><td><span class="status-text ${escapeHtml(page.status)}">${escapeHtml(page.status)}</span></td><td>${new Date(page.updatedAt).toLocaleString()}</td><td><div class="row-actions"><button class="button secondary small-button" data-page-edit="${escapeHtml(page.slug)}">Design</button><button class="button secondary small-button" data-page-publish="${escapeHtml(page.slug)}" ${page.status === 'published' ? 'disabled' : ''}>Publish</button><button class="button secondary small-button" data-page-delete="${escapeHtml(page.slug)}">Delete</button></div></td>`;
      } else {
        const entry = row.entry;
        tr.innerHTML = `<td class="select-cell"><input type="checkbox" data-item-select="${escapeHtml(key)}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(entry.title || entry.slug)}"></td><td><div class="table-title"><span class="page-glyph">◇</span><span><strong>${escapeHtml(entry.title || entry.slug)}</strong><small>/${escapeHtml(entry.slug)}${entry.excerpt ? ` · ${escapeHtml(entry.excerpt.slice(0, 70))}` : ''}</small></span></div></td><td><span class="type-badge type-${escapeHtml(entry.contentType)}">${escapeHtml(contentTypeName(entry.contentType))}</span></td><td><span class="status-text ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></td><td>${new Date(entry.updatedAt).toLocaleString()}</td><td><div class="row-actions"><button class="button secondary small-button" data-content-edit="${escapeHtml(key)}">Edit</button><button class="button secondary small-button" data-content-duplicate="${escapeHtml(key)}">Duplicate</button><button class="button primary small-button" data-content-publish="${escapeHtml(key)}">${entry.status === 'published' ? 'Republish' : 'Publish'}</button><button class="button secondary small-button" data-content-unpublish="${escapeHtml(key)}" ${entry.status !== 'published' ? 'disabled' : ''}>Unpublish</button><button class="button secondary small-button" data-content-delete="${escapeHtml(key)}">Delete</button></div></td>`;
      }
      body.append(tr);
    }
    table.append(body);
    target.append(table);
    el('content-select-all').onchange = (event) => {
      state.contentSelection = event.target.checked ? rows.map(rowKey) : [];
      renderContent();
    };
    target.querySelectorAll('[data-item-select]').forEach((box) => {
      box.onchange = () => {
        const selected = new Set(state.contentSelection || []);
        if (box.checked) selected.add(box.dataset.itemSelect); else selected.delete(box.dataset.itemSelect);
        state.contentSelection = [...selected];
        renderBulkBar();
        box.closest('tr').classList.toggle('selected', box.checked);
      };
    });
    const pageAt = (slug) => state.pages.find((page) => page.slug === slug);
    const entryAt = (key) => state.content.find((entry) => selectionKey(entry) === key);
    target.querySelectorAll('[data-page-edit]').forEach((button) => { button.onclick = () => openDesigner(pageAt(button.dataset.pageEdit)); });
    target.querySelectorAll('[data-page-publish]').forEach((button) => { button.onclick = () => changePage(button.dataset.pagePublish, 'publish'); });
    target.querySelectorAll('[data-page-delete]').forEach((button) => { button.onclick = () => changePage(button.dataset.pageDelete, 'delete'); });
    target.querySelectorAll('[data-content-edit]').forEach((button) => { button.onclick = () => openContentEditor(entryAt(button.dataset.contentEdit)); });
    target.querySelectorAll('[data-content-duplicate]').forEach((button) => { button.onclick = () => changeContent(button.dataset.contentDuplicate, 'duplicate'); });
    target.querySelectorAll('[data-content-publish]').forEach((button) => { button.onclick = () => openPublishDialog(button.dataset.contentPublish); });
    target.querySelectorAll('[data-content-unpublish]').forEach((button) => { button.onclick = () => changeContent(button.dataset.contentUnpublish, 'unpublish'); });
    target.querySelectorAll('[data-content-delete]').forEach((button) => { button.onclick = () => changeContent(button.dataset.contentDelete, 'delete'); });
  }


  function renderBulkBar() {
    const bar = el('content-bulk');
    if (!bar) return;
    const count = (state.contentSelection || []).length;
    bar.classList.toggle('hidden', count === 0);
    setText('content-bulk-count', `${count} selected`);
    const groupCount = new Set((state.contentSelection || []).map((key) => key.split('/')[0])).size;
    setText('content-bulk-scope', groupCount > 1 ? `across ${groupCount} types` : '');
  }


  function renderPagination() {
    const target = el('content-pagination');
    if (!target) return;
    target.textContent = '';
    const page = state.contentPage || 1;
    const pages = state.contentPages || 1;
    const total = state.contentTotal || 0;
    const limit = state.contentLimit || 20;
    const showPages = !state.contentFilter || state.contentFilter === 'page';
    const pageCount = showPages ? state.pages.length : 0;
    if (!total && pages <= 1) { if (pageCount) target.innerHTML = `<span>${pageCount} page${pageCount === 1 ? '' : 's'}</span>`; return; }
    const first = total ? (page - 1) * limit + 1 : 0;
    const last = Math.min(total, page * limit);
    const pageLabel = pageCount ? `${pageCount} page${pageCount === 1 ? '' : 's'} · ` : '';
    target.innerHTML = `<span>${pageLabel}${first}–${last} of ${total} entries</span><div class="pagination-controls"><button class="button secondary small-button" data-content-page="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button class="button secondary small-button" data-content-page="next" ${page >= pages ? 'disabled' : ''}>Next</button></div>`;
    target.querySelectorAll('[data-content-page]').forEach((button) => {
      button.onclick = () => loadContent(button.dataset.contentPage === 'next' ? page + 1 : page - 1).catch((error) => notice(error.message, 'error'));
    });
  }


  /** Block list editor bound to any array through get/set callbacks. */
  function renderInlineBlockEditor(host, target) {
    host.textContent = '';
    const rawBlocks = target.get();
    const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];
    const header = document.createElement('div');
    header.className = 'block-editor-head';
    header.innerHTML = `<select class="block-type-picker" aria-label="Block type">${BLOCK_PALETTE.map((type) => `<option value="${type}">${BLOCK_LABELS[type] || type}</option>`).join('')}</select><button type="button" class="button secondary small-button" data-block-add>Add block</button><button type="button" class="button ghost small-button" data-block-preview>Preview</button>`;
    const list = document.createElement('div');
    list.className = 'block-list';
    const frame = document.createElement('iframe');
    frame.className = 'block-preview hidden';
    frame.setAttribute('sandbox', '');
    frame.setAttribute('title', 'Block preview');
    blocks.forEach((block, index) => list.append(blockRow(block, index, target, list)));
    if (!blocks.length) list.innerHTML = '<p class="toolbar-hint">No blocks yet.</p>';
    header.querySelector('[data-block-add]').onclick = () => {
      const type = header.querySelector('.block-type-picker').value;
      target.set([...target.get(), defaultBlock(type)]);
      renderInlineBlockEditor(host, target);
    };
    header.querySelector('[data-block-preview]').onclick = async () => {
      try {
        const result = await api(`/sites/${state.siteSlug}/content/preview`, { method: 'POST', body: JSON.stringify({ blocks: target.get() }) });
        if (!result) return;
        frame.classList.remove('hidden');
        frame.srcdoc = `<!doctype html><meta charset="utf-8"><base href="${escapeHtml(publicUrl(`/sites/${state.siteSlug}/`))}"><body style="margin:0;padding:16px;font:15px/1.6 system-ui,sans-serif;color:#0f172a;background:#fff">${result.html}</body>`;
      } catch (error) { notice(error.message, 'error'); }
    };
    host.append(header, list, frame);
  }
  function defaultBlock(type) {
    if (type === 'heading') return { type, level: 2, text: 'New heading' };
    if (type === 'list') return { type, text: 'First item\nSecond item' };
    if (type === 'image') return { type, url: '/media/image.png', alt: '' };
    if (type === 'link' || type === 'button') return { type, text: 'Link text', url: 'https://' };
    if (type === 'hr' || type === 'spacer') return { type };
    if (type === 'alert' || type === 'callout') return { type, text: 'Alert message', tone: 'info' };
    return { type, text: 'New paragraph' };
  }


  function blockRow(block, index, target, list) {
    const row = document.createElement('div');
    row.className = 'block-row';
    const update = (next) => { const blocks = [...target.get()]; blocks[index] = next; target.set(blocks); };
    const badge = document.createElement('span');
    badge.className = 'block-badge';
    badge.textContent = BLOCK_LABELS[block.type] || block.type;
    row.append(badge);
    if (block.type === 'heading') {
      const level = document.createElement('select');
      for (let value = 1; value <= 6; value += 1) level.append(new Option(`H${value}`, String(value)));
      level.value = String(block.level || 2);
      level.onchange = () => update({ ...block, level: Number(level.value) });
      row.append(level);
    }
    if (['heading', 'paragraph', 'rich_text', 'link', 'button', 'quote', 'alert', 'callout', 'card', 'cta', 'hero'].includes(block.type)) {
      const text = document.createElement('textarea');
      text.rows = block.type === 'heading' ? 1 : 2;
      text.value = block.text || '';
      text.placeholder = 'Text content';
      text.oninput = () => update({ ...block, text: text.value });
      row.append(text);
    }
    if (['image', 'link', 'button'].includes(block.type)) {
      const url = document.createElement('input');
      url.value = block.url || '';
      url.placeholder = 'https:// or /media/…';
      url.oninput = () => update({ ...block, url: url.value });
      row.append(url);
    }
    if (block.type === 'image') {
      const alt = document.createElement('input');
      alt.value = block.alt || '';
      alt.placeholder = 'Alternative text';
      alt.oninput = () => update({ ...block, alt: alt.value });
      row.append(alt);
    }
    if (block.type === 'alert' || block.type === 'callout') {
      const tone = document.createElement('select');
      for (const option of ['info', 'success', 'warning', 'danger']) tone.append(new Option(option, option));
      tone.value = block.tone || 'info';
      tone.onchange = () => update({ ...block, tone: tone.value });
      row.append(tone);
    }
    const tools = document.createElement('div');
    tools.className = 'block-tools';
    tools.innerHTML = '<button type="button" class="icon-button" data-block-up title="Move up">↑</button><button type="button" class="icon-button" data-block-down title="Move down">↓</button><button type="button" class="icon-button danger" data-block-delete title="Remove">×</button>';
    tools.querySelector('[data-block-up]').onclick = () => { const blocks = [...target.get()]; if (index === 0) return; [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]]; target.set(blocks); renderBlockEditor(list.parentElement, target); };
    tools.querySelector('[data-block-down]').onclick = () => { const blocks = [...target.get()]; if (index === blocks.length - 1) return; [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]]; target.set(blocks); renderBlockEditor(list.parentElement, target); };
    tools.querySelector('[data-block-delete]').onclick = () => { const blocks = [...target.get()]; blocks.splice(index, 1); target.set(blocks); renderBlockEditor(list.parentElement, target); };
    row.append(tools);
    return row;
  }


  /** Saves the page or content entry that the visual editor currently holds. */
  async function saveDocument() {
    const doc = currentDocument();
    if (isContentEditor()) {
      let raw = {};
      const rawText = el('content-data').value.trim();
      if (rawText && rawText !== '{}') {
        try { raw = JSON.parse(rawText); } catch { throw new Error('Raw data must be valid JSON'); }
      }
      const targetType = el('content-type-select').value;
      const payload = {
        contentType: targetType,
        slug: el('designer-content-slug').value.trim(),
        title: el('designer-content-title').value.trim(),
        excerpt: el('designer-content-excerpt').value.trim(),
        status: el('designer-content-status').value,
        sortOrder: Number(el('designer-content-order').value || 0),
        coverImage: el('designer-content-cover').value.trim(),
        blocks: doc.blocks || [],
        data: { ...raw, ...(doc.data || {}) },
      };
      const editing = Boolean(doc.id);
      await api(editing ? contentPath(doc.contentType, doc.slug) : `/sites/${state.siteSlug}/content/${encodeURIComponent(targetType)}`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      notice(editing ? 'Content entry updated.' : 'Content entry created.');
      state.editor = null;
      state.history = [];
      state.historyIndex = -1;
      await loadContentTypes();
      await loadCollections();
      state.contentFilter = targetType;
      await loadContent();
      setView('pages');
      return;
    }
    const existingLayout = normalizedLayout(doc.metadata?.layout || {});
    const payload = { slug: el('designer-slug').value.trim(), title: el('designer-page-title').value.trim(), excerpt: doc.excerpt || '', template: doc.template || 'default', status: el('designer-status').value, blocks: doc.blocks || [], metadata: { ...(doc.metadata || {}), layout: { ...existingLayout, showTopbar: el('layout-topbar').checked, showFooter: el('layout-footer').checked, showLogo: el('layout-logo').checked, contentWidth: el('layout-width').value }, customHtml: el('custom-html').dataset.userHtml === 'true' ? el('custom-html').value : (doc.metadata?.customHtml || ''), customCss: el('custom-css').value, customScript: el('custom-script').value } };
    const path = doc.id ? `/sites/${state.siteSlug}/pages/${encodeURIComponent(doc.slug)}` : `/sites/${state.siteSlug}/pages`;
    await api(path, { method: doc.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    notice(doc.id ? 'Page design saved.' : 'Page created.');
    setDesignerStatus('Saved', 'saved');
    state.editor = null;
    state.history = [];
    state.historyIndex = -1;
    await loadWorkspace();
    setView('pages');
  }


  async function changeContent(key, action) {
    const [contentType, slug] = String(key).split('/');
    const base = contentPath(contentType, slug);
    try {
      if (action === 'delete') await api(base, { method: 'DELETE' });
      else if (action === 'duplicate') await api(`${base}/duplicate`, { method: 'POST' });
      else await api(`${base}/${action}`, { method: 'POST' });
      const messages = { delete: 'Content entry deleted.', duplicate: 'Content entry duplicated.', unpublish: 'Content entry returned to draft.' };
      notice(messages[action]);
      await loadCollections();
      await loadContent();
    } catch (error) { notice(error.message, 'error'); }
  }


  /** Bulk actions run per content type because entries are addressed by type and slug. Pages use the page endpoints. */
  async function bulkContent(action) {
    const keys = [...(state.contentSelection || [])];
    if (!keys.length) return;
    const pageSlugs = keys.filter(isPageKey).map((key) => key.slice('page/'.length));
    const entryKeys = keys.filter((key) => !isPageKey(key));
    if (action === 'delete' && !window.confirm(`Delete ${keys.length} item${keys.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    if ((action === 'unpublish' || action === 'archive') && pageSlugs.length) notice('Pages only support publish and delete; skipping page selections.', 'error');
    const grouped = new Map();
    for (const key of entryKeys) {
      const [contentType, slug] = key.split('/');
      grouped.set(contentType, [...(grouped.get(contentType) || []), slug]);
    }
    try {
      let updated = 0;
      for (const [contentType, slugs] of grouped) {
        const result = await api(`/sites/${state.siteSlug}/content/${encodeURIComponent(contentType)}/bulk`, { method: 'POST', body: JSON.stringify({ action, slugs }) });
        if (result) updated += (result.updated || []).length;
      }
      if (action === 'publish' || action === 'delete') {
        for (const slug of pageSlugs) {
          await api(`/sites/${state.siteSlug}/pages/${encodeURIComponent(slug)}${action === 'delete' ? '' : '/publish'}`, { method: action === 'delete' ? 'DELETE' : 'POST' });
          updated += 1;
        }
      }
      notice(`${updated} item${updated === 1 ? '' : 's'} updated.`);
      state.contentSelection = [];
      await loadWorkspace();
    } catch (error) { notice(error.message, 'error'); }
  }


  function closePublishDialog() {
    el('publish-modal').classList.add('hidden');
    state.publishState = null;
  }


  /** Publish workflow: preview the entry, choose its pages, then deploy. */
  async function openPublishDialog(key) {
    const [contentType, slug] = String(key).split('/');
    try {
      const [entry, pages] = await Promise.all([
        api(contentPath(contentType, slug)),
        state.pages.length ? Promise.resolve(state.pages) : api(`/sites/${state.siteSlug}/pages`).then((result) => { state.pages = result?.pages || []; return state.pages; }),
      ]);
      if (!entry) return;
      const entryRecord = entry.entry || entry;
      state.publishState = { contentType, slug, entry: entryRecord, placements: [...(entry.placements || [])] };
      setText('publish-modal-title', entryRecord.title || entryRecord.slug);
      const preview = await api(`/sites/${state.siteSlug}/content/preview`, { method: 'POST', body: JSON.stringify({ blocks: entryRecord.blocks || [] }) });
      setText('publish-preview-note', `${countBlocks(entryRecord.blocks || [])} blocks · ${contentTypeName(contentType)}`);
      el('publish-preview').srcdoc = entryPreviewDocument(entryRecord, preview?.html || '');
      const list = el('publish-page-list');
      list.textContent = '';
      const placed = new Set(state.publishState.placements);
      for (const page of state.pages) {
        const row = document.createElement('label');
        row.className = 'publish-page-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = page.slug;
        box.checked = placed.has(page.slug);
        box.dataset.publishPage = page.slug;
        const title = document.createElement('span');
        title.innerHTML = `<strong>${escapeHtml(page.title || page.slug)}</strong><small>/${escapeHtml(page.slug)} · ${escapeHtml(page.status)}</small>`;
        row.append(box, title);
        list.append(row);
      }
      if (!state.pages.length) list.innerHTML = '<p class="toolbar-hint">Create a page first to place this entry.</p>';
      el('publish-pages-all').checked = state.pages.length > 0 && state.pages.every((page) => placed.has(page.slug));
      el('publish-pages-all').onchange = (event) => list.querySelectorAll('[data-publish-page]').forEach((box) => { box.checked = event.target.checked; });
      el('publish-deploy').checked = true;
      el('publish-modal').classList.remove('hidden');
    } catch (error) { notice(error.message, 'error'); }
  }


  function entryPreviewDocument(entry, blocksHtml) {
    const cover = entry.coverImage ? `<img src="${escapeHtml(entry.coverImage)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px">` : '';
    const excerpt = entry.excerpt ? `<p class="muted">${escapeHtml(entry.excerpt)}</p>` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtml(publicUrl(`/sites/${state.siteSlug}/`))}"><style>:root{--muted:#94a3c4}*{box-sizing:border-box}body{margin:0;padding:20px;background:#0a1020;color:#f5f7ff;font:16px/1.6 system-ui,sans-serif}.muted{color:var(--muted)}img{max-width:100%}</style></head><body><small>${escapeHtml(contentTypeName(entry.contentType))}</small><h1>${escapeHtml(entry.title || entry.slug)}</h1>${excerpt}${cover}<div>${blocksHtml}</div></body></html>`;
  }


  async function confirmPublish() {
    const pending = state.publishState;
    if (!pending) return;
    const pages = [...el('publish-page-list').querySelectorAll('[data-publish-page]')].filter((box) => box.checked).map((box) => box.value);
    const shouldDeploy = el('publish-deploy').checked;
    try {
      if (pending.entry.status !== 'published') await api(`${contentPath(pending.contentType, pending.slug)}/publish`, { method: 'POST' });
      const placed = await api(`${contentPath(pending.contentType, pending.slug)}/place`, { method: 'POST', body: JSON.stringify({ pages }) });
      closePublishDialog();
      let deployed = false;
      if (shouldDeploy) { await api(`/sites/${state.siteSlug}/deploy`, { method: 'POST' }); deployed = true; }
      notice(`Entry published on ${(placed?.placements || []).length} page(s)${deployed ? ' and the site was deployed' : ''}.`);
      await loadWorkspace();
      await loadCollections();
      await loadContent();
    } catch (error) { notice(error.message, 'error'); }
  }


  function mediaCard(item) {
    const isImage = item.mimeType.startsWith('image/');
    const card = document.createElement('div');
    card.className = 'media-card';
    card.innerHTML = `<div class="media-thumb">${isImage ? `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.altText || item.originalName)}" loading="lazy">` : `<span>${escapeHtml(item.mimeType.split('/')[1] || 'file')}</span>`}</div><strong title="${escapeHtml(item.originalName)}">${escapeHtml(item.originalName)}</strong><small>${Math.max(1, Math.round(item.size / 1024))} KB</small><input class="media-alt" value="${escapeHtml(item.altText)}" placeholder="Alternative text"><div class="row-actions"><button class="button secondary small-button" data-media-use>Use</button><button class="button ghost small-button" data-media-delete>Delete</button></div>`;
    card.querySelector('.media-alt').onchange = async (event) => {
      try { await api(`/media/${item.id}`, { method: 'PATCH', body: JSON.stringify({ altText: event.target.value }) }); notice('Alternative text saved.'); await refreshMedia(); }
      catch (error) { notice(error.message, 'error'); }
    };
    card.querySelector('[data-media-use]').onclick = () => useMediaItem(item);
    card.querySelector('[data-media-delete]').onclick = async () => {
      if (!window.confirm(`Delete ${item.originalName}?`)) return;
      try { await api(`/media/${item.id}`, { method: 'DELETE' }); notice('Media deleted.'); await refreshMedia(); }
      catch (error) { notice(error.message, 'error'); }
    };
    return card;
  }


  // Copy-on-use: pull the asset into the current site's folder and reference it
  // with a site-relative URL so pages deploy without the control plane.
  async function useMediaItem(item) {
    let url = item.url;
    try {
      const used = await api(`/sites/${state.siteSlug}/media/use`, { method: 'POST', body: JSON.stringify({ filename: item.filename }) });
      if (used?.url) url = used.url;
    } catch (error) { notice(error.message, 'error'); return; }
    const target = state.mediaTarget;
    if (target) { target.value = url; target.dispatchEvent(new Event('input')); notice('Media added to this page.'); }
    else { navigator.clipboard?.writeText(url).then(() => notice('Media URL copied.')).catch(() => notice(url)); }
    state.mediaTarget = null;
    el('media-modal').classList.add('hidden');
  }


  function fillMediaGrid(container) {
    if (!container) return;
    container.textContent = '';
    if (!state.media.length) { container.innerHTML = '<div class="empty-state"><strong>No media yet</strong><span>Upload an image to reuse it across entries, pages, and sites.</span></div>'; return; }
    for (const item of state.media) container.append(mediaCard(item));
  }


  async function refreshMedia() {
    const result = await api('/media?limit=200');
    state.media = result?.media || [];
    fillMediaGrid(el('media-grid'));
    fillMediaGrid(el('media-library-grid'));
  }


  async function openMediaLibrary(targetInput) {
    state.mediaTarget = targetInput || null;
    el('media-modal').classList.remove('hidden');
    await refreshMedia();
  }


  async function loadMediaWorkspace() { await refreshMedia(); }


  async function loadMedia() { await refreshMedia(); }


  async function uploadMedia(file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch(apiUrl('/media'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfToken() ? { 'X-CSRF-Token': csrfToken() } : {},
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Upload failed');
      notice('Media uploaded.');
      await refreshMedia();
    } catch (error) { notice(error.message, 'error'); }
  }


  function openCollectionManager() {
    el('collection-modal').classList.remove('hidden');
    renderCollectionManager();
  }


  function renderCollectionManager() {
    const list = el('collection-manager-list');
    list.textContent = '';
    for (const type of state.contentTypes || []) {
      const card = document.createElement('div');
      card.className = 'collection-manager-card';
      card.innerHTML = `<div><strong>${escapeHtml(type.name)}</strong><small>/${escapeHtml(type.slug)} · ${type.entryCount} entries</small><p class="muted">${escapeHtml(type.description || 'No description')}</p><div class="field-chips">${(type.fields || []).map((field) => `<span class="field-chip">${escapeHtml(field.key)}<b>${escapeHtml(field.type)}</b></span>`).join('') || '<span class="field-chip muted">no fields</span>'}</div></div><div class="row-actions"><button class="button secondary small-button" data-collection-edit>Edit</button><button class="button ghost small-button" data-collection-delete>Delete</button></div>`;
      card.querySelector('[data-collection-edit]').onclick = () => fillCollectionForm(type);
      card.querySelector('[data-collection-delete]').onclick = async () => {
        if (!window.confirm(`Delete the ${type.name} collection?`)) return;
        try {
          await api(`/sites/${state.siteSlug}/content-types/${encodeURIComponent(type.slug)}`, { method: 'DELETE' });
          notice('Collection deleted.');
          resetCollectionForm();
          await loadContentTypes();
          await loadCollections();
        } catch (error) { notice(error.message, 'error'); }
      };
      list.append(card);
    }
    if (!list.children.length) list.innerHTML = '<p class="muted">No collections defined yet.</p>';
  }


  async function loadContentTypes() {
    const result = await api(`/sites/${state.siteSlug}/content-types`);
    if (!result) return;
    state.contentTypes = result.types || [];
  }


  function resetCollectionForm() {
    el('collection-form').reset();
    setText('collection-form-title', 'New collection');
    el('collection-save').textContent = 'Create collection';
    el('collection-slug').disabled = false;
    state.collectionEditing = null;
    state.collectionFieldsDraft = [];
    renderCollectionFieldBuilder();
  }


  function renderCollectionFieldBuilder() {
    const list = el('collection-fields');
    list.textContent = '';
    (state.collectionFieldsDraft || []).forEach((field, index) => {
      const row = document.createElement('div');
      row.className = 'field-builder-row';
      row.innerHTML = `<input data-field-key value="${escapeHtml(field.key || '')}" placeholder="key"><input data-field-label value="${escapeHtml(field.label || '')}" placeholder="Label"><select data-field-type>${CONTENT_FIELD_TYPES.map((option) => `<option value="${option.key}" ${option.key === field.type ? 'selected' : ''}>${option.label}</option>`).join('')}</select><label class="checkbox-inline"><input type="checkbox" data-field-required ${field.required ? 'checked' : ''}>Required</label><input data-field-options value="${escapeHtml((field.options || []).join(', '))}" placeholder="choices, comma separated" ${field.type === 'select' ? '' : 'disabled'}><button type="button" class="icon-button danger" data-field-remove title="Remove field">×</button>`;
      const sync = () => {
        state.collectionFieldsDraft[index] = {
          key: row.querySelector('[data-field-key]').value.trim(),
          label: row.querySelector('[data-field-label]').value.trim(),
          type: row.querySelector('[data-field-type]').value,
          required: row.querySelector('[data-field-required]').checked,
          ...(row.querySelector('[data-field-type]').value === 'select' ? { options: row.querySelector('[data-field-options]').value.split(',').map((option) => option.trim()).filter(Boolean) } : {}),
        };
      };
      row.querySelectorAll('input,select').forEach((node) => { node.oninput = sync; node.onchange = sync; });
      row.querySelector('[data-field-remove]').onclick = () => { sync(); state.collectionFieldsDraft.splice(index, 1); renderCollectionFieldBuilder(); };
      list.append(row);
    });
    if (!list.children.length) list.innerHTML = '<p class="toolbar-hint">No fields yet. Text, long text, rich text, number, choice, image, link, date, and tags are supported.</p>';
  }


  function fillCollectionForm(type) {
    state.collectionEditing = type.slug;
    state.collectionFieldsDraft = clone(type.fields || []);
    setText('collection-form-title', `Edit ${type.name}`);
    el('collection-save').textContent = 'Save collection';
    setValue('collection-slug', type.slug);
    setValue('collection-name', type.name);
    setValue('collection-description', type.description);
    el('collection-slug').disabled = true;
    renderCollectionFieldBuilder();
  }


  async function saveCollection(event) {
    event.preventDefault();
    const type = state.collectionEditing;
    const fields = (state.collectionFieldsDraft || []).filter((field) => field.key).map((field) => ({
      ...field,
      label: field.label || field.key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    }));
    const payload = { name: el('collection-name').value.trim(), description: el('collection-description').value.trim(), fields };
    try {
      if (type) await api(`/sites/${state.siteSlug}/content-types/${encodeURIComponent(type)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api(`/sites/${state.siteSlug}/content-types`, { method: 'POST', body: JSON.stringify({ slug: el('collection-slug').value.trim(), ...payload }) });
      notice(type ? 'Collection updated.' : 'Collection created.');
      resetCollectionForm();
      el('collection-modal').classList.add('hidden');
      await loadContentTypes();
      await loadCollections();
      renderContent();
    } catch (error) { notice(error.message, 'error'); }
  }


  async function createSite() {
    const name = el('new-site-name').value.trim();
    const slug = el('new-site-slug').value.trim();
    const originUrl = el('new-site-url').value.trim();
    const settings = { siteName: name, logoText: name.slice(0, 1).toUpperCase(), logoUrl: '', fontFamily: 'Inter, system-ui, sans-serif', theme: {} };
    const result = await api('/sites', { method: 'POST', body: JSON.stringify({ slug, name, originUrl, settings }) });
    state.siteSlug = result.site.slug;
    el('site-create-form').reset();
    notice(`Site workspace “${name}” created.`);
    await loadWorkspace();
    setView('sites');
  }


  async function importSelectedSite() {
    const sourceUrl = el('import-url').value.trim() || state.site?.originUrl;
    if (!sourceUrl) throw new Error('Enter the running site URL to import');
    const result = await api(`/sites/${state.siteSlug}/import`, { method: 'POST', body: JSON.stringify({ sourceUrl }) });
    notice(`${result.pages?.length || 0} page(s) imported as drafts.`);
    await loadWorkspace();
    setView('pages');
  }


  async function loadWorkspace() { try { const result = await api('/sites'); if (!result) return; state.sites = result.sites || []; renderSites(); state.site = state.sites.find((site) => site.slug === state.siteSlug) || state.sites[0]; if (!state.site) throw new Error('No website workspace is available'); state.siteSlug = state.site.slug; renderSites(); setValue('import-url', state.site.originUrl || ''); const pages = await api(`/sites/${state.siteSlug}/pages`); state.pages = pages?.pages || []; state.content = []; state.contentSelection = []; state.contentPage = 1; await loadCollections(); showLoggedIn(); renderDashboard(); renderSiteSettings(); renderDeployment(); if (state.view === 'sites') renderSiteDirectory(); if (state.view === 'pages') renderContent(); } catch (error) { if (error.message === 'Authentication required') return; notice(error.message, 'error'); } }


  function renderElementPalette() {
    const canvasColumn = document.querySelector('.canvas-column');
    if (!canvasColumn) return;
    if (dockBodies.components && dockBodies.components.querySelector('#canvas-element-toolbar')) return;
    if (!dockBodies.components && el('canvas-element-toolbar')) return;
    const basicGroups = [
      ['Structure', ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'div']],
      ['Text', ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'pre', 'code', 'strong', 'em', 'small', 'mark', 'span', 'time']],
      ['Lists & tables', ['ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'th', 'td']],
      ['Media & embeds', ['img', 'video', 'iframe', 'figure', 'figcaption']],
      ['Forms & interactive', ['form', 'label', 'input', 'textarea', 'select', 'details', 'summary', 'dialog', 'button']],
    ];
    const components = [
      ['Bootstrap-inspired components', ['navbar', 'hero', 'card', 'feature-grid', 'alert', 'badge', 'button-group', 'breadcrumb', 'list-group', 'accordion', 'pricing', 'stats', 'cta', 'callout', 'spacer']],
    ];
    const groupKey = (label, index) => `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`;
    const groupMarkup = (groups, kind) => groups.map(([label, items], index) => `<section class="palette-ribbon-group" data-ribbon-group="${groupKey(label, index)}"><div class="canvas-palette-buttons">${items.map((item) => { const name = kind === 'html' ? `<${item}>` : blockLabel(item); const action = kind === 'html' ? `data-add-html="${item}"` : `data-add-block="${item}"`; return `<button type="button" class="palette-button" ${action} title="Add ${escapeHtml(name)}" aria-label="Add ${escapeHtml(name)}"><span class="palette-button-icon" aria-hidden="true">${paletteIcon(item)}</span><span class="palette-button-label">${kind === 'html' ? item : blockLabel(item)}</span></button>`; }).join('')}</div><span class="palette-ribbon-group-label">${label}</span></section>`).join('');
    const ribbonTabs = (groups) => groups.map(([label], index) => `<button type="button" class="ribbon-tab ${index === 0 ? 'active' : ''}" data-ribbon-tab="${groupKey(label, index)}" aria-selected="${index === 0 ? 'true' : 'false'}">${label}</button>`).join('');
    const toolbar = document.createElement('section');
    toolbar.id = 'canvas-element-toolbar'; toolbar.className = 'canvas-element-toolbar';
    toolbar.innerHTML = `<div class="canvas-element-heading"><div><span class="toolbar-label">Elements</span><span class="toolbar-hint">Add to ${state.selectedBlockPath ? 'the selected element' : 'the page root'} · drag layers to nest</span></div><div class="canvas-element-tools"><label class="palette-search"><span>⌕</span><input id="element-palette-search" type="search" placeholder="Search elements" aria-label="Search elements"></label><span id="block-count" class="count-pill">0 elements</span></div></div><div class="canvas-element-tabs" role="tablist"><button type="button" class="tool-tab active" data-palette-tab="html" aria-selected="true">Basic HTML</button><button type="button" class="tool-tab" data-palette-tab="components" aria-selected="false">Reusable components</button></div><div class="canvas-element-panel active" data-palette-panel="html"><div class="palette-ribbon-tabs" role="tablist">${ribbonTabs(basicGroups)}</div><div class="palette-ribbon-content">${groupMarkup(basicGroups, 'html')}</div></div><div class="canvas-element-panel" data-palette-panel="components"><div class="palette-ribbon-tabs" role="tablist">${ribbonTabs(components)}</div><div class="palette-ribbon-content">${groupMarkup(components, 'components')}</div></div>`;
    const activateRibbonGroup = (panel, key) => { panel.querySelectorAll('[data-ribbon-tab]').forEach((tab) => { const active = tab.dataset.ribbonTab === key; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); }); panel.querySelectorAll('[data-ribbon-group]').forEach((group) => group.classList.toggle('active', group.dataset.ribbonGroup === key)); };
    toolbar.querySelectorAll('[data-palette-tab]').forEach((tab) => { tab.onclick = () => { toolbar.querySelectorAll('[data-palette-tab]').forEach((node) => { const active = node === tab; node.classList.toggle('active', active); node.setAttribute('aria-selected', String(active)); }); toolbar.querySelectorAll('[data-palette-panel]').forEach((panel) => { const active = panel.dataset.palettePanel === tab.dataset.paletteTab; panel.classList.toggle('active', active); if (active) activateRibbonGroup(panel, panel.querySelector('[data-ribbon-tab]')?.dataset.ribbonTab); }); }; });
    toolbar.querySelectorAll('[data-palette-panel]').forEach((panel) => { const first = panel.querySelector('[data-ribbon-tab]')?.dataset.ribbonTab; if (first) activateRibbonGroup(panel, first); panel.querySelectorAll('[data-ribbon-tab]').forEach((tab) => { tab.onclick = () => activateRibbonGroup(panel, tab.dataset.ribbonTab); }); });
    toolbar.querySelectorAll('[data-add-html]').forEach((node) => { node.onclick = () => addBlock('html_element', state.selectedBlockPath, { tag: node.dataset.addHtml }); });
    toolbar.querySelectorAll('[data-add-block]').forEach((node) => { node.onclick = () => addBlock(node.dataset.addBlock, state.selectedBlockPath); });
    toolbar.querySelector('#element-palette-search').oninput = (event) => { const query = event.target.value.trim().toLowerCase(); toolbar.classList.toggle('palette-searching', Boolean(query)); toolbar.querySelectorAll('[data-palette-panel]').forEach((panel) => { let firstMatch = null; panel.querySelectorAll('[data-ribbon-group]').forEach((group) => { let visible = 0; group.querySelectorAll('.palette-button').forEach((button) => { const matches = !query || button.textContent.toLowerCase().includes(query) || button.title.toLowerCase().includes(query); button.classList.toggle('palette-hidden', !matches); if (matches) visible += 1; }); group.classList.toggle('palette-hidden', visible === 0); if (visible && !firstMatch) firstMatch = group.dataset.ribbonGroup; }); if (query && firstMatch) activateRibbonGroup(panel, firstMatch); }); };
    if (dockBodies.components) { toolbar.classList.add('library-flat-components'); toolbar.querySelector('.canvas-element-heading > div:first-child')?.classList.add('sr-only'); dockBodies.components.append(toolbar); }
  }
  function setSidebarState(open) { const workspace = el('workspace'); if (!workspace) return; const mobile = window.matchMedia('(max-width: 760px)').matches; workspace.classList.toggle('sidebar-collapsed', !open && !mobile); workspace.classList.toggle('sidebar-closed', !open && mobile); workspace.classList.toggle('sidebar-open', open && mobile); const toggle = el('sidebar-toggle'); if (toggle) { toggle.title = open ? 'Collapse navigation' : 'Expand navigation'; toggle.setAttribute('aria-label', toggle.title); } }


  el('login-link').href = `${publicUrl('/login')}?return_to=${encodeURIComponent(`${appBase || ''}/`)}`; el('logout-link').href = publicUrl('/logout');
  setupDesignerToolbar(); setupDesignerDocking(); const designSurfaceHint = document.querySelector('#designer-visual .designer-workspace-toolbar .toolbar-hint'); if (designSurfaceHint) designSurfaceHint.textContent = 'Click text in the canvas to edit it; use the inspector for appearance and layout.'; const canvasHint = document.querySelector('#designer-visual .canvas-toolbar .toolbar-hint'); if (canvasHint) canvasHint.textContent = 'Live editor · click text to edit, or select an element to inspect it'; const summaryField = el('designer-excerpt')?.closest('label'); if (summaryField) summaryField.classList.add('hidden'); el('sidebar-toggle').onclick = () => { const workspace = el('workspace'); const mobile = window.matchMedia('(max-width: 760px)').matches; const open = mobile ? workspace.classList.contains('sidebar-open') : !workspace.classList.contains('sidebar-collapsed'); setSidebarState(!open); }; el('sidebar-menu').onclick = () => setSidebarState(!el('workspace').classList.contains('sidebar-open'));
  document.querySelectorAll('[data-view]').forEach((node) => { node.onclick = () => { setView(node.dataset.view); if (window.matchMedia('(max-width: 760px)').matches) setSidebarState(false); }; });
  document.querySelectorAll('[data-editor-tab]').forEach((node) => { node.onclick = () => { state.editorTab = node.dataset.editorTab; document.querySelectorAll('[data-editor-tab]').forEach((tab) => tab.classList.toggle('active', tab === node)); el('designer-visual').classList.toggle('hidden', state.editorTab !== 'visual'); el('designer-code').classList.toggle('hidden', state.editorTab !== 'code'); el('designer-script').classList.toggle('hidden', state.editorTab !== 'script'); if (state.editorTab === 'code') prefillGeneratedMarkup(); if (state.editorTab === 'visual') { const frame = el('visual-preview'); if (frame) frame.removeAttribute('srcdoc'); renderPreview(); } }; });
  el('open-layout-picker').onclick = openLayoutPicker; el('close-layout-picker').onclick = closeLayoutPicker; document.querySelectorAll('[data-close-layout-picker]').forEach((node) => { node.onclick = closeLayoutPicker; }); el('layout-picker-category').onchange = () => { state.layoutCategory = el('layout-picker-category').value; renderLayoutTemplates(); };
  el('clear-element-selection').onclick = () => { state.selectedBlockPath = null; state.selectedShell = null; state.selectedShellChild = null; renderBlockEditor(); renderPreview(); };
  document.querySelectorAll('[data-add-block]').forEach((node) => { node.onclick = () => addBlock(node.dataset.addBlock); });
  ['designer-slug', 'designer-page-title', 'designer-status', 'layout-width'].forEach((id) => { el(id).oninput = () => { const page = currentDocument(); if (id === 'designer-slug') page.slug = el(id).value; if (id === 'designer-page-title') page.title = el(id).value; if (id === 'designer-status') page.status = el(id).value; if (id === 'layout-width') page.metadata.layout.contentWidth = el(id).value; renderPreview(); scheduleHistory(); }; });
  ['layout-topbar', 'layout-footer', 'layout-logo'].forEach((id) => { el(id).onchange = () => { currentDocument().metadata.layout[id === 'layout-topbar' ? 'showTopbar' : id === 'layout-footer' ? 'showFooter' : 'showLogo'] = el(id).checked; renderLayoutTemplates(); renderPreview(); pushHistory(); }; });
  ['custom-html', 'custom-css', 'custom-script'].forEach((id) => { el(id).oninput = () => { currentDocument().metadata[id.replace('custom-', 'custom')] = el(id).value; if (id === 'custom-html') { el(id).dataset.userHtml = 'true'; state.customHtmlBaseline = null; } renderPreview(); scheduleHistory(); }; });
  el('new-page').onclick = () => openDesigner(); el('back-to-pages').onclick = () => { state.editor = null; state.history = []; state.historyIndex = -1; setView('pages'); }; el('save-page').onclick = () => saveDocument().catch((error) => notice(error.message, 'error')); el('preview-page').onclick = renderPreview;
  document.addEventListener('keydown', (event) => { if (state.view !== 'designer') return; const tag = event.target?.tagName?.toLowerCase(); const editingText = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable; if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !editingText) { event.preventDefault(); restoreHistory(state.historyIndex + (event.shiftKey ? 1 : -1)); } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y' && !editingText) { event.preventDefault(); restoreHistory(state.historyIndex + 1); } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && state.selectedBlockPath && !editingText) { event.preventDefault(); duplicateBlock(state.selectedBlockPath); } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedBlockPath && !editingText) { event.preventDefault(); deleteBlock(state.selectedBlockPath); } });
  el('focus-create-site').onclick = () => { setView('sites'); el('new-site-slug').focus(); };
  el('site-create-form').onsubmit = (event) => { event.preventDefault(); createSite().catch((error) => notice(error.message, 'error')); };
  el('import-site').onclick = () => importSelectedSite().catch((error) => notice(error.message, 'error'));
  el('refresh-sites').onclick = () => loadWorkspace().catch((error) => notice(error.message, 'error'));
  el('site-select').onchange = async (event) => { state.siteSlug = event.target.value; await loadWorkspace(); setView('dashboard'); };
  el('save-settings').onclick = async () => { try { const settings = { siteName: el('site-name').value, logoText: el('logo-text').value, logoUrl: el('logo-url').value, fontFamily: el('font-family').value, theme: { backgroundColor: el('background-color').value, surfaceColor: el('surface-color').value, accentColor: el('accent-color').value, textColor: el('text-color').value, mutedTextColor: el('muted-text-color').value, inputBackgroundColor: el('input-background-color').value } }; await api(`/sites/${state.siteSlug}`, { method: 'PATCH', body: JSON.stringify({ name: settings.siteName, settings }) }); notice('Site design saved.'); await loadWorkspace(); } catch (error) { notice(error.message, 'error'); } };
  el('header-deploy').onclick = () => deploySite().catch((error) => notice(error.message, 'error')); el('deploy-now').onclick = () => deploySite().catch((error) => notice(error.message, 'error'));
  async function deploySite() { const deployed = state.site?.deployment?.status !== 'deployed'; await api(`/sites/${state.siteSlug}/${deployed ? 'deploy' : 'undeploy'}`, { method: 'POST' }); notice(deployed ? 'Website deployed.' : 'Website undeployed.'); await loadWorkspace(); renderDeployment(); }
  el('new-content').onclick = () => openContentEditor();
  el('publish-entry').onclick = () => {
    if (!currentDocument().id) { notice('Save the entry before publishing it.', 'error'); return; }
    openPublishDialog(selectionKey(currentDocument())).catch((error) => notice(error.message, 'error'));
  };
  el('designer-content-cover-pick').onclick = () => openMediaLibrary(el('designer-content-cover')).catch((error) => notice(error.message, 'error'));
  el('content-type-select').onchange = () => { currentDocument().contentType = el('content-type-select').value; setDesignerFields(); scheduleHistory(); };
  ['designer-content-title', 'designer-content-slug', 'designer-content-status', 'designer-content-order', 'designer-content-excerpt', 'designer-content-cover'].forEach((id) => { el(id).addEventListener('input', () => { const doc = currentDocument(); if (id === 'designer-content-title') doc.title = el(id).value; if (id === 'designer-content-slug') doc.slug = el(id).value; if (id === 'designer-content-status') doc.status = el(id).value; if (id === 'designer-content-order') doc.sortOrder = Number(el(id).value || 0); if (id === 'designer-content-excerpt') doc.excerpt = el(id).value; if (id === 'designer-content-cover') doc.coverImage = el(id).value; setText('designer-title', doc.title || doc.slug || 'New entry'); scheduleHistory(); }); });
  el('open-media').onclick = () => openMediaLibrary().catch((error) => notice(error.message, 'error'));
  document.querySelectorAll('[data-close-media]').forEach((node) => { node.onclick = () => { el('media-modal').classList.add('hidden'); state.mediaTarget = null; }; });
  el('media-upload').onchange = (event) => { uploadMedia(event.target.files?.[0]).finally(() => { event.target.value = ''; }); };
  el('media-upload-page')?.addEventListener('change', (event) => { uploadMedia(event.target.files?.[0]).finally(() => { event.target.value = ''; }); });
  // Any field with a Library button opens the shared picker and writes the
  // chosen (site-relative) URL back into the input it sits beside.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-library-pick]');
    if (!button) return;
    const input = button.previousElementSibling;
    if (!input || input.tagName !== 'INPUT') return;
    event.preventDefault();
    openMediaLibrary(input).catch((error) => notice(error.message, 'error'));
  });
  el('manage-collections').onclick = () => loadContentTypes().then(openCollectionManager).catch((error) => notice(error.message, 'error'));
  document.querySelectorAll('[data-close-collections]').forEach((node) => { node.onclick = () => { el('collection-modal').classList.add('hidden'); resetCollectionForm(); }; });
  el('collection-form').onsubmit = (event) => saveCollection(event);
  el('collection-reset').onclick = () => resetCollectionForm();
  el('collection-add-field').onclick = () => { state.collectionFieldsDraft = [...(state.collectionFieldsDraft || []), { key: '', label: '', type: 'text', required: false }]; renderCollectionFieldBuilder(); };
  el('content-bulk-clear').onclick = () => { state.contentSelection = []; renderContent(); };
  document.querySelectorAll('[data-content-bulk]').forEach((node) => { node.onclick = () => bulkContent(node.dataset.contentBulk); });
  document.querySelectorAll('[data-content-status]').forEach((node) => { node.onclick = () => { state.contentStatus = node.dataset.contentStatus; state.contentPage = 1; document.querySelectorAll('[data-content-status]').forEach((tab) => tab.classList.toggle('active', tab === node)); loadContent().catch((error) => notice(error.message, 'error')); }; });
  el('content-type-filter').onchange = (event) => { state.contentFilter = event.target.value; state.contentPage = 1; state.contentSelection = []; loadContent().catch((error) => notice(error.message, 'error')); };
  el('content-sort').onchange = (event) => { state.contentSort = event.target.value; state.contentPage = 1; loadContent().catch((error) => notice(error.message, 'error')); };
  el('content-direction').onchange = (event) => { state.contentDirection = event.target.value; state.contentPage = 1; loadContent().catch((error) => notice(error.message, 'error')); };
  el('content-search').oninput = (event) => { window.clearTimeout(state.contentSearchTimer); const value = event.target.value.trim(); state.contentSearchTimer = window.setTimeout(() => { state.contentQuery = value; state.contentPage = 1; loadContent().catch((error) => notice(error.message, 'error')); }, 280); };
  document.querySelectorAll('[data-close-publish]').forEach((node) => { node.onclick = closePublishDialog; });
  el('publish-confirm').onclick = () => confirmPublish().catch((error) => notice(error.message, 'error'));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !el('publish-modal').classList.contains('hidden')) closePublishDialog(); });
  resetCollectionForm();
  window.setTimeout(() => { if (el('app-loading') && !el('app-loading').classList.contains('hidden')) showLoggedOut(); }, 10000);
  window.addEventListener('hashchange', () => { const view = viewFromHash(); if (view && view !== state.view) setView(view); });
  loadWorkspace().then(() => { const view = viewFromHash(); if (view && view !== state.view) setView(view); }).catch((error) => { hideLoading(); showLoggedOut(); notice(error.message, 'error'); });
}());
