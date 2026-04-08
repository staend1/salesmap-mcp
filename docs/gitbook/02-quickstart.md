# 시작하기

5분이면 Claude Desktop에서 세일즈맵 CRM을 사용할 수 있습니다.

## 사전 준비

- 세일즈맵 계정 (API 토큰 발급 가능한 권한)
- [Claude Desktop](https://claude.ai/download) 설치

## 1단계: API 토큰 발급

1. 세일즈맵에 로그인합니다
2. **설정 → API** 메뉴로 이동합니다
3. **토큰 생성**을 클릭하여 API 토큰을 발급합니다
4. 생성된 토큰을 복사해 두세요 (한 번만 표시됩니다)

> 토큰은 발급한 사용자의 권한으로 동작합니다. 관리자 권한 토큰은 모든 데이터에 접근할 수 있으므로 주의하세요.

## 2단계: Claude Desktop 설정

Claude Desktop의 MCP 설정 파일을 열어 아래 내용을 추가합니다.

**설정 파일 위치:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "salesmap": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://salesmap-mcp.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer 여기에_API_토큰_입력"
      ]
    }
  }
}
```

`여기에_API_토큰_입력` 부분을 1단계에서 발급받은 토큰으로 교체하세요.

> `npx`를 사용하려면 [Node.js](https://nodejs.org/) **v20 이상**이 필요합니다. 터미널에서 `node -v`로 버전을 확인하세요.

## 3단계: 연결 확인

1. Claude Desktop을 **재시작**합니다
2. 채팅 입력창 하단에 🔨 아이콘이 표시되는지 확인합니다
3. 아이콘을 클릭하면 `salesmap_` 으로 시작하는 도구 목록이 보입니다

## 첫 대화 해보기

연결이 완료되면 Claude에게 바로 요청해 보세요:

```
세일즈맵에서 내 정보 조회해줘
```

Claude가 `salesmap_get_current_user` 도구를 호출하여 현재 로그인된 사용자 정보를 보여줍니다. 이 응답이 정상적으로 오면 연결 성공입니다.

다른 요청 예시:
```
딜 파이프라인 목록 보여줘
```
```
고객 중에 "김" 으로 시작하는 사람 검색해줘
```

## 문제 해결

| 증상 | 해결 방법 |
|------|----------|
| 🔨 아이콘이 안 보임 | Claude Desktop 재시작. 설정 파일 JSON 형식 확인 |
| "토큰이 유효하지 않습니다" | API 토큰이 정확한지 확인. 토큰 앞뒤 공백 제거 |
| "File is not defined" 에러 | Node.js 버전이 낮습니다. v20 이상으로 업그레이드 필요 (`node -v`로 확인) |
| "npx를 찾을 수 없습니다" | Node.js 설치 확인 (`node -v`로 확인) |
| 도구 호출 시 타임아웃 | 네트워크 연결 확인. VPN 사용 시 끄고 재시도 |

---

다음 단계: [도구 레퍼런스 →](03-tools.md)
