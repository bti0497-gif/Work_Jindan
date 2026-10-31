# 앱 연결 지점과 현재 능력

이 스킬은 기술진단팀 협업스튜디오의 보고서 엔진과 함께 사용한다. 저장소는 `src/services/report/referenceAnalyzer.js`가 있는 루트로 식별하며, 드라이브 문자나 특정 체크아웃 경로를 전제로 하지 않는다.

스킬 정본은 저장소의 `skills/technical-report-hwpx`에 보관한다. 개인 스킬 폴더에도 설치한 경우 두 위치의 지침·도구를 함께 갱신한다. 사용자의 원본 보고서나 분석 산출물은 설치 사본에 포함하지 않는다.

| 목적 | 실제 구현 |
| --- | --- |
| HWP/HWPX 문단·표·셀 및 원본 글자 구간 | `src/services/report/sourceParser.js`의 `analyzeReport` |
| 원본 기반 서식 후보 추출 | `referenceAnalyzer.js`의 `analyzeReferenceSource` |
| 여러 파일의 논리 장·용지·서체 집계 | `referenceLearning.js`의 `summarizeReferenceProfiles` |
| 앱의 비동기 분석 | `report.worker.js`, action `analyze-reference` |
| 프로젝트 분석·로컬 보관 | `referenceLearning.js`의 `analyzeReferenceProject` |
| 프로젝트와 파일 구성, PDF 연결 | `referenceProjects.js` |
| HWPX 원본 패키지 및 글자 구간 교체 | `hwpxPackage.js`의 `replaceHwpxSlots` |
| 확정한 입력 양식으로 초안·빈 양식 작성 | `nativeWriter.js`의 `writeNativeReport` |
| 판정 셀 빈 양식 내보내기·회수 | `nativeCollection.js` |
| 표·그림 캡션/참조 검토·보정 | `reportNumbering.js` |
| 화면 | `ReportReferenceAnalysis.jsx`, `ReportReferenceProjects.jsx`, `ReportStudio.jsx` |

앱의 저장 위치는 로그인 사용자별 IndexedDB `jindan-report-studio`이다. 프로젝트의 `analysis`에 결과를 저장하고 파일 ID·해시·수동 분류·대응 PDF를 포함한 signature로 유효성을 확인한다. 원본 연결이 변경되면 이전 분석은 재검토 대상이다. `ready`는 이 단계의 구조 분석 성공이며 PDF 대조나 재현 완료를 의미하지 않는다.

전기 진단 준비 화면은 `ElectricalReportPreparation.jsx`와 `electricalPreparation.js`를 사용한다. 저장소 v3의 `facilityStudios`가 사용자·업무 프로젝트 ID(`project:`)로 책과 준비 기록을 분리한다. 기존 시설별 초안과 `studios` 초안은 보존하되 프로젝트 선택 목록에 가상 업무 프로젝트로 추가하지 않는다. 기준 프로젝트를 고른 뒤 워커 `prepare-electrical`로 HWPX를 다시 읽어 표·문단 키워드 후보를 원본 해시·구조 ID에 연결한다. 서식 분석/PDF 재현 검증과는 별도 단계다. 원본 구성 signature가 바뀌면 계획은 재분석 대상으로 표시한다. 키워드 후보는 누락/오탐이 있을 수 있으며 파일당 800개로 제한하고 한도 도달을 표시한다.

입력 항목은 최근 3개년 한전 플래너, 열화상, 전력품질, 직접 측정한 절연저항, 직접 측정한 운전전류, 전기기기·계측기 목록/점검, 일반 관리요령, 금회 개선사항 협의다. 실제 한전 조회 기간, 측정 지점·조건, 요약·진단 검토 메모와 협의일·참여자·합의 내용을 기록한다. 자료 연결은 파일 ID와 SHA-256으로 보존하고 해제해도 원본을 삭제하지 않는다. 동일 원본을 여러 시설에 명시적으로 연결할 수 있지만 측정값과 판정은 자동 복사하지 않는다.

