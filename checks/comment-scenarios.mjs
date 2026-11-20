// Typing in a comment box in Docs, Sheets and Slides: Ctrl+Enter there posts the
// comment (the box's own "댓글 올리기" button), not the editor's Ctrl+Enter (page break,
// fill range, start slideshow). Each app gets a new file, a comment and a reply, both
// posted with Ctrl+Enter, and the check records what Quickhand made of each key and
// whether the comment was posted. Run after changing how keys in editors are recognized.
//
// Only new files named "손빠르미 단축키 점검 문서 (지워도 됨)" are edited;
// `node cleanup.mjs --keep-login` moves them to the trash afterwards.
// Results: results/comment-scenarios.json and a table in the console.
// --probe: also print where the focus is in each box (to find the box's markup).
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS, keyFor } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const OUT = path.join(RESULTS, 'comment-scenarios.json');
const PROBE = process.argv.includes('--probe');
const ONLY = process.argv.find((a) => /^--only=/.test(a));
const APPS = (ONLY ? ONLY.slice(7).split(',') : ['docs', 'sheets', 'slides']);

const { context, worker } = await launch({ headless: false });
await worker.evaluate(() => chrome.storage.local.remove('qh_state'));
// No cheer cards (Docs sometimes stops saving with one on screen, as in docs-shortcuts.mjs):
// what Quickhand counted is read from its record.
await worker.evaluate(async () => {
  const { qh_settings } = await chrome.storage.sync.get('qh_settings');
  await chrome.storage.sync.set({ qh_settings: Object.assign({}, qh_settings, { praise: false }) });
});
// Where each Enter lands (to find the box's markup with --probe).
await context.addInitScript(() => {
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.') : '') +
    (el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '') + (el.getAttribute('aria-label') ? `[aria-label=${el.getAttribute('aria-label')}]` : '') + (el.isContentEditable ? '[editable]' : '');
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const out = [];
    for (let el = e.target, i = 0; el && el.tagName && i < 10; i++, el = el.parentElement) out.push(describe(el));
    (window.top.__enters = window.top.__enters || []).push(out);
  }, true);
});const page = await context.newPage();
page.setDefaultTimeout(15000);
await page.setViewportSize({ width: 1600, height: 900 });
const results = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

const focusPath = () => page.evaluate(() => {
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.') : '') +
    (el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '') + (el.isContentEditable ? '[editable]' : '');
  let el = document.activeElement;
  const out = [];
  if (el && el.tagName === 'IFRAME') {
    try { out.push('iframe> ' + describe(el.contentDocument.activeElement)); } catch (e) { out.push('iframe(other origin)'); }
  }
  for (let i = 0; el && i < 8; i++, el = el.parentElement) out.push(describe(el));
  return out;
});

// The comment text shown outside any text box (posted), by its words.
const posted = (text) => page.evaluate((t) => [...document.querySelectorAll('.docos-replyview-body, .docos-anchoreddocoview-content, [class*="docos"]')]
  .some((e) => !e.closest('[contenteditable="true"], textarea') && !e.querySelector('[contenteditable="true"], textarea') && (e.textContent || '').includes(t)), text);

async function open(app) {
  const url = { docs: 'https://docs.new', sheets: 'https://sheets.new', slides: 'https://slides.new' }[app];
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.docs-title-input', { timeout: 60000 });
  await page.waitForTimeout(4000);
  console.log(app, 'test file:', page.url());
  await page.locator('.docs-title-input').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(TITLE);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  // Something to comment on, selected.
  if (app === 'docs') {
    await page.locator('.kix-appview-editor').click({ position: { x: 500, y: 150 } });
    await page.keyboard.type('댓글 점검 문단입니다');
    await page.keyboard.press(keyFor('Control+Shift+ArrowLeft', 'docs'));
  } else if (app === 'sheets') {
    // A new sheet may open with the Gemini panel, which keeps the focus.
    const close = page.locator('[aria-label="닫기"], [aria-label="Close"]').filter({ visible: true });
    if (await close.count()) await close.last().click().catch(() => {});
    await page.waitForTimeout(800);
    const box = page.locator('#t-name-box');
    await box.click(); await box.fill('A1'); await box.press('Enter');
    await page.waitForTimeout(400);
    await page.keyboard.type('check'); await page.keyboard.press('Enter');
    // A click on A1 itself: after the name box the grid did not take Ctrl+Alt+M.
    const a1 = await page.locator('#t-name-box').boundingBox();
    await page.mouse.click(a1.x + 90, a1.y + 50);
  } else {
    // The title placeholder of the first slide.
    const title = page.locator('#workspace .sketchy-text-content-wrapper, #workspace [id$="-title"]').first();
    await page.mouse.dblclick(800, 330);
    await page.waitForTimeout(500);
    await page.keyboard.type('댓글 점검');
    await page.keyboard.press(keyFor('Control+A', 'slides'));
    void title;
  }
  await page.waitForTimeout(800);
}

