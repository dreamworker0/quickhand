// Built-in names for shortcuts pressed on the keyboard before their button was
// ever clicked (the page then gives no name). Each entry is [Korean, English].
(function (root) {
  'use strict';
  const QH = (root.QH = root.QH || {});

  // Text editing shortcuts shared by Docs, Sheets, Slides and Gmail's compose window.
  // Keyed by keys.toId; "mod" is Ctrl or ⌘.
  const EDITING = {
    'mod+b': ['굵게', 'Bold'],
    'mod+i': ['기울임꼴', 'Italic'],
    'mod+u': ['밑줄', 'Underline'],
    'mod+z': ['실행취소', 'Undo'],
    'mod+y': ['다시 실행', 'Redo'],
    'mod+shift+z': ['다시 실행', 'Redo'],
    'mod+c': ['복사', 'Copy'],
    'mod+x': ['잘라내기', 'Cut'],
    'mod+v': ['붙여넣기', 'Paste'],
    'mod+a': ['모두 선택', 'Select all'],
    'mod+k': ['링크 삽입', 'Insert link'],
    'mod+f': ['찾기', 'Find'],
    'mod+p': ['인쇄', 'Print'],
    'mod+\\': ['서식 지우기', 'Clear formatting'],
    'mod+/': ['단축키 목록 보기', 'Show keyboard shortcuts'],
  };

  function lang() {
    try {
      return /^ko\b/i.test(chrome.i18n.getUILanguage()) ? 0 : 1;
    } catch (e) {
      return 0;
    }
  }

  // Picks the entry in the browser's UI language.
  function pick(entry) {
    return entry ? entry[lang()] : '';
  }

  QH.names = { EDITING, pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = QH.names;
})(typeof globalThis !== 'undefined' ? globalThis : this);
