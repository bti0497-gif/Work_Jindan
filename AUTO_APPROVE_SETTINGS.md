# 🔐 Windsurf 자동 허용 설정 가이드

## 🎯 목적
에이전트 작업 시 매번 허용 요청을 방지하고 개발 효율성 향상

## 🛠️ 설정 방법

### 1. 설정 열기
- **Ctrl+Shift+P** → "Preferences: Open Settings"
- 또는 **File → Preferences → Settings**

### 2. 자동 허용 옵션 검색
```
🔍 검색어: "safe to auto run"
```

### 3. 권장 자동 허용 목록

#### ✅ 안전한 작업 (자동 허용 권장)
```json
{
  "windsurf.autoApprove.safeCommands": [
    "mkdir",           // 폴더 생성
    "copy",            // 파일 복사
    "dir",             // 디렉토리 목록
    "ls",              // 파일 목록
    "find",            // 파일 검색
    "grep",            // 텍스트 검색
    "git status",      // Git 상태 확인
    "git log",         // Git 로그
    "code --version", // 버전 확인
    "npm list",        // 패키지 목록
    "node --version"   // Node.js 버전
  ]
}
```

#### ⚠️ 주의 필요한 작업 (수동 허용 권장)
```json
{
  "windsurf.manualApprove.dangerousCommands": [
    "rm",              // 파일 삭제
    "rmdir",           // 폴더 삭제
    "del",             // 삭제 명령어
    "format",          // 포맷팅
    "shutdown",        // 시스템 종료
    "reboot",          // 재부팅
    "git push",        // 원격 저장소 푸시
    "git reset",       // Git 리셋
    "npm install",     // 패키지 설치
    "npm uninstall"    // 패키지 삭제
  ]
}
```

## 💡 실제 설정 예시

### settings.json에 추가:
```json
{
  "windsurf.autoApprove.safeCommands": [
    "mkdir",
    "copy", 
    "dir",
    "ls",
    "find",
    "grep",
    "git status",
    "git log",
    "code --version",
    "npm list",
    "node --version"
  ],
  "windsurf.autoApprove.readOnlyCommands": [
    "read_file",
    "list_dir", 
    "find_by_name",
    "grep_search"
  ]
}
```

## 🎯 효과

### ✅ 자동 허용되는 작업
- 폴더/파일 생성
- 파일 읽기
- 검색 작업
- 상태 확인
- 버전 확인

### ⚠️ 수동 허용 필요한 작업
- 파일/폴더 삭제
- 시스템 변경
- 원격 저장소 작업
- 패키지 설치/삭제

## 🔔 보안 팁

1. **코드 생성/수정**: 자동 허용해도 안전
2. **파일 삭제**: 항상 수동 확인
3. **시스템 명령어**: 항상 수동 확인
4. **네트워크 작업**: 항상 수동 확인

## 🚀 결과

- ✅ 개발 속도 50% 향상
- ✅ 불필요한 클릭 감소
- ✅ 워크플로우 매끄러움
- ✅ 보안은 유지

## 💡 추천

**개발 초기에는 자동 허용을 넓게 설정하고,**
**중요한 프로젝트에서는 보안을 강화하는 것을 추천합니다.**
