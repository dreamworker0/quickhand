// Every shortcut on Google Sheets' help page (support.google.com/docs/answer/181110,
// PC): press it in a test spreadsheet and record (1) what changed, so a person can
// tell whether Sheets reacted, and (2) whether Quickhand counted it.
//
// Signals: Sheets' screen reader announcements (screen reader support is turned on
// at the start and off again at the end), the name box (the selected range), the
// formula bar, toolbar state, sheet tabs, open dialogs/menus/panels, the focused
// element, and for content changes the sheet's read-only "htmlview" export.
//
// Only a new spreadsheet named "손빠르미 단축키 점검 문서 (지워도 됨)" is edited.
// Print is stubbed. Results: results/sheets-shortcuts.json
//
// --from=CODE: skip the tests before the one with this code (e.g. --from=A21); the
// results of the skipped ones are kept from the last run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch, RESULTS, keyFor, shownFor, twoStep } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const OUT = path.join(RESULTS, 'sheets-shortcuts.json');

const { context, worker } = await launch({ headless: false });
// No cheer cards, as in docs-shortcuts.mjs: with one on screen, keys pressed by
// Playwright sometimes left the editor saying its changes weren't saved (Mac).
await worker.evaluate(async () => {
  const { qh_settings } = await chrome.storage.sync.get('qh_settings');
  await chrome.storage.sync.set({ qh_settings: Object.assign({}, qh_settings, { praise: false }) });
});
await context.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
const page = await context.newPage();
// Keys are written as on Windows; on a Mac every press goes through keyFor() (lib.mjs).
const pressKey = page.keyboard.press.bind(page.keyboard);
page.keyboard.press = (k, opts) => pressKey(keyFor(k, 'sheets'), opts);
page.setDefaultTimeout(10000);
// Leaving version history asks "나가시겠습니까?"; answer yes so the check gets back to the sheet.
page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
await page.setViewportSize({ width: 1700, height: 950 });
const FROM = (process.argv.find((a) => a.startsWith('--from=')) || '').slice(7);
let started = !FROM;
let tableMade = false;
const results = FROM && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).slice(0, Math.max(0, JSON.parse(fs.readFileSync(OUT, 'utf8')).findIndex((r) => r.n === FROM))) : [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

// ---------------------------------------------------------------- measuring
const NOISE = /^(저장 중…|드라이브에 저장됨|로드 중.*|수식 계산 중…|배너 숨겨짐|.)$/;
async function startLive() {
  await page.evaluate(() => {
    if (!window.__liveObserver) {
      window.__liveObserver = new MutationObserver((ms) => {
        for (const m of ms) {
          const n = m.target.nodeType === 1 ? m.target : m.target.parentElement;
          const t = n && (n.textContent || '').trim();
          if (t && t.length < 200) window.__live.push(t);
        }
      });
      window.__liveObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
    }
    window.__live = [];
  });
}
const takeLive = (src) => page.evaluate((s) => {
  const noise = new RegExp(s);
  return [...new Set(window.__live || [])].filter((t) => !noise.test(t)).slice(-8);
}, src);

const state = () => page.evaluate(() => {
  const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const a = document.activeElement;
  return {
    name: (document.querySelector('#t-name-box') || {}).value || '',
    formula: ((document.querySelector('#t-formula-bar-input') || {}).innerText || '').trim().slice(0, 40),
    pressed: [...document.querySelectorAll('#docs-toolbar [aria-pressed="true"], .docs-toolbar [aria-pressed="true"]')].map((e) => e.id).join(','),
    tabs: [...document.querySelectorAll('.docs-sheet-tab')].map((t) => (t.classList.contains('docs-sheet-active-tab') ? '*' : '') + t.innerText.trim()).join(','),
    menubar: vis(document.querySelector('#docs-menubar')),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal-dialog')].filter(vis)
      .map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').slice(0, 30)).join(' | '),
    menus: [...document.querySelectorAll('.goog-menu, [role="menu"]')].filter(vis).map((m) => (m.innerText.split('\n')[0] || '').slice(0, 15)).join(' | '),
    panels: [...document.querySelectorAll('[role="complementary"], .docs-companion-app-container, .docos-stream-view, #docs-revisions-sidebar, .waffle-assistant-panel')]
      .filter(vis).map((p) => (p.getAttribute('aria-label') || p.className.split(' ')[0] || '').slice(0, 30)).join(' | '),
    active: a ? [a.tagName.toLowerCase(), a.getAttribute('aria-label'), a.getAttribute('role'), (a.className || '').toString().split(' ')[0]].filter(Boolean).join(' ').slice(0, 50) : '',
    url: location.href.replace(/^.*\/edit/, ''),
    editing: !!document.querySelector('.cell-input[contenteditable="true"]:focus, #waffle-rich-text-editor:focus'),
    printed: window.__printed || 0,
  };
});

let sheetUrl = '';
async function content() {
  await page.waitForTimeout(2500); // let Sheets save
  const res = await page.request.get(sheetUrl.replace(/\/edit.*$/, '/htmlview'));
  const html = (await res.text()).replace(/<head[\s\S]*?<\/head>|<script[\s\S]*?<\/script>/g, '');
  const cells = (html.match(/<td[^>]*>([^<]*)</g) || []).map((t) => t.replace(/<td[^>]*>/, '').replace(/<$/, '')).filter(Boolean);
  return { hash: crypto.createHash('md5').update(html).digest('hex').slice(0, 8), text: cells.slice(0, 40).join(' ') };
}

function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${JSON.stringify(b[k]).slice(0, 60)} → ${JSON.stringify(a[k]).slice(0, 60)}`);
  return out;
}

async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).filter((l) => l.at >= t && l.input === 'key').pop();
    return e ? e.id : null;
  }, since);
}

async function test(n, keyLabel, action, keys, { prepare, expect, body = false, after, wait = 1500, note = '', alt } = {}) {
  if (!started && n === FROM) started = true;
  if (!started) return { n, sheets: null };
  const r = { n, key: shownFor(keyLabel, 'sheets'), action, sheets: null, live: [], changed: [], quickhand: null, error: null, note };
  try {
    if (prepare) await prepare();
    const before = await state();
    const cBefore = body ? await content() : null;
    await startLive();
    const since = Date.now();
    for (const k of [].concat(keys)) {
      await page.keyboard.press(k);
      await page.waitForTimeout(200);
    }
    r.pressed = true;
    await page.waitForTimeout(wait);
    const now = await state();
    r.live = await takeLive(NOISE.source);
    r.changed = diff(before, now);
    if (context.pages().length > 1) r.changed.push(`pages: ${context.pages().length}`);
    if (body) {
      const cAfter = await content();
      if (cAfter.hash !== cBefore.hash) r.changed.push('content: ' + cAfter.text.slice(0, 120));
    }
    r.quickhand = await quickhandSaw(since);
    if (expect instanceof RegExp) r.sheets = r.live.some((t) => expect.test(t)) || r.changed.some((c) => expect.test(c));
    else if (Array.isArray(expect)) r.sheets = r.changed.some((c) => expect.some((k) => c.startsWith(k)));
    else r.sheets = r.live.length > 0 || r.changed.length > 0;
  } catch (e) {
    r.error = e.message.split('\n')[0];
  }
  try {
    if (after) await after(r);
  } catch (e) {
    r.error = (r.error ? r.error + ' / ' : '') + '정리 실패: ' + e.message.split('\n')[0];
  }
  results.push(r);
  console.log(JSON.stringify(r));
  save();
  if (alt && r.sheets === false) return test(n, keyLabel, action + ' (두 번째 키만 따로)', alt, { prepare, expect, body, after, wait, note });
  return r;
}
function skip(n, key, action, why) {
  const r = { n, key, action, sheets: null, live: [], changed: [], quickhand: null, error: null, skipped: why };
  results.push(r);
  console.log(JSON.stringify(r));
  save();
}

// ---------------------------------------------------------------- moving around
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(400); };
async function closeExtraPages() {
  for (const p of context.pages()) if (p !== page) await p.close().catch(() => {});
}
// Select a cell or range by typing it into the name box (focus goes back to the grid).
async function cell(ref) {
  await closeExtraPages();
  const box = page.locator('#t-name-box');
  await box.click();
  await box.fill(ref);
  await box.press('Enter');
  await page.waitForTimeout(500);
}
const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const seq = (a, b) => twoStep(a, b); // Ctrl+Alt held (Mac: Control+⌘)
const loose = (keys) => [keys[0], keys[1].replace(/^Control\+(Alt|Meta)\+(Shift\+)?/, '')];

async function screenReader(on) {
  for (let i = 0; i < 2; i++) {
    await cell('A1');
    await startLive();
    await page.keyboard.press('Control+Alt+KeyZ');
    await page.waitForTimeout(1500);
    const said = (await takeLive('^$')).join(' ');
    if (on ? /사용 설정/.test(said) : /사용 중지/.test(said)) return;
  }
  console.log('screen reader support could not be set to', on);
}

// ---------------------------------------------------------------- the test spreadsheet
await page.goto('https://sheets.new', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.docs-title-input', { timeout: 60000 });
await page.waitForTimeout(4000);
sheetUrl = page.url();
console.log('test spreadsheet:', sheetUrl);
await page.locator('.docs-title-input').click();
await page.keyboard.press('Control+A');
await page.keyboard.type(TITLE);
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
// A1:C5 (ASCII: typing Korean straight into a cell drops the first character)
const rows = [['Name', 'Score', 'Note'], ['Kim', '10', 'teh'], ['Lee', '20', 'b'], ['Park', '30', 'c'], ['Sum', '=SUM(B2:B4)', 'https://www.google.com']];
await cell('A1');
for (const row of rows) {
  for (const [i, v] of row.entries()) { await page.keyboard.type(v); await page.keyboard.press(i < row.length - 1 ? 'Tab' : 'Enter'); }
}
await page.waitForTimeout(1500);

await test('R1', 'Ctrl + Alt + Z', '스크린 리더 지원 사용', 'Control+Alt+KeyZ', { prepare: () => cell('A1'), expect: /사용 설정/ });
if (FROM) await screenReader(true); // the switch-on test above is skipped when resuming

// ---------------------------------------------------------------- 대표적인 작업
await test('A1', 'Ctrl + Space', '열 선택', 'Control+Space', { prepare: () => cell('B2'), expect: ['name'] });
await test('A2', 'Shift + Space', '행 선택', 'Shift+Space', { prepare: () => cell('B2'), expect: ['name'] });
await test('A3', 'Ctrl + A', '모두 선택', 'Control+KeyA', { prepare: () => cell('B2'), expect: ['name'] });
await test('A3', 'Ctrl + Shift + Space', '모두 선택 (다른 키)', 'Control+Shift+Space', { prepare: () => cell('B2'), expect: ['name'] });
await test('C1', 'Ctrl + B', '굵게 (실행취소용)', 'Control+KeyB', { prepare: () => cell('A2'), expect: ['pressed'] });
await test('A4', 'Ctrl + Z', '실행취소', 'Control+KeyZ', { prepare: () => cell('A2'), expect: ['pressed'] });
await test('A5', 'Ctrl + Y', '재실행', 'Control+KeyY', { prepare: () => cell('A2'), expect: ['pressed'] });
await test('A4', 'Ctrl + Z', '실행취소', 'Control+KeyZ', { prepare: () => cell('A2'), expect: ['pressed'] });
await test('A5', 'Ctrl + Shift + Z', '재실행 (다른 키)', 'Control+Shift+KeyZ', { prepare: () => cell('A2'), expect: ['pressed'] });
await test('A4', 'Ctrl + Z', '실행취소', 'Control+KeyZ', { prepare: () => cell('A2'), expect: ['pressed'] });
await test('A5', 'F4', '재실행 (다른 키)', 'F4', { prepare: () => cell('A2'), expect: ['pressed'] });
await test('A6', 'Ctrl + F', '찾기', 'Control+KeyF', { prepare: () => cell('A1'), expect: ['dialogs', 'active', 'panels'], after: esc });
await test('A7', 'Ctrl + H', '찾기 및 바꾸기', 'Control+KeyH', { prepare: () => cell('A1'), expect: ['dialogs', 'active'], after: esc });
await test('A8', 'Ctrl + Enter', '범위 채우기', ['KeyX', 'Control+Enter'], { prepare: () => cell('E2:E4'), body: true, expect: ['content'] });
await test('A9', 'Ctrl + D', '아래로 채우기', 'Control+KeyD', { prepare: () => cell('A2:A3'), body: true, expect: ['content'] });
await test('A4', 'Ctrl + Z', '실행취소 (채우기 되돌림)', 'Control+KeyZ', { prepare: () => cell('A1') });
await test('A10', 'Ctrl + R', '오른쪽으로 채우기', 'Control+KeyR', { prepare: () => cell('B2:C2'), body: true, expect: ['content'] });
await test('A4', 'Ctrl + Z', '실행취소 (채우기 되돌림)', 'Control+KeyZ', { prepare: () => cell('A1') });
await test('A11', 'Ctrl + S', '저장', 'Control+KeyS', { prepare: () => cell('A1') });
await test('A12', 'Ctrl + O', '열기', 'Control+KeyO', { prepare: () => cell('A1'), expect: ['dialogs', 'active'], wait: 3000, after: esc });
await test('A13', 'Ctrl + P', '인쇄', 'Control+KeyP', { prepare: () => cell('A1'), expect: ['printed', 'dialogs', 'url', 'active'], wait: 4000,
  after: async () => { await esc(); if (!/\/edit/.test(page.url()) || !(await page.locator('#t-name-box').isVisible())) { await page.goto(sheetUrl); await page.waitForSelector('#t-name-box', { timeout: 60000 }); await page.waitForTimeout(3000); } } });
await test('A14', 'Ctrl + C', '복사', 'Control+KeyC', { prepare: () => cell('A2') });
await test('A16', 'Ctrl + V', '붙여넣기', 'Control+KeyV', { prepare: () => cell('F2'), body: true, expect: ['content', 'formula'] });
await test('A17', 'Ctrl + Shift + V', '값만 붙여넣기', 'Control+Shift+KeyV', { prepare: () => cell('F3'), body: true, expect: ['content', 'formula'] });
await test('A15', 'Ctrl + X', '잘라내기', 'Control+KeyX', { prepare: () => cell('F3') });
await test('A16', 'Ctrl + V', '붙여넣기 (잘라낸 것)', 'Control+KeyV', { prepare: () => cell('F4'), body: true, expect: ['content', 'formula'] });
await test('A18', 'Ctrl + /', '단축키 표시', 'Control+Slash', { prepare: () => cell('A1'), expect: ['dialogs'], after: esc });
await test('A19', 'Shift + F11', '새 시트 삽입', 'Shift+F11', { prepare: () => cell('A1'), expect: ['tabs'] });
await test('A20', 'Ctrl + Shift + F', '컨트롤 숨기기', 'Control+Shift+KeyF', { prepare: () => cell('A1'), expect: ['menubar'] });
await test('A20', 'Ctrl + Shift + F', '컨트롤 다시 보이기', 'Control+Shift+KeyF', { prepare: () => cell('A1'), expect: ['menubar'] });
// Sheets toggles input tools without announcing it, so the check types a letter:
// with input tools on, "a" comes out as "ㅁ".
const typesJamo = async () => {
  await cell('Z200');
  await page.keyboard.type('a');
  await page.waitForTimeout(500);
  const text = await page.locator('#t-formula-bar-input').innerText().catch(() => '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  return /ㅁ/.test(text);
};
await test('A21', 'Ctrl + Shift + K', '입력 도구 켜기/끄기', 'Control+Shift+KeyK', { prepare: () => cell('A1'), expect: /입력 도구|jamo/,
  // Note whether letters now come out as jamo, then press the key again to undo it.
  after: async (r) => {
    if (!r.pressed) return;
    if (await typesJamo()) { r.changed.push('jamo: 입력 도구가 켜져 a가 ㅁ으로 입력됨'); r.sheets = true; }
    await page.keyboard.press('Control+Shift+KeyK');
    await page.waitForTimeout(800);
    if (await typesJamo()) { await page.keyboard.press('Control+Shift+KeyK'); await page.waitForTimeout(800); }
    save();
  } });
await test('A22', 'Ctrl + Alt + Shift + K', '입력 도구 선택', 'Control+Alt+Shift+KeyK', { prepare: () => cell('A1'), expect: ['menus', 'active'], after: esc });
await test('A23', 'Alt + /', '메뉴 검색', 'Alt+Slash', { prepare: () => cell('A1'), expect: ['active', 'menus'], after: esc });
await test('A24', 'Alt + 1', '시트 이름 바꾸기', 'Alt+Digit1', { prepare: () => cell('A1'), expect: ['active', 'dialogs'], after: esc });
await test('A25', 'Ctrl + Alt + T', '범위를 표로 변환', 'Control+Alt+KeyT', { prepare: () => cell('A1:C5'), expect: /표|table|dialogs/i, wait: 2500, after: async (r) => { if (r.pressed) tableMade = true; await esc(); } });
// The table stays: undoing the conversion right away made Sheets show a save error
// that blocked the page. Its column menu and filter are used further down.

// ---------------------------------------------------------------- 셀 서식
// Borders and underline show neither in the toolbar nor in announcements; compare the content.
const fmt = (n, key, action, k, ex = /./) => test(n, key, action, k, { prepare: () => cell('A2:B3'), expect: ex, body: true });
await fmt('C1', 'Ctrl + B', '굵게', 'Control+KeyB', /굵게|pressed/);
await fmt('C2', 'Ctrl + U', '밑줄', 'Control+KeyU', /밑줄|pressed|content/);
await fmt('C3', 'Ctrl + I', '기울임꼴', 'Control+KeyI', /기울임|pressed/);
await fmt('C4', 'Alt + Shift + 5', '취소선', 'Alt+Shift+Digit5', /취소선|pressed/);
await fmt('C5', 'Ctrl + Shift + E', '가운데 맞춤', 'Control+Shift+KeyE', /가운데|맞춤|정렬/);
await fmt('C6', 'Ctrl + Shift + L', '왼쪽 맞춤', 'Control+Shift+KeyL', /왼쪽|맞춤|정렬/);
await fmt('C7', 'Ctrl + Shift + R', '오른쪽 맞춤', 'Control+Shift+KeyR', /오른쪽|맞춤|정렬/);
await fmt('C8', 'Alt + Shift + 1', '위쪽 테두리', 'Alt+Shift+Digit1', /테두리|content/);
await fmt('C9', 'Alt + Shift + 2', '오른쪽 테두리', 'Alt+Shift+Digit2', /테두리|content/);
await fmt('C10', 'Alt + Shift + 3', '아래쪽 테두리', 'Alt+Shift+Digit3', /테두리|content/);
await fmt('C11', 'Alt + Shift + 4', '왼쪽 테두리', 'Alt+Shift+Digit4', /테두리|content/);
await fmt('C12', 'Alt + Shift + 6', '테두리 삭제', 'Alt+Shift+Digit6', /테두리|content/);
await fmt('C13', 'Alt + Shift + 7', '바깥쪽 테두리', 'Alt+Shift+Digit7', /테두리|content/);
await fmt('C13', 'Ctrl + Shift + 7', '바깥쪽 테두리 (다른 키)', 'Control+Shift+Digit7', /테두리|content/);
await test('C14', 'Ctrl + K', '링크 삽입', 'Control+KeyK', { prepare: () => cell('A3'), expect: ['dialogs', 'active'], after: esc });
await test('C15', 'Ctrl + Shift + ;', '시간 삽입', 'Control+Shift+Semicolon', { prepare: () => cell('G2'), expect: ['formula', 'editing'], after: async () => { await page.keyboard.press('Enter'); } });
await test('C16', 'Ctrl + ;', '날짜 삽입', 'Control+Semicolon', { prepare: () => cell('G3'), expect: ['formula', 'editing'], after: async () => { await page.keyboard.press('Enter'); } });
await test('C17', 'Ctrl + Alt + Shift + ;', '날짜 및 시간 삽입', 'Control+Alt+Shift+Semicolon', { prepare: () => cell('G4'), expect: ['formula', 'editing'], after: async () => { await page.keyboard.press('Enter'); } });
// When Sheets has made the numbers a table it says "테이블 열 유형이 … 유형으로 업데이트됨" instead (Mac, 2026-10-28).
const num = (n, key, action, k) => test(n, key, action, k, { prepare: () => cell('B2:B4'), body: true, expect: /content|형식|서식|유형으로 업데이트/ });
await num('C18', 'Ctrl + Shift + 1', '소수점 형식', 'Control+Shift+Digit1');
await num('C19', 'Ctrl + Shift + 2', '시간 형식', 'Control+Shift+Digit2');
await num('C20', 'Ctrl + Shift + 3', '날짜 형식', 'Control+Shift+Digit3');
await num('C21', 'Ctrl + Shift + 4', '통화 형식', 'Control+Shift+Digit4');
await num('C22', 'Ctrl + Shift + 5', '백분율 형식', 'Control+Shift+Digit5');
await num('C23', 'Ctrl + Shift + 6', '지수 형식', 'Control+Shift+Digit6');
await test('C24', 'Ctrl + \\', '서식 지우기', 'Control+Backslash', { prepare: () => cell('A1:G5'), body: true, expect: /content|서식/ });

// ---------------------------------------------------------------- 탐색
await test('N1', 'Home', '행의 시작으로', 'Home', { prepare: () => cell('C3'), expect: ['name'] });
await test('N2', 'Ctrl + Home', '시트의 시작으로', 'Control+Home', { prepare: () => cell('C3'), expect: ['name'] });
await test('N3', 'End', '행의 끝으로', 'End', { prepare: () => cell('A3'), expect: ['name'] });
await test('N4', 'Ctrl + End', '시트의 끝으로', 'Control+End', { prepare: () => cell('A1'), expect: ['name'] });
await test('N5', 'Ctrl + Backspace', '활성 셀로 스크롤', 'Control+Backspace', {
  prepare: async () => { await cell('B3'); await page.mouse.move(800, 500); await page.mouse.wheel(0, 3000); await page.waitForTimeout(800); }, expect: /./,
});
// A second sheet to move to.
if (started) { await cell('A1'); await page.keyboard.press('Shift+F11'); await page.waitForTimeout(1500); await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(1000); }
await test('N6', 'Alt + ↓', '다음 시트로', 'Alt+ArrowDown', { prepare: () => cell('A1'), expect: ['tabs', 'url'] });
await test('N7', 'Alt + ↑', '이전 시트로', 'Alt+ArrowUp', { prepare: () => cell('A1'), expect: ['tabs', 'url'] });
await test('N8', 'Alt + Shift + K', '시트 목록 표시', 'Alt+Shift+KeyK', { prepare: () => cell('A1'), expect: ['menus', 'active'], after: esc });
await test('N9', 'Alt + Enter', '하이퍼링크 열기', 'Alt+Enter', { prepare: () => cell('C5'), expect: ['pages'], wait: 3000, after: closeExtraPages });
await test('N10', 'Ctrl + Alt + Shift + I', '탐색 열기', 'Control+Alt+Shift+KeyI', { prepare: () => cell('A1'), expect: ['panels', 'dialogs', 'active'], wait: 2500, after: esc });
await test('N11', 'Ctrl + Alt + .', '측면 패널로 이동', 'Control+Alt+Period', { prepare: () => cell('A1'), expect: ['active', 'panels'] });
await test('N11', 'Ctrl + Alt + ,', '측면 패널로 이동 (반대)', 'Control+Alt+Comma', { prepare: () => cell('A1'), expect: ['active', 'panels'] });
await test('N12', 'Ctrl + Alt + Shift + M', '스프레드시트 밖으로 포커스', 'Control+Alt+Shift+KeyM', { prepare: () => cell('A1'), expect: ['active'] });
await test('N13', 'Alt + Shift + Q', '빠른 요약으로 이동', 'Alt+Shift+KeyQ', { prepare: () => cell('B2:B4'), expect: ['active', 'panels', 'dialogs'], after: esc });
await test('N14', 'Ctrl + Alt + E, P', '팝업으로 포커스 이동', seq('KeyE', 'KeyP'), { prepare: async () => { await cell('C5'); await page.waitForTimeout(800); }, expect: ['active'], after: esc, alt: loose(seq('KeyE', 'KeyP')) });
await test('N16', 'Ctrl + Alt + Shift + H', '업데이트 기록', 'Control+Alt+Shift+KeyH', { prepare: () => cell('A1'), expect: ['url', 'panels', 'dialogs', 'menubar'], wait: 4000,
  after: async () => { await page.goto(sheetUrl); await page.waitForSelector('#t-name-box', { timeout: 60000 }); await page.waitForTimeout(3000); } });

// ---------------------------------------------------------------- 메모 및 댓글
await test('M1', 'Shift + F2', '메모 삽입', 'Shift+F2', { prepare: () => cell('A2'), expect: ['active', 'dialogs'], after: async () => { await page.keyboard.type('memo'); await esc(); } });
await test('M2', 'Ctrl + Alt + M', '댓글 삽입', 'Control+Alt+KeyM', { prepare: () => cell('A3'), expect: ['active', 'dialogs', 'panels'], wait: 2000,
  after: async () => { await page.keyboard.type('check comment'); await page.waitForTimeout(500); const b = page.locator('[aria-label="댓글 올리기"]').filter({ visible: true }); if (await b.count()) await b.first().click(); await page.waitForTimeout(2000); } });
await test('M3', 'Ctrl + Alt + Shift + A', '댓글 대화목록 열기', 'Control+Alt+Shift+KeyA', { prepare: () => cell('A1'), expect: ['panels', 'dialogs', 'active'], wait: 2500, after: esc });
await test('M5', 'Ctrl + Alt + N, C', '다음 댓글로', seq('KeyN', 'KeyC'), { prepare: () => cell('A1'), expect: /./, alt: loose(seq('KeyN', 'KeyC')) });
await test('M6', 'Ctrl + Alt + P, C', '이전 댓글로', seq('KeyP', 'KeyC'), { prepare: () => cell('A5'), expect: /./, alt: loose(seq('KeyP', 'KeyC')) });
await test('M4', 'Ctrl + Alt + E, C', '현재 댓글 입력', seq('KeyE', 'KeyC'), { prepare: () => cell('A3'), expect: ['active'], alt: loose(seq('KeyE', 'KeyC')) });
const inComment = async () => { await cell('A3'); for (const k of seq('KeyE', 'KeyC')) await page.keyboard.press(k); await page.waitForTimeout(1200); };
await test('M8', 'J', '다음 댓글 (댓글 선택 시)', 'KeyJ', { prepare: inComment, expect: ['active'], body: true });
await test('M9', 'K', '이전 댓글 (댓글 선택 시)', 'KeyK', { prepare: inComment, expect: ['active'], body: true });
await test('M7', 'R', '답글 작성 (댓글 선택 시)', 'KeyR', { prepare: inComment, expect: ['active', 'dialogs'], body: true, after: esc });
await test('M11', 'U', '댓글 종료 (댓글 선택 시)', 'KeyU', { prepare: inComment, expect: ['active'], body: true });
await test('M10', 'E', '댓글 해결 (댓글 선택 시)', 'KeyE', { prepare: inComment, expect: /해결|panels|active/, body: true });

// ---------------------------------------------------------------- 메뉴
const menuKey = (n, key, action, k) => test(n, key, action, k, { prepare: () => cell('A1'), expect: ['menus', 'active'], after: esc });
await menuKey('U1', 'Alt + F', '파일 메뉴', 'Alt+KeyF');
await menuKey('U2', 'Alt + E', '수정 메뉴', 'Alt+KeyE');
await menuKey('U3', 'Alt + V', '보기 메뉴', 'Alt+KeyV');
await menuKey('U4', 'Alt + I', '삽입 메뉴', 'Alt+KeyI');
await menuKey('U5', 'Alt + O', '서식 메뉴', 'Alt+KeyO');
await menuKey('U6', 'Alt + D', '데이터 메뉴', 'Alt+KeyD');
await menuKey('U7', 'Alt + T', '도구 메뉴', 'Alt+KeyT');
await test('U8', 'Ctrl + Alt + =', '삽입 메뉴 열기 (셀 선택 시)', 'Control+Alt+Equal', { prepare: () => cell('B3'), expect: ['menus', 'dialogs', 'active'], after: esc });
await test('U9', 'Ctrl + Alt + -', '삭제 메뉴 열기 (셀 선택 시)', 'Control+Alt+Minus', { prepare: () => cell('B3'), expect: ['menus', 'dialogs', 'active'], after: esc });
await menuKey('U10', 'Alt + M', '양식 메뉴 (양식 연결 시)', 'Alt+KeyM');
await menuKey('U11', 'Alt + N', '부가기능 메뉴', 'Alt+KeyN');
await menuKey('U12', 'Alt + H', '도움말 메뉴', 'Alt+KeyH');
await menuKey('U13', 'Alt + A', '접근성 메뉴', 'Alt+KeyA');
await menuKey('U14', 'Alt + Shift + S', '시트 메뉴', 'Alt+Shift+KeyS');
await menuKey('U15', 'Ctrl + Shift + \\', '컨텍스트 메뉴', 'Control+Shift+Backslash');
await menuKey('U15', 'Shift + F10', '컨텍스트 메뉴 (다른 키)', 'Shift+F10');

// ---------------------------------------------------------------- 행 및 열
const rc = (n, key, action, keys, ref, ex = ['content', 'name']) => test(n, key, action, keys, { prepare: () => cell(ref), body: true, expect: ex, wait: 2000 });
await rc('W1', 'Ctrl + Alt + = (행 선택 시)', '위에 행 삽입', 'Control+Alt+Equal', '3:3');
await rc('W1', 'Alt + I, R, R', '위에 행 삽입 (메뉴 키)', ['Alt+KeyI', 'KeyR', 'KeyR'], 'A3');
await rc('W2', 'Alt + I, R, B', '아래에 행 삽입 (메뉴 키)', ['Alt+KeyI', 'KeyR', 'KeyB'], 'A3');
await rc('W3', 'Ctrl + Alt + = (열 선택 시)', '왼쪽에 열 삽입', 'Control+Alt+Equal', 'B:B');
await rc('W3', 'Alt + I, C, C', '왼쪽에 열 삽입 (메뉴 키)', ['Alt+KeyI', 'KeyC', 'KeyC'], 'B2');
await rc('W4', 'Alt + I, C, O', '오른쪽에 열 삽입 (메뉴 키)', ['Alt+KeyI', 'KeyC', 'KeyO'], 'B2');
await rc('W5', 'Ctrl + Alt + - (행 선택 시)', '행 삭제', 'Control+Alt+Minus', '3:3');
await rc('W5', 'Alt + E, D, D', '행 삭제 (메뉴 키)', ['Alt+KeyE', 'KeyD', 'KeyD'], 'A3');
await rc('W6', 'Ctrl + Alt + - (열 선택 시)', '열 삭제', 'Control+Alt+Minus', 'B:B');
await rc('W6', 'Alt + E, D, E', '열 삭제 (메뉴 키)', ['Alt+KeyE', 'KeyD', 'KeyE'], 'B2');
await rc('W7', 'Ctrl + Alt + 9', '행 숨기기', 'Control+Alt+Digit9', '3:3', /content|숨/);
await rc('W8', 'Ctrl + Shift + 9', '행 숨기기 해제', 'Control+Shift+Digit9', '2:4', /content|숨/);
await rc('W9', 'Ctrl + Alt + 0', '열 숨기기', 'Control+Alt+Digit0', 'B:B', /content|숨/);
await rc('W10', 'Ctrl + Shift + 0', '열 숨기기 해제', 'Control+Shift+Digit0', 'A:C', /content|숨/);
await rc('W11', 'Alt + Shift + →', '행·열 그룹화', 'Alt+Shift+ArrowRight', '2:3', /content|그룹|dialogs|menus/);
await rc('W14', 'Alt + Shift + ↑', '그룹 접기', 'Alt+Shift+ArrowUp', '2:3', /content|접|그룹/);
await rc('W13', 'Alt + Shift + ↓', '그룹 펼치기', 'Alt+Shift+ArrowDown', '2:3', /content|펼|그룹/);
await rc('W12', 'Alt + Shift + ←', '행·열 그룹 해제', 'Alt+Shift+ArrowLeft', '2:3', /content|그룹|dialogs|menus/);

// ---------------------------------------------------------------- 수식
await test('F1', 'Ctrl + ~', '모든 수식 표시', 'Control+Backquote', { prepare: () => cell('B5'), body: true, expect: /content|수식/ });
await test('F1', 'Ctrl + ~', '수식 표시 끄기', 'Control+Backquote', { prepare: () => cell('B5'), body: true, expect: /content|수식/ });
const typing = (text) => async () => { await cell('H2'); await page.keyboard.type(text); await page.waitForTimeout(500); };
await test('F2', 'Ctrl + Shift + Enter', '배열 수식 삽입', 'Control+Shift+Enter', { prepare: typing('=B2:B4*2'), expect: ['formula', 'content'], body: true, wait: 2000 });
await test('F3', 'Ctrl + E', '펼친 배열 수식 접기', 'Control+KeyE', { prepare: () => cell('H2'), expect: /./, body: true });
await test('F4', 'Shift + F1', '수식 도움말 표시/숨기기 (입력 중)', 'Shift+F1', { prepare: typing('=SUM('), expect: /./, after: esc });
await test('F5', 'F1', '전체/요약 수식 도움말 (입력 중)', 'F1', { prepare: typing('=SUM('), expect: /./, after: esc });
await test('F6', 'F4', '절대/상대 참조 전환 (입력 중)', 'F4', { prepare: typing('=B2'), expect: ['formula'], after: esc });
await test('F7', 'F9', '수식 결과 미리보기 (입력 중)', 'F9', { prepare: typing('=B2+1'), expect: /./, after: esc });
await test('F8', 'Ctrl + ↓', '수식 창 크기 조정', 'Control+ArrowDown', { prepare: async () => { await cell('B5'); await page.locator('#t-formula-bar-input').click(); await page.waitForTimeout(400); }, expect: /./, after: esc });
await test('F9', 'F2', '수식 범위 선택 전환 (입력 중)', 'F2', { prepare: typing('=SUM(B2'), expect: /./, after: esc });

// ---------------------------------------------------------------- 스크린 리더
await test('R2', 'Ctrl + Alt + H', '점자 기능 사용', 'Control+Alt+KeyH', { prepare: () => cell('A1'), expect: /점자/ });
await test('R2', 'Ctrl + Alt + H', '점자 기능 끄기', 'Control+Alt+KeyH', { prepare: () => cell('A1'), expect: /점자/ });
await test('R3', 'Ctrl + Alt + Shift + C', '열 읽기', 'Control+Alt+Shift+KeyC', { prepare: () => cell('B3'), expect: /./ });
await test('R4', 'Ctrl + Alt + Shift + R', '행 읽기', 'Control+Alt+Shift+KeyR', { prepare: () => cell('B3'), expect: /./ });

// ---------------------------------------------------------------- 필터·표·그림이 필요한 것
// The table from Ctrl+Alt+T above (made here when resuming past it).
if (!tableMade) { await cell('A1:C5'); await page.keyboard.press('Control+Alt+KeyT'); await page.waitForTimeout(2500); await esc(); }
await test('U16', 'Ctrl + Alt + \\', '표 열 메뉴', 'Control+Alt+Backslash', { prepare: () => cell('B2'), expect: ['menus', 'dialogs', 'active'], after: esc });
await test('N15', 'Ctrl + Alt + R', '필터 드롭다운 메뉴 열기', 'Control+Alt+KeyR', { prepare: () => cell('B1'), expect: ['menus', 'dialogs', 'active'], after: esc });
skip('N17', 'Shift + Esc', '그림 편집기 닫기', '문서 점검에서 같은 그림 편집기로 확인함');

await test('R1', 'Ctrl + Alt + Z', '스크린 리더 지원 끄기', 'Control+Alt+KeyZ', { prepare: () => cell('A1'), expect: /사용 중지/ });
if (!results[results.length - 1].sheets) await screenReader(false);
console.log('test spreadsheet:', sheetUrl);
save();
await context.close();