현재 이 화면은 준비 기록과 교체 후보 선택까지다. 한전 XLSX/CSV 자동 집계, 열화상 픽셀의 온도 환산, PWV 통계의 PowerView 대조, 이미지/차트/표 자동 교체는 아직 연결되지 않았다. 일반 JPEG의 화면 색상에서 온도를 추측하거나 과거 법령·요금·판정을 금회 것으로 재사용하지 않는다. 교체 후보 선택은 입력 셀 확정·최종 판정·출력 승인이 아니며 `reportReady:false`를 유지한다. 시험은 `scripts/electrical-preparation.test.cjs`와 스튜디오 브라우저 검사를 사용한다.

한전 사용정보 분석은 시설별 `kepcoMode`의 기본 `auto`로 기존 보고서 분석을 따른다. `resolveKepcoScope`는 현재 원본에 묶인 분석에서 관련 후보가 있으면 입력 항목을 보이고, 모든 HWPX를 읽었고 후보 한도/오류도 없는데 후보가 없으면 자료 요청을 생략한다. 이미지·PDF의 내용까지 부재로 확정한 것은 아니다. 분석이 오래됐거나 일부 파일 실패/잘림이면 미확인이다. 사용자 지정 `include`/`exclude`를 우선하며 기존 한전 연결 자료/조회 기간도 보존한다. 이전 `pending` 저장값은 자동 방식으로 호환한다. 한전 로그인은 자동화하지 않고 사용자가 확보한 파일을 받는다.

Testo IRSoft 열화상 원본은 `thermalBmt.js`에서 JPEG 미리보기 뒤의 ToFo 1.0.1/BmtMetaData XML과 little-endian 바이너리를 읽는다. 항목 순서와 크기 합계를 검증하며 48MB/정의 XML 512KB/배열 약 4백만 점 한도를 둔다. 다른 버전, 배열 형식, 잘린 데이터와 XML 외부 개체는 거부한다. 체크섬 검증은 아직 수행하지 않는다. `ThermalBmtPreview.jsx`는 워커 `inspect-thermal-bmt`로 기기·촬영시각·방사율·반사/대기온도 설정·측정점 위치·내장 열화상/실사진을 보여준다. 열화상 항목에서 BMT와 JPG 등이 든 폴더를 선택할 수 있다.

BMT 검출기 해상도와 실제 저장 배열 해상도는 따로 읽는다. IR/SR 쌍을 서로 다른 측정 건수로 자동 집계하지 않는다. 촬영시각은 기기 시각으로 읽되 시간대 미확인을 유지하며 상위 폴더명/작업 연도로 바꾸지 않는다. Temperature<MarkedFloat> 설정의 K→°C 변환은 열화상 배열 원시 uint16 값의 환산과 다르다. 스케일 min/max는 표시 범위 설정이며 측정 min/max가 아니다. 배열 원시값·환산계수는 보존하되 픽셀/측정점 온도를 생성하지 않고 `temperatureC:null`, `reportReady:false`를 유지한다. IRSoft에서 공식 XLSX 온도표를 내보내는 경로는 실제 한 파일로 확인했지만 앱의 자동 온도 집계/보고서 반영은 미연결이다. 사용자 원본과 추출 온도표는 테스트/스킬에 넣지 않으며 합성 fixture만 사용한다. 검사는 `scripts/thermal-bmt.test.cjs`와 스튜디오 브라우저 검사에 포함된다.

