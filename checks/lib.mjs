// Shared helpers: start a Chromium with Quickhand loaded, and check that a click
// brings up a card that can actually be seen.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION = path.resolve(here, '../extension');
// The installed Google Chrome by default; QH_BROWSER=msedge uses Edge instead.
export const BROWSER = process.env.QH_BROWSER || 'chrome';
// The check profiles live outside the project, next to other programs' data
// (%LOCALAPPDATA%\Quickhand\checks on Windows): Chrome fills a profile with caches and
// downloads, such as its 4 GB on-device AI model.
// QH_PROFILE=.profile-calendar gives a check its own profile, so two checks can run at
// once (Chrome locks a profile to one window). Copy a signed-in .profile to start one.
export const PROFILES = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'Quickhand', 'checks')
  : path.join(os.homedir(), '.quickhand-checks');
export const PROFILE = path.resolve(PROFILES, process.env.QH_PROFILE || (BROWSER === 'chrome' ? '.profile' : `.profile-${BROWSER}`));
export const RESULTS = path.join(here, 'results');

// The checks are written with Windows keys ("Control+Shift+KeyC", "Ctrl + B",
// "sheets:mod+space"). On a Mac, keyFor(), shownFor() and idFor() turn them into the key Google
// and Quickhand use there; elsewhere they return their input unchanged, so a Windows
// run presses and expects exactly what it did before.
// Rule of thumb: Ctrl becomes ⌘ and Alt becomes Option. MAC_RULES lists where a
// site uses another key on a Mac (Quickhand's sites/*.js make the same choice).
export const MAC = process.platform === 'darwin';
const EDITORS = ['docs', 'sheets', 'slides'];
const MAC_RULES = [
  // Select column: ⌘+Space is Spotlight, so Sheets uses Control+Space.
  { sites: ['sheets'], when: (c) => c.mod && !c.alt && !c.shift && c.key === 'space', to: { mod: false, ctrl: true } },
  // Previous / next chapter: Option+←/→.
  { sites: ['youtube'], when: (c) => c.mod && !c.alt && !c.shift && /^arrow(left|right)$/.test(c.key), to: { mod: false, alt: true } },
  // Menu access (Alt+F file, Alt+Shift+F in other browsers): Control+Option+F.
  { sites: EDITORS, when: (c) => c.alt && !c.mod && !c.ctrl && /^[a-z]$/.test(c.key), to: { ctrl: true, shift: false } },
  // Docs' two-step keys ("Ctrl + Alt + N, H") are held with Control+⌘. Only labels say
  // both steps; a check presses them through its own helper (docs-shortcuts.mjs: seq()).
  { sites: EDITORS, when: (c) => c.mod && c.alt && /,/.test(c.key), to: { ctrl: true, alt: false } },
  // Image size (Ctrl+Alt+K, B, I, J, W, Q): ⌘+Control.
  { sites: ['docs', 'slides'], when: (c) => c.mod && c.alt && !c.shift && /^[kbijwq]$/.test(c.key), to: { ctrl: true, alt: false } },
  // The rest of the help pages where the Mac key is not just ⌘ for Ctrl, Option for Alt.
  { sites: EDITORS, when: (c) => c.mod && !c.alt && !c.shift && c.key === 'h', to: { shift: true } }, // find and replace
  { sites: EDITORS, when: (c) => c.mod && !c.alt && c.shift && c.key === 'f', to: { mod: false, ctrl: true } }, // compact mode
  { sites: EDITORS, when: (c) => c.alt && c.shift && !c.mod && c.key === '5', to: { alt: false, mod: true, key: 'x' } }, // strikethrough
  { sites: ['docs', 'slides'], when: (c) => c.mod && !c.alt && !c.shift && c.key === 'space', to: { key: '\\' } }, // clear formatting
  { sites: ['docs', 'slides'], when: (c) => c.mod && !c.alt && c.shift && c.key === 'x', to: { key: '\\' } }, // context menu
  // Sheets: number formats, all formulas, the filter menu and leaving the grid hold Control.
  { sites: ['sheets'], when: (c) => c.mod && !c.alt && c.shift && /^[1-6]$/.test(c.key), to: { mod: false, ctrl: true } },
  { sites: ['sheets'], when: (c) => c.mod && !c.alt && !c.shift && c.key === 'backquote', to: { mod: false, ctrl: true } },
  { sites: ['sheets'], when: (c) => c.mod && c.alt && ((c.key === 'r' && !c.shift) || (c.key === 'm' && c.shift)), to: { ctrl: true, alt: false } },
  // Slides: new slide, present, full screen, speak selection / from cursor, shrink vertically.
  { sites: ['slides'], when: (c) => c.mod && !c.alt && !c.shift && c.key === 'm', to: { mod: false, ctrl: true } },
  { sites: ['slides'], when: (c) => c.mod && !c.alt && !c.shift && c.key === 'f5', to: { key: 'enter' } },
  { sites: ['slides'], when: (c) => c.mod && !c.alt && !c.shift && c.key === 'enter', to: { mod: false, ctrl: true } }, // enter the comment (⌘+Enter presents)
  { sites: ['slides'], when: (c) => !c.mod && !c.alt && !c.shift && c.key === 'f11', to: { mod: true, shift: true, key: 'f' } },
  { sites: ['slides'], when: (c) => c.mod && c.alt && !c.shift && /^[xr]$/.test(c.key), to: { ctrl: true, alt: false } },
  { sites: ['slides'], when: (c) => c.mod && c.alt && !c.shift && c.key === '9', to: { mod: false, ctrl: true } },
  // Drive: the menus Windows opens with Alt (create Alt+C, new Alt+N, more Alt+A, sort Alt+R,
  // density Alt+T) take Control; Ctrl+Alt+R (add shortcut) is ⌘+Control+R. Alt+G stays Option.
  { sites: ['drive'], when: (c) => c.alt && !c.mod && (/^[cnrt]$/.test(c.key) || c.key === 'a'), to: { alt: false, ctrl: true } },
  { sites: ['drive'], when: (c) => c.mod && c.alt && !c.shift && c.key === 'r', to: { ctrl: true, alt: false } },
  // Gmail: next / previous chat or compose window are Ctrl+. and Ctrl+, on a Mac too (help page).
  { sites: ['gmail'], when: (c) => c.mod && !c.alt && !c.shift && /^(period|comma|\.|,)$/.test(c.key), to: { mod: false, ctrl: true } },
  { sites: ['docs'], when: (c) => c.mod && !c.alt && c.shift && /^arrow(up|down)$/.test(c.key), to: { mod: false, ctrl: true } }, // move paragraph
  { sites: ['docs'], when: (c) => c.mod && !c.alt && /^(home|end)$/.test(c.key), to: { key: (c) => (c.key === 'home' ? 'arrowup' : 'arrowdown') } }, // start / end of the document
  { sites: ['docs'], when: (c) => c.mod && !c.alt && /^arrow/.test(c.key), to: { mod: false, alt: true } }, // by word or paragraph
];
// Playwright names for keys, and the arrows the card and labels print.
const PRESS_NAMES = { space: 'Space', enter: 'Enter', escape: 'Escape', tab: 'Tab', backspace: 'Backspace', delete: 'Delete',
  arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown' };
const ARROWS = { '←': 'arrowleft', '→': 'arrowright', '↑': 'arrowup', '↓': 'arrowdown' };
const keyOf = (part) => ARROWS[part] || part.toLowerCase().replace(/^key([a-z])$/, '$1').replace(/^digit(\d)$/, '$1');
const SYMBOLS = { '\\': 'Backslash' };
const pressName = (k) => PRESS_NAMES[k] || SYMBOLS[k] || (/^[a-z]$/.test(k) ? 'Key' + k.toUpperCase() : k);
const cardName = (k) => Object.keys(ARROWS).find((a) => ARROWS[a] === k) || (k.length === 1 ? k.toUpperCase() : k);

// "Control+Shift+KeyC", "Ctrl + Shift + C" or "mod+shift+c" → { mod, ctrl, alt, shift, key, own },
// where own is the key as the caller spelled it.
function readCombo(text) {
  const c = { mod: false, ctrl: false, alt: false, shift: false, key: '', own: '' };
  const parts = text.trim().endsWith('+') && /\+\s*\+$/.test(text.trim())
    ? text.trim().slice(0, -1).split(/\s*\+\s*/).filter(Boolean).concat('+') // "Ctrl + +"
    : text.split(/\s*\+\s*/);
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'control' || lower === 'ctrl' || lower === 'mod') c.mod = true;
    else if (lower === 'alt') c.alt = true;
    else if (lower === 'shift') c.shift = true;
    else { c.own = part; c.key = keyOf(part); }
  }
  return c;
}
function toMac(c, site) {
  const rule = MAC_RULES.find((r) => r.sites.includes(site) && r.when(c));
  if (!rule) return c;
  const to = Object.assign({}, rule.to);
  if (typeof to.key === 'function') to.key = to.key(c);
  if (to.key) to.own = ''; // another key: named afresh
  return Object.assign({}, c, to);
}

