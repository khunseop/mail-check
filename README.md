# Mail Check — 사내 웹 메일 자동화 Chrome 확장

사내 인트라넷 웹 메일에서 정책(키워드)에 매칭되는 수신 메일을 자동 감지하고, 본문·첨부파일을 수집해 로컬 백엔드로 전달한 뒤 응답받은 텍스트로 회신 초안을 자동 입력(옵션에 따라 자동 발신까지)하는 범용 메일 자동화 도구.

> **중요**: 이 확장의 목적은 **메일 감지 및 회신 자동화**이며, 특정 업무에 종속되지 않는다.
> 백엔드(`localhost`)는 교체·추가 가능한 외부 컴포넌트이고, 확장은 메일 수집·전달·회신 입력에만 집중한다.

---

## 아키텍처 개요

```
[사내 인트라넷 메일]
        ↓ (DOM 파싱, content.js)
[Chrome 확장 — mail-check]
  · 메일 목록 폴링 (1분 간격, chrome.alarms)
  · 정책별 제목/발신자 키워드 매칭
  · 메일 열기 → 본문 읽기
  · 첨부파일 개별 다운로드 (지정 폴더로 저장)
        ↓ (HTTP POST to backendUrl/analyze)
[로컬 백엔드 — 업무별 처리 서버] (직접 구현 필요, 현재 미구현)
  · 첨부파일 파싱, 판단 로직 등 업무 처리
        ↓ (replyText 반환)
[Chrome 확장]
  · 전체답장 창 열기 → replyText 입력
  · (정책 옵션) 자동 발신
```

백엔드 인터페이스는 단순하게 유지한다. 확장이 수집한 데이터(제목, 본문, 첨부파일명, 다운로드 폴더)를 POST로 보내면, 백엔드는 `replyText`를 반환한다. 이 계약(`backend/API.md` 참고)만 맞추면 어떤 서비스든 연동 가능하다.

---

## 현재 구현 상태

**확장 프로그램은 감지 → 처리 → 회신까지 전체 파이프라인이 구현되어 있다.** 남은 건 계약(`backend/API.md`)에 맞는 백엔드 서버 구현뿐이다.

| 기능 | 상태 |
|------|------|
| 메일 수신 목록 읽기 | ✅ 완료 |
| 메일 본문 읽기 | ✅ 완료 |
| 첨부파일 목록 확인 | ✅ 완료 |
| 첨부파일 모두 저장 / 개별 다운로드(폴더 지정) | ✅ 완료 |
| 정책 기반 새 메일 자동 감지 (1분 폴링) | ✅ 완료 |
| 정책별 동작 모드(감지만 / 백엔드 처리 / 첨부파일 저장) | ✅ 완료 |
| 로컬 백엔드 연동 (`POST {backendUrl}/analyze`) | ✅ 완료 (확장 측) |
| 회신 초안 자동 입력 (전체답장 → 텍스트 삽입) | ✅ 완료 |
| 자동 발신 (정책별 옵션) | ✅ 완료 |
| Popup — 모니터링 ON/OFF, 상태 표시, 처리 내역 피드, 지금 확인 | ✅ 완료 |
| Options — 정책별 키워드/모드/백엔드URL/저장폴더/자동발신 설정 | ✅ 완료 |
| **실제 백엔드 서버 구현** | 🔜 미구현 (스캐폴드 제거됨, `backend/API.md` 스펙만 존재) |

---

## Popup

- **모니터링 ON/OFF 토글**: 자동 감지를 켜고 끄는 메인 컨트롤
- **상태 표시**: 마지막 폴링 시각, 마지막 감지된 메일 제목
- **처리 내역 피드**: 자동 처리된 메일 목록(제목, 발신자, 처리 시각, 상태 배지, 정책명, 첨부 저장 여부, 본문 미리보기)
- **지금 확인 버튼**: 1분 대기 없이 즉시 폴링 실행
- **디버그 도구** (접기 섹션): 수신 목록/메일 내용 조회, 첨부 URL 확인, 전체답장 열기, 답장 입력 테스트

