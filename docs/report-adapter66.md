# 보고서 .NET 어댑터·모듈66

이 문서의 설정·원본 보존 설명은 보고서 기능과 그 검사를 대상으로 한다.
SDK 첫 실행에서 관측된 인증서 안내는
[sdk-first-run-observation66.md](sdk-first-run-observation66.md)에 별도 기록했다.
감독59–63의 정확한 사본과 자동축소 조건에만 적용되는 그림 보존 근거 및
새 앱으로 승계하지 않는 범위는
[preservation-contract66.md](preservation-contract66.md)를 따른다.

## 최종 보존·동시 편집 경계

보고서 원본·후보·조사양식·회수 ZIP·분야 JSON의 사용자 내려받기는 모두 새 경로만
허용한다. 기존 대상은 덮어쓰거나 백업하지 않는다. 로컬 절대 경로와 기존 부모를
검사하고 보존 루트, UNC, reparse 조상을 거부한 뒤 소유 임시 파일을 CreateNew로
기록하고 no-replace rename한다. 실패 정리는 소유 임시 파일에만 적용한다.

같은 사용자·프로젝트의 workspace.json은16MiB 이하로 읽고 저장한다. 문서마다
로드한 실제 바이트 SHA를 보유하고 저장 때 경로별 semaphore와 배타적 lease를
잡아 최신 SHA를 다시 검사한다. 오래된 MDI 문서는 최신 저장본을 덮지 않고
미저장 상태를 유지한다. 손상·초과 파일은 유효한 저장 기준으로 인정하지 않는다.
문서 ContextId 변경과 미저장 상태의 문맥 전환도 거부한다. 저장 권한은 매번
호스트의 실제 프로젝트 권한으로 확인한다. 기존 .blob 자산은 현재 프로젝트의
OriginalName/ID/경로/SHA를 확인해 읽으며, viewer의 미리보기·분석은 프로필을
쓰지 않는 임시 상태다. 다른 프로젝트 자산은 프로필에 경로를 넣어도 채택하지 않는다.

회수 ZIP은 연결 원본·자료·후보와 전체 네이티브 작업상태의 읽기 전용 역사 영수증을
보존한다. 회수한 자료는 historical로, 후보는 부모/원본 SHA가 있는 복사본으로
목록에 제공한다. 후보의 새 내려받기 및 명시적 원본 재등록이 가능하지만 과거
검토·ACK·금회값·계산 상태는 실행 상태로 복원하지 않는다. 분야·전기·서식 메타데이터는
역사 영수증에서 열람하고 새 분석·검토를 거쳐야 한다.

ReportService는 출력 폴더 생성 전에 보존 루트·UNC·reparse 및 실행 경로를
검사한다. Dispose는 새 요청 입장을 닫고 실제 소유 Process 참조만 취소·종료·대기한다.
STA 종료에서도 UI continuation을 기다리지 않아 교착 없이 실제 자식 종료를 확인한다.
단일/동시 두 CPU 작업과 STA 종료를 실제 Node 프로세스로 검사했다.

현재 소스 검사 결과는 Worker20/20, 어댑터41/41, 실제 합성 WinForms53/53이다.
이는 회사 실물 승인과 다르며 reportReady=false, supervisorAccepted=false를 유지한다.
최종 패키지는 아래처럼 별도 참조로 재검사한다. final66-r6/application의 실제
패키지 검사에서는 기존53개 흐름과6개 DLL 바이트 비교·번들 런타임 확인까지
60/60을 통과했다. 회사 실물·한글 조판 승인을 뜻하지 않는다.

```powershell
.tools/dotnet/dotnet.exe run --project tests/Jindan.Report.Tests/Report.GuiSmoke.csproj -p:InstallationRoot=<application> -- F:/jindan-dotnet ignored --package <application> --output F:/jindan-dotnet/artifacts/<fresh-output>
```

