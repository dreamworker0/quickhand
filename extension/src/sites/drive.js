// Google Drive: buttons print their shortcut in the tooltip ("공유(Ctrl+Alt+A)",
// "목록 레이아웃(Alt+V 다음 L)") and menu items next to their name ("새 폴더  Alt+C 다음 F",
// right-click "이름 바꾸기  Ctrl+Alt+E", "휴지통으로 이동  Delete"), so most shortcuts
// are read straight from the page. Drive's help page fills in the few the UI omits.
(function () {
  'use strict';
  const QH = (globalThis.QH = globalThis.QH || {});
  const K = QH.keys;
  const detected = new Map();

  // Names for keyboard-first use, keyed by keys.toId (Windows form; Mac's Control
  // prefixes are mapped onto these by nameFor).
  const NAMES = {
    'alt+c>f': ['새 폴더', 'New folder'],
    'alt+c>u': ['파일 업로드', 'File upload'],
    'alt+c>i': ['폴더 업로드', 'Folder upload'],
    'alt+c>t': ['새 Google 문서', 'New Google Doc'],
    'alt+c>s': ['새 Google 시트', 'New Google Sheet'],
    'alt+c>p': ['새 Google 프레젠테이션', 'New Google Slides'],
    'alt+c>o': ['새 Google 설문지', 'New Google Form'],
    'alt+c>d': ['새 Google 그림', 'New Google Drawing'],
    'alt+v>l': ['목록/그리드 레이아웃 바꾸기', 'Switch list/grid layout'],
    'alt+v>d': ['세부정보 보기', 'View details'],
    'alt+v>a': ['활동 보기', 'View activity'],
    'alt+v>e': ['승인 보기', 'View approvals'],
    'mod+alt+a': ['공유', 'Share'],
    'mod+alt+m': ['이동', 'Move'],
    'mod+alt+e': ['이름 바꾸기', 'Rename'],
    'f2': ['이름 바꾸기', 'Rename'],
    'mod+alt+r': ['바로가기 추가', 'Add shortcut'],
    'mod+alt+s': ['중요 문서함에 추가', 'Add to Starred'],
    'mod+alt+l': ['링크 복사', 'Copy link'],
    'mod+alt+p': ['미리보기', 'Preview'],
    'mod+c>mod+v': ['사본 만들기', 'Make a copy'],
    'delete': ['휴지통으로 이동', 'Move to trash'],
    'mod+enter': ['새 탭에서 열기', 'Open in new tab'],
    'alt+r': ['정렬 메뉴 열기', 'Open sort menu'],
    '/': ['검색', 'Search'],
    // Moving around ("Alt+G then …"), checked on the help page and in Drive itself.
    'alt+g>n': ['탐색 패널로 이동', 'Go to navigation'],
    'alt+g>f': ['탐색 패널(폴더 목록)로 이동', 'Go to the navigation panel'],
    'alt+g>i': ['항목 보기로 이동', 'Go to the items view'],
    'alt+g>c': ['페이지 콘텐츠로 이동', 'Go to the page content'],
    'alt+g>d': ['세부정보 창으로 이동', 'Go to the details pane'],
    'alt+g>t': ['앱 상단(Google 바)으로 이동', 'Go to the top of the app'],
    'alt+g>a': ['다운로드 상태로 이동', 'Go to the download status'],
    'alt+g>u': ['업로드 상태로 이동', 'Go to the upload status'],
    'alt+g>k': ['마지막 메시지 표시', 'Show the last message'],
    'alt+t>q': ['다음 화면 밀도', 'Next visual density'],
    'shift+space': ['항목 선택/선택 해제', 'Select or deselect the item'],
    'mod+shift+c': ['항목 제목 복사', 'Copy item titles'],
    'mod+shift+v': ['바로가기로 붙여넣기', 'Paste as a shortcut'],
    'alt+n': ['새로 만들기 메뉴', 'New menu'],
    'shift+f10': ['추가 작업 메뉴', 'More actions menu'],
    'alt+a': ['추가 작업 메뉴', 'More actions menu'],
    'alt+shift+a': ['현재 폴더 작업 메뉴', 'Current folder actions menu'],
    'mod+shift+s': ['설정 메뉴', 'Settings menu'],
  };

  // Menu items that don't print their shortcut (keys from Drive's help page).
  // Mac uses Control+C where Windows uses Alt+C. Docs, Sheets, Slides and Forms are
  // left out: the "신규" menu prints the key on their "빈 문서"-style items, and the
  // same names in right-click "연결 앱" open a file with that app instead of making one.
  function menuKeys(label, mac) {
    const create = mac ? 'Control+C 다음 ' : 'Alt+C 다음 ';
    const keys = {
      'Google Drawings': create + 'D', 'Google 그림': create + 'D', 'Google 드로잉': create + 'D',
      'Copy link': 'Ctrl+Alt+L', '링크 복사': 'Ctrl+Alt+L',
    };
    return keys[label] ? K.parse(mac ? keys[label].replace(/Ctrl/g, 'Command') : keys[label], mac) : null;
  }

  function nameFor(id) {
    // A Mac holds Control where Windows holds Alt (Ctrl+Alt+R: ⌘+Control+R).
    return QH.names.pick(NAMES[id] || NAMES[id.replace(/(^|\+)ctrl\+/, '$1alt+')] || QH.names.EDITING[id]);
  }

  // Menus also list keys without a modifier, such as F2 and Delete.
  function isShortcut(c) {
    return !!c && (K.hasModifier(c) || !!c.then || /^f\d+$/.test(c.key) || c.key === 'delete');
  }

  const CONTROL = '[role="menuitem"], [role="button"], [role="radio"], button, [data-tooltip]';

  function found(combo, label) {
    const id = K.toId(combo);
    return { id: 'drive:' + id, label: label || nameFor(id), combos: [combo] };
  }

  function describe(el, mac) {
    if (el.getAttribute('aria-disabled') === 'true') return null;
    if (el.getAttribute('role') === 'menuitem') {
      const leaves = [...el.querySelectorAll('*')]
        .filter((x) => !x.childElementCount && x.textContent.trim())
        .map((x) => x.textContent.trim());
      const label = leaves[0] || '';
      const printed = leaves.length > 1 ? K.parse(leaves[leaves.length - 1], mac) : null;
      if (isShortcut(printed)) return found(printed, label);
      const known = menuKeys(label, mac);
      return known ? found(known, label) : null;
    }
    const tip = K.splitLabel(el.getAttribute('data-tooltip') || el.getAttribute('aria-label'));
    const combo = K.parse(tip.shortcut, mac);
    return combo && K.hasModifier(combo) && tip.label ? found(combo, tip.label) : null;
  }

  function fromMouse(e, mac) {
    if (!(e.target instanceof Element)) return null;
    const el = e.target;
    const input = el.closest('input');
    if (input && input.closest('form') && /검색|search/i.test(input.getAttribute('aria-label') || input.placeholder || '')) {
      return found(K.combo('/'));
    }
    let control = el.closest(CONTROL);
    for (let depth = 0; control && depth < 4; depth++) {
      const result = describe(control, mac);
      if (result) {
        detected.set(result.id, result.label);
        return result;
      }
      control = control.parentElement ? control.parentElement.closest(CONTROL) : null;
    }
    return null;
  }

  // "Alt+C then F" style sequences (Control+C on Mac for the create menu): C creates,
  // V shows panes, G moves the focus, T changes the density.
  const nextKey = K.sequencer((c) => !c.mod && !c.shift && (c.alt || c.ctrl) && ['c', 'v', 'g', 't'].includes(c.key));
  // "Make a copy" is Ctrl+C then Ctrl+V; copy stays a copy on its own.
  let lastCopyAt = 0;

  // Measured in a real Drive (checks/drive-prereq.mjs): these act on the selected items and
  // do nothing with none selected; rename and the item menu also take the focused one
  // (still focused after Esc clears the selection).
  const ON_SELECTED = new Set(['mod+enter', 'mod+alt+a', 'mod+alt+m', 'mod+alt+s', 'mod+alt+r', 'mod+alt+l', 'mod+alt+p', 'delete', 'mod+x', 'mod+c', 'mod+shift+c', 'alt+a']);
  const ON_FOCUSED = new Set(['f2', 'mod+alt+e', 'shift+f10']);
  const ITEM = '[role="row"][data-id], [role="gridcell"][data-id]';
  const anySelected = () => [...document.querySelectorAll('[role="row"][data-id][aria-selected="true"], [role="gridcell"][data-id][aria-selected="true"]')]
    .some((el) => el.getClientRects().length > 0);
  function works(id, e) {
    if (ON_SELECTED.has(id)) return anySelected();
    if (ON_FOCUSED.has(id)) return anySelected() || (e.target instanceof Element && !!e.target.closest(ITEM));
    return true;
  }

  function fromKey(e, mac) {
    if (K.isModifierOnly(e)) return null;
    if (K.isTextEntry(e, mac)) { nextKey.reset(); lastCopyAt = 0; return null; }
    let c = K.fromEvent(e, mac);
    const typing = K.isTyping(e);
    if (typing) { nextKey.reset(); lastCopyAt = 0; }
    if (!K.hasModifier(c) && typing) return null;
    const now = Date.now();
    const id0 = K.toId(c);
    if (id0 === 'mod+c' && !typing) lastCopyAt = now;
    if (id0 === 'mod+v' && !typing && lastCopyAt && now - lastCopyAt < 3000) {
      lastCopyAt = 0;
      c = K.sequence(K.combo('c', { mod: true }), c);
    } else {
      c = typing ? c : nextKey(c, now);
      if (!c) return null;
      if (c.then) c.then.alt = c.then.ctrl = false; // the modifier may still be held for the second key
    }
    const id = K.toId(c);
    if (!typing && !works(id, e)) return null;
    const seen = detected.get('drive:' + id);
    const name = seen || nameFor(id);
    if (name) return { id: 'drive:' + id, label: name, fallbackLabel: !seen, combos: [c] };
    return null;
  }

  (QH.sites = QH.sites || []).push({
    id: 'drive',
    matches: (loc) => loc.hostname === 'drive.google.com',
    mouseEvent: 'mouseup', // Drive menus act on mouseup
    fromMouse,
    fromKey,
    // Files, folders and the folder path hold the person's own names.
    contentAreas: '[role="main"] [role="grid"], [role="main"] [role="heading"], [role="navigation"], [data-id]',
  });
})();
