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
  // The header strip is drawn, not a button; `onMenu` puts a menu item over it instead.
  const click = (x, y, upX = x, upY = y, onMenu = false) => {
    const target = new Element({ control: onMenu });
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

test('YouTube: the volume slider hints ↑/↓, the timeline J/L and a chapter in the list Ctrl+←/→', () => {
  const { site } = siteEnv('youtube');
  const click = (el) => { const r = site.fromMouse({ target: el }, false); return r && r.id; };
  assert.equal(click(new In('#movie_player', '.html5-video-player', '.ytp-volume-panel')), 'yt:volume');
  assert.equal(click(new In('#movie_player', '.html5-video-player', '.ytp-progress-bar-container', '.ytp-progress-bar')), 'yt:seek');
  assert.equal(click(new In('ytd-macro-markers-list-item-renderer')), 'yt:chapter');
});

test("Gmail: every key on Gmail's help page that changes something is counted", () => {
  const { site } = siteEnv('gmail');
  const id = (code, key, patch) => { const r = site.fromKey(event(code, key, patch), false); return r && r.id; };
  const shift = { shiftKey: true };
  const ctrl = { ctrlKey: true };
  const ctrlShift = { ctrlKey: true, shiftKey: true };
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