## Options 페이지

정책을 여러 개 등록해 각각 독립적으로 설정한다.

- **정책 이름**, **활성화 토글**
- **감지 키워드**: 제목 키워드 / 발신자 키워드 (각각 태그 형태로 추가/삭제, 둘 다 있으면 AND, 하나만 있으면 해당 조건만 검사)
- **동작 모드**: `감지만` / `백엔드 처리` / `첨부파일 저장` 중 선택
  - **백엔드 처리**: API URL, 자동 발신 여부 설정
  - **첨부파일 저장**: 저장 폴더(Downloads 기준 하위 경로) 설정

---

## 범용 백엔드 인터페이스

자세한 스펙은 [`backend/API.md`](backend/API.md) 참고. 요약:

### 요청
```
POST {backendUrl}/analyze
Content-Type: application/json

{
  "subject": "메일 제목",
  "body": "메일 본문 텍스트 (최대 3000자)",
  "attachments": ["파일명1.xlsx", "파일명2.pdf"],
  "downloadFolder": "mail-check"
}
```

첨부파일은 `POST /analyze` 호출 시점에 이미 `~/Downloads/{downloadFolder}/{파일명}`에 저장되어 있다.

### 응답
```json
{
  "replyText": "회신 창에 입력될 텍스트"
}
```
`replyText`가 빈 문자열이면 회신 입력을 생략한다. `2xx` 이외 응답이면 회신 입력을 건너뛴다.

> **현재 연동 백엔드 없음**: 이전에 있었던 방화벽 정책 검증용 백엔드(`validate-policy`) 및 FastAPI 스캐폴드는 제거되었다. `backend/API.md` 스펙에 맞춰 새로 구현해야 한다.

---

## 자동화 흐름 (구현 완료)

```
chrome.alarms — 1분 간격 (pollMail)
  ↓
background.js: 저장된 mailTabId로 GET_MAIL_LIST 전송
  ↓
seenIds와 비교 → 신규(미개봉) 메일만 필터
  ↓ 활성 정책의 제목/발신자 키워드 매칭 시 큐에 추가
processQueue(): 큐에서 하나씩 순차 처리
  ↓
OPEN_MAIL: 해당 메일 행 클릭 → 2.5초 대기
  ↓
GET_MAIL_CONTENT: 제목·본문·첨부파일명 수집
  ↓ (모드가 backend 또는 attachments이고 첨부파일 있으면)
CLICK_ATTACHMENT_DOWNLOAD × N: 개별 다운로드 버튼 순차 클릭
  ↓ onDeterminingFilename으로 지정 폴더에 저장
POST {backendUrl}/analyze: 메일 데이터 + 첨부파일명 + 다운로드 폴더 전달 (backend 모드만)
  ↓
REPLY_ALL: 전체답장 버튼 클릭 → compose 창(iframe) 탐색
  ↓
FILL_REPLY: 응답의 replyText를 답장 창에 자동 입력
  ↓ (autoSend 옵션 시)
SEND_REPLY: 발신 버튼 클릭
```

---

## 프로젝트 구조

```
mail-check/
├── backend/
│   └── API.md              # 백엔드 개발 가이드 (구현체는 별도로 준비 필요)
├── extension/
│   ├── manifest.json        # Manifest V3
│   ├── background.js        # Service Worker — 폴링·큐 처리·다운로드 추적·백엔드 호출·회신 입력/발신
│   ├── content.js            # DOM 파싱·조작 (메인 로직)
│   ├── popup/
│   │   ├── popup.html        # 모니터링 대시보드 + 디버그 도구
│   │   ├── popup.js
│   │   └── popup.css
│   └── options/
│       ├── options.html      # 정책 관리 UI
│       └── options.js
└── README.md
```

