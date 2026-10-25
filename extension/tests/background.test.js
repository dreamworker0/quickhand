const test = require('node:test');
const assert = require('node:assert/strict');
const { backgroundEnv } = require('./helpers/browser-env.cjs');

test('simultaneous settings patches preserve both changes', async () => {
  const bg = backgroundEnv();
  await Promise.all([
    bg.request({ type: 'qh-settings', patch: { enabled: false } }),
    bg.request({ type: 'qh-settings', patch: { strength: 'active' } }),
  ]);
  assert.equal(bg.storage.sync.qh_settings.enabled, false);
  assert.equal(bg.storage.sync.qh_settings.strength, 'active');
});

test('two simultaneous toggle commands cancel each other and retain patches', async () => {
  const bg = backgroundEnv();
  await Promise.all([bg.command(), bg.command(), bg.request({ type: 'qh-settings', patch: { strength: 'gentle' } })]);
  assert.equal(bg.storage.sync.qh_settings.enabled, true);
  assert.equal(bg.storage.sync.qh_settings.strength, 'gentle');
});

test('concurrent action records survive a worker restart', async () => {
  const bg = backgroundEnv();
  const msg = { type: 'qh-key', action: { id: 'docs:mod+b', site: 'docs', label: '굵게', display: [['Ctrl', 'B']] } };
  await Promise.all(Array.from({ length: 20 }, () => bg.request(msg)));
  assert.equal(bg.storage.local.qh_state.actions[msg.action.id].key, 20);
  const restarted = backgroundEnv(bg.storage);
  await restarted.request(msg);
  assert.equal(bg.storage.local.qh_state.actions[msg.action.id].key, 21);
});

test('the first recognized click after install sends the watching card once', async () => {
  const bg = backgroundEnv();
  const sender = { tab: { id: 7 } };
  const click = (id, label) => bg.request({ type: 'qh-mouse', action: { id, site: 'youtube', label, display: [['K']] } }, sender);
  await click('yt:playpause', '재생 / 일시정지');
  await click('yt:mute', '음소거');
  await new Promise((resolve) => setImmediate(resolve)); // cards go out after the reply
  assert.deepEqual(bg.cards.map((c) => [c.variant, c.label, c.need]), [['intro', '재생 / 일시정지', 3]]);
  assert.equal(bg.storage.local.qh_state.introShown, true);
});
