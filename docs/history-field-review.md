# History 필드 유지/제거 리뷰

> 히스토리 API 응답에서 변경 추적이 의미 없는 필드를 제거하여 토큰 절약.
> **판정 기준**: LLM이 "이 레코드에 무슨 변화가 있었는지" 브리핑할 때 유용한가?

범례:
- **유지** — 변경 추적이 의미 있는 필드
- **제거** — 시스템 자동계산 / 변경 추적 무의미
- **파이프라인** — `~로 진입한 날짜`, `~에서 보낸 누적 시간`, `~에서 퇴장한 날짜` 패턴 (compactRecord에서 이미 제거됨)

---

## People (47개)

| 필드 | 타입 | 판정 | 사유 |
|------|------|------|------|
| 이름 | string | 유지 | 핵심 식별 필드 |
| 이메일 | string | 유지 | 연락처 변경 추적 |
| 전화 | string | 유지 | 연락처 변경 추적 |
| 직함 | string | 유지 | 직책 변동 의미 있음 |
| 직책 | singleSelect | 유지 | 직책 변동 의미 있음 |
| 직무 | singleSelect | 유지 | 커스텀 필드 |
| 링크드인 | string | 제거 | 변경 추적 불필요 |
| 프로필 사진 | string | 제거 | 변경 추적 불필요 |
| 소스 | singleSelect | 유지 | 유입 경로 변경 |
| 고객 여정 단계 | singleSelect | 유지 | 영업 단계 변경 — 핵심 |
| 개인정보 수집 및 이용 동의 여부 | singleSelect | 유지 | 컴플라이언스 |
| 수신 거부 여부 | boolean | 유지 | 마케팅 동의 변경 |
| 수신 거부 사유 | string | 유지 | 마케팅 관련 |
| 담당자 | user | 유지 | 담당 변경 — 핵심 |
| 팀 | multiTeam | 유지 | 조직 변경 |
| 고객 그룹 | multiPeopleGroup | 유지 | 그룹 변경 |
| RecordId | string | 제거 | 시스템 ID, 변경 안 됨 |
| 총 매출 | number | 유지 | 자동계산이지만 매출 변동 추적 의미 있음 |
| 딜 개수 | number | 제거 | 자동계산 |
| 진행중 딜 개수 | number | 제거 | 자동계산 |
| 성사된 딜 개수 | number | 제거 | 자동계산 |
| 실패된 딜 개수 | number | 제거 | 자동계산 |
| 리드 개수 | number | 제거 | 자동계산 |
| 완료 TODO | number | 제거 | 자동계산 |
| 미완료 TODO | number | 제거 | 자동계산 |
| 전체 TODO | number | 제거 | 자동계산 |
| 다음 TODO 날짜 | dateTime | 제거 | 자동계산 |
| 최근 노트 작성일 | dateTime | 제거 | 자동계산 — activity에서 확인 |
| 최근 노트 작성자 | user | 제거 | 자동계산 |
| 최근 작성된 노트 | string | 제거 | 자동계산 — memo 조회로 확인 |
| 최근 연락일 | dateTime | 제거 | 자동계산 |
| 최근 고객 활동일 | dateTime | 제거 | 자동계산 |
| 최근 이메일 오픈일 | dateTime | 제거 | 자동계산 |
| 최근 이메일 연락일 | dateTime | 제거 | 자동계산 |
| 최근 이메일 받은 날짜 | dateTime | 제거 | 자동계산 |
| 최근 이메일 보낸 날짜 | dateTime | 제거 | 자동계산 |
| 현재 진행중인 시퀀스 여부 | boolean | 제거 | 자동계산 |
| 누적 시퀀스 등록수 | number | 제거 | 자동계산 |
| 최근 시퀀스 등록일 | dateTime | 제거 | 자동계산 |
| 최근 등록한 시퀀스 | sequence | 제거 | 자동계산 |
| 등록된 시퀀스 목록 | multiSequence | 제거 | 자동계산 |
| 최근 제출된 웹폼 | webForm | 제거 | 자동계산 |
| 최근 웹폼 제출 날짜 | dateTime | 제거 | 자동계산 |
| 제출된 웹폼 목록 | multiWebForm | 제거 | 자동계산 |
| 생성 날짜 | dateTime | 제거 | 불변 |
| 수정 날짜 | dateTime | 제거 | 히스토리 자체가 수정 이력 |

**People 요약**: 유지 16 / 제거 31

---

## Organization (34개)

