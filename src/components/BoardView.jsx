import { useState, useEffect } from 'react';
import { ArrowLeft, User, Clock, Paperclip, Download, Trash2, Edit, MessageSquare, Send, FileText as FileIcon } from 'lucide-react';
import { downloadFile } from '../services/driveService';
import { firebaseBoardService } from '../services/firebaseBoardService';
import { canEditPost } from '../services/boardModel';
import DOMPurify from 'dompurify';

const BoardView = ({ post: initialPost, boardUser, onBack, onEdit, onDeleteSuccess, showAlert, showConfirm }) => {
    const [post, setPost] = useState(initialPost);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!initialPost?.id) return;
        const failed = err => { setError(err.message); setPost(null); };
        const stopPost = firebaseBoardService.watchPost(initialPost.id, setPost, failed);
        const stopComments = firebaseBoardService.watchComments(initialPost.id, setComments, failed);
        return () => { stopPost(); stopComments(); };
    }, [initialPost?.id]);

    const isAuthor = post && canEditPost(post, boardUser);
    const handleDelete = async () => {
        if (!await showConfirm('이 게시글을 삭제하시겠습니까?')) return;
        try {
            setIsSubmitting(true);
            await firebaseBoardService.remove(post.id);
            onDeleteSuccess?.();
            await showAlert('게시글이 삭제되었습니다.', '성공', 'success');
        } catch (err) { await showAlert(`삭제 실패: ${err.message}`, '오류', 'error'); }
        finally { setIsSubmitting(false); }
    };
    const handleDownload = async file => {
        try { await downloadFile(file.id, file.name); }
        catch (err) { await showAlert(`다운로드 실패: ${err.message}`, '오류', 'error'); }
    };
    const handleCommentSubmit = async event => {
        event.preventDefault();
        if (!newComment.trim() || isSubmitting) return;
        try {
            setIsSubmitting(true);
            await firebaseBoardService.comment(post.id, newComment);
            setNewComment('');
        } catch (err) { await showAlert(`댓글 등록 실패: ${err.message}`, '오류', 'error'); }
        finally { setIsSubmitting(false); }
    };
    if (!post || error) return <div className="status-container error">
        <p>{error || '게시글이 삭제되었거나 존재하지 않습니다.'}</p>
        <button onClick={onBack}>목록으로 돌아가기</button>
    </div>;

    return (
        <div className="board-view-container">
            {/* Header: Navigation & Actions */}
            <div className="view-nav-header">
                <button className="back-btn" onClick={onBack}>
                    <ArrowLeft size={18} />
                    <span>목록</span>
                </button>
                {isAuthor && (
                    <div className="view-actions">
                        <button className="action-btn-text" onClick={() => onEdit(post)}>
                            <Edit size={14} />
                            <span>수정</span>
                        </button>
                        <button className="action-btn-text delete" disabled={isSubmitting} onClick={handleDelete}>
                            <Trash2 size={14} />
                            <span>삭제</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Content Body */}
            <div className="view-main-content">
                <div className="post-header-info">
                    <h1 className="post-title-text">{post.title}</h1>
                    <div className="post-metadata-row">
                        <span className="meta-item"><User size={12} /> {post.author}</span>
                        <span className="meta-item"><Clock size={12} /> {new Date(post.createdAt || '').toLocaleString('ko-KR')}</span>
                    </div>
                </div>

                <div className="post-body-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content) }} />

                {/* Attachments Section */}
                {post.attachments?.length > 0 && (
                    <div className="view-attachments-section">
                        <div className="attach-title">
                            <Paperclip size={14} />
                            <span>첨부파일 <strong>{post.attachments.length}</strong></span>
                        </div>
                        <div className="attach-grid">
                            {post.attachments.map((file, idx) => (
                                <div key={idx} className="attach-file-card" onClick={() => handleDownload(file)}>
                                    <div className="file-icon-box">
                                        <FileIcon size={20} className="text-blue-500" />
                                    </div>
                                    <div className="file-info-box">
                                        <span className="file-name-text">{file.name}</span>
                                        <span className="file-size-text">{(file.size / 1024).toFixed(1)} KB</span>
                                    </div>
                                    <Download size={14} className="download-icon" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Comments Section */}
            <div className="view-comments-section">
                <div className="comment-header-title">
                    <MessageSquare size={16} />
                    <span>댓글 <strong>{comments.length}</strong></span>
                </div>

                <div className="comments-list-box">
                    {comments.map((comment) => (
                        <div key={comment.id} className="comment-item-box">
                            <div className="comment-author-info">
                                <span className="comment-author-name">{comment.author}</span>
                                <span className="comment-time-text">{new Date(comment.createdAt).toLocaleString('ko-KR')}</span>
                            </div>
                            <p className="comment-content-text">{comment.content}</p>
                        </div>
                    ))}
                </div>

                {/* Comment Input */}
                <form className="comment-input-form" onSubmit={handleCommentSubmit}>
                    <textarea
                        placeholder="따뜻한 댓글을 남겨주세요..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                    />
                    <button type="submit" className="comment-send-btn" disabled={isSubmitting || !newComment.trim()}>
                        <Send size={16} />
                        <span>등록</span>
                    </button>
                </form>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .board-view-container {
                    width: 100%;
                    background: #fff;
                    display: flex;
                    flex-direction: column;
                }
                .view-nav-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 20px;
                    border-bottom: 2px solid #f1f5f9;
                    background: #fff;
                    z-index: 10;
                }
                .back-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    border: none;
                    background: #f8fafc;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #64748b;
                    cursor: pointer;
                }
                .back-btn:hover { background: #f1f5f9; color: #1e293b; }
                .view-actions { display: flex; gap: 8px; }
                .action-btn-text {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border-radius: 6px;
                    border: 1px solid #e2e8f0;
                    background: #fff;
                    color: #64748b;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .action-btn-text:hover {
                    border-color: #3b82f6;
                    color: #3b82f6;
                    background: #eff6ff;
                }
                .action-btn-text.delete:hover {
                    border-color: #ef4444;
                    color: #ef4444;
                    background: #fef2f2;
                }

                .view-main-content {
                    padding: 30px 20px;
                }
                .post-header-info {
                    margin-bottom: 25px;
                }
                .post-title-text {
                    font-size: 24px;
                    font-weight: 800;
                    color: #0f172a;
                    margin: 0 0 12px 0;
                    word-break: keep-all;
                }
                .post-metadata-row {
                    display: flex;
                    gap: 15px;
                }
                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 13px;
                    color: #94a3b8;
                }

                .post-body-content {
                    font-size: 15px;
                    line-height: 1.7;
                    color: #334155;
                    margin-bottom: 40px;
                    min-height: 200px;
                }
                .post-body-content p { margin-bottom: 1em; }
                .post-body-content img { max-width: 100%; border-radius: 8px; margin: 10px 0; }

                .view-attachments-section {
                    background: #f8fafc;
                    border-radius: 12px;
                    padding: 15px;
                    border: 1px solid #f1f5f9;
                }
                .attach-title {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #475569;
                    margin-bottom: 12px;
                }
                .attach-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 8px;
                }
                .attach-file-card {
                    display: flex;
                    align-items: center;
                    background: #fff;
                    padding: 8px 12px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    transition: border-color 0.2s;
                }
                .attach-file-card:hover { border-color: #3b82f6; }
                .file-icon-box { margin-right: 12px; }
                .file-info-box { flex: 1; display: flex; flex-direction: column; gap: 2px; }
                .file-name-text { font-size: 13px; font-weight: 600; color: #1e293b; }
                .file-size-text { font-size: 11px; color: #94a3b8; }
                .download-icon { color: #cbd5e1; }

                .view-comments-section {
                    padding: 30px 20px;
                    border-top: 1px solid #f1f5f9;
                    background: #fff;
                }
                .comment-header-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 15px;
                    font-weight: 700;
                    color: #1e293b;
                    margin-bottom: 20px;
                }
                .comments-list-box {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .comment-item-box {
                    border-bottom: 1px solid #f8fafc;
                    padding-bottom: 15px;
                }
                .comment-author-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 8px;
                }
                .comment-author-name { font-size: 13px; font-weight: 700; color: #1e293b; }
                .comment-time-text { font-size: 11px; color: #94a3b8; }
                .comment-content-text { font-size: 14px; color: #475569; line-height: 1.5; white-space: pre-wrap; }

                .comment-input-form {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .comment-input-form textarea {
                    width: 100%;
                    min-height: 80px;
                    padding: 12px;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 14px;
                    outline: none;
                    resize: none;
                }
                .comment-input-form textarea:focus { border-color: #3b82f6; }
                .comment-send-btn {
                    align-self: flex-end;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: #3b82f6;
                    color: #fff;
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                }
                .comment-send-btn:hover { background: #2563eb; }
            ` }} />
        </div>
    );
};

export default BoardView;
