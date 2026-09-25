/* TabVault options page logic. All dialogs are in-page modals (TabVaultUI). */
(function () {
  'use strict';
  const S = TabVaultStore;
  const UI = TabVaultUI;

  const $auto = document.getElementById('optAuto');
  const $interval = document.getElementById('optInterval');
  const $max = document.getElementById('optMax');
  const $incognito = document.getElementById('optIncognito');
  const $saved = document.getElementById('savedMsg');

  let state = null;
  let saveTimer = null;

  init();

  async function init() {
    state = await S.get();
    $auto.checked = !!state.settings.autoSnapshot;
    $interval.value = state.settings.intervalMin;
    $max.value = state.settings.maxSnapshotsPerWorkspace;
    $incognito.checked = !!state.settings.skipIncognito;

    [$auto, $incognito].forEach(el => el.addEventListener('change', persist));
    [$interval, $max].forEach(el => el.addEventListener('change', persist));

    document.getElementById('btnExport').addEventListener('click', exportVault);
    document.getElementById('btnImport').addEventListener('click', () =>
      document.getElementById('fileImport').click());
    document.getElementById('fileImport').addEventListener('change', importVault);
    document.getElementById('btnWipe').addEventListener('click', wipeAll);
    document.getElementById('btnFeedback').addEventListener('click', () => UI.sendFeedback());
  }

  async function persist() {
    state.settings.autoSnapshot = $auto.checked;
    state.settings.intervalMin = Math.max(1, Math.min(120, parseInt($interval.value, 10) || 5));
    state.settings.maxSnapshotsPerWorkspace = Math.max(5, Math.min(100, parseInt($max.value, 10) || 25));
    state.settings.skipIncognito = $incognito.checked;
    await S.set(state);
    await chrome.runtime.sendMessage({ type: 'settings-changed' });
    $saved.classList.add('show');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => $saved.classList.remove('show'), 1500);
  }

  async function exportVault() {
    state = await S.get();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tabvault-backup-${d}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function importVault(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        const normalized = S.normalize(parsed);
        if (!normalized.workspaces.length) throw new Error('empty vault');
        const yes = await UI.modal({
          title: 'Import backup?',
          message: `This will replace your current vault with the backup (${normalized.workspaces.length} workspace(s)).`,
          okText: 'Import',
        });
        if (!yes) return;
        await S.set(normalized);
        await chrome.runtime.sendMessage({ type: 'reschedule' });
        await UI.modal({ title: 'Imported ✓', message: 'Your vault was imported successfully.', okText: 'Done', hideCancel: true });
        location.reload();
      } catch (err) {
        await UI.modal({ title: 'Import failed', message: 'Could not import that file: ' + err.message, okText: 'OK', hideCancel: true });
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  async function wipeAll() {
    const n = state.workspaces.reduce((t, w) => t + w.snapshots.length, 0);
    const yes = await UI.modal({
      title: 'Delete everything?',
      message: `Permanently delete all ${state.workspaces.length} workspace(s) and ${n} snapshot(s)? Export a backup first if you want to keep anything. This cannot be undone.`,
      okText: 'Delete everything',
      danger: true
    });
    if (!yes) return;
    const fresh = S.defaultState();
    await S.set(fresh);
    await chrome.runtime.sendMessage({ type: 'reschedule' });
    location.reload();
  }
})();
