# R6 독립 검토 결과

기록일: 2026-11-05 (Asia/Seoul)
대상: F:/jindan-dotnet/artifacts/ready-for-review/final66-r6
판정: **R4 지적 A/B와 관련 사용성 수정은 이번 로컬·합성 독립 검토 범위에서 통과.**
회사 보고서·전체 실무·출시 승인과 구분하며 reportReady=false, supervisorAccepted=false 유지.

## 식별과 보존
- artifact-manifest SHA256: 18ee3ca05967d16315d7d5648b744628f1773d00b1142babbd0e64409711c69d
- source-checkpoint SHA256: 6ad2e9573ee5450a1ac4edfee244e9cbc38f03b6ea56603953ffcf77f7e4b20f
- Desktop DLL SHA256: ae3bbaf5bce738ec98b29501027255293a1e8deeeeb6afe3c0967947bbf2bc47
- 시작·종료 검사에서 R6 선언 파일 3,226개, 제품 입력178개, 전체 소스 목록349개, 인계 증거113개가 각각 일치했다. SOURCE69와 FILES69 aggregate도 검증했다.
- R4·R5 각각3,226개 및 기존 F:/jindan 보호626개와 Git HEAD/dirty 상태도 일치했다. 무시된 모든 출력/회사 자료 전체의 전수 검증이라는 뜻은 아니다.
- 별도 사본 product-patch66-supervisor-r6-01/application의 3,212개 파일을 실행 전에 확인했다. 원본·동결본·작업자 소스는 수정하지 않았다.

## A. 복원 안전성: 독립 4개 시나리오 통과
새 독립 harness가 R6의 정확한 Update/ModuleHost DLL을 참조하고 번들 런타임에서 실행됐다. 작업자 테스트 실행 파일이나 자체 통과 숫자를 재사용하지 않았다.
1. R4 방식의 결합 정보 없는 백업 저널: DATA_BACKUP_UNVERIFIABLE, 현재 자료/모듈 보존.
2. 실제 public ApplyAsync로 schema1→2 마이그레이션·스냅샷 생성 후 파일 손상: DATA_BACKUP_INTEGRITY, 마이그레이션된 현재 자료/모듈 보존.
3. 실제 마이그레이션 후 정상 롤백: 이전 자료와 모듈 복원.
4. 자료 이동 후 승격 경로를 합성 파일로 차단: 실패 시 기존 자료는 retained 경로에 보존, 그 합성 차단물만 제거한 뒤 RecoverInterruptedAsync로 정상 복구.
근거: restore-probe/REPORT.md, HASH_VERIFICATION.json, REVIEW_RESULT.json, evidence-rerun/RESULTS.json.
초기 harness가 예외 형식을 PackageException으로 예상했으나 Windows가 IOException을 반환한 실행도 보존됐다. 이를 보정한 재실행이며 제품 변경이나 숨긴 제품 실패가 아니다.

## B. 실제 네이티브 UI 검토
명시적 합성 로컬 계정을 만들고 표준 UI 동작으로 시험했다. 실제 회사 계정·자료는 사용하지 않았다.
- 기본 창 폭에서도 프로젝트 선택 줄 표시. 새 프로젝트 저장 후 수동 목록 갱신 없이 선택 목록에 자동 반영.
- 사진 한 장 최초 가져오기 직후 제목/자산 ID/SHA와 큰 미리보기 일치. 단일 항목 이전·다음·다시 읽기 뒤에도 결합 유지.
- 다른 색의 두 번째 합성 PNG 가져오기, 이전/다음으로 각 제목·SHA·실제 큰 그림 전환 확인.
- 미저장 설명을 입력한 뒤 화면에 보이는 다른 행을 native mouse 메시지로 클릭: ‘변경 내용을 먼저 저장하세요.’ 표시, 원래 편집 대상/입력값 유지. 이후 저장 확인.
- 최초 행 클릭 시도는 행이 화면 밖이어서 유효한 시험으로 세지 않았다. 스크롤 화살표로 실제 행을 보이게 한 뒤 다시 시험한 결과를 사용한다.
- 빈 별도 프로젝트로 바꾸면 목록0건, 속성/큰 그림 비움. 원래 프로젝트로 돌아오면 첫 사진과 정보가 재결합.
- 보고서 탭은 ‘보고서 스튜디오 · 감독-R6-합성검토’로 표시돼 GUID 표시 문제 해소.
- 9개 모듈 화면 모두 열기 확인. 이는 모든 업무 명령/권한/대량 자료의 전수 시험이 아니다.
- 정상 종료 후 새 프로세스 로그인: 프로젝트 첫 행의 편집란 자동 결합. 시설 필드를 수정·저장해 기존 프로젝트 ID가 유지되고 프로젝트 수2건도 유지됨 확인.
- 새 프로세스에서 사진 모듈을 다시 열어 첫 사진 정보와 큰 미리보기 재확인.
근거: ui-*.json 및 임시 시각 증거 r6-first-photo.png, r6-photo-previous.png, r6-photo-next.png, r6-photo-visible-row-dirty-protected.png, r6-photo-empty-context.png, r6-photo-context-return.png, r6-reopened-photo.png.

