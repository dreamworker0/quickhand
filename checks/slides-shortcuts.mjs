// Every shortcut on Google Slides' help page (support.google.com/docs/answer/1696717,
// PC): press it in a test presentation and record (1) what changed, so a person can
// tell whether Slides reacted, and (2) whether Quickhand counted it.
//
// Signals: Slides' screen reader announcements (screen reader support is turned on at
// the start and off again at the end), the current slide (address), the number of
// slides, toolbar state, open dialogs/menus/panels, the focused element, and the text
// of the presentation (its read-only "export as text").
//
// Only a new presentation named "손빠르미 단축키 점검 문서 (지워도 됨)" is edited. Print
// is stubbed. --from=CODE resumes at that test; --only=C,N14,P1 runs just those tests
// (a letter alone means every test starting with it) and replaces their old results.
// Results: results/slides-shortcuts.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { launch, RESULTS, keyFor, shownFor, twoStep } from './lib.mjs';

const TITLE = '손빠르미 단축키 점검 문서 (지워도 됨)';
const OUT = path.join(RESULTS, 'slides-shortcuts.json');
const IMAGE = path.join(RESULTS, '..', '..', 'extension', 'assets', 'icons', 'icon-128.png');
const VIDEO = 'https://www.youtube.com/watch?v=arj7oStGLkU';

const { context, worker } = await launch({ headless: false });
// No cheer cards, as in docs-shortcuts.mjs: with one on screen, keys pressed by
// Playwright sometimes left the editor saying its changes weren't saved (Mac).
await worker.evaluate(async () => {
  const { qh_settings } = await chrome.storage.sync.get('qh_settings');
  await chrome.storage.sync.set({ qh_settings: Object.assign({}, qh_settings, { praise: false }) });
});
await context.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
const page = await context.newPage();
// Keys are written as on Windows; on a Mac every press goes through keyFor() (lib.mjs).
const pressKey = page.keyboard.press.bind(page.keyboard);
page.keyboard.press = (k, opts) => pressKey(keyFor(k, 'slides'), opts);
page.setDefaultTimeout(10000);
page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
await page.setViewportSize({ width: 1700, height: 950 });
const FROM = (process.argv.find((a) => a.startsWith('--from=')) || '').slice(7);
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const picked = (n) => ONLY.some((o) => (/^[A-Z]$/.test(o) ? n.startsWith(o) : n === o));
const RESUMING = !!(FROM || ONLY.length);
let started = !FROM;
const previous = RESUMING && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const results = ONLY.length ? previous.filter((r) => !picked(r.n))
  : FROM ? previous.slice(0, Math.max(0, previous.findIndex((r) => r.n === FROM))) : [];
const save = () => fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

// ---------------------------------------------------------------- measuring
const NOISE = /^(저장 중…|드라이브에 저장됨|로드 중.*|다음에 (관한|대한) .*\.\.\.|내 드라이브를 검색하여 .*|.)$/;
// Watches the page and, while presenting, the presentation frame too.
async function startLive() {
  await page.evaluate(() => {
    const pf = document.querySelector('iframe.punch-present-iframe');
    for (const doc of [document, pf && pf.contentDocument].filter(Boolean)) {
      if (doc.__liveObserver || !doc.body) continue;
      doc.__liveObserver = new MutationObserver((ms) => {
        for (const m of ms) {
          const n = m.target.nodeType === 1 ? m.target : m.target.parentElement;
          const t = n && (n.textContent || '').trim();
          if (t && t.length < 200) window.__live.push(t);
        }
      });
      doc.__liveObserver.observe(doc.body, { subtree: true, childList: true, characterData: true });
    }
    window.__live = [];
  }).catch(() => {});
}
const takeLive = (src) => page.evaluate((s) => {
  const noise = new RegExp(s);
  return [...new Set(window.__live || [])].filter((t) => !noise.test(t)).slice(-8);
}, src).catch(() => []);

