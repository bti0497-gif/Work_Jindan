# ROADMAP66 로컬 구현·자체검증 인계

신규 작업 위치는 **F:/jindan-dotnet**, 독립 검토 대상은 **artifacts/ready-for-review/final66-r4**이다. 엔진 보수 후 .NET10 WinForms MDI 작업대, 기능별 패키지, 로컬 업무 흐름과 실제 프로젝트 모듈 패치/rollback의 구현·자체검증을 마쳤다. M0~M8의 로컬 범위를 인계하며, 클라우드·회사 금회 실자료·정확한 새 HWPX의 한글 실물 승인은 별도 보류한다. **reportReady=false / supervisorAccepted=false**이다.

## 실행과 독립 검토

전역 설치 없이 원본 검토 묶음의 읽기 전용 상태 검사를 할 수 있다.

```powershell
Set-Location F:/jindan-dotnet
& ./artifacts/ready-for-review/final66-r4/Run.ps1 -HealthCheck
```

실제 작업·패치 시험은 기준 묶음을 보존하도록 새 사본에서 한다. 아래 대상은 아직 없고 사용하지 않은 경로여야 한다. 이미 존재하면 새 이름을 사용한다. 기본 로컬 자료는 해당 사본의 data 폴더에 저장되며 최초 계정 설정은 명시적으로 진행한다. 이전 계정·회사 자료를 자동 이관하지 않는다.

```powershell
node tools/prepare-product-clone66.mjs artifacts/ready-for-review/final66-r4 artifacts/product-patch66-independent/application artifacts/product-patch66-independent/COPY_RESULT.json
$app = 'F:/jindan-dotnet/artifacts/product-patch66-independent/application'
$env:DOTNET_ROOT = "$app/.runtime"
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
& "$app/.runtime/dotnet.exe" "$app/Jindan.Desktop.dll" --installation-root $app
```

[실행·패치·복구 절차](../docs/run-review66.md), [패키지 계약](../docs/module-package66-spec.md), [데이터 이관 범위](../docs/migration66.md)를 함께 따른다. 동결 묶음 안 RUN-REVIEW.md의 예전 패치 예시보다 최신 run-review66.md의 **새 시험 사본 절차**가 우선한다. 실행 중 DLL을 덮어쓰거나 실행 정책을 변경하지 않는다.

## 구현 범위

- UI 독립 Contracts/Core와 Desktop.Contracts, 명시적 ModuleHost, 로컬 저장소, Update/복원 도구를 분리했다. Projects·Processes·Photos·Files·Tasks·Board·Members·Dashboard·ReportStudio의 **9개 기능 DLL**은 서로 직접 참조하지 않는다. 공통 계약과 주입 서비스로 연결한다.
- MDI 문서 탭, 여러 문서, 좌우/상하 비교, 같은 문서 문맥의 좌우 패널, 크기·숨김·교환·분리·복귀·배치 저장, 미저장 닫기와 오류·취소를 구현했다. 실제 96/120 DPI 이동에서 창 경계와 달력의 토요일 열을 확인했다. 150/200%는 **프로그램 내부 배율 시험**이며 실제 OS DPI 검증은 아니다.
- 프로젝트/공정·일정·완료율, 사진 가져오기/분류/미리보기/썸네일/별도 편집본, 파일 폴더/탐색/이동/이름/ZIP, 할 일/공개범위/달력, 게시판 답글/첨부, 회원/직위/역할/프로젝트 권한, 대시보드·허용 자료 검색을 로컬 저장·재실행과 연결했다. 사진은 225개 항목/110개 원본 시험에서 비동기 취소·캐시 상한·잠김/손상·원본 불변을 확인했다.
- 인증은 새 로컬 계정의 명시적 초기화와 비밀번호 파생 저장이다. 저장 계층에서 실제 세션·현재 역할·프로젝트·소유자·리비전을 검사한다. 기존 Firebase 계정이나 권한을 복사하거나 우회하지 않는다.
- ReportStudio는 선택 PDF/한글 원문 미리보기, 분석/장·표·그림·교체 데이터, 원문 위치/복귀, 원본 쌍 서식 학습, 선택 장 복원 후보, 검토·근거·빈/근거 기반 초안, JDF 조사양식과 반환, 산출물, 보관/회수/새 분석을 실제 네이티브 컨트롤 명령에 연결했다. 회수된 분석·승인은 과거 상태이며 새 분석/검토 없이 초안을 실행할 수 없다. 과거 측정/판정을 금회 실값으로 만들지 않는다.
- 조사양식/선택 슬롯의 합성 검사는 회사 전체 양식 승인과 다르다. HWP/HWPX 미리보기는 선택 파일 바이트에서 생성하며 연결 PDF를 대신 보여주지 않는다. 미리보기 성공은 한글 실물 조판 성공이 아니다.
- .NET의 ZIP/manifest/해시/회수 경계를 독립 엔진으로 승격했다. 복잡한 PDF/HWPX 복원과 CAD는 보수된 격리 JS/WASM worker를 사용하는 **Hybrid**이다. 전체 알고리즘을 순수 C#으로 바꿨다는 주장은 하지 않는다.