| 필드 | 타입 | 판정 | 사유 |
|------|------|------|------|
| 이름 | string | 유지 | 핵심 식별 |
| 전화 | string | 유지 | 연락처 |
| 웹 주소 | string | 유지 | 회사 정보 |
| 주소 | string | 유지 | 회사 정보 |
| 링크드인 | string | 제거 | 변경 추적 불필요 |
| 프로필 사진 | string | 제거 | 변경 추적 불필요 |
| 업종 | singleSelect | 유지 | 분류 변경 |
| 직원수 | number | 유지 | 사용자 직접 입력 |
| 담당자 | user | 유지 | 담당 변경 — 핵심 |
| 팀 | multiTeam | 유지 | 조직 변경 |
| 최근 노트 작성자 | user | 제거 | 자동계산 |
| RecordId | string | 제거 | 시스템 ID |
| 총 매출 | number | 유지 | 자동계산이지만 매출 변동 추적 의미 있음 |
| 매출(억) | number | 제거 | 자동계산 |
| 딜 개수 | number | 제거 | 자동계산 |
| 진행중 딜 개수 | number | 제거 | 자동계산 |
| 성사된 딜 개수 | number | 제거 | 자동계산 |
| 실패된 딜 개수 | number | 제거 | 자동계산 |
| 종료된 딜 수 | number | 제거 | 자동계산 |
| 리드 개수 | number | 제거 | 자동계산 |
| 연결된 고객 수 | number | 제거 | 자동계산 |
| 완료 TODO | number | 제거 | 자동계산 |
| 미완료 TODO | number | 제거 | 자동계산 |
| 전체 TODO | number | 제거 | 자동계산 |
| 다음 TODO 날짜 | dateTime | 제거 | 자동계산 |
| 최근 노트 작성일 | dateTime | 제거 | 자동계산 |
| 최근 작성된 노트 | string | 제거 | 자동계산 |
| 최근 딜 성사 날짜 | dateTime | 제거 | 자동계산 |
| 최근 성사된 딜 금액 | number | 제거 | 자동계산 |
| 최근 제출된 웹폼 | webForm | 제거 | 자동계산 |
| 최근 웹폼 제출 날짜 | dateTime | 제거 | 자동계산 |
| 제출된 웹폼 목록 | multiWebForm | 제거 | 자동계산 |
| 생성 날짜 | dateTime | 제거 | 불변 |
| 수정 날짜 | dateTime | 제거 | 히스토리 자체가 수정 이력 |

**Organization 요약**: 유지 9 / 제거 25

---

## Deal (62개)

