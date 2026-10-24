// Every shortcut on YouTube's help page (support.google.com/youtube/answer/7631406):
// press it on a real video and record (1) whether YouTube reacted, measured from
// the player itself, and (2) whether Quickhand counted it as shortcut use.
// Results: results/youtube-shortcuts.json
import fs from 'node:fs';
import path from 'node:path';
import { launch, RESULTS } from './lib.mjs';

const VIDEO = 'https://www.youtube.com/watch?v=arj7oStGLkU'; // TED talk with chapters and captions

const { context, worker } = await launch({ headless: false });
const page = await context.newPage();
const results = [];

// What the player and page look like right now.
const state = () => page.evaluate(() => {
  const p = document.querySelector('#movie_player');
  const cc = document.querySelector('#movie_player .ytp-subtitles-button');
  const a = document.activeElement;
  return {
    t: p.getCurrentTime(), dur: p.getDuration(), state: p.getPlayerState(), muted: p.isMuted(), vol: p.getVolume(),
    rate: p.getPlaybackRate(), fs: !!document.fullscreenElement, cc: cc && cc.getAttribute('aria-pressed'),
    mini: !!document.querySelector('ytd-miniplayer[active]') || location.pathname !== '/watch',
    video: new URL(location.href).searchParams.get('v'), focus: a && (a.getAttribute('name') || a.id || a.className || a.tagName),
    ad: p.classList.contains('ad-showing'),
  };
});

