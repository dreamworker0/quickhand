// Every shortcut on Gmail's help page (support.google.com/mail/answer/6594, desktop):
// press it in a real signed-in Gmail and record (1) what changed on the page, so a
// person can tell whether Gmail reacted, and (2) whether Quickhand counted it.
//
// Only test mail is touched: the run sends three mails to the signed-in account
// itself ("[손빠르미 점검] 시험 메일 1~3"), presses mail-changing keys only while the
// screen shows nothing but those mails, and moves them to the trash at the end.
// Spam/delete/archive/mute are undone with z right away. Shift+T is not pressed
// because it creates a real task in Google Tasks.
// Results: results/gmail-shortcuts.json
//
// --reuse: rerun everything after the compose part on the three test mails already
// sent, taking them back out of the trash; nothing new is sent. The compose results
// of the earlier run are kept.
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const MARK = '손빠르미 점검';
// Inbox only, so unsent drafts of test mails never show up among them.
const QUERY = `subject:(${MARK}) in:inbox newer_than:1d`;
const ALL = `subject:(${MARK}) newer_than:1d`;
const OUT = path.join(RESULTS, 'gmail-shortcuts.json');

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const REUSE = process.argv.includes('--reuse');
// Shortcuts tried in the compose part (and "/" right after it).
const COMPOSE = new Set([78, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 8, 9, 10, 11, 12, 13, 3, 4, 5, 6, 7, 80]);
const results = REUSE ? JSON.parse(fs.readFileSync(OUT, 'utf8')).filter((r) => COMPOSE.has(r.n)) : [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

const state = () => page.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const rows = [...document.querySelectorAll('tr.zA')].filter(vis);
  const a = document.activeElement;
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(vis);
  const body = [...document.querySelectorAll('div[aria-label="메일 본문"]')].filter(vis)[0];
  const compose = body && body.closest('[role="dialog"]');
  return {
    hash: decodeURIComponent(location.hash),
    rows: rows.length,
    selected: rows.filter((r) => r.querySelector('[role="checkbox"][aria-checked="true"]')).length,
    unread: rows.filter((r) => r.classList.contains('zE')).length,
    starred: rows.map((r) => { const t = r.querySelector('.T-KT, [aria-label*="별표"]'); return t ? t.getAttribute('aria-label') || t.getAttribute('title') || '' : ''; }).join(','),
    important: rows.filter((r) => r.querySelector('.pG.pH-Jp, [aria-label^="중요"][aria-label$="중요 메일입니다."], .pH-A7')).length,
    cursor: rows.findIndex((r) => r.classList.contains('btb')),
    dialogs: dialogs.map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').slice(0, 25)).join(' | '),
    menus: [...document.querySelectorAll('[role="menu"]')].filter(vis).length,
    active: a ? [a.tagName.toLowerCase(), a.getAttribute('name'), a.getAttribute('aria-label'), a.getAttribute('role')].filter(Boolean).join(' ').slice(0, 50) : '',
    inCompose: !!(a && a.closest && a.closest('[role="dialog"]')),
    toast: [...document.querySelectorAll('.bAq, .vh')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).join(' / ').slice(0, 60),
    body: body ? body.innerHTML : null,
    fields: compose ? [...compose.querySelectorAll('input, textarea, [role="combobox"]')].filter(vis).length : 0,
    subject: ((document.querySelector('h2.hP') || {}).innerText || '').slice(0, 40),
    pages: 0,
  };
});

async function snapshot() {
  const s = await state();
  s.pages = context.pages().length;
  return s;
}

// The fields that changed, written "field: before → after".
function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) {
    if (k === 'body') {
      if (a.body !== b.body) out.push('본문 서식 바뀜');
    } else if (a[k] !== b[k]) {
      out.push(`${k}: ${JSON.stringify(b[k])} → ${JSON.stringify(a[k])}`);
    }
  }
  return out;
}

// Mail-changing keys are pressed only while every mail on screen is a test mail.
async function guard() {
  const seen = await page.evaluate(() => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const subjects = [...document.querySelectorAll('tr.zA')].filter(vis).map((r) => (r.querySelector('.bog') || r).innerText);
    const open = document.querySelector('h2.hP');
    return { subjects, open: open && vis(open) ? open.innerText : null };
  });
  const all = seen.open !== null ? [seen.open] : seen.subjects;
  if (!all.length || all.some((s) => !s.includes(MARK))) throw new Error('시험 메일이 아닌 메일이 보여 멈춤: ' + JSON.stringify(all).slice(0, 80));
}

