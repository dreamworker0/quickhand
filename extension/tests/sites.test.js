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

test('Drive: keys for the selected items count only with an item selected (focused, for rename and the item menu)', () => {
  const { site, ctx } = siteEnv('drive');
  const id = (code, key, mods, target) => { const r = site.fromKey(event(code, key, { ...mods, target }), false); return r && r.id; };
  const ctrlAlt = { ctrlKey: true, altKey: true };
  const keys = [['KeyS', 's', ctrlAlt, 'mod+alt+s'], ['KeyA', 'a', ctrlAlt, 'mod+alt+a'], ['KeyM', 'm', ctrlAlt, 'mod+alt+m'], ['KeyL', 'l', ctrlAlt, 'mod+alt+l'],
    ['KeyP', 'p', ctrlAlt, 'mod+alt+p'], ['Delete', 'Delete', {}, 'delete'], ['KeyX', 'x', { ctrlKey: true }, 'mod+x'], ['Enter', 'Enter', { ctrlKey: true }, 'mod+enter']];
  // Nothing selected: Drive does nothing.
  for (const [code, key, mods] of keys) assert.equal(id(code, key, mods), null, key);
  assert.equal(id('F2', 'F2', {}), null);
  // An item focused but not selected (after Esc): rename and the item menu work on it.
  const row = new Element();
  row.closest = (sel) => (sel.includes('data-id') ? row : null);
  assert.equal(id('F2', 'F2', {}, row), 'drive:f2');
  assert.equal(id('F10', 'F10', { shiftKey: true }, row), 'drive:shift+f10');
  assert.equal(id('KeyS', 's', ctrlAlt, row), null);
  // An item selected.
  ctx.document.querySelectorAll = (sel) => (sel.includes('aria-selected="true"') ? [{ getClientRects: () => [{}] }] : []);
  for (const [code, key, mods, name] of keys) assert.equal(id(code, key, mods), 'drive:' + name, key);
});

test('Drive: the help page keys found missing in the real-site check are named', () => {
  const { site, ctx } = siteEnv('drive');
  ctx.document.querySelectorAll = (sel) => (sel.includes('aria-selected="true"') ? [{ getClientRects: () => [{}] }] : []); // an item selected
  const id = (code, key, mods) => { const r = site.fromKey(event(code, key, mods), false); return r && r.id; };
  assert.equal(id('KeyG', 'g', { altKey: true }), null);
  assert.equal(id('KeyF', 'f', { altKey: true }), 'drive:alt+g>f'); // Alt still held for the second key
  assert.equal(id('KeyG', 'g', { altKey: true }), null);
  assert.equal(id('KeyK', 'k'), 'drive:alt+g>k');
  assert.equal(id('KeyT', 't', { altKey: true }), null);
  assert.equal(id('KeyQ', 'q'), 'drive:alt+t>q');
  assert.equal(id('Space', ' ', { shiftKey: true }), 'drive:shift+space');
  assert.equal(id('KeyC', 'c', { ctrlKey: true, shiftKey: true }), 'drive:mod+shift+c');
  assert.equal(id('KeyV', 'v', { ctrlKey: true, shiftKey: true }), 'drive:mod+shift+v');
  assert.equal(id('KeyN', 'n', { altKey: true }), 'drive:alt+n');
  assert.equal(id('F10', 'F10', { shiftKey: true }), 'drive:shift+f10');
  assert.equal(id('KeyA', 'a', { altKey: true, shiftKey: true }), 'drive:alt+shift+a');
  assert.equal(id('KeyS', 's', { ctrlKey: true, shiftKey: true }), 'drive:mod+shift+s');
  // Mac: Control+T then Q, Control+N
  const mac = (code, key, mods) => { const r = site.fromKey(event(code, key, mods), true); return r && r.label; };
  assert.equal(mac('KeyT', 't', { ctrlKey: true }), null);
  assert.ok(mac('KeyQ', 'q'));
  assert.ok(mac('KeyN', 'n', { ctrlKey: true }));
});

