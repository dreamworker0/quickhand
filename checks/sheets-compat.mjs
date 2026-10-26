// "호환되는 스프레드시트 단축키 사용" (Excel-style keys) in a real Sheets: Quickhand reads the
// switch from the keyboard shortcuts window (Ctrl+/) and counts Excel-style keys only while
// it is on. The setting belongs to the whole account, so it is turned on only for this
// check and always turned off again at the end, even if a step fails. Keys that change
// view settings (Ctrl+Shift+U formula bar, Ctrl+F1 full screen) are not pressed.
//
// Only a new spreadsheet named "손빠르미 단축키 점검 문서 (지워도 됨)" is edited;
// `node cleanup.mjs --keep-login` moves it to the trash afterwards.
// Results: results/sheets-compat.json and a table in the console.
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
const results = [];

async function recover() {
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: '오류 발생', visible: true });
  if (!(await dialog.count())) return;
  console.log('Sheets asked to reload; reloading');
  await dialog.first().getByRole('button', { name: '새로고침' }).first().click().catch(() => {});
  await page.waitForSelector('#t-name-box', { timeout: 60000 });
  await page.waitForTimeout(6000);
}
async function go(ref) {
  await recover();
  await page.keyboard.press('Escape');
  const box = page.locator('#t-name-box');
  await box.click();
  await box.fill(ref);
  await box.press('Enter');
  await page.waitForTimeout(500);
}
const shortcutsWindow = () => page.locator('[role="dialog"]').filter({ hasText: '키보드 단축키', visible: true }).first();
async function openWindow() {
  await recover();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Slash');
  await shortcutsWindow().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
}
const switchOn = async () => (await shortcutsWindow().locator('[role="switch"]').first().getAttribute('aria-checked')) === 'true';
// Turn the switch to `on` with a click (as a person would), then close the window.
async function setCompat(on) {
  await openWindow();
  if ((await switchOn()) !== on) await shortcutsWindow().locator('[role="switch"]').first().click();
  await page.waitForTimeout(1800); // Quickhand reads it 0.8 s after the click
  const now = await switchOn();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  return now;
}
const remembered = () => worker.evaluate(async () => (await chrome.storage.local.get('qh_sheets_compat')).qh_sheets_compat);
const bold = () => page.evaluate(() => !!document.querySelector('#t-bold[aria-pressed="true"]'));

async function key(name, ref, keys, expected, after) {
  await go(ref);
  await page.waitForTimeout(5500); // the name box's own hint card goes away first
  const boldBefore = await bold();
  const r = await check(page, worker, name, () => page.keyboard.press(keys), { wait: 1200 });
  const boldAfter = await bold();
  const row = { name, expected, recognized: r.recognized, card: (r.card || '').replace(/\s+/g, ' ').slice(0, 60), bold: `${boldBefore} → ${boldAfter}`, ok: r.recognized === expected, error: r.error };
  results.push(row);
  if (after) await after();
  return row;
}

let ended = 'unknown';
try {
  await page.goto('https://sheets.new', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#t-name-box', { timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.locator('.docs-title-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(TITLE);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await go('B2'); await page.keyboard.type('abc'); await page.keyboard.press('Enter');
  await go('B3'); await page.keyboard.type('def'); await page.keyboard.press('Enter');
  await worker.evaluate(() => chrome.storage.local.remove('qh_sheets_compat'));

  // Off: Ctrl+2 does nothing in Sheets and is not counted.
  results.push({ name: '설정 꺼짐 확인', expected: false, recognized: await setCompat(false), ok: true });
  await key('꺼짐: Ctrl+2', 'B2', 'Control+Digit2', null);
  // On, read from the window.
  const on = await setCompat(true);
  const memo = await remembered();
  results.push({ name: '설정 켬 → 손빠르미가 읽음', expected: true, recognized: `스위치 ${on}, 기억 ${memo}`, ok: on === true && memo === true });
  await key('켜짐: Ctrl+2 (굵게)', 'B2', 'Control+Digit2', 'sheets:mod+b', () => page.keyboard.press('Control+KeyZ'));
  await key('켜짐: Ctrl+3 (기울임)', 'B2', 'Control+Digit3', 'sheets:mod+i', () => page.keyboard.press('Control+KeyZ'));
  await key('켜짐: Ctrl+9 (행 숨기기, 바로 되돌림)', 'B3', 'Control+Digit9', 'sheets:mod+alt+9', () => page.keyboard.press('Control+KeyZ'));
  await key('켜짐: Ctrl+B (늘 쓰는 키)', 'B2', 'Control+KeyB', 'sheets:mod+b', () => page.keyboard.press('Control+KeyZ'));
  // Off again.
  const off = await setCompat(false);
  const memo2 = await remembered();
  results.push({ name: '설정 끔 → 손빠르미가 읽음', expected: false, recognized: `스위치 ${off}, 기억 ${memo2}`, ok: off === false && memo2 === false });
  await key('다시 꺼짐: Ctrl+2', 'B2', 'Control+Digit2', null);
} catch (e) {
  results.push({ name: '중단', ok: false, error: e.message.split('\n')[0] });
} finally {
  // Whatever happened above, the account setting ends off.
  for (let i = 0; i < 3; i++) {
    try { ended = (await setCompat(false)) ? 'on' : 'off'; if (ended === 'off') break; } catch (e) { await page.reload().catch(() => {}); await page.waitForTimeout(8000); }
  }
  results.push({ name: '끝: 설정 꺼짐', expected: 'off', recognized: ended, ok: ended === 'off' });
}

fs.writeFileSync(path.join(RESULTS, 'sheets-compat.json'), JSON.stringify(results, null, 2));
console.log('\n' + results.map((r) => `${r.ok ? 'OK  ' : 'FAIL'} ${r.name} | 기대 ${r.expected ?? '없음'} | 결과 ${r.recognized ?? '없음'}${r.bold ? ' | 굵게 ' + r.bold : ''}${r.card ? ' | 카드 ' + r.card : ''}${r.error ? ' | 오류 ' + r.error : ''}`).join('\n'));
await context.close();