사용자의 열화상 작업 순서는 IRSoft에서 탐지점 재지정 → 수정 BMT 저장 → 실화상/열화상 배율·위치 조정 → 최종 조합사진 내보내기다. 사진 정합과 탐지점 선정은 사용자가 수행한다. 수정 BMT의 최종 편집 탐지점을 직접 읽는 것이 목표이며, 측정점 결과표는 XLSX 엑셀로 내보낸 선택 대조자료다. 엑셀을 필수로 요구하지 않는다. `ThermalDeliveries.jsx`/`thermalDelivery.js`는 수정 BMT·선택 대조 엑셀·최종 사진을 대상별로 묶고 탐지점 이름/상 연결과 사용자 준비 확인을 기록한다. 파일 ID/SHA-256에 묶으며 선택 파일이나 탐지점 이름이 바뀌면 관련 확인을 해제한다. 준비 확인은 수치 검증·자동 보고서 반영 완료가 아니다. 전체 픽셀 온도표와 사용자가 선정한 측정점 결과표를 구분한다.

실제 IRSoft에서 저장한 사본에도 ToFo 1.0.1이 유지되는 것을 확인했다. `IMGADDONID_GRAPHICOBJECTS_WITH_ID` 등의 편집 마커 블록과 `WAS_SAVED_BY_IRSOFT`가 추가된다. 현재 파서는 이 블록의 존재를 표시하지만 내부 편집 마커는 해독하지 않는다. 기존 `MeasPoints`로 읽은 값은 `pointsSource:camera-metadata`이며 최종 재지정점으로 사용하지 않는다. 편집 마커가 있으면 최종 이미지와 필요시 같은 수정본에서 엑셀로 내보낸 측정점 결과표를 연결하도록 안내한다. 엑셀 연결은 선택 사항이다. 관련 검사는 `scripts/thermal-delivery.test.cjs`와 BMT/스튜디오 검사에 포함한다.

스튜디오 왼쪽 맨 위 선택 목록은 프로젝트 관리의 실제 등록 목록만 사용하며 삭제된 프로젝트를 제외한다. `studioProjects.js`가 업무 ID와 `project:` 키를 연결한다. 서버에서 캐시를 갱신하면 `jindan-work-cache-change`로 목록을 새로 읽고 재동기화 루프를 만들지 않는다. 프로젝트 미선택 상태는 형식 학습용 예시 공간이며 서남하수 같은 기존 업로드는 업무 보고서로 자동 연결하지 않는다. 보고서 등록/전기 진단/프로젝트 파일 저장·가져오기는 프로젝트 선택 후 사용한다. 보고서·입력자료·원본 폴더는 프로젝트별로 표시하고 원본을 공유하는 경우 다른 프로젝트가 쓰는 파일 삭제를 막는다. `referenceProjects.businessProjectId`가 없는 기존 폴더는 학습 예시이며, 실제 전회 보고서 폴더는 선택한 업무 프로젝트에 귀속된다. `facilityStudios`의 기존 시설 ID/`archive:` 작업은 보존하지만 업무 프로젝트 목록에 섞지 않는다. 그 아래 기존 보고서 파일 다중 선택/리스트가 있고 선택 시 `inspect-studio-report` 워커가 문단·표와 양식 후보를 읽는다. `ReportDocumentView.jsx`는 구조 미리보기이며 정밀 한글 조판 재현이 아니다. `ReportSpecification.jsx`의 용지/여백/폰트/머릿글/바닥글/장 제목/쪽 번호는 프로젝트에 저장하고 구조 미리보기에 적용한다. HWPX 원본이나 인쇄 조판에 이 서식 변경을 직접 반영한 것으로 취급하지 않는다. HWP는 구조 읽기, PDF는 원본 보기만 지원한다.

`ReportDataApplication.jsx`의 ‘데이터 적용 작업 시작’은 프로젝트에 연결한 PWV/BMT/엑셀/CSV를 읽어 검토 작업을 개시한다. `applicationData.js`는 CSV 따옴표/줄바꿈/0값, XLSX 시트 관계/공유 문자열/셀 주소/수식 캐시 여부를 유지한다. 집계·단위 환산·자동 진단을 추정하지 않는다. 담당자가 추출 셀이나 새 문구와 원본 문단/표 셀을 선택하면 `createReportTextCandidate`가 원본 SHA와 글자 구간을 검증해 HWPX 후보를 만든다. 원본 패키지·미선택 셀·바이너리는 유지하고 번호 검토기를 거친다. 한글 재조판 검토는 필수이며 그림 교체는 아직 미연결이다. 변경 내역은 원본/후보/입력자료 ID·해시·시트/셀 근거와 저장된다.

