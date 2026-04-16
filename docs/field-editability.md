# 세일즈맵 필드 수정 가능 여부 레퍼런스

> 2026-02-27 실제 API 호출로 전수 테스트 완료 (People 124, Organization 49, Deal 383 필드).
> 커스텀 필드는 기본적으로 모두 수정 가능. **이 문서는 수정 불가능한 것만 정리.**

---

## 수정 방법 요약

### fieldList value 키 (타입별)

| 필드 타입 | value 키 | 예시 |
|-----------|----------|------|
| 텍스트 | `stringValue` | `{"name": "필드명", "stringValue": "값"}` |
| 숫자 | `numberValue` | `{"name": "필드명", "numberValue": 100}` |
| True/False | `booleanValue` | `{"name": "필드명", "booleanValue": true}` |
| 날짜 | `dateValue` | `{"name": "필드명", "dateValue": "2026-01-01"}` |
| 단일 선택 | `stringValue` | 등록된 옵션 값만 가능 |
| 복수 선택 | `stringValueList` | `["옵션1", "옵션2"]` — `stringValue` 아님! |
| 사용자(단일) | `userValueId` | UUID |
| 사용자(복수) | `userValueIdList` | UUID 배열 |
| 고객(단일) | `peopleValueId` | UUID |
| 고객(복수) | `peopleValueIdList` | UUID 배열 |
| 회사(단일) | `organizationValueId` | UUID |
| 회사(복수) | `organizationValueIdList` | UUID 배열 |
| 딜(단일) | `dealValueId` | UUID |
| 딜(복수) | `dealValueIdList` | UUID 배열 |
| 리드(복수) | `leadValueIdList` | UUID 배열 |
| 커스텀 오브젝트(복수) | `customObjectValueIdList` | UUID 배열 |
| 팀(복수) | `teamValueIdList` | UUID 배열 (**Deal/Lead에서만 가능**) |

### top-level 파라미터 (실제 작동하는 것만, 2026-02-27 검증)

| 오브젝트 | 작동하는 top-level | 용도 |
|----------|-------------------|------|
| People | `name`, `ownerId`, `organizationId` | 이름/담당자/회사 |
| Organization | `name` | 이름 (이것만 작동) |
| Deal | `name`, `price`, `status`, `ownerId`, `pipelineId`+`pipelineStageId`, `peopleId`, `organizationId` | 이름/금액/상태/담당자/파이프라인/고객/회사 |
| Lead | `name`, `ownerId`, `pipelineId`+`pipelineStageId`, `peopleId`, `organizationId` | 이름/담당자/파이프라인/고객/회사 |

**담당자 변경**: `ownerId`(top-level) 또는 `fieldList` + `userValueId`. Organization만 **fieldList만 가능**.
**이메일/전화**: `fieldList` + `stringValue`로만 변경 (top-level `email`, `phone` silent no-op).
**Deal status**: `"Won"`, `"Lost"`, `"In progress"` (대소문자 구분).

**⚠️ Silent No-op**: 201 반환하지만 값 미반영되는 top-level 파라미터:
- People: `email`, `phone`
- Organization: `ownerId`, `phone`, `industry`, `parentOrganizationId`

---

## People (고객) — 읽기전용 시스템 필드 (35개)

```
RecordId
수정 날짜

딜 개수
리드 개수
성사된 딜 개수
실패된 딜 개수
진행중 딜 개수
총 매출

전체 TODO
완료 TODO
미완료 TODO
다음 TODO 날짜

누적 시퀀스 등록수
최근 시퀀스 등록일
등록된 시퀀스 목록
최근 등록한 시퀀스
현재 진행중인 시퀀스 여부

최근 고객 활동일
최근 연락일

최근 노트 작성일
최근 노트 작성자
최근 작성된 노트

최근 웹폼 제출 날짜
최근 제출된 웹폼
제출된 웹폼 목록

최근 이메일 받은 날짜
최근 이메일 보낸 날짜
최근 이메일 연락일
최근 이메일 오픈일

고객 그룹                    ← multiPeopleGroup (API 미지원 타입)
팀                          ← multiTeam (People/Org에서 API 미지원)
```

> **참고**: `수신 거부 여부`는 수정 가능 (booleanValue). `생성 날짜`도 수정 가능 (dateValue).

---

## Organization (회사) — 읽기전용 시스템 필드 (23개)

