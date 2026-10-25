// Shared helpers: start a Chromium with Quickhand loaded, and check that a click
// brings up a card that can actually be seen.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION = path.resolve(here, '../extension');
// The installed Google Chrome by default; QH_BROWSER=msedge uses Edge instead.
export const BROWSER = process.env.QH_BROWSER || 'chrome';
// QH_PROFILE=.profile-calendar gives a check its own profile, so two checks can run at
// once (Chrome locks a profile to one window). Copy a signed-in .profile to start one.
export const PROFILE = path.join(here, process.env.QH_PROFILE || (BROWSER === 'chrome' ? '.profile' : `.profile-${BROWSER}`));
export const RESULTS = path.join(here, 'results');

// Runs in every page before its own scripts: keeps each card that appears, with
// its text and whether it was on top of the page a moment later.
function watchCards() {
  window.__qhCards = [];
  const read = (host) => {
    const root = host.shadowRoot;
    const card = root && root.querySelector('.card');
    if (!card) return;
    const entry = { text: card.innerText.replace(/\s+/g, ' ').trim(), visible: null };
    window.__qhCards.push(entry);
    setTimeout(() => {
      const r = card.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      entry.visible = hit === host && r.width > 0;
      const img = root.querySelector('img');
      entry.picture = img ? img.complete && img.naturalWidth > 0 : false;
      entry.inside = host.parentElement === document.documentElement ? 'page' : host.parentElement.id || host.parentElement.tagName;
    }, 1000); // after the slide-in and any layout change the click caused
  };
  new MutationObserver((records) => {
    for (const rec of records) for (const node of rec.addedNodes) if (node.nodeName === 'QUICKHAND-CARD') read(node);
  }).observe(document, { childList: true, subtree: true });
}

// Google Chrome (137+) ignores --load-extension; it loads an unpacked extension
// through the DevTools protocol instead, once started with
// --enable-unsafe-extension-debugging. Edge still takes the flag.
export async function launch({ headless = true } = {}) {
  fs.mkdirSync(RESULTS, { recursive: true });
  const chrome = BROWSER === 'chrome';
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: BROWSER,
    headless,
    viewport: { width: 1280, height: 800 },
    locale: 'ko-KR',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: chrome
      ? ['--enable-unsafe-extension-debugging']
      : [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  await context.addInitScript(watchCards);
  let extensionId = null;
  if (chrome) {
    const cdp = await context.browser().newBrowserCDPSession();
    ({ id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: EXTENSION }));
  }
  const isOurs = (w) => w.url().endsWith('/src/background.js');
  let worker = context.serviceWorkers().find(isOurs);
  if (!worker && extensionId) {
    // Already known to this profile, so its worker may be asleep: the popup's
    // first message wakes it.
    const waiting = context.waitForEvent('serviceworker', { predicate: isOurs, timeout: 15000 }).catch(() => null);
    const popup = await context.newPage();
    // Right after loading, Chrome may still refuse the page for a moment.
    for (let i = 0; i < 5; i++) {
      try {
        await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
        break;
      } catch (e) {
        await popup.waitForTimeout(1000);
      }
    }
    worker = (await waiting) || context.serviceWorkers().find(isOurs);
    await popup.close();
  }
  if (!worker) worker = await context.waitForEvent('serviceworker', { predicate: isOurs });
  // Hint on every click from the start: "active" strength, observation skipped.
  await worker.evaluate(async () => {
    const { qh_settings } = await chrome.storage.sync.get('qh_settings');
    await chrome.storage.sync.set({
      qh_settings: Object.assign({}, qh_settings, { enabled: true, pauseUntil: 0, strength: 'active', onboarded: true, disabledSites: [] }),
    });
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const state = self.QH.engine.skipObservation(qh_state || self.QH.engine.emptyState(Date.now()));
    await chrome.storage.local.set({ qh_state: state });
  });
  // The first install opens the welcome tab; it isn't part of the check.
  for (const p of context.pages()) if (p.url().startsWith('chrome-extension://')) await p.close();
  return { context, worker, extensionId: new URL(worker.url()).host };
}

// The newest decision the extension logged, if it came after `since`.
async function lastDecision(worker, since) {
  const entry = await worker.evaluate(async () => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    return qh_state && qh_state.log ? qh_state.log[0] : null;
  });
  return entry && entry.at >= since ? entry : null;
}

// Runs one step (a click or key press) and reports what Quickhand made of it.
export async function check(page, worker, name, step, { wait = 1500 } = {}) {
  const before = await page.evaluate(() => window.__qhCards.length);
  const since = Date.now();
  let error = null;
  try {
    await step();
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  await page.waitForTimeout(wait);
  const cards = await page.evaluate((n) => window.__qhCards.slice(n), before).catch(() => []);
  const decision = await lastDecision(worker, since);
  const result = {
    name,
    recognized: decision ? decision.id : null,
    outcome: decision ? decision.outcome : null,
    card: cards.length ? cards[cards.length - 1].text : null,
    visible: cards.length ? cards[cards.length - 1].visible : null,
    inside: cards.length ? cards[cards.length - 1].inside : null,
    picture: cards.length ? cards[cards.length - 1].picture : null,
    error,
  };
  const shot = path.join(RESULTS, name.replace(/[^\w가-힣]+/g, '_') + '.png');
  await page.screenshot({ path: shot }).catch(() => {});
  console.log(JSON.stringify(result));
  return result;
}
