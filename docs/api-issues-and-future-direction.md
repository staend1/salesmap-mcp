# SalesMap MCP — API 이슈 & 미래 방향 총정리

> 최종 업데이트: 2026-03-20

---

## Part 1. API 현황 — 버그, 누락, 스펙 제한

있는 그대로의 팩트. 세일즈맵 API를 MCP로 래핑하면서 발견한 것들.

> **참고**: A 섹션(버그)은 추가 검증 필요. 건홍님이 API 대량 생성 후 자동으로 가이드북을 썼는데, 그 자동생성 문서 자체에 틀린 내용이 있어서 우리가 참조한 스펙이 애초에 잘못됐을 수 있음. 실제 의도된 동작과 다를 수 있으니 개발팀 확인 필요.

---

### A. 버그 — 문서와 다르게 동작

**A1. 레코드 삭제 API 미작동**
- `POST /v2/deal/<dealId>/delete` → 404
- `POST /v2/deal/delete` → 400 (body 형식 미공개)
- 모든 오브젝트 삭제 불가 → MCP에서 삭제 tool 제거함

**A2. 이메일 본문(body) 미반환**
- `GET /v2/email/<emailId>` → subject/from/to/status/date만, body 없음
- MCP에서 이메일 tool 안 넣음

**A3. 이메일 날짜 필드명 불일치**
- 문서: `sentAt` → 실제: `date`

**A4. 시퀀스 enrollment 필드 누락**
- `GET /v2/sequence/<id>/enrollment`
- 문서: `id`, `status`, `currentStepOrder`, `enrolledAt`
- 실제: `_id`, `createdAt`만

**A5. 시퀀스 enrollment 리스트 키 불일치**
- 문서: `enrollmentList` → 실제: `sequenceEnrollmentList`

**A6. 시퀀스 timeline 필드명 불일치**
- `GET /v2/sequence/<id>/enrollment/<enrollmentId>/timeline`
- 문서: `type`, `stepOrder`, `createdAt`, `id`
- 실제: `eventType`, `stepIndex`, `date`, id 없음

**A7. 견적서 목록 조회 500**
- `GET /v2/quote` → 500
- 딜/리드 경유(`GET /v2/deal/<id>/quote`)로만 접근 가능

**A8. 시퀀스 timeline 일부 500**
- 특정 enrollment에서 `Unexpected Server Error`

**A9. Silent No-op 파라미터들**
- `POST /v2/people/{id}` — top-level `email`, `phone` → 200인데 미변경
- `POST /v2/organization/{id}` — top-level `ownerId`, `phone`, `industry`, `parentOrganizationId` → 동일
- 반드시 `fieldList`로 보내야 작동

**A10. 단건 조회 응답 배열 래핑**
- `GET /v2/{type}/{id}` → `data.deal[0]` (단건인데 배열)

---

### B. 누락 — 엔드포인트 자체가 없음

**B1.** TODO 생성 — `POST /v2/todo` → 500
**B2.** 시퀀스 등록 — `POST /v2/sequence/enrollment` → 500
**B3.** 커스텀 오브젝트 Definition 목록 — 엔드포인트 없음
**B4.** 이메일 목록 조회 — `GET /v2/email` → 404
**B5.** Batch Create/Update — 엔드포인트 없음
**B6.** 노트 생성 제한 — `POST /v2/{type}/{id}/memo` 날짜/유형/담당자 지정 불가
**B7.** 레코드 연결 조회 — 특정 레코드에 연결된 TODO/이메일/타임라인 필터 엔드포인트 없음
**B8.** 커스텀 오브젝트 검색 — `POST /v2/search` custom-object → `Invalid targetType`
**B9.** 노트/시퀀스 필드 조회 — `GET /v2/field/memo`, `GET /v2/field/sequence` → `Invalid parameters`
**B10.** SMS/미팅/카카오/녹음 API — 모두 404

---

### C. 스펙 제한 → MCP에서 우회 구현

**C1. 응답 300개+ 필드** — `GET /v2/deal/{id}` 파이프라인 자동생성 필드만 최대 228개, 대부분 null. API에 `fields` 파라미터 없음 → MCP에서 `compactRecords`로 null/자동필드 제거

**C2. Batch 조회 없음** — MCP `salesmap_batch_get_records`에서 for 루프 순차 호출로 우회. 20건 조회에 API 20번 + 각각 300개 필드 반환 → 응답 시간이 매우 느려짐

**C3. 필드 description 미제공** — `GET /v2/field/{type}` name/type만, description 없음 → MCP에서 시스템 필드 60개에 하드코딩 description 주입

**C4. 에러 메시지 부실** — 대부분 `"Bad Request"` 한 줄 → MCP에서 `errWithSchemaHint` 6가지 패턴 보강

**C5. 반환 필드 선택 불가** — MCP에서 `pickProperties` 후처리 필터링으로 우회

---

## Part 2. AI 에이전트를 위한 API 설계 — 구조적 개선 방향

단순 버그 수정이 아니라, "AI가 API를 쓴다"는 전제에서 근본적으로 달라져야 하는 것들. 기존 REST API는 "개발자가 알아서 잘 쓰겠지"였지만, AI 에이전트는 본질적으로 다르게 동작함.

---

### D. 응답 설계 — "완결된 세계"로 내려주기

**문제**: AI가 조회→FK로 조회→또 조회 체이닝을 하면 턴마다 UUID가 오가는데, UUID는 비의미론적 토큰(학습 데이터에 없고, 어텐션 부여 안 되고, 비슷한 토큰을 할루시네이션으로 만들 가능성 높음). 멀티턴이 길어질수록 변질 확률 급증.