// Quickhand's newest keyboard decision since `since`, if any.
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}

// One shortcut. `expect` names the fields that show Gmail reacted; without it any change counts.
async function test(n, keyLabel, action, keys, { prepare, safe = false, expect, after, wait = 1500, shot = false } = {}) {
  let error = null;
  let changed = [];
  let works = null;
  let quickhand = null;
  try {
    if (prepare) await prepare();
    if (!safe) await guard();
    const before = await snapshot();
    const since = Date.now();
    for (const k of [].concat(keys)) {
      await page.keyboard.press(k);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(wait);
    const now = await snapshot();
    quickhand = await quickhandSaw(since);
    changed = diff(before, now);
    if (shot) await page.screenshot({ path: path.join(RESULTS, `gmail-${n}.png`) });
    works = expect ? changed.some((c) => expect.some((k) => c.startsWith(k))) : changed.length > 0;
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  try {
    if (after) await after();
  } catch (e) {
    error = (error ? error + ' / ' : '') + '정리 실패: ' + e.message.split('\n')[0];
  }
  const r = { n, key: keyLabel, action, gmail: works, changed, quickhand, error };
  results.push(r);
  console.log(JSON.stringify(r));
  save();
}

function skip(n, key, action, why) {
  const r = { n, key, action, gmail: null, changed: [], quickhand: null, error: null, skipped: why };
  results.push(r);
  console.log(JSON.stringify(r));
  save();
}

const go = async (hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(2500);
};
const visible = (sel) => page.locator(sel).filter({ visible: true }).first();
async function openSearch() {
  await go('#search/' + encodeURIComponent(QUERY));
  await page.locator('tr.zA').filter({ visible: true }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await guard();
}
async function openMail(i) {
  await discardInlineReply(); // a reply window left open would cover the list
  await openSearch();
  await page.locator('tr.zA').filter({ visible: true }).nth(i).click();
  await visible('h2.hP').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);
  await guard();
}
// Put the focus back on the page itself (out of any field).
const focusPage = () => page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
// Close popup windows and tabs a shortcut opened (unedited replies leave no draft).
async function closeExtraPages() {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
}
async function discardInlineReply() {
  // The button's name carries its shortcut: "임시보관 메일 삭제 (Ctrl-Shift-D)".
  const del = page.locator('[aria-label^="임시보관 메일 삭제"], [data-tooltip^="임시보관 메일 삭제"]').filter({ visible: true });
  if (await del.count()) await del.first().click().catch(() => {});
  await page.waitForTimeout(800);
}
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(500); };

// Gmail may offer to pause phone notifications over the compose window; decline.
async function declineOffer() {
  const no = page.locator('div', { hasText: /^기기를 사용하는 동안 모바일 알림/ }).last()
    .locator('xpath=ancestor-or-self::*[.//*[normalize-space()="취소"]][1]').getByText('취소', { exact: true }).first();
  await no.click({ timeout: 2000 }).catch(() => {});
}

const me = await (async () => {
  await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="q"]', { timeout: 60000 });
  await page.waitForTimeout(4000);
  const label = await page.locator('a[aria-label*="@"]').first().getAttribute('aria-label');
  return label.match(/[\w.+-]+@[\w.-]+/)[0];
})();
const stamp = new Date().toTimeString().slice(0, 5);

// ---- 편지쓰기: mail 1 is written with the shortcuts, then sent with Ctrl+Enter.
async function fillCompose(no) {
  const to = visible('[role="dialog"] input[aria-label*="수신자"], [role="dialog"] [role="combobox"]');
  await to.waitFor({ timeout: 15000 });
  await declineOffer();
  await to.click();
  await page.keyboard.type(me);
  await page.keyboard.press('Tab');
  await visible('[role="dialog"] input[name="subjectbox"]').fill(`[${MARK}] 시험 메일 ${no} (${stamp})`);
  await visible('div[aria-label="메일 본문"]').click();
  await page.keyboard.type('손빠르미 단축키 점검용 시험 메일입니다. 지워도 됩니다.');
}
const selectBody = async () => {
  await visible('div[aria-label="메일 본문"]').click();
  await page.keyboard.press('Control+A');
};

