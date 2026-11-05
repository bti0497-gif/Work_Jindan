# REVIEW69 수정본 R6 인계

선택 검토본은 **R6**이다. 로컬 구현·자체 검증을 마쳤으며 감독의 독립 검토를 요청한다. R4와 실패한 R5는 보존된 과거 증거다. **reportReady=false, supervisorAccepted=false**를 유지한다.

작업 위치는 `F:/jindan-dotnet`이다. 기존 `F:/jindan`의 원본·dirty/untracked 작업과 R4·R5 묶음을 보존했다. ROADMAP66의 로컬 .NET 작업대에 감독 검토69의 A/B/C와 검사 중 드러난 두 경합을 반영했다. 회사 보고서 완성 또는 감독 승인 선언이 아니다.

## 바뀐 동작

1. **불완전한 백업으로 현재 자료를 지우던 복원 경로를 교체했다.** 실제 스키마 변경 전에 파일 경로·크기·SHA256과 빈 폴더까지 포함한 스냅샷을 staging에 작성하고 검증한 뒤 게시한다. 복원 시 저널에 결합된 manifest와 내용 전체, 전후 모듈 세대를 먼저 검증한다. 준비된 자료와 모듈은 별도 staging에서 확인하고, 기존 트리를 보존한 rename 단계와 저널로 교환한다. 중단·두 번째 rename 실패는 재개 또는 보상하며, 미완료 상태에서는 정상 시작을 차단한다. 기존 R4처럼 hash 결합이 없는 백업은 현재 자료를 건드리기 전에 거부한다. 자세한 계약과 보존 한계는 [snapshot-restore69.md](../docs/snapshot-restore69.md)에 있다.
2. **목록의 선택 표시와 실제 편집 대상이 일치하도록 했다.** 새로고침·가져오기·재실행 시 저장된 행 또는 첫 행을 모델·입력란·미리보기와 함께 선택한다. 프로젝트 변경, 지연된 조회, 수정 중인 행 이동에서는 문맥과 revision을 검사한다. 사진 가져오기 후 첫 사진의 속성과 큰 미리보기가 표시되며, 이전/다음·페이지 전환에서도 같은 행을 다시 결합한다.
3. **프로젝트 선택을 항상 보이는 독립 줄로 옮겼다.** 저장된 프로젝트 목록은 변경 알림으로 갱신한다. 보고서 문서 탭은 읽을 수 있는 프로젝트명 또는 선택 보고서명으로 표시하며 GUID를 표시명으로 쓰지 않는다.
4. **작업자 프로세스의 종료·핸들 해제를 직렬화했다.** 서비스 종료와 요청의 finally가 동시에 정리하던 `E_HANDLE` 경합을 수정했다. 캐시된 PID와 정확한 Process 객체를 결합하고, 종료 확인과 핸들 해제는 같은 잠금을 사용한다. 요청만 Process 객체를 해제하며, 반복 Dispose는 남은 소유 작업자를 재정리할 수 있다. 다른 앱은 종료하지 않는다.

## 검토 실행

불변 묶음은 `artifacts/ready-for-review/final66-r6`이다. 기본 launcher는 설치된 전역 SDK 대신 함께 제공한 .NET 런타임을 사용한다. 상태 확인은 다음과 같다.

```powershell
Set-Location F:/jindan-dotnet
& ./artifacts/ready-for-review/final66-r6/Run.ps1 -HealthCheck
```

실제 입력·패치 시험에는 불변 묶음을 실행하지 말고 새 사본을 사용한다. 대상이 이미 실행되었거나 자료가 있으면 다른 새 경로를 고른다.

```powershell
node tools/prepare-product-clone66.mjs artifacts/ready-for-review/final66-r6 artifacts/product-patch66-independent-r6/application artifacts/product-patch66-independent-r6/COPY_RESULT.json
$app = 'F:/jindan-dotnet/artifacts/product-patch66-independent-r6/application'
$env:DOTNET_ROOT = "$app/.runtime"
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --installation-root $app
```

