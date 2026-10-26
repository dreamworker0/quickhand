// Which Gmail keys need something done first? Every single-key shortcut that acts on
// mail is pressed in three states and the page is compared before and after:
//   목록(고르지 않음)  the search list of the test mails, nothing ticked
//   목록(X로 고름)     the same list after x ticked the first mail
//   대화 열림          the first test mail open
// A key that changes the page only in some states needs those first; Quickhand should
// count it in exactly the states where Gmail reacted.
//
// Only test mail is touched: two mails to the signed-in account itself
// ("[손빠르미 점검] 선행 조사 메일 1·2"). Keys run only while the screen shows nothing but
// them; changes are undone with z, and the mails go to the trash at the end.
// Shift+T is not pressed: it makes a real task in Google Tasks.
// Results: results/gmail-prereq.json and a table in the console.
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const MARK = '손빠르미 점검';
const SUBJECT = `[${MARK}] 선행 조사 메일`;
const QUERY = `subject:(${MARK} 선행 조사) in:inbox newer_than:1d`;
const ANY = `subject:(${MARK} 선행 조사) newer_than:1d`;
const OUT = path.join(RESULTS, 'gmail-prereq.json');

// [key shown, Playwright key, what Gmail's help page says it does]
const KEYS = [
  ['e', 'KeyE', '보관처리'],
  ['#', 'Shift+Digit3', '삭제'],
  ['!', 'Shift+Digit1', '스팸신고'],
  ['Shift+I', 'Shift+KeyI', '읽음으로 표시'],
  ['Shift+U', 'Shift+KeyU', '읽지 않음으로 표시'],
  ['m', 'KeyM', '알림 끄기'],
  ['=', 'Equal', '중요 표시'],
  ['-', 'Minus', '중요하지 않음으로 표시'],
  ['s', 'KeyS', '별표'],
  ['b', 'KeyB', '다시 알림'],
  ['v', 'KeyV', '이동'],
  ['l', 'KeyL', '라벨'],
  ['.', 'Period', '추가 작업 메뉴'],
  ['[', 'BracketLeft', '보관처리 후 최근 대화로'],
  [']', 'BracketRight', '보관처리 후 예전 대화로'],
  ['r', 'KeyR', '답장'],
  ['a', 'KeyA', '전체답장'],
  ['f', 'KeyF', '전달'],
  ['Shift+R', 'Shift+KeyR', '새 창에서 답장'],
  ['Shift+A', 'Shift+KeyA', '새 창에서 전체답장'],
  ['Shift+F', 'Shift+KeyF', '새 창에서 전달'],
  ['n', 'KeyN', '대화 안의 다음 메일'],
  ['p', 'KeyP', '대화 안의 이전 메일'],
  ['Shift+N', 'Shift+KeyN', '대화 새로고침'],
  [';', 'Semicolon', '모두 펼치기'],
  [':', 'Shift+Semicolon', '모두 접기'],
  ['_', 'Shift+Minus', '이 메일부터 읽지 않음으로'],
  ['o', 'KeyO', '대화 열기'],
  ['Enter', 'Enter', '대화 열기'],
  ['u', 'KeyU', '목록으로 돌아가기'],
  ['j', 'KeyJ', '예전 대화로'],
  ['k', 'KeyK', '최근 대화로'],
  [',', 'Comma', '툴바로 이동'],
  ['x', 'KeyX', '대화 선택'],
  ['z', 'KeyZ', '실행취소'],
];

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
async function closeExtraPages() {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
}
async function discardInlineReply() {
  // The button's name carries its shortcut: "임시보관 메일 삭제 (Ctrl-Shift-D)".
  const del = page.locator('[aria-label^="임시보관 메일 삭제"], [data-tooltip^="임시보관 메일 삭제"]').filter({ visible: true });
  if (await del.count()) { await del.first().click().catch(() => {}); await page.waitForTimeout(800); }
}

