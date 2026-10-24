const test = require('node:test');
const assert = require('node:assert/strict');
const { siteEnv, Element, event } = require('./helpers/browser-env.cjs');

for (const id of ['docs', 'sheets', 'slides', 'gmail', 'drive']) {
  test(id + ': typing, IME and unknown modifier combinations are not recorded', () => {
    const { site } = siteEnv(id);
    const target = new Element({ typing: true });
    assert.equal(site.fromKey(event('KeyE', 'Dead', { altKey: true, target }), true), null);
    assert.equal(site.fromKey(event('KeyQ', '@', { ctrlKey: true, altKey: true, target, getModifierState: (k) => k === 'AltGraph' }), false), null);
    assert.equal(site.fromKey(event('KeyB', 'Process', { ctrlKey: true, isComposing: true, target }), false), null);
    assert.equal(site.fromKey(event('KeyQ', 'q', { ctrlKey: true }), false), null);
    assert.ok(site.fromKey(event('KeyB', 'ㅠ', { ctrlKey: true, target }), false));
  });
}

test('all sites ignore IME composition, including non-editable targets', () => {
  for (const id of ['youtube', 'calendar', 'gmail', 'drive', 'docs']) {
    const { site } = siteEnv(id);
    assert.equal(site.fromKey(event('KeyC', 'Process', { isComposing: true }), false), null, id);
  }
});

test('keyboard-generated click is not recorded as mouse, real mouse still is', () => {
  const env = siteEnv('calendar');
  env.site.fromMouse = () => ({ id: 'calendar:today', label: '오늘', combos: [env.ctx.QH.keys.combo('t')] });
  env.start();
  env.listeners.click({ button: 0, isTrusted: true, detail: 0 });
  assert.equal(env.messages.length, 0);
  env.listeners.click({ button: 0, isTrusted: true, detail: 1 });
  assert.equal(env.messages.length, 1);
});

test('Mac fallback slide duplicate matches Command+D, while printed Control stays Control', () => {
  const { site } = siteEnv('slides');
  const clicked = site.fromMouse({ target: new Element({ control: true, 'aria-label': '슬라이드 복사' }) }, true);
  const keyed = site.fromKey(event('KeyD', 'd', { metaKey: true }), true);
  assert.equal(clicked.id, keyed.id);
  const printed = site.fromMouse({ target: new Element({ control: true, 'aria-label': '특별 동작 (Control+D)' }) }, true);
  assert.equal(printed.id, 'slides:ctrl+d');
});

test('Mac Drive Control+V then D completes the same ID as the displayed shortcut', () => {
  const { site, ctx } = siteEnv('drive');
  const clicked = site.fromMouse({ target: new Element({ control: true, 'aria-label': '세부정보 보기 (Control+V 다음 D)' }) }, true);
  assert.equal(site.fromKey(event('KeyV', 'v', { ctrlKey: true }), true), null);
  const keyed = site.fromKey(event('KeyD', 'd', { ctrlKey: true }), true);
  assert.equal(keyed.id, clicked.id);
  assert.equal(ctx.QH.keys.toId(keyed.combos[0]), 'ctrl+v>d');
});

test('page-discovered editing shortcuts remain learnable without recording unknown keys', () => {
  const { site } = siteEnv('docs');
  const target = new Element({ control: true, 'aria-label': '특별 서식 (Ctrl+Shift+Q)' });
  const clicked = site.fromMouse({ target }, false);
  const keyed = site.fromKey(event('KeyQ', 'q', { ctrlKey: true, shiftKey: true }), false);
  assert.equal(keyed.id, clicked.id);
  assert.equal(keyed.label, clicked.label);
});

test('Drive typing copy/paste does not prime a file duplication sequence', () => {
  const { site } = siteEnv('drive');
  const target = new Element({ typing: true });
  site.fromKey(event('KeyC', 'c', { ctrlKey: true, target }), false);
  const pasted = site.fromKey(event('KeyV', 'v', { ctrlKey: true, target }), false);
  assert.equal(pasted.id, 'drive:mod+v');
});

test('Mac non-character Option shortcuts remain valid while editing', () => {
  const { site } = siteEnv('sheets');
  const target = new Element({ typing: true });
  const found = site.fromKey(event('ArrowDown', 'ArrowDown', { altKey: true, target }), true);
  assert.equal(found?.id, 'sheets:alt+arrowdown');
});

test('Gmail and Drive normal two-step shortcuts still work', () => {
  const gmail = siteEnv('gmail').site;
  assert.equal(gmail.fromKey(event('KeyG', 'g'), false), null);
  assert.equal(gmail.fromKey(event('KeyI', 'i'), false).id, 'gmail:inbox');
  const drive = siteEnv('drive').site;
  assert.equal(drive.fromKey(event('KeyC', 'c', { altKey: true }), false), null);
  assert.equal(drive.fromKey(event('KeyF', 'f', { altKey: true }), false).id, 'drive:alt+c>f');
});

