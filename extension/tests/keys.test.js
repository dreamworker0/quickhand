const test = require('node:test');
const assert = require('node:assert/strict');
const keys = require('../src/core/keys.js');

test('parses Docs tooltip shortcuts on Windows', () => {
  assert.equal(keys.toId(keys.parse('Ctrl+B', false)), 'mod+b');
  assert.equal(keys.toId(keys.parse('Ctrl+Shift+8', false)), 'mod+shift+8');
  assert.equal(keys.toId(keys.parse('Ctrl+\\', false)), 'mod+\\');
  assert.equal(keys.toId(keys.parse('Ctrl + Alt + M', false)), 'mod+alt+m');
});

test('parses Mac symbol shortcuts to the same ids', () => {
  assert.equal(keys.toId(keys.parse('⌘B', true)), 'mod+b');
  assert.equal(keys.toId(keys.parse('⌘⇧7', true)), 'mod+shift+7');
  assert.equal(keys.toId(keys.parse('⌘⌥M', true)), 'mod+alt+m');
});

test('parses aria-keyshortcuts and takes the first alternative', () => {
  assert.equal(keys.toId(keys.parse('Control+B', false)), 'mod+b');
  assert.equal(keys.toId(keys.parse('Meta+B', true)), 'mod+b');
  assert.equal(keys.toId(keys.parse('Ctrl+Y 또는 Ctrl+Shift+Z', false)), 'mod+y');
  assert.equal(keys.toId(keys.parse('Ctrl+Y or Ctrl+Shift+Z', false)), 'mod+y');
});

test('parses the Sheets "Ctrl + J" spacing and Korean menu text', () => {
  assert.equal(keys.toId(keys.parse('Ctrl + J', false)), 'mod+j');
  assert.equal(keys.toId(keys.parse('Ctrl+Alt+Shift+B', false)), 'mod+alt+shift+b');
});

test('reads Gmail tooltips: hyphen separators and hidden direction marks', () => {
  const tip = keys.splitLabel('굵게 ‪(Ctrl-B)‬');
  assert.equal(tip.label, '굵게');
  assert.equal(keys.toId(keys.parse(tip.shortcut, false)), 'mod+b');
  assert.equal(keys.toId(keys.parse('Ctrl-Shift-7', false)), 'mod+shift+7');
  assert.equal(keys.toId(keys.parse('Ctrl-Shift--, Ctrl-Shift-+', false)), 'mod+shift+-');
  assert.equal(keys.toId(keys.parse('Ctrl-Shift-+', false)), 'mod+shift+=');
  assert.equal(keys.toId(keys.parse('Ctrl-\\', false)), 'mod+\\');
});

test('reads Drive sequences in Korean and English', () => {
  assert.equal(keys.toId(keys.parse('Alt+C 다음 F', false)), 'alt+c>f');
  assert.equal(keys.toId(keys.parse('Alt+V then L', false)), 'alt+v>l');
  const tip = keys.splitLabel('목록 레이아웃(Alt+V 다음 L)');
  assert.equal(tip.label, '목록 레이아웃');
  assert.deepEqual(keys.display(keys.parse(tip.shortcut, false), false), ['Alt', 'V', '→', 'L']);
});

test('splits names from menu access letters', () => {
  assert.deepEqual(keys.splitLabel('실행취소(U)'), { label: '실행취소', shortcut: 'U' });
  assert.deepEqual(keys.splitLabel('인쇄 (Ctrl+P)'), { label: '인쇄', shortcut: 'Ctrl+P' });
});

test('joins a prefix key and the next key into one sequence', () => {
  const next = keys.sequencer((c) => !keys.hasModifier(c) && c.key === 'g');
  assert.equal(next(keys.combo('g'), 0), null);
  assert.equal(keys.toId(next(keys.combo('i'), 500)), 'g>i');
  assert.equal(keys.toId(next(keys.combo('e'), 600)), 'e');
  assert.equal(next(keys.combo('g'), 1000), null);
  assert.equal(keys.toId(next(keys.combo('i'), 4000)), 'i'); // too late: plain key
});

test('rejects text without a key', () => {
  assert.equal(keys.parse('', false), null);
  assert.equal(keys.parse('Ctrl+', false), null);
});

