# API 레퍼런스 오버레이 — 우리(MCP)만의 지식

> `salesmap-get-api-ref`가 내려주는 문서 = **원장 + 이 오버레이**.
> 병합은 LLM이 수행한다 → `.claude/skills/api-ref-sync`
>
> | 파일 | 역할 |
> |---|---|
> | `docs/salesmap-api-reference-<날짜>.md` | 원장 아카이브 (받은 그대로, 수정 금지) |
> | `docs/internal/api-ref-overlay.md` | **이 파일** — 우리 지식, 항상 최신만 |
> | `docs/internal/api-ref-merged-<날짜>.md` | 병합본 아카이브 |
> | `src/tools/api-ref.ts` | 생성물 (`node scripts/build-api-ref.mjs`) |

## 원칙

1. **원장은 절대 수정하지 않는다.** 새 원장이 오면 날짜를 붙여 새 파일로 아카이브한다.
2. 이 파일에는 **"MCP라서 원장과 다른 것"만** 담는다.
3. **원장이 틀린 것 같으면 여기에 담지 말고 사용자에게 보고한다.** 사용자가 원장 관리자에게 고쳐달라고 한다. 오버레이로 덮으면 그 오류가 원장에 영원히 남고, 다른 API 소비자(고객사 자체 개발·웹훅 연동)는 계속 틀린 문서를 본다.
4. **오버레이는 적을수록 좋다.** 원장이 그 내용을 담게 되면 즉시 삭제한다.
5. 각 항목에 **삭제 조건**을 반드시 적는다. 언제 사라져도 되는지 모르면 영영 안 사라진다.

## 비공개 API는 문서에 넣지 않는다

MCP 내부적으로 미공개 엔드포인트를 쓰더라도 **`get-api-ref` 문서에는 공개된 것만 싣는다.**

이 문서는 AI가 `run-script`로 REST API를 직접 호출할 때 참고하는 자료다. 미공개 엔드포인트를 실으면 고객이 그걸 자체 연동에 쓰게 되고, 나중에 스펙이 바뀌면 그대로 깨진다.

> **선례 (2026-07-28 → 2026-07-31 해소)**: `salesmap-list-engagements`가 `POST /v3/object/activity`를 쓰던 시절, v3 스펙을 오버레이에 실었다가 제거했다. 개발팀 방침이 **"v3를 MCP 내부에서 쓰는 것은 무방하나 공개는 곤란하며, v2를 근본적으로 개선해 v3보다 낫게 만들 예정"**이었기 때문이다.
> **2026-07-29 릴리즈로 그 약속이 지켜졌고**(v2 activity에 유형·기간 필터 추가), 2026-07-31에 이 도구를 v2로 되돌렸다. 이제 공개 문서화가 가능하다 — 아래 항목 참조.

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
- **왜**: 원장의 응답 예시는 래핑된 원형이다. 그대로 믿은 AI가 `r.data.dealList`로 접근해 실패한다. 텔레메트리에서 `sort is not a function` 류로 4건 관측
- **삭제 조건**: run-script가 래퍼를 벗기지 않도록 바뀌면. 사실상 영구 — MCP 고유 동작이라 원장에 실릴 내용이 아니다
- **본문**:

````overlay
> ⚠️ **run-script 사용 시:** `salesmap.get()`/`post()`는 이 `success`/`data` 래퍼를 **벗겨서** 반환합니다. 스크립트에서는 `r.dealList`처럼 최상위 키로 접근하세요 (`r.data.dealList` 아님). 이 문서의 응답 예시는 래핑된 원형 기준입니다.
````

***

---

## 2. v2 Activity — 유형·기간 필터 (2026-07-29 릴리즈)

`GET /v2/{people|organization|deal|lead|custom-object}/activity`에 파라미터 3개가 추가됐다.
원장에 반영되면 이 항목은 지운다.

| 파라미터 | 설명 |
|---|---|
| `types` | 콤마 구분. 15종: `create`, `webFormView`, `webFormSubmit`, `email`, `emailOpen`, `emailLinkClick`, `smsSend`, `memoCreate`, `todoCreate`, `meeting`, `documentView`, `kakaoAlimtalkSend`, `merge`, `modusignContractCreated`, `recordingCreate` |
| `startDate` / `endDate` | 활동의 `date` 기준, **양 끝 포함**. 날짜만 주면 **KST 달력일**로 해석 (`2026-07-29` → UTC `07-28T15:00` ~ `07-29T15:00`) |

