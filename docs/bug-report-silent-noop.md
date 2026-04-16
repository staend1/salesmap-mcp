# 버그 리포트: 수정 API의 Silent No-op + 미인식 파라미터 무시

> 작성: 2026-04-14
> 작성자: CX팀 (MCP 서버 구현 중 발견)
> 환경: SalesMap API v2, Production

---

## 1. 요약

레코드 수정 API(`POST /v2/{type}/{id}`)가 **인식하지 않는 파라미터를 에러 없이 무시**합니다. `success: true` + HTTP 200을 반환하지만 실제로는 아무 값도 변경되지 않습니다.

두 가지 문제가 겹쳐 있습니다:

| 구분 | 설명 | 심각도 |
|------|------|--------|
| **A. Silent No-op** | gitbook에 문서화된 top-level 파라미터(`ownerId`, `email`, `phone` 등)가 실제로 작동하지 않음 | 높음 |
| **B. 미인식 파라미터 무시** | 완전히 존재하지 않는 파라미터(`foobar`, `amount` 등)도 200 성공 반환 | 중간 |

---

## 2. 재현 방법

### 준비

```bash
TOKEN="f1911727-0a27-4380-a4ec-86e18020e598"
PEOPLE_ID="0195127c-ff6f-7556-95c7-b29890cb8359"  # 테스트1
```

### A. Silent No-op 재현 — `ownerId`

**기대**: 담당자가 변경됨
**실제**: 200 OK + 담당자 그대로

```bash
# 1. 현재 담당자 확인
curl -s "https://salesmap.kr/api/v2/people/$PEOPLE_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['people'][0]
print(f'담당자: {d.get(\"담당자\")}')"
# → 담당자: {'id': '0a538c60-...', 'name': '양시열'}

# 2. top-level ownerId로 변경 시도
curl -s -X POST "https://salesmap.kr/api/v2/people/$PEOPLE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ownerId":"12cfcc1f-24cf-4b9c-b36e-7a2e386fc649"}'
# → {"success": true, "data": {"people": {"id": "...", "name": "테스트1", "updatedAt": "..."}}}

# 3. 변경 확인
curl -s "https://salesmap.kr/api/v2/people/$PEOPLE_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['people'][0]
print(f'담당자: {d.get(\"담당자\")}')"
# → 담당자: {'id': '0a538c60-...', 'name': '양시열'}  ← 그대로!
```

### A-2. Silent No-op 재현 — `email`

```bash
# 현재 이메일: fieldlist-test@example.com

curl -s -X POST "https://salesmap.kr/api/v2/people/$PEOPLE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"silent-noop-changed@example.com"}'
# → {"success": true, ...}

curl -s "https://salesmap.kr/api/v2/people/$PEOPLE_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json,sys; d=json.load(sys.stdin)['data']['people'][0]
print(f'이메일: {d.get(\"이메일\")}')"
# → 이메일: fieldlist-test@example.com  ← 그대로!
```

### A-3. Silent No-op — Deal `ownerId`도 동일

```bash
DEAL_ID="01982ae8-d268-788f-8b26-1474c7b0b3bc"

curl -s -X POST "https://salesmap.kr/api/v2/deal/$DEAL_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ownerId":"12cfcc1f-24cf-4b9c-b36e-7a2e386fc649"}'
# → {"success": true, ...}
# → 담당자 확인: 변경 안 됨
```

### B. 미인식 파라미터 무시

```bash
# 완전히 존재하지 않는 파라미터
curl -s -X POST "https://salesmap.kr/api/v2/people/$PEOPLE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"foobar":"hello","nonExistentField":12345}'
# → {"success": true, ...}  ← 에러 없음

# deal에도 동일
curl -s -X POST "https://salesmap.kr/api/v2/deal/$DEAL_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":999999,"wrongField":"test"}'
# → {"success": true, ...}  ← 에러 없음, 금액도 안 바뀜 (금액은 "price"만 작동)

# 빈 body도 성공
curl -s -X POST "https://salesmap.kr/api/v2/people/$PEOPLE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
# → {"success": true, ...}
```

