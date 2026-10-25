// YouTube watch page and Shorts: click each supported control with the mouse and
// check that Quickhand recognizes it and shows a visible card.
import fs from 'node:fs';
import path from 'node:path';
import { launch, check, RESULTS } from './lib.mjs';

// Usage: node youtube.mjs [video URL] [--headed]
const WATCH = process.argv.slice(2).find((a) => a.startsWith('http')) || 'https://www.youtube.com/watch?v=arj7oStGLkU'; // a TED talk with captions

const { context, worker } = await launch({ headless: !process.argv.includes('--headed') });
const page = await context.newPage();
const results = [];
const run = async (...args) => results.push(await check(page, worker, ...args));

// Player buttons show only while the pointer is over the player.
const clickPlayer = async (selector) => {
  await page.hover('#movie_player');
  await page.locator(`#movie_player ${selector}`).first().click();
};

await page.goto(WATCH, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#movie_player .ytp-play-button', { timeout: 30000 });
await page.waitForTimeout(3000);

await run('영상 재생 버튼', () => clickPlayer('.ytp-play-button'));
await run('영상 음소거 버튼', () => clickPlayer('.ytp-volume-icon, .ytp-mute-button'));
await run('영상 자막 버튼', () => clickPlayer('.ytp-subtitles-button'));
await run('영상 영화관 모드 버튼', () => clickPlayer('.ytp-size-button'));
await run('영상 K 키', () => page.keyboard.press('k'));
await run('영상 볼륨 슬라이더', async () => {
  await page.hover('#movie_player .ytp-mute-button');
  await page.waitForTimeout(500);
  const slider = await page.locator('#movie_player .ytp-volume-panel').boundingBox();
  await page.mouse.click(slider.x + slider.width * 0.6, slider.y + slider.height / 2);
});
await run('영상 진행 막대 클릭', async () => {
  await page.hover('#movie_player');
  await page.waitForTimeout(300);
  const bar = await page.locator('#movie_player .ytp-progress-bar').boundingBox();
  await page.mouse.click(bar.x + bar.width * 0.3, bar.y + bar.height / 2);
});
await run('영상 설명란 챕터 클릭', async () => {
  await page.locator('#description-inline-expander, #expand').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.locator('ytd-macro-markers-list-item-renderer').filter({ visible: true }).nth(1).click();
});
await run('영상 전체 화면 버튼', async () => {
  await clickPlayer('.ytp-fullscreen-button');
  await page.waitForTimeout(300);
  console.log('  fullscreen:', await page.evaluate(() => (document.fullscreenElement ? document.fullscreenElement.id : 'no')));
}, { wait: 2000 });
await page.keyboard.press('Escape');
// Start from a fresh page: leaving full screen sometimes upsets the player.
await page.goto(WATCH, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#movie_player .ytp-next-button', { state: 'attached', timeout: 30000 });
await page.waitForTimeout(3000);
// YouTube hides the next button while an ad plays; skip ads as soon as allowed.
for (let i = 0; i < 120 && (await page.locator('#movie_player.ad-showing').count()); i++) {
  const skip = page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button-modern').filter({ visible: true }).first();
  if (await skip.count()) await skip.click().catch(() => {});
  await page.waitForTimeout(1000);
}
// YouTube shows "next" only when there is a next video (playlists, autoplay).
await page.hover('#movie_player');
if (await page.locator('#movie_player .ytp-next-button').filter({ visible: true }).count()) {
  await run('영상 다음 동영상 버튼', () => clickPlayer('.ytp-next-button'), { wait: 2500 });
} else {
  results.push({ name: '영상 다음 동영상 버튼', error: '이 영상에는 YouTube가 버튼을 보여 주지 않음' });
  console.log(JSON.stringify(results[results.length - 1]));
}

await page.goto('https://www.youtube.com/shorts/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#shorts-player', { timeout: 30000 });
await page.waitForTimeout(3000);
const visible = (selector) => page.locator(selector).filter({ visible: true }).first();

await run('쇼츠 재생 버튼', () => visible('#play-pause-button-shape button').click());
await run('쇼츠 음소거 버튼', async () => {
  await visible('#shorts-player').hover();
  await visible('volume-controls button').click();
});
await run('쇼츠 다음 버튼', () => visible('#navigation-button-down button').click(), { wait: 2500 });
await run('쇼츠 이전 버튼', () => visible('#navigation-button-up button').click(), { wait: 2500 });
await run('쇼츠 ↓ 키', () => page.keyboard.press('ArrowDown'), { wait: 2500 });

fs.writeFileSync(path.join(RESULTS, 'youtube.json'), JSON.stringify(results, null, 2));
await context.close();
