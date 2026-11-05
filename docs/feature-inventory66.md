# 기존 기능 인벤토리66

2026-11-05 KST · 소스 정적 읽기 전용 조사. 새 프로젝트 구현·동작 승인을 뜻하지 않는다. `reportReady=false`, `supervisorAccepted=false`.

현재 진입점은 `src/main.jsx → src/App.jsx`이다. 루트 과거 `App.tsx`와 혼동하지 않는다. `src/components/ReportStudio.jsx:426`의 현재 default export는 `ReportPlatform`; 보존된 `Studio` JSX는 저장된 레거시 작업 회귀용이다. `ReportWorkspace`의 공정·기계·전기 메뉴는 별도로 현재 App에 연결된다.

기능군 28개, 근거 소스 102개 SHA-256은 [기계 판독 인벤토리](../migration/feature-inventory66.json)에 기록했다. 아래 모듈명은 이전 목표이며 구현 완료 표시가 아니다.

| ID | 목표 모듈 | 관측 기능 |
|---|---|---|
| shell | Desktop | 현재 진입점·탐색·창 제어 |
| projects | Projects | 프로젝트 목록·검색·CRUD·기간 상태 |
| processes | Processes | 프로젝트 소속 공정·완료·수정·삭제 |
| tasks | Tasks | 달력별 할일·공개/개인 |
| board-posts | Board | 게시글 CRUD·실시간 목록·검색·페이지 |
| board-comments | Board | 댓글·첨부·레거시 가져오기 |
| members | Members | 회원·관리자 계정 관리 |
| auth | Identity | 로그인·복원·비밀번호 변경·로그아웃 |
| work-sync | Sync | 업무 큐·충돌 보호·주기 동기화 |
| drive-files | Files | 공유 Drive 탐색·파일 작업 |
| drive-cache | Sync | Drive 목록 캐시·백그라운드 갱신 |
| legacy-drive-system | Infrastructure | 레거시 시스템 폴더·리소스·로그 |
| photos-gallery | Photos | 현행 사진·CAD 갤러리/뷰어 |
| photos-new | Photos | 로드맵 신규 사진관리 요구 |
| cad | Files | DWG/DXF 미리보기 |
| dashboard-search | Dashboard | 대시보드·기간 집계·분산 검색 |
| report-platform | ReportStudio | 현행 스튜디오 문서/분석/자료·패널 |
| report-library | ReportStudio | 원본·금회자료 보관·해시·유형 |
| report-analysis-restore | ReportStudio | PDF 복원분석·HWPX 작성분석·장별 재현 |
| report-review-draft | ReportStudio | 내용역할 검토·근거바인딩·금회/빈초안 |
| report-collection | ReportStudio | 조사양식 내려받기·한글저장반환·빈칸 적용 |
| report-archive-recovery | ReportStudio | 프로젝트아카이브·회수·fresh review 경계 |
| report-discipline-workspace | ReportStudio | 분야별 양식·계산·진단문구·백업 |
| electrical-inputs | ReportStudio | 전기분야 자료·범위·개선협의 준비 |
| thermal | ReportStudio | Testo BMT 메타데이터·그림·열화상결과 묶음 |
| power-quality | ReportStudio | PowerView PWV 측정자료 검사 |
| report-ai | ReportStudio + provider service | 선택적 AI 분석·자료추출·진단초안 |
| updates-release | Update | 기존 전체앱 업데이트와 새 모듈패치 |

## 이행 시 중요한 범위 구분