패키지 모드는 공유/보고서 DLL6개의 실제 로드 바이트를 비교하고 패키지 내
Node/worker만 사용한다. 명시한 output은 새 작업영역 artifacts 아래 존재하지 않는
디렉터리여야 하며 기존 경로나 연결된 조상은 거부한다. R4 결과·경로·SHA는
artifacts/report-ui66-packaged-r6에 남겼다. 실행 로그는
artifacts/report-ui66-packaged-r6.log이며 DLL 참조 빌드는
artifacts/report-ui66-packaged-r6-build.log에0경고/0오류로 기록되어 있다.
이전 R2·R4의 별도60개 결과와 그림은 기존 경로에 그대로 보존했다. R3·R5는
다른 모듈의 수정 대기로 보고서 GUI를 실행하지 않았으며 통과로 기록하지 않는다.

REVIEW69의 공통 목록 선택·사진 미리보기·프로젝트명 탭 수정과 업데이트 데이터
스냅샷 보완은 담당 영역에서 별도 검사했다. 이 보고서 검사는 R6의 실제6개 DLL과
런타임에서 기존 보고서60개 흐름을 새로 실행한 근거다. 보고서의 portable 역사
회수 ZIP과 업데이트의 전체 데이터 스냅샷 복구는 다른 계약이며, 후자의 완전성·
journal·손상 차단 범위는 [snapshot-restore69.md](snapshot-restore69.md)를 따른다.

`Jindan.Report.Adapter`는 UI 독립 계약을 구현하는 .NET DLL이다.
`Jindan.Modules.ReportStudio`는 WinForms 문서·왼쪽 목록·오른쪽 검토 패널을
등록하는 별도 DLL이며 어댑터 DLL을 직접 참조하지 않는다. 모듈 간 직접
참조 없이 주입된 `IReportService`, `IAssetService`, `IWorkspaceServices`를 쓴다.
실제 조판·분석 알고리즘은 보수된 단일 JS 원본에서 실행하는 Hybrid 경계다.
이 모듈화나 합성 검사 결과를 순수 C# 엔진 완성·회사 보고서 승인으로
취급하지 않는다. `reportReady=false`, `supervisorAccepted=false`를 유지한다.

## 구성·실행

생성자는 다음과 같다.

```csharp
new ReportService(
    dataRoot, nodePath, workerPath,
    timeoutMs: 120000,
    enableTestOperations: false,
    authorize: async (context, operation, cancellation) => {
        // 실제 로그인한 Actor와 Context.UserId가 같은지 검사한다.
        // 실제 저장소가 이 Actor에게 공개하는 프로젝트인지 확인한다.
        // 쓰기/검토/초안/회수 권한도 실제 역할로 검사한다.
        // 이 함수에서 무조건 admin 처리하거나 사용자 입력을 신뢰하지 않는다.
    });
```

선택 Node/worker는 존재하는 절대 경로여야 한다. 이 PC에서 확인된 Node는
`C:/nvm4w/nodejs/node.exe`이다. `C:/Program Files/nodejs/node.exe`를 있다고
가정하지 않는다. 앱 패키지의 worker/엔진/런타임/의존 리소스는 한 버전으로
제공한다. DLL만 임의로 교체하거나 원래 F:/jindan을 runtime으로 참조하지 않는다.

어댑터는 한 요청마다 `<dataRoot>/report-sessions/<requestId>`를 새로 만들고
입력 파일을 해시 검사 후 원자적으로 복사한다. 원본에 쓰지 않는다.
프로세스는 명시 Node 실행파일과 ArgumentList로 실행하며 shell·가시 창·
COM/OLE를 사용하지 않는다. 최소 시스템 환경만 넘기며 API 키/토큰/비밀번호
환경을 복사하지 않는다. stdout은 ID가 결합된 제한된 프로토콜이고 stderr는
본문/자격증명 로그로 내보내지 않는다. 최종 JSON 및 모든 바이너리 참조의
세션 containment/링크/크기/SHA를 확인한 뒤에만 결과를 돌려준다.

