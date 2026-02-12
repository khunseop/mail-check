/**
 * 메일 페이지에서 메일 내용을 추출합니다.
 * 사내 메일 웹의 실제 DOM 구조에 맞게 아래 선택자를 수정하세요.
 * (개발자 도구로 메일 제목, 발신자, 본문 영역을 검사해 선택자 확인)
 */

const CONFIG = {
  // 예시 선택자 — 사내 메일 HTML에 맞게 변경 필요
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
 * 현재 페이지에서 메일 관련 정보 수집
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
  if (request.action === 'GET_MAIL_CONTENT') {
    try {
      const content = extractMailContent();
      sendResponse({ success: true, content });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
  }
  return true; // 비동기 응답을 위해 true 반환
});
