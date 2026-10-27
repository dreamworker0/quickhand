// Every shortcut on Google Calendar's help page (support.google.com/calendar/answer/37034,
// desktop): press it in a real signed-in Calendar and record (1) what changed on the
// page, so a person can tell whether Calendar reacted, and (2) whether Quickhand counted it.
//
// Only test events are touched: one event titled "[손빠르미 점검] 시험 일정" is made with
// c and Ctrl+S (no guests, so no mail goes out), the event keys are pressed only while
// its own details are open, and it is deleted at the end. No setting is changed: the
// run stops if "키보드 단축키 사용" is off. Ctrl+P only opens and closes the preview.
// Results: results/calendar-shortcuts.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS, keyFor, shownFor } from './lib.mjs';

const MARK = '[손빠르미 점검]';
const TITLE = `${MARK} 시험 일정`;
const BASE = 'https://calendar.google.com/calendar/u/0/r';
const OUT = path.join(RESULTS, 'calendar-shortcuts.json');

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
// Keys are written as on Windows; on a Mac every press goes through keyFor() (lib.mjs).
const pressKey = page.keyboard.press.bind(page.keyboard);
page.keyboard.press = (k, opts) => pressKey(keyFor(k, 'calendar'), opts);
page.setDefaultTimeout(10000);
const results = [];
const extra = {};
const save = () => fs.writeFileSync(OUT, JSON.stringify({ ...extra, results }, null, 2));

// Calendar's own data requests, so a refresh can be seen even when nothing on screen
// changes (its health pings and usage logs don't count).
let requests = 0;
page.on('request', (r) => {
  if (['xhr', 'fetch'].includes(r.resourceType()) && /^https:\/\/calendar\.google\.com\//.test(r.url()) && !r.url().includes('/clienthealth')) requests++;
});

const state = () => page.evaluate((mark) => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const a = document.activeElement;
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(vis);
  const main = document.querySelector('[role="main"]') || document.body;
  return {
    path: location.pathname.replace(/^\/calendar\/u\/\d+\/r/, '') || '/',
    title: document.title.replace(/^Google (캘린더|Calendar)\s*-\s*/, ''),
    dialogs: dialogs.map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').trim().slice(0, 30)).join(' | '),
    menus: [...document.querySelectorAll('[role="menu"], [role="listbox"]')].filter(vis).length,
    active: a ? [a.tagName.toLowerCase(), a.getAttribute('aria-label') || a.getAttribute('placeholder'), a.getAttribute('role')].filter(Boolean).join(' ').slice(0, 50) : '',
    toast: [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).join(' / ').slice(0, 60),
    events: [...main.querySelectorAll('[data-eventid]')].filter((e) => vis(e) && e.innerText.includes(mark)).length,
    frames: [...document.querySelectorAll('iframe')].filter(vis).length,
  };
}, MARK);

async function snapshot() {
  const s = await state();
  s.net = requests;
  return s;
}

// The fields that changed, written "field: before → after". Requests only count when asked for.
function diff(b, a, expect) {
  const out = [];
  for (const k of Object.keys(a)) {
    if (k === 'net' && !(expect || []).includes('net')) continue;
    if (a[k] !== b[k]) out.push(k === 'net' ? `net: 요청 ${a.net - b.net}건` : `${k}: ${JSON.stringify(b[k])} → ${JSON.stringify(a[k])}`);
  }
  return out;
}

// Quickhand's newest keyboard decision since `since`, if any.
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}

// Event-changing keys are pressed only while the open details belong to the test event.
async function guard() {
  const open = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const d = [...document.querySelectorAll('[role="dialog"]')].filter(vis).pop();
    return d ? d.innerText : null;
  });
  if (!open || !open.includes(MARK)) throw new Error('시험 일정이 아닌 창이 열려 있어 멈춤: ' + JSON.stringify((open || '').slice(0, 60)));
}

