const test = require('node:test');
const assert = require('node:assert/strict');
const feedback = require('../src/core/feedback.js');

// The UI's words, here as "key|subs" so the tests can see what went where.
const t = (key, subs) => (subs ? key + '|' + subs.join('|') : key);

test('reads only versions from the browser', () => {
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.86 Safari/537.36';
  assert.deepEqual(feedback.environment(win, '0.1.0', 'ko'), { version: '0.1.0', chrome: '155', os: 'Windows', language: 'ko' });
  assert.equal(feedback.environment('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/150.0.0.0', '0.1.0', 'en').os, 'Mac');
  assert.equal(feedback.environment('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/150.0.0.0', '0.1.0', 'ko').os, 'ChromeOS');
  assert.equal(feedback.environment('', '0.1.0', '').chrome, '?');
});

test('writes keys the way the popup shows them', () => {
  assert.equal(feedback.keysText([['Ctrl', 'B']], '다음'), 'Ctrl+B');
  assert.equal(feedback.keysText([['Ctrl', 'Alt', 'E', '→', 'C']], '다음'), 'Ctrl+Alt+E 다음 C');
  assert.equal(feedback.keysText([['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], 'then'), 'Ctrl+Y / Ctrl+Shift+Z');
  assert.equal(feedback.keysText([['Shift', '→']], 'then'), 'Shift+→'); // a trailing "→" is the arrow key
  assert.equal(feedback.keysText(undefined, 'then'), '');
});

test('puts the kind, site, words, versions and recent actions in that order', () => {
  const text = feedback.compose({
    kind: 'Broken shortcut',
    site: 'Google Slides',
    message: '  Ctrl+Enter does nothing  ',
    env: { version: '0.1.0', chrome: '155', os: 'Windows', language: 'ko' },
    log: [{ time: '2:05 PM', site: 'Google Slides', label: 'Bold', keys: 'Ctrl+B', input: 'Mouse', why: 'Hint shown' }],
  }, t);
  assert.equal(text, [
    'fbTitle', '',
    'fbLineKind|Broken shortcut', 'fbLineSite|Google Slides', '',
    'fbLineMessage', 'Ctrl+Enter does nothing', '',
    'fbLineEnv|0.1.0|155|Windows|ko', '',
    'fbLineLog', '2:05 PM · Google Slides · Bold · Ctrl+B · Mouse · Hint shown',
  ].join('\n'));
});

test('leaves the recent actions out when not chosen, and says when there are none', () => {
  const parts = { kind: 'Other', site: 'None', message: '', env: { version: '0.1.0', chrome: '155', os: 'Mac', language: 'en' }, log: null };
  const without = feedback.compose(parts, t);
  assert.ok(!without.includes('fbLineLog'));
  assert.ok(without.includes('fbNoMessage'));
  assert.ok(feedback.compose(Object.assign({}, parts, { log: [] }), t).endsWith('fbLineLog\nfbNoLog'));
});

test('the Gmail compose link carries only the address, subject and fixed "paste here" line', () => {
  const link = feedback.composeUrl('[손빠르미 의견] 단축키가 안 돼요', '여기에 붙여 넣어 주세요');
  assert.equal(link, 'https://mail.google.com/mail/?view=cm&fs=1&to=ehsheh%40gmail.com'
    + '&su=' + encodeURIComponent('[손빠르미 의견] 단축키가 안 돼요')
    + '&body=' + encodeURIComponent('여기에 붙여 넣어 주세요'));
  assert.ok(!feedback.composeUrl('x').includes('body='));
});
