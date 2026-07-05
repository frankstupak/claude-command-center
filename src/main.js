'use strict';

const path = require('path');
const fs = require('fs');
const {
  app, BaseWindow, WebContentsView, session,
  ipcMain, globalShortcut, Menu, nativeTheme
} = require('electron');

const CFG = require('./config');
const store = require('./persistence');

// --- injected assets (read once) -------------------------------------------
const INJECT_DIR = path.join(__dirname, 'inject');
const VIEW_CSS = fs.readFileSync(path.join(INJECT_DIR, 'styles.css'), 'utf8');
const AUTOMATIONS_JS = fs.readFileSync(path.join(INJECT_DIR, 'automations.js'), 'utf8');

// --- runtime state ----------------------------------------------------------
let win = null;              // BaseWindow
let topbar = null;           // WebContentsView (our chrome)
let bottombar = null;        // WebContentsView (our chrome)
let claudeSession = null;    // shared persistent session (single sign-on)
let tabs = [];               // MRU-ordered: index 0 = most recent. { id, view, url, title, lastActive, sidebarExpanded }
let activeId = null;
let pageOffset = 0;
let nextId = 1;

const DBG = (...a) => { if (process.env.CCC_DEBUG) console.log('[ccc]', ...a); };

// ---------------------------------------------------------------------------
// Session hardening: consistent Chrome/Linux identity so Cloudflare's Turnstile
// doesn't loop, plus strip the headers that trip datacenter/bot heuristics.
// ---------------------------------------------------------------------------
function hardenSession(ses) {
  ses.setUserAgent(CFG.USER_AGENT);
  const brand = `"Chromium";v="${CFG.CHROME_MAJOR}", "Google Chrome";v="${CFG.CHROME_MAJOR}", "Not?A_Brand";v="24"`;
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const h = details.requestHeaders;
    // keep UA and client-hints telling the SAME story
    h['User-Agent'] = CFG.USER_AGENT;
    h['sec-ch-ua'] = brand;
    h['sec-ch-ua-mobile'] = '?0';
    h['sec-ch-ua-platform'] = '"Linux"';
    delete h['DNT'];
    delete h['Sec-GPC'];
    cb({ requestHeaders: h });
  });
}

// ---------------------------------------------------------------------------
// Layout math. columns is driven purely by available width; the slider pages
// through the MRU array when there are more tabs than columns.
// ---------------------------------------------------------------------------
function computeColumns(width) {
  const c = Math.floor(width / CFG.MIN_TILE_WIDTH);
  return Math.max(1, Math.min(c, CFG.MAX_COLUMNS, Math.max(1, tabs.length)));
}

function relayout() {
  if (!win) return;
  const [W, H] = win.getContentSize();
  const top = CFG.TOPBAR_HEIGHT;
  const bot = CFG.BOTTOMBAR_HEIGHT;
  const midH = Math.max(0, H - top - bot);

  topbar.setBounds({ x: 0, y: 0, width: W, height: top });
  bottombar.setBounds({ x: 0, y: H - bot, width: W, height: bot });

  const columns = computeColumns(W);
  const maxOffset = Math.max(0, tabs.length - columns);
  if (pageOffset > maxOffset) pageOffset = maxOffset;
  if (pageOffset < 0) pageOffset = 0;

  const tileW = Math.floor(W / columns);
  const visible = tabs.slice(pageOffset, pageOffset + columns);

  tabs.forEach((t) => {
    const vi = visible.indexOf(t);
    if (vi === -1) {
      t.view.setVisible(false);
    } else {
      const isLast = vi === columns - 1;
      const x = vi * tileW;
      const w = isLast ? (W - x) : tileW; // last column eats rounding remainder
      t.view.setBounds({ x, y: top, width: w, height: midH });
      t.view.setVisible(true);
    }
  });

  pushTabStrip(columns, maxOffset);
}

function pushTabStrip(columns, maxOffset) {
  if (!topbar) return;
  topbar.webContents.send('tabs', {
    tabs: tabs.map((t) => ({ id: t.id, title: t.title || 'New chat' })),
    activeId,
    pageOffset,
    columns,
    maxOffset
  });
}

