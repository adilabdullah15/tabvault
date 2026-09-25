/* TabVault shared UI: beautiful in-extension modal (no native dialogs)
   + feedback flow (Google Form -> Sheets, like QRForge). Loaded after lib/store.js. */
(function (global) {
  'use strict';

  /* ---- Feedback backend (Google Form — free & private: only you see responses) ----
     Form: "TabVault Feedback" -> linked Sheet "TabVault Feedback (Responses)".
     Same pattern as QRForge. Filled in after the form was created. */
  const FB_FORM_ID = 'REPLACE_WITH_FORM_ID';       // public /d/e/ ID
  const FB_ENTRY_NAME = 'entry.REPLACE';            // "Your name" question
  const FB_ENTRY_MSG = 'entry.REPLACE';             // "Your message" question
  const FB_CONFIGURED = FB_FORM_ID.indexOf('REPLACE') === -1;

  const GITHUB_PROFILE = 'https://github.com/adilabdullah15';
  const GITHUB_REPO = 'https://github.com/adilabdullah15/tabvault';
  const GITHUB_ISSUES = 'https://github.com/adilabdullah15/tabvault/issues';

  const OVERLAY_ID = 'tv-modal-overlay';
  const STYLE_ID = 'tv-modal-style';

  const CSS = `
#${OVERLAY_ID} {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(4, 8, 12, 0.62);
  backdrop-filter: blur(3px);
  display: none; align-items: center; justify-content: center;
  padding: 20px;
}
#${OVERLAY_ID}.show { display: flex; animation: tvFadeIn 0.15s ease; }
@keyframes tvFadeIn { from { opacity: 0; } to { opacity: 1; } }
.tv-modal {
  width: 100%; max-width: 330px;
  background: #161d27;
  border: 1px solid #2b3648;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 18px 50px rgba(0,0,0,0.55);
  animation: tvPop 0.16s ease;
}
@keyframes tvPop { from { transform: scale(0.96) translateY(4px); opacity: 0; } to { transform: none; opacity: 1; } }
.tv-modal-title { margin: 0 0 6px; font-size: 14px; font-weight: 700; color: #e8eef6; }
.tv-modal-msg { margin: 0 0 12px; font-size: 12.5px; color: #8b98ab; line-height: 1.5; }
.tv-modal-input, .tv-modal-textarea {
  width: 100%; box-sizing: border-box;
  background: #0f141b; color: #e8eef6;
  border: 1px solid #2b3648; border-radius: 8px;
  padding: 9px 11px; font-size: 13px; font-family: inherit;
  outline: none; margin-bottom: 10px; resize: vertical;
}
.tv-modal-input:focus, .tv-modal-textarea:focus { border-color: #5eead4; }
.tv-modal-btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 2px; }
.tv-btn {
  border: 1px solid #2b3648; background: #1d2634; color: #e8eef6;
  border-radius: 8px; padding: 8px 14px; font-size: 12.5px; cursor: pointer;
  font-family: inherit;
}
.tv-btn:hover { border-color: #5eead4; }
.tv-btn.tv-primary {
  background: linear-gradient(135deg, #0d9488, #14b8a6);
  border: none; color: #04211d; font-weight: 700;
}
.tv-btn.tv-primary:hover { filter: brightness(1.12); }
.tv-btn.tv-danger {
  background: linear-gradient(135deg, #be123c, #f43f5e);
  border: none; color: #fff; font-weight: 700;
}`;

  function ensureOverlay() {
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    let ov = document.getElementById(OVERLAY_ID);
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.innerHTML =
      '<div class="tv-modal" role="dialog" aria-modal="true">' +
        '<h3 class="tv-modal-title"></h3>' +
        '<p class="tv-modal-msg"></p>' +
        '<input class="tv-modal-input" type="text" style="display:none" maxlength="60">' +
        '<textarea class="tv-modal-textarea" rows="4" style="display:none" maxlength="2000"></textarea>' +
        '<div class="tv-modal-btns">' +
          '<button class="tv-btn tv-cancel">Cancel</button>' +
          '<button class="tv-btn tv-ok tv-primary">OK</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    return ov;
  }

  /**
   * opts: { title, message, input, inputValue, inputPlaceholder,
   *         textarea, textareaPlaceholder, okText, danger, hideCancel }
   * Resolves: input+textarea -> {name, message} | null; single field -> value | null; confirm -> true/false.
   */
  function modal(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const ov = ensureOverlay();
      const titleEl = ov.querySelector('.tv-modal-title');
      const msgEl = ov.querySelector('.tv-modal-msg');
      const inputEl = ov.querySelector('.tv-modal-input');
      const areaEl = ov.querySelector('.tv-modal-textarea');
      const okBtn = ov.querySelector('.tv-ok');
      const cancelBtn = ov.querySelector('.tv-cancel');

      titleEl.textContent = opts.title || '';
      msgEl.textContent = opts.message || '';
      msgEl.style.display = opts.message ? '' : 'none';

      const useInput = !!opts.input;
      const useArea = !!opts.textarea;
      inputEl.style.display = useInput ? '' : 'none';
      areaEl.style.display = useArea ? '' : 'none';
      if (useInput) {
        inputEl.value = opts.inputValue || '';
        inputEl.placeholder = opts.inputPlaceholder || '';
      }
      if (useArea) {
        areaEl.value = '';
        areaEl.placeholder = opts.textareaPlaceholder || 'Type here…';
      }

      okBtn.textContent = opts.okText || 'OK';
      okBtn.classList.toggle('tv-danger', !!opts.danger);
      okBtn.classList.toggle('tv-primary', !opts.danger);
      cancelBtn.style.display = opts.hideCancel ? 'none' : '';

      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        ov.classList.remove('show');
        cleanup();
        resolve(val);
      };
      const onOk = () => {
        if (useInput && useArea) done({ name: inputEl.value, message: areaEl.value });
        else if (useInput) done(inputEl.value);
        else if (useArea) done(areaEl.value);
        else done(true);
      };
      const onCancel = () => done((useInput || useArea) ? null : false);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        else if (e.key === 'Enter' && useInput && !useArea) { e.preventDefault(); onOk(); }
      };
      const onOverlay = (e) => { if (e.target === ov) onCancel(); };
      function cleanup() {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey, true);
        ov.removeEventListener('mousedown', onOverlay);
      }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey, true);
      ov.addEventListener('mousedown', onOverlay);

      ov.classList.add('show');
      setTimeout(() => {
        const focusEl = useArea ? areaEl : useInput ? inputEl : okBtn;
        focusEl.focus();
        if (useInput && !useArea) inputEl.select();
      }, 40);
    });
  }

  /** Feedback flow: in-extension form -> Google Form (Sheets) -> fallback to email. */
  async function sendFeedback() {
    const S = global.TabVaultStore;
    const vals = await modal({
      title: '💬 Send feedback',
      message: 'Found a bug or have an idea? We read everything.',
      input: true,
      inputPlaceholder: 'Your name (optional)',
      textarea: true,
      textareaPlaceholder: 'Type your feedback here…',
      okText: 'Send feedback'
    });
    if (!vals || !vals.message || !vals.message.trim()) return false;
    const name = (vals.name || '').trim();
    const msg = vals.message.trim();
    const version = chrome.runtime.getManifest().version;

    if (FB_CONFIGURED) {
      try {
        const params = new URLSearchParams();
        params.append(FB_ENTRY_NAME, name || 'Anonymous');
        params.append(FB_ENTRY_MSG, msg + '\n\n— TabVault v' + version);
        await fetch('https://docs.google.com/forms/d/e/' + FB_FORM_ID + '/formResponse', {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });
        await modal({
          title: 'Thank you! ✓',
          message: 'Your feedback was received.',
          okText: 'Done',
          hideCancel: true
        });
        return true;
      } catch (_) { /* fall through to email fallback */ }
    }

    const email = (S && S.SUPPORT_EMAIL) || '';
    const subject = encodeURIComponent('TabVault Feedback' + (name ? ' from ' + name : ''));
    const body = encodeURIComponent(
      (name ? 'Name: ' + name + '\n\n' : '') + msg + '\n\n— sent from TabVault v' + version);
    chrome.tabs.create({ url: 'mailto:' + email + '?subject=' + subject + '&body=' + body });
    return true;
  }

  global.TabVaultUI = { modal, sendFeedback, GITHUB_PROFILE, GITHUB_REPO, GITHUB_ISSUES };
})(typeof self !== 'undefined' ? self : this);
