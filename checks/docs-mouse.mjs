// Google Docs with the mouse: click every menu item and toolbar button that shows a
// shortcut, and check that Quickhand recognizes the click as that shortcut.
//
// Works in a new document named "손빠르미 단축키 점검 문서 (지워도 됨)". Items that
// change account settings (screen reader, braille) are not clicked. Print is stubbed.
// Results: results/docs-mouse.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const OUT = path.join(RESULTS, 'docs-mouse.json');
const SKIP = /스크린 리더|점자|음성 입력|Gemini/; // account settings, microphone, AI

const { context, worker } = await launch({ headless: false });
await context.addInitScript(() => { window.print = () => {}; });
const page = await context.newPage();
page.setDefaultTimeout(8000);
await page.setViewportSize({ width: 1600, height: 950 });
const results = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

const editor = () => page.evaluate(() => {
  const d = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
  d.querySelector('[contenteditable]').focus();
});
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
async function settle() {
  for (const p of context.pages()) if (p !== page) await p.close().catch(() => {});
  await esc(); await esc();
  // Undo what a click may have switched: hidden menus, viewing/suggesting mode.
  if (!(await page.locator('#docs-menubar').isVisible())) { await editor(); await page.keyboard.press('Control+Shift+KeyF'); await page.waitForTimeout(800); }
  const mode = await page.locator('#docs-toolbar-mode-switcher').innerText().catch(() => '');
  if (mode && !/수정/.test(mode)) { await editor(); await page.keyboard.press('Control+Alt+Shift+KeyZ'); await page.waitForTimeout(800); }
  await editor();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Shift+End'); // a selection, so formatting items are enabled
  await page.waitForTimeout(300);
}

await page.goto('https://docs.new', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#boldButton', { timeout: 60000 });
await page.waitForTimeout(3000);
console.log('test document:', page.url());
await page.locator('.docs-title-input').click();
await page.keyboard.press('Control+A');
await page.keyboard.type(TITLE);
await page.keyboard.press('Enter');
await page.locator('.kix-appview-editor').click({ position: { x: 500, y: 150 } });
await page.keyboard.type('손빠르미 마우스 점검 첫째 줄');
await page.keyboard.press('Enter');
await page.keyboard.type('둘째 줄');
await page.waitForTimeout(1000);

// Every item (one submenu deep) of a top menu that shows a shortcut: [path, label, accel].
const MENUS = ['#docs-file-menu', '#docs-edit-menu', '#docs-view-menu', '#docs-insert-menu', '#docs-format-menu', '#docs-tools-menu', '#docs-help-menu', '#docs-accessibility-menu'];
const openItems = () => page.evaluate(() => [...document.querySelectorAll('.goog-menu')].filter((m) => m.offsetWidth).pop()
  ? [...[...document.querySelectorAll('.goog-menu')].filter((m) => m.offsetWidth).pop().querySelectorAll('.goog-menuitem')].filter((i) => i.offsetWidth).map((i) => ({
    label: ((i.querySelector('.goog-menuitem-label') || i).innerText || '').replace(/\s+/g, ' ').trim(),
    accel: ((i.querySelector('.goog-menuitem-accel') || {}).innerText || '').trim(),
    sub: i.getAttribute('aria-haspopup') === 'true',
  })) : []);
const item = (label) => page.locator('.goog-menu .goog-menuitem').filter({ visible: true }).filter({ has: page.locator('.goog-menuitem-label', { hasText: label }) }).last();

const found = [];
for (const top of MENUS) {
  await settle();
  if (!(await page.locator(top).count())) continue;
  await page.locator(top).click();
  await page.waitForTimeout(600);
  const items = await openItems();
  for (const it of items) {
    if (it.accel) found.push({ path: [top], label: it.label, accel: it.accel });
    if (it.sub) {
      await item(it.label).hover().catch(() => {});
      await page.waitForTimeout(700);
      for (const s of await openItems()) if (s.accel) found.push({ path: [top, it.label], label: s.label, accel: s.accel });
    }
  }
  await esc(); await esc();
}
console.log('menu items with a shortcut:', found.length);

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
    if (f.path[1]) { await item(f.path[1]).hover(); await page.waitForTimeout(700); }
    await item(f.label).click();
  }, { wait: 1500 });
  results.push({ kind: 'menu', accel: f.accel, ...r });
  save();
}

// Toolbar buttons whose tooltip shows a shortcut.
await settle();
const buttons = await page.evaluate(() => [...document.querySelectorAll('#docs-toolbar [data-tooltip]')].filter((b) => b.offsetWidth && /\(.+\)\s*$/.test(b.getAttribute('data-tooltip')))
  .map((b) => ({ id: b.id, tip: b.getAttribute('data-tooltip') })));
console.log('toolbar buttons with a shortcut:', buttons.length);
for (const b of buttons) {
  await settle();
  const r = await check(page, worker, '툴바 ' + b.tip, () => page.locator(b.id ? '#' + b.id : `[data-tooltip="${b.tip}"]`).first().click(), { wait: 1500 });
  results.push({ kind: 'toolbar', accel: b.tip.replace(/^.*\((.+)\)\s*$/, '$1'), ...r });
  save();
}
await settle();
save();
await context.close();
