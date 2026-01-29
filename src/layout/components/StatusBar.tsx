'use client';

import { useEffect, useState } from 'react';

const StatusBar = () => {
  const [connectionTime, setConnectionTime] = useState('');

  useEffect(() => {
    setConnectionTime(new Date().toLocaleString('ko-KR'));
  }, []);

  return (
    <footer className="status-bar">
      <div className="status-bar-item">
        <span>접속 시간: {connectionTime}</span>
      </div>
    </footer>
  );
};

export default StatusBar;
