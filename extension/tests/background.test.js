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

test('practising a hinted shortcut sends a cheer unless cheers are turned off', async () => {
  const bg = backgroundEnv();
  const sender = { tab: { id: 7 } };
  const action = { id: 'yt:playpause', site: 'youtube', label: '재생 / 일시정지', display: [['K']] };
  for (let i = 0; i < 3; i++) await bg.request({ type: 'qh-mouse', action }, sender);
  await bg.request({ type: 'qh-key', action }, sender);
  await new Promise((resolve) => setImmediate(resolve));
  const praise = bg.cards.filter((c) => c.variant === 'praise');
  assert.deepEqual(praise.map((c) => [c.id, c.done, c.left]), [['yt:playpause', 1, 7]]);

  await bg.request({ type: 'qh-settings', patch: { praise: false } });
  await bg.request({ type: 'qh-key', action }, sender);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bg.cards.filter((c) => c.variant === 'praise').length, 1);
});

test('no cheers while hints are turned off', async () => {
  const bg = backgroundEnv();
  const sender = { tab: { id: 7 } };
  await bg.request({ type: 'qh-settings', patch: { enabled: false } });
  const action = { id: 'docs:mod+c', site: 'docs', label: '복사', display: [['Ctrl', 'C']] };
  for (let i = 0; i < 5; i++) await bg.request({ type: 'qh-key', action }, sender);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bg.cards.length, 0);
  assert.equal(bg.storage.local.qh_state.combo, 5);
});

test('a cheer shows the keys actually pressed, such as Space for play/pause', async () => {
  const bg = backgroundEnv();
  const sender = { tab: { id: 7 } };
  const action = { id: 'yt:playpause', site: 'youtube', label: '재생 / 일시정지', display: [['K']] };
  for (let i = 0; i < 3; i++) await bg.request({ type: 'qh-mouse', action }, sender);
  await bg.request({ type: 'qh-key', action, used: ['Space'] }, sender);
  await bg.request({ type: 'qh-key', action }, sender);
  await new Promise((resolve) => setImmediate(resolve));
  const plain = (v) => JSON.parse(JSON.stringify(v)); // arrays from the worker's own context
  assert.deepEqual(plain(bg.cards.filter((c) => c.variant === 'praise').map((c) => c.display)), [[['Space']], [['K']]]);
  // The hint for the mouse keeps showing K.
  assert.deepEqual(plain(bg.storage.local.qh_state.actions['yt:playpause'].display), [['K']]);
});
