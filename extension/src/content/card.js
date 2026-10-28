// The small card in the bottom-right corner. Lives in a shadow root so page CSS
// cannot restyle it, and builds every label with textContent (labels come from
// the page, so they are never parsed as HTML).
(function () {
  'use strict';
  if (window !== window.top || globalThis.__quickhandCard) return;
  globalThis.__quickhandCard = true; // the background may inject us again into an open tab

  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  const SHOW_MS = 5000;
  const PRAISE_MS = 2200; // a cheer is a moment, not something to read
  const SPARKS = ['#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#8ecae6'];
  // The cheer gold: [top-left, bottom-right] at the first practice use and when learned.
  const GOLD = [['#fff8dc', '#ffeaa8'], ['#ffd25e', '#ffa91e']];

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
    @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    img { width: 56px; height: 56px; flex: none; object-fit: contain; transform-origin: 50% 85%; }
    /* One short move when the card appears, then still: the mascot pops in, then
       wiggles (hint) or hops (learned), and the key chips press down twice. */
    @keyframes pop { 0% { opacity: 0; transform: scale(0.4) rotate(-12deg); } 60% { opacity: 1; transform: scale(1.12) rotate(4deg); } 100% { transform: none; } }
    @keyframes wiggle { 0%, 100% { transform: none; } 25% { transform: rotate(-13deg); } 50% { transform: rotate(10deg); } 75% { transform: rotate(-5deg); } }
    @keyframes hop { 0%, 100% { transform: none; } 40% { transform: translateY(-14px) scale(1.05, 0.95); } 70% { transform: translateY(0) scale(0.95, 1.05); } }
    @keyframes press { 0%, 100% { transform: none; border-bottom-width: 3px; } 50% { transform: translateY(2px); border-bottom-width: 1px; } }
    .card img { animation: pop 380ms cubic-bezier(0.3, 1.4, 0.5, 1) both; }
    .card.hint img { animation: pop 380ms cubic-bezier(0.3, 1.4, 0.5, 1) both, wiggle 520ms ease-in-out 420ms; }
    .card.learned img { animation: pop 380ms cubic-bezier(0.3, 1.4, 0.5, 1) both, hop 320ms ease-out 400ms 2; }
    .card.hint kbd { animation: press 240ms ease-in-out 950ms 2; }
    .card.praise img { animation: pop 380ms cubic-bezier(0.3, 1.4, 0.5, 1) both, hop 320ms ease-out 400ms 2; }
    .card.praise kbd { animation: press 240ms ease-in-out 200ms 1; }
    /* Sparks fly out from the mascot once; more of them, further, for a streak. */
    .burst { position: absolute; left: 40px; top: 50%; width: 0; height: 0; pointer-events: none; }
    .burst i { position: absolute; left: -4px; top: -4px; width: 8px; height: 8px; border-radius: 50%; background: var(--c); opacity: 0; animation: fly 750ms ease-out var(--d) both; }
    @keyframes fly { 0% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(0.3); } }
    /* Cheers share one warm gold that deepens with practice: pale at the first
       "Nice!", deepest at "Learned!". A streak keeps the same card and adds a
       badge, a bounce and more sparks. Same colours in light and dark pages. */
    .card.praise, .card.learned {
      --ink: #4a3000; --quiet: #6f4e10; --line: #e9b949; --chip: #fffaf0; --accent: #c77800;
      background: linear-gradient(135deg, var(--from, #fff8dc) 0%, var(--to, #ffeaa8) 100%);
      border: 0; border-radius: 18px;
      box-shadow: 0 10px 30px rgba(214, 140, 0, 0.38);
      animation: rise 300ms cubic-bezier(0.3, 1.5, 0.5, 1);
    }
    .card.praise .title, .card.learned .title { font-size: 19px; font-weight: 800; color: #a35f00; letter-spacing: -0.2px; }
    .card.praise .label, .card.learned .label { margin: 1px 0 5px; font-size: 13px; }
    .card.combo, .card.learned { animation: rise 300ms cubic-bezier(0.3, 1.5, 0.5, 1), cheer 520ms ease-out 260ms; }
    .card.learned { box-shadow: 0 12px 36px rgba(214, 120, 0, 0.5); }
    .card.learned .title { font-size: 23px; color: #7a3d00; }
    .badge { display: inline-block; margin-left: 8px; padding: 2px 9px; border-radius: 999px; background: #e8590c; color: #ffffff; font-size: 13px; font-weight: 800; vertical-align: 2px; }
    .card.praise .dots i { background: rgba(163, 95, 0, 0.18); }
    .card.praise .dots i.on { background: #c77800; }
    .card.praise .close:hover, .card.praise .close:focus-visible,
    .card.learned .close:hover, .card.learned .close:focus-visible { background: rgba(255, 255, 255, 0.45); }
    @keyframes rise { from { opacity: 0; transform: translateY(24px) scale(0.8); } to { opacity: 1; transform: none; } }
    @keyframes cheer { 0%, 100% { transform: none; } 35% { transform: scale(1.07); } 65% { transform: scale(0.98); } }
    .dots { display: flex; gap: 3px; margin-top: 6px; }
    .dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
    .dots i.on { background: var(--accent); }
    @media (prefers-reduced-motion: reduce) { .card, .card * { animation: none !important; } .burst { display: none; } }
    .body { min-width: 0; }
    .title { margin: 0; font-size: 12px; color: var(--quiet); }
    .label { margin: 2px 0 6px; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
    .keys { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .step { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    .break { flex-basis: 100%; height: 0; }
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
  let current = null; // the card on screen: { variant, id }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // display: alternatives, each a list of keys; "→" marks the second step of a
  // sequence ("G then I"). A step never wraps inside itself, and a sequence with a
  // combination in it ("Ctrl + Space then Shift + →") puts its second step on a line
  // of its own, so "then" ends the first line; "G then I" stays on one line.
  function keysNode(display) {
    const wrap = el('div', 'keys');
    (display || []).forEach((combo, i) => {
      if (i) wrap.append(el('span', 'sep', t('cardOr')));
      const steps = [[]];
      combo.forEach((k, j) => {
        if (k === '→' && j < combo.length - 1) steps.push([]); // a trailing "→" is the arrow key itself
        else steps[steps.length - 1].push(k);
      });
      const ownLines = steps.length > 1 && steps.some((step) => step.length > 1);
      steps.forEach((step, s) => {
        if (s && ownLines) wrap.append(el('span', 'break'));
        const group = el('span', 'step');
        step.forEach((k, j) => {
          if (j) group.append(el('span', 'sep', '+'));
          group.append(el('kbd', null, k));
        });
        if (s < steps.length - 1) group.append(el('span', 'sep', t('cardThen')));
        wrap.append(group);
      });
    });
    return wrap;
  }

  // Gmail's shortcuts without Ctrl/⌘ only work after turning them on in Gmail settings.
  function needsGmailSetting(msg) {
    const first = (msg.display && msg.display[0]) || [];
    return msg.site === 'gmail' && !first.includes('Ctrl') && !first.includes('⌘');
  }

  // Sheets' column select on a Mac is Control+Space, which macOS often keeps for
  // switching input sources (한/영), so the key may never reach the page.
  function controlSpaceOnMac(msg) {
    const first = (msg.display && msg.display[0]) || [];
    return msg.site === 'sheets' && first.some((k, i) => k === 'Control' && first[i + 1] === 'Space');
  }

  function hide() {
    clearTimeout(hideTimer);
    if (host) host.remove();
    host = null;
    current = null;
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
    hideTimer = setTimeout(hide, current && current.variant === 'praise' ? PRAISE_MS : SHOW_MS);
  }

  function burst(count, reach) {
    const wrap = el('div', 'burst');
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      const dist = reach + (i % 3) * 12;
      const spark = el('i');
      spark.style.setProperty('--x', Math.round(Math.cos(angle) * dist) + 'px');
      spark.style.setProperty('--y', Math.round(Math.sin(angle) * dist) + 'px');
      spark.style.setProperty('--c', SPARKS[i % SPARKS.length]);
      spark.style.setProperty('--d', i * 12 + 'ms');
      wrap.append(spark);
    }
    return wrap;
  }

  function mix(a, b, f) {
    const c = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * f).toString(16).padStart(2, '0')).join('');
  }

  // f: 0 for the first cheer, 1 for "learned"; the card's gold deepens in between.
  function gold(card, f) {
    card.style.setProperty('--from', mix(GOLD[0][0], GOLD[1][0], f));
    card.style.setProperty('--to', mix(GOLD[0][1], GOLD[1][1], f));
  }

  // Practice progress: filled dots for keyboard uses so far, empty ones still to go.
  function dots(done, left) {
    const wrap = el('div', 'dots');
    for (let i = 0; i < done + left; i++) wrap.append(el('i', i < done ? 'on' : ''));
    return wrap;
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
    // A cheer never pushes aside a hint for something else or the "learned" card.
    if (msg.variant === 'praise' && current && (current.variant === 'learned' || (current.variant === 'hint' && current.id !== msg.id))) return;
    hide();
    current = { variant: msg.variant || 'hint', id: msg.id };
    host = document.createElement('quickhand-card');
    const root = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = CSS;
    const card = el('div', 'card ' + (msg.variant || 'hint') + (msg.combo ? ' combo' : ''));
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
      body.append(el('p', 'label', t(msg.on ? 'toastOn' : 'toastOff')));
      if (msg.keys) body.append(el('p', 'sub', t('toastHint', [msg.keys])));
    } else if (msg.variant === 'intro') {
      // Once after install: the click was recognized, the hint comes later.
      body.append(el('p', 'title', t('introTitle')), el('p', 'label', msg.label), el('p', 'sub', t('introText', [String(msg.need)])));
    } else if (msg.variant === 'praise') {
      const title = el('p', 'title', t('praiseTitle'));
      if (msg.combo) title.append(el('span', 'badge', t('praiseCombo', [String(msg.combo)])));
      body.append(title, el('p', 'label', msg.label), keysNode(msg.display));
      if (msg.left) body.append(dots(msg.done || 0, msg.left), el('p', 'sub', t('praiseLeft', [String(msg.left)])));
      else body.append(el('p', 'sub', t(msg.combo ? 'praiseComboText' : 'praiseKey')));
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
      if (controlSpaceOnMac(msg)) body.append(el('p', 'sub', t('cardMacInputSource')));
      if (msg.id) body.append(muteButton(msg.id, body));
    }

    const close = el('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('cardClose'));
    close.addEventListener('click', hide);

    card.append(...(msg.image ? [img] : []), body, close);
    if (msg.variant === 'praise') {
      // Practice fills the gold up to 80%; learning it takes the last step.
      gold(card, msg.left ? (0.8 * (msg.done || 0)) / ((msg.done || 0) + msg.left) : msg.combo ? 0.5 : 0.2);
      card.append(msg.combo ? burst(24, 80) : burst(12, 46));
    }
    if (msg.variant === 'learned') {
      gold(card, 1);
      card.append(burst(30, 96));
    }
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