// ---------------------------------------------------------------------------
// Tab lifecycle
// ---------------------------------------------------------------------------
function createTab(url, restoreMeta) {
  const id = restoreMeta && restoreMeta.id ? restoreMeta.id : nextId;
  if (id >= nextId) nextId = id + 1;

  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:claude',        // SHARED -> one login across all tiles
      preload: path.join(__dirname, 'preload-view.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  view.setBackgroundColor('#1a1a1a');

  const tab = {
    id, view,
    url: url || CFG.START_URL,
    title: (restoreMeta && restoreMeta.title) || 'New chat',
    lastActive: Date.now(),
    sidebarExpanded: !!(restoreMeta && restoreMeta.sidebarExpanded)
  };

  const wc = view.webContents;

  // Cosmetic + behaviour injection once the DOM is ready.
  wc.on('dom-ready', () => {
    wc.insertCSS(VIEW_CSS).catch(() => {});
    // main-world injection so we can hook the page's own fetch()
    wc.executeJavaScript(bootstrapFor(tab)).catch((e) => DBG('inject fail', e.message));
    if (tab.sidebarExpanded) wc.send('ccc:setSidebar', true);
  });

  // Keep the tab title in sync with the chat.
  wc.on('page-title-updated', (_e, title) => {
    tab.title = cleanTitle(title);
    persist(); relayout();
  });

  // Focus/click anywhere in a chat => it becomes active (MRU input).
  wc.on('focus', () => activate(tab.id, /*fromUser*/ true));

  // Reload this tile: Ctrl+R / F5 (Ctrl+Shift+R = hard). Scoped to the focused
  // tile via before-input-event so it never hijacks the shortcut system-wide.
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = (input.key || '').toLowerCase();
    const mod = input.control || input.meta;
    if (k === 'f5' || (mod && k === 'r')) {
      e.preventDefault();
      if (mod && input.shift) wc.reloadIgnoringCache(); else wc.reload();
    }
  });

  // Right-click menu (the native one is otherwise swallowed by the view).
  wc.on('context-menu', (_e, params) => {
    const nav = wc.navigationHistory;
    Menu.buildFromTemplate([
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => wc.reload() },
      { label: 'Hard Reload', click: () => wc.reloadIgnoringCache() },
      { type: 'separator' },
      { label: 'Back', enabled: nav.canGoBack(), click: () => nav.goBack() },
      { label: 'Forward', enabled: nav.canGoForward(), click: () => nav.goForward() },
      { type: 'separator' },
      { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
      { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
    ]).popup();
  });

  // Links that would spawn a window -> open as a new tab if they're claude.ai.
  wc.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(CFG.ORIGIN)) { createTab(target); }
    return { action: 'deny' };
  });

  win.contentView.addChildView(view);
  wc.loadURL(tab.url);

  tabs.unshift(tab);      // new tab enters at front of MRU
  pageOffset = 0;
  activeId = id;
  relayout(); persist();
  return tab;
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [tab] = tabs.splice(idx, 1);
  try { win.contentView.removeChildView(tab.view); } catch (_e) {}
  // BaseWindow won't destroy webContents for us -> we must, or it leaks.
  try { tab.view.webContents.close(); } catch (_e) {}
  if (activeId === id) activeId = tabs[0] ? tabs[0].id : null;
  relayout(); persist();
}

function activate(id, fromUser) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  tab.lastActive = Date.now();
  activeId = id;

  const [W] = win.getContentSize();
  const columns = computeColumns(W);
  const isVisible = idx >= pageOffset && idx < pageOffset + columns;

  const mode = CFG.REORDER_MODE;
  const shouldPull =
    mode === 'always' ||
    (mode === 'offscreen-only' && !isVisible);

  if (shouldPull) {
    tabs.splice(idx, 1);
    tabs.unshift(tab);
    pageOffset = 0;
  }
  if (fromUser) tab.view.webContents.focus();
  relayout(); persist();
}

function cleanTitle(t) {
  if (!t) return 'New chat';
  return t.replace(/\s*[-|–]\s*Claude\s*$/i, '').trim().slice(0, 40) || 'New chat';
}

