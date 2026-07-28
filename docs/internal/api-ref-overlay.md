# API 레퍼런스 오버레이 — 우리(MCP)만의 지식

> `salesmap-get-api-ref`가 내려주는 문서 = **원장 + 이 오버레이**.
> 병합은 LLM이 수행한다 → `.claude/skills/api-ref-sync`

## 원칙

1. **원장(`api-ref-upstream.md`)은 절대 수정하지 않는다.** 새 원장이 오면 통째로 교체만 한다.
2. 이 파일에는 **"MCP라서 원장과 다른 것"만** 담는다.
3. **원장이 틀린 것 같으면 여기에 담지 말고 사용자에게 보고한다.** 사용자가 원장 관리자에게 고쳐달라고 한다. 오버레이로 덮으면 그 오류가 원장에 영원히 남는다.
4. **오버레이는 적을수록 좋다.** 원장이 그 내용을 담게 되면 즉시 삭제한다.
5. 각 항목에 **삭제 조건**을 반드시 적는다. 언제 사라져도 되는지 모르면 영영 안 사라진다.

## 항목 쓰는 법

병합하는 LLM이 읽고 판단할 수 있도록 **의도를 서술**한다. 줄 번호나 정확한 앵커 문자열에 의존하지 않는다 — 원장은 섹션 제목도 문구도 바뀐다.

```
## <제목>
- **무엇**: 어떤 내용을 넣는가
- **어디에**: 대략 어느 위치가 자연스러운가 (섹션 이름은 바뀔 수 있으니 "성격"으로 서술)
- **왜**: 근거 (코드 위치·실측 등)
- **삭제 조건**: 언제 이 항목이 불필요해지는가
- **본문**: (있으면)
```

***

## 1. run-script 응답 래퍼 벗김 경고

- **무엇**: run-script 샌드박스의 `salesmap.get/post`는 `success`/`data` 래퍼를 벗겨서 반환한다는 경고
- **어디에**: 공통 응답 형식(성공 응답 래퍼 구조)을 설명하는 곳 바로 뒤
- **왜**: 원장 응답 예시는 래핑된 원형이다. 그대로 믿은 AI가 `r.data.dealList`로 접근해 실패한다. 실제 로그에서 `sort is not a function` 류로 4건 관측
- **삭제 조건**: run-script가 래퍼를 벗기지 않도록 바뀌면. (사실상 영구 — MCP 고유 동작)
- **본문**:

````overlay
> ⚠️ **run-script 사용 시:** `salesmap.get()`/`post()`는 이 `success`/`data` 래퍼를 **벗겨서** 반환합니다. 스크립트에서는 `r.dealList`처럼 최상위 키로 접근하세요 (`r.data.dealList` 아님). 이 문서의 응답 예시는 래핑된 원형 기준입니다.
````

***

## 2. 액티비티(Activity) v3 섹션

- **무엇**: `POST /v3/object/activity` 엔드포인트 전문 (아래 본문)
- **어디에**: 오브젝트별 엔드포인트 섹션들이 끝나는 근처. 견적서·상품 섹션 앞이 자연스러웠음. 목차에도 "액티비티 (Activity)" 항목을 넣을 것
- **왜**: MCP `salesmap-list-engagements`가 v3를 쓴다 (`src/tools/extras.ts`의 `V3_ACTIVITY = true`). 원장에는 **v3라는 단어가 0회** 등장한다. v2와 스펙이 다르다 — 유형 필터, 유형별 limit, `success`/`data` 래퍼 없음
- **함께 할 것**:
  - 원장의 v2 액티비티 상세 섹션 5개(고객·회사·딜·리드·커스텀오브젝트)는 **지우지 말 것**. v2 엔드포인트가 살아있고 run-script로 직접 호출 가능하다. 각 섹션에 "MCP는 v3를 쓴다"는 한 줄 안내만 덧붙인다
  - 작업별 빠른 찾기 표의 액티비티 행에도 v3를 병기
