
import React, { useState, useRef, useEffect } from 'react';
import { Message, Task, Notification, Process } from '../types';

interface SidebarRightProps {
  messages: Message[];
  teamTasks: Task[];
  personalTasks: Task[];
  processes: Process[];
  notifications: Notification[];
  onViewTask: (taskId: string) => void;
  onViewProcess: () => void;
  onSendMessage: (text: string) => void;
}

const ChatMessage: React.FC<{ msg: Message }> = ({ msg }) => (
  <div className="flex gap-2.5 group/msg animate-in slide-in-from-right-2 duration-300">
    <img src={msg.avatar} alt={msg.sender} className="size-7 rounded-full shrink-0 object-cover border border-slate-200 shadow-sm" />
    <div className="space-y-1 flex-1 min-w-0">
      <div className="bg-white p-2.5 rounded-2xl rounded-tl-none border border-slate-200/80 text-[11px] text-slate-600 shadow-sm leading-relaxed break-words hover:border-blue-200 transition-colors">
        {msg.text}
      </div>
      <p className="text-[9px] font-bold text-slate-400 pl-1">{msg.sender} • {msg.time}</p>
    </div>
  </div>
);

const TaskItem: React.FC<{ task: Task; onClick: () => void }> = ({ task, onClick }) => (
  <div 
    onClick={onClick}
    className="group/task py-2 cursor-pointer flex items-center gap-2.5"
  >
    <span className="size-1.5 rounded-full bg-slate-300 group-hover/task:bg-blue-500 transition-colors shrink-0"></span>
    <p className="text-[11px] font-bold text-slate-600 group-hover/task:text-blue-600 group-hover/task:underline truncate transition-all">
      {task.text}
    </p>
  </div>
);

const SidebarRight: React.FC<SidebarRightProps> = ({ messages, teamTasks, personalTasks, processes, notifications, onViewTask, onViewProcess, onSendMessage }) => {
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 새 메시지 도착 시 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <aside className="w-[450px] min-w-[450px] max-w-[450px] bg-slate-50 flex flex-col shrink-0 border-l border-slate-200 h-full overflow-hidden">
      
      <div className="pt-3 px-5 border-b border-slate-200 shrink-0 h-[64px] flex items-center justify-between bg-white">
        <h2 className="text-slate-900 font-black text-[13px] flex items-center gap-2 uppercase tracking-tight">
          <div className="w-5 flex items-center justify-center">
            <span className="material-symbols-outlined text-blue-600 text-[20px]">widgets</span>
          </div>
          협업 위젯
        </h2>
        <div className="flex gap-2">
          <span className="material-symbols-outlined text-[18px] text-slate-400 cursor-pointer hover:text-blue-600 transition-colors">notifications</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden border-b border-slate-200 bg-slate-50/30">
        <section className="flex-1 flex flex-col overflow-hidden p-4">
          <h2 className="font-black text-[12px] text-slate-800 flex items-center gap-2 uppercase tracking-tight mb-3">
            <span className="material-symbols-outlined text-[16px] text-indigo-600">group_work</span>
            전체 할일
          </h2>
          <div className="overflow-y-auto sidebar-dark-scrollbar pr-1 divide-y divide-slate-100/50">
            {teamTasks.map(t => <TaskItem key={t.id} task={t} onClick={() => onViewTask(t.id)} />)}
          </div>
        </section>
        <div className="h-px bg-slate-200/50 mx-5 shrink-0" />
        <section className="flex-1 flex flex-col overflow-hidden p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-[12px] text-slate-800 flex items-center gap-2 uppercase tracking-tight">
              <span className="material-symbols-outlined text-[16px] text-emerald-600">account_tree</span>
              공정 진행
            </h2>
            <button onClick={onViewProcess} className="text-[10px] font-bold text-slate-400 hover:text-emerald-600 transition-colors uppercase tracking-widest">More</button>
          </div>
          <div className="overflow-y-auto sidebar-dark-scrollbar pr-1 divide-y divide-slate-100/50">
            {processes.length === 0 ? (
              <p className="text-[10px] text-slate-400 font-medium">등록된 공정이 없습니다.</p>
            ) : (
              processes.map(p => (
                <div key={p.id} className="py-2 flex items-center gap-2.5">
                  <span className={`size-1.5 rounded-full ${p.isCompleted ? 'bg-green-500' : 'bg-emerald-400 animate-pulse'}`} />
                  <p className="text-[11px] font-bold text-slate-600 truncate">{p.title}</p>
                </div>
              ))
            )}
          </div>
        </section>
        <div className="h-px bg-slate-200/50 mx-5 shrink-0" />
        <section className="flex-1 flex flex-col overflow-hidden p-4">
          <h2 className="font-black text-[12px] text-slate-800 flex items-center gap-2 uppercase tracking-tight mb-3">
            <span className="material-symbols-outlined text-[16px] text-blue-600">person</span>
            나의 할일
          </h2>
          <div className="overflow-y-auto sidebar-dark-scrollbar pr-1 divide-y divide-slate-100/50">
            {personalTasks.map(t => <TaskItem key={t.id} task={t} onClick={() => onViewTask(t.id)} />)}
          </div>
        </section>
      </div>

      {/* Chat Section */}
      <section className="flex-1 flex flex-col overflow-hidden bg-white border-t border-slate-100 h-[45%]">
        <div className="p-4 flex items-center justify-between shrink-0 border-b border-slate-50 bg-white">
          <h2 className="font-black text-[12px] text-slate-800 flex items-center gap-2 uppercase tracking-tight">
            <span className="material-symbols-outlined text-[16px] text-blue-600">forum</span>
            진단팀 채팅
          </h2>
          <div className="size-2 bg-green-500 rounded-full animate-pulse"></div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 space-y-4 py-4 sidebar-dark-scrollbar bg-slate-50/30">
          {messages.length > 0 ? (
            messages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-10">
               <span className="material-symbols-outlined text-4xl">chat_bubble</span>
               <p className="text-[10px] font-bold mt-2 uppercase tracking-widest">No Messages</p>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-3.5 shrink-0 bg-white border-t border-slate-100">
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-100 focus-within:bg-white transition-all">
            <input 
              className="flex-1 border-none focus:ring-0 text-[12px] p-0 bg-transparent placeholder-slate-400 font-bold" 
              placeholder="메시지 입력..." 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button 
              onClick={handleSend}
              className="text-blue-600 hover:text-blue-700 active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined text-[22px]">send</span>
            </button>
          </div>
        </div>
      </section>

      <footer className="px-5 py-2.5 bg-white border-t border-slate-100 shrink-0 flex items-center justify-between">
         <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">WIDGET SYSTEM</span>
         <div className="flex items-center gap-2 cursor-pointer group">
           <div className="size-2 bg-red-500 rounded-full shadow-[0_0_5px_#ef4444]"></div>
           <span className="text-[9px] text-red-500 font-black uppercase tracking-tighter">Live Sync</span>
         </div>
      </footer>
    </aside>
  );
};

export default SidebarRight;
