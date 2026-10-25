// Google Calendar with the mouse: click the buttons and menu items that do what a
// help-page shortcut does, and check that Quickhand shows a card for each.
// Only the test event "[손빠르미 점검] 시험 일정 (마우스)" is made, edited and deleted;
// it has no guests, so no mail goes out. Results: results/calendar-mouse.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS } from './lib.mjs';

const MARK = '[손빠르미 점검]';
const TITLE = `${MARK} 시험 일정 (마우스)`;
const BASE = 'https://calendar.google.com/calendar/u/0/r';

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const results = [];
const run = async (name, step, opts) => results.push(await check(page, worker, '캘린더 ' + name, step, opts));
const shown = (locator) => locator.filter({ visible: true }).first();
const visible = (sel) => shown(page.locator(sel));
const open = async (where) => {
  await page.goto(`${BASE}/${where}`, { waitUntil: 'domcontentloaded' });
  await visible('[role="main"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
};
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); };
const header = page.locator('[role="banner"], header').first();
const menuItem = (name) => shown(page.locator('[role="menuitem"], [role="menuitemradio"], [role="option"]', { hasText: name }));

await page.goto(`${BASE}/week`, { waitUntil: 'domcontentloaded' });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN: run `node login.mjs`, sign in, close the window, then run this again.');
  await context.close();
  process.exit(1);
}
await open('week');
// The keyboard check taught Quickhand these shortcuts; forget Calendar so cards show again.
await worker.evaluate(async () => {
  const { qh_state } = await chrome.storage.local.get('qh_state');
  for (const id of Object.keys(qh_state.actions)) if (id.startsWith('calendar:')) delete qh_state.actions[id];
  qh_state.lastAlertAt = 0;
  qh_state.lastNewAlertAt = 0;
  await chrome.storage.local.set({ qh_state });
});
const chip = () => page.locator('[role="main"] [data-eventid]', { hasText: MARK }).filter({ visible: true }).first();
const guard = async () => {
  const d = await visible('[role="dialog"]').innerText();
  if (!d.includes(MARK)) throw new Error('시험 일정이 아님');
};

// Whatever goes wrong, the cleanup at the end still runs.
let stopped = null;
try {
// ---- 캘린더 내 이동하기 (j/n, t, /, s, +)
await run('다음 기간', () => shown(header.locator('[jsname="OCpkoe"]')).click());
await run('이전 기간', () => shown(header.locator('[jsname="VfNHU"]')).click());
await run('오늘', () => shown(header.locator('[jsname="P6mm8"]')).click());
await run('검색 버튼', () => shown(header.locator('[aria-label="검색"]')).click());
await esc();
await run('설정 메뉴 → 설정', async () => {
  await shown(header.locator('[aria-label="설정 메뉴"]')).click();
  await menuItem(/^\s*설정\s*$/).click();
}, { wait: 2500 });
await open('week');
await run('설정 메뉴 → 인쇄', async () => {
  await shown(header.locator('[aria-label="설정 메뉴"]')).click();
  await menuItem(/^\s*인쇄\s*$/).click();
}, { wait: 2500 });
await esc(); // closes the print preview; nothing is printed
// "+" jumps to the sidebar's people box.
await run('사용자 검색 칸', () => visible('input[aria-label="사용자 검색"]').click());
await esc();

// ---- 캘린더 뷰 변경하기 (1/d, 2/w, 3/m, 4/x, 5/a, y)
const viewMenu = () => shown(header.locator('[jsname="jnPWCc"]'));
// Each item prints its key after the name: "일D", "4일X".
for (const [name, label] of [['일', /^\s*일\s*D\s*$/], ['월', /^\s*월\s*M\s*$/], ['연도', /^\s*연도\s*Y\s*$/], ['일정', /^\s*일정\s*A\s*$/], ['4일', /^\s*4일\s*X\s*$/], ['주', /^\s*주\s*W\s*$/]]) {
  await run(`보기 → ${name}`, async () => {
    await viewMenu().click();
    await menuItem(label).click();
  });
}

// ---- 일정 변경하기 (c, ctrl+s, e, Esc, Delete, z)
await run('만들기 버튼', () => visible('[jsname="todz4c"]').click());
// The "만들기" button opens a small menu (일정 / 할 일 / 약속 일정); 일정 opens the quick dialog (Shift+C).
await run('만들기 → 일정', () => menuItem(/^\s*일정\s*$/).click(), { wait: 2500 });
await esc();
await page.keyboard.press('KeyC'); // the full editor, made the keyboard way
await page.waitForURL(/eventedit/, { timeout: 15000 });
await visible('input[aria-label="제목"], input[aria-label="제목 추가"], input[placeholder="제목 추가"]').fill(TITLE);
await run('일정 편집 화면 저장 버튼', () => visible('[aria-label="저장"], button:has-text("저장")').click(), { wait: 3000 });
await open('week');
const openEvent = async () => {
  await open('week');
  await chip().click();
  await visible('[role="dialog"]').waitFor();
  await page.waitForTimeout(800);
  await guard();
};
await openEvent();
await run('일정 창 수정(연필) 버튼', () => visible('[role="dialog"] [aria-label="일정 수정"]').click(), { wait: 3000 });
await run('일정 편집 화면 X(일정 변경 취소) 버튼', () => visible('[aria-label="일정 변경 취소"]').click(), { wait: 2500 });
await openEvent();
await run('일정 창 삭제 버튼', () => visible('[role="dialog"] [aria-label="일정 삭제"]').click(), { wait: 1500 });
await run('알림 실행취소 버튼', () => shown(page.getByRole('button', { name: '실행취소' })).click(), { wait: 2500 });

// ---- Tasks 및 Keep 보기 (Ctrl+Alt+. / ,)
const sideTab = (name) => visible(`[role="complementary"][aria-label="측면 패널"] [role="tab"][aria-label="${name}"]`);
await run('측면 패널 Keep 탭', () => sideTab('Keep').click(), { wait: 2500 });
await sideTab('Keep').click(); // closes the panel again
await run('측면 패널 Tasks 탭', () => sideTab('Tasks').click(), { wait: 2500 });
await sideTab('Tasks').click();
} catch (e) {
  stopped = e.message.split('\n')[0];
  console.log('STOPPED:', stopped);
}

// ---- 정리: the test event goes.
for (let i = 0; i < 5; i++) {
  await open('week');
  if (!(await chip().count())) break;
  await chip().click();
  await visible('[role="dialog"]').waitFor();
  await guard();
  await visible('[role="dialog"] [aria-label="일정 삭제"]').click();
  await page.waitForTimeout(2500);
}
await open('week');
const left = await chip().count();
console.log('test events left after cleanup:', left);
fs.writeFileSync(path.join(RESULTS, 'calendar-mouse.json'), JSON.stringify({ left, stopped, results }, null, 2));
await context.close();
