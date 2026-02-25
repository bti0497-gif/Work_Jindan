
/**
 * FINALIZED UI COMPONENT - DEOJON TECH STUDIO
 * WARNING: DO NOT MODIFY layout, labels, or core styling (Project Detail, File Upload, Member Assignment)
 * without explicit permission. This structure is synced with the Technical Diagnosis Team standards.
 */

import React, { useState } from 'react';

interface ProjectFormProps {
  onCancel: () => void;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ onCancel }) => {
  const [today] = useState(new Date().toISOString().split('T')[0]);
  const [regDate, setRegDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  
  const userDatabase = [
    { id: 'u2', name: '이영희 과장', avatar: 'https://picsum.photos/seed/user2/100/100', role: '환경진단' },
    { id: 'u3', name: '박철수 대리', avatar: 'https://picsum.photos/seed/user3/100/100', role: '데이터분석' },
    { id: 'u5', name: '최지민 주임', avatar: 'https://picsum.photos/seed/user5/100/100', role: '현장실사' },
    { id: 'u6', name: '정성훈 차장', avatar: 'https://picsum.photos/seed/user6/100/100', role: '프로젝트관리' },
    { id: 'u7', name: '강혜원 선임', avatar: 'https://picsum.photos/seed/user7/100/100', role: '품질관리' },
    { id: 'u8', name: '윤도현 사원', avatar: 'https://picsum.photos/seed/user8/100/100', role: '행정지원' },
    { id: 'u9', name: '한소희 과장', avatar: 'https://picsum.photos/seed/user9/100/100', role: '수질연구' },
    { id: 'u10', name: '김남준 주임', avatar: 'https://picsum.photos/seed/user10/100/100', role: '현장안전' }
  ];

  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const toggleMember = (id: string) => {
    const newSelection = new Set(selectedMemberIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedMemberIds(newSelection);
  };

  const filteredUsers = userDatabase.filter(user => 
    user.name.includes(searchQuery) || user.role.includes(searchQuery)
  );

  const handleDateClick = (e: React.MouseEvent<HTMLInputElement>) => {
    try { (e.currentTarget as any).showPicker(); } catch (err) {}
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col max-h-[85vh]">
      <div className="bg-slate-900 px-8 py-7 text-white flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold tracking-tight">신규 프로젝트 등록</h2>
          <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-medium">Create new environmental project</p>
        </div>
        <div className="size-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-900/40">
          <span className="material-symbols-outlined text-white text-3xl">add_business</span>
        </div>
      </div>

      <div className="p-8 space-y-8 overflow-y-auto sidebar-dark-scrollbar flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-600">calendar_today</span>
              등록 일자
            </label>
            <input type="date" value={regDate} onChange={(e) => setRegDate(e.target.value)} onClick={handleDateClick}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-slate-700 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-600">person</span>
              작성자
            </label>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3">
              <img src="https://picsum.photos/seed/master/40/40" className="size-8 rounded-full border-2 border-white shadow-sm" alt="Author" />
              <span className="text-sm font-bold text-slate-800">김진단 팀장</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-blue-600">label</span>
            프로젝트 명칭
          </label>
          <input 
            type="text" 
            placeholder="프로젝트를 대표할 명칭을 입력하세요.."
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none" 
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-600">group_add</span>
              참여 팀원 지정
            </label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="이름/직무 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl text-[11px] focus:ring-2 focus:ring-blue-500 transition-all w-48"
              />
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[220px] overflow-y-auto p-4 bg-slate-50 border border-slate-100 rounded-2xl sidebar-dark-scrollbar">
            {filteredUsers.map((user) => {
              const isSelected = selectedMemberIds.has(user.id);
              return (
                <div key={user.id} onClick={() => toggleMember(user.id)}
                  className={`flex flex-col items-center p-4 rounded-2xl border transition-all cursor-pointer group relative ${
                    isSelected ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-100' : 'bg-white border-slate-100 hover:border-blue-300'
                  }`}>
                  <img src={user.avatar} className={`size-12 rounded-full mb-2 transition-transform border-2 ${isSelected ? 'border-white' : 'border-transparent group-hover:scale-105'}`} alt={user.name} />
                  <span className={`text-[12px] font-bold truncate w-full text-center ${isSelected ? 'text-white' : 'text-slate-700'}`}>{user.name}</span>
                  <span className={`text-[10px] truncate w-full text-center ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>{user.role}</span>
                  {isSelected && (
                    <div className="absolute top-2 right-2 size-5 bg-white rounded-full flex items-center justify-center border border-blue-600">
                      <span className="material-symbols-outlined text-blue-600 text-[14px] font-bold">check</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-600">event_available</span>
              시작일
            </label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onClick={handleDateClick}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-slate-700 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-blue-600">event_busy</span>
              종료일
            </label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} onClick={handleDateClick}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-slate-700 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-blue-600">description</span>
            프로젝트 상세
          </label>
          <textarea 
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="프로젝트의 상세 내용을 입력하세요.."
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-700 leading-relaxed focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none resize-none"
          />
        </div>

        <div className="space-y-2 pb-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-blue-600">attach_file</span>
            파일 첨부
          </label>
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:bg-slate-50 hover:border-blue-300 transition-all cursor-pointer group">
            <span className="material-symbols-outlined text-slate-300 text-4xl group-hover:text-blue-400 transition-colors">cloud_upload</span>
            <p className="text-sm text-slate-500 font-medium mt-2">관련 문서를 드래그하거나 클릭하여 업로드하세요</p>
          </div>
        </div>
      </div>

      <div className="p-8 flex items-center justify-end gap-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
        <button onClick={onCancel} className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors">취소</button>
        <button className="bg-blue-600 text-white px-10 py-4 rounded-2xl text-sm font-bold shadow-2xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2">
          <span className="material-symbols-outlined text-[22px]">save</span>
          신규 프로젝트 저장
        </button>
      </div>
    </div>
  );
};

export default ProjectForm;
