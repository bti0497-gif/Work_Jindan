const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// 개발 모드인지 확인
const isDev = process.env.NODE_ENV !== 'production';

let nextServer = null;

function startNextServer() {
  return new Promise((resolve, reject) => {
    // Next.js 개발 서버를 시작합니다
    const nextProcess = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..'),
      shell: true,
      env: { ...process.env, BROWSER: 'none' }
    });

    nextProcess.stdout.on('data', (data) => {
      console.log(`Next.js: ${data}`);
      // "Ready" 또는 "Local:" 메시지가 나오면 서버 준비 완료
      if (data.toString().includes('Ready') || data.toString().includes('Local:')) {
        setTimeout(() => resolve(), 2000); // 2초 추가 대기
      }
    });

    nextProcess.stderr.on('data', (data) => {
      console.error(`Next.js Error: ${data}`);
    });

    nextProcess.on('close', (code) => {
      console.log(`Next.js 프로세스 종료 코드: ${code}`);
    });

    nextServer = nextProcess;
    
    // 10초 후에도 Ready 메시지가 없으면 강제로 resolve
    setTimeout(() => resolve(), 10000);
  });
}

function createWindow() {
  // BrowserWindow를 생성합니다.
  const mainWindow = new BrowserWindow({
    frame: false, // 기본 프레임 제거
    resizable: false, // 크기 조절 비활성화
    show: false, // 처음엔 숨김
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // 보안을 위해 nodeIntegration과 contextIsolation의 기본값을 유지합니다.
      nodeIntegration: false,
      contextIsolation: true,
      // 개발 모드에서만 devTools 활성화
      devTools: isDev,
    },
  });

  // CSP 헤더 설정 (개발 모드)
  if (isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* data: blob:; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https://t1.daumcdn.net; " +
            "style-src 'self' 'unsafe-inline' http://localhost:* https://fonts.googleapis.com; " +
            "img-src 'self' data: blob: http://localhost:*; " +
            "font-src 'self' data: https://fonts.gstatic.com; " +
            "frame-src 'self' http://localhost:* https://postcode.map.daum.net; " +
            "connect-src 'self' http://localhost:* ws://localhost:* https://firestore.googleapis.com https://identitytoolkit.googleapis.com;"
          ]
        }
      });
    });
  }

  // 창이 준비되면 최대화하고 보여줍니다.
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Next.js 서버 URL을 로드합니다.
  const startUrl = 'http://localhost:3000';
  
  mainWindow.loadURL(startUrl);

  // 개발자 도구를 엽니다 (디버깅용).
  mainWindow.webContents.openDevTools();

  // IPC 핸들러 설정
  ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    mainWindow.close();
  });
}

// Electron 앱이 준비되면 창을 생성합니다.
app.whenReady().then(async () => {
  // 개발 서버가 이미 실행 중인지 확인
  const http = require('http');
  const checkServer = () => {
    return new Promise((resolve) => {
      http.get('http://localhost:3000', (res) => {
        resolve(true);
      }).on('error', () => {
        resolve(false);
      });
    });
  };

  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    // 서버가 실행 중이 아니면 시작
    console.log('Starting Next.js server...');
    await startNextServer();
    console.log('Next.js server started.');
  } else {
    console.log('Next.js server already running.');
  }
  
  console.log('Creating window...');
  createWindow();

  app.on('activate', () => {
    // macOS에서 Dock 아이콘을 클릭했을 때 창이 없으면 새로 생성합니다.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 모든 창이 닫혔을 때 앱을 종료합니다 (macOS 제외).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (nextServer) {
      nextServer.kill();
    }
    app.quit();
  }
});
