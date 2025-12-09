const { contextBridge, ipcRenderer } = require('electron');

// 보안을 위한 API 브릿지
contextBridge.exposeInMainWorld('electronAPI', {
  // 인증 관련
  login: (loginData) => ipcRenderer.invoke('auth-login', loginData),
  register: (registerData) => ipcRenderer.invoke('auth-register', registerData),
  
  // Google Drive 연결
  connectGoogleDrive: () => ipcRenderer.invoke('connect-google-drive'),

  // Window Controls
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),
  
  // 앱 정보
  getVersion: () => process.versions.electron,
  getPlatform: () => process.platform,
  
  // 파일 시스템 (필요시 추가)
  // readFile: (filePath) => ipcRenderer.invoke('fs-read-file', filePath),
  // writeFile: (filePath, data) => ipcRenderer.invoke('fs-write-file', filePath, data),
});

// 개발 모드에서만 콘솔 로그 활성화
if (process.env.NODE_ENV === 'development') {
  window.addEventListener('DOMContentLoaded', () => {
    console.log('Electron Preload: 더죤환경기술(주) 기술진단팀 협업 시스템');
    console.log('Electron Version:', process.versions.electron);
    console.log('Node Version:', process.versions.node);
    console.log('Chrome Version:', process.versions.chrome);
  });
}