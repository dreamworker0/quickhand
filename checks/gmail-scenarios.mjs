// Everyday Gmail flows for keys that change conversations (E, #, Shift+U, M, -, V):
// in the list they do nothing until a conversation is ticked with x (Gmail says
// "선택한 대화가 없습니다"), so Quickhand must count them only when one is ticked or
// open. Each step records what Gmail did and what Quickhand made of it.
// Run after changing how Gmail keys are recognized.
//
// Only test mail is touched: one mail to the signed-in account itself
// ("[손빠르미 점검] 시나리오 메일"); changes are undone with z, and the mail goes
// to the trash at the end.
// Results: results/gmail-scenarios.json and a table in the console.
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS, keyFor } from './lib.mjs';

const MARK = '손빠르미 점검';
const SUBJECT = `[${MARK}] 시나리오 메일`;
const QUERY = `subject:(${MARK} 시나리오) in:inbox newer_than:1d`;
const ALL = `subject:(${MARK} 시나리오) newer_than:1d`;
const OUT = path.join(RESULTS, 'gmail-scenarios.json');

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(15000);

const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
const rows = () => page.locator('tr.zA').filter({ visible: true });
const go = async (hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(2500);
};
const focusPage = () => page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
const toast = () => page.evaluate(() => [...document.querySelectorAll('.bAq, .vh')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean).join(' / ').slice(0, 60));
const stars = () => page.evaluate(() => [...document.querySelectorAll('tr.zA')].filter((r) => r.getClientRects().length).map((r) => { const t = r.querySelector('.T-KT, [aria-label*="별표"]'); return t ? t.getAttribute('aria-label') || '' : ''; }).join(','));
const ticked = () => page.evaluate(() => [...document.querySelectorAll('tr.zA [role="checkbox"][aria-checked="true"]')].filter((b) => b.getClientRects().length).length);

// Keys that change mail are pressed only while the screen shows nothing but the test mail.
async function guard() {
  const seen = await page.evaluate(() => {
    const vis = (e) => !!e.getClientRects().length;
    const subjects = [...document.querySelectorAll('tr.zA')].filter(vis).map((r) => (r.querySelector('.bog') || r).innerText);
    const open = document.querySelector('h2.hP');
    return { subjects, open: open && vis(open) ? open.innerText : null };
  });
  const all = seen.open !== null ? [seen.open] : seen.subjects;
  if (!all.length || all.some((s) => !s.includes(MARK))) throw new Error('시험 메일이 아닌 메일이 보여 멈춤: ' + JSON.stringify(all).slice(0, 80));
}
// Wait until the screen shows the test mail alone (the inbox shows first while a search loads).
async function onlyTestMail() {
  for (let i = 0; i < 20; i++) {
    try { await guard(); return; } catch (e) { await page.waitForTimeout(1000); }
  }
  await guard();
}
async function list() {
  await go('#inbox'); // setting the same search hash again would not reload it
  await go('#search/' + encodeURIComponent(QUERY));
  await onlyTestMail();
  await page.waitForTimeout(800);
  await focusPage();
}
async function tick() {
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(500);
}
async function open() {
  await list();
  await rows().first().click();
  await visible('h2.hP').waitFor();
  await page.waitForTimeout(1000);
  await guard();
  await focusPage();
}
async function undo() {
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(2000);
}

// ---------------------------------------------------------------- the test mail
await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('input[name="q"]', { timeout: 60000 });
await page.waitForTimeout(4000);
const me = (await page.locator('a[aria-label*="@"]').first().getAttribute('aria-label')).match(/[\w.+-]+@[\w.-]+/)[0];
await go('#search/' + encodeURIComponent(QUERY));
if (!(await rows().count())) {
  await visible('[role="button"][gh="cm"], .T-I.T-I-KE').click();
  const to = visible('[role="dialog"] input[aria-label*="수신자"], [role="dialog"] [role="combobox"]');
  await to.waitFor();
  await to.click();
  await page.keyboard.type(me);
  await page.keyboard.press('Tab');
  await visible('[role="dialog"] input[name="subjectbox"]').fill(SUBJECT);
  await visible('div[aria-label="메일 본문"]').click();
  await page.keyboard.type('손빠르미 Gmail 시나리오 점검용 시험 메일입니다. 지워도 됩니다.');
  await page.keyboard.press(keyFor('Control+Enter', 'gmail'));
  for (let i = 0; i < 12 && !(await rows().count()); i++) await go('#search/' + encodeURIComponent(QUERY));
}
console.log('test mail found:', await rows().count());

