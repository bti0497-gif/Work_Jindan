"use client";
import React from 'react';

// Very lightweight, self-contained Project List View (MVP) with abundant dummy data
type Industry = '하수처리장' | '오수처리장' | '폐수처리장';
type DiagnosisStatus = 'DIAGNOSIS' | 'REPORT_DONE' | 'REVIEW_PENDING' | 'ACTIVE';

interface Owner {
  id: string;
  name: string;
}

interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  memberCount?: number;
  industry: Industry;
  owner?: Owner;
  diagnosisStatus?: DiagnosisStatus;
}

interface ProjectListViewProps {
  onProjectSelect?: (project: any) => void;
}

const industryColor = (industry: Industry) => {
  switch (industry) {
    case '하수처리장': return 'bg-blue-500';
    case '오수처리장': return 'bg-amber-700';
    case '폐수처리장': return 'bg-purple-700';
  }
};

const statusLabel = (s?: DiagnosisStatus) => {
  switch (s) {
    case 'DIAGNOSIS': return { text: '진단 중', cls: 'bg-blue-100 text-blue-800' };
    case 'REPORT_DONE': return { text: '보고서 작성 완료', cls: 'bg-green-100 text-green-800' };
    case 'REVIEW_PENDING': return { text: '검토 대기', cls: 'bg-amber-100 text-amber-800' };
    default: return { text: '진행 중', cls: 'bg-blue-100 text-blue-800' };
  }
};

const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
};

const dummyProjects: ProjectItem[] = [
  {
    id: 'P-001',
    name: '웹사이트 리뉴얼',
    description: '반응형 UI 개선, 접근성 최적화',
    updatedAt: new Date().toISOString(),
    memberCount: 5,
    industry: '하수처리장',
    owner: { id: 'u1', name: '김민수' },
    diagnosisStatus: 'DIAGNOSIS'
  },
  {
    id: 'P-002',
    name: '모바일 앱 개발',
    description: '푸시 알림 및 로그 수집',
    updatedAt: new Date().toISOString(),
    memberCount: 3,
    industry: '오수처리장',
    owner: { id: 'u2', name: '이영희' },
    diagnosisStatus: 'REPORT_DONE'
  },
  {
    id: 'P-003',
    name: '데이터 대시보드 구축',
    description: '실시간 데이터 시각화',
    updatedAt: new Date().toISOString(),
    memberCount: 4,
    industry: '폐수처리장',
    owner: { id: 'u3', name: '박상민' },
    diagnosisStatus: 'REVIEW_PENDING'
  },
  {
    id: 'P-004',
    name: '백오피스 개선',
    description: '로그인 리다이렉트 최적화',
    updatedAt: new Date().toISOString(),
    memberCount: 2,
    industry: '하수처리장',
    owner: { id: 'u4', name: '최지은' },
    diagnosisStatus: 'ACTIVE'
  },
  {
    id: 'P-005',
    name: '사이트 접근성 감사',
    description: '컬러 contrast/스크린리더',
    updatedAt: new Date().toISOString(),
    memberCount: 1,
    industry: '오수처리장',
    owner: { id: 'u5', name: '한수민' },
    diagnosisStatus: 'DIAGNOSIS'
  },
  {
    id: 'P-006',
    name: 'CRM 통합',
    description: '고객 데이터 파이프라인',
    updatedAt: new Date().toISOString(),
    memberCount: 6,
    industry: '폐수처리장',
    owner: { id: 'u6', name: '정수민' },
    diagnosisStatus: 'REPORT_DONE'
  }
];

export default function ProjectListView({ onProjectSelect }: ProjectListViewProps) {
  // 대체 데이터 소스: API가 준비되지 않으면 더미 데이터로 렌더링
  const [projects] = React.useState<ProjectItem[]>(dummyProjects);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortBy, setSortBy] = React.useState<'name' | 'updatedAt' | 'memberCount'>('updatedAt');
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 3;

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    switch (sortBy) {
      case 'name': return a.name.localeCompare(b.name);
      case 'memberCount': return (b.memberCount||0) - (a.memberCount||0);
      case 'updatedAt':
      default: return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProjects = (filtered.length > 0 ? filtered : projects).slice(startIndex, endIndex);

  const formatOwner = (name?: string) => {
    if (!name) return '';
    return name.charAt(0).toUpperCase();
  };

  const handleClick = (p: ProjectItem) => {
    if (onProjectSelect) onProjectSelect(p as any);
  };

  const industryGradient = (ind: Industry) => {
    return industryColor(ind);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">프로젝트 관리</h2>
          <p className="text-sm text-gray-600">프로젝트를 카드 뷰로 한눈에 확인하고 관리합니다</p>
        </div>
        <div className="flex items-center space-x-3">
          <input
            type="text"
            placeholder="검색…"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as any); setCurrentPage(1); }}
            className="border rounded-md px-2 py-2 text-sm"
          >
            <option value="updatedAt">최근 수정순</option>
            <option value="name">이름순</option>
            <option value="memberCount">멤버수순</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {currentProjects.map((p) => (
          <div key={p.id} className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md cursor-pointer" onClick={() => handleClick(p)}>
            <div className={`h-2 ${industryGradient(p.industry as Industry)}`}></div>
            <div className="p-4 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">{p.name}</h3>
                  <p className="text-sm text-gray-600 mb-1">{p.description}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center space-x-2 text-xs text-gray-600">
                  <span className={`px-2 py-1 rounded ${p.owner ? 'bg-gray-100' : ''}`}>
                    {p.owner ? `담당자: ${p.owner.name}` : '담당자 미정'}
                  </span>
                  <span className="px-2 py-1 rounded bg-gray-100">멤버 {p.memberCount ?? 0}명</span>
                </div>
                <span className="text-xs text-gray-500">{formatDate(p.updatedAt)}</span>
              </div>
              <div className={`mt-2 inline-flex items-center px-2 py-1 rounded text-xs font-medium ${p.diagnosisStatus === 'DIAGNOSIS' ? 'bg-blue-100 text-blue-800' : p.diagnosisStatus === 'REPORT_DONE' ? 'bg-green-100 text-green-800' : p.diagnosisStatus === 'REVIEW_PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'}`}>
                {p.diagnosisStatus === 'DIAGNOSIS' ? '진단 중' : p.diagnosisStatus === 'REPORT_DONE' ? '보고서 작성 완료' : p.diagnosisStatus === 'REVIEW_PENDING' ? '검토 대기' : '진행 중'}
              </div>
            </div>
            <div className="p-3 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-gray-600">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${p.owner?.name ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white'}`}>
                  {p.owner?.name?.charAt(0) ?? 'U'}
                </div>
                <span>{p.owner?.name ?? '미지정'}</span>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${p.industry === '하수처리장' ? 'bg-blue-100 text-blue-800' : p.industry === '오수처리장' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}`}>
                {p.industry}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 간이 페이징 */}
      <div className="flex justify-center items-center space-x-2 py-4 text-sm text-gray-600">
        {Array.from({ length: totalPages }).map((_, idx) => (
          <button key={idx} onClick={() => setCurrentPage(idx + 1)} className={`px-3 py-1 rounded ${idx + 1 === currentPage ? 'bg-blue-100 border border-blue-300' : 'hover:bg-gray-100'}`}>
            {idx + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