- **삭제 조건**: **원장에 v3 액티비티가 반영되면 이 항목과 관련 안내를 전부 삭제.** 현재 오버레이 대부분이 이것 때문이므로, 반영되면 오버레이가 1건으로 줄어든다
- **본문**:

````overlay
### 액티비티 (Activity)

모든 오브젝트(고객·회사·딜·리드·커스텀 오브젝트)의 활동 타임라인을 단일 엔드포인트로 조회합니다. 세일즈맵 GUI의 **"타임라인"**에 해당합니다.

#### POST /v3/object/activity — 액티비티(타임라인) 조회

투두·노트·녹음·미팅·이메일·알림톡·문자 활동을 유형별로 조회합니다.

**요청 파라미터** (body, `application/json`)

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | :-: | --- |
| `objectType` | string | 필수 | `"고객"` \| `"회사"` \| `"딜"` \| `"리드"` 또는 커스텀 오브젝트 이름. **한글 이름**을 사용합니다. |
| `objectId` | string(UUID) | 필수 | 조회할 레코드 ID |
| `todo` / `note` / `recording` / `meeting` / `email` / `alimtalk` / `sms` | object | 선택 | 조회할 활동 유형. 원하는 유형의 키를 body에 포함하며, 값은 `{}`(기본 5건) 또는 `{ "limit": 1~50, "cursor": "<이전 응답의 해당 유형 cursor>" }`. 최소 1개 이상 포함합니다. |

* `limit`: 유형별 반환 건수 (1~50, 기본 5). `cursor` 없이도 한 번에 최대 50건.
* `cursor`: 유형별 독립 페이지네이션 커서. 첫 페이지는 생략.

**요청 예시**

```json
{
  "objectType": "딜",
  "objectId": "<dealId>",
  "email": { "limit": 10 },
  "note": {}
}
```

**응답** `200 OK`

v2와 달리 `success`/`data` 래퍼 없이 본문을 직접 반환합니다. 요청한 유형별로 독립된 `data` 배열과 `cursor`를 반환합니다.

```json
{
  "email": { "data": [ /* email 항목 */ ], "cursor": "..." },
  "note": { "data": [ /* note 항목 */ ], "cursor": null }
}
```

* 유형별 `cursor`가 `null`이 아니면 다음 페이지가 있습니다. 해당 유형만 `{ "cursor": ... }`로 담아 재호출합니다.
* 에러는 v2와 동일하게 `{ "success": false, "message", "reason" }` 형태로 반환됩니다.

**유형별 응답 필드**

공통: `_id`, `createdAt`.

| 유형 | 주요 필드 |
| --- | --- |
| `todo` | `title`, `type`, `content`, `startDate`, `endDate`, `isAllDay`, `done`, `doneDate` |
| `note` | `text`(순수 텍스트), `pinned`. ※API 원응답의 `htmlBody`(렌더링용 HTML)는 `text`와 내용이 중복되어 MCP에서 제거함 |
| `recording` | `title`, `status`, `duration`(초), `source`, `coreSummary`(AI 통화 요약). ※녹음 파일 URL·STT 전문은 없음 |
| `meeting` | `title`, `status`, `content`, `startDate`, `endDate` |
| `email` | `subject`, `fromName`, `fromAddress`, `toName`, `toAddress`, `status`, `date`, `openCount`, `clickCount`. ※본문(html/text)은 없음 |
| `alimtalk` | `content`, `recipientNo`, `resultCode`, `resultCodeName`, `createDate`, `receiveDate` |
| `sms` | `subject`, `text`, `sendStatus`, `resultCode`, `toPhoneNumber`, `sendType`, `imageUrl`, `imageFileName` |

> 응답 크기 팁: `recording.coreSummary`(AI 요약)가 응답을 키울 수 있습니다. 요약·집계만 필요하면 해당 유형을 빼거나 `limit`을 낮추세요.

***
````

***
