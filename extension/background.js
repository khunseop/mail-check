// Service worker for Mail Check extension
// 나중에: 새 메일 알림, 자동 작업 트리거 등에 사용 가능

chrome.runtime.onInstalled.addListener(() => {
  console.log('Mail Check extension installed.');
});