- 현행 Photos는 Drive 폴더 기반 사진·CAD 갤러리와 뷰어다. 별도 앨범·설명·EXIF 편집 CRUD는 발견되지 않았다. ROADMAP M3의 프로젝트·현장·앨범·분류·원본/별도편집본·비동기 썸네일은 신규 구현 요구다.
- 프로젝트 상태는 날짜·공정 기반 계산값이며 독립 status 필드가 아니다. 공정 완료 플래그와 기간 경과율을 혼합하지 않는다. 할일에 공정처럼 완료 필드가 있다고 가정하지 않는다.
- 기존 검색은 프로젝트·게시글·Drive·자료·표/문단의 개별 목록 필터다. 통합 검색엔진 UI는 발견되지 않았다. 신규 통합 검색은 별도 범위를 명시한다.
- 업무 DB는 localStorage의3개 테이블과 Firebase 큐, 게시판은 Firestore 직접 watch/transaction, 회원은 admin 검증 Auth/profile, 파일/사진은 Drive, 보고서는 사용자·프로젝트별 IndexedDB다. 하나의 가짜 동기화 성공을 전체 연결 검증으로 취급하지 않는다.
- 시작 시 `initSystemStorage`는 Drive 폴더 생성 및7일 이전 JSON 삭제를 수행한다. 새 앱에 그대로 호출하면 금지된 실제 클라우드 쓰기가 발생하므로 초기화 코드를 복사하지 않는다.
- 선택 AI 기능은 외부 유료/인증 gate로 남기며 키·환경파일·로그인 세션을 복사하지 않는다. 명시 합성 provider로 로컬 행위를 시험한다.
- 기존 electron-updater 전체앱 업데이트는 DLL별 패치 증거가 아니다. 새 manifest/staging/health/rollback과 비관련 DLL SHA 불변을 검증한다.
- 클라우드가 막혀도 로컬 저장·권한·대시보드·검색·CRUD는 구현할 수 있다. 실제 인증/서버 쓰기 검증만 외부 gate로 분리한다.

## 상세 기능·모델·검사 대응

### shell — 현재 진입점·탐색·창 제어

근거: `src/main.jsx`, `src/App.jsx`, `src/components/LeftSidebar.jsx`, `src/components/RightSidebar.jsx`.

**Commands:** Dashboard; Projects; Processes; Files; Report Studio; process/mechanical/electrical reports; Tasks; Board; admin Members; window controls.

**Model:** activeMenu; viewMode; selectedProject; selectedPost; currentUser.

**Storage:** React state and Electron window IPC.

**Local verification:** Multi-document switching; Active project/panel context; Unsaved close; Layout restart.

**External gate:** No legacy IPC copy; native replacement local.

**Scope:** Current entry src/main.jsx imports src/App.jsx. Root App.tsx is not current. Notice/member/report aliases in App switch are not all visible left-menu entries.

### projects — 프로젝트 목록·검색·CRUD·기간 상태

근거: `src/components/ProjectList.jsx`, `src/components/ProjectWrite.jsx`, `src/components/ProjectView.jsx`, `src/services/workModel.js`, `src/services/scheduleService.js`.

**Commands:** List/search title and content; Create; Detail; Edit; Confirm own deletion; Calendar progress.

**Model:** id; title; startDate; endDate; content(HTML); author; authorId; createdAt; updatedAt; menu; fileId; ownerUid; deleted.

**Storage:** localStorage jindan_db_프로젝트관리; queued Firebase jindan_projects.

**Local verification:** Required title/date/range; Save/restart; Owner/admin/other authorization; Search; Related process preservation.

**External gate:** Local implementation possible; real Firebase adapter and auth verification separately gated.

**Scope:** Status is schedule-derived, not independent project status. fileId is legacy retained linkage, not proof of a complete related-file UI.

### processes — 프로젝트 소속 공정·완료·수정·삭제

근거: `src/components/ProcessList.jsx`, `src/services/workModel.js`, `src/services/scheduleService.js`.

**Commands:** Search/select project; Order by start date; Create/edit process; Complete selected; Delete selected; Calendar progress.

**Model:** id; projectId; title; startDate; endDate; isCompleted; author; authorId; createdAt; updatedAt; ownerUid; deleted.

**Storage:** localStorage jindan_db_공정관리; queued Firebase jindan_processes.

**Local verification:** Project separation; Immutable parent project; Owner editing; Batch complete/delete; Inclusive end date; Restart.

**External gate:** Local CRUD possible; production server permission integration unverified.

**Scope:** Schedule states are upcoming/in progress/completed/incomplete/undetermined. Calendar elapsed percentage differs from completed-process ratio.

### tasks — 달력별 할일·공개/개인

근거: `src/components/TaskManager.jsx`, `src/services/workModel.js`, `src/components/RightSidebar.jsx`.

**Commands:** Month navigation; Select date; Add/edit; Toggle public; Delete own; Upcoming task navigation.