---

## 3. Silent No-op 전체 검증 결과

2026-04-14 프로덕션 API에서 직접 검증:

| 오브젝트 | 파라미터 | 문서 | 실제 | 결과 |
|----------|----------|------|------|------|
| **People** | `name` | ✅ | ✅ 반영 | 정상 |
| **People** | `organizationId` | ✅ | (미검증) | — |
| **People** | `ownerId` | ✅ 문서에 있음 | ❌ 미반영 | **Silent No-op** |
| **People** | `email` | ✅ 문서에 있음 | ❌ 미반영 | **Silent No-op** |
| **People** | `phone` | ✅ 문서에 있음 | ❌ 미반영 | **Silent No-op** |
| **Organization** | `name` | ✅ | ✅ 반영 | 정상 |
| **Organization** | `ownerId` | ❌ 문서에 없음 | ❌ 미반영 | 미인식 무시 |
| **Organization** | `phone` | ❌ 문서에 없음 | ❌ 미반영 | 미인식 무시 |
| **Deal** | `name` | ✅ | ✅ 반영 | 정상 |
| **Deal** | `price` | ✅ | ✅ 반영 | 정상 |
| **Deal** | `status` | ✅ | (미검증) | — |
| **Deal** | `pipelineId` | ✅ | (미검증) | — |
| **Deal** | `peopleId` | ✅ | ✅ 반영 | 정상 |
| **Deal** | `ownerId` | ✅ 문서에 있음 | ❌ 미반영 | **Silent No-op** |
| **Deal** | `amount` | ❌ 없음 | ❌ 미반영 | 미인식 무시 |
| **Lead** | `ownerId` | ✅ 문서에 있음 | ❌ 미반영 | **Silent No-op** |
| **모든 타입** | `foobar` | ❌ 없음 | ❌ 미반영 | 미인식 무시 |
| **모든 타입** | `{}` (빈 body) | — | ✅ 200 | 미인식 무시 |

**핵심**: `ownerId`가 **전 오브젝트에서 Silent No-op**. gitbook에는 People/Deal/Lead에서 작동한다고 문서화되어 있으나 실제로는 아무 오브젝트에서도 작동하지 않음.

---

## 4. 영향

### 사용자 관점
- API 문서를 보고 `ownerId`로 담당자 변경 → 200 성공 → 실제로 안 바뀜 → 원인 파악이 어려움
- `email`, `phone`도 마찬가지 — 직관적으로 보내지만 `fieldList` + `stringValue`로만 작동

### AI 에이전트 (MCP) 관점
- LLM이 `{"ownerId": "uuid"}` 형태로 담당자 변경 시도 → 200 성공 응답을 받고 "변경 완료" 보고 → **실제로 안 바뀜**
- 미인식 파라미터에 에러가 없으므로 **오타나 잘못된 파라미터명 사용 시 디버깅 불가**
- 예: `amount` vs `price` — `amount`로 보내도 200 OK, 금액 안 바뀜

---

## 5. 제안

### A. Silent No-op 파라미터

**방안 1 (권장)**: `ownerId`, `email`, `phone`을 실제로 작동하게 수정
- `ownerId` → `fieldList` + `userValueId`와 동일하게 처리
- `email` → `fieldList` + `stringValue`와 동일하게 처리

**방안 2**: 문서에서 해당 파라미터 제거 + 사용 시 에러 반환

### B. 미인식 파라미터 무시

**제안**: 인식하지 못하는 top-level 파라미터가 있으면 400 에러 반환
```json
{
  "success": false,
  "reason": "인식할 수 없는 파라미터: foobar, amount. 사용 가능한 파라미터: name, price, status, pipelineId, pipelineStageId, peopleId, organizationId, memo, fieldList"
}
```

이렇게 하면:
- 오타 즉시 발견 가능 (`amount` → `price`)
- AI 에이전트가 잘못된 호출을 즉시 감지 + 자동 수정 가능
- 기존에 정상 작동하는 코드에는 영향 없음 (정상 코드는 유효한 파라미터만 사용)
