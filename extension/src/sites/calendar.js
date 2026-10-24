// Google Calendar: the header's Today / previous / next buttons keep fixed internal
// names (jsname) in every UI language; the view menu prints each view's key next to
// its name ("일 D", "Week W"). Calendar's one-key shortcuts are on by default.
(function () {
  'use strict';
  const QH = (globalThis.QH = globalThis.QH || {});
  const K = QH.keys;
  const key = (k) => K.combo(k);

  const ACTIONS = {
    today: { name: ['오늘로 이동', 'Go to today'], combos: [key('t')] },
    next: { name: ['다음 기간으로 이동', 'Next period'], combos: [key('j'), key('n')] },
    prev: { name: ['이전 기간으로 이동', 'Previous period'], combos: [key('k'), key('p')] },
    create: { name: ['일정 만들기', 'Create event'], combos: [key('c')] },
    day: { name: ['일 보기', 'Day view'], combos: [key('d'), key('1')] },
    week: { name: ['주 보기', 'Week view'], combos: [key('w'), key('2')] },
    month: { name: ['월 보기', 'Month view'], combos: [key('m'), key('3')] },
    year: { name: ['연도 보기', 'Year view'], combos: [key('y')] },
    schedule: { name: ['일정 목록 보기', 'Schedule view'], combos: [key('a'), key('5')] },
    custom: { name: ['맞춤 보기 (4일 등)', 'Custom view'], combos: [key('x'), key('4')] },
    search: { name: ['일정 검색', 'Search'], combos: [key('/')] },
    edit: { name: ['일정 세부정보 열기', 'Open event details'], combos: [key('e')] },
    remove: { name: ['일정 삭제', 'Delete event'], combos: [key('delete'), key('backspace')] },
    undo: { name: ['실행취소', 'Undo'], combos: [key('z')] },
    save: { name: ['일정 저장', 'Save event'], combos: [K.combo('s', { mod: true })] },
    settings: { name: ['설정 열기', 'Open settings'], combos: [key('s')] },
  };

  const BY_KEY = {
    t: 'today', j: 'next', n: 'next', k: 'prev', p: 'prev', c: 'create',
    d: 'day', w: 'week', m: 'month', y: 'year', a: 'schedule', x: 'custom', '/': 'search',
    1: 'day', 2: 'week', 3: 'month', 4: 'custom', 5: 'schedule',
    e: 'edit', delete: 'remove', backspace: 'remove', z: 'undo', s: 'settings',
  };

  // Buttons and menu items matched by name (Korean and English UI).
  const LABELS = {
    '일정 수정': 'edit', 'Edit event': 'edit',
    '일정 삭제': 'remove', 'Delete event': 'remove',
    실행취소: 'undo', Undo: 'undo',
    저장: 'save', Save: 'save',
  };
  const MENU_LABELS = { 설정: 'settings', Settings: 'settings' };
  const VIEWS = new Set(['day', 'week', 'month', 'year', 'schedule', 'custom']);
  const BY_JSNAME = { P6mm8: 'today', VfNHU: 'prev', OCpkoe: 'next' }; // header buttons only
  const VIEW_LABELS = {
    일: 'day', Day: 'day', 주: 'week', Week: 'week', 월: 'month', Month: 'month', 연도: 'year', Year: 'year',
    일정: 'schedule', Schedule: 'schedule', '4일': 'custom', '4 days': 'custom',
  };

  function action(name) {
    const a = ACTIONS[name];
    return { id: 'calendar:' + name, label: QH.names.pick(a.name), combos: a.combos };
  }

  function fromMouse(e) {
    if (!(e.target instanceof Element)) return null;
    const btn = e.target.closest('button, [role="button"], [role="menuitem"], [role="radio"], [role="link"]');
    if (!btn) return null;
    // The mini calendar's month arrows share the header's jsnames; only the header counts.
    const inHeader = !!btn.closest('[role="banner"], header');
    const jsname = btn.getAttribute('jsname');
    if (inHeader && BY_JSNAME[jsname]) return action(BY_JSNAME[jsname]);
    if (jsname === 'todz4c') return action('create'); // the main "Create" button
    const aria = (btn.getAttribute('aria-label') || '').trim();
    if (inHeader && /^(검색|Search)$/.test(aria)) return action('search');
    const role = btn.getAttribute('role');
    if (role === 'radio' && VIEW_LABELS[aria]) return action(VIEW_LABELS[aria]);
    const text = (btn.textContent || '').trim();
    if (role === 'menuitem') {
      const letter = [...btn.querySelectorAll('*')].find((x) => !x.childElementCount && /^[A-Z]$/.test(x.textContent.trim()));
      const name = letter && BY_KEY[letter.textContent.trim().toLowerCase()];
      if (name && VIEWS.has(name)) return action(name);
      if (MENU_LABELS[text]) return action(MENU_LABELS[text]);
    }
    const name = LABELS[aria] || LABELS[btn.getAttribute('data-tooltip') || ''] || (text.length <= 10 ? LABELS[text] : null);
    return name ? action(name) : null;
  }

  function fromKey(e, mac) {
    if (K.isTextEntry(e, mac)) return null;
    const c = K.fromEvent(e, mac);
    if (K.toId(c) === 'mod+s') return action('save'); // works while editing an event
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || K.isTyping(e)) return null;
    const name = BY_KEY[c.key];
    return name ? action(name) : null;
  }

  (QH.sites = QH.sites || []).push({
    id: 'calendar',
    matches: (loc) => loc.hostname === 'calendar.google.com',
    mouseEvent: 'click',
    fromMouse,
    fromKey,
  });
})();
