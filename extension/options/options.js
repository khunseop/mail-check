let policies = [];
let nextId = 1;

async function load() {
  try {
    const { policies: saved = [] } = await chrome.storage.local.get('policies');
    if (saved.length) {
      policies = saved.map(p => ({
        ...p,
        subjectKeywords: p.subjectKeywords ?? p.keywords ?? [],
        senderKeywords:  p.senderKeywords  ?? [],
        // mode 마이그레이션: 구 스키마 → 신 스키마
        mode:           p.mode ?? (p.useBackend ? 'backend' : p.saveAttachments ? 'attachments' : 'none'),
        backendUrl:     p.backendUrl    ?? '',
        autoSend:       p.autoSend      ?? false,
        downloadFolder: p.downloadFolder ?? '',
      }));
      nextId = Math.max(...policies.map(p => p.id), 0) + 1;
    } else {
      policies = [newPolicy()];
    }
  } catch (e) {
    console.error('[Mail Check] 설정 로드 실패', e);
    policies = [newPolicy()];
  }
  render();
}

function newPolicy() {
  return {
    id: nextId++,
    name: `정책 ${policies.length + 1}`,
    subjectKeywords: [],
    senderKeywords: [],
    enabled: true,
    mode: 'none',        // 'none' | 'backend' | 'attachments'
    backendUrl: '',
    autoSend: false,
    downloadFolder: '',
  };
}

function render() {
  const list = document.getElementById('policyList');
  list.innerHTML = '';
  policies.forEach((p, pi) => list.appendChild(buildCard(p, pi)));
}

function buildCard(policy, pi) {
  const card = document.createElement('div');
  card.className = 'policy-card' + (policy.enabled ? '' : ' disabled');

  // ── 헤더 ──
  const header = document.createElement('div');
  header.className = 'policy-header';

  const num = document.createElement('span');
  num.className = 'policy-num';
  num.textContent = '#' + (pi + 1);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'policy-name-input';
  nameInput.value = policy.name;
  nameInput.placeholder = '정책 이름';
  nameInput.addEventListener('input', () => { policy.name = nameInput.value; });

  // 활성화 토글
  const enableWrap = document.createElement('div');
  enableWrap.className = 'toggle-labeled' + (policy.enabled ? ' is-on' : '');
  const enableLbl = document.createElement('span');
  enableLbl.className = 'toggle-labeled-text';
  enableLbl.textContent = '활성';
  const enableToggle = makeToggle(policy.enabled, checked => {
    policy.enabled = checked;
    card.classList.toggle('disabled', !checked);
    enableWrap.classList.toggle('is-on', checked);
  });
  enableWrap.append(enableLbl, enableToggle);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-del-policy';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => {
    if (policies.length === 1) return;
    policies.splice(policies.indexOf(policy), 1);
    render();
  });

  header.append(num, nameInput, enableWrap, delBtn);

  // ── 바디 ──
  const body = document.createElement('div');
  body.className = 'policy-body';

  // 2열 키워드 그리드
  const grid = document.createElement('div');
  grid.className = 'kw-grid';
  grid.appendChild(makeKwCol('제목 키워드', '제목 포함 단어', policy, 'subjectKeywords'));
  grid.appendChild(makeKwCol('발신자 키워드', '발신자 이름/이메일', policy, 'senderKeywords'));
  body.appendChild(grid);

  // 동작 모드 선택 (세그먼트)
  const modeSection = document.createElement('div');
  modeSection.className = 'mode-section';

  const modeLbl = document.createElement('span');
  modeLbl.className = 'mode-label';
  modeLbl.textContent = '동작';

  const modeSelector = document.createElement('div');
  modeSelector.className = 'mode-selector';

  const modes = [
    { key: 'none',        label: '감지만' },
    { key: 'backend',     label: '백엔드 처리' },
    { key: 'attachments', label: '첨부파일 저장' },
  ];

  // 조건부 패널 미리 생성
  const backendPanel = makeBackendPanel(policy);
  const attachPanel  = makeAttachPanel(policy);

  function updatePanels() {
    backendPanel.style.display = policy.mode === 'backend'     ? 'flex' : 'none';
    attachPanel.style.display  = policy.mode === 'attachments' ? 'flex' : 'none';
    modeSelector.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === policy.mode);
    });
  }

  modes.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.className = 'mode-btn' + (policy.mode === key ? ' active' : '');
    btn.textContent = label;
    btn.dataset.mode = key;
    btn.addEventListener('click', () => {
      policy.mode = key;
      updatePanels();
    });
    modeSelector.appendChild(btn);
  });

  modeSection.append(modeLbl, modeSelector);
  body.append(grid, modeSection, backendPanel, attachPanel);

  const hint = document.createElement('p');
  hint.className = 'match-hint';
  hint.textContent = '두 조건 모두 있으면 AND 매칭 · 하나만 있으면 해당 조건만 검사';
  body.appendChild(hint);

  card.append(header, body);
  return card;
}

