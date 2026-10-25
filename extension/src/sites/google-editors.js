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
  const detected = new Map(); // Only page-discovered or named shortcuts may be recorded.
  const SHEET_ROWS = '[1-9]\\d*(?:\\s*[-–—~:]\\s*[1-9]\\d*)?';
  const SHEET_COLUMNS = '[A-Z]{1,3}(?:\\s*[-–—~:]\\s*[A-Z]{1,3})?';
  // Korean context menus put the selection before the action: "F - I열 삭제".
  const SHEET_RANGE_PREFIX = new RegExp(`^(?:${SHEET_COLUMNS}\\s*(?=열)|${SHEET_ROWS}\\s*(?=행))`, 'i');
  const SHEET_DELETE = new RegExp(
    `^(?:행(?: ${SHEET_ROWS})?|열(?: ${SHEET_COLUMNS})?) 삭제$|^Delete (?:rows?(?: ${SHEET_ROWS})?|columns?(?: ${SHEET_COLUMNS})?)$`, 'i'
  );

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
        // The rest of Docs' help page (support.google.com/docs/answer/179738).
        'mod+y': ['마지막 작업 반복', 'Repeat last action'],
        'mod+o': ['열기', 'Open'],
        'mod+s': ['저장', 'Save'],
        'mod+g': ['다시 찾기', 'Find next'],
        'mod+shift+g': ['이전 항목 찾기', 'Find previous'],
        'alt+enter': ['링크 열기', 'Open link'],
        'alt+/': ['메뉴 검색', 'Search the menus'],
        'alt+shift+z': ['메뉴 검색', 'Search the menus'],
        'alt+z': ['메뉴 검색', 'Search the menus'],
        'mod+alt+shift+z': ['수정 모드로 전환', 'Switch to editing'],
        'mod+alt+shift+x': ['제안 모드로 전환', 'Switch to suggesting'],
        'mod+alt+shift+c': ['보기 모드로 전환', 'Switch to viewing'],
        'mod+=': ['확대', 'Zoom in'],
        'mod+shift+=': ['확대', 'Zoom in'],
        'mod++': ['확대', 'Zoom in'],
        'mod+-': ['축소', 'Zoom out'],
        'mod+0': ['확대/축소 100%', 'Zoom to 100%'],
        'mod+.': ['위 첨자', 'Superscript'],
        'mod+,': ['아래 첨자', 'Subscript'],
        'mod+alt+c': ['텍스트 서식 복사', 'Copy text formatting'],
        'mod+alt+v': ['텍스트 서식 붙여넣기', 'Paste text formatting'],
        'mod+space': ['텍스트 서식 지우기', 'Clear text formatting'],
        // Small caps in English; with a Korean UI Docs uses the key for its input tools.
        'mod+shift+k': ['입력 도구 켜기/끄기', 'Small caps'],
        'mod+]': ['들여쓰기 늘리기', 'Increase indent'],
        'mod+[': ['들여쓰기 줄이기', 'Decrease indent'],
        'mod+shift+9': ['체크리스트', 'Checklist'],
        'mod+shift+arrowup': ['단락 위로 이동', 'Move paragraph up'],
        'mod+shift+arrowdown': ['단락 아래로 이동', 'Move paragraph down'],
        'mod+alt+y': ['대체 텍스트', 'Alt text'],
        'mod+alt+k': ['이미지 크게', 'Enlarge image'],
        'mod+alt+b': ['이미지 가로로 크게', 'Enlarge image horizontally'],
        'mod+alt+i': ['이미지 세로로 크게', 'Enlarge image vertically'],
        'mod+alt+j': ['이미지 작게', 'Shrink image'],
        'mod+alt+w': ['이미지 가로로 작게', 'Shrink image horizontally'],
        'mod+alt+q': ['이미지 세로로 작게', 'Shrink image vertically'],
        'alt+arrowright': ['이미지 시계 방향 15° 회전', 'Rotate image 15° clockwise'],
        'alt+arrowleft': ['이미지 시계 반대 방향 15° 회전', 'Rotate image 15° counterclockwise'],
        'alt+shift+arrowright': ['이미지 시계 방향 1° 회전', 'Rotate image 1° clockwise'],
        'alt+shift+arrowleft': ['이미지 시계 반대 방향 1° 회전', 'Rotate image 1° counterclockwise'],
        'mod+shift+x': ['컨텍스트 메뉴', 'Context menu'],
        'mod+shift+\\': ['컨텍스트 메뉴', 'Context menu'],
        'shift+f10': ['컨텍스트 메뉴', 'Context menu'],
        'alt+f': ['파일 메뉴', 'File menu'],
        'alt+e': ['수정 메뉴', 'Edit menu'],
        'alt+v': ['보기 메뉴', 'View menu'],
        'alt+i': ['삽입 메뉴', 'Insert menu'],
        'alt+o': ['서식 메뉴', 'Format menu'],
        'alt+t': ['도구 메뉴', 'Tools menu'],
        'alt+h': ['도움말 메뉴', 'Help menu'],
        'alt+a': ['접근성 메뉴', 'Accessibility menu'],
        'mod+alt+shift+k': ['입력 도구 메뉴', 'Input tools menu'],
        'mod+shift+arrowleft': ['단어 단위로 선택', 'Select by word'],
        'mod+shift+arrowright': ['단어 단위로 선택', 'Select by word'],
        'mod+shift+home': ['문서 처음까지 선택', 'Select to the start of the document'],
        'mod+shift+end': ['문서 끝까지 선택', 'Select to the end of the document'],
        'mod+alt+shift+arrowleft': ['여러 부분 선택', 'Select multiple sections'],
        'mod+alt+shift+arrowright': ['여러 부분 선택', 'Select multiple sections'],
        'mod+alt+z': ['스크린 리더 지원 켜기/끄기', 'Turn screen reader support on or off'],
        'alt+shift+`': ['스크린 리더 지원 켜기/끄기', 'Turn screen reader support on or off'],
        'mod+alt+h': ['점자 지원 켜기/끄기', 'Turn braille support on or off'],
        'mod+alt+shift+r': ['실시간 수정 내용 듣기', 'Announce live edits'],
        'mod+shift+s': ['음성 입력', 'Voice typing'],
        'mod+alt+.': ['측면 패널로 이동', 'Move to the side panel'],
        'mod+alt+,': ['측면 패널로 이동', 'Move to the side panel'],
        "mod+'": ['다음 맞춤법 오류', 'Next misspelling'],
        'mod+;': ['이전 맞춤법 오류', 'Previous misspelling'],
        'mod+alt+shift+m': ['편집 영역 밖으로 이동', 'Move focus out of the editing area'],
        'mod+alt+enter': ['체크박스 전환', 'Toggle checkbox'],
        'mod+shift+pagedown': ['다음 탭으로', 'Next document tab'],
        'mod+shift+pageup': ['이전 탭으로', 'Previous document tab'],
        // Shown in the menus but not on the help page.
        'shift+f11': ['탭 추가', 'Add tab'],
        'alt+shift+k': ['작은 대문자', 'Small caps'],
        'mod+shift+p': ['인쇄 불가 문자 표시', 'Show non-printing characters'],
        'mod+alt+shift+j': ['댓글 숨기기', 'Hide comments'],
        // Single letters while a comment is selected (see COMMENT_KEYS).
        r: ['댓글에 답글', 'Reply to the comment'],
        j: ['다음 댓글', 'Next comment'],
        k: ['이전 댓글', 'Previous comment'],
        e: ['댓글 해결', 'Resolve the comment'],
        u: ['댓글에서 나가기', 'Leave the comment'],
        // Selection keys with only Shift, and page keys (see PLAIN_KEYS).
        'shift+arrowleft': ['한 글자씩 선택', 'Select by character'],
        'shift+arrowright': ['한 글자씩 선택', 'Select by character'],
        'shift+arrowup': ['한 줄씩 선택', 'Select by line'],
        'shift+arrowdown': ['한 줄씩 선택', 'Select by line'],
        'shift+home': ['줄 처음까지 선택', 'Select to the start of the line'],
        'shift+end': ['줄 끝까지 선택', 'Select to the end of the line'],
        'pageup': ['한 페이지 위로', 'Page up'],
        'pagedown': ['한 페이지 아래로', 'Page down'],
        'shift+escape': ['그림 편집기 닫기', 'Close the drawing editor'],
      },
      // Keys without Ctrl or Alt that still count in Docs (all are named above).
      plainKeys: ['shift+arrowleft', 'shift+arrowright', 'shift+arrowup', 'shift+arrowdown', 'shift+home', 'shift+end', 'pageup', 'pagedown', 'shift+escape'],
      // Two-step keys, "Ctrl+Alt+N, H": Ctrl+Alt (+Shift) and a letter, then a second
      // key, with or without the modifiers still held. Keyed by the first step.
      sequences: {
        'mod+alt+u': { a: ['선택 해제', 'Select none'] },
        'mod+alt+a': {
          x: ['선택 영역 읽기', 'Speak selection'], r: ['커서 위치부터 읽기', 'Speak from cursor'],
          l: ['커서 위치 말하기', 'Speak cursor location'], f: ['커서 위치 서식 말하기', 'Speak formatting at cursor'],
          c: ['댓글 읽기', 'Speak comment'], a: ['댓글 앵커 읽기', 'Speak comment anchor'],
          s: ['선택 영역 서식 읽기', 'Speak selection formatting'], h: ['개요 표시', 'Show the outline'],
        },
        'mod+alt+e': { c: ['현재 댓글로 들어가기', 'Enter the current comment'], f: ['현재 각주로 이동', 'Move to the current footnote'], p: ['팝업으로 이동', 'Move focus to the popup'] },
        'mod+alt+o': { u: ['제안 검토', 'Review suggested edits'], h: ['머리글로 이동', 'Insert or move to the header'], f: ['바닥글로 이동', 'Insert or move to the footer'] },
        'mod+alt+n': {
          h: ['다음 제목', 'Next heading'], 1: ['다음 제목 1', 'Next heading 1'], 2: ['다음 제목 2', 'Next heading 2'], 3: ['다음 제목 3', 'Next heading 3'],
          4: ['다음 제목 4', 'Next heading 4'], 5: ['다음 제목 5', 'Next heading 5'], 6: ['다음 제목 6', 'Next heading 6'],
          g: ['다음 그래픽', 'Next graphic'], o: ['다음 목록', 'Next list'], i: ['목록의 다음 항목', 'Next list item'], l: ['다음 링크', 'Next link'],
          b: ['다음 북마크', 'Next bookmark'], w: ['다음 서식 변경', 'Next formatting change'], r: ['다음 수정', 'Next revision'],
          f: ['다음 각주', 'Next footnote'], u: ['다음 제안', 'Next suggestion'], c: ['다음 댓글', 'Next comment'],
        },
        'mod+alt+p': {
          h: ['이전 제목', 'Previous heading'], 1: ['이전 제목 1', 'Previous heading 1'], 2: ['이전 제목 2', 'Previous heading 2'], 3: ['이전 제목 3', 'Previous heading 3'],
          4: ['이전 제목 4', 'Previous heading 4'], 5: ['이전 제목 5', 'Previous heading 5'], 6: ['이전 제목 6', 'Previous heading 6'],
          g: ['이전 그래픽', 'Previous graphic'], o: ['이전 목록', 'Previous list'], i: ['목록의 이전 항목', 'Previous list item'], l: ['이전 링크', 'Previous link'],
          b: ['이전 북마크', 'Previous bookmark'], w: ['이전 서식 변경', 'Previous formatting change'], r: ['이전 수정', 'Previous revision'],
          f: ['이전 각주', 'Previous footnote'], u: ['이전 제안', 'Previous suggestion'], c: ['이전 댓글', 'Previous comment'],
        },
        'mod+alt+shift+e': { i: ['현재 목록 항목 선택', 'Select the current list item'], o: ['같은 수준의 목록 항목 모두 선택', 'Select all list items at this level'] },
        'mod+alt+shift+a': { l: ['커서 위치 읽기', 'Speak cursor position'], w: ['단어 수 읽기', 'Speak word count'] },
        'mod+alt+shift+n': { t: ['다음 표', 'Next table'] },
        'mod+alt+shift+p': { t: ['이전 표', 'Previous table'] },
        // In the View › Comments menu, not on the help page.
        'mod+alt+shift+w': { m: ['댓글 최소화', 'Minimize comments'], e: ['댓글 펼치기', 'Expand comments'] },
        'mod+alt+shift+t': {
          s: ['표의 처음으로', 'Start of the table'], d: ['표의 끝으로', 'End of the table'], i: ['열의 처음으로', 'Start of the column'],
          k: ['열의 끝으로', 'End of the column'], b: ['다음 열로', 'Next column'], v: ['이전 열로', 'Previous column'],
          j: ['행의 처음으로', 'Start of the row'], l: ['행의 끝으로', 'End of the row'], m: ['다음 행으로', 'Next row'],
          g: ['이전 행으로', 'Previous row'], e: ['표에서 나가기', 'Leave the table'], h: ['행·열 머리글 읽기', 'Speak row and column headers'],
          n: ['셀 위치 읽기', 'Speak cell location'], r: ['행 머리글 읽기', 'Speak row header'], c: ['열 머리글 읽기', 'Speak column header'],
        },
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
        'mod+space': ['열 선택', 'Select column'],
        'ctrl+space': ['열 선택', 'Select column'], // Mac: Control+Space
        'shift+space': ['행 선택', 'Select row'],
        // The rest of Sheets' help page (support.google.com/docs/answer/181110).
        'mod+shift+space': ['모두 선택', 'Select all'],
        'mod+enter': ['범위 채우기', 'Fill range'],
        // In the grid these jump to the edge of the data; in the formula bar they resize it.
        'mod+arrowup': ['데이터 위쪽 끝으로 (수식 입력줄에선 크기 조정)', 'Up to the edge of the data'],
        'mod+arrowdown': ['데이터 아래쪽 끝으로 (수식 입력줄에선 크기 조정)', 'Down to the edge of the data'],
        'f4': ['재실행 (수식 입력 중엔 참조 전환)', 'Redo (in a formula: toggle references)'],
        'mod+o': ['열기', 'Open'],
        'mod+s': ['저장', 'Save'],
        'mod+shift+f': ['컨트롤 숨기기', 'Hide the menus'],
        'mod+shift+k': ['입력 도구 켜기/끄기', 'Turn input tools on or off'],
        'mod+alt+shift+k': ['입력 도구 선택', 'Choose input tools'],
        'alt+/': ['메뉴 검색', 'Search the menus'],
        'mod+alt+t': ['범위를 표로 변환', 'Convert to table'],
        'mod+shift+7': ['바깥쪽 테두리', 'Outer border'],
        'mod+alt+shift+;': ['날짜 및 시간 넣기', 'Insert date and time'],
        'mod+shift+2': ['시간 형식', 'Time format'],
        'mod+shift+3': ['날짜 형식', 'Date format'],
        'mod+shift+6': ['지수 형식', 'Scientific format'],
        'mod+home': ['시트의 처음으로', 'Start of the sheet'],
        'mod+end': ['시트의 끝으로', 'End of the sheet'],
        'home': ['행의 처음으로', 'Start of the row'],
        'end': ['행의 끝으로', 'End of the row'],
        'mod+backspace': ['활성 셀로 스크롤', 'Scroll to the active cell'],
        'alt+enter': ['링크 열기', 'Open link'],
        'mod+alt+.': ['측면 패널로 이동', 'Move to the side panel'],
        'mod+alt+,': ['측면 패널로 이동', 'Move to the side panel'],
        'mod+alt+shift+m': ['스프레드시트 밖으로 이동', 'Move focus out of the spreadsheet'],
        'alt+shift+q': ['빠른 요약으로 이동', 'Move to quick sum'],
        'mod+alt+r': ['필터 메뉴 열기', 'Open the filter menu'],
        'shift+escape': ['그림 편집기 닫기', 'Close the drawing editor'],
        'mod+alt+m': ['댓글 넣기', 'Insert comment'],
        'alt+f': ['파일 메뉴', 'File menu'],
        'alt+e': ['수정 메뉴', 'Edit menu'],
        'alt+v': ['보기 메뉴', 'View menu'],
        'alt+i': ['삽입 메뉴', 'Insert menu'],
        'alt+o': ['서식 메뉴', 'Format menu'],
        'alt+d': ['데이터 메뉴', 'Data menu'],
        'alt+t': ['도구 메뉴', 'Tools menu'],
        'alt+m': ['양식 메뉴', 'Form menu'],
        'alt+n': ['확장 프로그램 메뉴', 'Extensions menu'],
        'alt+h': ['도움말 메뉴', 'Help menu'],
        'alt+a': ['접근성 메뉴', 'Accessibility menu'],
        'alt+shift+s': ['시트 메뉴', 'Sheet menu'],
        'mod+shift+\\': ['컨텍스트 메뉴', 'Context menu'],
        'shift+f10': ['컨텍스트 메뉴', 'Context menu'],
        'mod+alt+\\': ['표 열 메뉴', 'Table column menu'],
        'alt+shift+arrowright': ['행·열 그룹화', 'Group rows or columns'],
        'alt+shift+arrowleft': ['행·열 그룹 해제', 'Ungroup rows or columns'],
        'alt+shift+arrowdown': ['그룹 펼치기', 'Expand the group'],
        'alt+shift+arrowup': ['그룹 접기', 'Collapse the group'],
        'mod+`': ['모든 수식 표시', 'Show all formulas'],
        'mod+shift+enter': ['배열 수식 넣기', 'Insert array formula'],
        'mod+e': ['배열 수식 접기·범위 선택 전환', 'Collapse array formula / toggle range selection'],
        'shift+f1': ['수식 도움말 표시/숨기기', 'Show or hide formula help'],
        'f1': ['수식 도움말', 'Formula help'],
        'f9': ['수식 결과 미리보기', 'Preview formula results'],
        'f2': ['수식 범위 선택 전환', 'Toggle range selection in a formula'],
        'mod+alt+z': ['스크린 리더 지원 켜기/끄기', 'Turn screen reader support on or off'],
        'mod+alt+h': ['점자 지원 켜기/끄기', 'Turn braille support on or off'],
        'mod+alt+shift+c': ['열 읽기', 'Speak column'],
        'mod+alt+shift+r': ['행 읽기', 'Speak row'],
        // Single letters while a comment is selected (see COMMENT_KEYS).
        r: ['댓글에 답글', 'Reply to the comment'],
        j: ['다음 댓글', 'Next comment'],
        k: ['이전 댓글', 'Previous comment'],
        e: ['댓글 해결', 'Resolve the comment'],
        u: ['댓글에서 나가기', 'Leave the comment'],
      },
      // Previous sheet counts as the same action as next sheet.
      keyAlias: { 'alt+arrowup': 'alt+arrowdown' },
      plainKeys: ['home', 'end'],
      numberFormats: {
        숫자: 'Ctrl+Shift+1', Number: 'Ctrl+Shift+1', 시간: 'Ctrl+Shift+2', Time: 'Ctrl+Shift+2',
        날짜: 'Ctrl+Shift+3', Date: 'Ctrl+Shift+3', 통화: 'Ctrl+Shift+4', Currency: 'Ctrl+Shift+4',
        퍼센트: 'Ctrl+Shift+5', Percent: 'Ctrl+Shift+5', 지수: 'Ctrl+Shift+6', Scientific: 'Ctrl+Shift+6',
      },
      sequences: {
        'mod+alt+e': { p: ['팝업으로 이동', 'Move focus to the popup'], c: ['현재 댓글로 들어가기', 'Enter the current comment'] },
        'mod+alt+n': { c: ['다음 댓글', 'Next comment'] },
        'mod+alt+p': { c: ['이전 댓글', 'Previous comment'] },
      },
      rules: [
        [/(행|열)( \d+개)? 삽입$|^Insert (\d+ )?(rows?|columns?)\b/i, 'Ctrl+Alt+='],
        [SHEET_DELETE, 'Ctrl+Alt+-'],
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
    // A menu's "Ctrl+Alt+O Ctrl+Alt+U" is the same two-step key as pressing O, then U.
    if (combo && combo.then && app.sequences && app.sequences[K.toId(Object.assign({}, combo, { then: null }))]) {
      combo.then = K.combo(combo.then.key);
    }
    // Function keys count with or without Shift (Sheets' Insert › Sheet is
    // Shift+F11, Note is Shift+F2); a plain Shift+letter would just be typing.
    if (combo && (K.hasModifier(combo) || /^f\d+$/.test(combo.key)) && label) {
      return { id: app.id + ':' + K.toId(combo), label, combos: [combo] };
    }
    // Sheets' Format › Number items show a sample ("1,000.12", "10.12%") where other
    // items show their key; the help page gives Ctrl+Shift+1~6 for six of them.
    if (app.numberFormats && accel && /\d/.test(shortcut) && app.numberFormats[label]) {
      return found(app, K.parse(mac ? app.numberFormats[label].replace(/Ctrl/g, 'Command') : app.numberFormats[label], mac), label);
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
    const actionText = app.id === 'sheets' ? text.replace(SHEET_RANGE_PREFIX, '') : text;
    const rule = app.rules.concat(COMMON_RULES).find(([re]) => re.test(actionText));
    // These fallback strings use Windows Ctrl to mean the platform's primary modifier.
    return rule ? found(app, K.parse(mac ? rule[1].replace(/Ctrl/g, 'Command') : rule[1], mac), text) : null;
  }

  // Sheets: clicking a sheet tab at the bottom switches sheets (Alt+↓ / Alt+↑).
  // Sheets switches on mousedown, so by mouseup the clicked tab is already the
  // active one; remember on mousedown whether it was another sheet.
  let pressedTab = null;
  let pressedTabWasActive = false;
  // Sheets: a plain click on a column letter selects the column (Ctrl+Space, on
  // Mac Control+Space), on a row number the row (Shift+Space). Where the press
  // landed is taken at mousedown; a drag (resizing or moving) is not a select,
  // and the top-left corner, where both strips meet, selects everything instead.
  let pressedHeader = null;
  if (location.hostname === 'docs.google.com' && location.pathname.startsWith('/spreadsheets/')) {
    window.addEventListener(
      'mousedown',
      (e) => {
        pressedTab = e.target instanceof Element ? e.target.closest('.docs-sheet-tab') : null;
        pressedTabWasActive = !!pressedTab && pressedTab.classList.contains('docs-sheet-active-tab');
        // A menu or button lying over the header strip is not the header.
        const onControl = e.target instanceof Element && !!e.target.closest(CONTROL);
        pressedHeader = e.button === 0 && !onControl ? { kind: headerAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY } : null;
      },
      true
    );
  }

  function headerAt(x, y) {
    const hit = (sel) => [...document.querySelectorAll(sel)].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
    });
    const column = hit('.column-headers-background');
    const row = hit('.row-headers-background');
    return column === row ? null : column ? 'column' : 'row';
  }

  function sheetHeader(app, e, mac) {
    if (app.id !== 'sheets' || !pressedHeader || !pressedHeader.kind) return null;
    const { kind, x, y } = pressedHeader;
    pressedHeader = null;
    if (Math.abs(e.clientX - x) > 4 || Math.abs(e.clientY - y) > 4) return null;
    return found(app, kind === 'column' ? K.combo('space', mac ? { ctrl: true } : { mod: true }) : K.combo('space', { shift: true }));
  }

  // Shift+Space selects the row while cells are selected, but types a space in
  // a cell being edited. Sheets sends the key to different elements depending on
  // what was done before, so look at the result instead: a moment later the name
  // box shows a whole row ("3:3"), or the row's filled part ("A3:C3") inside data,
  // only if the row was selected.
  function rowSelected() {
    return new Promise((resolve) => setTimeout(() => {
      const box = document.querySelector('#t-name-box, .waffle-name-box');
      const m = /^[A-Z]*(\d+):[A-Z]*(\d+)$/.exec((box && box.value) || '');
      resolve(!!m && m[1] === m[2]);
    }, 200));
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
    // The file name box is titled "이름 바꾸기" (rename the file), not the sheet's Alt+1.
    const title = e.target.closest('.docs-title-widget, .docs-title-input');
    if (title && (title.classList.contains('docs-title-widget') || title.classList.contains('docs-title-input'))) return null;
    const tab = sheetTab(app, e.target, mac) || sheetHeader(app, e, mac);
    if (tab) return tab;
    let el = e.target.closest(CONTROL);
    // The element with the tooltip is sometimes a wrapper of the one clicked.
    for (let depth = 0; el && depth < 4; depth++) {
      const result = describe(app, el, mac);
      if (result) {
        detected.set(result.id, result.label);
        return result;
      }
      el = el.parentElement ? el.parentElement.closest(CONTROL) : null;
    }
    return null;
  }

  // Two-step keys (Docs): returns the finished sequence, null while waiting for the
  // second key, or undefined when the key is not part of a sequence. A first step that
  // is also a shortcut of its own (Ctrl+Alt+Shift+A, comment history) is answered a
  // moment later, once it is clear no second key follows.
  const COMMENT_KEYS = ['r', 'j', 'k', 'e', 'u'];
  const SEQUENCE_MS = 1500;
  let firstStep = null;
  let firstAt = 0;
  function sequenceStep(app, combo) {
    const id = K.toId(combo);
    const now = Date.now();
    if (firstStep && now - firstAt <= SEQUENCE_MS) {
      const first = firstStep;
      firstStep = null;
      // The second key may come with Ctrl+Alt (+Shift) still held, or on its own.
      const held = first.shift ? { mod: true, alt: true, shift: true } : { mod: true, alt: true };
      const plain = Object.keys(held).every((m) => combo[m] === held[m]) || !K.hasModifier(combo);
      const names = app.sequences[K.toId(first)];
      const name = plain && names[combo.key];
      if (!name) return undefined; // not a sequence after all; treat the key on its own
      const second = K.combo(combo.key);
      return { id: app.id + ':' + K.toId(K.sequence(first, second)), label: QH.names.pick(name), fallbackLabel: true, combos: [K.sequence(first, second)] };
    }
    firstStep = null;
    if (!app.sequences[id]) return undefined;
    firstStep = combo;
    firstAt = now;
    const alone = app.names[id] || COMMON_NAMES[id];
    if (!alone) return null;
    return new Promise((resolve) => setTimeout(() => {
      const stillAlone = firstStep === combo;
      if (stillAlone) firstStep = null;
      resolve(stillAlone ? found(app, combo) : null);
    }, SEQUENCE_MS));
  }

  function fromKey(app, e, mac) {
    if (K.isModifierOnly(e) || K.isTextEntry(e, mac)) return null;
    const combo = K.fromEvent(e, mac);
    const fnKey = /^f\d+$/.test(combo.key);
    if (app.id === 'sheets' && K.toId(combo) === 'shift+space') {
      // Answered a moment later (see rowSelected); content/main.js waits for it.
      return rowSelected().then((yes) => (yes ? found(app, combo) : null));
    }
    if (app.sequences) {
      const step = sequenceStep(app, combo);
      if (step !== undefined) return step;
    }
    let id = K.toId(combo);
    // Docs and Sheets: a selected comment (not its text box) takes single letters as shortcuts.
    const commentKey = (app.id === 'docs' || app.id === 'sheets') && COMMENT_KEYS.includes(id) && !K.isTyping(e) &&
      e.target instanceof Element && !!e.target.closest('.docos-anchoreddocoview, .docos-docoview-active');
    if (!(K.hasModifier(combo) || fnKey || commentKey || (app.plainKeys && app.plainKeys.includes(id)))) return null;
    if (app.keyAlias && app.keyAlias[id]) id = app.keyAlias[id];
    const seen = detected.get(app.id + ':' + id);
    const name = seen || QH.names.pick(app.names[id] || COMMON_NAMES[id]);
    if (!name) return null;
    return { id: app.id + ':' + id, label: name, fallbackLabel: !seen, combos: [combo] };
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
