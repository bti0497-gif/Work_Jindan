
import React, { useState } from 'react';
import { Task } from '../types';

interface TaskFormProps {
  initialData?: Task;
  currentUser: { id: string; name: string; avatar: string };
  onCancel: () => void;
  onSave: (data: any) => void;
}

const TaskForm: React.FC<TaskFormProps> = ({ initialData, currentUser, onCancel, onSave }) => {
  const [text, setText] = useState(initialData?.text || '');
  const [targetDate, setTargetDate] = useState(initialData?.targetDate || new Date().toISOString().split('T')[0]);
  const [isPublic, setIsPublic] = useState(initialData?.isPublic ?? true);
  const today = new Date().toISOString().split('T')[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text) return alert('할일 내용을 입력해주세요.');
    onSave({ text, targetDate, isPublic });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{initialData ? '할일 수정' : '새 할일 등록'}</h2>
            <p className="text-slate-400 text-[11px] font-medium uppercase tracking-widest mt-1">Manage task details</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-blue-600">calendar_today</span>
                작성 일자
              </label>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[13px] font-bold text-slate-400 cursor-default">
                {initialData?.regDate || today} (자동지정)
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-blue-600">person</span>
                작성자
              </label>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                <img src={currentUser.avatar} className="size-5 rounded-full" alt="Me" />
                <span className="text-[13px] font-bold text-slate-700">{currentUser.name}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-600">event_available</span>
              할일을 할 날짜
            </label>
            <input 
              type="date" 
              required
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-slate-700 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-600">edit_note</span>
              할일 내용
            </label>
            <textarea 
              required
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="수행할 업무를 상세히 적어주세요.."
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-700 font-medium leading-relaxed focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all resize-none"
            />
          </div>

          <div className="space-y-3">
             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-600">visibility</span>
              대상자 선택 (공개 범위)
            </label>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 p-4 rounded-2xl border-2 transition-all text-left group ${
                  isPublic ? 'bg-indigo-50 border-indigo-500 ring-4 ring-indigo-50' : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`material-symbols-outlined text-[20px] ${isPublic ? 'text-indigo-600' : 'text-slate-300'}`}>groups</span>
                  {isPublic && <span className="material-symbols-outlined text-indigo-600 text-[18px]">check_circle</span>}
                </div>
                <p className={`text-[13px] font-bold ${isPublic ? 'text-indigo-900' : 'text-slate-500'}`}>전체에 공지</p>
                <p className={`text-[10px] font-medium ${isPublic ? 'text-indigo-400' : 'text-slate-400'}`}>모든 팀원이 볼 수 있습니다.</p>
              </button>
              <button 
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 p-4 rounded-2xl border-2 transition-all text-left group ${
                  !isPublic ? 'bg-amber-50 border-amber-500 ring-4 ring-amber-50' : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`material-symbols-outlined text-[20px] ${!isPublic ? 'text-amber-600' : 'text-slate-300'}`}>person</span>
                  {!isPublic && <span className="material-symbols-outlined text-amber-600 text-[18px]">check_circle</span>}
                </div>
                <p className={`text-[13px] font-bold ${!isPublic ? 'text-amber-900' : 'text-slate-500'}`}>나만 할일</p>
                <p className={`text-[10px] font-medium ${!isPublic ? 'text-amber-400' : 'text-slate-400'}`}>본인에게만 보입니다.</p>
              </button>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onCancel}
              className="flex-1 py-4 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors"
            >
              취소
            </button>
            <button 
              type="submit"
              className="flex-[1.5] bg-blue-600 text-white py-4 rounded-2xl text-sm font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all"
            >
              저장하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskForm;