function makeBackendPanel(policy) {
  const panel = document.createElement('div');
  panel.className = 'mode-panel';
  panel.style.display = policy.mode === 'backend' ? 'flex' : 'none';

  const urlRow = makeInputRow('API URL', 'http://localhost:8080', policy.backendUrl, v => {
    policy.backendUrl = v.replace(/\/$/, '');
  });

  const autoRow = document.createElement('div');
  autoRow.className = 'action-row';
  const autoLabelWrap = document.createElement('div');
  autoLabelWrap.className = 'action-label-wrap';
  const autoLbl = document.createElement('span');
  autoLbl.className = 'action-label';
  autoLbl.textContent = '자동 발신';
  const autoDesc = document.createElement('span');
  autoDesc.className = 'action-desc';
  autoDesc.textContent = '답장 작성 후 자동으로 발신';
  autoLabelWrap.append(autoLbl, autoDesc);
  const autoToggle = makeToggle(policy.autoSend, checked => { policy.autoSend = checked; });
  autoRow.append(autoLabelWrap, autoToggle);

  panel.append(urlRow, autoRow);
  return panel;
}

function makeAttachPanel(policy) {
  const panel = document.createElement('div');
  panel.className = 'mode-panel';
  panel.style.display = policy.mode === 'attachments' ? 'flex' : 'none';

  panel.appendChild(makeInputRow(
    '저장 폴더',
    'mail-check/정책명  (Downloads 기준 하위 경로)',
    policy.downloadFolder,
    v => { policy.downloadFolder = v; }
  ));
  return panel;
}

function makeToggle(checked, onChange) {
  const label = document.createElement('label');
  label.className = 'toggle-switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const track = document.createElement('span');
  track.className = 'toggle-track';
  track.innerHTML = '<span class="toggle-thumb"></span>';
  label.append(input, track);
  return label;
}

function makeInputRow(labelText, placeholder, value, onInput) {
  const row = document.createElement('div');
  row.className = 'url-row';

  const lbl = document.createElement('span');
  lbl.className = 'url-row-label';
  lbl.textContent = labelText;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'url-input';
  input.value = value || '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value.trim()));

  row.append(lbl, input);
  return row;
}

