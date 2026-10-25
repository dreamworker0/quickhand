// Turns Google Docs' screen reader support off again for the check account (it is a
// setting of the account; docs-shortcuts.mjs turns it on while it runs). Opens the
// given test document, or a new one named like the other checks.
import { launch } from './lib.mjs';

const { context } = await launch({ headless: false });
const page = await context.newPage();
await page.goto(process.argv[2] || 'https://docs.new', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#boldButton', { timeout: 60000 });
await page.waitForTimeout(4000);
const on = await page.evaluate(() => {
  const hint = document.querySelector('#placeholder-msg-until-sr-enabled, .placeholder-msg-until-sr-enabled');
  return !hint || !/Ctrl\+Alt\+Z/.test(hint.textContent);
});
console.log('screen reader support was', on ? 'on' : 'off');
if (on) {
  await page.evaluate(() => document.querySelector('.docs-texteventtarget-iframe').contentDocument.querySelector('[contenteditable]').focus());
  await page.keyboard.press('Control+Alt+KeyZ');
  await page.waitForTimeout(2000);
  const now = await page.evaluate(() => [...document.querySelectorAll('[aria-live]')].map((e) => e.textContent).join(' '));
  console.log(/사용 중지/.test(now) ? 'turned off' : 'check by hand: ' + now.slice(0, 120));
}
await context.close();
