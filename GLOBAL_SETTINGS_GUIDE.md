# 🌍 모든 곳에서 Windsurf 자동 허용 설정

## 🎯 목표
- 집, 사무실, 이동 중 모든 환경에서 동일한 자동 허용 설정
- 모든 프로젝트에서 일관된 개발 경험

## 🛠️ 설정 방법

### 1. 전역 설정 (가장 추천)
```
1. Ctrl+Shift+P → "Preferences: Open Settings (JSON)"
2. 전역 settings.json에 아래 내용 추가:
```

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
  ]
}
```

### 2. 프로젝트 템플릿 (모든 프로젝트에 적용)
```
1. 템플릿 폴더 생성:
   C:\Users\ASUS\OneDrive\바탕 화면\Project_Template\.vscode\settings.json

2. 새 프로젝트 시작 시 템플릿 복사:
   xcopy "Project_Template\.vscode" "New_Project\.vscode" /E /I
```

### 3. Git 동기화 (여러 컴퓨터)
```
1. 설정 파일을 Git 저장소에 포함:
   .vscode/settings.json (이미 포함됨)

2. 다른 컴퓨터에서 클론:
   git clone [repository]

3. 자동으로 설정 적용됨
```

## 🎯 추천 전략

### **단계 1: 전역 설정**
- 집 컴퓨터에서 전역 설정 적용
- 사무실 컴퓨터에서 동일하게 적용

### **단계 2: 프로젝트 템플릿**
- 새 프로젝트마다 .vscode/settings.json 복사
- 일관된 개발 환경 유지

### **단계 3: Git 동기화**
- 중요 프로젝트는 Git으로 설정 공유
- 여러 컴퓨터 간 설정 동기화

## 🚀 이점

### **전역 설정의 장점:**
- ✅ 모든 프로젝트에 자동 적용
- ✅ 새 프로젝트 설정 불필요
- ✅ 일관된 개발 경험

### **프로젝트별 설정의 장점:**
- ✅ 프로젝트 특화 설정 가능
- ✅ 팀원과 설정 공유 용이
- ✅ Git으로 버전 관리

## 💡 최종 추천

**전역 설정 + 프로젝트 설정 조합:**

1. **전역**: 기본 자동 허용 목록
2. **프로젝트**: 프로젝트 특화 설정
3. **Git**: 팀원과 설정 공유

## 🔧 즉시 실행

**지금 바로 전역 설정을 적용해보세요:**

1. **Ctrl+Shift+P** → "Preferences: Open Settings (JSON)"
2. 위 JSON 내용 복사해서 붙여넣기
3. 저장

**이제 모든 프로젝트에서 자동 허용이 적용됩니다!** 🚀
