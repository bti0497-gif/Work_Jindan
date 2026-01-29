import React from 'react';
import { Project, ProcessLog, FileInfo } from '@/types/common';
import ProjectCard from './ProjectCard';

interface DashboardProps {
  recentProjects: Project[];
}

const LatestProcesses: React.FC<{ logs: ProcessLog[] }> = ({ logs }) => (
  <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
    <div className="flex items-center justify-between mb-5">
      <h3 className="font-bold text-slate-900 flex items-center gap-2">
        <span className="material-symbols-outlined text-blue-600">account_tree</span>
        최신 공정 현황
      </h3>
      <button className="text-[11px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest">More</button>
    </div>
    <div className="space-y-4">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`size-2 rounded-full shrink-0 ${
              log.status === 'Completed' ? 'bg-green-500' : 
              log.status === 'In Progress' ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'
            }`}></div>
            <div className="min-w-0">
              {/* 공정명을 제목으로 강조 */}
              <p className="text-[13px] font-bold text-slate-800 truncate">{log.step}</p>
              {/* 소속 프로젝트명을 아래에 표시 */}
              <p className="text-[11px] text-slate-500 mt-0.5">{log.projectName}</p>
            </div>
          </div>
          <div className="text-right shrink-0 ml-4">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
              log.status === 'Completed' ? 'bg-green-100 text-green-700' :
              log.status === 'In Progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {log.status === 'Completed' ? '완료' : log.status === 'In Progress' ? '진행중' : '대기'}
            </span>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">{log.updatedAt}</p>
          </div>
        </div>
      ))}
    </div>
  </section>
);

const RecentFiles: React.FC<{ files: FileInfo[] }> = ({ files }) => (
  <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between mb-5">
      <h3 className="font-bold text-slate-900 flex items-center gap-2">
        <span className="material-symbols-outlined text-blue-600">folder_shared</span>
        최신 파일
      </h3>
      <button className="text-[11px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest">More</button>
    </div>
    <div className="space-y-3">
      {files.map((file) => (
        <div key={file.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
              file.type === 'pdf' ? 'bg-red-100' :
              file.type === 'xlsx' ? 'bg-green-100' :
              file.type === 'docx' ? 'bg-blue-100' :
              file.type === 'png' ? 'bg-purple-100' : 'bg-slate-100'
            }`}>
              <span className="material-symbols-outlined text-[14px]">
                {file.type === 'pdf' ? 'picture_as_pdf' :
                 file.type === 'xlsx' ? 'table_chart' :
                 file.type === 'docx' ? 'description' :
                 file.type === 'png' ? 'image' : 'insert_drive_file'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-slate-800 truncate">{file.name}</p>
              <p className="text-[11px] text-slate-500">{file.user} • {file.date}</p>
            </div>
          </div>
          <div className="text-right shrink-0 ml-4">
            <span className="text-[11px] font-medium text-slate-600">{file.size}</span>
            <p className={`text-[10px] font-medium ${
              file.action === 'Uploaded' ? 'text-green-600' : 'text-red-600'
            }`}>
              {file.action === 'Uploaded' ? '업로드' : '삭제'}
            </p>
          </div>
        </div>
      ))}
    </div>
  </section>
);

const Dashboard: React.FC<DashboardProps> = ({ recentProjects }) => {
  // Mock data for demonstration
  const mockProcessLogs: ProcessLog[] = [
    { id: '1', projectName: '영흥도 수질 진단', step: '현장 샘플 채취', status: 'Completed', updatedAt: '2024-11-05' },
    { id: '2', projectName: '대부도 환경 평가', step: '데이터 분석', status: 'In Progress', updatedAt: '2024-11-04' },
    { id: '3', projectName: '영흥도 수질 진단', step: '보고서 작성', status: 'Standby', updatedAt: '2024-11-03' },
  ];

  const mockRecentFiles: FileInfo[] = [
    { id: '1', name: '수질 분석 보고서.pdf', size: '2.4 MB', date: '2024-11-05', user: '김진단', action: 'Uploaded', type: 'pdf' },
    { id: '2', name: '샘플 데이터.xlsx', size: '856 KB', date: '2024-11-04', user: '이영희', action: 'Uploaded', type: 'xlsx' },
    { id: '3', name: '현장 사진.zip', size: '15.2 MB', date: '2024-11-03', user: '박철수', action: 'Deleted', type: 'zip' },
  ];

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="text-slate-600 mt-1">더죤환경 기술진단팀 협업스튜디오</p>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column - Recent Projects */}
        <div className="col-span-8">
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">dashboard</span>
                최근 프로젝트
              </h3>
              <button className="text-[11px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest">View All</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>
        </div>

        {/* Right Column - Processes and Files */}
        <div className="col-span-4 space-y-6">
          <LatestProcesses logs={mockProcessLogs} />
          <RecentFiles files={mockRecentFiles} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
