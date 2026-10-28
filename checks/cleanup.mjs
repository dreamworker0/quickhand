// Moves every check file (docs, sheets, slides named "손빠르미 … (지워도 됨)") to the trash, one at
// a time from the recent list, and signs the profile out only once none is left
// (unless run with --keep-login).
import { launch } from './lib.mjs';

// "손빠르미 점검용 (지워도 됨)" and "손빠르미 단축키 점검 문서 (지워도 됨)".
const TITLE = /손빠르미 [^()]*\(지워도 됨\)/;
const { context } = await launch({ headless: false });
const page = await context.newPage();
// One file or folder each: in grid view a [role="row"] holds several items, so clicking a
// row that merely contains a test name could pick (and trash) someone's own file
// (it did, on a Mac, 2026-10-28). Only an item whose own name is the test name counts.
const rows = page.locator('[role="row"][data-id], [role="gridcell"][data-id]', { hasText: TITLE }).filter({ visible: true });

// The recent list has the files; folders (drive-shortcuts.mjs makes one) are in My Drive.
async function open(list) {
  await page.goto('https://drive.google.com/drive/' + list, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[role="row"]', { timeout: 60000 });
  await page.waitForTimeout(4000);
}

let left = 0;
for (const list of ['recent', 'my-drive']) {
  await open(list);
  for (let i = 0; i < 25 && (await rows.count()); i++) {
    try {
      await rows.first().click();
      await page.keyboard.press('Delete');
      // Drive asks "휴지통으로 이동하시겠습니까?" for some items; this only moves them to the trash.
      const confirm = page.getByRole('button', { name: '휴지통으로 이동', exact: true }).filter({ visible: true }).first();
      await confirm.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
    } catch (e) {
      console.log('retrying after:', e.message.split('\n')[0]);
    }
    await open(list); // the list redraws after each move; start from a fresh one
  }
  left += await rows.count();
}

console.log('left outside the trash:', left);
await page.goto('https://drive.google.com/drive/trash', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="main"]', { timeout: 60000 });
await page.waitForTimeout(5000);
console.log('in trash:', await rows.count());

// --keep-login: only tidy up the files and stay signed in for further checks.
if (process.argv.includes('--keep-login')) {
  console.log('kept signed in (--keep-login)');
} else if (left === 0) {
  await page.goto('https://accounts.google.com/Logout', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  console.log('signed out:', page.url().includes('accounts.google.com') || !page.url().includes('myaccount'));
} else {
  console.log('still signed in, so the rest can be cleaned up on the next run');
}
await context.close();