응답 item에 `recordingId`가 추가됐다. 실측 확인 사항:

- **응답 필드가 오브젝트마다 다르다** — 고객엔 `documentId`·`documentName`이 있고 딜엔 없으며 딜엔 `dealStatus`가 있다. 날짜 키는 `date`다(OpenAPI의 `createdAt`은 오기)
- **정렬은 오름차순(오래된 순), 한 페이지 50건 고정.** `limit` 파라미터는 받아도 무시된다.
  "최근 활동"을 보려면 `startDate`로 범위를 좁혀야 한다
- `nextCursor`는 다음 페이지가 없으면 **키 자체가 없다**(null 아님)
- `types`에 잘못된 값을 넣으면 **본문 없는 400**이 온다

## 3. 이메일 본문 조회 (2026-07-29 릴리즈)

`GET /v2/email/{emailId}` 응답에 `snippet`·`htmlBody`·`text`가 추가됐다.
키는 항상 있고 값은 각각 nullable이며, **첨부 정보는 없다.**

실측상 `htmlBody`가 `text`의 28배인 경우가 있다(9,398자 vs 339자 — 마크업이 96%).
본문이 필요하면 `text`를 먼저 보고, 없을 때만 `htmlBody`를 쓰는 편이 낫다.

## 4. 녹음·녹취 조회 (2026-07-29 신설)

| 엔드포인트 | 응답 |
|---|---|
| `GET /v2/recording/{recordingId}` | `id`, `title`, `duration`(초), `source`(`upload`\|`realtime`), `coreSummary`, `createdAt`, `owner{id,name}` |
| `GET /v2/recording/{recordingId}/transcript` | `transcriptSegmentList[{startTime(ms), endTime(ms), text, speakerId, confidence}]`, `speakerInfoList[{speakerId, label}]` |

- `recordingId`는 **activity 응답에서만** 얻을 수 있다 (녹음 목록 엔드포인트 없음)
- 단건 응답에 **연결 레코드 정보가 없다** — 어느 딜·리드·고객의 녹음인지 알 수 없다
- **transcript에 상한·페이지네이션이 없다.** 실측 59분 회의 = 404 세그먼트 / 85KB / 텍스트 20,687자.
  긴 회의는 응답이 커지므로 호출 측에서 잘라 쓸 것
- `speakerInfoList`로 `speakerId`를 라벨로 치환할 수 있다. 사용자가 UI에서 실명을 매핑했으면 실명이 내려온다

## 5. 날짜 파라미터 — date-only는 KST, 응답은 UTC

날짜만 넣었을 때(`2026-07-29`) 해석이 **표면마다 다르다.** 실측·백엔드 확인 기준:

| 표면 | date-only 해석 |
|---|---|
| `GET /v2/{object}/activity` `startDate`·`endDate` | **KST 달력일** |
| `POST /v2/object/{type}/search` `DATE_*`(절대) | **KST 달력일** |
| 〃 `DATE_*_DAYS_AGO`(상대) | **KST 달력일** — 호출 시점 KST 오늘 기준(현재 시각 아님) |
| `POST /v2/{type}/{id}` `dateValue` | **KST 자정** |
| `POST /v3/object/create` `date` 타입 필드 | **KST 자정** |
| ⚠️ `POST /v3/object/create` `dateTime` 타입 필드 | 입력 날짜 + **호출 시각**이 붙는다 |
| ⚠️ `GET /v2/memo` `startDate`·`endDate` | **UTC** — `endDate=D`가 `D T00:00:00Z`까지라 **당일이 통째로 빠진다** |

**응답 날짜는 전부 UTC(`Z`) 표기다.**

정확한 범위가 필요하면 **오프셋 포함 ISO**(`2026-07-29T00:00:00+09:00`)를 쓰면 어느 표면에서든
동일하게 동작한다. 실측상 activity·search는 date-only와 결과가 같고, memo·v3 dateTime만 고쳐진다.
