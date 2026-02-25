
/**
 * FINALIZED UI COMPONENT - DEOJON TECH STUDIO
 * WARNING: DO NOT MODIFY layout or labels. 
 * File upload section is EXCLUDED by design for this component.
 */

import React, { useState, useEffect } from 'react';
import { Process } from '../types';

interface ProcessFormProps {
  initialData?: Process;
  onCancel: () => void;
  projectMembers: string[];
  onSave: (process: any) => void;
}

const ProcessForm: React.FC<ProcessFormProps> = ({ initialData, onCancel, projectMembers, onSave }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [startDate, setStartDate] = useState(initialData?.startDate || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initialData?.endDate || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set(initialData?.members || []));

  const toggleMember = (avatar: string) => {
    const next = new Set(selectedMembers);
    if (next.has(avatar)) next.delete(avatar);
    else next.add(avatar);
    setSelectedMembers(next);
  };

  const handleDateClick = (e: React.MouseEvent<HTMLInputElement>) => {
    try { (e.currentTarget as any).showPicker(); } catch (err) {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !endDate) return alert('모든 필수 항목을 입력해주세요.');
    onSave({
      title,
      startDate,
      endDate,
      description,
      members: Array.from(selectedMembers)
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col max-h-[85vh]">
      {/* Header: Dynamic title based on mode */}
      <div className={`px-8 py-7 text-white flex items-center justify-between shrink-0 transition-colors ${initialData ? 'bg-indigo-900' : 'bg-slate-900'}`}>
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {initialData ? '공정 상세 내용 수정' : '신규 공정 상세 등록'}
          </h2>
          <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-medium">
            {initialData ? 'Update existing process milestone' : 'Add new process milestone to project'}
          </p>
        </div>
        <div className={`size-12 rounded-2xl flex items-center justify-center shadow-xl ${initialData ? 'bg-indigo-600 shadow-indigo-900/40' : 'bg-blue-600 shadow-blue-900/40'}`}>
          <span className="material-symbols-outlined text-white text-3xl">
            {initialData ? 'edit_note' : 'add_task'}
          </span>
        </div>
      </div>

      <div className="p-8 space-y-8 overflow-y-auto sidebar-dark-scrollbar flex-1">
        {/* Process Name */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[16px] ${initialData ? 'text-indigo-600' : 'text-blue-600'}`}>edit_square</span>
            공정 명칭 (필수)
          </label>
          <input 
            type="text" 
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="공정을 식별할 수 있는 명칭을 입력하세요.."
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
          />
        </div>

        {/* Period */}
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-[16px] ${initialData ? 'text-indigo-600' : 'text-blue-600'}`}>calendar_today</span>
              시작일
            </label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onClick={handleDateClick}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-slate-700 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all cursor-pointer"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-[16px] ${initialData ? 'text-indigo-600' : 'text-blue-600'}`}>event_busy</span>
              종료일
            </label>
            <input 
              type="date" 
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onClick={handleDateClick}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-slate-700 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all cursor-pointer"
            />
          </div>
        </div>

        {/* Member Assignment */}
        <div className="space-y-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[16px] ${initialData ? 'text-indigo-600' : 'text-blue-600'}`}>person_add</span>
            참여 팀원 지정 (다중 선택)
          </label>
          <div className="flex flex-wrap gap-4 p-5 bg-slate-50 border border-slate-100 rounded-2xl">
            {projectMembers.map((avatar, idx) => (
              <div 
                key={idx}
                onClick={() => toggleMember(avatar)}
                className={`relative cursor-pointer transition-all hover:scale-110 active:scale-90 ${selectedMembers.has(avatar) ? 'grayscale-0 ring-4 ring-blue-500 ring-offset-2' : 'grayscale opacity-60'}`}
              >
                <img src={avatar} className="size-14 rounded-full border-2 border-white shadow-md object-cover" alt="Member" />
                {selectedMembers.has(avatar) && (
                  <div className={`absolute -top-1 -right-1 size-6 text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm ${initialData ? 'bg-indigo-600' : 'bg-blue-600'}`}>
                    <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                  </div>
                )}
              </div>
            ))}
            {projectMembers.length === 0 && (
              <p className="text-slate-400 text-xs font-bold w-full text-center py-2">프로젝트에 등록된 팀원이 없습니다.</p>
            )}
          </div>
        </div>

        {/* Task Description */}
        <div className="space-y-2 pb-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[16px] ${initialData ? 'text-indigo-600' : 'text-blue-600'}`}>description</span>
            담당 업무 상세
          </label>
          <textarea 
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="해당 공정에서 수행해야 할 세부 업무 내용을 입력하세요.."
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-700 leading-relaxed focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all resize-none"
          />
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="p-8 flex items-center justify-end gap-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
        <button 
          type="button"
          onClick={onCancel}
          className="px-8 py-4 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors"
        >
          {initialData ? '수정 취소' : '취소'}
        </button>
        <button 
          onClick={handleSubmit}
          className={`px-10 py-4 rounded-2xl text-sm font-bold shadow-2xl transition-all flex items-center gap-2 active:scale-95 ${
            initialData 
              ? 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700' 
              : 'bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">
            {initialData ? 'save' : 'check_circle'}
          </span>
          {initialData ? '수정 내용 저장' : '공정 데이터 저장'}
        </button>
      </div>
    </div>
  );
};

export default ProcessForm;
