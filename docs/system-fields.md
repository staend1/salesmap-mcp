# 시스템 필드 목록 (describe_object description 주입 대상)

파이프라인 단계 진입/퇴장/누적시간 필드는 제외.
각 필드의 `description`을 확인 후, field.ts에서 describe_object 응답에 주입.

---

## deal (78개 중 시스템 필드)

| 필드명 | 타입 | description (작성 필요) |
|--------|------|------------------------|
| 이름 | string | |
| 상태 | singleSelect | |
| 금액 | number | |
| 마감일 | dateTime | |
| 수주 예정일 | dateTime | |
| 생성 날짜 | dateTime | |
| 수정 날짜 | dateTime | |
| 담당자 | user | |
| 팔로워 | multiUser | |
| 팀 | multiTeam | |
| 파이프라인 | pipeline | |
| 파이프라인 단계 | pipelineStage | |
| 종료된 파이프라인 단계 | pipelineStage | |
| 고객 | multiPeople | |
| 소스 | singleSelect | |
| 종료까지 걸린 시간 | number | |
| 최근 작성된 노트 | string | |
| 최근 노트 작성일 | dateTime | |
| 최근 노트 작성자 | user | |
| 다음 TODO 날짜 | dateTime | |
| 미완료 TODO | number | |
| 완료 TODO | number | |
| 전체 TODO | number | |
| 최근 웹폼 제출 날짜 | dateTime | |
| 최근 제출된 웹폼 | webForm | |
| 최근 시퀀스 등록일 | dateTime | |
| 최근 등록한 시퀀스 | sequence | |
| 현재 진행중인 시퀀스 여부 | boolean | |
| 등록된 시퀀스 목록 | multiSequence | |
| 누적 시퀀스 등록수 | number | |
| 최근 파이프라인 수정 날짜 | dateTime | |
| 최근 파이프라인 단계 수정 날짜 | dateTime | |
| 메인 견적 상품 리스트 | multiProduct | |
| 리드 목록 | multiLead | |
| RecordId | string | |

---

## lead (88개 중 시스템 필드)

| 필드명 | 타입 | description (작성 필요) |
|--------|------|------------------------|
| 이름 | string | |
| 상태 | singleSelect | |
| 금액 | number | |
| 총 매출 | number | |
| 생성 날짜 | dateTime | |
| 수정 날짜 | dateTime | |
| 담당자 | user | |
| 팔로워 | multiUser | |
| 팀 | multiTeam | |
| 파이프라인 | pipeline | |
| 파이프라인 단계 | pipelineStage | |
| 최근 딜의 파이프라인 단계 | pipelineStage | |
| 고객 | multiPeople | |
| 연결회사 | multiOrganization | |
| 딜 목록 | multiDeal | |
| 리드 | multiLead | |
| 소스 | singleSelect | |
| 유형 | singleSelect | |
| 우선순위 | singleSelect | |
| 최근 작성된 노트 | string | |
| 최근 노트 작성일 | dateTime | |
| 최근 노트 작성자 | user | |
| 다음 TODO 날짜 | dateTime | |
| 미완료 TODO | number | |
| 완료 TODO | number | |
| 전체 TODO | number | |
| 수주 예정일 | dateTime | |
| 최근 웹폼 제출 날짜 | dateTime | |
| 최근 시퀀스 등록일 | dateTime | |
| 최근 등록한 시퀀스 | sequence | |
| 현재 진행중인 시퀀스 여부 | boolean | |
| 등록된 시퀀스 목록 | multiSequence | |
| 누적 시퀀스 등록수 | number | |
| 최근 파이프라인 수정 날짜 | dateTime | |
| 최근 파이프라인 단계 수정 날짜 | dateTime | |
| 메인 견적 상품 리스트 | multiProduct | |
| RecordId | string | |

---

## people (89개 중 시스템 필드)

| 필드명 | 타입 | description (작성 필요) |
|--------|------|------------------------|
| 이름 | string | |
| 이메일 | string | |
| 전화 | string | |
| 직함/직책/직급 | string | |
| 부서 | string | |
| 프로필 사진 | string | |
| 회사 | multiOrganization | |
| 담당자 | user | |
| 팀 | multiTeam | |
| 소스 | singleSelect | |
| 생성 날짜 | dateTime | |
| 수정 날짜 | dateTime | |
| 최근 연락일 | dateTime | |
| 최근 작성된 노트 | string | |
| 최근 노트 작성일 | dateTime | |
| 최근 노트 작성자 | user | |
| 다음 TODO 날짜 | dateTime | |
| 미완료 TODO | number | |
| 완료 TODO | number | |
| 전체 TODO | number | |
| 딜 | multiDeal | |
| 리드 | multiLead | |
| 딜 개수 | number | |
| 리드 개수 | number | |
| 진행중 딜 개수 | number | |
| 성사된 딜 개수 | number | |
| 실패된 딜 개수 | number | |
| 총 매출 | number | |
| 최근 웹폼 제출 날짜 | dateTime | |
| 최근 제출된 웹폼 | webForm | |
| 제출된 웹폼 목록 | multiWebForm | |
| 최근 시퀀스 등록일 | dateTime | |
| 최근 등록한 시퀀스 | sequence | |
| 현재 진행중인 시퀀스 여부 | boolean | |
| 등록된 시퀀스 목록 | multiSequence | |
| 누적 시퀀스 등록수 | number | |
| 최근 이메일 보낸 날짜 | dateTime | |
| 최근 이메일 받은 날짜 | dateTime | |
| 최근 이메일 오픈일 | dateTime | |
| 최근 이메일 연락일 | dateTime | |
| 수신 거부 여부 | boolean | |
| 메일 반송 여부 | boolean | |
| 고객 그룹 | multiPeopleGroup | |
| RecordId | string | |

---

## organization (81개 중 시스템 필드)

| 필드명 | 타입 | description (작성 필요) |
|--------|------|------------------------|
| 이름 | string | |
| 전화 | string | |
| 웹 주소 | string | |
| 주소 | string | |
| 사업자등록번호 | string | |
| 직원수 | number | |
| 설립일 | date | |
| 프로필 사진 | string | |
| 회사 설명 | string | |
| 담당자 | user | |
| 팀 | multiTeam | |
| 소스 | singleSelect | |
| 생성 날짜 | dateTime | |
| 수정 날짜 | dateTime | |
| 최근 작성된 노트 | string | |
| 최근 노트 작성일 | dateTime | |
| 최근 노트 작성자 | user | |
| 다음 TODO 날짜 | dateTime | |
| 미완료 TODO | number | |
| 완료 TODO | number | |
| 전체 TODO | number | |
| 고객 | multiPeople | |
| 연결된 고객 수 | number | |
| 연결회사 | multiOrganization | |
| 연결리드 | multiLead | |
| 딜 개수 | number | |
| 진행중 딜 개수 | number | |
| 성사된 딜 개수 | number | |
| 실패된 딜 개수 | number | |
| 종료된 딜 수 | number | |
| 총 매출 | number | |
| 최근 딜 성사 날짜 | dateTime | |
| 최근 성사된 딜 금액 | number | |
| 최근 웹폼 제출 날짜 | dateTime | |
| 최근 제출된 웹폼 | webForm | |
| 제출된 웹폼 목록 | multiWebForm | |
| RecordId | string | |
