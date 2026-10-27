// Every shortcut on Google Docs' help page (support.google.com/docs/answer/179738,
// PC): press it in a test document and record (1) what changed, so a person can
// tell whether Docs reacted, and (2) whether Quickhand counted it.
//
// Signals: Docs' screen reader announcements (screen reader support is turned on
// with Ctrl+Alt+Z at the start, which is one of the shortcuts, and off again at the
// end), toolbar state, open dialogs/menus/panels, the focused element, scrolling, and
// for content changes the document's read-only "mobilebasic" HTML.
//
// Only a new document named "손빠르미 단축키 점검 문서 (지워도 됨)" is edited.
// Print (Ctrl+P) is stubbed so no print dialog opens. Results: results/docs-shortcuts.json
//
// --part2: only the second half (images, drawing, tables, tabs, version history) and
// retries of a few keys, on a new document; results: results/docs-shortcuts-part2.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch, RESULTS, keyFor, shownFor, twoStep } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const PART2 = process.argv.includes('--part2') || process.argv.includes('--part3');
// --part3: only the keys inside a comment, the current footnote and the image keys,
// reaching the comment and the image with Docs' own "next comment/graphic" keys.
const PART3 = process.argv.includes('--part3');
const OUT = path.join(RESULTS, process.argv.includes('--part3') ? 'docs-shortcuts-part3.json' : process.argv.includes('--part2') ? 'docs-shortcuts-part2.json' : 'docs-shortcuts.json');
// Uploaded from the computer (Insert › Image › By URL never accepted a URL in the check browser).
const IMAGE = path.join(RESULTS, '..', '..', 'extension', 'assets', 'icons', 'icon-128.png');

const { context, worker } = await launch({ headless: false });
// Print would open Chrome's print dialog; record the call instead.
await context.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
const page = await context.newPage();
page.setDefaultTimeout(10000);
// Keys are written as on Windows; on a Mac every press goes through keyFor() (lib.mjs),
// which presses Docs' Mac key instead. Two-step keys come from seq() below.
const pressKey = page.keyboard.press.bind(page.keyboard);
page.keyboard.press = (k, opts) => pressKey(keyFor(k, 'docs'), opts);
await page.setViewportSize({ width: 1600, height: 950 });
const results = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

// ---------------------------------------------------------------- measuring
// Docs' own status lines and its writing-help suggestions, not reactions to a key.
const NOISE = /^(저장 중…|드라이브에 저장됨|로드 중\.\.\.|다음에 (관한|대한) .*\.\.\.|내 드라이브를 검색하여 .*|웹을 검색하여 .*|인라인 FAB.*|.)$/;
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
const takeLive = (NOISE_SRC) => page.evaluate((src) => {
  const noise = new RegExp(src);
  return [...new Set(window.__live || [])].filter((t) => !noise.test(t)).slice(-8);
}, NOISE_SRC);

const state = () => page.evaluate(() => {
  const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const cap = (sel) => ((document.querySelector(sel) || {}).innerText || '').trim();
  const a = document.activeElement;
  const ed = document.querySelector('.kix-appview-editor');
  const box = [...document.querySelectorAll('[class*="selectionbox"], [class*="SelectionBox"]')].filter(vis)[0];
  const r = box && box.getBoundingClientRect();
  return {
    pressed: [...document.querySelectorAll('#docs-toolbar [aria-pressed="true"]')].map((e) => e.id).join(','),
    style: cap('#headingStyleSelect .goog-toolbar-menu-button-caption'),
    size: (document.querySelector('.docs-font-size-inputbox-input, #fontSizeSelect input') || {}).value || '',
    zoom: (document.querySelector('#zoomSelect input') || {}).value || '',
    mode: cap('#docs-toolbar-mode-switcher'),
    menubar: vis(document.querySelector('#docs-menubar')),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal-dialog')].filter(vis)
      .map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').slice(0, 30)).join(' | '),
    menus: [...document.querySelectorAll('.goog-menu, [role="menu"]')].filter(vis).map((m) => (m.innerText.split('\n')[0] || '').slice(0, 15)).join(' | '),
    panels: [...document.querySelectorAll('[role="complementary"], .docs-companion-app-container, .docos-stream-view, .navigation-widget, .docs-explore-widget, #docs-revisions-sidebar, .docs-dictionary-container')]
      .filter(vis).map((p) => (p.getAttribute('aria-label') || p.className.split(' ')[0] || '').slice(0, 30)).join(' | '),
    active: a ? [a.tagName.toLowerCase(), a.getAttribute('aria-label'), a.getAttribute('role'), a.className.split(' ')[0]].filter(Boolean).join(' ').slice(0, 50) : '',
    url: location.href.replace(/^.*\/edit/, ''),
    scroll: ed ? Math.round(ed.scrollTop) : 0,
    image: r ? `${Math.round(r.width)}x${Math.round(r.height)} ${(getComputedStyle(box).transform || '').slice(0, 30)}` : '',
    printed: window.__printed || 0,
  };
});