```
RecordId
수정 날짜

딜 개수
리드 개수
성사된 딜 개수
실패된 딜 개수
진행중 딜 개수
종료된 딜 수
총 매출
최근 성사된 딜 금액
최근 딜 성사 날짜

연결된 고객 수

전체 TODO
완료 TODO
미완료 TODO
다음 TODO 날짜

최근 노트 작성일
최근 노트 작성자            ← skipped이나 People과 동일 패턴
최근 작성된 노트

최근 웹폼 제출 날짜
최근 제출된 웹폼            ← skipped이나 People과 동일 패턴
제출된 웹폼 목록            ← skipped이나 People과 동일 패턴

팀                          ← multiTeam (People/Org에서 API 미지원)
```

> **참고**: `이름`은 top-level `name` 파라미터로만 수정 (fieldList 불가). `전화`는 fieldList로도 수정 가능하나 유효한 전화번호 포맷 필요. `생성 날짜` 수정 가능.

---

## Deal (딜) — 읽기전용 시스템 필드 (16개)

```
RecordId
수정 날짜

전체 TODO
완료 TODO
미완료 TODO
다음 TODO 날짜

누적 시퀀스 등록수
최근 시퀀스 등록일
현재 진행중인 시퀀스 여부

최근 노트 작성일
최근 작성된 노트
최근 웹폼 제출 날짜

최근 파이프라인 수정 날짜
최근 파이프라인 단계 수정 날짜

종료까지 걸린 시간

팀                          ← multiTeam (Deal에서도 시스템 필드는 readonly)
```

### Deal — 파이프라인 자동 생성 필드 (228개, 모두 읽기전용)

파이프라인 단계별로 자동 생성되며, 워크스페이스의 파이프라인 구성에 따라 개수가 달라짐.

패턴 (3종 × 단계 수 × 파이프라인 수):
```
{단계명}({파이프라인명})로 진입한 날짜
{단계명}({파이프라인명})에서 보낸 누적 시간
{단계명}({파이프라인명})에서 퇴장한 날짜
```

> **참고**: `이름`은 top-level `name`, `금액`은 top-level `price`로만 수정. `생성 날짜` 수정 가능. `마감일`은 201 응답이지만 값 미반영 (특수 시스템 필드 추정).

---

## Lead (리드) — 읽기전용 시스템 필드 (17개)

```
RecordId
수정 날짜

전체 TODO
완료 TODO
미완료 TODO
다음 TODO 날짜

누적 시퀀스 등록수
최근 시퀀스 등록일
현재 진행중인 시퀀스 여부

최근 노트 작성일
최근 작성된 노트
최근 웹폼 제출 날짜

최근 파이프라인 수정 날짜
최근 파이프라인 단계 수정 날짜

총 매출
팀                          ← multiTeam (시스템 필드는 readonly)
파일                        ← multiAttachment (API 미지원)
```

### Lead — 파이프라인 자동 생성 필드 (모두 읽기전용)

Deal과 동일 패턴. 워크스페이스의 리드 파이프라인 구성에 따라 개수 달라짐.

> **참고**: `이름`은 top-level `name`으로만 수정. `생성 날짜` 수정 가능.

---

## 항상 읽기전용인 커스텀 필드 타입

사용자가 만든 커스텀 필드라도 아래 타입이면 API로 수정 불가.

| 타입 | 에러 메시지 | 비고 |
|------|-------------|------|
| `formula` (수식) | `"계산 유형의 필드는 수정 및 생성의 대상이 될 수 없습니다"` | 사용자 정의 수식 필드 전부 |
| `multiAttachment` (첨부파일) | `"설정할 수 없는 {entity} 필드"` | 파일 업로드 별도 처리 필요 |
| `multiPeopleGroup` (고객 그룹) | `"설정할 수 없는 {entity} 필드"` | API 미지원 |
| `multiTeam` (팀) | `"설정할 수 없는 {entity} 필드"` | People/Org에서 불가. **Deal/Lead의 커스텀 팀 필드는 `teamValueIdList`로 가능** |

---

## 주의사항

1. **선택형 필드**: CRM에 **등록된 옵션 값**만 가능. 미등록 값 → `"정의 되지 않은 값을 입력했습니다."`
2. **이름/이메일/전화**: fieldList가 아닌 **body 최상위** 파라미터로만 수정
3. **담당자**: People/Org는 `ownerId` top-level. 커스텀 사용자 필드는 `userValueId`
4. **딜 금액**: `price` top-level 파라미터 전용. fieldList에 넣으면 에러
5. **pipelineStageId**: 반드시 `pipelineId`와 함께 전송. 단독 변경 불가
6. **빈 값 설정**: 빈 문자열 `""` 가능 (기존 값 클리어). 복수선택은 빈 배열 `[]` 불가
7. **`생성 날짜`**: People/Org/Deal 모두 dateValue로 덮어쓰기 가능 (예상 외)
8. **Deal `마감일`**: 201 응답이지만 값 미반영 (특수 시스템 필드 추정)