test('reads the physical key so a Korean IME does not change the combo', () => {
  const e = { code: 'KeyB', key: 'ㅠ', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
  assert.equal(keys.toId(keys.fromEvent(e, false)), 'mod+b');
  const mac = { code: 'Digit7', key: '&', ctrlKey: false, metaKey: true, altKey: false, shiftKey: true };
  assert.equal(keys.toId(keys.fromEvent(mac, true)), 'mod+shift+7');
});

test('formats keys for each platform', () => {
  assert.deepEqual(keys.display(keys.parse('Ctrl+Shift+8', false), false), ['Ctrl', 'Shift', '8']);
  assert.deepEqual(keys.display(keys.parse('⌘B', true), true), ['⌘', 'B']);
  assert.deepEqual(keys.display(keys.combo('space'), false), ['Space']);
  assert.deepEqual(keys.display(keys.parse('Ctrl+F5', false), false), ['Ctrl', 'F5']);
  assert.equal(keys.toId(keys.fromEvent({ code: 'F5', key: 'F5', ctrlKey: true }, false)), 'mod+f5');
});

test('detects platforms', () => {
  assert.equal(keys.isMac({ platform: 'MacIntel' }), true);
  assert.equal(keys.isMac({ userAgentData: { platform: 'Windows' } }), false);
  assert.equal(keys.isMac({ platform: 'Linux x86_64' }), false);
});

test('arrow symbols in tooltips match the keys a key press reports', () => {
  const clicked = keys.parse('Alt+→', false);
  const pressed = keys.fromEvent({ code: 'ArrowRight', key: 'ArrowRight', altKey: true }, false);
  assert.equal(keys.toId(clicked), 'alt+arrowright');
  assert.equal(keys.toId(clicked), keys.toId(pressed));
  assert.deepEqual(keys.display(clicked, false), ['Alt', '→']);
  assert.equal(keys.toId(keys.parse('Shift+↓', false)), 'shift+arrowdown');
});

test('comma keys are not mistaken for alternative separators', () => {
  assert.equal(keys.toId(keys.parse('Ctrl+,', false)), 'mod+,');
  assert.equal(keys.toId(keys.parse('Ctrl+Shift+,', false)), 'mod+shift+,');
  assert.equal(keys.toId(keys.parse('Ctrl+Y,Ctrl+Shift+Z', false)), 'mod+y');
  assert.equal(keys.toId(keys.parse('Ctrl+,, Ctrl+.', false)), 'mod+,');
  assert.equal(keys.toId(keys.parse('Ctrl-Shift-,', false)), 'mod+shift+,');
  assert.equal(keys.toId(keys.parse('⌘⇧,', true)), 'mod+shift+,');
  assert.equal(keys.toId(keys.parse('⌘⇧,, ⌘⇧.', true)), 'mod+shift+,');
});

test('shifted punctuation printed by the page matches physical keyboard IDs', () => {
  for (const [text, code, key] of [['Ctrl+Shift+>', 'Period', '>'], ['Ctrl+Shift+<', 'Comma', '<'], ['Ctrl+Shift++', 'Equal', '+']]) {
    const pressed = keys.fromEvent({ code, key, ctrlKey: true, shiftKey: true }, false);
    assert.equal(keys.toId(keys.parse(text, false)), keys.toId(pressed));
  }
});

test('Home and End are shown with their key names', () => {
  assert.deepEqual(keys.display(keys.combo('home'), false), ['Home']);
  assert.deepEqual(keys.display(keys.combo('end'), false), ['End']);
});

test('reads two combos side by side as a two-step key, but not spaced-out single combos', () => {
  const K = require('../src/core/keys.js');
  assert.equal(K.toId(K.parse('Ctrl+Alt+Shift+W Ctrl+Alt+Shift+M', false)), 'mod+alt+shift+w>mod+alt+shift+m');
  assert.equal(K.toId(K.parse('Ctrl + Shift + B', false)), 'mod+shift+b');
  assert.equal(K.toId(K.parse('Ctrl+B', false)), 'mod+b');
});

test('Korean Mac tooltips: "⌘+옵션+X" is Command+Option+X', () => {
  const K = keys;
  const c = K.parse('⌘+옵션+X', true);
  assert.equal(K.toId(c), 'mod+alt+x');
  assert.deepEqual(K.display(c, true), ['⌘', 'Option', 'X']);
  assert.equal(K.toId(K.parse('⌘+옵션+Shift+W ⌘+옵션+Shift+E', true)), 'mod+alt+shift+w>mod+alt+shift+e');
  assert.equal(K.toId(K.parse('Ctrl+Alt+X', false)), 'mod+alt+x');
});