let docUrl = '';
async function content() {
  await page.waitForTimeout(2500); // let Docs save
  const res = await page.request.get(docUrl.replace(/\/edit.*$/, '/mobilebasic'));
  const html = (await res.text()).replace(/<head[\s\S]*?<\/head>|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\s+/g, ' ').trim();
  return { hash: crypto.createHash('md5').update(html).digest('hex').slice(0, 8), text: text.slice(0, 400) };
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

// One shortcut. keys: Playwright key names pressed in turn (a sequence holds its
// modifiers: ['Control+Alt+KeyN', 'Control+Alt+KeyH']). `expect`: a regexp the
// announcements should match, or state field names that should change. `body`:
// also compare the document content.
async function test(n, keyLabel, action, keys, { prepare, expect, body = false, after, wait = 1500, note = '', alt } = {}) {
  const r = { n, key: shownFor(keyLabel, 'docs'), action, docs: null, live: [], changed: [], quickhand: null, error: null, note };
  try {
    if (prepare) await prepare();
    const before = await state();
    const cBefore = body ? await content() : null;
    await startLive();
    const since = Date.now();
    for (const k of [].concat(keys)) {
      await page.keyboard.press(k);
      await page.waitForTimeout(150);
    }
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
    if (expect instanceof RegExp) r.docs = r.live.some((t) => expect.test(t)) || r.changed.some((c) => expect.test(c));
    else if (Array.isArray(expect)) r.docs = r.changed.some((c) => expect.some((k) => c.startsWith(k)));
    else r.docs = r.live.length > 0 || r.changed.length > 0;
  } catch (e) {
    r.error = e.message.split('\n')[0];
  }
  try {
    if (after) await after();
  } catch (e) {
    r.error = (r.error ? r.error + ' / ' : '') + '정리 실패: ' + e.message.split('\n')[0];
  }
  results.push(r);
  console.log(JSON.stringify(r));
  save();
  // Two-step keys: if Docs showed nothing with Ctrl+Alt held, try the second key on its own.
  if (alt && r.docs === false) {
    return test(n, keyLabel, action + ' (두 번째 키만 따로)', alt, { prepare, expect, body, after, wait, note });
  }
  return r;
}
function skip(n, key, action, why) {
  const r = { n, key, action, docs: null, live: [], changed: [], quickhand: null, error: null, skipped: why };
  results.push(r);
  console.log(JSON.stringify(r));
  save();
}

// ---------------------------------------------------------------- moving around
const editor = () => page.evaluate(() => {
  const d = document.querySelector('.docs-texteventtarget-iframe').contentDocument;
  d.querySelector('[contenteditable]').focus();
});
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(500); };
// Paragraph i (0-based) of the body, cursor at its start.
async function para(i) {
  await closeExtraPages();
  await editor();
  await page.keyboard.press('Control+Home');
  for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
}
async function selectWord(i) {
  await para(i);
  await page.keyboard.press('Control+Shift+ArrowRight');
  await page.waitForTimeout(300);
}
async function selectLine(i) {
  await para(i);
  await page.keyboard.press('Shift+End');
  await page.waitForTimeout(300);
}
async function closeExtraPages() {
  for (const p of context.pages()) if (p !== page) await p.close().catch(() => {});
}
const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const MENUS = { 파일: '#docs-file-menu', 수정: '#docs-edit-menu', 보기: '#docs-view-menu', 삽입: '#docs-insert-menu', 서식: '#docs-format-menu', 도구: '#docs-tools-menu' };
async function menu(top, ...items) {
  // A box left open by an earlier key (comment, link, dialog) keeps menu items disabled.
  await esc();
  await esc();
  await editor();
  await visible(MENUS[top]).click();
  await page.waitForTimeout(400);
  for (const [i, item] of items.entries()) {
    const it = visible('.goog-menuitem, [role="menuitem"]', { hasText: item });
    if (i < items.length - 1) { await it.hover(); await page.waitForTimeout(600); } else await it.click();
  }
  await page.waitForTimeout(800);
}
// The comment box's own "댓글" button (Ctrl+Enter did not post it every time).
async function postComment() {
  const button = page.locator('[aria-label="댓글 올리기"]').filter({ visible: true });
  if (await button.count()) await button.last().click().catch(() => {});
  else await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(2500);
}
const seq = (a, b) => twoStep(a, b); // Docs' two-step keys keep Ctrl+Alt (Mac: Control+⌘) held
// The same two steps with the second key pressed on its own.
const loose = (keys) => [keys[0], keys[1].replace(/^Control\+(Alt|Meta)\+(Shift\+)?/, '')];
// A move from paragraph `from`: any announcement counts as Docs reacting.
const nav = (n, key, action, keys, from = 0) => test(n, key, action, keys, { prepare: () => para(from), expect: /./, alt: loose(keys) });
const seqShift = (a, b) => twoStep(a, b, { shift: true });