test('Gmail and Drive preserve names learned from page shortcut labels', () => {
  for (const id of ['gmail', 'drive']) {
    const { site } = siteEnv(id);
    const clicked = site.fromMouse({ target: new Element({ control: true, 'data-tooltip': '특별 서식 (Ctrl+Shift+Q)' }) }, false);
    const keyed = site.fromKey(event('KeyQ', 'q', { ctrlKey: true, shiftKey: true }), false);
    assert.equal(keyed.id, clicked.id);
    assert.equal(keyed.label, '특별 서식');
  }
});

test('Sheets recognizes range-prefixed row and column deletion menu labels', () => {
  const { site } = siteEnv('sheets');
  for (const label of ['F - I열 삭제', 'F열 삭제', 'AA~AD열 삭제', 'F – I열 삭제', '3 - 6행 삭제', '3행 삭제', '열 삭제', '행 3 삭제', 'Delete columns F - I']) {
    const clicked = site.fromMouse({ target: new Element({ control: true }, label) }, false);
    assert.equal(clicked?.id, 'sheets:mod+alt+-', label);
    const keyed = site.fromKey(event('Minus', '-', { ctrlKey: true, altKey: true }), false);
    assert.equal(clicked.id, keyed.id, label);
  }
});

test('Sheets does not confuse clearing column data with deleting columns', () => {
  const { site } = siteEnv('sheets');
  for (const label of ['F - I열 데이터 삭제', '열 데이터 삭제', '3 - 6행 데이터 삭제', 'Delete column data']) {
    assert.equal(site.fromMouse({ target: new Element({ control: true }, label) }, false), null, label);
  }
});

test('Sheets recognizes range-prefixed hiding without matching unhide or resize', () => {
  const { site } = siteEnv('sheets');
  for (const [label, id] of [['F - I열 숨기기', 'sheets:mod+alt+0'], ['F열 숨기기', 'sheets:mod+alt+0'], ['3 - 6행 숨기기', 'sheets:mod+alt+9']]) {
    assert.equal(site.fromMouse({ target: new Element({ control: true }, label) }, false)?.id, id, label);
  }
  for (const label of ['F - I열 데이터 삭제', 'F~I열 크기 조절', 'F - I열 숨기기 해제']) {
    assert.equal(site.fromMouse({ target: new Element({ control: true }, label) }, false), null, label);
  }
});

test('Sheets menu items whose shown shortcut is a function key are recognized (Insert › Sheet, Note)', () => {
  const { site } = siteEnv('sheets');
  for (const [label, id, code] of [['시트 (Shift+F11)', 'sheets:shift+f11', 'F11'], ['메모 (Shift+F2)', 'sheets:shift+f2', 'F2']]) {
    const clicked = site.fromMouse({ target: new Element({ control: true, 'aria-label': label }) }, false);
    assert.ok(clicked, label);
    assert.equal(clicked.id, id);
    const keyed = site.fromKey(event(code, code, { shiftKey: true }), false);
    assert.equal(keyed.id, clicked.id, label + ' by keyboard');
  }
});

test('a shown Shift+letter is still not taken for a shortcut (that is typing)', () => {
  const { site } = siteEnv('sheets');
  assert.equal(site.fromMouse({ target: new Element({ control: true, 'aria-label': '무언가 (Shift+A)' }) }, false), null);
});

// Sheets header strips as measured on the real page: column letters along the
// top (from x=0), row numbers down the side (from y=142); they overlap in the
// top-left corner.
function sheetsWithHeaders(platform = 'Win32') {
  const env = siteEnv('sheets');
  env.ctx.navigator.platform = platform;
  const rect = (left, top, width, height) => ({ getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + height, width, height }) });
  env.ctx.document.querySelectorAll = (sel) =>
    sel === '.column-headers-background' ? [rect(0, 142, 1088, 24)] : sel === '.row-headers-background' ? [rect(0, 142, 46, 708)] : [];
  const click = (x, y, upX = x, upY = y) => {
    const target = new Element({ control: true });
    env.listeners.mousedown({ target, button: 0, clientX: x, clientY: y });
    return env.site.fromMouse({ target, button: 0, clientX: upX, clientY: upY }, platform === 'MacIntel');
  };
  return { ...env, click };
}

test('Sheets: clicking a column letter hints Ctrl+Space, a row number Shift+Space', () => {
  const { click } = sheetsWithHeaders();
  const column = click(300, 150);
  assert.equal(column.id, 'sheets:mod+space');
  assert.equal(column.label, '열 선택');
  const row = click(20, 400);
  assert.equal(row.id, 'sheets:shift+space');
  assert.equal(row.label, '행 선택');
});

