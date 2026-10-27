// Which visible buttons would Quickhand take for which action? Each site is opened and,
// without clicking anything, every visible control is run through the site module (loaded
// into the page on its own) as if it had been clicked. The table lists the control's own
// name next to the action it would hint, so a person can spot misreads like Gmail's
// "라벨 더보기" taken for More actions. Docs, Sheets and Slides use new test files named
// "손빠르미 단축키 점검 문서 (지워도 됨)"; `node cleanup.mjs --keep-login` trashes them.
// Results: results/misread-audit.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, RESULTS } from './lib.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension/src');
const source = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const { context } = await launch({ headless: false });
const page = await context.newPage();
await page.setViewportSize({ width: 1600, height: 950 });

async function load(siteFile) {
  // The modules go into the page's own world under another name, apart from the extension.
  const code = ['core/keys.js', 'core/names.js', siteFile].map(source).join('\n;\n');
  await page.evaluate((c) => { const QH = {}; const globalThis_ = { QH }; new Function('globalThis', 'chrome', c)(globalThis_, { i18n: { getMessage: (k) => k }, storage: null }); window.__auditSites = globalThis_.QH.sites; }, code);
}
async function audit(siteId) {
  return page.evaluate((id) => {
    const site = window.__auditSites.find((s) => s.id === id);
    const SEL = 'button, [role="button"], [role="menuitem"], [role="tab"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [data-tooltip], .goog-toolbar-button, .goog-menuitem, a[href]';
    const seen = new Set();
    const rows = [];
    for (const el of document.querySelectorAll(SEL)) {
      if (!el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const own = (el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || el.getAttribute('title') || (el.textContent || '')).replace(/\s+/g, ' ').trim().slice(0, 40);
      let found = null;
      try { found = site.fromMouse({ target: el, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, shiftKey: false, detail: 1 }, false); } catch (e) { found = null; }
      if (!found || typeof found.then === 'function') continue;
      const key = own + '→' + found.id;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ own, id: found.id, label: found.label, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) });
    }
    return rows;
  }, siteId);
}
async function newFile(url, ready) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector(ready, { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.locator('.docs-title-input').click({ timeout: 15000 }).catch(() => {});
  await page.keyboard.press('Control+A');
  await page.keyboard.type(TITLE);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
}

const PAGES = [
  ['gmail', 'sites/gmail.js', async () => { await page.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForSelector('input[name="q"]', { timeout: 60000 }); await page.waitForTimeout(5000); }],
  ['calendar', 'sites/calendar.js', async () => { await page.goto('https://calendar.google.com/calendar/u/0/r/week', { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(7000); }],
  ['drive', 'sites/drive.js', async () => { await page.goto('https://drive.google.com/drive/my-drive', { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(7000); }],
  ['youtube', 'sites/youtube.js', async () => { await page.goto('https://www.youtube.com/watch?v=arj7oStGLkU', { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(7000); }],
  ['sheets', 'sites/google-editors.js', () => newFile('https://sheets.new', '#t-name-box')],
  ['docs', 'sites/google-editors.js', () => newFile('https://docs.new', '#boldButton')],
  ['slides', 'sites/google-editors.js', () => newFile('https://slides.new', '.docs-title-input')],
];
const all = {};
for (const [id, file, open] of PAGES) {
  try {
    await open();
    await load(file);
    all[id] = await audit(id);
    console.log(`\n[${id}] ${all[id].length}개`);
    for (const r of all[id]) console.log(`  ${r.own || '(이름 없음)'}  →  ${r.label} (${r.id})`);
  } catch (e) {
    console.log(`\n[${id}] 오류: ${e.message.split('\n')[0]}`);
  }
}
fs.writeFileSync(path.join(RESULTS, 'misread-audit.json'), JSON.stringify(all, null, 2));
await context.close();
