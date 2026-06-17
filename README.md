# Mail Check — 사내 웹 메일 자동화 Chrome 확장

사내 인트라넷 웹 메일에서 특정 키워드의 수신 메일을 자동 감지하고, 본문·첨부파일을 수집한 뒤 로컬 백엔드로 처리 후 회신 초안을 자동 입력하는 범용 메일 자동화 도구.

> **중요**: 이 확장의 목적은 **메일 감지 및 회신 자동화**이며, 특정 업무(방화벽 정책 검증 등)에 종속되지 않는다.  
> 백엔드(`localhost`)는 교체·추가 가능한 외부 컴포넌트이고, 확장은 메일 수집·전달·회신 입력에만 집중한다.

---

## 아키텍처 개요

```
[사내 인트라넷 메일]
        ↓ (DOM 파싱)
[Chrome 확장 — mail-check]
  · 메일 목록 폴링 (1분 간격)
  · 키워드 필터
  · 본문·첨부파일 수집
  · 첨부파일 로컬 저장
        ↓ (HTTP POST to localhost)
[로컬 백엔드 — 업무별 처리 서버]
  · 현재: validate-policy (방화벽 정책 검증)
  · 향후: 다른 업무용 백엔드 교체·추가 가능
        ↓ (replyText 반환)
[Chrome 확장]
  · 회신 창에 초안 자동 입력
```

백엔드 인터페이스는 단순하게 유지한다. 확장이 수집한 데이터(제목, 본문, 파일 경로)를 POST로 보내면, 백엔드는 `replyText`를 반환한다. 어떤 서비스든 이 계약만 맞추면 연동 가능하다.

---

## 현재 구현 상태

| 기능 | 상태 |
|------|------|
| 메일 수신 목록 읽기 | ✅ 완료 |
| 메일 본문 읽기 | ✅ 완료 |
| 첨부파일 목록 확인 | ✅ 완료 |
| 첨부파일 모두 저장 | ✅ 완료 |
| 키워드 기반 새 메일 자동 감지 (폴링) | 🔜 예정 |
| 로컬 백엔드 연동 (`/analyze` 호출) | 🔜 예정 |
| 회신 초안 자동 입력 | 🔜 예정 |
| Options UI (키워드·백엔드 설정) | 🔜 예정 |

---

## UI 개선 필요사항

현재 팝업은 "수신 목록 가져오기 / 현재 메일 내용 가져오기" 버튼 두 개로만 구성된 수동 조회 UI이다.  
범용 자동화 도구에 맞게 아래 방향으로 개선이 필요하다.

### Popup
- [ ] **모니터링 ON/OFF 토글**: 자동 감지를 켜고 끄는 메인 컨트롤
- [ ] **상태 표시**: 마지막 폴링 시각, 마지막 처리된 메일 제목
- [ ] **최근 처리 내역**: 자동으로 처리된 메일 목록 (제목, 처리 시각, 결과 요약)
- [ ] **수동 트리거 버튼**: "지금 확인" — 1분 대기 없이 즉시 폴링 실행
- [ ] 현재의 "수신 목록 / 메일 내용 가져오기" 버튼은 디버그용으로 접기 처리

### Options 페이지 (미구현)
- [ ] **감지 키워드**: 쉼표 구분 입력 (예: `정책검증, 방화벽`)
- [ ] **백엔드 URL**: 기본값 `http://localhost:5009/analyze`
- [ ] **파일 역할 매핑 규칙**: 파일명 키워드 → running/candidate/target 매핑 설정
- [ ] **폴링 간격**: 기본 1분, 변경 가능
- [ ] **알림 설정**: 새 메일 감지 시 브라우저 알림 여부

---

## 범용 백엔드 인터페이스

백엔드가 어떤 서비스든 아래 계약을 구현하면 연동된다.

### 요청
```
POST {backendUrl}
Content-Type: application/json

{
  "subject": "메일 제목",
  "body": "메일 본문 텍스트",
  "attachmentPaths": [
    "/Users/hoon/Downloads/파일명1.xlsx"
  ],
  "metadata": {           // 백엔드별 추가 파라미터 (선택)
    "vendor": "Paloalto",
    "running_path": "...",
    "candidate_path": "..."
  }
}
```

### 응답
```json
{
  "success": true,
  "replyText": "회신 창에 입력될 텍스트",
  "summary": { }          // 선택: 팝업 상태 표시용
}
```

---

## 현재 연동 백엔드: validate-policy

방화벽 정책 검증 목적으로 구현된 Flask 서버. 이 확장과 함께 사용하는 첫 번째 백엔드 사례.

- 저장소: `validate-policy/`
- 포트: `5009`
- 엔드포인트: `POST /analyze`

