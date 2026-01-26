# UI/UX 구현계획

개요
- 범위: 공정관리 컴포넌트를 제외한 나머지 기능(프로젝트 관리, 할일 관리, 파일 관리, 전체 게시판 등) 구현.
- 아키텍처: Electron + Next.js 기반 UI, Google Drive를 주 데이터 소스로 연동하는 백엔드 로직.
- 목표: Drive 연동의 안정성 확보와 UI에서의 완전한 CRUD 및 조회 흐름 구현.
- 가정: UI는 React(Next.js) 기반이며 IPC 채널을 통해 Electron 백엔드와 Drive 연동 로직이 상호작용합니다.

---

## 데이터 모델 요약 (UI/UX 관점에서의 엔터티 흐름 설명)
- User: id, name, email, googleDriveId, tokenRef
- Project: id, name, description, ownerId, createdAt, updatedAt, status
- Task: id, title, description, projectId, assigneeId, dueDate, priority, status, createdAt, updatedAt
- FileItem: id, name, mimeType, size, driveFileId, parentFolderId, projectId?, associatedObjectId
- BoardPost: id, title, content, authorId, category, createdAt, updatedAt, views
- Comment: id, postId, authorId, content, createdAt
- Folder/DriveReference: driveFolderId, path, metadata

> 이 초안은 UI/UX 흐름에 맞춰 필요에 따라 필드와 관계를 조정합니다.

---

## 디자인 원칙
- 한 화면에 과도한 정보 제공을 피하고, 핵심은 직관적 CRUD 흐름으로 구성
- 탭/네비게이션으로 모듈 간 일관된 UX 제공
- 상태 피드백: 로딩, 성공/오류 토스트, 오프라인 대기 시 큐잉 표시
- 접근성: 키보드 네비게이션, 스크린리더 친화적 구성
- 보안: 민감 데이터는 클라이언트에 과도히 저장하지 않되, 필요 시 암호화/로컬 캐시 사용

---

## 화면 구성 맵
- 로그인/Drive 연결 화면
- 대시보드: 요약 카드(프로젝트 수, 진행 현황, 미 assigned Tasks 등)
- Projects 페이지: 목록 + 생성/수정 폼
- Tasks 페이지: 프로젝트별 태스크 목록 + 필터/정렬
- Files 페이지: Drive 파일 브라우징, 업로드/다운로드
- Board 페이지: 게시판 목록/게시글 상세/작성
- Settings/Auth 페이지: 토큰 상태, 연결 관리
- 공통 컴포넌트: 모달, 토스트, 로딩 스피너, 카드, 리스트, 테이블, 폼

---

## 모듈별 UI/UX 구현 계획
각 모듈은 공통 컴포넌트와 컨벤션을 공유하도록 설계합니다.

### 1) Google Drive 연동 모듈 (Auth, DriveBridge, 조회/CRUD)
- UI/UX 목표
  - 매끄러운 OAuth 흐름: 로그인/연결 다이얼로그를 명확하게 표시
  - Drive 파일/폴더 탐색과 선택이 직관적임
  - 토큰 상태와 만료 관리가 명확하게 보임
- 화면 구성
  - 로그인/연결 화면: Google 계정 선택, 권한 요청 승인
  - Drive 대시보드: 루트 폴더 트리 뷰, 파일 리스트, 선택 파일의 메타데이터 패널
  - 파일 업로드/다운로드 모달: 파일 선택, 진행상태 표시
- 상호작용 예시
  - "연결" 클릭 시 OAuth 창 열림 → 토큰 저장 → Drive API 초기 연결 확인
  - 파일 목록에서 파일 클릭 시 상세정보 패널에 메타데이터 표시
  - 업로드 버튼으로 로컬 파일 선택 → Drive에 업로드 시도 → 성공/오류 토스트 알림
- IPC/API 설계 예시
  - drive/auth/init: { userId }, 응답 { ok, token, expiry }
  - drive/file/list: { driveFolderId }, 응답 { items: [{ id, name, mimeType, size, driveFileId }] }
  - drive/file/upload: { projectId, targetFolderId, filePath }, 응답 { success, driveFileId }
- 성공 기준
  - OAuth연결 성공 및 토큰 재생성/갱신 정상 동작
  - 루트/선택 폴더에서 파일 조회 가능
  - 파일 업로드/다운로드가 Drive와 동기화되며 UI에 반영

---

### 2) 프로젝트 관리 모듈
- UI/UX 목표
  - 명확한 CRUD 흐름: 목록 → 상세 → 생성/수정 → 목록으로의 원활한 이동
  - 대시보드로 진행상태의 간단한 시각화 제공
- 화면 구성
  - Projects List: 카드/테이블 혼용, 상태 필터링, 검색
  - Project Detail: 요약 정보, 코드/메모 영역, 멤버/마일스톤 등
  - Create/Edit 폼: 이름, 설명, 상태, 담당자 할당
- IPC/데이터 흐름
  - project/list, project/create, project/update, project/delete
- UI 컴포넌트 제안
  - CardGrid, ModalForm, StatusPill, AvatarList, Toast
- 성공 기준
  - 프로젝트 CRUD가 UI에서 원활히 동작하고 데이터가 Drive 로직/로컬 캐시와 일관되게 저장
  - 대시보드의 상태 요약이 항상 최신으로 반영

---

### 3) 할일 관리 모듈
- UI/UX 목표
  - 직관적 CRUD 및 필터링/정렬 기능
  - 우선순위, 마감일, 담당자에 따른 시각적 구분
