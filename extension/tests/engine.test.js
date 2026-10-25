const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/core/engine.js');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const START = new Date(2026, 9, 26, 9, 0, 0).getTime();

// Hints on every use like 'active' but keeps the one-minute gap of the other
// levels, so the gap rules can be tested without the 3-use threshold.
engine.STRENGTHS.everyMinute = Object.assign({}, engine.STRENGTHS.active, { gapMs: MIN });

function settings(patch) {
  return Object.assign({ enabled: true, strength: 'normal', pauseUntil: 0, disabledSites: [] }, patch);
}

function action(id) {
  return { id, site: 'docs', label: id, display: [['Ctrl', id.toUpperCase()]] };
}

function clicks(state, id, n, s, now) {
  let last;
  for (let i = 0; i < n; i++) last = engine.recordMouse(state, action(id), s, now);
  return last;
}

test('hints from the very first click after install', () => {
  const state = engine.emptyState(START);
  assert.equal(engine.recordMouse(state, action('b'), settings({ strength: 'active' }), START).show, true);
});

test('the first click that is too early for a hint says once that it is watching', () => {
  const state = engine.emptyState(START);
  const first = engine.recordMouse(state, action('b'), settings(), START);
  assert.equal(first.show, false);
  assert.equal(first.intro, true);
  assert.equal(first.need, 3);
  assert.equal(engine.recordMouse(state, action('i'), settings(), START).intro, undefined);
  // The log still says why no hint came.
  assert.equal(engine.summary(state, START).log[1].outcome, 'below-threshold');
});

test('no watching note when the first click already brings a hint', () => {
  const state = engine.emptyState(START);
  assert.equal(engine.recordMouse(state, action('b'), settings({ strength: 'active' }), START).show, true);
  assert.equal(engine.recordMouse(state, action('i'), settings(), START).intro, undefined);
});

test('the watching note waits while hints are off or in full screen', () => {
  const state = engine.emptyState(START);
  assert.equal(engine.recordMouse(state, action('b'), settings({ enabled: false }), START).intro, undefined);
  assert.equal(engine.recordMouse(state, action('b'), settings(), START, { suppress: true }).intro, undefined);
  assert.equal(engine.recordMouse(state, action('i'), settings(), START).intro, true);
});

test('normal level hints from the 3rd mouse use', () => {
  const state = engine.emptyState(START);
  assert.equal(clicks(state, 'b', 2, settings(), START).reason, 'below-threshold');
  const r = engine.recordMouse(state, action('b'), settings(), START);
  assert.equal(r.show, true);
  assert.equal(r.kind, 'new');
});

test('gentle level waits for the 5th use; active hints on the 1st', () => {
  const gentle = engine.emptyState(START);
  assert.equal(clicks(gentle, 'b', 4, settings({ strength: 'gentle' }), START).show, false);
  assert.equal(engine.recordMouse(gentle, action('b'), settings({ strength: 'gentle' }), START).show, true);

  const active = engine.emptyState(START);
  assert.equal(engine.recordMouse(active, action('b'), settings({ strength: 'active' }), START).show, true);
});

test('keeps at least one minute between hints', () => {
  const state = engine.emptyState(START);
  const s = settings({ strength: 'everyMinute' });
  assert.equal(engine.recordMouse(state, action('b'), s, START).show, true);
  const blocked = engine.recordMouse(state, action('i'), s, START + 30 * 1000);
  assert.equal(blocked.reason, 'gap');
  assert.equal(engine.recordMouse(state, action('i'), s, START + MIN).show, true);
});

test('caps new shortcuts per day and saves the rest for the summary', () => {
  const state = engine.emptyState(START);
  const s = settings();
  let now = START;
  for (const id of ['a', 'b', 'c']) {
    assert.equal(clicks(state, id, 3, s, now).show, true);
    now += 2 * MIN;
  }
  const capped = clicks(state, 'd', 3, s, now);
  assert.equal(capped.reason, 'daily-cap');
  assert.equal(engine.summary(state, now).waiting, 1);

  // A new day resets the cap.
  const tomorrow = START + 24 * HOUR;
  assert.equal(engine.recordMouse(state, action('d'), s, tomorrow).show, true);
});

