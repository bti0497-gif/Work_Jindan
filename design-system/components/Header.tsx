
import React from 'react';

interface HeaderProps {
  title: string;
  showSearch?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

/**
 * Tab Navigation sub-component
 */
const TabNav: React.FC<{ activeTab: string; onTabChange: (tab: string) => void }> = ({ activeTab, onTabChange }) => {
  const tabs = ['Projects', 'Files', 'Schedule', 'Board'];
  return (
    <nav className="flex items-center gap-8 mt-4">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`h-10 flex items-center border-b-2 text-[13px] font-bold transition-all px-1 outline-none ${
            activeTab === tab
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {tab}
        </button>
      ))}
    </nav>
  );
};

const Header: React.FC<HeaderProps> = ({ title, showSearch = true, activeTab, onTabChange }) => {
  return (
    <header className="pt-6 px-8 bg-white border-b border-slate-200 flex flex-col shrink-0 shadow-sm z-10">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-slate-900 text-xl tracking-tight uppercase flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">tactic</span>
          {title}
        </h1>
        <div className="flex items-center gap-2">
          {showSearch && (
            <>
              <div className="relative group">
                <input 
                  type="text" 
                  placeholder="프로젝트 검색..." 
                  className="pl-9 pr-4 py-1.5 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:bg-white transition-all w-48 lg:w-64"
                />
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] group-focus-within:text-blue-500 transition-colors">search</span>
              </div>
              <button className="bg-slate-800 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-slate-700 active:scale-95 transition-all shadow-sm">
                검색
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
