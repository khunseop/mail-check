# Mail Check 백엔드 API 명세

Chrome 확장 프로그램(Mail Check)이 새 메일을 감지하면 호출하는 API입니다.

---

## 공통

- Base URL: 확장 프로그램 옵션에서 설정 (예: `http://localhost:8000`)
- Content-Type: `application/json`
- CORS: `*` 허용 필요 (Chrome 확장 → localhost 요청)

---

## POST /analyze

메일 감지 시 호출. 처리 결과로 자동 입력할 답장 텍스트를 반환합니다.

### Request

```json
{
  "subject": "발주서_20260622",
  "body": "안녕하세요. 발주서 첨부드립니다. 확인 부탁드립니다.",
  "attachments": ["발주서_20260622.xlsx", "견적서.pdf"],
  "downloadFolder": "mail-check"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `subject` | string | ✓ | 메일 제목 |
| `body` | string | ✓ | 메일 본문 (최대 3,000자) |
| `attachments` | string[] | | 첨부파일명 목록 (경로 아님, 파일명만) |
| `downloadFolder` | string | | 첨부파일이 저장된 폴더명. `~/Downloads/` 기준 상대경로. 비어있으면 `~/Downloads/` 바로 아래 |

### Response `200 OK`

```json
{
  "replyText": "안녕하세요. 발주서 확인하였습니다. 처리 후 연락드리겠습니다."
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `replyText` | string | 답장 창에 자동 입력할 텍스트. **빈 문자열이면 답장 입력 생략** |

### Response `422 Unprocessable Entity`

처리 중 오류 발생 시 (파일 파싱 실패 등). 확장 프로그램은 이 경우 답장 입력을 건너뜁니다.

```json
{
  "detail": "Excel 파싱 실패 (발주서.xlsx): ..."
}
```

---

## GET /health

서버 동작 확인용.

### Response `200 OK`

```json
{ "status": "ok" }
```

---

## 첨부파일 경로 계산

백엔드에서 첨부파일을 직접 읽으려면 아래 규칙으로 절대경로를 계산합니다.

```
~/Downloads/{downloadFolder}/{attachments[n]}
```

예시:
- `downloadFolder`: `"mail-check"`
- `attachments[0]`: `"발주서_20260622.xlsx"`
- 절대경로: `/Users/{username}/Downloads/mail-check/발주서_20260622.xlsx`

`downloadFolder`가 빈 문자열이면 `~/Downloads/{attachments[n]}` 입니다.

---

## 호출 타이밍

확장 프로그램은 아래 순서로 동작합니다.

```
1. 새 메일 감지
2. 메일 본문·첨부파일명 읽기
3. 첨부파일 다운로드 (버튼 클릭 방식)
4. POST /analyze 호출  ← 첨부파일이 디스크에 저장된 이후
5. replyText를 답장 창에 입력
6. (옵션) 자동 발신
```

`/analyze` 호출 시점에는 첨부파일이 이미 지정 폴더에 저장된 상태이므로, 백엔드에서 바로 파일을 열 수 있습니다.
