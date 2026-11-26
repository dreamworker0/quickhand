const test = require('node:test');
const assert = require('node:assert/strict');
const { siteEnv, Element, event } = require('./helpers/browser-env.cjs');

// The action a key counts as; a key Calendar ignores there (marked `ignored`) counts as nothing.
const press = (site, code, key, patch, mac = false) => {
  const found = site.fromKey(event(code, key, patch), mac);
  return found && !found.ignored ? found.id : null;
};
// Why a known key does nothing there (the note shown instead), or null.
const why = (site, code, key, patch) => site.fromKey(event(code, key, patch), false)?.ignored ?? null;

test('Calendar: every help-page shortcut is counted', () => {
  const { site, ctx } = siteEnv('calendar');
  const keys = [
    ['KeyJ', 'j', 'next'], ['KeyN', 'n', 'next'], ['KeyT', 't', 'today'],
    ['Slash', '/', 'search'], ['KeyS', 's', 'settings'], ['KeyG', 'g', 'goto'],
    ['Digit1', '1', 'day'], ['KeyD', 'd', 'day'], ['Digit2', '2', 'week'], ['KeyW', 'w', 'week'],
    ['Digit3', '3', 'month'], ['KeyM', 'm', 'month'], ['Digit4', '4', 'custom'], ['KeyX', 'x', 'custom'],
    ['Digit5', '5', 'schedule'], ['KeyA', 'a', 'schedule'],
    ['KeyC', 'c', 'create'], ['KeyZ', 'z', 'undo'],
  ];
  for (const [code, key, id] of keys) assert.equal(press(site, code, key), 'calendar:' + id, code);
  // e and Delete act on the event whose window is open.
  ctx.document.querySelectorAll = (sel) => (sel === '[role="dialog"]' ? [{ getClientRects: () => [{}] }] : []);
  for (const [code, key, id] of [['KeyE', 'e', 'edit'], ['Backspace', 'Backspace', 'remove'], ['Delete', 'Delete', 'remove']]) assert.equal(press(site, code, key), 'calendar:' + id, code);
  ctx.document.querySelectorAll = () => [];
  assert.equal(press(site, 'Equal', '+', { shiftKey: true }), 'calendar:people');
  assert.equal(press(site, 'NumpadAdd', '+'), 'calendar:people');
  assert.equal(press(site, 'Slash', '?', { shiftKey: true }), 'calendar:help');
  assert.equal(press(site, 'KeyS', 's', { ctrlKey: true }), null); // nothing to save on the grid
  ctx.location.pathname = '/calendar/u/0/r/eventedit/abc123';
  assert.equal(press(site, 'KeyS', 's', { ctrlKey: true }), 'calendar:save');
  ctx.location.pathname = '/calendar/u/0/r/week';
  assert.equal(press(site, 'Period', '.', { ctrlKey: true, altKey: true }), 'calendar:sidePanel');
  assert.equal(press(site, 'Comma', ',', { ctrlKey: true, altKey: true }), 'calendar:sidePanel');
});

test('Calendar: keys count only where Calendar acts on them', () => {
  const { site, ctx } = siteEnv('calendar');
  const open = (shown) => { ctx.document.querySelectorAll = (sel) => (sel === '[role="dialog"]' ? [{ getClientRects: () => (shown ? [{}] : []) }] : []); };
  // No event window: e and Delete have nothing to act on.
  open(false);
  assert.equal(press(site, 'KeyE', 'e'), null);
  assert.equal(press(site, 'Delete', 'Delete'), null);
  assert.equal(press(site, 'KeyJ', 'j'), 'calendar:next');
  // An event's window open: the grid keys do nothing.
  open(true);
  for (const [code, key] of [['KeyJ', 'j'], ['KeyK', 'k'], ['KeyT', 't'], ['KeyC', 'c'], ['KeyW', 'w'], ['Digit3', '3']]) assert.equal(press(site, code, key), null, key);
  assert.equal(press(site, 'KeyE', 'e'), 'calendar:edit');
  // The event page: moving between periods does nothing; c starts another event.
  open(false);
  ctx.location.pathname = '/calendar/u/0/r/eventedit/abc123';
  assert.equal(press(site, 'KeyJ', 'j'), null);
  assert.equal(press(site, 'KeyC', 'c'), 'calendar:create');
});

