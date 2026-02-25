import React from 'react';
import tzLogo from '../assets/tz-logo.svg';
import { User } from '../types';

interface SidebarLeftProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onEditProfile: () => void;
  onLogout: () => void;
  user: User;
  activeUsers: { name: string; avatar: string }[];
}

const NavItem: React.FC<{ icon: string; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <li>
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg transition-all group outline-none ${
        active 
          ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
      }`}
    >
      <div className="w-7 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
      </div>
      <span className="text-[12px] md:text-[13px] font-bold truncate tracking-tight">{label}</span>
    </button>
  </li>
);

const UserItem: React.FC<{ name: string; avatar: string }> = ({ name, avatar }) => (
  <li className="flex items-center justify-between px-2.5 py-2 hover:bg-slate-800/50 rounded-lg transition-colors group">
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative shrink-0">
        <img src={avatar} className="size-7 rounded-full object-cover ring-2 ring-slate-700" alt={name} />
        <div className="absolute -bottom-0.5 -right-0.5 size-2 bg-green-500 rounded-full border-2 border-slate-800"></div>
      </div>
      <span className="text-slate-200 text-[11px] md:text-[12px] font-medium truncate">{name}</span>
    </div>
    <span className="text-[8px] text-slate-600 group-hover:text-slate-400 font-bold uppercase shrink-0 ml-2 tracking-tighter">Online</span>
  </li>
);

const SidebarLeft: React.FC<SidebarLeftProps> = ({ currentView, onViewChange, onEditProfile, onLogout, user, activeUsers }) => {
  return (
    <aside className="w-[300px] min-w-[300px] max-w-[300px] bg-slate-900 flex flex-col shrink-0 border-r border-slate-800 h-full overflow-hidden select-none">
      <div className="p-4 md:p-4 border-b border-slate-800 shrink-0">
        <button 
          onClick={() => onViewChange('dashboard')}
          className="flex items-center gap-4 text-left w-full hover:opacity-80 transition-opacity outline-none"
        >
          <img src={tzLogo} alt="Tz" className="size-10 rounded-xl shadow-lg shadow-blue-900/20" />
          <span className="sr-only">Thezone Tech Studio</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-dark-scrollbar pb-6">
        <div className="px-4 pt-4 shrink-0">
          <section className="bg-slate-800 border border-slate-700 rounded-2xl p-3.5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">내 프로필</span>
              <button 
                onClick={onEditProfile}
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">settings</span>
              </button>
            </div>
            <div className="flex items-start gap-3">
              <div className="relative shrink-0">
                <img 
                  alt="Profile" 
                  className="size-11 md:size-12 rounded-xl object-cover border-2 border-slate-600 shadow-inner" 
                  src={user.avatar} 
                />
                <div className="absolute -bottom-1 -right-1 size-3 bg-green-500 rounded-full border-2 border-slate-800 shadow-sm"></div>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-slate-100 text-[13px] md:text-[14px] font-bold block truncate tracking-tight">{user.name}</span>
                <span className="bg-blue-500/10 text-blue-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-blue-500/20 uppercase inline-block mt-0.5 mb-1.5">{user.role}</span>
                <button 
                  onClick={onLogout}
                  className="w-full py-1.5 text-[8px] font-bold text-slate-400 bg-slate-900/50 hover:bg-red-500 hover:text-white rounded-lg border border-slate-700 hover:border-red-400 transition-all flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">logout</span>
                  LOGOUT
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="px-4 shrink-0">
          <div className="px-2.5 py-1.5">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">스튜디오 메뉴</span>
          </div>
          <ul className="space-y-1 mb-6">
            <NavItem icon="assignment" label="프로젝트 관리" active={currentView === 'projects'} onClick={() => onViewChange('projects')} />
            <NavItem icon="account_tree" label="공정 관리" active={currentView === 'process'} onClick={() => onViewChange('process')} />
            <NavItem icon="cloud_queue" label="파일 관리" active={currentView === 'files'} onClick={() => onViewChange('files')} />
            <NavItem icon="checklist" label="할일 관리" active={currentView === 'tasks'} onClick={() => onViewChange('tasks')} />
            <NavItem icon="forum" label="전체 게시판" active={currentView === 'board'} onClick={() => onViewChange('board')} />
          </ul>
        </div>

        <div className="px-6 py-2 shrink-0 flex items-center gap-2">
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">현재 접속자</span>
          <span className="size-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></span>
        </div>
        
        <div className="px-4">
          <ul className="space-y-0.5 pt-1">
            {activeUsers.length === 0 ? (
              <li className="px-2.5 py-2 text-[10px] text-slate-500 font-medium">접속자가 없습니다.</li>
            ) : (
              activeUsers.map((user) => (
                <UserItem key={user.name} {...user} />
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 shrink-0">
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <span className="material-symbols-outlined text-[20px]">info</span>
          <span className="text-[9px] font-black uppercase tracking-widest">SYSTEM V2.4</span>
        </div>
      </div>
    </aside>
  );
};

export default SidebarLeft;