[실행·패치 설명](../docs/run-review66.md), [모듈 계약](../docs/module-package66-spec.md), [엔진 재사용](../docs/engine-reuse66.md), [보존 계약](../docs/preservation-contract66.md)을 함께 따른다. R6 내부에 동결된 실행 설명의 검증 대기 문장은 패키징 시점의 기록이다. 최종 검증 현황은 이 문서와 `VALIDATION69.json`을 기준으로 확인한다. R4·R5 파일과 기존 FINAL66 기록은 역사 자료이며 R6 승인 증거로 승계하지 않는다.

## 묶음 식별

| 대상 | SHA256 |
|---|---|
| R6 artifact-manifest.json | 18ee3ca05967d16315d7d5648b744628f1773d00b1142babbd0e64409711c69d |
| R6 source-checkpoint.json | 6ad2e9573ee5450a1ac4edfee244e9cbc38f03b6ea56603953ffcf77f7e4b20f |
| R6 Jindan.Desktop.dll | ae3bbaf5bce738ec98b29501027255293a1e8deeeeb6afe3c0967947bbf2bc47 |
| Projects v2 module.json | 22a0377052c6136f91642d770d0688374a6da552a86f49d3b86127fc2a71fdfd |
| reusable-engine/native/MANIFEST.json | 27ae6eec5b7fc9543910fe902926d0831511083d5bccc8f9a204650fd6295dbe |
| fixed-engine66.zip | 85f53f0444ae6b9d4a1ee03e8081debbd8821afdfd650d8ef8162d497ed05334 |

외부 manifest에 등록된 파일은 3,226개/432,222,647바이트, application은 3,212개/431,884,997바이트다. 제품 입력 178개는 R6 동결 자료에 포함된다. R5 대비 앱 변경은 Desktop.Contracts.dll·Desktop.dll·Report.Adapter.dll·LOCAL-TRUST-POLICY.json 4개이며 추가·삭제는 없다. 모듈 9개와 패치 후보의 파일·manifest는 R5와 같다. 2,690개 worker 파일과 481개 런타임 파일도 그대로다. R4·R5 각각 3,226개 파일을 다시 검증했다. 근거는 `artifacts/packaging66/FINAL_R6_VERIFICATION.json`이다. 전체 소스·시험·문서는 제품 입력과 별도인 `SOURCE69.json`으로 동결한다.

## 검증 및 한계

최종 소스 전체 검사에서 Node 260, 공통 8, Domain 22, Native 16, Package 81, Sync 24, Legacy Import 11, Report Adapter 42가 통과했다. 명령 12개 전체 exit0이며 `artifacts/checks66/2026-11-05T02-26-32-107Z/RESULT.json`에 있다. 전체 검사 최초 solution 빌드 뒤 한 줄의 반복 Dispose 재진입을 보강했으며, 뒤의 어댑터 단계가 최종 코드를 다시 빌드하고 42개를 검사했다. 추가로 최종 소스를 깨끗이 지운 뒤 패키징에서 전체 19개 프로젝트·갱신 도구를 빌드했다. 경고/오류는 0이다. 이 시점 차이를 숨기지 않으며 `R6_PREPACK_CLEAN.json`과 R6 빌드 로그에 기록했다.

실제 R6 DLL 3개를 hash로 결합하고 R6 런타임으로 수행한 패키지·복원 시험은 **82/82** 통과했다. 경로는 `artifacts/review69-r6-snapshot-tests01/RESULT.json`이다. 두 runtime root 환경 변수도 번들로 지정했다. 이 수는 기존 81개와 정확한 배포 DLL 결합 확인 1개이며 고유 시험으로 합산하지 않는다. 어댑터 42개 중 한 항목은 실제 CPU 작업자 12회 동시 정리 시험이며 12개의 추가 독립 시험으로 세지 않는다.