**현재 세일즈맵**:
- 고객 조회 → 연결 회사 ID → 회사 조회 → 연결 딜 ID → 딜 조회 (4턴, UUID 3개 오감)
- 리드 검색 → 결과에 orgId/peopleId만 → 이름 보려면 추가 조회

**방향**:
- 조회 응답에 FK ID 대신 의미 있는 값(name, company_name)을 조인해서 내려주기
- get_record 시 연결 엔티티 요약을 인라인 포함
- API에 `expand`/`include` 파라미터 지원
- 값객체(Value Object) 개념 — 연결 엔티티의 "그 시점" 스냅샷 포함. 실시간 동기화 필요한 것과 아닌 것 구분
- 단, 한 번에 다 내리면 컨텍스트 과다 → 중심 엔티티와 적절한 깊이 설계 필요

---

### E. 입력 설계 — String 기반 + 서버단 보정

**문제**: AI는 "이주호"라고 보내고 싶은데 API는 UUID만 받음. 매번 list_users → UUID 찾기 → 본 요청에 전달하는 2턴 절차. AI가 이 절차를 빼먹거나 UUID를 변질시킬 수 있음.

**방향**:
- `owner="최재원"` 같은 string으로 바로 조회/필터 가능하게 서버단 매칭
- 담당자를 "이주호"로 보내면 → 서버가 동명이인 확인 → 없으면 자동 매칭 → 모호한 경우만 에러 ("이주호가 2명 있습니다")
- 밸리데이션 실패 시 400만 던지지 말고, **어떻게 보정해야 하는지** 응답에 포함
- 약간의 문법 오류는 서버단에서 정규화해서 통과시키기 (Brave Search API도 이렇게 동작)

---

### F. 에러 응답 설계 — 자연어로 풍부하게

**문제**: `"Bad Request"` 한 줄이면 AI가 뭐가 틀렸는지 몰라서 재시도 반복 → 컨텍스트 소진. 특히 search API는 에러 설명이 아예 없음.

**방향**:
- 에러 응답에 자연어로 **왜 실패 + 어떻게 수정** 포함
- 예: `"필드 '업종'은 singleSelect입니다. 허용 옵션: [의약품, 의료기기, 기타]. stringValue로 옵션값을 정확히 전달하세요."`
- MCP에서 `errWithSchemaHint`로 6가지 패턴 이미 보강 중이지만, API 단에서 해결하는 게 근본
- HTTP 상태 코드, 에러 코드 숫자도 비NLP 토큰 → 페이로드에 자연어 설명이 핵심

---

### G. 쓰기 안전성 — 멱등성 + 보상 트랜잭션 + 드라이런

**멱등성 문제**:
- 사람은 버튼 두 번 클릭이 최악이지만, AI는 타임아웃마다 자동 재시도 → 같은 고객 2명 생성
- 요청 ID 기반 멱등성(Stripe식 `Idempotency-Key`)이 기본
- 다만 LLM은 "같은 요청이면 같은 ID를 보내자"는 합의가 안 됨 → **내용 기반 중복 판별**도 필요

**보상 트랜잭션 문제**:
- AI가 멀티스텝 작업 중간에 실패 → 이미 여러 레코드 생성된 상태
- 삭제 API도 안 돼서 정리 불가 (A1 버그)
- 모든 쓰기 작업에 역방향 API 필요: `createDeal()` ↔ `deleteDeal()`
- 최소한 삭제 API부터 정상화

**드라이런(Dry-run)**:
- 위험한 쓰기 작업은 실제 반영 없이 예상 결과만 반환 → 컨펌 후 확정
- AI가 실수해도 실제 데이터에 영향 없음

---

### H. Batch/Composite — 턴 소비 최소화

**Batch Create/Update**:
- 현재 20개 레코드 = 20번 호출. Claude.ai 턴당 25~30회 제한 → "계속" 반복
- `POST /v2/{type}/batch` — 최대 20개 한 번에 → 호출 수 90% 감소

**Composite 생성**:
- 리드 하나 = Org 생성 → ID → People 생성 → ID → Lead 생성 (3턴, ID 전달 필수)
- 중간 실패 시 고아 레코드 발생, rollback 불가
- `create_linked_records(org + people + lead)` 한 번에 생성 + 자동 연결

---

### I. Tool 구조 — LLM 최적화 설계

**유명 tool 구조 편승**:
- Claude/GPT는 HubSpot, GitHub, Slack MCP 등으로 강화학습됨
- 비슷한 네이밍/구조 쓰면 LLM이 별도 학습 없이 잘 동작
- tool 이름, 에러 포맷, description 패턴 참고

**tool description 효율성**:
- description이 과하면 LLM 컨텍스트 소진
- 목적 겹치는 tool 여러 개 = AI 성능 저하
- 간결하면서 명확한 description + 선행 필수 tool 명시가 최적

**RPC가 REST보다 AI에 유리한 이유**:
- REST: URI 경로 + HTTP 메서드 조합으로 의미 파악 → AI에게 노이즈
- RPC: `createRecord`, `searchRecords` — 함수명 자체가 자연어적 → AI가 직관적 매핑
- MCP가 RPC 기반인 이유가 정확히 이것

---

### J. 기타 개선

**J1.** `GET /v2/user/me`에 `email` 필드 추가
**J2.** 메모 목록 정렬 — 현재 오름차순 고정, 내림차순 옵션 필요
