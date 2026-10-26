// Which Drive keys need an item selected first? Every key on Drive's help page that
// acts on items is pressed in three states and the page is compared before and after:
//   새로 연 폴더     the test folder just opened, nothing selected or focused
//   항목 클릭        one picture clicked (selected)
//   클릭 뒤 Esc      a picture clicked, then Esc (focus stays, selection gone)
// A key that changes the page only in some states needs those first; Quickhand should
// count it in exactly the states where Drive reacted.
//
// Only a test folder named "손빠르미 단축키 점검 문서 (지워도 됨)" in My Drive and the
// pictures uploaded into it are touched: keys run only while that folder is open.
// Windows that open are closed without changes, removed items come back with Ctrl+Z,
// and `node cleanup.mjs --keep-login` moves the folder to the trash afterwards.
// Results: results/drive-prereq.json and a table in the console.
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const ICONS = path.join(RESULTS, '..', '..', 'extension', 'assets', 'icons');
const IMAGES = ['icon-32.png', 'icon-128.png'].map((f) => path.join(ICONS, f));
const ITEM = '[role="row"][data-id], [role="gridcell"][data-id]';
const PICTURE = 'icon-128.png';
const OUT = path.join(RESULTS, 'drive-prereq.json');

// [key shown, keys pressed in turn, what Drive's help page says it does]
const KEYS = [
  ['Enter', ['Enter'], '선택한 항목 열기'],
  ['Ctrl+Enter', ['Control+Enter'], '새 탭에서 열기'],
  ['F2', ['F2'], '이름 바꾸기'],
  ['Ctrl+Alt+E', ['Control+Alt+KeyE'], '이름 바꾸기'],
  ['Ctrl+Alt+A', ['Control+Alt+KeyA'], '공유'],
  ['Ctrl+Alt+M', ['Control+Alt+KeyM'], '이동'],
  ['Ctrl+Alt+S', ['Control+Alt+KeyS'], '별표(중요 문서함)'],
  ['Ctrl+Alt+R', ['Control+Alt+KeyR'], '바로가기 만들기'],
  ['Delete', ['Delete'], '삭제(휴지통으로)'],
  ['#', ['Shift+Digit3'], '삭제(휴지통으로)'],
  ['Ctrl+Alt+L', ['Control+Alt+KeyL'], '링크 복사'],
  ['Ctrl+Shift+C', ['Control+Shift+KeyC'], '제목 복사'],
  ['Ctrl+X', ['Control+KeyX'], '잘라내기'],
  ['Ctrl+C', ['Control+KeyC'], '복사'],
  ['Ctrl+Alt+P', ['Control+Alt+KeyP'], '미리보기'],
  ['Shift+F10', ['Shift+F10'], '추가 작업 메뉴'],
  ['Alt+A', ['Alt+KeyA'], '추가 작업 메뉴'],
  ['Alt+V 다음 D', ['Alt+KeyV', 'KeyD'], '세부정보 창'],
  ['Shift+Space', ['Shift+Space'], '항목 선택/해제'],
  ['↓', ['ArrowDown'], '다음 항목 선택'],
  ['Shift+↓', ['Shift+ArrowDown'], '선택 영역 넓히기'],
  ['Ctrl+A', ['Control+KeyA'], '모두 선택'],
  ['Esc', ['Escape'], '선택 해제'],
];

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(15000);
await page.setViewportSize({ width: 1500, height: 900 });
page.on('dialog', (d) => d.dismiss().catch(() => {}));
let upload = null;
page.on('filechooser', (fc) => { const files = upload || []; upload = null; fc.setFiles(files).catch(() => {}); });

