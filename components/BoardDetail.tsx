
import React from 'react';
import { BoardPost } from '../types';

interface BoardDetailProps {
  post: BoardPost;
  currentUser: { id: string; name: string; avatar: string };
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const BoardDetail: React.FC<BoardDetailProps> = ({ post, currentUser, onBack, onEdit, onDelete }) => {
  // 본인이거나 Master(관리자)인 경우 수정/삭제 가능
  // const canManage = post.authorId === currentUser.id || currentUser.id === 'master'; // master 권한 주석 처리
  const canManage = post.authorId === currentUser.id;

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col">
      {/* Post Header */}
      <div className="p-8 md:p-10 border-b border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[11px] font-bold uppercase tracking-wider">General Post</span>
          <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-widest">
            <span className="material-symbols-outlined text-[16px]">visibility</span>
            {post.views} Views
          </div>
        </div>
        
        <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-8">
          {post.title}
        </h2>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={post.authorAvatar} className="size-12 rounded-full border-2 border-white shadow-md object-cover" alt={post.author} />
            <div>
              <p className="text-sm font-bold text-slate-800">{post.author}</p>
              <p className="text-[12px] font-medium text-slate-400 mt-0.5">{post.regDate} 등록됨</p>
            </div>
          </div>
        </div>
      </div>

      {/* Post Content */}
      <div className="p-8 md:p-12 min-h-[300px]">
        <div className="prose prose-slate max-w-none">
          <p className="text-[16px] text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
            {post.content}
          </p>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {canManage ? (
            <>
              <button 
                onClick={onEdit}
                className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-[14px] font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">edit_square</span>
                수정하기
              </button>
              <button 
                onClick={onDelete}
                className="bg-white text-red-500 border border-red-100 px-8 py-4 rounded-2xl text-[14px] font-bold hover:bg-red-50 active:scale-95 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">delete</span>
                삭제하기
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 bg-slate-100 px-6 py-4 rounded-2xl text-slate-400">
              <span className="material-symbols-outlined text-[18px]">lock</span>
              <span className="text-[13px] font-bold uppercase tracking-wider">Read Only</span>
            </div>
          )}
        </div>
        <button 
          onClick={onBack}
          className="px-8 py-4 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
          창 닫기
        </button>
      </div>
    </div>
  );
};

export default BoardDetail;
