// Google Docs, Drive and Gmail with a signed-in check profile (see login.mjs).
// Only a test document made here is edited; in Gmail only controls that don't
// change mail are clicked (compose is closed empty, so no draft is saved).
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS } from './lib.mjs';

const TITLE = '손빠르미 점검용 (지워도 됨)';
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const want = (site) => !only.length || only.includes(site);

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
const results = [];
const run = async (name, step, opts) => results.push(await check(page, worker, name, step, opts));
const shown = (locator) => locator.filter({ visible: true }).first();

await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded' });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN: run `node login.mjs`, sign in, close the window, then run this again.');
  await context.close();
  process.exit(1);
}

let docUrl = null;
if (want('docs')) {
  await page.goto('https://docs.new', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boldButton', { timeout: 60000 });
  docUrl = page.url();
  await page.locator('.docs-title-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(TITLE);
  await page.keyboard.press('Enter');
  await page.locator('.kix-appview-editor').click();
  await page.keyboard.type('손빠르미 점검');
  await page.keyboard.press('Shift+Home');
  await run('문서 굵게 버튼', () => page.locator('#boldButton').click());
  await run('문서 기울임꼴 버튼', () => page.locator('#italicButton').click());
  await run('문서 밑줄 버튼', () => page.locator('#underlineButton').click());
  await run('문서 실행취소 버튼', () => page.locator('#undoButton').click());
  await run('문서 수정 메뉴 → 모두 선택', async () => {
    await page.locator('#docs-edit-menu').click();
    await shown(page.locator('[role="menuitem"]', { hasText: '모두 선택' })).click();
  });
  await run('문서 Ctrl+B 키', () => page.keyboard.press('Control+B'));
}

// A new Sheets or Slides file named TITLE, so only test files are changed.
async function newEditorFile(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.docs-title-input', { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.locator('.docs-title-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(TITLE);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
}
const tip = (start) => shown(page.locator(`[data-tooltip^="${start}"]`));
const menuItem = (name) => shown(page.locator('.goog-menuitem, [role="menuitem"]', { hasText: name }));
// Menubar entries by their ids, which stay the same in every UI language.
const MENUS = { 수정: '#docs-edit-menu', 보기: '#docs-view-menu', 삽입: '#docs-insert-menu', 서식: '#docs-format-menu', 슬라이드: '#punch-slide-menu' };
const topMenu = (name) => shown(page.locator(MENUS[name]));

if (want('sheets')) {
  // Wider than the other checks: at 1280px Sheets folds italic and more into its overflow menu.
  await page.setViewportSize({ width: 1600, height: 900 });
  await newEditorFile('https://sheets.new');
  // Type into A1, then select it again for the formatting buttons.
  const grid = page.locator('#waffle-grid-container');
  const box = await grid.boundingBox();
  await page.mouse.click(box.x + 80, box.y + 30);
  await page.keyboard.type('손빠르미 점검');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await run('시트 굵게 버튼', () => tip('굵게').click());
  await run('시트 기울임꼴 버튼', () => tip('기울임').click());
  await run('시트 실행취소 버튼', () => tip('실행취소').click());
  await run('시트 수정 메뉴 → 찾기 및 바꾸기', async () => {
    await topMenu('수정').click();
    await menuItem('찾기 및 바꾸기').click();
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  // Shown with no shortcut on screen: matched by name (Shift+F11).
  await run('시트 시트 추가 버튼', () => shown(page.locator('.docs-sheet-add-button, [aria-label="시트 추가"]')).click());
  // Clicking another sheet's tab switches sheets (Alt+↓ / Alt+↑).
  await run('시트 다른 시트 탭 클릭', () => shown(page.locator('.docs-sheet-tab:not(.docs-sheet-active-tab)')).click());
  // Menu items whose shown shortcut is a function key with Shift.
  await run('시트 삽입 메뉴 → 시트 (Shift+F11)', async () => {
    await topMenu('삽입').click();
    await menuItem(/시트.*Shift\+F11/).click(); // the text also holds a hidden letter hint, "시트(S)"
  });
  await run('시트 삽입 메뉴 → 메모 (Shift+F2)', async () => {
    await topMenu('삽입').click();
    await menuItem(/메모.*Shift\+F2/).click();
  });
  await page.keyboard.press('Escape');
  await page.mouse.click(box.x + 80, box.y + 30);
  // Format › Align › Left: an item inside a submenu.
  await run('시트 서식 메뉴 → 정렬 → 왼쪽', async () => {
    await topMenu('서식').click();
    await menuItem(/^\s*정렬/).hover();
    await page.waitForTimeout(600);
    const left = menuItem(/^\s*왼쪽/);
    await left.click();
  });
  // Column letters and row numbers: Ctrl+Space / Shift+Space.
  const strip = (sel) => page.locator(sel).first().boundingBox();
  const cols = await strip('.column-headers-background');
  const rows = await strip('.row-headers-background');
  await run('시트 열 머리글(B) 클릭', () => page.mouse.click(cols.x + 46 + 100 + 50, cols.y + 10));
  await run('시트 행 번호(3) 클릭', () => page.mouse.click(rows.x + 20, rows.y + 24 + 21 * 2 + 10));
  await run('시트 Shift+Space 키 (셀 선택 중)', async () => {
    await page.mouse.click(box.x + 200, box.y + 80);
    await page.waitForTimeout(800); // like a person, not instantly after the click
    await page.keyboard.press('Shift+Space');
  });
  await run('시트 Shift+Space 키 (셀에 입력 중, 기록 안 돼야 함)', async () => {
    await page.mouse.click(box.x + 200, box.y + 100);
    await page.keyboard.type('ab');
    await page.keyboard.press('Shift+Space');
  });
  await page.keyboard.press('Escape');
  await run('시트 Ctrl+B 키', async () => {
    await page.mouse.click(box.x + 80, box.y + 30);
    await page.keyboard.press('Control+B');
  });
}

if (want('slides')) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newEditorFile('https://slides.new');
  await page.keyboard.press('Escape'); // a theme panel may open for a new presentation
  await run('슬라이드 새 슬라이드 버튼', () => tip('새 슬라이드').click());
  await run('슬라이드 실행취소 버튼', () => tip('실행취소').click());
  // Shown with no shortcut on screen: matched by name (Ctrl+D).
  await run('슬라이드 슬라이드 메뉴 → 슬라이드 복사', async () => {
    await topMenu('슬라이드').click();
    await menuItem(/슬라이드 (복사|복제)/).click();
  });
  await page.keyboard.press('Escape'); // close any menu left open
  // Shown with no shortcut on screen: matched by name (Ctrl+Alt+Shift+S).
  await run('슬라이드 보기 메뉴 → 발표자 노트', async () => {
    await topMenu('보기').click();
    await menuItem('발표자 노트').click();
  });
  await run('슬라이드 Ctrl+M 키', async () => {
    await page.keyboard.press('Escape');
    await page.locator('.punch-filmstrip-thumbnail, [class*="filmstrip"]').first().click().catch(() => {});
    await page.keyboard.press('Control+M');
  });
}

if (want('drive')) {
  await page.goto('https://drive.google.com/drive/recent', { waitUntil: 'domcontentloaded' });
  const file = shown(page.locator('[role="row"], [role="gridcell"], [data-id]', { hasText: TITLE }));
  await file.waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  const menu = (label) => shown(page.locator('[role="menuitem"]', { hasText: label }));
  const openInfo = async () => {
    await file.click({ button: 'right' });
    await menu('파일 정보').hover();
    await page.waitForTimeout(500);
  };
  await run('드라이브 파일 정보 → 세부정보', async () => {
    await openInfo();
    await menu('세부정보').click();
  });
  await page.keyboard.press('Escape');
  await run('드라이브 파일 정보 → 활동', async () => {
    await openInfo();
    await menu('활동').click();
  });
  await page.keyboard.press('Escape');
  await run('드라이브 이름 바꾸기 (열고 취소)', async () => {
    await file.click({ button: 'right' });
    await menu('이름 바꾸기').click();
  });
  await page.keyboard.press('Escape');
  await run('드라이브 링크 복사', async () => {
    await file.click({ button: 'right' });
    await menu('공유').hover();
    await page.waitForTimeout(500);
    await menu('링크 복사').click();
  });
}

if (want('gmail')) {
  await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="q"]', { timeout: 60000 });
  await page.waitForTimeout(3000);
  await run('Gmail 검색창', () => page.locator('input[name="q"]').click());
  await page.keyboard.press('Escape');
  await run('Gmail 보낸편지함', () => shown(page.locator('a[href$="#sent"]')).click(), { wait: 2500 });
  await run('Gmail 받은편지함', () => shown(page.locator('a[href$="#inbox"]')).click(), { wait: 2500 });
  await run('Gmail 편지쓰기', () => shown(page.locator('[role="button"]', { hasText: '편지쓰기' })).click(), { wait: 2500 });
  // Gmail's "pause mobile notifications" offer can cover the compose toolbar;
  // decline it ("취소") so nothing is granted.
  const offer = page.locator('div', { hasText: /^기기를 사용하는 동안 모바일 알림/ }).last();
  await offer.locator('xpath=ancestor-or-self::*[.//*[normalize-space()="취소"]][1]').getByText('취소', { exact: true }).first().click({ timeout: 3000 }).catch(() => {});
  // The formatting bar may be folded away behind the "Aa" (formatting options) button.
  const bold = page.locator('[role="dialog"] [data-tooltip^="굵게"]').filter({ visible: true });
  if (!(await bold.count())) await shown(page.locator('[role="dialog"] [data-tooltip="서식 지정 옵션"]')).click().catch(() => {});
  await run('Gmail 편지쓰기 창 굵게', () => bold.first().click());
  await run('Gmail 편지쓰기 창 링크 삽입', () => shown(page.locator('[role="dialog"] [data-tooltip^="링크 삽입"]')).click());
  await page.keyboard.press('Escape'); // close the link box without adding a link
  await page.waitForTimeout(500);
  // Close the untouched compose window; Gmail keeps no draft of an unedited one.
  await shown(page.locator('[role="dialog"] button[aria-label="저장 및 닫기"]')).click().catch(() => {});
  // Make sure no draft was left behind: list the newest drafts' dates.
  await page.goto('https://mail.google.com/mail/u/0/#drafts', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const drafts = await page.locator('tr.zA').evaluateAll((rows) => rows.slice(0, 3).map((r) => (r.querySelector('td.xW span') || {}).title || ''));
  console.log('NEWEST DRAFTS (dates):', JSON.stringify(drafts));
}

if (want('calendar')) {
  // Only controls that move around or open and close things; nothing is saved.
  await page.goto('https://calendar.google.com/calendar/u/0/r/week', { waitUntil: 'domcontentloaded' });
  const header = page.locator('[role="banner"], header').first();
  await header.locator('[jsname="P6mm8"]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  await run('캘린더 다음 기간', () => shown(header.locator('[jsname="OCpkoe"]')).click());
  await run('캘린더 이전 기간', () => shown(header.locator('[jsname="VfNHU"]')).click());
  await run('캘린더 오늘', () => shown(header.locator('[jsname="P6mm8"]')).click());
  await run('캘린더 보기 → 월', async () => {
    await shown(header.locator('button[aria-haspopup], [role="button"][aria-haspopup]').filter({ hasText: /^\s*주\s*$|주\s*▼|^주/ })).click();
    await shown(page.locator('[role="menuitem"], [role="menuitemradio"]', { hasText: '월' })).click();
  });
  await run('캘린더 보기 → 주', async () => {
    await shown(header.locator('button[aria-haspopup], [role="button"][aria-haspopup]').filter({ hasText: /월/ })).click();
    await shown(page.locator('[role="menuitem"], [role="menuitemradio"]', { hasText: '주' })).click();
  });
  await run('캘린더 검색', () => shown(header.locator('[aria-label="검색"]')).click());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await run('캘린더 만들기 (열고 닫기)', () => shown(page.locator('[jsname="todz4c"]')).click());
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await run('캘린더 C 키', () => page.keyboard.press('c'));
  // "C" opens the full new-event editor; leave it for the week view so nothing is saved.
  await page.goto('https://calendar.google.com/calendar/u/0/r/week', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const left = await page.evaluate(() => (document.querySelector('[role="main"]') || document.body).innerText);
  console.log('untitled events this week:', (left.match(/제목 없음|No title/g) || []).length);
}

fs.writeFileSync(path.join(RESULTS, 'google.json'), JSON.stringify({ docUrl, results }, null, 2));
console.log('DOC', docUrl);
await context.close();