**Model:** id; date; content; isPublic; author; authorId; createdAt; updatedAt; ownerUid; deleted.

**Storage:** localStorage jindan_db_할일관리; queued Firebase jindan_tasks.

**Local verification:** Private visibility; Other-user write rejection; Date filter; Public/private toggle; Restart.

**External gate:** Local synthetic users possible; cloud public/own query separately gated.

**Scope:** No completed/status field found on legacy tasks. Do not force process-completion semantics onto tasks.

### board-posts — 게시글 CRUD·실시간 목록·검색·페이지

근거: `src/components/BoardList.jsx`, `src/components/BoardWrite.jsx`, `src/components/BoardView.jsx`, `src/services/boardModel.js`, `src/services/firebaseBoardService.js`.

**Commands:** Board and notice lists; Search; Paging; Create/edit/delete; Concurrent-update detection.

**Model:** id; menu; title; content(HTML); attachments[]; author; authorId; ownerUid; createdAt; updatedAt; deleted; migratedBy.

**Storage:** Firestore jindan_board_posts direct transactions/listeners; legacy local import.

**Local verification:** 300character title/600000byte body; Owner/admin; Expected timestamp conflict; Safe HTML display; Paging; Restart.

**External gate:** Real writes prohibited; explicit local fake repository permitted.

**Scope:** DOMPurify sanitizes board content on write/view. Rich HTML must be treated as untrusted imported content.

### board-comments — 댓글·첨부·레거시 가져오기

근거: `src/components/BoardView.jsx`, `src/components/BoardWrite.jsx`, `src/services/firebaseBoardService.js`, `src/services/dataService.js`.

**Commands:** Comment; Add/remove attachments; Download; Admin legacy import.

**Model:** comment:id/postId/content/ownerUid/author/createdAt; attachment:id/name/size/mimeType.

**Storage:** Firestore jindan_board_comments; Google Drive resources.

**Local verification:** Comment1..10000; Maximum10 attachments; Deleted post rejection; Idempotent import; Failed upload compensation; Asset hash preservation.

**External gate:** Drive upload/download and Firestore transactions live verification blocked.

**Scope:** Attachment upload is outside post transaction with new-upload compensation on failure. Do not execute the legacy cloud cleanup path.

### members — 회원·관리자 계정 관리

근거: `src/components/MemberList.jsx`, `src/services/firebaseMemberService.js`, `src/services/firebaseBoardAuth.js`.

**Commands:** Active list; Create account; Edit profile/role; Deactivate selected; Reject own administrator deletion.

**Model:** uid; firebaseUid; person_id; name; position; userLevel; role; isActive; createdAt; updatedAt.

**Storage:** Firestore jindan_members; local profile cache; secondary Firebase Auth provisioning.

**Local verification:** Admin service guard; Duplicate ID; Immutable person ID; Self-deactivation rejection; Role escalation rejection; Restart.

**External gate:** Account creation/real role writes prohibited; fake test adapter explicit and non-production.

**Scope:** Initial password is transient input, not migrated storage. Administrator is userLevel0 and user is2; no secret values copied.

### auth — 로그인·복원·비밀번호 변경·로그아웃

근거: `src/components/Login.jsx`, `src/components/ChangePassword.jsx`, `src/services/authService.js`, `src/services/firebaseBoardAuth.js`, `src/services/firebaseIdentity.js`.

**Commands:** ID/password sign-in; Restore verified session; Reauthenticate and change password; Sign out.

**Model:** uid; firebaseUid; person_id; name; position; role; email; isActive.

**Storage:** Firebase Auth; sessionStorage currentUser; verified member profile.

**Local verification:** Anonymous rejection; Inactive member rejection; No credential logs; Clear context on logout; Role enforcement.

**External gate:** No credentials/session copying; local identity fake clearly labeled; real auth adapter gated.

**Scope:** Cached session excludes password. Do not bypass authorization by treating all local actors as administrators.

### work-sync — 업무 큐·충돌 보호·주기 동기화

근거: `src/App.jsx`, `src/services/syncService.js`, `src/services/workModel.js`, `src/services/dbService.js`, `src/services/firebaseWorkService.js`.

