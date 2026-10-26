// Everyday Sheets flows, not just the help page's keys: selecting with the mouse
// (cell drags, Shift+click, header clicks and drags, the corner button, the fill handle, resizing) and
// with the keyboard (Shift/Ctrl+Shift+arrows in every direction, turning back,
// Ctrl+Space or Shift+Space then widening, Shift+← while editing a cell). Each step
// records what Sheets did (the name box) and what Quickhand made of it, against
// what it should. Run after changing how Sheets actions are recognized.
//
// Only a new spreadsheet named "손빠르미 단축키 점검 문서 (지워도 됨)" is edited;
// `node cleanup.mjs --keep-login` moves it to the trash afterwards.
// Results: results/sheets-scenarios.json and a table in the console.
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const OUT = path.join(RESULTS, 'sheets-scenarios.json');
const RANGE = 'sheets:range';
const COLUMN = 'sheets:mod+space';
const COLUMNS = 'sheets:mod+space>shift+arrowright';
const ROW = 'sheets:shift+space';
const ROWS = 'sheets:shift+space>shift+arrowdown';

const { context, worker } = await launch({ headless: false });
// A fresh record, so what an earlier check pressed (Ctrl+B …) doesn't make a shortcut "known".
await worker.evaluate(() => chrome.storage.local.remove('qh_state'));
const page = await context.newPage();
page.setDefaultTimeout(15000);
await page.setViewportSize({ width: 1600, height: 900 });

const nameBox = () => page.locator('#t-name-box').inputValue().catch(() => '');
// Sheets sometimes loses its connection and asks to reload ("오류 발생 … 새로고침");
// reload and carry on.
async function recover() {
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: '오류 발생', visible: true });
  if (!(await dialog.count())) return;
  const reload = dialog.first().getByRole('button', { name: '새로고침' });
  console.log('Sheets asked to reload; reloading');
  await reload.first().click().catch(() => {});
  await page.waitForSelector('#t-name-box', { timeout: 60000 });
  await page.waitForTimeout(5000);
}
async function go(ref) {
  await recover();
  const box = page.locator('#t-name-box');
  await box.click();
  await box.fill(ref);
  await box.press('Enter');
  await page.waitForTimeout(400);
}

// Where cells and headers are: default columns are 100 px wide and rows 21 px tall,
// measured from the header strips (checked against the name box below).
async function measure() {
  return page.evaluate(() => {
    const pick = (sel, key) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height).sort((a, b) => b[key] - a[key])[0];
    const col = pick('.column-headers-background', 'width');
    const row = pick('.row-headers-background', 'height');
    return { left: row.right, top: col.bottom, colMid: (col.top + col.bottom) / 2, rowMid: (row.left + row.right) / 2 };
  });
}
let g;
const colIndex = (letter) => letter.charCodeAt(0) - 64;
const cell = (ref) => {
  const m = /^([A-Z])(\d+)$/.exec(ref);
  return { x: g.left + (colIndex(m[1]) - 0.5) * 100, y: g.top + (Number(m[2]) - 0.5) * 21 };
};
const colHeader = (letter) => ({ x: g.left + (colIndex(letter) - 0.5) * 100, y: g.colMid });
const rowHeader = (n) => ({ x: g.rowMid, y: g.top + (n - 0.5) * 21 });

async function drag(from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
async function shiftClick(at) {
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
}
const press = (...keys) => async () => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(350); } };