취소와 timeout은 소유한 `Process` 참조 하나만 종료하고 실제 종료를 기다린다.
다른 앱이나 프로세스 이름으로 일괄 종료하지 않는다. 동일 문서의 새 요청은
이전 요청을 취소하고 generation이 바뀐 결과를 거부한다. 문서가 달라지면
병렬 실행은 허용하지만 request/project/source ID를 혼합하지 않는다.

자세한 파일·작업·PNG 바이너리 계약은 [worker protocol](worker-protocol66.md)에 있다.

## 회수·검토 경계

입력 및 문서/그림/아카이브 binary 산출물은160MiB로 대칭 제한하고,
분석/result JSON bundle만192MiB를 허용한다. Worker는 큰 binary를 쓰기 전에
거부하고 .NET은 반환된 모든 binary descriptor를160MiB 이하로 재검사한다.
테스트 전용 소형 경계 주입은 명시 테스트 작업/환경에서만 동작한다.

1. `analyze` 성공 시 실제 원본 SHA와 worker project 및 분석 fingerprint를
   검사하고 어댑터 소유의 bundle JSON 사본/해시를 저장한다.
2. prepare/restore/pair/write/collection은 이 문서의 새 분석 없이는 실행하지 않는다.
   호출자가 bundlePath를 주면 소유 bundle과 바이트 해시가 같아야 한다.
3. `AcknowledgeReviewAsync`는 정확한 sourceSHA/fingerprint 및 전체 context JSON의
   `review.sourceSha256`를 검사하고 그 **context 파일 바이트 SHA**를 고정한다.
   이후 write/exportCollection/importCollection은 같은 파일 바이트와 현재 분석에
   대해서만 허용한다. 문구·근거·작성 목적 변경은 새 확인이 필요하다.
4. 프로그램 확인은 사람·한글 실물·공학적 적합 승인이 아니다. 실제 evidence
   bytes와 원문 슬롯/내용역할은 JS 엔진이 다시 검사한다. 빈칸과 현재 실값은 다르다.
5. `recover`, 원본 변경, 문서 invalidate는 분석/검토를 비운다. 회수 archive state는
   보존 자료일 뿐 실행 가능한 승인이나 최신 bundle로 되살리지 않는다.
6. 인증은 어댑터의 DTO 검사가 대신하지 않는다. 제품 호스트는 위 authorize
   콜백을 연결해야 한다. 모듈도 실제 Assets.GetAsync(actor,id)로 프로젝트/자산 접근과
   해시를 검사한다. 독립 운송 시험만 콜백 없는 명시 합성 문맥을 사용한다.

## 실제 모듈 화면 동선

- 왼쪽은 현재 프로젝트의 보고서와 분석 장 목록이다. 로컬 PDF/HWP/HWPX를
  실제 자산 저장소에 가져오며 SHA 중복을 피한다. 목록 제거는 연결만 제거한다.
- 가운데 미리보기는 선택 원본 바이트를 직접 로컬 PDF.js 또는 @rhwp WASM으로
  렌더링한 PNG다. HWPX에 PDF 대조 화면을 대신 쓰지 않는다. 이전/다음/쪽 번호가
  있고 독립 렌더러·한글 실물 미승인임을 표시한다. 안전하게 렌더링할 수 없는
  SVG·그림·형식은 명시 오류이며 텍스트 분석 화면을 미리보기로 위장하지 않는다.
- 분석보기는 장별 쪽·본문·표·그림·머리말/꼬리말·폰트 집계와 원문 슬롯이다.
  전체/표/그림/교체자료를 필터하고 오른쪽에서 역할·처리·유지 목적·문구·빈값·
  실제 자료 근거를 정한다. 그림도 독립 review 항목이다.