// ---------------------------------------------------------------- the flows
// [name, prepare, keys, expected id or null, undo afterwards]
const FLOWS = [
  ['목록: 고르지 않고 E', list, 'KeyE', null, false],
  ['목록: 고르지 않고 Shift+3(#)', list, 'Shift+Digit3', null, false],
  ['목록: 고르지 않고 Shift+U', list, 'Shift+KeyU', null, false],
  ['목록: 고르지 않고 M', list, 'KeyM', null, false],
  ['목록: 고르지 않고 -', list, 'Minus', null, false],
  ['목록: 고르지 않고 V', list, 'KeyV', null, false],
  ['목록: X로 고르고 E', async () => { await list(); await tick(); }, 'KeyE', 'gmail:archive', true],
  ['목록: X로 고르고 Shift+U', async () => { await list(); await tick(); }, 'Shift+KeyU', 'gmail:unread', true],
  ['목록: X로 고르고 -', async () => { await list(); await tick(); }, 'Minus', 'gmail:notImportant', true],
  ['목록: X로 고른 것을 다시 X로 풀고 E', async () => { await list(); await tick(); await tick(); }, 'KeyE', null, false],
  ['대화 열고 E', open, 'KeyE', 'gmail:archive', true],
  ['대화 열고 Shift+U', open, 'Shift+KeyU', 'gmail:unread', false],
  ['목록: 고르지 않고 S(별표)', list, 'KeyS', 'gmail:star', false],
];

const results = [];
for (const [name, prepare, key, expected, needsUndo] of FLOWS) {
  let prep = null;
  try { await prepare(); } catch (e) { prep = e.message.split('\n')[0]; }
  const ticks = await ticked();
  const starBefore = await stars();
  const r = prep ? { recognized: null, card: null, error: prep } : await check(page, worker, name, () => page.keyboard.press(key), { wait: 1500 });
  const gmail = await toast();
  const star = key === 'KeyS' ? `${starBefore} → ${await stars()}` : undefined;
  if (needsUndo && r.recognized) await undo();
  if (key === 'KeyV') { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  if (key === 'KeyS') await page.keyboard.press('KeyS'); // star off again
  await page.keyboard.press('Escape');
  results.push({ name, expected, recognized: r.recognized, card: r.card, ticked: ticks, gmail, star, ok: r.recognized === expected, error: r.error });
}

// ---------------------------------------------------------------- clean up
await go('#inbox');
await go('#search/' + encodeURIComponent(ALL));
await page.waitForTimeout(3000);
if (await rows().count()) {
  await onlyTestMail();
  await focusPage();
  await page.keyboard.press('Shift+Digit8');
  await page.keyboard.press('KeyA');
  await page.waitForTimeout(800);
  await guard();
  await page.keyboard.press('Shift+Digit3');
  await page.waitForTimeout(3000);
}
await go('#search/' + encodeURIComponent(ALL));
console.log('test mails left outside the trash:', await rows().count());

fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log('\n' + results.map((r) => `${r.ok ? 'OK  ' : 'FAIL'} ${r.name} | 고른 대화 ${r.ticked} | Gmail ${(r.gmail || '-').split('\n')[0]}${r.star ? ' | 별표 ' + r.star : ''} | 기대 ${r.expected || '없음'} | 인식 ${r.recognized || '없음'}${r.error ? ' | 오류 ' + r.error : ''}`).join('\n'));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} as expected`);
await context.close();
