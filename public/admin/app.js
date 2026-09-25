(function () {
  'use strict';

  const appBase = location.pathname.startsWith('/sitemaster') ? '/sitemaster' : '';
  const state = { siteSlug: 'mainsite', site: null, sites: [], pages: [], content: [], contentType: 'general', contentEditingSlug: null, editingPage: null, selectedBlockPath: null, selectedShell: null, structureOpen: true, propertiesOpen: false, view: 'dashboard', editorTab: 'visual', layoutCategory: 'all', device: 'desktop', history: [], historyIndex: -1, historyTimer: null, historySuspended: false };
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

  function showLoggedOut() { el('auth-view').classList.remove('hidden'); el('workspace').classList.add('hidden'); }
  function showLoggedIn() { el('auth-view').classList.add('hidden'); el('workspace').classList.remove('hidden'); }
  function setValue(id, value, fallback = '') { if (el(id)) el(id).value = value ?? fallback; }
  function setText(id, value) { if (el(id)) el(id).textContent = value ?? ''; }
  function siteTheme() { return state.site?.settings?.theme || {}; }
  function currentPage() { return state.editingPage || { slug: 'new-page', title: 'New page', excerpt: '', status: 'draft', template: 'default', blocks: [], metadata: {} }; }
  function setDesignerStatus(message, kind = '') { const node = el('designer-save-status'); if (!node) return; node.textContent = message; node.className = `designer-save-status ${kind}`; }
  function updateHistoryControls() { const undo = el('designer-history-undo'); const redo = el('designer-history-redo'); if (undo) undo.disabled = state.historyIndex <= 0; if (redo) redo.disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1; }
  function pushHistory() { if (state.historySuspended || !state.editingPage) return; const snapshot = clone(state.editingPage); const current = state.history[state.historyIndex]; if (current && JSON.stringify(current) === JSON.stringify(snapshot)) return; state.history = state.history.slice(0, state.historyIndex + 1); state.history.push(snapshot); state.historyIndex = state.history.length - 1; updateHistoryControls(); setDesignerStatus('Unsaved changes', 'dirty'); }
  function scheduleHistory() { window.clearTimeout(state.historyTimer); state.historyTimer = window.setTimeout(() => { pushHistory(); state.historyTimer = null; }, 450); setDesignerStatus('Unsaved changes', 'dirty'); }
  function restoreHistory(index) { const snapshot = state.history[index]; if (!snapshot) return; state.historySuspended = true; state.editingPage = clone(snapshot); state.historyIndex = index; state.selectedBlockPath = null; state.historySuspended = false; setDesignerFields(); renderBlockEditor(); renderPreview(); updateHistoryControls(); setDesignerStatus('Unsaved changes', 'dirty'); }

  function setView(view) {
    state.view = view;
    const workspace = el('workspace'); workspace?.classList.toggle('designer-focus-mode', view === 'designer'); if (view === 'designer') setSidebarState(false); else if (!window.matchMedia('(max-width: 760px)').matches) setSidebarState(true);
    document.querySelectorAll('.view').forEach((node) => node.classList.toggle('active-view', node.id === `view-${view}`));
    document.querySelectorAll('.nav-item').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
    const titles = { dashboard: 'Overview', sites: 'Sites', pages: 'Pages', designer: 'Page designer', content: 'Content', site: 'Site design', deploy: 'Deployments' };
    setText('view-title', titles[view] || 'Workspace');
    if (view === 'sites') renderSiteDirectory();
    if (view === 'pages') renderPages();
    if (view === 'site') renderSiteSettings();
    if (view === 'deploy') renderDeployment();
    if (view === 'content') loadContent().catch((error) => notice(error.message, 'error'));
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
    setText('stat-content', state.content.length);
    setText('stat-deployment', deployment.status === 'deployed' ? 'Live' : 'Offline');
    setText('stat-deployment-path', deployment.status === 'deployed' ? deployment.path : 'Not published');
    setText('dashboard-status', deployment.status || 'un-deployed');
    el('dashboard-status').className = `status-pill ${deployment.status === 'deployed' ? 'published' : 'draft'}`;
  }

  function renderPages() {
    const target = el('pages-table');
    target.textContent = '';
    if (!state.pages.length) { target.innerHTML = '<div class="empty-state"><strong>No pages yet</strong><span>Create your first page in the visual designer.</span></div>'; return; }
    const table = document.createElement('table'); table.className = 'table';
    table.innerHTML = '<thead><tr><th>Page</th><th>Template</th><th>Status</th><th>Updated</th><th></th></tr></thead>';
    const body = document.createElement('tbody');
    for (const page of state.pages) {
      const row = document.createElement('tr');
      row.innerHTML = `<td><div class="table-title"><span class="page-glyph">▤</span><span><strong>${escapeHtml(page.title)}</strong><small>/${escapeHtml(page.slug)} · ${page.blocks?.length || 0} visual elements</small></span></div></td><td>${escapeHtml(page.template || 'default')}</td><td><span class="status-text ${escapeHtml(page.status)}">${escapeHtml(page.status)}</span></td><td>${new Date(page.updatedAt).toLocaleString()}</td><td><div class="row-actions"><button class="button secondary small-button" data-page-edit="${escapeHtml(page.slug)}">Design</button>${page.status !== 'published' ? `<button class="button secondary small-button" data-page-publish="${escapeHtml(page.slug)}">Publish</button>` : ''}<button class="button secondary small-button" data-page-delete="${escapeHtml(page.slug)}">Delete</button></div></td>`;
      body.append(row);
    }
    table.append(body); target.append(table);
    target.querySelectorAll('[data-page-edit]').forEach((button) => { button.onclick = () => openDesigner(state.pages.find((page) => page.slug === button.dataset.pageEdit)); });
    target.querySelectorAll('[data-page-publish]').forEach((button) => { button.onclick = () => changePage(button.dataset.pagePublish, 'publish'); });
    target.querySelectorAll('[data-page-delete]').forEach((button) => { button.onclick = () => changePage(button.dataset.pageDelete, 'delete'); });
  }

  function templateByKey(key) { return LAYOUT_TEMPLATES.find((template) => template.key === key) || LAYOUT_TEMPLATES[3]; }
  function layoutFromTemplate(template) { return { template: template.key, showTopbar: template.header, showFooter: template.footer, showLogo: template.header, contentWidth: template.width, columns: template.columns, columnMode: template.icon }; }
  function normalizedLayout(layout = {}) { const template = templateByKey(layout.template || (layout.showTopbar === false ? 'blank-1' : 'standard')); return { ...layoutFromTemplate(template), ...layout, template: template.key, columns: Number(layout.columns || template.columns) }; }
  function defaultPage() { return { slug: `new-page-${Date.now().toString(36)}`, title: 'New page', excerpt: '', template: 'default', status: 'draft', blocks: [{ type: 'heading', level: 1, text: 'Your new page' }, { type: 'paragraph', text: 'Start designing this page with visual elements.' }], metadata: { layout: layoutFromTemplate(templateByKey('standard')), customHtml: '', customCss: '', customScript: '' } }; }
  function assignBlockIds(blocks, prefix = 'block') { let counter = 0; const visit = (items, parent = prefix) => (items || []).map((block) => { const next = { ...block, id: block.id || `${parent}-${counter++}`, style: { ...(block.style || {}) }, children: visit(block.children || [], `${parent}-${counter}`) }; return next; }); return visit(blocks); }
  function openDesigner(page) { state.editingPage = clone(page || defaultPage()); state.selectedBlockPath = null; state.selectedShell = null; state.structureOpen = false; state.propertiesOpen = false; state.editingPage.blocks = assignBlockIds(state.editingPage.blocks || []); const metadata = state.editingPage.metadata || {}; const settings = state.site?.settings || {}; state.editingPage.metadata = { layout: normalizedLayout(metadata.layout || {}), customHtml: metadata.customHtml || '', customCss: metadata.customCss || '', customScript: metadata.customScript || '', headerText: metadata.headerText || settings.siteName || state.site?.name || 'Website', footerText: metadata.footerText || 'Published with Sitemaster' }; state.history = [clone(state.editingPage)]; state.historyIndex = 0; state.device = 'desktop'; setView('designer'); setPanelState('structure', false); setPanelState('properties', false); setDesignerFields(); renderBlockEditor(); renderPreview(); updateHistoryControls(); setDesignerStatus('Ready to edit'); }

  function renderLayoutTemplates() {
    const activeLayout = normalizedLayout(currentPage().metadata?.layout);
    const activeTemplate = templateByKey(activeLayout.template);
    const mini = el('layout-template-mini');
    if (mini) mini.className = `template-mini layout-icon-${activeTemplate.icon} ${activeTemplate.header ? 'has-header' : ''} ${activeTemplate.footer ? 'has-footer' : ''}`;
    setText('layout-template-name', activeTemplate.name); setText('layout-template-description', activeTemplate.description);
    const target = el('layout-picker-options');
    if (!target) return;
    const active = activeLayout.template;
    const templates = LAYOUT_TEMPLATES.filter((template) => state.layoutCategory === 'all' || template.category === state.layoutCategory);
    target.innerHTML = templates.map((template) => `<button type="button" class="layout-template-card ${template.key === active ? 'active' : ''}" data-layout-template="${template.key}"><span class="template-mini layout-icon-${template.icon} ${template.header ? 'has-header' : ''} ${template.footer ? 'has-footer' : ''}"><span class="layout-region layout-header"></span><span class="layout-region layout-left"></span><span class="layout-region layout-center"></span><span class="layout-region layout-right"></span><span class="layout-region layout-footer"></span></span><span class="layout-template-copy"><strong>${template.name}</strong><small>${template.description}</small></span></button>`).join('');
    target.querySelectorAll('[data-layout-template]').forEach((button) => { button.onclick = () => { const page = currentPage(); page.metadata.layout = layoutFromTemplate(templateByKey(button.dataset.layoutTemplate)); closeLayoutPicker(); setDesignerFields(); renderBlockEditor(); renderPreview(); pushHistory(); }; });
  }

  function openLayoutPicker() { state.layoutCategory = el('layout-picker-category')?.value || 'all'; el('layout-picker-modal').classList.remove('hidden'); renderLayoutTemplates(); }
  function closeLayoutPicker() { el('layout-picker-modal').classList.add('hidden'); }
  function setCanvasDevice(device) { state.device = device; const frame = document.querySelector('.canvas-frame'); if (frame) { frame.classList.remove('device-desktop', 'device-tablet', 'device-mobile'); frame.classList.add(`device-${device}`); } document.querySelectorAll('[data-canvas-device]').forEach((button) => { const active = button.dataset.canvasDevice === device; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); }); }
  function setupDesignerToolbar() {
    const actions = document.querySelector('.designer-panel-actions'); const canvasToolbar = document.querySelector('.canvas-toolbar');
    if (!actions || !canvasToolbar || el('designer-history-undo')) return;
    const history = document.createElement('div'); history.className = 'designer-history-controls'; history.innerHTML = '<button id="designer-history-undo" class="icon-button" type="button" title="Undo last change" aria-label="Undo last change">↶</button><button id="designer-history-redo" class="icon-button" type="button" title="Redo last change" aria-label="Redo last change">↷</button>';
    actions.prepend(history);
    const status = document.createElement('span'); status.id = 'designer-save-status'; status.className = 'designer-save-status'; status.textContent = 'Ready'; actions.append(status);
    const devices = document.createElement('div'); devices.className = 'canvas-device-tabs'; devices.setAttribute('role', 'tablist'); devices.innerHTML = '<button type="button" class="device-tab active" data-canvas-device="desktop" aria-selected="true">Desktop</button><button type="button" class="device-tab" data-canvas-device="tablet" aria-selected="false">Tablet</button><button type="button" class="device-tab" data-canvas-device="mobile" aria-selected="false">Mobile</button>';
    canvasToolbar.querySelector('.device-pill')?.remove(); canvasToolbar.append(devices);
    const paletteToggle = document.createElement('button'); paletteToggle.id = 'toggle-elements-palette'; paletteToggle.className = 'tool-tab'; paletteToggle.type = 'button'; paletteToggle.textContent = '＋ Elements'; paletteToggle.title = 'Show or hide the element palette'; canvasToolbar.append(paletteToggle);
    const frame = document.querySelector('.canvas-frame'); if (frame) { frame.id = 'canvas-frame'; frame.classList.add('device-desktop'); }
    el('designer-history-undo').onclick = () => restoreHistory(state.historyIndex - 1);
    el('designer-history-redo').onclick = () => restoreHistory(state.historyIndex + 1);
    devices.querySelectorAll('[data-canvas-device]').forEach((button) => { button.onclick = () => setCanvasDevice(button.dataset.canvasDevice); });
    paletteToggle.onclick = () => { const palette = el('canvas-element-toolbar'); if (!palette) return; const collapsed = palette.classList.toggle('collapsed'); paletteToggle.classList.toggle('active', !collapsed); paletteToggle.setAttribute('aria-expanded', String(!collapsed)); };
  }
  function setupDesignerToolRail() {
    const workspace = el('designer-workspace'); const structure = el('structure-panel'); const properties = el('properties-panel');
    if (!workspace || !structure || !properties || workspace.dataset.webstudioReady === 'true') return;
    workspace.dataset.webstudioReady = 'true'; workspace.classList.add('webstudio-mode');
    structure.setAttribute('role', 'navigation'); structure.setAttribute('aria-label', 'Page navigator'); properties.setAttribute('role', 'complementary');

    const heading = properties.querySelector('.tool-panel-heading');
    const originalFields = properties.querySelector('.inspector-fields');
    const elementInspector = properties.querySelector('#element-inspector');
    if (heading && originalFields && elementInspector) {
      const tabs = document.createElement('div'); tabs.className = 'inspector-mode-tabs'; tabs.setAttribute('role', 'tablist'); tabs.innerHTML = '<button type="button" class="inspector-mode-tab active" data-inspector-tab="style" role="tab" aria-selected="true">Style</button><button type="button" class="inspector-mode-tab" data-inspector-tab="settings" role="tab" aria-selected="false">Settings</button>';
      const stylePane = document.createElement('section'); stylePane.id = 'inspector-style-panel'; stylePane.className = 'inspector-tab-panel active'; stylePane.setAttribute('role', 'tabpanel'); stylePane.innerHTML = '<div class="inspector-section-intro"><p class="eyebrow">Style</p><p class="muted">Layout, appearance, and spacing for the selected element.</p></div><div id="selected-style-fields" class="block-fields"></div><p id="style-selection-hint" class="inspector-empty">Select an element in the navigator or canvas to edit its styles.</p>';
      const settingsPane = document.createElement('section'); settingsPane.id = 'inspector-settings-panel'; settingsPane.className = 'inspector-tab-panel'; settingsPane.setAttribute('role', 'tabpanel'); settingsPane.append(originalFields, elementInspector);
      heading.after(tabs, stylePane, settingsPane);
      const setInspectorTab = (tabName) => { tabs.querySelectorAll('[data-inspector-tab]').forEach((tab) => { const active = tab.dataset.inspectorTab === tabName; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); }); stylePane.classList.toggle('active', tabName === 'style'); settingsPane.classList.toggle('active', tabName === 'settings'); };
      tabs.querySelectorAll('[data-inspector-tab]').forEach((tab) => { tab.onclick = () => setInspectorTab(tab.dataset.inspectorTab); });
    }
    setupDesignerLibrary();
  }
  function setupDesignerLibrary() {
    const structure = el('structure-panel'); const tree = el('page-tree'); const palette = el('canvas-element-toolbar');
    if (!structure || !tree || !palette || structure.dataset.libraryReady === 'true') return;
    structure.dataset.libraryReady = 'true';
    const tabs = document.createElement('div'); tabs.className = 'designer-library-tabs'; tabs.setAttribute('role', 'tablist'); tabs.innerHTML = '<button type="button" class="designer-library-tab active" data-library-tab="layers" role="tab" aria-selected="true">☷ Layers</button><button type="button" class="designer-library-tab" data-library-tab="components" role="tab" aria-selected="false">＋ Components</button><button type="button" class="designer-library-tab" data-library-tab="assets" role="tab" aria-selected="false">▧ Assets</button>';
    const layers = document.createElement('section'); layers.className = 'designer-library-panel active'; layers.dataset.libraryPanel = 'layers'; layers.append(tree);
    const components = document.createElement('section'); components.className = 'designer-library-panel'; components.dataset.libraryPanel = 'components'; components.append(palette);
    const assets = document.createElement('section'); assets.className = 'designer-library-panel'; assets.dataset.libraryPanel = 'assets'; assets.innerHTML = '<div class="asset-library-heading"><div><p class="eyebrow">Library</p><h3>Assets</h3><p class="muted">Images already used by this page</p></div><button type="button" class="icon-button" title="Add an image block" data-asset-add>＋</button></div><label class="asset-search"><span>⌕</span><input id="asset-library-search" type="search" placeholder="Search assets" aria-label="Search assets"></label><div id="asset-library-grid" class="asset-library-grid"></div>';
    structure.append(tabs, layers, components, assets);
    const setLibraryTab = (tabName) => { tabs.querySelectorAll('[data-library-tab]').forEach((tab) => { const active = tab.dataset.libraryTab === tabName; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); }); structure.querySelectorAll('[data-library-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.libraryPanel === tabName)); palette.classList.toggle('library-flat-components', tabName === 'components'); if (tabName === 'assets') renderDesignerAssets(); };
    tabs.querySelectorAll('[data-library-tab]').forEach((tab) => { tab.onclick = () => setLibraryTab(tab.dataset.libraryTab); });
    if (el('toggle-elements-palette')) el('toggle-elements-palette').onclick = () => setLibraryTab('components');
    el('asset-library-search').oninput = () => renderDesignerAssets();
    assets.querySelector('[data-asset-add]').onclick = () => { setLibraryTab('components'); addBlock('image', state.selectedBlockPath); };
    renderDesignerAssets();
  }
  function setPanelState(panel, open) { const workspace = el('designer-workspace'); if (!workspace) return; const webstudioMode = workspace.classList.contains('webstudio-mode'); if (webstudioMode) { if (panel === 'structure') state.structureOpen = open; if (panel === 'properties') state.propertiesOpen = open; } else { state.structureOpen = panel === 'structure' ? open : false; state.propertiesOpen = panel === 'properties' ? open : false; } const structure = el('structure-panel'); const properties = el('properties-panel'); structure?.classList.toggle('active', webstudioMode ? state.structureOpen : panel === 'structure' && open); properties?.classList.toggle('active', webstudioMode ? state.propertiesOpen : panel === 'properties' && open); const structureToggle = el('toggle-structure-panel'); const propertiesToggle = el('toggle-properties-panel'); structureToggle?.classList.toggle('active', state.structureOpen); propertiesToggle?.classList.toggle('active', state.propertiesOpen); structureToggle?.setAttribute('aria-selected', String(state.structureOpen)); propertiesToggle?.setAttribute('aria-selected', String(state.propertiesOpen)); workspace.classList.toggle('structure-collapsed', !state.structureOpen); workspace.classList.toggle('properties-collapsed', !state.propertiesOpen); }

  function setDesignerFields() {
    const page = currentPage(); const layout = normalizedLayout(page.metadata?.layout || {});
    setText('designer-title', page.slug === 'new-page' ? 'New page' : `Design ${page.title}`);
    setValue('designer-slug', page.slug); setValue('designer-page-title', page.title); setValue('designer-excerpt', page.excerpt); setValue('designer-status', page.status); setValue('layout-width', layout.contentWidth || 'standard');
    el('layout-topbar').checked = layout.showTopbar !== false; el('layout-footer').checked = layout.showFooter !== false; el('layout-logo').checked = layout.showLogo !== false;
    setValue('custom-html', page.metadata?.customHtml || ''); setValue('custom-css', page.metadata?.customCss || ''); setValue('custom-script', page.metadata?.customScript || '');
    renderLayoutTemplates();
  }

  function blockLabel(type, block = null) { if (type === 'html_element') return block?.data?.tag ? `<${block.data.tag}>` : 'HTML element'; return ({ heading: 'Heading', paragraph: 'Paragraph', rich_text: 'Rich text', image: 'Image', link: 'Link', button: 'Button', list: 'List', quote: 'Quote', hr: 'Divider', video: 'Video', container: 'Container', section: 'Section', div: 'Div', span: 'Span', form: 'Form', nav: 'Navigation', hero: 'Hero', card: 'Card', 'feature-grid': 'Feature grid', alert: 'Alert', cta: 'Call to action', callout: 'Callout', spacer: 'Spacer', navbar: 'Navbar', badge: 'Badge', 'button-group': 'Button group', breadcrumb: 'Breadcrumb', 'list-group': 'List group', accordion: 'Accordion', pricing: 'Pricing card', stats: 'Stats' })[type] || type;
  }
  function paletteIcon(value) {
    return ({ header: '⌂', nav: '≡', main: '▣', section: '▤', article: '▥', aside: '◧', footer: '⌄', div: '□', h1: 'H₁', h2: 'H₂', h3: 'H₃', h4: 'H₄', h5: 'H₅', h6: 'H₆', p: '¶', blockquote: '❝', pre: '≡', code: '‹›', strong: 'B', em: 'I', small: 'A', mark: '▧', span: 'S', time: '◷', ul: '•', ol: '1·', li: '·', dl: '≡', dt: 'T', dd: 'D', table: '▦', thead: '▤', tbody: '▤', tr: '—', th: 'T', td: '□', img: '▧', video: '▶', iframe: '↗', figure: '▥', figcaption: 'T', form: '▤', label: 'L', input: '▭', textarea: '▤', select: '⌄', details: '▾', summary: '☰', dialog: '▢', button: '●', navbar: '☰', hero: '✦', card: '▣', 'feature-grid': '▦', alert: '!', badge: '●', 'button-group': '▤', breadcrumb: '›', 'list-group': '☷', accordion: '≡', pricing: '$', stats: '▥', cta: '↗', callout: '❝', spacer: '↕' })[value] || '＋';
  }
  function pathKey(path) { return path?.length ? path.join('.') : 'page'; }
  function parsePath(value) { return value === 'page' || value === '' ? null : value.split('.').map(Number); }
  function blockAtPath(path) { let blocks = currentPage().blocks || []; let block = null; for (const index of path || []) { block = blocks[index]; if (!block) return null; blocks = block.children || []; } return block; }
  function siblingsAtPath(path) { if (!path?.length || path.length === 1) return currentPage().blocks; const parent = blockAtPath(path.slice(0, -1)); return parent ? (parent.children ||= []) : null; }
  function countBlocks(blocks) { return (blocks || []).reduce((count, block) => count + 1 + countBlocks(block.children), 0); }
  function blockStyleFields(block) {
    const style = block.style || {};
    return `<details class="inspector-group" open><summary>Layout & spacing <span>⌃</span></summary><fieldset class="style-fields"><label>Width<input data-block-style="width" value="${escapeHtml(style.width || 'auto')}" placeholder="auto, 100%, 320px"></label><label>Padding<input data-block-style="padding" value="${escapeHtml(style.padding || '0px')}" placeholder="0px 16px"></label><label>Margin top<input data-block-style="marginTop" value="${escapeHtml(style.marginTop || '0px')}" placeholder="0px"></label><label>Margin bottom<input data-block-style="marginBottom" value="${escapeHtml(style.marginBottom || '0px')}" placeholder="0px"></label><label>Corner radius<input data-block-style="borderRadius" value="${escapeHtml(style.borderRadius || '0px')}" placeholder="8px"></label></fieldset></details><details class="inspector-group" open><summary>Appearance <span>⌃</span></summary><fieldset class="style-fields"><div class="style-grid"><label>Text color<input type="color" data-block-style="color" value="${style.color || '#f5f7ff'}"></label><label>Background<input type="color" data-block-style="backgroundColor" value="${style.backgroundColor || '#111a31'}"></label></div><label>Font size<input data-block-style="fontSize" value="${escapeHtml(style.fontSize || '16px')}" placeholder="16px"></label><label>Font weight<select data-block-style="fontWeight"><option value="400" ${style.fontWeight === '400' ? 'selected' : ''}>Regular</option><option value="600" ${style.fontWeight === '600' ? 'selected' : ''}>Semibold</option><option value="700" ${style.fontWeight === '700' ? 'selected' : ''}>Bold</option></select></label><label>Text alignment<select data-block-style="textAlign"><option value="left" ${style.textAlign === 'left' ? 'selected' : ''}>Left</option><option value="center" ${style.textAlign === 'center' ? 'selected' : ''}>Center</option><option value="right" ${style.textAlign === 'right' ? 'selected' : ''}>Right</option></select></label></fieldset></details>`;
  }
  function blockFields(block, path, includeStyle = true) {
    const key = pathKey(path); const field = (name, label, value, extra = '') => `<label${extra ? ' class="wide"' : ''}>${label}<input data-block-field="${name}" data-block-path="${key}" value="${escapeHtml(value)}"></label>`;
    const textField = (label = 'Text') => `<label class="wide">${label}<textarea data-block-field="text" data-block-path="${key}" rows="4">${escapeHtml(block.text || '')}</textarea></label>`;
    const columns = Math.max(1, Math.min(3, Number(normalizedLayout(currentPage().metadata?.layout).columns) || 1)); const columnField = columns > 1 ? `<label>Column<select data-block-field="column" data-block-path="${key}">${Array.from({ length: columns }, (_, column) => `<option value="${column + 1}" ${Number(block.data?.column || 1) === column + 1 ? 'selected' : ''}>Column ${column + 1}</option>`).join('')}</select></label>` : '';
    let content = '';
    if (block.type === 'heading') content = `${textField('Heading text')}<label>Level<select data-block-field="level" data-block-path="${key}">${[1, 2, 3, 4, 5, 6].map((level) => `<option value="${level}" ${Number(block.level) === level ? 'selected' : ''}>H${level}</option>`).join('')}</select></label>`;
    else if (['paragraph', 'rich_text', 'quote', 'callout', 'alert', 'hero', 'card', 'cta'].includes(block.type)) content = textField(block.type === 'quote' ? 'Quote' : 'Content');
    else if (['link', 'button'].includes(block.type)) content = `${field('text', block.type === 'button' ? 'Button label' : 'Link label', block.text || '')}${field('url', 'Destination URL', block.url || '')}`;
    else if (block.type === 'image') content = `${field('url', 'Image URL', block.url || '', 'wide')}${field('alt', 'Alt text', block.alt || '')}`;
    else if (block.type === 'video') content = field('url', 'Video URL', block.url || '', 'wide');
    else if (block.type === 'list') content = textField('List items (one per line)');
    else if (block.type === 'html_element') {
      const tag = HTML_ELEMENT_TAGS.has(block.data?.tag) ? block.data.tag : 'div';
      const tagOptions = Array.from(HTML_ELEMENT_TAGS).sort().map((option) => `<option value="${option}" ${option === tag ? 'selected' : ''}>${option}</option>`).join('');
      content = `<label>HTML element<select data-block-field="tag" data-block-path="${key}">${tagOptions}</select></label>`;
      if (tag === 'img') content += `${field('url', 'Image URL', block.url || '', 'wide')}${field('alt', 'Alt text', block.alt || '')}`;
      else if (!VOID_HTML_ELEMENT_TAGS.has(tag)) content += textField('Element text');
    } else if (['container', 'section', 'div', 'span', 'form', 'nav', 'feature-grid', 'navbar', 'button-group', 'list-group', 'accordion', 'stats'].includes(block.type)) content = `<p class="muted block-note">This element can contain child elements. Use the + action beside it in the hierarchy.</p>`;
    else if (['badge', 'breadcrumb', 'pricing'].includes(block.type)) content = textField('Content');
    if (['callout', 'alert'].includes(block.type)) content += `<label>Tone<select data-block-field="tone" data-block-path="${key}">${['info', 'success', 'warning', 'danger'].map((tone) => `<option value="${tone}" ${block.tone === tone ? 'selected' : ''}>${tone}</option>`).join('')}</select></label>`;
    return `${content}${columnField}${includeStyle ? blockStyleFields(block) : ''}`;
  }
  function bindBlockFields(target) {
    target.querySelectorAll('[data-block-field],[data-block-style]').forEach((node) => { const update = () => { const path = parsePath(node.dataset.blockPath); const block = blockAtPath(path); if (!block) return; if (node.dataset.blockStyle) block.style = { ...(block.style || {}), [node.dataset.blockStyle]: node.value }; else { let value = node.value; if (['level', 'column'].includes(node.dataset.blockField)) value = Number(value); if (node.dataset.blockField === 'tag') block.data = { ...(block.data || {}), tag: value }; else if (node.dataset.blockField === 'column') block.data = { ...(block.data || {}), column: value }; else block[node.dataset.blockField] = value; } renderBlockEditor(); renderPreview(); scheduleHistory(); }; node.onchange = update; node.oninput = update; });
  }
  function renderElementInspector() {
    const target = el('element-inspector'); const fields = el('selected-element-fields'); const styleFields = el('selected-style-fields'); const styleHint = el('style-selection-hint'); const path = state.selectedBlockPath; const block = path ? blockAtPath(path) : null; const shell = state.selectedShell;
    if (!target || !fields) return;
    if (!block && shell) {
      const page = currentPage(); const key = shell === 'header' ? 'headerText' : 'footerText'; const label = shell === 'header' ? 'Header text' : 'Footer text';
      target.classList.remove('hidden'); setText('selected-element-title', shell === 'header' ? 'Header' : 'Footer');
      fields.innerHTML = `<label class="wide">${label}<input data-shell-field="${key}" value="${escapeHtml(page.metadata?.[key] || '')}"></label><p class="muted block-note">This template shell is part of the page layout. Edit its text here or directly on the canvas.</p>`;
      fields.querySelector('[data-shell-field]')?.addEventListener('input', (event) => { page.metadata ||= {}; page.metadata[key] = event.target.value; renderPageTree(page.blocks || []); renderPreview(); scheduleHistory(); });
      if (styleFields) styleFields.innerHTML = '<p class="inspector-empty">Shell appearance follows the selected site design. Use Site design to change branding and colors.</p>';
      if (styleHint) styleHint.hidden = true;
      return;
    }
    if (!block) { target.classList.add('hidden'); fields.textContent = ''; if (styleFields) styleFields.textContent = ''; if (styleHint) styleHint.hidden = false; return; }
    target.classList.remove('hidden'); setText('selected-element-title', `${blockLabel(block.type)}`); fields.innerHTML = blockFields(block, path, false); bindBlockFields(fields); if (styleFields) { styleFields.innerHTML = blockStyleFields(block); bindBlockFields(styleFields); } if (styleHint) styleHint.hidden = true;
  }
  function treeNodeMarkup(block, path) { const key = pathKey(path); const children = block.children || []; return `<div class="tree-entry"><div class="tree-node-row"><button type="button" class="tree-node ${pathKey(state.selectedBlockPath) === key ? 'active' : ''}" draggable="true" data-select-path="${key}" data-tree-path="${key}"><span class="tree-branch">└</span><span class="tree-drag">⠿</span><span class="tree-type-icon" aria-hidden="true">${paletteIcon(block.type === 'html_element' ? block.data?.tag : block.type)}</span><span><strong>${escapeHtml(blockLabel(block.type, block))}</strong><small>Element ${path[path.length - 1] + 1}</small></span></button><button type="button" class="tree-action" data-add-child="${key}" title="Add child element">+</button><button type="button" class="tree-action danger" data-delete-path="${key}" title="Delete element">×</button></div>${children.length ? `<div class="tree-children">${children.map((child, index) => treeNodeMarkup(child, [...path, index])).join('')}</div>` : ''}</div>`; }
  function renderPageTree(blocks) {
    const tree = el('page-tree'); if (!tree) return; const layout = normalizedLayout(currentPage().metadata?.layout || {}); const shellMarkup = (shell, label) => `<div class="tree-shell-entry"><button type="button" class="tree-node shell-node ${state.selectedShell === shell ? 'active' : ''}" data-select-shell="${shell}"><span class="tree-type-icon" aria-hidden="true">${shell === 'header' ? '⌂' : '⌄'}</span><span><strong>${label}</strong><small>Template shell</small></span></button></div>`; const shells = `${layout.showTopbar === false ? '' : shellMarkup('header', 'Header')}${shellMarkup('main', 'Main content')}${layout.showFooter === false ? '' : shellMarkup('footer', 'Footer')}`; tree.innerHTML = `<button type="button" class="tree-root ${state.selectedBlockPath === null && !state.selectedShell ? 'active' : ''}" data-select-path="page"><span>▾</span><strong>Page canvas</strong><small>${countBlocks(blocks)} layers</small></button><div class="tree-children">${shells}${(blocks || []).map((block, index) => treeNodeMarkup(block, [index])).join('')}</div>`;
    tree.querySelector('[data-select-path="page"]').onclick = () => { state.selectedBlockPath = null; state.selectedShell = null; renderBlockEditor(); renderPreview(); };
    tree.querySelectorAll('[data-select-shell]').forEach((node) => { node.onclick = () => { state.selectedBlockPath = null; state.selectedShell = node.dataset.selectShell === 'main' ? null : node.dataset.selectShell; renderBlockEditor(); renderPreview(); if (state.selectedShell) setPanelState('properties', true); }; });
    tree.querySelectorAll('[data-select-path]:not([data-select-path="page"])').forEach((node) => { node.onclick = () => { state.selectedShell = null; state.selectedBlockPath = parsePath(node.dataset.selectPath); renderBlockEditor(); renderPreview(); }; });
    tree.querySelectorAll('[data-add-child]').forEach((node) => { node.onclick = (event) => { event.stopPropagation(); addBlock('paragraph', parsePath(node.dataset.addChild)); }; });
    tree.querySelectorAll('[data-delete-path]').forEach((node) => { node.onclick = (event) => { event.stopPropagation(); deleteBlock(parsePath(node.dataset.deletePath)); }; });
    tree.querySelectorAll('[data-tree-path]').forEach((node) => { node.ondragstart = (event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', node.dataset.treePath); node.classList.add('dragging'); }; node.ondragend = () => node.classList.remove('dragging'); node.ondragover = (event) => { event.preventDefault(); node.classList.add('drag-over'); }; node.ondragleave = () => node.classList.remove('drag-over'); node.ondrop = (event) => { event.preventDefault(); node.classList.remove('drag-over'); nestBlock(parsePath(event.dataTransfer.getData('text/plain')), parsePath(node.dataset.treePath)); }; });
  }
  function renderDesignerAssets() {
    const target = el('asset-library-grid'); if (!target) return;
    const assets = []; const seen = new Set(); const addAsset = (url, name, path = null) => { if (!url || seen.has(url)) return; seen.add(url); assets.push({ url, name, path }); };
    addAsset(state.site?.settings?.logoUrl, 'Site logo');
    const visit = (blocks, prefix = []) => (blocks || []).forEach((block, index) => { const path = [...prefix, index]; if (block.type === 'image') addAsset(block.url, block.alt || `Image ${assets.length + 1}`, path); visit(block.children, path); });
    visit(currentPage().blocks || []);
    const query = el('asset-library-search')?.value.trim().toLowerCase() || ''; const filtered = assets.filter((asset) => !query || `${asset.name} ${asset.url}`.toLowerCase().includes(query));
    if (!filtered.length) { target.innerHTML = `<div class="asset-library-empty"><strong>${assets.length ? 'No matching assets' : 'No page assets yet'}</strong><span>${assets.length ? 'Try another search.' : 'Add an image block and its URL will appear here.'}</span></div>`; return; }
    target.innerHTML = filtered.map((asset) => `<button type="button" class="asset-card" data-asset-path="${asset.path ? pathKey(asset.path) : ''}" title="${escapeHtml(asset.name)}"><span class="asset-thumb"><img src="${escapeHtml(asset.url)}" alt=""></span><span class="asset-name">${escapeHtml(asset.name)}</span><small>${asset.path ? 'Page image' : 'Site logo'}</small></button>`).join('');
    target.querySelectorAll('[data-asset-path]').forEach((node) => { node.onclick = () => { if (!node.dataset.assetPath) return; state.selectedBlockPath = parsePath(node.dataset.assetPath); renderBlockEditor(); renderPreview(); }; });
  }
  function renderBlockEditor() { const blocks = currentPage().blocks || []; setText('block-count', `${countBlocks(blocks)} ${countBlocks(blocks) === 1 ? 'element' : 'elements'}`); const paletteHint = document.querySelector('#canvas-element-toolbar .toolbar-hint'); if (paletteHint) paletteHint.textContent = `Add to ${state.selectedBlockPath ? 'the selected element' : 'the page root'} · drag layers to nest`; renderPageTree(blocks); renderElementInspector(); renderDesignerAssets(); }
  function removeAtPath(path) { const siblings = siblingsAtPath(path); return siblings?.splice(path[path.length - 1], 1)[0] || null; }
  function deleteBlock(path) { if (!path) return; removeAtPath(path); state.selectedBlockPath = null; renderBlockEditor(); renderPreview(); pushHistory(); }
  function nestBlock(from, target) { if (!from || !target || pathKey(from) === pathKey(target) || target.slice(0, from.length).every((value, index) => value === from[index])) return; const block = removeAtPath(from); const parent = blockAtPath(target); if (!block || !parent) return; parent.children ||= []; parent.children.push(block); state.selectedBlockPath = [...target, parent.children.length - 1]; renderBlockEditor(); renderPreview(); pushHistory(); }
  function addBlock(type, parentPath = null, options = {}) { const defaults = { heading: { type, level: 2, text: 'Section heading' }, paragraph: { type, text: 'Write something meaningful for your visitors.' }, rich_text: { type, text: 'Write rich text content.' }, image: { type, url: '', alt: '' }, link: { type, text: 'Learn more', url: '/' }, button: { type, text: 'Get started', url: '/' }, list: { type, text: 'First item\nSecond item' }, quote: { type, text: 'A thoughtful quote.' }, hr: { type }, video: { type, url: '' }, html_element: { type, data: { tag: options.tag || 'div' } }, container: { type }, section: { type }, div: { type }, span: { type, text: 'Inline text' }, form: { type }, nav: { type }, hero: { type, text: 'A strong headline' }, card: { type, text: 'Card title' }, 'feature-grid': { type }, alert: { type, tone: 'info', text: 'An important message.' }, cta: { type, text: 'Ready to get started?' }, callout: { type, tone: 'info', text: 'A helpful note for your visitors.' }, spacer: { type }, navbar: { type, text: 'Brand' }, badge: { type, text: 'New' }, 'button-group': { type }, breadcrumb: { type, text: 'Home\nLibrary\nCurrent page' }, 'list-group': { type, text: 'First item\nSecond item\nThird item' }, accordion: { type, text: 'Accordion item' }, pricing: { type, text: 'Professional', tone: 'Plan' }, stats: { type, text: 'Active users' } }; const block = { ...(defaults[type] || { type, text: '' }), children: [] }; const target = parentPath ? blockAtPath(parentPath) : null; const siblings = target ? (target.children ||= []) : currentPage().blocks; siblings.push(block); state.selectedBlockPath = target ? [...parentPath, siblings.length - 1] : [siblings.length - 1]; renderBlockEditor(); renderPreview(); pushHistory(); }

  function previewStyle(style = {}) { const allowed = ['color', 'backgroundColor', 'fontSize', 'fontWeight', 'textAlign', 'marginTop', 'marginBottom', 'padding', 'borderRadius', 'width']; return allowed.filter((key) => typeof style[key] === 'string').map((key) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${escapeHtml(style[key])}`).join(';'); }
  function canvasPlaceholder(tag, textTag = false) { return `<span class="canvas-placeholder">${textTag ? `Edit &lt;${tag}&gt; text` : `Empty &lt;${tag}&gt; · use + in the structure tree to add children`}</span>`; }
  function previewBlock(block, path) {
    const text = escapeHtml(block.text || ''); const key = path.join('.'); const marker = `data-sitemaster-block="${key}"`; const selected = pathKey(state.selectedBlockPath) === key ? ' data-sitemaster-selected="true"' : ''; const style = previewStyle(block.style); const attributes = `${marker}${selected}${style ? ` style="${style}"` : ''}`; const editable = `${marker}${selected} contenteditable="true" spellcheck="true"`;
    const children = (block.children || []).map((child, index) => previewBlock(child, [...path, index])).join('');
    if (block.type === 'heading') { const level = Math.min(6, Math.max(1, Number(block.level) || 2)); return `<h${level} ${editable}>${text}</h${level}>`; }
    if (block.type === 'paragraph' || block.type === 'rich_text') return `<p ${editable}>${text}</p>`;
    if (block.type === 'image') return block.url ? `<img ${attributes} src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt || '')}">` : `<div class="image-placeholder" ${attributes}>Image URL</div>`;
    if (block.type === 'link') return `<p ${attributes}><a href="${escapeHtml(block.url || '#')}" ${editable}>${text || escapeHtml(block.url || 'Link')}</a></p>`;
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

  function renderPreview() {
    if (!el('visual-preview') || !state.site) return;
    const page = currentPage(); const settings = state.site.settings || {}; const theme = settings.theme || {}; const layout = normalizedLayout(page.metadata?.layout || {});
    const colors = { background: theme.backgroundColor || '#070b18', surface: theme.surfaceColor || '#111a31', text: theme.textColor || '#f5f7ff', muted: theme.mutedTextColor || '#9aa7c7', accent: theme.accentColor || '#6366f1', link: theme.linkColor || theme.accentColor || '#a5b4fc' };
    const logo = settings.logoUrl ? `<img class="site-logo" src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(settings.siteName || state.site.name)}">` : `<span class="site-logo">${escapeHtml(settings.logoText || state.site.name.slice(0, 1))}</span>`;
    const headerText = page.metadata?.headerText || settings.siteName || state.site.name;
    const footerText = page.metadata?.footerText || 'Published with Sitemaster';
    const topbar = layout.showTopbar === false ? '' : `<header class="site-topbar" data-sitemaster-shell="header"${state.selectedShell === 'header' ? ' data-sitemaster-shell-selected="true"' : ''}>${layout.showLogo === false ? '' : logo}<span data-sitemaster-shell-text="header" contenteditable="true" spellcheck="true">${escapeHtml(headerText)}</span></header>`;
    const columns = Math.max(1, Math.min(3, Number(layout.columns) || 1)); const buckets = Array.from({ length: columns }, () => []);
    (page.blocks || []).forEach((block, index) => buckets[Math.min(columns, Math.max(1, Number(block.data?.column) || 1)) - 1].push(previewBlock(block, [index])));
    const body = page.metadata?.customHtml ? page.metadata.customHtml : `<div class="page-columns columns-${columns} layout-${escapeHtml(layout.columnMode || 'single')}">${buckets.map((items) => `<section class="page-column">${items.join('')}</section>`).join('')}</div>`;
    const footer = layout.showFooter === false ? '' : `<footer class="site-footer" data-sitemaster-shell="footer"${state.selectedShell === 'footer' ? ' data-sitemaster-shell-selected="true"' : ''}><span>${escapeHtml(settings.siteName || state.site.name)}</span><span data-sitemaster-shell-text="footer" contenteditable="true" spellcheck="true">${escapeHtml(footerText)}</span></footer>`;
    const width = { narrow: '680px', standard: '860px', wide: '1120px', full: '100%' }[layout.contentWidth || 'standard'] || '860px';
    const canvasScript = `<script>(function(){document.addEventListener('click',function(event){var shell=event.target.closest('[data-sitemaster-shell]');if(shell){parent.postMessage({source:'sitemaster-canvas',action:'shell-select',shell:shell.getAttribute('data-sitemaster-shell')},'*');if(event.target.closest('[data-sitemaster-shell-text]'))return;event.preventDefault();event.stopPropagation();return}var node=event.target.closest('[data-sitemaster-block]');if(!node)return;event.preventDefault();event.stopPropagation();parent.postMessage({source:'sitemaster-canvas',action:'select',path:node.getAttribute('data-sitemaster-block')},'*')});document.querySelectorAll('[data-sitemaster-shell-text]').forEach(function(node){node.addEventListener('input',function(){parent.postMessage({source:'sitemaster-canvas',action:'shell-text',shell:node.getAttribute('data-sitemaster-shell-text'),text:node.innerText},'*')})});document.querySelectorAll('[contenteditable="true"][data-sitemaster-block]').forEach(function(node){node.addEventListener('input',function(){parent.postMessage({source:'sitemaster-canvas',action:'text',path:node.getAttribute('data-sitemaster-block'),text:node.innerText},'*')})})})();</script>`;
    el('visual-preview').srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--bg:${colors.background};--surface:${colors.surface};--text:${colors.text};--muted:${colors.muted};--accent:${colors.accent};--link:${colors.link}}*{box-sizing:border-box}body{margin:0;padding:0;background:var(--bg);color:var(--text);font:16px/1.6 ${escapeHtml(settings.fontFamily || 'system-ui,sans-serif')} }main{width:min(${width},100%);margin:0 auto;padding:22px;border-radius:12px;background:var(--surface);box-shadow:0 12px 35px #0005}.site-topbar{display:flex;align-items:center;gap:10px;margin:0 0 22px;padding-bottom:14px;border-bottom:1px solid #ffffff22;font-weight:700}.site-logo{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--accent);color:white;font-weight:800;object-fit:contain}.page-columns{display:grid;gap:22px}.columns-1{grid-template-columns:1fr}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.layout-rail-left.columns-2{grid-template-columns:minmax(100px,.34fr) minmax(0,1fr)}.layout-rail-right.columns-2{grid-template-columns:minmax(0,1fr) minmax(100px,.34fr)}.layout-rail-both.columns-3{grid-template-columns:minmax(88px,.3fr) minmax(0,1fr) minmax(88px,.3fr)}.page-column{min-width:0}h1,h2,h3{line-height:1.15}a{color:var(--link)}img{max-width:100%;border-radius:10px}.callout{padding:12px;border-left:4px solid var(--accent);background:#ffffff10;border-radius:7px}.button-link{display:inline-block;padding:8px 14px;border-radius:8px;background:var(--accent);color:#fff;text-decoration:none}.button-link.secondary{background:transparent;border:1px solid #ffffff33}.component-hero,.component-cta,.component-card,.component-pricing{padding:22px;border:1px solid #ffffff22;border-radius:14px;background:#ffffff08}.component-feature-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.component-navbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 15px;border:1px solid #ffffff22;border-radius:10px;background:#ffffff0b}.component-navbar-links{display:flex;gap:12px}.component-badge{display:inline-block;padding:3px 9px;border-radius:999px;background:#6366f133;color:var(--link);font-size:12px;font-weight:700}.component-button-group{display:flex;gap:7px;flex-wrap:wrap}.component-breadcrumb{display:flex;gap:9px;list-style:none;padding:0;color:var(--muted);font-size:13px}.component-breadcrumb li+li:before{content:'/';margin-right:9px}.component-list-group{list-style:none;margin:0;padding:0;border:1px solid #ffffff22;border-radius:9px;overflow:hidden}.component-list-group li{padding:10px 12px;border-bottom:1px solid #ffffff18}.component-list-group li:last-child{border-bottom:0}.component-accordion details{padding:11px 13px;border:1px solid #ffffff22;border-radius:8px}.component-accordion summary{cursor:pointer;font-weight:700}.component-kicker{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.12em}.component-price{display:block;margin:10px 0;font-size:28px}.component-price small{color:var(--muted);font-size:12px;font-weight:400}.component-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.component-stats>div{padding:15px;border-radius:10px;background:#6366f11a}.component-stats strong,.component-stats span{display:block}.component-stats strong{font-size:22px}.component-stats span{color:var(--muted);font-size:12px}.media-placeholder,.image-placeholder{display:grid;place-items:center;min-height:100px;border:1px dashed #ffffff55;color:var(--muted)}.canvas-placeholder{display:block;min-height:32px;padding:7px 10px;border:1px dashed var(--accent);border-radius:6px;color:var(--muted);background:#ffffff08;font-size:12px;font-style:italic}.spacer{height:30px}[data-sitemaster-block]:hover,[data-sitemaster-shell]:hover{outline:1px dashed var(--accent);outline-offset:3px}[data-sitemaster-selected="true"],[data-sitemaster-shell-selected="true"]{outline:2px solid var(--accent)!important;outline-offset:4px;box-shadow:0 0 0 4px ${colors.accent}33}[contenteditable="true"]:focus{outline:2px solid var(--accent);outline-offset:3px}.site-footer{display:flex;justify-content:space-between;gap:12px;margin:22px 0 -2px;padding-top:14px;border-top:1px solid #ffffff22;color:var(--muted);font-size:12px}@media(max-width:640px){main{padding:16px}.columns-2,.columns-3,.component-feature-grid,.component-stats{grid-template-columns:1fr}.component-navbar{align-items:flex-start;flex-direction:column}.site-footer{flex-direction:column}}${page.metadata?.customCss || ''}</style></head><body><main>${topbar}${body}${footer}</main>${page.metadata?.customScript ? `<script type="module">${page.metadata.customScript}</script>` : ''}${canvasScript}</body></html>`;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== el('visual-preview')?.contentWindow || event.data?.source !== 'sitemaster-canvas') return;
    if (event.data.action === 'shell-select') { state.selectedBlockPath = null; state.selectedShell = ['header', 'footer'].includes(event.data.shell) ? event.data.shell : null; renderBlockEditor(); if (state.selectedShell) setPanelState('properties', true); return; }
    if (event.data.action === 'shell-text') { const page = currentPage(); const key = event.data.shell === 'header' ? 'headerText' : 'footerText'; page.metadata ||= {}; page.metadata[key] = String(event.data.text || ''); state.selectedBlockPath = null; state.selectedShell = event.data.shell; renderBlockEditor(); scheduleHistory(); return; }
    const path = parsePath(event.data.path); const block = path ? blockAtPath(path) : null; if (!block) return;
    if (event.data.action === 'select') { state.selectedBlockPath = path; state.selectedShell = null; renderBlockEditor(); renderPreview(); }
    if (event.data.action === 'text') { block.text = String(event.data.text || ''); state.selectedShell = null; if (pathKey(state.selectedBlockPath) !== pathKey(path)) { state.selectedBlockPath = path; renderBlockEditor(); renderPreview(); } else renderPageTree(currentPage().blocks || []); scheduleHistory(); }
  });

  async function savePage() {
    const page = currentPage(); const existingLayout = normalizedLayout(page.metadata?.layout || {}); const payload = { slug: el('designer-slug').value.trim(), title: el('designer-page-title').value.trim(), excerpt: page.excerpt || '', template: page.template || 'default', status: el('designer-status').value, blocks: page.blocks || [], metadata: { ...(page.metadata || {}), layout: { ...existingLayout, showTopbar: el('layout-topbar').checked, showFooter: el('layout-footer').checked, showLogo: el('layout-logo').checked, contentWidth: el('layout-width').value }, customHtml: el('custom-html').value, customCss: el('custom-css').value, customScript: el('custom-script').value } };
    const path = page.id ? `/sites/${state.siteSlug}/pages/${encodeURIComponent(page.slug)}` : `/sites/${state.siteSlug}/pages`;
    await api(path, { method: page.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    notice(page.id ? 'Page design saved.' : 'Page created.'); setDesignerStatus('Saved', 'saved'); state.editingPage = null; state.history = []; state.historyIndex = -1; await loadWorkspace(); setView('pages');
  }

  async function changePage(slug, action) { try { await api(`/sites/${state.siteSlug}/pages/${encodeURIComponent(slug)}${action === 'delete' ? '' : '/publish'}`, { method: action === 'delete' ? 'DELETE' : 'POST' }); notice(action === 'delete' ? 'Page deleted.' : 'Page published.'); await loadWorkspace(); } catch (error) { notice(error.message, 'error'); } }

  function renderSiteSettings() {
    const site = state.site || {}; const settings = site.settings || {}; const theme = settings.theme || {};
    setValue('site-name', settings.siteName || site.name); setValue('logo-text', settings.logoText || ''); setValue('logo-url', settings.logoUrl || ''); setValue('font-family', settings.fontFamily || 'Inter, system-ui, sans-serif');
    for (const [id, key, fallback] of [['background-color', 'backgroundColor', '#070b18'], ['surface-color', 'surfaceColor', '#111a31'], ['accent-color', 'accentColor', '#6366f1'], ['text-color', 'textColor', '#f5f7ff'], ['muted-text-color', 'mutedTextColor', '#9aa7c7'], ['input-background-color', 'inputBackgroundColor', '#0c1327']]) setValue(id, theme[key] || fallback);
    setText('design-preview-title', settings.siteName || site.name || 'Your site'); setText('design-preview-copy', settings.fontFamily ? `Using ${settings.fontFamily}` : 'A shared design system gives every page a coherent foundation.');
  }

  function renderDeployment() { const site = state.site || {}; const deployment = site.deployment || {}; setText('deploy-site-name', site.name || 'Website'); setText('deploy-description', deployment.status === 'deployed' ? `Published at ${deployment.path} on ${new Date(deployment.deployedAt).toLocaleString()}.` : 'No deployment has been created yet.'); setText('deploy-status', deployment.status || 'un-deployed'); el('deploy-status').className = `status-pill ${deployment.status === 'deployed' ? 'published' : 'draft'}`; el('deploy-now').textContent = deployment.status === 'deployed' ? 'Undeploy selected site' : 'Deploy selected site'; el('header-deploy').textContent = deployment.status === 'deployed' ? 'Undeploy' : 'Deploy'; }

  async function loadContent() { const type = el('content-type').value.trim() || 'general'; state.contentType = type; const result = await api(`/sites/${state.siteSlug}/content/${encodeURIComponent(type)}`); if (!result) return; state.content = result.entries || []; renderContent(); renderDashboard(); }
  function renderContent() { const target = el('content-table'); target.textContent = ''; if (!state.content.length) { target.innerHTML = '<div class="empty-state"><strong>No entries in this collection</strong><span>Create a structured record for your pages to consume.</span></div>'; return; } const table = document.createElement('table'); table.className = 'table'; table.innerHTML = '<thead><tr><th>Entry</th><th>Status</th><th>Updated</th><th></th></tr></thead>'; const body = document.createElement('tbody'); for (const entry of state.content) { const row = document.createElement('tr'); row.innerHTML = `<td><div class="table-title"><span class="page-glyph">◇</span><span><strong>${escapeHtml(entry.slug)}</strong><small>${Object.keys(entry.data || {}).length} fields · ${escapeHtml(entry.contentType)}</small></span></div></td><td><span class="status-text ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></td><td>${new Date(entry.updatedAt).toLocaleString()}</td><td><div class="row-actions"><button class="button secondary small-button" data-content-edit="${escapeHtml(entry.slug)}">Edit</button>${entry.status !== 'published' ? `<button class="button secondary small-button" data-content-publish="${escapeHtml(entry.slug)}">Publish</button>` : ''}<button class="button secondary small-button" data-content-delete="${escapeHtml(entry.slug)}">Delete</button></div></td>`; body.append(row); } table.append(body); target.append(table); target.querySelectorAll('[data-content-edit]').forEach((button) => { button.onclick = () => openContentEditor(state.content.find((entry) => entry.slug === button.dataset.contentEdit)); }); target.querySelectorAll('[data-content-publish]').forEach((button) => { button.onclick = () => changeContent(button.dataset.contentPublish, 'publish'); }); target.querySelectorAll('[data-content-delete]').forEach((button) => { button.onclick = () => changeContent(button.dataset.contentDelete, 'delete'); }); }
  function openContentEditor(entry) { state.contentEditingSlug = entry?.slug || null; el('content-editor').classList.remove('hidden'); setText('content-editor-title', entry ? `Edit ${entry.slug}` : 'New entry'); setValue('content-slug', entry?.slug || `entry-${Date.now().toString(36)}`); setValue('content-status', entry?.status || 'draft'); setValue('content-data', JSON.stringify(entry?.data || {}, null, 2)); }
  async function saveContent() { let data; try { data = JSON.parse(el('content-data').value || '{}'); } catch { throw new Error('Content data must be valid JSON'); } const path = state.contentEditingSlug ? `/sites/${state.siteSlug}/content/${encodeURIComponent(state.contentType)}/${encodeURIComponent(state.contentEditingSlug)}` : `/sites/${state.siteSlug}/content/${encodeURIComponent(state.contentType)}`; await api(path, { method: state.contentEditingSlug ? 'PATCH' : 'POST', body: JSON.stringify({ slug: el('content-slug').value.trim(), status: el('content-status').value, data }) }); el('content-editor').classList.add('hidden'); notice(state.contentEditingSlug ? 'Content entry updated.' : 'Content entry created.'); state.contentEditingSlug = null; await loadContent(); }
  async function changeContent(slug, action) { try { await api(`/sites/${state.siteSlug}/content/${encodeURIComponent(state.contentType)}/${encodeURIComponent(slug)}${action === 'delete' ? '' : '/publish'}`, { method: action === 'delete' ? 'DELETE' : 'POST' }); notice(action === 'delete' ? 'Content entry deleted.' : 'Content entry published.'); await loadContent(); } catch (error) { notice(error.message, 'error'); } }

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

  async function loadWorkspace() { try { const result = await api('/sites'); if (!result) return; state.sites = result.sites || []; renderSites(); state.site = state.sites.find((site) => site.slug === state.siteSlug) || state.sites[0]; if (!state.site) throw new Error('No website workspace is available'); state.siteSlug = state.site.slug; renderSites(); setValue('import-url', state.site.originUrl || ''); const pages = await api(`/sites/${state.siteSlug}/pages`); state.pages = pages?.pages || []; const content = await api(`/sites/${state.siteSlug}/content/general`); state.content = content?.entries || []; showLoggedIn(); renderDashboard(); renderSiteSettings(); renderDeployment(); if (state.view === 'sites') renderSiteDirectory(); if (state.view === 'pages') renderPages(); } catch (error) { if (error.message === 'Authentication required') return; notice(error.message, 'error'); } }

  function renderElementPalette() {
    document.querySelector('.structure-panel .block-toolbar')?.remove();
    const canvasColumn = document.querySelector('.canvas-column');
    const canvasToolbar = canvasColumn?.querySelector('.canvas-toolbar');
    if (!canvasColumn || !canvasToolbar || el('canvas-element-toolbar')) return;
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
    canvasToolbar.after(toolbar);
    const activateRibbonGroup = (panel, key) => { panel.querySelectorAll('[data-ribbon-tab]').forEach((tab) => { const active = tab.dataset.ribbonTab === key; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); }); panel.querySelectorAll('[data-ribbon-group]').forEach((group) => group.classList.toggle('active', group.dataset.ribbonGroup === key)); };
    toolbar.querySelectorAll('[data-palette-tab]').forEach((tab) => { tab.onclick = () => { toolbar.querySelectorAll('[data-palette-tab]').forEach((node) => { const active = node === tab; node.classList.toggle('active', active); node.setAttribute('aria-selected', String(active)); }); toolbar.querySelectorAll('[data-palette-panel]').forEach((panel) => { const active = panel.dataset.palettePanel === tab.dataset.paletteTab; panel.classList.toggle('active', active); if (active) activateRibbonGroup(panel, panel.querySelector('[data-ribbon-tab]')?.dataset.ribbonTab); }); }; });
    toolbar.querySelectorAll('[data-palette-panel]').forEach((panel) => { const first = panel.querySelector('[data-ribbon-tab]')?.dataset.ribbonTab; if (first) activateRibbonGroup(panel, first); panel.querySelectorAll('[data-ribbon-tab]').forEach((tab) => { tab.onclick = () => activateRibbonGroup(panel, tab.dataset.ribbonTab); }); });
    toolbar.querySelectorAll('[data-add-html]').forEach((node) => { node.onclick = () => addBlock('html_element', state.selectedBlockPath, { tag: node.dataset.addHtml }); });
    toolbar.querySelectorAll('[data-add-block]').forEach((node) => { node.onclick = () => addBlock(node.dataset.addBlock, state.selectedBlockPath); });
    el('element-palette-search').oninput = (event) => { const query = event.target.value.trim().toLowerCase(); toolbar.classList.toggle('palette-searching', Boolean(query)); toolbar.querySelectorAll('[data-palette-panel]').forEach((panel) => { let firstMatch = null; panel.querySelectorAll('[data-ribbon-group]').forEach((group) => { let visible = 0; group.querySelectorAll('.palette-button').forEach((button) => { const matches = !query || button.textContent.toLowerCase().includes(query) || button.title.toLowerCase().includes(query); button.classList.toggle('palette-hidden', !matches); if (matches) visible += 1; }); group.classList.toggle('palette-hidden', visible === 0); if (visible && !firstMatch) firstMatch = group.dataset.ribbonGroup; }); if (query && firstMatch) activateRibbonGroup(panel, firstMatch); }); };
  }
  function setSidebarState(open) { const workspace = el('workspace'); if (!workspace) return; const mobile = window.matchMedia('(max-width: 760px)').matches; workspace.classList.toggle('sidebar-collapsed', !open && !mobile); workspace.classList.toggle('sidebar-closed', !open && mobile); workspace.classList.toggle('sidebar-open', open && mobile); const toggle = el('sidebar-toggle'); if (toggle) { toggle.title = open ? 'Collapse navigation' : 'Expand navigation'; toggle.setAttribute('aria-label', toggle.title); } }

  el('login-link').href = `${publicUrl('/login')}?return_to=${encodeURIComponent(`${appBase || ''}/`)}`; el('logout-link').href = publicUrl('/logout');
  setupDesignerToolbar(); renderElementPalette(); setupDesignerToolRail(); const designerHints = document.querySelectorAll('#designer-visual .toolbar-hint'); if (designerHints[0]) designerHints[0].textContent = 'Click text in the canvas to edit it; use the inspector for appearance and layout.'; if (designerHints[1]) designerHints[1].textContent = 'Live preview · click text to edit, or select an element to inspect it'; const summaryField = el('designer-excerpt')?.closest('label'); if (summaryField) summaryField.classList.add('hidden'); el('sidebar-toggle').onclick = () => { const workspace = el('workspace'); const mobile = window.matchMedia('(max-width: 760px)').matches; const open = mobile ? workspace.classList.contains('sidebar-open') : !workspace.classList.contains('sidebar-collapsed'); setSidebarState(!open); }; el('sidebar-menu').onclick = () => setSidebarState(!el('workspace').classList.contains('sidebar-open'));
  document.querySelectorAll('[data-view]').forEach((node) => { node.onclick = () => { setView(node.dataset.view); if (window.matchMedia('(max-width: 760px)').matches) setSidebarState(false); }; });
  document.querySelectorAll('[data-editor-tab]').forEach((node) => { node.onclick = () => { state.editorTab = node.dataset.editorTab; document.querySelectorAll('[data-editor-tab]').forEach((tab) => tab.classList.toggle('active', tab === node)); el('designer-visual').classList.toggle('hidden', state.editorTab !== 'visual'); el('designer-code').classList.toggle('hidden', state.editorTab !== 'code'); el('designer-script').classList.toggle('hidden', state.editorTab !== 'script'); if (state.editorTab === 'visual') renderPreview(); }; });
  el('open-layout-picker').onclick = openLayoutPicker; el('close-layout-picker').onclick = closeLayoutPicker; document.querySelectorAll('[data-close-layout-picker]').forEach((node) => { node.onclick = closeLayoutPicker; }); el('layout-picker-category').onchange = () => { state.layoutCategory = el('layout-picker-category').value; renderLayoutTemplates(); };
  el('toggle-structure-panel').onclick = () => setPanelState('structure', !state.structureOpen); el('toggle-properties-panel').onclick = () => setPanelState('properties', !state.propertiesOpen); el('close-structure-panel').onclick = () => setPanelState('structure', false); el('close-properties-panel').onclick = () => setPanelState('properties', false);
  el('clear-element-selection').onclick = () => { state.selectedBlockPath = null; state.selectedShell = null; renderBlockEditor(); renderPreview(); };
  document.querySelectorAll('[data-add-block]').forEach((node) => { node.onclick = () => addBlock(node.dataset.addBlock); });
  ['designer-slug', 'designer-page-title', 'designer-status', 'layout-width'].forEach((id) => { el(id).oninput = () => { const page = currentPage(); if (id === 'designer-slug') page.slug = el(id).value; if (id === 'designer-page-title') page.title = el(id).value; if (id === 'designer-status') page.status = el(id).value; if (id === 'layout-width') page.metadata.layout.contentWidth = el(id).value; renderPreview(); scheduleHistory(); }; });
  ['layout-topbar', 'layout-footer', 'layout-logo'].forEach((id) => { el(id).onchange = () => { currentPage().metadata.layout[id === 'layout-topbar' ? 'showTopbar' : id === 'layout-footer' ? 'showFooter' : 'showLogo'] = el(id).checked; renderLayoutTemplates(); renderPreview(); pushHistory(); }; });
  ['custom-html', 'custom-css', 'custom-script'].forEach((id) => { el(id).oninput = () => { currentPage().metadata[id.replace('custom-', 'custom')] = el(id).value; renderPreview(); scheduleHistory(); }; });
  el('new-page').onclick = () => openDesigner(); el('back-to-pages').onclick = () => { state.editingPage = null; setView('pages'); }; el('save-page').onclick = () => savePage().catch((error) => notice(error.message, 'error')); el('preview-page').onclick = renderPreview;
  document.addEventListener('keydown', (event) => { if (state.view !== 'designer') return; const tag = event.target?.tagName?.toLowerCase(); const editingText = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable; if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !editingText) { event.preventDefault(); restoreHistory(state.historyIndex + (event.shiftKey ? 1 : -1)); } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y' && !editingText) { event.preventDefault(); restoreHistory(state.historyIndex + 1); } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedBlockPath && !editingText) { event.preventDefault(); deleteBlock(state.selectedBlockPath); } });
  el('focus-create-site').onclick = () => { setView('sites'); el('new-site-slug').focus(); };
  el('site-create-form').onsubmit = (event) => { event.preventDefault(); createSite().catch((error) => notice(error.message, 'error')); };
  el('import-site').onclick = () => importSelectedSite().catch((error) => notice(error.message, 'error'));
  el('refresh-sites').onclick = () => loadWorkspace().catch((error) => notice(error.message, 'error'));
  el('site-select').onchange = async (event) => { state.siteSlug = event.target.value; await loadWorkspace(); setView('dashboard'); };
  el('save-settings').onclick = async () => { try { const settings = { siteName: el('site-name').value, logoText: el('logo-text').value, logoUrl: el('logo-url').value, fontFamily: el('font-family').value, theme: { backgroundColor: el('background-color').value, surfaceColor: el('surface-color').value, accentColor: el('accent-color').value, textColor: el('text-color').value, mutedTextColor: el('muted-text-color').value, inputBackgroundColor: el('input-background-color').value } }; await api(`/sites/${state.siteSlug}`, { method: 'PATCH', body: JSON.stringify({ name: settings.siteName, settings }) }); notice('Site design saved.'); await loadWorkspace(); } catch (error) { notice(error.message, 'error'); } };
  el('header-deploy').onclick = () => deploySite().catch((error) => notice(error.message, 'error')); el('deploy-now').onclick = () => deploySite().catch((error) => notice(error.message, 'error'));
  async function deploySite() { const deployed = state.site?.deployment?.status !== 'deployed'; await api(`/sites/${state.siteSlug}/${deployed ? 'deploy' : 'undeploy'}`, { method: 'POST' }); notice(deployed ? 'Website deployed.' : 'Website undeployed.'); await loadWorkspace(); renderDeployment(); }
  el('load-content').onclick = () => loadContent().catch((error) => notice(error.message, 'error')); el('new-content').onclick = () => openContentEditor(); el('close-content-editor').onclick = () => el('content-editor').classList.add('hidden'); el('save-content').onclick = () => saveContent().catch((error) => notice(error.message, 'error'));
  loadWorkspace();
}());
