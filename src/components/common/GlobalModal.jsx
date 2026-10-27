
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
                return <CheckCircle size={40} className="text-green-500" />;
            case 'error':
                return <AlertCircle size={40} className="text-red-500" />;
            case 'confirm':
                return <HelpCircle size={40} className="text-blue-500" />;
            default:
                return <AlertCircle size={40} className="text-blue-500" />;
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
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    animation: fadeIn 0.2s ease-out;
                }
                .global-modal-content {
                    background: #fff;
                    width: 90%;
                    max-width: 360px;
                    border-radius: 24px;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
                    overflow: hidden;
                    animation: slideUp 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
                }
                .global-modal-body {
                    padding: 32px 24px 24px 24px;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                }
                .global-modal-icon {
                    margin-bottom: 8px;
                }
                .global-modal-title {
                    font-size: 18px;
                    font-weight: 800;
                    color: #1e293b;
                    margin: 0;
                }
                .global-modal-message {
                    font-size: 14px;
                    font-weight: 500;
                    color: #64748b;
                    line-height: 1.6;
                    white-space: pre-wrap;
                }
                .global-modal-footer {
                    padding: 16px 24px 24px 24px;
                    display: flex;
                    gap: 12px;
                }
                .global-modal-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #93c5fd; border-radius: 6px; color: #1e293b; font: inherit; }
                .global-modal-btn {
                    flex: 1;
                    padding: 12px;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }
                .global-modal-btn.confirm {
                    background: #3b82f6;
                    color: #fff;
                }
                .global-modal-btn.confirm:hover {
                    background: #2563eb;
                    transform: translateY(-1px);
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
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            ` }} />
        </div>
    );
};

export default GlobalModal;
