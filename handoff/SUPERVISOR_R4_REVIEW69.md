# R4 독립 검토 결과 및 재수정 요구

검토일: 2026-11-05 (Asia/Seoul)
대상: F:/jindan-dotnet/artifacts/ready-for-review/final66-r4
판정: 수정 후 재검토 필요. reportReady=false, supervisorAccepted=false.
이 문서의 파일 생성은 개발자 수신 또는 직접 채팅 연결을 뜻하지 않는다.

## 1. 독립적으로 확인한 범위
- 최초 및 종료 시 패키지 선언 파일 3,226개, 제품 입력 176개, 기존 F:/jindan 보호 파일 626개 해시 일치. 기존 Git HEAD/dirty 상태도 일치. 전체 소스 트리·무시된 출력 전수 검증은 아니다.
- artifact-manifest SHA256: 8b816b99814d21779f85a843c3c2f991856759d2ce144957cd1b154887ab6fb2
- source-checkpoint SHA256: bea660cb04a49cbc671054c7c5ea26123469310cda2a8033f91fd26798274e58
- 별도 사본 product-patch66-supervisor-r4-01/application에서 명시적 합성 로컬 계정 생성·로그인, 프로젝트/공정 저장, 합성 PNG 가져오기, 9개 모듈 화면 열기, 정상 종료 및 재로그인 확인. 모든 업무 기능의 전수 검증은 아니다.
- 동결 R4 엔진에서 null/undefined/string/0/예외 getter 처리, ZIP 중복의 패키지·파서·전체 facade 차단, 사전 취소: 9/9 통과. 보고서 실물 품질 승인이 아니다.
- 실제 프로젝트 모듈 1.0.0 → 1.1.0 교체: 새 ‘진행중만 보기’와 적용 상태 표시 확인. 바뀐 불변 파일은 projects DLL과 module.json뿐이다. 다른 호스트·모듈 변경 없음.
- 실제 1.0.0 롤백 후 불변 파일 3,212개 전부 기준과 일치, 새 필터 사라짐, 합성 프로젝트 표시, health exit 0. 패치 직후와 롤백 직전/직후 각각 데이터 파일 4개 해시 일치. UI 재실행에 따른 workspace.json/bak 레이아웃·revision 변경은 별도이며, 사용자·업무 3건·자산 1건은 보존됨.
- 보고서 스튜디오는 네이티브 UI/계약과 격리 JS/WASM 엔진을 결합한 하이브리드다. 순수 C# 보고서 변환 완료로 표현하지 않는다.

## 2. 필수 수정 A: 불완전 스냅샷 롤백의 데이터 손실 (High)
정확한 R4 UpdateCoordinator.cs 121-126, 특히 125행의 DeleteOwnedTree(data, root); CopyTree(snapshot, data).
- 백업 폴더 존재 여부만 확인하고, 전체 목록·내용 무결성 확인 없이 현재 data를 먼저 삭제한다.
- 정확한 R4 CLI와 합성 committed journal로 재현했다. 두 파일을 가진 합성 스냅샷의 SHA 목록을 먼저 기록하고 한 파일을 제거한 뒤 rollback을 실행하니 exit 0 / rolled-back을 반환했다. 현재 자료 두 파일은 없어지고 스냅샷의 남은 한 파일만 복구됐다.
- 이는 손상 상황을 주입한 journal 시험이다. 실제 ApplyAsync 스키마 마이그레이션의 전체 실행은 동적으로 재현하지 않았다. 정상 동일 스키마 프로젝트 패치 성공과 구분한다.
- 백업 폴더가 아예 없는 경우는 DATA_BACKUP_MISSING으로 현재 자료 삭제 전에 차단됐다. ‘없는 폴더도 삭제한다’고 확대하지 않는다.
- 명시적 rollback/recover 및 스키마 변경 실패 복구가 같은 Restore 경로를 사용한다.
요구: staging 스냅샷의 전체 경로/크기/SHA 목록 생성·검증 후 원자적 게시, 복구 전 전체 무결성 검증, 별도 staging 복원 검증 후 안전한 교체. 실패 시 현재 자료 유지. delete-then-copy 금지. 손상/누락/읽기 실패/교체 실패/재시작 복구 시험을 추가한다.
정확한 증거: rollback-probe/R4-ROLLBACK-FINDING.md 및 case-complete-then-corrupt-snapshot/setup-and-corruption-evidence.json, result.json.
UpdateCoordinator.cs SHA: efe1ab10cea6d8c91b2ebb8f93f719ff1a8c8e9162809b7b68745cc1ad3f7429
실행 Update DLL SHA: fbbe36e5d82008bbe6a1803d8da8f8bdd3706fdc3740591e68f92b00e7c8df0b

