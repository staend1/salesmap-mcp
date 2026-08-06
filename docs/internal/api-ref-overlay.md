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

## 0. 공개 REST v2 API와 MCP 도구 계약 분리 경고

- **무엇**: API 레퍼런스가 공개 REST v2 기준이며, MCP 도구의 입력 계약은 도구 설명·get-guide·실측 스키마를 우선해야 한다는 경고
- **어디에**: 문서 기준일/최신본 안내가 있는 도입부 경고 박스 안
- **왜**: MCP는 `salesmap-batch-create-objects` 등에서 v3 API와 보정 로직을 감싼다. REST v2의 `fieldList`·top-level 파라미터 설명과 MCP의 `properties`·`associations` 계약을 섞어 읽으면 AI가 존재하지 않는 필드명이나 잘못된 요청 형식을 학습한다.
- **삭제 조건**: REST API 레퍼런스와 MCP 도구 레퍼런스가 완전히 분리되어 `salesmap-get-api-ref`가 MCP 호출용 컨텍스트에 노출되지 않게 되면 삭제한다.
- **본문**:

````overlay
> * **범위:** 이 문서는 공개 REST **v2** API 기준입니다. MCP 도구의 별도 입력·응답 보정 계약이나 비공개 경로를 REST API 계약으로 해석하지 마세요.
> * **MCP 사용자:** MCP 도구는 REST API 위의 별도 wrapper 계약을 제공합니다. MCP 도구를 호출할 때는 `salesmap-get-guide`, 도구 설명, `salesmap-list-properties`의 실측 스키마를 우선하고, 이 레퍼런스는 `salesmap-run-script`로 REST API를 직접 호출할 때 참고하세요.
````

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

## 2. 녹음(Recording) 조회 — 원장 미수록

`GET /v2/openapi`에 등재된 공개 엔드포인트인데 2026-07-30 원장에 아직 실리지 않았다.
활동의 `recordingId`로 이어서 조회하는 경로라, 원장의 액티비티 설명 바로 뒤에 둔다.

**삭제 조건**: 원장에 이 두 엔드포인트가 실리면 삭제한다.

| 엔드포인트 | 응답 |
|---|---|
| `GET /v2/recording/{recordingId}` | `id`, `title`, `duration`(초), `source`(`upload`\|`realtime`), `coreSummary`, `createdAt`, `owner{id,name}` |
| `GET /v2/recording/{recordingId}/transcript` | `transcriptSegmentList[{startTime(ms), endTime(ms), text, speakerId, confidence}]`, `speakerInfoList[{speakerId, label}]` |

- `recordingId`를 얻는 경로는 **활동 조회뿐이다** — 녹음 목록 엔드포인트가 없다
- 단건 응답에 **연결 레코드 정보가 없다** — 어느 딜·리드·고객의 녹음인지 알 수 없다
- **transcript에 상한·페이지네이션이 없다.** 실측 59분 회의 = 404 세그먼트 / 85KB / 텍스트 20,687자.
  긴 회의는 응답이 커지므로 호출 측에서 잘라 쓸 것
- `speakerInfoList`로 `speakerId`를 라벨로 치환할 수 있다. UI에서 실명을 매핑했으면 실명이 내려온다

## 3. `GET /v2/memo`의 날짜 필터는 KST가 아니다 — 원장 미수록

원장은 쓰기 `dateValue`가 KST로 해석된다는 것만 적고 있다. **노트 조회 필터는 규칙이 다르다.**

**삭제 조건**: `GET /v2/memo`가 다른 활동 조회와 같은 KST 달력일로 바뀌거나, 원장이 이 차이를 명시하면 삭제한다.

| 파라미터 | 해석 |
|---|---|
| `GET /v2/{type}/activity`의 `startDate`·`endDate` | **KST 달력일** (`2026-07-29` → UTC `07-28T15:00` ~ `07-29T15:00`) |
| `POST /v2/object/{type}/search`의 `DATE_*` | **KST 달력일** |
| `POST /v2/{type}/{id}`의 `dateValue` | **KST 자정** |
| ⚠️ **`GET /v2/memo`의 `startDate`·`endDate`** | **UTC** |

`GET /v2/memo?endDate=2026-07-31`은 `2026-07-31T00:00:00Z`(= KST 09:00)까지로 해석되어
**종료일 당일이 거의 통째로 빠진다.** 실측 확인:

```
노트 createdAt = 2026-07-31T04:27:55Z (KST 13:27)
?startDate=2026-07-31 → 1건        ?endDate=2026-07-31 → 0건
```

**정확한 범위가 필요하면 오프셋 포함 ISO를 쓴다** (`2026-07-31T23:59:59+09:00`).
이 형식은 어느 엔드포인트에서든 동일하게 동작한다.

응답 날짜는 전 엔드포인트에서 UTC(`Z`) 표기다.
