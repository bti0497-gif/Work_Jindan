/**
 * FINALIZED UI STANDARD - DEOJON TECH STUDIO
 * PROTECTED: Horizontal Tab System & Cloud Sync Header
 */

import React from 'react';

interface HeaderProps {
  title: string;
  icon: string;
  showSearch?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  isSyncingExternal?: boolean; // 외부에서 주입받는 동기화 상태
  onManualSync?: () => void; // 수동 동기화 함수
}

const TabNav: React.FC<{ activeTab: string; onTabChange: (tab: string) => void }> = ({ activeTab, onTabChange }) => {
  const tabs = ['Projects', 'Files', 'Schedule', 'Board'];
  return (
    <nav className="flex items-center gap-8 mt-4">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`h-9 flex items-center border-b-[3px] text-[13px] font-bold transition-all px-1 outline-none tracking-tight ${
            activeTab === tab
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-800'
          }`}
        >
          {tab}
        </button>
      ))}
    </nav>
  );
};

const Header: React.FC<HeaderProps> = ({ 
  title, 
  icon, 
  showSearch = true, 
  activeTab, 
  onTabChange, 
  isSyncingExternal = false,
  onManualSync 
}) => {

  return (
    <header className="pt-5 px-8 bg-white border-b border-slate-200 flex flex-col shrink-0 shadow-sm z-10">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-slate-900 text-xl md:text-2xl tracking-tighter uppercase flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center shrink-0">
            <img src="./thezone.ico" alt="App Icon" className="w-9 h-9" />
          </div>
          <span className="truncate">{title}</span>
        </h1>
        <div className="flex items-center gap-3">
          {showSearch && (
            <>
              {/* Cloud Sync Status Button */}
              <button 
                onClick={onManualSync}
                disabled={isSyncingExternal}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all border ${
                  isSyncingExternal 
                  ? 'bg-slate-50 border-slate-200 text-slate-400' 
                  : 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white hover:shadow-lg hover:shadow-blue-100 active:scale-95'
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] ${isSyncingExternal ? 'animate-spin' : ''}`}>
                  {isSyncingExternal ? 'sync' : 'cloud_sync'}
                </span>
                <span className="hidden lg:inline">{isSyncingExternal ? '동기화 중...' : 'Cloud Sync'}</span>
              </button>

              <div className="relative group hidden sm:block">
                <input 
                  type="text" 
                  placeholder="통합 검색..." 
                  className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium focus:ring-4 focus:ring-blue-50 focus:border-blue-400 focus:bg-white transition-all w-40 lg:w-56 outline-none shadow-inner"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-6 flex items-center justify-center text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">search</span>
                </div>
              </div>
              <button className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-[13px] font-bold hover:bg-slate-800 active:scale-95 transition-all shadow-md shadow-slate-200 uppercase tracking-tighter">
                Search
              </button>
            </>
          )}
        </div>
      </div>
      <TabNav activeTab={activeTab} onTabChange={onTabChange} />
    </header>
  );
};

export default Header;
