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

fs.writeFileSync(path.join(RESULTS, 'google.json'), JSON.stringify({ docUrl, results }, null, 2));
console.log('DOC', docUrl);
await context.close();
