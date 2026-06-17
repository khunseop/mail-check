// Service Worker — 메일 자동 감지 (1분 폴링)

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('mailPoll', { periodInMinutes: 1 });
});

chrome.alarms.get('mailPoll', (alarm) => {
  if (!alarm) chrome.alarms.create('mailPoll', { periodInMinutes: 1 });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'REGISTER_TAB' && sender.tab?.id) {
    chrome.storage.local.set({ mailTabId: sender.tab.id });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'mailPoll') pollMail();
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function pollMail() {
  const { mailTabId, monitoringEnabled, policies = [], seenIds = [], processedMails = [] } =
    await chrome.storage.local.get(['mailTabId', 'monitoringEnabled', 'policies', 'seenIds', 'processedMails']);

  if (!monitoringEnabled || !mailTabId) return;

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

  // 키워드가 하나라도 있는 활성 정책만 사용
  const activePolicies = policies.filter(p => {
    if (!p.enabled) return false;
    return (p.subjectKeywords?.length > 0) || (p.senderKeywords?.length > 0);
  });
  if (!activePolicies.length) return;

  const seenSet = new Set(seenIds);

  // 정책에 매칭되고 아직 처리 안 한 메일 필터링
  const newMails = [];
  for (const { title, sender = '' } of response.rows) {
    if (!title || seenSet.has(title)) continue;
    const matched = activePolicies.find(p => {
      const subKws = p.subjectKeywords || [];
      const sndKws = p.senderKeywords || [];
      const subOk = subKws.length === 0 || subKws.some(kw => kw && title.includes(kw));
      const sndOk = sndKws.length === 0 || sndKws.some(kw => kw && sender.includes(kw));
      return subOk && sndOk;
    });
    if (matched) newMails.push({ title, sender, policyId: matched.id, policyName: matched.name });
  }

  if (!newMails.length) return;

  // 먼저 seenIds에 추가 (재폴링 중복 방지)
  newMails.forEach(({ title }) => seenSet.add(title));

  // 각 메일 순차 처리: 열기 → 본문 읽기 → 첨부파일 저장
  const added = [];
  for (const mail of newMails) {
    const entry = {
      title: mail.title,
      sender: mail.sender,
      time: now,
      status: 'ok',
      policyId: mail.policyId,
      policyName: mail.policyName,
      body: '',
      attachments: [],
      attachmentsSaved: false,
    };

    try {
      // 1. 메일 열기
      await chrome.tabs.sendMessage(mailTabId, { action: 'OPEN_MAIL', title: mail.title });

      // 2. 본문 패널 로드 대기
      await sleep(2500);

      // 3. 본문 읽기
      const contentRes = await chrome.tabs.sendMessage(mailTabId, { action: 'GET_MAIL_CONTENT' });
      if (contentRes?.success && contentRes.content) {
        entry.body = (contentRes.content.body || '').slice(0, 3000);
        entry.attachments = contentRes.content.attachments || [];

        // 4. 첨부파일 저장 (있을 때만)
        if (entry.attachments.length > 0) {
          const saveRes = await chrome.tabs.sendMessage(mailTabId, { action: 'SAVE_ALL_ATTACHMENTS' });
          entry.attachmentsSaved = saveRes?.success ?? false;
        }
      }
    } catch {
      entry.status = 'warn';
    }

    added.push(entry);
  }

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