const state = () => page.evaluate(() => {
  const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const a = document.activeElement;
  return {
    slide: (location.href.match(/slide=([^&#]+)/) || [])[1] || '',
    slides: document.querySelectorAll('.punch-filmstrip-thumbnail').length,
    // Selected slides get a drag overlay (and a thick border).
    picked: document.querySelectorAll('.punch-filmstrip-thumbnail-drag-overlay').length,
    pressed: [...document.querySelectorAll('#docs-toolbar [aria-pressed="true"], .docs-toolbar [aria-pressed="true"]')].map((e) => e.id).join(','),
    zoom: (document.querySelector('#zoomSelect input, [aria-label*="확대/축소"] input') || {}).value || '',
    menubar: vis(document.querySelector('#docs-menubar')),
    dialogs: [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal-dialog')].filter(vis)
      .map((d) => (d.getAttribute('aria-label') || d.innerText.split('\n')[0] || '').slice(0, 30)).join(' | '),
    menus: [...document.querySelectorAll('.goog-menu, [role="menu"]')].filter(vis).map((m) => (m.innerText.split('\n')[0] || '').slice(0, 15)).join(' | '),
    panels: [...document.querySelectorAll('[role="complementary"], .docs-companion-app-container, .docos-stream-view, .punch-speaker-notes, #docs-revisions-sidebar')]
      .filter(vis).map((p) => (p.getAttribute('aria-label') || p.className.split(' ')[0] || '').slice(0, 30)).join(' | '),
    active: a ? [a.tagName.toLowerCase(), a.getAttribute('aria-label'), a.getAttribute('role'), (a.className || '').toString().split(' ')[0]].filter(Boolean).join(' ').slice(0, 50) : '',
    // The comment card that has the focus, by its text (every card has the same label).
    comment: (() => { const c = a && a.closest && a.closest('.docos-anchoreddocoview'); return c ? (c.innerText.match(/[^\n]*comment[^\n]*/) || [''])[0].slice(0, 40) : ''; })(),
    comments: [...document.querySelectorAll('.docos-anchoreddocoview')].filter(vis).length,
    crop: !!document.querySelector('[aria-label="이미지 자르기"]:is([aria-pressed="true"], [aria-checked="true"])'),
    present: !!document.querySelector('.punch-present-iframe, iframe.punch-present-iframe') || !!document.fullscreenElement,
    // What the presentation frame shows (its visible elements and text), as a short hash.
    view: (() => {
      const pd = (document.querySelector('iframe.punch-present-iframe') || {}).contentDocument;
      if (!pd || !pd.body) return '';
      const shown = [...pd.body.querySelectorAll('*')].filter((e) => {
        const cs = pd.defaultView.getComputedStyle(e);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && e.getClientRects().length;
      }).map((e) => (e.getAttribute('class') || e.tagName) + (e.children.length ? '' : (e.textContent || '').slice(0, 20))).join('|');
      let h = 0;
      for (let i = 0; i < shown.length; i++) h = (h * 31 + shown.charCodeAt(i)) | 0;
      return (h >>> 0).toString(16);
    })(),
    full: !!(document.fullscreenElement || ((document.querySelector('iframe.punch-present-iframe') || {}).contentDocument || {}).fullscreenElement),
    printed: window.__printed || 0,
  };
}).catch(() => ({ error: 'no page' }));

let fileUrl = '';
async function content() {
  await page.waitForTimeout(2500);
  const res = await page.request.get(fileUrl.replace(/\/edit.*$/, '/export/txt'));
  const text = (await res.text()).replace(/\s+/g, ' ').trim();
  return { hash: crypto.createHash('md5').update(text).digest('hex').slice(0, 8), text: text.slice(0, 200) };
}
function diff(b, a) {
  const out = [];
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${JSON.stringify(b[k]).slice(0, 60)} → ${JSON.stringify(a[k]).slice(0, 60)}`);
  return out;
}
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).filter((l) => l.at >= t && l.input === 'key').pop();
    return e ? e.id : null;
  }, since);
}

async function test(n, keyLabel, action, keys, { prepare, expect, body = false, after, wait = 1500, alt } = {}) {
  if (!started && n === FROM) started = true;
  if (!started || (ONLY.length && !picked(n))) return { n, slides: null };
  const r = { n, key: shownFor(keyLabel, 'slides'), action, slides: null, live: [], changed: [], quickhand: null, error: null };
  try {
    await recover();
    if (prepare) await prepare();
    const before = await state();
    const cBefore = body ? await content() : null;
    await startLive();
    const since = Date.now();
    for (const k of [].concat(keys)) {
      if (typeof k === 'function') await k(); else await page.keyboard.press(k);
      await page.waitForTimeout(200);
    }
    r.pressed = true;
    await page.waitForTimeout(wait);
    const now = await state();
    r.live = await takeLive(NOISE.source);
    r.changed = diff(before, now);
    if (context.pages().length > 1) r.changed.push(`pages: ${context.pages().length}`);
    if (body) {
      const cAfter = await content();
      if (cAfter.hash !== cBefore.hash) r.changed.push('content: ' + cAfter.text.slice(0, 120));
    }
    r.quickhand = await quickhandSaw(since);
    if (expect instanceof RegExp) r.slides = r.live.some((t) => expect.test(t)) || r.changed.some((c) => expect.test(c));
    else if (Array.isArray(expect)) r.slides = r.changed.some((c) => expect.some((k) => c.startsWith(k)));
    else r.slides = r.live.length > 0 || r.changed.length > 0;
  } catch (e) {
    r.error = e.message.split('\n')[0];
  }
  try {
    if (after) await after(r);
  } catch (e) {
    r.error = (r.error ? r.error + ' / ' : '') + '정리 실패: ' + e.message.split('\n')[0];
  }
  results.push(r);
  console.log(JSON.stringify(r));
  save();
  if (alt && r.slides === false) return test(n, keyLabel, action + ' (두 번째 키만 따로)', alt, { prepare, expect, body, after, wait });
  return r;
}
function skip(n, key, action, why) {
  if (!started || (ONLY.length && !picked(n))) return;
  const r = { n, key, action, slides: null, live: [], changed: [], quickhand: null, error: null, skipped: why };
  results.push(r);
  console.log(JSON.stringify(r));
  save();
}

// ---------------------------------------------------------------- moving around
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(400); };
const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const seq = (a, b) => twoStep(a, b); // Ctrl+Alt held (Mac: Control+⌘)
const seqShift = (a, b) => twoStep(a, b, { shift: true });
const loose = (keys) => [keys[0], keys[1].replace(/^Control\+(Alt|Meta)\+(Shift\+)?/, '')];
async function closeExtraPages() { for (const p of context.pages()) if (p !== page) await p.close().catch(() => {}); }
// Slides sometimes answers a run of quick edits with a save error that blocks the page.
async function recover() {
  const box = page.getByRole('button', { name: '새로고침', exact: true }).filter({ visible: true });
  if (!(await box.count().catch(() => 0))) return;
  console.log('save error; reloading');
  await box.first().click().catch(() => {});
  await page.waitForSelector('#docs-menubar', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(4000);
}
// The slide list on the left, with slide i (0-based) selected and focused.
async function filmstrip(i = 0) {
  await closeExtraPages();
  const thumbs = page.locator('.punch-filmstrip-thumbnail').filter({ visible: true });
  const n = await thumbs.count();
  await thumbs.nth(Math.min(i, n - 1)).click();
  await page.waitForTimeout(500);
}
// The title box on slide i: click into its text and select the words. The slide on the
// canvas is g#editor-<page>; its boxes are g#editor-<box> (the title is the topmost).
async function inText(i = 0) {
  await filmstrip(i);
  const at = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('g[id^="editor-"]')]
      .filter((g) => !/-bg$|-paragraph-/.test(g.id))
      .map((g) => ({ g, r: g.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    if (!boxes.length) return null;
    const whole = boxes.reduce((a, b) => (b.r.width * b.r.height > a.r.width * a.r.height ? b : a));
    const top = boxes.filter((b) => b !== whole).sort((a, b) => a.r.y - b.r.y)[0] || whole;
    return { x: top.r.x + top.r.width / 2, y: top.r.y + top.r.height / 2 };
  });
  if (!at) throw new Error('no text box on the slide');
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(600);
  await page.keyboard.press('Control+KeyA');
  await page.waitForTimeout(300);
}
// The middle (and size) of an object on the current slide: the nth box from the top, the
// table (lines but no text) or the picture.
async function objectAt(kind, nth = 0) {
  const at = await page.evaluate(([kind, nth]) => {
    const boxes = [...document.querySelectorAll('g[id^="editor-"]')]
      .filter((g) => !/-bg$|-paragraph-/.test(g.id))
      .map((g) => ({ g, r: g.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    if (!boxes.length) return null;
    const whole = boxes.reduce((a, b) => (b.r.width * b.r.height > a.r.width * a.r.height ? b : a));
    const parts = boxes.filter((b) => b !== whole).sort((a, b) => a.r.y - b.r.y);
    const fit = kind === 'table' ? parts.filter((b) => !b.g.querySelector('text') && b.g.querySelectorAll('path').length >= 8)
      : kind === 'image' ? parts.filter((b) => b.g.querySelector('image')) : parts;
    const b = fit[nth];
    return b ? { x: b.r.x + b.r.width / 2, y: b.r.y + b.r.height / 2, w: b.r.width, h: b.r.height } : null;
  }, [kind, nth]);
  if (!at) throw new Error(`no ${kind} on the slide`);
  return at;
}
// Back to the test presentation after a key that left it (HTML view, version history).
async function reopen() {
  await closeExtraPages();
  await page.goto(fileUrl, { timeout: 60000 });
  await page.waitForSelector('#docs-menubar', { state: 'attached', timeout: 60000 });
  await page.waitForTimeout(4000);
  if (!(await page.locator('#docs-menubar').isVisible())) { await page.keyboard.press('Control+Shift+KeyF'); await page.waitForTimeout(1000); }
}
// The same box as an object (selected, not editing its text).
async function onShape(i = 0) { await inText(i); await esc(); await page.waitForTimeout(400); }
const MENUS = { 파일: '#docs-file-menu', 수정: '#docs-edit-menu', 보기: '#docs-view-menu', 삽입: '#docs-insert-menu', 서식: '#docs-format-menu', 슬라이드: '#punch-slide-menu', 정렬: '#docs-arrange-menu', 도구: '#docs-tools-menu' };
async function menu(top, ...items) {
  await esc(); await esc();
  await visible(MENUS[top]).click();
  await page.waitForTimeout(500);
  for (const [i, item] of items.entries()) {
    const it = visible('.goog-menuitem, [role="menuitem"]', { hasText: item });
    if (i < items.length - 1) { await it.hover(); await page.waitForTimeout(700); } else await it.click();
  }
  await page.waitForTimeout(1000);
}
async function screenReader(on) {
  for (let i = 0; i < 2; i++) {
    await filmstrip(0);
    await startLive();
    await page.keyboard.press('Control+Alt+KeyZ');
    await page.waitForTimeout(1500);
    const said = (await takeLive('^$')).join(' ');
    if (on ? /사용 설정/.test(said) : /사용 중지/.test(said)) return;
  }
  console.log('screen reader support could not be set to', on);
}

// ---------------------------------------------------------------- the test presentation
await page.goto('https://slides.new', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.docs-title-input', { state: 'attached', timeout: 60000 });
await page.waitForTimeout(6000);
if (!(await page.locator('.docs-title-input').isVisible())) { await page.keyboard.press('Control+Shift+KeyF'); await page.waitForTimeout(1500); }
fileUrl = page.url();
console.log('test presentation:', fileUrl);
await page.locator('.docs-title-input').click();
await page.keyboard.press('Control+A');
await page.keyboard.type(TITLE);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
// Slide 1's title box gets text; ASCII avoids the first Korean letter being dropped.
await inText(0);
await page.keyboard.type('Quickhand check slide one teh');
await page.keyboard.press('Enter');
await page.keyboard.type('second line');
await esc(); await esc();
await page.waitForTimeout(800);
// Three slides (a full run makes them with Ctrl+M itself).
if (RESUMING) for (let i = 0; i < 2; i++) { await filmstrip(0); await page.keyboard.press('Control+KeyM'); await page.waitForTimeout(1500); }

if (!RESUMING) await test('R2', 'Ctrl + Alt + Z', '스크린 리더 지원 사용', 'Control+Alt+KeyZ', { prepare: () => filmstrip(0), expect: /사용 설정/ });
else await screenReader(true);

// ---------------------------------------------------------------- 대표적인 작업
await test('A1', 'Ctrl + M', '새 슬라이드', 'Control+KeyM', { prepare: () => filmstrip(0), expect: ['slides', 'slide'] });
await test('A1', 'Ctrl + M', '새 슬라이드 (셋째)', 'Control+KeyM', { prepare: () => filmstrip(1), expect: ['slides', 'slide'] });
await test('A2', 'Ctrl + D', '슬라이드 복사', 'Control+KeyD', { prepare: () => filmstrip(0), expect: ['slides', 'slide'] });
await test('A3', 'Ctrl + Z', '실행취소', 'Control+KeyZ', { prepare: () => filmstrip(0), expect: ['slides', 'slide'] });
await test('A4', 'Ctrl + Y', '재실행', 'Control+KeyY', { prepare: () => filmstrip(0), expect: ['slides', 'slide'] });
await test('A3', 'Ctrl + Z', '실행취소', 'Control+KeyZ', { prepare: () => filmstrip(0) });
await test('A4', 'Ctrl + Shift + Z', '재실행 (다른 키)', 'Control+Shift+KeyZ', { prepare: () => filmstrip(0), expect: ['slides', 'slide'] });
await test('A5', 'Ctrl + C', '복사', 'Control+KeyC', { prepare: () => filmstrip(0), expect: /복사/ });
await test('A7', 'Ctrl + V', '붙여넣기', 'Control+KeyV', { prepare: () => filmstrip(1), expect: ['slides'] });
await test('A6', 'Ctrl + X', '잘라내기', 'Control+KeyX', { prepare: () => filmstrip(2), expect: ['slides'] });
await test('A8', 'Ctrl + Alt + C', '서식 복사', 'Control+Alt+KeyC', { prepare: () => inText(0), expect: /서식|복사/ });
await test('A9', 'Ctrl + Alt + V', '서식 붙여넣기', 'Control+Alt+KeyV', { prepare: () => inText(0), expect: /서식|붙여/ });
await test('A10', 'Ctrl + K', '링크 삽입', 'Control+KeyK', { prepare: () => inText(0), expect: ['dialogs', 'active'],
  after: async () => { await page.keyboard.type('https://www.google.com'); await page.keyboard.press('Enter'); await page.waitForTimeout(1000); await esc(); } });
await test('A11', 'Alt + Enter', '링크 열기', 'Alt+Enter', { prepare: async () => { await inText(0); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); }, expect: ['pages'], wait: 3000, after: closeExtraPages });
await test('A13', 'Ctrl + A', '모두 선택', 'Control+KeyA', { prepare: () => onShape(0), expect: /선택/ });
await test('A14', 'Ctrl + Alt + U, A', '선택 안함', seq('KeyU', 'KeyA'), { prepare: async () => { await onShape(0); await page.keyboard.press('Control+KeyA'); }, expect: /선택|해제/, alt: loose(seq('KeyU', 'KeyA')) });
await test('A15', 'Ctrl + F', '찾기', 'Control+KeyF', { prepare: () => filmstrip(0), expect: ['dialogs', 'active', 'panels'], after: esc });
await test('A16', 'Ctrl + H', '찾기 및 바꾸기', 'Control+KeyH', { prepare: () => filmstrip(0), expect: ['dialogs', 'active'], after: esc });
await test('A17', 'Ctrl + G', '다시 찾기', 'Control+KeyG', { prepare: async () => { await filmstrip(0); await page.keyboard.press('Control+KeyF'); await page.waitForTimeout(800); await page.keyboard.type('check'); await page.keyboard.press('Enter'); await page.waitForTimeout(800); } });
await test('A18', 'Ctrl + Shift + G', '이전 찾기', 'Control+Shift+KeyG', { after: esc });
await test('A19', 'Ctrl + O', '열기', 'Control+KeyO', { prepare: () => filmstrip(0), expect: ['dialogs', 'active'], wait: 3000, after: esc });
await test('A20', 'Ctrl + P', '인쇄', 'Control+KeyP', { prepare: () => filmstrip(0), expect: ['printed', 'dialogs', 'url', 'active'], wait: 5000, after: esc });
await test('A21', 'Ctrl + S', '저장', 'Control+KeyS', { prepare: () => filmstrip(0) });
await test('A22', 'Ctrl + /', '단축키 표시', 'Control+Slash', { prepare: () => filmstrip(0), expect: ['dialogs'], after: esc });
await test('A23', 'Alt + /', '메뉴 검색', 'Alt+Slash', { prepare: () => filmstrip(0), expect: ['active', 'menus'], after: esc });
await test('A23', 'Alt + Z', '메뉴 검색 (Chrome)', 'Alt+KeyZ', { prepare: () => filmstrip(0), expect: ['active', 'menus'], after: esc });
await test('A24', 'Ctrl + Shift + F', '메뉴 숨기기', 'Control+Shift+KeyF', { prepare: () => filmstrip(0), expect: ['menubar'] });
await test('A24', 'Ctrl + Shift + F', '메뉴 다시 보이기', 'Control+Shift+KeyF', { prepare: () => filmstrip(0), expect: ['menubar'] });
skip('A25', 'Ctrl + Shift + C', '발표 중 자막', '마이크를 써서 누르지 않음 (발표 섹션에서도 같은 키)');

// ---------------------------------------------------------------- 슬라이드 작업 (슬라이드 목록에서)
const strip = (n, key, action, k, from, ex = ['slide', 'slides', 'picked']) => test(n, key, action, k, { prepare: () => filmstrip(from), expect: ex });
await strip('S1', 'Page Up', '이전 슬라이드', 'PageUp', 2);
await strip('S1', '↑', '이전 슬라이드 (다른 키)', 'ArrowUp', 2);
await strip('S2', 'Page Down', '다음 슬라이드', 'PageDown', 0);
await strip('S2', '↓', '다음 슬라이드 (다른 키)', 'ArrowDown', 0);
await strip('S3', 'Home', '첫 번째 슬라이드로', 'Home', 2);
await strip('S4', 'End', '마지막 슬라이드로', 'End', 0);
await strip('S5', 'Ctrl + ↑', '슬라이드 위로 이동', 'Control+ArrowUp', 1, /이동|slide/);
await strip('S6', 'Ctrl + ↓', '슬라이드 아래로 이동', 'Control+ArrowDown', 0, /이동|slide/);
await strip('S7', 'Ctrl + Shift + ↑', '슬라이드를 처음으로', 'Control+Shift+ArrowUp', 2, /이동|slide/);
await strip('S8', 'Ctrl + Shift + ↓', '슬라이드를 끝으로', 'Control+Shift+ArrowDown', 0, /이동|slide/);
await strip('S9', 'Shift + ↑', '이전 슬라이드 선택', 'Shift+ArrowUp', 2, ['picked']);
await strip('S10', 'Shift + ↓', '다음 슬라이드 선택', 'Shift+ArrowDown', 0, ['picked']);
await strip('S11', 'Shift + Home', '첫 번째 슬라이드까지 선택', 'Shift+Home', 2, ['picked']);
await strip('S12', 'Shift + End', '마지막 슬라이드까지 선택', 'Shift+End', 0, ['picked']);

// ---------------------------------------------------------------- 텍스트
const txt = (n, key, action, k, re) => test(n, key, action, k, { prepare: () => inText(0), expect: re });
await txt('T1', 'Ctrl + B', '굵게', 'Control+KeyB', /굵게|pressed/);
await txt('T2', 'Ctrl + I', '기울임꼴', 'Control+KeyI', /기울임|pressed/);
await txt('T3', 'Ctrl + U', '밑줄', 'Control+KeyU', /밑줄|pressed/);
await txt('T4', 'Ctrl + ,', '아래첨자', 'Control+Comma', /첨자/);
await txt('T5', 'Ctrl + .', '윗첨자', 'Control+Period', /첨자/);
await txt('T6', 'Alt + Shift + 5', '취소선', 'Alt+Shift+Digit5', /취소선/);
await txt('T7', 'Ctrl + \\', '서식 지우기', 'Control+Backslash', /서식|pressed/);
await txt('T7', 'Ctrl + Space', '서식 지우기 (다른 키)', 'Control+Space', /서식|pressed/);
await txt('T8', 'Ctrl + Shift + >', '글꼴 크기 크게', 'Control+Shift+Period', /크기|포인트/);
await txt('T9', 'Ctrl + Shift + <', '글꼴 크기 작게', 'Control+Shift+Comma', /크기|포인트/);
await txt('T10', 'Ctrl + Shift + L', '왼쪽 맞춤', 'Control+Shift+KeyL', /왼쪽|맞춤|정렬/);
await txt('T11', 'Ctrl + Shift + R', '오른쪽 맞춤', 'Control+Shift+KeyR', /오른쪽|맞춤|정렬/);
await txt('T12', 'Ctrl + Shift + E', '가운데 맞춤', 'Control+Shift+KeyE', /가운데|맞춤|정렬/);
await txt('T13', 'Ctrl + Shift + J', '양쪽 맞춤', 'Control+Shift+KeyJ', /양쪽|맞춤|정렬/);
await txt('T16', 'Ctrl + ]', '들여쓰기', 'Control+BracketRight', /들여쓰기/);
await txt('T17', 'Ctrl + [', '내어쓰기', 'Control+BracketLeft', /들여쓰기|내어/);
await txt('T18', 'Ctrl + Shift + 8', '글머리기호 목록', 'Control+Shift+Digit8', /목록|글머리/);
await test('T15', 'Alt + Shift + ↑', '단락 위로 이동', 'Alt+Shift+ArrowUp', { prepare: async () => { await inText(0); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('second line'); }, expect: /./, body: true });
await test('T14', 'Alt + Shift + ↓', '단락 아래로 이동', 'Alt+Shift+ArrowDown', { prepare: async () => { await inText(0); await page.keyboard.press('Control+Home'); }, expect: /./, body: true });
await test('T20', 'Ctrl + Alt + Shift + E, I', '목록 항목 선택', seqShift('KeyE', 'KeyI'), { prepare: async () => { await inText(0); await page.keyboard.press('Control+Home'); }, expect: /선택/, alt: loose(seqShift('KeyE', 'KeyI')) });
await test('T21', 'Ctrl + Alt + Shift + E, O', '현재 수준 목록 항목 선택', seqShift('KeyE', 'KeyO'), { prepare: async () => { await inText(0); await page.keyboard.press('Control+Home'); }, expect: /선택/, alt: loose(seqShift('KeyE', 'KeyO')) });
await txt('T19', 'Ctrl + Shift + 7', '번호 매기기 목록', 'Control+Shift+Digit7', /목록|번호/);
await test('T22', 'Ctrl + Alt + N, W', '다음 서식 변경으로', seq('KeyN', 'KeyW'), { prepare: async () => { await inText(0); await page.keyboard.press('Control+Home'); }, expect: /./, alt: loose(seq('KeyN', 'KeyW')) });
await test('T23', 'Ctrl + Alt + P, W', '이전 서식 변경으로', seq('KeyP', 'KeyW'), { prepare: async () => { await inText(0); await page.keyboard.press('Control+End'); }, expect: /./, alt: loose(seq('KeyP', 'KeyW')) });
await test('T24', "Ctrl + '", '다음 철자 오류로', 'Control+Quote', { prepare: async () => { await inText(0); await page.keyboard.press('Control+Home'); }, expect: /teh|맞춤법|철자/ });
await test('T25', 'Ctrl + ;', '이전 철자 오류로', 'Control+Semicolon', { prepare: async () => { await inText(0); await page.keyboard.press('Control+End'); }, expect: /teh|맞춤법|철자/ });

// ---------------------------------------------------------------- 탐색
await test('N1', 'Ctrl + +', '확대', 'Control+Equal', { prepare: () => filmstrip(0), expect: /확대|zoom/ });
await test('N2', 'Ctrl + -', '축소', 'Control+Minus', { prepare: () => filmstrip(0), expect: /축소|확대|zoom/ });
await test('N3', 'Ctrl + 0', '100%로', 'Control+Digit0', { prepare: () => filmstrip(0), expect: /100|확대|zoom/ });
await test('N4', 'Ctrl + Alt + Shift + F', '슬라이드(목록)로 이동', 'Control+Alt+Shift+KeyF', { prepare: () => onShape(0), expect: ['active'] });
await test('N5', 'Ctrl + Alt + Shift + C', '캔버스로 이동', 'Control+Alt+Shift+KeyC', { prepare: () => filmstrip(0), expect: ['active'] });
await test('N6', 'Ctrl + Alt + Shift + S', '발표자 노트 열기', 'Control+Alt+Shift+KeyS', { prepare: () => filmstrip(0), expect: ['active', 'panels'] });
await test('N7', 'Ctrl + Alt + Shift + P', 'HTML 보기로', 'Control+Alt+Shift+KeyP', { prepare: () => filmstrip(0), expect: ['pages', 'url', 'dialogs', 'active', 'error'], wait: 3000, after: reopen });
await test('N8', 'Ctrl + Alt + Shift + B', '애니메이션 패널', 'Control+Alt+Shift+KeyB', { prepare: () => onShape(0), expect: ['panels', 'active', 'dialogs'], after: esc });
await test('N10', 'Ctrl + Alt + Shift + I', '탐색 열기', 'Control+Alt+Shift+KeyI', { prepare: () => filmstrip(0), expect: ['panels', 'active', 'dialogs'], wait: 2500, after: esc });
await test('N11', 'Ctrl + Alt + .', '측면 패널로 이동', 'Control+Alt+Period', { prepare: () => filmstrip(0), expect: ['active', 'panels'] });
await test('N11', 'Ctrl + Alt + ,', '측면 패널로 이동 (반대)', 'Control+Alt+Comma', { prepare: () => filmstrip(0), expect: ['active', 'panels'] });
await test('N12', 'Ctrl + Shift + Y', '사전', 'Control+Shift+KeyY', { prepare: () => inText(0), expect: ['panels', 'active', 'dialogs'], wait: 2500, after: esc });
await test('N13', 'Ctrl + Alt + Shift + H', '업데이트 기록', 'Control+Alt+Shift+KeyH', { prepare: () => filmstrip(0), expect: ['url', 'panels', 'menubar', 'dialogs'], wait: 4000,
  after: reopen });
await test('N17', 'Esc', '현재 모드 종료', 'Escape', { prepare: () => inText(0), expect: ['active'] });

// ---------------------------------------------------------------- 메뉴
const menuKey = (n, key, action, k) => test(n, key, action, k, { prepare: () => filmstrip(0), expect: ['menus', 'active'], after: esc });
await menuKey('U1', 'Ctrl + Shift + \\', '컨텍스트 메뉴', 'Control+Shift+Backslash');
await menuKey('U1', 'Ctrl + Shift + X', '컨텍스트 메뉴 (다른 키)', 'Control+Shift+KeyX');
await menuKey('U1', 'Shift + F10', '컨텍스트 메뉴 (다른 키)', 'Shift+F10');
await menuKey('U2', 'Alt + F', '파일 메뉴', 'Alt+KeyF');
await menuKey('U3', 'Alt + E', '수정 메뉴', 'Alt+KeyE');
await menuKey('U4', 'Alt + V', '보기 메뉴', 'Alt+KeyV');
await menuKey('U5', 'Alt + I', '삽입 메뉴', 'Alt+KeyI');
await menuKey('U6', 'Alt + O', '서식 메뉴', 'Alt+KeyO');
await menuKey('U7', 'Alt + T', '도구 메뉴', 'Alt+KeyT');
await menuKey('U8', 'Alt + H', '도움말 메뉴', 'Alt+KeyH');
await menuKey('U9', 'Alt + A', '접근성 메뉴', 'Alt+KeyA');
await menuKey('U10', 'Ctrl + Alt + Shift + K', '입력기 메뉴', 'Control+Alt+Shift+KeyK');
await test('U11', 'Ctrl + Shift + K', '입력 컨트롤 전환', 'Control+Shift+KeyK', { prepare: () => inText(0), expect: /입력 도구/,
  // Undo it (a Korean UI turns input tools on with this key).
  after: async (r) => { if (r.pressed) { await page.keyboard.press('Control+Shift+KeyK'); await page.waitForTimeout(800); } } });

// ---------------------------------------------------------------- 객체 (제목 상자를 도형으로)
const obj = (n, key, action, k, re = /./) => test(n, key, action, k, { prepare: () => onShape(0), expect: re });
await obj('O3', 'Ctrl + Alt + G', '그룹', 'Control+Alt+KeyG', /그룹/);
await obj('O4', 'Ctrl + Alt + Shift + G', '그룹 해제', 'Control+Alt+Shift+KeyG', /그룹/);
await obj('O6', 'Ctrl + ↑', '앞으로 가져오기', 'Control+ArrowUp', /앞|순서|가져/);
await obj('O5', 'Ctrl + ↓', '뒤로 보내기', 'Control+ArrowDown', /뒤|순서|보내/);
await obj('O8', 'Ctrl + Shift + ↑', '맨 앞으로', 'Control+Shift+ArrowUp', /앞|순서|가져/);
await obj('O7', 'Ctrl + Shift + ↓', '맨 뒤로', 'Control+Shift+ArrowDown', /뒤|순서|보내/);
await obj('O9', 'Tab', '다음 도형 선택', 'Tab', /선택|도형|상자/);
await obj('O10', 'Shift + Tab', '이전 도형 선택', 'Shift+Tab', /선택|도형|상자/);
await obj('O11', '화살표', '1픽셀 이동', 'ArrowRight', /이동|위치/);
await obj('O12', 'Shift + 화살표', '크게 이동', 'Shift+ArrowLeft', /이동|위치/);
await obj('O13', 'Alt + Shift + ←', '반시계 1도 회전', 'Alt+Shift+ArrowLeft', /회전/);
await obj('O14', 'Alt + Shift + →', '시계 1도 회전', 'Alt+Shift+ArrowRight', /회전/);
await obj('O15', 'Alt + ←', '반시계 15도 회전', 'Alt+ArrowLeft', /회전/);
await obj('O16', 'Alt + →', '시계 15도 회전', 'Alt+ArrowRight', /회전/);
await obj('O17', 'Ctrl + Alt + B', '가로 확대', 'Control+Alt+KeyB', /크기|확대/);
await obj('O18', 'Ctrl + Alt + I', '세로 확대', 'Control+Alt+KeyI', /크기|확대/);
await obj('O19', 'Ctrl + Alt + J', '축소', 'Control+Alt+KeyJ', /크기|축소/);
await obj('O20', 'Ctrl + Alt + K', '확대', 'Control+Alt+KeyK', /크기|확대/);
await obj('O21', 'Ctrl + Alt + 9', '세로 축소', 'Control+Alt+Digit9', /크기|축소/);
await obj('O22', 'Ctrl + Alt + W', '가로 축소', 'Control+Alt+KeyW', /크기|축소/);
await obj('A12', 'Delete', '삭제', 'Delete', /삭제/);
await obj('A3', 'Ctrl + Z', '실행취소 (삭제 되돌림)', 'Control+KeyZ');
await obj('O1', 'Ctrl + D', '객체 복사', 'Control+KeyD', /복사|복제/);
await obj('A3', 'Ctrl + Z', '실행취소 (복사 되돌림)', 'Control+KeyZ');
await test('A26', 'Ctrl + Alt + Y', '대체 텍스트', 'Control+Alt+KeyY', { prepare: () => onShape(0), expect: ['dialogs', 'panels', 'active'], after: esc });
skip('O24', 'Alt/Ctrl/Shift + 마우스로 이동·크기 조정·회전', '마우스와 함께 쓰는 키', '마우스 끌기 동작이라 키보드 단축키 점검에서 뺌');

// ---------------------------------------------------------------- 댓글
await test('C1', 'Ctrl + Alt + M', '댓글 삽입', 'Control+Alt+KeyM', { prepare: () => onShape(0), expect: ['active', 'panels', 'dialogs'], wait: 2000,
  after: async () => { await page.keyboard.type('check comment'); await page.waitForTimeout(500); const b = page.locator('[aria-label="댓글 올리기"]').filter({ visible: true }); if (await b.count()) await b.first().click(); await page.waitForTimeout(2000); } });
await test('C9', 'Ctrl + Alt + Shift + A', '댓글 대화목록', 'Control+Alt+Shift+KeyA', { prepare: () => filmstrip(0), expect: ['panels', 'dialogs', 'active'], wait: 2500, after: esc });
await test('C3', 'Ctrl + Alt + N, C', '다음 댓글로', seq('KeyN', 'KeyC'), { prepare: () => filmstrip(0), expect: /./, alt: loose(seq('KeyN', 'KeyC')) });
await test('C4', 'Ctrl + Alt + P, C', '이전 댓글로', seq('KeyP', 'KeyC'), { prepare: () => filmstrip(2), expect: /./, alt: loose(seq('KeyP', 'KeyC')) });
// A second comment on the subtitle box, so J and K have somewhere to go.
await filmstrip(0);
{ const sub = await objectAt('box', 1); await page.mouse.click(sub.x, sub.y); await page.waitForTimeout(600); await esc(); }
await page.keyboard.press('Control+Alt+KeyM'); await page.waitForTimeout(2000);
await page.keyboard.type('second check comment'); await page.waitForTimeout(500);
{ const b = page.locator('[aria-label="댓글 올리기"]').filter({ visible: true }); if (await b.count()) await b.first().click(); await page.waitForTimeout(2000); }
// The first comment as the current one (Ctrl+Alt N, C), then the focus into it.
const toComment = async () => { await filmstrip(0); for (const k of seq('KeyN', 'KeyC')) await page.keyboard.press(k); await page.waitForTimeout(1200); };
const inComment = async () => { await toComment(); for (const k of seq('KeyE', 'KeyC')) await page.keyboard.press(k); await page.waitForTimeout(1200); };
// The help page says Ctrl+Enter, but Slides only answers Ctrl+Alt E, C (as in Docs).
await test('C2', 'Ctrl + Enter', '현재 댓글 입력 (도움말에 적힌 키)', 'Control+Enter', { prepare: toComment, expect: ['active', 'comment'] });
await test('C2', 'Ctrl + Alt + E, C', '현재 댓글 입력 (실제로 듣는 키)', seq('KeyE', 'KeyC'), { prepare: toComment, expect: ['active', 'comment'] });
await test('C5', 'J', '다음 댓글 (댓글 포커스)', 'KeyJ', { prepare: inComment, expect: ['comment'] });
await test('C6', 'K', '이전 댓글 (댓글 포커스)', 'KeyK', { prepare: async () => { await inComment(); await page.keyboard.press('KeyJ'); await page.waitForTimeout(1200); }, expect: ['comment'] });
await test('C7', 'R', '답장 (댓글 포커스)', 'KeyR', { prepare: inComment, expect: ['active', 'dialogs'], after: esc });
await test('C11', 'U', '댓글 종료 (댓글 포커스)', 'KeyU', { prepare: inComment, expect: ['active'] });
// Hiding only hides; the comments come back with "모든 댓글 보기" (Ctrl+Alt+Shift+A).
await test('C10', 'Ctrl + Alt + Shift + J', '댓글 숨기기', 'Control+Alt+Shift+KeyJ', { prepare: () => filmstrip(0), expect: /댓글이 숨겨짐|^comments/,
  after: async () => {
    await page.keyboard.press('Control+Alt+Shift+KeyA'); await page.waitForTimeout(2000); await esc();
    const x = page.locator('[aria-label="닫기"], [aria-label="측면 시트 닫기"]').filter({ visible: true });
    if (await x.count()) { await x.last().click().catch(() => {}); await page.waitForTimeout(800); }
  } });
await test('C8', 'E', '댓글 완료(해결) (댓글 포커스)', 'KeyE', { prepare: inComment, expect: ['comments', 'comment'] });

// ---------------------------------------------------------------- 표·이미지·동영상
// A 2x2 table on slide 2, for "cell border selection" (Ctrl+Alt E, P).
await filmstrip(1);
await menu('삽입', '표');
await page.locator('.goog-dimension-picker-unhighlighted, .goog-dimension-picker').filter({ visible: true }).first().click({ position: { x: 25, y: 25 } }).catch(() => {});
await page.waitForTimeout(2000);
// The key needs the cursor in a cell: click the table's first cell.
const inCell = async () => { const t = await objectAt('table'); await page.mouse.click(t.x - t.w / 4, t.y - t.h / 4); await page.waitForTimeout(800); };
await test('N14', 'Ctrl + Alt + E, P', '셀 테두리 선택영역 (표)', seq('KeyE', 'KeyP'), { prepare: inCell, expect: ['dialogs', 'active', 'menus'], after: esc, alt: loose(seq('KeyE', 'KeyP')) });
// An image on slide 3 (uploaded from the computer), for crop mode.
await filmstrip(2);
const chooser = page.waitForEvent('filechooser', { timeout: 10000 });
await menu('삽입', '이미지', '컴퓨터에서 업로드');
await (await chooser).setFiles(IMAGE).catch(() => {});
await page.waitForTimeout(5000);
// Double-clicking the picture (it lands in a corner, not the middle) starts crop mode.
const cropping = async () => (await state()).crop;
await test('O23', 'Enter', '자르기 모드 종료', 'Enter', {
  prepare: async () => {
    const im = await objectAt('image'); await page.mouse.dblclick(im.x, im.y); await page.waitForTimeout(1200);
    if (!(await cropping())) throw new Error('crop mode did not start');
  },
  expect: ['crop'] });

// ---------------------------------------------------------------- 발표
const presenting = async (from = 0) => {
  await filmstrip(from);
  await page.keyboard.press('Control+F5');
  await page.waitForTimeout(4000);
};
await test('N16', 'Ctrl + F5', '슬라이드 발표', 'Control+F5', { prepare: () => filmstrip(0), expect: ['present', 'active'], wait: 4000 });
await test('P2', '→', '다음', 'ArrowRight', { expect: ['view'] });
await test('P3', '←', '이전', 'ArrowLeft', { expect: ['view'] });
await test('P5', 'End', '마지막 슬라이드', 'End', { expect: ['view'] });
await test('P6', 'Home', '첫 번째 슬라이드', 'Home', { expect: ['view'] });
await test('P4', '숫자 + Enter', '특정 슬라이드로', ['Digit2', 'Enter'], { expect: ['view'] });
await test('P7', 'S', '발표자 노트', 'KeyS', { expect: ['pages', 'dialogs', 'active'], wait: 2500, after: closeExtraPages });
await test('P8', 'A', '청중 도구', 'KeyA', { expect: ['pages', 'dialogs', 'active'], wait: 2500, after: closeExtraPages });
await test('P9', 'L', '레이저 포인터', 'KeyL', { expect: ['view'] });
await test('P12', 'B 또는 .', '검은 화면', 'KeyB', { expect: ['view'] });
await test('P14', '아무 키', '빈 화면에서 돌아오기', 'Space', { expect: ['view'] });
await test('P13', 'W 또는 ,', '흰 화면', 'KeyW', { expect: ['view'] });
await test('P14', '아무 키', '빈 화면에서 돌아오기', 'Space', { expect: ['view'] });
// Closing the print preview with Esc also ends the presentation, so the keys after it
// start the presentation again first.
const stillPresenting = async () => { if (!(await state()).present) await presenting(0); };
// Slides makes its own print preview ("미리보기 생성 중…") instead of calling print().
await test('P10', 'Ctrl + P', '인쇄 (발표 중)', 'Control+KeyP', { prepare: stillPresenting, expect: /미리보기|인쇄|^printed|^dialogs/, wait: 3000, after: esc });
await test('P11', 'F11', '전체 화면 전환', 'F11', { prepare: stillPresenting, expect: ['full', 'view'], wait: 2000 });
skip('P15', 'Ctrl + Shift + C', '자막 전환', '마이크를 써서 누르지 않음');
await test('P1', 'Esc', '발표 중지', 'Escape', { prepare: stillPresenting, expect: ['present', 'active'], wait: 2000 });

// ---------------------------------------------------------------- 동영상 (영상 칸을 선택하고 재생한 뒤)
skip('V1', 'k, u, o, Shift + , ., Ctrl + Shift + , ., Shift + 0~9, c, f, m', '동영상 플레이어', '영상은 YouTube 화면(다른 사이트의 프레임) 안에서 재생돼 점검 도구와 손빠르미 모두 키를 볼 수 없음');
skip('N15', 'Enter', '선택한 동영상 재생', '위와 같은 이유로 점검하지 않음');
skip('N9', 'Enter', '애니메이션 미리보기에서 계속', '애니메이션을 만들어야 해서 점검하지 않음');

// ---------------------------------------------------------------- 스크린 리더
await test('R1', 'Ctrl + Alt + X', '선택 영역 읽기', 'Control+Alt+KeyX', { prepare: () => inText(0), expect: /./ });
await test('R4', 'Ctrl + Alt + R', '커서부터 읽기', 'Control+Alt+KeyR', { prepare: async () => { await inText(0); await page.keyboard.press('Control+Home'); }, expect: /./ });
await test('R5', 'Ctrl + Alt + A, F', '커서 위치 서식', seq('KeyA', 'KeyF'), { prepare: async () => { await inText(0); await page.keyboard.press('Control+Home'); }, expect: /./, alt: loose(seq('KeyA', 'KeyF')) });
await test('R3', 'Ctrl + Alt + H', '점자 기능 사용', 'Control+Alt+KeyH', { prepare: () => filmstrip(0), expect: /점자/ });
await test('R3', 'Ctrl + Alt + H', '점자 기능 끄기', 'Control+Alt+KeyH', { prepare: () => filmstrip(0), expect: /점자/ });
await test('R2', 'Ctrl + Alt + Z', '스크린 리더 지원 끄기', 'Control+Alt+KeyZ', { prepare: () => filmstrip(0), expect: /사용 중지/ });
if ((ONLY.length && !picked('R2')) || !results[results.length - 1].slides) await screenReader(false);
console.log('test presentation:', fileUrl);
save();
await context.close();
