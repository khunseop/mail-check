let policies = [];
let nextId = 1;

async function load() {
  try {
    const { policies: saved = [], autoSend = false, backendUrl = '' } =
      await chrome.storage.local.get(['policies', 'autoSend', 'backendUrl']);
    document.getElementById('autoSendToggle').checked = autoSend;
    document.getElementById('backendUrl').value = backendUrl;
    if (saved.length) {
      policies = saved.map(p => ({
        ...p,
        // 구 schema(keywords) → 새 schema 마이그레이션
        subjectKeywords: p.subjectKeywords ?? p.keywords ?? [],
        senderKeywords:  p.senderKeywords  ?? [],
      }));
      nextId = Math.max(...policies.map(p => p.id), 0) + 1;
    } else {
      policies = [{ id: nextId++, name: '정책 1', subjectKeywords: [], senderKeywords: [], enabled: true }];
    }
  } catch (e) {
    console.error('[Mail Check] 설정 로드 실패', e);
    policies = [{ id: nextId++, name: '정책 1', subjectKeywords: [], senderKeywords: [], enabled: true }];
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

  // ── 바디: 제목 키워드 + 발신자 키워드 ──
  const body = document.createElement('div');
  body.className = 'policy-body';

  body.appendChild(makeKeywordSection(
    '제목 키워드',
    '메일 제목에 포함된 단어를 입력하세요.',
    policy,
    'subjectKeywords'
  ));

  const divider = document.createElement('div');
  divider.className = 'kw-divider';
  body.appendChild(divider);

  body.appendChild(makeKeywordSection(
    '발신자 키워드',
    '발신자 이름 또는 이메일 일부를 입력하세요.',
    policy,
    'senderKeywords'
  ));

  const hint = document.createElement('p');
  hint.className = 'match-hint';
  hint.textContent = '두 조건이 모두 있으면 AND 매칭 (하나만 있으면 해당 조건만 검사)';
  body.appendChild(hint);

  card.append(header, body);
  return card;
}

function makeKeywordSection(label, placeholder, policy, field) {
  const section = document.createElement('div');
  section.className = 'kw-section';

  const lbl = document.createElement('p');
  lbl.className = 'kw-label';
  lbl.textContent = label;
  section.appendChild(lbl);

  const addRow = document.createElement('div');
  addRow.className = 'add-row';

  const kwInput = document.createElement('input');
  kwInput.type = 'text';
  kwInput.className = 'kw-input';
  kwInput.placeholder = placeholder;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-kw';
  addBtn.textContent = '추가';

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
  section.append(addRow, tagList);
  return section;
}

document.getElementById('btnAddPolicy').addEventListener('click', () => {
  const num = policies.length + 1;
  policies.push({ id: nextId++, name: `정책 ${num}`, subjectKeywords: [], senderKeywords: [], enabled: true });
  render();
});

document.getElementById('btnSaveAll').addEventListener('click', async () => {
  try {
    const autoSend  = document.getElementById('autoSendToggle').checked;
    const backendUrl = document.getElementById('backendUrl').value.trim().replace(/\/$/, '');
    await chrome.storage.local.set({ policies, autoSend, backendUrl });
    const msg = document.getElementById('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  } catch (e) {
    console.error('[Mail Check] 저장 실패', e);
  }
});

load();
