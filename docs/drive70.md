# Drive 목록 캐시와 레거시 시스템 경계: 실행70

이 문서는 `drive-files`, `drive-cache`, `legacy-drive-system`의 **로컬 구현과 실제 Drive 연동을 구분**한다. `reportReady=false`, `supervisorAccepted=false`다. Google 계정·토큰·기존 캐시·회사 자료를 읽거나 옮기지 않았고 실제 Drive 요청도 하지 않았다. `NotConfiguredDriveProvider`는 `DRIVE_NOT_CONFIGURED`로 차단한다. 실제 Google Drive production provider, OAuth 데스크톱 연결, 서버 권한 검증과 클라우드 파일 작업은 **미구현/미검증**이며 아래 로컬 시험 통과로 승인하지 않는다.

## 읽기 전용 원본 근거

`F:/jindan`의 소스만 읽었다. 사용자 환경파일이나 세션을 열지 않았다.

| 기존 파일 | SHA256 |
|---|---|
| src/services/driveCacheService.js | c562c41ab88080151d538b4eb27bcd9858dafabcb334f031387cc3ca45ed5fb0 |
| src/services/dataService.js | e986052d987560a5ea09b6a45d5d622a856cf1e57671679c98431d1453098b0a |
| src/services/driveService.js | 7b961cbfdaa707174bbe3d0e53e1a555df2a43d8cec428e93b9fb798cc140678 |
| src/services/driveDownloadService.js | 1bbb17d8ed61986fbb4a202a5bff9f234a80769bdece6aefbf911a050f5bf491 |
| src/components/FileManager.jsx | 31ad2ef6721bacf8fc6f104688efe1768a880ee3bb5c4c67794b3334dda9f226 |

기존 목록 캐시는 2분 TTL, 폴더별 pending 결합·revision 검증, 저장 목록의 즉시 사용, 숨김 이름 `.system/resources/resouces`, 순차 트리 warm과 실패 시 캐시 사용을 제공한다. App의 10분/online 갱신과 Firebase 업무 큐는 별도 경계다. 기존 dataService의 앱 시작 시 폴더 생성과 7일 지난 로그 정리는 라이브 쓰기이므로 새 앱 시작에 복제하지 않았다. 기존 FileManager 중복 업로드는 이름 변경 사본 또는 건너뛰기를 제안하며, 다운로드는 폴더 재귀 ZIP과 Google 문서 export를 제공한다.

## 구현 대응

| 원래 ID | 새 로컬 동작 | 근거 | 실제 연동과 차이 |
|---|---|---|---|
| drive-files | 기존 로컬 폴더/목록·타일/이동/이름변경/삭제/업로드 analog에 중복 Skip/RenameCopy와 중첩 폴더 ZIP 추가 | Files `Module.cs`, `FolderArchive70.cs`, UI18 | 로컬 불변 자산이다. Drive 파일·소유자·휴지통·Google 문서 export API 구현이 아니다. |
| drive-cache | `IDriveListingProvider`를 주입한 scoped metadata cache, 영속 hydrate/2분 TTL/강제 갱신/오프라인 fallback/폴더 revision/취소/트리 warm | Contracts `Drive70.cs`, Infrastructure `DriveListingCache70.cs`, backend20, UI18 | 실제 provider/OAuth 없음. UI는 명시적 합성 목록 파일만 받는다. OS online 이벤트·백그라운드 상주 서비스는 연결하지 않았다. |
| legacy-drive-system | 명시적으로 opt-in한 isolated offline transport에만 init, JSON/action log, 첨부 commit 실패 보상, 7일 retention preview+확인 적용 | Infrastructure `OfflineDrive70.cs`, backend20 | 실제 클라우드 폴더 생성·로그 업로드·삭제는 없다. 앱 startup 실행도 없다. 시스템 작업은 라이브 화면 명령이 아니라 주입 서비스의 로컬 실행 계약이다. |

