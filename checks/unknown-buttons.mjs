// Buttons Quickhand doesn't recognize: clicked in a new test spreadsheet and document, then
// what Quickhand kept (only button names and counts) and what the feedback form would add.
// Content (cells, sheet tabs, the title, the document's text) must not show up.
// Only new files named "손빠르미 단축키 점검 문서 (지워도 됨)" are used;
// `node cleanup.mjs --keep-login` moves them to the trash afterwards.
import { launch } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const { context, worker, extensionId } = await launch({ headless: false });
await worker.evaluate(() => chrome.storage.local.remove('qh_state'));
const page = await context.newPage();
await page.setViewportSize({ width: 1600, height: 900 });
const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const clicked = [];
async function click(what, locator) {
  try { await locator.click({ timeout: 8000 }); clicked.push(what); } catch (e) { clicked.push(what + ' (못 누름)'); }
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
async function newFile(url, ready, secret) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(ready, { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.locator('.docs-title-input').click({ timeout: 15000 }).catch(() => {});
  await page.keyboard.press('Control+A');
  await page.keyboard.type(TITLE);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  return secret;
}

// ---- Sheets: a word in a cell, then clicks.
await newFile('https://sheets.new', '#t-name-box');
const box = page.locator('#t-name-box');
await box.click(); await box.fill('B2'); await box.press('Enter');
await page.keyboard.type('비밀단어셀'); await page.keyboard.press('Enter');
await click('시트: 필터 만들기 버튼', visible('[aria-label^="필터 만들기"], [data-tooltip^="필터 만들기"]'));
await click('시트: 셀 병합 버튼', visible('[aria-label^="셀 병합"], [data-tooltip^="셀 병합"]'));
await click('시트: 데이터 메뉴', visible('#docs-menubar [role="menuitem"]', { hasText: /^데이터$/ }));
await click('시트: 셀 B2 (내용)', page.locator('#waffle-grid-container').first());
await click('시트: 시트 탭 (내용)', visible('.docs-sheet-tab'));
await click('시트: 제목 (내용)', visible('.docs-title-input'));

// ---- Docs: a word in the text, then clicks.
await newFile('https://docs.new', '#boldButton');
await page.locator('.kix-appview-editor').click();
await page.keyboard.type('비밀단어문서');
await click('문서: 표 삽입 버튼', visible('[aria-label^="표 삽입"], [data-tooltip^="표 삽입"], [aria-label^="표"]'));
await click('문서: 이미지 삽입 버튼', visible('[aria-label^="이미지 삽입"], [data-tooltip^="이미지 삽입"]'));
await click('문서: 본문 (내용)', page.locator('.kix-appview-editor').first());

const kept = await worker.evaluate(async () => {
  const { qh_state } = await chrome.storage.local.get('qh_state');
  return Object.values((qh_state && qh_state.unknown) || {});
});
console.log('\n누른 것:\n' + clicked.join('\n'));
console.log('\n손빠르미가 기록한 것 (사이트 · 이름 · 횟수 · 날):');
for (const u of kept) console.log(`${u.site} · ${u.label} · ${u.count} · ${u.last}`);
const leak = kept.filter((u) => /비밀단어|지워도 됨|시트1/.test(u.label));
console.log('\n내용이 섞인 기록:', leak.length ? JSON.stringify(leak) : '없음');

// ---- The feedback form, with "누른 버튼을 알아보지 못해요".
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
await popup.waitForTimeout(1500);
await popup.evaluate(() => { document.querySelector('#feedback').open = true; });
await popup.selectOption('#fb-kind', { index: 2 });
await popup.waitForTimeout(500);
console.log('\n체크 칸:', await popup.locator('#fb-unknown').isChecked());
console.log('\n의견 미리보기:\n' + (await popup.locator('#fb-preview').inputValue()).split('\n').slice(-8).join('\n'));
await context.close();