```json
// 요청 예시
{
  "vendor": "Paloalto",
  "running_path": "/Users/hoon/Downloads/running.xlsx",
  "candidate_path": "/Users/hoon/Downloads/candidate.xlsx",
  "target_paths": ["/Users/hoon/Downloads/target.xlsx"]
}

// 응답 예시
{
  "success": true,
  "replyText": "방화벽 정책 검증 결과를 안내드립니다.\n...",
  "summary": { "deleted": 3, "disabled": 4, "not_disabled": 1, ... }
}
```

> **파일 역할 매핑**: 다운로드된 파일 중 어떤 게 running/candidate/target인지 파일명 키워드 또는 options 설정으로 결정. (미구현)

---

## 자동화 흐름 (구현 예정)

```
chrome.alarms — 1분 간격
  ↓
background.js: 저장된 tabId로 GET_MAIL_LIST
  ↓
chrome.storage의 seenIds와 비교 → 신규 메일만 필터
  ↓ 키워드 매칭 시
OPEN_MAIL: 해당 메일 행 클릭 → 2초 대기
  ↓
GET_MAIL_CONTENT: 제목·본문·첨부파일명 수집
  ↓
SAVE_ALL_ATTACHMENTS: 모두 저장 버튼 클릭
  ↓
chrome.downloads.onChanged: 완료 대기 → 파일 경로 수집
  ↓
POST {backendUrl}: 메일 데이터 + 파일 경로 전달
  ↓
FILL_REPLY: 응답의 replyText를 회신 창에 자동 입력
```

### 회신 기능 구현 전 확인 필요 (DevTools에서 selector 복사)
- 회신 버튼 selector
- 회신 텍스트 에디터 selector

---

## 프로젝트 구조

```
mail-check/
├── extension/
│   ├── manifest.json       # Manifest V3 (alarms·storage·downloads 권한 추가 예정)
│   ├── background.js       # Service Worker — 폴링·다운로드 추적·백엔드 호출 (미구현)
│   ├── content.js          # DOM 파싱·조작 (메인 로직)
│   ├── popup/
│   │   ├── popup.html      # 현재: 수동 조회 UI → 모니터링 대시보드로 개선 예정
│   │   ├── popup.js
│   │   └── popup.css
│   └── options/
│       └── options.html    # 키워드·백엔드 URL·파일 매핑 설정 (미구현)
└── README.md
```

---

## 설치 방법

1. Chrome에서 `chrome://extensions/` → **개발자 모드** 켜기
2. **압축 해제된 확장 프로그램 로드** → `extension/` 폴더 선택
3. 사내 인트라넷 메일 페이지 열기
4. 브라우저 툴바의 **Mail Check** 아이콘 클릭

코드 변경 후: `chrome://extensions/`에서 **새로고침(↺)** → 메일 페이지 탭도 새로고침.

---

## DOM 선택자 설정 (`content.js` > `CONFIG`)

사내 그룹웨어 DOM에 맞게 설정된 값. 그룹웨어가 바뀌면 여기를 수정.

```js
// 메일 목록
listContainerSelector: '#DEFAULT_scroll-list'
rowSelector: ':scope > div'
rowTitleSelector: '.cell.col-03 .inner-cell.col03-01 a'

// 메일 상세 본문
mailDetailContainer: '#DEFAULT_scroll-detail'
mailSubject:  '#DEFAULT_scroll-detail > section > div > div.header-area > ...'
mailDate:     '[data-date], .date, .time, .mail-date'
mailBody:     '#DEFAULT_scroll-detail > section > div > div.contents-body-area > ...'

// 첨부파일
attachmentContainer:  '... > div.attachment-file'
attachmentItem:       'div.attachment-body > div > div > ul > li'
attachmentSaveAllBtn: 'div.attachment-header > ... > button'
```

> **iframe 주의**: 메일 목록/본문이 iframe 안에 렌더링됨. `manifest.json`에 `"all_frames": true`로 해결.  
> DevTools 콘솔에서 선택자 테스트 시 컨텍스트 드롭다운을 iframe으로 전환해야 함.

---

## 메시지 인터페이스

| action | 응답 |
|--------|------|
| `GET_MAIL_LIST` | `{ success, rowCount, rows: [{ index, title }] }` |
| `GET_MAIL_CONTENT` | `{ success, content: { subject, from, date, body, attachments[] } }` |
| `SAVE_ALL_ATTACHMENTS` | `{ success }` |
| `OPEN_MAIL` (예정) | `{ success }` |
| `FILL_REPLY` (예정) | `{ success }` |

---

## 보안 고려사항

- 메일 본문·첨부파일은 **로컬(브라우저·localhost)**에서만 처리
- 외부 인터넷으로 메일 내용이 전송되지 않음
- 회사 정책에 따라 확장 프로그램 사용 가능 여부 사전 확인 필요
