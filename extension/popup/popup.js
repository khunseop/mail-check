const resultEl = document.getElementById('result');
const btnList = document.getElementById('btnList');
const btnContent = document.getElementById('btnContent');

function showMailContent(content) {
  if (!content) {
    resultEl.innerHTML = '<span class="empty">가져온 메일 내용이 없습니다. 메일 본문이 열린 페이지에서 다시 시도하세요.</span>';
    resultEl.classList.add('empty');
    return;
  }

  const { subject, from, date, body } = content;
  const hasAny = subject || from || date || body;

  if (!hasAny) {
    resultEl.innerHTML = '<span class="empty">메일 정보를 찾지 못했습니다. content.js의 CONFIG를 사내 메일 페이지 DOM에 맞게 수정해 주세요.</span>';
    resultEl.classList.add('empty');
    return;
  }

  resultEl.classList.remove('empty');
  resultEl.innerHTML = [
    subject && `<div class="label">제목</div><div class="value">${escapeHtml(subject)}</div>`,
    from && `<div class="label">발신자</div><div class="value">${escapeHtml(from)}</div>`,
    date && `<div class="label">일시</div><div class="value">${escapeHtml(date)}</div>`,
    body && `<div class="label">본문</div><div class="value">${escapeHtml(truncate(body, 1500))}</div>`,
  ].filter(Boolean).join('');
}

function showMailList(listResult) {
  if (!listResult?.rows?.length) {
    resultEl.innerHTML = '<span class="empty">수신 목록을 찾지 못했습니다. 메일 목록 페이지인지 확인하고, content.js의 listContainerXPath / rowSelector를 확인하세요.</span>';
    resultEl.classList.add('empty');
    return;
  }

  resultEl.classList.remove('empty');
  resultEl.innerHTML = [
    `<div class="label">총 ${listResult.rowCount}건</div>`,
    ...listResult.rows.map((row) =>
      `<div class="row-item"><div class="row-num">${row.index}</div><div class="value">${escapeHtml(truncate(row.text, 200))}</div></div>`
    ),
  ].join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

function showError(msg) {
  resultEl.classList.remove('empty');
  resultEl.innerHTML = `<span class="error">${escapeHtml(msg)}</span>`;
}

async function runAction(action) {
  resultEl.textContent = '불러오는 중…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showError('현재 탭을 찾을 수 없습니다.');
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: action === 'list' ? 'GET_MAIL_LIST' : 'GET_MAIL_CONTENT',
    });
    if (response?.success) {
      if (action === 'list') {
        showMailList(response);
      } else {
        showMailContent(response.content);
      }
    } else {
      showError(response?.error || '가져오지 못했습니다.');
    }
  } catch (e) {
    showError('오류: ' + (e.message || String(e)) + '. 메일 페이지를 새로고침한 뒤 다시 시도해 보세요.');
  }
}

btnList.addEventListener('click', () => runAction('list'));
btnContent.addEventListener('click', () => runAction('content'));

// 로드 시 수신 목록 자동 요청
runAction('list');