- 현재 목적 `금회 빈칸` 또는 `금회 근거`를 선택하고 검토 저장·새 문맥 확인을
  실행한다. 초안 준비는 blockers/pending을 보여 주며 실제 자료 없는 현재값이나
  판정은 만들지 않는다. 초안은 새 HWPX 후보이며 원본을 덮지 않는다.
- 빈 조사양식 내려받기→작성본 반환→JDF/문맥 검사→빈칸 명시 확인 또는 값 연결→
  새 검토 확인→초안 생성으로 연결된다. 반환 파일 자체를 실제 evidence 자산으로
  보관·결합한다. 경고가 있거나 반환 뒤 원본/검토가 바뀌면 적용을 차단한다.
- 금회 자료 등록·검사는 BMT/PWV/CSV/XLSX의 실제 기존 제한 파서를 호출한다.
  BMT 원시 grid를 온도로 확정하거나 PWV 채널을 자동 공학 판정하지 않는다.
- 프로젝트 목록·자산·검토 후보·산출물 이력을 원자 저장한다. 새 문서/재실행에서는
  목록을 회수하되 fresh 분석과 확인은 비운다. 이전 결정은 같은 원본/실제 슬롯을
  대조한 뒤 명시적으로 **재검토 후보**로 불러올 수 있고 승인을 자동 복원하지 않는다.
- 회수 archive는 연결 원본·자료·검토 context·출처가 맞는 후보의 해시/parent를
  담는다. 원본 사본을 다시 등록한 뒤 새로 분석한다. 회수 evidence/candidate의
  자동 회사업무 적용은 하지 않는다. 연결에서 제거된 옛 자료 전체나 별도 원본
  글꼴 보존/회사 전체 업무를 이 제한된 archive 시험으로 승인하지 않는다.

## 추가 연결된 로컬 기능

같은 보고서 PDF와 원본 HWPX를 선택해 실제 `pairReference`를 실행한다.
참조 원본은 별도 문맥에서 분석하고 양쪽 바이트·프로젝트·분석 fingerprint를
검사한다. 결합한 새 분석은 어댑터 소유 bundle로 교체하며 이전 검토를 비운다.
정적 서체/문단 대응은 실제 한글 글꼴 사용·배치 승인과 구분한다.

`서식·개체 편집`은 원본 HWPX의 실제 구역별 용지·여백·장평·자간·문단
들여쓰기/내어쓰기·간격·줄 나눔·역할별 서체를 편집한다. 머리말/꼬리말은 실제
슬롯과 정렬을 편집하고 표/그림/도형 위치는 원래 개체 ID를 유지한다. 실제
근거 그림을 선택 개체에 연결하며 원본 패키지를 덮지 않는 서식 후보를 만든다.
글자/여백 변경 후 실제 줄 흐름·쪽 배치는 별도 검증이다. 서식 사본은 과거
내용을 보존하므로 금회 빈 초안과 혼동하지 않는다.

`분야 양식·계산`은 공정/기계/전기별 실제 표·셀 후보, 명시적 사용자 항목,
자료형/단위, 계산 규칙/근거/확인, 담당자 메모, 회차 이력, 빈 조사 JSON 및
같은 source/schema 반환을 제공한다. 과거 숫자를 현재 입력으로 복사하지 않는다.
선택 입력칸 요약을 회사 전체 보고서로 승인하지 않고 검토 없는 옛 nativeWriter
출력 경로도 활성화하지 않는다. HWPX 초안은 엄격한 전체 검토 경로를 사용한다.

`전기 자료 준비`는8개 분류, KEPCO 포함/제외 이유, 기간, 조건/진단 메모,
개선 협의 상태 및 BMT/최종 이미지/결과표 묶음을 실제 파일 SHA와 연결한다.
`금회 자료 검사`는 PWV 계측기/사이트/기록 선택·채널 검색과 원시 통계,
CSV/XLSX 표, BMT 환경/카메라 점/제한 및 원본 내장 이미지를 표시한다.
교정·IRSoft 편집점·단위/CT/PT 해석 승인은 포함하지 않는다.

