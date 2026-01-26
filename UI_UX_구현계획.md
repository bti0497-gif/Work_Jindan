# UI/UX 구현 계획: Google Drive 연동 포함 나머지 기능

## 1. 개요
- **범위:** 공정관리 컴포넌트를 제외한 나머지 기능(프로젝트 관리, 할일 관리, 파일 관리, 전체 게시판 등) 구현
- **아키텍처:** Electron + Next.js 기반 UI, Google Drive를 주 데이터 소스로 연동하는 백엔드 로직
- **목표:** Drive 연동의 안정성 확보와 UI에서의 완전한 CRUD 및 조회 흐름 구현
- **가정:** UI는 React(Next.js) 기반이며 IPC 채널을 통해 Electron 백엔드와 Drive 연동 로직이 상호작용

## 2. 데이터 모델 초안
- **User:** id, name, email, googleDriveId, tokenRef
- **Project:** id, name, description, ownerId, createdAt, updatedAt, status
- **Task:** id, title, description, projectId, assigneeId, dueDate, priority, status, createdAt, updatedAt
- **FileItem:** id, name, mimeType, size, driveFileId, parentFolderId, projectId?, associatedObjectId
- **BoardPost:** id, title, content, authorId, category, createdAt, updatedAt, views
- **Comment:** id, postId, authorId, content, createdAt
- **Folder/DriveReference:** driveFolderId, path, metadata

## 3. 아키텍처 및 인터페이스 설계
- **계층 구성**
  - **프론트엔드:** Next.js 페이지/컴포넌트
  - **백엔드 계층:** Electron IPC를 통한 Drive 연동 로직
  - **데이터 계층:** Drive 래퍼 + 로컬 메타데이터 저장소(필요 시)
- **주요 IPC 채널**
  - `drive/auth/init`, `drive/auth/getToken`, `drive/auth/refresh`
  - `drive/file/list`, `drive/file/upload`, `drive/file/download`, `drive/file/delete`
  - `project/create`, `project/list`, `project/update`, `project/delete`
  - `task/create`, `task/list`, `task/update`, `task/delete`, `task/complete`
  - `board/post/create`, `board/post/list`, `board/post/update`, `board/post/delete`
  - `board/comment/add`, `board/comment/list`
  - `ui/notify`, `ui/loading`

## 4. 모듈별 상세 구현 계획

### 1) Google Drive 연동 모듈 (Auth, DriveBridge)
- **UI/UX 목표**
  - 매끄러운 OAuth 흐름: 로그인/연결 다이얼로그 명확화
  - Drive 파일/폴더 탐색과 선택의 직관성 확보
  - 토큰 상태와 만료 관리 가시화
- **화면 구성**
  - **로그인/연결:** Google 계정 선택, 권한 요청 승인
  - **Drive 대시보드:** 루트 폴더 트리 뷰, 파일 리스트, 메타데이터 패널
  - **업로드/다운로드:** 파일 선택 모달, 진행상태 표시
- **성공 기준**
  - OAuth 연결 성공 및 토큰 갱신 정상 동작
  - 루트/선택 폴더 파일 조회 가능
  - 파일 업로드/다운로드가 Drive와 동기화

### 2) 프로젝트 관리 모듈
- **UI/UX 목표**
  - 명확한 CRUD 흐름: 목록 → 상세 → 생성/수정 → 목록 이동
  - 대시보드로 진행상태 시각화 제공
- **화면 구성**
  - **Projects List:** 카드/테이블 뷰, 상태 필터링, 검색
  - **Project Detail:** 요약 정보, 멤버, 마일스톤 등
  - **Create/Edit Form:** 이름, 설명, 상태, 담당자 할당
- **데이터 흐름:** `project/list`, `project/create`, `project/update`, `project/delete`
- **성공 기준:** 프로젝트 CRUD 동작 및 데이터 일관성 확보

### 3) 할일 관리 모듈
- **UI/UX 목표**
  - 직관적 CRUD 및 필터링/정렬 기능
  - 우선순위, 마감일, 담당자에 따른 시각적 구분
- **화면 구성**
  - **Tasks List:** 프로젝트별 탭 또는 사이드바 필터
  - **Task Detail:** 제목/설명/상태/우선순위/마감일/담당자
  - **Create/Edit Task:** 폼 기반 입력
- **성공 기준:** 필터링/정렬 즉시 반영, 상태 동기화

### 4) 파일 관리 모듈
- **UI/UX 목표**
  - Drive 파일 관리와 로컬 파일 시스템 편집의 연결
  - 폴더 트리 탐색, 파일 업로드/다운로드, 미리보기 제공
- **화면 구성**
  - **File Browser:** 폴더 트리, 파일 리스트, 미리보기 패널
  - **Transfer Modal:** 업로드/다운로드 진행상태
- **성공 기준:** Drive 파일 UI 반영, 프로젝트별 파일 연결

### 5) 전체 게시판 모듈
- **UI/UX 목표**
  - 글/댓글 CRUD 흐름 직관화, 검색/필터링
  - 카테고리 및 권한 기초 구조 도입
- **화면 구성**
  - **Board List:** 목록, 카테고리 필터, 검색
  - **Post Detail:** 본문, 댓글 리스트/작성
  - **Post Create/Edit:** 제목, 본문, 카테고리 설정
- **성공 기준:** 게시글/댓글 관리 정상 동작, 데이터 반영

### 6) 공통 UI 컴포넌트 및 스타일 규격
- **UI 원칙**
  - 일관된 레이아웃(헤더/사이드바), 재사용 가능 컴포넌트
  - 반응형 디자인, 접근성 고려
- **구성 요소:** Layout, Navbar, Sidebar, Card, Modal, Button, Input, Table, Toast, Loader
- **성공 기준:** UI 컴포넌트 재사용성 확보

### 7) 보안, 인증 및 권한 관리
- **목표:** 토큰 저장 암호화, 민감 데이터 최소 저장, IPC 경계 강화
- **구현 방향:** Electron 토큰 저장소 암호화, 인증 흐름 재시도/로그 기록
- **성공 기준:** 토큰 안전 저장, 인증 에러 명확화

## 5. 성공 판단 기준
- Google Drive 연동 기본 CRUD UI 정상 동작
- 프로젝트/할일/파일 관리 화면 독립적 작동 및 데이터 흐름 일관성
- 게시판 작성/조회/댓글 기능 반응성 확보
- 로컬 캐시와 Drive 간 데이터 일관성 검사 성공
- 보안 및 인증 흐름 안정적 동작

## 6. 다음 단계 제안
1. **우선순위 확정:** Google Drive 연동 → 프로젝트 관리 → 할일 관리 순 권장
2. **구현 착수:** 각 모듈별 상세 이슈 생성 및 개발 진행