28개 기존 기능의 대응·차이·상태는 [전체 대응표](../docs/feature-parity66.md)와 [JSON](../migration/parity66.json), 보고서 세부 11개는 [보고서 대응표](../docs/report-parity66.md)에 있다. 안전한 게시판 일반 텍스트, 별도 사진 갤러리 등 이전 React UX와의 차이도 명시했다. 파일 F2/드롭 핸들러와 공유 명령은 구현·검사했지만 물리 키/드래그 제스처 자체를 모두 시험했다고 표시하지 않는다.

## 엔진 보수와 재사용

감사65의 throw null/undefined/임의 값 예외를 안전한 코드·취소 의미로 정규화했다. 원시 ZIP 항목을 검사하여 HWPX parser/facade와 archive/recovery의 중복·경로·크기 위반을 거부한다. 수정 전 4개 결함을 재현한 실패 기록, 수정 후 선택 12개 및 관련 전체 회귀 기록을 보존했다. worker는 소유 프로세스만 실행·취소하며 요청 ID/세대·프로젝트·원본/분석/검토 해시, 제한 크기, 시간초과와 종료를 확인한다. Promise.race만으로 종료됐다고 처리하지 않는다.

보수된 JS 단일 수정 원본은 src/Jindan.Report.Worker/engine이다. [재사용 계약](../docs/engine-reuse66.md), [프로토콜](../docs/worker-protocol66.md), [보존 부록](../docs/preservation-contract66.md)을 따른다. 독립 JS facade 묶음 artifacts/fixed-engine66.zip과 동결 실행본의 reusable-engine/native는 역할이 다르다. 후자는 실제 native DLL/계약/Adapter와 정확한 worker 바인딩을 포함하며, PDF 전체 런타임은 선언된 ReportStudio 패키지에 있다. 별도 PDF 앱은 수정하지 않았다.

## 실제 검사 결과

최종 [VALIDATION66.json](VALIDATION66.json)에 명령·종료값·시간(기록된 경우)·로그·정확한 결과 SHA를 모았다. 서로 겹치는 검사 수는 합산하지 않는다.

| 검사 | 결과·근거 |
|---|---|
| clean Release/build | 경고 0 / 오류 0; artifacts/checks66/2026-11-05T00-03-06-633Z/RESULT.json의 12개 명령 모두 exit0 |
| 최종 오프라인 Node | 260 통과 / 실패·skip 0 |
| 공통 JS/native golden / native 엔진 | 8 / 16 통과 |
| Domain / Package / Sync / Legacy import / Report Adapter | 22 / 37 / 24 / 11 / 41 통과 |
| 정확 R4 MDI·재실행·사진·달력 | 23 + 4 + 8 + 4 = 39 통과; 매 단계 공통 DLL 8개와 실제 9개 모듈 목록 해시 확인 |
| 정확 R4 보고서 UI | 60 통과; 패키지 DLL 6개 + 번들 Node/worker 해시 결합 |
| 정확 R4 Files/Board | 14 통과; 캡션·탐색·스레드 배치 포함 |
| 실제 Projects v1→v2→v1 | 부모 12검사 통과; 새 프로세스의 실제 필터, 정상/실패 rollback, 사용자 자료 및 비관련 payload SHA 불변 |
| 실제 Program 진입 / 읽기 전용 launcher health | 1 / 1 통과; Program 검사는 최초 로그인 창 정상 열기·닫기 범위이며 로그인/업무 전체 승인이 아님 |
| 정확 번들 CAD worker | 5 통과; 오프라인 Node와 중복되는 범위 |
| 최종 payload/source 재해시 | 3,226개 동결 파일 / 현재 제품 입력 176개 일치 |

네이티브 UI 인계서는 artifacts/final-r4-desktop-ui66-01/FINAL_UI_HANDOFF.json, 보고서는 artifacts/report-ui66-packaged-r4/RESULT.json, 실제 패치는 artifacts/product-patch66-r4/run-r4/RESULT.json이다. [VISUAL66.json](VISUAL66.json)은 최종 이미지 중 직접 확인한 7개와 한계를 기록한다. [SELF_REVIEW66.json](SELF_REVIEW66.json)은 권한·취소·패치·원본·조판 경계의 자체 검토이며 독립 보안감사로 표시하지 않는다.

