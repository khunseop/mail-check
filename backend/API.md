# Mail Check — 백엔드 개발 가이드

Chrome 확장 프로그램(Mail Check)과 연동하는 백엔드를 개발할 때 참고하는 문서입니다.

---

## 개요

확장 프로그램은 사내 웹메일에서 새 메일을 감지하면 백엔드로 메일 내용을 전송합니다.
백엔드는 이를 처리한 뒤 답장 텍스트를 반환하고, 확장 프로그램이 답장 창에 자동 입력합니다.

```
웹메일 → [Chrome 확장] → POST /analyze → [백엔드]
                                               ↓ 처리 (Excel 파싱, DB 조회 등)
웹메일 답장창 자동입력 ← replyText ←────────────┘
```

---

## 필수 구현 사항

### 1. CORS 설정

확장 프로그램이 `chrome-extension://` 출처에서 `localhost`로 요청을 보내므로 CORS를 허용해야 합니다.

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, GET
Access-Control-Allow-Headers: Content-Type
```

### 2. 엔드포인트 목록

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/analyze` | 메일 처리 및 답장 텍스트 반환 **(필수)** |
| `GET` | `/health` | 서버 동작 확인용 (선택) |

---

## POST /analyze

### Request

**Content-Type:** `application/json`

```json
{
  "subject": "발주서_20260622",
  "body": "안녕하세요. 발주서 첨부드립니다. 확인 부탁드립니다.",
  "attachments": ["발주서_20260622.xlsx", "견적서.pdf"],
  "downloadFolder": "mail-check"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `subject` | `string` | 메일 제목 |
| `body` | `string` | 메일 본문 텍스트 (최대 3,000자) |
| `attachments` | `string[]` | 첨부파일명 목록. 파일명만 포함, 경로 없음 |
| `downloadFolder` | `string` | 첨부파일 저장 폴더명 (빈 문자열 가능) |

### Response `200 OK`

```json
{
  "replyText": "안녕하세요. 발주서 확인하였습니다. 처리 후 연락드리겠습니다."
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `replyText` | `string` | 답장 창에 자동 입력할 텍스트. **빈 문자열 `""`이면 답장 입력 생략** |

### 오류 응답

`2xx` 이외의 응답 코드를 반환하면 확장 프로그램은 답장 입력을 건너뜁니다.
오류 포맷은 자유롭게 정의해도 됩니다.

---

## 첨부파일 접근 방법

`/analyze` 호출 시점에는 첨부파일이 이미 사용자 PC에 저장된 상태입니다.

**절대경로 계산 규칙:**

```
~/Downloads/{downloadFolder}/{파일명}
```

예시:
- `downloadFolder = "mail-check"`, `attachments[0] = "발주서.xlsx"`
- → `/Users/{username}/Downloads/mail-check/발주서.xlsx`

`downloadFolder`가 빈 문자열이면 `~/Downloads/{파일명}`

---

## 확장 프로그램 동작 순서

백엔드가 호출되는 정확한 타이밍을 이해하면 구현에 도움이 됩니다.

```
1. 새 메일 감지 (1분 폴링)
2. 메일 클릭 → 본문·첨부파일명 읽기
3. 첨부파일 개별 다운로드 (버튼 클릭 방식)
       └ 저장 위치: ~/Downloads/{downloadFolder}/
4. POST /analyze 호출  ← 이 시점에 첨부파일이 디스크에 저장 완료
5. replyText 수신 → 답장 창에 입력
6. (옵션) 자동 발신
```

---

## 확장 프로그램 설정

옵션 페이지에서 정책별로 설정합니다.

| 설정 항목 | 설명 |
|-----------|------|
| 백엔드 URL | 예: `http://localhost:8000` |
| 저장 폴더 | `downloadFolder` 값. 예: `mail-check` |
| 자동 발신 | `replyText` 입력 후 발신 버튼 자동 클릭 여부 |