// ---------------------------------------------------------------- the test document
await page.goto('https://docs.new', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#boldButton', { timeout: 60000 });
await page.waitForTimeout(3000);
docUrl = page.url();
console.log('test document:', docUrl);
await page.locator('.docs-title-input').click();
await page.keyboard.press('Control+A');
await page.keyboard.type(TITLE);
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
await page.locator('.kix-appview-editor').click({ position: { x: 500, y: 150 } });
// Paragraphs: 0 제목 하나 (H1) / 1 본문 / 2 링크 / 3-4 목록 / 5 제목 둘 (H2) / 6 마지막
const lines = ['제목 하나', '본문 첫째 문단입니다 teh recieve 오타가 있습니다', '링크 문단 구글 바로가기', '목록 하나', '목록 둘', '제목 둘', '마지막 문단 Hello world'];
for (const [i, l] of lines.entries()) {
  await page.keyboard.type(l);
  if (i < lines.length - 1) await page.keyboard.press('Enter');
}
await page.waitForTimeout(1000);

// ---- 스크린 리더 지원 켜기 (스크린 리더 단축키 1번째, 나머지 측정에 씀)
// Screen reader support is a setting of the account and stays as it was left, so
// turn it the wanted way whatever it was.
async function screenReader(on) {
  for (let i = 0; i < 2; i++) {
    await editor();
    await startLive();
    await page.keyboard.press('Control+Alt+KeyZ');
    await page.waitForTimeout(1500);
    const said = (await takeLive('^$')).join(' ');
    if (on ? /사용 설정/.test(said) : /사용 중지/.test(said)) return;
  }
  console.log('screen reader support could not be set to', on);
}
if (!PART2) await test('SR1', 'Ctrl + Alt + Z', '스크린 리더 지원 사용', 'Control+Alt+KeyZ', { prepare: editor, expect: /스크린 리더 지원이 사용 설정/ });
else await screenReader(true);

if (PART3) {
  // A footnote, a comment on the last paragraph, and an image on its own line.
  await para(1); await page.keyboard.press('End'); await page.keyboard.press('Control+Alt+KeyF'); await page.keyboard.type('각주 하나'); await page.waitForTimeout(800);
  await selectWord(6);
  await page.keyboard.press('Control+Alt+KeyM'); await page.waitForTimeout(2000);
  await page.keyboard.type('점검 댓글'); await page.waitForTimeout(500);
  await postComment();
  await para(6); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  const chooser3 = page.waitForEvent('filechooser', { timeout: 10000 });
  await menu('삽입', '이미지', '컴퓨터에서 업로드');
  await (await chooser3).setFiles(IMAGE);
  await page.waitForTimeout(5000);
  // Docs' own keys put the cursor on the comment / select the image.
  const toComment = async () => { await editor(); await page.keyboard.press('Control+Home'); for (const k of seq('KeyN', 'KeyC')) await page.keyboard.press(k); await page.waitForTimeout(800); };
  const intoComment = async () => { await toComment(); for (const k of seq('KeyE', 'KeyC')) await page.keyboard.press(k); await page.waitForTimeout(1000); };
  await test('SR12', 'Ctrl + Alt + A, C', '댓글 읽기', seq('KeyA', 'KeyC'), { prepare: toComment });
  await test('SR13', 'Ctrl + Alt + A, A', '댓글 앵커 읽기', seq('KeyA', 'KeyA'), { prepare: toComment });
  await test('C3', 'Ctrl + Alt + E, C', '현재 댓글 입력', seq('KeyE', 'KeyC'), { prepare: toComment, expect: ['active'] });
  await test('C15', 'J', '다음 댓글 (댓글 선택 시)', 'KeyJ', { prepare: intoComment, expect: ['active'], body: true });
  await test('C16', 'K', '이전 댓글 (댓글 선택 시)', 'KeyK', { prepare: intoComment, expect: ['active'], body: true });
  await test('C14', 'R', '답글 작성 (댓글 선택 시)', 'KeyR', { prepare: intoComment, expect: ['active', 'dialogs'], body: true, after: esc });
  await test('C18', 'U', '현재 댓글 종료 (댓글 선택 시)', 'KeyU', { prepare: intoComment, expect: ['active'], body: true });
  await test('C17', 'E', '현재 댓글 해결 (댓글 선택 시)', 'KeyE', { prepare: intoComment, expect: /해결|panels|active/, body: true });
  const toFootnote = async () => { await editor(); await page.keyboard.press('Control+Home'); for (const k of seq('KeyN', 'KeyF')) await page.keyboard.press(k); await page.waitForTimeout(800); };
  await test('C5', 'Ctrl + Alt + E, F', '현재 각주로 이동', seq('KeyE', 'KeyF'), { prepare: toFootnote, expect: /각주|scroll|size/, alt: loose(seq('KeyE', 'KeyF')) });
  const toImage = async () => { await editor(); await page.keyboard.press('Control+Home'); for (const k of seq('KeyN', 'KeyG')) await page.keyboard.press(k); await page.waitForTimeout(800); };
  const img3 = (n, key, action, k) => test(n, key, action, k, { prepare: toImage, expect: ['image', 'dialogs', 'panels'] });
  await img3('I1', 'Ctrl + Alt + Y', '대체 텍스트', 'Control+Alt+KeyY');
  await esc();
  await img3('I2', 'Ctrl + Alt + K', '확대', 'Control+Alt+KeyK');
  await img3('I3', 'Ctrl + Alt + B', '가로 확대', 'Control+Alt+KeyB');
  await img3('I4', 'Ctrl + Alt + I', '세로 확대', 'Control+Alt+KeyI');
  await img3('I5', 'Ctrl + Alt + J', '축소', 'Control+Alt+KeyJ');
  await img3('I6', 'Ctrl + Alt + W', '가로 축소', 'Control+Alt+KeyW');
  await img3('I7', 'Ctrl + Alt + Q', '세로 축소', 'Control+Alt+KeyQ');
  await img3('I8', 'Alt + →', '시계 방향 15도 회전', 'Alt+ArrowRight');
  await img3('I9', 'Alt + ←', '시계 반대 방향 15도 회전', 'Alt+ArrowLeft');
  await img3('I10', 'Alt + Shift + ←', '시계 반대 방향 1도 회전', 'Alt+Shift+ArrowLeft');
  await img3('I11', 'Alt + Shift + →', '시계 방향 1도 회전', 'Alt+Shift+ArrowRight');
  await screenReader(false);
  console.log('test document:', docUrl);
  save();
  await context.close();
  process.exit(0);
}

if (!PART2) {
// Headings and list made with the shortcuts themselves.
await test('P4', 'Ctrl + Alt + 1~6', '제목 스타일 적용 (1)', 'Control+Alt+Digit1', { prepare: () => para(0), expect: /제목 1/ });
await test('P4', 'Ctrl + Alt + 1~6', '제목 스타일 적용 (2)', 'Control+Alt+Digit2', { prepare: () => para(5), expect: /제목 2/ });
await test('P10', 'Ctrl + Shift + 8', '글머리기호 목록', 'Control+Shift+Digit8', {
  prepare: async () => { await para(3); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+End'); }, expect: /목록|글머리/,
});
await test('A7', 'Ctrl + K', '링크 삽입 또는 수정', 'Control+KeyK', {
  prepare: async () => { await para(2); await page.keyboard.press('Control+ArrowRight'); await page.keyboard.press('Control+ArrowRight'); await page.keyboard.press('Control+Shift+ArrowRight'); },
  expect: ['dialogs', 'active'],
  after: async () => { await page.keyboard.type('https://www.google.com'); await page.keyboard.press('Enter'); await page.waitForTimeout(1000); },
});

// ---------------------------------------------------------------- 대표적인 작업
await test('A1', 'Ctrl + C', '복사', 'Control+KeyC', { prepare: () => selectWord(6), note: '복사는 화면 변화가 없음. 아래 붙여넣기로 확인' });
await test('A3', 'Ctrl + V', '붙여넣기', 'Control+KeyV', { prepare: () => para(6), body: true, expect: ['content'] });
await test('A4', 'Ctrl + Shift + V', '서식 없이 붙여넣기', 'Control+Shift+KeyV', { prepare: () => para(6), body: true, expect: ['content'] });
await test('A2', 'Ctrl + X', '잘라내기', 'Control+KeyX', { prepare: () => selectWord(6), body: true, expect: ['content'] });
await test('A5', 'Ctrl + Z', '실행취소', 'Control+KeyZ', { prepare: editor, body: true, expect: ['content'] });
await test('A6', 'Ctrl + Shift + Z', '재실행', 'Control+Shift+KeyZ', { prepare: editor, body: true, expect: ['content'] });
await test('A5', 'Ctrl + Z', '실행취소 (되돌려 둠)', 'Control+KeyZ', { prepare: editor });
await test('A8', 'Alt + Enter', '링크 열기', 'Alt+Enter', {
  prepare: async () => { await para(2); await page.keyboard.press('Control+ArrowRight'); await page.keyboard.press('Control+ArrowRight'); await page.keyboard.press('ArrowRight'); },
  expect: ['pages'], wait: 3000, after: closeExtraPages,
});
await test('A9', 'Ctrl + /', '단축키 목록 표시', 'Control+Slash', { prepare: editor, expect: ['dialogs'], after: esc });
await test('A10', 'Ctrl + S', '저장', 'Control+KeyS', { prepare: editor, note: '변경사항은 원래 자동 저장됨' });
await test('A11', 'Ctrl + P', '인쇄', 'Control+KeyP', { prepare: editor, expect: ['printed', 'dialogs'], wait: 5000, after: esc });
await test('A12', 'Ctrl + O', '열기', 'Control+KeyO', { prepare: editor, expect: ['dialogs', 'active'], wait: 3000, after: esc });
await test('A13', 'Ctrl + F', '찾기', 'Control+KeyF', { prepare: editor, expect: ['dialogs', 'active', 'panels'], after: esc });
await test('A14', 'Ctrl + H', '찾기 및 바꾸기', 'Control+KeyH', { prepare: editor, expect: ['dialogs', 'active'], after: esc });
await test('A15', 'Ctrl + G', '다시 찾기', 'Control+KeyG', {
  prepare: async () => { await editor(); await page.keyboard.press('Control+KeyF'); await page.keyboard.type('문단'); await page.keyboard.press('Enter'); await page.waitForTimeout(800); },
});
await test('A16', 'Ctrl + Shift + G', '이전 항목 찾기', 'Control+Shift+KeyG', { after: esc });
await test('A17', 'Ctrl + Shift + F', '메뉴 숨기기(컴팩트 모드)', 'Control+Shift+KeyF', { prepare: editor, expect: ['menubar'] });
await test('A17', 'Ctrl + Shift + F', '메뉴 다시 보이기', 'Control+Shift+KeyF', { prepare: editor, expect: ['menubar'] });
await test('A18', 'Ctrl + Enter', '페이지 나누기 삽입', 'Control+Enter', { prepare: () => para(6), body: true, expect: /나누기|content/ });
await test('A5', 'Ctrl + Z', '실행취소 (페이지 나누기 지움)', 'Control+KeyZ', { prepare: editor });
await test('A19', 'Alt + /', '도구 검색', 'Alt+Slash', { prepare: editor, expect: ['active', 'menus', 'dialogs'], after: esc });
await test('A19', 'Alt + Shift + Z', '도구 검색 (다른 키)', 'Alt+Shift+KeyZ', { prepare: editor, expect: ['active', 'menus', 'dialogs'], after: esc });
await test('A19', 'Alt + Z', '도구 검색 (Chrome)', 'Alt+KeyZ', { prepare: editor, expect: ['active', 'menus', 'dialogs'], after: esc });
await test('A20', 'Ctrl + Y', '마지막 작업 반복', 'Control+KeyY', {
  prepare: async () => { await selectWord(6); await page.keyboard.press('Control+KeyB'); await page.waitForTimeout(500); await selectLine(1); }, expect: /굵게|pressed/,
});
await test('A21', 'Ctrl + Alt + Shift + X', '제안 모드로 전환', 'Control+Alt+Shift+KeyX', { prepare: editor, expect: ['mode'] });
await test('A23', 'Ctrl + Alt + Shift + C', '보기 모드로 전환', 'Control+Alt+Shift+KeyC', { prepare: editor, expect: ['mode'] });
await test('A22', 'Ctrl + Alt + Shift + Z', '수정 모드로 전환', 'Control+Alt+Shift+KeyZ', { prepare: editor, expect: ['mode'] });
await test('A24', 'Ctrl + +', '확대', 'Control+Equal', { prepare: editor, expect: ['zoom'] });
await test('A25', 'Ctrl + -', '축소', 'Control+Minus', { prepare: editor, expect: ['zoom'] });
await test('A26', 'Ctrl + 0', '확대/축소 100%', 'Control+Digit0', { prepare: editor, expect: ['zoom'] });

// ---------------------------------------------------------------- 텍스트 서식
const fmt = (n, key, action, k, re) => test(n, key, action, k, { prepare: () => selectWord(6), expect: re });
await fmt('T1', 'Ctrl + B', '굵게', 'Control+KeyB', /굵게/);
await fmt('T2', 'Ctrl + I', '기울임꼴', 'Control+KeyI', /기울임/);
await fmt('T3', 'Ctrl + U', '밑줄', 'Control+KeyU', /밑줄/);
await fmt('T4', 'Alt + Shift + 5', '취소선', 'Alt+Shift+Digit5', /취소선/);
await fmt('T5', 'Ctrl + .', '위 첨자', 'Control+Period', /첨자/);
await fmt('T6', 'Ctrl + ,', '아래 첨자', 'Control+Comma', /첨자/);
await test('T7', 'Ctrl + Alt + C', '텍스트 서식 복사', 'Control+Alt+KeyC', { prepare: () => selectWord(6), expect: /서식|복사/ });
await test('T8', 'Ctrl + Alt + V', '텍스트 서식 붙여넣기', 'Control+Alt+KeyV', { prepare: () => selectWord(1), body: true, expect: /서식|붙여|content/ });
await fmt('T9', 'Ctrl + \\', '텍스트 서식 지우기', 'Control+Backslash', /서식|지우/);
await fmt('T9', 'Ctrl + Space', '텍스트 서식 지우기 (다른 키)', 'Control+Space', /서식|지우/);
await test('T10', 'Ctrl + Shift + .', '글꼴 크기 크게', 'Control+Shift+Period', { prepare: () => selectWord(6), expect: ['size'] });
await test('T11', 'Ctrl + Shift + ,', '글꼴 크기 작게', 'Control+Shift+Comma', { prepare: () => selectWord(6), expect: ['size'] });
// In a Korean UI Ctrl+Shift+K turns Docs' input tools on; press it again to turn them off.
await test('T12', 'Ctrl + Shift + K', '작은 대문자', 'Control+Shift+KeyK', { prepare: () => selectWord(6), expect: /대문자|입력 도구/,
  after: async () => { await page.keyboard.press('Control+Shift+KeyK'); await page.waitForTimeout(800); } });

// ---------------------------------------------------------------- 단락 서식
const par = (n, key, action, k, re, i = 6) => test(n, key, action, k, { prepare: () => para(i), expect: re });
await par('P1', 'Ctrl + ]', '들여쓰기 늘리기', 'Control+BracketRight', /들여쓰기/);
await par('P2', 'Ctrl + [', '들여쓰기 줄이기', 'Control+BracketLeft', /들여쓰기/);
await par('P3', 'Ctrl + Alt + 0', '일반 텍스트', 'Control+Alt+Digit0', /일반 텍스트/, 5);
await par('P4', 'Ctrl + Alt + 1~6', '제목 스타일 적용 (2 되돌림)', 'Control+Alt+Digit2', /제목 2/, 5);
await par('P5', 'Ctrl + Shift + L', '왼쪽 맞춤', 'Control+Shift+KeyL', /왼쪽|정렬|맞춤/);
await par('P6', 'Ctrl + Shift + E', '가운데 맞춤', 'Control+Shift+KeyE', /가운데|정렬|맞춤/);
await par('P7', 'Ctrl + Shift + R', '오른쪽 맞춤', 'Control+Shift+KeyR', /오른쪽|정렬|맞춤/);
await par('P8', 'Ctrl + Shift + J', '양쪽 맞춤', 'Control+Shift+KeyJ', /양쪽|정렬|맞춤/);
await par('P5', 'Ctrl + Shift + L', '왼쪽 맞춤 (되돌림)', 'Control+Shift+KeyL', /왼쪽|정렬|맞춤/);
await par('P9', 'Ctrl + Shift + 7', '번호 매기기 목록', 'Control+Shift+Digit7', /목록|번호/);
await par('P9', 'Ctrl + Shift + 7', '번호 매기기 목록 (해제)', 'Control+Shift+Digit7', /목록|번호/);
await par('P11', 'Ctrl + Shift + 9', '체크리스트', 'Control+Shift+Digit9', /체크/);
await test('O17', 'Ctrl + Alt + Enter', '체크박스 전환', 'Control+Alt+Enter', { prepare: () => para(6), body: true, expect: /체크|선택|content/ });
await par('P11', 'Ctrl + Shift + 9', '체크리스트 (해제)', 'Control+Shift+Digit9', /체크|목록/);
await test('P12', 'Ctrl + Shift + ↑', '단락 위로 이동', 'Control+Shift+ArrowUp', { prepare: () => para(6), body: true, expect: ['content'] });
await test('P12', 'Ctrl + Shift + ↓', '단락 아래로 이동', 'Control+Shift+ArrowDown', { prepare: () => para(5), body: true, expect: ['content'] });

// ---------------------------------------------------------------- 키보드로 텍스트 선택
const sel = (n, key, action, k, i = 1) => test(n, key, action, k, { prepare: () => para(i), expect: /선택/ });
await test('S1', 'Ctrl + A', '모두 선택', 'Control+KeyA', { prepare: editor, expect: /선택/ });
await test('S2', 'Ctrl + Alt + U, A', '선택 안함', seq('KeyU', 'KeyA'), { alt: loose(seq('KeyU', 'KeyA')), expect: /선택 해제|해제/ });
await sel('S3', 'Shift + →', '한 글자씩 선택', 'Shift+ArrowRight');
await sel('S4', 'Shift + ↓', '한 줄씩 선택', 'Shift+ArrowDown');
await sel('S5', 'Ctrl + Shift + →', '한 단어씩 선택', 'Control+Shift+ArrowRight');
await test('S6', 'Shift + Home', '줄의 시작까지 선택', 'Shift+Home', { prepare: async () => { await para(1); await page.keyboard.press('End'); }, expect: /선택/ });
await sel('S7', 'Shift + End', '줄의 끝까지 선택', 'Shift+End');
await sel('S8', 'Ctrl + Shift + Home', '문서 시작까지 선택', 'Control+Shift+Home', 2);
await sel('S9', 'Ctrl + Shift + End', '문서 끝까지 선택', 'Control+Shift+End', 5);
await test('S10', 'Ctrl + Alt + Shift + E, I', '현재 목록 항목 선택', seqShift('KeyE', 'KeyI'), { alt: loose(seqShift('KeyE', 'KeyI')), prepare: () => para(3), expect: /선택/ });
await test('S11', 'Ctrl + Alt + Shift + E, O', '현재 수준의 모든 목록 항목 선택', seqShift('KeyE', 'KeyO'), { alt: loose(seqShift('KeyE', 'KeyO')), prepare: () => para(3), expect: /선택/ });
await test('S12', 'Ctrl + Alt + Shift + ←/→', '여러 텍스트 섹션 선택', 'Control+Alt+Shift+ArrowRight', { prepare: () => selectWord(1), expect: /선택/ });

// ---------------------------------------------------------------- 마우스로 텍스트 선택 (단축키는 아니지만 도움말에 있음)
const textPoint = async () => {
  await para(6);
  const b = await page.locator('.kix-cursor-caret').filter({ visible: true }).first().boundingBox();
  return b ? { x: b.x + 40, y: b.y + b.height / 2 } : null;
};
const mouseTest = (n, key, action, fn) => test(n, key, action, [], { prepare: async () => { const p = await textPoint(); await fn(p); }, expect: /선택/ });
await mouseTest('M1', '더블클릭', '단어 선택', (p) => page.mouse.dblclick(p.x, p.y));
await mouseTest('M2', '더블클릭 + 드래그', '한 단어씩 확장', async (p) => { await page.mouse.dblclick(p.x, p.y); await page.mouse.down({ clickCount: 2 }); await page.mouse.move(p.x + 120, p.y, { steps: 6 }); await page.mouse.up({ clickCount: 2 }); });
await mouseTest('M3', '세 번 클릭', '단락 선택', (p) => page.mouse.click(p.x, p.y, { clickCount: 3 }));
await mouseTest('M4', '세 번 클릭 + 드래그', '한 단락씩 확장', async (p) => { await page.mouse.click(p.x, p.y, { clickCount: 3 }); await page.mouse.down({ clickCount: 3 }); await page.mouse.move(p.x, p.y - 60, { steps: 6 }); await page.mouse.up({ clickCount: 3 }); });

// ---------------------------------------------------------------- 메뉴
const menuKey = (n, key, action, k) => test(n, key, action, k, { prepare: editor, expect: ['menus', 'active'], after: esc });
await menuKey('U1', 'Ctrl + Shift + X', '컨텍스트 메뉴', 'Control+Shift+KeyX');
await menuKey('U1', 'Ctrl + Shift + \\', '컨텍스트 메뉴 (다른 키)', 'Control+Shift+Backslash');
await menuKey('U1', 'Shift + F10', '컨텍스트 메뉴 (다른 키)', 'Shift+F10');
await menuKey('U2', 'Alt + F', '파일 메뉴', 'Alt+KeyF');
await menuKey('U3', 'Alt + E', '수정 메뉴', 'Alt+KeyE');
await menuKey('U4', 'Alt + V', '보기 메뉴', 'Alt+KeyV');
await menuKey('U5', 'Alt + I', '삽입 메뉴', 'Alt+KeyI');
await menuKey('U6', 'Alt + O', '서식 메뉴', 'Alt+KeyO');
await menuKey('U7', 'Alt + T', '도구 메뉴', 'Alt+KeyT');
await menuKey('U8', 'Alt + H', '도움말 메뉴', 'Alt+KeyH');
await menuKey('U9', 'Alt + A', '접근성 메뉴', 'Alt+KeyA');
await menuKey('U10', 'Ctrl + Alt + Shift + K', '입력 도구 메뉴', 'Control+Alt+Shift+KeyK');
skip('U11', 'Shift + 마우스 오른쪽 클릭', '브라우저의 컨텍스트 메뉴', '크롬 자체 메뉴라 페이지에서 보이지 않아 자동 점검 불가');

// ---------------------------------------------------------------- 스크린 리더 (지원은 켜져 있음)
await test('SR2', 'Ctrl + Alt + H', '점자 기능 사용', 'Control+Alt+KeyH', { prepare: editor, expect: /점자/ });
await test('SR2', 'Ctrl + Alt + H', '점자 기능 끄기', 'Control+Alt+KeyH', { prepare: editor, expect: /점자/ });
await test('SR3', 'Ctrl + Alt + A, X', '선택 영역 소리내어 읽기', seq('KeyA', 'KeyX'), { alt: loose(seq('KeyA', 'KeyX')), prepare: () => selectWord(6) });
await test('SR4', 'Ctrl + Alt + A, R', '커서 위치부터 읽기', seq('KeyA', 'KeyR'), { alt: loose(seq('KeyA', 'KeyR')), prepare: () => para(6) });
await test('SR5', 'Ctrl + Alt + A, L', '커서 위치 말하기', seq('KeyA', 'KeyL'), { alt: loose(seq('KeyA', 'KeyL')), prepare: () => para(6) });
await test('SR6', 'Ctrl + Alt + A, F', '커서 위치의 서식 말하기', seq('KeyA', 'KeyF'), { alt: loose(seq('KeyA', 'KeyF')), prepare: () => para(6) });
await test('SR11', 'Ctrl + Alt + Shift + R', '실시간 수정 표시', 'Control+Alt+Shift+KeyR', { prepare: editor });
await test('SR14', 'Ctrl + Alt + A, S', '선택영역 서식 읽기', seq('KeyA', 'KeyS'), { alt: loose(seq('KeyA', 'KeyS')), prepare: () => selectWord(6) });
await test('SR15', 'Ctrl + Alt + Shift + A, L', '커서 위치 읽기', seqShift('KeyA', 'KeyL'), { alt: loose(seqShift('KeyA', 'KeyL')), prepare: () => para(6) });
await test('SR16', 'Ctrl + Alt + Shift + A, W', '단어 수 읽기', seqShift('KeyA', 'KeyW'), { alt: loose(seqShift('KeyA', 'KeyW')), prepare: () => para(6) });

// ---------------------------------------------------------------- 문서 탐색
await test('N1', 'Ctrl + Alt + A, H', '개요 표시', seq('KeyA', 'KeyH'), { alt: loose(seq('KeyA', 'KeyH')), prepare: editor, expect: ['panels', 'active'] });
await nav('N2', 'Ctrl + Alt + N, H', '다음 제목으로', seq('KeyN', 'KeyH'), 1);
await nav('N3', 'Ctrl + Alt + P, H', '이전 제목으로', seq('KeyP', 'KeyH'), 6);
await nav('N4', 'Ctrl + Alt + N, 1~6', '다음 제목 2로', seq('KeyN', 'Digit2'), 1);
await nav('N5', 'Ctrl + Alt + P, 1~6', '이전 제목 1로', seq('KeyP', 'Digit1'), 6);
await nav('N8', 'Ctrl + Alt + N, O', '다음 목록으로', seq('KeyN', 'KeyO'), 0);
await nav('N9', 'Ctrl + Alt + P, O', '이전 목록으로', seq('KeyP', 'KeyO'), 6);
await nav('N10', 'Ctrl + Alt + N, I', '목록에서 다음 항목', seq('KeyN', 'KeyI'), 3);
await nav('N11', 'Ctrl + Alt + P, I', '목록에서 이전 항목', seq('KeyP', 'KeyI'), 4);
await nav('N12', 'Ctrl + Alt + N, L', '다음 링크로', seq('KeyN', 'KeyL'), 0);
await nav('N13', 'Ctrl + Alt + P, L', '이전 링크로', seq('KeyP', 'KeyL'), 6);
await nav('N16', 'Ctrl + Alt + N, W', '다음 서식 변경으로', seq('KeyN', 'KeyW'), 0);
await nav('N17', 'Ctrl + Alt + P, W', '이전 서식 변경으로', seq('KeyP', 'KeyW'), 6);

// ---------------------------------------------------------------- 기타 도구
await test('O3', 'Ctrl + Alt + X', '맞춤법/문법', 'Control+Alt+KeyX', { prepare: editor, expect: ['dialogs', 'panels', 'active'], wait: 2500, after: esc });
await test('O3', 'F7', '맞춤법/문법 (다른 키)', 'F7', { prepare: editor, expect: ['dialogs', 'panels', 'active'], wait: 2500, after: esc });
await test('O10', "Ctrl + '", '다음 철자 오류로', 'Control+Quote', { prepare: () => para(0), expect: /teh|recieve|철자|맞춤법/ });
await test('O11', 'Ctrl + ;', '이전 철자 오류로', 'Control+Semicolon', { prepare: () => para(6), expect: /teh|recieve|철자|맞춤법/ });
await test('O4', 'Ctrl + Shift + Y', '사전', 'Control+Shift+KeyY', { prepare: () => selectWord(6), expect: ['panels', 'dialogs', 'active'], wait: 2500, after: esc });
await test('O5', 'Ctrl + Shift + C', '단어 수', 'Control+Shift+KeyC', { prepare: editor, expect: ['dialogs'], after: esc });
await test('O6', 'Ctrl + Shift + S', '음성 입력', 'Control+Shift+KeyS', { prepare: editor, expect: ['dialogs', 'panels', 'active'], wait: 2500,
  after: async () => { await page.keyboard.press('Control+Shift+KeyS'); await esc(); } });
await test('O7', 'Ctrl + Alt + .', '측면 패널로 이동', 'Control+Alt+Period', { prepare: editor, expect: ['active', 'panels'] });
await test('O7', 'Ctrl + Alt + ,', '측면 패널로 이동 (반대 방향)', 'Control+Alt+Comma', { prepare: editor, expect: ['active', 'panels'] });
await test('O8', 'Page Down', '한 페이지 아래로', 'PageDown', {
  prepare: async () => { await editor(); for (let i = 0; i < 25; i++) { await page.keyboard.press('Control+End'); await page.keyboard.press('Enter'); } await page.keyboard.press('Control+Home'); }, expect: ['scroll'],
});
await test('O9', 'Page Up', '한 페이지 위로', 'PageUp', { expect: ['scroll'] });
await test('O12', 'Ctrl + Alt + O, H', '머리글 삽입·이동', seq('KeyO', 'KeyH'), { alt: loose(seq('KeyO', 'KeyH')), prepare: () => para(1), expect: /머리글/ });
await test('O13', 'Ctrl + Alt + O, F', '바닥글 삽입·이동', seq('KeyO', 'KeyF'), { alt: loose(seq('KeyO', 'KeyF')), prepare: () => para(1), expect: /바닥글/ });
await test('O14', 'Ctrl + Alt + E, P', '팝업으로 포커스 이동 (링크)', seq('KeyE', 'KeyP'), { alt: loose(seq('KeyE', 'KeyP')),
  prepare: async () => { await para(2); await page.keyboard.press('Control+ArrowRight'); await page.keyboard.press('Control+ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800); },
  expect: ['active'], after: esc,
});
await test('O15', 'Ctrl + Alt + Shift + M', '편집 영역에서 포커스 이동', 'Control+Alt+Shift+KeyM', { prepare: editor, expect: ['active'] });
skip('O16', 'Alt + →', '사용자 또는 그룹 정보 표시', '문서에 사람 칩(@이름)이 있어야 해서, 실제 사람 이메일을 넣지 않으려고 점검하지 않음');
await test('O2', 'Ctrl + Alt + Shift + I', '탐색 도구 열기', 'Control+Alt+Shift+KeyI', { prepare: editor, expect: ['panels', 'dialogs', 'active'], wait: 2500, after: esc });

// ---------------------------------------------------------------- 북마크·이미지·표·각주·댓글·제안·탭이 필요한 것
// Bookmark on the last paragraph.
await para(6);
await menu('삽입', '북마크');
await esc();
await nav('N14', 'Ctrl + Alt + N, B', '다음 북마크로', seq('KeyN', 'KeyB'), 0);
await nav('N15', 'Ctrl + Alt + P, B', '이전 북마크로', seq('KeyP', 'KeyB'), 7);

// Footnotes, two of them.
await test('C4', 'Ctrl + Alt + F', '각주 삽입', 'Control+Alt+KeyF', { prepare: async () => { await para(1); await page.keyboard.press('End'); }, expect: /각주/,
  after: async () => { await page.keyboard.type('각주 하나'); } });
await para(6); await page.keyboard.press('End'); await page.keyboard.press('Control+Alt+KeyF'); await page.keyboard.type('각주 둘'); await page.waitForTimeout(800);
await test('C5', 'Ctrl + Alt + E, F', '현재 각주로 이동', seq('KeyE', 'KeyF'), { alt: loose(seq('KeyE', 'KeyF')), prepare: async () => { await para(1); await page.keyboard.press('End'); }, expect: /각주/ });
await nav('C6', 'Ctrl + Alt + N, F', '다음 각주로', seq('KeyN', 'KeyF'), 0);
await nav('C7', 'Ctrl + Alt + P, F', '이전 각주로', seq('KeyP', 'KeyF'), 7);

// Comments, two of them (posted with Ctrl+Enter in the comment box).
const comment = async (i, text) => {
  await selectWord(i);
  await page.keyboard.press('Control+Alt+KeyM');
  await page.waitForTimeout(1200);
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1500);
};
await test('C1', 'Ctrl + Alt + M', '댓글 삽입', 'Control+Alt+KeyM', { prepare: () => selectWord(1), expect: ['active', 'panels', 'dialogs'], wait: 1500,
  after: async () => { await page.keyboard.type('점검 댓글 하나'); await page.keyboard.press('Control+Enter'); await page.waitForTimeout(1500); } });
await comment(6, '점검 댓글 둘');
await test('C2', 'Ctrl + Alt + Shift + A', '댓글 기록 열기', 'Control+Alt+Shift+KeyA', { prepare: editor, expect: ['panels', 'dialogs', 'active'], after: esc });
await nav('C12', 'Ctrl + Alt + N, C', '다음 댓글로', seq('KeyN', 'KeyC'), 0);
await nav('C13', 'Ctrl + Alt + P, C', '이전 댓글로', seq('KeyP', 'KeyC'), 7);
await test('SR12', 'Ctrl + Alt + A, C', '댓글 읽기', seq('KeyA', 'KeyC'), { alt: loose(seq('KeyA', 'KeyC')), prepare: async () => { await selectWord(1); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); } });
await test('SR13', 'Ctrl + Alt + A, A', '댓글 앵커 읽기', seq('KeyA', 'KeyA'), { alt: loose(seq('KeyA', 'KeyA')), prepare: async () => { await selectWord(1); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); } });
await test('C3', 'Ctrl + Alt + E, C', '현재 댓글 입력', seq('KeyE', 'KeyC'), { alt: loose(seq('KeyE', 'KeyC')), prepare: async () => { await selectWord(1); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); }, expect: ['active'] });
await test('C15', 'J', '다음 댓글 (댓글 선택 시)', 'KeyJ', { expect: ['active'] });
await test('C16', 'K', '이전 댓글 (댓글 선택 시)', 'KeyK', { expect: ['active'] });
await test('C14', 'R', '답글 작성 (댓글 선택 시)', 'KeyR', { expect: ['active', 'dialogs'], after: async () => { await esc(); } });
await test('C18', 'U', '현재 댓글 종료 (댓글 선택 시)', 'KeyU', { prepare: async () => { await selectWord(1); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); for (const k of seq('KeyE', 'KeyC')) await page.keyboard.press(k); await page.waitForTimeout(800); }, expect: ['active'] });
await test('C17', 'E', '현재 댓글 해결 (댓글 선택 시)', 'KeyE', { prepare: async () => { await selectWord(6); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); for (const k of seq('KeyE', 'KeyC')) await page.keyboard.press(k); await page.waitForTimeout(800); }, expect: /해결|panels|active/ });