if (!REUSE) {
// A rerun reuses the test mails already there: an unsent one (a draft) is
// finished here, and only the missing ones are written, so there are never more than 3.
await go('#search/' + encodeURIComponent(ALL));
await page.waitForTimeout(2000);
const found = await page.locator('tr.zA').filter({ visible: true }).evaluateAll((rs) => rs.map((r) => r.innerText.trim().startsWith('임시보관')));
const draft = found.includes(true);
const sentBefore = found.filter((d) => !d).length;
console.log('test mails already there:', sentBefore, 'sent,', draft ? 'one draft' : 'no draft');

await go('#inbox');
await focusPage();
await test(78, 'c', '편지쓰기', 'KeyC', { safe: true, expect: ['dialogs', 'fields'], wait: 3000 });
if (draft) {
  // Close the new, untouched compose window (Gmail keeps nothing) and open the draft.
  await declineOffer();
  await visible('[role="dialog"] button[aria-label="저장 및 닫기"], [role="dialog"] img[aria-label="저장 및 닫기"]').click();
  await go('#drafts');
  await page.locator('tr.zA', { hasText: MARK }).filter({ visible: true }).first().click();
  await visible('div[aria-label="메일 본문"]').waitFor();
  await page.waitForTimeout(1500);
} else {
  await fillCompose(1);
}

const fmt = (n, key, action, k) => test(n, key, action, k, { safe: true, prepare: selectBody, expect: ['본문'], wait: 800 });
await fmt(14, 'Ctrl + Shift + 5', '이전 글꼴', 'Control+Shift+Digit5');
await fmt(15, 'Ctrl + Shift + 6', '다음 글꼴', 'Control+Shift+Digit6');
await fmt(16, 'Ctrl + Shift + -', '텍스트 크기 축소', 'Control+Shift+Minus');
await fmt(17, 'Ctrl + Shift + +', '텍스트 크기 확대', 'Control+Shift+Equal');
await fmt(18, 'Ctrl + B', '굵게', 'Control+KeyB');
await fmt(19, 'Ctrl + I', '기울임꼴', 'Control+KeyI');
await fmt(20, 'Ctrl + U', '밑줄', 'Control+KeyU');
await fmt(21, 'Ctrl + Shift + 7', '번호 매기기 목록', 'Control+Shift+Digit7');
await fmt(22, 'Ctrl + Shift + 8', '글머리기호 목록', 'Control+Shift+Digit8');
await fmt(23, 'Ctrl + Shift + 9', '인용', 'Control+Shift+Digit9');
await fmt(25, 'Ctrl + ]', '더 들여쓰기', 'Control+BracketRight');
await fmt(24, 'Ctrl + [', '덜 들여쓰기', 'Control+BracketLeft');
await fmt(27, 'Ctrl + Shift + E', '가운데 맞춤', 'Control+Shift+KeyE');
await fmt(28, 'Ctrl + Shift + R', '오른쪽 맞춤', 'Control+Shift+KeyR');
await fmt(26, 'Ctrl + Shift + L', '왼쪽 맞춤', 'Control+Shift+KeyL');
await fmt(29, 'Ctrl + \\', '서식 제거', 'Control+Backslash');

const inBody = () => visible('div[aria-label="메일 본문"]').click();
await test(8, 'Ctrl + Shift + C', '참조 추가', 'Control+Shift+KeyC', { safe: true, prepare: inBody, expect: ['fields', 'active'] });
await test(9, 'Ctrl + Shift + B', '숨은참조 추가', 'Control+Shift+KeyB', { safe: true, prepare: inBody, expect: ['fields', 'active'] });
// Esc inside the compose body closes the compose window, so it is pressed only
// when a shortcut moved the focus into a box of its own (the link box).
const escOutsideBody = async () => {
  const where = await page.evaluate(() => (document.activeElement && document.activeElement.getAttribute('aria-label')) || '');
  if (where !== '메일 본문') await esc();
};
await test(10, 'Ctrl + Shift + F', '맞춤 보낸사람 액세스', 'Control+Shift+KeyF', { safe: true, prepare: inBody, expect: ['dialogs', 'menus', 'fields', 'active'], after: escOutsideBody });
await test(11, 'Ctrl + K', '링크 삽입', 'Control+KeyK', { safe: true, prepare: inBody, expect: ['dialogs', 'active'], after: escOutsideBody });
skip(12, '⌘ + ;', '맞춤법 오류가 있는 다음 단어로 (Mac 전용)', 'Mac 전용이라 Windows에서 점검 안 함');
await test(13, 'Ctrl + M', '맞춤법 추천 열기', 'Control+KeyM', { safe: true, prepare: inBody, expect: ['dialogs', 'menus', 'active'], after: escOutsideBody });
await test(3, 'Shift + Esc', '기본 창으로 커서 이동', 'Shift+Escape', { safe: true, prepare: inBody, expect: ['inCompose', 'active'] });
await test(4, 'Esc', '최근 채팅 또는 편지쓰기로 커서 이동', 'Escape', { safe: true, prepare: focusPage, expect: ['inCompose', 'active'] });
await test(5, 'Ctrl + .', '다음 채팅 또는 편지쓰기로 이동', 'Control+Period', { safe: true, prepare: inBody, expect: ['inCompose', 'active'] });
await test(6, 'Ctrl + ,', '이전 채팅 또는 편지쓰기로 이동', 'Control+Comma', { safe: true, prepare: inBody, expect: ['inCompose', 'active'] });
await test(7, 'Ctrl + Enter', '보내기', 'Control+Enter', { safe: true, prepare: inBody, expect: ['dialogs', 'toast'], wait: 3000 });

// The rest of the three, written the same way.
for (let no = sentBefore + 2; no <= 3; no++) {
  await focusPage();
  await page.keyboard.press('KeyC');
  await fillCompose(no);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(3000);
}
await closeExtraPages();

// ---- 검색: the test mails, found with "/".
await go('#inbox');
await focusPage();
await test(80, '/', '메일 검색', 'Slash', { safe: true, expect: ['active'] });
await page.keyboard.type(QUERY);
await page.keyboard.press('Enter');
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  if ((await page.locator('tr.zA').filter({ visible: true }).count()) >= 3) break;
  await go('#search/' + encodeURIComponent(QUERY));
}
console.log('test mails found:', await page.locator('tr.zA').filter({ visible: true }).count());

} else {
  // Take the test mails back out of the trash ("받은편지함으로 이동").
  await go('#search/' + encodeURIComponent(`in:trash ${ALL}`));
  await page.waitForTimeout(2000);
  if (await page.locator('tr.zA').filter({ visible: true }).count()) {
    await guard();
    await focusPage();
    await page.keyboard.press('Shift+Digit8');
    await page.keyboard.press('KeyA');
    await page.waitForTimeout(800);
    await visible('[data-tooltip="받은편지함으로 이동"], [aria-label="받은편지함으로 이동"]').click();
    await page.waitForTimeout(3000);
  }
  await openSearch();
  console.log('test mails back in the inbox:', await page.locator('tr.zA').filter({ visible: true }).count());
}

