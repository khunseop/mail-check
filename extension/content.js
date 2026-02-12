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
  /** 목록이 들어 있는 컨테이너의 XPath (해당 div 아래에 tbl-row들이 있음) */
  listContainerXPath: '/html/body/div[1]/div[1]/div[2]/div[2]/div/div/div[1]/div[1]/div[2]/div/div[2]/div/div[4]/div[2]',
  /** 목록에서 메일 한 줄씩인 요소의 CSS 선택자 */
  rowSelector: 'div.tbl-row',

  // ---- 메일 본문 (메일 상세 페이지) ----
  mailSubject: '[data-subject], .subject, .mail-subject, h1, .message-subject',
  mailFrom: '[data-from], .from, .sender, .mail-from, .author',
  mailDate: '[data-date], .date, .time, .mail-date',
  mailBody: '[data-body], .body, .content, .message-body, .mail-body, main, article, .email-content',
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
 * 메일 수신 목록 추출: CONFIG의 XPath 컨테이너 아래 div.tbl-row 들의 텍스트 수집
 */
function extractMailList() {
  const container = getElementByXPath(CONFIG.listContainerXPath);
  if (!container) {
    return { success: false, rows: [], error: '목록 컨테이너를 찾지 못했습니다. XPath를 확인하세요.' };
  }
  const rowEls = container.querySelectorAll(CONFIG.rowSelector);
  const rows = Array.from(rowEls).map((el, index) => ({
    index: index + 1,
    text: (el.textContent || '').trim(),
  }));
  return {
    success: true,
    url: window.location.href,
    rowCount: rows.length,
    rows,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * 현재 페이지에서 메일 관련 정보 수집 (상세 본문용)
 */
function extractMailContent() {
  return {
    url: window.location.href,
    title: document.title,
    subject: getTextBySelectors(CONFIG.mailSubject),
    from: getTextBySelectors(CONFIG.mailFrom),
    date: getTextBySelectors(CONFIG.mailDate),
    body: getTextBySelectors(CONFIG.mailBody),
    extractedAt: new Date().toISOString(),
  };
}

// popup에서 메시지로 요청 시 응답
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  try {
    if (request.action === 'GET_MAIL_LIST') {
      const listResult = extractMailList();
      sendResponse(listResult.success
        ? { success: true, ...listResult }
        : { success: false, error: listResult.error });
      return;
    }
    if (request.action === 'GET_MAIL_CONTENT') {
      const content = extractMailContent();
      sendResponse({ success: true, content });
      return;
    }
    sendResponse({ success: false, error: 'Unknown action' });
  } catch (e) {
    sendResponse({ success: false, error: String(e) });
  }
  return true; // 비동기 응답을 위해 true 반환
});