const state = () => page.evaluate(() => {
  const vis = (e) => !!e.getClientRects().length;
  const rs = [...document.querySelectorAll('tr.zA')].filter(vis);
  const a = document.activeElement;
  const open = document.querySelector('h2.hP');
  return {
    hash: decodeURIComponent(location.hash).replace(/\/[A-Za-z0-9]{16,}$/, '/(대화)'),
    rows: rs.length,
    ticked: rs.filter((r) => r.querySelector('[role="checkbox"][aria-checked="true"]')).length,
    unread: rs.filter((r) => r.classList.contains('zE')).length,
    starred: rs.map((r) => { const t = r.querySelector('.T-KT, [aria-label*="별표"]'); return t ? t.getAttribute('aria-label') || '' : ''; }).join(','),
    important: rs.filter((r) => r.querySelector('.pG.pH-Jp, .pH-A7')).length,
    cursor: rs.findIndex((r) => r.classList.contains('btb')),
    open: open && vis(open) ? 1 : 0,
    messages: [...document.querySelectorAll('.adn, .kv, .kQ')].filter(vis).length,
    expanded: [...document.querySelectorAll('.adn')].filter(vis).length,
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(vis).map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').slice(0, 20)).join(' | '),
    menus: [...document.querySelectorAll('[role="menu"]')].filter(vis).length,
    reply: [...document.querySelectorAll('div[aria-label="메일 본문"]')].filter(vis).length,
    active: a ? [a.tagName.toLowerCase(), a.getAttribute('aria-label'), a.getAttribute('role')].filter(Boolean).join(' ').slice(0, 40) : '',
    toast: [...document.querySelectorAll('.bAq, .vh')].filter(vis).map((e) => e.innerText.split('\n')[0].trim()).filter(Boolean).join(' / ').slice(0, 40),
  };
});
const NOTHING = /선택한 대화가 없습니다|No conversations selected/;
function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${JSON.stringify(b[k]).slice(0, 30)} → ${JSON.stringify(a[k]).slice(0, 30)}`);
  return out;
}

// Keys that change mail run only while the screen shows nothing but the test mails.
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
async function onlyTestMail(want = 2) {
  for (let i = 0; i < 25; i++) {
    try { await guard(); if ((await rows().count()) >= want || (await page.locator('h2.hP').filter({ visible: true }).count())) return; } catch (e) { /* still loading */ }
    await page.waitForTimeout(1000);
  }
  await guard();
}
// Put the test mails back in the inbox if a key moved them (archive, spam, trash, snooze).
async function bringBack() {
  for (const where of ['in:trash', 'in:spam', '-in:inbox']) {
    await go('#inbox');
    await go('#search/' + encodeURIComponent(`${where} ${ANY}`));
    await page.waitForTimeout(1500);
    if (!(await rows().count())) continue;
    await guard();
    await focusPage();
    await page.keyboard.press('Shift+Digit8'); await page.keyboard.press('KeyA');
    await page.waitForTimeout(800);
    const button = page.locator('[data-tooltip="받은편지함으로 이동"], [aria-label="받은편지함으로 이동"], [data-tooltip="스팸 아님"], [aria-label="스팸 아님"]').filter({ visible: true });
    if (await button.count()) { await button.first().click(); await page.waitForTimeout(2500); }
  }
}
async function list() {
  await closeExtraPages();
  await discardInlineReply();
  await go('#inbox'); // setting the same search hash again would not reload it
  await go('#search/' + encodeURIComponent(QUERY));
  try {
    await onlyTestMail(2);
    if ((await rows().count()) < 2) throw new Error('fewer');
  } catch (e) {
    await bringBack();
    await go('#inbox');
    await go('#search/' + encodeURIComponent(QUERY));
    await onlyTestMail(2);
  }
  await page.waitForTimeout(600);
  await focusPage();
}
const STATES = {
  '목록(고르지 않음)': list,
  '목록(X로 고름)': async () => { await list(); await page.keyboard.press('KeyX'); await page.waitForTimeout(500); },
  '대화 열림': async () => {
    await list();
    await rows().first().click();
    await visible('h2.hP').waitFor();
    await page.waitForTimeout(1200);
    await guard();
    await focusPage();
  },
};

async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}

// ---------------------------------------------------------------- the test mails
await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('input[name="q"]', { timeout: 60000 });
await page.waitForTimeout(4000);
const me = (await page.locator('a[aria-label*="@"]').first().getAttribute('aria-label')).match(/[\w.+-]+@[\w.-]+/)[0];
await go('#search/' + encodeURIComponent(ANY));
await page.waitForTimeout(1500);
for (let no = (await rows().count()) + 1; no <= 2; no++) {
  await visible('[role="button"][gh="cm"], .T-I.T-I-KE').click();
  const to = visible('[role="dialog"] input[aria-label*="수신자"], [role="dialog"] [role="combobox"]');
  await to.waitFor();
  await to.click();
  await page.keyboard.type(me);
  await page.keyboard.press('Tab');
  await visible('[role="dialog"] input[name="subjectbox"]').fill(`${SUBJECT} ${no}`);
  await visible('div[aria-label="메일 본문"]').click();
  await page.keyboard.type('손빠르미 선행 동작 조사용 시험 메일입니다. 지워도 됩니다.');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(3000);
}
await list();
console.log('test mails:', await rows().count());

// ---------------------------------------------------------------- the survey
const results = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
for (const [shown, key, what] of KEYS) {
  const row = { key: shown, action: what, states: {} };
  for (const [name, prepare] of Object.entries(STATES)) {
    let cell;
    try {
      await prepare();
      const before = await state();
      const since = Date.now();
      await page.keyboard.press(key);
      await page.waitForTimeout(1800);
      const after = await state();
      const pages = context.pages().filter((p) => p !== page && !p.url().startsWith('chrome-extension://')).length;
      const quickhand = await quickhandSaw(since);
      const changed = diff(before, after).filter((c) => !(c.startsWith('toast') && NOTHING.test(after.toast)));
      if (pages) changed.push(`새 창 ${pages}개`);
      const refused = NOTHING.test(after.toast) && !NOTHING.test(before.toast);
      cell = { gmail: !refused && changed.length > 0, refused, changed, quickhand };
      // Undo what changed mail; the next state starts from a fresh list anyway.
      if (after.toast !== before.toast && /실행취소/.test(await page.locator('.bAq, .vh').filter({ visible: true }).allInnerTexts().then((t) => t.join(' ')))) {
        await page.keyboard.press('KeyZ');
        await page.waitForTimeout(1800);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
    } catch (e) {
      cell = { gmail: null, changed: [], quickhand: null, error: e.message.split('\n')[0] };
    }
    row.states[name] = cell;
    console.log(shown, '|', name, '|', JSON.stringify(cell));
  }
  results.push(row);
  save();
}

// ---------------------------------------------------------------- clean up
await closeExtraPages();
await discardInlineReply();
await bringBack();
await go('#inbox');
await go('#search/' + encodeURIComponent(ANY));
await page.waitForTimeout(2500);
if (await rows().count()) {
  await onlyTestMail(1);
  await focusPage();
  await page.keyboard.press('Shift+Digit8'); await page.keyboard.press('KeyA');
  await page.waitForTimeout(800);
  await guard();
  await page.keyboard.press('Shift+Digit3');
  await page.waitForTimeout(3000);
}
// Replies opened in new windows can leave drafts; they go too.
await go('#inbox');
await go('#search/' + encodeURIComponent(`in:drafts ${MARK}`));
await page.waitForTimeout(2500);
const drafts = await rows().count();
if (drafts) {
  await onlyTestMail(1);
  await focusPage();
  await page.keyboard.press('Shift+Digit8'); await page.keyboard.press('KeyA');
  await page.waitForTimeout(800);
  const discard = page.locator('[data-tooltip="임시보관 메일 삭제"], [aria-label="임시보관 메일 삭제"]').filter({ visible: true });
  if (await discard.count()) { await discard.first().click(); await page.waitForTimeout(2500); }
}
await go('#inbox');
await go('#search/' + encodeURIComponent(`${ANY} -in:trash`));
await page.waitForTimeout(2500);
console.log('test drafts found:', drafts, '| test mails left outside the trash:', await rows().count());
save();

// ---------------------------------------------------------------- the table
const mark = (c) => (c.error ? '오류' : c.gmail ? (c.quickhand ? 'O·셈' : 'O·안 셈') : (c.quickhand ? 'X·셈!' : 'X'));
console.log('\n키 | 동작 | ' + Object.keys(STATES).join(' | '));
for (const r of results) console.log(`${r.key} | ${r.action} | ` + Object.values(r.states).map(mark).join(' | '));
await context.close();
