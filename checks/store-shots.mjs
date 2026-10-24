// Chrome Web Store images from the real extension: five 1280x800 screenshots
// and the 440x280 / 1400x560 promo tiles, written to ../store/.
// The video is Big Buck Bunny (Blender Foundation, CC BY 3.0), so the listing
// shows no one else's content.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, EXTENSION } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.resolve(here, '../store');
const SHOTS = path.join(STORE, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const { context, extensionId } = await launch({ headless: true });
const page = await context.newPage();
const ext = (p) => `chrome-extension://${extensionId}/${p}`;

async function skipAds() {
  for (let i = 0; i < 120 && (await page.locator('#movie_player.ad-showing').count()); i++) {
    const skip = page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button-modern').filter({ visible: true }).first();
    if (await skip.count()) await skip.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
}

// Waits for the next card and lets it finish sliding in.
async function nextCard(before) {
  await page.waitForFunction((n) => window.__qhCards.length > n, before, { timeout: 10000 });
  await page.waitForTimeout(700);
}

// 1. The hint card on YouTube.
await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#movie_player .ytp-play-button', { timeout: 30000 });
await page.waitForTimeout(3000);
await skipAds();
await page.hover('#movie_player');
let n = await page.evaluate(() => window.__qhCards.length);
await page.locator('#movie_player .ytp-size-button').click();
await nextCard(n);
await page.mouse.move(20, 420); // off the buttons, so no YouTube tooltip shows
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(SHOTS, '1-hint-card.png') });

// 2. "Learned!" after switching to the keyboard.
n = await page.evaluate(() => window.__qhCards.length);
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
}
await page.waitForFunction((k) => window.__qhCards.slice(k).some((c) => /익혔어요/.test(c.text)), n, { timeout: 10000 });
await page.mouse.move(20, 420);
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(SHOTS, '2-learned-card.png') });

// A few more actions so the popup has something to show.
await page.hover('#movie_player');
for (const sel of ['.ytp-play-button', '.ytp-volume-icon, .ytp-mute-button', '.ytp-play-button']) {
  await page.locator(`#movie_player ${sel}`).first().click().catch(() => {});
  await page.waitForTimeout(500);
}

// Extension pages, shown at popup size on a soft background.
async function framed(url, file, { width, open = [], scrollTo } = {}) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(ext(url));
  await p.waitForTimeout(800);
  for (const sel of open) await p.locator(sel).evaluate((d) => (d.open = true));
  if (width) {
    await p.addStyleTag({ content: `html{background:linear-gradient(135deg,#e6f4f1,#fff9ed);min-height:100%}body{margin:40px auto;border-radius:16px;box-shadow:0 16px 48px rgba(23,63,79,.18);overflow:hidden}` });
    // Opened as a tab here, the popup reports on its own tab; show what it
    // says when opened over the YouTube tab instead.
    await p.evaluate(() => {
      const box = document.getElementById('tab-status');
      if (!box) return;
      box.className = 'tab-status ok';
      box.textContent = chrome.i18n.getMessage('tabWorking', [chrome.i18n.getMessage('siteYoutube')]);
    });
  }
  if (scrollTo) await p.locator(scrollTo).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24));
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SHOTS, file) });
  await p.close();
}
await framed('src/popup/popup.html', '3-popup.png', { width: 360 });
await framed('src/popup/popup.html', '4-why-no-hint.png', { width: 360, open: ['details.log'], scrollTo: 'details.log' });
await framed('src/welcome/welcome.html', '5-welcome.png');

// Promo tiles: the mascot with the name and one line.
const mascot = 'data:image/png;base64,' + fs.readFileSync(path.join(EXTENSION, 'assets/mascot/hint.png')).toString('base64');
async function tile(file, w, h, big) {
  const p = await context.newPage();
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;gap:${big ? 56 : 12}px;padding:0 ${big ? 120 : 20}px;box-sizing:border-box;
      background:linear-gradient(135deg,#2a9d8f,#1f7f74);color:#fff9ed;font-family:"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}
    img{height:${big ? 380 : 150}px} h1,p{white-space:nowrap} h1{margin:0;font-size:${big ? 96 : 38}px;letter-spacing:-1px} p{margin:${big ? 16 : 6}px 0 0;font-size:${big ? 36 : 14}px;line-height:1.45;color:#e8f6f3}
    kbd{display:inline-block;margin-top:${big ? 28 : 14}px;padding:${big ? '10px 18px' : '5px 10px'};border-radius:10px;background:#fff9ed;color:#173f4f;font:700 ${big ? 34 : 17}px Consolas,monospace;border-bottom:${big ? 6 : 3}px solid #c9d9d5}
  </style><img src="${mascot}"><div><h1>손빠르미</h1><p>마우스로 한 동작에 단축키가 있으면<br>그 자리에서 살짝 알려 드려요</p><kbd>Ctrl + B</kbd></div>`);
  await p.screenshot({ path: path.join(STORE, file) });
  await p.close();
}
await tile('promo-440x280.png', 440, 280, false);
await tile('marquee-1400x560.png', 1400, 560, true);

await context.close();
console.log('saved to', path.relative(process.cwd(), STORE));
