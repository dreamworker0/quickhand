// Google Drive with the mouse: in the test folder the keyboard check made, click every
// toolbar button, right-click menu item and "새로 만들기" menu item that shows a shortcut
// (or that Drive's help page gives one for), and check that Quickhand shows a card.
//
// Only the test folder "손빠르미 단축키 점검 문서 (지워도 됨)" (from drive-shortcuts.mjs)
// is used. Download, trash and anything AI are not clicked; share, move and rename
// windows are closed again; file pickers are cancelled; new Google files are left empty
// (Drive throws those away). Results: results/drive-mouse.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS } from './lib.mjs';

const FOLDER = JSON.parse(fs.readFileSync(path.join(RESULTS, 'drive-shortcuts.json'), 'utf8')).folder;
if (!FOLDER) throw new Error('run drive-shortcuts.mjs first: it makes the test folder');
const SKIP = /다운로드|휴지통|삭제|오프라인|Gemini|요약|승인 요청|신고|Download|Trash|Remove|Offline|Summar/;
const ITEM = '[role="row"][data-id], [role="gridcell"][data-id]';

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
page.setDefaultTimeout(8000);
await page.setViewportSize({ width: 1500, height: 900 });
page.on('dialog', (d) => d.dismiss().catch(() => {}));
page.on('filechooser', (fc) => fc.setFiles([]).catch(() => {})); // upload items: picker cancelled
const results = [];
const save = () => fs.writeFileSync(path.join(RESULTS, 'drive-mouse.json'), JSON.stringify({ folder: FOLDER, results }, null, 2));

