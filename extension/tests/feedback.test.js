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

test('the Gmail compose link fills the address, subject and the whole text', () => {
  const body = '[손빠르미 의견]\n\n종류: 단축키가 안 돼요\n사이트: 구글 슬라이드 & 문서';
  const link = feedback.composeUrl('[손빠르미 의견] 단축키가 안 돼요', body);
  assert.equal(link, 'https://mail.google.com/mail/?view=cm&fs=1&to=ehsheh%40gmail.com'
    + '&su=' + encodeURIComponent('[손빠르미 의견] 단축키가 안 돼요')
    + '&body=' + encodeURIComponent(body));
  assert.equal(new URL(link).searchParams.get('body'), body); // line breaks and "&" survive
  assert.ok(!feedback.composeUrl('x').includes('body='));
});

test('a typical text with 10 recent actions fits the length Gmail takes', () => {
  const t = (key, subs) => (subs ? key + ' ' + subs.join(' ') : key);
  const log = Array.from({ length: 10 }, () => ({
    time: '오후 2:57:59', site: '구글 슬라이드', label: '현재 댓글로 들어가기', keys: 'Ctrl+Alt+E 다음 C', input: '마우스',
    why: '이미 단축키로 잘 쓰고 계셔서 알리지 않았어요.',
  }));
  const text = feedback.compose({ kind: '단축키가 안 돼요', site: '구글 슬라이드', message: '댓글 칸에 들어가지 않아요', env: { version: '0.1.0', chrome: '155', os: 'Windows', language: 'ko-KR' }, log }, t);
  assert.ok(feedback.composeUrl('[손빠르미 의견] 단축키가 안 돼요', text).length <= feedback.MAX_URL);
});
