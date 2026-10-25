// Every shortcut on Google Drive's help page (support.google.com/drive/answer/2563044,
// computer): press it in a real signed-in Drive and record (1) what changed on the page,
// so a person can tell whether Drive reacted, and (2) whether Quickhand counted it.
//
// Only a test folder named "손빠르미 단축키 점검 문서 (지워도 됨)" in My Drive and what
// is made inside it are touched: keys run only while that folder (or its test subfolder)
// is open. Share, move and rename windows are opened and closed without changes, a star
// is taken off again, removed items are brought back with Ctrl+Z, and the whole folder
// goes to the trash at the end (cleanup.mjs). Results: results/drive-shortcuts.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const SUB = '손빠르미 하위 폴더 (지워도 됨)';
// Four pictures, so the arrow keys have items to move between.
const ICONS = path.join(RESULTS, '..', '..', 'extension', 'assets', 'icons');
const IMAGES = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'].map((f) => path.join(ICONS, f));
// The list (rows) and the grid layout (cells) mark items the same way.
const ITEM = '[role="row"][data-id], [role="gridcell"][data-id]';
const OUT = path.join(RESULTS, 'drive-shortcuts.json');

const { context, worker } = await launch({ headless: false });
await context.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
const page = await context.newPage();
page.setDefaultTimeout(10000);
await page.setViewportSize({ width: 1500, height: 900 });
// To read what Ctrl+Alt+L and Ctrl+Shift+C copied.
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://drive.google.com' });
page.on('dialog', (d) => d.dismiss().catch(() => {}));
// File pickers are caught from the start: a listener added only just before the key is
// too late, and Windows' own "열기" window then stops the run. Each picker is cancelled
// unless `upload` lists files for it.
let upload = null;
let pickers = 0;
page.on('filechooser', (fc) => {
  pickers++;
  const files = upload || [];
  upload = null;
  fc.setFiles(files).catch(() => {});
});
const results = [];
const extra = {};
const save = () => fs.writeFileSync(OUT, JSON.stringify({ ...extra, results }, null, 2));

// ---------------------------------------------------------------- measuring
const state = () => page.evaluate(() => {
  const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const a = document.activeElement;
  const rows = [...document.querySelectorAll('[role="row"][data-id], [role="gridcell"][data-id]')].filter(vis);
  const name = (r) => r.innerText.split('\n')[0];
  const viewer = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].find((d) => vis(d) && d.querySelector('img, video, canvas, iframe'));
  return {
    url: location.pathname,
    rows: rows.length,
    // Which items, not how many: an arrow key moves the selection to another one.
    selected: rows.filter((r) => r.getAttribute('aria-selected') === 'true').map(name).join(', '),
    focusRow: name(rows.find((r) => r.contains(a)) || { innerText: '' }),
    active: a ? [a.tagName.toLowerCase(), a.getAttribute('aria-label'), a.getAttribute('role')].filter(Boolean).join(' ').slice(0, 60) : '',
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((d) => vis(d) && d.innerText.trim() && !/업로드 완료|upload complete/i.test(d.innerText))
      .map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0]).slice(0, 30)).join(' | '),
    menus: [...document.querySelectorAll('[role="menu"]')].filter(vis).map((m) => (m.getAttribute('aria-label') || m.innerText.split('\n')[0]).slice(0, 20)).join(' | '),
    panes: [...document.querySelectorAll('[role="complementary"], [role="region"], aside')].filter(vis).map((p) => (p.getAttribute('aria-label') || '').slice(0, 25)).filter(Boolean).join(' | '),
    layout: [...document.querySelectorAll('[aria-pressed="true"], [aria-checked="true"]')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText).trim().slice(0, 12)).filter((t) => /목록|그리드|List|Grid/.test(t)).join(','),
    rowHeight: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0,
    alerts: [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"]')].map((e) => e.innerText.trim()).filter(Boolean).join(' / ').slice(0, 80),
    frames: [...document.querySelectorAll('iframe')].filter(vis).length,
    viewer: viewer ? (viewer.querySelector('img') ? Math.round(viewer.querySelector('img').getBoundingClientRect().width) : 1) : 0,
    // The preview's zoom: a "100%" label and the pictures' transforms.
    zoom: viewer ? ((viewer.innerText.match(/\d+\s?%/) || [''])[0] + ' ' + [...viewer.querySelectorAll('img')].map((i) => getComputedStyle(i).transform).join(' ')).trim() : '',
    printed: window.__printed || 0,
  };
});
// Reading the clipboard can wait forever (no focus, a permission prompt), so it gives
// up after a second, and only the copy tests ask for it.
const clip = () => page.evaluate(() => Promise.race([
  navigator.clipboard.readText().catch(() => ''),
  new Promise((resolve) => setTimeout(() => resolve('(읽지 못함)'), 1000)),
])).catch(() => '');
let readClip = false;
const snapshot = async () => Object.assign(await state(), { pages: context.pages().length }, readClip ? { clip: (await clip()).slice(0, 60) } : {});

