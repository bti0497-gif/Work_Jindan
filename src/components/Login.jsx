import React, { useState, useEffect } from 'react';
import { Lock, User, CheckCircle, XCircle } from 'lucide-react';

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
            <div className="login-full-screen">
                <div className="login-card-panel">
                    <div className="login-header-area">
                        <div className="login-icon-circle">
                            <Lock size={28} className="text-white" />
                        </div>
                        <h1 className="login-main-title">협업 스튜디오 로그인</h1>
                        <p className="login-sub-title">안전한 서비스 이용을 위해 로그인해 주세요.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form-box" autoComplete="off">
                        <div className="input-group-field">
                            <label className="input-label-text">아이디</label>
                            <div className="input-with-icon">
                                <User className="field-icon-left" size={18} />
                                <input
                                    type="text"
                                    value={id}
                                    onChange={(e) => setId(e.target.value)}
                                    placeholder="아이디 입력"
                                    required
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <div className="input-group-field">
                            <label className="input-label-text">패스워드</label>
                            <div className="input-with-icon">
                                <Lock className="field-icon-left" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="비밀번호 입력"
                                    required
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>

                        <div className="login-options-row">
                            <label className="remember-id-checkbox">
                                <input
                                    type="checkbox"
                                    checked={rememberId}
                                    onChange={(e) => setRememberId(e.target.checked)}
                                />
                                <div className={`custom-chk ${rememberId ? 'checked' : ''}`}>
                                    {rememberId && <CheckCircle size={14} />}
                                </div>
                            <span>아이디 저장</span>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="login-submit-btn"
                        >
                            {isLoading ? '로그인 처리 중...' : '로그인'}
                        </button>
                    </form>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .login-full-screen {
                    width: 100%;
                    height: 100%;
                    background: #f8fafc;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .login-card-panel {
                    width: 420px;
                    background: #fff;
                    padding: 40px;
                    border-radius: 24px;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05);
                    border: 1px solid #f1f5f9;
                }
                .login-header-area {
                    text-align: center;
                    margin-bottom: 35px;
                }
                .login-icon-circle {
                    width: 56px;
                    height: 56px;
                    background: #3b82f6;
                    border-radius: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 16px auto;
                    box-shadow: 0 8px 16px -4px rgba(59, 130, 246, 0.4);
                }
                .login-main-title {
                    font-size: 22px;
                    font-weight: 800;
                    color: #0f172a;
                    margin-bottom: 8px;
                }
                .login-sub-title {
                    font-size: 14px;
                    color: #94a3b8;
                }

                .login-form-box {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .input-group-field {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .input-label-text {
                    font-size: 13px;
                    font-weight: 700;
                    color: #475569;
                    margin-left: 4px;
                }
                .input-with-icon {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .field-icon-left {
                    position: absolute;
                    left: 14px;
                    color: #cbd5e1;
                }
                .input-with-icon input {
                    width: 100%;
                    padding: 12px 14px 12px 42px;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 12px;
                    font-size: 14px;
                    outline: none;
                    transition: all 0.2s;
                    background: #fdfdfd;
                }
                .input-with-icon input:focus {
                    border-color: #3b82f6;
                    background: #fff;
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.05);
                }

                .login-options-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0 4px;
                }
                .remember-id-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    color: #64748b;
                    font-weight: 500;
                }
                .remember-id-checkbox input { display: none; }
                .custom-chk {
                    width: 18px;
                    height: 18px;
                    border: 1.5px solid #cbd5e1;
                    border-radius: 5px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .custom-chk.checked {
                    background: #3b82f6;
                    border-color: #3b82f6;
                    color: #fff;
                }

                .login-submit-btn {
                    width: 100%;
                    padding: 14px;
                    background: #0f172a;
                    color: #fff;
                    border: none;
                    border-radius: 12px;
                    font-weight: 700;
                    font-size: 15px;
                    cursor: pointer;
                    margin-top: 10px;
                    transition: all 0.2s;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                }
                .login-submit-btn:hover { background: #1e293b; transform: translateY(-1px); }
                .login-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
            ` }} />
        </>
    );
};

export default Login;