`projectArchive.js`의 `.jindanproj`는 ZIP 기반 `jindan-report-project/1` 형식이다. 선택 프로젝트의 책/서식/보고서 목록/측정자료/변경 기록과 연결 기준 폴더 원본을 함께 저장한다. 사용자 전체 자료 모음이나 인증 설정은 묶지 않는다. 파일당 기존 입력 제한, 아카이브 512MB/전체 원본 768MB/설정 16MB/원본 1000개 한도를 둔다. 화면에서 가져오기는 대상 업무 프로젝트를 먼저 선택하고 경로·확장자·내용·SHA·참조·서식·재현 모델을 검증한다. 기존 작업이 있으면 사용자 확인 후 같은 트랜잭션에서 원래 책을 `archive:` 백업으로 보존하고 선택한 프로젝트로 복원한다. 기준 폴더 ID는 새 ID로 매핑하며 귀속도 대상 프로젝트로 바꾼다. 대상 없는 서비스 API의 독립 보관 기능은 유지하지만 업무 프로젝트로 자동 등록하지 않는다. 관련 검사는 `scripts/project-workbench.test.cjs`와 스튜디오 브라우저의 실제 HWPX 후보 생성/통합 프로젝트 왕복 검사다.

분석 결과의 `counts.tables`는 배치용 표와 계속 표를 포함한 원본 표 개체 수다. `counts.pictures`도 장식·삽입 이미지를 포함하며 번호가 붙은 그림 수와 같지 않다. `explicitPageBreaks`는 문단의 명시적 쪽 나눔 수이며 실제 페이지 수가 아니다. `tableExamples`, `headings`, `captions`, `typography`에는 크기 제한이 있는 후보·샘플이 저장된다. 완전한 복원에는 항상 원본을 다시 읽는다.

HWP는 읽기 대상이며 원본 작성에는 HWPX 변환이 필요하다. HWPX 텍스트 슬롯 교체는 원본 폰트·들여쓰기·행간·표·그림 구조를 보존하지만, 새 표·행·그림을 자유롭게 만드는 기능은 아니다. 수정 문단의 레이아웃 캐시를 무효화하므로 한글에서 다시 조판하고 저장·출력해야 한다.

PDF는 앱에서 대응 원본 보기용으로 연결되어 있다. 양식 분석 완료만으로 PDF 자동 시각 대조를 수행했다고 표시하지 않는다. CLI 비교기는 별도의 검증 도구이며 현재 앱 UI의 자동 비교 기능과 혼동하지 않는다.

한 쪽 시험은 `extract-page-trial.py` → `pageReproduction.js`의 검증된 편집 모델 → `ReportPageTrial.jsx` 가운데 SVG/오른쪽 개체 속성 → `report-page-export.cjs`의 Chromium PDF 출력 순서로 연결되어 있다. 글자와 둥근 면·테두리만 지원하는 좁은 어휘다. HWPX·PDF의 두 SHA-256이 등록 원본과 일치해야 불러올 수 있고, 사용자별 `studio.pageTrial`에 저장한다. 원본 PDF를 작성본 배경으로 사용하지 않는다.

PDF 위치를 읽는 Python 도구는 현재 로컬 보조 단계이며 앱 버튼 하나로 HWPX를 자동 조판하는 기능이 아니다. 래스터 장식은 PDF 해시와 쪽에 묶인 검토한 벡터 대체 자료가 필요하다. 글꼴 포함은 `--font-file family=path`와 fontTools를 사용하며 fsType=0인 로컬 글꼴만 허용한다. 오래된 한글 글꼴의 cmap 언어값을 0으로 정규화해 Chromium의 OTS 거부를 보정한다. Unicode 글리프는 유지해 새 한글 입력도 가능하게 한다. 사용자 보고서나 글꼴 바이트는 저장소/스킬 설치본에 포함하지 않는다.