- 화면 구성
  - Tasks List: 프로젝트별 탭 또는 사이드바 필터
  - Task Detail: 제목/설명/상태/우선순위/마감일/담당자/연결 파일
  - Create/Edit Task: 폼 기반 입력
- IPC/데이터 흐름
  - task/list, task/create, task/update, task/delete, task/complete
- 성공 기준
  - 필터링 및 정렬이 즉시 반영되고, Task 상태가 다른 모듈과 동기화

---

### 4) 파일 관리 모듈
- UI/UX 목표
  - Drive 파일 관리와 로컬 파일 시스템의 편집이 직관적으로 연결되도록 구성
  - 폴더 트리 탐색, 파일 업로드/다운로드, 미리보기(간단) 제공
- 화면 구성
  - File Browser: 폴더 트리, 파일 리스트, 파일 미리보기 패널
  - Upload/Download 모달: 파일 선택, 진행상태 표시
- IPC/데이터 흐름
  - drive/file/list, drive/file/upload, drive/file/download, drive/file/delete
- 성공 기준
  - Drive의 파일이 UI에 정확히 반영되고, 프로젝트별 파일 연결이 가능

---

### 5) 전체 게시판 모듈
- UI/UX 목표
  - 글/댓글의 CRUD 흐름을 직관적으로, 검색/필터링 가능
  - 카테고리 및 권한 기초 구조 도입
- 화면 구성
  - BoardList: 목록/카테고리 필터/검색
  - PostDetail: 본문, 댓글 리스트/생성, 편집
  - PostCreate/Edit: 제목/본문/카테고리
- IPC/데이터 흐름
  - board/post/list, board/post/create, board/post/update, board/post/delete
  - board/comment/add, board/comment/list
- 성공 기준
  - 글 작성/수정/삭제, 댓글 관리가 정상 동작하고, 데이터가 Drive/로컬에 반영

---

### 6) 공통 UI 컴포넌트 및 스타일 규격
- UI 원칙
  - 일관된 레이아웃(헤더/사이드바/콘텐츠 영역), 재사용 가능한 컴포넌트
  - 반응형 디자인, 접근성 개선
- 구성 요소 제안
  - Layout, Navbar, Sidebar, Card, Modal, Button, Input, Select, Table, Tabs, toasts/notification, Loader
- 상태 관리
  - IPC 이벤트 상태를 전역적으로 반영하는 공통 훅/스토어 설계
- 성공 기준
  - UI가 재사용 가능 컴포넌트로 묶이고, 다른 모듈에서 쉽게 재활용 가능

---

### 7) 보안, 인증 및 권한 관리
- 보안 목표
  - 토큰 저장 암호화, 민감 데이터 최소 저장, IPC 경계 강화
- 구현 방향
  - Electron에서 토큰 저장소를 암호화(예: keytar+암호화)
  - 인증 흐름 재시도/로그 기록
- 성공 기준
  - 토큰 저장/복구가 안전하고, 인증 흐름 중 에러가 명확히 사용자에게 표시

---

### 8) 테스트 전략(개략)
- 계층별 테스트
  - 유닛: IPC 핸들러, Drive 래퍼
  - 통합: OAuth 흐름, Drive 연동 엔드투엔드
  - E2E: 주요 시나리오(프로젝트 생성 → 파일 업로드 → 게시판 작성)
- 성공 기준
  - 주요 흐름이 자동화된 테스트로 커버되며, 실패 시 적절한 실패 원인 로그가 남음

---

### 9) 디자인 시스템 및 접근성
- 목표
  - 디자인 가이드라인(타이포그래피, 색상, 간격, 아이콘 세트) 정리
  - ARIA 라벨, 키보드 네비게이션 보장
- 산출물
  - 디자인 시스템 문서 초안, 컴포넌트 ACL 시나리오

---

### 10) 마무리 및 배포/운영 고려사항
- CI/CD, 테스트 파이프라인 구축 기본 방향
- 데이터 관리 정책(Drive 중심 + 로컬 캐시 보조 여부) 기본 원칙
- 모듈 간 계약서(API Contract) 예시 포함

---

## 성공 판단 기준
- Google Drive 연동의 기본 CRUD가 UI에서 정상 동작
- 프로젝트/할일/파일 관리 화면이 독립적으로 작동하고 데이터 흐름이 일관
- 게시판의 작성/조회/댓글 기능이 반응성 있게 작동
- 로컬 캐시와 Drive 간의 데이터 일관성 검사 성공
- 보안 및 인증 흐름이 안정적으로 동작

---

## 산출물 목록(초기 버전)
- auth 모듈 스켈레톤 및 DriveBridge API 문서
- 프로젝트/할일/파일/게시판 페이지 초안 UI 및 IPC 핸들러 스켈레톤
- 공통 UI 컴포넌트 라이브러리 초안
- 데이터 흐름 다이어그램 및 API Contracts 문서
- 테스트 스케폴딩(TS/JS 기반 유닛 테스트 예제)

---

## 다음 단계 및 확인 포인트
- 우선 구현하고 싶은 모듈 2~3개를 알려주시면, 그에 맞춘 세부 이슈 템플릿과 로드맷 타임라인을 바로 작성하겠습니다.
- 또한, 위 문서를 바탕으로 팀용 와이어프레임/경계 문서를 함께 준비해 드릴 수 있습니다.
