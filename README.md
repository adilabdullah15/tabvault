# TabVault

A tab workspace that never loses your work — **automatic snapshots, named workspaces, search, and one-click restore**. Manifest V3 Chrome extension.

## What it does

- **Automatic snapshots** — every open window is quietly saved on a timer (default 5 min) and whenever tabs change. A visible backup pill in the popup always shows the last successful backup ("Backed up 3m ago") or flags failures.
- **Named workspaces** — calm workspace switcher (double-click a chip to rename). Each workspace keeps its own "current" capture plus snapshot history.
- **Command palette** — global search across every workspace's tabs; press `/` to focus, Enter to open the top hit.
- **One-click restore** — restore a whole snapshot (all tabs in a new window) or open any single tab.
- **Free forever** — unlimited local workspaces, search, import/export JSON. Pro (~$4/mo) upsell is stubbed in Settings: encrypted cross-device sync, full version history, shared workspaces.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select the `tabvault/` folder

## Shortcuts

| Action | Default |
|---|---|
| Open TabVault | `Alt+Shift+V` |
| Snapshot now | `Alt+Shift+S` |
| Focus search in popup | `/` |

Change them at `chrome://extensions/shortcuts`.

## Files

```
manifest.json      — MV3 manifest
background.js      — service worker: alarms, auto snapshots, context menu, commands
lib/store.js       — shared storage + snapshot capture/restore engine
popup.html/css/js  — palette + workspace switcher + backup state UI
options.html/js    — settings, import/export, Pro upsell, danger zone
icons/             — 16/32/48/128 PNG icons
```

## Notes

- Only `http(s)` tabs are captured — `chrome://`, extension pages and (optionally) incognito windows are skipped.
- Auto history is sparse: a new history entry is kept only when the tab set actually changed; "current" is always refreshed.
- Everything is stored in `chrome.storage.local` — no servers, no tracking.
- **Support email:** set your real address in `lib/store.js` (`SUPPORT_EMAIL`) before publishing — the in-app 💬 feedback button sends user feedback there.

## Changelog

### v1.1.0
- Popup now paints an instant skeleton on first click (no more blank/delayed open)
- All native `confirm`/`prompt`/`alert` dialogs replaced with beautiful in-extension modals
- New 💬 feedback option (popup footer + Settings page)
- Refreshed UI: gradient header, glowing active workspace, card-style snapshots, smoother hover states
- Snappier search (debounced) and lighter initial render

## Roadmap

- Pro: encrypted sync via a small backend (Supabase/Firebase), share links for workspaces
- Tab groups preservation on restore
- Session diff view ("what changed since yesterday")

---

Built by [Adil Abdullah Khan](https://github.com/adilabdullah15) · Feedback goes to a private Google Sheet — only the developer sees it.