async function skipAds() {
  for (let i = 0; i < 120 && (await page.locator('#movie_player.ad-showing').count()); i++) {
    const skip = page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button-modern').filter({ visible: true }).first();
    if (await skip.count()) await skip.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
}

async function open(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#movie_player .ytp-play-button', { timeout: 30000 });
  await page.waitForTimeout(3000);
  await skipAds();
}

const player = (fn, ...args) => page.evaluate(([f, a]) => document.querySelector('#movie_player')[f](...a), [fn, args]);
const focusPlayer = () => page.evaluate(() => document.querySelector('#movie_player').focus());
// The help page says "on the seek bar" for several keys; most also work with the player focused.
const focusSeekBar = () => page.evaluate(() => document.querySelector('#movie_player .ytp-progress-bar').focus());
async function pausedAt(seconds) {
  await player('pauseVideo');
  await player('seekTo', seconds, true);
  await page.waitForTimeout(700);
}

// Quickhand's newest keyboard decision since `since`, if any.
async function quickhandSaw(since) {
  return worker.evaluate(async (t) => {
    const { qh_state } = await chrome.storage.local.get('qh_state');
    const e = (qh_state && qh_state.log || []).find((l) => l.at >= t && l.input === 'key');
    return e ? e.id : null;
  }, since);
}

// One shortcut: prepare, press, then judge YouTube's reaction from before/after.
async function test(n, keyLabel, action, keys, { prepare, focus = focusPlayer, judge, wait = 1200 } = {}) {
  let error = null;
  let before = null;
  let after = null;
  let works = null;
  let note = '';
  let quickhand = null;
  try {
    if (prepare) await prepare();
    await focus();
    before = await state();
    const since = Date.now();
    for (const k of [].concat(keys)) await page.keyboard.press(k);
    await page.waitForTimeout(wait);
    after = await state();
    quickhand = await quickhandSaw(since);
    [works, note] = judge(before, after);
  } catch (e) {
    error = e.message.split('\n')[0];
  }
  const r = { n, key: keyLabel, action, youtube: works, note, quickhand, error };
  results.push(r);
  console.log(JSON.stringify(r));
}

const toggled = (k) => (b, a) => [a[k] !== b[k], `${k}: ${b[k]} → ${a[k]}`];
const moved = (from, to, tol = 1.5) => (b, a) => {
  const d = a.t - b.t;
  return [Math.abs(d - to) <= tol || (from === 'abs' && Math.abs(a.t - to) <= tol), `위치: ${b.t.toFixed(1)}초 → ${a.t.toFixed(1)}초`];
};
const shifted = (expect, tol) => (b, a) => {
  const d = a.t - b.t;
  return [Math.abs(d - expect) <= tol, `위치: ${b.t.toFixed(2)}초 → ${a.t.toFixed(2)}초 (${d >= 0 ? '+' : ''}${d.toFixed(2)})`];
};

await open(VIDEO);

// 1-5: play, pause, mute, stop
await test(1, '스페이스바 (탐색바에서)', '재생/일시중지', 'Space', { focus: focusSeekBar, judge: (b, a) => [a.state !== b.state, `상태: ${b.state} → ${a.state}`] });
// Keyboard media keys (2, 5, 6) go to Chrome's own media controls, not to the
// page, so a test cannot press them; they are listed for a person to try.
const manual = (n, key, action) => { const r = { n, key, action, youtube: null, note: '자동 점검 불가: 키보드의 미디어 키는 페이지가 아니라 크롬의 미디어 제어로 전달됨', quickhand: null, error: null }; results.push(r); console.log(JSON.stringify(r)); };
manual(2, '미디어 재생/일시중지 키', '재생/일시중지');
await test(3, 'k', '재생/일시중지', 'k', { judge: (b, a) => [a.state !== b.state, `상태: ${b.state} → ${a.state}`] });
await test(4, 'm', '음소거/해제', 'm', { judge: toggled('muted') });
await page.keyboard.press('m'); // back to sound on
manual(5, '미디어 중지 키', '재생 멈춤');

// 7-19: moving around (paused, so positions can be compared)
await test(7, '→ (탐색바에서)', '5초 앞으로', 'ArrowRight', { prepare: () => pausedAt(60), focus: focusSeekBar, judge: shifted(5, 1) });
await test(7, '← (탐색바에서)', '5초 뒤로', 'ArrowLeft', { prepare: () => pausedAt(60), focus: focusSeekBar, judge: shifted(-5, 1) });
await test(8, 'j', '10초 뒤로', 'j', { prepare: () => pausedAt(60), judge: shifted(-10, 1) });
await test(9, 'l', '10초 앞으로', 'l', { prepare: () => pausedAt(60), judge: shifted(10, 1) });
await test(10, 'Ctrl + →', '다음 챕터', 'Control+ArrowRight', { prepare: () => pausedAt(60), judge: (b, a) => [a.t - b.t > 2, `위치: ${b.t.toFixed(1)}초 → ${a.t.toFixed(1)}초`] });
await test(11, 'Ctrl + ←', '이전 챕터', 'Control+ArrowLeft', { prepare: () => pausedAt(300), judge: (b, a) => [b.t - a.t > 2, `위치: ${b.t.toFixed(1)}초 → ${a.t.toFixed(1)}초`] });
await test(12, '.', '다음 프레임 (일시중지 중)', 'Period', { prepare: () => pausedAt(60), judge: (b, a) => [a.t - b.t > 0 && a.t - b.t < 0.2, `위치: ${b.t.toFixed(3)}초 → ${a.t.toFixed(3)}초`] });
await test(13, ',', '이전 프레임 (일시중지 중)', 'Comma', { prepare: () => pausedAt(60), judge: (b, a) => [b.t - a.t > 0 && b.t - a.t < 0.2, `위치: ${b.t.toFixed(3)}초 → ${a.t.toFixed(3)}초`] });
await test(14, '>', '재생 속도 높이기', 'Shift+Period', { judge: (b, a) => [a.rate > b.rate, `속도: ${b.rate} → ${a.rate}`] });
await test(15, '<', '재생 속도 낮추기', 'Shift+Comma', { judge: (b, a) => [a.rate < b.rate, `속도: ${b.rate} → ${a.rate}`] });
await test(16, 'Home (탐색바에서)', '동영상 시작으로', 'Home', { prepare: () => pausedAt(120), focus: focusSeekBar, judge: (b, a) => [a.t < 1.5, `위치: ${b.t.toFixed(1)}초 → ${a.t.toFixed(1)}초`] });
await test(16, 'End (탐색바에서)', '동영상 끝으로', 'End', {
  prepare: () => pausedAt(120), focus: focusSeekBar, wait: 1800,
  judge: (b, a) => [a.t > a.dur - 3 || a.state === 0, `상태: ${b.state} → ${a.state} (0 = 끝남)`],
});
await open(VIDEO); // an ended video ignores the number keys; start fresh
await test(17, '↑ (플레이어에서)', '볼륨 5% 높이기', 'ArrowUp', {
  prepare: async () => { await player('unMute'); await player('setVolume', 50); }, judge: (b, a) => [a.vol - b.vol === 5, `볼륨: ${b.vol} → ${a.vol}`],
});
await test(17, '↓ (플레이어에서)', '볼륨 5% 낮추기', 'ArrowDown', { prepare: () => player('setVolume', 50), judge: (b, a) => [b.vol - a.vol === 5, `볼륨: ${b.vol} → ${a.vol}`] });
await test(18, '5', '동영상 50% 지점으로', 'Digit5', { prepare: () => pausedAt(30), judge: (b, a) => [Math.abs(a.t - a.dur * 0.5) < 3, `위치: ${b.t.toFixed(1)}초 → ${a.t.toFixed(1)}초 (50% = ${(a.dur * 0.5).toFixed(1)}초)`] });
await test(19, '0', '동영상 시작으로', 'Digit0', { prepare: () => pausedAt(120), judge: (b, a) => [a.t < 1.5, `위치: ${b.t.toFixed(1)}초 → ${a.t.toFixed(1)}초`] });

// 20-22: search, full screen, captions
await test(20, '/', '검색창으로 이동', 'Slash', { judge: (b, a) => [a.focus === 'search_query', `포커스: ${b.focus} → ${a.focus}`] });
await page.keyboard.press('Escape');
await test(21, 'f', '전체 화면 켜기', 'f', { judge: toggled('fs'), wait: 1500 });
await test(21, 'f (전체 화면에서)', '전체 화면 끄기', 'f', { judge: toggled('fs'), wait: 1500 });
await test(22, 'c', '자막 켜기/끄기', 'c', { judge: toggled('cc') });
await page.keyboard.press('c'); // back as it was

// 23, 24: playlist moves, in a regular playlist found by search (Shift+P does
// nothing in an auto-made YouTube Mix).
await page.goto('https://www.youtube.com/results?search_query=TED+talks+playlist&sp=EgIQAw%253D%253D', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await open('https://www.youtube.com' + (await page.locator('a[href*="list=PL"]').first().getAttribute('href')));
await test(23, 'Shift + N', '다음 동영상', 'Shift+KeyN', { judge: (b, a) => [a.video !== b.video, `영상: ${b.video} → ${a.video}`], wait: 4000 });
await skipAds();
await test(24, 'Shift + P', '재생목록의 이전 동영상', 'Shift+KeyP', { judge: (b, a) => [a.video !== b.video, `영상: ${b.video} → ${a.video}`], wait: 4000 });
await skipAds();
manual(6, '미디어 다음 트랙 키', '재생목록의 다음 항목');

// 25: miniplayer (leaves the watch page, so last)
await open(VIDEO);
await test(25, 'i', '미니 플레이어 열기', 'i', { judge: (b, a) => [a.mini && !b.mini, `미니 플레이어: ${b.mini} → ${a.mini}`], wait: 2500 });

fs.writeFileSync(path.join(RESULTS, 'youtube-shortcuts.json'), JSON.stringify(results, null, 2));
await context.close();