// One shortcut. `expect` names the fields that show Calendar reacted; without it any change counts.
async function test(n, section, keyLabel, action, keys, { prepare, guarded = false, expect, after, wait = 1500 } = {}) {
  let error = null;
  let changed = [];
  let works = null;
  let quickhand = null;
  try {
    if (prepare) await prepare();
    if (guarded) await guard();
    const before = await snapshot();
    const since = Date.now();
    for (const k of [].concat(keys)) {
      await page.keyboard.press(k);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(wait);
    const now = await snapshot();
    quickhand = await quickhandSaw(since);
    changed = diff(before, now, expect);
    works = expect ? changed.some((c) => expect.some((k) => c.startsWith(k))) : changed.length > 0;
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  try {
    if (after) await after();
  } catch (e) {
    error = (error ? error + ' / ' : '') + '정리 실패: ' + e.message.split('\n')[0];
  }
  const r = { n, section, key: shownFor(keyLabel, 'calendar'), action, calendar: works, changed, quickhand, error };
  results.push(r);
  console.log(JSON.stringify(r));
  save();
  return r;
}

const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
const settle = () => page.waitForTimeout(1500);
const open = async (where) => {
  await page.goto(`${BASE}/${where}`, { waitUntil: 'domcontentloaded' });
  await visible('[role="main"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
};
// Put the focus back on the page itself (out of any field or popup).
const focusPage = () => page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); };
const at = (where) => async () => { await open(where); await focusPage(); };

await page.goto(`${BASE}/week`, { waitUntil: 'domcontentloaded' });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN: run `node login.mjs`, sign in, close the window, then run this again.');
  await context.close();
  process.exit(1);
}

// ---- 도움말: "?" lists the shortcuts Calendar itself knows; kept for the report.
// It opening also shows "키보드 단축키 사용" is on, so no setting needs changing.
await test(20, '단축키 사용하기', '?', '사용할 수 있는 단축키 모두 보기', 'Shift+Slash', {
  prepare: at('week'), expect: ['dialogs'],
  after: async () => {
    extra.helpDialog = await page.evaluate(() => {
      const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      const d = [...document.querySelectorAll('[role="dialog"]')].filter(vis).pop();
      return d ? d.innerText.replace(/\n{2,}/g, '\n') : null;
    });
    await esc();
  },
});
if (!extra.helpDialog) {
  console.log('SHORTCUTS OFF: turn on 설정 › 키보드 단축키 사용 in this profile, then run this again.');
  save();
  await context.close();
  process.exit(1);
}

// ---- 캘린더 뷰 변경하기: each key from a view other than its own.
const S2 = '캘린더 뷰 변경하기';
const view = (n, k, code, action, from) => test(n, S2, k, action, code, { prepare: at(from), expect: ['path', 'title'] });
await view(8, '1', 'Digit1', '일별 일정 보기', 'week');
await view(8, 'd', 'KeyD', '일별 일정 보기', 'week');
await view(9, '2', 'Digit2', '주간 일정 보기', 'month');
await view(9, 'w', 'KeyW', '주간 일정 보기', 'month');
await view(10, '3', 'Digit3', '월간 일정 보기', 'week');
await view(10, 'm', 'KeyM', '월간 일정 보기', 'week');
await view(11, '4', 'Digit4', '사용자설정 보기', 'week');
await view(11, 'x', 'KeyX', '사용자설정 보기', 'week');
await view(12, '5', 'Digit5', '일정목록 보기', 'week');
await view(12, 'a', 'KeyA', '일정목록 보기', 'week');