**Commands:** Start/menu sync; Work-change debounce250ms; Push1minute; Pull5minutes; Error/retry status.

**Model:** tableName; id; operation(upsert/delete); revision; timestamp; ownerUid; deleted; updatedAt.

**Storage:** localStorage jindan_sync_queue/jindan_last_sync and3 work tables; Firebase.

**Local verification:** Pending local wins; Explicit tombstones; Revision-matched queue acknowledgment; Partial retry; Concurrent sync coalescing; Crash recovery.

**External gate:** No live operation authorized; local fake transport testable.

**Scope:** Missing cloud record is not deletion; only explicit tombstone removes. Public/own task pruning differs from project/process merge.

### drive-files — 공유 Drive 탐색·파일 작업

근거: `src/components/FileManager.jsx`, `src/components/FileContextMenu.jsx`, `src/services/driveService.js`, `src/services/driveDownloadService.js`, `src/services/driveCacheService.js`.

**Commands:** Tree/back/forward/parent navigation; List/grid; Name search/sort; Multi/range/drag select; Create folder; Upload/drop; Duplicate-name policy; F2 rename; Trash; Drag move; Single download/multiple ZIP.

**Model:** id; name; size; modifiedTime; owners; mimeType; webContentLink; parentFolderId; folderPath.

**Storage:** Drive v3 desktop ephemeral token; cached folder lists.

**Local verification:** Unsafe paths; Rename race; Duplicate policy; Nested ZIP; Cancel; Unauthorized delete/move; File lock.

**External gate:** Actual Drive writes/read auth not used; local file repository analog possible; production adapter gated.

**Scope:** Local file trash/permissions and cloud Drive semantics need explicit mapping. Live token/cache must not be copied.

### drive-cache — Drive 목록 캐시·백그라운드 갱신

근거: `src/App.jsx`, `src/services/driveCacheService.js`, `src/components/FileManager.jsx`.

**Commands:** Start warm; 10minute refresh; Online refresh; Manual sync; Cache status/error.

**Model:** folders/files tree; lastSynced; syncing; error.

**Storage:** localStorage Drive cache plus live tree.

**Local verification:** Immediate cache; Offline fallback; Rename/refresh race; Stale response; Hide system entries.

**External gate:** Live listing and write disabled; explicit fake tree can exercise.

**Scope:** Drive cache refresh is independent from Firebase work sync; one success must not imply the other succeeded.

### legacy-drive-system — 레거시 시스템 폴더·리소스·로그

근거: `src/App.jsx`, `src/services/dataService.js`.

**Commands:** Initialize .system/json/resources; JSON data log; Attachment resources; Action log; Delete JSON older than7days.

**Model:** tableName; data; op; id; timestamp.

**Storage:** Google Drive .system/json/resources.

**Local verification:** Zero startup cloud writes; Fake resource compensation; Explicit retention policy.

**External gate:** PROHIBITED in port startup: actual folder create/delete and old cleanup are live writes.

**Scope:** Legacy startup initSystemStorage creates folders and invokes cleanupOldData. Do not copy these automatic writes/deletes into startup.

### photos-gallery — 현행 사진·CAD 갤러리/뷰어

근거: `src/components/DashboardGallery.jsx`, `src/components/ImageViewer.jsx`, `src/components/ImageViewerWindow.jsx`, `src/services/galleryData.js`, `src/services/imageViewerService.js`, `src/hooks/useImageTransform.js`.

**Commands:** Recent8 thumbnails; Open image/CAD window; Folder tree; Previous/next; Zoom/fit; Pan; Return to app.

**Model:** file:id/name/mimeType/size/modifiedTime; parentFolderId; folderPath; selectedFolderId; selectedFileId; zoom/pan.

**Storage:** Drive tree/blobs; transient viewer state; bounded preview cache.

**Local verification:** Corrupt images; Large async cancellation; Stale selection; Cache budget/disposal; Original immutability.

**External gate:** Local photo browser possible; Drive real preview gated.

**Scope:** Existing product has Drive image/CAD viewer, not separate album/description/EXIF CRUD. Roadmap Photos expansion must be implemented as new scope.

### photos-new — 로드맵 신규 사진관리 요구

