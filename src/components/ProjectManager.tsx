'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Edit, Trash2, Building, MapPin, Phone, User, FileText, Calendar, AlertCircle } from 'lucide-react';
import { useProjects, useCurrentUser, useModal, useForm } from '@/shared/hooks/common';
import { Project } from '@/types/common';
import { PermissionWrapper, PermissionButton, StatusBadge } from '@/shared/components/common/PermissionComponents';

// 시설 유형 및 진단 타입 상수
const FACILITY_TYPES = [
  { value: '하수처리장', label: '하수처리장' },
  { value: '정수처리장', label: '정수처리장' },
  { value: '폐수처리장', label: '폐수처리장' },
];

const DIAGNOSIS_TYPES = [
  { value: '기계', label: '기계' },
  { value: '전기', label: '전기' },
  { value: '환경', label: '환경' },
  { value: '종합', label: '종합' },
];

export default function ProjectManager() {
  // 커스텀 훅 사용
  const { data: projects, loading, permissions, createItem, updateItem, deleteItem, fetchData } = useProjects();
  const { user, userLevel, isAuthenticated } = useCurrentUser();
  const { isOpen, mode, selectedItem, openModal, closeModal } = useModal<Project>();
  
  // 폼 초기값
  const initialFormValues = {
    name: '',
    description: '',
    facilityType: '하수처리장',
    facilityName: '',
    address: '',
    diagnosisType: '종합',
    startDate: '',
    endDate: '',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    specialNotes: '',
  };

  const { values, errors, isSubmitting, setValue, setError, reset, setIsSubmitting } = useForm(initialFormValues);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 프로젝트 생성/수정 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim() || !values.facilityName.trim()) {
      setError('name', '프로젝트명은 필수입니다.');
      setError('facilityName', '시설명은 필수입니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'edit' && selectedItem) {
        await updateItem(selectedItem.id, { ...values, status: selectedItem.status });
      } else {
        await createItem({ ...values, status: 'planning' });
      }
      closeModal();
      reset();
    } catch (error) {
      console.error('프로젝트 저장 오류:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 프로젝트 삭제 핸들러
  const handleDelete = async () => {
    if (!selectedItem || !confirm('정말로 이 프로젝트를 삭제하시겠습니까?')) return;

    try {
      await deleteItem(selectedItem.id);
      closeModal();
    } catch (error) {
      console.error('프로젝트 삭제 오류:', error);
    }
  };

  // 프로젝트 편집 시작
  const startEdit = (project: Project) => {
    Object.keys(initialFormValues).forEach(key => {
      setValue(key as keyof typeof initialFormValues, (project as any)[key] || '');
    });
    openModal('edit', project);
  };

  // 프로젝트 상태 변경
  const handleStatusChange = async (project: Project, newStatus: Project['status']) => {
    try {
      await updateItem(project.id, { status: newStatus });
    } catch (error) {
      console.error('상태 변경 오류:', error);
    }
  };

  const formatDate = (dateString?: string) => {
    return dateString ? new Date(dateString).toLocaleDateString('ko-KR') : '';
  };

  if (!isAuthenticated) {
    return <div className="p-4">로그인이 필요합니다.</div>;
  }

  return (
    <PermissionWrapper componentName="ProjectManager">
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
            <Building className="h-6 w-6 mr-2" />
            프로젝트 관리
          </h2>
          <PermissionButton
            requiredPermission="canCreateProject"
            onClick={() => openModal('create')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>새 프로젝트</span>
          </PermissionButton>
        </div>

        {/* 프로젝트 목록 */}
        {loading ? (
          <div className="text-center py-12">
            <Building className="h-8 w-8 text-gray-400 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-500">프로젝트를 불러오는 중...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map(project => (
              <div key={project.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-lg mb-1">{project.name}</h3>
                    <div className="flex items-center text-sm text-gray-600 mb-2">
                      <Building className="h-4 w-4 mr-1" />
                      <span>{project.facilityType}</span>
                      <span className="mx-2">•</span>
                      <span>{project.diagnosisType}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-2">
                    <PermissionButton
                      requiredPermission="canEditProject"
                      onClick={() => startEdit(project)}
                      className="p-2 text-gray-400 hover:text-blue-600"
                    >
                      <Edit className="h-4 w-4" />
                    </PermissionButton>
                    <PermissionButton
                      requiredPermission="canDeleteProject"
                      onClick={() => openModal('delete', project)}
                      className="p-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </PermissionButton>
                  </div>
                </div>

                <div className="space-y-3">
                  {project.facilityName && (
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="font-medium">{project.facilityName}</span>
                    </div>
                  )}

                  {project.address && (
                    <div className="flex items-start text-sm text-gray-600">
                      <MapPin className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                      <span>{project.address}</span>
                    </div>
                  )}

                  {project.contactPerson && (
                    <div className="flex items-center text-sm text-gray-600">
                      <User className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span>{project.contactPerson}</span>
                      {project.contactPhone && (
                        <>
                          <span className="mx-2">•</span>
                          <Phone className="h-3 w-3 mr-1" />
                          <span>{project.contactPhone}</span>
                        </>
                      )}
                    </div>
                  )}

                  {(project.startDate || project.endDate) && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span>
                        {formatDate(project.startDate)}
                        {project.startDate && project.endDate && ' ~ '}
                        {formatDate(project.endDate)}
                      </span>
                    </div>
                  )}

                  {project.specialNotes && (
                    <div className="flex items-start text-sm text-gray-600">
                      <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5 text-yellow-500" />
                      <span className="text-gray-700">{project.specialNotes}</span>
                    </div>
                  )}

                  {project.description && (
                    <div className="flex items-start text-sm text-gray-600">
                      <FileText className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                      <span>{project.description}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <StatusBadge status={project.status} type="project" />
                  
                  {project.memberCount && (
                    <div className="text-xs text-gray-500">
                      팀원 {project.memberCount}명
                    </div>
                  )}
                </div>

                {/* 상태 변경 버튼 */}
                <PermissionWrapper requiredPermission="canEditProject">
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['planning', 'active', 'completed', 'on_hold'].map(status => (
                      project.status !== status && (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(project, status as Project['status'])}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            status === 'planning' ? 'bg-yellow-100 hover:bg-yellow-200 text-yellow-700' :
                            status === 'active' ? 'bg-blue-100 hover:bg-blue-200 text-blue-700' :
                            status === 'completed' ? 'bg-green-100 hover:bg-green-200 text-green-700' :
                            'bg-red-100 hover:bg-red-200 text-red-700'
                          }`}
                        >
                          {status === 'planning' ? '계획' :
                           status === 'active' ? '진행중' :
                           status === 'completed' ? '완료' : '보류'}로 변경
                        </button>
                      )
                    ))}
                  </div>
                </PermissionWrapper>
              </div>
            ))}
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="text-center py-12">
            <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">프로젝트가 없습니다</h3>
            <p className="text-gray-500">첫 번째 프로젝트를 생성해보세요.</p>
          </div>
        )}

        {/* 모달 */}
        {isOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {mode === 'create' ? '새 프로젝트 생성' : 
                   mode === 'edit' ? '프로젝트 수정' : '프로젝트 삭제'}
                </h3>
                <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {mode === 'delete' ? (
                <div>
                  <p className="text-gray-600 mb-4">
                    정말로 "<strong>{selectedItem?.name}</strong>" 프로젝트를 삭제하시겠습니까?
                  </p>
                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* 기본 정보 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        프로젝트명 *
                      </label>
                      <input
                        type="text"
                        value={values.name}
                        onChange={(e) => setValue('name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="프로젝트명을 입력하세요"
                        required
                      />
                      {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        시설 유형 *
                      </label>
                      <select
                        value={values.facilityType}
                        onChange={(e) => setValue('facilityType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        {FACILITY_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        시설명 *
                      </label>
                      <input
                        type="text"
                        value={values.facilityName}
                        onChange={(e) => setValue('facilityName', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예: 서울시 중랑물재생센터"
                        required
                      />
                      {errors.facilityName && <p className="text-red-500 text-xs mt-1">{errors.facilityName}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        진단 분야
                      </label>
                      <select
                        value={values.diagnosisType}
                        onChange={(e) => setValue('diagnosisType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {DIAGNOSIS_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 주소 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      주소
                    </label>
                    <input
                      type="text"
                      value={values.address}
                      onChange={(e) => setValue('address', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="시설 주소를 입력하세요"
                    />
                  </div>

                  {/* 일정 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        시작일
                      </label>
                      <input
                        type="date"
                        value={values.startDate}
                        onChange={(e) => setValue('startDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        종료일
                      </label>
                      <input
                        type="date"
                        value={values.endDate}
                        onChange={(e) => setValue('endDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* 연락처 정보 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        담당자명
                      </label>
                      <input
                        type="text"
                        value={values.contactPerson}
                        onChange={(e) => setValue('contactPerson', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="담당자 이름"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        연락처
                      </label>
                      <input
                        type="tel"
                        value={values.contactPhone}
                        onChange={(e) => setValue('contactPhone', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="010-0000-0000"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        이메일
                      </label>
                      <input
                        type="email"
                        value={values.contactEmail}
                        onChange={(e) => setValue('contactEmail', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="example@email.com"
                      />
                    </div>
                  </div>

                  {/* 설명 및 특별 주의사항 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      프로젝트 설명
                    </label>
                    <textarea
                      value={values.description}
                      onChange={(e) => setValue('description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="프로젝트에 대한 설명을 입력하세요"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      특별 주의사항
                    </label>
                    <textarea
                      value={values.specialNotes}
                      onChange={(e) => setValue('specialNotes', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="특별히 주의해야 할 사항이나 메모를 입력하세요"
                    />
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
                    >
                      {isSubmitting ? '저장 중...' : (mode === 'edit' ? '수정' : '생성')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </PermissionWrapper>
  );
}