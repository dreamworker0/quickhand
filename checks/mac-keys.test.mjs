// keyFor(), shownFor() and idFor() from lib.mjs: unchanged off a Mac, Google's Mac keys on one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyFor, shownFor, idFor } from './lib.mjs';

const WINDOWS = [
  ['Control+Shift+KeyC', 'gmail'], ['Control+Space', 'sheets'], ['Control+ArrowRight', 'youtube'],
  ['Alt+F', 'docs'], ['Control+Alt+M', 'docs'], ['Alt+Enter', 'docs'], ['Shift+Space', 'sheets'],
];

test('off a Mac every helper returns its input', () => {
  for (const [k, site] of WINDOWS) assert.equal(keyFor(k, site, false), k);
  for (const s of ['Ctrl + B', 'Ctrl + Space 다음 Ctrl + B', 'Alt + →']) assert.equal(shownFor(s, 'sheets', false), s);
  for (const i of ['sheets:mod+space', 'sheets:range', 'yt:seek5', null]) assert.equal(idFor(i, false), i);
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
  assert.equal(keyFor('Alt+Shift+F', 'sheets', true), 'Control+Alt+Shift+F');
  assert.equal(shownFor('Alt + F', 'slides', true), 'Control + Option + F');
  // Only the editors' menus: elsewhere Alt+letter stays Option+letter.
  assert.equal(keyFor('Alt+F', 'gmail', true), 'Alt+F');
});