test('Sheets: dragging a header (resize or move) and the top-left corner are not column/row selects', () => {
  const { click } = sheetsWithHeaders();
  assert.equal(click(300, 150, 340, 150), null);
  assert.equal(click(20, 150), null);
  assert.equal(click(500, 500), null);
});

test('Sheets: Shift+Space counts as row select only when a whole row ends up selected', async () => {
  const { site, ctx } = siteEnv('sheets');
  ctx.setTimeout = (fn) => fn();
  let nameBox = '3:3';
  ctx.document.querySelector = (sel) => (sel.includes('name-box') ? { value: nameBox } : null);
  // Whichever element Sheets sends the key to, the name box shows the result.
  const selecting = await site.fromKey(event('Space', ' ', { shiftKey: true }), false);
  assert.equal(selecting.id, 'sheets:shift+space');
  assert.equal(selecting.label, '행 선택');
  nameBox = 'B4'; // typing a space inside a cell leaves the cell selected
  assert.equal(await site.fromKey(event('Space', ' ', { shiftKey: true }), false), null);
  assert.equal(site.fromKey(event('Space', ' ', { ctrlKey: true }), false).id, 'sheets:mod+space');
});

test('Sheets on Mac: the column header and the key are both Control+Space', () => {
  const { click, site } = sheetsWithHeaders('MacIntel');
  const clicked = click(300, 150);
  const keyed = site.fromKey(event('Space', ' ', { ctrlKey: true }), true);
  assert.equal(clicked.id, 'sheets:ctrl+space');
  assert.equal(keyed.id, clicked.id);
});

// A page element that sits inside the given selectors (and nothing else).
class In extends Element {
  constructor(...selectors) {
    super();
    this.selectors = selectors;
  }
  closest(sel) {
    return sel.split(',').some((s) => this.selectors.includes(s.trim())) ? this : null;
  }
  matches() { return false; }
}

test('YouTube: chapter, frame, start/end, volume and number keys are counted', () => {
  const { site } = siteEnv('youtube');
  const inPlayer = new In('#movie_player');
  const id = (code, key, patch) => { const r = site.fromKey(event(code, key, patch), false); return r && r.id; };
  assert.equal(id('ArrowRight', 'ArrowRight', { ctrlKey: true }), 'yt:chapter');
  assert.equal(id('ArrowLeft', 'ArrowLeft', { ctrlKey: true }), 'yt:chapter');
  assert.equal(id('Period', '.'), 'yt:frame');
  assert.equal(id('Comma', ','), 'yt:frame');
  assert.equal(id('Period', '>', { shiftKey: true }), 'yt:speed'); // still speed with Shift
  assert.equal(id('Home', 'Home', { target: inPlayer }), 'yt:startend');
  assert.equal(id('End', 'End', { target: inPlayer }), 'yt:startend');
  assert.equal(id('ArrowUp', 'ArrowUp', { target: inPlayer }), 'yt:volume');
  assert.equal(id('ArrowDown', 'ArrowDown', { target: inPlayer }), 'yt:volume');
  assert.equal(id('Digit5', '5'), 'yt:jump');
  assert.equal(id('Digit0', '0'), 'yt:jump');
  assert.equal(id('KeyK', 'k', { ctrlKey: true }), null); // other Ctrl keys are not YouTube's
});

test('YouTube: Home/End and ↑/↓ outside the player scroll the page, so they are not counted', () => {
  const { site } = siteEnv('youtube');
  const id = (code, key, target) => { const r = site.fromKey(event(code, key, { target }), false); return r && r.id; };
  assert.equal(id('ArrowUp', 'ArrowUp', new In()), null);
  assert.equal(id('End', 'End', new In()), null);
  // On the seek bar ↑/↓ leave the volume alone (measured on the real page).
  assert.equal(id('ArrowUp', 'ArrowUp', new In('#movie_player', '.ytp-progress-bar')), null);
  assert.equal(id('Digit5', '5', new Element({ typing: true })), null);
});

test('YouTube on Mac: chapters are Option+←/→', () => {
  const { site, ctx } = siteEnv('youtube');
  ctx.navigator.platform = 'MacIntel';
  assert.equal(site.fromKey(event('ArrowRight', 'ArrowRight', { altKey: true }), true).id, 'yt:chapter');
  assert.equal(site.fromKey(event('ArrowRight', 'ArrowRight', { ctrlKey: true }), true), null);
});

test('YouTube: the volume slider hints ↑/↓ and a chapter in the list hints Ctrl+←/→', () => {
  const { site } = siteEnv('youtube');
  const click = (el) => { const r = site.fromMouse({ target: el }, false); return r && r.id; };
  assert.equal(click(new In('#movie_player', '.html5-video-player', '.ytp-volume-panel')), 'yt:volume');
  assert.equal(click(new In('ytd-macro-markers-list-item-renderer')), 'yt:chapter');
});
