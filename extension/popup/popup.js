const monitorToggle  = document.getElementById('monitorToggle');
const toggleLabel    = document.getElementById('toggleLabel');
const brandIcon      = document.getElementById('brandIcon');
const statusPanel    = document.getElementById('statusPanel');
const lastPollTimeEl = document.getElementById('lastPollTime');
const lastDetectedEl = document.getElementById('lastDetectedMail');
const feedList       = document.getElementById('feedList');
const feedCount      = document.getElementById('feedCount');
const btnCheck       = document.getElementById('btnCheck');
const btnList        = document.getElementById('btnList');
const btnContent     = document.getElementById('btnContent');
const resultEl       = document.getElementById('result');

// ── 초기화 ──────────────────────────────────────────
async function init() {
  try {
    const data = await chrome.storage.local.get([
      'monitoringEnabled', 'lastPollTime', 'lastDetectedMail', 'processedMails'
    ]);
    const enabled = data.monitoringEnabled ?? false;
    monitorToggle.checked = enabled;
    applyMonitorState(enabled);
    if (data.lastPollTime)     lastPollTimeEl.textContent = formatTime(data.lastPollTime);
    if (data.lastDetectedMail) lastDetectedEl.textContent = data.lastDetectedMail;
    renderFeed(data.processedMails || []);
  } catch (e) {
    console.error('[Mail Check] init 실패 — 확장 프로그램을 chrome://extensions에서 재로드하세요.', e);
  }
}

// ── 모니터링 토글 ────────────────────────────────────
monitorToggle.addEventListener('change', async () => {
  const on = monitorToggle.checked;
  try {
    await chrome.storage.local.set({ monitoringEnabled: on });
    applyMonitorState(on);
  } catch (e) {
    console.error('[Mail Check] 상태 저장 실패 — 확장 프로그램을 chrome://extensions에서 재로드하세요.', e);
    monitorToggle.checked = !on; // 실패 시 토글 원복
  }
});

function applyMonitorState(on) {
  toggleLabel.textContent = on ? 'ON' : 'OFF';
  toggleLabel.classList.toggle('on', on);
  brandIcon.classList.toggle('active', on);
  statusPanel.classList.toggle('active', on);
}

// ── 지금 확인 ────────────────────────────────────────
btnCheck.addEventListener('click', async () => {
  btnCheck.classList.add('loading');
  btnCheck.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'GET_MAIL_LIST' });
    const now = new Date().toISOString();
    await chrome.storage.local.set({ lastPollTime: now });
    lastPollTimeEl.textContent = formatTime(now);
    if (res?.success && res.rows?.length) {
      const title = res.rows[0]?.title || '—';
      lastDetectedEl.textContent = title;
      await chrome.storage.local.set({ lastDetectedMail: title });
    }
  } catch (_) {
    // 메일 페이지가 아닌 탭에서는 무시
  } finally {
    btnCheck.classList.remove('loading');
    btnCheck.disabled = false;
  }
});

// ── 기록 초기화 ──────────────────────────────────────
document.getElementById('btnReset').addEventListener('click', async () => {
  await chrome.storage.local.set({ processedMails: [], seenIds: [], lastDetectedMail: '' });
  renderFeed([]);
  lastDetectedEl.textContent = '없음';
});

// ── 처리 내역 렌더링 ─────────────────────────────────
function renderFeed(mails) {
  feedCount.textContent = mails.length;
  if (!mails.length) {
    feedList.innerHTML = `
      <div class="feed-empty">
        <span class="feed-empty-icon">◌</span>
        <span>아직 처리된 메일이 없습니다</span>
      </div>`;
    return;
  }
  feedList.innerHTML = [...mails].reverse().map(mail => {
    const cls   = mail.status === 'ok' ? '' : mail.status === 'warn' ? 'warn' : 'error';
    const badge = mail.status === 'ok' ? 'badge-ok' : mail.status === 'warn' ? 'badge-warn' : 'badge-error';
    const label = mail.status === 'ok' ? '감지됨' : mail.status === 'warn' ? '본문미확인' : '오류';
    const attachInfo = mail.attachments?.length > 0
      ? `<span class="badge ${mail.attachmentsSaved ? 'badge-ok' : 'badge-warn'}">`
        + `첨부 ${mail.attachments.length}개${mail.attachmentsSaved ? ' 저장됨' : ' 저장실패'}</span>`
      : '';
    const bodyPreview = mail.body
      ? `<div class="feed-item-body-preview">${escapeHtml(mail.body.slice(0, 80))}…</div>`
      : '';
    return `
      <div class="feed-item ${cls}">
        <span class="feed-item-dot"></span>
        <div class="feed-item-body">
          <div class="feed-item-title">${escapeHtml(mail.title)}</div>
          ${mail.sender ? `<div class="feed-item-sender">${escapeHtml(mail.sender)}</div>` : ''}
          <div class="feed-item-meta">
            <span class="feed-item-time">${formatTime(mail.time)}</span>
            <span class="badge ${badge}">${label}</span>
            ${mail.policyName ? `<span class="badge badge-ok">${escapeHtml(mail.policyName)}</span>` : ''}
            ${attachInfo}
          </div>
          ${bodyPreview}
        </div>
      </div>`;
  }).join('');
}