// A Playwright key ("Control+Shift+KeyC") for page.keyboard.press(); site picks MAC_RULES.
// A key that already says Meta is a Mac key and is pressed as written.
export function keyFor(win, site, mac = MAC) {
  if (!mac || /\bMeta\b/.test(win)) return win;
  const c = toMac(readCombo(win), site);
  return [c.ctrl && 'Control', c.mod && 'Meta', c.alt && 'Alt', c.shift && 'Shift', c.own || pressName(c.key)].filter(Boolean).join('+');
}

// A key as the card shows it ("Ctrl + B" → "⌘ + B"); "A 다음 B" for two steps.
export function shownFor(win, site, mac = MAC) {
  if (!mac) return win;
  return win.split(/\s+다음\s+/).map((step) => {
    const c = toMac(readCombo(step), site);
    return [c.ctrl && 'Control', c.mod && '⌘', c.alt && 'Option', c.shift && 'Shift', c.own || cardName(c.key)].filter(Boolean).join(' + ');
  }).join(' 다음 ');
}

// Docs' two-step keys hold Ctrl+Alt (Windows) or Control+⌘ (Mac) through both steps:
// twoStep('N', 'H') → ['Control+Alt+KeyN', 'Control+Alt+KeyH'].
export function twoStep(first, second, { shift = false, mac = MAC } = {}) {
  const hold = (mac ? 'Control+Meta+' : 'Control+Alt+') + (shift ? 'Shift+' : '');
  return [first, second].map((k) => hold + (/^[A-Z]$/.test(k) ? 'Key' + k : /^\d$/.test(k) ? 'Digit' + k : k));
}

