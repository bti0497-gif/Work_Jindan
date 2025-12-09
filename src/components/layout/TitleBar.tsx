'use client';

import { Minimize, X } from 'lucide-react';
import Image from 'next/image';

const TitleBar = () => {
  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <header className="title-bar">
      <div className="title-bar-drag-region">
        <div className="title-bar-logo">
          <Image src="/file.svg" alt="App Logo" width={18} height={18} />
          <span className="title-bar-title">더죤환경기술 기술진단팀</span>
        </div>
      </div>
      <div className="title-bar-controls">
        <button onClick={handleMinimize} className="title-bar-button">
          <Minimize size={16} />
        </button>
        <button onClick={handleClose} className="title-bar-button close-button">
          <X size={16} />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
