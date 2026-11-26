// When a Calendar key does nothing where it is pressed, Quickhand shows "여기서는 안 되는
// 키예요" with how to get to where it works. Each case: press the key, read the card,
// then follow the card's advice (Esc) and check that the page really went back or the
// window really closed. Nothing is saved: a new event page is left without saving.
// Results: results/calendar-ignored.json and a screenshot of each card.
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const BASE = 'https://calendar.google.com/calendar/u/0/r';
const OUT = path.join(RESULTS, 'calendar-ignored.json');

const { context } = await launch({ headless: false });
const page = await context.newPage();
// QH_DARK=1: the same run with the page in dark mode, to see the card's dark colours.
if (process.env.QH_DARK) await page.emulateMedia({ colorScheme: 'dark' });
page.setDefaultTimeout(15000);
page.on('dialog', (d) => d.accept().catch(() => {}));

const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
const card = () => page.evaluate(() => {
  const host = document.querySelector('quickhand-card');
  const c = host && host.shadowRoot && host.shadowRoot.querySelector('.card');
  return c ? { variant: [...c.classList].filter((x) => x !== 'card').join(' '), text: c.innerText.replace(/\s+/g, ' ').trim() } : null;
});
const where = () => page.evaluate(() => ({
  path: location.pathname.replace(/^\/calendar\/u\/\d+\/r/, '').replace(/\/[A-Za-z0-9_-]{20,}.*$/, '/(일정)') || '/',
  dialogs: [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length).length,
}));
async function open(where_) {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
  await page.goto(`${BASE}/${where_}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[role="main"]').filter({ visible: true }).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  await blur();
}

await page.goto(`${BASE}/week`, { waitUntil: 'domcontentloaded' });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN');
  await context.close();
  process.exit(1);
}

const CASES = [
  { name: '검색 결과에서 s', expect: '검색 결과에서는', prepare: () => open('search?q=' + encodeURIComponent('회의')), key: 'KeyS', after: (b, a) => a.path === '/' || a.path.startsWith('/week') || a.path.startsWith('/month') || a.path.startsWith('/day') },
  { name: '단축키 목록 창이 열린 채로 j', expect: '창이 열려 있으면', prepare: async () => { await open('week'); await page.keyboard.press('Shift+Slash'); await page.waitForTimeout(1500); await blur(); }, key: 'KeyJ', after: (b, a) => a.dialogs < b.dialogs },
  { name: '새 일정 화면에서 j', expect: '일정 수정 화면에서는', prepare: async () => { await open('week'); await page.keyboard.press('KeyC'); await page.waitForURL(/eventedit/); await page.waitForTimeout(2000); await blur(); }, key: 'KeyJ', after: (b, a) => !a.path.startsWith('/eventedit') },
  { name: '일정을 열지 않고 e', expect: '일정을 먼저 클릭해서', prepare: () => open('week'), key: 'KeyE', after: null },
];

const results = [];
for (const c of CASES) {
  let row;
  try {
    await c.prepare();
    const before = await where();
    await page.keyboard.press(c.key);
    await page.waitForTimeout(1200);
    const shown = await card();
    const shot = path.join(RESULTS, `calendar-ignored-${process.env.QH_DARK ? 'dark-' : ''}${results.length + 1}.png`);
    await page.screenshot({ path: shot });
    const still = await where();
    let followed = null;
    if (c.after) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(2500);
      followed = c.after(before, await where());
    }
    row = { case: c.name, card: shown, ok: !!shown && shown.variant.includes('ignored') && shown.text.includes(c.expect), pageUnchanged: JSON.stringify(before) === JSON.stringify(still), escWorked: followed, shot };
  } catch (e) {
    row = { case: c.name, error: e.message.split('\n')[0] };
  }
  results.push(row);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(row));
}
// Leave no unsaved event page behind.
if (page.url().includes('/eventedit')) { await page.keyboard.press('Escape'); await page.waitForTimeout(1000); }
console.log('\n경우 | 카드 | 화면 그대로 | Esc로 돌아감');
for (const r of results) console.log(`${r.case} | ${r.error ? '오류: ' + r.error : r.ok ? 'O' : 'X'} | ${r.pageUnchanged ? 'O' : 'X'} | ${r.escWorked === null ? '-' : r.escWorked ? 'O' : 'X'}`);
await context.close();
