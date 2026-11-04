import React, { useState, useEffect } from 'react';
import { Lock, User, CheckCircle } from 'lucide-react';

const Login = ({ onLoginSuccess, showAlert }) => {
    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [rememberId, setRememberId] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const savedId = localStorage.getItem('savedUserId');
        if (savedId) {
            setId(savedId);
            setRememberId(true);
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { login } = await import('../services/authService');
            const user = await login(id, password);

            if (rememberId) {
                localStorage.setItem('savedUserId', id);
            } else {
                localStorage.removeItem('savedUserId');
            }

            onLoginSuccess(user);
        } catch (err) {
            showAlert(err.message || '로그인 중 오류가 발생했습니다.', '로그인 실패', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="login-container">
                <div className="login-compact-card">
                    <form onSubmit={handleSubmit} className="login-layout">
                        {/* Left Side: Inputs */}
                        <div className="login-inputs-area">
                            <div className="input-row">
                                <User size={14} className="input-icon" />
                                <input
                                    type="text"
                                    value={id}
                                    onChange={(e) => setId(e.target.value)}
                                    placeholder="ID"
                                    aria-label="아이디"
                                    required
                                />
                            </div>
                            <div className="input-row">
                                <Lock size={14} className="input-icon" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="PW"
                                    aria-label="비밀번호"
                                    required
                                />
                            </div>
                            <label className="remember-box">
                                <input
                                    type="checkbox"
                                    checked={rememberId}
                                    onChange={(e) => setRememberId(e.target.checked)}
                                />
                                <div className={`custom-chk ${rememberId ? 'checked' : ''}`}>
                                    {rememberId && <CheckCircle size={10} />}
                                </div>
                                <span>아이디 저장</span>
                            </label>
                        </div>

                        {/* Right Side: Button */}
                        <div className="login-button-area">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="login-btn-large"
                            >
                                {isLoading ? '...' : '로그인'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .login-container {
                    width: 100%;
                    height: 100%;
                    background: #f1f5f9;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .login-compact-card {
                    width: 320px;
                    background: white;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                    border: 1px solid #e2e8f0;
                }

                .login-layout {
                    display: flex;
                    gap: 12px;
                    align-items: stretch;
                }

                .login-inputs-area {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .input-row {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .input-icon {
                    position: absolute;
                    left: 10px;
                    color: #94a3b8;
                }

                .input-row input {
                    width: 100%;
                    padding: 8px 10px 8px 30px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    font-size: 13px;
                    outline: none;
                    transition: border 0.2s;
                    background: #f8fafc;
                }

                .input-row input:focus {
                    border-color: #3b82f6;
                    background: white;
                }

                .remember-box {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                    font-size: 11px;
                    color: #64748b;
                    margin-top: 2px;
                }

                .remember-box input { display: none; }

                .custom-chk {
                    width: 14px;
                    height: 14px;
                    border: 1px solid #cbd5e1;
                    border-radius: 3px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .custom-chk.checked {
                    background: #3b82f6;
                    border-color: #3b82f6;
                    color: white;
                }

                .login-button-area {
                    width: 90px;
                    display: flex;
                }

                .login-btn-large {
                    width: 100%;
                    background: #1e293b;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 700;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .login-btn-large:hover {
                    background: #334155;
                }

                .login-btn-large:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            ` }} />
        </>
    );
};

export default Login;
