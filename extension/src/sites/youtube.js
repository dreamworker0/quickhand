// YouTube watch and Shorts pages: player buttons and their one-key shortcuts.
(function () {
  'use strict';
  const QH = (globalThis.QH = globalThis.QH || {});
  const t = (key) => chrome.i18n.getMessage(key) || key;
  const key = (k, shift) => QH.keys.combo(k, { shift: !!shift });

  const ACTIONS = {
    playpause: { msg: 'ytPlayPause', combos: [key('k')] },
    mute: { msg: 'ytMute', combos: [key('m')] },
    fullscreen: { msg: 'ytFullscreen', combos: [key('f')] },
    captions: { msg: 'ytCaptions', combos: [key('c')] },
    theater: { msg: 'ytTheater', combos: [key('t')] },
    miniplayer: { msg: 'ytMiniplayer', combos: [key('i')] },
    next: { msg: 'ytNext', combos: [key('n', true)] },
    prev: { msg: 'ytPrev', combos: [key('p', true)] },
    seek: { msg: 'ytSeek', combos: [key('j'), key('l')] },
    speed: { msg: 'ytSpeed', combos: [key('.', true), key(',', true)] },
    search: { msg: 'ytSearch', combos: [key('/')] },
    shortsnext: { msg: 'ytShortsNext', combos: [key('arrowdown')] },
    shortsprev: { msg: 'ytShortsPrev', combos: [key('arrowup')] },
  };

  // Player buttons announce their key in aria-keyshortcuts ("k", "m", "SHIFT+n");
  // class names are the fallback for buttons that don't.
  const ARIA_KEYS = {
    k: 'playpause', m: 'mute', f: 'fullscreen', c: 'captions', t: 'theater', i: 'miniplayer', 'shift+n': 'next', 'shift+p': 'prev',
  };

  // The playback-speed panel: −/+ buttons, the slider and the preset buttons.
  const SPEED_CONTROLS = '.ytp-variable-speed-panel-button, .ytp-variable-speed-panel-preset-button, .ytp-speedslider';

  const BUTTONS = [
    ['ytp-play-button', 'playpause'],
    ['ytp-mute-button', 'mute'],
    ['ytp-volume-icon', 'mute'],
    ['ytp-fullscreen-button', 'fullscreen'],
    ['ytp-subtitles-button', 'captions'],
    ['ytp-size-button', 'theater'],
    ['ytp-miniplayer-button', 'miniplayer'],
    ['ytp-next-button', 'next'],
    ['ytp-prev-button', 'prev'],
  ];

  const KEYS = {
    k: 'playpause', space: 'playpause', m: 'mute', f: 'fullscreen', c: 'captions',
    t: 'theater', i: 'miniplayer', j: 'seek', l: 'seek', arrowleft: 'seek', arrowright: 'seek',
  };

  // Shorts draw their own control bar (play, mute) over the player and put the
  // up/down buttons beside it, outside the usual player.
  const SHORTS_BUTTONS = [
    ['#play-pause-button-shape', 'playpause'],
    ['volume-controls button', 'mute'],
    ['#navigation-button-down', 'shortsnext'],
    ['#navigation-button-up', 'shortsprev'],
  ];

  const SHORTS_KEYS = { k: 'playpause', space: 'playpause', m: 'mute', arrowdown: 'shortsnext', arrowup: 'shortsprev' };

  // Buttons this module relies on, per page. When one is gone YouTube has most
  // likely changed its page, and the popup says so instead of hints quietly stopping.
  const EXPECTED = {
    watch: [['.ytp-play-button', 'playpause'], ['.ytp-mute-button', 'mute'], ['.ytp-size-button', 'theater'], ['.ytp-fullscreen-button', 'fullscreen']],
    shorts: [['#play-pause-button-shape', 'playpause'], ['volume-controls button', 'mute'], ['#navigation-button-down', 'shortsnext']],
  };

  function action(name) {
    const a = ACTIONS[name];
    return { id: 'yt:' + name, label: t(a.msg), combos: a.combos };
  }

  function onWatchPage() {
    return location.pathname === '/watch';
  }

  function onShortsPage() {
    return location.pathname.startsWith('/shorts/');
  }

  function fromShortsMouse(el) {
    for (const [sel, name] of SHORTS_BUTTONS) if (el.closest(sel)) return action(name);
    // Clicking the video itself pauses and resumes it.
    if (el.closest('#shorts-player') && (el.matches('video') || el.closest('.html5-video-container'))) return action('playpause');
    return null;
  }

  function fromMouse(e) {
    if (!(e.target instanceof Element)) return null;
    const el = e.target;
    if (el.closest('input[name="search_query"]')) return action('search'); // on every page
    if (onShortsPage()) return fromShortsMouse(el);
    if (!onWatchPage() || !el.closest('#movie_player, .html5-video-player')) return null;
    if (el.closest(SPEED_CONTROLS)) return action('speed');
    const button = el.closest('button, .ytp-button');
    if (button) {
      const aria = (button.getAttribute('aria-keyshortcuts') || '').toLowerCase();
      if (ARIA_KEYS[aria]) return action(ARIA_KEYS[aria]);
      for (const [cls, name] of BUTTONS) if (button.closest('.' + cls)) return action(name);
      return null;
    }
    // Clicking the progress bar jumps to a chosen point, which J/L (10 s steps)
    // can't replace, so it is not counted.
    if (el.closest('.ytp-progress-bar-container, .ytp-progress-bar')) return null;
    if (el.matches('video') || el.closest('.html5-video-container, .ytp-cued-thumbnail-overlay')) return action('playpause');
    return null;
  }

  const SHIFT_KEYS = { n: 'next', p: 'prev', '.': 'speed', ',': 'speed' };

  function fromKey(e, mac) {
    if (e.ctrlKey || e.metaKey || e.altKey || QH.keys.isTyping(e)) return null;
    const k = QH.keys.fromEvent(e, mac).key;
    if (k === '/' && !e.shiftKey) return action('search');
    if (onShortsPage()) return !e.shiftKey && SHORTS_KEYS[k] ? action(SHORTS_KEYS[k]) : null;
    if (!onWatchPage()) return null;
    if (e.shiftKey) return SHIFT_KEYS[k] ? action(SHIFT_KEYS[k]) : null;
    return KEYS[k] ? action(KEYS[k]) : null;
  }

  function missing() {
    const expected = onShortsPage() ? EXPECTED.shorts : onWatchPage() ? EXPECTED.watch : [];
    return expected.filter(([sel]) => !document.querySelector(sel)).map(([, name]) => action(name).label);
  }

  (QH.sites = QH.sites || []).push({
    id: 'youtube',
    matches: (loc) => loc.hostname === 'www.youtube.com',
    mouseEvent: 'click',
    fromMouse,
    fromKey,
    missing,
  });
})();