// Suggestions: two, typed in suggestion mode.
await editor(); await page.keyboard.press('Control+Alt+Shift+KeyX'); await page.waitForTimeout(800);
await para(1); await page.keyboard.press('End'); await page.keyboard.type(' 제안하나');
await para(6); await page.keyboard.press('End'); await page.keyboard.type(' 제안둘');
await editor(); await page.keyboard.press('Control+Alt+Shift+KeyZ'); await page.waitForTimeout(800);
await nav('C9', 'Ctrl + Alt + N, U', '다음 제안으로', seq('KeyN', 'KeyU'), 0);
await nav('C10', 'Ctrl + Alt + P, U', '이전 제안으로', seq('KeyP', 'KeyU'), 7);
await test('C11', 'Ctrl + Alt + O, U', '제안된 수정 사항 검토', seq('KeyO', 'KeyU'), { alt: loose(seq('KeyO', 'KeyU')), prepare: editor, expect: ['panels', 'dialogs', 'active'], after: esc });

}

if (PART2) {
  // Retries: view mode from editing mode, keys inside a comment, the current footnote,
  // list item selection, and misspellings once spell check has had time to mark them.
  await test('A23', 'Ctrl + Alt + Shift + C', '보기 모드로 전환 (수정 모드에서)', 'Control+Alt+Shift+KeyC', { prepare: editor, expect: ['mode'] });
  await test('A22', 'Ctrl + Alt + Shift + Z', '수정 모드로 전환 (보기 모드에서)', 'Control+Alt+Shift+KeyZ', { prepare: editor, expect: ['mode'] });
  await para(1); await page.keyboard.press('End'); await page.keyboard.press('Control+Alt+KeyF'); await page.keyboard.type('각주 하나'); await page.waitForTimeout(800);
  await test('C5', 'Ctrl + Alt + E, F', '현재 각주로 이동', seq('KeyE', 'KeyF'), { prepare: async () => { await para(1); await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft'); }, expect: /각주/, alt: loose(seq('KeyE', 'KeyF')) });
  await selectWord(6);
  await page.keyboard.press('Control+Alt+KeyM'); await page.waitForTimeout(2000);
  await page.keyboard.type('점검 댓글'); await page.waitForTimeout(500);
  await postComment();
  const onComment = async () => { await para(6); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500); };
  await test('SR12', 'Ctrl + Alt + A, C', '댓글 읽기', seq('KeyA', 'KeyC'), { prepare: onComment, alt: loose(seq('KeyA', 'KeyC')) });
  await test('C3', 'Ctrl + Alt + E, C', '현재 댓글 입력', seq('KeyE', 'KeyC'), { prepare: onComment, expect: ['active'], alt: loose(seq('KeyE', 'KeyC')) });
  await test('C14', 'R', '답글 작성 (댓글 선택 시)', 'KeyR', { expect: ['active', 'dialogs'], after: esc });
  const inComment = async () => { await onComment(); for (const k of seq('KeyE', 'KeyC')) await page.keyboard.press(k); await page.waitForTimeout(1000); };
  await test('C15', 'J', '다음 댓글 (댓글 선택 시)', 'KeyJ', { prepare: inComment, expect: ['active'] });
  await test('C16', 'K', '이전 댓글 (댓글 선택 시)', 'KeyK', { prepare: inComment, expect: ['active'] });
  await test('C18', 'U', '현재 댓글 종료 (댓글 선택 시)', 'KeyU', { prepare: inComment, expect: ['active'] });
  await test('C17', 'E', '현재 댓글 해결 (댓글 선택 시)', 'KeyE', { prepare: inComment, expect: /해결|panels|active/ });
  await para(3); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Control+Shift+Digit8'); await page.waitForTimeout(800);
  await test('S10', 'Ctrl + Alt + Shift + E, I', '현재 목록 항목 선택', seqShift('KeyE', 'KeyI'), { prepare: () => para(3), expect: /선택|FAB|dialogs/, alt: loose(seqShift('KeyE', 'KeyI')) });
  await test('S11', 'Ctrl + Alt + Shift + E, O', '같은 수준 목록 항목 모두 선택', seqShift('KeyE', 'KeyO'), { prepare: () => para(3), expect: /선택|FAB|dialogs/, alt: loose(seqShift('KeyE', 'KeyO')) });
  await test('O10', "Ctrl + '", '다음 철자 오류로', 'Control+Quote', { prepare: () => para(0), expect: /teh|recieve|철자|맞춤법|url|style/ });
  await test('O11', 'Ctrl + ;', '이전 철자 오류로', 'Control+Semicolon', { prepare: () => para(6), expect: /teh|recieve|철자|맞춤법|url|style/ });
}

// Image (by URL) on its own line before the last paragraph, then a drawing.
await para(6);
await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp');
const chooser = page.waitForEvent('filechooser', { timeout: 10000 });
await menu('삽입', '이미지', '컴퓨터에서 업로드');
await (await chooser).setFiles(IMAGE);
await page.waitForTimeout(5000);
const selectImage = async () => {
  await para(6);
  await page.keyboard.press('Shift+ArrowRight'); // an inline image is one character
  await page.waitForTimeout(600);
};
const img = (n, key, action, k) => test(n, key, action, k, { prepare: selectImage, expect: ['image'] });
await nav('N6', 'Ctrl + Alt + N, G', '다음 그래픽으로', seq('KeyN', 'KeyG'), 0);
await nav('N7', 'Ctrl + Alt + P, G', '이전 그래픽으로', seq('KeyP', 'KeyG'), 9);
await test('I1', 'Ctrl + Alt + Y', '대체 텍스트', 'Control+Alt+KeyY', { prepare: selectImage, expect: ['dialogs', 'panels'], after: esc });
await img('I2', 'Ctrl + Alt + K', '확대', 'Control+Alt+KeyK');
await img('I3', 'Ctrl + Alt + B', '가로 확대', 'Control+Alt+KeyB');
await img('I4', 'Ctrl + Alt + I', '세로 확대', 'Control+Alt+KeyI');
await img('I5', 'Ctrl + Alt + J', '축소', 'Control+Alt+KeyJ');
await img('I6', 'Ctrl + Alt + W', '가로 축소', 'Control+Alt+KeyW');
await img('I7', 'Ctrl + Alt + Q', '세로 축소', 'Control+Alt+KeyQ');
await img('I8', 'Alt + →', '시계 방향 15도 회전', 'Alt+ArrowRight');
await img('I9', 'Alt + ←', '시계 반대 방향 15도 회전', 'Alt+ArrowLeft');
await img('I10', 'Alt + Shift + ←', '시계 반대 방향 1도 회전', 'Alt+Shift+ArrowLeft');
await img('I11', 'Alt + Shift + →', '시계 방향 1도 회전', 'Alt+Shift+ArrowRight');
await test('I12', 'Shift + Esc', '그림 편집기 닫기', 'Shift+Escape', {
  prepare: async () => { await para(0); await menu('삽입', '그리기', '새'); await page.waitForTimeout(2500); }, expect: ['dialogs'], wait: 2000,
});

// Table (2 x 2) at the end, then the table keys from its first cell.
await editor(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
await menu('삽입', '표');
await page.locator('.goog-dimension-picker-unhighlighted, .goog-dimension-picker').filter({ visible: true }).first().click({ position: { x: 25, y: 25 } }).catch(() => {});
await page.waitForTimeout(1500);
await page.keyboard.type('가'); await page.keyboard.press('Tab'); await page.keyboard.type('나');
await page.keyboard.press('Tab'); await page.keyboard.type('다'); await page.keyboard.press('Tab'); await page.keyboard.type('라');
const inTable = async () => { await editor(); await page.keyboard.press('Control+End'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300); };
const tbl = (n, key, action, b) => test(n, key, action, seqShift('KeyT', b), { prepare: inTable, expect: /./, alt: loose(seqShift('KeyT', b)) });
await tbl('T1x', 'Ctrl + Alt + Shift + T, S', '표의 시작으로', 'KeyS');
await tbl('T2x', 'Ctrl + Alt + Shift + T, D', '표의 끝으로', 'KeyD');
await tbl('T3x', 'Ctrl + Alt + Shift + T, I', '열의 시작으로', 'KeyI');
await tbl('T4x', 'Ctrl + Alt + Shift + T, K', '열의 끝으로', 'KeyK');
await tbl('T5x', 'Ctrl + Alt + Shift + T, B', '다음 열로', 'KeyB');
await tbl('T6x', 'Ctrl + Alt + Shift + T, V', '이전 열로', 'KeyV');
await tbl('T7x', 'Ctrl + Alt + Shift + T, J', '행 시작으로', 'KeyJ');
await tbl('T8x', 'Ctrl + Alt + Shift + T, L', '행 끝으로', 'KeyL');
await tbl('T9x', 'Ctrl + Alt + Shift + T, M', '다음 행으로', 'KeyM');
await tbl('T10x', 'Ctrl + Alt + Shift + T, G', '이전 행으로', 'KeyG');
await tbl('SR7', 'Ctrl + Alt + Shift + T, H', '행·열 헤더 읽기', 'KeyH');
await tbl('SR8', 'Ctrl + Alt + Shift + T, N', '셀 위치 읽기', 'KeyN');
await tbl('SR9', 'Ctrl + Alt + Shift + T, R', '행 헤더 읽기', 'KeyR');
await tbl('SR10', 'Ctrl + Alt + Shift + T, C', '열 헤더 읽기', 'KeyC');
await tbl('T11x', 'Ctrl + Alt + Shift + T, E', '표에서 나가기', 'KeyE');
await test('T12x', 'Ctrl + Alt + Shift + N, T', '다음 표로', seqShift('KeyN', 'KeyT'), { alt: loose(seqShift('KeyN', 'KeyT')), prepare: () => para(0), expect: /./ });
await test('T13x', 'Ctrl + Alt + Shift + P, T', '이전 표로', seqShift('KeyP', 'KeyT'), { alt: loose(seqShift('KeyP', 'KeyT')), prepare: async () => { await editor(); await page.keyboard.press('Control+End'); }, expect: /./ });

// Document tabs: add a second tab from the tabs sidebar.
await para(0);
await menu('삽입', '탭');
await page.waitForTimeout(2500);
await test('N20', 'Ctrl + Shift + Page Down', '다음 탭으로', 'Control+Shift+PageDown', { prepare: editor, expect: ['url'] });
await test('N21', 'Ctrl + Shift + Page Up', '이전 탭으로', 'Control+Shift+PageUp', { prepare: editor, expect: ['url'] });

// Version history: open it, move between versions, then leave by reloading the document.
await test('O1', 'Ctrl + Alt + Shift + H', '업데이트 기록 열기', 'Control+Alt+Shift+KeyH', { prepare: editor, expect: ['url', 'panels', 'dialogs'], wait: 4000 });
await test('N18', 'Ctrl + Alt + N, R', '다음 수정 항목 (기록 보기 중)', seq('KeyN', 'KeyR'), { alt: loose(seq('KeyN', 'KeyR')), expect: /./, wait: 2500 });
await test('N19', 'Ctrl + Alt + P, R', '이전 수정 항목 (기록 보기 중)', seq('KeyP', 'KeyR'), { alt: loose(seq('KeyP', 'KeyR')), expect: /./, wait: 2500 });
await test('N18', 'Ctrl + Alt + K', '다음 수정 항목 (다른 키)', 'Control+Alt+KeyK', { expect: /./, wait: 2500 });
await test('N19', 'Ctrl + Alt + J', '이전 수정 항목 (다른 키)', 'Control+Alt+KeyJ', { expect: /./, wait: 2500 });
await page.goto(docUrl, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#boldButton', { timeout: 60000 });
await page.waitForTimeout(3000);

// ---- 스크린 리더 지원 끄기 (다시 원래대로)
await test('SR1', 'Ctrl + Alt + Z', '스크린 리더 지원 끄기', 'Control+Alt+KeyZ', { prepare: editor, expect: /사용 중지/ });
if (!results[results.length - 1].docs) await screenReader(false);
console.log('test document:', docUrl);
save();
await context.close();