test('Calendar: keys from its own ? list that the help page leaves out', () => {
  const { site, ctx } = siteEnv('calendar');
  for (const [code, key, patch, id] of [
    ['KeyK', 'k', {}, 'prev'], ['KeyP', 'p', {}, 'prev'], ['Digit6', '6', {}, 'year'], ['KeyY', 'y', {}, 'year'],
    ['KeyQ', 'q', {}, 'allDay'], ['KeyC', 'C', { shiftKey: true }, 'quickCreate'],
    ['Slash', '/', { ctrlKey: true }, 'help'], ['KeyZ', 'z', { ctrlKey: true }, 'undo'], ['KeyP', 'p', { ctrlKey: true }, 'print'],
  ]) assert.equal(press(site, code, key, patch), 'calendar:' + id, code);
  // Ctrl+Enter saves only on the full event page; Ctrl+Z in a text box is the box's own undo.
  ctx.location.pathname = '/calendar/u/0/r/week';
  assert.equal(press(site, 'Enter', 'Enter', { ctrlKey: true }), null);
  ctx.location.pathname = '/calendar/u/0/r/eventedit/abc123';
  assert.equal(press(site, 'Enter', 'Enter', { ctrlKey: true, target: new Element({ typing: true }) }), 'calendar:save');
  assert.equal(press(site, 'KeyZ', 'z', { ctrlKey: true, target: new Element({ typing: true }) }), null);
  // Help-page "r" does nothing in Calendar any more, so it is not counted.
  assert.equal(press(site, 'KeyR', 'r'), null);
});

test('Calendar: Mac uses Command for save and Command+Option for the side panel', () => {
  const { site, ctx } = siteEnv('calendar');
  ctx.location.pathname = '/calendar/u/0/r/eventedit/abc123';
  assert.equal(press(site, 'KeyS', 's', { metaKey: true }, true), 'calendar:save');
  assert.equal(press(site, 'Period', '≥', { metaKey: true, altKey: true }, true), 'calendar:sidePanel');
  assert.equal(press(site, 'KeyS', 's', { ctrlKey: true }, true), null);
});

test('Calendar: Esc counts only on the full event page, even from its title box', () => {
  const { site, ctx } = siteEnv('calendar');
  ctx.location.pathname = '/calendar/u/0/r/week';
  assert.equal(press(site, 'Escape', 'Escape'), null);
  ctx.location.pathname = '/calendar/u/0/r/eventedit/abc123';
  assert.equal(press(site, 'Escape', 'Escape'), 'calendar:back');
  assert.equal(press(site, 'Escape', 'Escape', { target: new Element({ typing: true }) }), 'calendar:back');
  assert.equal(press(site, 'Escape', 'Escape', { shiftKey: true }), null);
  // Right after the page opens the focus is on its X button, where Calendar ignores Esc.
  assert.equal(press(site, 'Escape', 'Escape', { target: new Element({ 'aria-label': '일정 변경 취소' }) }), null);
});

test('Calendar: typed text and other Shift keys are not shortcuts', () => {
  const { site } = siteEnv('calendar');
  const target = new Element({ typing: true });
  for (const [code, key, patch] of [['KeyR', 'r'], ['KeyG', 'g'], ['Equal', '+', { shiftKey: true }], ['Slash', '?', { shiftKey: true }], ['NumpadAdd', '+']]) {
    assert.equal(press(site, code, key, { ...patch, target }), null, code);
  }
  assert.equal(press(site, 'KeyR', 'R', { shiftKey: true }), null);
  assert.equal(press(site, 'Equal', '=', {}), null);
  assert.equal(press(site, 'Period', '.', { altKey: true }), null);
});

test('Calendar: each new action suggests the key as the help page prints it', () => {
  const { site, ctx } = siteEnv('calendar');
  const shown = (code, key, patch) => [...site.fromKey(event(code, key, patch), false).combos].map(ctx.QH.keys.toId);
  assert.deepEqual(shown('KeyG', 'g'), ['g']);
  assert.deepEqual(shown('Equal', '+', { shiftKey: true }), ['+']);
  assert.deepEqual(shown('Slash', '?', { shiftKey: true }), ['?', 'mod+/']);
  assert.deepEqual(shown('Period', '.', { ctrlKey: true, altKey: true }), ['mod+alt+.', 'mod+alt+,']);
});