근거: `src/components/DashboardGallery.jsx`, `src/services/galleryData.js`.

**Commands:** NEW project/site/album linkage; NEW local import; NEW description/classification/capture metadata; NEW edited-copy export.

**Model:** projectId; site; albumId; description; classification; captureMetadata; contentHash; originalPath; editedArtifactId.

**Storage:** NEW separate local repository; no automatic production import.

**Local verification:** Project isolation; Hash dedup; Original preservation; Edited-copy export; Locked/corrupt input; Restart; Large thumbnail cancellation.

**External gate:** All local functionality permitted; EXIF external transmission forbidden.

**Scope:** Roadmap M3 addition, not a statement that either tree implements it.

### cad — DWG/DXF 미리보기

근거: `src/services/cadEngine.js`, `src/services/cadPreviewService.js`, `src/services/cadPreview.worker.js`, `src/services/cadRender.js`, `src/services/cadRaster.js`, `src/services/viewerPreviewService.js`.

**Commands:** Warm CAD worker; Render DWG/DXF; PNG preview; Cancel.

**Model:** filename; bytes; signal; render result; cache key(id/name/modifiedTime/size).

**Storage:** nasjidwg WASM worker; bounded cache.

**Local verification:** DWG/DXF goldens; Malformed input; Worker crash/retry; Cancellation; Cache eviction.

**External gate:** Native C# replacement requires fit test; preserved JS runtime can be isolated; no fake successful CAD output.

**Scope:** Preview/render only; no general CAD editor observed. nasjidwg0.18.0 needs retained runtime/appropriate replacement.

### dashboard-search — 대시보드·기간 집계·분산 검색

근거: `src/components/Dashboard.jsx`, `src/components/RightSidebar.jsx`, `src/components/ProjectList.jsx`, `src/components/BoardList.jsx`, `src/components/FileManager.jsx`, `src/components/ReportPlatform.jsx`.

**Commands:** Active projects; Process status aggregates; Upcoming public/own tasks; Recent image/CAD; Per-list search.

**Model:** activeProjects; allProjects; processes; schedule progress/status; upcomingTasks.

**Storage:** Local cached work records plus Drive gallery.

**Local verification:** Valid schedules/progress; Private task visibility; Correct destination; Fresh saved data; Explicit search scope.

**External gate:** Local dashboards permitted; no live sync claim.

**Scope:** No unified cross-module full-text search command found; existing search is list scoped. New unified search must identify scope.

### report-platform — 현행 스튜디오 문서/분석/자료·패널

근거: `src/components/ReportStudio.jsx`, `src/components/ReportPlatform.jsx`, `src/components/StudioLayoutControls.jsx`, `src/components/StudioFitPage.jsx`, `src/components/ReportAnalysisWorkspace.jsx`, `src/components/ReportChapterInspector.jsx`.

**Commands:** Select project; Import prior report local/Drive; Select/remove report link; Preview/analysis; Select chapter; Table/figure/data management; Source location/return; Input materials; Persist side widths; Edit formatting review.

**Model:** businessProjectId; projectName; reportIds; removedReportIds; activeReportId; reportMetadata; reportAnalyses; analysisReviews; chapterReviews; reproductionReviews; pdfAnalyses; pdfAuthoring; materialIds; reportSpecs.

**Storage:** IndexedDB jindan-report-studio v3 facilityStudios/materials/files; user/project scope.

**Local verification:** Project/active-document panel isolation; Remove only link; Distinct PDF/native preview source; Location return; Width/zoom/restart.

**External gate:** Local source analysis permitted; native fidelity/company approval separate HOLD.

**Scope:** ReportStudio.jsx:426 exports ReportPlatform; old Studio JSX is stored-workspace regression support. The independent ReportWorkspace route remains active.

### report-library — 원본·금회자료 보관·해시·유형

근거: `src/services/report/reportLibrary.js`, `src/services/report/studioProjects.js`, `src/services/report/referenceProjects.js`, `src/components/ReportDrivePicker.jsx`.

**Commands:** Import/deduplicate; Edit metadata; Preview/download original; Unlink project material; Classify reference folder; Choose whole PDF.