async function step(app, name, keys, expected, text) {
  await page.evaluate(() => { window.__enters = []; });
  const r = await check(page, worker, `${app} ${name}`, async () => { for (const k of keys) await page.keyboard.press(k); });
  const ok = await posted(text);
  if (PROBE) console.log(app, name, 'Enter target:', JSON.stringify(await page.evaluate(() => window.__enters)));
  const row = { app, name, expected, recognized: r.recognized, card: r.card, posted: ok, pass: r.recognized === expected && ok };
  results.push(row);
  save();
  return row;
}

for (const app of APPS) {
  await open(app);
  // A new comment: Ctrl+Alt+M, type, Ctrl+Enter.
  await page.keyboard.press(keyFor('Control+Alt+KeyM', app));
  await page.waitForTimeout(2000);
  if (PROBE) console.log(app, 'new comment box:', JSON.stringify(await focusPath()));
  await page.keyboard.type('점검 댓글 하나');
  await page.waitForTimeout(500);
  await step(app, '새 댓글 Ctrl+Enter', [keyFor('Control+Enter', app)], `${app}:comment:mod+enter`, '점검 댓글 하나');
  await page.waitForTimeout(1500);
  // A reply: clicking the posted comment opens its reply box.
  const card = page.locator('.docos-anchoreddocoview').filter({ hasText: '점검 댓글 하나', visible: true }).last();
  if (await card.count()) await card.getByText('점검 댓글 하나').last().click().catch(() => {});
  await page.waitForTimeout(1200);
  const reply = page.locator('.docos-input-textarea').filter({ visible: true }).last();
  if (await reply.count()) {
    // Away from the avatar, whose person card would cover the box.
    await page.mouse.move(5, 450);
    await page.waitForTimeout(800);
    await reply.click({ force: true });
    await page.waitForTimeout(800);
    if (PROBE) console.log(app, 'reply box:', JSON.stringify(await focusPath()));
    await page.keyboard.type('점검 답글 둘');
    await page.waitForTimeout(500);
    await step(app, '답글 Ctrl+Enter', [keyFor('Control+Enter', app)], `${app}:comment:mod+enter`, '점검 답글 둘');
  } else {
    console.log(app, 'no reply box found');
    results.push({ app, name: '답글 Ctrl+Enter', expected: `${app}:comment:mod+enter`, error: 'no reply box' });
    save();
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  // Outside the comment box Ctrl+Enter keeps its editor meaning (Slides: only on a Mac).
  if (app === 'docs') {
    await page.locator('.kix-appview-editor').click({ position: { x: 500, y: 150 } });
    await page.keyboard.press('End');
    const r = await check(page, worker, 'docs 본문 Ctrl+Enter', () => page.keyboard.press(keyFor('Control+Enter', app)));
    results.push({ app, name: '본문 Ctrl+Enter', expected: 'docs:mod+enter', recognized: r.recognized, posted: '-', pass: r.recognized === 'docs:mod+enter' });
    await page.keyboard.press(keyFor('Control+KeyZ', app));
  } else if (app === 'sheets') {
    const box = page.locator('#t-name-box');
    await box.click(); await box.fill('B2'); await box.press('Enter');
    await page.waitForTimeout(400);
    const r = await check(page, worker, 'sheets 셀 Ctrl+Enter', () => page.keyboard.press(keyFor('Control+Enter', app)));
    results.push({ app, name: '셀 Ctrl+Enter', expected: 'sheets:mod+enter', recognized: r.recognized, posted: '-', pass: r.recognized === 'sheets:mod+enter' });
  }
  save();
}

console.log('\n앱\t단계\t인식\t게시됨\t결과');
for (const r of results) console.log([r.app, r.name, r.recognized, r.posted, r.pass ? '통과' : '실패'].join('\t'));
await context.close();