초기 패키징 경로 오류, 이전 DPI 창 넘침, 숨은 캡션, 달력 잘림과 실패한 원인 대조들은 각각 보존했다. R2/R3의 의미 검사 통과를 R4의 화면 증거로 대신하지 않았다. 최종 선택 R4만 위 결과의 대상이다.

## 동결 식별자와 보존

| 대상 | SHA256 |
|---|---|
| R4 artifact-manifest.json | 8b816b99814d21779f85a843c3c2f991856759d2ce144957cd1b154887ab6fb2 |
| R4 source-checkpoint.json | bea660cb04a49cbc671054c7c5ea26123469310cda2a8033f91fd26798274e58 |
| R4 Jindan.Desktop.dll | 0cb1f9e3191c945dfdb85c16f892dc6a4dd986bfad047089abe78914220b0e08 |
| Projects v2 module.json | 1918cf1e00f255e9801471b0e333ad4ceef0903dd35c6ca910ca42b8c02ed541 |
| reusable-engine/native/MANIFEST.json | e67d33c18292f49d8d1fd24af5700ee3e40612bf969fece9933dae1cc6962e8c |
| fixed-engine66.zip | 85f53f0444ae6b9d4a1ee03e8081debbd8821afdfd650d8ef8162d497ed05334 |

동결 전체는 3,226파일/432,166,681바이트, application은 3,212파일/431,834,821바이트다. 제품 입력 176개와 전체 새 소스/시험/도구/문서 체크포인트 [SOURCE66.json](SOURCE66.json)의 범위를 구분한다. 최종 인계 파일 해시는 [FILES66.json](FILES66.json)에 있다. 동결 payload 자체는 artifact-manifest가 전수 식별한다.

기존 F:/jindan의 HEAD 48daf3e6208437bd0a4160777adf32357a197c98, dirty/untracked 상태와 기준 626파일, 원본 3개, 동결63 ZIP이 일치했다. [PRESERVATION66.json](PRESERVATION66.json)에 근거가 있다. 이는 모든 ignored 산출물을 전수 조사했다는 주장이 아니다. 원본 회사 파일·자격증명·이전 node_modules/bin/obj는 제품에 복사하지 않았으며 이전 자료/감독 기록을 수정하지 않았다. commit/push/deploy나 실제 클라우드 쓰기·유료호출은 하지 않았다.

## 남은 선결조건과 직접 보고

1. 실제 새 출력의 한글 열기·편집·저장·재열기·페이지별 조판과 모든 객체/수치/셀 의미, 원본 글꼴 실선택·포함폰트 유지·source JSON·탭 속성은 독립 감독 검토 대상이다. 과거 final28의 자동축소 해제 조건에서 확인된 그림 보존을 새 SHA에 승계하지 않는다. 앱이 한글 설정을 바꾸거나 가짜 문서 옵션을 만들지 않는다.
2. 금회 회사 실자료와 사람 검토가 없으므로 실제 회사 전체 금회 보고서 업무는 승인하지 않는다. 합성 성공을 실자료 성공으로 바꾸지 않는다.
3. Firebase/Drive/유료 AI 생산 adapter·실계정/rules·실연동, publisher 서명/배포는 구현·검증되지 않은 외부 통합 범위다. 로컬 대체 기능과 명시적 loopback 시험은 실제 서비스 성공이 아니다. 금지된 실제 쓰기·비용·보안/모델 설정 변경을 수행하지 않았다.
4. 첫 로컬 SDK 빌드에서 자동 ASP.NET 개발 인증서 설치 메시지가 출력됐다. 직접 생성/신뢰/store 편집은 실행하지 않았으나 인증서가 생성되지 않았다고 단정할 수 없다. 이후 도구는 프로세스 단위 생성 방지 옵션을 사용했다. 기존 인증서를 임의 삭제하지 않았다. [환경 관찰 기록](../docs/sdk-first-run-observation66.md)을 확인한다.
5. Aside 직접 보고는 대상 창을 식별했으나 창 활성화 실패, 대체 브라우저 host 부재로 **실패**했다. 입력·전송은 하지 않았으며 도착을 주장하지 않는다. 전달용 문구는 [SUPERVISOR_MESSAGE66.txt](SUPERVISOR_MESSAGE66.txt)에 남긴다. 이 공개 인계와 STATUS가 실제 전달 경로다.

이 인계는 로컬 구현·자체검증 완료 후의 **독립 최종 검토 요청**이다. 감독 승인이나 회사 보고서 완성 선언이 아니다. 실제 quota 차단은 발생하지 않았고 초기화·결제·권한 설정을 변경하지 않았다.

?? ? ??????????? ?????: **332??**, aggregate SHA256 **2b656876dd03954c0c821d4399ae95dcaec6286d16e5682c063979e65618bbae**. ?? ?? ?? ????? ?? 0? ????. ? ??? ?? ?? 176?? ?? R4 ?????? ??? ???.
