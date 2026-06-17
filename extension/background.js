// Service Worker — 메일 자동 감지 (1분 폴링)

// 설치 또는 재시작 시 알람 등록
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('mailPoll', { periodInMinutes: 1 });
});

// Service Worker 재시작 후 알람이 사라졌을 경우 재등록
chrome.alarms.get('mailPoll', (alarm) => {
  if (!alarm) chrome.alarms.create('mailPoll', { periodInMinutes: 1 });
});

// content.js에서 메일 목록 컨테이너 발견 시 탭 ID 등록
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'REGISTER_TAB' && sender.tab?.id) {
    chrome.storage.local.set({ mailTabId: sender.tab.id });
  }
});

// 1분마다 실행
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'mailPoll') pollMail();
});

async function pollMail() {
  const { mailTabId, monitoringEnabled, keywords = [], seenIds = [], processedMails = [] } =
    await chrome.storage.local.get(['mailTabId', 'monitoringEnabled', 'keywords', 'seenIds', 'processedMails']);

  // 모니터링 OFF이면 폴링 건너뜀
  if (!monitoringEnabled) return;
  if (!mailTabId) return;

  // 탭이 아직 열려 있는지 확인
  try {
    await chrome.tabs.get(mailTabId);
  } catch {
    await chrome.storage.local.remove('mailTabId');
    return;
  }

  // 메일 목록 요청
  let response;
  try {
    response = await chrome.tabs.sendMessage(mailTabId, { action: 'GET_MAIL_LIST' });
  } catch {
    return; // 탭에 content script 없음 (페이지 이동 등)
  }

  const now = new Date().toISOString();
  await chrome.storage.local.set({ lastPollTime: now });

  if (!response?.success || !response.rows?.length) return;

  // 새 메일 필터: 아직 못 본 것 + 키워드 매칭
  const seenSet = new Set(seenIds);
  const newMails = response.rows.filter(({ title }) => {
    if (!title || seenSet.has(title)) return false;
    if (!keywords.length) return true;
    return keywords.some(kw => kw && title.includes(kw));
  });

  if (!newMails.length) return;

  // storage 업데이트
  newMails.forEach(({ title }) => seenSet.add(title));
  const added = newMails.map(({ title }) => ({ title, time: now, status: 'ok', summary: '감지됨' }));
  const updated = [...processedMails, ...added].slice(-50); // 최대 50건 유지

  await chrome.storage.local.set({
    seenIds: [...seenSet],
    processedMails: updated,
    lastDetectedMail: newMails[0].title,
  });

  // 데스크탑 알림
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Mail Check',
    message: `새 메일 ${newMails.length}건 감지: ${newMails[0].title}`,
  });
}
