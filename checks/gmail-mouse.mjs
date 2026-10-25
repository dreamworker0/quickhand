// Gmail with the mouse: click the buttons that do what a shortcut on Gmail's help
// page does, and check that Quickhand shows the shortcut card.
//
// Uses the three test mails "[손빠르미 점검] 시험 메일 1~3" that gmail-shortcuts.mjs
// sent, taking them out of the trash first and putting them back at the end. Mail is
// changed only while the screen shows nothing but those mails, and archive, spam and
// delete are undone with z right away. Send and "Add to Tasks" are not clicked.
// Results: results/gmail-mouse.json
// --only=32,49,...: click only these (by help-page number), keeping the other results.
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS } from './lib.mjs';

const MARK = '손빠르미 점검';
const QUERY = `subject:(${MARK}) in:inbox newer_than:2d`;
const ALL = `subject:(${MARK}) newer_than:2d`;

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(10000);
// Wide enough that Gmail keeps every toolbar button out of its "더보기" menu.
await page.setViewportSize({ width: 1800, height: 950 });
const OUT = path.join(RESULTS, 'gmail-mouse.json');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice(7).split(',').map(Number)) : null;
const results = ONLY && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const run = async (n, name, step, opts) => {
  if (ONLY && !ONLY.has(n)) return;
  const r = await check(page, worker, name, step, opts);
  const i = results.findIndex((x) => x.n === n && x.name === name);
  if (i >= 0) results[i] = { n, ...r }; else results.push({ n, ...r });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
};

const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(2500); };
const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(500); };
const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());

async function guard() {
  const seen = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const subjects = [...document.querySelectorAll('tr.zA')].filter(vis).map((r) => (r.querySelector('.bog') || r).innerText);
    const open = document.querySelector('h2.hP');
    return { subjects, open: open && vis(open) ? open.innerText : null };
  });
  const all = seen.open !== null ? [seen.open] : seen.subjects;
  if (!all.length || all.some((s) => !s.includes(MARK))) throw new Error('시험 메일이 아닌 메일이 보여 멈춤');
}
async function list() {
  await go('#search/' + encodeURIComponent(QUERY));
  await page.locator('tr.zA').filter({ visible: true }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await guard();
}
const row = (i) => page.locator('tr.zA').filter({ visible: true }).nth(i);
async function selectFirst() {
  await list();
  await row(0).locator('[role="checkbox"]').first().click();
  await page.waitForTimeout(600);
  await guard();
}
async function openMail(i) {
  await list();
  await row(i).click();
  await visible('h2.hP').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);
  await guard();
}
const tool = (label) => visible(`[data-tooltip^="${label}"], [aria-label^="${label}"]`);
const undo = async () => { await blur(); await page.keyboard.press('KeyZ'); await page.waitForTimeout(2500); };
async function discardCompose() {
  const del = page.locator('[aria-label^="임시보관 메일 삭제"], [data-tooltip^="임시보관 메일 삭제"]').filter({ visible: true });
  if (await del.count()) await del.first().click().catch(() => {});
  await page.waitForTimeout(1000);
}
async function declineOffer() {
  const no = page.locator('div', { hasText: /^기기를 사용하는 동안 모바일 알림/ }).last()
    .locator('xpath=ancestor-or-self::*[.//*[normalize-space()="취소"]][1]').getByText('취소', { exact: true }).first();
  await no.click({ timeout: 2000 }).catch(() => {});
}

await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[name="q"]', { timeout: 60000 });
await page.waitForTimeout(4000);

// The keyboard check taught Quickhand these shortcuts; forget Gmail so cards show again.
await worker.evaluate(async () => {
  const { qh_state } = await chrome.storage.local.get('qh_state');
  for (const id of Object.keys(qh_state.actions)) if (id.startsWith('gmail:')) delete qh_state.actions[id];
  qh_state.lastAlertAt = 0;
  qh_state.lastNewAlertAt = 0;
  await chrome.storage.local.set({ qh_state });
});

// Test mails back out of the trash.
await go('#search/' + encodeURIComponent(`in:trash ${ALL}`));
if (await page.locator('tr.zA').filter({ visible: true }).count()) {
  await guard();
  await blur();
  await page.keyboard.press('Shift+Digit8');
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(800);
  await visible('[data-tooltip="받은편지함으로 이동"], [aria-label="받은편지함으로 이동"]').click();
  await page.waitForTimeout(3000);
}
await list();
console.log('test mails:', await page.locator('tr.zA').filter({ visible: true }).count());

// ---- 목록
await run(80, '검색창 클릭', () => page.locator('input[name="q"]').click());
await esc();
await run(31, '행 체크박스', async () => { await list(); await row(0).locator('[role="checkbox"]').first().click(); });
await run(32, '행 별표', async () => { await list(); await row(0).locator('.T-KT, [aria-label*="별표"]').first().click(); });
await run(49, '행 중요 표시', async () => { await list(); await row(0).locator('.pG, [aria-label*="중요"]').first().click(); });
await run(64, '전체 선택 체크박스', async () => { await list(); await visible('[role="checkbox"][aria-label="선택"], div[aria-label="선택"] [role="checkbox"]').click(); });
await run(46, '툴바 읽음으로 표시', async () => { await selectFirst(); await page.keyboard.press('Shift+KeyU'); await page.waitForTimeout(1000); await tool('읽음으로 표시').click(); });
await run(47, '툴바 읽지 않음으로 표시', async () => { await selectFirst(); await tool('읽지 않음으로 표시').click(); });
await run(51, '툴바 다시 알림', async () => { await selectFirst(); await tool('다시 알림').click(); });
await esc();
await run(83, '툴바 이동', async () => { await selectFirst(); await tool('이동').click(); });
await esc();
await run(84, '툴바 라벨', async () => { await selectFirst(); await tool('라벨').click(); });
await esc();
await run(82, '툴바 더보기', async () => { await selectFirst(); await tool('더보기').click(); });
await esc();
await run(33, '툴바 보관처리', async () => { await selectFirst(); await tool('보관처리').click(); }, { wait: 2500 });
await undo();
await run(35, '툴바 스팸신고', async () => { await selectFirst(); await tool('스팸신고').click(); }, { wait: 2500 });
await esc();
await undo();
await run(36, '툴바 삭제', async () => { await selectFirst(); await tool('삭제').click(); }, { wait: 2500 });
await undo();

