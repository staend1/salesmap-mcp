# OAuth 2.1 셤(Shim) 설계 — 커스텀 커넥터 대응

> 목표: 고객이 JSON 설정 없이 **URL 붙여넣기 → 브라우저에서 API 토큰 1회 입력**으로 연결.
> Claude 커스텀 커넥터·ChatGPT 개발자 모드·Gemini Connected Apps 3개 플랫폼을 단일 구현으로 커버.
> 원칙: **stateless 유지 (DB 없음)** — 모든 상태는 암호화된 토큰/코드 안에 넣는다.
> 작성: 2026-07-08

---

## 1. 전체 흐름

```
[고객]                    [플랫폼(Claude 등)]              [우리 서버]
  │  커넥터 추가에 URL 입력      │                              │
  │ ───────────────────────▶│  POST /api/mcp (토큰 없음)      │
  │                          │ ───────────────────────────▶ │ 401 + WWW-Authenticate:
  │                          │                              │   resource_metadata=... ①
  │                          │  GET /.well-known/... 발견     │
  │                          │ ───────────────────────────▶ │ AS 메타데이터 반환 ②
  │                          │  POST /api/oauth/register     │
  │                          │ ───────────────────────────▶ │ client_id 발급 (서명, 무저장) ③
  │  브라우저 창 열림            │  GET /oauth/authorize?...     │
  │ ◀────────────────────────────────────────────────────── │ 토큰 입력 페이지 ④
  │  세일즈맵 API 토큰 붙여넣기    │                              │
  │ ─────────────────────────────────────────────────────▶ │ /v2/user/me로 토큰 검증
  │  "OO워크스페이스 연결 승인"    │                              │ → code 발급(암호화) ⑤
  │                          │  redirect_uri?code=...&state= │
  │                          │  POST /api/oauth/token        │
  │                          │ ───────────────────────────▶ │ PKCE 검증 → access_token ⑥
  │                          │  이후 Bearer <access_token>    │
  │                          │ ───────────────────────────▶ │ 기존 MCP 처리 (변경 없음) ⑦
```

## 2. 엔드포인트 (6개 신설 + 1개 수정)

| # | 경로 | 역할 | 상태 저장 |
|---|---|---|---|
| ① | `POST /api/[transport]` (기존 수정) | 토큰 없으면 401 + `WWW-Authenticate: Bearer resource_metadata="<PRM URL>"` 헤더 추가 | — |
| ② | `GET /.well-known/oauth-protected-resource` | RFC 9728. authorization server = 우리 자신 | 없음 |
| ②′| `GET /.well-known/oauth-authorization-server` | RFC 8414. authorize/token/register 엔드포인트·PKCE S256 광고 | 없음 |
| ③ | `POST /api/oauth/register` | RFC 7591 DCR. client_id 발급 | **없음** — client_id 자체에 서명해서 넣음 |
| ④ | `GET /oauth/authorize` | 토큰 입력 + 동의 HTML 페이지 | 없음 |
| ⑤ | `POST /oauth/authorize` | 토큰 검증(`/v2/user/me`) → code 발급 → redirect | **없음** — code에 암호화해 넣음 |
| ⑥ | `POST /api/oauth/token` | code + PKCE verifier → access_token | 없음 |

## 3. Stateless 트릭 (핵심 설계)

DB 없이 OAuth를 돌리기 위해 상태를 전부 암호화 페이로드로 만든다. 서버엔 env 시크릿 하나만 추가: `OAUTH_SHIM_SECRET` (32byte, AES-256-GCM + HMAC 겸용).

### client_id = 서명된 클라이언트 메타데이터
```
client_id = base64url({ redirect_uris: [...], iat }) + "." + HMAC(payload)
```
- register에서 발급, authorize/token에서 서명 검증 → **등록 DB 불필요**
- redirect_uri 검증을 client_id 안의 목록과 대조

### authorization code = 암호화된 5분짜리 티켓
```
code = AES-GCM({
  smToken:        <세일즈맵 API 토큰>,
  code_challenge: <PKCE S256 챌린지>,
  client_id, redirect_uri,
  exp: now + 5min
})
```
- token 엔드포인트에서 복호화 → exp·client_id·redirect_uri 일치 검증 → `S256(verifier) == code_challenge` 확인
- 재사용(replay) 방지는 stateless라 불가하지만 PKCE가 실질 방어 (verifier 없으면 교환 불가, 5분 TTL)

### access_token = 세일즈맵 API 토큰 그대로
- 교환 결과로 세일즈맵 토큰을 verbatim 반환 → **기존 Bearer 처리 코드 무변경**
- `expires_in` 미포함(만료 없음), refresh_token 없음 — 세일즈맵 토큰 자체가 무만료라 대칭
- 트레이드오프: 플랫폼(Claude 등)이 세일즈맵 토큰 원문을 보관하게 됨. 현재 JSON 방식과 동일한 노출 수준이라 보안 후퇴는 아님. 향후 래핑(암호화 토큰) 전환 여지는 getClient에서 "복호화 시도 → 실패 시 raw" 폴백으로 열어둠.