test('repeats an introduced shortcut at most once an hour on normal', () => {
  const state = engine.emptyState(START);
  const s = settings();
  clicks(state, 'b', 3, s, START);
  assert.equal(engine.recordMouse(state, action('b'), s, START + 10 * MIN).reason, 'repeat-wait');
  const again = engine.recordMouse(state, action('b'), s, START + HOUR);
  assert.equal(again.show, true);
  assert.equal(again.kind, 'repeat');
});

test('marks a shortcut learned once most recent uses are the keyboard', () => {
  const state = engine.emptyState(START);
  clicks(state, 'b', 3, settings(), START);
  let learned = false;
  let presses = 0;
  while (!learned && presses < 20) {
    learned = engine.recordKey(state, action('b'), START + MIN).learnedNow;
    presses++;
  }
  assert.equal(learned, true);
  assert.equal(engine.keyRatio(state.actions.b) >= 0.8, true);
  // No more hints for a learned shortcut while the keyboard stays dominant.
  assert.equal(engine.recordMouse(state, action('b'), settings({ strength: 'active' }), START + 2 * HOUR).reason, 'learned');
});

test('reminds once a day when someone drifts back to the mouse', () => {
  const state = engine.emptyState(START);
  const s = settings({ strength: 'active' });
  engine.recordMouse(state, action('b'), s, START);
  for (let i = 0; i < 10; i++) engine.recordKey(state, action('b'), START + MIN);
  assert.ok(state.actions.b.learnedAt);
  let reminder;
  for (let i = 0; i < 6 && !reminder; i++) {
    const r = engine.recordMouse(state, action('b'), s, START + 25 * HOUR + i * MIN);
    if (r.show) reminder = r;
  }
  assert.equal(reminder.kind, 'reminder');
  assert.equal(engine.recordMouse(state, action('b'), s, START + 26 * HOUR).show, false);
});

test('skips shortcuts the person already uses by keyboard', () => {
  const state = engine.emptyState(START);
  engine.recordKey(state, action('c'), START);
  engine.recordKey(state, action('c'), START);
  assert.equal(engine.recordMouse(state, action('c'), settings({ strength: 'active' }), START).reason, 'learned');
});

test('a key pressed before any hint stops counting once the mouse takes over', () => {
  const state = engine.emptyState(START);
  const s = settings();
  engine.recordKey(state, action('k'), START);
  // Half of the recent uses are still the keyboard: known, no hint.
  assert.equal(engine.recordMouse(state, action('k'), s, START).reason, 'learned');
  // Mostly the mouse now: hinted like any new shortcut, from the 3rd mouse use.
  assert.equal(engine.recordMouse(state, action('k'), s, START).reason, 'below-threshold');
  const r = engine.recordMouse(state, action('k'), s, START);
  assert.equal(r.show, true);
  assert.equal(r.kind, 'new');
});

test('a state where one key press hid a mouse-heavy shortcut hints it again', () => {
  const state = engine.emptyState(START);
  const s = settings();
  engine.recordKey(state, action('k'), START);
  for (let i = 0; i < 60; i++) engine.recordMouse(state, action('k'), settings({ enabled: false }), START);
  const r = engine.recordMouse(state, action('k'), s, START + MIN);
  assert.equal(r.show, true);
  assert.equal(r.kind, 'new');
});

test('stays quiet while paused, turned off or in full screen, but still counts', () => {
  const state = engine.emptyState(START);
  const active = settings({ strength: 'active' });
  assert.equal(engine.recordMouse(state, action('b'), settings({ strength: 'active', enabled: false }), START).reason, 'paused');
  assert.equal(engine.recordMouse(state, action('b'), settings({ strength: 'active', pauseUntil: START + HOUR }), START).reason, 'paused');
  assert.equal(engine.recordMouse(state, action('b'), active, START, { suppress: true }).reason, 'suppressed');
  assert.equal(state.actions.b.mouse, 3);
});

test('collects every named shortcut pressed at least once, hint or not', () => {
  const state = engine.emptyState(START);
  const play = { id: 'yt:playpause', site: 'youtube', label: 'Play / pause', display: [['K']] };
  const bold = { id: 'docs:mod+b', site: 'docs', label: 'Bold', display: [['Ctrl', 'B']] };

  // Mouse first, never hinted, then one key press: it joins the collection.
  for (let i = 0; i < 2; i++) engine.recordMouse(state, bold, settings(), START);
  engine.recordKey(state, bold, START);
  engine.recordKey(state, play, START);
  engine.recordKey(state, { id: 'docs:mod+q', site: 'docs', label: '', display: [['Ctrl', 'Q']] }, START); // no name
  assert.deepEqual(engine.summary(state, START).learned.map((a) => a.id).sort(), ['docs:mod+b', 'yt:playpause']);
});

