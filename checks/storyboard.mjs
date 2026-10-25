// The "first click to learned" storyboard for testers and the store: on a fresh
// install at the default "normal" strength, play/pause on YouTube with the mouse,
// then press K until it is learned, capturing the card after each of the 10
// steps. Writes ../dist/손빠르미-10단계.png. Needs no sign-in: it uses its own
// fresh profile, and the video is Big Buck Bunny (Blender Foundation, CC BY 3.0).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.QH_PROFILE ||= '.profile-storyboard';
const { launch, PROFILE } = await import('./lib.mjs');
fs.rmSync(PROFILE, { recursive: true, force: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../dist/손빠르미-10단계.png');
const CORNER = { x: 860, y: 600, width: 420, height: 200 }; // where the card sits at 1280x800

// [what the person does, what the card says], one per step.
const STEPS = [
  ['재생 버튼을 마우스로 처음 누름', '설치 후 한 번만: 작동 중이라고 알려 줌'],
  ['같은 버튼을 3번째 누름', '힌트: 단축키 K를 알려 줌'],
  ['키보드로 K (1번째)', '칭찬: 익히기까지 7번 남음'],
  ['K (2번째)', '6번 남음'],
  ['K (3번째)', '5번 남음'],
  ['K (4번째)', '4번 남음'],
  ['K (5번째)', '마우스 없이 5번 연속: 콤보!'],
  ['K (6번째)', '2번 남음'],
  ['K (7번째)', '1번 남음'],
  ['K (8번째)', '최근 10번 중 8번 키보드: 익혔어요!'],
];

const { context, extensionId } = await launch({ headless: true });

// launch() sets "active" for the other checks; the storyboard shows the default.
const setup = await context.newPage();
await setup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
await setup.evaluate(async () => {
  const { qh_settings } = await chrome.storage.sync.get('qh_settings');
  await chrome.storage.sync.set({ qh_settings: Object.assign({}, qh_settings, { strength: 'normal', praise: true }) });
  await chrome.storage.local.remove('qh_state');
});
await setup.close();

const page = await context.newPage();
await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#movie_player .ytp-play-button', { timeout: 30000 });
await page.waitForTimeout(3000);
for (let i = 0; i < 120 && (await page.locator('#movie_player.ad-showing').count()); i++) await page.waitForTimeout(1000);

const shots = [];
async function snap() {
  await page.mouse.move(20, 420); // off the player, so no YouTube tooltip shows
  await page.waitForTimeout(950); // the card has bounced in and settled
  const text = await page.evaluate(() => {
    const host = document.querySelector('quickhand-card');
    return host ? host.shadowRoot.querySelector('.body').innerText.replace(/\s+/g, ' ') : '(카드 없음)';
  });
  console.log(`${shots.length + 1}. ${text}`);
  shots.push((await page.screenshot({ clip: CORNER })).toString('base64'));
}
async function clickPlay() {
  await page.hover('#movie_player');
  await page.locator('#movie_player .ytp-play-button').click();
}

await clickPlay();
await snap();
await clickPlay(); // the 2nd click shows nothing new
await page.waitForTimeout(900);
await clickPlay();
await snap();
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('k');
  await snap();
}

const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:28px;background:#f3f6f6;font-family:'Malgun Gothic',sans-serif;color:#173f4f;width:960px">
<h1 style="margin:0 0 4px;font-size:24px">손빠르미: 처음 누를 때부터 익힐 때까지</h1>
<p style="margin:0 0 20px;color:#4f6b75;font-size:14px">유튜브, 새로 설치한 상태, 알림 강도 '보통'. 같은 동작은 재생/일시정지(단축키 K)</p>
<div style="display:grid;grid-template-columns:repeat(2,460px);gap:18px 20px">
${STEPS.map(([what, shown], i) => `<figure style="margin:0;background:#fff;border-radius:14px;padding:12px;box-shadow:0 2px 8px rgba(23,63,79,.08)">
<figcaption style="display:flex;gap:10px;align-items:baseline;margin-bottom:8px"><span style="flex:none;width:28px;height:28px;border-radius:50%;background:#2a9d8f;color:#fff;font-weight:700;display:grid;place-items:center">${i + 1}</span><span><b style="font-size:15px">${what}</b><br><span style="font-size:13px;color:#4f6b75">${shown}</span></span></figcaption>
<img src="data:image/png;base64,${shots[i]}" style="display:block;width:436px;height:auto;border-radius:8px"></figure>`).join('')}
</div></body>`;
const board = await context.newPage();
await board.setViewportSize({ width: 1016, height: 800 });
await board.setContent(html);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await board.screenshot({ path: OUT, fullPage: true });

await context.close();
fs.rmSync(PROFILE, { recursive: true, force: true });
console.log('saved', path.relative(process.cwd(), OUT));