// ---- 캘린더 내 이동하기
const S1 = '캘린더 내 이동하기';
await test(1, S1, 'j', '다음 날짜 범위', 'KeyJ', { prepare: at('week'), expect: ['title'] });
await test(1, S1, 'n', '다음 날짜 범위', 'KeyN', { prepare: at('week'), expect: ['title'] });
await test(3, S1, 't', '현재 날짜로 이동', 'KeyT', { prepare: at('week/2027/3/15'), expect: ['title', 'path'] });
await test(2, S1, 'r', '캘린더 새로고침', 'KeyR', { prepare: at('week'), expect: ['net'], wait: 3000 });
await test(4, S1, '+', '캘린더 섹션 추가를 위해 이동', 'Shift+Equal', { prepare: at('week'), expect: ['active', 'menus', 'dialogs', 'path'], after: esc });
await test(5, S1, '/', '검색창에 커서 놓기', 'Slash', { prepare: at('week'), expect: ['active'], after: esc });
await test(6, S1, 's', '설정 페이지로 이동', 'KeyS', { prepare: at('week'), expect: ['path'], wait: 2500 });
await test(7, S1, 'g', '특정 날짜로 이동', 'KeyG', { prepare: at('week'), expect: ['dialogs', 'active'], after: esc });

// ---- 일정 변경하기: the test event is made with c, then Ctrl+S.
const S3 = '일정 변경하기';
const titleBox = () => visible('input[aria-label="제목"], input[aria-label="제목 추가"], input[placeholder="제목 추가"], input[aria-label="Title"], input[aria-label="Add title"]');
await test(13, S3, 'c', '새 일정 만들기', 'KeyC', { prepare: at('week'), expect: ['path', 'dialogs'], wait: 3000 });
await test(17, S3, 'Ctrl + s', '일정 저장(일정 세부정보 페이지에서)', 'Control+KeyS', {
  prepare: async () => {
    if (!(await page.url()).includes('/eventedit')) throw new Error('c 로 일정 편집 화면이 열리지 않음');
    await titleBox().fill(TITLE);
    await page.waitForTimeout(500);
  },
  expect: ['path'], wait: 4000,
});
await open('week');
// Opens the test event's details bubble from the week grid.
const chip = () => page.locator('[role="main"] [data-eventid]', { hasText: MARK }).filter({ visible: true }).first();
// Made again (c, title, Ctrl+S) if an undo that didn't work left it deleted.
const makeEvent = async () => {
  await focusPage();
  await page.keyboard.press('KeyC');
  await page.waitForURL(/eventedit/, { timeout: 15000 });
  await titleBox().fill(TITLE);
  await page.keyboard.press('Control+KeyS');
  await page.waitForURL((u) => !u.pathname.includes('eventedit'), { timeout: 15000 });
  await open('week');
};
const openEvent = async () => {
  await open('week');
  if (!(await chip().count())) await makeEvent();
  await chip().click();
  await visible('[role="dialog"]').waitFor();
  await page.waitForTimeout(800);
};
extra.testEventsAfterSave = (await state()).events;
console.log('test events after save:', extra.testEventsAfterSave);

await test(14, S3, 'e', '일정 세부정보 보기', 'KeyE', { prepare: openEvent, guarded: true, expect: ['path'], wait: 3000 });
// Right after e the focus sits on the page's "일정 변경 취소" (X) button, where Calendar
// ignores Esc; from the title box (or anywhere else on the page) it goes back.
const onDetails = async () => { if (!page.url().includes('/eventedit')) throw new Error('세부정보 페이지가 아님'); };
await test(18, S3, 'Esc (열자마자, X 버튼에 포커스)', '일정 세부정보 페이지에서 캘린더 그리드로 돌아가기', 'Escape', { prepare: onDetails, expect: ['path'], wait: 2500 });
await test(18, S3, 'Esc (제목 칸에서)', '일정 세부정보 페이지에서 캘린더 그리드로 돌아가기', 'Escape', {
  prepare: async () => { await onDetails(); await titleBox().click(); },
  expect: ['path'], wait: 2500,
});
const undo = () => test(16, S3, 'z', '실행취소', 'KeyZ', { prepare: focusPage, expect: ['events', 'toast'], wait: 3000 });
await test(15, S3, 'Delete', '일정 삭제', 'Delete', { prepare: openEvent, guarded: true, expect: ['events', 'toast'], wait: 2500 });
await undo();
await test(15, S3, 'Backspace', '일정 삭제', 'Backspace', { prepare: openEvent, guarded: true, expect: ['events', 'toast'], wait: 2500 });
await undo();