// ---- 열린 대화
await run(75, '목록에서 메일 클릭', () => openMail(1));
await run(72, '목록으로 돌아가기 버튼', async () => {
  await openMail(1);
  const back = visible('[data-tooltip*="돌아가기"], [aria-label*="돌아가기"]');
  console.log('  back button:', await back.getAttribute('data-tooltip') || await back.getAttribute('aria-label'));
  await back.click();
});
await run(73, '최근 대화 버튼(‹)', async () => { await openMail(1); await tool('최근').click(); });
await run(74, '예전 대화 버튼(›)', async () => { await openMail(1); await tool('예전').click(); });
await run(37, '답장 버튼', async () => { await openMail(1); await visible('[role="button"][aria-label="답장"], [role="link"]', { hasText: /^답장$/ }).click(); });
await discardCompose();
await run(41, '전달 버튼', async () => { await openMail(1); await visible('[role="button"][aria-label="전달"], [role="link"]', { hasText: /^전달$/ }).click(); });
await discardCompose();

// ---- 왼쪽 메뉴 (보기만 바뀜)
await run(55, '받은편지함 링크', () => visible('a[href$="#inbox"]').click(), { wait: 2500 });
await run(56, '별표편지함 링크', () => visible('a[href$="#starred"]').click(), { wait: 2500 });
await run(57, '다시 알림 항목 링크', () => visible('a[href$="#snoozed"]').click(), { wait: 2500 });
await run(58, '보낸편지함 링크', () => visible('a[href$="#sent"]').click(), { wait: 2500 });
await run(59, '임시보관함 링크', () => visible('a[href$="#drafts"]').click(), { wait: 2500 });
await go('#all');
await run(70, '다음 페이지 버튼', () => visible('[data-tooltip="다음"]').click(), { wait: 2500 });
await run(71, '이전 페이지 버튼', () => visible('[data-tooltip="이전"]').click(), { wait: 2500 });

// ---- 편지쓰기 창 (보내지 않고 버림)
await go('#inbox');
const composeOpen = () => visible('[role="button"]', { hasText: '편지쓰기' }).click();
if (ONLY && !ONLY.has(78)) await composeOpen();
await run(78, '편지쓰기 버튼', composeOpen, { wait: 2500 });
await declineOffer();
const barSel = (label) => `[role="dialog"] [data-tooltip^="${label}"], [role="dialog"] [aria-label^="${label}"], [role="menu"] [data-tooltip^="${label}"], [role="menu"] [aria-label^="${label}"]`;
const bar = (label) => ({
  click: async () => {
    if (!(await page.locator(barSel(label)).filter({ visible: true }).count())) {
      await page.locator('[role="dialog"] [data-tooltip="서식 지정 옵션 더보기"], [role="dialog"] [aria-label="서식 지정 옵션 더보기"]').filter({ visible: true }).first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
    await visible(barSel(label)).click();
  },
});
const formatting = async () => {
  if (!(await page.locator('[role="dialog"] [data-tooltip^="굵게"]').filter({ visible: true }).count())) await bar('서식 지정 옵션').click().catch(() => {});
};
await formatting();
for (const [n, label] of [[18, '굵게'], [19, '기울임꼴'], [20, '밑줄'], [21, '번호 매기기 목록'], [22, '글머리 기호 목록'], [23, '인용구'], [25, '더 들여쓰기'], [24, '덜 들여쓰기'], [11, '링크 삽입'], [8, '참조 수신자 추가'], [9, '숨은참조 수신자 추가']]) {
  if (n === 8) await visible('[role="dialog"] [role="combobox"], [role="dialog"] input[aria-label*="수신자"]').click(); // Cc/Bcc show while the To field is active
  await run(n, `편지쓰기 ${label}`, async () => { await formatting(); await bar(label).click(); });
  if (n === 11) await esc();
}
await run(14, '편지쓰기 글꼴', async () => { await formatting(); await bar('글꼴').click(); });
await esc();
await run(16, '편지쓰기 크기', async () => { await formatting(); await bar('크기').click(); });
await esc();
await run(26, '편지쓰기 정렬 › 왼쪽', async () => { await formatting(); await bar('정렬').click(); await visible('[role="menuitem"], [role="menuitemradio"]', { hasText: '왼쪽' }).click(); });
await run(29, '편지쓰기 서식 지우기', async () => { await formatting(); await bar('서식 지우기').click(); });
await discardCompose();

// ---- 정리: test mails back to the trash.
await go('#search/' + encodeURIComponent(ALL));
await page.waitForTimeout(1500);
await guard();
await blur();
await page.keyboard.press('Shift+Digit8');
await page.keyboard.press('KeyA');
await page.waitForTimeout(800);
await guard();
await page.keyboard.press('Shift+Digit3');
await page.waitForTimeout(3000);
await go('#search/' + encodeURIComponent(ALL));
console.log('test mails left:', await page.locator('tr.zA').filter({ visible: true }).count());
await go('#drafts');
console.log('newest drafts:', JSON.stringify(await page.locator('tr.zA').filter({ visible: true }).evaluateAll((rs) => rs.slice(0, 2).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 40)))));
await context.close();
