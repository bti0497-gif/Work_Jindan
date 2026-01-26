'use client';
'use client';

// 공정관리 컴포넌트 - v1.1.0에서 완전 구현 예정
// Gantt 차트, 작업 의존성, 진척률 모니터링 기능 포함

// Per-project Kanban 컴포넌트는 본 파일 내에서 간단히 구현하는 MVP로 대체합니다.
// 색상 매핑: 업종/모듈별 색상 예시
const industryColor = (industry: string) => {
  switch (industry) {
    case '하수처리장': return 'bg-blue-600';
    case '오수처리장': return 'bg-amber-700';
    case '폐수처리장': return 'bg-purple-700';
    default: return 'bg-gray-200';
  }
};

export default function ProcessManager({ projectId }: { projectId?: string | null }) {
  // If a project is selected, render per-project Kanban view; otherwise show the MVP placeholder
  if (projectId) {
    // Inline 간단 Kanban (3 columns)
    const sampleTasks: { id: string; title: string; status: 'TO_DO'|'IN_PROGRESS'|'DONE' }[] = [
      { id: 't1', title: '요건 검토', status: 'TO_DO' },
      { id: 't2', title: '설계 초안', status: 'IN_PROGRESS' },
      { id: 't3', title: '리뷰 반영', status: 'DONE' }
    ];
    const byStatus = {
      TO_DO: sampleTasks.filter(t => t.status === 'TO_DO'),
      IN_PROGRESS: sampleTasks.filter(t => t.status === 'IN_PROGRESS'),
      DONE: sampleTasks.filter(t => t.status === 'DONE'),
    };
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">공정 관리 (프로젝트별)</h2>
          <span className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-md">프로젝트 ID: {projectId}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['TO_DO','IN_PROGRESS','DONE'] as const).map((col) => (
            <div key={col} className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col">
              <div className={`px-3 py-1 text-sm font-semibold ${col==='TO_DO'?'bg-yellow-50': col==='IN_PROGRESS'?'bg-blue-50':'bg-green-50'}`}>
                {col === 'TO_DO' ? '대기' : col === 'IN_PROGRESS' ? '진행 중' : '완료'}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                {byStatus[col].length === 0 ? (
                  <div className="text-xs text-gray-500">할 일이 없습니다.</div>
                ) : (
                  byStatus[col].map(t => (
                    <div key={t.id} className="mb-2 p-2 border rounded-md text-sm truncate" title={t.title}>{t.title}</div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">공정관리</h2>
        <p className="text-gray-600">프로젝트 일정과 공정을 체계적으로 관리합니다.</p>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 text-center border border-blue-200">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">고급 공정관리 시스템</h3>
          <p className="text-gray-700 mb-4">
            v1.1.0 업데이트에서 제공될 예정입니다
          </p>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-left mb-6">
        {[
          { id: 'gantt', label: '📊 Gantt 차트', industry: '하수처리장' },
          { id: 'dep', label: '🔄 의존성 관리', industry: '오수처리장' },
          { id: 'progress', label: '📈 진척률 모니터링', industry: '폐수처리장' },
        ].map((card) => (
          <div key={card.id} className="bg-white rounded-lg shadow-sm">
            <div className={`h-6 ${industryColor(card.industry)}`} />
            <div className="p-4">
              <h4 className="font-semibold text-gray-900 mb-2">{card.label}</h4>
              <p className="text-sm text-gray-600">{card.industry} 업종의 공정 관리를 시각화/정의합니다.</p>
            </div>
          </div>
        ))}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h4 className="font-semibold text-gray-900 mb-2">⚠️ 지연 알림</h4>
          <p className="text-sm text-gray-600">일정 지연을 자동으로 감지하고 관련자에게 알림을 보냅니다.</p>
        </div>
      </div>

        <div className="text-sm text-gray-500">
          <p>현재 버전: v1.0.0 | 공정관리 출시 예정: v1.1.0 (2024년 12월)</p>
          <p className="mt-1">업데이트 알림을 받으려면 앱의 자동 업데이트 기능을 활성화해주세요.</p>
        </div>
      </div>
    </div>
  );
}
