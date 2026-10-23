
import { useState, useEffect, useCallback, useMemo } from 'react';
import { firebaseBoardService } from '../services/firebaseBoardService';
import { dbService } from '../services/dbService';
import { FileText, User, Clock, Plus, RefreshCw, ChevronRight, Search, ChevronLeft, MessageSquare } from 'lucide-react';

const BoardList = ({ menuName, boardUser, onWriteNew, onViewPost, showAlert, showConfirm }) => {
    const [posts, setPosts] = useState([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInputValue, setSearchInputValue] = useState('');
    const [importing, setImporting] = useState(false);

    const fetchPosts = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const validPosts = await firebaseBoardService.list(menuName);
            setPosts(validPosts);
        } catch (err) {
            setError(`데이터 로드 실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [menuName]);

    useEffect(() => firebaseBoardService.watchList(menuName, data => {
        setPosts(data);
        setLoading(false);
        setError(null);
    }, err => { setError(`게시판 연결 실패: ${err.message}`); setLoading(false); }), [menuName]);

    const importLocal = async () => {
        const legacy = dbService.getAll(menuName);
        if (!legacy.length) return showAlert('이 PC에 남아 있는 기존 게시글이 없습니다.');
        if (!await showConfirm(`이 PC의 기존 게시글 ${legacy.length}개를 가져오시겠습니까? 서버에 같은 ID의 글이 있으면 건너뜁니다.`)) return;
        setImporting(true);
        try {
            const result = await firebaseBoardService.importLocal(menuName, legacy);
            await fetchPosts();
            await showAlert(`${result.imported}개를 가져왔습니다. ${result.skipped}개는 건너뛰었습니다.`);
        } catch (err) {
            await showAlert(`가져오기 실패: ${err.message}. 다시 실행하면 이미 옮긴 글은 건너뜁니다.`);
        } finally { setImporting(false); }
    };

    const filteredPosts = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return posts.filter(post => !term || post.title?.toLowerCase().includes(term) || post.author?.toLowerCase().includes(term));
    }, [searchTerm, posts]);
    const totalPages = Math.max(1, Math.ceil(filteredPosts.length / 10));
    const currentPage = Math.min(page, totalPages);
    const visiblePosts = filteredPosts.slice((currentPage - 1) * 10, currentPage * 10);

    const clearSearch = () => {
        setSearchInputValue('');
        setSearchTerm('');
        setPage(1);
    };

    const handleSearch = () => {
        setSearchTerm(searchInputValue);
        setPage(1);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className="board-list-container">
            {/* Header: Title & Refresh */}
            <div className="board-header">
                <div>
                    <h1 className="board-title">{menuName}</h1>
                    <p className="post-count">총 {filteredPosts.length}개의 게시글</p>
                    {boardUser?.role === 'admin' && <button type="button" className="action-btn-text" disabled={importing || loading} onClick={importLocal}>
                        {importing ? '가져오는 중...' : '이 PC의 기존 게시글 가져오기'}
                    </button>}
                </div>
                <button className="refresh-btn" onClick={fetchPosts} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {/* Search Bar */}
            <div className="search-section">
                <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="제목 또는 작성자로 검색"
                        value={searchInputValue}
                        onChange={(e) => setSearchInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button className="search-btn-inner" onClick={handleSearch}>
                        검색
                    </button>
                </div>
            </div>

            {/* Body: List */}
            <div className="board-body">
                {loading ? (
                    <div className="status-container font-loading">
                        <RefreshCw size={32} className="spin text-blue-500" />
                        <p>게시판을 불러오는 중...</p>
                    </div>
                ) : error ? (
                    <div className="status-container error">
                        <p>{error}</p>
                        <button onClick={fetchPosts}>다시 시도</button>
                    </div>
                ) : filteredPosts.length === 0 ? (
                    <div className="status-container empty">
                        <FileText size={48} className="text-slate-200" />
                        <p>{searchTerm ? '검색 결과가 없습니다.' : '게시글이 없습니다.'}</p>
                        {searchTerm && (
                            <button className="return-list-btn" onClick={clearSearch}>
                                <RefreshCw size={14} /> 목록으로 돌아가기
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="post-list">
                        {visiblePosts.map((post) => (
                            <div key={post.id} className="post-item" onClick={() => onViewPost(post)}>
                                <div className="post-info-top">
                                    <span className="post-title-text">{post.title}</span>
                                    {post.attachments?.length > 0 && (
                                        <span className="attach-badge">+{post.attachments.length}</span>
                                    )}
                                    {post.comments?.length > 0 && (
                                        <span className="comment-badge">
                                            <MessageSquare size={11} /> {post.comments.length}
                                        </span>
                                    )}
                                </div>
                                <div className="post-info-bottom">
                                    <span className="post-meta">
                                        <User size={12} /> {post.author}
                                    </span>
                                    <span className="post-meta">
                                        <Clock size={12} /> {new Date(post.createdAt || '').toLocaleDateString('ko-KR')}
                                    </span>
                                </div>
                                <ChevronRight className="item-arrow" size={18} />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer: Pagination & Write */}
            <div className="board-footer">
                <div className="pagination">
                    <button className="page-btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="이전 페이지"><ChevronLeft size={16} /></button>
                    <span>{currentPage} / {totalPages}</span>
                    <button className="page-btn" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} aria-label="다음 페이지"><ChevronRight size={16} /></button>
                </div>
                <button className="write-btn-float" onClick={onWriteNew}>
                    <Plus size={20} />
                    <span>글쓰기</span>
                </button>
            </div>

        </div>
    );
};

export default BoardList;