// ---- 목록에서: cursor, selection and marks.
const list = async () => { await openSearch(); await focusPage(); };
await test(74, 'j', '이전(오래된) 대화로 커서', 'KeyJ', { prepare: list, expect: ['cursor'] });
await test(73, 'k', '최근 대화로 커서', 'KeyK', { expect: ['cursor'] });
await test(31, 'x', '대화 선택', 'KeyX', { prepare: list, expect: ['selected'] });
await test(32, 's', '별표 전환', 'KeyS', { expect: ['starred', 'toast'] });
await test(47, 'Shift + U', '읽지 않은 상태로 표시', 'Shift+KeyU', { expect: ['unread', 'toast'] });
await test(46, 'Shift + I', '읽은 상태로 표시', 'Shift+KeyI', { expect: ['unread', 'toast'] });
// Mail to yourself starts out important, so "-" comes first.
await test(50, '-', '중요하지 않은 대화로 표시', 'Minus', { expect: ['important', 'toast'] });
await test(49, '+', '중요 대화로 표시', 'Shift+Equal', { expect: ['important', 'toast'] });
await test(50, '-', '중요하지 않은 대화로 표시', 'Minus', { expect: ['important', 'toast'] });
await test(49, '=', '중요 대화로 표시', 'Equal', { expect: ['important', 'toast'] });
await test(30, ',', '커서를 툴바로 이동', 'Comma', { expect: ['active'] });
await test(82, '.', "'추가 작업' 메뉴 열기", 'Period', { prepare: async () => { await esc(); await focusPage(); }, expect: ['menus', 'dialogs'], after: esc });
await test(83, 'v', "'이동' 메뉴 열기", 'KeyV', { prepare: async () => { await list(); await page.keyboard.press('KeyX'); await page.waitForTimeout(500); }, expect: ['menus', 'dialogs', 'active'], shot: true, after: esc });
await test(84, 'l', "'라벨 적용' 메뉴 열기", 'KeyL', { prepare: focusPage, expect: ['menus', 'dialogs', 'active'], after: esc });
await test(51, 'b', '다시 알림', 'KeyB', { prepare: focusPage, expect: ['menus', 'dialogs'], after: esc });
await test(75, 'o', '대화 열기', 'KeyO', { prepare: list, expect: ['hash'] });
await test(72, 'u', '대화목록으로 돌아가기', 'KeyU', { expect: ['hash'] });
await test(75, 'Enter', '대화 열기', 'Enter', { prepare: list, expect: ['hash'] });

