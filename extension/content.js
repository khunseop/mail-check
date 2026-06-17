/**
 * 메일 페이지에서 메일 내용·목록을 추출합니다.
 *
 * HTML 요소 찾는 방법 (Chrome 개발자 도구):
 * 1. 메일 페이지에서 F12 또는 우클릭 → "검사" 로 개발자 도구 열기
 * 2. 왼쪽 상단 요소 선택(커서) 아이콘으로 원하는 영역 클릭
 * 3. Elements 패널에서 해당 요소 우클릭 → Copy → "Copy XPath" 또는 "Copy selector"
 * 4. XPath는 긴 경로라 깨지기 쉬우므로, 가능하면 id/class 기반 CSS 선택자 사용 권장
 */

const CONFIG = {
  // ---- 메일 수신 목록 (리스트 페이지) ----
  /** 목록 컨테이너 (CSS 선택자 우선, 없으면 listContainerXPath 사용) */
  listContainerSelector: '#DEFAULT_scroll-list',
  listContainerXPath: '/html/body/div[1]/div[1]/div[2]/div[2]/div/div/div[1]/div[1]/div[2]/div/div[2]/div/div[4]/div[2]',
  /** 목록에서 메일 한 줄씩인 요소의 CSS 선택자 */
  rowSelector: ':scope > div',
  /** 각 행(row) 안에서 제목 텍스트가 있는 요소 (행 기준 상대 선택자) */
  rowTitleSelector: '.cell.col-03 .inner-cell.col03-01 a',
  /** 각 행에서 발신자 텍스트가 있는 요소 */
  rowSenderSelector: '.cell.col-03 .inner-cell.col03-02 idv a span',

  // ---- 메일 본문 (메일 상세 페이지) ----
  mailDetailContainer: '#DEFAULT_scroll-detail',
  mailSubject: '#DEFAULT_scroll-detail > section > div > div.header-area > div.title-area > div.inner-left > h1 > span',
  mailFrom: '[data-from], .from, .sender, .mail-from, .author',
  mailDate: '[data-date], .date, .time, .mail-date',
  mailBody: '#DEFAULT_scroll-detail > section > div > div.contents-body-area > div.read-content-container > div:nth-child(1) > div',

  // ---- 첨부파일 ----
  attachmentContainer: '#DEFAULT_scroll-detail > section > div > div.contents-body-area > div.attachment-file',
  attachmentItem: 'div.attachment-body > div > div > ul > li',
  attachmentNameSelector: 'div.file-group > div.file-name.pointer > span > span > span',
  attachmentSaveAllBtn: 'div.attachment-header > div > div:nth-child(1) > div.attach-btns > button',
};

/**
 * 첫 번째로 매칭되는 요소의 textContent 반환
 */
function getText(selector) {
  if (!selector) return '';
  const el = document.querySelector(selector);
  return el ? (el.textContent || '').trim() : '';
}

/**
 * 여러 선택자 중 첫 번째로 찾은 요소의 텍스트 반환
 */
function getTextBySelectors(selectors) {
  const parts = selectors.split(',').map((s) => s.trim());
  for (const sel of parts) {
    const text = getText(sel);
    if (text) return text;
  }
  return '';
}

/**
 * XPath로 단일 노드 반환 (없으면 null)
 */
function getElementByXPath(xpath) {
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return result.singleNodeValue;
}

/**
 * 목록 컨테이너 요소 반환 (CSS 선택자 → XPath 순으로 시도)
 */
function getListContainer() {
  if (CONFIG.listContainerSelector) {
    const el = document.querySelector(CONFIG.listContainerSelector);
    if (el) return el;
  }
  return getElementByXPath(CONFIG.listContainerXPath) || null;
}

/**
 * 메일 수신 목록 추출: 각 행에서 제목만 파싱
 */
