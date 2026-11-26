// Which Calendar keys work on the search results page (/r/search)? Each key is pressed on
// a fresh results page and the page is compared before and after, like calendar-prereq.mjs.
// Keys that could change an event (Delete, Backspace, z) are left out: nothing is open
// to act on, and nothing here should touch the person's own events.
// A new event left open by c or q is dropped without saving.
// Results: results/calendar-search.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const BASE = 'https://calendar.google.com/calendar/u/0/r';
const QUERY = process.env.QH_QUERY || '회의';
const OUT = path.join(RESULTS, 'calendar-search.json');

const KEYS = [
  ['t', 'KeyT', '오늘'], ['j', 'KeyJ', '다음 기간'], ['n', 'KeyN', '다음 기간'], ['k', 'KeyK', '이전 기간'], ['p', 'KeyP', '이전 기간'],
  ['d', 'KeyD', '일 보기'], ['w', 'KeyW', '주 보기'], ['m', 'KeyM', '월 보기'], ['y', 'KeyY', '연도 보기'], ['a', 'KeyA', '일정 목록'], ['x', 'KeyX', '맞춤 보기'],
  ['1', 'Digit1', '일 보기'], ['2', 'Digit2', '주 보기'], ['3', 'Digit3', '월 보기'], ['4', 'Digit4', '맞춤 보기'], ['5', 'Digit5', '일정 목록'], ['6', 'Digit6', '연도 보기'],
  ['c', 'KeyC', '일정 만들기'], ['q', 'KeyQ', '종일 일정'], ['Shift+C', 'Shift+KeyC', '일정 만들기 대화상자'],
  ['/', 'Slash', '검색'], ['s', 'KeyS', '설정'], ['g', 'KeyG', '날짜로 이동'], ['e', 'KeyE', '일정 세부정보'],
  ['?', 'Shift+Slash', '단축키 목록'], ['Ctrl+/', 'Control+Slash', '단축키 목록'], ['+', 'Shift+Equal', '사용자 검색'],
  ['Esc', 'Escape', '돌아가기'],
];

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('dialog', (d) => d.accept().catch(() => {}));

const state = () => page.evaluate(() => {
  const vis = (e) => !!e.getClientRects().length;
  return {
    path: location.pathname.replace(/^\/calendar\/u\/\d+\/r/, '').replace(/\/[A-Za-z0-9_-]{20,}.*$/, '/(일정)') || '/',
    title: document.title.replace(/^Google (캘린더|Calendar)\s*-\s*/, ''),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(vis).map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').trim().slice(0, 25)).join(' | '),
    menus: [...document.querySelectorAll('[role="menu"], [role="listbox"]')].filter(vis).length,
    active: (() => { const a = document.activeElement; return a ? [a.tagName.toLowerCase(), a.getAttribute('aria-label')].filter(Boolean).join(' ').slice(0, 40) : ''; })(),
  };
});
function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) if (a[k] !== b[k]) out.push(`${k}: ${JSON.stringify(b[k]).slice(0, 30)} → ${JSON.stringify(a[k]).slice(0, 30)}`);
  return out;
}
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}
async function openSearch() {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
  await page.goto(`${BASE}/search?q=${encodeURIComponent(QUERY)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[role="main"]').filter({ visible: true }).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
}

await page.goto(`${BASE}/week`, { waitUntil: 'domcontentloaded' });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN');
  await context.close();
  process.exit(1);
}

const results = [];
for (const [shown, key, what] of KEYS) {
  let row;
  try {
    await openSearch();
    const before = await state();
    const since = Date.now();
    await page.keyboard.press(key);
    await page.waitForTimeout(2500);
    const after = await state();
    const changed = diff(before, after).filter((c) => !c.startsWith('active:'));
    row = { key: shown, action: what, calendar: changed.length > 0, changed, focus: diff(before, after).find((c) => c.startsWith('active:')) || null, quickhand: await quickhandSaw(since) };
    if (page.url().includes('/eventedit')) { await page.keyboard.press('Escape'); await page.waitForTimeout(800); }
  } catch (e) {
    row = { key: shown, action: what, calendar: null, changed: [], error: e.message.split('\n')[0] };
  }
  results.push(row);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(row));
}

console.log('\n키 | 동작 | 캘린더 | 손빠르미');
for (const r of results) console.log(`${r.key} | ${r.action} | ${r.error ? '오류' : r.calendar ? 'O' : 'X'} | ${r.quickhand || '-'}`);
await context.close();