// ---- Tasks 및 Keep 보기: the side panel.
const S4 = 'Tasks 및 Keep 보기';
await test(19, S4, 'Ctrl + Alt + .', '측면 패널로 이동', 'Control+Alt+Period', { prepare: at('week'), expect: ['active', 'frames'] });
await test(19, S4, 'Ctrl + Alt + ,', '측면 패널로 이동', 'Control+Alt+Comma', { prepare: at('week'), expect: ['active', 'frames'] });

// ---- Not on the help page, but in Calendar's own "?" list.
const S5 = '도움말 페이지에 없음 (캘린더 ? 목록)';
await test(21, S5, 'k', '이전 기간', 'KeyK', { prepare: at('week'), expect: ['title'] });
await test(21, S5, 'p', '이전 기간', 'KeyP', { prepare: at('week'), expect: ['title'] });
await test(22, S5, '6', '1년 보기', 'Digit6', { prepare: at('week'), expect: ['path', 'title'] });
await test(22, S5, 'y', '1년 보기', 'KeyY', { prepare: at('week'), expect: ['path', 'title'] });
await test(23, S5, 'q', '대화상자 만들기 열기(종일 일정)', 'KeyQ', { prepare: at('week'), expect: ['dialogs', 'path'], after: async () => { await esc(); await esc(); } });
await test(24, S5, 'Shift + C', '대화상자 만들기 열기(시간이 정해진 일정)', 'Shift+KeyC', { prepare: at('week'), expect: ['dialogs', 'path'], after: async () => { await esc(); await esc(); } });
await test(25, S5, 'Ctrl + /', '단축키 도움말 열기', 'Control+Slash', { prepare: at('week'), expect: ['dialogs'], after: esc });
await test(26, S5, 'Ctrl + z', '마지막 작업 실행취소', 'Control+KeyZ', {
  prepare: async () => { await openEvent(); await guard(); await page.keyboard.press('Delete'); await page.waitForTimeout(2500); await focusPage(); },
  expect: ['events', 'toast'], wait: 3000,
});
await test(27, S5, 'Ctrl + Enter', '일정 저장', 'Control+Enter', {
  prepare: async () => { await openEvent(); await guard(); await page.keyboard.press('KeyE'); await page.waitForURL(/eventedit/); await page.waitForTimeout(1500); },
  expect: ['path'], wait: 3000,
});
// Screen-reader announcements about the open event: Calendar says them through a live region.
for (const d of ['1', '2', '3', '4', '5', '6', '7']) {
  await test(28, S5, 'Alt + ' + d, '열린 일정 정보 말하기', 'Alt+Digit' + d, { prepare: openEvent, guarded: true, expect: ['toast'], after: esc });
}
await test(29, S5, 'Alt + →', '사용자 또는 그룹 정보 표시', 'Alt+ArrowRight', { prepare: openEvent, guarded: true, after: esc });
// Print: Calendar opens its own print preview first; it is closed, nothing is printed.
await test(30, S5, 'Ctrl + p', '인쇄', 'Control+KeyP', {
  prepare: at('week'), expect: ['dialogs', 'path', 'frames'], wait: 3000,
  after: async () => {
    for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
    await esc();
  },
});

// ---- 정리: delete every test event still on this week.
for (let i = 0; i < 5; i++) {
  await open('week');
  if (!(await chip().count())) break;
  await chip().click();
  await visible('[role="dialog"]').waitFor();
  await guard();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(2500);
}
await open('week');
extra.testEventsLeft = (await state()).events;
console.log('test events left after cleanup:', extra.testEventsLeft);
save();
await context.close();
