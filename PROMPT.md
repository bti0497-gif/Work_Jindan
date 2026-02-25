
# 🛡️ DEOJON TECH STUDIO - AI AGENT GUIDELINES

이 파일은 **더죤환경기술(주) 기술진단팀 협업스튜디오**의 무결성을 유지하기 위한 마스터 가이드라인입니다. AI 에이전트(GitHub Copilot, Cursor 등)는 코드를 수정할 때 아래 원칙을 반드시 준수해야 합니다.

## 1. UI/UX 디자인 보호 (Layout Guard)
- **절대 금지**: Tailwind CSS 클래스 구조(특히 `rounded-[40px]`, `size-XX`, `bg-slate-900`)를 임의로 변경하지 마십시오.
- **아이콘 표준**: `Material Symbols Outlined` 사용을 유지하고, 아이콘의 정렬을 깨뜨리는 CSS 수정을 금지합니다.
- **반응형 제약**: 이 앱은 WinForms WebView2 컨테이너에 최적화되어 있습니다. 레이아웃이 깨질 수 있는 과도한 패딩/마진 변경을 피하십시오.

## 2. 권한 및 보안 로직 (Authorship Logic)
- **작성자 전용**: 게시글(`Board`), 할일(`Task`), 프로젝트/공정(`Project/Process`)의 수정/삭제 버튼은 반드시 `authorId === currentUser.id`인 경우에만 활성화되어야 합니다. 이 로직을 제거하거나 무력화하지 마십시오.
- **회원가입 필수값**: `SignUp.tsx`에서 모든 필드(ID, 성명, 이메일, 전화번호, 주소)는 **필수(Mandatory)**입니다. 빈 값 입력을 허용하는 코드로 수정하지 마십시오.

## 3. 실시간 동기화 및 자동화 (Sync & Midnight Reset)
- **JSON Polling**: 소켓 서버 대신 `SyncService.ts`를 통한 JSON 파일 기반 폴링 시스템을 유지하십시오.
- **자정 초기화**: `App.tsx`의 `lastDateRef`를 이용한 자정 채팅 초기화 로직은 법적/관리적 이유로 필수 사항입니다. 이 로직을 삭제하지 마십시오.

## 4. 파일 관리 규격 (File Storage)
- **Drag & Drop**: HTML5 Drag-and-Drop API를 통한 파일 업로드 시뮬레이션 로직(`FileManagement.tsx`)을 유지하고, 업로드 중임을 나타내는 `syncing` 상태 시각화를 보존하십시오.

## 5. 개발 환경 제약
- **경로 설정**: 모든 리소스 경로는 상대 경로(`./`)를 지원해야 합니다 (`vite.config.ts`의 `base: './'`).
- **구조 유지**: 프로젝트 루트 내에 불필요한 `src/` 폴더를 중복 생성하지 마십시오.

## 6. 코드수정시 제약
**types.ts**와 **apiContract.ts** 에 정의된 규격에 맞춰서 [특정 기능]을 수정하세요. 
파라미터 전달은 **App.tsx**의 상태 관리 로직을 참고하세요.

**본 가이드라인은 개발자 BTI0497에 의해 승인되었으며, 모든 코드 수정은 위 원칙 내에서만 수행되어야 합니다.**