// A clicked element with its own ancestors: `parents` maps a selector piece to the element found.
class Node extends Element {
  constructor(attrs, text, parents = {}) {
    super(attrs, text);
    this.parents = parents;
  }
  closest(selector) {
    for (const [piece, el] of Object.entries(this.parents)) if (selector.includes(piece)) return el;
    return null;
  }
}
const click = (site, target) => site.fromMouse({ target }, false)?.id ?? null;

test('Calendar: clicks that match the new shortcuts', () => {
  const { site, ctx } = siteEnv('calendar');
  const people = new Node({ 'aria-label': '사용자 검색' });
  people.parents = { input: people };
  assert.equal(click(site, people), 'calendar:people');
  const other = new Node({ 'aria-label': '검색' });
  other.parents = { input: other };
  assert.equal(click(site, other), null);

  const panel = new Node({ role: 'complementary', 'aria-label': '측면 패널' });
  const tab = new Node({ role: 'tab', 'aria-label': 'Keep' }, '', { '[role="complementary"]': panel });
  tab.parents.button = tab;
  assert.equal(click(site, tab), null); // opens that app; Ctrl+Alt+. only moves the focus
  const elsewhere = new Node({ role: 'tab', 'aria-label': '일반' });
  elsewhere.parents = { button: elsewhere };
  assert.equal(click(site, elsewhere), null);

  const help = new Node({ role: 'menuitem' }, '키보드 단축키');
  help.parents = { button: help };
  assert.equal(click(site, help), 'calendar:help');

  const close = new Node({ 'aria-label': '닫기' });
  close.parents = { button: close };
  ctx.location.pathname = '/calendar/u/0/r/week';
  assert.equal(click(site, close), null);
  ctx.location.pathname = '/calendar/u/0/r/eventedit/abc123';
  assert.equal(click(site, close), 'calendar:back');
  const discard = new Node({ 'aria-label': '일정 변경 취소' });
  discard.parents = { button: discard };
  assert.equal(click(site, discard), 'calendar:back');

  const quick = new Node({ role: 'menuitem' }, '일정');
  quick.parents = { button: quick };
  assert.equal(click(site, quick), 'calendar:quickCreate');

  const print = new Node({ role: 'menuitem' }, '인쇄');
  print.parents = { button: print };
  assert.equal(click(site, print), 'calendar:print');
});

test('Calendar: the search results page counts only the keys it takes', () => {
  // Checked in a real Calendar (checks/calendar-search.mjs): s, the view keys, moving
  // between periods, q, g and + do nothing on /r/search; c, Shift+C, ?, / and Esc work.
  const { site, ctx } = siteEnv('calendar');
  ctx.document.querySelectorAll = () => [];
  ctx.location.pathname = '/calendar/u/0/r/search';
  for (const [code, key] of [['KeyS', 's'], ['KeyT', 't'], ['KeyJ', 'j'], ['KeyK', 'k'], ['KeyW', 'w'], ['Digit3', '3'], ['KeyA', 'a'], ['KeyQ', 'q'], ['KeyG', 'g'], ['NumpadAdd', '+']]) {
    assert.equal(press(site, code, key), null, key);
  }
  assert.equal(press(site, 'Equal', '+', { shiftKey: true }), null);
  assert.equal(press(site, 'KeyC', 'c'), 'calendar:create');
  assert.equal(press(site, 'KeyC', 'C', { shiftKey: true }), 'calendar:quickCreate');
  assert.equal(press(site, 'Slash', '?', { shiftKey: true }), 'calendar:help');
  assert.equal(press(site, 'Slash', '/', { ctrlKey: true }), 'calendar:help');
  assert.equal(press(site, 'Slash', '/'), 'calendar:search');
  assert.equal(press(site, 'Escape', 'Escape'), 'calendar:back');
  // Esc with the shortcut list open only closes that window.
  ctx.document.querySelectorAll = (sel) => (sel === '[role="dialog"]' ? [{ getClientRects: () => [{}] }] : []);
  assert.equal(press(site, 'Escape', 'Escape'), null);
  // Back on the calendar the same keys count again.
  ctx.document.querySelectorAll = () => [];
  ctx.location.pathname = '/calendar/u/0/r/week';
  assert.equal(press(site, 'KeyS', 's'), 'calendar:settings');
  assert.equal(press(site, 'Escape', 'Escape'), null);
});