test('lists the collection newest first', () => {
  const state = engine.emptyState(START);
  const named = (id) => ({ id, site: 'docs', label: id + ' name', display: [['Ctrl', id]] });
  engine.recordKey(state, named('a'), START);
  engine.recordKey(state, named('b'), START + HOUR);
  engine.recordKey(state, named('a'), START + 2 * HOUR); // pressing again doesn't move it up
  assert.deepEqual(engine.summary(state, START + 2 * HOUR).learned.map((a) => a.id), ['b', 'a']);
});

test('a built-in fallback name never replaces the name read from the page', () => {
  const state = engine.emptyState(START);
  const id = 'docs:mod+b';
  engine.recordKey(state, { id, site: 'docs', label: '굵게', fallbackLabel: true, display: [['Ctrl', 'B']] }, START);
  assert.equal(state.actions[id].label, '굵게');
  engine.recordMouse(state, { id, site: 'docs', label: '굵게 효과', display: [['Ctrl', 'B']] }, settings(), START);
  engine.recordKey(state, { id, site: 'docs', label: '굵게', fallbackLabel: true, display: [['Ctrl', 'B']] }, START);
  assert.equal(state.actions[id].label, '굵게 효과');
});

test('summary lists today\'s mouse actions, most frequent first', () => {
  const state = engine.emptyState(START);
  clicks(state, 'b', 2, settings(), START);
  clicks(state, 'i', 1, settings(), START);
  const s = engine.summary(state, START);
  assert.equal(s.todayMouse, 3);
  assert.deepEqual(s.missed.map((a) => a.id), ['b', 'i']);
});

test('a muted shortcut is never hinted until it is turned back on', () => {
  const state = engine.emptyState(START);
  const s = settings({ strength: 'active' });
  assert.equal(engine.recordMouse(state, action('b'), s, START).show, true);
  assert.equal(engine.setMuted(state, 'b', true, START), true);

  const r = engine.recordMouse(state, action('b'), s, START + HOUR);
  assert.equal(r.show, false);
  assert.equal(r.reason, 'muted');
  assert.equal(state.actions.b.mouse, 2); // still counted

  engine.setMuted(state, 'b', false, START + HOUR);
  assert.equal(engine.recordMouse(state, action('b'), s, START + 2 * HOUR).show, true);
});

test('muting an unknown action does nothing', () => {
  const state = engine.emptyState(START);
  assert.equal(engine.setMuted(state, 'nope', true, START), false);
  assert.deepEqual(engine.summary(state, START).muted, []);
});

test('summary lists muted shortcuts newest first and leaves them out of missed', () => {
  const state = engine.emptyState(START);
  clicks(state, 'b', 2, settings(), START);
  clicks(state, 'i', 1, settings(), START);
  clicks(state, 'u', 1, settings(), START);
  engine.setMuted(state, 'b', true, START);
  engine.setMuted(state, 'i', true, START + MIN);
  const s = engine.summary(state, START + MIN);
  assert.deepEqual(s.muted.map((a) => a.id), ['i', 'b']);
  assert.deepEqual(s.missed.map((a) => a.id), ['u']);
});

test('muting clears a shortcut waiting behind the daily cap', () => {
  const state = engine.emptyState(START);
  const s = settings();
  let now = START;
  for (const id of ['a', 'b', 'c']) {
    clicks(state, id, 3, s, now);
    now += 2 * MIN;
  }
  assert.equal(clicks(state, 'd', 3, s, now).reason, 'daily-cap');
  engine.setMuted(state, 'd', true, now);
  assert.equal(engine.summary(state, now).waiting, 0);
});

