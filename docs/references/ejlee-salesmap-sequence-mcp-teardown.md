# ejlee/salesmap-sequence-mcp 해체 분석

> 분석 기준: https://github.com/ejlee-0924/salesmap-sequence-mcp.git (2026-04-08)

---

## 기본 정보
- **목적**: 세일즈맵 시퀀스(이메일 자동화) 데이터를 MCP로 조회
- **Transport**: Stdio (로컬 전용)
- **인증**: `config.json`에 쿠키(`iter-session`) + roomId 저장 — 싱글 테넌트
- **SDK**: `@modelcontextprotocol/sdk` ^1.10.0 (Low-level Server API)
- **언어**: JavaScript (ESM, TypeScript 미사용)
- **Tool 수**: 3개

---

## 아키텍처

```
config.json (roomId + cookie)
    ↓
index.js              ← 단일 파일, ~240줄
    ├── TOOLS[]       ← 3개 tool 정의 (raw inputSchema)
    ├── switch/case   ← tool 라우팅
    └── SalesmapClient (salesmap-client.js)
        └── fetchApi()  ← Remix data route 직접 호출
```

**핵심 특징**: 공식 API가 아닌 세일즈맵 웹앱의 **Remix data route**를 직접 호출.

---

## API 접근 방식 — Remix Data Route Scraping

이 서버는 세일즈맵 REST API v2를 사용하지 않는다. 대신 세일즈맵 웹앱(Remix 프레임워크)의 내부 data route에 쿠키 인증으로 접근한다.

### 호출 패턴
```
GET https://salesmap.kr/{roomId}/automation/sequence
    ?_data=routes/$roomId+/automation+/sequence+/_index/_route

GET https://salesmap.kr/{roomId}/automation/sequence/{id}/detail/enroll-list
    ?_data=routes/$roomId+/automation+/sequence+/$sequenceId.detail/route
```

- `_data` 쿼리 파라미터: Remix의 loader data를 JSON으로 직접 받는 패턴
- 인증: 브라우저 세션 쿠키 (`iter-session`)
- 쿠키 만료: ~30일 → 수동 갱신 필요

### 시사점
- **공식 API에 시퀀스 엔드포인트가 없음** → 웹앱 내부 route를 직접 호출할 수밖에 없었음
- Remix `_data` 패턴은 프레임워크 내부 규약이라 세일즈맵 프론트엔드 업데이트 시 깨질 수 있음
- 쿠키 인증이라 API 토큰 기반 멀티테넌트 불가

---

## Tool 목록 (3개)

| Tool | 설명 | 파라미터 |
|------|------|----------|
| `salesmap_list_sequences` | 시퀀스 목록 + 성과 지표 | `folder_id`, `owner_name`, `status`, `page`, `fetch_all` |
| `salesmap_get_sequence_detail` | 시퀀스 상세 (이메일 제목/본문/스텝) | `sequence_id` (필수), `full_body` |
| `salesmap_list_folders` | 시퀀스 폴더 목록 | 없음 |

### 응답 구조

**list_sequences 응답 필드:**
```
id, name, status, owner, folder,
enrollCount, finishedEnrollCount,
openCount, clickCount, replyCount, bounceCount,
openRate (계산), clickRate (계산),
createdAt, updatedAt
```

**get_sequence_detail 응답 필드:**
```
id, name, description, status,
executionType, enrollType, folder,
steps[]:
  stepNumber, type, emailSenderName, emailAddress,
  executeImmediately, businessDay, executionTime,
  templates[]:
    name, subject, body (500자 미리보기 or full HTML)
```

---

## 우리(tianjin)와 비교