## 4. redirect_uri 허용 정책

DCR로 등록된 redirect_uris를 그대로 믿되, **호스트 허용 목록**으로 제한:

```
claude.ai, claude.com            (Claude 웹/데스크톱)
chatgpt.com                       (ChatGPT: /connector_platform_oauth_redirect)
gemini.google.com, *.google.com   (Gemini Connected Apps)
localhost, 127.0.0.1              (mcp-remote·Claude Code·인스펙터 — http 허용)
```
- 그 외 도메인은 register 시점에 400 거부
- https 강제 (localhost 제외)

## 5. 토큰 입력 페이지 (④) UX

```
┌─────────────────────────────────────────┐
│  세일즈맵 MCP 연결                          │
│                                          │
│  [Claude]이(가) 세일즈맵 데이터 접근을        │
│  요청합니다.                                │
│                                          │
│  세일즈맵 API 토큰                          │
│  ┌────────────────────────────────────┐  │
│  │ ____________________________       │  │
│  └────────────────────────────────────┘  │
│  토큰 위치: 세일즈맵 → 설정 → 개인 → 연동    │
│  → API → 토큰 생성  [바로가기 링크]          │
│                                          │
│              [ 연결 승인 ]                 │
└─────────────────────────────────────────┘

승인 클릭 → 서버가 /v2/user/me 호출로 토큰 검증
  ├─ 유효: "OO님 (OO 워크스페이스)로 연결합니다" 확인 후 redirect
  └─ 무효: "토큰이 유효하지 않습니다" 인라인 에러 (401/IP제한 구분 표시)
```

- 클라이언트명은 DCR의 `client_name` 표시 (Claude/ChatGPT/Gemini)
- state 파라미터 그대로 회송, CSRF는 폼 hidden 필드로 전달
- 페이지는 서버 컴포넌트 1개 (`app/oauth/authorize/page.tsx`) + 스타일 인라인 — 의존성 추가 없음

## 6. 파일 구조

```
app/
  .well-known/
    oauth-protected-resource/route.ts      ②
    oauth-authorization-server/route.ts    ②′
  api/
    oauth/
      register/route.ts                    ③
      token/route.ts                       ⑥
    [transport]/route.ts                   ① 401 헤더 추가만
  oauth/
    authorize/
      page.tsx                             ④ 입력 페이지
      actions.ts (또는 route)               ⑤ 검증→code→redirect
src/
  oauth.ts                                 시크릿·암호화·서명·PKCE 유틸 (신규, ~150줄)
```

## 7. 하위 호환

- **기존 Bearer 직접 전달(JSON/mcp-remote) 그대로 동작** — access_token이 세일즈맵 토큰 verbatim이라 코드 경로 동일
- 401 응답에 헤더만 추가되므로 기존 클라이언트 영향 없음
- 텔레메트리 fingerprint도 동일 토큰 기준이라 연속성 유지

## 8. 보안 체크리스트

- [x] PKCE S256 강제 (plain 거부)
- [x] code TTL 5분 + client_id/redirect_uri 바인딩
- [x] redirect 호스트 허용 목록
- [x] 토큰 검증을 서버측에서 (`/v2/user/me`) — 무효 토큰으로 code 발급 안 됨
- [x] OAUTH_SHIM_SECRET 미설정 시 OAuth 엔드포인트 503 (기존 Bearer 경로는 무관)
- [ ] authorize 페이지 rate limit (v1 스킵 — 세일즈맵 API rate limit이 자연 방어)
- [ ] code 단일 사용 강제 (stateless라 불가 — PKCE+5분 TTL로 갈음, 문서화)

## 9. 검증 계획

1. 로컬: MCP Inspector로 OAuth 플로우 e2e
2. Claude.ai 커스텀 커넥터에 실제 등록 → 토큰 페이지 → 도구 호출까지
3. ChatGPT 개발자 모드 등록 (redirect allowlist 확인)
4. 기존 mcp-remote(JSON) 경로 회귀 테스트
5. 텔레메트리로 신규 연결 유입 관찰

## 10. 구현 순서 (예상 1.5~2일)

1. `src/oauth.ts` 유틸 (암호화·서명·PKCE) + 단위 테스트
2. well-known 2개 + register + token (순수 API — Inspector로 즉시 검증 가능)
3. authorize 페이지 + 검증 액션
4. route.ts 401 헤더 + Vercel env 시크릿 추가
5. e2e (Claude.ai / ChatGPT) → 설치 가이드 문서 갱신
