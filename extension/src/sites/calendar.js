// Google Calendar: the header's Today / previous / next buttons keep fixed internal
// names (jsname) in every UI language; the view menu prints each view's key next to
// its name ("일 D", "Week W"). The keys work only with 설정 › 키보드 단축키 사용 on.
// "r" (refresh, on the help page) is left out: Calendar no longer reacts to it.
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
    year: { name: ['연도 보기', 'Year view'], combos: [key('y'), key('6')] },
    schedule: { name: ['일정 목록 보기', 'Schedule view'], combos: [key('a'), key('5')] },
    custom: { name: ['맞춤 보기 (4일 등)', 'Custom view'], combos: [key('x'), key('4')] },
    search: { name: ['일정 검색', 'Search'], combos: [key('/')] },
    edit: { name: ['일정 세부정보 열기', 'Open event details'], combos: [key('e')] },
    remove: { name: ['일정 삭제', 'Delete event'], combos: [key('delete'), key('backspace')] },
    undo: { name: ['실행취소', 'Undo'], combos: [key('z'), K.combo('z', { mod: true })] },
    save: { name: ['일정 저장', 'Save event'], combos: [K.combo('s', { mod: true }), K.combo('enter', { mod: true })] },
    settings: { name: ['설정 열기', 'Open settings'], combos: [key('s')] },
    goto: { name: ['특정 날짜로 이동', 'Go to date'], combos: [key('g')] },
    people: { name: ['회의 대상 사용자 검색으로 이동', 'Search for people to meet'], combos: [key('+')] }, // shown as the help page prints it
    help: { name: ['단축키 목록 보기', 'Show keyboard shortcuts'], combos: [key('?'), K.combo('/', { mod: true })] },
    back: { name: ['캘린더로 돌아가기', 'Back to calendar'], combos: [key('escape')] },
    allDay: { name: ['종일 일정 만들기', 'Create all-day event'], combos: [key('q')] },
    quickCreate: { name: ['일정 만들기 대화상자', 'Quick create event'], combos: [K.combo('c', { shift: true })] },
    print: { name: ['인쇄', 'Print'], combos: [K.combo('p', { mod: true })] },
    sidePanel: { name: ['측면 패널로 이동', 'Go to side panel'], combos: [K.combo('.', { mod: true, alt: true }), K.combo(',', { mod: true, alt: true })] },
  };

  const BY_KEY = {
    t: 'today', j: 'next', n: 'next', k: 'prev', p: 'prev', c: 'create',
    d: 'day', w: 'week', m: 'month', y: 'year', a: 'schedule', x: 'custom', '/': 'search',
    1: 'day', 2: 'week', 3: 'month', 4: 'custom', 5: 'schedule', 6: 'year', q: 'allDay',
    e: 'edit', delete: 'remove', backspace: 'remove', z: 'undo', s: 'settings', g: 'goto',
  };
  // Shifted keys, and the number pad's plus, which needs no Shift.
  const SHIFT_KEYS = { '=': 'people', '/': 'help', c: 'quickCreate' };
  // With Ctrl (⌘ on Mac), outside text boxes.
  const MOD_KEYS = { z: 'undo', '/': 'help' };

  // Buttons and menu items matched by name (Korean and English UI).
  const LABELS = {
    '일정 수정': 'edit', 'Edit event': 'edit',
    '일정 삭제': 'remove', 'Delete event': 'remove',
    실행취소: 'undo', Undo: 'undo',
    저장: 'save', Save: 'save',
  };
  // "일정" is the 만들기 menu's quick event dialog (Shift+C); the view menu's "일정 A" has its key.
  const MENU_LABELS = { 설정: 'settings', Settings: 'settings', 인쇄: 'print', Print: 'print', 일정: 'quickCreate', Event: 'quickCreate', '키보드 단축키': 'help', 'Keyboard shortcuts': 'help' };
  const PEOPLE_BOX = /^(사용자 검색|Search for people)$/;
  const SIDE_PANEL = /^(측면 패널|Side panel)$/;
  const DISCARD = /^(일정 변경 취소|Discard changes)$/; // the full event page's X button
  const VIEWS = new Set(['day', 'week', 'month', 'year', 'schedule', 'custom']);
  const BY_JSNAME = { P6mm8: 'today', VfNHU: 'prev', OCpkoe: 'next' }; // header buttons only
  const VIEW_LABELS = {
    일: 'day', Day: 'day', 주: 'week', Week: 'week', 월: 'month', Month: 'month', 연도: 'year', Year: 'year',
    일정: 'schedule', Schedule: 'schedule', '4일': 'custom', '4 days': 'custom',
  };

  // The full event page ("일정 세부정보"), where Esc goes back to the grid.
  const onEventPage = () => /\/eventedit\b/.test(location.pathname);
  // An event's details window (or any other window) over the grid.
  const windowOpen = () => [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getClientRects().length > 0);
  // Checked in a real Calendar (checks/calendar-prereq.mjs): with an event's window open
  // the grid keys do nothing; on the event page moving between periods does nothing.
  const GRID = new Set(['today', 'next', 'prev', 'day', 'week', 'month', 'year', 'schedule', 'custom', 'create', 'allDay']);
  function works(name) {
    if (name === 'edit' || name === 'remove') return windowOpen();
    if (GRID.has(name)) return !windowOpen() && !(onEventPage() && name !== 'create');
    return true;
  }

  function action(name) {
    const a = ACTIONS[name];
    return { id: 'calendar:' + name, label: QH.names.pick(a.name), combos: a.combos };
  }

  function fromMouse(e) {
    if (!(e.target instanceof Element)) return null;
    // The sidebar's people box, which "+" jumps to.
    const box = e.target.closest('input');
    if (box) return PEOPLE_BOX.test(box.getAttribute('aria-label') || '') ? action('people') : null;
    const btn = e.target.closest('button, [role="button"], [role="menuitem"], [role="radio"], [role="link"], [role="tab"]');
    if (!btn) return null;
    const panel = btn.closest('[role="complementary"]');
    if (btn.getAttribute('role') === 'tab') return panel && SIDE_PANEL.test(panel.getAttribute('aria-label') || '') ? action('sidePanel') : null;
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
    // The full event page's close button goes back to the grid, like Esc.
    if (onEventPage() && (/^(닫기|Close)$/.test(aria) || DISCARD.test(aria))) return action('back');
    const name = LABELS[aria] || LABELS[btn.getAttribute('data-tooltip') || ''] || (text.length <= 10 ? LABELS[text] : null);
    return name ? action(name) : null;
  }

  function fromKey(e, mac) {
    if (K.isTextEntry(e, mac)) return null;
    const c = K.fromEvent(e, mac);
    const id = K.toId(c);
    if ((id === 'mod+s' || id === 'mod+enter') && onEventPage()) return action('save'); // only while editing an event
    // Esc leaves the full event page for the grid, even from its title box.
    // Not on the page's own X ("일정 변경 취소") button, which has the focus right after
    // the page opens: Calendar ignores Esc there.
    if (c.key === 'escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && onEventPage()) {
      const on = e.target instanceof Element ? e.target.getAttribute('aria-label') || '' : '';
      return DISCARD.test(on) ? null : action('back');
    }
    if (/^mod\+alt\+[.,]$/.test(id)) return action('sidePanel');
    if (id === 'mod+p') return action('print');
    if (K.isTyping(e)) return null;
    if (/^mod\+[z/]$/.test(id)) return action(MOD_KEYS[c.key]);
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && SHIFT_KEYS[c.key]) return action(SHIFT_KEYS[c.key]);
    if (c.key === '+' && !e.ctrlKey && !e.metaKey && !e.altKey) return action('people');
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
    const name = BY_KEY[c.key];
    return name && works(name) ? action(name) : null;
  }

  (QH.sites = QH.sites || []).push({
    id: 'calendar',
    matches: (loc) => loc.hostname === 'calendar.google.com',
    mouseEvent: 'click',
    fromMouse,
    fromKey,
    // Events and their details hold the person's own words; not kept as unknown buttons.
    contentAreas: '[data-eventid], [role="grid"], [role="dialog"] [role="heading"]',
  });
})();
