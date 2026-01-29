
import React from 'react';
import { Project, ProcessLog, FileInfo } from '../types';
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
        <span className="material-symbols-outlined text-amber-500">folder_shared</span>
        최근 공유 파일
      </h3>
      <button className="text-[11px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest">More</button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="pb-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">파일명</th>
            <th className="pb-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">용량</th>
            <th className="pb-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">상태 / 일시</th>
            <th className="pb-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">작성자</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {files.map((file) => (
            <tr key={file.id} className="group hover:bg-slate-50 transition-colors">
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-blue-500 transition-colors">
                    {file.type === 'pdf' ? 'picture_as_pdf' : file.type === 'xlsx' ? 'table_chart' : 'description'}
                  </span>
                  <span className="text-[13px] font-medium text-slate-700 truncate max-w-[200px]">{file.name}</span>
                </div>
              </td>
              <td className="py-3 text-[12px] text-slate-500 pr-4">{file.size}</td>
              <td className="py-3 pr-4">
                <div className="flex flex-col">
                  <span className={`text-[10px] font-bold ${file.action === 'Uploaded' ? 'text-blue-600' : 'text-red-500'}`}>
                    {file.action === 'Uploaded' ? '업로드됨' : '삭제됨'}
                  </span>
                  <span className="text-[11px] text-slate-400">{file.date}</span>
                </div>
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  <img src={`https://picsum.photos/seed/${file.user}/40/40`} className="size-5 rounded-full object-cover border border-slate-200" alt={file.user} />
                  <span className="text-[12px] font-medium text-slate-600">{file.user}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

const Dashboard: React.FC<DashboardProps> = ({ recentProjects }) => {
  // Mock Dashboard Data
  const mockProcessLogs: ProcessLog[] = [
    { id: 'l1', projectName: '영흥도 수질 진단 컨설팅', step: '수질 샘플 채취 분석', status: 'Completed', updatedAt: '2시간 전' },
    { id: 'l2', projectName: '공장 폐수 정화 모니터링', step: '센서 데이터 연동 테스트', status: 'In Progress', updatedAt: '30분 전' },
    { id: 'l3', projectName: '지하수 오염 확산 방지 프로젝트', step: '차단 벽 설계 시뮬레이션', status: 'Standby', updatedAt: '어제' },
  ];

  const mockFiles: FileInfo[] = [
    { id: 'f1', name: '영흥도_진단결과_최종.pdf', size: '4.2 MB', date: '2024.11.01 14:20', user: '이영희', action: 'Uploaded', type: 'pdf' },
    { id: 'f2', name: '데이터_시트_raw.xlsx', size: '12.8 MB', date: '2024.11.01 11:45', user: '박철수', action: 'Uploaded', type: 'xlsx' },
    { id: 'f3', name: '현장사진_임시.zip', size: '45.1 MB', date: '2024.10.31 16:10', user: '최지민', action: 'Deleted', type: 'zip' },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/30">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Section 1: Recent Projects */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 uppercase tracking-tight">
              <span className="material-symbols-outlined text-blue-600">dashboard_customize</span>
              최신 프로젝트
            </h3>
            <button className="text-[11px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest">See All Projects</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {recentProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </section>

        {/* Section 2: Split View for Processes and Files */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <LatestProcesses logs={mockProcessLogs} />
          <RecentFiles files={mockFiles} />
        </div>

        {/* Section 3: Placeholders for Gallery/Charts */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-32 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 flex flex-col justify-between text-white shadow-lg shadow-blue-200">
            <span className="material-symbols-outlined">analytics</span>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-80 tracking-widest">전체 공정율</p>
              <p className="text-2xl font-bold">78.4%</p>
            </div>
          </div>
          <div className="h-32 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between text-slate-400">
            <span className="material-symbols-outlined">add_photo_alternate</span>
            <p className="text-[11px] font-bold text-center">갤러리 섹션 (준비중)</p>
          </div>
          <div className="h-32 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between text-slate-400">
            <span className="material-symbols-outlined">calendar_month</span>
            <p className="text-[11px] font-bold text-center">주요 일정 (준비중)</p>
          </div>
        </section>

      </div>
    </main>
  );
};

export default Dashboard;
