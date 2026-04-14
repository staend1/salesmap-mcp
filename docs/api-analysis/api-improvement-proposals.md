# 세일즈맵 API 개선 제안

> 작성: 2026-04-08
> 소스: `salesmap-api-reference.md` 실전 검증 + MCP 구현 경험

MCP 서버를 구현하면서 발견한 API 설계 이슈 및 개선 제안. 우선순위별 정리.

---

## P0: 설계 개선 (API 품질에 직접적 영향)

### 1. fieldList 타입 키 패턴 제거

**현재**: 필드 타입마다 다른 value 키를 클라이언트가 선택해야 함
```json
{ "name": "담당자", "userValueId": "uuid" }
{ "name": "금액", "numberValue": 50000 }
{ "name": "이메일", "stringValue": "a@b.com" }
{ "name": "참여자", "userValueIdList": ["uuid1", "uuid2"] }
```

**제안**: HubSpot처럼 단순 key-value로 변경. 서버가 타입 추론.
```json
{ "properties": { "담당자": "uuid", "금액": 50000, "이메일": "a@b.com" } }
```

**이유**:
- 15개 이상의 value 키 (`stringValue`, `numberValue`, `booleanValue`, `dateValue`, `userValueId`, `userValueIdList`, `organizationValueId`, `organizationValueIdList`, `peopleValueId`, `peopleValueIdList`, `pipelineValueId`, `pipelineStageValueId`, `teamValueIdList`, `webformValueId`, `stringValueList` ...) 를 클라이언트가 전부 알아야 함
- LLM/AI 에이전트가 사용할 때 에러율이 높음
- 현재 MCP에서 스키마 조회 후 변환하는 레이어를 별도로 구현해야 함 (API 콜 추가)

### 2. deal 금액(price) fieldList 통합

**현재**: `price`만 top-level 파라미터로 분리됨
```json
POST /v2/deal
{ "name": "딜", "price": 50000, "fieldList": [...] }
```

**제안**: fieldList (또는 properties) 안에서 통합 처리
```json
{ "properties": { "이름": "딜", "금액": 50000 } }
```

**이유**: 다른 필드는 전부 fieldList인데 price만 예외 → 클라이언트에서 분기 처리 필요

### 3. 응답 래핑 일관성

**현재**: 단건 조회 시 배열로 래핑
```json
GET /v2/organization/{id}
→ { "organization": [ { ...레코드... } ] }  // 1건인데 배열
```

**제안**: 단건은 객체, 목록은 배열
```json
GET /v2/organization/{id}
→ { "organization": { ...레코드... } }
```

### 4. 시퀀스 ID 필드명 (`_id` vs `id`)

**현재**: 시퀀스만 `_id` 사용, 나머지 모든 리소스는 `id`
**제안**: `id`로 통일

---

## P1: 누락된 API

### 5. 커스텀 오브젝트 정의 목록

**현재**: `GET /v2/custom-object-definition` 없음. 각 레코드의 `customObjectDefinitionId`에서 역추출해야 함.
**제안**: `GET /v2/custom-object-definition` → 워크스페이스의 커스텀 오브젝트 타입 목록 반환

### 6. 이메일 목록 조회

**현재**: `GET /v2/email` → 404. 고객별 이메일 보려면 activity에서 emailId 하나씩 추출 → 개별 조회 (N+1)
**제안**: `GET /v2/email?peopleId={id}` 또는 `GET /v2/{type}/{id}/email`

### 7. 이메일 body 필드

**현재**: `GET /v2/email/{id}` 응답에 `body` 필드 없음. subject/from/to/status만 반환.
**제안**: `body` (또는 `htmlBody`) 필드 추가

### 8. TODO 생성 API

**현재**: `POST /v2/todo` → 500
**필요**: "내일 이 고객에게 전화하기" 같은 후속 조치 자동 생성

### 9. 시퀀스 등록 API

**현재**: `POST /v2/sequence/enrollment` → 500
**필요**: "이 고객을 콜드 이메일 시퀀스에 등록해줘"

### 10. SMS/미팅/카카오알림톡/문서 상세 조회

**현재**: activity에 `smsId`, `meetingId`, `kakaoAlimtalkId`, `documentId` 포함되지만 상세 조회 API 없음 (모두 404)
**제안**: `GET /v2/sms/{id}`, `GET /v2/meeting/{id}` 등

---

## P2: 검색 개선

### 11. Search API — custom-object 지원

**현재**: `targetType: "custom-object"` → `Invalid targetType`
**제안**: custom-object 검색 지원 + `customObjectDefinitionId` 필터

### 12. 전화번호 유연 검색

**현재**: phone 필드는 `EQ` 연산자만 지원 (정확히 일치해야 함)
**제안**: `CONTAINS` 또는 전화번호 정규화 후 매칭. 하이픈 유무, 뒷자리 검색 등

### 13. 메모 목록 역순 정렬

**현재**: 항상 `createdAt` 오름차순 (오래된 순). 최신 메모 보려면 끝까지 페이지네이션.
**제안**: `sort=desc` 옵션 추가

---

## P3: 필드/스키마

### 14. `/v2/user/me`에 email 필드 추가

**현재**: user 목록에는 email 있지만, `/v2/user/me`에는 없음
**제안**: me 응답에도 email 포함

### 15. `/v2/field/memo`, `/v2/field/sequence` 지원

**현재**: `Invalid parameters`
**제안**: 메모/시퀀스 필드 정의도 동적 조회 가능하게

---

## P4: 문서 vs 실제 불일치

| 항목 | 문서 | 실제 |
|------|------|------|
| 이메일 날짜 필드 | `sentAt` | `date` |
| 시퀀스 enrollment 목록 키 | `enrollmentList` | `sequenceEnrollmentList` |
| 시퀀스 enrollment 필드 | `id`, `status`, `currentStepOrder`, `enrolledAt` | `_id`, `createdAt`만 존재 |
| 시퀀스 timeline 필드 | `type`, `stepOrder`, `createdAt`, `id` | `eventType`, `stepIndex`, `date` (id 없음) |
| 검색 결과 페이지 크기 | 20건 | 50건 |

---

## P5: 기타

### 16. 삭제 API body 문서화

**현재**: `POST /v2/{resource}/delete` → 400 (body 필요하지만 형식 미문서화)
**제안**: 삭제 API body 스키마 문서화, 또는 `DELETE /v2/{resource}/{id}`로 변경

### 17. 웹훅 서명 검증

**현재**: 서명 검증 없음. URL 난독화에만 의존.
**제안**: HMAC 서명 검증 추가

### 18. 리드→딜 전환 API

**현재**: 전용 API 없음. 리드 삭제 + 딜 생성으로 우회해야 하는데 삭제도 안 됨.
**제안**: `POST /v2/lead/{id}/convert` → 연결 정보 유지하며 딜 자동 생성

### 19. top-level 파라미터 분리 구조

**현재**: `price`, `pipelineId`, `pipelineStageId`, `status` 등이 `fieldList`가 아닌 top-level body 파라미터로만 전달 가능. properties에 넣으면 에러.

**제안**: HubSpot처럼 전부 `properties` 안에 넣을 수 있도록 통합.

**이유**:
- LLM이 "필드 값 = properties에 넣는다"는 단일 규칙으로 동작할 수 없음
- 금액/파이프라인/상태 등 어떤 필드가 top-level인지 외워야 함
- 현재 MCP에서 금액은 자동 추출로 우회, 나머지는 별도 파라미터로 노출