| 항목 | ejlee/sequence-mcp | 우리 (tianjin) |
|------|---|---|
| **API 방식** | Remix data route (비공식) | REST API v2 (공식) |
| **인증** | 브라우저 쿠키 (수동 갱신 ~30일) | Bearer 토큰 (멀티테넌트) |
| **시퀀스 지원** | ✅ 3개 tool | ❌ 없음 (API 미제공) |
| **Transport** | Stdio (로컬) | Streamable HTTP (Vercel) |
| **언어** | JavaScript (타입 없음) | TypeScript + Zod |
| **SDK 사용법** | Low-level (Server + setRequestHandler) | High-level (McpServer + server.tool) |
| **에러 처리** | 쿠키 만료/리다이렉트 감지 | errWithSchemaHint (6패턴) |
| **MCP Annotations** | 없음 | readOnlyHint, destructiveHint |
| **필터링** | 클라이언트 사이드 (fetch_all → filter) | 서버 사이드 (search API) |

---

## 기술적 특이사항

### 1. 클라이언트 사이드 필터링
API가 서버 사이드 필터를 지원하지 않아서 `fetch_all=true`로 전체를 가져온 후 JS에서 필터링:
```js
if (args?.folder_id) filtered = filtered.filter(s => s.folder?._id === args.folder_id);
if (args?.owner_name) filtered = filtered.filter(s => s.owner?.name?.includes(args.owner_name));
if (args?.status) filtered = filtered.filter(s => s.status === args.status);
```

### 2. HTML → 텍스트 변환
이메일 본문이 HTML로 오기 때문에 정규식으로 태그 제거:
```js
html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    // ...
```
`full_body=false`(기본)이면 500자 미리보기만 반환 — LLM 컨텍스트 절약용.

### 3. 쿠키 만료 감지
301/302 리다이렉트 또는 non-JSON 응답 → "쿠키 만료" 에러 메시지. `redirect: 'manual'`로 자동 리다이렉트 방지.

### 4. 페이지네이션
- 50개씩 페이지네이션
- `fetch_all=true`면 반복 호출로 전체 가져옴 (시퀀스 수가 많으면 느림)
- 총 시퀀스 수는 `totalSequenceCount`에서 확인

---

## 우리가 참고할 것

1. **시퀀스 데이터 구조** — enrollCount, openCount, clickCount 등 성과 지표 필드명과 구조. 나중에 시퀀스 API가 공식 제공되면 이 구조를 기반으로 tool 설계 가능.

2. **Remix data route 패턴** — 공식 API가 없는 기능에 접근하는 우회 방법. 단, 프로덕션 서비스에는 부적절 (쿠키 만료, 내부 route 변경 리스크).

3. **HTML 본문 처리** — 이메일 본문 조회 시 HTML→텍스트 변환 + 500자 미리보기 패턴. 우리 memo/email tool에 적용 가능.

4. **시퀀스 관련 TODO 시사점** — 세일즈맵에 시퀀스 REST API가 생기면 우리 서버에 추가해야 할 기능:
   - 시퀀스 목록/상세 조회
   - 성과 지표 (오픈율, 클릭율, 반송율)
   - 시퀀스 폴더 관리
   - 레코드의 시퀀스 등록/해제 (delete 도구의 "시퀀스 등록 레코드 삭제 불가" 제약과 연결)

---

## ejlee/salesmap-mcp vs ejlee/salesmap-sequence-mcp

| 항목 | salesmap-mcp | salesmap-sequence-mcp |
|------|---|---|
| **대상** | CRM 레코드 (CRUD) | 시퀀스 (조회만) |
| **API** | REST API v2 (공식) | Remix data route (비공식) |
| **인증** | Bearer 토큰 | 브라우저 쿠키 |
| **Tool 수** | 28개 | 3개 |
| **SDK 스타일** | McpServer (high-level) | Server (low-level) |
| **언어** | TypeScript | JavaScript |

같은 개발자가 만든 두 서버인데, CRM 레코드는 공식 API로, 시퀀스는 비공식 route로 접근. 이는 세일즈맵 API v2에 시퀀스 엔드포인트가 아직 없다는 것을 확인해준다.