test('Calendar: on the search results page a click is not hinted with a key that does nothing there', () => {
  const { site, ctx } = siteEnv('calendar');
  const people = new Node({ 'aria-label': '사용자 검색' });
  people.parents = { input: people };
  ctx.location.pathname = '/calendar/u/0/r/search';
  assert.equal(site.fromMouse({ target: people }, false).quiet, true);
  const help = new Node({ role: 'menuitem' }, '키보드 단축키');
  help.parents = { button: help };
  assert.equal(click(site, help), 'calendar:help');
  ctx.location.pathname = '/calendar/u/0/r/week';
  assert.equal(click(site, people), 'calendar:people');
});

test('Calendar: a key counts only once the page shows it did something', async () => {
  const { site, ctx } = siteEnv('calendar');
  const focus = {};
  ctx.document.activeElement = focus;
  ctx.document.title = 'Google 캘린더 - 검색';
  ctx.location.href = 'https://calendar.google.com/calendar/u/0/r/search?q=a';
  // Nothing changes (s on the search page): no.
  const t0 = Date.now();
  assert.equal(await site.confirmKey(), false);
  assert.ok(Date.now() - t0 >= 1400);
  // The address changes (s opens the settings): yes, without waiting it out.
  let pending = site.confirmKey();
  setTimeout(() => { ctx.location.href = 'https://calendar.google.com/calendar/u/0/r/settings'; }, 150);
  const t1 = Date.now();
  assert.equal(await pending, true);
  assert.ok(Date.now() - t1 < 1000);
  // Only the focus moves (/ to the search box): yes.
  pending = site.confirmKey();
  setTimeout(() => { ctx.document.activeElement = {}; }, 150);
  assert.equal(await pending, true);
  // A spoken status changes (z: "실행취소되었습니다."): yes.
  const live = { textContent: '로드됨' };
  ctx.document.querySelectorAll = (sel) => (sel.includes('aria-live') ? [live] : []);
  pending = site.confirmKey();
  setTimeout(() => { live.textContent = '로드됨 / 실행취소되었습니다.'; }, 150);
  assert.equal(await pending, true);
});

test('Calendar: a key that does nothing here says why instead of counting', () => {
  const { site, ctx } = siteEnv('calendar');
  const open = (shown) => { ctx.document.querySelectorAll = (sel) => (sel === '[role="dialog"]' ? [{ getClientRects: () => (shown ? [{}] : []) }] : []); };
  open(false);
  ctx.location.pathname = '/calendar/u/0/r/search';
  assert.equal(why(site, 'KeyS', 's'), 'search');
  assert.equal(why(site, 'KeyW', 'w'), 'search');
  assert.equal(why(site, 'Equal', '+', { shiftKey: true }), 'search');
  assert.equal(why(site, 'KeyC', 'c'), null); // works there
  ctx.location.pathname = '/calendar/u/0/r/week';
  assert.equal(why(site, 'KeyS', 's'), null);
  assert.equal(why(site, 'KeyE', 'e'), 'needEvent');
  // Delete and Backspace with nothing open stay silent: easy to press by accident.
  assert.equal(site.fromKey(event('Delete', 'Delete'), false), null);
  assert.equal(site.fromKey(event('Backspace', 'Backspace'), false), null);
  open(true);
  assert.equal(why(site, 'KeyJ', 'j'), 'window');
  assert.equal(why(site, 'KeyE', 'e'), null);
  open(false);
  ctx.location.pathname = '/calendar/u/0/r/eventedit/abc123';
  assert.equal(why(site, 'KeyJ', 'j'), 'eventPage');
  assert.equal(why(site, 'KeyC', 'c'), null);
  // Typing is never a shortcut, ignored or not.
  ctx.location.pathname = '/calendar/u/0/r/search';
  assert.equal(site.fromKey(event('KeyS', 's', { target: new Element({ typing: true }) }), false), null);
});
