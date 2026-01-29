export {}; // This makes the file a module, which is sometimes necessary for global augmentations

declare global {
  interface Window {
    electronAPI: {
      login: (loginData: any) => Promise<any>;
      register: (registerData: any) => Promise<any>;
      connectGoogleDrive: () => Promise<any>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      getVersion: () => string;
      getPlatform: () => string;
    };
  }
}
