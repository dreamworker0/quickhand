// "여기서는 안 되는 키예요" on Gmail, Drive and YouTube: press a known shortcut where the
// site ignores it and read the card. Nothing is changed: in Gmail nothing is ticked (the run
// stops if something is), in Drive nothing is selected, and YouTube plays Big Buck Bunny
// (no captions, no chapters) muted outside a playlist.
// QH_DARK=1 runs it with the pages in dark mode. Results: results/ignored-notes.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const OUT = path.join(RESULTS, 'ignored-notes.json');
const BUNNY = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

const { context } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(20000);
if (process.env.QH_DARK) await page.emulateMedia({ colorScheme: 'dark' });

const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
const card = () => page.evaluate(() => {
  const host = document.querySelector('quickhand-card');
  const c = host && host.shadowRoot && host.shadowRoot.querySelector('.card');
  return c ? { variant: [...c.classList].filter((x) => x !== 'card').join(' '), text: c.innerText.replace(/\s+/g, ' ').trim() } : null;
});
const dialogs = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length).length);

const results = [];
async function tryKey(site, name, key, expect) {
  let row;
  try {
    const before = { url: page.url(), dialogs: await dialogs() };
    await page.keyboard.press(key);
    await page.waitForTimeout(1200);
    const shown = await card();
    const after = { url: page.url(), dialogs: await dialogs() };
    const shot = path.join(RESULTS, `ignored-${site}-${results.length + 1}${process.env.QH_DARK ? '-dark' : ''}.png`);
    await page.screenshot({ path: shot });
    row = { site, case: name, card: shown, ok: !!shown && shown.variant.includes('ignored') && shown.text.includes(expect), pageUnchanged: JSON.stringify(before) === JSON.stringify(after), shot };
  } catch (e) {
    row = { site, case: name, error: e.message.split('\n')[0] };
  }
  results.push(row);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(row));
}

// ---- Gmail: the inbox list with nothing ticked.
await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded', timeout: 60000 });
if (page.url().includes('accounts.google.com/')) { console.log('NOT SIGNED IN'); await context.close(); process.exit(1); }
await page.locator('tr.zA').filter({ visible: true }).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(2000);
const ticked = await page.evaluate(() => [...document.querySelectorAll('tr.zA [role="checkbox"][aria-checked="true"]')].filter((e) => e.getClientRects().length).length);
if (ticked) {
  console.log('Gmail has ticked conversations; skipping Gmail so nothing is changed');
} else {
  await blur();
  await tryKey('gmail', '목록에서 고르지 않고 E (보관처리)', 'KeyE', '먼저 X로 고르거나');
  await tryKey('gmail', '목록에서 R (답장)', 'KeyR', '대화를 연 다음');
}

// ---- Drive: My Drive with nothing selected.
await page.goto('https://drive.google.com/drive/my-drive', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('[role="main"]').filter({ visible: true }).first().waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
await page.keyboard.press('Escape');
await blur();
const selected = await page.evaluate(() => [...document.querySelectorAll('[aria-selected="true"][data-id]')].filter((e) => e.getClientRects().length).length);
if (selected) {
  console.log('Drive has a selection; skipping Drive');
} else {
  await tryKey('drive', '아무것도 고르지 않고 Ctrl+Alt+A (공유)', 'Control+Alt+KeyA', '먼저 클릭해서 고른');
  await page.keyboard.press('Escape');
}

// ---- YouTube: a video without captions or chapters, playing, not in a playlist.
await page.goto(BUNNY, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#movie_player video').waitFor({ state: 'attached', timeout: 60000 });
await page.waitForTimeout(3000);
// The frame keys work only while paused, so make sure it really plays (muted, so the
// browser allows it), and say so if it never does.
const playing = () => page.evaluate(() => { const v = document.querySelector('#movie_player video'); return !!v && !v.paused; });
for (let i = 0; i < 5 && !(await playing()); i++) {
  await page.evaluate(async () => { const v = document.querySelector('#movie_player video'); v.muted = true; try { await v.play(); } catch (e) {} });
  await page.waitForTimeout(1500);
}
await blur();
if (await playing()) await tryKey('youtube', '재생 중에 . (한 프레임 앞으로)', 'Period', '영상을 멈춘 다음');
else console.log('YouTube would not play; skipping the frame key');
await tryKey('youtube', '자막 없는 영상에서 C', 'KeyC', '자막이 없어요');
await tryKey('youtube', '챕터 없는 영상에서 Ctrl+→', 'Control+ArrowRight', '챕터가 없어요');
await tryKey('youtube', '재생목록이 아닐 때 Shift+P', 'Shift+KeyP', '재생목록으로 볼 때만');

console.log('\n사이트 | 경우 | 카드 | 화면 그대로');
for (const r of results) console.log(`${r.site} | ${r.case} | ${r.error ? '오류: ' + r.error : r.ok ? 'O' : 'X'} | ${r.pageUnchanged ? 'O' : 'X'}`);
await context.close();
