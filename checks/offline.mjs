// Local DOM fixtures only: no Google account, navigation or network access.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (file) => fs.readFileSync(new URL('../extension/src/' + file, import.meta.url), 'utf8');
const browser = await chromium.launch({
  channel: process.env.QH_BROWSER || 'chrome', headless: true,
  args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
});
let passed = 0;

async function fixture(site, pathname, html, mac = false) {
  const context = await browser.newContext();
  await context.route('**/*', (route) => route.abort());
  const page = await context.newPage();
  await page.setContent(html);
  await page.evaluate((mac) => {
    Object.defineProperty(navigator, 'platform', { value: mac ? 'MacIntel' : 'Win32' });
    window.messages = [];
    window.chrome = {
      i18n: { getMessage: (key) => key, getUILanguage: () => 'ko' },
      runtime: { id: 'offline-fixture', sendMessage: async (msg) => { window.messages.push(msg); }, onMessage: { addListener() {} } },
    };
  }, mac);
  const location = JSON.stringify({ hostname: site === 'youtube' ? 'www.youtube.com' : 'docs.google.com', pathname });
  for (const file of ['core/keys.js', 'core/names.js', 'sites/' + (site === 'youtube' ? site : 'google-editors') + '.js', 'content/main.js']) {
    const code = source(file);
    await page.addScriptTag({ content: file.startsWith('sites/') || file === 'content/main.js' ? `(() => { const location = ${location}; ${code}\n})();` : code });
  }
  return { context, page };
}

try {
  {
    const { context, page } = await fixture('youtube', '/watch', '<div id="movie_player"><button class="ytp-play-button">Play</button></div>');
    await page.locator('button').focus();
    await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => messages.map((m) => m.type)), ['qh-key']);
    await page.locator('button').click();
    assert.deepEqual(await page.evaluate(() => messages.map((m) => m.type)), ['qh-key', 'qh-mouse']);
    await context.close();
    console.log('PASS: real keyboard button activation is counted once; mouse still works'); passed++;
  }
  {
    const { context, page } = await fixture('slides', '/presentation/test/edit', '<button role="button" aria-label="아래첨자 (Ctrl+,)">Subscript</button><textarea></textarea>');
    await page.locator('button').click();
    await page.locator('textarea').focus();
    await page.keyboard.press('Control+,');
    await page.keyboard.press('Control+q');
    assert.deepEqual(await page.evaluate(() => messages.map((m) => [m.type, m.action.id])), [
      ['qh-mouse', 'slides:mod+,'], ['qh-key', 'slides:mod+,'],
    ]);
    await context.close();
    console.log('PASS: comma tooltip and real key share an ID; unknown modifier key is ignored'); passed++;
  }
  {
    const { context, page } = await fixture('docs', '/document/test/edit', '<iframe srcdoc="<div contenteditable=plaintext-only>Text</div>"></iframe>');
    const editable = page.frameLocator('iframe').locator('div');
    await editable.click();
    await page.keyboard.type('abc');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Control+q');
    assert.deepEqual(await page.evaluate(() => messages.map((m) => m.action.id)), ['docs:mod+b']);
    await context.close();
    console.log('PASS: iframe typing stays private while valid formatting is recorded'); passed++;
  }
  {
    const { context, page } = await fixture('slides', '/presentation/test/edit', '<button role="button" aria-label="슬라이드 복사">Duplicate</button><textarea></textarea>', true);
    await page.locator('button').click();
    await page.locator('textarea').focus();
    await page.keyboard.press('Alt+e');
    await page.keyboard.press('Meta+d');
    assert.deepEqual(await page.evaluate(() => messages.map((m) => [m.type, m.action.id])), [
      ['qh-mouse', 'slides:mod+d'], ['qh-key', 'slides:mod+d'],
    ]);
    await context.close();
    console.log('PASS: Mac fallback uses Command and Option text entry is ignored'); passed++;
  }
  {
    const { context, page } = await fixture('sheets', '/spreadsheets/test/edit', `
      <div role="menuitem" id="delete"><span class="goog-menuitem-label">F - I열 삭제</span></div>
      <div role="menuitem" id="clear"><span class="goog-menuitem-label">F - I열 데이터 삭제</span></div>
      <div role="menuitem" id="hide"><span class="goog-menuitem-label">F - I열 숨기기</span></div>
    `);
    await page.locator('#delete span').click();
    await page.locator('#clear span').click();
    await page.locator('#hide span').click();
    await page.keyboard.press('Control+Alt+-');
    assert.deepEqual(await page.evaluate(() => messages.filter((m) => m.action).map((m) => [m.type, m.action.id])), [
      ['qh-mouse', 'sheets:mod+alt+-'], ['qh-mouse', 'sheets:mod+alt+0'], ['qh-key', 'sheets:mod+alt+-'],
    ]);
    // The one it doesn't know is kept by name, for the feedback form.
    assert.deepEqual(await page.evaluate(() => messages.filter((m) => m.type === 'qh-unknown').map((m) => [m.site, m.label])), [['sheets', '열 데이터 삭제']]);
    await context.close();
    console.log('PASS: range-prefixed Sheets delete/hide menus work; clear data is kept as a button not recognized'); passed++;
  }
  console.log(`${passed} offline Chrome checks passed`);
} finally {
  await browser.close();
}
