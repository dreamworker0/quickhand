// Hint rules from the plan: when to show a shortcut, how many per day, and when a
// shortcut counts as learned. Pure functions over a plain state object so the
// background worker can persist it and tests can drive it with a fake clock.
(function (root) {
  'use strict';
  const QH = (root.QH = root.QH || {});

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  // gapMs: least time between hints. "Active" hints on every click, as its name
  // promises; a new card simply replaces the one on screen.
  const STRENGTHS = {
    gentle: { threshold: 5, dailyNew: 2, repeatMs: DAY, gapMs: 60 * 1000 },
    normal: { threshold: 3, dailyNew: 3, repeatMs: HOUR, gapMs: 60 * 1000 },
    active: { threshold: 1, dailyNew: Infinity, repeatMs: 0, gapMs: 0 },
  };

  const RULES = {
    window: 10, // recent uses kept per action
    learnMinUses: 10,
    learnRatio: 0.8,
    knownRatio: 0.5, // used by keyboard before any hint: known while half of recent uses are keys
    relapseRatio: 0.5,
    relapseGapMs: DAY,
    newWaitMs: 10 * 60 * 1000, // a first hint held back by the gap goes before repeats this long
    logSize: 10, // recent decisions kept for the popup
  };

  const pad = (n) => String(n).padStart(2, '0');

  function dayKey(now) {
    const d = new Date(now);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function emptyState(now) {
    return {
      version: 1,
      day: dayKey(now),
      lastAlertAt: 0,
      lastNewAlertAt: 0,
      newToday: [],
      missedToday: {},
      waitingNew: {},
      todayMouse: 0,
      todayKey: 0,
      actions: {},
      log: [],
    };
  }

  function rollDay(state, now) {
    // States without this field must still respect the gap after their last hint.
    if (!Number.isFinite(state.lastNewAlertAt)) state.lastNewAlertAt = state.lastAlertAt || 0;
    const today = dayKey(now);
    if (state.day === today) return state;
    state.day = today;
    state.newToday = [];
    state.missedToday = {};
    state.waitingNew = {};
    state.todayMouse = 0;
    state.todayKey = 0;
    for (const a of Object.values(state.actions)) {
      a.todayMouse = 0;
      a.todayKey = 0;
    }
    return state;
  }

  function ensureAction(state, info) {
    let a = state.actions[info.id];
    if (!a) {
      a = state.actions[info.id] = {
        id: info.id,
        site: info.site || '',
        label: info.label || info.id,
        display: info.display || [],
        mouse: 0,
        key: 0,
        todayMouse: 0,
        todayKey: 0,
        recent: '',
        introducedAt: 0,
        lastAlertAt: 0,
        learnedAt: 0,
        firstKeyAt: 0,
        mutedAt: 0,
        known: false,
      };
    }
    // A name read from the page wins over a built-in fallback name.
    if (info.label && (!info.fallbackLabel || a.label === a.id)) a.label = info.label;
    if (info.display && info.display.length) a.display = info.display;
    if (info.site) a.site = info.site;
    return a;
  }

  function pushRecent(a, ch) {
    a.recent = (a.recent + ch).slice(-RULES.window);
  }

  function keyRatio(a) {
    if (!a.recent.length) return 0;
    let k = 0;
    for (const ch of a.recent) if (ch === 'k') k++;
    return k / a.recent.length;
  }

  // Learned after a hint stays learned (a drift back to the mouse gets a daily
  // reminder). A shortcut pressed before any hint only counts as known while the
  // keyboard keeps up: one press of Space doesn't silence play/pause for good.
  function isLearned(a) {
    return !!(a.learnedAt || (a.known && keyRatio(a) >= RULES.knownRatio));
  }

  function isPaused(settings, now) {
    return !settings.enabled || (settings.pauseUntil || 0) > now;
  }

  // First hints that only the one-minute gap held back, by when they were held.
  // Older saved states don't have the field yet.
  function waitingNew(state) {
    return state.waitingNew || (state.waitingNew = {});
  }

  // True while a shortcut that was never hinted is still waiting for its turn, so
  // a repeat of an already-hinted one doesn't take every free slot.
  function hasWaitingNew(state, now) {
    const waiting = waitingNew(state);
    for (const [id, since] of Object.entries(waiting)) {
      const a = state.actions[id];
      if (!a || a.introducedAt || a.mutedAt || isLearned(a) || now - since > RULES.newWaitMs) delete waiting[id];
      else return true;
    }
    return false;
  }

  function recordKey(state, info, now) {
    rollDay(state, now);
    const a = ensureAction(state, info);
    a.key++;
    delete state.missedToday[a.id];
    if (!a.firstKeyAt) a.firstKeyAt = now;
    a.todayKey++;
    state.todayKey++;
    pushRecent(a, 'k');
    // Used by keyboard before we ever suggested it: the person already knows it.
    if (!a.introducedAt && !a.learnedAt) a.known = true;
    let learnedNow = false;
    if (a.introducedAt && !a.learnedAt && a.recent.length >= RULES.learnMinUses && keyRatio(a) >= RULES.learnRatio) {
      a.learnedAt = now;
      learnedNow = true;
    }
    remember(state, a, now, { input: 'key', outcome: learnedNow ? 'learned-now' : 'key' });
    return { learnedNow, action: a };
  }

  // The last few decisions and why, so the popup can answer "why no hint?". Only
  // the action id, time and outcome are kept, like the rest of the record.
  function remember(state, a, now, entry) {
    const log = state.log || (state.log = []);
    log.unshift(Object.assign({ id: a.id, at: now }, entry));
    if (log.length > RULES.logSize) log.length = RULES.logSize;
  }

  function recordMouse(state, info, settings, now, context) {
    const result = judgeMouse(state, info, settings, now, context);
    const entry = { input: 'mouse', outcome: result.show ? result.kind : result.reason };
    for (const k of ['waitMs', 'count', 'need', 'left']) if (result[k] !== undefined) entry[k] = result[k];
    remember(state, result.action, now, entry);
    return result;
  }

  function judgeMouse(state, info, settings, now, context) {
    rollDay(state, now);
    const a = ensureAction(state, info);
    a.mouse++;
    a.todayMouse++;
    state.todayMouse++;
    pushRecent(a, 'm');

    const strength = STRENGTHS[settings.strength] || STRENGTHS.normal;
    const skip = (reason, extra) => Object.assign({ show: false, reason, action: a }, extra);

    if (a.mutedAt) return skip('muted');
    if (context && context.suppress) return skip('suppressed');
    if (isPaused(settings, now)) return skip('paused');

    let kind;
    if (isLearned(a)) {
      // Back to the mouse after learning it: remind at most once a day.
      if (a.recent.length < RULES.learnMinUses || keyRatio(a) >= RULES.relapseRatio) return skip('learned');
      if (now - a.lastAlertAt < RULES.relapseGapMs) return skip('learned');
      kind = 'reminder';
    } else if (a.introducedAt) {
      if (now - a.lastAlertAt < strength.repeatMs) return skip('repeat-wait', { waitMs: a.lastAlertAt + strength.repeatMs - now });
      kind = 'repeat';
    } else {
      if (a.mouse < strength.threshold) return skip('below-threshold', { count: a.mouse, need: strength.threshold });
      if (state.newToday.length >= strength.dailyNew) {
        state.missedToday[a.id] = (state.missedToday[a.id] || 0) + 1;
        return skip('daily-cap', { need: strength.dailyNew });
      }
      kind = 'new';
    }

    // A first hint waits only for the previous first hint; a repeat of something
    // already seen never holds a new shortcut back. Repeats wait for any hint.
    const since = kind === 'new' ? state.lastNewAlertAt || 0 : state.lastAlertAt;
    if (now - since < strength.gapMs) {
      if (kind === 'new') waitingNew(state)[a.id] = now;
      return skip('gap', { waitMs: since + strength.gapMs - now });
    }
    if (strength.gapMs > 0 && kind !== 'new' && hasWaitingNew(state, now)) return skip('new-waiting');

    a.lastAlertAt = now;
    state.lastAlertAt = now;
    if (kind === 'new') {
      state.lastNewAlertAt = now;
      a.introducedAt = now;
      delete state.missedToday[a.id];
      state.newToday.push(a.id);
      delete waitingNew(state)[a.id];
    }
    return { show: true, kind, action: a };
  }

  // "Stop hinting this one" from the card, and "hint again" from the popup. Counts
  // keep going while muted, so the learned check still works if it is turned back on.
  function setMuted(state, id, muted, now) {
    const a = state.actions[id];
    if (!a) return false;
    a.mutedAt = muted ? now : 0;
    if (muted) delete state.missedToday[id];
    return true;
  }

  // The collection: every shortcut the person has pressed at least once, hint or
  // not. Key combos we have no name for are left out.
  function knowsShortcut(a) {
    return !!a.learnedAt || (a.key > 0 && a.label !== a.id && a.display.length > 0);
  }

  function summary(state, now) {
    rollDay(state, now);
    const actions = Object.values(state.actions);
    return {
      todayMouse: state.todayMouse,
      todayKey: state.todayKey,
      missed: actions
        .filter((a) => a.todayMouse > 0 && a.display.length && !a.mutedAt)
        .sort((x, y) => y.todayMouse - x.todayMouse),
      waiting: Object.keys(state.missedToday).filter((id) => {
        const a = state.actions[id];
        return a && !a.introducedAt && !a.mutedAt && !isLearned(a);
      }).length,
      // Newest first: when it was learned after a hint, or first pressed by keyboard.
      learned: actions
        .filter(knowsShortcut)
        .sort((x, y) => (y.learnedAt || y.firstKeyAt || 0) - (x.learnedAt || x.firstKeyAt || 0) || y.key - x.key),
      tracked: actions.filter((a) => a.mouse > 0 || a.key > 0 || a.introducedAt).sort((x, y) => y.mouse - x.mouse || y.key - x.key),
      // Newest first, so the one just muted by mistake is at the top.
      muted: actions.filter((a) => a.mutedAt).sort((x, y) => y.mutedAt - x.mutedAt),
      // Newest first, with the action's name and keys for display. "observing" was
      // left by versions that only watched the first 30 actions.
      log: (state.log || [])
        .filter((e) => state.actions[e.id] && e.outcome !== 'observing')
        .map((e) => {
          const a = state.actions[e.id];
          return Object.assign({ label: a.label, site: a.site, display: a.display }, e);
        }),
    };
  }

  QH.engine = {
    STRENGTHS, RULES, dayKey, emptyState, rollDay, keyRatio,
    recordKey, recordMouse, setMuted, summary,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = QH.engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
