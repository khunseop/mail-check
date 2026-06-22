let policies = [];
let nextId = 1;

async function load() {
  try {
    const { policies: saved = [] } = await chrome.storage.local.get('policies');
    if (saved.length) {
      policies = saved.map(p => ({
        ...p,
        subjectKeywords:  p.subjectKeywords ?? p.keywords ?? [],
        senderKeywords:   p.senderKeywords  ?? [],
        autoSend:         p.autoSend         ?? false,
        useBackend:       p.useBackend       ?? false,
        backendUrl:       p.backendUrl       ?? '',
        saveAttachments:  p.saveAttachments  ?? false,
        downloadFolder:   p.downloadFolder   ?? '',
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
    autoSend: false,
    useBackend: false,
    backendUrl: '',
    saveAttachments: false,
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

  // 자동발신 토글
  const autoSendWrap = document.createElement('div');
  autoSendWrap.className = 'autosend-wrap' + (policy.autoSend ? ' on' : '');

  const autoSendLabel = document.createElement('span');
  autoSendLabel.className = 'autosend-label';
  autoSendLabel.textContent = '자동발신';

  const autoSendToggle = makeToggle(policy.autoSend, (checked) => {
    policy.autoSend = checked;
    autoSendWrap.classList.toggle('on', checked);
  });
  autoSendWrap.append(autoSendLabel, autoSendToggle);

  // 활성화 토글
  const enableToggle = makeToggle(policy.enabled, (checked) => {
    policy.enabled = checked;
    card.classList.toggle('disabled', !checked);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-del-policy';
  delBtn.textContent = '×';
  delBtn.title = '정책 삭제';
  delBtn.addEventListener('click', () => {
    if (policies.length === 1) return;
    policies.splice(policies.indexOf(policy), 1);
    render();
  });

  header.append(num, nameInput, autoSendWrap, enableToggle, delBtn);

  // ── 바디 ──
  const body = document.createElement('div');
  body.className = 'policy-body';

  // 2열 키워드 그리드
  const grid = document.createElement('div');
  grid.className = 'kw-grid';
  grid.appendChild(makeKwCol('제목 키워드', '제목 포함 단어', policy, 'subjectKeywords'));
  grid.appendChild(makeKwCol('발신자 키워드', '발신자 이름/이메일', policy, 'senderKeywords'));
  body.appendChild(grid);

  // 동작 설정 행들
  body.appendChild(makeActionRow(
    '백엔드 처리',
    '감지된 메일을 백엔드 API로 가공',
    policy, 'useBackend',
    () => {
      backendUrlRow.style.display = policy.useBackend ? 'flex' : 'none';
    }
  ));

  const backendUrlRow = makeInputRow('API URL', 'http://localhost:8080', policy.backendUrl, v => { policy.backendUrl = v.replace(/\/$/, ''); });
  backendUrlRow.style.display = policy.useBackend ? 'flex' : 'none';
  body.appendChild(backendUrlRow);

  body.appendChild(makeActionRow(
    '첨부파일 자동저장',
    '감지 시 첨부파일을 자동으로 다운로드',
    policy, 'saveAttachments',
    () => {
      folderRow.style.display = policy.saveAttachments ? 'flex' : 'none';
    }
  ));

  const folderRow = makeInputRow('저장 폴더', 'mail-check/정책명  (Downloads 기준 하위 경로)', policy.downloadFolder, v => { policy.downloadFolder = v; });
  folderRow.style.display = policy.saveAttachments ? 'flex' : 'none';
  body.appendChild(folderRow);

  const hint = document.createElement('p');
  hint.className = 'match-hint';
  hint.textContent = '두 조건 모두 있으면 AND 매칭 · 하나만 있으면 해당 조건만 검사';
  body.appendChild(hint);

  card.append(header, body);
  return card;
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

function makeActionRow(labelText, descText, policy, field, onChange) {
  const row = document.createElement('div');
  row.className = 'action-row';

  const labelWrap = document.createElement('div');
  labelWrap.className = 'action-label-wrap';

  const lbl = document.createElement('span');
  lbl.className = 'action-label';
  lbl.textContent = labelText;

  const desc = document.createElement('span');
  desc.className = 'action-desc';
  desc.textContent = descText;

  labelWrap.append(lbl, desc);

  const toggle = makeToggle(policy[field], (checked) => {
    policy[field] = checked;
    if (onChange) onChange(checked);
  });

  row.append(labelWrap, toggle);
  return row;
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