test('Drive: "Google 문서" in the right-click "연결 앱" menu is not the create shortcut', () => {
  const { site } = siteEnv('drive');
  class MenuItem extends Element {
    constructor(text) { super({ control: true, role: 'menuitem' }); this.text = text; }
    querySelectorAll() { return [{ childElementCount: 0, textContent: this.text }]; }
  }
  const menuitem = (text) => new MenuItem(text);
  assert.equal(site.fromMouse({ target: menuitem('Google 문서') }, false), null);
  assert.equal(site.fromMouse({ target: menuitem('Google 드로잉') }, false).id, 'drive:alt+c>d');
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
  env.ctx.setTimeout = (fn) => fn();
  // The name box: set `env.box.value` before the press, `env.box.next` for after it.
  env.box = { value: 'B4', next: null };
  env.ctx.document.querySelector = (sel) => (sel.includes('name-box') ? { value: env.box.value } : null);
  const rect = (left, top, width, height) => ({ getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + height, width, height }) });
  env.ctx.document.querySelectorAll = (sel) =>
    // As on the page: the letters start right of the numbers, the numbers below the letters.
    sel === '.column-headers-background' ? [rect(46, 142, 1042, 24)] : sel === '.row-headers-background' ? [rect(0, 166, 46, 684)] : [];
  // The header strip is drawn, not a button; `onMenu` puts a menu item over it instead.
  const click = (x, y, upX = x, upY = y, onMenu = false, shiftKey = false) => {
    const target = new Element({ control: onMenu });
    env.listeners.mousedown({ target, button: 0, clientX: x, clientY: y });
    if (env.box.next !== null) env.box.value = env.box.next;
    env.box.next = null;
    return env.site.fromMouse({ target, button: 0, clientX: upX, clientY: upY, shiftKey }, platform === 'MacIntel');
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

test('Sheets: a column picked by its letter with the mouse, then a format button, hints both steps', () => {
  const { site, ctx, box, click } = sheetsWithHeaders();
  const shown = (r) => JSON.parse(JSON.stringify(r.combos.map((c) => ctx.QH.keys.display(c, false))));
  const button = (label) => site.fromMouse({ target: new Element({ control: true, 'aria-label': label }), button: 0, clientX: 600, clientY: 60 }, false);
  box.next = 'C:C';
  click(300, 150); // column C
  const align = button('오른쪽 정렬 (Ctrl+Shift+R)');
  assert.equal(align.id, 'sheets:mod+shift+r');
  assert.deepEqual(shown(align), [['Ctrl', 'Space', '→', 'Ctrl', 'Shift', 'R']]);
  // A button that does not act on the column keeps its own key.
  assert.deepEqual(shown(button('실행취소 (Ctrl+Z)')), [['Ctrl', 'Z']]);
  // A row picked by its number: Shift+Space first.
  box.next = '3:3';
  click(20, 400);
  assert.deepEqual(shown(button('굵게 (Ctrl+B)')), [['Shift', 'Space', '→', 'Ctrl', 'B']]);
  // Once the selection is something else (a cell), the button's key alone.
  box.value = 'B4';
  assert.deepEqual(shown(button('굵게 (Ctrl+B)')), [['Ctrl', 'B']]);
});

test('Sheets: a column picked with Ctrl+Space, then a format button, hints only the button', () => {
  const { site, ctx, box, click } = sheetsWithHeaders();
  const shown = (r) => JSON.parse(JSON.stringify(r.combos.map((c) => ctx.QH.keys.display(c, false))));
  box.next = 'C:C';
  click(300, 150);
  site.fromKey(event('Space', ' ', { ctrlKey: true }), false); // then picked again with the keyboard
  const r = site.fromMouse({ target: new Element({ control: true, 'aria-label': '오른쪽 정렬 (Ctrl+Shift+R)' }), button: 0, clientX: 600, clientY: 60 }, false);
  assert.deepEqual(shown(r), [['Ctrl', 'Shift', 'R']]);
});

test("Sheets: Excel-style keys count only once the shortcuts window showed the compatible setting on", () => {
  const { site, ctx } = siteEnv('sheets');
  ctx.setTimeout = (fn) => fn();
  const id = (code, key, mods) => { const r = site.fromKey(event(code, key, mods), false); return r; };
  const ctrl = { ctrlKey: true };
  // Off (or never seen): Ctrl+2 is not Sheets' bold.
  assert.equal(id('Digit2', '2', ctrl), null);
  assert.equal(id('Digit9', '9', ctrl), null);
  // The shortcuts window open with the switch on; a click there is when it is read.
  let on = 'true';
  const win = { getClientRects: () => [{}], textContent: '키보드 단축키 검색 호환되는 스프레드시트 단축키 사용', querySelector: () => ({ getAttribute: () => on }) };
  ctx.document.querySelectorAll = (sel) => (sel === '[role="dialog"]' ? [win] : []);
  site.fromMouse({ target: new Element(), button: 0, clientX: 10, clientY: 10 }, false);
  const bold = id('Digit2', '2', ctrl);
  assert.equal(bold.id, 'sheets:mod+b'); // the same action as Ctrl+B
  assert.equal(bold.pressed.key, '2'); // the cheer shows Ctrl+2
  assert.deepEqual([bold.combos[0].mod, bold.combos[0].key], [true, 'b']); // hints keep Ctrl+B
  assert.equal(id('Digit9', '9', ctrl).id, 'sheets:mod+alt+9');
  assert.equal(id('Equal', '=', ctrl).id, 'sheets:mod+alt+=');
  assert.equal(id('F7', 'F7', {}).id, 'sheets:f7');
  assert.equal(id('F7', 'F7', {}).label, '맞춤법 검사');
  // Turned off again in the window.
  on = 'false';
  site.fromMouse({ target: new Element(), button: 0, clientX: 10, clientY: 10 }, false);
  assert.equal(id('Digit2', '2', ctrl), null);
  assert.equal(id('KeyB', 'b', ctrl).id, 'sheets:mod+b'); // the usual key always counts
});

test('Docs, Sheets, Slides: opening a menu bar menu with the mouse hints its Alt key (Windows)', () => {
  const bar = (text) => {
    const item = new Element({ role: 'menuitem' }, text);
    item.closest = (sel) => (sel.includes('#docs-menubar') ? item : null);
    return item;
  };
  const click = (id, text, mac = false) => { const r = siteEnv(id).site.fromMouse({ target: bar(text), button: 0, clientX: 5, clientY: 5 }, mac); return r && r.id; };
  assert.equal(click('sheets', '데이터'), 'sheets:alt+d');
  assert.equal(click('sheets', '파일'), 'sheets:alt+f');
  assert.equal(click('docs', '서식'), 'docs:alt+o');
  assert.equal(click('docs', 'Help'), 'docs:alt+h');
  assert.equal(click('slides', '삽입'), 'slides:alt+i');
  assert.equal(click('docs', '데이터'), null); // not measured in Docs
  assert.equal(click('slides', '슬라이드'), null); // nor Slides' own menus
  assert.equal(click('sheets', '데이터', true), null); // Mac: other keys
});

test('Sheets: dragging a header (resize or move) is not a column/row select', async () => {
  const { click, box } = sheetsWithHeaders();
  assert.equal(await click(300, 150, 340, 150), null); // resize: the name box stays as it was
  box.value = 'C:F';
  box.next = 'H:K';
  assert.equal(await click(300, 150, 500, 150), null); // moving four selected columns
  assert.equal(click(500, 500), null);
});

test('Sheets: the corner button above row 1, left of A, selects everything: Ctrl+A (⌘A on Mac)', () => {
  const corner = sheetsWithHeaders().click(20, 150);
  assert.equal(corner.id, 'sheets:mod+a');
  assert.equal(corner.label, '모두 선택');
  // On the page the two strips overlap in the corner.
  const overlap = sheetsWithHeaders();
  const rect = (left, top, width, height) => ({ getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + height, width, height }) });
  overlap.ctx.document.querySelectorAll = (sel) =>
    sel === '.column-headers-background' ? [rect(0, 142, 1088, 24)] : sel === '.row-headers-background' ? [rect(0, 142, 46, 708)] : [];
  assert.equal(overlap.click(20, 150).id, 'sheets:mod+a');
  assert.equal(overlap.click(300, 150).id, 'sheets:mod+space');
  assert.equal(overlap.click(20, 400).id, 'sheets:shift+space');
  const { ctx, click } = sheetsWithHeaders('MacIntel');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.QH.keys.display(click(20, 150).combos[0], true))), ['⌘', 'A']);
});

