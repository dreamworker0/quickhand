// The small card in the bottom-right corner. Lives in a shadow root so page CSS
// cannot restyle it, and builds every label with textContent (labels come from
// the page, so they are never parsed as HTML).
(function () {
  'use strict';
  if (window !== window.top || globalThis.__quickhandCard) return;
  globalThis.__quickhandCard = true; // the background may inject us again into an open tab

  const t = (key) => chrome.i18n.getMessage(key) || key;
  const mac = globalThis.QH && globalThis.QH.keys ? globalThis.QH.keys.isMac() : false;
  const SHOW_MS = 5000;

  const CSS = `
    :host { all: initial; }
    .card {
      --bg: #ffffff; --ink: #173f4f; --quiet: #4f6b75; --line: #d7e4e2; --accent: #2a9d8f; --chip: #f1f8f7;
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      display: flex; gap: 12px; align-items: center;
      width: max-content; max-width: min(360px, calc(100vw - 32px));
      padding: 12px 36px 12px 12px; box-sizing: border-box;
      background: var(--bg); color: var(--ink);
      border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 12px;
      box-shadow: 0 6px 24px rgba(23, 63, 79, 0.18);
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
      animation: in 180ms ease-out;
    }
    @media (prefers-color-scheme: dark) {
      .card { --bg: #1d2b31; --ink: #eef6f5; --quiet: #a9c0c4; --line: #2f444b; --chip: #24363d; }
    }
    @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    img { width: 56px; height: 56px; flex: none; object-fit: contain; }
    .body { min-width: 0; }
    .title { margin: 0; font-size: 12px; color: var(--quiet); }
    .label { margin: 2px 0 6px; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
    .keys { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    kbd {
      font: 600 13px/1 ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace;
      padding: 5px 8px; border-radius: 6px; color: var(--ink);
      background: var(--chip); border: 1px solid var(--line); border-bottom-width: 3px;
    }
    .sep { color: var(--quiet); font-size: 12px; padding: 0 2px; }
    .sub { margin: 6px 0 0; font-size: 12px; color: var(--quiet); }
    .close {
      position: absolute; top: 6px; right: 6px; width: 28px; height: 28px;
      border: 0; border-radius: 6px; background: transparent; color: var(--quiet);
      font-size: 18px; line-height: 1; cursor: pointer;
    }
    .close:hover, .close:focus-visible { background: var(--chip); color: var(--ink); outline: none; }
    .mute {
      margin: 6px 0 0; padding: 0; border: 0; background: none;
      font: inherit; font-size: 12px; color: var(--quiet);
      text-decoration: underline; text-underline-offset: 2px; cursor: pointer;
    }
    .mute:hover { color: var(--ink); }
    .mute:focus-visible { color: var(--ink); outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
  `;

  let host = null;
  let hideTimer = 0;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // display: alternatives, each a list of keys; "→" marks the second step of a
  // sequence ("G then I").
  function keysNode(display) {
    const wrap = el('div', 'keys');
    (display || []).forEach((combo, i) => {
      if (i) wrap.append(el('span', 'sep', t('cardOr')));
      combo.forEach((k, j) => {
        if (k === '→' && j < combo.length - 1) { // a trailing "→" is the arrow key itself
          wrap.append(el('span', 'sep', t('cardThen')));
          return;
        }
        if (j && combo[j - 1] !== '→') wrap.append(el('span', 'sep', '+'));
        wrap.append(el('kbd', null, k));
      });
    });
    return wrap;
  }

  // Gmail's shortcuts without Ctrl/⌘ only work after turning them on in Gmail settings.
  function needsGmailSetting(msg) {
    const first = (msg.display && msg.display[0]) || [];
    return msg.site === 'gmail' && !first.includes('Ctrl') && !first.includes('⌘');
  }

  function hide() {
    clearTimeout(hideTimer);
    if (host) host.remove();
    host = null;
  }

  // In full screen only the full-screen element is drawn, so the card has to sit
  // inside it (a <video> can't hold it). Clicking YouTube's full-screen button
  // brings up the card just as the page goes full screen, so it moves along.
  function place() {
    if (!host) return;
    const full = document.fullscreenElement;
    (full && !full.matches('video, iframe, img') ? full : document.documentElement).append(host);
  }
  document.addEventListener('fullscreenchange', place);

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, SHOW_MS);
  }

  // Stops hints for this one shortcut; the popup lists it so it can be turned back on.
  function muteButton(id, body) {
    const button = el('button', 'mute', t('cardMute'));
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await chrome.runtime.sendMessage({ type: 'qh-mute', id });
      } catch (e) {
        hide(); // the extension was reloaded, so there is nothing to save to
        return;
      }
      body.replaceChildren(el('p', 'label', t('cardMuted')), el('p', 'sub', t('cardMutedHint')));
      scheduleHide();
    });
    return button;
  }

  function show(msg) {
    hide();
    host = document.createElement('quickhand-card');
    const root = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = CSS;
    const card = el('div', 'card');
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');

    // The background sends the mascot as image data; without it (or if the page
    // refuses it) the card simply goes without the picture.
    const img = el('img');
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    if (msg.image) img.src = msg.image;
    const body = el('div', 'body');

    if (msg.variant === 'toast') {
      body.append(el('p', 'label', t(msg.on ? 'toastOn' : 'toastOff')), el('p', 'sub', t(mac ? 'toastHintMac' : 'toastHintWin')));
    } else if (msg.variant === 'learned') {
      body.append(el('p', 'title', t('learnedTitle')), el('p', 'label', msg.label), keysNode(msg.display), el('p', 'sub', t('learnedText')));
    } else {
      body.append(
        el('p', 'title', t('cardTitle')),
        el('p', 'label', msg.label),
        keysNode(msg.display),
        el('p', 'sub', t(msg.kind === 'reminder' ? 'cardReminder' : 'cardTry'))
      );
      if (needsGmailSetting(msg)) body.append(el('p', 'sub', t('cardGmailNote')));
      if (msg.id) body.append(muteButton(msg.id, body));
    }

    const close = el('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('cardClose'));
    close.addEventListener('click', hide);

    card.append(...(msg.image ? [img] : []), body, close);
    card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    card.addEventListener('mouseleave', scheduleHide);
    root.append(style, card);
    place();
    scheduleHide();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'qh-card') show(msg);
  });
})();