const visible = (sel, opts) => page.locator(sel, opts).filter({ visible: true }).first();
const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(400); };
async function closeExtraPages() {
  for (const p of context.pages()) if (p !== page && !p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
}
async function home() {
  await closeExtraPages();
  await esc(); await esc();
  if (!page.url().startsWith(FOLDER) || (await page.locator('[role="dialog"]').filter({ visible: true }).count())) {
    await page.goto(FOLDER, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await visible('[role="main"]').waitFor({ timeout: 60000 });
    await page.waitForTimeout(3000);
  }
}
const image = () => visible(ITEM, { hasText: 'icon-128.png' });
const selectImage = async () => { await home(); await image().click(); await page.waitForTimeout(700); };
async function run(kind, name, step, opts) {
  if (!page.url().startsWith(FOLDER)) await home();
  const r = await check(page, worker, '드라이브 ' + name, step, opts);
  results.push({ kind, ...r });
  save();
}
const skipped = (kind, name, why) => { results.push({ kind, name: '드라이브 ' + name, skipped: why }); save(); };

await page.goto(FOLDER, { waitUntil: 'domcontentloaded', timeout: 60000 });
if (page.url().includes('accounts.google.com/')) {
  console.log('NOT SIGNED IN: run `node login.mjs`, sign in, close the window, then run this again.');
  await context.close();
  process.exit(1);
}
await home();
// The keyboard check taught Quickhand these shortcuts; forget Drive so cards show again.
await worker.evaluate(async () => {
  const { qh_state } = await chrome.storage.local.get('qh_state');
  for (const id of Object.keys(qh_state.actions)) if (id.startsWith('drive:')) delete qh_state.actions[id];
  qh_state.lastAlertAt = 0;
  qh_state.lastNewAlertAt = 0;
  await chrome.storage.local.set({ qh_state });
});

// The leaves of a menu item: its name first, a printed shortcut last (if any).
const menuItems = () => page.evaluate(() => {
  const menus = [...document.querySelectorAll('[role="menu"]')].filter((m) => m.offsetWidth);
  const menu = menus[menus.length - 1];
  if (!menu) return [];
  return [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')].filter((i) => i.offsetWidth).map((i) => {
    const leaves = [...i.querySelectorAll('*')].filter((x) => !x.childElementCount && x.textContent.trim()).map((x) => x.textContent.trim());
    return { label: leaves[0] || i.innerText.trim(), accel: leaves.length > 1 ? leaves[leaves.length - 1] : '', sub: i.getAttribute('aria-haspopup') === 'true' || /›|▸/.test(i.innerText), off: i.getAttribute('aria-disabled') === 'true' };
  });
});
// By the start of its name: "이동" must not find "휴지통으로 이동".
const startsWith = (label) => new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const menuItem = (label) => visible('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], [role="menu"] [role="menuitemradio"]', { hasText: startsWith(label) });
// Only items that show a shortcut (or that Drive's help page gives one for) are clicked:
// templates, other companies' apps and the like may make files or ask for access.
const HELP_KEYS = /^(Google 드로잉|Google 그림|Google Drawings|링크 복사|Copy link)$/;
const hasKey = (it) => !!it.accel || HELP_KEYS.test(it.label);

// Walks a menu (one submenu deep) and clicks each item there, reopening it each time.
async function walk(kind, open, title) {
  await open();
  const top = await menuItems();
  await esc(); await esc();
  for (const it of top) {
    if (!it.label || SKIP.test(it.label)) { if (it.label) skipped(kind, `${title} › ${it.label}`, '누르지 않음 (다운로드·휴지통·AI 등)'); continue; }
    if (it.off) { skipped(kind, `${title} › ${it.label}`, '이 상태에서는 메뉴가 꺼져 있어 누를 수 없음'); continue; }
    // A submenu shows itself by opening a second menu on hover (Drive marks none).
    await open();
    await menuItem(it.label).hover().catch(() => {});
    await page.waitForTimeout(900);
    const opened = await page.locator('[role="menu"]').filter({ visible: true }).count();
    const subs = opened > 1 ? (await menuItems()).filter((s) => s.label !== it.label) : [];
    await esc(); await esc(); await esc();
    if (subs.length) {
      for (const s of subs) {
        const name = `${title} › ${it.label} › ${s.label}${s.accel ? ' (' + s.accel + ')' : ''}`;
        if (SKIP.test(s.label)) { skipped(kind, name, '누르지 않음 (다운로드·휴지통·AI 등)'); continue; }
        if (s.off) { skipped(kind, name, '이 상태에서는 메뉴가 꺼져 있어 누를 수 없음'); continue; }
        if (!hasKey(s)) { skipped(kind, name, '단축키 표시가 없어 누르지 않음'); continue; }
        await run(kind, name, async () => { await open(); await menuItem(it.label).hover(); await page.waitForTimeout(800); await menuItem(s.label).click(); }, { wait: 2000 });
        await home();
      }
      continue;
    }
    if (!hasKey(it)) { skipped(kind, `${title} › ${it.label}`, '단축키 표시가 없어 누르지 않음'); continue; }
    await run(kind, `${title} › ${it.label}${it.accel ? ' (' + it.accel + ')' : ''}`, async () => { await open(); await menuItem(it.label).click(); }, { wait: 2000 });
    await home();
  }
}

let stopped = null;
try {
  // ---- 항목을 고르면 나오는 툴바와 오른쪽 위 버튼 (tooltip에 단축키)
  await selectImage();
  const buttons = await page.evaluate(() => [...document.querySelectorAll('[data-tooltip]')]
    .filter((b) => b.offsetWidth && /\((?=[^)]*(Ctrl|Alt|Shift|Delete|다음|→|F\d))[^)]+\)\s*$/.test(b.getAttribute('data-tooltip')))
    .map((b) => b.getAttribute('data-tooltip')));
  console.log('buttons with a shortcut:', buttons);
  for (const tip of [...new Set(buttons)]) {
    if (SKIP.test(tip)) { skipped('toolbar', '툴바 ' + tip, '누르지 않음 (다운로드·휴지통·AI 등)'); continue; }
    await selectImage();
    await run('toolbar', '툴바 ' + tip, () => visible(`[data-tooltip="${tip.replace(/"/g, '\\"')}"]`).click(), { wait: 2000 });
    await home();
  }

  // ---- 오른쪽 클릭 메뉴
  await walk('menu', async () => { await selectImage(); await image().click({ button: 'right' }); await page.waitForTimeout(800); }, '오른쪽 클릭');

  // ---- 새로 만들기 메뉴
  const newButton = () => visible('button, [role="button"]', { hasText: /^\s*(신규|새로 만들기|New)\s*$/ });
  await walk('new', async () => { await home(); await newButton().click(); await page.waitForTimeout(800); }, '새로 만들기');

  // ---- 검색창 (/)
  await run('search', '검색창', async () => { await home(); await visible('input[aria-label*="검색"], input[aria-label*="Search"], input[placeholder*="검색"]').click(); });
  await esc();
} catch (e) {
  stopped = e.message.split('\n')[0];
  console.log('STOPPED:', stopped);
}
await closeExtraPages();
fs.writeFileSync(path.join(RESULTS, 'drive-mouse.json'), JSON.stringify({ folder: FOLDER, stopped, results }, null, 2));
await context.close();
