// Reproduces "the extension was reloaded while a YouTube tab was open": the
// card must still show, with its mascot picture, in the tab opened before.
import { launch, check, EXTENSION } from './lib.mjs';

const { context, worker } = await launch({ headless: true });
const page = await context.newPage();
const errors = [];
let phase = 'load';
page.on('console', (m) => { if (m.type() === 'error' && /chrome-extension|quickhand|mascot/i.test(m.text())) errors.push(phase + ': ' + m.text().slice(0, 90)); });
await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#movie_player .ytp-size-button', { state: 'attached', timeout: 30000 });
await page.waitForTimeout(3000);

// Reload the extension the way the reload button does; the new background
// injects fresh scripts into this already-open tab.
const waitNew = context.waitForEvent('serviceworker', { predicate: (w) => w.url().endsWith('/src/background.js'), timeout: 20000 });
phase = 'reload';
const cdp = await context.browser().newBrowserCDPSession();
await cdp.send('Extensions.loadUnpacked', { path: EXTENSION });
const fresh = await waitNew;
await fresh.evaluate(async () => {
  const { qh_settings } = await chrome.storage.sync.get('qh_settings');
  await chrome.storage.sync.set({ qh_settings: Object.assign({}, qh_settings, { strength: 'active', enabled: true, pauseUntil: 0 }) });
});
await page.waitForTimeout(3000);

phase = 'click';
await page.hover('#movie_player');
const result = await check(page, fresh, '새로고침 후 영화관 모드', () => page.locator('#movie_player .ytp-size-button').click());
const img = await page.evaluate(() => {
  const host = document.querySelector('quickhand-card');
  const i = host && host.shadowRoot.querySelector('img');
  return i ? { src: i.src.slice(0, 40), loaded: i.complete && i.naturalWidth > 0 } : null;
});
console.log('cards created:', await page.evaluate(() => window.__qhCards.map((c) => c.text.slice(0, 20))));
console.log('picture:', JSON.stringify(img));
console.log('errors:', JSON.stringify(errors));
await context.close();