// An action ID Quickhand logs ("sheets:mod+space" → "sheets:ctrl+space"). Most IDs say
// "mod", which means Ctrl or ⌘, and stay the same.
export function idFor(win, mac = MAC) {
  if (!mac || !win) return win;
  const [site, keys] = win.split(':');
  if (!keys || !/[+>]/.test(keys)) return win; // "sheets:range", "sheets:f2" and other one-word IDs
  return site + ':' + keys.split('>').map((step) => {
    const c = toMac(readCombo(step), site);
    return [c.mod && 'mod', c.ctrl && 'ctrl', c.alt && 'alt', c.shift && 'shift', c.key].filter(Boolean).join('+');
  }).join('>');
}

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

// Turns Quickhand back on from chrome://extensions if Chrome has turned it off, and
// returns its new worker; null when it was on already (or would not start).
async function enable(context, extensionId, isOurs) {
  const page = await context.newPage();
  try {
    await page.goto('chrome://extensions');
    const on = await page.evaluate((id) => new Promise((ok) => chrome.management.get(id, (i) => ok(!i || i.enabled))), extensionId);
    if (on) return null;
    const started = context.waitForEvent('serviceworker', { predicate: isOurs, timeout: 15000 }).catch(() => null);
    await page.evaluate((id) => new Promise((ok) => chrome.management.setEnabled(id, true, ok)), extensionId);
    return await started;
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
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
    // On a Mac, Playwright's stand-in keychain can't read the cookies the login
    // window (npm run login) saved with the real one, so the check looked signed out.
    ignoreDefaultArgs: MAC ? ['--disable-extensions', '--use-mock-keychain'] : ['--disable-extensions'],
    args: chrome
      ? ['--enable-unsafe-extension-debugging']
      : [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  await context.addInitScript(watchCards);
  let extensionId = null;
  const isOurs = (w) => w.url().endsWith('/src/background.js');
  let worker = null;
  if (chrome) {
    // Loading over the copy the profile already knows starts a new worker and stops
    // the old one, so wait a moment for the new one instead of grabbing the old.
    const fresh = context.waitForEvent('serviceworker', { predicate: isOurs, timeout: 5000 }).catch(() => null);
    const cdp = await context.browser().newBrowserCDPSession();
    ({ id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: EXTENSION }));
    worker = await fresh;
  }
  if (!worker) worker = context.serviceWorkers().filter(isOurs).pop();
  if (!worker && extensionId) worker = await enable(context, extensionId, isOurs); // left off by an earlier run
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
  // A worker the profile already knew keeps the code it was started with, even after
  // loadUnpacked (the hint rules ran stale once); reloading the extension starts it
  // again from the files on disk.
  if (chrome) {
    const restarted = context.waitForEvent('serviceworker', { predicate: isOurs, timeout: 15000 }).catch(() => null);
    await worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
    worker = await restarted;
    // Chrome 156 turns the extension off instead (seen on a Mac, 2026-10-27): turning it
    // back on starts it from the files on disk, with its storage kept.
    if (!worker) worker = await enable(context, extensionId, isOurs);
    if (!worker) {
      // Asleep after the reload: the popup's first message wakes it.
      const waking = context.waitForEvent('serviceworker', { predicate: isOurs, timeout: 15000 }).catch(() => null);
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`).catch(() => {});
      worker = (await waking) || context.serviceWorkers().filter(isOurs).pop();
      await popup.close();
    }
  }
  // Hint on every click from the start: "active" strength. Cheers on, as installed
  // (docs-shortcuts.mjs turns them off for itself).
  await worker.evaluate(async () => {
    const { qh_settings } = await chrome.storage.sync.get('qh_settings');
    await chrome.storage.sync.set({
      qh_settings: Object.assign({}, qh_settings, { enabled: true, pauseUntil: 0, strength: 'active', praise: true, onboarded: true, disabledSites: [] }),
    });
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
