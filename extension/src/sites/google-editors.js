// Google Docs, Sheets and Slides: every toolbar button and menu item that shows its
// own shortcut (tooltip "Bold (Ctrl+B)", menu accelerator text, aria-keyshortcuts).
// The three editors share this UI, so one module serves all of them. Reading the
// shortcut from the page keeps the list in step with each app and its UI language.
// Buttons and menu items that show no shortcut are matched by name (`rules`, keys
// from each app's help page).
(function () {
  'use strict';
  const QH = (globalThis.QH = globalThis.QH || {});
  const K = QH.keys;

  const CONTROL = [
    '.goog-menuitem', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
    '[role="button"]', '.goog-toolbar-button', '.goog-toolbar-menu-button', '[data-tooltip]:not([role="toolbar"])',
  ].join(', ');

  // Names for shortcuts pressed before the matching button was ever clicked (then
  // the page gives us no name): the shared editing names plus these, then each app's.
  const COMMON_NAMES = Object.assign({}, QH.names.EDITING, {
    'alt+shift+5': ['취소선', 'Strikethrough'],
    'mod+shift+x': ['취소선', 'Strikethrough'],
    'mod+h': ['찾기 및 바꾸기', 'Find and replace'],
    'mod+shift+h': ['찾기 및 바꾸기', 'Find and replace'],
    'mod+alt+m': ['댓글 삽입', 'Insert comment'],
    'mod+shift+l': ['왼쪽 정렬', 'Left align'],
    'mod+shift+e': ['가운데 정렬', 'Center align'],
    'mod+shift+r': ['오른쪽 정렬', 'Right align'],
    'mod+shift+f': ['메뉴 숨기기', 'Hide the menus'],
    'mod+alt+shift+h': ['버전 기록 열기', 'Open version history'],
    'mod+alt+shift+a': ['댓글 기록 열기', 'Open comment history'],
    'mod+alt+shift+i': ['탐색 열기', 'Open explore'],
  });

  // Shared by all three editors: [name pattern (ko|en), shortcut].
  const COMMON_RULES = [
    [/버전 기록|version history/i, 'Ctrl+Alt+Shift+H'],
    [/댓글 기록|모든 댓글|comment history|all comments/i, 'Ctrl+Alt+Shift+A'],
  ];

  const APPS = [
    {
      id: 'docs',
      path: '/document/',
      names: {
        'mod+shift+v': ['서식 없이 붙여넣기', 'Paste without formatting'],
        'mod+shift+7': ['번호 매기기 목록', 'Numbered list'],
        'mod+shift+8': ['글머리기호 목록', 'Bulleted list'],
        'mod+shift+c': ['단어 수', 'Word count'],
        'mod+alt+0': ['일반 텍스트', 'Normal text'],
        'mod+alt+1': ['제목 1', 'Heading 1'],
        'mod+alt+2': ['제목 2', 'Heading 2'],
        'mod+alt+3': ['제목 3', 'Heading 3'],
        'mod+alt+4': ['제목 4', 'Heading 4'],
        'mod+alt+5': ['제목 5', 'Heading 5'],
        'mod+alt+6': ['제목 6', 'Heading 6'],
        'mod+shift+j': ['양쪽 정렬', 'Justify'],
        'mod+shift+.': ['글꼴 크기 늘리기', 'Increase font size'],
        'mod+shift+,': ['글꼴 크기 줄이기', 'Decrease font size'],
        'mod+enter': ['페이지 나누기', 'Page break'],
        'mod+alt+f': ['각주 삽입', 'Insert footnote'],
        'mod+alt+x': ['맞춤법 및 문법 검사', 'Spelling and grammar'],
        'f7': ['맞춤법 및 문법 검사', 'Spelling and grammar'],
        'mod+shift+y': ['사전', 'Dictionary'],
      },
      rules: [],
    },
    {
      id: 'sheets',
      path: '/spreadsheets/',
      names: {
        'mod+shift+v': ['값만 붙여넣기', 'Paste values only'],
        'mod+d': ['아래로 채우기', 'Fill down'],
        'mod+r': ['오른쪽으로 채우기', 'Fill right'],
        'mod+;': ['오늘 날짜 넣기', 'Insert date'],
        'mod+shift+;': ['현재 시간 넣기', 'Insert time'],
        'mod+shift+1': ['숫자 서식', 'Number format'],
        'mod+shift+4': ['통화 서식', 'Currency format'],
        'mod+shift+5': ['퍼센트 서식', 'Percent format'],
        'mod+alt+=': ['행·열 삽입 (행·열을 먼저 선택)', 'Insert rows/columns (select them first)'],
        'mod+alt+-': ['행·열 삭제 (행·열을 먼저 선택)', 'Delete rows/columns (select them first)'],
        'mod+alt+9': ['행 숨기기', 'Hide rows'],
        'mod+alt+0': ['열 숨기기', 'Hide columns'],
        'mod+shift+9': ['행 숨기기 해제', 'Unhide rows'],
        'mod+shift+0': ['열 숨기기 해제', 'Unhide columns'],
        'alt+arrowdown': ['다른 시트로 이동', 'Switch sheet'],
        'shift+f11': ['새 시트 추가', 'Insert new sheet'],
        'alt+shift+k': ['모든 시트 목록', 'List all sheets'],
        'alt+1': ['시트 이름 바꾸기', 'Rename sheet'],
        'shift+f2': ['메모 삽입', 'Insert note'],
        'alt+shift+1': ['위쪽 테두리', 'Top border'],
        'alt+shift+2': ['오른쪽 테두리', 'Right border'],
        'alt+shift+3': ['아래쪽 테두리', 'Bottom border'],
        'alt+shift+4': ['왼쪽 테두리', 'Left border'],
        'alt+shift+6': ['테두리 지우기', 'Clear borders'],
        'alt+shift+7': ['바깥쪽 테두리', 'Outer border'],
      },
      // Previous sheet counts as the same action as next sheet.
      keyAlias: { 'alt+arrowup': 'alt+arrowdown' },
      rules: [
        [/(행|열)( \d+개)? 삽입$|^Insert (\d+ )?(rows?|columns?)\b/i, 'Ctrl+Alt+='],
        [/^(행|열)( \S+)? 삭제$|^Delete (rows?|columns?)\b/i, 'Ctrl+Alt+-'],
        [/^행( \S+)? 숨기기$|^Hide rows?\b/i, 'Ctrl+Alt+9'],
        [/^열( \S+)? 숨기기$|^Hide columns?\b/i, 'Ctrl+Alt+0'],
        [/^시트 추가$|^Add sheet$/i, 'Shift+F11'],
        [/^모든 시트$|^All sheets$/i, 'Alt+Shift+K'],
        [/^이름 바꾸기$|^Rename$/i, 'Alt+1'],
        [/^메모 (삽입|추가)$|^Insert note$/i, 'Shift+F2'],
        [/^위쪽 테두리$|^Top border$/i, 'Alt+Shift+1'],
        [/^오른쪽 테두리$|^Right border$/i, 'Alt+Shift+2'],
        [/^아래쪽 테두리$|^Bottom border$/i, 'Alt+Shift+3'],
        [/^왼쪽 테두리$|^Left border$/i, 'Alt+Shift+4'],
        [/^테두리 (지우기|없음)$|^Clear borders$/i, 'Alt+Shift+6'],
        [/^(바깥쪽|외부) 테두리$|^Outer borders?$/i, 'Alt+Shift+7'],
        [/^통화 형식/i, 'Ctrl+Shift+4'],
        [/^Format as currency/i, 'Ctrl+Shift+4'],
        [/^(퍼센트|백분율) 형식/i, 'Ctrl+Shift+5'],
        [/^Format as percent/i, 'Ctrl+Shift+5'],
      ],
    },
    {
      id: 'slides',
      path: '/presentation/',
      names: {
        'mod+m': ['새 슬라이드', 'New slide'],
        'mod+f5': ['슬라이드쇼 시작', 'Start slideshow'],
        'mod+d': ['슬라이드 복사', 'Duplicate slide'],
        'mod+alt+g': ['그룹화', 'Group'],
        'mod+alt+shift+g': ['그룹 해제', 'Ungroup'],
        'mod+shift+7': ['번호 매기기 목록', 'Numbered list'],
        'mod+shift+8': ['글머리기호 목록', 'Bulleted list'],
        'mod+shift+.': ['글꼴 크기 늘리기', 'Increase font size'],
        'mod+shift+,': ['글꼴 크기 줄이기', 'Decrease font size'],
        'mod+alt+shift+s': ['발표자 노트 열기', 'Open speaker notes'],
        'mod+alt+shift+b': ['애니메이션 열기', 'Open animations'],
        'mod+,': ['아래첨자', 'Subscript'],
        'mod+.': ['윗첨자', 'Superscript'],
      },
      rules: [
        // The Slide menu shows no key for this one ("슬라이드 복사" in Korean today).
        [/^슬라이드 (복사|복제)$|^Duplicate slide$/i, 'Ctrl+D'],
        [/발표자 노트|speaker notes/i, 'Ctrl+Alt+Shift+S'],
        [/^애니메이션|^Animation|^Motion$|^모션$/i, 'Ctrl+Alt+Shift+B'],
      ],
    },
  ];

  function textOf(el) {
    return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function found(app, combo, label) {
    const id = K.toId(combo);
    return { id: app.id + ':' + id, label: QH.names.pick(app.names[id] || COMMON_NAMES[id]) || label, combos: [combo] };
  }

  function describe(app, control, mac) {
    if (control.getAttribute('aria-disabled') === 'true' || control.classList.contains('goog-menuitem-disabled')) return null;
    let label;
    let shortcut;
    const accel = control.querySelector('.goog-menuitem-accel');
    if (accel) {
      shortcut = textOf(accel);
      label = K.splitLabel(textOf(control.querySelector('.goog-menuitem-label')) || textOf(control).replace(shortcut, '')).label;
    } else {
      const tip = K.splitLabel(control.getAttribute('data-tooltip') || control.getAttribute('aria-label'));
      shortcut = control.getAttribute('aria-keyshortcuts') || tip.shortcut;
      label = tip.label;
    }
    const combo = K.parse(shortcut, mac);
    if (combo && K.hasModifier(combo) && label) {
      return { id: app.id + ':' + K.toId(combo), label, combos: [combo] };
    }
    return fromRules(app, control, mac);
  }

  // Buttons and menu items with no shortcut on screen, matched by their name.
  function fromRules(app, control, mac) {
    if (control.getAttribute('aria-haspopup') === 'true') return null; // only opens a submenu
    const text = K.splitLabel(
      textOf(control.querySelector('.goog-menuitem-label')) ||
        control.getAttribute('aria-label') ||
        control.getAttribute('data-tooltip') ||
        textOf(control)
    ).label;
    if (!text || text.length > 40) return null;
    const rule = app.rules.concat(COMMON_RULES).find(([re]) => re.test(text));
    return rule ? found(app, K.parse(rule[1], mac), text) : null;
  }

  // Sheets: clicking a sheet tab at the bottom switches sheets (Alt+↓ / Alt+↑).
  // Sheets switches on mousedown, so by mouseup the clicked tab is already the
  // active one; remember on mousedown whether it was another sheet.
  let pressedTab = null;
  let pressedTabWasActive = false;
  if (location.hostname === 'docs.google.com' && location.pathname.startsWith('/spreadsheets/')) {
    window.addEventListener(
      'mousedown',
      (e) => {
        pressedTab = e.target instanceof Element ? e.target.closest('.docs-sheet-tab') : null;
        pressedTabWasActive = !!pressedTab && pressedTab.classList.contains('docs-sheet-active-tab');
      },
      true
    );
  }

  function sheetTab(app, el, mac) {
    if (app.id !== 'sheets') return null;
    const tab = el.closest('.docs-sheet-tab');
    if (!tab || tab !== pressedTab || pressedTabWasActive) return null;
    const down = K.combo('arrowdown', { alt: true });
    const result = found(app, down);
    result.combos = [down, K.combo('arrowup', { alt: true })];
    return result;
  }

  function fromMouse(app, e, mac) {
    if (!(e.target instanceof Element)) return null;
    const tab = sheetTab(app, e.target, mac);
    if (tab) return tab;
    let el = e.target.closest(CONTROL);
    // The element with the tooltip is sometimes a wrapper of the one clicked.
    for (let depth = 0; el && depth < 4; depth++) {
      const result = describe(app, el, mac);
      if (result) return result;
      el = el.parentElement ? el.parentElement.closest(CONTROL) : null;
    }
    return null;
  }

  function fromKey(app, e, mac) {
    if (K.isModifierOnly(e)) return null;
    const combo = K.fromEvent(e, mac);
    const fnKey = /^f\d+$/.test(combo.key);
    if (!(K.hasModifier(combo) || fnKey) || (combo.ctrl && combo.alt)) return null; // Ctrl+Alt is AltGr on some layouts
    let id = K.toId(combo);
    if (app.keyAlias && app.keyAlias[id]) id = app.keyAlias[id];
    const name = QH.names.pick(app.names[id] || COMMON_NAMES[id]);
    if (fnKey && !name) return null; // only function keys that are app shortcuts
    return { id: app.id + ':' + id, label: name, fallbackLabel: true, combos: [combo] };
  }

  // Typing happens inside a same-origin iframe (docs-texteventtarget-iframe today),
  // whose key events never reach the top window. Attach the key listener to every
  // same-origin iframe so a renamed one is still covered.
  function extraKeyTargets(attach) {
    const seen = new WeakSet();
    const scan = () => {
      for (const frame of document.querySelectorAll('iframe')) {
        try {
          const doc = frame.contentDocument;
          if (doc && !seen.has(doc)) {
            seen.add(doc);
            attach(doc);
          }
        } catch (err) {
          // Not same-origin; nothing to attach to.
        }
      }
    };
    scan();
    setInterval(scan, 2000);
  }

  for (const app of APPS) {
    (QH.sites = QH.sites || []).push({
      id: app.id,
      matches: (loc) => loc.hostname === 'docs.google.com' && loc.pathname.startsWith(app.path),
      mouseEvent: 'mouseup', // menus and toolbar buttons act on mouseup
      fromMouse: (e, mac) => fromMouse(app, e, mac),
      fromKey: (e, mac) => fromKey(app, e, mac),
      extraKeyTargets,
    });
  }
})();