function makeKwCol(labelText, placeholder, policy, field) {
  const col = document.createElement('div');
  col.className = 'kw-col';

  const lbl = document.createElement('p');
  lbl.className = 'kw-label';
  lbl.textContent = labelText;
  col.appendChild(lbl);

  const addRow = document.createElement('div');
  addRow.className = 'add-row';

  const kwInput = document.createElement('input');
  kwInput.type = 'text';
  kwInput.className = 'kw-input';
  kwInput.placeholder = placeholder;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-kw';
  addBtn.textContent = '+';

  addRow.append(kwInput, addBtn);

  const tagList = document.createElement('div');
  tagList.className = 'tag-list';

  function renderTags() {
    tagList.innerHTML = '';
    if (!policy[field].length) {
      const empty = document.createElement('span');
      empty.className = 'tag-empty';
      empty.textContent = '없음';
      tagList.appendChild(empty);
      return;
    }
    policy[field].forEach((kw, ki) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = kw;
      const rm = document.createElement('button');
      rm.className = 'tag-remove';
      rm.textContent = '×';
      rm.addEventListener('click', () => { policy[field].splice(ki, 1); renderTags(); });
      tag.appendChild(rm);
      tagList.appendChild(tag);
    });
  }

  function addKeyword() {
    const val = kwInput.value.trim();
    if (val && !policy[field].includes(val)) {
      policy[field].push(val);
      renderTags();
    }
    kwInput.value = '';
    kwInput.focus();
  }

  addBtn.addEventListener('click', addKeyword);
  kwInput.addEventListener('keydown', e => { if (e.key === 'Enter') addKeyword(); });

  renderTags();
  col.append(addRow, tagList);
  return col;
}

document.getElementById('btnAddPolicy').addEventListener('click', () => {
  policies.push(newPolicy());
  render();
});

document.getElementById('btnSaveAll').addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({ policies });
    const msg = document.getElementById('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  } catch (e) {
    console.error('[Mail Check] 저장 실패', e);
  }
});

load();

// ── 처리 이력 관리 ────────────────────────────────────

let historyMails = [];
let historyFilter = '';

async function loadHistory() {
  const { processedMails = [] } = await chrome.storage.local.get('processedMails');
  historyMails = processedMails;
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const filtered = historyFilter
    ? historyMails.filter(m =>
        (m.title  || '').includes(historyFilter) ||
        (m.sender || '').includes(historyFilter))
    : historyMails;

  document.getElementById('historyCount').textContent = filtered.length;

  if (!filtered.length) {
    list.innerHTML = '<div class="history-empty">이력이 없습니다</div>';
    return;
  }

  list.innerHTML = [...filtered].reverse().map(m => `
    <div class="history-item">
      <div class="history-item-main">
        <div class="history-item-title">${escapeHtmlOpt(m.title || '(제목 없음)')}</div>
        <div class="history-item-meta">${escapeHtmlOpt(m.sender || '')} · ${formatTimeOpt(m.time)} · ${escapeHtmlOpt(m.status || '')}</div>
      </div>
      <button class="btn-del-history" data-time="${m.time}" title="삭제 (재감지 가능하게 초기화)">×</button>
    </div>
  `).join('');
}

// processedMails에서 제거 + seenIds에서도 제목을 제거해 다음 폴링에서 재감지되게 한다.
async function deleteHistoryEntry(time) {
  const { processedMails = [], seenIds = [] } = await chrome.storage.local.get(['processedMails', 'seenIds']);
  const entry = processedMails.find(m => m.time === time);
  const updated = processedMails.filter(m => m.time !== time);
  await chrome.storage.local.set({ processedMails: updated });
  if (entry?.title) {
    const seenSet = new Set(seenIds);
    seenSet.delete(entry.title);
    await chrome.storage.local.set({ seenIds: [...seenSet] });
  }
  historyMails = updated;
  renderHistory();
}

document.getElementById('historySearch').addEventListener('input', (e) => {
  historyFilter = e.target.value.trim();
  renderHistory();
});

document.getElementById('historyList').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-del-history');
  if (!btn) return;
  deleteHistoryEntry(btn.dataset.time);
});

document.getElementById('btnClearHistory').addEventListener('click', async () => {
  await chrome.storage.local.set({ processedMails: [], seenIds: [] });
  historyMails = [];
  renderHistory();
});

// 팝업 등 다른 곳에서 이력이 바뀌면 같이 갱신
chrome.storage.onChanged.addListener((changes) => {
  if (changes.processedMails) {
    historyMails = changes.processedMails.newValue || [];
    renderHistory();
  }
});

function escapeHtmlOpt(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatTimeOpt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

loadHistory();
