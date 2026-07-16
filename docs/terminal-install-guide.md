# 세일즈맵 MCP — 터미널·코딩 도구 설치 가이드

Claude Code, OpenAI Codex, Google Antigravity 등 **개발 도구**에서 세일즈맵 MCP를 연결하는 방법입니다.

> Claude·ChatGPT·Gemini **앱**에서 쓰시려면 → [커넥터 연결 가이드](connector-guide.md) (더 간단합니다)

**공통 준비물**
- 서버 주소: `https://mcp.ai.salesmap.kr/mcp`
- 세일즈맵 API 토큰: 세일즈맵 → 설정 → 개인 → 연동 → API → 토큰 생성
  (토큰은 발급한 사용자의 권한을 따릅니다 — 읽기 전용 사용자의 토큰으론 쓰기 도구 사용 불가)

---

## Claude Code

터미널에서 한 줄:

```bash
claude mcp add --transport http salesmap https://mcp.ai.salesmap.kr/mcp \
  --header "Authorization: Bearer <API_토큰>"
```

또는 토큰을 커맨드에 남기고 싶지 않다면 **OAuth 방식** — 토큰 없이 추가한 뒤 브라우저에서 입력:

```bash
claude mcp add --transport http salesmap https://mcp.ai.salesmap.kr/mcp
```
이후 Claude Code 세션에서 `/mcp` → salesmap 인증 → 브라우저가 열리면 API 토큰 붙여넣고 승인.

확인:
```bash
claude mcp list        # salesmap ✓ connected 확인
```

---

## OpenAI Codex

`~/.codex/config.toml`에 추가:

```toml
[mcp_servers.salesmap]
url = "https://mcp.ai.salesmap.kr/mcp"
bearer_token_env_var = "SALESMAP_API_TOKEN"
```

토큰은 환경변수로 (설정 파일에 토큰 원문을 남기지 않는 방식):

```bash
# ~/.zshrc 또는 ~/.bashrc 에 추가
export SALESMAP_API_TOKEN="<API_토큰>"
```

터미널 재시작(또는 `source ~/.zshrc`) 후 Codex 실행 → `/mcp`로 연결 확인.

---

## Google Antigravity

Antigravity 설정 → **Customizations 탭 → Open MCP Config** 클릭
(파일 위치: `~/.gemini/config/mcp_config.json`)

```json
{
  "mcpServers": {
    "salesmap": {
      "serverUrl": "https://mcp.ai.salesmap.kr/mcp",
      "headers": {
        "Authorization": "Bearer <API_토큰>"
      }
    }
  }
}
```

> ⚠️ Antigravity는 `serverUrl` 키를 씁니다 — `url`이나 `httpUrl`은 인식되지 않습니다.

저장 후 MCP 패널에서 새로고침 → salesmap 도구 목록이 보이면 연결 성공.

---

## 기타 MCP 클라이언트 (범용)

Streamable HTTP 원격 MCP를 지원하는 클라이언트라면:
- URL: `https://mcp.ai.salesmap.kr/mcp`
- 헤더: `Authorization: Bearer <API_토큰>`
- OAuth를 지원하는 클라이언트라면 헤더 없이 URL만 넣어도 브라우저 인증 플로우가 동작합니다.

HTTP 원격을 지원하지 않는 구형 클라이언트(stdio 전용)는 mcp-remote 브리지 사용:
```json
{
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://mcp.ai.salesmap.kr/mcp",
           "--header", "Authorization: Bearer <API_토큰>"]
}
```
(Node.js 20 이상 필요)

---

## 연결 확인 (공통)

연결 후 AI에게:
```
세일즈맵에서 내 정보 조회해줘
```
`salesmap-get-user-details` 도구가 호출되어 사용자 정보가 나오면 성공입니다.

다른 예시:
```
딜 파이프라인 목록 보여줘
고객 중에 "김"으로 시작하는 사람 검색해줘
```

## 문제 해결

| 증상 | 해결 |
|---|---|
| 도구를 찾지 못함 | 클라이언트 재시작, 설정 파일 문법(쉼표·따옴표) 확인 |
| "토큰이 유효하지 않습니다" | 토큰 앞뒤 공백 제거, 세일즈맵에서 토큰 재확인 |
| "허용되지 않은 IP" | 워크스페이스 관리에서 IP 허용 목록 확인 |
| 401 Unauthorized | `Bearer ` 접두사 포함 여부 확인 (`Authorization: Bearer 토큰`) |
| 도구 호출 타임아웃 | 네트워크 확인. 대량 작업은 salesmap-run-script 사용 권장 |

> 기존에 `salesmap-mcp.vercel.app/api/mcp` 주소로 설정하신 경우 그대로 동작합니다 — 변경 불필요.