function extractMailList() {
  const container = getListContainer();
  if (!container) {
    return { success: false, rows: [], error: '목록 컨테이너를 찾지 못했습니다. listContainerSelector 또는 XPath를 확인하세요.' };
  }
  const rowEls = container.querySelectorAll(CONFIG.rowSelector);
  const rows = Array.from(rowEls).map((rowEl, index) => {
    const titleEl = CONFIG.rowTitleSelector
      ? rowEl.querySelector(CONFIG.rowTitleSelector)
      : null;
    const title = titleEl ? (titleEl.textContent || '').trim() : (rowEl.textContent || '').trim();
    const senderEl = CONFIG.rowSenderSelector
      ? rowEl.querySelector(CONFIG.rowSenderSelector)
      : null;
    const sender = senderEl ? (senderEl.textContent || '').trim() : '';
    // a.not-open 이면 미개봉(안 읽은) 메일
    const unread = titleEl ? titleEl.classList.contains('not-open') : false;
    return {
      index: index + 1,
      title: title || '(제목 없음)',
      sender,
      unread,
    };
  });
  return {
    success: true,
    url: window.location.href,
    rowCount: rows.length,
    rows,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * 첨부파일 목록 추출
 */
function extractAttachments() {
  const container = document.querySelector(CONFIG.attachmentContainer);
  if (!container) return [];
  return Array.from(container.querySelectorAll(CONFIG.attachmentItem)).map((li) => {
    const nameEl = li.querySelector(CONFIG.attachmentNameSelector);
    return (nameEl ? (nameEl.textContent || '').trim() : '(이름 없음)');
  });
}

/**
 * 현재 페이지에서 메일 관련 정보 수집 (상세 본문용)
 * 상세 컨테이너가 없으면 null 반환
 */
function extractMailContent() {
  if (!document.querySelector(CONFIG.mailDetailContainer)) return null;
  const bodyEl = document.querySelector(CONFIG.mailBody);
  return {
    url: window.location.href,
    subject: getText(CONFIG.mailSubject),
    from: getTextBySelectors(CONFIG.mailFrom),
    date: getTextBySelectors(CONFIG.mailDate),
    body: bodyEl ? (bodyEl.innerText || bodyEl.textContent || '').trim() : '',
    attachments: extractAttachments(),
    extractedAt: new Date().toISOString(),
  };
}

/**
 * 첨부파일 모두 저장 버튼 클릭
 */
function clickSaveAll() {
  const container = document.querySelector(CONFIG.attachmentContainer);
  if (!container) return { success: false, error: '첨부파일 영역을 찾지 못했습니다.' };
  const btn = container.querySelector(CONFIG.attachmentSaveAllBtn);
  if (!btn) return { success: false, error: '모두 저장 버튼을 찾지 못했습니다.' };
  btn.click();
  return { success: true };
}

// 메일 목록 컨테이너가 있는 프레임에서 background에 탭 등록
// 동적 로딩 대응: 최대 10초 대기 (500ms 간격)
(function tryRegister() {
  if (document.querySelector(CONFIG.listContainerSelector)) {
    chrome.runtime.sendMessage({ action: 'REGISTER_TAB' });
    return;
  }
  let attempts = 0;
  const timer = setInterval(() => {
    if (document.querySelector(CONFIG.listContainerSelector)) {
      chrome.runtime.sendMessage({ action: 'REGISTER_TAB' });
      clearInterval(timer);
    } else if (++attempts >= 20) {
      clearInterval(timer);
    }
  }, 500);
})();

// popup / background에서 메시지로 요청 시 응답
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  try {
    if (request.action === 'GET_MAIL_LIST') {
      const listResult = extractMailList();
      if (!listResult.success) return false; // 컨테이너 없으면 다른 frame에서 처리
      sendResponse({ success: true, ...listResult });
      return;
    }
    if (request.action === 'GET_MAIL_CONTENT') {
      const content = extractMailContent();
      if (!content) return false;
      sendResponse({ success: true, content });
      return;
    }
    if (request.action === 'OPEN_MAIL') {
      const container = getListContainer();
      if (!container) return false;
      const rows = container.querySelectorAll(CONFIG.rowSelector);
      for (const row of rows) {
        const titleEl = row.querySelector(CONFIG.rowTitleSelector);
        if (titleEl && titleEl.textContent.trim() === request.title) {
          titleEl.click();
          sendResponse({ success: true });
          return;
        }
      }
      sendResponse({ success: false, error: '해당 메일을 찾을 수 없습니다.' });
      return;
    }
    if (request.action === 'SAVE_ALL_ATTACHMENTS') {
      const result = clickSaveAll();
      if (!result.success) return false;
      sendResponse(result);
      return;
    }
    sendResponse({ success: false, error: 'Unknown action' });
  } catch (e) {
    sendResponse({ success: false, error: String(e) });
  }
  return true; // 비동기 응답을 위해 true 반환
});
