
import React from 'react';
import { AlertCircle, CheckCircle, HelpCircle, X } from 'lucide-react';

/**
 * 전역 모달 컴포넌트 (Alert & Confirm 대체)
 * @param {boolean} isOpen 모달 열림 여부
 * @param {string} type 'alert' | 'confirm' | 'success' | 'error'
 * @param {string} title 모달 제목
 * @param {string} message 모달 본문
 * @param {function} onConfirm 확인 버튼 클릭 시 콜백
 * @param {function} onCancel 취소 버튼 클릭 시 콜백 (confirm 전용)
 * @param {string} confirmText 확인 버튼 텍스트
 * @param {string} cancelText 취소 버튼 텍스트
 */
const GlobalModal = ({
    isOpen,
    type = 'alert',
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = '확인',
    cancelText = '취소',
    inputValue = '',
    onInputChange
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircle size={28} className="text-green-500" />;
            case 'error':
                return <AlertCircle size={28} className="text-red-500" />;
            case 'confirm':
            case 'prompt':
                return <HelpCircle size={28} className="text-blue-500" />;
            default:
                return <AlertCircle size={28} className="text-blue-500" />;
        }
    };

    return (
        <div className="global-modal-overlay">
            <div className="global-modal-content">
                <div className="global-modal-body">
                    <div className="global-modal-icon">
                        {getIcon()}
                    </div>
                    {title && <h2 className="global-modal-title">{title}</h2>}
                    <p className="global-modal-message">{message}</p>
                    {type === 'prompt' && <input
                        className="global-modal-input"
                        aria-label="새 폴더 이름"
                        value={inputValue}
                        autoFocus
                        onChange={event => onInputChange?.(event.target.value)}
                        onKeyDown={event => {
                            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                            if (event.key === 'Enter') onConfirm();
                            if (event.key === 'Escape') onCancel?.();
                        }}
                    />}
                </div>
                <div className="global-modal-footer">
                    {(type === 'confirm' || type === 'prompt') && (
                        <button className="global-modal-btn cancel" onClick={onCancel}>
                            {cancelText}
                        </button>
                    )}
                    <button className="global-modal-btn confirm" onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .global-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.3);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    animation: fadeIn 0.2s ease-out;
                }
                .global-modal-content {
                    background: #fff;
                    width: 280px;
                    border-radius: 16px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    overflow: hidden;
                    animation: slideUp 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
                    border: 1px solid #e2e8f0;
                }
                .global-modal-body {
                    padding: 24px 20px 16px 20px;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                }
                .global-modal-icon {
                    margin-bottom: 4px;
                }
                .global-modal-title {
                    font-size: 16px;
                    font-weight: 800;
                    color: #1e293b;
                    margin: 0;
                }
                .global-modal-message {
                    font-size: 13px;
                    font-weight: 500;
                    color: #64748b;
                    line-height: 1.5;
                    white-space: pre-wrap;
                }
                .global-modal-input {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 6px 12px;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 13px;
                    color: #1e293b;
                    background: #ffffff;
                    outline: none;
                    transition: all 0.2s;
                }
                .global-modal-input::placeholder {
                    color: #94a3b8;
                }
                .global-modal-input:focus {
                    border-color: #3b82f6;
                }
                .global-modal-footer {
                    padding: 0 20px 20px 20px;
                    display: flex;
                    gap: 8px;
                }
                .global-modal-btn {
                    flex: 1;
                    padding: 10px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }
                .global-modal-btn.confirm {
                    background: #1e293b;
                    color: #fff;
                }
                .global-modal-btn.confirm:hover {
                    background: #334155;
                }
                .global-modal-btn.cancel {
                    background: #f1f5f9;
                    color: #64748b;
                    border: 1px solid #e2e8f0;
                }
                .global-modal-btn.cancel:hover {
                    background: #e2e8f0;
                }
                
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            ` }} />
        </div>
    );
};

export default GlobalModal;