| 필드 | 타입 | 판정 | 사유 |
|------|------|------|------|
| 이름 | string | 유지 | 핵심 식별 |
| 금액 | number | 유지 | 딜 금액 변경 — 핵심 |
| 상태 | singleSelect | 유지 | Won/Lost/In progress 변경 — 핵심 |
| 파이프라인 | pipeline | 유지 | 파이프라인 이동 — 핵심 |
| 파이프라인 단계 | pipelineStage | 유지 | 단계 진행 — 핵심 |
| 담당자 | user | 유지 | 담당 변경 |
| 팔로워 | multiUser | 유지 | 참여자 변경 |
| 팀 | multiTeam | 유지 | 조직 변경 |
| 실패 사유 | multiSelect | 유지 | 실패 분석 |
| 실패 상세 사유 | string | 유지 | 실패 분석 |
| 수주 예정일 | dateTime | 유지 | 영업 계획 변경 |
| 마감일 | dateTime | 유지 | 기한 변경 |
| 월 구독 금액 | number | 유지 | 구독 모델 변경 |
| 구독 시작일 | dateTime | 유지 | 구독 관련 |
| 구독 종료일 | dateTime | 유지 | 구독 관련 |
| 구독 시작 유형 | singleSelect | 유지 | 구독 관련 |
| 구독 종료 유형 | singleSelect | 유지 | 구독 관련 |
| 리드 목록 | multiLead | 유지 | 연결 관계 변경 |
| 메인 견적 상품 리스트 | multiProduct | 유지 | 상품 변경 |
| RecordId | string | 제거 | 시스템 ID |
| 종료까지 걸린 시간 | number | 제거 | 자동계산 |
| 성사까지 걸린 시간 | number | 제거 | 자동계산 |
| 실패까지 걸린 시간 | number | 제거 | 자동계산 |
| 완료 TODO | number | 제거 | 자동계산 |
| 미완료 TODO | number | 제거 | 자동계산 |
| 전체 TODO | number | 제거 | 자동계산 |
| 다음 TODO 날짜 | dateTime | 제거 | 자동계산 |
| 최근 노트 작성일 | dateTime | 제거 | 자동계산 |
| 최근 노트 작성자 | user | 제거 | 자동계산 |
| 최근 작성된 노트 | string | 제거 | 자동계산 |
| 최근 파이프라인 단계 수정 날짜 | dateTime | 제거 | 자동계산 |
| 최근 파이프라인 수정 날짜 | dateTime | 제거 | 자동계산 |
| 종료된 파이프라인 단계 | pipelineStage | 제거 | 자동계산 |
| 현재 진행중인 시퀀스 여부 | boolean | 제거 | 자동계산 |
| 누적 시퀀스 등록수 | number | 제거 | 자동계산 |
| 최근 시퀀스 등록일 | dateTime | 제거 | 자동계산 |
| 최근 등록한 시퀀스 | sequence | 제거 | 자동계산 |
| 등록된 시퀀스 목록 | multiSequence | 제거 | 자동계산 |
| 최근 제출된 웹폼 | webForm | 제거 | 자동계산 |
| 최근 웹폼 제출 날짜 | dateTime | 제거 | 자동계산 |
| 생성 날짜 | dateTime | 제거 | 불변 |
| 수정 날짜 | dateTime | 제거 | 히스토리 자체가 수정 이력 |
| 첫 미팅 준비(세일즈 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 첫 미팅 준비(세일즈 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 첫 미팅 준비(세일즈 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 고객 니즈 파악(세일즈 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 고객 니즈 파악(세일즈 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 고객 니즈 파악(세일즈 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 솔루션 비교 검토(세일즈 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 솔루션 비교 검토(세일즈 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 솔루션 비교 검토(세일즈 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 최종 협상(세일즈 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 최종 협상(세일즈 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 최종 협상(세일즈 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 계약 승인 절차(세일즈 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 계약 승인 절차(세일즈 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 계약 승인 절차(세일즈 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 성사(세일즈 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 성사(세일즈 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 성사(세일즈 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 실패(세일즈 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 실패(세일즈 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 실패(세일즈 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |

**Deal 요약**: 유지 19 / 제거 23 / 파이프라인(이미 제거됨) 20

---

## Lead (48개)

| 필드 | 타입 | 판정 | 사유 |
|------|------|------|------|
| 이름 | string | 유지 | 핵심 식별 |
| 금액 | number | 유지 | 리드 가치 변경 |
| 유형 | singleSelect | 유지 | 리드 분류 변경 |
| 파이프라인 | pipeline | 유지 | 파이프라인 이동 — 핵심 |
| 파이프라인 단계 | pipelineStage | 유지 | 단계 진행 — 핵심 |
| 담당자 | user | 유지 | 담당 변경 |
| 팔로워 | multiUser | 유지 | 참여자 변경 |
| 팀 | multiTeam | 유지 | 조직 변경 |
| 보류 사유 | singleSelect | 유지 | 보류 분석 |
| 보류 상세 사유 | string | 유지 | 보류 분석 |
| 딜 목록 | multiDeal | 유지 | 연결 관계 변경 |
| 리드 그룹 | multiLeadGroup | 유지 | 그룹 변경 |
| 메인 견적 상품 리스트 | multiProduct | 유지 | 상품 변경 |
| RecordId | string | 제거 | 시스템 ID |
| 총 매출 | number | 유지 | 자동계산이지만 매출 변동 추적 의미 있음 |
| 완료 TODO | number | 제거 | 자동계산 |
| 미완료 TODO | number | 제거 | 자동계산 |
| 전체 TODO | number | 제거 | 자동계산 |
| 다음 TODO 날짜 | dateTime | 제거 | 자동계산 |
| 최근 노트 작성일 | dateTime | 제거 | 자동계산 |
| 최근 노트 작성자 | user | 제거 | 자동계산 |
| 최근 작성된 노트 | string | 제거 | 자동계산 |
| 최근 파이프라인 단계 수정 날짜 | dateTime | 제거 | 자동계산 |
| 최근 파이프라인 수정 날짜 | dateTime | 제거 | 자동계산 |
| 최근 딜의 파이프라인 단계 | pipelineStage | 제거 | 자동계산 |
| 현재 진행중인 시퀀스 여부 | boolean | 제거 | 자동계산 |
| 누적 시퀀스 등록수 | number | 제거 | 자동계산 |
| 최근 시퀀스 등록일 | dateTime | 제거 | 자동계산 |
| 최근 등록한 시퀀스 | sequence | 제거 | 자동계산 |
| 등록된 시퀀스 목록 | multiSequence | 제거 | 자동계산 |
| 최근 제출된 웹폼 | webForm | 제거 | 자동계산 |
| 최근 웹폼 제출 날짜 | dateTime | 제거 | 자동계산 |
| 생성 날짜 | dateTime | 제거 | 불변 |
| 수정 날짜 | dateTime | 제거 | 히스토리 자체가 수정 이력 |
| 새 리드(리드 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 새 리드(리드 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 새 리드(리드 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 연락 시도 중(리드 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 연락 시도 중(리드 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 연락 시도 중(리드 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 연락 완료(리드 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 연락 완료(리드 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 연락 완료(리드 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 영업 대상 확정(리드 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 영업 대상 확정(리드 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |
| 영업 대상 확정(리드 파이프라인)에서 퇴장한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 영업 대상 보류(리드 파이프라인)로 진입한 날짜 | dateTime | 파이프라인 | compactRecord 제거 |
| 영업 대상 보류(리드 파이프라인)에서 보낸 누적 시간 | number | 파이프라인 | compactRecord 제거 |

**Lead 요약**: 유지 14 / 제거 20 / 파이프라인(이미 제거됨) 14

---

## 전체 요약

| 오브젝트 | 전체 | 유지 | 제거 | 파이프라인(기존 제거) |
|----------|------|------|------|----------------------|
| People | 47 | 16 | 31 | 0 |
| Organization | 34 | 9 | 25 | 0 |
| Deal | 62 | 19 | 23 | 20 |
| Lead | 48 | 14 | 20 | 14 |
| **합계** | **191** | **58** | **99** | **34** |

## 제거 패턴 (코드 구현용)

하드코딩 대신 **패턴 매칭**으로 제거 가능:

1. **파이프라인 자동필드** — `compactRecord`에서 이미 처리 (접미사 `로 진입한 날짜` / `에서 보낸 누적 시간` / `에서 퇴장한 날짜`)
2. **`최근~` 접두사** — `최근 노트 작성일`, `최근 연락일`, `최근 이메일~`, `최근 시퀀스~`, `최근 웹폼~`, `최근 딜~`, `최근 파이프라인~`, `최근 고객 활동일`, `최근 성사된 딜 금액`
3. **TODO 관련** — `완료 TODO`, `미완료 TODO`, `전체 TODO`, `다음 TODO 날짜`
4. **개수/통계** — `딜 개수`, `리드 개수`, `진행중 딜 개수`, `성사된 딜 개수`, `실패된 딜 개수`, `종료된 딜 수`, `연결된 고객 수`, `매출(억)`
5. **시퀀스 자동** — `현재 진행중인 시퀀스 여부`, `누적 시퀀스 등록수`, `등록된 시퀀스 목록`
6. **시스템** — `RecordId`, `생성 날짜`, `수정 날짜`, `종료까지 걸린 시간`, `성사까지 걸린 시간`, `실패까지 걸린 시간`, `종료된 파이프라인 단계`, `최근 작성된 노트`
7. **웹폼 자동** — `제출된 웹폼 목록`, `최근 제출된 웹폼`

### 패턴 기반 제거 규칙 (제안)

```typescript
// 접두사 매칭
const NOISE_PREFIXES = ["최근 "];

// 정확 매칭 또는 포함 매칭
const NOISE_FIELDS = new Set([
  "RecordId", "생성 날짜", "수정 날짜",
  "완료 TODO", "미완료 TODO", "전체 TODO", "다음 TODO 날짜",
  "매출(억)",
  "현재 진행중인 시퀀스 여부", "누적 시퀀스 등록수",
  "등록된 시퀀스 목록", "제출된 웹폼 목록",
  "종료까지 걸린 시간", "성사까지 걸린 시간", "실패까지 걸린 시간",
  "종료된 파이프라인 단계",
]);

// 접미사 매칭 (개수류)
const NOISE_SUFFIXES = ["개수", " 수"];
```

> **주의**: `최근~` 접두사로 싹 날리면 편하지만, 고객이 "최근~"으로 시작하는 커스텀 필드를 만들 수 있음. 스키마 타입 기반으로 formula/자동계산 여부를 판별하는 게 더 안전할 수 있음 — 피드백 부탁!
