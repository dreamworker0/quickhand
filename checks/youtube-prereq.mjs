// Which YouTube keys work only in some situations? Keys that depend on the video are
// pressed in each state below and the player is compared before and after:
//   재생 중 · 일시정지 (a TED talk with chapters and captions)
//   챕터·자막 없는 영상 (Big Buck Bunny, paused)
//   재생목록 영상 (a regular playlist, paused)
// Quickhand should count a key only where YouTube reacted. Nothing is changed in the
// account. Results: results/youtube-prereq.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const TALK = 'https://www.youtube.com/watch?v=arj7oStGLkU';
const BUNNY = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const OUT = path.join(RESULTS, 'youtube-prereq.json');
const KEYS = [
  ['.', 'Period', '다음 프레임'],
  [',', 'Comma', '이전 프레임'],
  ['Ctrl+→', 'Control+ArrowRight', '다음 챕터'],
  ['Ctrl+←', 'Control+ArrowLeft', '이전 챕터'],
  ['c', 'KeyC', '자막 켜기/끄기'],
  ['Shift+P', 'Shift+KeyP', '재생목록의 이전 동영상'],
  ['Shift+N', 'Shift+KeyN', '다음 동영상'],
];

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
const state = () => page.evaluate(() => {
  const p = document.querySelector('#movie_player');
  const cc = document.querySelector('#movie_player .ytp-subtitles-button');
  return {
    t: p.getCurrentTime(), playing: p.getPlayerState() === 1, rate: p.getPlaybackRate(), at: performance.now(),
    cc: cc ? cc.getAttribute('aria-pressed') : 'none', video: new URL(location.href).searchParams.get('v'),
  };
});
async function skipAds() {
  for (let i = 0; i < 120 && (await page.locator('#movie_player.ad-showing').count()); i++) {
    const skip = page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button-modern').filter({ visible: true }).first();
    if (await skip.count()) await skip.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
}
let current = '';
async function open(url) {
  if (current === url && (await state().catch(() => null))) return;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#movie_player .ytp-play-button', { timeout: 30000 });
  await page.waitForTimeout(3000);
  await skipAds();
  current = url;
}
const player = (fn, ...args) => page.evaluate(([f, a]) => document.querySelector('#movie_player')[f](...a), [fn, args]);
async function ready(url, playing) {
  await open(url);
  await player('seekTo', 120, true);
  if (playing) await player('playVideo'); else await player('pauseVideo');
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#movie_player').focus());
}
let PLAYLIST = '';
const STATES = {
  '재생 중': () => ready(TALK, true),
  '일시정지': () => ready(TALK, false),
  '챕터·자막 없는 영상': () => ready(BUNNY, false),
  '재생목록 영상': () => ready(PLAYLIST, false),
};
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = ((qh_state && qh_state.log) || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}

await page.goto('https://www.youtube.com/results?search_query=TED+talks+playlist&sp=EgIQAw%253D%253D', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
PLAYLIST = 'https://www.youtube.com' + (await page.locator('a[href*="list=PL"]').first().getAttribute('href'));
// The second video of the playlist, so there is one before it.
PLAYLIST = PLAYLIST.replace(/&index=\d+/, '') + '&index=2';
console.log('playlist:', PLAYLIST);

const results = [];
for (const [shown, key, what] of KEYS) {
  const row = { key: shown, action: what, states: {} };
  for (const [name, prepare] of Object.entries(STATES)) {
    let cell;
    try {
      await prepare();
      const b = await state();
      const since = Date.now();
      await page.keyboard.press(key);
      await page.waitForTimeout(1500);
      const a = await state();
      // While playing, time moves on by itself; only what differs from that counts.
      const drift = b.playing && a.playing ? ((a.at - b.at) / 1000) * b.rate : 0;
      const jump = a.t - b.t - drift;
      const changed = [];
      if (a.video !== b.video) changed.push(`영상 ${b.video} → ${a.video}`);
      else if (Math.abs(jump) > (b.playing ? 0.4 : 0.01)) changed.push(`위치 ${jump >= 0 ? '+' : ''}${jump.toFixed(2)}초`);
      if (a.playing !== b.playing) changed.push(`재생 ${b.playing} → ${a.playing}`);
      if (a.cc !== b.cc) changed.push(`자막 ${b.cc} → ${a.cc}`);
      cell = { youtube: changed.length > 0, changed, quickhand: await quickhandSaw(since) };
      if (a.cc !== b.cc) await page.keyboard.press('KeyC');
      if (a.video !== b.video) current = '';
    } catch (e) {
      cell = { youtube: null, changed: [], quickhand: null, error: e.message.split('\n')[0] };
      current = '';
    }
    row.states[name] = cell;
    console.log(shown, '|', name, '|', JSON.stringify(cell));
  }
  results.push(row);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
}
const mark = (c) => (c.error ? '오류' : c.youtube ? (c.quickhand ? 'O·셈' : 'O·안 셈') : (c.quickhand ? 'X·셈!' : 'X'));
console.log('\n키 | 동작 | ' + Object.keys(STATES).join(' | '));
for (const r of results) console.log(`${r.key} | ${r.action} | ` + Object.values(r.states).map(mark).join(' | '));
await context.close();