test('Sheets: dragging along the letters (or Shift+click) to several columns hints Ctrl+Space, then Shift+→', async () => {
  const { click, box } = sheetsWithHeaders();
  box.next = 'C:F';
  const columns = await click(300, 150, 600, 150);
  assert.equal(columns.id, 'sheets:mod+space>shift+arrowright');
  assert.equal(columns.label, '여러 열 선택');
  box.value = 'C:C';
  box.next = 'C:E';
  assert.equal((await click(500, 150, 500, 150, false, true)).id, 'sheets:mod+space>shift+arrowright');
  box.next = '3:7';
  const rows = await click(20, 300, 20, 500);
  assert.equal(rows.id, 'sheets:shift+space>shift+arrowdown');
  assert.equal(rows.label, '여러 행 선택');
});

test('Sheets: dragging across cells to a range hints Shift+arrow, to the edge Ctrl+Shift+arrow', async () => {
  const { site, listeners, box } = sheetsWithHeaders();
  // Press inside the grid (or on the fill handle), move, let go; the name box shows `after`.
  const drag = (x, y, upX, upY, after, ...extra) => {
    const target = new In('#waffle-grid-container', ...extra);
    listeners.mousedown({ target, button: 0, clientX: x, clientY: y });
    box.value = after;
    return site.fromMouse({ target, button: 0, clientX: upX, clientY: upY }, false);
  };
  box.value = 'B2';
  const across = await drag(300, 300, 600, 330, 'B2:F3');
  assert.equal(across.id, 'sheets:range');
  assert.equal(across.label, '범위 선택');
  assert.deepEqual(JSON.parse(JSON.stringify(across.combos.map((c) => [c.shift, c.mod, c.key]))), [[true, false, 'arrowright'], [true, true, 'arrowright']]);
  box.value = 'B2';
  assert.deepEqual((await drag(300, 300, 310, 600, 'B2:B20')).combos[0].key, 'arrowdown');
  box.value = 'B2';
  assert.equal(await drag(300, 300, 300, 300, 'B2'), null); // a plain click on a cell
  box.value = 'B2';
  const shiftClick = (x, y, after) => {
    const target = new In('#waffle-grid-container');
    listeners.mousedown({ target, button: 0, clientX: x, clientY: y, shiftKey: true });
    box.value = after;
    return site.fromMouse({ target, button: 0, clientX: x, clientY: y, shiftKey: true }, false);
  };
  assert.equal((await shiftClick(500, 600, 'B2:E30')).id, 'sheets:range'); // Shift+click on a far cell
  box.value = 'B2:D4';
  assert.equal(await drag(300, 300, 500, 400, 'E6:G8'), null); // moving the same-sized block
  box.value = 'B2';
  assert.equal(await drag(300, 300, 300, 600, 'B2:B20', '.autofill-handle'), null); // the fill handle copies
});

test('Sheets: Shift+arrow to a range counts once; inside a cell being edited it does not', async () => {
  const { site, box } = sheetsWithHeaders();
  const key = (code, k, patch) => site.fromKey(event(code, k, patch), false);
  box.value = 'B2:C2';
  const first = await key('ArrowRight', 'ArrowRight', { shiftKey: true });
  assert.equal(first.id, 'sheets:range');
  assert.equal(await key('ArrowDown', 'ArrowDown', { shiftKey: true }), null); // the same range, widened
  box.value = 'B2:C40';
  assert.equal((await key('ArrowDown', 'ArrowDown', { shiftKey: true, ctrlKey: true })).id, 'sheets:range'); // to the edge: its own shortcut
  assert.equal(await key('ArrowRight', 'ArrowRight', { shiftKey: true, ctrlKey: true }), null);
  box.value = 'B2';
  assert.equal(await key('ArrowLeft', 'ArrowLeft', { shiftKey: true }), null); // shrunk back to one cell
  box.value = 'A2:B2';
  assert.equal((await key('ArrowLeft', 'ArrowLeft', { shiftKey: true })).id, 'sheets:range'); // a new range to the left
  box.value = 'B2:C2';
  assert.equal(key('KeyB', 'b', { ctrlKey: true }).id, 'sheets:mod+b'); // something else, then a new range
  box.value = 'B2:B9';
  assert.equal((await key('ArrowDown', 'ArrowDown', { shiftKey: true, ctrlKey: true })).id, 'sheets:range');
  key('Escape', 'Escape');
  box.value = 'B2'; // editing a cell: Shift+→ selects letters, the box stays one cell
  assert.equal(await key('ArrowRight', 'ArrowRight', { shiftKey: true }), null);
});