// ---------------------------------------------------------------- the test file
await page.goto('https://sheets.new', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#t-name-box', { timeout: 60000 });
await page.waitForTimeout(4000);
console.log('test file:', page.url());
await page.locator('.docs-title-input').click();
await page.keyboard.press('Control+A');
await page.keyboard.type(TITLE);
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
// A 4 x 10 block of numbers, so Ctrl+Shift+arrow has a data edge to stop at. Each
// row starts from the name box: Enter after Tab does not always return to column A.
for (let r = 1; r <= 10; r++) {
  await go('A' + r);
  for (let c = 1; c <= 4; c++) { await page.keyboard.type(String(r * 10 + c)); await page.keyboard.press(c < 4 ? 'Tab' : 'Enter'); }
}
await page.waitForTimeout(800);
// Typing may leave the view scrolled sideways; going to A1 brings the left edge back.
await go('A1');
await page.waitForTimeout(800);
g = await measure();
await page.mouse.click(cell('C5').x, cell('C5').y);
await page.waitForTimeout(400);
const calibration = await nameBox();
console.log('grid', JSON.stringify(g), 'click on C5 selects', calibration);
if (calibration !== 'C5') {
  console.log('cell positions are off; stopping');
  await context.close();
  process.exit(1);
}

// ---------------------------------------------------------------- the flows
// [name, start cell (selected through the name box) or null to keep, step, expected id or null]
const FLOWS = [
  ['마우스: 셀을 가로로 끌기 B3→E3', 'A12', () => drag(cell('B3'), cell('E3')), RANGE],
  ['마우스: 셀을 세로로 끌기 C3→C9', 'A12', () => drag(cell('C3'), cell('C9')), RANGE],
  ['마우스: 셀을 위로 끌기 C9→C3', 'A12', () => drag(cell('C9'), cell('C3')), RANGE],
  ['마우스: B3 클릭 뒤 E8 Shift+클릭', 'A12', async () => { await page.mouse.click(cell('B3').x, cell('B3').y); await page.waitForTimeout(300); await shiftClick(cell('E8')); }, RANGE],
  ['마우스: 셀 하나 클릭 D5', 'A12', () => page.mouse.click(cell('D5').x, cell('D5').y), null],
  ['마우스: 채우기 핸들 끌기 B2→B6', 'B2', async () => {
    const b2 = cell('B2');
    await drag({ x: b2.x + 49, y: b2.y + 9.5 }, cell('B6'));
  }, null],
  ['마우스: 열 머리글 클릭 D', 'A12', () => page.mouse.click(colHeader('D').x, colHeader('D').y), COLUMN],
  ['마우스: 열 머리글 끌기 C→F', 'A12', () => drag(colHeader('C'), colHeader('F')), COLUMNS],
  ['마우스: 열 머리글 C 클릭 뒤 F Shift+클릭', 'A12', async () => { await page.mouse.click(colHeader('C').x, colHeader('C').y); await page.waitForTimeout(300); await shiftClick(colHeader('F')); }, COLUMNS],
  ['마우스: 행 번호 끌기 3→7', 'A12', () => drag(rowHeader(3), rowHeader(7)), ROWS],
  ['마우스: 왼쪽 위 구석 버튼(모두 선택)', 'A12', () => page.mouse.click(g.rowMid, g.colMid), 'sheets:mod+a'],
  ['키보드: Ctrl+A', 'B3', press('Control+KeyA'), 'sheets:mod+a'],
  ['마우스: 열 너비 조절 C|D 경계', 'A12', () => drag({ x: g.left + 300, y: g.colMid }, { x: g.left + 330, y: g.colMid }), null],
  ['키보드: Shift+→', 'B3', press('Shift+ArrowRight'), RANGE],
  ['키보드: 같은 범위에서 Shift+→ 한 번 더', null, press('Shift+ArrowRight'), null],
  ['키보드: Shift+← 두 번(셀 하나로 돌아감)', null, press('Shift+ArrowLeft', 'Shift+ArrowLeft'), null],
  ['키보드: 이어서 Shift+← (왼쪽으로 새 범위)', null, press('Shift+ArrowLeft'), RANGE],
  ['키보드: Shift+↑', 'B5', press('Shift+ArrowUp'), RANGE],
  ['키보드: Shift+↓', 'B5', press('Shift+ArrowDown'), RANGE],
  ['키보드: Ctrl+Shift+↓', 'B3', press('Control+Shift+ArrowDown'), RANGE],
  ['키보드: 같은 범위에서 Ctrl+Shift+→', null, press('Control+Shift+ArrowRight'), null],
  ['키보드: Shift+→ 뒤 Ctrl+Shift+↓', 'B3', press('Shift+ArrowRight', 'Control+Shift+ArrowDown'), RANGE],
  ['키보드: Ctrl+Shift+←', 'D5', press('Control+Shift+ArrowLeft'), RANGE],
  ['키보드: Shift+End (시트는 범위를 넓히지 않음)', 'B5', press('Shift+End'), null],
  ['키보드: Shift+Home (시트는 범위를 넓히지 않음)', 'C5', press('Shift+Home'), null],
  ['키보드: Ctrl+Shift+End (시트는 범위를 넓히지 않음)', 'B3', press('Control+Shift+End'), null],
  ['키보드: Ctrl+Shift+Home (시트는 범위를 넓히지 않음)', 'C5', press('Control+Shift+Home'), null],
  ['키보드: Shift+PageDown (한 화면 아래로)', 'B3', press('Shift+PageDown'), RANGE],
  ['키보드: Shift+PageUp (한 화면 위로)', 'B40', press('Shift+PageUp'), RANGE],
  ['키보드: Ctrl+Space', 'C3', press('Control+Space'), COLUMN],
  ['키보드: 이어서 Shift+→ (여러 열)', null, press('Shift+ArrowRight'), COLUMNS],
  ['키보드: Ctrl+Space 다시', 'C3', press('Control+Space'), COLUMN],
  ['키보드: 이어서 Ctrl+Shift+→ (끝까지 여러 열)', null, press('Control+Shift+ArrowRight'), COLUMNS],
  ['키보드: Shift+Space', 'C3', press('Shift+Space'), ROW],
  ['키보드: 이어서 Shift+↓ (여러 행)', null, press('Shift+ArrowDown'), ROWS],
  ['키보드: Shift+Space 다시', 'C3', press('Shift+Space'), ROW],
  ['키보드: 이어서 Ctrl+Shift+↓ (끝까지 여러 행)', null, press('Control+Shift+ArrowDown'), ROWS],
  // Typing straight into a cell (entry mode): arrows end the entry, so Shift+← widens the range.
  ['키보드: 셀에 바로 입력하다 Shift+←', 'B12', async () => { await page.keyboard.type('abc'); await page.waitForTimeout(300); await page.keyboard.press('Shift+ArrowLeft'); }, RANGE],
  // Editing a cell (F2): Shift+← selects letters; the name box stays one cell.
  ['키보드: F2로 셀 편집 시작', 'B13', async () => { await page.keyboard.press('F2'); await page.keyboard.type('abc'); }, 'sheets:f2'],
  ['키보드: 셀 편집(F2) 중 Shift+←', null, press('Shift+ArrowLeft'), null],
];

const results = [];
for (const [name, start, step, expected] of FLOWS) {
  if (start) {
    await page.keyboard.press('Escape');
    await go(start);
  }
  const r = await check(page, worker, name, step, { wait: 1300 });
  // The last thing Quickhand recorded for this step: keyboard use is logged too.
  const box = await nameBox();
  const ok = r.recognized === expected;
  results.push({ name, expected, recognized: r.recognized, outcome: r.outcome, card: r.card, nameBox: box, ok, error: r.error });
  if (name.includes('채우기 핸들') || name.includes('열 너비')) { await page.keyboard.press('Escape'); await page.keyboard.press('Control+Z'); await page.waitForTimeout(500); }
}
await page.keyboard.press('Escape');

// ---------------------------------------------------------------- header, then a format button
// The card should show the whole way: "Ctrl+Space 다음 Ctrl+B".
const visibleOne = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const TWO_STEP = [
  ['마우스: 열 머리글 D 뒤 굵게 버튼', () => page.mouse.click(colHeader('D').x, colHeader('D').y), () => visibleOne('#t-bold').click(), 'sheets:mod+b', /Space[\s\S]*다음[\s\S]*B/],
  ['마우스: 행 번호 6 뒤 서식 › 정렬 › 오른쪽', () => page.mouse.click(rowHeader(6).x, rowHeader(6).y), async () => {
    await visibleOne('#docs-menubar [role="menuitem"]', { hasText: /^서식$/ }).click();
    await page.waitForTimeout(600);
    await visibleOne('.goog-menuitem', { hasText: /^정렬/ }).hover();
    await page.waitForTimeout(800);
    await visibleOne('.goog-menuitem', { hasText: /^오른쪽/ }).click();
  }, 'sheets:mod+shift+r', /Shift[\s\S]*Space[\s\S]*다음[\s\S]*R/],
  ['키보드로 고른 열(Ctrl+Space) 뒤 굵게 버튼', async () => { await go('E3'); await page.keyboard.press('Control+Space'); }, () => visibleOne('#t-bold').click(), 'sheets:mod+b', /^(?![\s\S]*Space)/],
];
for (const [name, pick, step, expected, cardShows] of TWO_STEP) {
  // Sheets' error dialog ("오류 발생 … 새로고침") can come up in between: reload and try again.
  let r;
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.keyboard.press('Escape');
    await go('A12');
    await pick();
    await page.waitForTimeout(700);
    await recover();
    if (attempt === 0 && !(await nameBox()).includes(':')) continue; // the reload lost the pick
    r = await check(page, worker, name, step, { wait: 1300 });
    if (!r.error) break;
    await recover();
  }
  const cardOk = !!r.card && cardShows.test(r.card);
  results.push({ name, expected, recognized: r.recognized, outcome: r.outcome, card: r.card, nameBox: await nameBox(), ok: r.recognized === expected && cardOk, error: r.error || (cardOk ? undefined : '카드 내용이 기대와 다름: ' + (r.card || '(카드 없음)').replace(/\s+/g, ' ').slice(0, 60)) });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+KeyZ');
  await page.waitForTimeout(500);
}

fs.mkdirSync(RESULTS, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log('\n' + results.map((r) => `${r.ok ? 'OK  ' : 'FAIL'} ${r.name} | 이름 상자 ${r.nameBox} | 기대 ${r.expected || '없음'} | 인식 ${r.recognized || '없음'}${r.error ? ' | 오류 ' + r.error : ''}`).join('\n'));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} as expected`);
await context.close();