// ── 디버그 버튼 ──────────────────────────────────────
btnList.addEventListener('click',    () => runDebug('list'));
btnContent.addEventListener('click', () => runDebug('content'));

document.getElementById('btnTestFill').addEventListener('click', async () => {
  resultEl.textContent = '답장 창 탐색 중…';
  try {
    const replyTabId = await findReplyTab();
    if (replyTabId === null) { showError('열린 답장 창을 찾지 못했습니다. 전체답장을 먼저 열어두세요.'); return; }
    const res = await chrome.tabs.sendMessage(replyTabId, {
      action: 'FILL_REPLY',
      text: '(테스트) 안녕하세요, 답장 자동 입력 테스트입니다.',
    });
    resultEl.textContent = res?.success ? '✓ 입력 성공' : '✗ 실패: ' + (res?.error || '알 수 없는 오류');
  } catch (e) {
    showError('오류: ' + e.message);
  }
});

async function findReplyTab() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'CHECK_COMPOSE' });
      if (res?.hasCompose) return tab.id;
    } catch { /* content script 없는 탭은 무시 */ }
  }
  return null;
}
document.getElementById('btnReplyAll').addEventListener('click', async () => {
  resultEl.textContent = '전체답장 단축키 전송 중…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { showError('현재 탭을 찾을 수 없습니다.'); return; }
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'REPLY_ALL' });
    resultEl.textContent = res?.success
      ? '단축키 전송 완료 — 작성창이 열렸는지 확인하세요.'
      : '실패: ' + (res?.error || '알 수 없는 오류');
  } catch (e) {
    showError('오류: ' + e.message);
  }
});

async function runDebug(action) {
  resultEl.textContent = '불러오는 중…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { showError('현재 탭을 찾을 수 없습니다.'); return; }
    const res = await chrome.tabs.sendMessage(tab.id, {
      action: action === 'list' ? 'GET_MAIL_LIST' : 'GET_MAIL_CONTENT',
    });
    if (res?.success) {
      action === 'list' ? showMailList(res) : showMailContent(res.content);
    } else {
      showError(res?.error || '가져오지 못했습니다.');
    }
  } catch (e) {
    showError('오류: ' + (e.message || String(e)) + '. 메일 페이지를 새로고침한 뒤 다시 시도해 보세요.');
  }
}

// ── 기존 표시 함수 (디버그용) ────────────────────────
function showMailContent(content) {
  if (!content) {
    showError('가져온 메일 내용이 없습니다. 메일 본문이 열린 페이지에서 다시 시도하세요.');
    return;
  }
  const { subject, from, date, body, attachments } = content;
  if (!subject && !from && !date && !body) {
    showError('메일 정보를 찾지 못했습니다. content.js의 CONFIG를 확인하세요.');
    return;
  }
  const attachHtml = attachments?.length
    ? `<span class="label">첨부파일 (${attachments.length}개)</span>
       <div class="attachment-list">${attachments.map(n => `<div class="attachment-item">📎 ${escapeHtml(n)}</div>`).join('')}</div>
       <button id="btnSaveAll" class="save-all-btn">모두 저장</button>`
    : '';
  resultEl.innerHTML = [
    subject && `<span class="label">제목</span><span class="value">${escapeHtml(subject)}</span>`,
    from    && `<span class="label">발신자</span><span class="value">${escapeHtml(from)}</span>`,
    date    && `<span class="label">일시</span><span class="value">${escapeHtml(date)}</span>`,
    body    && `<span class="label">본문</span><span class="value">${escapeHtml(truncate(body, 1000))}</span>`,
    attachHtml,
  ].filter(Boolean).join('');
  document.getElementById('btnSaveAll')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'SAVE_ALL_ATTACHMENTS' });
    if (!res?.success) showError(res?.error || '모두 저장 실패');
  });
}

function showMailList(listResult) {
  if (!listResult?.rows?.length) {
    showError('수신 목록을 찾지 못했습니다. 메일 목록 페이지인지 확인하세요.');
    return;
  }
  resultEl.innerHTML = [
    `<span class="label">총 ${listResult.rowCount}건 (미개봉 ${listResult.rows.filter(r => r.unread).length}건)</span>`,
    ...listResult.rows.map(r =>
      `<div class="row-item">
        <div class="row-num">${r.index}${r.unread ? ' 🔵' : ''}</div>
        <div>
          <div class="value">${escapeHtml(r.title || '')}</div>
          <div style="font-size:10px;color:var(--text-3)">${escapeHtml(r.sender || '(발신자 없음)')}</div>
        </div>
      </div>`
    ),
  ].join('');
}

function showError(msg) {
  resultEl.innerHTML = `<span class="error">${escapeHtml(msg)}</span>`;
}

// ── 유틸 ─────────────────────────────────────────────
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function truncate(str, max) {
  return str?.length > max ? str.slice(0, max) + '…' : (str || '');
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

init();

// storage 변경 시 피드·상태 자동 갱신
chrome.storage.onChanged.addListener((changes) => {
  if (changes.processedMails) renderFeed(changes.processedMails.newValue || []);
  if (changes.lastPollTime)   lastPollTimeEl.textContent = formatTime(changes.lastPollTime.newValue);
  if (changes.lastDetectedMail) lastDetectedEl.textContent = changes.lastDetectedMail.newValue;
});