test('Sheets: Shift+PageUp/Down to a range counts as a range select; Shift+Home/End do not select in Sheets', async () => {
  const { site, box } = sheetsWithHeaders();
  const key = (code, k, patch) => site.fromKey(event(code, k, patch), false);
  const shift = { shiftKey: true };
  for (const [code, after] of [['PageDown', 'C3:C40'], ['PageUp', 'C1:C3']]) {
    key('Escape', 'Escape'); // a new range each time
    box.value = after;
    const r = await key(code, code, shift);
    assert.equal(r && r.id, 'sheets:range', code);
    assert.equal(r.combos[0].key, code.toLowerCase()); // the cheer shows the key pressed
  }
  // In the same range each is its own shortcut, counted once.
  key('Escape', 'Escape');
  box.value = 'C3:C40';
  assert.equal((await key('PageDown', 'PageDown', shift)).id, 'sheets:range');
  assert.equal(await key('PageDown', 'PageDown', shift), null);
  assert.equal((await key('ArrowRight', 'ArrowRight', shift)).id, 'sheets:range');
  // Editing a cell: the box stays one cell.
  key('Escape', 'Escape');
  box.value = 'C3';
  assert.equal(await key('PageDown', 'PageDown', shift), null);
  // Shift+End and Ctrl+Shift+PageDown are not range selects.
  box.value = 'C3:Z3';
  assert.notEqual((await key('End', 'End', shift) || {}).id, 'sheets:range');
  assert.notEqual((await key('PageDown', 'PageDown', { shiftKey: true, ctrlKey: true }) || {}).id, 'sheets:range');
});

test('Sheets: Ctrl+Space then Shift+→ counts as selecting several columns, once', async () => {
  const { site } = sheetsWithHeaders();
  const key = (code, k, patch) => site.fromKey(event(code, k, patch), false);
  assert.equal(key('Space', ' ', { ctrlKey: true }).id, 'sheets:mod+space');
  const wider = key('ArrowRight', 'ArrowRight', { shiftKey: true });
  assert.equal(wider.id, 'sheets:mod+space>shift+arrowright');
  // Ctrl+Space was cheered on its own; this cheer shows only Shift+→.
  assert.equal(wider.pressed.key, 'arrowright');
  assert.equal(wider.pressed.shift, true);
  assert.equal(await key('ArrowRight', 'ArrowRight', { shiftKey: true }), null); // widening further
  assert.equal(await key('ArrowRight', 'ArrowRight', { shiftKey: true }), null);
});