R4 결함 재현은 별도 보존했다. `artifacts/review69-legacy-ab01`은 감독 지적과 같은 불완전 백업의 R4 자료 손실과 수정 CLI의 선행 차단을 합성 저널로 대조한 시험이다. 실제 Apply와 스키마 변경 후 중단·복원은 별도의 81/82개 회귀가 담당한다. `artifacts/review69-r4-before-ui01`은 정확한 R4 DLL로 첫 사진이 선택 표시만 있고 실제 대상·속성·큰 미리보기가 비어 있는 상태를 재현했다. 예상 결함을 확인한 이 결과를 성공한 제품 검증 수로 세지 않는다.

| 정확한 R6 검사 | 결과·근거 |
|---|---|
| MDI·기본 업무·사진·달력·선택·행 이동·새 프로세스 | 51/51; `artifacts/final-r6-desktop-ui66-01/FINAL_UI_HANDOFF.json` |
| 보고서 스튜디오 연결 흐름 | 60/60; `artifacts/report-ui66-packaged-r6/RESULT.json` |
| 실제 Projects DLL 교체·정상/실패 rollback | 부모 검사 12/12; `artifacts/product-patch66-r6/run-r6/RESULT.json` |
| 파일·게시판·로컬 자산·ZIP·권한 | 14/14; `artifacts/final-r6-local-modules66-03/RESULT.json` |
| 실제 Program 진입·정상 닫기 | 1/1; `artifacts/final-r6-actual-entry66/RESULT.json` |
| 불변 launcher health / 번들 CAD | 1 / 5 통과; `artifacts/final-r6-bundled69.json` |
| 검사 후 배포·제품 입력 재해시 | 3,226 / 178 일치; `artifacts/final-r6-completed-verification69-02.json` |

DLL 패치에서는 새 필터의 표시·작동, v1→v2→v1의 새 프로세스 3회, 업무 레코드와 비관련 payload 전체 hash 보존을 확인했다. Program 진입 1개는 최초 로컬 로그인 창 열기·정상 종료 범위이며 회사 로그인 업무 승인으로 확대하지 않는다. 화면 51개는 기본39+선택10+행 이동2의 중첩된 assertions다. 한글화 실물 검증이나 회사 업무 개수로 합산하지 않는다. 보고서·서식·회수 경로의 기능 대응은 `migration/report-parity66.json` 및 `docs/report-parity66.md`에 있다. ROADMAP66 전체 기능 대응·구현 범위는 기존 `docs/feature-parity66.md`와 `docs/architecture66.md`를 따른다.

R5 전체 화면 검사는 20 통과/3 실패였으며 새 프로세스·Report60을 수행하지 않았다. 실제 행 이동에서 SelectionChanged가 CurrentCellChanged보다 먼저 발생했다. 기존 보호 핸들러를 현재 셀 변경에도 연결하는 두 줄 수정으로, 같은 저장 검사와 데이터 확인을 유지한 채 수정했다. 최종 R6에서 51개를 다시 수행했다. 별도로 `02-19` 전체 검사에서 발견한 어댑터 종료 경합과 수정 후 42개/12회 원인 대조는 `artifacts/review69-adapter-race-final01/RESULT.json`에 있다.

`VISUAL69.json`에는 직접 확인한 이미지 10개(실제 PrintWindow 8개, 보고서 DrawToBitmap 제어 렌더 2개)와 한계가 있다. 최초 파일 검사 14개는 기능상 통과했으나 숨김 시작으로 캡처가 검었다. 02에서는 유효하지 않은 캡처를 거부해 12 통과/2 실패로 기록했다. 동일 harness를 보이는 GUI로 실행한 03은 14 통과했고 실제 파일/게시판 화면을 확인했다. 제품 변경이나 새 패키징 없이 시험 실행기를 바로잡았다. 모든 캡처·모든 UI 사용성을 전수 승인했다는 뜻은 아니다.

남은 독립 게이트는 다음과 같다.

