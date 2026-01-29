
import React from 'react';
import { User } from '../types';

interface SidebarLeftProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onEditProfile: () => void;
  onLogout: () => void;
  user: User;
}

const NavItem: React.FC<{ icon: string; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <li>
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
        active 
          ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span className="text-[13px] font-medium truncate">{label}</span>
    </button>
  </li>
);

const UserItem: React.FC<{ name: string; avatar: string }> = ({ name, avatar }) => (
  <li className="flex items-center justify-between px-3 py-1 hover:bg-slate-800/50 rounded-lg transition-colors group">
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative shrink-0">
        <img src={avatar} className="size-8 rounded-full object-cover ring-2 ring-slate-700" alt={name} />
        <div className="absolute -bottom-0.5 -right-0.5 size-2.5 bg-green-500 rounded-full border-2 border-slate-800"></div>
      </div>
      <span className="text-slate-200 text-[13px] font-medium truncate">{name}</span>
    </div>
    <span className="text-[9px] text-slate-600 group-hover:text-slate-400 font-bold uppercase shrink-0 ml-2 tracking-tighter transition-colors">Online</span>
  </li>
);

const SidebarLeft: React.FC<SidebarLeftProps> = ({ currentView, onViewChange, onEditProfile, onLogout, user }) => {
  const activeUsers = [
    { name: '이영희 과장', avatar: 'https://picsum.photos/seed/user2/100/100' },
    { name: '박철수 대리', avatar: 'https://picsum.photos/seed/user3/100/100' },
    { name: '최지민 주임', avatar: 'https://picsum.photos/seed/user5/100/100' },
    { name: '정성훈 차장', avatar: 'https://picsum.photos/seed/user6/100/100' },
    { name: '강혜원 선임', avatar: 'https://picsum.photos/seed/user7/100/100' },
    { name: '윤도현 사원', avatar: 'https://picsum.photos/seed/user8/100/100' },
    { name: '한소희 과장', avatar: 'https://picsum.photos/seed/user9/100/100' },
    { name: '김남준 주임', avatar: 'https://picsum.photos/seed/user10/100/100' },
    { name: '임윤아 대리', avatar: 'https://picsum.photos/seed/user11/100/100' },
    { name: '오세훈 차장', avatar: 'https://picsum.photos/seed/user12/100/100' }
  ];

  return (
    <aside className="w-[18%] min-w-[260px] max-w-[310px] bg-slate-900 flex flex-col shrink-0 border-r border-slate-800 h-full overflow-hidden">
      <div className="p-6 border-b border-slate-800 shrink-0">
        <button 
          onClick={() => onViewChange('dashboard')}
          className="flex items-center gap-3 text-left w-full hover:opacity-80 transition-opacity outline-none"
        >
          <div className="size-10 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-blue-900/20">
            <span className="material-symbols-outlined text-white text-2xl">biotech</span>
          </div>
          <h1 className="text-slate-100 text-[14px] font-bold leading-tight truncate">
            더죤환경 기술진단팀<br />협업스튜디오
          </h1>
        </button>
      </div>

      <div className="px-4 pt-6 shrink-0">
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">내 프로필</span>
            <button 
              onClick={onEditProfile}
              className="material-symbols-outlined text-[18px] text-slate-500 cursor-pointer hover:text-slate-300 transition-colors"
            >
              settings
            </button>
          </div>
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <img 
                alt="Profile" 
                className="size-12 rounded-lg object-cover border-2 border-slate-600 shadow-inner" 
                src={user.avatar} 
              />
              <div className="absolute -bottom-1 -right-1 size-3.5 bg-green-500 rounded-full border-2 border-slate-800"></div>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-slate-100 text-[14px] font-bold block truncate">{user.name}</span>
              <span className="bg-blue-500/10 text-blue-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-500/20 uppercase inline-block mt-0.5 mb-2">{user.role}</span>
              <button 
                onClick={onLogout}
                className="w-full py-1.5 text-[10px] font-bold text-slate-400 bg-slate-900/50 hover:bg-red-500 hover:text-white rounded border border-slate-700 hover:border-red-400 transition-all flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">logout</span>
                LOGOUT
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="px-4 pt-6 shrink-0">
        <div className="px-3 py-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">스튜디오 메뉴</span>
        </div>
        <ul className="space-y-1">
          <NavItem icon="assignment" label="프로젝트관리" active={currentView === 'projects'} onClick={() => onViewChange('projects')} />
          <NavItem icon="account_tree" label="공정관리" active={currentView === 'process'} onClick={() => onViewChange('process')} />
          <NavItem icon="folder_open" label="파일관리" active={currentView === 'files'} onClick={() => onViewChange('files')} />
          <NavItem icon="checklist" label="할일관리" active={currentView === 'tasks'} onClick={() => onViewChange('tasks')} />
          <NavItem icon="forum" label="전체게시판" active={currentView === 'board'} onClick={() => onViewChange('board')} />
        </ul>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col mt-6">
        <div className="px-7 py-2 shrink-0 flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">현재 접속자</span>
          <span className="size-1.5 bg-green-500 rounded-full animate-pulse"></span>
        </div>
        
        <div className="flex-1 overflow-y-auto sidebar-dark-scrollbar px-4 pb-6">
          <ul className="space-y-2 pt-2">
            {activeUsers.map((user) => (
              <UserItem key={user.name} {...user} />
            ))}
          </ul>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-950/40 shrink-0">
        <div className="flex items-center justify-center gap-2 py-2 text-slate-600">
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span className="text-[11px] font-medium uppercase tracking-widest">System v2.4</span>
        </div>
      </div>
    </aside>
  );
};

export default SidebarLeft;
