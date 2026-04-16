# 시스템 필드 목록 (salesmap-list-properties description 주입 대상)

새 워크스페이스(커스텀 필드 없음)에서 조회한 순수 시스템 필드.
파이프라인 단계 진입/퇴장/누적시간 필드는 제외.
optionList는 API가 이미 반환하므로 description에 옵션 값 나열 불필요.
description이 비어있는 필드는 이름만으로 의미가 명확 — 주입 불필요.

---

## deal

| 필드명 | 타입 | 필수 | description |
|--------|------|------|-------------|
| 이름 | string | O | |
| 상태 | singleSelect | O | |
| 금액 | number | | |
| 마감일 | dateTime | | 상태가 Won/Lost로 변경 시 자동 업데이트되는 종료 날짜 |
| 수주 예정일 | dateTime | | |
| 월 구독 금액 | number | | |
| 구독 시작일 | dateTime | | |
| 구독 종료일 | dateTime | | |
| 구독 시작 유형 | singleSelect | | |
| 구독 종료 유형 | singleSelect | | |
| 실패 사유 | multiSelect | | |
| 실패 상세 사유 | string | | |
| 종료까지 걸린 시간 | number | | 생성부터 Won/Lost까지 소요 시간 |
| 생성 날짜 | dateTime | O | |
| 수정 날짜 | dateTime | O | |
| 담당자 | user | O | 메인 담당자. 검색 시 userValueId 사용 (salesmap-list-users) |
| 팔로워 | multiUser | | 서브 담당자들. 검색 시 userValueId 사용 |
| 팀 | multiTeam | | 메인 담당자의 소속 팀 (자동). 검색 시 teamId 사용 (salesmap-list-teams) |
| 파이프라인 | pipeline | O | 검색/생성 시 pipelineId 사용 (salesmap-get-pipelines) |
| 파이프라인 단계 | pipelineStage | O | 검색/생성 시 pipelineStageId 사용 (salesmap-get-pipelines) |
| 종료된 파이프라인 단계 | pipelineStage | | Won/Lost 시점의 파이프라인 단계. 검색 시 pipelineStageId 사용 |
| 최근 파이프라인 수정 날짜 | dateTime | O | 파이프라인 자체가 변경된 날짜 |
| 최근 파이프라인 단계 수정 날짜 | dateTime | O | 파이프라인 단계가 변경된 날짜 |
| 리드 목록 | multiLead | | 연결된 리드 목록 |
| 메인 견적 상품 리스트 | multiProduct | | 읽기 전용. 메인 견적서의 상품 목록 |
| 최근 작성된 노트 | string | | |
| 최근 노트 작성일 | dateTime | | |
| 최근 노트 작성자 | user | | |
| 다음 TODO 날짜 | dateTime | | |
| 미완료 TODO | number | | |
| 완료 TODO | number | | |
| 전체 TODO | number | | |
| 최근 웹폼 제출 날짜 | dateTime | | |
| 최근 제출된 웹폼 | webForm | | |
| 최근 시퀀스 등록일 | dateTime | | |
| 최근 등록한 시퀀스 | sequence | | |
| 현재 진행중인 시퀀스 여부 | boolean | | |
| 등록된 시퀀스 목록 | multiSequence | | |
| 누적 시퀀스 등록수 | number | O | |
| RecordId | string | O | 레코드 고유 ID |

---

## lead

| 필드명 | 타입 | 필수 | description |
|--------|------|------|-------------|
| 이름 | string | O | |
| 유형 | singleSelect | | |
| 금액 | number | | |
| 총 매출 | number | O | 성사된 딜 금액 합계 (자동) |
| 보류 사유 | singleSelect | | |
| 보류 상세 사유 | string | | |
| 생성 날짜 | dateTime | O | |
| 수정 날짜 | dateTime | O | |
| 담당자 | user | O | 메인 담당자. 검색 시 userValueId 사용 (salesmap-list-users) |
| 팔로워 | multiUser | | 서브 담당자들. 검색 시 userValueId 사용 |
| 팀 | multiTeam | | 메인 담당자의 소속 팀 (자동). 검색 시 teamId 사용 (salesmap-list-teams) |
| 파이프라인 | pipeline | | 검색 시 pipelineId 사용 (salesmap-get-pipelines) |
| 파이프라인 단계 | pipelineStage | | 검색 시 pipelineStageId 사용 (salesmap-get-pipelines) |
| 최근 딜의 파이프라인 단계 | pipelineStage | | 연결된 딜 중 최신 딜의 파이프라인 단계 (자동). 검색 시 pipelineStageId 사용 |
| 최근 파이프라인 수정 날짜 | dateTime | O | 파이프라인 자체가 변경된 날짜 |
| 최근 파이프라인 단계 수정 날짜 | dateTime | O | 파이프라인 단계가 변경된 날짜 |
| 딜 목록 | multiDeal | | 연결된 딜 목록 |
| 리드 그룹 | multiLeadGroup | | |
| 메인 견적 상품 리스트 | multiProduct | | 읽기 전용. 메인 견적서의 상품 목록 |
| 최근 작성된 노트 | string | | |
| 최근 노트 작성일 | dateTime | | |
| 최근 노트 작성자 | user | | |
| 다음 TODO 날짜 | dateTime | | |
| 미완료 TODO | number | | |
| 완료 TODO | number | | |
| 전체 TODO | number | | |
| 최근 웹폼 제출 날짜 | dateTime | | |
| 최근 제출된 웹폼 | webForm | | |
| 최근 시퀀스 등록일 | dateTime | | |
| 최근 등록한 시퀀스 | sequence | | |
| 현재 진행중인 시퀀스 여부 | boolean | | |
| 등록된 시퀀스 목록 | multiSequence | | |
| 누적 시퀀스 등록수 | number | O | |
| RecordId | string | O | 레코드 고유 ID |

