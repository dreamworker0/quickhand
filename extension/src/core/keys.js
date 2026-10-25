// Key combos: parsing shortcut text from page UI, reading keyboard events, and
// formatting keys for display. "mod" is Ctrl on Windows/ChromeOS and ⌘ on Mac,
// so the same action gets the same id on every platform. A combo may carry
// `then`, a second key pressed afterwards ("Alt+C then F", Gmail's "G then I").
(function (root) {
  'use strict';
  const QH = (root.QH = root.QH || {});

  const MODS = ['mod', 'ctrl', 'alt', 'shift'];

  // Shown between the two steps of a sequence; the UI renders it as "then".
  const THEN = '→';

  const CODE_KEYS = {
    Backslash: '\\', Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'",
    BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Space: 'space',
  };

  const TOKENS = {
    ctrl: 'ctrl', control: 'ctrl', '⌃': 'ctrl',
    cmd: 'mod', command: 'mod', meta: 'mod', '⌘': 'mod',
    alt: 'alt', option: 'alt', opt: 'alt', '⌥': 'alt',
    shift: 'shift', '⇧': 'shift',
  };

  const KEY_NAMES = {
    space: 'Space', enter: 'Enter', escape: 'Esc', backspace: 'Backspace', delete: 'Delete',
    arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', pageup: 'PgUp', pagedown: 'PgDn', home: 'Home', end: 'End',
  };

  // Arrows printed in tooltips ("추가 정보 (Alt+→)") name the keys events report.
  const KEY_ALIASES = { '←': 'arrowleft', '→': 'arrowright', '↑': 'arrowup', '↓': 'arrowdown' };
  // Google tooltips use either the shifted glyph or the base key for these keys.
  const SHIFTED_KEYS = { '>': '.', '<': ',', '+': '=' };

  const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'altgraph', 'capslock', 'hangulmode', 'hanjamode']);

  // Gmail wraps tooltip shortcuts in invisible direction marks: "굵게 ‪(Ctrl-B)‬".
  const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;

  // "굵게(Ctrl+B)", "Bold (Ctrl+B)", full-width parentheses too.
  const TRAILING_SHORTCUT = /\s*[(（]([^()（）]*)[)）]\s*$/;
  // Korean menus add the menu access letter: "실행취소(U)".
  const ACCESS_LETTER = /\s*[(（][A-Za-z0-9][)）]\s*$/;

  function isMac(nav) {
    const n = nav || root.navigator || {};
    const platform = (n.userAgentData && n.userAgentData.platform) || n.platform || '';
    return /mac/i.test(platform);
  }

  function combo(key, mods) {
    return Object.assign({ mod: false, ctrl: false, alt: false, shift: false, key }, mods);
  }

  function sequence(first, then) {
    return Object.assign({}, first, { then });
  }

  // Read the physical key (event.code) so a Korean IME, which turns "b" into "ㅠ",
  // still reports the same combo.
  function keyFromEvent(e) {
    const code = e.code || '';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (CODE_KEYS[code]) return CODE_KEYS[code];
    return (e.key || '').toLowerCase();
  }

  function fromEvent(e, mac) {
    return combo(keyFromEvent(e), {
      mod: mac ? !!e.metaKey : !!e.ctrlKey,
      ctrl: mac ? !!e.ctrlKey : false,
      alt: !!e.altKey,
      shift: !!e.shiftKey,
    });
  }

  function isModifierOnly(e) {
    return MODIFIER_KEYS.has((e.key || '').toLowerCase());
  }

  // True when the key went into a text field, where plain letters are typing.
  function isTyping(e) {
    const el = e.composedPath ? e.composedPath()[0] : e.target;
    return !!(el && (el.isContentEditable || (el.closest && el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'))));
  }

  // Character production is not shortcut use, even when modifiers are pressed.
  function isTextEntry(e, mac) {
    return !!(e.isComposing || e.keyCode === 229 || e.key === 'Process' || e.key === 'Dead' ||
      (e.getModifierState && e.getModifierState('AltGraph')) ||
      (mac && e.altKey && !e.metaKey && !e.ctrlKey && isTyping(e) &&
        (keyFromEvent(e).length === 1 || keyFromEvent(e) === 'space')));
  }

  function toId(c) {
    return MODS.filter((m) => c[m]).concat(c.key).join('+') + (c.then ? '>' + toId(c.then) : '');
  }

  function parseStep(text, mac) {
    const spaced = text.replace(/[⌘⌥⇧⌃]/g, (s) => ' ' + s + ' ');
    const c = combo('');
    for (const raw of spaced.split(/[\s+]+/).filter(Boolean)) {
      const t = TOKENS[raw.toLowerCase()];
      if (t === 'ctrl') {
        if (mac) c.ctrl = true;
        else c.mod = true;
      } else if (t) {
        c[t] = true;
      } else {
        c.key = KEY_ALIASES[raw] || raw.toLowerCase();
      }
    }
    if (!c.key && /\+\s*\+\s*$/.test(text)) c.key = '+'; // "Ctrl+Shift++"
    if (SHIFTED_KEYS[c.key]) {
      c.key = SHIFTED_KEYS[c.key];
      c.shift = true;
    }
    return c.key ? c : null;
  }

  // Parses "Ctrl+Shift+7", "⌘⇧7", "Control+B" (aria-keyshortcuts), Gmail's
  // "Ctrl-Shift-7" and Drive's "Alt+C 다음 F" / "Alt+C then F". When the text lists
  // alternatives ("Ctrl+Y or Ctrl+Shift+Z"), the first one wins.
  function parse(text, mac) {
    if (!text) return null;
    let s = String(text).replace(BIDI_MARKS, '');
    s = s.replace(/\b(ctrl|control|alt|option|opt|shift|cmd|command|meta)-/gi, '$1+');
    // Only a comma after a complete combo is an alternative separator. A prefix
    // of modifiers (Ctrl+Shift+ or ⌘⇧) has no key yet, so its comma is the key.
    s = s.split(/\s*(?:\bor\b|또는)\s*/i)[0];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === ',' && parseStep(s.slice(0, i), mac)) {
        s = s.slice(0, i);
        break;
      }
    }
    let [first, then] = s.split(/\s+(?:다음|then)\s+/i);
    // Docs menus print a two-step key as two combos side by side: "Ctrl+Alt+O Ctrl+Alt+U".
    if (!then) {
      const pair = first.match(/^(.*\S)\s+((?:ctrl|control|alt|option|opt|shift|cmd|command|meta|[⌘⌥⇧⌃])\s*\+?.*)$/i);
      if (pair && parseStep(pair[1], mac) && parseStep(pair[2], mac)) [first, then] = [pair[1], pair[2]];
    }
    const c = parseStep(first, mac);
    if (!c) return null;
    if (then) {
      const second = parseStep(then, mac);
      if (!second) return null;
      c.then = second;
    }
    return c;
  }

  // Splits a tooltip such as "굵게 (Ctrl+B)" into its name and shortcut text.
  function splitLabel(text) {
    const clean = String(text || '').replace(BIDI_MARKS, '').replace(/\s+/g, ' ').trim();
    const m = clean.match(TRAILING_SHORTCUT);
    const label = clean.replace(TRAILING_SHORTCUT, '').replace(ACCESS_LETTER, '').trim();
    return { label, shortcut: m ? m[1] : '' };
  }

  function hasModifier(c) {
    return !!(c.mod || c.ctrl || c.alt);
  }

  function display(c, mac) {
    const out = [];
    if (c.ctrl) out.push(mac ? 'Control' : 'Ctrl');
    if (c.mod) out.push(mac ? '⌘' : 'Ctrl');
    if (c.alt) out.push(mac ? 'Option' : 'Alt');
    if (c.shift) out.push('Shift');
    out.push(KEY_NAMES[c.key] || (c.key.length === 1 || /^f\d+$/.test(c.key) ? c.key.toUpperCase() : c.key));
    return c.then ? out.concat(THEN, display(c.then, mac)) : out;
  }

  // Turns single key presses into sequences: after a prefix key (Gmail's "g",
  // Drive's "Alt+C") the next key within a moment completes the sequence. Returns
  // null while waiting for the second key.
  function sequencer(isPrefix, timeoutMs) {
    let pending = null;
    let at = 0;
    const next = (c, now) => {
      if (pending && now - at <= (timeoutMs || 1500)) {
        const first = pending;
        pending = null;
        return sequence(first, c);
      }
      pending = null;
      if (isPrefix(c)) {
        pending = c;
        at = now;
        return null;
      }
      return c;
    };
    next.reset = () => { pending = null; };
    return next;
  }

  QH.keys = {
    THEN, isMac, combo, sequence, fromEvent, isModifierOnly, isTyping, isTextEntry, toId, parse, splitLabel,
    hasModifier, display, sequencer,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = QH.keys;
})(typeof globalThis !== 'undefined' ? globalThis : this);
