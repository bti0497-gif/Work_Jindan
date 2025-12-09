'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';

interface NewLoginFormProps {
  onRegisterClick: () => void;
}

export default function NewLoginForm({ onRegisterClick }: NewLoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'login' | 'forgotPassword'>('login');
  const [forgotIdentifier, setForgotIdentifier] = useState('');

  useEffect(() => {
    const savedUsername = localStorage.getItem('savedUsername');
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      alert("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }

    setLoading(true);

    if (rememberMe) {
      localStorage.setItem('savedUsername', username);
    } else {
      localStorage.removeItem('savedUsername');
    }

    try {
      const result = await signIn('credentials', {
        email: username, // We pass username as 'email' field to next-auth
        password: password,
        redirect: false,
      });

      if (result?.error) {
        alert('로그인 실패: 아이디 또는 비밀번호를 확인해주세요.');
      } else {
        // Login success, page will reload or redirect handled by parent/session
      }
    } catch (error) {
      alert('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      alert('아이디 또는 이메일을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(data.message);
        setView('login');
        setForgotIdentifier('');
      } else {
        alert(data.message || '오류가 발생했습니다.');
      }
    } catch (error) {
      alert('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style jsx>{`
        /* Google Fonts - Noto Sans KR */
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

        :root {
            --primary-color: #007bff; /* Bright Blue */
            --primary-dark-color: #0056b3;
            --background-color: #f0f2f5; /* Light Gray Background */
            --card-background-color: #ffffff; /* White Card */
            --text-color: #333333; /* Dark Gray Text */
            --input-background-color: #f8f9fa; /* Very Light Gray Input */
            --input-border-color: #ced4da; /* Light Gray Border */
            --link-color: #007bff; /* Bright Blue Link */
            --button-hover-bg: #0069d9;
            --button-active-bg: #0056b3;
            --shadow-color: rgba(0, 0, 0, 0.08);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        .login-container {
            background-color: #ffffff;
            padding: 30px; /* Reduced padding */
            border-radius: 10px; /* Slightly reduced border-radius */
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08); /* Lighter shadow */
            width: 100%;
            max-width: 380px; /* Reduced max-width */
            text-align: center;
            border: 1px solid #e0e0e0; /* Subtle border */
            animation: fadeIn 0.6s ease-out; /* Slightly faster animation */
            font-family: 'Noto Sans KR', sans-serif;
            color: #333333;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-15px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .login-header {
            margin-bottom: 25px; /* Reduced margin */
            color: #007bff;
            font-size: 1.5em; /* Reduced font size */
            font-weight: 700;
            letter-spacing: -0.5px;
            line-height: 1.3; /* Added line-height for better readability with <br> */
        }

        .input-group {
            margin-bottom: 15px; /* Reduced margin */
            text-align: left;
        }

        .input-group label {
            display: block;
            margin-bottom: 6px; /* Reduced margin */
            color: #333333;
            font-size: 0.9em; /* Reduced font size */
            font-weight: 500;
        }

        .input-group input[type="text"],
        .input-group input[type="password"],
        .input-group input[type="email"] {
            width: 100%;
            padding: 10px 12px; /* Reduced padding */
            border: 1px solid #ced4da;
            border-radius: 6px; /* Reduced border-radius */
            background-color: #f8f9fa;
            color: #333333;
            font-size: 1em; /* Reduced font size */
            outline: none;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .input-group input[type="text"]:focus,
        .input-group input[type="password"]:focus,
        .input-group input[type="email"]:focus {
            border-color: #007bff;
            box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25); /* Lighter focus shadow */
        }

        /* Placeholder styles */
        .input-group input::placeholder {
            color: #888;
            opacity: 0.8;
        }

        .options-group {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px; /* Reduced margin */
            font-size: 0.85em; /* Reduced font size */
        }
        
        /* New: Group for links on the right */
        .links-group {
            display: flex;
            gap: 15px; /* Space between links */
        }

        .remember-me {
            display: flex;
            align-items: center;
        }

        .remember-me input[type="checkbox"] {
            margin-right: 6px; /* Reduced margin */
            width: 16px; /* Reduced size */
            height: 16px; /* Reduced size */
            accent-color: #007bff;
            cursor: pointer;
        }

        .remember-me label {
            color: #333333;
            cursor: pointer;
        }

        .action-link { /* Unified style for all action links */
            color: #007bff;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.3s ease, text-decoration 0.3s ease;
            cursor: pointer;
            background: none;
            border: none;
            padding: 0;
            font-family: inherit;
            font-size: inherit;
        }

        .action-link:hover {
            color: #0056b3;
            text-decoration: underline;
        }

        #loginButton, #sendTempPwButton {
            width: 100%;
            padding: 12px 18px; /* Reduced padding */
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 6px; /* Reduced border-radius */
            font-size: 1.1em; /* Reduced font size */
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1); /* Lighter shadow */
        }

        #loginButton:hover, #sendTempPwButton:hover {
            background-color: #0069d9;
            transform: translateY(-1px); /* More subtle hover effect */
        }

        #loginButton:active, #sendTempPwButton:active {
            background-color: #0056b3;
            transform: translateY(0);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        
        #loginButton:disabled, #sendTempPwButton:disabled {
            background-color: #ccc;
            cursor: not-allowed;
            transform: none;
        }

        .back-button {
            margin-top: 15px;
            background: none;
            border: none;
            color: #6c757d;
            cursor: pointer;
            font-size: 0.9em;
            text-decoration: underline;
        }
      `}</style>

      <div id="loginContainer" className="login-container">
        <h2 id="loginHeader" className="login-header">더죤환경기술(주) 기술진단팀<br />협업시스템 로그인</h2>

        {view === 'login' ? (
          <form id="loginForm" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="usernameInput">아이디</label>
              <input 
                type="text" 
                id="usernameInput" 
                placeholder="사용자 아이디를 입력하세요" 
                required 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label htmlFor="passwordInput">비밀번호</label>
              <input 
                type="password" 
                id="passwordInput" 
                placeholder="비밀번호를 입력하세요" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="options-group">
              <div className="remember-me">
                <input 
                  type="checkbox" 
                  id="rememberMeCheckbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="rememberMeCheckbox">아이디 저장</label>
              </div>
              <div className="links-group">
                <button type="button" id="forgotPasswordLink" className="action-link" onClick={() => setView('forgotPassword')}>비밀번호 찾기</button>
                <button type="button" id="registerLink" className="action-link" onClick={onRegisterClick}>회원가입</button>
              </div>
            </div>

            <button type="submit" id="loginButton" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        ) : (
          <form id="forgotPasswordForm" onSubmit={handleForgotPassword}>
            <div style={{marginBottom: '20px', textAlign: 'left', fontSize: '0.95em', color: '#555'}}>
              가입 시 등록한 아이디 또는 이메일을 입력하시면<br/>
              임시 비밀번호를 이메일로 발송해 드립니다.
            </div>
            
            <div className="input-group">
              <label htmlFor="forgotIdentifierInput">아이디 또는 이메일</label>
              <input 
                type="text" 
                id="forgotIdentifierInput" 
                placeholder="아이디 또는 이메일 입력" 
                required 
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
              />
            </div>

            <button type="submit" id="sendTempPwButton" disabled={loading}>
              {loading ? '전송 중...' : '임시 비밀번호 발송'}
            </button>

            <button type="button" className="back-button" onClick={() => setView('login')}>
              로그인 화면으로 돌아가기
            </button>
          </form>
        )}
      </div>
    </>
  );
}