function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${JSON.stringify(b[k]).slice(0, 50)} → ${JSON.stringify(a[k]).slice(0, 50)}`);
  return out;
}

// A step that never answers (a page or worker call) fails after `ms` instead of
// holding the whole run; the step being run is written down so a stop can be traced.
function within(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ': ' + ms / 1000 + '초 넘게 답이 없음')), ms); })])
    .finally(() => clearTimeout(timer));
}
const STEP = path.join(RESULTS, 'drive-step.txt');
const step = (s) => fs.writeFileSync(STEP, new Date().toLocaleTimeString() + ' ' + s);

async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}

// ---------------------------------------------------------------- moving around
let FOLDER = '';
let SUBFOLDER = '';
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(500); };
const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const row = (name) => visible(ITEM, { hasText: name });
async function closeExtraPages() {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
}
async function go(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await visible('[role="main"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3500);
}
// The test folder (or its subfolder) open, nothing selected, no extra tabs.
async function home(where = FOLDER) {
  await closeExtraPages();
  if (!page.url().startsWith(where) || (await page.locator('[role="dialog"]').filter({ visible: true }).count())) await go(where);
  await esc();
}
// Keys only ever run inside the test folders.
async function guard() {
  const url = page.url();
  if (!(url.startsWith(FOLDER) || (SUBFOLDER && url.startsWith(SUBFOLDER)))) throw new Error('점검 폴더 밖이라 멈춤: ' + url);
}
// One item of the test folder selected (and focused).
const pick = (name) => async () => { await home(); await row(name).click(); await page.waitForTimeout(700); };

async function test(n, section, keyLabel, action, keys, { prepare, expect, after, wait = 1500 } = {}) {
  let error = null;
  let changed = [];
  let works = null;
  let quickhand = null;
  try {
    step(n + ' 준비');
    if (prepare) await within(prepare(), 90000, '준비');
    await guard();
    step(n + ' 전 상태');
    const before = await within(snapshot(), 20000, '화면 읽기');
    const since = Date.now();
    step(n + ' 키 누르기');
    for (const k of [].concat(keys)) {
      if (typeof k === 'function') await within(k(), 30000, '키'); else await within(page.keyboard.press(k), 15000, '키 누르기');
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(wait);
    step(n + ' 뒤 상태');
    const now = await within(snapshot(), 20000, '화면 읽기');
    step(n + ' 손빠르미 기록');
    quickhand = await within(quickhandSaw(since), 20000, '손빠르미 기록 읽기');
    changed = diff(before, now);
    works = expect ? changed.some((c) => expect.some((k) => c.startsWith(k))) : changed.length > 0;
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  try {
    step(n + ' 정리');
    if (after) await within(after(), 90000, '정리');
  } catch (e) {
    error = (error ? error + ' / ' : '') + '정리 실패: ' + e.message.split('\n')[0];
  }
  const r = { n, section, key: keyLabel, action, drive: works, changed, quickhand, error };
  results.push(r);
  console.log(JSON.stringify(r));
  save();
  return r;
}
function skip(n, section, key, action, why) {
  const r = { n, section, key, action, drive: null, changed: [], quickhand: null, error: null, skipped: why };
  results.push(r);
  console.log(JSON.stringify(r));
  save();
}

// ---------------------------------------------------------------- the test folder
await page.goto('https://drive.google.com/drive/my-drive', { waitUntil: 'domcontentloaded', timeout: 60000 });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN: run `node login.mjs`, sign in, close the window, then run this again.');
  await context.close();
  process.exit(1);
}
await go('https://drive.google.com/drive/my-drive');
const ids = () => page.evaluate(() => [...document.querySelectorAll('[role="row"][data-id]')].map((r) => r.getAttribute('data-id')));
const idsBefore = await ids();
// Made with the "새로 만들기" button (not a shortcut), so a run always starts empty;
// Alt+C then F if the button can't be found.
const newButton = visible('button, [role="button"]', { hasText: /^\s*(신규|새로 만들기|New)\s*$/ });
if (await newButton.count()) {
  await newButton.click();
  await page.waitForTimeout(800);
  await visible('[role="menuitem"]', { hasText: /새 폴더|New folder/ }).click();
} else {
  await page.locator('[role="main"]').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Alt+KeyC'); await page.waitForTimeout(300); await page.keyboard.press('KeyF');
}
await page.waitForTimeout(1200);
await page.keyboard.press('Control+KeyA');
await page.keyboard.type(TITLE);
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
// The one new row (older test files share the name).
const folderId = await page.evaluate(([t, before]) => {
  const r = [...document.querySelectorAll('[role="row"][data-id]')].find((x) => x.innerText.startsWith(t) && !before.includes(x.getAttribute('data-id')));
  return r ? r.getAttribute('data-id') : null;
}, [TITLE, idsBefore]);
if (!folderId) throw new Error('test folder was not made');
FOLDER = 'https://drive.google.com/drive/folders/' + folderId;
extra.folder = FOLDER;
console.log('test folder:', FOLDER);
await go(FOLDER);

// ---------------------------------------------------------------- 선택한 항목 작업 (만들기 쪽 먼저: 점검할 항목을 채움)
const SA = '선택한 항목에 대해 작업 수행';
const SC = '새로운 항목 만들기';
const into = async () => { await home(); await page.locator('[role="main"]').first().click({ position: { x: 600, y: 600 } }).catch(() => {}); };
// File upload: Drive opens the computer's file picker; the extension's icon goes in.
await test('A16', SA, 'Alt + c 다음에 u', '파일 업로드', ['Alt+KeyC', 'KeyU'], {
  prepare: async () => { await into(); upload = IMAGES; extra.pickersBefore = pickers; },
  expect: ['rows', 'alerts'], wait: 7000,
});
results[results.length - 1].changed.push('파일 선택 창: ' + (pickers > extra.pickersBefore ? '열림 (아이콘 그림 4개를 올림)' : '안 열림'));
upload = null;
save();
// Right after the upload its status box is still there to move to.
await test('N9', '탐색 및 보기', 'Alt + g 다음 u', '업로드 상태로 이동 (업로드 직후)', ['Alt+KeyG', 'KeyU'], { expect: ['active'] });
const before = pickers;
await test('A17', SA, 'Alt + c 다음에 i', '폴더 업로드', ['Alt+KeyC', 'KeyI'], { prepare: into, wait: 2000 });
// The picker itself is the reaction; it was cancelled, so nothing was uploaded.
results[results.length - 1].drive = pickers > before;
results[results.length - 1].changed.push('파일 선택 창: ' + (pickers > before ? '열림 (취소함)' : '안 열림'));
save();

await test('C5', SC, 'Alt + c 다음에 f', '폴더', ['Alt+KeyC', 'KeyF'], {
  prepare: into, expect: ['dialogs'],
  after: async () => { await page.keyboard.press('Control+KeyA'); await page.keyboard.type(SUB); await page.keyboard.press('Enter'); await page.waitForTimeout(3000); },
});
// New Google files open in a new tab. Left empty and untitled, Drive throws them away
// (their "휴지통으로 이동" stays off), so they never show in the folder; the addresses
// are kept anyway.
extra.created = [];
const keepNewTabs = async (action) => {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) extra.created.push({ action, url: p.url() });
  await closeExtraPages();
};
const create = (n, k, code, action) => test(n, SC, 'Alt + c 다음에 ' + k, action, ['Alt+KeyC', code], { prepare: into, expect: ['pages'], wait: 6000, after: () => keepNewTabs(action) });
await create('C1', 't', 'KeyT', '문서');
await create('C2', 'p', 'KeyP', '프레젠테이션');
await create('C3', 's', 'KeyS', '스프레드시트');
await create('C4', 'd', 'KeyD', '그림');
await create('C6', 'o', 'KeyO', '양식');
await home();
await go(FOLDER);
extra.items = await page.evaluate(() => [...document.querySelectorAll('[role="row"][data-id]')].map((r) => r.innerText.split('\n')[0]));
console.log('items in the test folder:', extra.items);
SUBFOLDER = await page.evaluate((s) => {
  const r = [...document.querySelectorAll('[role="row"][data-id]')].find((x) => x.innerText.startsWith(s));
  return r ? 'https://drive.google.com/drive/folders/' + r.getAttribute('data-id') : '';
}, SUB);

// ---------------------------------------------------------------- 탐색 및 보기
const SN = '탐색 및 보기';
const seq = (a, b) => ['Alt+Key' + a.toUpperCase(), 'Key' + b.toUpperCase()];
const onImage = pick('icon-128.png');
await test('N1', SN, 'Alt + g 다음 n', '(도움말에 이름 없음: "탐색 및 보기" 칸)', seq('g', 'n'), { prepare: onImage, expect: ['active', 'focusRow'] });
await test('N2', SN, 'Alt + g 다음 f', '탐색 패널(폴더 목록)로 이동', seq('g', 'f'), { prepare: onImage, expect: ['active'] });
await test('N3', SN, 'Alt + g 다음 i', '항목 보기로 이동', seq('g', 'i'), { prepare: async () => { await onImage(); await page.keyboard.press('Alt+KeyG'); await page.keyboard.press('KeyF'); await page.waitForTimeout(600); }, expect: ['active', 'focusRow'] });
await test('N4', SN, 'Alt + v 다음 l', '바둑판식 보기와 목록 보기 간 전환', seq('v', 'l'), { prepare: onImage, expect: ['layout'], after: async () => { await page.keyboard.press('Alt+KeyV'); await page.keyboard.press('KeyL'); await page.waitForTimeout(1200); } });
await test('N5', SN, 'Alt + g 다음 c', '페이지 콘텐츠로 이동', seq('g', 'c'), { prepare: async () => { await onImage(); await page.keyboard.press('Alt+KeyG'); await page.keyboard.press('KeyF'); await page.waitForTimeout(600); }, expect: ['active', 'focusRow'] });
await test('N6', SN, 'Alt + g 다음 d', '세부정보 창으로 이동', seq('g', 'd'), { prepare: onImage, expect: ['active', 'panes'] });
await test('N7', SN, 'Alt + g 다음 t', '애플리케이션 상단으로 이동(Google 바)', seq('g', 't'), { prepare: onImage, expect: ['active'] });
await test('N8', SN, 'Alt + g 다음 a', '다운로드 상태로 이동', seq('g', 'a'), { prepare: onImage, expect: ['active', 'dialogs', 'alerts'] });
await test('N9', SN, 'Alt + g 다음 u', '업로드 상태로 이동 (업로드 상태 창이 닫힌 뒤)', seq('g', 'u'), { prepare: onImage, expect: ['active', 'dialogs', 'alerts'] });
// The panes: pressed again from inside the pane, and again after a click on the list,
// to see whether the key also hides it.
const pane = (n, k, action) => async () => {
  await test(n, SN, 'Alt + v 다음 ' + k, action + ' (열기)', seq('v', k), { prepare: onImage, expect: ['panes', 'active'] });
  await test(n, SN, 'Alt + v 다음 ' + k, action + ' (창 안에서 다시 누르기)', seq('v', k), { expect: ['panes'] });
  // With the activity pane open, a click on the list and Alt+V, A froze Drive's page
  // (the key press never came back, twice), so that one is not pressed.
  if (k === 'a') skip(n, SN, 'Alt + v 다음 ' + k, action + ' (목록을 누른 뒤 다시 누르기)', '활동 창이 열린 채 목록을 누르고 이 키를 누르면 드라이브 화면이 멈춰서 점검하지 않음 (두 번 확인)');
  else await test(n, SN, 'Alt + v 다음 ' + k, action + ' (목록을 누른 뒤 다시 누르기)', seq('v', k), { prepare: onImage, expect: ['panes'] });
};
await pane('N10', 'e', '승인 창 표시 또는 숨기기')();
await pane('N11', 'd', '세부정보 창 표시 또는 숨기기')();
await pane('N12', 'a', '활동 창 표시 또는 숨기기')();

// ---------------------------------------------------------------- 항목 선택 · 항목 간 이동
const SS = '항목 선택';
const SM = '항목 간 이동';
// From a picture in the middle of the list, so there is room both ways.
const onMid = pick('icon-32.png');
await test('S1', SS, 'Shift + 스페이스바', '항목 선택 또는 선택 해제', 'Shift+Space', { prepare: onMid, expect: ['selected'] });
await test('S2', SS, '아래쪽 화살표', '아래에 있는 다음 항목 선택', 'ArrowDown', { prepare: onMid, expect: ['focusRow', 'selected'] });
await test('S3', SS, '위쪽 화살표', '위에 있는 다음 항목 선택', 'ArrowUp', { prepare: onMid, expect: ['focusRow', 'selected'] });
await test('S6', SS, 'Shift + 아래쪽 화살표', '선택 영역을 아래로 확장', 'Shift+ArrowDown', { prepare: onMid, expect: ['selected'] });
await test('S7', SS, 'Shift + 위쪽 화살표', '선택 영역을 위로 확장', 'Shift+ArrowUp', { prepare: onMid, expect: ['selected'] });
await test('S10', SS, 'Ctrl + a', '표시된 항목 모두 선택', 'Control+KeyA', { prepare: onMid, expect: ['selected'] });
await test('S11', SS, 'esc', '선택한 항목 모두 선택 해제', 'Escape', { prepare: async () => { await onMid(); await page.keyboard.press('Control+KeyA'); await page.waitForTimeout(500); }, expect: ['selected'] });
await test('M1', SM, 'Ctrl + 아래쪽 화살표', '선택 영역을 변경하지 않고 아래로 이동', 'Control+ArrowDown', { prepare: onMid, expect: ['focusRow'] });
await test('M2', SM, 'Ctrl + 위쪽 화살표', '선택 영역을 변경하지 않고 위로 이동', 'Control+ArrowUp', { prepare: onMid, expect: ['focusRow'] });
// Left and right move along a row of the grid layout: switched to it for these, then
// back to the list (the layout is remembered for the account).
const layout = async () => (await state()).layout;
const toGrid = async () => { await home(); if (!/그리드|Grid/.test(await layout())) { await row('icon-32.png').click(); await page.keyboard.press('Alt+KeyV'); await page.keyboard.press('KeyL'); await page.waitForTimeout(2000); } };
const toList = async () => { await home(); if (/그리드|Grid/.test(await layout())) { await page.locator('[role="main"]').first().click({ position: { x: 600, y: 600 } }).catch(() => {}); await page.keyboard.press('Alt+KeyV'); await page.keyboard.press('KeyL'); await page.waitForTimeout(2000); } };
const onMidGrid = async () => { await toGrid(); await row('icon-32.png').click(); await page.waitForTimeout(700); };
await test('S4', SS, '왼쪽 화살표', '왼쪽에 있는 다음 항목 선택 (바둑판식 보기)', 'ArrowLeft', { prepare: onMidGrid, expect: ['focusRow', 'selected'] });
await test('S5', SS, '오른쪽 화살표', '오른쪽에 있는 다음 항목 선택 (바둑판식 보기)', 'ArrowRight', { prepare: onMidGrid, expect: ['focusRow', 'selected'] });
await test('S8', SS, 'Shift + 왼쪽 화살표', '선택 영역을 왼쪽으로 확장 (바둑판식 보기)', 'Shift+ArrowLeft', { prepare: onMidGrid, expect: ['selected'] });
await test('S9', SS, 'Shift + 오른쪽 화살표', '선택 영역을 오른쪽으로 확장 (바둑판식 보기)', 'Shift+ArrowRight', { prepare: onMidGrid, expect: ['selected'] });
await test('M3', SM, 'Ctrl + 왼쪽 화살표', '선택 영역을 변경하지 않고 왼쪽으로 이동 (바둑판식 보기)', 'Control+ArrowLeft', { prepare: onMidGrid, expect: ['focusRow'] });
await test('M4', SM, 'Ctrl + 오른쪽 화살표', '선택 영역을 변경하지 않고 오른쪽으로 이동 (바둑판식 보기)', 'Control+ArrowRight', { prepare: onMidGrid, expect: ['focusRow'] });
await toList();
extra.layoutAfterGrid = await layout();

// ---------------------------------------------------------------- 선택한 항목 작업
// Other pictures for opening in a tab and for removing (brought back each time).
const onBig = pick('icon-48.png');
const onSmall = pick('icon-16.png');
const onSub = pick(SUB);
await test('A1', SA, 'Enter', '선택한 항목 열기 (하위 폴더)', 'Enter', { prepare: onSub, expect: ['url'], wait: 3000 });
await test('A1', SA, 'Enter', '선택한 항목 열기 (이미지 → 미리보기)', 'Enter', { prepare: onImage, expect: ['viewer', 'dialogs', 'pages'], wait: 3000, after: esc });
await test('A2', SA, 'Ctrl + Enter', '선택한 항목을 새 탭에서 열기', 'Control+Enter', { prepare: onBig, expect: ['pages'], wait: 4000, after: closeExtraPages });
await test('A3', SA, 'F2', '선택한 항목 이름 바꾸기', 'F2', { prepare: onImage, expect: ['dialogs'], after: esc });
await test('A4', SA, 'Ctrl + Alt + a', '선택한 항목 공유', 'Control+Alt+KeyA', { prepare: onImage, expect: ['dialogs', 'frames'], wait: 3000, after: async () => { await esc(); await esc(); } });
await test('A5', SA, 'Ctrl + Alt + m', '선택한 항목을 새 폴더로 이동', 'Control+Alt+KeyM', { prepare: onImage, expect: ['dialogs', 'frames'], wait: 2500, after: async () => { await esc(); await esc(); } });
await test('A6', SA, 'Ctrl + Alt + s', '선택한 항목에 별표표시', 'Control+Alt+KeyS', { prepare: onImage, wait: 2500 });
await test('A6', SA, 'Ctrl + Alt + s', '선택한 항목에 별표표시 취소', 'Control+Alt+KeyS', { prepare: onImage, wait: 2500 });
await test('A7', SA, 'Ctrl + Alt + r', '선택한 항목의 바로가기 만들기 (도움말에 두 줄: A7·A14)', 'Control+Alt+KeyR', { prepare: onImage, expect: ['dialogs', 'frames'], wait: 2500, after: async () => { await esc(); await esc(); } });
const undoZ = (n, label) => test(n, '애플리케이션 작업', 'Ctrl + z', '마지막 작업 실행취소 (' + label + ' 되돌림)', 'Control+KeyZ', { prepare: () => page.waitForTimeout(300), expect: ['rows', 'alerts'], wait: 3000 });
await test('A8', SA, 'Delete', '선택한 항목 삭제(휴지통으로)', 'Delete', { prepare: onSmall, expect: ['rows', 'alerts'], wait: 3000 });
await undoZ('P5', 'Delete');
await test('P6', '애플리케이션 작업', 'Ctrl + y', '마지막으로 실행취소한 작업 다시 실행 (Delete 다시)', 'Control+KeyY', { expect: ['rows', 'alerts'], wait: 3000 });
await undoZ('P5', '다시 실행한 Delete');
await test('A8', SA, '#', '선택한 항목 삭제(휴지통으로)', 'Shift+Digit3', { prepare: onSmall, expect: ['rows', 'alerts'], wait: 3000 });
await undoZ('P5', '#');
await test('A9', SA, 'Ctrl + Alt + l', '선택한 항목 URL을 클립보드에 복사', 'Control+Alt+KeyL', { prepare: async () => { await onImage(); readClip = true; }, expect: ['alerts', 'clip'] });
await test('A10', SA, 'Ctrl + Shift + c', '선택한 항목 제목을 클립보드에 복사', 'Control+Shift+KeyC', { prepare: onImage, expect: ['alerts', 'clip'], after: () => { readClip = false; } });
// Cut or copy, then paste in the subfolder. Drive keeps what was cut only within the
// page, so the subfolder is opened by double-click (no reload) and left by Back.
const toSub = async () => { await row(SUB).dblclick(); await page.waitForURL((u) => SUBFOLDER && u.href.startsWith(SUBFOLDER), { timeout: 15000 }); await page.waitForTimeout(3000); };
const toFolder = async () => { await page.goBack(); await page.waitForTimeout(3000); };
await test('A11', SA, 'Ctrl + x', '선택한 항목을 잘라내어 클립보드에 복사', 'Control+KeyX', { prepare: onImage, expect: ['alerts'] });
await test('A13', SA, 'Ctrl + Shift + v', '클립보드에서 선택한 항목 붙여넣기(이동) — 잘라낸 뒤', 'Control+Shift+KeyV', { prepare: toSub, expect: ['rows', 'alerts'], wait: 4000 });
// Not on the help page: plain Ctrl+V after a cut, to see whether that is the real move.
await test('A13', SA, 'Ctrl + v (도움말에 없음)', '잘라낸 항목 붙여넣기 — 같은 잘라내기로 한 번 더', 'Control+KeyV', { prepare: () => page.waitForTimeout(300), expect: ['rows', 'alerts'], wait: 4000 });
// The image back to the test folder if it moved (cut in the subfolder, paste in the folder).
await (async () => {
  if (!(await row('icon-128.png').count())) return;
  await row('icon-128.png').click(); await page.keyboard.press('Control+KeyX'); await page.waitForTimeout(1000);
  await toFolder();
  await page.locator('[role="main"]').first().click({ position: { x: 600, y: 600 } }).catch(() => {});
  await page.keyboard.press('Control+Shift+KeyV'); await page.waitForTimeout(4000);
  extra.imageMovedBack = !!(await row('icon-128.png').count());
})().catch((e) => console.log('moving the image back failed:', e.message));
// Copy (Ctrl+C), then Ctrl+Shift+V in the subfolder: the help page calls this "paste as a shortcut".
await test('A12', SA, 'Ctrl + Shift + v', '클립보드의 항목을 바로가기로 붙여넣기 — 복사한 뒤', 'Control+Shift+KeyV', {
  prepare: async () => { await onImage(); await page.keyboard.press('Control+KeyC'); await page.waitForTimeout(1000); await toSub(); },
  expect: ['rows', 'alerts'], wait: 4000,
});
skip('A14', SA, 'Ctrl + Alt + r', '선택한 항목의 단축키(바로가기) 만들기', 'A7과 같은 키 (Mac만 command + option + r로 다름)');
skip('A15', SA, 'Ctrl + y', '마지막으로 실행취소한 작업 다시 실행', '애플리케이션 작업의 Ctrl + y(P6)와 같은 키');

// ---------------------------------------------------------------- 메뉴 열기
const SU = '메뉴 열기';
const menu = (n, key, action, code, prepare = onImage) => test(n, SU, key, action, code, { prepare, expect: ['menus', 'dialogs'], after: async () => { await esc(); await esc(); } });
await menu('U1', 'Alt + n', '만들기 메뉴', 'Alt+KeyN', into);
await menu('U2', 'Shift + F10', '추가 작업 메뉴', 'Shift+F10');
await menu('U2', 'Alt + a', '추가 작업 메뉴', 'Alt+KeyA');
await menu('U3', 'Alt + Shift + a', '현재 폴더 작업 메뉴', 'Alt+Shift+KeyA', into);
await menu('U4', 'Alt + r', '정렬 메뉴', 'Alt+KeyR', into);
await menu('U5', 'Ctrl + Shift + s', '설정 메뉴', 'Control+Shift+KeyS', into);

// ---------------------------------------------------------------- 애플리케이션 작업
const SP = '애플리케이션 작업';
await test('P1', SP, 'Ctrl + /', '단축키 목록 표시', 'Control+Slash', { prepare: into, expect: ['dialogs'], after: esc });
// Density: pressed until the row height comes back, so the setting ends where it was.
await test('P2', SP, 'Alt + t 다음 q', '다음 시각적 밀도 선택', seq('t', 'q'), {
  prepare: async () => { await into(); extra.rowHeightStart = (await state()).rowHeight; },
  expect: ['rowHeight'], wait: 2000,
  after: async () => {
    for (let i = 0; i < 4 && (await state()).rowHeight !== extra.rowHeightStart; i++) {
      await page.keyboard.press('Alt+KeyT'); await page.keyboard.press('KeyQ'); await page.waitForTimeout(1500);
    }
    extra.rowHeightEnd = (await state()).rowHeight;
  },
});
await test('P3', SP, 'Ctrl + f', '찾기/다음 찾기', 'Control+KeyF', { prepare: into, expect: ['active', 'dialogs'], after: esc });
await test('P4', SP, 'Ctrl + p', '인쇄', 'Control+KeyP', { prepare: onImage, expect: ['printed', 'dialogs', 'pages', 'frames'], wait: 3000, after: async () => { await closeExtraPages(); await esc(); } });
await test('P7', SP, 'Alt + g 다음 k', '마지막 메시지 표시', seq('g', 'k'), { prepare: async () => { await onImage(); await page.keyboard.press('Control+Alt+KeyL'); await page.waitForTimeout(2500); }, expect: ['alerts', 'active', 'dialogs'] });
await test('P8', SP, '/', 'Drive 검색', 'Slash', { prepare: into, expect: ['active'], after: esc });

// ---------------------------------------------------------------- 미리보기 모드
const SV = '미리보기 모드 작업';
const previewing = async () => { await onImage(); await page.keyboard.press('Control+Alt+KeyP'); await page.waitForTimeout(3000); };
await test('V1', SV, 'Ctrl + Alt + p', '항목 미리보기', 'Control+Alt+KeyP', { prepare: onImage, expect: ['viewer', 'dialogs'], wait: 3000 });
await test('V4', SV, '+', '확대', 'Shift+Equal', { expect: ['viewer', 'zoom'] });
await test('V4', SV, '=', '확대', 'Equal', { expect: ['viewer', 'zoom'] });
await test('V5', SV, '-', '축소', 'Minus', { expect: ['viewer', 'zoom'] });
skip('V3', SV, '스페이스바', '재생/일시중지', '동영상이 있어야 해서 점검하지 않음');
await test('V2', SV, 'esc', '닫기', 'Escape', { prepare: async () => { if (!(await state()).viewer) await previewing(); }, expect: ['viewer', 'dialogs'] });

// ---------------------------------------------------------------- 정리 기록
await toList();
extra.layoutAtEnd = await layout();
await home();
await go(FOLDER);
extra.itemsAtEnd = await page.evaluate(() => [...document.querySelectorAll('[role="row"][data-id]')].map((r) => r.innerText.split('\n')[0]));
console.log('items at the end:', extra.itemsAtEnd);
console.log('the test folder goes to the trash with: node cleanup.mjs --keep-login');
save();
await context.close();
