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
  const { mailTabId, monitoringEnabled, policies = [], seenIds = [], processedMails = [] } =
    await chrome.storage.local.get(['mailTabId', 'monitoringEnabled', 'policies', 'seenIds', 'processedMails']);

  if (!monitoringEnabled) return;
  if (!mailTabId) return;

  try {
    await chrome.tabs.get(mailTabId);
  } catch {
    await chrome.storage.local.remove('mailTabId');
    return;
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(mailTabId, { action: 'GET_MAIL_LIST' });
  } catch {
    return;
  }

  const now = new Date().toISOString();
  await chrome.storage.local.set({ lastPollTime: now });

  if (!response?.success || !response.rows?.length) return;

  const activePolicies = policies.filter(p => p.enabled && p.keywords?.length);
  // 활성 정책이 없으면 감지하지 않음
  if (!activePolicies.length) return;

  const seenSet = new Set(seenIds);

  // 각 메일에 대해 매칭되는 첫 번째 정책을 찾음
  const newMails = [];
  for (const { title } of response.rows) {
    if (!title || seenSet.has(title)) continue;
    const matched = activePolicies.find(p =>
      p.keywords.some(kw => kw && title.includes(kw))
    );
    if (matched) {
      newMails.push({ title, policyId: matched.id, policyName: matched.name });
    }
  }

  if (!newMails.length) return;

  newMails.forEach(({ title }) => seenSet.add(title));
  const added = newMails.map(({ title, policyId, policyName }) => ({
    title, time: now, status: 'ok', policyId, policyName, summary: policyName,
  }));
  const updated = [...processedMails, ...added].slice(-50);

  await chrome.storage.local.set({
    seenIds: [...seenSet],
    processedMails: updated,
    lastDetectedMail: newMails[0].title,
  });

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Mail Check',
    message: `새 메일 ${newMails.length}건 감지: ${newMails[0].title}`,
  });
}
