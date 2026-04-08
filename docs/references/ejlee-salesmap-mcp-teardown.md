# ejlee/salesmap-mcp 해체 분석

> 분석 기준: https://github.com/ejlee-0924/salesmap-mcp.git (2026-04-08)

---

## 기본 정보
- **목적**: OpenAPI 스펙에서 자동 생성한 세일즈맵 MCP 서버
- **Transport**: Stdio (로컬 전용)
- **인증**: env 변수 `BEARER_TOKEN_BEARERAUTH`로 싱글 테넌트
- **SDK**: `@modelcontextprotocol/sdk` ^1.10.0 (우리는 ^1.26.0)
- **Tool 수**: 28개
- **OpenAPI 스펙 포함**: `salesmap-openapi.yaml` (유용한 레퍼런스)

---

## 아키텍처

```
salesmap-openapi.yaml     ← OpenAPI 3.0.3 스펙 (수동 작성)
    ↓ (코드 생성)
server/src/index.ts       ← 단일 파일, 900줄
    ├── toolDefinitionMap  ← 28개 tool 정의 (Map)
    ├── executeApiTool()   ← 범용 API 실행 엔진
    ├── getZodSchemaFromJsonSchema() ← JSON Schema → Zod 변환 (eval 사용)
    └── acquireOAuth2Token() ← OAuth2 토큰 캐시 (미사용 보일러플레이트)
```

**핵심 특징**: OpenAPI 스펙 → MCP tool 자동 매핑. API 엔드포인트 1개 = MCP tool 1개.

---

## Tool 목록 (28개)

### CRUD — 오브젝트별 개별 tool (20개)

| 오브젝트 | list | get | create | update |
|---|---|---|---|---|
| Organization | listOrganizations | getOrganization | createOrganization | updateOrganization |
| People | listPeople | getPeople | createPeople | updatePeople |
| Deal | listDeals | getDeal | createDeal | updateDeal |
| Lead | listLeads | getLead | createLead | updateLead |

### 검색 — 오브젝트별 개별 tool (4개)

| tool | 대상 |
|---|---|
| searchPeople | 고객 검색 |
| searchOrganizations | 회사 검색 |
| searchDeals | 딜 검색 |
| searchLeads | 리드 검색 |

### 기타 (4개)

| tool | 기능 |
|---|---|
| getDealPipeline | 딜 파이프라인 조회 |
| getLeadPipeline | 리드 파이프라인 조회 |
| getFieldDefinitions | 필드 정의 조회 |
| listUsers | 사용자 목록 |
| getMyInfo | 내 정보 |
| listMemos | 메모 목록 |
| createOrganizationMemo | 회사 메모 생성 |
| createPeopleMemo | 고객 메모 생성 |
| createDealMemo | 딜 메모 생성 |
| createLeadMemo | 리드 메모 생성 |

---

## 우리(tianjin)와 비교

| 항목 | ejlee/salesmap-mcp | 우리 (tianjin) |
|---|---|---|
| **Tool 수** | 28개 | 17개 |
| **설계 패턴** | 1 API = 1 tool (OpenAPI 직역) | generic objectType 패턴 (1 tool = 전 오브젝트) |
| **Transport** | Stdio (로컬 전용) | Streamable HTTP (Vercel, 리모트) |
| **인증** | env 싱글 테넌트 | 요청별 Bearer 멀티 테넌트 |
| **필드 식별** | `fieldId` (UUID) | `name` (한글 이름) |
| **검색 필터** | `filterList` (flat, fieldId) | `filterGroupList` (OR/AND, fieldName) |
| **응답 필터링** | 없음 (raw 응답 그대로) | `compactRecords` (null/파이프라인 필드 제거) |
| **에러 힌트** | 없음 (axios 에러 메시지만) | `errWithSchemaHint` (6패턴 컨텍스트 힌트) |
| **pre-validation** | 없음 | UUID 검증, 필수 필드 검증 |
| **MCP Annotations** | 없음 | readOnlyHint, destructiveHint, idempotentHint |
| **Description** | API summary 그대로 (1줄) | 구조화 (Purpose/Prerequisites/Guardrails) |
| **Rate limit** | 없음 | 120ms 간격 + 429 retry |
| **배포** | 로컬 빌드 후 수동 실행 | Vercel 자동 배포 |

---

## 핵심 설계 차이

### 1. Tool 수 폭발 (28 vs 17)
- ejlee: `createOrganization`, `createPeople`, `createDeal`, `createLead` → 4개 따로
- 우리: `salesmap_create_record(type="organization")` → 1개로 통합
- LLM 컨텍스트 윈도우 비용: ejlee가 ~2배

### 2. fieldId vs fieldName
- ejlee: `fieldId: "uuid-of-field"` → LLM이 UUID를 알아야 함 (hallucination 위험)
- 우리: `fieldName: "담당자"` → 한글 이름 직접 사용 (자연스러움)

### 3. 검색 구조
- ejlee: `filterList` (flat AND only) — OR 조합 불가
- 우리: `filterGroupList` (그룹 간 OR, 그룹 내 AND)

### 4. OpenAPI 스펙의 가치
- `salesmap-openapi.yaml`은 세일즈맵 API의 공식 문서가 아닌 수동 작성 스펙
- 하지만 엔드포인트/파라미터 정리가 잘 되어 있어서 참고 가치 있음
- 우리 `salesmap-api-reference.md`와 교차 검증 가능

### 5. 배포/온보딩
- 사용자가 직접 git clone → npm build → settings.json 설정 필요
- 설치 가이드 (`docs/setup-guide.md`) + 슬랙 메시지 템플릿 (`docs/slack-message.md`) 제공
- 우리는 mcp-remote로 원격 접속 → 빌드 불필요

---

## 우리가 참고할 것

1. **OpenAPI 스펙** — `salesmap-openapi.yaml`을 API 레퍼런스 교차 검증에 활용
2. **설치 가이드 패턴** — 비개발자 대상 step-by-step 가이드. 우리도 고객 온보딩 문서 필요 시 참고
3. **슬랙 메시지 템플릿** — "Claude Code에 복붙하면 알아서 설치됨" 패턴. 영리한 배포 방식
