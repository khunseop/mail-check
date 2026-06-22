// Service Worker — 메일 자동 감지 및 처리 (1분 폴링)

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

// ── 유틸 ─────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 모든 프레임 탐색 후 #cafe-note-contents가 있는 프레임 반환
async function findReplyTab() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => !!document.querySelector('#cafe-note-contents'),
      });
      const frame = results?.find(r => r.result === true);
      if (frame) return { tabId: tab.id, frameId: frame.frameId };
    } catch { /* 스크립트 실행 불가 탭 무시 */ }
  }
  return null;
}

// 가공된 텍스트를 compose 창에 입력
async function fillReply(tabId, frameId, text) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (insertText) => {
      const el = document.querySelector('#cafe-note-contents > p:nth-child(2)');
      if (!el) return { success: false, error: '입력 위치를 찾지 못했습니다.' };
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return { success: document.execCommand('insertText', false, insertText) };
    },
    args: [text],
  });
  return results?.[0]?.result;
}

// 발신 버튼 클릭
async function sendReply(tabId, frameId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: () => {
      const btn = document.querySelector(
        '#root > div > section > div.window-header > div > button.pt-btn.primary.md'
      );
      if (!btn) return { success: false, error: '발신 버튼을 찾지 못했습니다.' };
      btn.click();
      return { success: true };
    },
  });
  return results?.[0]?.result;
}

// 백엔드 호출 (미응답 시 null 반환)
async function callBackend(backendUrl, subject, body, attachments) {
  try {
    const res = await fetch(`${backendUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, attachments }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.replyText || null;
  } catch {
    return null;
  }
}

// ── 개별 메일 처리 ───────────────────────────────────

async function processMail(mail, mailTabId, autoSend, backendUrl) {
  const entry = {
    title: mail.title,
    sender: mail.sender,
    time: new Date().toISOString(),
    status: 'ok',
    policyId: mail.policyId,
    policyName: mail.policyName,
    body: '',
    attachments: [],
    attachmentsSaved: false,
    replyFilled: false,
    replySent: false,
  };

  try {
    // 1. 메일 열기
    await chrome.tabs.sendMessage(mailTabId, { action: 'OPEN_MAIL', title: mail.title });
    await sleep(2500);

    // 2. 본문·첨부파일 읽기
    const contentRes = await chrome.tabs.sendMessage(mailTabId, { action: 'GET_MAIL_CONTENT' });
    if (!contentRes?.success || !contentRes.content) {
      entry.status = 'warn';
      return entry;
    }

    entry.body        = (contentRes.content.body || '').slice(0, 3000);
    entry.attachments = contentRes.content.attachments || [];
    const subject     = contentRes.content.subject || mail.title;

    // 3. 첨부파일 저장
    if (entry.attachments.length > 0) {
      const saveRes = await chrome.tabs.sendMessage(mailTabId, { action: 'SAVE_ALL_ATTACHMENTS' });
      entry.attachmentsSaved = saveRes?.success ?? false;
    }

    // 4. 백엔드 호출 → 답장 텍스트 수신
    const replyText = backendUrl
      ? await callBackend(backendUrl, subject, entry.body, entry.attachments)
      : null;

    // 5. 전체답장 버튼 클릭 → 작성창 열기
    await chrome.tabs.sendMessage(mailTabId, { action: 'REPLY_ALL' });

    // 6. 작성창 로드 대기 (최대 10초)
    let compose = null;
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      compose = await findReplyTab();
      if (compose) break;
    }

    if (!compose) {
      entry.status = 'warn';
      return entry;
    }

    // 7. 답장 텍스트 입력 (백엔드 응답이 있을 때만)
    if (replyText) {
      await fillReply(compose.tabId, compose.frameId, replyText);
      entry.replyFilled = true;
    }

    // 8. 자동 발신 (옵션이 켜져 있고 텍스트가 입력된 경우에만)
    if (autoSend && entry.replyFilled) {
      await sleep(500);
      const sendRes = await sendReply(compose.tabId, compose.frameId);
      entry.replySent = sendRes?.success ?? false;
      await sleep(1500); // 창 닫힐 때까지 대기
    }

  } catch (e) {
    entry.status = 'error';
    entry.error = String(e);
  }

  return entry;
}

// ── 큐 처리 ──────────────────────────────────────────

let processingLock = false;

async function processQueue() {
  if (processingLock) return;
  processingLock = true;

  try {
    while (true) {
      const {
        mailQueue = [],
        processedMails = [],
        mailTabId,
        autoSend = false,
        backendUrl = '',
      } = await chrome.storage.local.get([
        'mailQueue', 'processedMails', 'mailTabId', 'autoSend', 'backendUrl',
      ]);

      if (!mailQueue.length || !mailTabId) break;

      // 큐 앞에서 하나 꺼내기
      const [mail, ...rest] = mailQueue;
      await chrome.storage.local.set({ mailQueue: rest });

      const entry = await processMail(mail, mailTabId, autoSend, backendUrl);

      const updated = [...processedMails, entry].slice(-50);
      await chrome.storage.local.set({
        processedMails: updated,
        lastDetectedMail: mail.title,
      });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Mail Check',
        message: `처리 완료: ${mail.title}${entry.replySent ? ' (발신됨)' : entry.replyFilled ? ' (작성됨)' : ''}`,
      });
    }
  } finally {
    processingLock = false;
  }
}

// ── 폴링 ─────────────────────────────────────────────

async function pollMail() {
  const {
    mailTabId,
    monitoringEnabled,
    policies = [],
    seenIds = [],
  } = await chrome.storage.local.get([
    'mailTabId', 'monitoringEnabled', 'policies', 'seenIds',
  ]);

  if (!monitoringEnabled || !mailTabId) return;

  // 탭이 아직 유효한지 확인
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

  const newMails = [];
  for (const { title, sender = '', unread } of response.rows) {
    if (!title || seenSet.has(title) || !unread) continue;
    const matched = activePolicies.find(p => {
      const subKws = p.subjectKeywords || [];
      const sndKws = p.senderKeywords  || [];
      const subOk  = subKws.length === 0 || subKws.some(kw => kw && title.includes(kw));
      const sndOk  = sndKws.length === 0 || sndKws.some(kw => kw && sender.includes(kw));
      return subOk && sndOk;
    });
    if (matched) newMails.push({ title, sender, policyId: matched.id, policyName: matched.name });
  }

  if (!newMails.length) return;

  // seenIds 즉시 업데이트 (재폴링 중복 방지)
  newMails.forEach(({ title }) => seenSet.add(title));

  // 큐에 추가
  const { mailQueue = [] } = await chrome.storage.local.get('mailQueue');
  await chrome.storage.local.set({
    seenIds: [...seenSet],
    mailQueue: [...mailQueue, ...newMails],
  });

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Mail Check',
    message: `새 메일 ${newMails.length}건 감지: ${newMails[0].title}`,
  });

  processQueue();
}
