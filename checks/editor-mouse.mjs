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
import { launch, check, RESULTS } from './lib.mjs';

const APP = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'docs';
const NEW = { docs: 'https://docs.new', sheets: 'https://sheets.new', slides: 'https://slides.new' }[APP];
const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const OUT = path.join(RESULTS, `${APP}-mouse.json`);
// Print is left out too: in Sheets its settings page was followed by a save error
// that blocked the page (Ctrl+P was already checked with the keyboard).
const SKIP = /스크린 리더|점자|음성 입력|Gemini|확장 프로그램|인쇄/;

const { context, worker } = await launch({ headless: false });
await context.addInitScript(() => { window.print = () => {}; });
const page = await context.newPage();
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
  if (APP === 'slides') { await esc(); const box = page.locator('.punch-viewer-svgpage-svgcontainer, #workspace').first(); await box.click({ position: { x: 300, y: 120 } }).catch(() => {}); }
  await page.waitForTimeout(300);
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
if (APP === 'sheets') {
  await sheetCell('A1');
  for (const v of ['Name', 'Score']) { await page.keyboard.type(v); await page.keyboard.press('Tab'); }
  await page.keyboard.press('Enter');
}
await page.waitForTimeout(1000);

// Every item (one submenu deep) of each top menu that shows a shortcut.
const openItems = () => page.evaluate(() => {
  const menu = [...document.querySelectorAll('.goog-menu')].filter((m) => m.offsetWidth).pop();
  return menu ? [...menu.querySelectorAll('.goog-menuitem')].filter((i) => i.offsetWidth).map((i) => ({
    label: ((i.querySelector('.goog-menuitem-label') || i).innerText || '').replace(/\s+/g, ' ').trim(),
    accel: ((i.querySelector('.goog-menuitem-accel') || {}).innerText || '').trim(),
    sub: i.getAttribute('aria-haspopup') === 'true',
  })) : [];
});
// The i-th visible item of the menu on top (names in Sheets carry a hidden access letter,
// so the place in the menu is the reliable way to find an item again).
const item = (i) => page.locator('.goog-menu').filter({ visible: true }).last().locator('.goog-menuitem').filter({ visible: true }).nth(i);
const tops = await page.locator('#docs-menubar [role="menuitem"]').evaluateAll((els) => els.filter((e) => e.offsetWidth && e.id).map((e) => ({ id: '#' + e.id, name: e.innerText.trim() })));

const found = [];
for (const top of tops) {
  if (SKIP.test(top.name)) continue;
  await settle();
  await page.locator(top.id).click();
  await page.waitForTimeout(600);
  for (const [i, it] of (await openItems()).entries()) {
    if (it.accel) found.push({ path: [top.id], at: [i], label: it.label, accel: it.accel });
    if (it.sub && !SKIP.test(it.label)) {
      await page.locator('.goog-menu').filter({ visible: true }).first().locator('.goog-menuitem').filter({ visible: true }).nth(i).hover({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(700);
      for (const [j, sub] of (await openItems()).entries()) if (sub.accel) found.push({ path: [top.id, it.label], at: [i, j], label: sub.label, accel: sub.accel });
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
  const r = await check(page, worker, name, async () => {
    await page.locator(f.path[0]).click();
    await page.waitForTimeout(500);
    const first = page.locator('.goog-menu').filter({ visible: true }).first().locator('.goog-menuitem').filter({ visible: true }).nth(f.at[0]);
    if (f.at.length > 1) { await first.hover(); await page.waitForTimeout(700); await item(f.at[1]).click(); } else await first.click();
  }, { wait: 1500 });
  results.push({ kind: 'menu', accel: f.accel, ...r });
  save();
}


if (saveErrors.length) results.push({ kind: 'note', saveErrorsAfter: saveErrors });
save();
await context.close();