- 실제 한글에서 새 .NET 경로의 회사 보고서 전체 조판, 모든 수치·셀 의미·객체 편집성·원본 글꼴·source JSON·탭·왕복 회수 검증은 승인되지 않았다. 기존 final28에서 저장 자동축소를 해제하여 확인한 그림 보존 결과를 새 SHA에 승계하지 않는다. 한글·폰트·설정과 숨김 PID11908은 조작하지 않았다.
- 실제 금회 회사 자료와 담당 검토가 없는 상태다. 과거 측정값·판정을 금회 실값으로 쓰지 않는다. 합성 자료/선택 셀 양식과 회사 전체 업무 승인은 구분한다.
- Firebase·Drive·유료 AI 생산 adapter, 실제 클라우드 쓰기, 기관 rules, 배포 및 publisher 서명은 별도다. 로컬 기능과 명시적 차단은 실제 서비스 성공 증거가 아니다.
- 복원 manifest·저널은 협력적 로컬 갱신의 안전 경계다. 적대적인 쓰기 권한자가 저널과 모든 파일을 함께 바꾸는 상황을 인증하는 서명은 아니다. flush와 rename이 모든 exFAT 전원 장애를 원자적으로 보장한다는 주장도 하지 않는다. ACL·파일 시각까지 보존하는 포렌식 백업이 아니며, retained tree는 자동 정리하지 않는다.
- 첫 SDK 실행에서 자동 ASP.NET 개발 인증서 설치 메시지가 관찰되었다. 직접 생성·신뢰·삭제를 실행하지 않았지만 생성되지 않았다고 단정하지 않는다. 이후 도구에는 프로세스 단위 생성 방지 옵션을 사용했다. [환경 관찰](../docs/sdk-first-run-observation66.md)을 보존했다.

원본 보존의 범위는 기존 626개 tracked/nonignored untracked 기준 파일과 Git HEAD/dirty 상태, 보고서 원본 3개와 frozen63 ZIP이다. 모든 ignored 산출물을 전수 조사했다는 뜻은 아니다. 추가 commit/push/deploy, 별도 PDF 앱 변경, 유료 호출·외부 업로드·설정 변경은 수행하지 않았다.

## 직접 보고 상태

Aside의 정확한 대화와 빈 입력란을 확인하고 LINK66-DIRECT-20261105 문구 입력을 시도했다. 도구는 오류 없이 반환했으나 문구가 화면에 보이지 않아 Enter/제출을 하지 않았다. 원인을 단정하지 않으며 직접 전달·감독 수신은 **미확인**이다. `review69/CHANNEL_RETRY69.json`에 기록했고, 전달용 문구는 `SUPERVISOR_MESSAGE69.txt`에 있다. 이 공개 인계와 파일 알림이 실제 통로다.

기계 판정은 `VALIDATION69.json`, 불변 상태 스냅샷은 `STATUS69.json`, 계속 갱신되는 감시 파일은 `STATUS66.json`이다. `FILES69.json`은 최종 인계·선택 근거 파일의 hash를 기록한다. 전체 제품 파일은 R6 artifact-manifest, 전체 신규 소스는 SOURCE69를 사용한다. 변동 가능한 STATUS66은 FILES69에서 제외하여 이후 진행 보고를 과거 인계 손상으로 오인하지 않게 했다.

전체 신규 소스·시험·도구·문서·migration 체크포인트는 **349개**, aggregate SHA256은 **a5cee644e07a73cf476ec0ff73c622b667f5bb0ee151eb7f5fb990d26bfa5242**다. generated output·bin/obj·node_modules·SDK·mutable handoff는 제외한다. 제품 입력 178개의 동결과 이 전체 소스 체크포인트의 범위는 다르다.

```powershell
node tools/source-checkpoint66.mjs verify handoff/SOURCE69.json
node tools/verify-handoff69.mjs
node tools/verify-review66.mjs artifacts/ready-for-review/final66-r6 artifacts/independent-r6-verification-NEW.json
```
