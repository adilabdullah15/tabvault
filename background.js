/* TabVault service worker: automatic snapshots, alarms, context menu, commands. */
importScripts('lib/store.js');

const ALARM_NAME = 'tabvault-autosnap';
const DEBOUNCE_MS = 30 * 1000;
let debounceTimer = null;

chrome.runtime.onInstalled.addListener(async (details) => {
  const state = await TabVaultStore.get();
  if (details.reason === 'install' && !state.activeWorkspaceId) {
    state.activeWorkspaceId = state.workspaces[0].id;
    await TabVaultStore.set(state);
  }
  await scheduleAlarm();
  setupContextMenu();
  if (details.reason === 'install') {
    // Take an immediate first snapshot so the vault is never empty.
    await autoSnapshot('First snapshot');
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
  setupContextMenu();
});

async function scheduleAlarm() {
  const state = await TabVaultStore.get();
  await chrome.alarms.clear(ALARM_NAME);
  if (state.settings.autoSnapshot) {
    const minutes = Math.max(1, Math.min(120, state.settings.intervalMin || 5));
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: minutes });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) await autoSnapshot('Auto snapshot');
});

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tabvault-save-page',
      title: 'Save this tab to TabVault',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'tabvault-snapshot-window',
      title: 'Snapshot this window to TabVault',
      contexts: ['page']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const state = await TabVaultStore.get();
  const ws = TabVaultStore.activeWorkspace(state);
  if (info.menuItemId === 'tabvault-save-page' && tab && tab.url) {
    const snap = {
      id: TabVaultStore.uid('snap'),
      label: 'Saved tab',
      createdAt: Date.now(),
      windows: [{
        id: null, incognito: false, focused: true,
        tabs: [{ url: tab.url, title: tab.title || tab.url, favIconUrl: tab.favIconUrl || null, pinned: false }]
      }],
      tabCount: 1, windowCount: 1
    };
    ws.current = snap;
    ws.snapshots.unshift(snap);
    TabVaultStore.pruneSnapshots(ws, state.settings.maxSnapshotsPerWorkspace);
    state.backup.lastAutoAt = Date.now();
    state.backup.lastAutoOk = true;
    await TabVaultStore.set(state);
  } else if (info.menuItemId === 'tabvault-snapshot-window') {
    await manualSnapshot('Manual snapshot');
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-snapshot') await manualSnapshot('Manual snapshot');
});

/** Auto snapshot: refresh "current", keep a light history, update backup state. */
async function autoSnapshot(label) {
  try {
    const state = await TabVaultStore.get();
    if (!state.settings.autoSnapshot && label === 'Auto snapshot') return;
    const snap = await TabVaultStore.captureWindows(label);
    if (snap.tabCount === 0) return; // nothing worth saving
    const ws = TabVaultStore.activeWorkspace(state);
    ws.current = snap;
    // Keep auto history sparse: only push when tab set changed since last snapshot.
    const last = ws.snapshots[0];
    const sig = (s) => s.windows.map(w => w.tabs.map(t => t.url).join('|')).join('||');
    if (!last || sig(last) !== sig(snap)) {
      ws.snapshots.unshift(snap);
      TabVaultStore.pruneSnapshots(ws, state.settings.maxSnapshotsPerWorkspace);
    } else {
      ws.current = snap; // still refresh "current"
    }
    state.backup.lastAutoAt = Date.now();
    state.backup.lastAutoOk = true;
    state.backup.lastError = null;
    await TabVaultStore.set(state);
  } catch (err) {
    try {
      const state = await TabVaultStore.get();
      state.backup.lastAutoOk = false;
      state.backup.lastError = String(err && err.message || err);
      await TabVaultStore.set(state);
    } catch (_) { /* storage itself failed; nothing to do */ }
  }
}

async function manualSnapshot(label) {
  const state = await TabVaultStore.get();
  const snap = await TabVaultStore.captureWindows(label || 'Manual snapshot');
  if (snap.tabCount === 0) return null;
  const ws = TabVaultStore.activeWorkspace(state);
  ws.current = snap;
  ws.snapshots.unshift(snap);
  TabVaultStore.pruneSnapshots(ws, state.settings.maxSnapshotsPerWorkspace);
  state.backup.lastAutoAt = Date.now();
  state.backup.lastAutoOk = true;
  state.backup.lastError = null;
  await TabVaultStore.set(state);
  return snap;
}

/** Debounced re-capture on tab/window churn so "current" stays fresh. */
function scheduleDebouncedCapture() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    autoSnapshot('Auto snapshot');
  }, DEBOUNCE_MS);
}

chrome.tabs.onCreated.addListener(scheduleDebouncedCapture);
chrome.tabs.onRemoved.addListener(scheduleDebouncedCapture);
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'complete' || info.url) scheduleDebouncedCapture();
});
chrome.windows.onCreated.addListener(scheduleDebouncedCapture);
chrome.windows.onRemoved.addListener(scheduleDebouncedCapture);

/** Popup <-> worker messages. */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'snapshot-now') {
      const snap = await manualSnapshot('Manual snapshot');
      sendResponse({ ok: true, snapshot: snap });
    } else if (msg.type === 'settings-changed') {
      await scheduleAlarm();
      sendResponse({ ok: true });
    } else if (msg.type === 'reschedule') {
      await scheduleAlarm();
      setupContextMenu();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // async response
});
