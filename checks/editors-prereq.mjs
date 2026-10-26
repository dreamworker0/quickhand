// Which Docs, Sheets and Slides keys need a selection first? Keys that act on a selection
// are pressed in each state below and the page is compared before and after (toolbar,
// dialogs, panels, the clipboard, the file's content, in Sheets the name box and the
// cell being edited, in Slides the boxes on the slide).
//   Docs:   커서만(안 고름) · 글자 고름
//   Sheets: 셀 하나 · 범위 · 셀 편집 중
//   Slides: 슬라이드 목록 · 캔버스(개체 안 고름) · 개체 1개 · 개체 2개
// The first key, Shift alone, does nothing: whatever it shows is measuring noise.
// A key that changes nothing in some state needs something done first; Quickhand should
// count it only where the editor reacted.
//
// Only new files named "손빠르미 단축키 점검 문서 (지워도 됨)" are edited;
// `node cleanup.mjs --keep-login` moves them to the trash afterwards.
// --docs, --sheets, --slides pick parts (default: all).
// Results: results/editors-prereq[-parts].json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch, RESULTS } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const only = ['docs', 'sheets', 'slides'].filter((s) => process.argv.includes('--' + s));
const OUT = path.join(RESULTS, `editors-prereq${only.length ? '-' + only.join('-') : ''}.json`);
const want = (s) => !only.length || only.includes(s);

const CONTROL = ['(Shift만, 대조용)', 'Shift', '아무 일도 없어야 함'];
const DOCS_KEYS = [
  CONTROL,
  ['Ctrl+C', 'Control+KeyC', '복사'],
  ['Ctrl+X', 'Control+KeyX', '잘라내기'],
  ['Ctrl+B', 'Control+KeyB', '굵게'],
  ['Ctrl+I', 'Control+KeyI', '기울임'],
  ['Ctrl+U', 'Control+KeyU', '밑줄'],
  ['Alt+Shift+5', 'Alt+Shift+Digit5', '취소선'],
  ['Ctrl+.', 'Control+Period', '위 첨자'],
  ['Ctrl+,', 'Control+Comma', '아래 첨자'],
  ['Ctrl+\\', 'Control+Backslash', '서식 지우기'],
  ['Ctrl+Shift+.', 'Control+Shift+Period', '글꼴 크게'],
  ['Ctrl+Shift+,', 'Control+Shift+Comma', '글꼴 작게'],
  ['Ctrl+Alt+C', 'Control+Alt+KeyC', '서식 복사'],
  ['Ctrl+Alt+2', 'Control+Alt+Digit2', '제목 2 스타일'],
  ['Ctrl+Shift+E', 'Control+Shift+KeyE', '가운데 정렬'],
  ['Ctrl+]', 'Control+BracketRight', '들여쓰기'],
  ['Ctrl+Shift+7', 'Control+Shift+Digit7', '번호 목록'],
  ['Ctrl+Shift+8', 'Control+Shift+Digit8', '글머리 기호'],
  ['Ctrl+K', 'Control+KeyK', '링크'],
  ['Ctrl+Alt+M', 'Control+Alt+KeyM', '댓글'],
  ['Ctrl+Shift+Y', 'Control+Shift+KeyY', '사전'],
  ['Ctrl+Alt+F', 'Control+Alt+KeyF', '각주'],
  ['Ctrl+Shift+C', 'Control+Shift+KeyC', '글자 수'],
];
const SHEETS_KEYS = [
  CONTROL,
  ['Ctrl+C', 'Control+KeyC', '복사'],
  ['Ctrl+X', 'Control+KeyX', '잘라내기'],
  ['Delete', 'Delete', '내용 지우기'],
  ['Ctrl+B', 'Control+KeyB', '굵게'],
  ['Ctrl+I', 'Control+KeyI', '기울임'],
  ['Alt+Shift+5', 'Alt+Shift+Digit5', '취소선'],
  ['Ctrl+\\', 'Control+Backslash', '서식 지우기'],
  ['Ctrl+Shift+E', 'Control+Shift+KeyE', '가운데 정렬'],
  ['Ctrl+Shift+4', 'Control+Shift+Digit4', '통화 서식'],
  ['Ctrl+D', 'Control+KeyD', '아래로 채우기'],
  ['Ctrl+R', 'Control+KeyR', '오른쪽으로 채우기'],
  ['Ctrl+Enter', 'Control+Enter', '범위 채우기'],
  ['Ctrl+;', 'Control+Semicolon', '날짜 넣기'],
  ['Ctrl+K', 'Control+KeyK', '링크'],
  ['Ctrl+Alt+M', 'Control+Alt+KeyM', '댓글'],
  ['Shift+F2', 'Shift+F2', '메모'],
  ['Ctrl+Alt+=', 'Control+Alt+Equal', '셀·행 넣기'],
  ['Ctrl+Alt+-', 'Control+Alt+Minus', '셀·행 지우기'],
  ['Ctrl+Space', 'Control+Space', '열 선택'],
  ['Shift+Space', 'Shift+Space', '행 선택'],
  ['Ctrl+A', 'Control+KeyA', '모두 선택'],
  ['F4', 'F4', '절대 참조 바꾸기'],
];
const SLIDES_KEYS = [
  ['Ctrl+C', 'Control+KeyC', '복사'],
  ['Ctrl+X', 'Control+KeyX', '잘라내기'],
  ['Ctrl+D', 'Control+KeyD', '복제'],
  ['Delete', 'Delete', '삭제'],
  ['Ctrl+Alt+G', 'Control+Alt+KeyG', '그룹화'],
  ['Ctrl+Alt+Shift+G', 'Control+Alt+Shift+KeyG', '그룹 해제'],
  ['Ctrl+↓', 'Control+ArrowDown', '뒤로 보내기'],
  ['Ctrl+Shift+↑', 'Control+Shift+ArrowUp', '맨 앞으로'],
  ['→', 'ArrowRight', '개체 조금 옮기기'],
  ['Ctrl+B', 'Control+KeyB', '굵게'],
  ['Ctrl+K', 'Control+KeyK', '링크'],
  ['Ctrl+Alt+M', 'Control+Alt+KeyM', '댓글'],
];