## C. 실제 제품 모듈 교체·복귀
- 새 R6 사본을 정상 종료한 뒤 Projects1.0.0→1.1.0 적용(exit0). 새 프로세스에서 ‘진행중만 보기’와 적용 표시 확인.
- 변경된 불변 파일은 projects DLL과 module.json 두 개뿐. 호스트·다른 모듈 변경0. 패치 직후 데이터 파일5개 해시 동일.
- 다시 정상 종료해 rollback(exit0), health(exit0), 새 프로세스 재로그인. 필터가 사라지고 기존 프로젝트와 재시작 후 수정값이 유지됨.
- 복귀 후 불변 파일3,212개 모두 기준 R6와 일치. 롤백 직전/직후 데이터5개 해시 동일.
- UI 실행으로 workspace.json/bak의 레이아웃/revision은 바뀌지만, 패치 전후 사용자·업무4건·자산2건은 동일함을 별도로 확인.
근거: apply-output.json, after-patch-before-ui.json, rollback-output.json, after-rollback.json, rollback-data-check.json, rollback-health.json, business-preservation.json, ui-patched-filter.json, ui-rolled-back.json.
검토용 앱 PID16120/16412/28184/34272는 모두 정상 종료했고 남아 있지 않다. 한글11908 존재를 확인했다. 무관한 프로세스 종료는 하지 않았다.

## 한계 및 다음 단계
- 이번 검토에서 새 제품 결함은 발견하지 않았다. A/B/C의 확인 범위를 넘는 무결점·전체 완성 선언은 하지 않는다.
- 작업자 자체검사의82/51/60 등 숫자는 내 독립 시험으로 합산하지 않았다. 새 Adapter Dispose 경합 수정에 대한 작업자의42개/12회 stress 결과를 부모가 별도로 반복한 것은 아니다.
- [blocked] 새 경로의 회사 실물 HWPX/PDF 전체 조판, 원래 글꼴/source JSON/탭, 모든 개체 편집성·수치·셀 의미, 금회 실제 자료와 사람의 검토·실무 사용 승인은 미완료. 기존 final28 증거를 R6에 승계하지 않는다.
- [blocked] 실제 클라우드/기관 서비스·publisher 서명·배포·물리 DPI150/200은 이번 독립 검토 범위 밖이다. exFAT 전원 장애/적대적 파일 변경/포렌식 ACL 보존도 승인하지 않는다.
- 개발 플랫폼→Aside LINK 직접 수신은 여전히 미확인. 파일 감시와 공개 대화가 확인 가능한 보고 통로다.
- R4/R5/R6 및 감독 증거를 보존하고, A/B 수정 재작업은 추가 근거 없이 반복하지 않는다. 실물 보고서 검증은 별도 보존 사본과 정확한 SHA, 실제 자료·검토 기준으로 진행해야 한다. 전체 승인 필드는 올리지 않는다.

증거 루트: F:/jindan-maintenance/20261105-audit65/review-r6-01/
검토 사본: F:/jindan-dotnet/artifacts/product-patch66-supervisor-r6-01/application (Projects1.0.0 복귀, 합성 자료만 포함)