// ---------------------------------------------------------------------------
// Injected bootstrap: hand the automations script its per-tab config.
// ---------------------------------------------------------------------------
function bootstrapFor(tab) {
  const cfg = JSON.stringify({
    tabId: tab.id,
    autoContinue: CFG.AUTOCONTINUE_ENABLED,
    autoContinueMax: CFG.AUTOCONTINUE_MAX_CHAIN,
    resume: CFG.RESUME_ENABLED,
    resumeJitterMin: CFG.RESUME_JITTER_MIN_SEC,
    resumeJitterMax: CFG.RESUME_JITTER_MAX_SEC,
    resumePoll: CFG.RESUME_POLL_SEC,
    usageDebug: CFG.USAGE_CAPTURE_DEBUG
  });
  return `(function(){ window.__CCC_CFG__ = ${cfg}; })();\n${AUTOMATIONS_JS}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function persist() {
  store.saveDebounced(() => ({
    tabs: tabs.map((t) => ({
      id: t.id,
      url: t.view.webContents.getURL() || t.url,
      title: t.title,
      lastActive: t.lastActive,
      sidebarExpanded: t.sidebarExpanded
    })),
    pageOffset
  }), CFG.STATE_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// IPC from our chrome (topbar/bottombar) and from claude views (via preload)
// ---------------------------------------------------------------------------
function wireIpc() {
  ipcMain.on('ccc:newTab', () => createTab(CFG.START_URL));
  ipcMain.on('ccc:closeTab', (_e, id) => closeTab(id));
  ipcMain.on('ccc:focusTab', (_e, id) => activate(id, true));
  ipcMain.on('ccc:page', (_e, dir) => {
    const [W] = win.getContentSize();
    const columns = computeColumns(W);
    const maxOffset = Math.max(0, tabs.length - columns);
    pageOffset = Math.max(0, Math.min(maxOffset, pageOffset + dir));
    relayout();
  });
  ipcMain.on('ccc:toggleSidebar', (_e, id) => {
    const tab = tabs.find((t) => t.id === (id || activeId));
    if (!tab) return;
    tab.sidebarExpanded = !tab.sidebarExpanded;
    tab.view.webContents.send('ccc:setSidebar', tab.sidebarExpanded);
    persist();
  });

  // usage from a claude view -> forward to the bottom bar (active tab only)
  ipcMain.on('ccc:usage', (e, payload) => {
    const tab = tabs.find((t) => t.view.webContents.id === e.sender.id);
    if (!tab) return;
    if (payload && payload.title) { tab.title = cleanTitle(payload.title); }
    if (tab.id === activeId && bottombar) {
      bottombar.webContents.send('usage', payload);
    }
  });

  // usage-candidate: raw response that *looks* usage-related. In debug we append
  // it to a log so we can bind the bottom bar to real field names, then flip
  // USAGE_CAPTURE_DEBUG off. This is the one piece that needs live traffic.
  ipcMain.on('ccc:usageCandidate', (_e, payload) => {
    if (!CFG.USAGE_CAPTURE_DEBUG) return;
    try {
      const f = path.join(app.getPath('userData'), 'usage-candidates.log');
      fs.appendFileSync(f, JSON.stringify({ t: Date.now(), ...payload }) + '\n');
      DBG('usage candidate logged:', payload.url);
    } catch (_e) {}
  });

  const _seenUrls = new Set();
  ipcMain.on('ccc:urlSeen', (_e, payload) => {
    if (!CFG.USAGE_CAPTURE_DEBUG || !payload || !payload.url) return;
    const u = payload.url.split('?')[0];
    if (_seenUrls.has(u)) return;
    _seenUrls.add(u);
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'urls.log'), u + '\n'); } catch (_e) {}
  });

  // limit hit / resumed -> surface on the bottom bar
  ipcMain.on('ccc:limit', (e, payload) => {
    const tab = tabs.find((t) => t.view.webContents.id === e.sender.id);
    if (bottombar) bottombar.webContents.send('limit', { ...payload, tab: tab && tab.title });
  });
  ipcMain.on('ccc:resumed', () => {
    if (bottombar) bottombar.webContents.send('resumed', {});
  });

  // completion signal -> optional ntfy ping
  ipcMain.on('ccc:completed', (e) => {
    const tab = tabs.find((t) => t.view.webContents.id === e.sender.id);
    if (tab && tab.id !== activeId && CFG.NTFY_TOPIC_URL) {
      try {
        const { net } = require('electron');
        const req = net.request({ method: 'POST', url: CFG.NTFY_TOPIC_URL });
        req.setHeader('Title', 'Claude Command Center');
        req.end(`"${tab.title}" finished`);
      } catch (_e) {}
    }
  });
}

// ---------------------------------------------------------------------------
// Chrome views (our own top/bottom bars)
// ---------------------------------------------------------------------------
function makeChromeView(file) {
  const v = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  v.setBackgroundColor('#111111');
  v.webContents.loadFile(path.join(__dirname, 'renderer', file));
  return v;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  nativeTheme.themeSource = 'dark';
  claudeSession = session.fromPartition('persist:claude');
  hardenSession(claudeSession);

  win = new BaseWindow({
    width: 1600, height: 900,
    backgroundColor: '#111111',
    title: 'Claude Command Center'
  });
  Menu.setApplicationMenu(null);

  topbar = makeChromeView('topbar.html');
  bottombar = makeChromeView('bottombar.html');
  win.contentView.addChildView(topbar);
  win.contentView.addChildView(bottombar);

  wireIpc();

  // restore or open one fresh tab
  const saved = store.load();
  if (saved && saved.tabs.length) {
    // restore in stored (MRU) order; unshift reverses, so add oldest first
    saved.tabs.slice().reverse().forEach((m) => createTab(m.url, m));
    pageOffset = saved.pageOffset || 0;
    activeId = tabs[0] ? tabs[0].id : null;
  } else {
    createTab(CFG.START_URL);
  }

  win.on('resize', relayout);
  win.on('close', () => { persist(); });
  relayout();

  registerShortcuts();
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+T', () => createTab(CFG.START_URL));
  globalShortcut.register('CommandOrControl+W', () => { if (activeId) closeTab(activeId); });
  globalShortcut.register('CommandOrControl+Right', () => sendPage(+1));
  globalShortcut.register('CommandOrControl+Left', () => sendPage(-1));
  for (let n = 1; n <= 9; n++) {
    globalShortcut.register(`CommandOrControl+${n}`, () => {
      const tab = tabs[n - 1];
      if (tab) activate(tab.id, true);
    });
  }
}
function sendPage(dir) {
  const [W] = win.getContentSize();
  const columns = computeColumns(W);
  const maxOffset = Math.max(0, tabs.length - columns);
  pageOffset = Math.max(0, Math.min(maxOffset, pageOffset + dir));
  relayout();
}

app.whenReady().then(boot);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
