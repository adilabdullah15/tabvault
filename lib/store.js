/* TabVault shared store + snapshot engine (service worker, popup, options). */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'tabvault.v1';
  const SCHEME_VERSION = 1;

  const WORKSPACE_COLORS = [
    '#5eead4', '#7dd3fc', '#a5b4fc', '#f0abfc',
    '#fda4af', '#fdba74', '#fde68a', '#a7f3d0'
  ];

  const DEFAULT_SETTINGS = {
    autoSnapshot: true,
    intervalMin: 5,
    maxSnapshotsPerWorkspace: 25,
    includePinnedOnly: false,
    skipIncognito: true
  };

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 8);
  }

  function blankWorkspace(name, colorIdx) {
    return {
      id: uid('ws'),
      name: name || 'Untitled workspace',
      color: WORKSPACE_COLORS[(colorIdx || 0) % WORKSPACE_COLORS.length],
      createdAt: Date.now(),
      // "current" is the latest live capture; "snapshots" is version history.
      current: null,
      snapshots: []
    };
  }

  function defaultState() {
    return {
      scheme: SCHEME_VERSION,
      activeWorkspaceId: null,
      workspaces: [blankWorkspace('Inbox', 0)],
      settings: Object.assign({}, DEFAULT_SETTINGS),
      backup: { lastAutoAt: null, lastAutoOk: true, lastError: null },
      pro: { plan: 'free' }
    };
  }

  function normalize(state) {
    const d = defaultState();
    if (!state || typeof state !== 'object') return d;
    return {
      scheme: SCHEME_VERSION,
      activeWorkspaceId: state.activeWorkspaceId || (state.workspaces[0] && state.workspaces[0].id) || d.workspaces[0].id,
      workspaces: Array.isArray(state.workspaces) && state.workspaces.length
        ? state.workspaces
        : d.workspaces,
      settings: Object.assign({}, DEFAULT_SETTINGS, state.settings || {}),
      backup: Object.assign({}, d.backup, state.backup || {}),
      pro: Object.assign({}, d.pro, state.pro || {})
    };
  }

  async function get() {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    return normalize(res[STORAGE_KEY]);
  }

  async function set(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }

  function activeWorkspace(state) {
    return state.workspaces.find(w => w.id === state.activeWorkspaceId) ||
      state.workspaces[0];
  }

  /** Capture all normal windows into a snapshot object. */
  async function captureWindows(label) {
    const settings = (await get()).settings;
    const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const windows = [];
    for (const w of wins) {
      if (settings.skipIncognito && w.incognito) continue;
      const tabs = (w.tabs || [])
        .filter(t => t.url && !t.url.startsWith('chrome://') &&
          !t.url.startsWith('chrome-extension://') &&
          !t.url.startsWith('edge://') && !t.url.startsWith('about:'))
        .map(t => ({
          url: t.url,
          title: t.title || t.url,
          favIconUrl: t.favIconUrl || null,
          pinned: !!t.pinned
        }));
      if (!tabs.length) continue;
      windows.push({
        id: w.id,
        incognito: !!w.incognito,
        focused: !!w.focused,
        tabs
      });
    }
    const tabCount = windows.reduce((n, w) => n + w.tabs.length, 0);
    return {
      id: uid('snap'),
      label: label || 'Snapshot',
      createdAt: Date.now(),
      windows,
      tabCount,
      windowCount: windows.length
    };
  }

  /** Open every tab of a snapshot in a new window (one-click restore). */
  async function restoreSnapshot(snapshot, opts) {
    const options = Object.assign({ singleWindow: true }, opts || {});
    const urls = [];
    snapshot.windows.forEach(w => w.tabs.forEach(t => urls.push(t.url)));
    if (!urls.length) return { opened: 0 };
    if (options.singleWindow) {
      await chrome.windows.create({ url: urls, focused: true });
      return { opened: urls.length, windows: 1 };
    }
    let opened = 0;
    for (const w of snapshot.windows) {
      const wUrls = w.tabs.map(t => t.url);
      if (!wUrls.length) continue;
      await chrome.windows.create({ url: wUrls, incognito: !!w.incognito, focused: false });
      opened += wUrls.length;
    }
    return { opened, windows: snapshot.windows.length };
  }

  function pruneSnapshots(workspace, maxKeep) {
    if (workspace.snapshots.length > maxKeep) {
      workspace.snapshots.sort((a, b) => b.createdAt - a.createdAt);
      workspace.snapshots.length = maxKeep;
    }
  }

  function timeAgo(ts) {
    if (!ts) return 'never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    return d + 'd ago';
  }

  function fmtDateTime(ts) {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.TabVaultStore = {
    STORAGE_KEY,
    WORKSPACE_COLORS,
    DEFAULT_SETTINGS,
    // Developer: set your real support email here before publishing.
    // Feedback from users is sent to this address.
    SUPPORT_EMAIL: 'adilabdullahkhan35@gmail.com',
    uid,
    blankWorkspace,
    defaultState,
    normalize,
    get,
    set,
    activeWorkspace,
    captureWindows,
    restoreSnapshot,
    pruneSnapshots,
    timeAgo,
    fmtDateTime,
    escapeHtml
  };
})(typeof self !== 'undefined' ? self : this);