**Model:** id(role-SHA); filename; title; format; size; sha256; role; reportType; facility; templateGroup; notes; includeInPatterns; addedAt; updatedAt; relativePath; componentKind; chapterNumber.

**Storage:** IndexedDB jindan-report-studio v3 materials/files/referenceProjects/referenceEntries/facilityStudios.

**Local verification:** 160MB/signature; Batch50; SHA dedup; Linked-deletion refusal; User/project scope; Unsafe folder paths.

**External gate:** Local adapters possible; Drive import real verification gated.

**Scope:** Reference PDF/HWP/HWPX; data also XLSX/CSV/PWV/BMT; images PNG/JPG/JPEG/WebP. Image metadata alone is not measurement evidence.

### report-analysis-restore — PDF 복원분석·HWPX 작성분석·장별 재현

근거: `src/services/report/sourceParser.js`, `src/services/report/pdfAnalysis.js`, `src/services/report/pdfStructure.js`, `src/services/report/workflowAnalysis.js`, `src/services/report/chapterConversion.js`, `src/services/report/pdfHwpxWriter.js`, `src/services/report/pairedReferenceLearning.js`, `src/services/report/pairedTextReview.js`, `src/services/report/reproductionReview.js`.

**Commands:** PDF restoration analysis; Native authoring analysis; Paired-source learning/review; Selected chapter to HWPX; Extract font/picture; Analyze generated candidate.

**Model:** source SHA/project; chapter/page/paragraph/table/cell/picture IDs; source anchors; textRuns; contentRole; formatRole; pageTypes; furniture; provenance; writer/analysis versions.

**Storage:** Analysis in scoped studio book; original blobs; separate generated material and run.

**Local verification:** Audit65 null/undefined; Duplicate ZIP parser and facade; Source/slot mismatch; Chapter selection; Picture/font goldens; No success after cancel.

**External gate:** JS Hybrid initially; native Hancom review owns layout approval; no COM/OCR shortcut.

**Scope:** Digital PDF text/geometry is primary. OCR helper exists but no OCR/COM adoption is authorized. Native fidelity approval remains separate.

### report-review-draft — 내용역할 검토·근거바인딩·금회/빈초안

근거: `src/services/report/draftPreparation.js`, `src/services/report/draftWriter.js`, `src/services/report/draftRetention.js`, `src/services/report/draftSourceBindings.js`, `src/services/report/draftCollection.js`, `src/components/ReportDraftPreparation.jsx`, `src/components/ReportReproductionReview.jsx`.

**Commands:** keep/replace/rewrite/exclude; Declare static-label/history retention; Bind file/cell evidence; Reproduction review; Save preparation/input list; Generate blank/evidence draft.

**Model:** sourceMaterialId; sourceSha256; projectId; analysis fingerprint; decision; contentRole; retention purpose; draftText; clearValue; materialIds; expected text/slot; reproductionReview.

**Storage:** Studio analysisReviews/reproductionReviews/draftPreparations/draftRuns; separate candidate HWPX.

**Local verification:** Past measurement keep/static-label conflict; Empty replace versus clearValue; Actual evidence SHA; Stale source/review/slot; No invented current values.

**External gate:** Actual current measurements/judgments absent => HOLD; local explicit synthetic test allowed.

**Scope:** Selected48 blank cells do not approve a company-wide blank form. Design constants and marked historical comparison differ from current measurements/judgments.

### report-collection — 조사양식 내려받기·한글저장반환·빈칸 적용

근거: `src/services/report/draftCollection.js`, `src/services/report/collectionIntroStyle.js`, `src/components/ReportPlatform.jsx`, `src/services/report/styledTextReplacement.js`.

**Commands:** Export blank HWPX; Import filled form and preview; Apply returned values to same cells; Explicit all-empty confirmation; Bind returned-file receipt.

**Model:** JDF_ cell name; schemaFingerprint; sourceSha256; fieldCount; rows(id/value); warnings; receiptMaterialId/SHA; mode.

**Storage:** Files and collectionExports/collectionRuns; JDF cell names.

**Local verification:** Wrong source/context/cell; Duplicate/missing JDF; All-empty and warnings; Intro overlap regression; Immutable receipt; Restart.

**External gate:** Local synthetic UI full-flow possible; exact saved-company native tests separate.

