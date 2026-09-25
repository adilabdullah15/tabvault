/* TabVault popup: command palette + workspace switcher + backup state.
   All dialogs are in-extension modals (TabVaultUI) — no native popups. */
(function () {
  'use strict';
  const S = TabVaultStore;
  const UI = TabVaultUI;
  const esc = S.escapeHtml;

  const $search = document.getElementById('search');
  const $wsBar = document.getElementById('wsBar');
  const $content = document.getElementById('content');
  const $pill = document.getElementById('backupPill');

  let state = null;
  let query = '';
  let hydrated = false;

  // Skeleton HTML already paints instantly; hydrate with real data ASAP.
  init();

  async function init() {
    try {
      state = await S.get();
    } catch (e) {
      state = S.defaultState();
    }
    if (!S.activeWorkspace(state)) state.activeWorkspaceId = state.workspaces[0].id;
    hydrated = true;
    render();
    wireEvents();
  }

  function wireEvents() {
    let searchTimer = null;
    $search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        query = $search.value.trim().toLowerCase();
        renderContent();
      }, 90); // light debounce keeps typing snappy
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== $search &&
          !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        $search.focus();
      }
      if (e.key === 'Enter' && document.activeElement === $search) {
        const first = $content.querySelector('[data-open-url]');
        if (first) first.click();
      }
      if (e.key === 'Escape' && document.activeElement === $search && $search.value) {
        $search.value = '';
        query = '';
        renderContent();
      }
    });

    document.getElementById('btnSnapshot').addEventListener('click', async () => {
      const btn = document.getElementById('btnSnapshot');
      btn.disabled = true;
      const orig = btn.innerHTML;
      btn.textContent = 'Saving…';
      try {
        const res = await chrome.runtime.sendMessage({ type: 'snapshot-now' });
        state = await S.get();
        render();
        toast(res && res.snapshot
          ? `✓ Saved ${res.snapshot.tabCount} tabs`
          : 'No open tabs to save');
      } catch (e) {
        toast('Could not save — try again');
      }
      btn.disabled = false;
      btn.innerHTML = orig;
    });

    document.getElementById('btnFeedback').addEventListener('click', () => {
      UI.sendFeedback();
    });

    document.getElementById('btnGithub').addEventListener('click', () => {
      chrome.tabs.create({ url: UI.GITHUB_PROFILE });
    });

    document.getElementById('btnOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  /* ---------------- render ---------------- */

  function render() {
    if (!hydrated) return;
    renderPill();
    renderWsBar();
    renderContent();
  }

  function renderPill() {
    const b = state.backup;
    const auto = state.settings.autoSnapshot;
    let cls = 'dot', text;
    if (!auto) {
      text = 'Auto-backup off';
    } else if (b.lastAutoOk && b.lastAutoAt) {
      cls = 'dot ok';
      text = 'Backed up ' + S.timeAgo(b.lastAutoAt);
    } else if (!b.lastAutoOk) {
      cls = 'dot bad';
      text = 'Backup failed';
    } else {
      text = 'Backup pending…';
    }
    $pill.innerHTML = `<span class="${cls}"></span><span>${esc(text)}</span>`;
    $pill.title = b.lastError ? ('Last error: ' + b.lastError)
      : (auto ? `Auto snapshot every ${state.settings.intervalMin} min` : 'Enable auto-backup in Settings');
  }

  function renderWsBar() {
    const ws = S.activeWorkspace(state);
    let html = '';
    state.workspaces.forEach((w) => {
      const n = w.current ? w.current.tabCount : 0;
      html += `<div class="ws-chip${w.id === ws.id ? ' active' : ''}" data-ws="${w.id}" title="Switch workspace · double-click to rename">` +
        `<span class="swatch" style="background:${esc(w.color)};color:${esc(w.color)}"></span>` +
        `<span class="wname">${esc(w.name)}</span>` +
        `<span class="count">${n}</span>` +
        (state.workspaces.length > 1 ? `<button class="x" data-del="${w.id}" title="Delete workspace">×</button>` : '') +
        `</div>`;
    });
    html += `<button class="ws-add" id="wsAdd" title="New workspace">+</button>`;
    $wsBar.innerHTML = html;

    $wsBar.querySelectorAll('[data-ws]').forEach(chip => {
      chip.addEventListener('click', async (e) => {
        if (e.target.dataset.del) return;
        if (chip.dataset.ws === state.activeWorkspaceId) return;
        state.activeWorkspaceId = chip.dataset.ws;
        await S.set(state);
        render();
      });
      chip.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        const w = state.workspaces.find(x => x.id === chip.dataset.ws);
        const name = await UI.modal({
          title: 'Rename workspace',
          input: true,
          inputValue: w.name,
          okText: 'Rename'
        });
        if (name && name.trim()) {
          w.name = name.trim().slice(0, 40);
          await S.set(state);
          render();
          toast('Workspace renamed');
        }
      });
    });
    $wsBar.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const w = state.workspaces.find(x => x.id === btn.dataset.del);
        const yes = await UI.modal({
          title: 'Delete workspace?',
          message: `"${w.name}" and its ${w.snapshots.length} snapshot(s) will be gone forever.`,
          okText: 'Delete',
          danger: true
        });
        if (!yes) return;
        state.workspaces = state.workspaces.filter(x => x.id !== w.id);
        if (state.activeWorkspaceId === w.id) state.activeWorkspaceId = state.workspaces[0].id;
        await S.set(state);
        render();
        toast('Workspace deleted');
      });
    });
    document.getElementById('wsAdd').addEventListener('click', async () => {
      const name = await UI.modal({
        title: 'New workspace',
        message: 'Give your workspace a name — e.g. "Client project", "Thesis", "Trip plan".',
        input: true,
        inputValue: '',
        inputPlaceholder: 'Workspace name…',
        okText: 'Create'
      });
      if (!name || !name.trim()) return;
      const w = S.blankWorkspace(name.trim().slice(0, 40), state.workspaces.length);
      state.workspaces.push(w);
      state.activeWorkspaceId = w.id;
      await S.set(state);
      render();
      toast(`"${w.name}" created`);
      const capture = await UI.modal({
        title: 'Capture current tabs?',
        message: `Save everything you have open right now into "${w.name}"?`,
        okText: 'Yes, capture',
        danger: false
      });
      if (capture) {
        await chrome.runtime.sendMessage({ type: 'snapshot-now' });
        state = await S.get();
        render();
        toast('Tabs captured ✓');
      }
    });
  }

  function allTabEntries() {
    const out = [];
    for (const w of state.workspaces) {
      const snap = w.current;
      if (!snap) continue;
      for (const win of snap.windows) {
        for (const t of win.tabs) {
          out.push({ tab: t, wsName: w.name, wsColor: w.color });
        }
      }
    }
    return out;
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (_) { return url; }
  }

  function faviconHtml(tab) {
    if (tab.favIconUrl) {
      return `<span class="favicon"><img src="${esc(tab.favIconUrl)}" alt="" loading="lazy" onerror="this.remove()"></span>`;
    }
    const ch = (tab.title || '?').trim().charAt(0).toUpperCase() || '?';
    return `<span class="favicon">${esc(ch)}</span>`;
  }

  function renderContent() {
    if (!hydrated) return;
    if (query) return renderSearch();
    const ws = S.activeWorkspace(state);
    const cur = ws.current;
    let html = '';

    const tabs = cur ? cur.windows.flatMap(w => w.tabs) : [];
    html += `<div class="section-head"><h2>Current tabs</h2>` +
      (cur ? `<span class="meta">${tabs.length} tabs · saved ${S.timeAgo(cur.createdAt)}</span>` : '') +
      `</div>`;
    if (!tabs.length) {
      html += `<div class="empty">No snapshot yet in <b>${esc(ws.name)}</b>.<br>Hit <b>⤓ Snapshot now</b> below to save your open tabs.</div>`;
    } else {
      html += `<div class="section-head"><span></span>` +
        `<button class="link-btn" id="restoreAll">⤴ Restore all ${tabs.length}</button></div>`;
      html += tabs.slice(0, 60).map((t) =>
        `<div class="tab-row" data-open-url="${esc(t.url)}" title="${esc(t.url)}">` +
        `${faviconHtml(t)}` +
        `<span class="tab-title">${esc(t.title)}<span class="tab-host">${esc(hostOf(t.url))}${t.pinned ? ' · 📌' : ''}</span></span>` +
        `</div>`).join('');
      if (tabs.length > 60) html += `<div class="empty">…and ${tabs.length - 60} more — use search above</div>`;
    }

    html += `<div class="section-head" style="margin-top:12px"><h2>History</h2>` +
      `<span class="meta">${ws.snapshots.length} saved</span></div>`;
    if (!ws.snapshots.length) {
      html += `<div class="empty">Snapshots appear here automatically.<br>Each one is a one-click restore point.</div>`;
    } else {
      html += ws.snapshots.slice(0, 10).map(snap =>
        `<div class="snap-row" data-restore="${snap.id}" title="Click to restore">` +
        `<span class="favicon">🕘</span>` +
        `<span class="snap-info"><span class="snap-label">${esc(snap.label)}</span><br>` +
        `<span class="snap-meta">${snap.tabCount} tabs · ${snap.windowCount} window${snap.windowCount === 1 ? '' : 's'} · ${S.fmtDateTime(snap.createdAt)}</span></span>` +
        `<button class="link-btn" data-restore="${snap.id}">Restore</button>` +
        `</div>`).join('');
    }

    $content.innerHTML = html;
    wireContentActions();
  }

  function renderSearch() {
    const hits = allTabEntries().filter(e =>
      (e.tab.title + ' ' + e.tab.url).toLowerCase().includes(query));
    let html = `<div class="section-head"><h2>Search</h2>` +
      `<span class="meta">${hits.length} result${hits.length === 1 ? '' : 's'}</span></div>`;
    if (!hits.length) {
      html += `<div class="empty">No tabs match "<b>${esc(query)}</b>".</div>`;
    } else {
      html += hits.slice(0, 80).map(e =>
        `<div class="tab-row" data-open-url="${esc(e.tab.url)}" title="${esc(e.tab.url)}">` +
        `${faviconHtml(e.tab)}` +
        `<span class="tab-title">${esc(e.tab.title)}<span class="tab-host">${esc(hostOf(e.tab.url))}</span></span>` +
        `<span class="ws-badge" style="border-color:${esc(e.wsColor)}">${esc(e.wsName)}</span>` +
        `</div>`).join('');
    }
    $content.innerHTML = html;
    wireContentActions();
  }

  function findSnapshot(id) {
    for (const w of state.workspaces) {
      const s = w.snapshots.find(x => x.id === id);
      if (s) return s;
      if (w.current && w.current.id === id) return w.current;
    }
    return null;
  }

  function wireContentActions() {
    $content.querySelectorAll('[data-open-url]').forEach(el => {
      el.addEventListener('click', () => {
        chrome.tabs.create({ url: el.dataset.openUrl, active: false });
      });
    });
    $content.querySelectorAll('[data-restore]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const snap = findSnapshot(el.dataset.restore);
        if (!snap) return;
        const yes = await UI.modal({
          title: 'Restore snapshot?',
          message: `"${snap.label}" — ${snap.tabCount} tabs will open in a new window.`,
          okText: 'Restore'
        });
        if (!yes) return;
        const r = await S.restoreSnapshot(snap);
        toast(`✓ Restored ${r.opened} tabs`);
      });
    });
    const ra = document.getElementById('restoreAll');
    if (ra) ra.addEventListener('click', async () => {
      const ws = S.activeWorkspace(state);
      if (!ws.current) return;
      const yes = await UI.modal({
        title: 'Restore all tabs?',
        message: `${ws.current.tabCount} tabs will open in a new window.`,
        okText: 'Restore all'
      });
      if (!yes) return;
      const r = await S.restoreSnapshot(ws.current);
      toast(`✓ Restored ${r.opened} tabs`);
    });
  }

  let toastTimer = null;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
})();