const { context, worker } = await launch({ headless: false });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.google.com' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
await page.setViewportSize({ width: 1600, height: 950 });
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(400); };
const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
async function closeExtraPages() { for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {}); }

const state = () => page.evaluate(() => {
  const vis = (e) => !!(e && e.getClientRects().length);
  const a = document.activeElement;
  const boxes = [...document.querySelectorAll('g[id^="editor-"]')].filter((g) => !/-bg$|-paragraph-/.test(g.id))
    .map((g) => g.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  return {
    pressed: [...document.querySelectorAll('#docs-toolbar [aria-pressed="true"], .docs-toolbar [aria-pressed="true"]')].map((e) => e.id).join(','),
    size: (document.querySelector('.docs-font-size-inputbox-input, #fontSizeSelect input') || {}).value || '',
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal-dialog')].filter(vis).map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').slice(0, 25)).join(' | '),
    bubbles: [...document.querySelectorAll('.docs-linkbubble-bubble, .docs-link-insertlinkbubble, .docos-anchoreddocoview-input-pane, .docos-input-textarea, .docs-bubble')].filter(vis).length,
    panels: [...document.querySelectorAll('[role="complementary"], .docs-dictionary-container, .docs-companion-app-container')].filter(vis).map((p) => (p.getAttribute('aria-label') || p.className.split(' ')[0] || '').slice(0, 25)).join(' | '),
    menus: [...document.querySelectorAll('.goog-menu, [role="menu"]')].filter(vis).length,
    slides: document.querySelectorAll('.punch-filmstrip-thumbnail').length,
    boxes: boxes.map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}`).sort().join(' '),
    groups: document.querySelectorAll('g[id^="editor-"] g[id^="editor-"]').length,
    nameBox: (document.querySelector('#t-name-box') || {}).value || '',
    editing: (() => { const c = [...document.querySelectorAll('.cell-input')].find(vis); return c ? (c.textContent || '').slice(0, 30) + '|' + c.innerHTML.length : ''; })(),
  };
}).catch(() => ({ error: 'no page' }));
const clip = () => page.evaluate(() => Promise.race([navigator.clipboard.readText().catch(() => ''), new Promise((r) => setTimeout(() => r('(읽지 못함)'), 1000))])).catch(() => '');
let fileUrl = '';
let exportPath = '';
async function content() {
  await page.waitForTimeout(2500);
  const res = await page.request.get(fileUrl.replace(/\/edit.*$/, exportPath));
  const text = (await res.text()).replace(/<head[\s\S]*?<\/head>|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '');
  return crypto.createHash('md5').update(text).digest('hex').slice(0, 8);
}
function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${JSON.stringify(b[k]).slice(0, 40)} → ${JSON.stringify(a[k]).slice(0, 40)}`);
  return out;
}
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).filter((l) => l.at >= t && l.input === 'key').pop();
    return e ? e.id : null;
  }, since);
}
async function newFile(url, ready) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(ready, { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(6000);
  if (!(await page.locator('.docs-title-input').isVisible())) { await page.keyboard.press('Control+Shift+KeyF'); await page.waitForTimeout(1500); }
  fileUrl = page.url();
  await page.locator('.docs-title-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(TITLE);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
}
function guard() {
  if (!page.url().startsWith(fileUrl.replace(/\/edit.*$/, ''))) throw new Error('시험 파일 밖이라 멈춤: ' + page.url());
}

// One key in one state: the clipboard is cleared first so a copy shows; the file's text is
// compared too. Changes are undone (Ctrl+Z) until the file's text is back.
// Sheets and Slides sometimes lose the connection and ask to reload; reload and carry on.
async function recover() {
  const box = page.getByRole('button', { name: '새로고침', exact: true }).filter({ visible: true });
  if (!(await box.count().catch(() => 0))) return;
  console.log('save error; reloading');
  await box.first().click().catch(() => {});
  await page.waitForSelector('.docs-title-input', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(5000);
}
async function measure(key, prepare) {
  await closeExtraPages();
  await recover();
  await page.evaluate(() => navigator.clipboard.writeText('(비움)').catch(() => {}));
  await prepare();
  guard();
  const before = { ...(await state()), clip: await clip() };
  const textBefore = await content();
  const since = Date.now();
  await page.keyboard.press(key);
  await page.waitForTimeout(1800);
  const after = { ...(await state()), clip: await clip() };
  const textAfter = await content();
  const quickhand = await quickhandSaw(since);
  const changed = diff(before, after);
  if (textAfter !== textBefore) changed.push('파일 내용 바뀜');
  await esc(); await esc();
  for (let i = 0; i < 4 && (await content()) !== textBefore; i++) { await page.keyboard.press('Control+KeyZ'); await page.waitForTimeout(800); }
  return { reacted: changed.length > 0, changed, quickhand };
}

const results = { docs: [], sheets: [], slides: [] };
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
async function survey(site, keys, states) {
  for (const [shown, key, what] of keys) {
    const row = { key: shown, action: what, states: {} };
    for (const [name, prepare] of Object.entries(states)) {
      let cell;
      try { cell = await measure(key, prepare); } catch (e) { cell = { reacted: null, changed: [], quickhand: null, error: e.message.split('\n')[0] }; }
      row.states[name] = cell;
      console.log(site, shown, '|', name, '|', JSON.stringify(cell));
    }
    results[site].push(row);
    save();
  }
}

// ---------------------------------------------------------------- Docs
if (want('docs')) {
  exportPath = '/mobilebasic';
  await newFile('https://docs.new', '#boldButton');
  console.log('test document:', fileUrl);
  await page.locator('.kix-appview-editor').click();
  await page.keyboard.type('Quickhand check line one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second line here');
  await page.waitForTimeout(1500);
  // The caret at the end of line 1, nothing selected; or the last word of line 1 selected.
  const caret = async () => { await esc(); await page.keyboard.press('Control+Home'); await page.keyboard.press('End'); await page.waitForTimeout(400); };
  const word = async () => { await caret(); await page.keyboard.press('Control+Shift+ArrowLeft'); await page.waitForTimeout(400); };
  await survey('docs', DOCS_KEYS, { '커서만(안 고름)': caret, '글자 고름': word });
}

// ---------------------------------------------------------------- Sheets
if (want('sheets')) {
  exportPath = '/export?format=csv';
  await newFile('https://sheets.new', '#t-name-box');
  console.log('test spreadsheet:', fileUrl);
  const go = async (ref) => {
    await esc();
    const box = page.locator('#t-name-box');
    await box.click();
    await box.fill(ref);
    await box.press('Enter');
    await page.waitForTimeout(500);
  };
  // A 4 x 5 block of words and numbers, so fills, deletes and formats have something to act on.
  for (let r = 1; r <= 5; r++) {
    await go('A' + r);
    for (let c = 1; c <= 4; c++) {
      await page.keyboard.type(c === 1 ? 'item' + r : String(r * 10 + c));
      await page.keyboard.press(c < 4 ? 'Tab' : 'Enter');
    }
  }
  await page.waitForTimeout(1500);
  const one = () => go('B2');
  const range = () => go('B2:C4');
  // F2 on a number cell: the caret at the end of its text, nothing selected in it.
  const editing = async () => { await go('B3'); await page.keyboard.press('F2'); await page.waitForTimeout(600); };
  await survey('sheets', SHEETS_KEYS, { '셀 하나': one, '범위': range, '셀 편집 중': editing });
}

// ---------------------------------------------------------------- Slides
if (want('slides')) {
  exportPath = '/export/txt';
  await newFile('https://slides.new', '.docs-title-input');
  console.log('test presentation:', fileUrl);
  const box = async (nth) => page.evaluate((nth) => {
    const boxes = [...document.querySelectorAll('g[id^="editor-"]')].filter((g) => !/-bg$|-paragraph-/.test(g.id))
      .map((g) => ({ g, r: g.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0);
    const whole = boxes.reduce((a, b) => (b.r.width * b.r.height > a.r.width * a.r.height ? b : a));
    const parts = boxes.filter((b) => b !== whole).sort((a, b) => a.r.y - b.r.y);
    const b = parts[nth];
    return b ? { x: b.r.x + b.r.width / 2, y: b.r.y + b.r.height / 2 } : { x: whole.r.x + 20, y: whole.r.y + 20, empty: true };
  }, nth);
  const thumbs = () => page.locator('.punch-filmstrip-thumbnail').filter({ visible: true });
  const firstThumb = async () => { await esc(); await esc(); await thumbs().first().click(); await page.waitForTimeout(500); };
  const canvasText = () => page.evaluate(() => [...document.querySelectorAll('g[id^="editor-"]')].map((g) => g.textContent).join(' '));
  // Text in both boxes (the title and the subtitle), so they are real objects.
  async function fill() {
    for (const [nth, text] of [[0, 'Quickhand title'], [1, 'Quickhand subtitle']]) {
      await firstThumb();
      const at = await box(nth);
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(500);
      await page.keyboard.press('Control+KeyA');
      await page.keyboard.type(text);
      await esc(); await esc();
    }
  }
  // One slide with the two filled boxes, as at the start; a key that cut, deleted,
  // grouped or moved something (and was not undone) gets a fresh slide instead.
  let baseline = null;
  const now = async () => { const s = await state(); return `${s.slides}|${s.boxes}|${s.groups}|${/Quickhand title/.test(await canvasText()) && /Quickhand subtitle/.test(await canvasText())}`; };
  async function rebuild() {
    console.log('slide changed; making a fresh one');
    await esc(); await esc();
    if (!(await thumbs().count())) {
      await page.getByText(/클릭하여 새 슬라이드 추가|Click to add slide/).first().click();
      await page.waitForTimeout(2000);
    } else {
      await firstThumb();
      await page.keyboard.press('Control+KeyM');
      await page.waitForTimeout(2000);
      while ((await thumbs().count()) > 1) {
        await thumbs().first().click();
        await page.waitForTimeout(400);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(1200);
      }
    }
    await fill();
    baseline = await now();
  }
  const thumb = async () => {
    if ((await now()) !== baseline) await rebuild();
    await firstThumb();
  };
  await fill();
  baseline = await now();
  console.log('slide baseline:', baseline);
  const canvas = async () => { await thumb(); const at = await box(5); await page.mouse.click(at.x, at.y); await page.waitForTimeout(500); };
  const one = async () => { await thumb(); const at = await box(0); await page.mouse.click(at.x, at.y); await page.waitForTimeout(400); await esc(); await page.waitForTimeout(400); };
  const two = async () => {
    await one();
    const at = await box(1);
    await page.keyboard.down('Shift'); await page.mouse.click(at.x, at.y); await page.keyboard.up('Shift');
    await page.waitForTimeout(500);
  };
  await survey('slides', SLIDES_KEYS, { '슬라이드 목록': thumb, '캔버스(개체 안 고름)': canvas, '개체 1개': one, '개체 2개': two });
}

save();
const mark = (c) => (c.error ? '오류' : c.reacted ? (c.quickhand ? 'O·셈' : 'O·안 셈') : (c.quickhand ? 'X·셈!' : 'X'));
for (const site of ['docs', 'sheets', 'slides']) {
  if (!results[site].length) continue;
  console.log(`\n[${site}] 키 | 동작 | ` + Object.keys(results[site][0].states).join(' | '));
  for (const r of results[site]) console.log(`${r.key} | ${r.action} | ` + Object.values(r.states).map(mark).join(' | '));
}
console.log('the test files go to the trash with: node cleanup.mjs --keep-login');
await context.close();