test('a new shortcut held back by the gap goes before repeats of a hinted one', () => {
  const state = engine.emptyState(START);
  const s = settings({ strength: 'everyMinute' });
  assert.equal(engine.recordMouse(state, action('k'), s, START).show, true); // play/pause hinted
  assert.equal(engine.recordMouse(state, action('t'), s, START + 10 * 1000).reason, 'gap'); // theater waits

  // A minute later, clicking play/pause again does not take theater's turn...
  assert.equal(engine.recordMouse(state, action('k'), s, START + 61 * 1000).reason, 'new-waiting');
  // ...so theater gets its hint on its next click.
  const r = engine.recordMouse(state, action('t'), s, START + 70 * 1000);
  assert.equal(r.show, true);
  assert.equal(r.kind, 'new');
  // Nothing is waiting any more, so repeats go back to normal after the gap.
  assert.equal(engine.recordMouse(state, action('k'), s, START + 131 * 1000).show, true);
});

test('a waiting new shortcut stops holding back repeats after 10 minutes', () => {
  const state = engine.emptyState(START);
  const s = settings({ strength: 'everyMinute' });
  engine.recordMouse(state, action('k'), s, START);
  engine.recordMouse(state, action('t'), s, START + 10 * 1000);
  assert.equal(engine.recordMouse(state, action('k'), s, START + 11 * MIN).show, true);
});

test('a waiting new shortcut that gets muted or pressed by key stops holding back repeats', () => {
  const s = settings({ strength: 'everyMinute' });
  for (const settle of [
    (state) => engine.setMuted(state, 't', true, START + 20 * 1000),
    (state) => engine.recordKey(state, action('t'), START + 20 * 1000),
  ]) {
    const state = engine.emptyState(START);
    engine.recordMouse(state, action('k'), s, START);
    engine.recordMouse(state, action('t'), s, START + 10 * 1000);
    settle(state);
    assert.equal(engine.recordMouse(state, action('k'), s, START + 61 * 1000).show, true);
  }
});

test('states saved before the waiting list existed still work', () => {
  const state = engine.emptyState(START);
  delete state.waitingNew;
  const s = settings({ strength: 'everyMinute' });
  engine.recordMouse(state, action('k'), s, START);
  assert.equal(engine.recordMouse(state, action('t'), s, START + 10 * 1000).reason, 'gap');
  assert.equal(engine.recordMouse(state, action('k'), s, START + 61 * 1000).reason, 'new-waiting');
});

test('a repeat hint does not make a new shortcut wait a minute', () => {
  const state = engine.emptyState(START);
  const s = settings({ strength: 'everyMinute' });
  engine.recordMouse(state, action('k'), s, START); // first hint for play/pause
  const repeat = engine.recordMouse(state, action('k'), s, START + 10 * MIN);
  assert.equal(repeat.kind, 'repeat');
  // Theater right after the repeat: shown at once.
  const r = engine.recordMouse(state, action('t'), s, START + 10 * MIN + 5 * 1000);
  assert.equal(r.show, true);
  assert.equal(r.kind, 'new');
  // Another new one still waits a minute after that first hint.
  assert.equal(engine.recordMouse(state, action('c'), s, START + 10 * MIN + 10 * 1000).reason, 'gap');
  // And a repeat still waits a minute after any hint.
  assert.equal(engine.recordMouse(state, action('k'), s, START + 10 * MIN + 30 * 1000).reason, 'gap');
});

test('keeps the last 10 decisions with the reason, newest first', () => {
  const state = engine.emptyState(START);
  const s = settings();
  engine.recordMouse(state, action('b'), s, START);
  engine.recordMouse(state, action('b'), s, START + 1000);
  let log = engine.summary(state, START + 1000).log;
  assert.deepEqual(log[0], {
    label: 'b', site: 'docs', display: [['Ctrl', 'B']],
    id: 'b', at: START + 1000, input: 'mouse', outcome: 'below-threshold', count: 2, need: 3,
  });
  engine.recordMouse(state, action('b'), s, START + 2000); // 3rd: shown
  engine.recordMouse(state, action('i'), settings({ strength: 'everyMinute' }), START + 3000);
  engine.recordKey(state, action('b'), START + 4000);
  log = engine.summary(state, START + 4000).log;
  assert.deepEqual(log.map((e) => [e.id, e.outcome]), [['b', 'key'], ['i', 'gap'], ['b', 'new'], ['b', 'below-threshold'], ['b', 'below-threshold']]);
  assert.equal(log[1].waitMs, MIN - 1000);

  for (let i = 0; i < 20; i++) engine.recordMouse(state, action('u'), s, START + 5000 + i);
  assert.equal(engine.summary(state, START + 6000).log.length, 10);
});

