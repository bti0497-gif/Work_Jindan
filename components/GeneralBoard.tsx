
import React, { useState, useEffect } from 'react';
import { BoardPost } from '../types';
import BoardDetail from './BoardDetail';
import BoardForm from './BoardForm';
import { useBoardViewModel } from '../hooks/useBoardViewModel';
import { SyncService } from '../services/syncService';

interface GeneralBoardProps {
  posts: BoardPost[];
  currentUser: { id: string; name: string; avatar: string; role?: string };
  onAddPost: (post: BoardPost) => void;
  onUpdatePost: (post: BoardPost) => void;
  onDeletePost: (id: string) => void;
}

const GeneralBoard: React.FC<GeneralBoardProps> = ({ posts: initialPosts, currentUser, onAddPost, onUpdatePost, onDeletePost }) => {
  const [isDriveSyncing, setIsDriveSyncing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const syncFromDrive = async () => {
      try {
        await SyncService.importLatestSnapshot();
      } catch (error) {
        console.warn('Drive snapshot import failed', error);
      } finally {
        if (!cancelled) setIsDriveSyncing(false);
      }
    };

    syncFromDrive();
    return () => {
      cancelled = true;
    };
  }, []);

  // ViewModel 도입
  const { 
    posts, 
    totalCount,
    viewMode, 
    selectedPost, 
    editingPost, 
    queryParams,
    actions 
  } = useBoardViewModel(initialPosts, !isDriveSyncing);

  // 서버 사이드 페이지네이션: totalCount 기반으로 계산
  const totalPages = Math.max(1, Math.ceil(totalCount / queryParams.limit));
  // 서버에서 이미 페이지 단위로 잘라서 주므로 그대로 사용
  const currentPosts = posts;

  if (isDriveSyncing) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50/30">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-[13px] font-bold">Drive 동기화 중...</p>
        </div>
      </div>
    );
  }

  if (viewMode === 'form') {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-slate-50/50 p-6 md:p-10 sidebar-dark-scrollbar">
        <div className="max-w-4xl mx-auto pb-20">
          <button 
            onClick={actions.backToList}
            className="mb-6 flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold text-sm transition-colors group"
          >
            <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_back</span>
            목록으로 돌아가기
          </button>
          <BoardForm 
            initialData={editingPost || undefined}
            currentUser={currentUser}
            onCancel={actions.backToList}
            onSave={(data) => {
              if (editingPost) {
                const updated = { ...editingPost, ...data };
                actions.updatePost(updated);
                onUpdatePost(updated);
              } else {
                const newPost: BoardPost = {
                  ...data,
                  id: `post-${Date.now()}`,
                  regDate: new Date().toISOString().split('T')[0],
                  views: 0,
                  author: currentUser.name,
                  authorId: currentUser.id,
                  authorAvatar: currentUser.avatar
                };
                actions.addPost(newPost);
                onAddPost(newPost);
              }
              actions.backToList();
            }}
          />
        </div>
      </div>
    );
  }

  if (viewMode === 'detail' && selectedPost) {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-slate-50/50 p-6 md:p-10 sidebar-dark-scrollbar">
        <div className="max-w-4xl mx-auto pb-20">
          <button 
            onClick={actions.backToList}
            className="mb-6 flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold text-sm transition-colors group"
          >
            <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_back</span>
            목록으로 돌아가기
          </button>
          <BoardDetail 
            post={selectedPost}
            currentUser={currentUser}
            onBack={actions.backToList}
            onEdit={() => actions.openEdit(selectedPost)}
            onDelete={() => {
              if (confirm('이 게시글을 삭제하시겠습니까?')) {
                actions.deletePost(selectedPost.id);
                onDeletePost(selectedPost.id);
                actions.backToList();
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-8 bg-slate-50/30 overflow-hidden h-full">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full">
        
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <span className="material-symbols-outlined text-blue-600 text-3xl">forum</span>
              전체 게시판
            </h2>
            <div className="flex items-center gap-4 mt-2">
               <div className="relative">
                  <input 
                    type="text" 
                    placeholder="게시글 검색..." 
                    onChange={(e) => actions.setSearch(e.target.value)}
                    className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] focus:ring-2 focus:ring-blue-100 transition-all w-64"
                  />
                  <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
               </div>
               <select 
                 onChange={(e) => actions.setSort(e.target.value as any)}
                 className="text-[12px] border-slate-200 rounded-lg py-1.5 bg-white font-medium text-slate-600"
               >
                 <option value="latest">최신순</option>
                 <option value="views">조회수순</option>
                 <option value="oldest">오래된순</option>
               </select>
            </div>
          </div>
          <button 
            onClick={() => actions.openForm()}
            className="bg-blue-600 text-white px-6 py-3.5 rounded-2xl text-[14px] font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">edit_note</span>
            새 글 쓰기
          </button>
        </div>

        {/* Board List Table */}
        <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50/80 z-10 border-b border-slate-100">
                <tr>
                  <th className="py-4 px-6 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-20 text-center">No.</th>
                  <th className="py-4 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">제목</th>
                  <th className="py-4 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-32 text-center">작성자</th>
                  <th className="py-4 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-32 text-center">날짜</th>
                  <th className="py-4 px-6 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider w-24">조회수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {currentPosts.length > 0 ? (
                  currentPosts.map((post, idx) => (
                    <tr 
                      key={post.id} 
                      onClick={() => actions.openDetail(post)}
                      className={`group transition-all cursor-pointer hover:bg-slate-50/30 ${post.isNotice ? 'bg-amber-50/40' : ''}`}
                    >
                      <td className="py-5 px-6 text-center">
                         <span className="text-[12px] font-bold text-slate-300">
                           {post.isNotice ? (
                             <span className="material-symbols-outlined text-amber-500 text-[18px]">campaign</span>
                           ) : (
                             totalCount - ((queryParams.page - 1) * queryParams.limit + idx)
                           )}
                         </span>
                      </td>
                      <td className="py-5 px-4">
                        <div className="flex items-center gap-2">
                          {post.isNotice && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                              공지
                            </span>
                          )}
                          <span className="text-[14px] font-bold text-slate-700 group-hover:text-blue-600 transition-colors">
                            {post.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-5 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <img src={post.authorAvatar} className="size-6 rounded-full border border-slate-200" alt={post.author} />
                          <span className="text-[12px] font-medium text-slate-600">{post.author}</span>
                        </div>
                      </td>
                      <td className="py-5 px-4 text-center">
                        <span className="text-[12px] font-medium text-slate-400">{post.regDate}</span>
                      </td>
                      <td className="py-5 px-6 text-center">
                        <span className="text-[12px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{post.views}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center gap-4 text-slate-300">
                        <span className="material-symbols-outlined text-7xl opacity-50">description</span>
                        <p className="font-bold text-lg">게시글이 아직 없습니다.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalCount > 0 && (
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-center gap-2">
              <button 
                onClick={() => actions.setPage(Math.max(1, queryParams.page - 1))}
                disabled={queryParams.page === 1}
                className="size-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(num => (
                <button 
                  key={num}
                  onClick={() => actions.setPage(num)}
                  className={`size-9 flex items-center justify-center rounded-xl text-[13px] font-bold transition-all ${
                    queryParams.page === num 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                    : 'text-slate-500 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  {num}
                </button>
              ))}
              <button 
                onClick={() => actions.setPage(Math.min(totalPages, queryParams.page + 1))}
                disabled={queryParams.page === totalPages}
                className="size-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeneralBoard;
