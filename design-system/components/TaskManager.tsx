
import React, { useState } from 'react';
import { Task } from '../types';
import TaskForm from './TaskForm';
import TaskDetail from './TaskDetail';

interface TaskManagerProps {
  tasks: Task[];
  currentUser: { id: string; name: string; avatar: string };
  onAddTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
}

const TaskManager: React.FC<TaskManagerProps> = ({ tasks, currentUser, onAddTask, onUpdateTask, onDeleteTask }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleOpenCreate = () => {
    setEditingTask(null);
    setIsFormOpen(true);
  };

  const handleOpenEditFromDetail = (task: Task) => {
    setSelectedTask(null);
    setEditingTask(task);
    setIsFormOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col p-8 bg-slate-50/30 overflow-hidden h-full">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full">
        
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <span className="material-symbols-outlined text-blue-600 text-3xl">task_alt</span>
              팀 할일 게시판
            </h2>
            <p className="text-slate-400 text-[13px] font-medium mt-1">
              팀원들과 공유하거나 개인적인 업무 일정을 관리하세요.
            </p>
          </div>
          <button 
            onClick={handleOpenCreate}
            className="bg-blue-600 text-white px-6 py-3.5 rounded-2xl text-[14px] font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">add_task</span>
            새 할일 등록
          </button>
        </div>

        {/* Board List */}
        <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50/80 z-10 border-b border-slate-100">
                <tr>
                  <th className="py-4 px-6 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-32">할일 날짜</th>
                  <th className="py-4 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">내용</th>
                  <th className="py-4 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-24 text-center">공개범위</th>
                  <th className="py-4 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-32 text-center">작성자</th>
                  <th className="py-4 px-6 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider w-24">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tasks.length > 0 ? (
                  tasks.map((task) => {
                    const isMine = task.authorId === currentUser.id;
                    return (
                      <tr 
                        key={task.id} 
                        onClick={() => setSelectedTask(task)}
                        className={`group transition-all cursor-pointer ${task.completed ? 'bg-slate-50/50' : 'hover:bg-slate-50/30'}`}
                      >
                        <td className="py-5 px-6">
                           <div className="flex flex-col">
                             <span className={`text-[13px] font-bold ${task.completed ? 'text-slate-400' : 'text-slate-800'}`}>
                               {task.targetDate.replace(/-/g, '.')}
                             </span>
                             <span className="text-[10px] text-slate-400 font-medium">등록: {task.regDate}</span>
                           </div>
                        </td>
                        <td className="py-5 px-4">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                isMine && onUpdateTask({...task, completed: !task.completed});
                              }}
                              className={`size-5 rounded border transition-colors flex items-center justify-center shrink-0 ${
                                task.completed ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-300'
                              } ${!isMine && 'cursor-default opacity-50'}`}
                            >
                              {task.completed && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                            </button>
                            <span className={`text-[14px] font-medium transition-all truncate max-w-md ${task.completed ? 'text-slate-300 line-through' : 'text-slate-700 font-bold'}`}>
                              {task.text}
                            </span>
                          </div>
                        </td>
                        <td className="py-5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            task.isPublic 
                              ? 'bg-indigo-50 text-indigo-600 border-indigo-100' 
                              : 'bg-amber-50 text-amber-600 border-amber-100'
                          }`}>
                            {task.isPublic ? '전체 공지' : '나만 할일'}
                          </span>
                        </td>
                        <td className="py-5 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <img src={task.authorAvatar} className="size-6 rounded-full border border-slate-200" alt={task.author} />
                            <span className="text-[12px] font-medium text-slate-600">{task.author}</span>
                          </div>
                        </td>
                        <td className="py-5 px-6 text-right">
                          {isMine ? (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">내 할일</span>
                          ) : (
                            <span className="material-symbols-outlined text-slate-200 text-[18px]" title="읽기 전용">lock</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center gap-4 text-slate-300">
                        <span className="material-symbols-outlined text-7xl opacity-50">event_note</span>
                        <p className="font-bold text-lg">표시할 할일이 없습니다.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 할일 상세 보기 모달 */}
      {selectedTask && (
        <TaskDetail 
          task={selectedTask}
          currentUser={currentUser}
          onClose={() => setSelectedTask(null)}
          onEdit={() => handleOpenEditFromDetail(selectedTask)}
          onDelete={() => {
            if(confirm('이 할일을 삭제하시겠습니까?')) {
              onDeleteTask(selectedTask.id);
              setSelectedTask(null);
            }
          }}
          onToggleComplete={() => {
            onUpdateTask({...selectedTask, completed: !selectedTask.completed});
            setSelectedTask({...selectedTask, completed: !selectedTask.completed});
          }}
        />
      )}

      {/* 할일 작성/수정 모달 */}
      {isFormOpen && (
        <TaskForm 
          initialData={editingTask || undefined}
          currentUser={currentUser}
          onCancel={() => setIsFormOpen(false)}
          onSave={(data) => {
            if (editingTask) {
              onUpdateTask({...editingTask, ...data});
            } else {
              onAddTask({
                ...data,
                id: `task-${Date.now()}`,
                regDate: new Date().toISOString().split('T')[0],
                completed: false,
                author: currentUser.name,
                authorId: currentUser.id,
                authorAvatar: currentUser.avatar,
              });
            }
            setIsFormOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default TaskManager;