// ---- 대화목록 선택 (* then a key), in the search result.
await test(64, '* + a', '모든 대화 선택', ['Shift+Digit8', 'KeyA'], { prepare: list, expect: ['selected'] });
await test(65, '* + n', '모든 대화 선택 해제', ['Shift+Digit8', 'KeyN'], { expect: ['selected'] });
await test(66, '* + r', '읽은 대화 선택', ['Shift+Digit8', 'KeyR'], { prepare: list, expect: ['selected'] });
// One test mail is made unread first, so "*u" has something to pick.
await test(67, '* + u', '읽지 않은 대화 선택', ['Shift+Digit8', 'KeyU'], { prepare: async () => { await list(); await page.keyboard.press('KeyX'); await page.keyboard.press('Shift+KeyU'); await page.waitForTimeout(1000); await page.keyboard.press('Shift+Digit8'); await page.keyboard.press('KeyN'); await page.waitForTimeout(800); }, expect: ['selected'] });
await test(68, '* + s', '별표표시된 대화 선택', ['Shift+Digit8', 'KeyS'], { prepare: list, expect: ['selected'] });
await test(69, '* + t', '별표 없는 대화 선택', ['Shift+Digit8', 'KeyT'], { prepare: list, expect: ['selected'] });

// ---- 열린 대화에서 (test mail 2 of 3, so there is a conversation on each side).
const mail = async () => { await openMail(1); await focusPage(); };
await test(74, 'j', '이전(오래된) 대화 열기', 'KeyJ', { prepare: mail, expect: ['hash'] });
await test(73, 'k', '최근 대화 열기', 'KeyK', { expect: ['hash'] });
await test(2, 'n', '열린 대화에서 다음 메일로', 'KeyN', { prepare: mail });
await test(1, 'p', '열린 대화에서 이전 메일로', 'KeyP', { prepare: mail });
await test(52, ';', '전체 대화 펼치기', 'Semicolon', { prepare: mail });
await test(53, ':', '전체 대화 접기', 'Shift+Semicolon', { prepare: mail });
await test(48, '_', '선택한 메일부터 읽지 않은 상태로 표시', 'Shift+Minus', { prepare: mail, expect: ['hash', 'toast'] });
await test(43, 'Shift + N', '대화 새로고침', 'Shift+KeyN', { prepare: mail });
await test(37, 'r', '답장', 'KeyR', { prepare: mail, expect: ['active', 'dialogs', 'fields'], after: discardInlineReply });
await test(39, 'a', '전체답장', 'KeyA', { prepare: mail, expect: ['active', 'dialogs', 'fields'], after: discardInlineReply });
await test(41, 'f', '전달', 'KeyF', { prepare: mail, expect: ['active', 'dialogs', 'fields'], after: discardInlineReply });
await test(38, 'Shift + R', '새 창에서 답장', 'Shift+KeyR', { prepare: mail, expect: ['pages', 'dialogs', 'inCompose'], wait: 3000, after: async () => { await closeExtraPages(); await discardInlineReply(); } });
await test(40, 'Shift + A', '새 창에서 전체답장', 'Shift+KeyA', { prepare: mail, expect: ['pages', 'dialogs', 'inCompose'], wait: 3000, after: async () => { await closeExtraPages(); await discardInlineReply(); } });
await test(42, 'Shift + F', '새 창에서 전달', 'Shift+KeyF', { prepare: mail, expect: ['pages', 'dialogs', 'inCompose'], wait: 3000, after: async () => { await closeExtraPages(); await discardInlineReply(); } });