`node scripts/render-page-trial.cjs model.json candidate.pdf`는 앱과 같은 출력기를 사용하는 검증 도구다. 비교기에 `--candidate-source model.json`을 주면 편집 글자·벡터 개체 수를 기록한다. 편집 모델 출력은 HWPX 출력 검증과 다르다. Chromium 출력 용지 크기에는 0.3pt 미만 반올림 오차가 관찰되어 완전 동일 용지로 표시하지 않는다.

관련 검증:

전기 측정자료는 `powerView.js`의 `inspectPowerView`로 PowerView PWV(XML)를 읽는 원시 미리보기가 추가되어 있다. `본문 입력자료`에 PWV를 등록하고 워커 action `inspect-powerview`, `PowerViewPreview.jsx`로 장비·지점·기록·채널과 압축 수치를 확인한다. Base64와 None/GZip, Single/Double을 지원하며, 원본의 Gain·단위·제외 플래그와 시간축 정보를 보존한다. NaN은 결측으로 표시한다. CT/PT·단위·시간대·PowerView 통계 정의는 검증 전이며 `reportReady:false`를 유지한다. 파일 안에 이름이 THD인 수치라도 단위가 V/A일 수 있으므로 임의로 %로 쓰지 않는다. 현재 단계는 보고서 표 자동 입력 기능이 아니다. 시험은 `node --test scripts/powerview.test.cjs`와 스튜디오 브라우저 검사에 포함된다.

파일관리의 드라이브 스토리지는 Firebase 업무 데이터와 별개다. 드라이브 인증은 `drive-auth.cjs`의 Electron 메인 프로세스가 Windows safeStorage로 보관하고, 렌더러에는 단기 access token만 전달한다. 폴더 ID만 Vite 공개 설정이다. safeStorage는 같은 앱 userData의 Local State 키를 사용해야 하며 다른 임시 프로필에서 암호화한 파일을 옮기지 않는다.

```text
node --test scripts/reference-analyzer.test.cjs scripts/report-reference-projects.test.cjs
node scripts/test-report-studio.cjs
npm run build
node scripts/check-report-worker.cjs
```

스킬 전용 도구 검증은 `node --test scripts/report-skill.test.cjs`이다. 명령은 저장소 루트에서 실행한다.


## PDF만 있는 프로젝트의 전기 작성 경로

