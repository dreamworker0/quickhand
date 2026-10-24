// Gmail: toolbar buttons are recognised by their stable `act` number, folders by
// their link, the rest by name. Gmail's tooltips rarely show shortcuts, so keys
// come from Gmail's published shortcut list; the compose window's formatting
// buttons do show theirs ("굵게 (Ctrl-B)") and are read from the page.
// Single-key shortcuts only work once "Keyboard shortcuts on" is set in Gmail.
(function () {
  'use strict';
  const QH = (globalThis.QH = globalThis.QH || {});
  const K = QH.keys;
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
  };

  // Compose window keys pressed before their button was ever clicked.
  const COMPOSE_NAMES = Object.assign({}, QH.names.EDITING, {
    'mod+shift+7': ['번호 매기기 목록', 'Numbered list'],
    'mod+shift+8': ['글머리 기호 목록', 'Bulleted list'],
    'mod+shift+9': ['인용구', 'Quote'],
    'mod+shift+c': ['참조 수신자 추가', 'Add Cc recipients'],
    'mod+shift+b': ['숨은참조 수신자 추가', 'Add Bcc recipients'],
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

  const CONTROL = '[act], [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], button, [data-tooltip]';

  function action(name) {
    const a = ACTIONS[name];
    return { id: 'gmail:' + name, label: QH.names.pick(a.name), combos: [a.combo] };
  }

  function describe(el, mac) {
    const act = el.getAttribute('act');
    if (act && byAct[act]) return action(byAct[act]);
    if (el.getAttribute('role') === 'checkbox') {
      if (/별표|star/i.test(el.getAttribute('aria-label') || '')) return action('star');
      return action(el.closest('tr.zA') ? 'select' : 'selectAll'); // a row's box, or the one above the list
    }
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
      if (found) return found;
      control = control.parentElement ? control.parentElement.closest(CONTROL) : null;
    }
    return null;
  }

  // "g then i" (go to) and "* then a" (select).
  const nextKey = K.sequencer((c) => !K.hasModifier(c) && ((!c.shift && c.key === 'g') || (c.shift && c.key === '8')));

  function fromKey(e, mac) {
    if (K.isModifierOnly(e)) return null;
    let c = K.fromEvent(e, mac);
    if (!K.hasModifier(c) && K.isTyping(e)) return null; // plain letters in a text field are typing
    c = nextKey(c, Date.now());
    if (!c) return null;
    const id = K.toId(c);
    if (byCombo[id]) return action(byCombo[id]);
    if (K.hasModifier(c) && !c.then) {
      return { id: 'gmail:' + id, label: QH.names.pick(COMPOSE_NAMES[id]), fallbackLabel: true, combos: [c] };
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