// Changes that are undone right away with z.
const undo = (n) => test(45, 'z', '마지막 작업 실행취소', 'KeyZ', { safe: true, expect: ['toast', 'hash'], wait: 2500 });
await test(33, 'e', '보관처리', 'KeyE', { prepare: mail, expect: ['hash', 'toast'] });
await undo();
await test(34, 'm', '대화 숨기기(알림 끄기)', 'KeyM', { prepare: mail, expect: ['hash', 'toast'] });
await undo();
// A confirm box ("스팸 신고 및 구독 취소") may come up; it is cancelled, not answered.
await test(35, '!', '스팸신고', 'Shift+Digit1', { prepare: mail, expect: ['hash', 'toast', 'dialogs'], after: esc });
await undo();
await test(36, '#', '삭제', 'Shift+Digit3', { prepare: mail, expect: ['hash', 'toast'] });
await undo();
await test(44, ']', '보관처리 후 다음 대화로', 'BracketRight', { prepare: mail, expect: ['hash', 'toast'] });
await undo();
await test(44, '[', '보관처리 후 이전 대화로', 'BracketLeft', { prepare: mail, expect: ['hash', 'toast'] });
await undo();
skip(54, 'Shift + T', 'Tasks에 대화 추가', 'Google Tasks에 실제 할 일이 생겨서 누르지 않음');

// ---- 이동 (g then a key). Nothing is opened or changed in the folders.
const g = (n, k, action, hash) => test(n, 'g + ' + k, action, ['KeyG', 'Key' + k.toUpperCase()], { safe: true, prepare: async () => { await go('#search/' + encodeURIComponent(QUERY)); await focusPage(); }, expect: ['hash'] });
await g(55, 'i', '받은편지함');
await g(56, 's', '별표편지함');
await g(57, 'b', '다시 알림이 설정된 대화');
await g(58, 't', '보낸편지함');
await g(59, 'd', '임시보관함');
await g(60, 'a', '전체보관함');
await test(62, 'g + k', 'Tasks', ['KeyG', 'KeyK'], { safe: true, prepare: focusPage, wait: 3000, shot: true, after: esc });
await test(63, 'g + l', '라벨', ['KeyG', 'KeyL'], { safe: true, prepare: focusPage, after: esc });
await test(61, 'Ctrl + Alt + .', '사이드바와 받은편지함 전환', 'Control+Alt+Period', { safe: true, prepare: focusPage, expect: ['active'] });
await test(61, 'Ctrl + Alt + ,', '사이드바와 받은편지함 전환', 'Control+Alt+Comma', { safe: true, expect: ['active'] });

// ---- 탐색: pages of All Mail and inbox sections. Nothing is opened.
await test(70, 'g + n', '다음 페이지', ['KeyG', 'KeyN'], { safe: true, prepare: async () => { await go('#all'); await focusPage(); }, expect: ['hash'] });
await test(71, 'g + p', '이전 페이지', ['KeyG', 'KeyP'], { safe: true, expect: ['hash'] });
await test(76, '`', '다음 받은편지함 섹션', 'Backquote', { safe: true, prepare: async () => { await go('#inbox'); await focusPage(); }, expect: ['hash', 'cursor', 'active'] });
await test(77, '~', '이전 받은편지함 섹션', 'Shift+Backquote', { safe: true, expect: ['hash', 'cursor', 'active'] });

// ---- 애플리케이션
await test(79, 'd', '새 탭에서 편지쓰기', 'KeyD', { safe: true, prepare: async () => { await go('#inbox'); await focusPage(); }, expect: ['pages'], wait: 3000, after: closeExtraPages });
await test(81, 'q', '채팅 주소록 검색', 'KeyQ', { safe: true, prepare: focusPage, after: esc });
await test(85, '?', '단축키 도움말 열기', 'Shift+Slash', { safe: true, prepare: focusPage, expect: ['dialogs', 'active'], shot: true, after: esc });

// ---- 정리: all test mails to the trash (with "*a" then "#").
await go('#search/' + encodeURIComponent(ALL));
await focusPage();
await page.keyboard.press('Shift+Digit8');
await page.keyboard.press('KeyA');
await page.waitForTimeout(800);
await guard();
await page.keyboard.press('Shift+Digit3');
await page.waitForTimeout(3000);
await go('#search/' + encodeURIComponent(ALL));
const left = await page.locator('tr.zA').filter({ visible: true }).count();
console.log('test mails left after cleanup:', left);
await go('#drafts');
const drafts = await page.locator('tr.zA').filter({ visible: true }).evaluateAll((rows) => rows.slice(0, 3).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 60)));
console.log('NEWEST DRAFTS:', JSON.stringify(drafts));
save();
await context.close();