### 목록 캐시

- namespace는 사용자 ID + 프로젝트 ID + Drive root ID의 JSON SHA256이다. 경로에 opaque ID를 직접 사용하지 않는다. scope가 다른 응답·캐시·fixture와 선택 루트에서 도달할 수 없는 폴더는 거부한다. 합성 캐시와 실제 provider의 상태도 섞지 않는다.
- 첫 `RefreshAsync`가 요청 소유자다. 같은 폴더의 후속 요청은 결합하며 후속 대기자의 취소는 최초 소유자를 취소하지 않는다. 소유자 취소 또는 Dispose 후에는 늦은 응답을 게시하지 않는다. 상태 코드는 허용 목록으로 제한하고 provider 예외의 본문·인증정보를 표시하지 않는다.
- `Invalidate` 이전에 시작한 결과는 `DRIVE_STALE_LISTING`으로 거부한다. 이는 로컬 cache instance revision 경계다. 서버 etag/Drive 변경 스트림 또는 여러 프로세스의 권위 있는 분산 잠금을 구현한 것은 아니다.
- 파일은 원자적 임시파일 교체로 저장한다. IOException이면 메모리 캐시를 유지하고 Persistent=false로 표시한다. 미래 schema/다른 scope/linked path는 덮어쓰지 않는다. 캐시는 권위 있는 업무 저장소나 서명된 증거가 아니다. 여러 cache instance의 마지막 metadata writer가 이전 목록을 교체할 수 있다.
- 폴더 1,000개, 폴더별 항목 10,000개, 트리 깊이10, JSON16MiB, ID160자 등 입력 상한이 있다. 내용 다운로드는 없다.
- Files의 **Drive 목록 캐시 · 로컬 시험**을 열고 **합성 목록 예제 저장 → 로컬 시험 목록 열기**로 시작한다. 예제는 현재 로컬 사용자/프로젝트에 바인딩한다. 실제 회사 계정·파일을 흉내 내어 승인하지 않는다. 창을 연 상태에서만 10분 간격으로 fixture 목록을 갱신하고 닫으면 timer/소유 요청을 취소한다. 전체/선택 갱신·취소·연결 실패/응답 지연 모의·캐시 다시 열기가 있다.

### 시스템 영역

- 생성자 호출은 listing/create/upload/trash를 수행하지 않는다. `InitializeAsync`는 명시적 offline fixture 및 IsSynthetic transport에만 허용하고 `.system/json/resources`를 한 번 준비한다. 기존 `resouces` 별칭은 이름을 바꾸지 않고 재사용한다. 이름 중복/폴더 유형 충돌은 임의 선택하지 않는다.
- JSON/action 로그는 1MiB 이하, 동작 CREATE/UPDATE/DELETE와 표 이름/ID를 검사한다. 로그 payload는 호출자가 명시적으로 주는 값이며 회사 데이터 복제나 본문 로그 자동 수집이 없다.
- 첨부 업로드 후 commit이 실패하면 그 호출에서 만든 ID만 보상 trash한다. 보상 실패는 `DRIVE_RESOURCE_COMPENSATION_REQUIRED`로 반환한다. 원격 트랜잭션이나 회사 게시판 commit 보증을 의미하지 않는다.
- retention은 preview와 confirmed apply로 나뉜다. json 폴더 안의 7일 초과 application/json `.json`만 후보이고 `회원관리_`·폴더·새 로그·리소스는 보존한다. apply 직전 scope와 후보 전체 metadata를 재검증한다. 부분 실패는 이미 적용한 fixture trash를 롤백하는 원격 원자 트랜잭션이 아니다. 자동 정리나 회사 자료 삭제 승인은 없다.

### 실제로 보강한 로컬 파일 차이

