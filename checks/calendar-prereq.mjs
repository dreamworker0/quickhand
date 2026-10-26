// Which Calendar keys need an event open first? Keys that act on an event are pressed in
// three states and the page is compared before and after:
//   주 보기(일정 안 엶)   the week grid, nothing open
//   일정 창 열림          the test event's details bubble open (clicked)
//   일정 편집 화면        the test event's edit page (e from the bubble)
// A key that changes the page only in some states needs those first; Quickhand should
// count it in exactly the states where Calendar reacted.
//
// Only one test event "[손빠르미 점검] 선행 조사 일정" (no guests, so no mail) is
// touched; keys that change it run only while its own details are open, a deleted one is
// made again, and it is deleted at the end. Results: results/calendar-prereq.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const MARK = '[손빠르미 점검]';
const TITLE = `${MARK} 선행 조사 일정`;
const BASE = 'https://calendar.google.com/calendar/u/0/r';
const OUT = path.join(RESULTS, 'calendar-prereq.json');

const KEYS = [
  ['e', 'KeyE', '일정 세부정보(편집) 열기'],
  ['Delete', 'Delete', '일정 삭제'],
  ['Backspace', 'Backspace', '일정 삭제'],
  ['Ctrl+S', 'Control+KeyS', '일정 저장'],
  ['Ctrl+Enter', 'Control+Enter', '일정 저장'],
  ['Esc', 'Escape', '그리드로 돌아가기'],
  ['Alt+1', 'Alt+Digit1', '열린 일정 정보 말하기'],
  ['Alt+→', 'Alt+ArrowRight', '사용자·그룹 정보'],
  ['j', 'KeyJ', '다음 기간'],
  ['k', 'KeyK', '이전 기간'],
  ['w', 'KeyW', '주 보기'],
  ['m', 'KeyM', '월 보기'],
  ['q', 'KeyQ', '종일 일정 만들기'],
  ['c', 'KeyC', '새 일정 만들기'],
];

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(15000);
// "Leave the page?" on an unsaved new event: leave (nothing is saved).
page.on('dialog', (d) => d.accept().catch(() => {}));
const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
const focusPage = () => page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
const open = async (where) => {
  await page.goto(`${BASE}/${where}`, { waitUntil: 'domcontentloaded' });
  await visible('[role="main"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
};
const titleBox = () => visible('input[aria-label="제목"], input[aria-label="제목 추가"], input[placeholder="제목 추가"], input[aria-label="Title"], input[aria-label="Add title"]');
const chip = () => page.locator('[role="main"] [data-eventid]', { hasText: MARK }).filter({ visible: true }).first();

const state = () => page.evaluate((mark) => {
  const vis = (e) => !!e.getClientRects().length;
  const a = document.activeElement;
  const main = document.querySelector('[role="main"]') || document.body;
  return {
    path: location.pathname.replace(/^\/calendar\/u\/\d+\/r/, '').replace(/\/[A-Za-z0-9_-]{20,}.*$/, '/(일정)') || '/',
    title: document.title.replace(/^Google (캘린더|Calendar)\s*-\s*/, ''),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(vis).map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').trim().slice(0, 25)).join(' | '),
    menus: [...document.querySelectorAll('[role="menu"], [role="listbox"]')].filter(vis).length,
    toast: [...document.querySelectorAll('[role="alert"], [aria-live="assertive"]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).join(' / ').slice(0, 50),
    events: [...main.querySelectorAll('[data-eventid]')].filter((e) => vis(e) && e.innerText.includes(mark)).length,
    active: a ? [a.tagName.toLowerCase(), a.getAttribute('aria-label'), a.getAttribute('role')].filter(Boolean).join(' ').slice(0, 40) : '',
  };
}, MARK);
// The polite live region and focus move on their own; only the assertive one and real changes count.
const IGNORE = ['active'];
function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) if (!IGNORE.includes(k) && a[k] !== b[k]) out.push(`${k}: ${JSON.stringify(b[k]).slice(0, 30)} → ${JSON.stringify(a[k]).slice(0, 30)}`);
  return out;
}
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}
async function guard() {
  if (page.url().includes('/eventedit')) {
    if (!(await titleBox().inputValue()).includes(MARK)) throw new Error('시험 일정이 아닌 편집 화면이라 멈춤');
    return;
  }
  const text = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].filter((e) => e.getClientRects().length).pop();
    return d ? d.innerText : null;
  });
  if (text !== null && !text.includes(MARK)) throw new Error('시험 일정이 아닌 창이 열려 있어 멈춤');
}

async function makeEvent() {
  // Right after loading, Calendar may not take keys yet: try c a few times.
  for (let i = 0; i < 4 && !page.url().includes('/eventedit'); i++) {
    await open('week');
    await page.waitForTimeout(1500 * i);
    await focusPage();
    await page.keyboard.press('KeyC');
    await page.waitForURL(/eventedit/, { timeout: 8000 }).catch(() => {});
  }
  await titleBox().fill(TITLE);
  await page.keyboard.press('Control+KeyS');
  await page.waitForURL((u) => !u.pathname.includes('eventedit'), { timeout: 15000 });
}
async function grid() {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
  await open('week');
  if (!(await chip().count())) { await makeEvent(); await open('week'); }
  await focusPage();
}
async function bubble() {
  await grid();
  await chip().click();
  await visible('[role="dialog"]').waitFor();
  await page.waitForTimeout(800);
}
async function edit() {
  await bubble();
  await page.keyboard.press('KeyE');
  await page.waitForURL(/eventedit/, { timeout: 15000 });
  await page.waitForTimeout(1500);
}
const STATES = { '주 보기(일정 안 엶)': grid, '일정 창 열림': bubble, '일정 편집 화면': edit };

await page.goto(`${BASE}/week`, { waitUntil: 'domcontentloaded' });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN');
  await context.close();
  process.exit(1);
}

const results = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
for (const [shown, key, what] of KEYS) {
  const row = { key: shown, action: what, states: {} };
  for (const [name, prepare] of Object.entries(STATES)) {
    let cell;
    try {
      await prepare();
      await guard();
      const before = await state();
      const since = Date.now();
      await page.keyboard.press(key);
      await page.waitForTimeout(2500);
      const after = await state();
      const quickhand = await quickhandSaw(since);
      const changed = diff(before, after);
      cell = { calendar: changed.length > 0, changed, quickhand };
      // A new event left open by c is dropped; an edit page is left without saving.
      if (page.url().includes('/eventedit')) {
        const value = await titleBox().inputValue().catch(() => '');
        if (!value.includes(MARK)) { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch (e) {
      cell = { calendar: null, changed: [], quickhand: null, error: e.message.split('\n')[0] };
    }
    row.states[name] = cell;
    console.log(shown, '|', name, '|', JSON.stringify(cell));
  }
  results.push(row);
  save();
}

// ---- 정리: every test event on this week is deleted.
for (let i = 0; i < 6; i++) {
  await open('week');
  if (!(await chip().count())) break;
  await chip().click();
  await visible('[role="dialog"]').waitFor();
  await guard();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(2500);
}
await open('week');
console.log('test events left after cleanup:', (await state()).events);

const mark = (c) => (c.error ? '오류' : c.calendar ? (c.quickhand ? 'O·셈' : 'O·안 셈') : (c.quickhand ? 'X·셈!' : 'X'));
console.log('\n키 | 동작 | ' + Object.keys(STATES).join(' | '));
for (const r of results) console.log(`${r.key} | ${r.action} | ` + Object.values(r.states).map(mark).join(' | '));
await context.close();