**Scope:** JDF identity must not depend on custom jindan-source.json surviving SaveAs. New SHA does not inherit an old native approval.

### report-archive-recovery — 프로젝트아카이브·회수·fresh review 경계

근거: `src/services/report/projectArchive.js`, `src/services/report/engineRecovery.js`, `src/services/report/recoveredDraftSession.js`, `src/services/report/engineFacade.js`, `src/services/report/engineContract.js`.

**Commands:** Export/open jindanproj; Back up current work; Hash-verified recovery; Reanalyze native-saved; Fresh source/fingerprint review; Resume draft.

**Model:** schema; manifest; materials/files hashes; roles source/candidate/native-saved/evidence/collection/draft; parent links; project/source/fingerprint; acknowledgedReview.

**Storage:** Studio ZIP512MB/expanded768MB/projectJSON16MB; engineRecovery separate512MB/160MB/8MB limits.

**Local verification:** Duplicates/path/inflation/limits; Record hash/link cycle; Stale bundle/review; Actual evidence bytes; Reanalysis invalidates acknowledgment; Worker timeout/stale result.

**External gate:** Local replay possible; arbitrary recovered state never approval; actual project continuity separate HOLD.

**Scope:** Project archive and portable engine recovery are different contracts. Do not collapse limits or weaken guards. Optional recovery boundary must be enforced by host.

### report-discipline-workspace — 분야별 양식·계산·진단문구·백업

근거: `src/components/ReportWorkspace.jsx`, `src/services/report/reportEngine.js`, `src/services/report/reportStore.js`, `src/services/report/collectionForms.js`, `src/services/report/nativeWriter.js`, `src/services/report/reportSections.js`, `src/services/report/reportWorkflow.js`.

**Commands:** Select discipline/project/report; Select table/paragraph input slots; Judgment-column-only; Confirm schema; Enter current data; Rules/criteria/units; Reviewed narrative; New run/restore; Collection/backup/native exports.

**Model:** engineVersion; projectId; discipline; source; document; revision/confirmedRevision; fields/rules; values; notes; narrativeValues; history/runs; materials/receipts; valueOrigins; collectedEvidence.

**Storage:** IndexedDB jindan-report-engine v2 keyed user/project/sourceSHA/discipline.

**Local verification:** Number parser; Zero versus blank; Operations/units; Confirmed criteria; Explicit text slot; Project/discipline separation; Backup/restart.

**External gate:** Local calculations possible; AI optional external gate; HWP read-only/HWPX write.

**Scope:** This second report route is active beside ReportPlatform. Preserve field/rule editor, collection and run-history semantics.

### electrical-inputs — 전기분야 자료·범위·개선협의 준비

근거: `src/components/ElectricalReportPreparation.jsx`, `src/services/report/electricalPreparation.js`, `src/components/ThermalDeliveries.jsx`, `src/services/report/thermalDelivery.js`.

**Commands:** Analyze PDF/folder candidates; KEPCO include/exclude reason; Period/scope; Link8 electrical input groups; Record conditions/notes; Improvement consultation.

**Model:** referenceProjectId/referencePdfMaterialId; plan/signature/targets; scope; kepcoMode/kepcoReason; periodStart/end; inputs by section; notes.conditions/diagnosis/consultation/agreement; thermalDeliveries.

**Storage:** book.electrical; source material hashes; source entry signatures.

**Local verification:** Stale SHA/link; Human review after classification; No exclusion on incomplete analysis; No invented diagnosis; IR/SR not duplicate measurement count.

**External gate:** File inspection local; live KEPCO automatic fetch not established; no fake data.

**Scope:** 8 groups: kepco,thermal,quality,insulation,current,equipment,management,improvement. Keyword matches are review candidates, not diagnosis.

### thermal — Testo BMT 메타데이터·그림·열화상결과 묶음

근거: `src/services/report/thermalBmt.js`, `src/components/ThermalBmtPreview.jsx`, `src/services/report/thermalDelivery.js`, `src/components/ThermalDeliveries.jsx`.

**Commands:** Inspect BMT; Device/environment/display scale/camera points; Preview/real image; Bind modified BMT/final image/optional spreadsheet; Confirm points/image.

