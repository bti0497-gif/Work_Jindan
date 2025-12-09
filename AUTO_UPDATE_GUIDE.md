# 자동 업데이트 시스템 사용 가이드

## 🔄 **자동 업데이트 플로우**

### 📱 **사용자 관점 (앱 실행 시)**

1. **앱 아이콘 더블클릭** 
   ```
   로딩 중... → Google Drive 연결 확인 → 버전 체크
   ```

2. **새 버전 발견 시**
   ```
   🎉 새로운 버전이 있습니다! (v1.1.0)
   
   현재 버전: v1.0.0
   최신 버전: v1.1.0
   
   🎉 드디어 공정관리 시스템이 출시됩니다!
   📊 Gantt 차트, 🔄 작업 의존성, 📈 진척률 모니터링 기능이 추가됩니다.
   
   📋 새로운 기능:
   • Gantt 차트 공정관리
   • 작업 의존성 설정
   • 실시간 진척률 모니터링
   • 지연 알림 시스템
   
   📅 릴리스 날짜: 2024년 12월 15일
   
   💡 선택적 업데이트입니다.
   
   [지금 업데이트] [나중에] [이 버전 건너뛰기]
   ```

3. **"지금 업데이트" 선택 시**
   ```
   업데이트 진행 중...
   새 버전을 다운로드하고 설치하는 중입니다...
   완료 후 앱이 자동으로 재시작됩니다.
   
   ↓
   
   업데이트 완료!
   앱을 재시작합니다.
   
   ↓
   
   [새 버전으로 로그인 화면]
   ```

---

## 🛠️ **관리자 관점 (버전 배포)**

### 📤 **새 버전 배포 프로세스**

1. **개발 완료 후 버전 업로드**
   ```bash
   npm run version:minor    # 1.0.0 → 1.1.0
   # 또는
   npm run upload-version   # 수동 업로드
   ```

2. **버전 정보 입력**
   ```
   새 버전 번호: 1.1.0
   버전 설명: 공정관리 시스템 출시
   새 기능들: Gantt 차트, 작업 의존성, 진척률 모니터링
   다운로드 URL: (선택사항)
   필수 업데이트: N
   ```

3. **Google Drive 업로드**
   ```
   JindanTeam_Updates/
   └── version-info.json  ← 자동 업데이트됨
   ```

---

## 📂 **Google Drive 구조**

```
Google Drive 루트/
├── JindanTeam_Database/     # 협업 데이터
│   ├── users.json
│   ├── projects.json
│   └── ... (업무 데이터)
│
└── JindanTeam_Updates/      # 업데이트 관리
    ├── version-info.json    # 최신 버전 정보
    └── releases/            # 배포 파일들 (선택사항)
        ├── v1.0.0/
        ├── v1.1.0/
        └── ...
```

---

## 🔍 **버전 체크 상세 로직**

### 1. **앱 시작 시 (main.js)**
```javascript
app.whenReady() → checkForUpdates()
```

### 2. **업데이트 확인 프로세스**
```javascript
1. Google Drive 연결 확인
2. JindanTeam_Updates 폴더 접근
3. version-info.json 파일 확인
   - 없으면 → 현재 버전으로 초기 파일 생성
   - 있으면 → 버전 비교 (현재 vs 최신)
4. 새 버전 있으면 → 업데이트 대화상자 표시
5. 사용자 선택에 따라 → 다운로드/설치/재시작
```

### 3. **version-info.json 구조**
```json
{
  "version": "1.1.0",
  "releaseDate": "2024-12-15T00:00:00.000Z",
  "description": "공정관리 시스템 출시",
  "features": [
    "Gantt 차트 공정관리",
    "작업 의존성 설정", 
    "실시간 진척률 모니터링",
    "지연 알림 시스템"
  ],
  "downloadUrl": null,
  "mandatory": false,
  "previousVersion": "1.0.0",
  "uploadedBy": "admin",
  "uploadDate": "2024-12-15T00:00:00.000Z"
}
```

---

## 🎯 **특별 기능**

### 🎉 **공정관리 출시 예고**
- v1.1.0 업데이트 시 특별 메시지 표시
- 새 기능 하이라이트
- 사용자 기대감 조성

### ⚠️ **필수 업데이트**
- `mandatory: true` 설정 시
- "나중에", "건너뛰기" 버튼 비활성화
- 강제 업데이트 진행

### 🔄 **스마트 알림**
- 건너뛴 버전 기억
- 중복 알림 방지
- 사용자 선택 존중

---

## 🚀 **배포 명령어 요약**

```bash
# 개발 환경
npm run dev              # Next.js 개발 서버
npm run electron         # Electron 앱 실행

# 버전 관리
npm run version:patch    # 버그 수정 (1.0.0 → 1.0.1)
npm run version:minor    # 기능 추가 (1.0.0 → 1.1.0)
npm run version:major    # 주요 변경 (1.0.0 → 2.0.0)

# 배포
npm run build           # Next.js 빌드
npm run dist            # EXE 파일 생성
npm run upload-version  # 버전 정보 업로드
npm run release         # 전체 릴리즈 프로세스
```

---

*이제 완벽한 자동 업데이트 시스템이 구축되었습니다! 🎉*