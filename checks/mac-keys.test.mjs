// keyFor(), shownFor() and idFor() from lib.mjs: unchanged off a Mac, Google's Mac keys on one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyFor, shownFor, idFor, twoStep } from './lib.mjs';

const WINDOWS = [
  ['Control+Shift+KeyC', 'gmail'], ['Control+Space', 'sheets'], ['Control+ArrowRight', 'youtube'],
  ['Alt+F', 'docs'], ['Control+Alt+M', 'docs'], ['Alt+Enter', 'docs'], ['Shift+Space', 'sheets'],
];

test('off a Mac every helper returns its input', () => {
  for (const [k, site] of WINDOWS) assert.equal(keyFor(k, site, false), k);
  for (const s of ['Ctrl + B', 'Ctrl + Space 다음 Ctrl + B', 'Alt + →']) assert.equal(shownFor(s, 'sheets', false), s);
  for (const i of ['sheets:mod+space', 'sheets:range', 'yt:seek5', null]) assert.equal(idFor(i, false), i);
  for (const k of ['Alt+Shift+Digit5', 'Control+KeyH', 'Control+Home', 'Control+Shift+ArrowRight', 'Control+Alt+KeyK']) assert.equal(keyFor(k, 'docs', false), k);
  assert.deepEqual(twoStep('N', 'H', { mac: false }), ['Control+Alt+KeyN', 'Control+Alt+KeyH']);
  assert.deepEqual(twoStep('T', 'S', { shift: true, mac: false }), ['Control+Alt+Shift+KeyT', 'Control+Alt+Shift+KeyS']);
});

test('Mac: Ctrl is ⌘ and Alt is Option', () => {
  assert.equal(keyFor('Control+Shift+KeyC', 'gmail', true), 'Meta+Shift+KeyC');
  assert.equal(keyFor('Control+A', 'sheets', true), 'Meta+A');
  assert.equal(keyFor('Control+Alt+M', 'docs', true), 'Meta+Alt+M');
  assert.equal(keyFor('Alt+Enter', 'docs', true), 'Alt+Enter');
  assert.equal(keyFor('Alt+Shift+ArrowLeft', 'docs', true), 'Alt+Shift+ArrowLeft');
  assert.equal(keyFor('Shift+Space', 'sheets', true), 'Shift+Space');
  assert.equal(keyFor('Escape', 'sheets', true), 'Escape');
  assert.equal(shownFor('Ctrl + Shift + C', 'gmail', true), '⌘ + Shift + C');
  assert.equal(shownFor('Ctrl + Alt + M', 'docs', true), '⌘ + Option + M');
  assert.equal(shownFor('Ctrl + +', 'docs', true), '⌘ + +');
  assert.equal(idFor('sheets:mod+a', true), 'sheets:mod+a');
  assert.equal(idFor('docs:mod+alt+m', true), 'docs:mod+alt+m');
});

test('Mac: the keys a site moves elsewhere', () => {
  assert.equal(keyFor('Control+Space', 'sheets', true), 'Control+Space');
  assert.equal(shownFor('Ctrl + Space 다음 Ctrl + B', 'sheets', true), 'Control + Space 다음 ⌘ + B');
  assert.equal(idFor('sheets:mod+space', true), 'sheets:ctrl+space');
  assert.equal(idFor('sheets:mod+space>shift+arrowright', true), 'sheets:ctrl+space>shift+arrowright');
  assert.equal(keyFor('Control+Shift+ArrowRight', 'sheets', true), 'Meta+Shift+ArrowRight');
  assert.equal(keyFor('Control+ArrowRight', 'youtube', true), 'Alt+ArrowRight');
  assert.equal(shownFor('Ctrl + ←', 'youtube', true), 'Option + ←');
  assert.equal(keyFor('Alt+F', 'docs', true), 'Control+Alt+F');
  assert.equal(keyFor('Alt+Shift+F', 'sheets', true), 'Control+Alt+F'); // other browsers' Shift is not needed on a Mac
  assert.equal(shownFor('Alt + F', 'slides', true), 'Control + Option + F');
  // Only the editors' menus: elsewhere Alt+letter stays Option+letter.
  assert.equal(keyFor('Alt+F', 'gmail', true), 'Alt+F');
});

test('Mac: Docs keys from the help page (support.google.com/docs/answer/179738, Mac)', () => {
  assert.equal(keyFor('Control+KeyH', 'docs', true), 'Meta+Shift+KeyH'); // find and replace
  assert.equal(keyFor('Control+Shift+KeyF', 'docs', true), 'Control+Shift+KeyF'); // compact mode
  assert.equal(keyFor('Alt+Shift+Digit5', 'docs', true), 'Meta+Shift+KeyX'); // strikethrough
  assert.equal(shownFor('Alt + Shift + 5', 'docs', true), '⌘ + Shift + X');
  assert.equal(keyFor('Control+Backslash', 'docs', true), 'Meta+Backslash');
  assert.equal(keyFor('Control+Space', 'docs', true), 'Meta+Backslash'); // clear formatting
  assert.equal(keyFor('Control+Shift+KeyX', 'docs', true), 'Meta+Shift+Backslash'); // context menu
  assert.equal(keyFor('Control+Shift+ArrowUp', 'docs', true), 'Control+Shift+ArrowUp'); // move paragraph
  assert.equal(keyFor('Control+Home', 'docs', true), 'Meta+ArrowUp');
  assert.equal(keyFor('Control+Shift+End', 'docs', true), 'Meta+Shift+ArrowDown');
  assert.equal(keyFor('Control+ArrowRight', 'docs', true), 'Alt+ArrowRight'); // by word
  assert.equal(keyFor('Control+Shift+ArrowRight', 'docs', true), 'Alt+Shift+ArrowRight');
  assert.equal(keyFor('Control+Alt+KeyK', 'docs', true), 'Control+Meta+KeyK'); // image size
  assert.equal(keyFor('Control+Alt+KeyM', 'docs', true), 'Meta+Alt+KeyM'); // comment: just ⌘ and Option
  assert.equal(keyFor('Control+Alt+Shift+KeyA', 'docs', true), 'Meta+Alt+Shift+KeyA');
  assert.equal(keyFor('Home', 'docs', true), 'Home'); // Fn+← on a Mac keyboard
  assert.equal(keyFor('Alt+Shift+KeyZ', 'docs', true), 'Control+Alt+KeyZ'); // tool search
  assert.equal(shownFor('Ctrl + Alt + N, H', 'docs', true), 'Control + ⌘ + N, H');
  assert.deepEqual(twoStep('N', 'H', { mac: true }), ['Control+Meta+KeyN', 'Control+Meta+KeyH']);
  assert.equal(keyFor('Control+Meta+KeyN', 'docs', true), 'Control+Meta+KeyN'); // already a Mac key
  // Sheets keeps ⌘ with arrows and Home (data edge, start of the sheet).
  assert.equal(keyFor('Control+ArrowRight', 'sheets', true), 'Meta+ArrowRight');
  assert.equal(keyFor('Control+Home', 'sheets', true), 'Meta+Home');
});
