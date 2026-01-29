
/**
 * FINALIZED UI COMPONENT - DEOJON TECH STUDIO
 * WARNING: DO NOT MODIFY layout, labels, or core styling (Start/End Date, File Section)
 * without explicit permission. This structure reflects the fixed Project Detail Standard.
 */

import React, { useState } from 'react';
import { Project } from '../types';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState({
    title: project.title,
    description: project.description,
    startDate: new Date().toISOString().split('T')[0],
    endDate: project.dueDate,
    regDate: new Date().toISOString().split('T')[0],
  });

  const [attachedFiles, setAttachedFiles] = useState<any[]>([]);

  const handleDateClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (!isEditing) return;
    try { (e.currentTarget as any).showPicker(); } catch (err) {}
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col max-h-[85vh]">
      <div className={`px-8 py-7 text-white flex items-center justify-between shrink-0 transition-colors duration-500 ${isEditing ? 'bg-indigo-900' : 'bg-slate-900'}`}>
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {isEditing ? '프로젝트 정보 수정' : '프로젝트 상세 정보'}
          </h2>
          <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-medium">
            {isEditing ? 'Edit existing project details' : `Project ID: ${project.id}`}
          </p>
        </div>
        <div className={`size-12 rounded-2xl flex items-center justify-center transition-all ${isEditing ? 'bg-indigo-600 scale-110 shadow-lg' : 'bg-white/10'}`}>
          <span className="material-symbols-outlined text-white text-3xl">{isEditing ? 'edit_note' : 'visibility'}</span>
        </div>
      </div>

      <div className="p-8 space-y-8 overflow-y-auto sidebar-dark-scrollbar flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-[16px] ${isEditing ? 'text-indigo-600' : 'text-blue-600'}`}>calendar_today</span>
              등록 일자
            </label>
            <input type="date" value={formData.regDate} readOnly={!isEditing} onChange={(e) => setFormData({...formData, regDate: e.target.value})} onClick={handleDateClick}
              className={`w-full rounded-2xl px-5 py-3.5 text-slate-700 font-bold transition-all outline-none border ${
                isEditing ? 'bg-white border-indigo-200 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400' : 'bg-slate-50 border-transparent'
              }`} />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-[16px] ${isEditing ? 'text-indigo-600' : 'text-blue-600'}`}>person</span>
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
            <span className={`material-symbols-outlined text-[16px] ${isEditing ? 'text-indigo-600' : 'text-blue-600'}`}>label</span>
            프로젝트 명칭
          </label>
          <input type="text" value={formData.title} readOnly={!isEditing} onChange={(e) => setFormData({...formData, title: e.target.value})}
            className={`w-full rounded-2xl px-5 py-4 text-slate-800 font-bold transition-all outline-none border ${
                isEditing ? 'bg-white border-indigo-200 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400' : 'bg-slate-50 border-transparent'
            }`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-[16px] ${isEditing ? 'text-indigo-600' : 'text-blue-600'}`}>event_available</span>
              시작일
            </label>
            <input type="date" value={formData.startDate} readOnly={!isEditing} onChange={(e) => setFormData({...formData, startDate: e.target.value})} onClick={handleDateClick}
              className={`w-full rounded-2xl px-5 py-3.5 text-slate-700 font-bold transition-all outline-none border ${
                isEditing ? 'bg-white border-indigo-200 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400' : 'bg-slate-50 border-transparent'
              }`} />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-[16px] ${isEditing ? 'text-indigo-600' : 'text-blue-600'}`}>event_busy</span>
              종료일
            </label>
            <input type="date" value={formData.endDate} readOnly={!isEditing} onChange={(e) => setFormData({...formData, endDate: e.target.value})} onClick={handleDateClick}
              className={`w-full rounded-2xl px-5 py-3.5 text-slate-700 font-bold transition-all outline-none border ${
                isEditing ? 'bg-white border-indigo-200 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400' : 'bg-slate-50 border-transparent'
              }`} />
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[16px] ${isEditing ? 'text-indigo-600' : 'text-blue-600'}`}>groups</span>
            참여 팀원 구성
          </label>
          <div className="flex flex-wrap gap-5 p-5 bg-slate-50 border border-slate-100 rounded-2xl">
            {project.members.map((avatar, idx) => (
              <div key={idx} className="relative group">
                <img src={avatar} className="size-14 rounded-full border-2 border-white shadow-md transition-transform group-hover:scale-110 object-cover" alt="Member" />
                {isEditing && (
                  <button className="absolute -top-1 -right-1 size-6 bg-red-500 text-white rounded-full flex items-center justify-center border-2 border-white hover:bg-red-600 shadow-sm transition-colors">
                    <span className="material-symbols-outlined text-[14px] font-bold">close</span>
                  </button>
                )}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">팀원 {idx + 1}</div>
              </div>
            ))}
            {isEditing && (
              <button className="size-14 rounded-full border-2 border-dashed border-indigo-200 flex items-center justify-center text-indigo-400 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                <span className="material-symbols-outlined">add</span>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[16px] ${isEditing ? 'text-indigo-600' : 'text-blue-600'}`}>description</span>
            상세 내용
          </label>
          <textarea rows={5} value={formData.description} readOnly={!isEditing} onChange={(e) => setFormData({...formData, description: e.target.value})}
            className={`w-full rounded-2xl px-5 py-4 text-slate-700 leading-relaxed transition-all outline-none resize-none border ${
                isEditing ? 'bg-white border-indigo-200 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400' : 'bg-slate-50 border-transparent'
            }`} />
        </div>

        <div className="space-y-2 pb-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[16px] ${isEditing ? 'text-indigo-600' : 'text-blue-600'}`}>attach_file</span>
            첨부 파일
          </label>
          <div className={`w-full rounded-2xl p-8 transition-all border ${
            isEditing 
            ? 'border-dashed border-indigo-200 bg-indigo-50/20 hover:bg-indigo-50 hover:border-indigo-400 cursor-pointer' 
            : 'bg-slate-50 border-transparent'
          }`}>
            {attachedFiles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <span className="material-symbols-outlined text-blue-600">description</span>
                    <span className="text-[13px] font-bold text-slate-700 truncate">{file.name}</span>
                    {isEditing && (
                       <button className="ml-auto text-red-400 hover:text-red-600">
                         <span className="material-symbols-outlined text-[20px]">delete</span>
                       </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                <span className="material-symbols-outlined text-5xl mb-3 opacity-20">cloud_off</span>
                <p className="text-sm font-bold tracking-tight">첨부파일 없음</p>
                {isEditing && <p className="text-[11px] mt-2 text-indigo-400 font-medium">업로드할 파일을 선택하거나 드래그하세요</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-8 flex items-center justify-end gap-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
        {!isEditing ? (
          <>
            <button onClick={onBack} className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors">목록으로</button>
            <button onClick={() => setIsEditing(true)} className="bg-blue-600 text-white px-8 py-3.5 rounded-2xl text-sm font-bold shadow-2xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px]">edit_square</span>
              수정 모드 전환
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setIsEditing(false)} className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors">수정 취소</button>
            <button onClick={handleSave} className="bg-indigo-600 text-white px-10 py-3.5 rounded-2xl text-sm font-bold shadow-2xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px]">save</span>
              수정 내용 저장
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectDetail;