이전 새 .NET 구현은 같은 이름의 다른 파일을 거부하기만 했고 내용이 같으나 이름이 다른 파일은 최초 asset.OriginalName으로 합쳐졌다. 이제 imported record의 제목은 실제 선택한 source filename이다. 동일 bytes의 불변 asset은 공유하지만 다른 별칭 record는 보존한다. 같은 이름의 다른 내용은 **이름 변경 사본 / 건너뛰기 / 중단**을 명시적으로 선택한다. Skip은 새 asset을 만들지 않고 RenameCopy는 `(1)` 등을 붙이며 원래 asset/record를 덮어쓰지 않는다. 선택한 폴더와 프로젝트 문맥을 commit 전에 재검사한다. 드롭의 공개 API는 기본 Reject이며 파일 선택 UI의 중복 선택 대화상자와 구분한다. 여러 파일 가져오기·이동/삭제는 항목별 commit이므로 일괄 원자 트랜잭션이라고 하지 않는다.

**현재 폴더 ZIP**은 프로젝트 root 또는 현재 폴더의 자식/빈 폴더를 재귀 포함한다. 상대 경로 segment를 제한하고 ordinal로 충돌을 피하며 manifest에 제목/원본 이름/크기/SHA를 기록한다. 각 asset의 bytes/size/hash를 확인하고 파일 수500·256MiB·깊이20·폴더1,000 상한과 취소를 적용한다. 실패 시 이 호출이 만든 임시 stage만 제거한다. 원본 경로나 자산은 수정하지 않는다. 실제 Drive Google Docs export가 추가된 것은 아니다.

루트 자체검토에서 새 재귀 ZIP 경로의 mutable Context 참조, exports 경로의 reparse 검사 누락, 완성 전에 `.zip`를 직접 노출하던 빈틈을 확인하여 보강했다. 문서 문맥과 generation을 고정하고, 임시 `.folder-stage-*.tmp`에 ZIP을 완성·닫기·Flush한 다음 게시한다. 그 사이에는 완성본 이름이 존재하지 않는다. 게시 직전 현재 저장소의 사용자 접근 권한·폴더/자료 ID·revision·필드와 asset 결합을 다시 조회하고 원래 목록과 비교한다. 문맥 전환·수정·프로젝트 할당 취소·취소 토큰은 게시를 차단한다. root/exports/stage/output/asset 경로 및 조상 reparse를 검사하고, `File.Move(..., false)`로 기존 완성본을 덮어쓰지 않는다. 정리는 이 호출이 생성한 stage에만 적용하며 기존 출력은 지우지 않는다. 이는 협력적 로컬 저장소의 재검증 경계이며, 권한 갱신과 파일 rename을 하나의 서버 트랜잭션으로 묶거나 적대적 filesystem 변경/전원 장애까지 원자적으로 보장한다는 뜻은 아니다.

### 인접 선택 ZIP 경로의 추가 결함과 공통 처리

실제 첫 후보 `final70-r1`의 별도 DLL을 참조하고 그 후보의 번들 runtime으로 추가 시험했다. `artifacts/archive70-old-repro01`은 다음 **수정 전 결함 3건을 재현한 기록이며 제품 통과가 아니다**.

1. `LocalWorkspace.GetAsync`가 정상 bytes를 검증한 직후, 소유 합성 asset의 bytes만 바꿨다. 기존 선택 ZIP은 변경된 bytes를 복사하며 manifest에는 이전 SHA를 기록했다. 기대 SHA `a536a0e85a5b82c6abfa0a7e8df0119f3156b1776ff6dace9fe87cd7208d0f23`, ZIP 실제 SHA `9709a8407fb643190a19f48e64b585cbf59995eb73f65083800148a91a6bf684`였다. 원래 합성 bytes는 finally로 복구했다.
2. 같은 불변 asset을 공유하는 이름 다른 두 record 중 별칭만 선택해도 기존 선택 ZIP은 asset.OriginalName을 사용하여 별칭을 잃었다.
3. 같은 폴더의 파일 `A`와 폴더 `A`가 `files/0001-A`, `files/0001-A/`로 생성되어 추출 시 같은 경로에 충돌했다.

