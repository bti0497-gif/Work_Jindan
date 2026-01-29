
# Deojon Tech Studio 개발 가이드 (v2.4)

이 문서는 '더죤환경 기술진단팀 협업스튜디오' 앱의 구조를 이해하고 유지보수하기 위한 기술 지침서입니다.

## 1. 기술 스택 (Tech Stack)
- **Frontend**: React 19 (ES6 Modules)
- **Styling**: Tailwind CSS (CDN), Material Symbols Outlined
- **State Management**: React Hooks (Custom Hooks를 이용한 MVVM 패턴)
- **Mocking**: Local Storage 및 고정된 Mock Data (`services/mockData.ts`)

## 2. 프로젝트 아키텍처 (MVVM)
본 프로젝트는 관심사 분리를 위해 MVVM(Model-View-ViewModel) 패턴을 지향합니다.
- **Model**: `types.ts`에서 정의된 인터페이스 및 `services/dbSchema.ts`의 DB 명세.
- **View**: `components/` 폴더 내의 React 컴포넌트 (UI 및 사용자 인터랙션).
- **ViewModel**: `hooks/` 폴더 내의 Custom Hooks. API 호출 및 복잡한 비즈니스 로직을 캡슐화합니다.
  - `useAuthViewModel`: 로그인, 회원가입, 세션 상태 관리.
  - `useProjectViewModel`: 프로젝트 및 공정 진행률 자동 계산 로직.
  - `useTaskViewModel`: 개인/팀 할일 필터링 및 관리.
  - `useBoardViewModel`: 게시판 페이징, 검색, 정렬 로직.

## 3. 주요 기능 및 흐름
### 3.1. 인증 게이트 (Auth Gate)
- `App.tsx` 최상단에서 `currentUser` 존재 여부를 확인합니다.
- 로그인이 되지 않은 경우 `Login`, `SignUp`, `ForgotPassword` 화면만 노출되며 대시보드 접근이 원천 차단됩니다.
<!-- **테스트 계정**: ID `master` (비밀번호 생략 가능) - 주석 처리됨 -->

### 3.2. 데이터 동기화
- 공정(Process)이 완료로 표시되면 해당 프로젝트의 진행률(`progress`)이 실시간으로 재계산됩니다.
- 할일(Task) 및 게시글(Board)은 작성자 권한에 따라 수정/삭제 버튼이 조건부 렌더링됩니다.

### 3.3. UI/UX 디자인 가이드
- **Theme**: Slate-900 (Sidebar), Blue-600 (Primary Point Color).
- **Interaction**: Windows 11 및 전문 소프트웨어 대시보드 스타일을 차용하여 카드 형태의 위젯과 리스트를 혼합 사용합니다.
- **Responsiveness**: 사이드바 레이아웃은 데스크톱에 최적화되어 있으나, 메인 콘텐츠는 유동적인 그리드를 사용합니다.

## 4. 데이터베이스 연동 준비
`services/dbSchema.ts` 파일에 백엔드 구축을 위한 SQL DDL 문이 포함되어 있습니다. 실서비스 전환 시 해당 스키마를 기반으로 API 엔드포인트를 구축하십시오.

## 5. 주의사항
- 본 앱은 클라이언트 사이드에서 모든 상태를 관리하므로 브라우저 새로고침 시 데이터가 초기화될 수 있습니다 (Local Storage 저장분 제외).
- 파일 관리 시스템(`FileManagement`)은 현재 구글 드라이브와 링크되어 있으며, 실제 파일 업로드/다운로드는 외부 링크를 통해 수행됩니다.