## 3. 필수 수정 B: 목록 첫 행과 실제 선택 상태 불일치
- 실제 사진 가져오기 UI로 PNG 한 장을 등록하면 목록 첫 행이 선택되어 있지만, 오른쪽 제목/자산 ID/SHA가 비고 큰 미리보기도 비어 있었다. 그 셀의 UIA Invoke 및 ‘다음 사진’을 실행한 뒤에도 그대로였다.
- 재로그인한 프로젝트 화면에서도 첫 행이 표시되지만 편집란은 비어 있는 상태를 관찰했다. 다른 모든 업무 모듈의 편집 영향까지 전수 검증한 것은 아니다.
- 공통 RecordDocument.cs 68, 69-78: refreshing 중 SelectionChanged를 무시한 뒤, 행 Tag 설정/refresh 완료 후 Selected/Values와 화면 선택을 다시 맞추지 않는다. Photos/Module.cs 48-64는 이 선택값/이벤트로 미리보기를 로드한다.
요구: refresh/import/reopen 후 시각적 선택과 Selected/Values를 명시적으로 일치시킨다. 선택하지 않은 상태를 택하면 Grid도 분명히 선택 해제한다. 미저장 변경 보호, 이전 문맥·비동기 미리보기 취소를 유지한다. 단일 사진 첫 등록/재시작/다음·이전/목록 갱신/프로젝트 전환 및 실제 첫 행 편집 저장을 UI 경로로 회귀시험한다. 내부 필드를 강제로 주입한 테스트만으로 통과시키지 않는다.
RecordDocument SHA: 40897c65f209244b3c769a9fabcca148d23750bf8eb426e6df74ff393fe33eb0
Photos Module SHA: 99a08391338347dfd9be862a1bdef1b537034d4afc489d6436f831e862e2484b
증거: ui-photo-import.json, ui-photo-selected.json, ui-photo-next.json, ui-patched.json 및 검토 화면 캡처.

## 4. 사용성 개선
- 기본 창 폭에서는 현재 프로젝트 선택기/목록 갱신이 도구모음 overflow에 들어간다. 최대화하면 표시된다.
- 프로젝트 신규 저장 후 전역 선택 목록은 ‘목록 갱신’이 필요하다. 누락으로 오해하지 않도록 자동 갱신 또는 명확한 안내가 필요하다.
- 보고서 문서 탭에는 사람이 읽을 프로젝트명 대신 내부 GUID가 나타났다.

## 5. 재인계와 보존 조건
기존 개발 플랫폼이 위 문제를 수정하고 자체 검증한 뒤 새로운 R5 등 별도 불변 인계를 만들 것. R4, 본 검토 사본/증거, 기존 F:/jindan 및 dirty/untracked, 회사 원본, 한글 PID11908, 별도 PDF 앱은 건드리지 않는다. 부모는 작업자 소스를 직접 수정하지 않았다. 배포·commit/push·외부 업로드·유료 API·폰트/한글/보안 설정 변경 금지.
새 인계에 변경 파일/정확한 SHA, 원인·수정, 재현 및 회귀 로그, 실제 UI 초기 선택과 복원 손상 시험, 타 모듈 불변·데이터 보존·정상 종료 증거를 포함한다. 자체 통과를 supervisorAccepted로 바꾸지 않는다.

## 6. 미승인·차단 범위
- 원래 글꼴·source JSON/메타데이터·탭 속성·모든 개체 편집성·전체 숫자/셀 의미·회사 금회 자료·사람 승인·실무 적용은 미승인이다.
- 실제 외부 서비스/클라우드/배포 서명, 물리 OS DPI150/200은 이번 독립 검토에서 검증하지 않았다.
- [blocked] 개발 플랫폼 → 이 Aside 채팅의 직접 전달 및 LINK66-DIRECT-20261105 수신 확인은 없다. STATUS66의 마지막 보고도 deliveryVerified=false이다. 수정 지시서의 파일 저장만 완료했으며 개발 플랫폼 수신/착수를 주장하지 않는다. 멈춘 개발 창은 강제 종료하지 않는다.

## 7. 증거 위치
F:/jindan-maintenance/20261105-audit65/review-r4-01/
identity.json, identity-final.json, engine-repair-independent.json, after-patch-before-ui.json, after-rollback.json, rollback-data-check.json, rollback-health.json, business-preservation.json, ui-*.json, rollback-probe/.
검토 사본: F:/jindan-dotnet/artifacts/product-patch66-supervisor-r4-01/application (모듈 1.0.0 복원, 합성 자료만 존재).
