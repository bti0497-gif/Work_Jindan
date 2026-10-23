# Firebase 게시판

현재 실행되는 Electron/React 앱(`src/App.jsx`)의 게시판은 Firebase 프로젝트 `work-jindan`의 Firestore를 사용한다. 첨부파일은 기존 Google Drive 저장소를 사용한다.

## 로그인과 회원 관리

- 앱 로그인은 관리자가 정한 **아이디와 비밀번호**로 한다. Firebase Auth의 이메일 형식 식별자는 내부에서 자동 생성하며 사용자는 이메일을 입력하지 않는다.
- `jindan_members/{Firebase UID}` 문서의 `isActive: true`인 계정만 게시판에 접근한다. `userLevel: 0`은 관리자, `2`는 일반 팀원이다.
- 관리자는 앱의 **회원관리 → 회원추가**에서 아이디, 초기 비밀번호, 이름, 직급을 등록한다. 새 계정 생성 중에도 관리자 로그인은 유지된다.
- 회원 정보 수정에서는 이름·직급·관리자 권한을 변경할 수 있다. 아이디는 변경하지 않는다.
- 본인은 왼쪽 사용자 정보 영역의 **비밀번호 변경** 버튼에서 현재 비밀번호를 확인하고 새 비밀번호(4자 이상)로 바꾼다. 다음 로그인부터 새 비밀번호가 적용된다.
- 회원 삭제는 계정을 비활성화해 게시판 접근을 막는다. 현재 로그인한 관리자는 자기 계정을 비활성화하거나 자기 관리자 권한을 해제할 수 없다.
- 비밀번호와 관리자 서비스 계정 키를 Firestore나 앱 배포 파일에 저장하지 않는다.
- 기존 Google Drive의 회원 백업은 `scripts/firebase-migrate-members.mjs --migrate`로 옮긴다. 기존 아이디·비밀번호를 유지하며, 이미 만들어진 Firebase 계정은 비밀번호를 다시 설정하지 않는다. 기존에 짧게 지정했던 초기 비밀번호도 유지할 수 있도록 Auth에 전달할 값은 내부에서 변환한다.

## 데이터와 기존 게시글

- `jindan_board_posts`: 본사공지/전체게시판 게시글. `ownerUid`로 수정·삭제 권한을 확인한다.
- `jindan_board_comments`: 글별 댓글. 댓글을 별도 문서로 저장해 동시 작성 시 덮어쓰지 않는다.
- 기존 `users`, `posts`, `comments` 컬렉션은 다른 구조이므로 변경하거나 자동으로 섞지 않는다.
- 글 저장은 서버 응답을 받은 뒤 완료로 표시한다. 목록과 댓글은 실시간으로 갱신한다. 연결 실패를 빈 목록으로 처리하지 않는다.
- 삭제는 `deleted: true`로 보존하며, 이전 PC에 남은 글이 서버 글을 되살리지 않는다.
- 관리자는 **이 PC의 기존 게시글 가져오기**로 해당 게시판의 로컬 기록을 옮길 수 있다. 기존 ID가 서버에 있으면 건너뛰며, 로컬 원본은 지우지 않는다. 중간 실패 후 재실행할 수 있다.
- 가져온 글은 기존 작성자·작성일을 표시하되, 가져온 관리자의 소유로 등록된다. 기존 첨부파일의 Drive ID도 보존한다.

## 개발 설정과 규칙 배포

`.env.example`의 Firebase Web SDK 항목을 `.env.local`에 설정한다. 기존 Google Drive 설정도 유지한다. `.env.local`과 `.firebase/`는 Git에서 제외한다.

```powershell
node --test scripts/board-model.test.cjs
node scripts/firebase-board-deploy.mjs
node scripts/firebase-board-deploy.mjs --deploy
node scripts/firebase-migrate-members.mjs
node scripts/firebase-migrate-members.mjs --migrate
node scripts/firebase-board-smoke.mjs --run
npm run build
```

규칙 관리/실서버 검증에는 `gcloud`로 로그인된 개발자 권한을 사용한다. 앱에는 이 권한을 넣지 않는다. 배포 스크립트는 기존 규칙을 `.firebase/backups/`에 저장하고 컴파일 검증 후 적용한다. 실서버 검증은 임시 계정/게시글을 만들고 종료 시 정리한다.

UI 검증은 Vite에서 `/scripts/firebase-board.browser.html`을 열어 수행한다. 실제 Firebase 로그인 및 게시판/회원관리 컴포넌트를 사용하며, 앱 시작 시 실행되는 Drive 정리 작업은 실행하지 않는다. 임시 UI 계정은 `node scripts/firebase-board-ui-account.mjs create`로 만들고, 검증 후 반드시 `cleanup` 명령으로 정리한다.

설치 파일 빌드와 GitHub Release 업로드는 별도 단계다. Firebase 규칙 배포만으로 기존 설치 앱이 새 게시판을 사용하는 것은 아니다.
