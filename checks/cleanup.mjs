// Moves the check document to the trash (if still there), confirms it is in the
// trash, and signs the check profile out of Google.
import { launch } from './lib.mjs';

const TITLE = '손빠르미 점검용 (지워도 됨)';
const { context } = await launch({ headless: false });
const page = await context.newPage();
const rows = page.locator('[role="row"]', { hasText: TITLE }).filter({ visible: true });

await page.goto('https://drive.google.com/drive/recent', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="row"]', { timeout: 60000 });
await page.waitForTimeout(4000);
for (let i = 0; i < 3 && (await rows.count()); i++) {
  await rows.first().click({ button: 'right' });
  await page.locator('[role="menuitem"]', { hasText: '휴지통으로 이동' }).filter({ visible: true }).first().click();
  await page.waitForTimeout(3000);
}
console.log('in recent list:', await rows.count());

await page.goto('https://drive.google.com/drive/trash', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="row"], [role="main"]', { timeout: 60000 });
await page.waitForTimeout(4000);
console.log('in trash:', await rows.count());

await page.goto('https://accounts.google.com/Logout', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
console.log('signed out:', page.url().includes('accounts.google.com') || !page.url().includes('myaccount'));
await context.close();
