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
    seek5: { msg: 'ytSeek5', combos: [key('arrowleft'), key('arrowright')] }, // ←/→ move 5 seconds, J/L 10
    speed: { msg: 'ytSpeed', combos: [key('.', true), key(',', true)] },
    search: { msg: 'ytSearch', combos: [key('/')] },
    shortsnext: { msg: 'ytShortsNext', combos: [key('arrowdown')] },
    shortsprev: { msg: 'ytShortsPrev', combos: [key('arrowup')] },
    // Chapters are Ctrl+←/→ on Windows and Option+←/→ on Mac (see action()).
    chapter: { msg: 'ytChapter', combos: null },
    frame: { msg: 'ytFrame', combos: [key('.'), key(',')] },
    startend: { msg: 'ytStartEnd', combos: [key('home'), key('end')] },
    volume: { msg: 'ytVolume', combos: [key('arrowup'), key('arrowdown')] },
    jump: { msg: 'ytJump', combos: [key('0~9')] }, // shown as one "0~9" key
  };

  function chapterCombos() {
    const mods = QH.keys.isMac() ? { alt: true } : { mod: true };
    return [QH.keys.combo('arrowright', mods), QH.keys.combo('arrowleft', mods)];
  }

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
    t: 'theater', i: 'miniplayer', j: 'seek', l: 'seek', arrowleft: 'seek5', arrowright: 'seek5',
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
    return { id: 'yt:' + name, label: t(a.msg), combos: a.combos || chapterCombos() };
  }

  function onWatchPage() {
    return location.pathname === '/watch';
  }

  function onShortsPage() {
    return location.pathname.startsWith('/shorts/');
  }

  // Measured on real videos (checks/youtube-prereq.mjs): these keys do nothing unless the
  // video allows them, so they count only then.
  const first = (sel) => document.querySelectorAll(sel)[0] || null;
  const paused = () => { const v = first('#movie_player video'); return !v || v.paused; }; // frame steps
  const hasChapters = () => document.querySelectorAll('.ytp-chapters-container .ytp-chapter-hover-container').length > 1;
  // Without captions the button stays, named "자막 사용 불가" / "… unavailable".
  function hasCaptions() {
    const b = first('.ytp-subtitles-button');
    return !!b && !/사용 불가|unavailable/i.test(b.getAttribute('data-title-no-tooltip') || b.getAttribute('data-tooltip-title') || '');
  }
  const inPlaylist = () => /[?&]list=/.test(location.search || ''); // Shift+P goes back only in a playlist
  function works(name) {
    if (name === 'captions') return hasCaptions();
    if (name === 'chapter') return hasChapters();
    if (name === 'frame') return paused();
    if (name === 'prev') return inPlaylist();
    return true;
  }
  const act = (name) => (works(name) ? action(name) : null);

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
    if (!onWatchPage()) return null;
    // A chapter in the description's chapter list jumps to it (Ctrl+←/→ step through them).
    if (el.closest('ytd-macro-markers-list-item-renderer')) return action('chapter');
    if (!el.closest('#movie_player, .html5-video-player')) return null;
    if (el.closest(SPEED_CONTROLS)) return action('speed');
    if (el.closest('.ytp-volume-panel')) return action('volume'); // the slider beside the speaker
    const button = el.closest('button, .ytp-button');
    if (button) {
      const aria = (button.getAttribute('aria-keyshortcuts') || '').toLowerCase();
      if (ARIA_KEYS[aria]) return act(ARIA_KEYS[aria]);
      for (const [cls, name] of BUTTONS) if (button.closest('.' + cls)) return act(name);
      return null;
    }
    // Moving along the timeline is what J/L do in 10-second steps.
    if (el.closest('.ytp-progress-bar-container, .ytp-progress-bar')) return action('seek');
    if (el.matches('video') || el.closest('.html5-video-container, .ytp-cued-thumbnail-overlay')) return action('playpause');
    return null;
  }

  const SHIFT_KEYS = { n: 'next', p: 'prev', '.': 'speed', ',': 'speed' };

  // Keys that act on the player only while it has focus; elsewhere they scroll
  // the page. On the seek bar ↑/↓ leave the volume alone (measured on the page).
  const PLAYER_KEYS = { home: 'startend', end: 'startend', arrowup: 'volume', arrowdown: 'volume' };

  function inPlayer(e, k) {
    const el = e.composedPath ? e.composedPath()[0] : e.target;
    if (!el || !el.closest || !el.closest('#movie_player')) return false;
    return !(k.startsWith('arrow') && el.closest('.ytp-progress-bar'));
  }

  function fromKey(e, mac) {
    if (QH.keys.isTextEntry(e, mac) || QH.keys.isTyping(e)) return null;
    const k = QH.keys.fromEvent(e, mac).key;
    // Chapters: Ctrl+←/→, on Mac Option+←/→.
    const chapterMod = mac ? e.altKey && !e.ctrlKey && !e.metaKey : e.ctrlKey && !e.altKey && !e.metaKey;
    if (onWatchPage() && chapterMod && !e.shiftKey && (k === 'arrowleft' || k === 'arrowright')) return act('chapter');
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    if (k === '/' && !e.shiftKey) return action('search');
    if (onShortsPage()) return !e.shiftKey && SHORTS_KEYS[k] ? action(SHORTS_KEYS[k]) : null;
    if (!onWatchPage()) return null;
    if (e.shiftKey) return SHIFT_KEYS[k] ? act(SHIFT_KEYS[k]) : null;
    if (PLAYER_KEYS[k]) return inPlayer(e, k) ? action(PLAYER_KEYS[k]) : null;
    if (k === '.' || k === ',') return act('frame');
    if (/^[0-9]$/.test(k)) return action('jump');
    return KEYS[k] ? act(KEYS[k]) : null;
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