- `ReportDrivePicker.jsx`는 기존 파일관리의 캐시·인증·다운로드 서비스를 재사용한다. 프로젝트 선택 후 해당 폴더의 PDF/HWP/HWPX를 명시적으로 가져온다. Drive 파일 ID·수정일·원본 해시·경로를 프로젝트에 남기고 드라이브 원본은 유지한다. 예시 폴더를 프로젝트에 자동 연결하지 않는다.
- `pdfAnalysis.js`는 PDF.js legacy 빌드의 전용 PDF 파서 워커를 사용한다. 화면의 오케스트레이션은 쪽마다 비동기로 진행하며 취소하면 파서를 종료한다. `pdfStructure.js`가 표시 좌표/회전, 중복 글자, 가로세로 표 경계와 병합 셀 후보를 복원한다. 장 제목에서 공통·공정·기계·전기를 전파하되 차례는 별도로 다루며 수동 분류를 지원한다. 미분류·세로쓰기·불규칙 표는 경고로 남긴다. 원본 160MB, 1,000쪽, 글자 항목 50만 개 한도다.
- 대청 사례처럼 본문 일부가 얇은 이미지 띠로 저장된 PDF가 있다. 텍스트 추출만으로 본문 전체를 읽었다고 판정하지 않는다. `pdfOcr.js`는 Tesseract.js와 로컬 kor/eng 학습 파일로 선택 쪽을 인식한다. 파싱된 표의 수치와 사진 내부의 글자는 본문 보강에서 제외한다. 이미지 역할을 수동 수정할 수 있다. OCR은 검토 전 문자열이며 실제 온도·판정으로 자동 확정하지 않는다.
- `PdfOriginalPage.jsx`는 PDF.js 캔버스로 원문 쪽을 직접 표시한다. 설치앱의 브라우저 PDF 플러그인에 의존하지 않고 원문과 추출 결과를 대조한다. 원문 화면 자체를 편집 가능한 재현으로 취급하지 않는다.
- `PdfReportWorkbench.jsx`는 오른쪽 사이드바에 분야/쪽 범위/표 유지 열 검토와 OCR, 전회 참고 HWPX/금회 전기 HWPX 양식 생성을 제공한다. 추출 셀과 OCR 문장을 수동 보정할 수 있으며 원래 문자열과 수정 위치를 보존한다. 출력 글꼴·본문 크기·용지·여백·머릿글·바닥글·쪽 번호와 전기 장 번호는 PDF별 프로젝트 설정으로 저장하고 다음 HWPX 생성에 적용한다. `electricalPdfCandidates`는 같은 프로젝트·원본의 전기 PDF에서 한전 등 필요한 자료 후보를 찾는다. 이미지 본문이 미인식이면 항목 부재를 확정하지 않는다. 현재 공정·기계는 분류 대상이며 작성 대상은 전기와 담당자가 선택한 공통 쪽이다.
- `pdfHwpxWriter.js`는 사용자 보고서에서 서식을 복사하지 않고 직접 저장한 빈 한글 문서의 일반 서식(`assets/hwpxBase.json`)에서 새 패키지를 만든다. 메타데이터에 개인 이름·로컬 경로를 포함하지 않는다. 문장·실제 한글 표·병합·부분 PNG 그림을 쓰며 가로로 나란한 원문 그림은 같은 문단에 둔다. 전회 참고본은 원문 캡션을 보존하고 번호 검토 결과만 기록한다. 금회 양식은 표/그림 번호 검토기를 거치고 계속 표 표시를 유지한다. 첫 장 시작은 홀수 쪽 설정이며 다장 최종 조판·빈 쪽의 실제 머릿글/바닥글 검증은 한글 출력에서 확인해야 한다.
- 생성 HWPX는 프로젝트 보고서 목록에 추가돼 기존 측정자료 → 선택한 문단/셀 → HWPX 후보 작성 흐름으로 이어진다. 새 양식의 빈 셀도 기존 교체 엔진으로 작성하는 것을 검사한다. PDF 분석·OCR·쪽 선택·유지 열·작성 이력·원본은 `.jindanproj`에 포함된다.
- `report-runtime-assets.mjs`가 PDF 문자표/폰트/WASM, OCR 워커/코어를 개발 서버와 배포 파일에 제공한다. `public/report-ocr`에 한국어/영어 학습 파일과 라이선스를 둔다. 런타임 CDN이나 외부 AI 전송은 필요하지 않다.
- `scripts/pdf-report.test.cjs`는 병합 복원·과거값 비우기·프로젝트 격리·OCR 병합·신규 HWPX 셀 수정을 검사한다. `scripts/test-pdf-workbench.cjs`는 `REPORT_PDF_CHECK_SOURCE`로 허가된 실제 대청 본보고서를 지정하는 선택 검사이며 별도 임시 계정 저장소에서 전체 PDF 분석 → 한 쪽 OCR → 그림 포함 참고본 → 금회 빈 양식 → 다른 프로젝트 격리를 수행한다. `PDF_CHECK_PACKAGED=1`로 localhost 없이 배포 빌드의 file:// 실행도 검사한다. 실제 보고서 내용과 산출물은 비공개 임시 폴더에만 둔다.
