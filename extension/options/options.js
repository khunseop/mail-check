let policies = [];
let nextId = 1;

async function load() {
  try {
    const { policies: saved = [] } = await chrome.storage.local.get('policies');
    if (saved.length) {
      policies = saved.map(p => ({ ...p, keywords: [...(p.keywords || [])] }));
      nextId = Math.max(...policies.map(p => p.id), 0) + 1;
    } else {
      policies = [{ id: nextId++, name: '정책 1', keywords: [], enabled: true }];
    }
  } catch (e) {
    console.error('[Mail Check] 설정 로드 실패', e);
    policies = [{ id: nextId++, name: '정책 1', keywords: [], enabled: true }];
  }
  render();
}

function render() {
  const list = document.getElementById('policyList');
  list.innerHTML = '';
  policies.forEach((p, pi) => list.appendChild(buildCard(p, pi)));
}

function buildCard(policy, pi) {
  const card = document.createElement('div');
  card.className = 'policy-card' + (policy.enabled ? '' : ' disabled');
  card.dataset.id = policy.id;

  // 헤더
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

  // 토글
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle-switch';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = policy.enabled;
  toggleInput.addEventListener('change', () => {
    policy.enabled = toggleInput.checked;
    card.classList.toggle('disabled', !policy.enabled);
  });
  const track = document.createElement('span');
  track.className = 'toggle-track';
  track.innerHTML = '<span class="toggle-thumb"></span>';
  toggleLabel.append(toggleInput, track);

  // 삭제 버튼
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-del-policy';
  delBtn.textContent = '×';
  delBtn.title = '정책 삭제';
  delBtn.addEventListener('click', () => {
    if (policies.length === 1) return;
    policies.splice(policies.indexOf(policy), 1);
    render();
  });

  header.append(num, nameInput, toggleLabel, delBtn);

  // 바디 (키워드)
  const body = document.createElement('div');
  body.className = 'policy-body';

  const hint = document.createElement('p');
  hint.className = 'keyword-hint';
  hint.textContent = '메일 제목에 포함된 키워드 중 하나라도 일치하면 감지합니다.';

  const addRow = document.createElement('div');
  addRow.className = 'add-row';

  const kwInput = document.createElement('input');
  kwInput.type = 'text';
  kwInput.className = 'kw-input';
  kwInput.placeholder = '키워드 입력 후 추가 (Enter)';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-kw';
  addBtn.textContent = '추가';

  addRow.append(kwInput, addBtn);

  const tagList = document.createElement('div');
  tagList.className = 'tag-list';

  function renderTags() {
    tagList.innerHTML = '';
    if (!policy.keywords.length) {
      const empty = document.createElement('span');
      empty.className = 'tag-empty';
      empty.textContent = '키워드 없음';
      tagList.appendChild(empty);
      return;
    }
    policy.keywords.forEach((kw, ki) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = kw;
      const rm = document.createElement('button');
      rm.className = 'tag-remove';
      rm.textContent = '×';
      rm.addEventListener('click', () => { policy.keywords.splice(ki, 1); renderTags(); });
      tag.appendChild(rm);
      tagList.appendChild(tag);
    });
  }

  function addKeyword() {
    const val = kwInput.value.trim();
    if (val && !policy.keywords.includes(val)) {
      policy.keywords.push(val);
      renderTags();
    }
    kwInput.value = '';
    kwInput.focus();
  }

  addBtn.addEventListener('click', addKeyword);
  kwInput.addEventListener('keydown', e => { if (e.key === 'Enter') addKeyword(); });

  renderTags();
  body.append(hint, addRow, tagList);
  card.append(header, body);
  return card;
}

document.getElementById('btnAddPolicy').addEventListener('click', () => {
  const num = policies.length + 1;
  policies.push({ id: nextId++, name: `정책 ${num}`, keywords: [], enabled: true });
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