**Model:** source SHA/bytes; device; recordedClock/timeZone unconfirmed; environment; detector/grid raw; scale; points; editor markers; recomputeCoefficients; delivery bmt/image/measurements; pointsConfirmed/imageConfirmed.

**Storage:** BMT binary up to48MB; local material and electrical linkage.

**Local verification:** Malformed fields/bounds; Corrupt BMT; Do not use raw grid/scale as measured temperature; Changed hash invalidates binding; Unconfirmed timestamp.

**External gate:** No IRSoft edit automation; calibrated recomputation/native validation required; no rawgrid temperature claim.

**Scope:** Camera point metadata is not verified edited IRSoft points; checksum not verified; raw unit unverified and temperatureC null.

### power-quality — PowerView PWV 측정자료 검사

근거: `src/services/report/powerView.js`, `src/components/PowerViewPreview.jsx`.

**Commands:** Inspect PWV; Choose instrument/site/record; Search channels; Count/min/max/missing/preview.

**Model:** sourceSha256; instruments; sites; records; quantity/unit/prefix; representation; sample counts; snapshotLengthMs; channels count/finite/missing/min/max/preview.

**Storage:** UTF8 PQData XML up to48MB; Base64/GZip decoded budget64MB.

**Local verification:** DTD/entity rejection; Binary bounds/width; Single/Double missing samples; GZip limit; Channel units.

**External gate:** Local parser possible; CT/PT/unit/period/engineering interpretation human gate.

**Scope:** No arbitrary PWV editing/device collection observed. Channel inspection is not an engineering judgment.

### report-ai — 선택적 AI 분석·자료추출·진단초안

근거: `src/components/ReportAiSettings.jsx`, `src/services/report/reportAiClient.js`, `src/services/report/reportAnalyzer.js`, `src/services/report/reportInterpreter.js`, `src/services/report/reportCollection.js`, `report-ai.cjs`.

**Commands:** Status/config/model list; Propose slots; Extract file-table values; Propose interpretation; Cancel.

**Model:** request id; source/project/discipline/input fingerprint; response schema; models/status/usage/cacheHit.

**Storage:** Electron IPC; local protected settings/environment reference only; response cache.

**Local verification:** Response schema/source fingerprint; Reject invented cell/value; Stale request result; Cancel; Redact logs; No unreviewed mutation.

**External gate:** PAID/API calls forbidden; no credentials copied; fake provider must explicit; real provider verification blocked.

**Scope:** Only source code contracts read; no environment/session/API key values. Current provider is OpenAI, model availability not verified.

### updates-release — 기존 전체앱 업데이트와 새 모듈패치

근거: `src/App.jsx`, `package.json`, `main.cjs`, `preload.cjs`.

**Commands:** Legacy update events/progress; Confirmed restart; NSIS package; Publish script; NEW module package patch/rollback.

**Model:** app version; update info/progress; package manifest/signature/hash (new).

**Storage:** Legacy electron-updater/GitHub releases; NEW local package manifest policy.

**Local verification:** One-module v1-to-v2; Unrelated host/module SHA unchanged; Missing/hash/contract/path rejection; File lock; Staging interruption; Health rollback; User data preservation.

**External gate:** commit/push/deploy/upload prohibited; do not execute legacy publish; local patch fixture permitted.

**Scope:** Old whole-app update does not satisfy modular patch gate. No legacy web-security/process-kill behavior may be copied.

## 승인·보존 경계

소스 관측만 수행했다. 실제 기존 앱·클라우드·한글 UI를 실행하지 않았고 사용자 자료·키·토큰·설정을 읽거나 복사하지 않았다. 최종 parity matrix는 모든 기능에 정확한 구현/시험 증거 또는 구체 외부 차단을 연결해야 한다. 합성 검사는 회사업무·원본 글꼴·전객체 편집·금회 측정/판정 승인으로 승계하지 않는다.

권한은 UI 가리기로 대체하지 않는다. 서비스 경계에서 owner/admin/public/개인할일을 검사하고 여러 사용자·프로젝트 오염을 회귀에 포함한다. 실제 자료 import는 새 사본·미리보기·검증·rollback을 제공하며 production DB 자동 이전은 하지 않는다.