---

## people

| 필드명 | 타입 | 필수 | description |
|--------|------|------|-------------|
| 이름 | string | O | |
| 이메일 | string | | |
| 전화 | string | | |
| 직함 | string | | |
| 링크드인 | string | | |
| 프로필 사진 | string | | |
| 고객 여정 단계 | singleSelect | O | |
| 개인정보 수집 및 이용 동의 여부 | singleSelect | | |
| 직무 | singleSelect | | |
| 소스 | singleSelect | | |
| 직책 | singleSelect | | |
| 담당자 | user | O | 메인 담당자. 검색 시 userValueId 사용 (salesmap-list-users) |
| 팀 | multiTeam | | 메인 담당자의 소속 팀 (자동). 검색 시 teamId 사용 (salesmap-list-teams) |
| 생성 날짜 | dateTime | O | |
| 수정 날짜 | dateTime | O | |
| 최근 연락일 | dateTime | | |
| 최근 고객 활동일 | dateTime | | |
| 최근 작성된 노트 | string | | |
| 최근 노트 작성일 | dateTime | | |
| 최근 노트 작성자 | user | | |
| 다음 TODO 날짜 | dateTime | | |
| 미완료 TODO | number | | |
| 완료 TODO | number | | |
| 전체 TODO | number | | |
| 딜 개수 | number | O | 연결된 전체 딜 수 (자동) |
| 리드 개수 | number | O | 연결된 전체 리드 수 (자동) |
| 진행중 딜 개수 | number | O | In progress 딜 수 (자동) |
| 성사된 딜 개수 | number | O | Won 딜 수 (자동) |
| 실패된 딜 개수 | number | O | Lost 딜 수 (자동) |
| 총 매출 | number | O | 성사된 딜 금액 합계 (자동) |
| 고객 그룹 | multiPeopleGroup | | |
| 최근 웹폼 제출 날짜 | dateTime | | |
| 최근 제출된 웹폼 | webForm | | |
| 제출된 웹폼 목록 | multiWebForm | | |
| 최근 시퀀스 등록일 | dateTime | | |
| 최근 등록한 시퀀스 | sequence | | |
| 현재 진행중인 시퀀스 여부 | boolean | | |
| 등록된 시퀀스 목록 | multiSequence | | |
| 누적 시퀀스 등록수 | number | O | |
| 최근 이메일 보낸 날짜 | dateTime | | |
| 최근 이메일 받은 날짜 | dateTime | | |
| 최근 이메일 오픈일 | dateTime | | |
| 최근 이메일 연락일 | dateTime | | |
| 수신 거부 여부 | boolean | | |
| 수신 거부 사유 | string | | |
| RecordId | string | O | 레코드 고유 ID |

---

## organization

| 필드명 | 타입 | 필수 | description |
|--------|------|------|-------------|
| 이름 | string | O | |
| 전화 | string | | |
| 웹 주소 | string | | |
| 주소 | string | | |
| 직원수 | number | | |
| 링크드인 | string | | |
| 프로필 사진 | string | | |
| 업종 | singleSelect | | |
| 담당자 | user | O | 메인 담당자. 검색 시 userValueId 사용 (salesmap-list-users) |
| 팀 | multiTeam | | 메인 담당자의 소속 팀 (자동). 검색 시 teamId 사용 (salesmap-list-teams) |
| 생성 날짜 | dateTime | O | |
| 수정 날짜 | dateTime | O | |
| 최근 작성된 노트 | string | | |
| 최근 노트 작성일 | dateTime | | |
| 최근 노트 작성자 | user | | |
| 다음 TODO 날짜 | dateTime | | |
| 미완료 TODO | number | | |
| 완료 TODO | number | | |
| 전체 TODO | number | | |
| 연결된 고객 수 | number | | 연결된 people 수 (자동) |
| 딜 개수 | number | O | 연결된 전체 딜 수 (자동) |
| 리드 개수 | number | O | 연결된 전체 리드 수 (자동) |
| 진행중 딜 개수 | number | O | In progress 딜 수 (자동) |
| 성사된 딜 개수 | number | O | Won 딜 수 (자동) |
| 실패된 딜 개수 | number | O | Lost 딜 수 (자동) |
| 종료된 딜 수 | number | | Won + Lost 딜 수 (자동) |
| 총 매출 | number | O | 성사된 딜 금액 합계 (자동) |
| 최근 딜 성사 날짜 | dateTime | | 가장 최근 Won된 딜의 날짜 (자동) |
| 최근 성사된 딜 금액 | number | | 가장 최근 Won된 딜의 금액 (자동) |
| 매출(억) | number | | |
| 최근 웹폼 제출 날짜 | dateTime | | |
| 최근 제출된 웹폼 | webForm | | |
| 제출된 웹폼 목록 | multiWebForm | | |
| RecordId | string | O | 레코드 고유 ID |