목록 관리에서 제목/종류/시설/서식그룹/메모를 원본 SHA에 연결해 저장하고,
로컬 폴더 최대50개 등록과 원본 바이트 사본 내려받기, 미사용 자료 연결
제거를 제공한다. 원문 위치는 PDF의 페이지 앵커, 한글은 독립 렌더러의 실제
배치 텍스트 일치 후보를 사용한다. 여러 쪽 일치는 후보로 표시하며 실제
한글 페이지로 확정하지 않는다. 돌아가기 플로트가 분석 선택/스크롤을 복원한다.

`이전 프로젝트 가져오기`는 기존 `.jindanproj`를 순수 검증기로 읽고 파일 수·
SHA·목차를 먼저 보여 준다. 별도 확인 전에는 자산을 등록하지 않는다. 확인 시
현재 권한 프로젝트에 새/동일 SHA 중복 방지 자산 ID로 등록하고 옛 계정·권한·
분석·검토·현재 입력·승인은 적용하지 않는다. 옛 목차/문구는 읽기 전용 역사
문맥으로 보관하고 자료는 역사자료로 표시해 현재 근거로 암묵 사용하지 않는다.
원본 파일 바뀜·검증된 sidecar 바뀜을 다시 검사하며 새 분석/검토가 필요하다.
이 경계는160MiB 입력/512MiB 합계 제한이며 옛512MiB 최대 아카이브 전체를
지원한다고 주장하지 않는다. 이전 IndexedDB에 직접 접속/쓰기하지 않는다.

## 자체 검사 재현

PowerShell에서 각 .NET 명령 전에 다음 프로세스 환경을 쓴다.

```powershell
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'
$env:DOTNET_NOLOGO='1'
$env:DOTNET_CLI_HOME='F:/jindan-dotnet/.tools/cli-home'
```

```powershell
node --test tests/WorkerProtocol/*.test.cjs
.tools/dotnet/dotnet.exe run --project tests/Jindan.Report.Tests/Jindan.Report.Tests.csproj -- F:/jindan-dotnet C:/nvm4w/nodejs/node.exe
.tools/dotnet/dotnet.exe run --project tests/Jindan.Report.Tests/Report.GuiSmoke.csproj -- F:/jindan-dotnet C:/nvm4w/nodejs/node.exe
```

Console 시험은 실제 소유 Node 프로세스와 합성 보고서로 경계·빈초안·양식·회수·
취소/CPU timeout/충돌/재시도/병렬 요청을 검사한다. GUI smoke는 STA Application.Run의
실제 새 WinForms 창/컨트롤, 실제 LocalWorkspace/자산/로그인된 합성 프로젝트와
같은 버튼 명령 메서드를 사용한다. 사용자 파일 선택/저장 대화상자에만 경로 인자를
주입한다. 다른 앱 조작/한글/클라우드/마우스 자동 조작은 없다. 시험 창은 정상 닫는다.

GUI 근거는 `artifacts/report-ui66/RESULT.json`,
`report-preview-native-controls.png`, `report-flow-native-controls.png`이다.
정확한 최종 횟수는 새 실행 로그를 따른다. 과거 횟수를 재실행 결과로 승계하지 않는다.

## 별도 남은 검증

실제 회사 금회 자료/사람 검토, 원본 글꼴 실선택·내장폰트 저장, 독립 source JSON의
한글 SaveAs 보존, 탭 속성 변화, 모든 개체 편집, 모든 회사 문서의 native 조판은
미승인이다. 기존 최종28의 그림/51쪽 출력 보존은 감독이 확인한 정확 SHA 및
저장 자동축소 해제 조건에만 적용된다. 새 앱/새 후보의 승인이 아니다.
원래 한글 설정·폰트·숨김 PID·보존 원본·감독 기록은 이 구현/시험이 변경하지 않는다.
