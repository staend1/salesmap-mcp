# SalesMap MCP TODO

> 최종 업데이트: 2026-04-08

---

## 1. Tool 리네이밍 (일괄 적용)

> 상세: `docs/tool-renaming-plan.md`

- [ ] tool 이름 변경 (18개) — 언더스코어→하이픈, record→object, get→read
- [ ] `salesmap_create_memo` → `salesmap-create-note` (나중에 todo/email 추가 시 `type` 파라미터로 통합)
- [ ] 파라미터 이름 변경: `type`→`objectType`
- [ ] Description 영문 키워드 구조화 (Purpose/Prerequisites/Returns/Usage Guidance/Guardrails)
- [ ] 필터 구조 검토: flat → filterGroups (API 지원 여부 확인 필요)
- [ ] 변경 후: test-agent.mjs, PRD.md, gitbook 문서 동시 수정

---

## 2. Tool 추가 계획

### 2-1. HubSpot 패턴에서 가져올 것

> 상세: `docs/references/hubspot-mcp-teardown.md` "우리가 가져갈 것" 섹션

- [ ] `idProperty` 패턴 — UUID 대신 email/이름으로 대상 지정 (API 측 E 섹션과 연결)
- [ ] Prompts 등록 — 영업 컨설팅 시나리오별 (리드 분석, 파이프라인 리뷰 등)
- [ ] `propertiesWithHistory` — 필드 변경 이력 조회 (세일즈맵 history API 확인 필요)
- [ ] Description에 Returns 섹션 추가

### 2-2. HubSpot에만 있는 tool (API 가능 여부 확인 후 추가)

| tool | 세일즈맵 API 상태 |
|---|---|
| 커스텀 오브젝트 스키마 조회 | 검토 필요 |
| 특정 속성 상세 조회 | describe_object로 부분 대체 가능 |
| 다건 관계 생성 | 검토 필요 |
| 관계 유형 정의 조회 | 검토 필요 |
| 메모 조회/수정 | API 확인 필요 |
| 워크플로우 목록/상세 | API 미지원 (시퀀스로 대체?) |

### 2-3. 세일즈맵 고유 기능

- [ ] todo/email/activity URL 지원 — 세일즈맵 API 개발 후
- [ ] 노트 생성 시 날짜/유형/담당자 지정 — API 확장 필요 (B6)

---

## 3. 세일즈맵 API 이슈 (개발팀 해결 대기)

> 상세: `docs/api-issues-and-future-direction.md`

### 3-1. 버그 (A 섹션 — 문서와 다르게 동작)

- [ ] A1. 삭제 API 경로 혼란 — 검증 완료, 문서 업데이트 필요
- [ ] A2. 이메일 body 미반환
- [ ] A3. 이메일 날짜 필드명 불일치
- [ ] A4~A6. 시퀀스 관련 필드명/키 불일치
- [ ] A7. 견적서 목록 조회 500
- [ ] A8. 시퀀스 timeline 일부 500
- [ ] A9. Silent No-op 파라미터 (200인데 미변경)
- [ ] A10. 단건 조회 응답 배열 래핑

### 3-2. 누락 엔드포인트 (B 섹션)

- [ ] B1. TODO 생성 API (500)
- [ ] B2. 시퀀스 등록 API (500)
- [ ] B3. 커스텀 오브젝트 Definition 목록
- [ ] B4. 이메일 목록 조회 (404)
- [ ] B5. Batch Create/Update
- [ ] B7. 레코드 연결 TODO/이메일/타임라인 필터
- [ ] B8. 커스텀 오브젝트 검색 (`Invalid targetType`)
- [ ] B9. 노트/시퀀스 필드 조회 (`Invalid parameters`)
- [ ] B10. SMS/미팅/카카오/녹음 API (404)

### 3-3. 스펙 제약 (C 섹션)

- [ ] C1. 검색 정렬(sort) 미지원
- [ ] C2. 검색 필터 필드명 불일치 시 빈 결과만 반환 (에러 없음) — 시간 소모 큼

---

## 4. 구조적 개선 방향 (장기 로드맵)

> 상세: `docs/api-issues-and-future-direction.md` D~J 섹션

- [ ] D. 응답에 FK 조인 / `expand`/`include` 파라미터
- [ ] E. String 기반 입력 + 서버단 매칭 (`owner="이주호"`)
- [ ] F. 에러 응답 자연어화
- [ ] G. 멱등성 키, 보상 트랜잭션, Dry-run
- [ ] H. Batch/Composite API
- [ ] I. Tool 구조 LLM 최적화 (유명 tool 편승)
- [ ] J1. `GET /v2/user/me`에 email 필드 추가
- [ ] J2. 메모 목록 내림차순 정렬 옵션

---

## 5. 인프라/배포

- [x] Vercel 배포 (`salesmap-mcp.vercel.app`) — 2026-04-08 완료
- [ ] GitHub → Vercel 자동 배포 확인 (main 머지 시 트리거)
- [ ] MCP Inspector 전체 tool 통합 테스트

---

## 6. VOC (고객/PM 피드백)

> 상세: `docs/voc-2026-03-19.md`

- [x] P0: singleSelect 버그 — 세일즈맵 팀 수정 완료
- [ ] P1: Batch Create/Update API (= B5)
- [ ] P2: Composite API — org+people+lead 한 번에 생성+연결 (= H)