test('Sheets: Ctrl+Space then Ctrl+Shift+→ (to the edge) also counts as several columns', async () => {
  const { site } = sheetsWithHeaders();
  const key = (code, k, patch, mac = false) => site.fromKey(event(code, k, patch), mac);
  key('Space', ' ', { ctrlKey: true });
  const wider = key('ArrowRight', 'ArrowRight', { ctrlKey: true, shiftKey: true });
  assert.equal(wider.id, 'sheets:mod+space>shift+arrowright');
  assert.equal(wider.pressed.mod, true); // the cheer shows Ctrl+Shift+→
  // Alt or a Mac Control key is something else.
  key('Space', ' ', { ctrlKey: true });
  const other = await key('ArrowRight', 'ArrowRight', { altKey: true, shiftKey: true });
  assert.notEqual(other && other.id, 'sheets:mod+space>shift+arrowright');
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

test('Sheets: Shift+Space with a range selected selects all of its rows, and counts', async () => {
  const { site, ctx } = siteEnv('sheets');
  let nameBox = 'B2:C4';
  let next = '2:4';
  ctx.setTimeout = (fn) => { nameBox = next; fn(); }; // Sheets changes the box in the meantime
  ctx.document.querySelector = (sel) => (sel.includes('name-box') ? { value: nameBox } : null);
  assert.equal((await site.fromKey(event('Space', ' ', { shiftKey: true }), false)).id, 'sheets:shift+space');
  // A range left as it was (the space went into a cell) does not count.
  nameBox = 'B2:C4';
  next = 'B2:C4';
  assert.equal(await site.fromKey(event('Space', ' ', { shiftKey: true }), false), null);
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

// A video with chapters: the progress bar is cut into several parts.
const withChapters = (ctx) => {
  ctx.document.querySelectorAll = (sel) => (sel.includes('ytp-chapter-hover-container') ? [{}, {}, {}] : []);
};

test('YouTube: chapter, frame, start/end, volume and number keys are counted', () => {
  const { site, ctx } = siteEnv('youtube');
  withChapters(ctx);
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
  // ←/→ move 5 seconds, J/L 10: two shortcuts, not one.
  assert.equal(id('ArrowLeft', 'ArrowLeft'), 'yt:seek5');
  assert.equal(id('ArrowRight', 'ArrowRight'), 'yt:seek5');
  assert.equal(id('KeyJ', 'j'), 'yt:seek');
  assert.equal(id('Space', ' '), 'yt:playpause');
});

test('YouTube: keys count only where the video allows them', () => {
  const { site, ctx } = siteEnv('youtube');
  const id = (code, key, patch) => { const r = site.fromKey(event(code, key, patch), false); return r && r.id; };
  const page = (parts) => { ctx.document.querySelectorAll = (sel) => parts[Object.keys(parts).find((k) => sel.includes(k))] || []; };
  const video = (paused) => ({ paused });
  const cc = (title) => ({ getAttribute: (n) => (n === 'data-title-no-tooltip' ? title : null) });
  // No chapters, playing, captions unavailable, not a playlist: none of these do anything.
  page({ 'ytp-chapter-hover-container': [{}], video: [video(false)], 'ytp-subtitles-button': [cc('자막 사용 불가')] });
  assert.equal(id('ArrowRight', 'ArrowRight', { ctrlKey: true }), null);
  assert.equal(id('Period', '.'), null);
  assert.equal(id('Comma', ','), null);
  assert.equal(id('KeyC', 'c'), null);
  assert.equal(id('KeyP', 'P', { shiftKey: true }), null);
  assert.equal(id('KeyN', 'N', { shiftKey: true }), 'yt:next'); // the next video, playlist or not
  // Chapters, paused, captions, a playlist.
  page({ 'ytp-chapter-hover-container': [{}, {}], video: [video(true)], 'ytp-subtitles-button': [cc('자막')] });
  ctx.location.search = '?v=abc&list=PL123';
  assert.equal(id('ArrowRight', 'ArrowRight', { ctrlKey: true }), 'yt:chapter');
  assert.equal(id('Period', '.'), 'yt:frame');
  assert.equal(id('KeyC', 'c'), 'yt:captions');
  assert.equal(id('KeyP', 'P', { shiftKey: true }), 'yt:prev');
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
  withChapters(ctx);
  ctx.navigator.platform = 'MacIntel';
  assert.equal(site.fromKey(event('ArrowRight', 'ArrowRight', { altKey: true }), true).id, 'yt:chapter');
  assert.equal(site.fromKey(event('ArrowRight', 'ArrowRight', { ctrlKey: true }), true), null);
});

test('YouTube: the volume slider hints ↑/↓, the timeline J/L and a chapter in the list Ctrl+←/→', () => {
  const { site } = siteEnv('youtube');
  const click = (el) => { const r = site.fromMouse({ target: el }, false); return r && r.id; };
  assert.equal(click(new In('#movie_player', '.html5-video-player', '.ytp-volume-panel')), 'yt:volume');
  assert.equal(click(new In('#movie_player', '.html5-video-player', '.ytp-progress-bar-container', '.ytp-progress-bar')), 'yt:seek');
  assert.equal(click(new In('ytd-macro-markers-list-item-renderer')), 'yt:chapter');
});

test('Gmail: keys that change conversations count only when one is open or ticked', () => {
  const { site, ctx } = siteEnv('gmail');
  const id = (code, key, patch) => { const r = site.fromKey(event(code, key, patch), false); return r && r.id; };
  const keys = [['KeyE', 'e', 'archive'], ['Digit3', '#', 'remove', { shiftKey: true }], ['KeyU', 'U', 'unread', { shiftKey: true }], ['KeyM', 'm', 'mute'], ['Minus', '-', 'notImportant'], ['KeyV', 'v', 'move']];
  // The list with nothing ticked: Gmail answers "No conversations selected".
  for (const [code, key, , mods] of keys) assert.equal(id(code, key, mods), null, key);
  assert.equal(id('KeyS', 's'), 'gmail:star'); // not gated
  // A ticked row (hidden lists of other views do not count).
  const box = (shown) => ({ getClientRects: () => (shown ? [{}] : []) });
  ctx.document.querySelectorAll = (sel) => (sel.includes('aria-checked="true"') ? [box(false)] : []);
  assert.equal(id('KeyE', 'e'), null);
  ctx.document.querySelectorAll = (sel) => (sel.includes('aria-checked="true"') ? [box(false), box(true)] : []);
  for (const [code, key, name, mods] of keys) assert.equal(id(code, key, mods), 'gmail:' + name, key);
  // An open conversation.
  ctx.document.querySelectorAll = () => [];
  ctx.location.hash = '#label/%EC%97%85%EB%AC%B4/FMfcgzQXJWDsKlmBhQZHJTrzvNZsxwlL';
  for (const [code, key, name, mods] of keys) assert.equal(id(code, key, mods), 'gmail:' + name, key);
  ctx.location.hash = '#search/hello';
  assert.equal(id('KeyE', 'e'), null);
});

test('Gmail: reply, message and conversation-view keys count only in an open conversation', () => {
  const { site, ctx } = siteEnv('gmail');
  const id = (code, key, patch) => { const r = site.fromKey(event(code, key, patch), false); return r && r.id; };
  const shift = { shiftKey: true };
  const keys = [['KeyR', 'r', 'reply'], ['KeyA', 'a', 'replyAll'], ['KeyF', 'f', 'forward'], ['KeyR', 'R', 'replyWindow', shift],
    ['KeyN', 'n', 'nextMessage'], ['KeyP', 'p', 'prevMessage'], ['Semicolon', ';', 'expandAll'], ['Semicolon', ':', 'collapseAll', shift],
    ['Minus', '_', 'unreadFrom', shift], ['KeyN', 'N', 'refresh', shift], ['KeyU', 'u', 'back'], ['BracketLeft', '[', 'archiveNewer'], ['BracketRight', ']', 'archiveOlder']];
  // In the list these do nothing, even with a conversation ticked.
  const box = { getClientRects: () => [{}] };
  ctx.document.querySelectorAll = (sel) => (sel.includes('aria-checked="true"') ? [box] : []);
  for (const [code, key, , mods] of keys) assert.equal(id(code, key, mods), null, key);
  assert.equal(id('KeyJ', 'j'), 'gmail:older'); // the list cursor moves
  assert.equal(id('KeyO', 'o'), 'gmail:open');
  ctx.location.hash = '#inbox/FMfcgzQXJWDsKlmBhQZHJTrzvNZsxwlL';
  for (const [code, key, name, mods] of keys) assert.equal(id(code, key, mods), 'gmail:' + name, key);
});

test("Gmail: the sidebar's \"더보기\" (more labels) is not the toolbar's More actions (.)", () => {
  const { site } = siteEnv('gmail');
  const click = (attrs, text) => { const r = site.fromMouse({ target: new Element({ control: true, role: 'button', ...attrs }, text) }, false); return r && r.id; };
  assert.equal(click({ 'aria-label': '라벨 더보기' }, '더보기'), null);
  assert.equal(click({ 'aria-label': '이메일 옵션 더보기', 'data-tooltip': '더보기' }, ''), 'gmail:more');
  assert.equal(click({}, '편지쓰기'), 'gmail:compose'); // a name shown only as text still counts
});

test("Gmail: one of the person's labels clicked in the left list hints G then L, without its name", () => {
  const { site, ctx } = siteEnv('gmail');
  const link = (href) => {
    const a = new Element({ href }, '1.업무');
    a.closest = (sel) => (sel.startsWith('a[') ? a : null);
    return a;
  };
  const r = site.fromMouse({ target: link('https://mail.google.com/mail/u/0/#label/1.%EC%97%85%EB%AC%B4') }, false);
  assert.equal(r.id, 'gmail:goLabel');
  assert.equal(r.label, '라벨로 이동');
  assert.ok(!JSON.stringify(r).includes('업무')); // the label's own name goes nowhere
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.QH.keys.display(r.combos[0], false))), ['G', '→', 'L']);
  assert.equal(site.fromMouse({ target: link('https://mail.google.com/mail/u/0/#inbox') }, false).id, 'gmail:inbox');
});

test('Gmail: z counts only while Gmail offers to undo', () => {
  const { site, ctx } = siteEnv('gmail');
  const id = () => { const r = site.fromKey(event('KeyZ', 'z'), false); return r && r.id; };
  assert.equal(id(), null);
  const toast = (text, shown) => ({ textContent: text, getClientRects: () => (shown ? [{}] : []) });
  ctx.document.querySelectorAll = (sel) => (sel.includes('.bAq') ? [toast('대화가 보관처리되었습니다. 실행취소', false)] : []);
  assert.equal(id(), null); // an old notice, hidden
  ctx.document.querySelectorAll = (sel) => (sel.includes('.bAq') ? [toast('대화가 보관처리되었습니다. 실행취소', true)] : []);
  assert.equal(id(), 'gmail:undo');
});

test('Gmail: a toolbar click in the list hints x then the key; in an open conversation the key alone', () => {
  const { site, ctx } = siteEnv('gmail');
  const archive = () => site.fromMouse({ target: new Element({ control: true, act: '7' }) }, false);
  const shown = (r) => JSON.parse(JSON.stringify(r.combos.map((c) => ctx.QH.keys.display(c, false))));
  assert.deepEqual(shown(archive()), [['X', '→', 'E']]);
  assert.equal(archive().id, 'gmail:archive');
  ctx.location.hash = '#inbox/FMfcgzQXJWDsKlmBhQZHJTrzvNZsxwlL';
  assert.deepEqual(shown(archive()), [['E']]);
});

test("Gmail: every key on Gmail's help page that changes something is counted", () => {
  const { site, ctx } = siteEnv('gmail');
  const id = (code, key, patch) => { const r = site.fromKey(event(code, key, patch), false); return r && r.id; };
  const shift = { shiftKey: true };
  const ctrl = { ctrlKey: true };
  const ctrlShift = { ctrlKey: true, shiftKey: true };
  ctx.location.hash = '#inbox/FMfcgzQXJWDsKlmBhQZHJTrzvNZsxwlL'; // an open conversation, where every key works
  assert.equal(id('KeyN', 'n'), 'gmail:nextMessage');
  assert.equal(id('KeyP', 'p'), 'gmail:prevMessage');
  assert.equal(id('KeyO', 'o'), 'gmail:open');
  assert.equal(id('Enter', 'Enter', { target: new In('tr.zA') }), 'gmail:open');
  const body = new Element(); body.tagName = 'BODY';
  assert.equal(id('Enter', 'Enter', { target: body }), 'gmail:open'); // the list cursor is not a focus
  assert.equal(id('Enter', 'Enter'), null); // Enter on a button just presses it
  assert.equal(id('BracketRight', ']'), 'gmail:archiveOlder');
  assert.equal(id('BracketLeft', '['), 'gmail:archiveNewer');
  assert.equal(id('Comma', ','), 'gmail:toolbar');
  assert.equal(id('Backquote', '`'), 'gmail:nextSection');
  assert.equal(id('Backquote', '~', shift), 'gmail:prevSection');
  assert.equal(id('KeyD', 'd'), 'gmail:composeTab');
  assert.equal(id('KeyQ', 'q'), 'gmail:chatSearch');
  assert.equal(id('Slash', '?', shift), 'gmail:help');
  assert.equal(id('Semicolon', ':', shift), 'gmail:collapseAll');
  assert.equal(id('Minus', '_', shift), 'gmail:unreadFrom');
  assert.equal(id('KeyN', 'N', shift), 'gmail:refresh');
  assert.equal(id('KeyR', 'R', shift), 'gmail:replyWindow');
  assert.equal(id('KeyA', 'A', shift), 'gmail:replyAllWindow');
  assert.equal(id('KeyF', 'F', shift), 'gmail:forwardWindow');
  assert.equal(id('Period', '.', { ctrlKey: true, altKey: true }), 'gmail:sidebarNext');
  assert.equal(id('Comma', ',', { ctrlKey: true, altKey: true }), 'gmail:sidebarPrev');
  for (const [k, name] of [['KeyK', 'goTasks'], ['KeyL', 'goLabel']]) {
    assert.equal(id('KeyG', 'g'), null);
    assert.equal(id(k, k.slice(3).toLowerCase()), 'gmail:' + name);
  }
  for (const [k, name] of [['KeyN', 'selectNone'], ['KeyR', 'selectRead'], ['KeyU', 'selectUnread'], ['KeyS', 'selectStarred'], ['KeyT', 'selectUnstarred']]) {
    assert.equal(id('Digit8', '*', shift), null);
    assert.equal(id(k, k.slice(3).toLowerCase()), 'gmail:' + name);
  }
  // Compose window keys, named even before their button was ever clicked.
  for (const [code, key, mods, combo] of [
    ['Digit5', '%', ctrlShift, 'mod+shift+5'], ['Digit6', '^', ctrlShift, 'mod+shift+6'], ['Minus', '_', ctrlShift, 'mod+shift+-'],
    ['Equal', '+', ctrlShift, 'mod+shift+='], ['BracketLeft', '[', ctrl, 'mod+['], ['BracketRight', ']', ctrl, 'mod+]'],
    ['KeyL', 'L', ctrlShift, 'mod+shift+l'], ['KeyE', 'E', ctrlShift, 'mod+shift+e'], ['KeyR', 'R', ctrlShift, 'mod+shift+r'],
    ['KeyF', 'F', ctrlShift, 'mod+shift+f'], ['KeyM', 'm', ctrl, 'mod+m'], ['Period', '.', ctrl, 'mod+.'], ['Comma', ',', ctrl, 'mod+,'],
  ]) {
    const found = site.fromKey(event(code, key, { ...mods, target: new Element({ typing: true }) }), false);
    assert.equal(found?.id, 'gmail:' + combo, combo);
    assert.ok(found.label, combo);
  }
});

test('Gmail: clicking a row star or importance marker hints s and + / -', () => {
  const { site } = siteEnv('gmail');
  class Row extends Element { closest(sel) { return sel === 'tr.zA' || sel.includes('[role="button"]') || sel.includes('[role="switch"]') ? this : null; } }
  const click = (attrs) => { const r = site.fromMouse({ target: new Row(attrs) }, false); return r && r.id; };
  assert.equal(click({ role: 'button', 'aria-label': '별표 없음' }), 'gmail:star');
  assert.equal(click({ role: 'button', 'aria-label': '별표표시됨' }), 'gmail:star');
  assert.equal(click({ role: 'switch', 'aria-label': 'Google 매직에 따르면 중요한 메일입니다.' }), 'gmail:notImportant');
  assert.equal(click({ role: 'switch', 'aria-label': '중요하지 않은 메일입니다. 중요 메일로 표시하려면 클릭하세요.' }), 'gmail:important');
});

test("Docs: two-step keys count with the second key held or on its own", () => {
  const { site } = siteEnv('docs');
  const press = (code, key, mods = {}) => site.fromKey(event(code, key, mods), false);
  const ca = { ctrlKey: true, altKey: true };
  assert.equal(press('KeyN', 'n', ca), null);
  assert.equal(press('KeyH', 'h', ca).id, 'docs:mod+alt+n>h');
  assert.equal(press('KeyN', 'n', ca), null);
  const loose = press('KeyH', 'h');
  assert.equal(loose.id, 'docs:mod+alt+n>h');
  assert.equal(loose.label, '다음 제목');
  assert.equal(press('KeyT', 't', { ...ca, shiftKey: true }), null);
  assert.equal(press('KeyM', 'm', { ...ca, shiftKey: true }).id, 'docs:mod+alt+shift+t>m');
  // Ctrl+Alt+X right after Ctrl+Alt+A is "speak selection", not spelling.
  press('KeyA', 'a', ca);
  assert.equal(press('KeyX', 'x', ca).id, 'docs:mod+alt+a>x');
  assert.equal(press('KeyX', 'x', ca).id, 'docs:mod+alt+x');
});

test('Docs: the rest of the help page is named, plus Shift selection and page keys', () => {
  const { site } = siteEnv('docs');
  const id = (code, key, mods) => { const r = site.fromKey(event(code, key, mods), false); return r && r.id; };
  assert.equal(id('KeyO', 'o', { ctrlKey: true }), 'docs:mod+o');
  assert.equal(id('Period', '.', { ctrlKey: true }), 'docs:mod+.');
  assert.equal(id('KeyX', 'x', { ctrlKey: true, altKey: true, shiftKey: true }), 'docs:mod+alt+shift+x');
  assert.equal(id('ArrowRight', 'ArrowRight', { shiftKey: true }), 'docs:shift+arrowright');
  assert.equal(id('PageDown', 'PageDown'), 'docs:pagedown');
  assert.equal(id('KeyF', 'f', { altKey: true }), 'docs:alt+f');
  assert.equal(id('ArrowRight', 'ArrowRight'), null); // plain arrows are just moving
});

test('Docs: Ctrl+Alt+Shift+A alone is comment history, answered once no second key comes', async () => {
  const { site } = siteEnv('docs');
  const later = site.fromKey(event('KeyA', 'A', { ctrlKey: true, altKey: true, shiftKey: true }), false);
  assert.equal(typeof later.then, 'function');
  assert.equal((await later).id, 'docs:mod+alt+shift+a');
});

test('Docs: copy and cut count only with text selected', () => {
  const { site } = siteEnv('docs');
  // Keys come from Docs' typing frame, which holds the selected text (a space) or nothing.
  const typing = (selected) => {
    const target = new Element({ typing: true });
    target.ownerDocument = { getSelection: () => ({ toString: () => selected }) };
    return target;
  };
  const id = (code, key, target) => { const r = site.fromKey(event(code, key, { ctrlKey: true, target }), false); return r && r.id; };
  assert.equal(id('KeyC', 'c', typing('')), null);
  assert.equal(id('KeyX', 'x', typing('')), null);
  assert.equal(id('KeyB', 'b', typing('')), 'docs:mod+b'); // bold applies to what is typed next
  assert.equal(id('KeyC', 'c', typing(' ')), 'docs:mod+c');
  assert.equal(id('KeyX', 'x', typing(' ')), 'docs:mod+x');
});

test('Docs: R, J, K, E, U count only while a comment (not its text box) is selected', () => {
  const { site } = siteEnv('docs');
  class Comment extends Element { closest(sel) { return sel.includes('docos-anchoreddocoview') ? this : null; } }
  assert.equal(site.fromKey(event('KeyE', 'e', { target: new Comment() }), false).id, 'docs:e');
  assert.equal(site.fromKey(event('KeyE', 'e'), false), null); // typing in the document
  assert.equal(site.fromKey(event('KeyE', 'e', { target: new Element({ typing: true }) }), false), null);
});

test('Docs menus: a two-step key printed as "Ctrl+Alt+O Ctrl+Alt+U" matches pressing O, then U', () => {
  const { site } = siteEnv('docs');
  const clicked = site.fromMouse({ target: new Element({ control: true, 'aria-label': '제안된 수정 사항 검토 (Ctrl+Alt+O Ctrl+Alt+U)' }) }, false);
  assert.equal(clicked.id, 'docs:mod+alt+o>u');
  site.fromKey(event('KeyO', 'o', { ctrlKey: true, altKey: true }), false);
  assert.equal(site.fromKey(event('KeyU', 'u', { ctrlKey: true, altKey: true }), false).id, clicked.id);
});

test('Sheets: clicking the file name box is not the sheet rename shortcut', () => {
  const { site } = siteEnv('sheets');
  class Title extends Element {
    constructor(...a) { super(...a); this.classList = { contains: (c) => c === 'docs-title-input' }; }
    closest() { return this; }
  }
  assert.equal(site.fromMouse({ target: new Title({ control: true, 'data-tooltip': '이름 바꾸기' }) }, false), null);
  assert.equal(site.fromMouse({ target: new Element({ control: true }, '이름 바꾸기') }, false)?.id, 'sheets:alt+1');
});

test("Sheets: the rest of the help page is counted, including two-step comment keys", () => {
  const { site } = siteEnv('sheets');
  const id = (code, key, mods) => { const r = site.fromKey(event(code, key, mods), false); return r && r.id; };
  assert.equal(id('Space', ' ', { ctrlKey: true, shiftKey: true }), 'sheets:mod+shift+space');
  assert.equal(id('F4', 'F4'), 'sheets:f4');
  assert.equal(id('Home', 'Home', { ctrlKey: true }), 'sheets:mod+home');
  assert.equal(id('End', 'End'), 'sheets:end');
  assert.equal(id('Backquote', '`', { ctrlKey: true }), 'sheets:mod+`');
  assert.equal(id('KeyS', 's', { altKey: true, shiftKey: true }), 'sheets:alt+shift+s');
  assert.equal(id('KeyN', 'n', { ctrlKey: true, altKey: true }), null);
  assert.equal(id('KeyC', 'c', { ctrlKey: true, altKey: true }), 'sheets:mod+alt+n>c');
});

test('Sheets: Format › Number items (which show a sample, not a key) hint Ctrl+Shift+1~6', () => {
  const { site } = siteEnv('sheets');
  const part = (text) => ({ textContent: text });
  class Item extends Element {
    constructor(label, sample) { super({ control: true }); this.parts = { '.goog-menuitem-accel': part(sample), '.goog-menuitem-label': part(label) }; }
    querySelector(sel) { return this.parts[sel] || null; }
  }
  const id = (label, sample) => site.fromMouse({ target: new Item(label, sample) }, false)?.id;
  assert.equal(id('통화', '₩1,000.12'), 'sheets:mod+shift+4');
  assert.equal(id('퍼센트', '10.12%'), 'sheets:mod+shift+5');
  assert.equal(id('회계', '₩ (1,000.12)'), undefined); // no key for this one
});

test('Sheets: a menu item lying over the column letters is not a column select', () => {
  const { click } = sheetsWithHeaders();
  assert.notEqual(click(300, 150, 300, 150, true)?.id, 'sheets:mod+space');
});

test('Slides: the help page keys are named, with two-step keys and comment letters', () => {
  const { site } = siteEnv('slides');
  const id = (code, key, mods) => { const r = site.fromKey(event(code, key, mods), false); return r && r.id; };
  assert.equal(id('ArrowRight', 'ArrowRight', { altKey: true }), 'slides:alt+arrowright');
  assert.equal(id('Digit9', '9', { ctrlKey: true, altKey: true }), 'slides:mod+alt+9');
  assert.equal(id('PageDown', 'PageDown'), 'slides:pagedown');
  assert.equal(id('KeyN', 'n', { ctrlKey: true, altKey: true }), null);
  assert.equal(id('KeyW', 'w', { ctrlKey: true, altKey: true }), 'slides:mod+alt+n>w');
  assert.equal(id('KeyE', 'e', { ctrlKey: true, altKey: true }), null);
  assert.equal(id('KeyC', 'c', { ctrlKey: true, altKey: true }), 'slides:mod+alt+e>c');
  assert.equal(id('Enter', 'Enter', { ctrlKey: true }), null); // not the comment key in Slides
  class Comment extends Element { closest(sel) { return sel.includes('docos-anchoreddocoview') ? this : null; } }
  assert.equal(site.fromKey(event('KeyR', 'r', { target: new Comment() }), false).id, 'slides:r');
  assert.equal(id('KeyR', 'r'), null);
});