test('the log leaves out "just watching" entries kept by older versions', () => {
  const state = engine.emptyState(START);
  engine.recordMouse(state, action('b'), settings(), START);
  state.log.push({ id: 'b', at: START - 1000, input: 'mouse', outcome: 'observing', left: 29 });
  assert.deepEqual(engine.summary(state, START).log.map((e) => e.outcome), ['below-threshold']);
});

test('active level hints every click, with no gap between cards', () => {
  const state = engine.emptyState(START);
  const s = settings({ strength: 'active' });
  assert.equal(engine.recordMouse(state, action('m'), s, START).show, true); // "Move"
  assert.equal(engine.recordMouse(state, action('d'), s, START + 2000).show, true); // "Details" right after
  assert.equal(engine.recordMouse(state, action('a'), s, START + 4000).show, true); // "Activity"
  assert.equal(engine.recordMouse(state, action('d'), s, START + 6000).kind, 'repeat');
});

test('learning requires ten uses and at least eight keyboard uses', () => {
  const state = engine.emptyState(START);
  clicks(state, 'b', 1, settings({ strength: 'active' }), START);
  for (let i = 0; i < 8; i++) assert.equal(engine.recordKey(state, action('b'), START + i + 1).learnedNow, false);
  assert.equal(engine.recordKey(state, action('b'), START + 10).learnedNow, true);
  const exact = engine.emptyState(START);
  clicks(exact, 'b', 2, settings({ strength: 'active' }), START);
  for (let i = 0; i < 7; i++) assert.equal(engine.recordKey(exact, action('b'), START + i + 1).learnedNow, false);
  assert.equal(engine.recordKey(exact, action('b'), START + 10).learnedNow, true);
});

test('switching to active does not let waiting new shortcuts block repeats', () => {
  const state = engine.emptyState(START);
  clicks(state, 'a', 3, settings(), START);
  assert.equal(clicks(state, 'b', 3, settings(), START + 1000).reason, 'gap');
  assert.equal(engine.recordMouse(state, action('a'), settings({ strength: 'active' }), START + 2000).show, true);
});

test('daily-cap waiting entries disappear when learned or finally introduced', () => {
  for (const settle of [
    (state, now) => engine.recordKey(state, action('d'), now),
    (state, now) => engine.recordMouse(state, action('d'), settings({ strength: 'active' }), now),
  ]) {
    const state = engine.emptyState(START);
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) clicks(state, id, 3, settings(), START + i * 2 * MIN);
    assert.equal(engine.summary(state, START + 10 * MIN).waiting, 1);
    settle(state, START + 10 * MIN);
    assert.equal(engine.summary(state, START + 10 * MIN).waiting, 0);
  }
});

test('records include keyboard-only actions, even unnamed legacy records', () => {
  const state = engine.emptyState(START);
  engine.recordKey(state, { id: 'docs:mod+q', display: [['Ctrl', 'Q']] }, START);
  assert.equal(engine.summary(state, START).tracked[0].key, 1);
});

test('missing legacy alert timestamp conservatively preserves the minimum gap', () => {
  const state = engine.emptyState(START);
  clicks(state, 'a', 3, settings(), START);
  delete state.lastNewAlertAt;
  assert.equal(clicks(state, 'b', 3, settings(), START + 1000).reason, 'gap');
});

test('midnight resets daily counters and caps, but preserves rolling repeat intervals', () => {
  const before = new Date(2026, 9, 26, 23, 59, 0).getTime();
  const after = before + 2 * MIN;
  const state = engine.emptyState(before);
  const gentle = settings({ strength: 'gentle' });
  clicks(state, 'a', 5, gentle, before);
  delete state.waitingNew;
  delete state.log;
  const r = engine.recordMouse(state, action('a'), gentle, after);
  assert.equal(r.reason, 'repeat-wait');
  assert.equal(state.day, '2026-10-27');
  assert.equal(state.todayMouse, 1);
  assert.equal(state.actions.a.todayMouse, 1);
  assert.deepEqual(state.newToday, []);
  assert.deepEqual(state.missedToday, {});
  assert.equal(engine.recordMouse(state, action('a'), gentle, before + 24 * HOUR).show, true);
});
