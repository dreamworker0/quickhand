// Google Docs, Sheets or Slides with the mouse: click every menu item and toolbar
// button that shows a shortcut, and check that Quickhand recognizes the click as
// that shortcut.
//
// Usage: node editor-mouse.mjs [docs|sheets|slides]   (default: docs)
// Works in a new file named "손빠르미 단축키 점검 문서 (지워도 됨)". Items that change
// account settings (screen reader, braille), use the microphone or AI are not
// clicked. Print is stubbed. Results: results/<app>-mouse.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS, keyFor } from './lib.mjs';

const APP = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'docs';
const NEW = { docs: 'https://docs.new', sheets: 'https://sheets.new', slides: 'https://slides.new' }[APP];
const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const OUT = path.join(RESULTS, `${APP}-mouse.json`);
// Print is left out too: in Sheets its settings page was followed by a save error
// that blocked the page (Ctrl+P was already checked with the keyboard).
// Only Print itself ("인쇄", "인쇄 (Ctrl+P)"), not "인쇄 불가 문자 표시".
const SKIP = /스크린 리더|점자|음성 입력|음성기록|Gemini|확장 프로그램|^인쇄( \(|$)/;

const { context, worker } = await launch({ headless: false });
await context.addInitScript(() => { window.print = () => {}; });
const page = await context.newPage();
// Keys are written as on Windows; on a Mac every press goes through keyFor() (lib.mjs).
const pressKey = page.keyboard.press.bind(page.keyboard);
page.keyboard.press = (k, opts) => pressKey(keyFor(k, APP), opts);
page.setDefaultTimeout(8000);
// Leaving version history asks "나가시겠습니까?"; answer yes.
page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
let fileUrl = '';
await page.setViewportSize({ width: 1700, height: 950 });
const results = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
const docsEditor = () => page.evaluate(() => {
  const d = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
  d.querySelector('[contenteditable]').focus();
});
async function sheetCell(ref) {
  const box = page.locator('#t-name-box');
  await box.click();
  await box.fill(ref);
  await box.press('Enter');
  await page.waitForTimeout(400);
}
// Something selected, so formatting items are enabled.
async function select() {
  if (APP === 'docs') { await docsEditor(); await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+End'); }
  if (APP === 'sheets') await sheetCell('A1:B2');
  if (APP === 'slides') await slideBox();
  await page.waitForTimeout(300);
}
// The middle of the slide's title box (the topmost box; the slide itself is the
// largest g#editor-*).
const titleBox = () => page.evaluate(() => {
  const boxes = [...document.querySelectorAll('#workspace g[id^="editor-"]')]
    .filter((g) => !/-bg$|-paragraph-/.test(g.id))
    .map((g) => g.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  if (boxes.length < 2) return null;
  const whole = boxes.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const top = boxes.filter((b) => b !== whole).sort((a, b) => a.y - b.y)[0];
  return { x: top.x + top.width / 2, y: top.y + top.height / 2 };
});
// The middle of the title's words on the canvas (the slide list has the same boxes).
const titleText = () => page.evaluate(() => {
  const r = [...document.querySelectorAll('#workspace g[id*="-paragraph-"]')]
    .map((g) => g.getBoundingClientRect())
    .filter((b) => b.width > 0 && b.height > 0)
    .sort((a, b) => a.y - b.y)[0];
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
});
// The title box selected as an object: click its words (the empty part of the box does
// not take a click), then Esc selects the box itself. With Ctrl+A taking both boxes, Cut
// and Copy were off; placeholders cannot be grouped, so Group stays off either way.
async function slideBox() {
  await esc();
  const at = (await titleText()) || (await titleBox());
  if (!at) return;
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(500);
  await esc();
}
// Sheets sometimes answers a run of quick edits with "변경사항이 저장되지 않았는데 오류가
// 발생했습니다" and a box that blocks the page; reload as the box asks, and note it.
const saveErrors = [];
async function recover() {
  const box = page.getByRole('button', { name: '새로고침', exact: true }).filter({ visible: true });
  if (!(await box.count())) return;
  saveErrors.push(results.length ? results[results.length - 1].name : '(시작)');
  console.log('save error after:', saveErrors[saveErrors.length - 1]);
  await box.first().click().catch(() => {});
  await page.waitForSelector('#docs-menubar', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(4000);
}
async function settle() {
  await recover();
  for (const p of context.pages()) if (p !== page) await p.close().catch(() => {});
  if (!/\/edit/.test(page.url())) { await page.goBack().catch(() => {}); await page.waitForTimeout(2000); }
  await esc(); await esc();
  // Undo what a click may have switched: hidden menus, viewing/suggesting mode.
  if (!(await page.locator('#docs-menubar').isVisible())) { await page.keyboard.press('Control+Shift+KeyF'); await page.waitForTimeout(800); }
  // Still no menus (version history and the like): open the file again.
  if (!(await page.locator('#docs-menubar').isVisible())) {
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#docs-menubar', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(3000);
    // Ctrl+Shift+F pressed in version history above may have hidden the menus for good.
    if (!(await page.locator('#docs-menubar').isVisible())) { await page.keyboard.press('Control+Shift+KeyF'); await page.waitForTimeout(1000); }
  }
  const switcher = page.locator('#docs-toolbar-mode-switcher');
  const mode = (await switcher.count()) ? await switcher.innerText().catch(() => '') : '';
  if (mode && !/수정/.test(mode)) { await page.keyboard.press('Control+Alt+Shift+KeyZ'); await page.waitForTimeout(800); }
  await select();
}

await page.goto(NEW, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.docs-title-input', { state: 'attached', timeout: 60000 });
await page.waitForTimeout(4000);
// "Hide the menus" (Ctrl+Shift+F) is remembered per account; an earlier click on
// View › Hide the menus leaves the title hidden. Show the menus again.
if (!(await page.locator('.docs-title-input').isVisible())) {
  await page.keyboard.press('Control+Shift+KeyF');
  await page.waitForTimeout(1500);
  console.log('menus were hidden; shown again:', await page.locator('.docs-title-input').isVisible());
}
fileUrl = page.url();
console.log('test file:', fileUrl);
await page.locator('.docs-title-input').click();
await page.keyboard.press('Control+A');
await page.keyboard.type(TITLE);
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
if (APP === 'docs') {
  await page.locator('.kix-appview-editor').click({ position: { x: 500, y: 150 } });
  await page.keyboard.type('손빠르미 마우스 점검 첫째 줄');
  await page.keyboard.press('Enter');
  await page.keyboard.type('둘째 줄');
}
// Words in the title, so the text formatting items have something to work on.
if (APP === 'slides') {
  const at = await titleBox();
  if (at) { await page.mouse.click(at.x, at.y); await page.waitForTimeout(500); await page.keyboard.type('Quickhand mouse check'); await esc(); await esc(); }
}
if (APP === 'sheets') {
  await sheetCell('A1');
  for (const v of ['Name', 'Score']) { await page.keyboard.type(v); await page.keyboard.press('Tab'); }
  await page.keyboard.press('Enter');
}
await page.waitForTimeout(1000);

// The items of an open menu: the top menu is the first one on screen, an open submenu
// the last. `menus` says how many are open, so a submenu that did not open (its item is
// off right now) is not mistaken for the menu under it.
const openItems = (which = 'last') => page.evaluate((which) => {
  const menus = [...document.querySelectorAll('.goog-menu')].filter((m) => m.offsetWidth);
  const menu = which === 'first' ? menus[0] : menus[menus.length - 1];
  const items = menu ? [...menu.querySelectorAll('.goog-menuitem')].filter((i) => i.offsetWidth).map((i) => ({
    label: ((i.querySelector('.goog-menuitem-label') || i).innerText || '').replace(/\s+/g, ' ').trim(),
    accel: ((i.querySelector('.goog-menuitem-accel') || {}).innerText || '').trim(),
    sub: i.getAttribute('aria-haspopup') === 'true',
    off: i.getAttribute('aria-disabled') === 'true' || i.classList.contains('goog-menuitem-disabled'),
  })) : [];
  return { menus: menus.length, items };
}, which);
// The i-th visible item of the first or last open menu. Items are found again by their
// name (what is in a menu changes with what is selected), then clicked by place.
const item = (which, i) => page.locator('.goog-menu').filter({ visible: true })[which]().locator('.goog-menuitem').filter({ visible: true }).nth(i);
const tops = await page.locator('#docs-menubar [role="menuitem"]').evaluateAll((els) => els.filter((e) => e.offsetWidth && e.id).map((e) => ({ id: '#' + e.id, name: e.innerText.trim() })));

const found = [];
const closedSubs = [];
for (const top of tops) {
  if (SKIP.test(top.name)) continue;
  await settle();
  await page.locator(top.id).click();
  await page.waitForTimeout(600);
  for (const [i, it] of (await openItems('first')).items.entries()) {
    if (it.accel) found.push({ path: [top.id], label: it.label, accel: it.accel });
    if (it.sub && !SKIP.test(it.label)) {
      await item('first', i).hover({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(700);
      const sub = await openItems('last');
      if (sub.menus < 2) { closedSubs.push(`${top.name} › ${it.label}`); continue; }
      for (const s of sub.items) if (s.accel) found.push({ path: [top.id, it.label], label: s.label, accel: s.accel });
    }
  }
  console.log(top.name, 'items with a shortcut so far:', found.length);
  await esc(); await esc();
}
console.log('menu items with a shortcut:', found.length);
// Version history replaces the editor with its own view; click it last.
found.sort((x, y) => /버전 기록|Version history/.test(x.label) - /버전 기록|Version history/.test(y.label));

// Toolbar buttons whose tooltip shows a shortcut.
await settle();
const buttons = await page.evaluate(() => [...document.querySelectorAll('[data-tooltip]')].filter((b) => b.offsetWidth && b.closest('#docs-toolbar, .docs-toolbar, #docs-toolbar-wrapper') && /\(.+\)\s*$/.test(b.getAttribute('data-tooltip')))
  .map((b) => ({ id: b.id, tip: b.getAttribute('data-tooltip') })));
console.log('toolbar buttons with a shortcut:', buttons.length);
for (const b of buttons) {
  if (SKIP.test(b.tip)) { results.push({ kind: 'toolbar', name: '툴바 ' + b.tip, skipped: '누르지 않음' }); continue; }
  await settle();
  const r = await check(page, worker, '툴바 ' + b.tip, () => page.locator(b.id ? '#' + b.id : `[data-tooltip="${b.tip}"]`).first().click(), { wait: 1500 });
  results.push({ kind: 'toolbar', accel: b.tip.replace(/^.*\((.+)\)\s*$/, '$1'), ...r });
  save();
}

for (const f of found) {
  const name = `${f.path.length > 1 ? f.path[1] + ' › ' : ''}${f.label} (${f.accel})`;
  if (SKIP.test(f.label) || SKIP.test(f.path.join(' '))) {
    results.push({ kind: 'menu', name, accel: f.accel, skipped: '계정 설정이 바뀌거나 마이크·AI를 써서 누르지 않음' });
    continue;
  }
  await settle();
  // Open the menu (and submenu) and find the item by its name before clicking it.
  await page.locator(f.path[0]).click();
  await page.waitForTimeout(500);
  let which = 'first';
  let missing = null;
  if (f.path.length > 1) {
    const at = (await openItems('first')).items.findIndex((it) => it.label === f.path[1]);
    if (at < 0) missing = '하위 메뉴를 찾지 못함';
    else {
      await item('first', at).hover({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(700);
      if ((await openItems('last')).menus < 2) missing = '하위 메뉴가 꺼져 있어 열리지 않음';
      which = 'last';
    }
  }
  const menu = missing ? null : await openItems(which);
  // Slides has two "복사" (Ctrl+C and Ctrl+D), so the key is part of the match.
  const at = menu ? menu.items.findIndex((it) => it.label === f.label && it.accel === f.accel) : -1;
  if (!missing && at < 0) missing = '메뉴에서 항목을 찾지 못함';
  if (!missing && menu.items[at].off) missing = '이 상태에서는 메뉴가 꺼져 있어 누를 수 없음';
  if (missing) {
    results.push({ kind: 'menu', name, accel: f.accel, skipped: missing });
    console.log(JSON.stringify(results[results.length - 1]));
    await esc(); await esc();
    save();
    continue;
  }
  const r = await check(page, worker, name, () => item(which, at).click(), { wait: 1500 });
  results.push({ kind: 'menu', accel: f.accel, ...r });
  save();
}

if (closedSubs.length) results.push({ kind: 'note', closedSubmenus: closedSubs });

if (saveErrors.length) results.push({ kind: 'note', saveErrorsAfter: saveErrors });
save();
await context.close();
