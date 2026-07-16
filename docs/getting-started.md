# 시작하기

세일즈맵을 AI에 연결하면, 대화만으로 CRM 조회·기록·분석을 할 수 있습니다.
사용하는 AI 서비스의 탭을 선택해 따라 하세요.

> **연결에 필요한 것 단 2개**
> 1. 서버 주소: `https://mcp.ai.salesmap.kr/mcp`
> 2. 세일즈맵 API 토큰 (아래에서 준비)

---

## 1단계: 세일즈맵 API 토큰 준비

1. [세일즈맵](https://salesmap.kr) 접속 → 좌측 하단 **설정**
2. **개인 → 연동 → API** 메뉴로 이동
3. **이미 토큰이 있다면 → 복사** / **토큰이 없다면 → 토큰 생성** 클릭 후 복사

`[이미지 1: 세일즈맵 설정 > 개인 > 연동 > API 토큰 화면]`

{% hint style="warning" %}
**토큰을 재발급하면 기존 연동(웹훅·자동화·다른 AI 연결 등)이 전부 끊깁니다.** 이미 토큰이 있다면 새로 만들지 말고 복사해서 사용하세요.
{% endhint %}

{% hint style="info" %}
API는 무료(Free) 또는 Professional 이상 플랜에서 제공됩니다 (Starter 플랜 제외).
토큰은 발급한 사용자의 권한을 따르며, 비밀번호와 같으니 다른 사람과 공유하지 마세요.
{% endhint %}

---

## 2단계: AI에 연결

{% tabs %}
{% tab title="Claude" %}
**요건**: Claude 유료 플랜 (Pro/Max/Team/Enterprise)

1. [claude.ai](https://claude.ai) 접속 → 좌측 하단 프로필 → **설정** → **커넥터**
2. **커스텀 커넥터 추가** 클릭

`[이미지 2: Claude 설정 > 커넥터 > 커스텀 커넥터 추가 버튼]`

3. 아래와 같이 입력 후 **추가**:
   - 이름: `세일즈맵`
   - 원격 MCP 서버 URL: `https://mcp.ai.salesmap.kr/mcp`
   - (고급 설정은 건드리지 않아도 됩니다)

`[이미지 3: 커스텀 커넥터 추가 다이얼로그 입력 화면]`

4. **연결** 클릭 → 브라우저에 세일즈맵 연결 페이지가 열립니다
5. 복사해 둔 **API 토큰을 붙여넣고 [연결 승인]** 클릭

`[이미지 4: 세일즈맵 MCP 연결 — 토큰 입력 페이지]`

6. 끝! 대화창에서 커넥터가 켜져 있는지 확인하고 바로 사용하세요.

{% hint style="info" %}
데스크톱 앱에서도 동일하게 설정 → 커넥터에서 추가할 수 있습니다.
{% endhint %}
{% endtab %}

{% tab title="ChatGPT" %}
**요건**: ChatGPT 유료 플랜 (Plus/Pro/Business/Enterprise) + 개발자 모드

1. [chatgpt.com](https://chatgpt.com) 접속 → 프로필 → **설정**
2. **커넥터(Connectors)** → **고급 설정** → **개발자 모드(Developer mode)** 켜기

`[이미지 5: ChatGPT 설정 > 개발자 모드 토글]`

3. 커넥터 목록에서 **만들기(Create)** 클릭 후 입력:
   - 이름: `세일즈맵`
   - MCP 서버 URL: `https://mcp.ai.salesmap.kr/mcp`
   - 인증: **OAuth**

`[이미지 6: ChatGPT 커넥터 만들기 입력 화면]`

4. **만들기** 클릭 → 세일즈맵 연결 페이지가 열립니다
5. **API 토큰을 붙여넣고 [연결 승인]** 클릭
6. 대화창에서 도구 아이콘 → 세일즈맵 커넥터를 켜고 사용하세요.
{% endtab %}

{% tab title="Gemini" %}
**요건**: 개인 Google 계정 (현재 Google 정책상 미국 계정 한정 — 국내 오픈 시 업데이트 예정)

1. [gemini.google.com](https://gemini.google.com) 접속 → **설정 → Connected Apps**
2. **앱 추가**에 서버 URL 입력: `https://mcp.ai.salesmap.kr/mcp`
3. 세일즈맵 연결 페이지가 열리면 **API 토큰을 붙여넣고 [연결 승인]**
{% endtab %}

{% tab title="Claude Code" %}
터미널에서 한 줄:

```bash
claude mcp add --transport http salesmap https://mcp.ai.salesmap.kr/mcp \
  --header "Authorization: Bearer <API_토큰>"
```

확인: `claude mcp list` 에서 salesmap ✓ connected
{% endtab %}

{% tab title="Codex" %}
터미널에서 두 줄:

```bash
# ~/.zshrc 또는 ~/.bashrc 에 추가 후 터미널 재시작 (토큰을 파일에 남기지 않는 방식)
export SALESMAP_API_TOKEN="<API_토큰>"

codex mcp add salesmap --url https://mcp.ai.salesmap.kr/mcp --bearer-token-env-var SALESMAP_API_TOKEN
```

Codex 실행 후 `/mcp`로 연결 확인.
{% endtab %}

{% tab title="Antigravity" %}
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

{% hint style="warning" %}
Antigravity는 `serverUrl` 키를 씁니다 — `url`이나 `httpUrl`은 인식되지 않습니다.
{% endhint %}

저장 후 MCP 패널 새로고침 → salesmap 도구 목록이 보이면 성공.
{% endtab %}

{% tab title="기타" %}
원격 MCP(Streamable HTTP)를 지원하는 클라이언트라면 아래 두 값만 넣으면 됩니다:

- 서버 URL: `https://mcp.ai.salesmap.kr/mcp`
- 헤더: `Authorization: Bearer <API_토큰>`
{% endtab %}
{% endtabs %}

---

## 3단계: 연결 확인

연결 후 AI에게 이렇게 요청해 보세요:

```
세일즈맵에서 내 정보 조회해줘
```

사용자 정보가 나오면 연결 성공입니다. 다른 예시:

```
딜 파이프라인 목록 보여줘
고객 중에 "김"으로 시작하는 사람 검색해줘
```

---

## 문제 해결

| 증상 | 해결 |
|---|---|
| "토큰이 유효하지 않습니다" | 토큰 앞뒤 공백 제거 후 재시도. 세일즈맵에서 토큰 다시 복사 |
| "허용되지 않은 IP" | 워크스페이스에 IP 접근 제한이 있는 경우 — 관리자에게 IP 허용 목록 확인 요청 |
| AI가 세일즈맵 도구를 찾지 못함 | 클라이언트 재시작, 설정 파일 문법(쉼표·따옴표) 확인 |
| 응답이 평소보다 느림 | 같은 워크스페이스 동시 사용 시 일시적 현상 — 자동 처리되므로 대기 |
| 연결을 끊고 싶어요 | AI 서비스의 커넥터 설정에서 세일즈맵 제거. 토큰 무효화는 세일즈맵에서 토큰 삭제 |

{% hint style="info" %}
기존에 JSON 파일(`salesmap-mcp.vercel.app` 주소)로 설정하신 경우 그대로 동작합니다 — 다시 설정할 필요 없습니다.
{% endhint %}

---

문의: 세일즈맵 채널톡 또는 담당 매니저에게 연락해 주세요.
