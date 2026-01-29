# 🌍 Windsurf Cloud Sync 설정 가이드

## 🎯 목표
- Windsurf 계정에 설정 저장
- 모든 컴퓨터에서 동일한 설정 자동 동기화
- VS Code와 분리된 Windsurf 전용 설정

## 🛠️ Windsurf Cloud Sync 설정

### 1. Windsurf 설정 열기
```
방법 1: Ctrl+Shift+P → "Windsurf: Open Settings"
방법 2: File → Preferences → Settings (Windsurf)
방법 3: 왼쪽 하단 Windsurf 아이콘 → Settings
```

### 2. Cloud Sync 활성화
```
1. Settings 검색창에 "cloud sync" 입력
2. "Windsurf: Cloud Sync" 옵션 찾기
3. "Enable Cloud Sync" 체크박스 선택
4. Windsurf 계정으로 로그인
```

### 3. 설정 동기화
```
1. "Sync Settings Now" 버튼 클릭
2. 동기화할 설정 선택:
   ✅ Editor settings
   ✅ Keybindings
   ✅ Extensions
   ✅ Windurf AI settings
   ✅ Auto approve commands
3. "Sync" 버튼 클릭
```

## 🎯 Windsurf 전용 설정 파일

### 설정 위치:
```
%APPDATA%\Windsurf\User\settings.json
```

### Windsurf 자동 허용 설정:
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
    "node --version",
    "xcopy",
    "move",
    "ren",
    "type",
    "echo",
    "cd",
    "pushd",
    "popd",
    "tree",
    "where",
    "which",
    "pwd",
    "cat",
    "head",
    "tail",
    "wc",
    "sort",
    "uniq",
    "cut",
    "awk",
    "sed"
  ],
  "windsurf.autoApprove.readOnlyCommands": [
    "read_file",
    "list_dir", 
    "find_by_name",
    "grep_search"
  ],
  "windsurf.cloudSync.enabled": true,
  "windsurf.cloudSync.settings": [
    "autoApprove",
    "editor",
    "keybindings",
    "extensions"
  ]
}
```

## 🚀 장점

### ✅ Windsurf Cloud Sync의 장점:
- **자동 동기화**: 모든 컴퓨터에서 즉시 적용
- **Windsurf 전용**: VS Code와 분리된 설정
- **AI 설정 포함**: 자동 허용 등 AI 관련 설정 동기화
- **계정 연동**: 로그인만 하면 모든 설정 적용

### ✅ VS Code와의 차이:
- **VS Code**: Microsoft 계정 동기화
- **Windsurf**: Windsurf 계정 동기화 (더 전문적)
- **설정 분리**: 각각 독립적인 설정 관리

## 🔧 즉시 실행 방법

### 1단계: Windsurf 설정 열기
```
Ctrl+Shift+P → "Windsurf: Open Settings"
```

### 2단계: Cloud Sync 활성화
```
검색: "cloud sync" → "Enable Cloud Sync" 체크
```

### 3단계: 설정 추가
```
위 JSON 내용을 Windsurf settings.json에 추가
```

### 4단계: 동기화
```
"Sync Settings Now" 클릭
```

## 🎯 결과

### 설정 동기화되는 곳:
- ✅ 집 컴퓨터 (Windsurf)
- ✅ 사무실 컴퓨터 (Windsurf)
- ✅ 노트북 (Windsurf)
- ✅ 새로운 컴퓨터 (Windsurf 설치 후 로그인)

### 동기화되지 않는 곳:
- ❌ VS Code (별도 설정 필요)
- ❌ 다른 IDE (별도 설정 필요)

## 💡 추천

**Windsurf Cloud Sync가 최상의 솔루션:**

1. **지금 Windsurf 설정에서 Cloud Sync 활성화**
2. **자동 허용 목록 추가**
3. **모든 컴퓨터에서 Windsurf 로그인**
4. **자동으로 설정 동기화됨**

**이제 VS Code를 열 필요 없이, Windsurf만으로 모든 설정이 동기화됩니다!** 🚀