const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const item = (name) => visible(ITEM, { hasText: name });
async function closeExtraPages() {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
}
async function go(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await visible('[role="main"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3500);
}
let FOLDER = '';
function guard() {
  if (!page.url().startsWith(FOLDER)) throw new Error('점검 폴더 밖이라 멈춤: ' + page.url());
}

const state = () => page.evaluate(() => {
  const vis = (e) => !!(e && e.getClientRects().length);
  const a = document.activeElement;
  const rows = [...document.querySelectorAll('[role="row"][data-id], [role="gridcell"][data-id]')].filter(vis);
  const name = (r) => r.innerText.split('\n')[0];
  return {
    url: location.pathname,
    rows: rows.map(name).join(', '),
    selected: rows.filter((r) => r.getAttribute('aria-selected') === 'true').map(name).join(', '),
    focusRow: name(rows.find((r) => r.contains(a)) || { innerText: '' }),
    starred: rows.filter((r) => /별표|중요 문서함|Starred/.test(r.innerHTML)).length,
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((d) => vis(d) && d.innerText.trim() && !/업로드 완료|upload complete/i.test(d.innerText))
      .map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0]).slice(0, 25)).join(' | '),
    menus: [...document.querySelectorAll('[role="menu"]')].filter(vis).length,
    panes: [...document.querySelectorAll('[role="complementary"], aside')].filter(vis).map((p) => (p.getAttribute('aria-label') || '').slice(0, 20)).filter(Boolean).join(' | '),
    alerts: [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"]')].map((e) => e.innerText.trim()).filter(Boolean).join(' / ').slice(0, 60),
    frames: [...document.querySelectorAll('iframe')].filter(vis).length,
  };
});
// Focus moves and the polite live region repeat what is focused; neither is an action.
const IGNORE = ['focusRow'];
function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) if (!IGNORE.includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${JSON.stringify(b[k]).slice(0, 40)} → ${JSON.stringify(a[k]).slice(0, 40)}`);
  return out;
}
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}

// ---------------------------------------------------------------- the test folder
await page.goto('https://drive.google.com/drive/my-drive', { waitUntil: 'domcontentloaded', timeout: 60000 });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN: run `node login.mjs`, sign in, close the window, then run this again.');
  await context.close();
  process.exit(1);
}
await go('https://drive.google.com/drive/my-drive');
// The list layout has rows, the grid layout cells; either may be on.
const idsBefore = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((r) => r.getAttribute('data-id')), ITEM);
const newButton = visible('button, [role="button"]', { hasText: /^\s*(신규|새로 만들기|New)\s*$/ });
await newButton.click();
await page.waitForTimeout(800);
await visible('[role="menuitem"]', { hasText: /새 폴더|New folder/ }).click();
// The name box can take a while to come up ("실행 중…"); type only once it is there.
const nameInput = visible('[role="dialog"] input');
await nameInput.waitFor({ timeout: 30000 });
await nameInput.fill(TITLE);
await nameInput.press('Enter');
let folderId = null;
for (let i = 0; i < 15 && !folderId; i++) {
  await page.waitForTimeout(1000);
  folderId = await page.evaluate(([t, before, sel]) => {
    const r = [...document.querySelectorAll(sel)].find((x) => x.innerText.includes(t) && !before.includes(x.getAttribute('data-id')));
    return r ? r.getAttribute('data-id') : null;
  }, [TITLE, idsBefore, ITEM]);
}
if (!folderId) {
  await page.screenshot({ path: path.join(RESULTS, 'drive-prereq-no-folder.png') });
  throw new Error('test folder was not made (see results/drive-prereq-no-folder.png)');
}
FOLDER = 'https://drive.google.com/drive/folders/' + folderId;
console.log('test folder:', FOLDER);
await go(FOLDER);
upload = IMAGES;
await page.locator('[role="main"]').first().click({ position: { x: 600, y: 600 } }).catch(() => {});
await page.keyboard.press('Alt+KeyC');
await page.keyboard.press('KeyU');
await page.waitForTimeout(8000);

// ---------------------------------------------------------------- the states
async function fresh() {
  await closeExtraPages();
  await go(FOLDER);
  guard();
  for (let i = 0; i < 10 && (await page.locator(ITEM).filter({ visible: true }).count()) < 2; i++) await go(FOLDER);
}
const STATES = {
  '새로 연 폴더': fresh,
  '항목 클릭': async () => { await fresh(); await item(PICTURE).click(); await page.waitForTimeout(700); },
  '클릭 뒤 Esc': async () => { await fresh(); await item(PICTURE).click(); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(500); },
};

// ---------------------------------------------------------------- the survey
const results = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify({ folder: FOLDER, results }, null, 2));
for (const [shown, keys, what] of KEYS) {
  const row = { key: shown, action: what, states: {} };
  for (const [name, prepare] of Object.entries(STATES)) {
    let cell;
    try {
      await prepare();
      const before = await state();
      const since = Date.now();
      for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(250); }
      await page.waitForTimeout(2200);
      const after = await state();
      const pages = context.pages().filter((p) => p !== page && !p.url().startsWith('chrome-extension://')).length;
      const quickhand = await quickhandSaw(since);
      const changed = diff(before, after);
      if (pages) changed.push(`새 탭 ${pages}개`);
      cell = { drive: changed.length > 0, changed, quickhand };
      // Removed pictures come back; the next state reopens the folder anyway.
      if (after.rows.split(', ').length < before.rows.split(', ').length && after.url === before.url) {
        await page.keyboard.press('Control+KeyZ');
        await page.waitForTimeout(3000);
      }
      if (/Alt\+KeyS/.test(keys.join()) && after.starred !== before.starred) await page.keyboard.press('Control+Alt+KeyS');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
    } catch (e) {
      cell = { drive: null, changed: [], quickhand: null, error: e.message.split('\n')[0] };
    }
    row.states[name] = cell;
    console.log(shown, '|', name, '|', JSON.stringify(cell));
  }
  results.push(row);
  save();
}
await fresh();
console.log('items at the end:', (await state()).rows);
console.log('the test folder goes to the trash with: node cleanup.mjs --keep-login');

const mark = (c) => (c.error ? '오류' : c.drive ? (c.quickhand ? 'O·셈' : 'O·안 셈') : (c.quickhand ? 'X·셈!' : 'X'));
console.log('\n키 | 동작 | ' + Object.keys(STATES).join(' | '));
for (const r of results) console.log(`${r.key} | ${r.action} | ` + Object.values(r.states).map(mark).join(' | '));
await context.close();
