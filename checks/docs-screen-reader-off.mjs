// Turns Google Docs editors' screen reader support (an account setting) and input
// tools off again for the check account; the shortcut checks turn them on while
// they run. Opens the given test document or spreadsheet, or a new document.
import { launch } from './lib.mjs';

const { context } = await launch({ headless: false });
const page = await context.newPage();
await page.goto(process.argv[2] || 'https://docs.new', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.docs-title-input', { timeout: 60000 });
await page.waitForTimeout(5000);
// Docs types into a hidden frame; in Sheets the grid takes the keys once a cell is chosen.
async function focusEditor() {
  const docs = await page.evaluate(() => {
    const f = document.querySelector('.docs-texteventtarget-iframe');
    const e = f && f.contentDocument && f.contentDocument.querySelector('[contenteditable]');
    if (e) e.focus();
    return !!e;
  });
  if (!docs && (await page.locator('#t-name-box').count())) {
    await page.locator('#t-name-box').fill('A1');
    await page.locator('#t-name-box').press('Enter');
  }
  await page.waitForTimeout(500);
}
const said = () => page.evaluate(() => [...document.querySelectorAll('[aria-live]')].map((e) => e.textContent).join(' '));

// Input tools (Ctrl+Shift+K) turn typed letters into Korean jamo; Sheets toggles
// them without a word. In a spreadsheet, type "a" into a far-off cell and look.
async function typesJamo() {
  if (!(await page.locator('#t-name-box').count())) return null;
  await page.locator('#t-name-box').fill('Z200');
  await page.locator('#t-name-box').press('Enter');
  await page.waitForTimeout(500);
  await page.keyboard.type('a');
  await page.waitForTimeout(500);
  const text = await page.locator('#t-formula-bar-input').innerText().catch(() => '');
  await page.keyboard.press('Escape'); // leave the cell unchanged
  await page.waitForTimeout(500);
  return /ㅁ/.test(text);
}
if (await typesJamo()) {
  await page.keyboard.press('Control+Shift+KeyK');
  await page.waitForTimeout(1000);
  console.log('input tools were on; now', (await typesJamo()) ? 'still on, check by hand' : 'off');
} else {
  console.log('input tools: off (or not a spreadsheet)');
}

const on = await page.evaluate(() => {
  const hint = document.querySelector('#placeholder-msg-until-sr-enabled, .placeholder-msg-until-sr-enabled');
  return !hint || !/Ctrl\+Alt\+Z/.test(hint.textContent);
});
console.log('screen reader support was', on ? 'on' : 'off');
if (on) {
  await focusEditor();
  await page.keyboard.press('Control+Alt+KeyZ');
  await page.waitForTimeout(2000);
  const now = await said();
  console.log(/사용 중지/.test(now) ? 'turned off' : 'check by hand: ' + now.slice(0, 120));
}
await context.close();
