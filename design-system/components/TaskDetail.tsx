
import React from 'react';
import { Task } from '../types';

interface TaskDetailProps {
  task: Task;
  currentUser: { id: string; name: string; avatar: string };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
}

const TaskDetail: React.FC<TaskDetailProps> = ({ task, currentUser, onClose, onEdit, onDelete, onToggleComplete }) => {
  const isMine = task.authorId === currentUser.id;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        
        {/* Header */}
        <div className={`p-8 text-white flex items-center justify-between shrink-0 ${task.completed ? 'bg-slate-700' : 'bg-blue-600'}`}>
          <div className="flex items-center gap-4">
            <div className="size-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-3xl">
                {task.completed ? 'task_alt' : 'pending_actions'}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">할일 상세보기</h2>
              <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mt-0.5">
                {task.completed ? 'Completed Task' : 'Task in progress'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-10 space-y-8 overflow-y-auto max-h-[60vh] sidebar-dark-scrollbar">
          
          {/* Status & Date Info */}
          <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">할일 수행 날짜</p>
              <p className="text-lg font-black text-slate-800">{task.targetDate.replace(/-/g, '.')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">공개 범위</p>
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${task.isPublic ? 'bg-indigo-500' : 'bg-amber-500'}`}></span>
                <p className={`text-[13px] font-bold ${task.isPublic ? 'text-indigo-600' : 'text-amber-600'}`}>
                  {task.isPublic ? '전체 공지 (팀 공유)' : '나만 할일 (비공개)'}
                </p>
              </div>
            </div>
          </div>

          {/* Author Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={task.authorAvatar} className="size-12 rounded-full border-2 border-white shadow-md" alt={task.author} />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">작성자</p>
                <p className="text-sm font-bold text-slate-700">{task.author}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">등록일시</p>
              <p className="text-[11px] font-medium text-slate-500">{task.regDate}</p>
            </div>
          </div>

          <div className="h-px bg-slate-100"></div>

          {/* Task Content */}
          <div className="space-y-3">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
               <span className="material-symbols-outlined text-[16px] text-blue-600">notes</span>
               세부 업무 내용
             </p>
             <div className="bg-slate-50/50 rounded-2xl p-6 min-h-[120px]">
               <p className={`text-[15px] leading-relaxed font-medium whitespace-pre-wrap ${task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                 {task.text}
               </p>
             </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="flex gap-2">
            <button 
              onClick={onToggleComplete}
              disabled={!isMine}
              className={`px-5 py-3 rounded-2xl text-[13px] font-bold flex items-center gap-2 transition-all active:scale-95 ${
                task.completed 
                  ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' 
                  : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
              } ${!isMine && 'opacity-50 cursor-not-allowed'}`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {task.completed ? 'settings_backup_restore' : 'check_circle'}
              </span>
              {task.completed ? '진행중으로 변경' : '완료 처리하기'}
            </button>
          </div>

          <div className="flex gap-3">
            {isMine ? (
              <>
                <button 
                  onClick={onEdit}
                  className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-[13px] font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_square</span>
                  수정
                </button>
                <button 
                  onClick={onDelete}
                  className="bg-white text-red-500 border border-red-100 px-6 py-3 rounded-2xl text-[13px] font-bold hover:bg-red-50 active:scale-95 transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  삭제
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-slate-100 px-6 py-3 rounded-2xl text-slate-400">
                <span className="material-symbols-outlined text-[18px]">lock</span>
                <span className="text-[13px] font-bold">읽기 전용 항목</span>
              </div>
            )}
            <button 
              onClick={onClose}
              className="px-6 py-3 text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetail;