두 ZIP API를 한 공통 stage·hash·문맥·접근권한·metadata 재검증 경로에 연결했다. 선택 ZIP은 최대500개의 고유 선택 ID(원시 열거 최대1,000개)만 대상으로 하고 미확인 ID가 하나라도 있으면 거부한다. 선택하지 않은 자료의 bytes나 metadata를 manifest에 추가하지 않는다. 다른 별칭 record는 같은 asset을 공유해도 각각 보존하며 entry는 선택 record의 제목을 사용한다. manifest는 `jindan-local-selection-archive/70`으로 버전 구분하고 title/recordId/assetId/OriginalName/Sha256/Size를 함께 기록한다. 이전 unversioned manifest array 형식은 이 로컬 새 ZIP 출력에서 object로 바뀌며 기존 archive import 계약을 변경한 것은 아니다. 폴더 ZIP과 선택 ZIP 모두 file stream을 연 상태에서 hash/size를 확인한 뒤 같은 읽기 handle로 복사한다. 폴더 안의 파일과 하위 폴더는 하나의 sibling ordinal을 공유해 추출 경로 충돌을 막는다.

fixed source 시험 `artifacts/archive70-fixed-source01`은 **6/6** 통과했다. bytes 변경 차단, 별칭/원래 이름과 정확한 선택 범위, 파일/폴더 충돌 제거, 같은 asset을 공유하는 별칭2개 개별 보존, 알 수 없는 ID 거부, 선택 ZIP stage 이후 문맥 변경/늦은 취소를 검사했다. 새 경로는 `files/0001-A`, `files/0002-A/`로 구분된다. `artifacts/drive70-ui-source06`에서 공통 처리로 바꾼 뒤 기존 UI/보호18개도 다시 통과했다. 새 후보의 정확한 DLL·runtime 검증은 루트 인계를 따른다. r1 결함 재현을 수정 후 성공 수로 합산하거나 이전 source05 결과를 새 공통 엔진에 승계하지 않는다.

## 검사와 재현

프로젝트 로컬 SDK만 사용하고 프로세스 단위로 인증서 자동 생성/telemetry를 끈다.

```powershell
Set-Location F:/jindan-dotnet
$env:DOTNET_GENERATE_ASPNET_CERTIFICATE='false'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'
$env:DOTNET_CLI_HOME='F:/jindan-dotnet/.tools/cli-home'
& ./.tools/dotnet/dotnet.exe run --project tests/Jindan.Drive.Tests -c Release --no-launch-profile
& ./.tools/dotnet/dotnet.exe build tests/Jindan.Drive.UiTests -c Release -m:1
node tools/run-drive70-ui.mjs artifacts/drive70-ui-independent-NEW
& ./.tools/dotnet/dotnet.exe build tests/Jindan.FilesArchive.Tests -c Release -m:1
node tools/run-files-archive70.mjs artifacts/archive70-fixed-independent-NEW source tests/Jindan.FilesArchive.Tests/bin/Release/net10.0-windows/Jindan.FilesArchive.Tests.dll fixed
```

최종 source 검사 backend **20/20**, UI **18/18**, UI/Files build 경고0·오류0이다. 수는 겹치는 assertions를 포함한 별개 suite이며 회사 업무 성공 개수로 합산하지 않는다.

