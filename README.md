# Mail Check — 사내 웹 메일 자동화 Chrome 확장

사내 인트라넷 웹 메일에서 수신 메일을 탐지하고, 본문·첨부파일을 수집한 뒤 로컬 백엔드와 연동해 자동 회신 초안을 작성하는 프로젝트.

---

## 현재 구현 상태

| 기능 | 상태 |
|------|------|
| 메일 수신 목록 읽기 | ✅ 완료 |
| 메일 본문 읽기 | ✅ 완료 |
| 첨부파일 목록 확인 | ✅ 완료 |
| 첨부파일 모두 저장 | ✅ 완료 |
| 키워드 기반 새 메일 자동 감지 | 🔜 예정 |
| 로컬 백엔드 연동 | 🔜 예정 |
| 회신 초안 자동 입력 | 🔜 예정 |

---

## 프로젝트 구조

```
mail-check/
├── extension/
│   ├── manifest.json       # Manifest V3 설정
│   ├── background.js       # Service Worker (향후 폴링·다운로드 추적)
│   ├── content.js          # DOM 파싱·조작 (메인 로직)
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   └── options/
│       └── options.html    # 키워드·설정 UI (구현 예정)
└── README.md
```

---

## 설치 방법

1. Chrome에서 `chrome://extensions/` → **개발자 모드** 켜기
2. **압축 해제된 확장 프로그램 로드** → `extension/` 폴더 선택
3. 사내 인트라넷 메일 페이지 열기
4. 브라우저 툴바의 **Mail Check** 아이콘 클릭

코드 변경 후에는 `chrome://extensions/`에서 **새로고침(↺)** → 메일 페이지 탭도 새로고침.

---

## 현재 DOM 선택자 설정 (`content.js` > `CONFIG`)

사내 그룹웨어 DOM에 맞게 설정된 값. 그룹웨어가 바뀌면 여기를 수정.

```js
// 메일 목록
listContainerSelector: '#DEFAULT_scroll-list'
rowSelector: ':scope > div'
rowTitleSelector: '.cell.col-03 .inner-cell.col03-01 a'

// 메일 상세 본문
mailDetailContainer: '#DEFAULT_scroll-detail'
mailSubject:  '#DEFAULT_scroll-detail > section > div > div.header-area > div.title-area > div.inner-left > h1 > span'
mailDate:     '[data-date], .date, .time, .mail-date'
mailBody:     '#DEFAULT_scroll-detail > section > div > div.contents-body-area > div.read-content-container > div:nth-child(1) > div'

// 첨부파일
attachmentContainer:  '#DEFAULT_scroll-detail > section > div > div.contents-body-area > div.attachment-file'
attachmentItem:       'div.attachment-body > div > div > ul > li'
attachmentNameSelector: 'div.file-group > div.file-name.pointer > span > span > span'
attachmentSaveAllBtn: 'div.attachment-header > div > div:nth-child(1) > div.attach-btns > button'
```

### 선택자 찾는 방법
1. 메일 페이지에서 `F12` → 개발자 도구
2. 상단 커서 아이콘으로 원하는 요소 클릭
3. Elements 패널에서 해당 노드 우클릭 → **Copy → Copy selector**

> **iframe 주의**: 이 그룹웨어는 메일 목록/본문이 iframe 안에 렌더링됨.  
> `manifest.json`에 `"all_frames": true` 설정으로 해결함.  
> DevTools에서 선택자를 복사할 때 콘솔 컨텍스트가 iframe으로 선택되어 있어야 `document.querySelector()`가 동작함.

---

## 메시지 인터페이스 (popup ↔ content script)

`chrome.tabs.sendMessage`로 통신. content script는 해당 프레임에 컨테이너가 없으면 응답하지 않음(다른 frame에 위임).

| action | 요청 | 응답 |
|--------|------|------|
| `GET_MAIL_LIST` | `{ action }` | `{ success, rowCount, rows: [{ index, title }] }` |
| `GET_MAIL_CONTENT` | `{ action }` | `{ success, content: { subject, from, date, body, attachments: string[] } }` |
| `SAVE_ALL_ATTACHMENTS` | `{ action }` | `{ success }` |

---

## 향후 자동화 흐름 (구현 예정)

```
chrome.alarms — 1분 간격 폴링
  ↓
background.js: 저장된 tabId로 GET_MAIL_LIST 요청
  ↓
chrome.storage에 저장된 seenIds와 비교 → 신규 메일 필터
  ↓ 키워드 매칭 시
content.js OPEN_MAIL: 해당 메일 행 클릭
  ↓
content.js GET_MAIL_CONTENT: 제목·본문·첨부파일명 수집
  ↓
content.js SAVE_ALL_ATTACHMENTS: 모두 저장 버튼 클릭
  ↓
background.js chrome.downloads.onChanged: 다운로드 완료 대기 → 파일 경로 수집
  ↓
POST http://localhost:{PORT}/analyze
  ↓
content.js FILL_REPLY: 백엔드 응답을 회신 창에 자동 입력
```

### 백엔드 연동 스펙 (예정)

백엔드가 구현해야 할 엔드포인트:

```
POST http://localhost:{PORT}/analyze
Content-Type: application/json

{
  "subject": "메일 제목",
  "body": "메일 본문 텍스트",
  "attachmentPaths": [
    "/Users/hoon/Downloads/파일명1.xlsx",
    "/Users/hoon/Downloads/파일명2.pdf"
  ]
}
```

응답:

```json
{
  "replyText": "회신 본문으로 입력할 텍스트"
}
```

> CORS: 확장 프로그램에서 localhost로 fetch 시 백엔드에서 `Access-Control-Allow-Origin: *` 헤더 필요.

### 추가로 필요한 선택자 (회신 기능 구현 전 확인 필요)
- 회신 버튼 selector
- 회신 텍스트 에디터(입력창) selector

---

## 권한 목록

현재:

| 권한 | 용도 |
|------|------|
| `activeTab` | 현재 탭 접근 |
| `scripting` | 스크립트 주입 |
| `<all_urls>` | 모든 URL에서 content script 실행 |

자동화 구현 시 추가 예정:

| 권한 | 용도 |
|------|------|
| `alarms` | 1분 주기 폴링 |
| `storage` | 키워드·설정·처리된 메일 ID 저장 |
| `downloads` | 다운로드 경로 추적 |

> 사내 메일 URL로 `matches`를 제한하면 불필요한 권한 범위를 줄일 수 있음.  
> 예: `"matches": ["https://mail.your-company.com/*"]`

---

## 보안 고려사항

- 메일 본문과 첨부파일은 **로컬(브라우저·localhost)**에서만 처리
- 외부 인터넷으로 메일 내용이 전송되지 않음
- 회사 정책에 따라 확장 프로그램 사용 가능 여부 사전 확인 필요
