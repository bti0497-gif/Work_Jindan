import React, { useState, useRef } from 'react';
import {
    Send,
    Paperclip,
    X,
    Image as ImageIcon,
    File as FileIcon,
    Loader2
} from 'lucide-react';
import { saveJsonData, uploadResource } from '../services/dataService';

const BoardWrite = ({ menuName, onCancel, onSaveSuccess }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);

    // 파일 선택 핸들러
    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        setAttachments(prev => [...prev, ...selectedFiles]);
    };

    // 첨부 파일 제거
    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    // 저장 실행
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return alert('제목과 내용을 입력해 주세요.');

        try {
            setIsSubmitting(true);

            // 1. 첨부파일 먼저 업로드
            const uploadedFiles = [];
            for (const file of attachments) {
                const result = await uploadResource(file);
                uploadedFiles.push({
                    id: result.id,
                    name: file.name,
                    size: file.size,
                    mimeType: file.mimeType
                });
            }

            // 2. 게시글 데이터(JSON) 생성
            const postData = {
                id: crypto.randomUUID(),
                title,
                content,
                author: '홍길동 차장', // 추후 사용자 정보 연동
                createdAt: new Date().toISOString(),
                attachments: uploadedFiles,
                menu: menuName
            };

            // 3. 구글 드라이브에 JSON 저장
            await saveJsonData(menuName, postData);

            alert('게시글이 성공적으로 등록되었습니다.');
            if (onSaveSuccess) onSaveSuccess();
        } catch (err) {
            alert(`등록 실패: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="board-write-container">
            <div className="write-header">
                <h2>{menuName} - 글쓰기</h2>
                <button className="cancel-btn" onClick={onCancel}>취소</button>
            </div>

            <form className="write-form" onSubmit={handleSubmit}>
                <div className="form-group">
                    <input
                        type="text"
                        placeholder="제목을 입력하세요"
                        className="title-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                    />
                </div>

                <div className="form-group">
                    <textarea
                        placeholder="내용을 입력하세요..."
                        className="content-textarea"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        required
                    ></textarea>
                </div>

                {/* 첨부파일 목록 */}
                {attachments.length > 0 && (
                    <div className="attachment-list">
                        {attachments.map((file, idx) => (
                            <div key={idx} className="attachment-item">
                                <FileIcon size={14} />
                                <span className="file-name">{file.name}</span>
                                <button type="button" className="remove-file" onClick={() => removeAttachment(idx)}>
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="write-footer">
                    <div className="toolbar">
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            multiple
                            onChange={handleFileChange}
                        />
                        <button type="button" className="tool-btn" onClick={() => fileInputRef.current?.click()}>
                            <Paperclip size={18} />
                            <span>파일 첨부</span>
                        </button>
                        <button type="button" className="tool-btn">
                            <ImageIcon size={18} />
                            <span>최근 이미지</span>
                        </button>
                    </div>

                    <button type="submit" className="submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <><Loader2 size={16} className="spin" /> 저장 중...</>
                        ) : (
                            <><Send size={16} /> 게시하기</>
                        )}
                    </button>
                </div>
            </form>

            <style dangerouslySetInnerHTML={{
                __html: `
                .board-write-container {
                    padding: 30px;
                    max-width: 900px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                }
                .write-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                    padding-bottom: 16px;
                    border-bottom: 1px solid #f1f5f9;
                }
                .write-header h2 { font-size: 20px; font-weight: 700; color: #1e293b; }
                .cancel-btn { background: #f1f5f9; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; color: #64748b; font-weight: 500; }
                
                .write-form { display: flex; flex-direction: column; gap: 20px; }
                .title-input { width: 100%; padding: 12px 0; font-size: 24px; font-weight: 600; border: none; border-bottom: 2px solid #f1f5f9; outline: none; transition: border-color 0.2s; }
                .title-input:focus { border-color: #3b82f6; }
                
                .content-textarea { width: 100%; min-height: 300px; padding: 10px 0; font-size: 16px; line-height: 1.6; border: none; resize: none; outline: none; color: #334155; }
                
                .attachment-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px dashed #e2e8f0; }
                .attachment-item { display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: white; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 12px; color: #475569; }
                .remove-file { background: none; border: none; padding: 2px; cursor: pointer; color: #94a3b8; display: flex; align-items: center; }
                .remove-file:hover { color: #ef4444; }

                .write-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 20px; border-top: 1px solid #f1f5f9; }
                .toolbar { display: flex; gap: 12px; }
                .tool-btn { display: flex; align-items: center; gap: 8px; background: none; border: 1px solid #e2e8f0; padding: 8px 14px; border-radius: 8px; color: #475569; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
                .tool-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
                
                .submit-btn { display: flex; align-items: center; gap: 8px; background: #3b82f6; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
                .submit-btn:hover { background: #2563eb; }
                .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
                
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}} />
        </div>
    );
};

export default BoardWrite;
