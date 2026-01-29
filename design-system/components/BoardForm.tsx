
import React, { useState } from 'react';
import { BoardPost } from '../types';

interface BoardFormProps {
  initialData?: BoardPost;
  currentUser: { id: string; name: string; avatar: string };
  onCancel: () => void;
  onSave: (data: any) => void;
}

const BoardForm: React.FC<BoardFormProps> = ({ initialData, currentUser, onCancel, onSave }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [content, setContent] = useState(initialData?.content || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return alert('제목과 내용을 모두 입력해주세요.');
    onSave({ title, content });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col">
      <div className={`p-8 md:p-10 text-white flex items-center justify-between ${initialData ? 'bg-indigo-900' : 'bg-slate-900'}`}>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{initialData ? '게시글 수정' : '새 게시글 작성'}</h2>
          <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mt-1">Share your thoughts with the team</p>
        </div>
        <div className={`size-14 rounded-2xl flex items-center justify-center ${initialData ? 'bg-indigo-600' : 'bg-blue-600 shadow-xl shadow-blue-900/40'}`}>
          <span className="material-symbols-outlined text-white text-3xl">{initialData ? 'edit_note' : 'add_comment'}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-8">
        <div className="space-y-3">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 px-1">
            <span className="material-symbols-outlined text-[18px] text-blue-600">label</span>
            게시글 제목
          </label>
          <input 
            type="text" 
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="게시글의 제목을 입력하세요..."
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-800 font-bold text-lg focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
          />
        </div>

        <div className="space-y-3">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 px-1">
            <span className="material-symbols-outlined text-[18px] text-blue-600">article</span>
            상세 내용
          </label>
          <textarea 
            required
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="전달하고자 하는 내용을 자유롭게 작성하세요..."
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-6 text-slate-700 leading-relaxed font-medium focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none resize-none"
          />
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-6 border-t border-slate-100 gap-6">
           <div className="flex items-center gap-3">
              <div className="relative">
                <img src={currentUser.avatar} className="size-10 rounded-full border border-slate-200 object-cover" alt="Me" />
                <div className="absolute -bottom-0.5 -right-0.5 size-3 bg-green-500 rounded-full border-2 border-white"></div>
              </div>
              <div>
                <span className="text-[13px] font-bold text-slate-800 block">{currentUser.name}</span>
                <span className="text-[10px] text-slate-400 font-medium">Author Identity</span>
              </div>
           </div>
           <div className="flex items-center gap-4 w-full md:w-auto">
              <button 
                type="button" 
                onClick={onCancel}
                className="flex-1 md:flex-none px-8 py-4 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors"
              >
                취소
              </button>
              <button 
                type="submit"
                className="flex-1 md:flex-none bg-blue-600 text-white px-10 py-4 rounded-2xl text-sm font-bold shadow-2xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                게시글 저장
              </button>
           </div>
        </div>
      </form>
    </div>
  );
};

export default BoardForm;
