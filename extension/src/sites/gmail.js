// Gmail: toolbar buttons are recognised by their stable `act` number, folders by
// their link, the rest by name. Gmail's tooltips rarely show shortcuts, so keys
// come from Gmail's published shortcut list; the compose window's formatting
// buttons do show theirs ("굵게 (Ctrl-B)") and are read from the page.
// Single-key shortcuts only work once "Keyboard shortcuts on" is set in Gmail.
(function () {
  'use strict';
  const QH = (globalThis.QH = globalThis.QH || {});
  const K = QH.keys;
  const detected = new Map();
  const key = (k, mods) => K.combo(k, mods);
  const go = (k) => K.sequence(key('g'), key(k));

  const ACTIONS = {
    compose: { name: ['편지쓰기', 'Compose'], combo: key('c'), labels: ['편지쓰기', 'Compose'] },
    archive: { name: ['보관처리', 'Archive'], combo: key('e'), act: '7' },
    spam: { name: ['스팸신고', 'Report spam'], combo: key('1', { shift: true }), act: '9' },
    remove: { name: ['삭제', 'Delete'], combo: key('3', { shift: true }), act: '10' },
    read: { name: ['읽음으로 표시', 'Mark as read'], combo: key('i', { shift: true }), act: '1' },
    unread: { name: ['읽지 않음으로 표시', 'Mark as unread'], combo: key('u', { shift: true }), act: '2' },
    snooze: { name: ['다시 알림', 'Snooze'], combo: key('b'), act: '290' },
    tasks: { name: ['Tasks에 추가', 'Add to Tasks'], combo: key('t', { shift: true }), act: '95' },
    move: { name: ['이동', 'Move to'], combo: key('v'), labels: ['이동', 'Move to'] },
    label: { name: ['라벨', 'Labels'], combo: key('l'), labels: ['라벨', 'Labels'] },
    newer: { name: ['최근 메일로 이동', 'Newer conversation'], combo: key('k'), labels: ['최근', 'Newer'] },
    older: { name: ['예전 메일로 이동', 'Older conversation'], combo: key('j'), labels: ['예전', 'Older'] },
    reply: { name: ['답장', 'Reply'], combo: key('r'), labels: ['답장', 'Reply'] },
    replyAll: { name: ['전체답장', 'Reply all'], combo: key('a'), labels: ['전체답장', 'Reply all'] },
    forward: { name: ['전달', 'Forward'], combo: key('f'), labels: ['전달', 'Forward'] },
    star: { name: ['별표', 'Star'], combo: key('s') },
    search: { name: ['메일 검색', 'Search mail'], combo: key('/') },
    send: { name: ['보내기', 'Send'], combo: key('enter', { mod: true }), labels: ['보내기', 'Send'] },
    back: { name: ['메일 목록으로 돌아가기', 'Back to the list'], combo: key('u') },
    undo: { name: ['실행취소', 'Undo'], combo: key('z'), labels: ['실행취소', 'Undo'] },
    important: { name: ['중요 표시', 'Mark as important'], combo: key('=') },
    notImportant: { name: ['중요하지 않음으로 표시', 'Mark as not important'], combo: key('-') },
    mute: { name: ['알림 끄기', 'Mute'], combo: key('m'), labels: ['알림 끄기', 'Mute'] },
    more: { name: ['추가 작업 메뉴 열기', 'More actions'], combo: key('.'), labels: ['더보기', 'More'] },
    expandAll: { name: ['모두 펼치기', 'Expand all'], combo: key(';'), labels: ['모두 펼치기', 'Expand all'] },
    select: { name: ['메일 선택', 'Select conversation'], combo: key('x') },
    selectAll: { name: ['모두 선택', 'Select all'], combo: K.sequence(key('8', { shift: true }), key('a')), labels: ['선택', 'Select'] },
    nextPage: { name: ['다음 페이지', 'Next page'], combo: go('n') },
    prevPage: { name: ['이전 페이지', 'Previous page'], combo: go('p') },
    snoozed: { name: ['다시 알림 항목으로 이동', 'Go to Snoozed'], combo: go('b'), folder: 'snoozed' },
    inbox: { name: ['받은편지함으로 이동', 'Go to Inbox'], combo: go('i'), folder: 'inbox' },
    starred: { name: ['별표편지함으로 이동', 'Go to Starred'], combo: go('s'), folder: 'starred' },
    sent: { name: ['보낸편지함으로 이동', 'Go to Sent'], combo: go('t'), folder: 'sent' },
    drafts: { name: ['임시보관함으로 이동', 'Go to Drafts'], combo: go('d'), folder: 'drafts' },
    all: { name: ['전체보관함으로 이동', 'Go to All Mail'], combo: go('a'), folder: 'all' },
    // Keyboard-only shortcuts from Gmail's help page: counted when pressed, no button to hint from.
    goTasks: { name: ['Tasks로 이동', 'Go to Tasks'], combo: go('k') },
    goLabel: { name: ['라벨로 이동', 'Go to label'], combo: go('l') },
    selectNone: { name: ['모든 대화 선택 해제', 'Deselect all'], combo: K.sequence(key('8', { shift: true }), key('n')) },
    selectRead: { name: ['읽은 대화 선택', 'Select read'], combo: K.sequence(key('8', { shift: true }), key('r')) },
    selectUnread: { name: ['읽지 않은 대화 선택', 'Select unread'], combo: K.sequence(key('8', { shift: true }), key('u')) },
    selectStarred: { name: ['별표표시된 대화 선택', 'Select starred'], combo: K.sequence(key('8', { shift: true }), key('s')) },
    selectUnstarred: { name: ['별표 없는 대화 선택', 'Select unstarred'], combo: K.sequence(key('8', { shift: true }), key('t')) },
    open: { name: ['대화 열기', 'Open conversation'], combo: key('o') },
    archiveNewer: { name: ['보관처리 후 최근 대화로', 'Archive and go to newer'], combo: key('[') },
    archiveOlder: { name: ['보관처리 후 예전 대화로', 'Archive and go to older'], combo: key(']') },
    nextMessage: { name: ['대화 안의 다음 메일', 'Next message'], combo: key('n') },
    prevMessage: { name: ['대화 안의 이전 메일', 'Previous message'], combo: key('p') },
    collapseAll: { name: ['모두 접기', 'Collapse all'], combo: key(';', { shift: true }) },
    unreadFrom: { name: ['이 메일부터 읽지 않음으로 표시', 'Mark unread from here'], combo: key('-', { shift: true }) },
    refresh: { name: ['대화 새로고침', 'Update conversation'], combo: key('n', { shift: true }) },
    replyWindow: { name: ['새 창에서 답장', 'Reply in a new window'], combo: key('r', { shift: true }) },
    replyAllWindow: { name: ['새 창에서 전체답장', 'Reply all in a new window'], combo: key('a', { shift: true }) },
    forwardWindow: { name: ['새 창에서 전달', 'Forward in a new window'], combo: key('f', { shift: true }) },
    toolbar: { name: ['툴바로 이동', 'Move to the toolbar'], combo: key(',') },
    nextSection: { name: ['다음 받은편지함 섹션', 'Next inbox section'], combo: key('`') },
    prevSection: { name: ['이전 받은편지함 섹션', 'Previous inbox section'], combo: key('`', { shift: true }) },
    composeTab: { name: ['새 탭에서 편지쓰기', 'Compose in a new tab'], combo: key('d') },
    chatSearch: { name: ['채팅 주소록 검색', 'Search chat contacts'], combo: key('q') },
    help: { name: ['단축키 도움말 열기', 'Open shortcut help'], combo: key('/', { shift: true }) },
    sidebarNext: { name: ['사이드바와 받은편지함 전환', 'Switch between side panel and inbox'], combo: key('.', { mod: true, alt: true }) },
    sidebarPrev: { name: ['사이드바와 받은편지함 전환', 'Switch between side panel and inbox'], combo: key(',', { mod: true, alt: true }) },
  };

  // Compose window keys pressed before their button was ever clicked.
  const COMPOSE_NAMES = Object.assign({}, QH.names.EDITING, {
    'mod+shift+7': ['번호 매기기 목록', 'Numbered list'],
    'mod+shift+8': ['글머리 기호 목록', 'Bulleted list'],
    'mod+shift+9': ['인용구', 'Quote'],
    'mod+shift+c': ['참조 수신자 추가', 'Add Cc recipients'],
    'mod+shift+b': ['숨은참조 수신자 추가', 'Add Bcc recipients'],
    'mod+shift+f': ['보낸사람 선택', 'Choose the From address'],
    'mod+m': ['맞춤법 추천 열기', 'Open spelling suggestions'],
    'mod+.': ['다음 채팅·편지쓰기 창으로', 'Next chat or compose window'],
    'mod+,': ['이전 채팅·편지쓰기 창으로', 'Previous chat or compose window'],
    'mod+shift+5': ['이전 글꼴', 'Previous font'],
    'mod+shift+6': ['다음 글꼴', 'Next font'],
    'mod+shift+-': ['텍스트 크기 줄이기', 'Decrease text size'],
    'mod+shift+=': ['텍스트 크기 늘리기', 'Increase text size'],
    'mod+[': ['들여쓰기 줄이기', 'Indent less'],
    'mod+]': ['들여쓰기 늘리기', 'Indent more'],
    'mod+shift+l': ['왼쪽 정렬', 'Align left'],
    'mod+shift+e': ['가운데 정렬', 'Align center'],
    'mod+shift+r': ['오른쪽 정렬', 'Align right'],
  });

  const byAct = {};
  const byLabel = {};
  const byFolder = {};
  const byCombo = {};
  for (const [name, a] of Object.entries(ACTIONS)) {
    if (a.act) byAct[a.act] = name;
    for (const label of a.labels || []) byLabel[label] = name;
    if (a.folder) byFolder[a.folder] = name;
    byCombo[K.toId(a.combo)] = name;
  }
  byCombo['shift+='] = 'important'; // "+" works like "="

  // Names that need a pattern rather than an exact match, checked in order.
  const LABEL_RULES = [
    [/받은편지함.*돌아가기|목록으로 돌아가기|^Back to/i, 'back'],
    [/중요하지 않|not important/i, 'notImportant'],
    [/중요.*표시|^Mark as important/i, 'important'],
  ];

  // In the list, "다음"/"이전" page through it; in an open mail, "최근"/"예전" (and
  // English "Newer"/"Older") move between conversations.
  function pageOrConversation(label) {
    const inConversation = location.hash.includes('/');
    if (label === '다음' || (label === 'Older' && !inConversation)) return 'nextPage';
    if (label === '이전' || (label === 'Newer' && !inConversation)) return 'prevPage';
    return null;
  }

  const CONTROL = '[act], [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="menuitem"], button, [data-tooltip]';

  function action(name) {
    const a = ACTIONS[name];
    return { id: 'gmail:' + name, label: QH.names.pick(a.name), combos: [a.combo] };
  }

  function describe(el, mac) {
    const act = el.getAttribute('act');
    if (act && byAct[act]) return action(byAct[act]);
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label') || '';
    if (role === 'checkbox') {
      if (/별표|star/i.test(aria)) return action('star');
      return action(el.closest('tr.zA') ? 'select' : 'selectAll'); // a row's box, or the one above the list
    }
    // A row's star is a button named by its state ("별표 없음", "별표표시됨").
    if (role === 'button' && /^별표|^(Not )?starred/i.test(aria) && el.closest('tr.zA')) return action('star');
    // The importance marker is a switch named by its state; clicking flips it.
    if (role === 'switch' && /중요|important/i.test(aria)) return action(/중요하지 않|not important/i.test(aria) ? 'important' : 'notImportant');
    const tip = K.splitLabel(el.getAttribute('data-tooltip') || el.getAttribute('aria-label') || (el.childElementCount ? '' : el.textContent));
    const combo = K.parse(tip.shortcut, mac);
    if (combo && K.hasModifier(combo) && tip.label) return { id: 'gmail:' + K.toId(combo), label: tip.label, combos: [combo] };
    const page = pageOrConversation(tip.label);
    if (page) return action(page);
    if (byLabel[tip.label]) return action(byLabel[tip.label]);
    const rule = tip.label && tip.label.length <= 30 && LABEL_RULES.find(([re]) => re.test(tip.label));
    if (rule) return action(rule[1]);
    const text = (el.textContent || '').trim(); // the Compose button shows its name as text
    if (text.length <= 12 && byLabel[text]) return action(byLabel[text]);
    return null;
  }

  // Folder links in the left menu end in "#inbox", "#sent", … whatever the UI language.
  function folderOf(el) {
    const box = el.closest('.TO');
    const link = el.closest('a[href*="#"]') || (box && box.querySelector('a[href*="#"]'));
    const hash = link ? (link.getAttribute('href') || '').split('#')[1] : '';
    return byFolder[hash] ? action(byFolder[hash]) : null;
  }

  function fromMouse(e, mac) {
    if (!(e.target instanceof Element)) return null;
    const el = e.target;
    if (el.closest('input[name="q"]')) return action('search');
    const folder = folderOf(el);
    if (folder) return folder;
    let control = el.closest(CONTROL);
    // The element with the name is sometimes a wrapper of the one clicked.
    for (let depth = 0; control && depth < 4; depth++) {
      const found = describe(control, mac);
      if (found) {
        detected.set(found.id, found.label);
        return found;
      }
      control = control.parentElement ? control.parentElement.closest(CONTROL) : null;
    }
    return null;
  }

  // Keys that change conversations do nothing in the list until one is ticked
  // (Gmail says "No conversations selected"); in an open conversation they act on it.
  const ON_CONVERSATIONS = new Set(['archive', 'spam', 'remove', 'read', 'unread', 'snooze', 'tasks', 'move', 'label', 'mute', 'important', 'notImportant', 'archiveNewer', 'archiveOlder']);
  function hasConversation() {
    if (/\/[A-Za-z0-9]{16,}$/.test(location.hash)) return true; // "#inbox/FMfcgz…"
    return [...document.querySelectorAll('tr.zA [role="checkbox"][aria-checked="true"]')].some((box) => box.getClientRects().length);
  }

  // "g then i" (go to) and "* then a" (select).
  const nextKey = K.sequencer((c) => !K.hasModifier(c) && ((!c.shift && c.key === 'g') || (c.shift && c.key === '8')));

  function fromKey(e, mac) {
    if (K.isModifierOnly(e)) return null;
    if (K.isTextEntry(e, mac)) { nextKey.reset(); return null; }
    let c = K.fromEvent(e, mac);
    if (!K.hasModifier(c) && K.isTyping(e)) { nextKey.reset(); return null; }
    c = nextKey(c, Date.now());
    if (!c) return null;
    const id = K.toId(c);
    if (byCombo[id]) return ON_CONVERSATIONS.has(byCombo[id]) && !hasConversation() ? null : action(byCombo[id]);
    // Enter opens the conversation under the list cursor, which is not a focus: the
    // key then goes to the page itself. On a focused button it just presses it.
    if (id === 'enter' && e.target instanceof Element && (e.target.closest('tr.zA') || e.target.tagName === 'BODY')) return action('open');
    if (K.hasModifier(c) && !c.then) {
      const seen = detected.get('gmail:' + id);
      const name = seen || QH.names.pick(COMPOSE_NAMES[id]);
      return name ? { id: 'gmail:' + id, label: name, fallbackLabel: !seen, combos: [c] } : null;
    }
    return null;
  }

  (QH.sites = QH.sites || []).push({
    id: 'gmail',
    matches: (loc) => loc.hostname === 'mail.google.com',
    mouseEvent: 'mouseup', // Gmail buttons act on mouseup
    fromMouse,
    fromKey,
  });
})();
