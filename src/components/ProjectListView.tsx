'use client';

import { useState, useEffect } from 'react';
import { useProjects } from '@/hooks/common';
import { Project } from '@/types/database';
import { usePermissions } from '@/lib/permissions';
import { useSession } from 'next-auth/react';
import { UserLevel } from '@/lib/permissions';

interface ProjectListViewProps {
  onProjectSelect?: (project: Project) => void;
}

export default function ProjectListView({ onProjectSelect }: ProjectListViewProps) {
  const { data: session } = useSession();
  const userLevel = session?.user?.userLevel as UserLevel;
  const permissions = usePermissions(userLevel);
  
  const { data: projects, loading, error, fetchData } = useProjects();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'memberCount'>('updatedAt');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3; // 3개씩 한 줄

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 검색 및 정렬 필터링
  const filteredAndSortedProjects = projects
    .filter(project =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'memberCount':
          return (b.memberCount || 0) - (a.memberCount || 0);
        case 'updatedAt':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

  // 페이지네이션 계산
  const totalPages = Math.ceil(filteredAndSortedProjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProjects = filteredAndSortedProjects.slice(startIndex, endIndex);

  // 검색어나 정렬이 변경되면 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  const handleProjectClick = (project: Project) => {
    if (onProjectSelect) {
      onProjectSelect(project);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'COMPLETED': return 'bg-blue-100 text-blue-800';
      case 'ON_HOLD': return 'bg-yellow-100 text-yellow-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE': return '진행중';
      case 'COMPLETED': return '완료';
      case 'ON_HOLD': return '대기';
      case 'CANCELLED': return '취소';
      default: return '알 수 없음';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">프로젝트 목록을 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">오류 발생</h3>
            <div className="mt-2 text-sm text-red-700">
              {error}
            </div>
            <div className="mt-4">
              <button
                onClick={() => fetchData()}
                className="bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded text-sm"
              >
                다시 시도
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  return (
    <div className="p-6">
      {/* 검색 및 필터 */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="프로젝트명 또는 설명으로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="sm:w-48">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'updatedAt' | 'memberCount')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="updatedAt">최근 수정순</option>
            <option value="name">이름순</option>
            <option value="memberCount">멤버수순</option>
          </select>
        </div>
      </div>

      {/* 프로젝트 카드 그리드 */}
      {filteredAndSortedProjects.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">📋</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? '검색 결과가 없습니다' : '등록된 프로젝트가 없습니다'}
          </h3>
          <p className="text-gray-600">
            {searchTerm ? '다른 키워드로 검색해보세요' : '새 프로젝트를 생성해보세요'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-6 mb-8">
            {currentProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project)}
              className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer border border-gray-200 hover:border-blue-300"
            >
              <div className="p-6">
                {/* 프로젝트 헤더 */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
                      {project.name}
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                      {getStatusText(project.status)}
                    </span>
                  </div>
                </div>

                {/* 프로젝트 설명 */}
                {project.description && (
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {project.description}
                  </p>
                )}

                {/* 프로젝트 정보 */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-500">
                    <span className="font-medium mr-2">멤버:</span>
                    <span>{project.memberCount || 0}명</span>
                  </div>
                  
                  {project.scheduleCount !== undefined && (
                    <div className="flex items-center text-sm text-gray-500">
                      <span className="font-medium mr-2">일정:</span>
                      <span>{project.scheduleCount}개</span>
                    </div>
                  )}
                  
                  {project.taskCount !== undefined && (
                    <div className="flex items-center text-sm text-gray-500">
                      <span className="font-medium mr-2">작업:</span>
                      <span>{project.taskCount}개</span>
                    </div>
                  )}

                  {project.fileCount !== undefined && (
                    <div className="flex items-center text-sm text-gray-500">
                      <span className="font-medium mr-2">파일:</span>
                      <span>{project.fileCount}개</span>
                    </div>
                  )}
                </div>

                {/* 프로젝트 푸터 */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    {formatDate(project.updatedAt)}
                  </div>
                  <div className="flex items-center space-x-2">
                    {project.owner && (
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                          {project.owner.name.charAt(0)}
                        </div>
                        <span className="text-xs text-gray-600 ml-1">
                          {project.owner.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center text-sm text-gray-500">
                <span>
                  {filteredAndSortedProjects.length}개 중 {startIndex + 1}-{Math.min(endIndex, filteredAndSortedProjects.length)}개 표시
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {/* 이전 페이지 버튼 */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  이전
                </button>

                {/* 페이지 번호들 */}
                {generatePageNumbers().map((page) => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-2 text-sm font-medium rounded-md ${
                      currentPage === page
                        ? 'text-blue-600 bg-blue-50 border border-blue-300'
                        : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                {/* 다음 페이지 버튼 */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}