- backend: `artifacts/drive70/20261105T091447-9dc4064bd7e24c088ec6288b6133bc4e/RESULT.json`
- UI: `artifacts/drive70-ui-source06/RESULT.json`, 실행명령·소유 PID·실제 DLL hashes는 같은 결과 및 sibling `drive70-ui-source06.COMMAND.json`
- owned UI PID2412은 정상 종료했고 무관한 프로세스나 한글을 조작하지 않았다. 이미지7개는 PrintWindow다. 캐시 목록의 제목/열/폴더와 이름 변경 중복 대화상자를 직접 확인했다.
- 초기 source01은 논리10개는 통과했으나 실제 캡처에서 action bar가 목록 header를 가렸다. TableLayoutPanel로 수정하고 위치 assertion을 추가한 source02 10/10과 source03 12/12를 별도로 보존했다. source01 그림을 최종 사용성 증거로 쓰지 않는다.
- backend 최초 실행의 CS8602 경고는 수정했고 최종 재실행에 경고가 없다.
- 재귀 ZIP 자체검토 후 최종 source05 **18/18**은 기존12개와 새6개를 포함한다. stage 완성 뒤 asset 재조회 지점에서 실제 작업을 멈춰 문맥 변경, 저장된 프로젝트 접근권한 회수, metadata revision 변경, 늦은 취소를 각각 발생시켰고 게시 ZIP 없음·stage 제거·기존 출력 보존을 확인했다. 보호 원본 root 경로 주입도 쓰기 전에 거부했다.
- F:는 exFAT이므로 reparse fixture를 그곳에 만들 수 없다. 루트가 허용한 새 C: 임시 NTFS 디렉터리에 `mklink /J`로 소유 exports junction만 생성하여 실제 거부와 대상 파일0개를 확인했다. 링크·빈 대상·빈 소유 root만 절대경로/속성 검증 후 비재귀 제거했다. 원본이나 설정은 바꾸지 않았다.
- source04의 새 테스트는 부모에 붙이지 않은 컨트롤의 `Ready`를 기다리는 harness 결함으로 멈췄다. 소유 PID17476에 정상 닫기를 요청했고 11개 진행 로그만 있으며 `RESULT.json`이 없어 완주/통과 증거로 쓰지 않는다. source05는 부모 연결·대기 시간 상한·완료 플래그를 보강했다. 실행기는 결과 파일이 없는 exit0도 실패 처리한다. 최초 source04 기록은 보존한다.

새 패키지에서는 다음으로 **그 패키지의 다섯 DLL**을 참조해 별도 출력 경로에 빌드하고, 번들 runtime에서 재실행해야 한다. source 결과를 새 SHA에 승계하지 않는다. `$app`은 새 검토용 application, `$build`와 `$out`은 새로운 artifacts 경로여야 한다.

```powershell
& ./.tools/dotnet/dotnet.exe build tests/Jindan.Drive.UiTests -c Release "-p:InstallationRoot=$app" -o $build
node tools/run-drive70-ui.mjs $out $app "$build/Jindan.Drive.UiTests.dll"
```

선택 ZIP 시험도 같은 방식으로 `tests/Jindan.FilesArchive.Tests`를 `InstallationRoot`에 결합하여 새 build 폴더에 빌드한 뒤 `tools/run-files-archive70.mjs <새 출력> <application> <새 build/Jindan.FilesArchive.Tests.dll> fixed`로 실행한다. `old` 모드는 수정 전 정확한 r1의 결함 재현에만 사용하며 통과제품 판정 모드가 아니다.

## 남은 선결조건

실제 Drive provider를 구현하려면 사용자 승인된 production 연결 방식/허용 root·사용자·공유 Drive capability 계약과 별도 권한 시험이 필요하다. 이번 작업은 토큰을 복사하거나 허가 없이 실제 계정을 이용하지 않는다. provider 경계가 존재한다고 실제 연동 구현 완료로 표시하지 않는다. Google 문서 export, 실제 owner/role/capability/etag, 전송 재시도/업로드 보상·서버 휴지통/동시 rename, real online notification, 실제 대용량 Drive 성능은 별도 미구현/미검증 범위다. 회사 실물 보고서·원본 글꼴/JSON/탭·금회 자료·사람 승인 게이트도 그대로 유지한다.