---

## 설치 방법

1. Chrome에서 `chrome://extensions/` → **개발자 모드** 켜기
2. **압축 해제된 확장 프로그램 로드** → `extension/` 폴더 선택
3. 사내 인트라넷 메일 페이지 열기 (목록 컨테이너가 있는 페이지가 자동으로 `mailTabId`로 등록됨)
4. 옵션 페이지에서 감지 정책(키워드·동작 모드) 설정
5. 브라우저 툴바의 **Mail Check** 아이콘에서 모니터링 토글 ON

코드 변경 후: `chrome://extensions/`에서 **새로고침(↺)** → 메일 페이지 탭도 새로고침.

---

## DOM 선택자 설정 (`content.js` > `CONFIG`)

사내 그룹웨어 DOM에 맞게 설정된 값. 그룹웨어가 바뀌면 여기를 수정.

```js
// 메일 목록
listContainerSelector: '#DEFAULT_scroll-list'
rowSelector: ':scope > div'
rowTitleSelector: '.cell.col-03 .inner-cell.col03-01 a'
rowSenderSelector: 'div.tbl-row > div.cell.col-03 > div > div.inner-cell.col03-02 > div > a > span'

// 메일 상세 본문
mailDetailContainer: '#DEFAULT_scroll-detail'
mailSubject:  '#DEFAULT_scroll-detail > section > div > div.header-area > ...'
mailFrom:     '[data-from], .from, .sender, .mail-from, .author'
mailDate:     '[data-date], .date, .time, .mail-date'
mailBody:     '#DEFAULT_scroll-detail > section > div > div.contents-body-area > ...'

// 답장
replyAllBtn:      '#DEFAULT_scroll-detail > section > div > div.header-area > ... > button'
composeContainer: '#cafe-note-contents'
replyInsertPoint: '#cafe-note-contents > p:nth-child(2)'

// 첨부파일
attachmentContainer:        '... > div.attachment-file'
attachmentItem:              'div.attachment-body > div > div > ul > li'
attachmentNameSelector:      'div.file-group > div.file-name.pointer > span > span > span'
attachmentSaveAllBtn:        'div.attachment-header > ... > button'
attachmentSingleDownloadBtn: 'div.btn-group > div > div > button:nth-child(2)'
```

> **iframe 주의**: 메일 목록/본문/답장 창이 iframe 안에 렌더링됨. `manifest.json`에 `"all_frames": true`로 해결.
> DevTools 콘솔에서 선택자 테스트 시 컨텍스트 드롭다운을 iframe으로 전환해야 함.

---

## 메시지 인터페이스 (`content.js` ↔ `background.js`/`popup.js`)

| action | 응답 |
|--------|------|
| `GET_MAIL_LIST` | `{ success, rowCount, rows: [{ index, title, sender, unread }] }` |
| `GET_MAIL_CONTENT` | `{ success, content: { subject, from, date, body, attachments[] } }` |
| `OPEN_MAIL` | `{ success }` — 제목이 일치하는 행 클릭 |
| `SAVE_ALL_ATTACHMENTS` | `{ success }` |
| `CLICK_ATTACHMENT_DOWNLOAD` | `{ success }` — index번째 첨부파일 개별 다운로드 |
| `REPLY_ALL` | `{ success }` — 전체답장 버튼 클릭 |
| `CHECK_COMPOSE` | `{ hasCompose }` |
| `FILL_REPLY` | `{ success }` — 답장 창에 텍스트 삽입 |
| `SEND_REPLY` | `{ success }` — 발신 버튼 클릭 |

---

## 보안 고려사항

- 메일 본문·첨부파일은 **로컬(브라우저·localhost)**에서만 처리
- 외부 인터넷으로 메일 내용이 전송되지 않음
- 회사 정책에 따라 확장 프로그램 사용 가능 여부 사전 확인 필요
