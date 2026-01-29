'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Edit, Trash2, Building, MapPin, Phone, User, FileText, Calendar, AlertCircle, Save, UserPlus } from 'lucide-react';
import { useProjects, useCurrentUser, useModal, useForm } from '@/shared/hooks/common';
import { Project, FacilityContact } from '@/types/common';
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

// 담당자 초기값
const initialContact = {
  name: '',
  position: '',
  phone: '',
  mobile: '',
  email: '',
  responsibilities: '',
  specialty: '',
  isPrimary: false,
  notes: ''
};

export default function ProjectManager() {
  // 커스텀 훅 사용
  const { data: projects, loading, permissions, createItem, updateItem, deleteItem, fetchData } = useProjects();
  const { user, userLevel, isAuthenticated } = useCurrentUser();
  const { isOpen, mode, selectedItem, openModal, closeModal } = useModal<Project>();
  
  // 처리장 담당자 관리 상태
  const [contacts, setContacts] = useState<Partial<FacilityContact>[]>([{ ...initialContact }]);
  const [editingContacts, setEditingContacts] = useState(false);
  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(null);
  
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

  // 전화번호 자동 포맷팅 함수
  const formatPhoneNumber = (value: string) => {
    // 숫자만 추출
    const numbers = value.replace(/[^\d]/g, '');
    
    // 자릿수에 따라 포맷팅
    if (numbers.length <= 3) {
      return numbers;
    } else if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    } else if (numbers.length <= 11) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
    } else {
      // 11자리 이상은 처음 11자리만 사용
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
    }
  };

  // 전화번호 입력 핸들러
  const handlePhoneChange = (field: keyof typeof initialFormValues, value: string) => {
    const formatted = formatPhoneNumber(value);
    setValue(field, formatted);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 담당자 추가/수정
  const addContact = () => {
    const currentContact = contacts[contacts.length - 1];
    
    // 현재 입력 중인 담당자가 유효한지 확인
    if (currentContact?.name && currentContact?.position) {
      if (editingContactIndex !== null) {
        // 수정 모드: 기존 담당자 업데이트
        const updatedContacts = [...contacts];
        updatedContacts[editingContactIndex] = { ...currentContact };
        
        // 주담당자 설정 처리
        if (currentContact.isPrimary) {
          updatedContacts.forEach((contact, index) => {
            if (index !== editingContactIndex) {
              contact.isPrimary = false;
            }
          });
        }
        
        // 마지막 입력 필드 초기화
        updatedContacts[updatedContacts.length - 1] = { ...initialContact };
        setContacts(updatedContacts);
        setEditingContactIndex(null);
      } else {
        // 추가 모드: 새 담당자 추가
        // 주담당자 설정 처리
        if (currentContact.isPrimary) {
          // 기존 주담당자 해제
          const updatedContacts = contacts.map((contact, index) => ({
            ...contact,
            isPrimary: index === contacts.length - 1
          }));
          setContacts([...updatedContacts, { ...initialContact }]);
        } else {
          setContacts([...contacts, { ...initialContact }]);
        }
      }
    }
  };

  // 담당자 제거
  const removeContact = (index: number) => {
    if (contacts.length > 1) {
      setContacts(contacts.filter((_, i) => i !== index));
      // 삭제된 담당자가 편집 중이던 담당자라면 편집 모드 취소
      if (editingContactIndex === index) {
        setEditingContactIndex(null);
        const lastIndex = contacts.length - 2; // 삭제 후 마지막 인덱스
        setContacts(prev => {
          const newContacts = prev.filter((_, i) => i !== index);
          newContacts[newContacts.length - 1] = { ...initialContact };
          return newContacts;
        });
      }
    }
  };

  // 담당자 정보 수정
  const updateContact = (index: number, field: keyof FacilityContact, value: any) => {
    const newContacts = [...contacts];
    
    // 전화번호 필드인 경우 자동 포맷팅 적용
    if (field === 'phone' || field === 'mobile') {
      value = formatPhoneNumber(value);
    }
    
    newContacts[index] = { ...newContacts[index], [field]: value };
    setContacts(newContacts);
  };

  // 주담당자 설정 (하나만 선택 가능)
  const setPrimaryContact = (index: number) => {
    const newContacts = contacts.map((contact, i) => ({
      ...contact,
      isPrimary: i === index
    }));
    setContacts(newContacts);
  };

  // 담당자 편집 시작
  const handleContactEdit = (index: number) => {
    const contact = contacts[index];
    if (contact) {
      // 마지막 입력 필드에 선택된 담당자 데이터 로드
      const lastIndex = contacts.length - 1;
      setContacts(prev => {
        const newContacts = [...prev];
        newContacts[lastIndex] = { ...contact };
        return newContacts;
      });
      setEditingContactIndex(index);
    }
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditingContactIndex(null);
    const lastIndex = contacts.length - 1;
    setContacts(prev => {
      const newContacts = [...prev];
      newContacts[lastIndex] = { ...initialContact };
      return newContacts;
    });
  };

  // 프로젝트 생성/수정 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 필수 필드 검증
    let hasError = false;
    
    if (!values.name.trim()) {
      setError('name', '프로젝트명은 필수입니다.');
      hasError = true;
    }
    
    if (!values.facilityName.trim()) {
      setError('facilityName', '시설명은 필수입니다.');
      hasError = true;
    }
    
    if (!values.startDate) {
      setError('startDate', '시작일은 필수입니다.');
      hasError = true;
    }
    
    if (!values.endDate) {
      setError('endDate', '종료일은 필수입니다.');
      hasError = true;
    }
    
    // 시작일과 종료일 관계 검증
    if (values.startDate && values.endDate && values.startDate > values.endDate) {
      setError('endDate', '종료일은 시작일보다 이후여야 합니다.');
      hasError = true;
    }
    
    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    try {
      let projectId: string;
      
      if (mode === 'edit' && selectedItem) {
        await updateItem(selectedItem.id, { ...values, status: selectedItem.status });
        projectId = selectedItem.id;
      } else {
        const result = await createItem({ ...values, status: 'planning' });
        if (result) {
          projectId = result.id;
        } else {
          throw new Error('프로젝트 생성에 실패했습니다.');
        }
      }

      // 담당자 정보 저장 기능 비활성화
      // if (contacts.some(c => c.name && c.position)) {
      //   await saveContacts(projectId);
      // }

      closeModal();
      reset();
      setContacts([{ ...initialContact }]);
    } catch (error) {
      console.error('프로젝트 저장 오류:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 담당자 정보 저장
  const saveContacts = async (projectId: string) => {
    const validContacts = contacts.filter(c => c.name && c.position);
    
    for (const contact of validContacts) {
      try {
        await fetch(`/api/projects/${projectId}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contact)
        });
      } catch (error) {
        console.error('담당자 저장 오류:', error);
      }
    }
  };

  // 프로젝트 담당자 불러오기 기능 비활성화
  const loadContacts = async (projectId: string) => {
    try {
      // 기능 비활성화
      return;
      // const response = await fetch(`/api/projects/${projectId}/contacts`);
      // if (response.ok) {
      //   const data = await response.json();
      //   setContacts(data.contacts?.length ? data.contacts : [{ ...initialContact }]);
      // }
      // 기능 비활성화
    } catch (error) {
      // 기능 비활성화
    }
  };

  // 프로젝트 편집 시작
  const startEdit = (project: Project) => {
    Object.keys(initialFormValues).forEach(key => {
      setValue(key as keyof typeof initialFormValues, (project as any)[key] || '');
    });
    // loadContacts(project.id); // 기능 비활성화
    openModal('edit', project);
  };

  // 담당자 정보 수정 토글 기능 비활성화
  const toggleContactEdit = (project: Project) => {
    if (editingContacts) {
      setEditingContacts(false);
    } else {
      // loadContacts(project.id); // 기능 비활성화
      setEditingContacts(true);
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

  // 프로젝트 상태 변경
  const handleStatusChange = async (project: Project, newStatus: Project['status']) => {
    try {
      await updateItem(project.id, { status: newStatus });
    } catch (error) {
      console.error('상태 변경 오류:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center">
          <Building className="h-5 w-5 mr-2" />
          기술진단 프로젝트 관리
        </h2>
        <PermissionWrapper requiredPermission="canCreateProject">
          <button
            onClick={() => openModal('create')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md flex items-center space-x-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            <span>새 프로젝트</span>
          </button>
        </PermissionWrapper>
      </div>

      {/* 프로젝트 목록 */}
      {loading ? (
        <div className="text-center py-8">
          <Building className="h-6 w-6 text-gray-400 mx-auto mb-2 animate-pulse" />
          <p className="text-sm text-gray-500">프로젝트를 불러오는 중...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(project => (
            <div key={project.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 text-sm leading-tight mb-1 truncate">
                    {project.name}
                  </h3>
                  <div className="flex items-center space-x-2 mb-2">
                    <StatusBadge status={project.status} type="project" />
                    {project.diagnosisType && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {project.diagnosisType}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-1 ml-2">
                  <PermissionWrapper requiredPermission="canEditProject">
                    <button
                      onClick={() => startEdit(project)}
                      className="p-1 text-gray-400 hover:text-blue-600 rounded"
                      title="프로젝트 수정"
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                  </PermissionWrapper>
                  <PermissionWrapper requiredPermission="canDeleteProject">
                    <button
                      onClick={() => openModal('delete', project)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                      title="프로젝트 삭제"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </PermissionWrapper>
                </div>
              </div>

              {/* 처리장 정보 */}
              {(project.facilityType || project.facilityName) && (
                <div className="mb-3 p-2 bg-gray-50 rounded text-xs">
                  <div className="flex items-center space-x-1 mb-1">
                    <Building className="h-3 w-3 text-gray-500" />
                    <span className="font-medium text-gray-700">
                      {project.facilityType} {project.facilityName && `- ${project.facilityName}`}
                    </span>
                  </div>
                  {project.address && (
                    <div className="flex items-start space-x-1">
                      <MapPin className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600 line-clamp-1">{project.address}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 연락처 정보 */}
              {project.contactPerson && (
                <div className="mb-3 flex items-center space-x-1 text-xs">
                  <User className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-600">{project.contactPerson}</span>
                  {project.contactPhone && (
                    <>
                      <span className="mx-1">•</span>
                      <Phone className="h-3 w-3 text-gray-400" />
                      <span className="text-gray-600">{project.contactPhone}</span>
                    </>
                  )}
                </div>
              )}

              {/* 일정 정보 */}
              {(project.startDate || project.endDate) && (
                <div className="mb-3 flex items-center space-x-1 text-xs">
                  <Calendar className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-600">
                    {project.startDate && new Date(project.startDate).toLocaleDateString('ko-KR')}
                    {project.startDate && project.endDate && ' ~ '}
                    {project.endDate && new Date(project.endDate).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              )}

              {/* 특별 주의사항 */}
              {project.specialNotes && (
                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                  <div className="flex items-start space-x-1">
                    <AlertCircle className="h-3 w-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <span className="text-yellow-800 line-clamp-2">{project.specialNotes}</span>
                  </div>
                </div>
              )}

              {/* 프로젝트 액션 */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  생성: {new Date(project.createdAt).toLocaleDateString('ko-KR')}
                </span>
                <div className="flex space-x-1">
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
                         status === 'active' ? '진행' : 
                         status === 'completed' ? '완료' : '보류'}
                      </button>
                    )
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && projects.length === 0 && (
        <div className="text-center py-8">
          <Building className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">프로젝트가 없습니다</h3>
          <p className="text-xs text-gray-500">새로운 기술진단 프로젝트를 생성해보세요.</p>
        </div>
      )}

      {/* 프로젝트 생성/수정 모달 */}
      {isOpen && mode !== 'delete' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  {mode === 'edit' ? '프로젝트 수정' : '새 프로젝트 생성'}
                </h3>
                <button
                  onClick={() => {
                    closeModal();
                    reset();
                    setContacts([{ ...initialContact }]);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    프로젝트명 *
                  </label>
                  <input
                    type="text"
                    value={values.name}
                    onChange={(e) => setValue('name', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="예: 2024년 서울시 중랑물재생센터 기술진단"
                    required
                  />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    진단 분야
                  </label>
                  <select
                    value={values.diagnosisType}
                    onChange={(e) => setValue('diagnosisType', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {DIAGNOSIS_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 처리장 정보 */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium text-gray-900 mb-2">처리장 정보</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      시설 유형 *
                    </label>
                    <select
                      value={values.facilityType}
                      onChange={(e) => setValue('facilityType', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    >
                      {FACILITY_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      시설명 *
                    </label>
                    <input
                      type="text"
                      value={values.facilityName}
                      onChange={(e) => setValue('facilityName', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="예: 서울시 중랑물재생센터"
                      required
                    />
                    {errors.facilityName && <p className="text-xs text-red-600 mt-1">{errors.facilityName}</p>}
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    주소
                  </label>
                  <input
                    type="text"
                    value={values.address}
                    onChange={(e) => setValue('address', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="시설 주소를 입력하세요"
                  />
                </div>
              </div>

              {/* 일정 */}
              <div className="border-t pt-3">
                <h4 className="text-sm font-medium text-gray-900 mb-2">진단 일정</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      시작일 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={values.startDate}
                      onChange={(e) => setValue('startDate', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {errors.startDate && (
                      <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      종료일 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={values.endDate}
                      onChange={(e) => setValue('endDate', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {errors.endDate && (
                      <p className="text-red-500 text-xs mt-1">{errors.endDate}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 처리장 담당자 관리 - 기능 비활성화 */}
              <div className="border-t pt-3">
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                    <span className="text-sm text-yellow-800">
                      담당자 관리 기능은 현재 개발 중입니다. 기본 프로젝트 정보만 저장됩니다.
                    </span>
                  </div>
                </div>

                {contacts.length > 0 && contacts.some(c => c.name && c.position) && (
                  <div className="mb-4">
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* 헤더 */}
                      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                        <div className="grid grid-cols-16 gap-1 text-xs font-medium text-gray-700">
                          <div className="col-span-2">이름</div>
                          <div className="col-span-2">직책</div>
                          <div className="col-span-2">전화번호</div>
                          <div className="col-span-2">휴대폰</div>
                          <div className="col-span-2">이메일</div>
                          <div className="col-span-2">전문분야</div>
                          <div className="col-span-3">담당업무</div>
                          <div className="col-span-1 text-center">삭제</div>
                        </div>
                      </div>
                      
                      {/* 담당자 목록 */}
                      <div className="bg-white max-h-32 overflow-y-auto">
                        {contacts.filter(c => c.name && c.position).map((contact, index) => {
                          const actualIndex = contacts.findIndex(c => c === contact);
                          return (
                            <div 
                              key={actualIndex} 
                              className="px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-blue-50 cursor-pointer"
                              onClick={() => handleContactEdit(actualIndex)}
                            >
                              <div className="grid grid-cols-16 gap-1 text-xs text-gray-600 items-center">
                                <div className="col-span-2 font-medium truncate" title={contact.name}>
                                  {contact.isPrimary && <span className="text-blue-600 mr-1">★</span>}
                                  {contact.name}
                                </div>
                                <div className="col-span-2 truncate" title={contact.position}>
                                  {contact.position}
                                </div>
                                <div className="col-span-2 truncate" title={contact.phone || '-'}>
                                  {contact.phone || '-'}
                                </div>
                                <div className="col-span-2 truncate" title={contact.mobile || '-'}>
                                  {contact.mobile || '-'}
                                </div>
                                <div className="col-span-2 truncate" title={contact.email || '-'}>
                                  {contact.email || '-'}
                                </div>
                                <div className="col-span-2 truncate" title={contact.specialty || '-'}>
                                  {contact.specialty || '-'}
                                </div>
                                <div className="col-span-3 truncate" title={contact.responsibilities || '-'}>
                                  {contact.responsibilities || '-'}
                                </div>
                                <div className="col-span-1 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeContact(actualIndex);
                                    }}
                                    className="text-red-600 hover:text-red-800 p-1"
                                    title="담당자 삭제"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 담당자 입력 폼 */}
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">
                      {editingContactIndex !== null ? '담당자 수정' : '새 담당자 추가'}
                    </span>
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={contacts[contacts.length - 1]?.isPrimary || false}
                          onChange={(e) => updateContact(contacts.length - 1, 'isPrimary', e.target.checked)}
                          className="mr-1 text-blue-600"
                        />
                        주담당자
                      </label>
                      {editingContactIndex !== null && (
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          취소
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* 입력 필드들 */}
                  <div className="grid grid-cols-16 gap-1 mb-2">
                    <input
                      type="text"
                      value={contacts[contacts.length - 1]?.name || ''}
                      onChange={(e) => updateContact(contacts.length - 1, 'name', e.target.value)}
                      className="col-span-2 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="이름*"
                    />
                    <input
                      type="text"
                      value={contacts[contacts.length - 1]?.position || ''}
                      onChange={(e) => updateContact(contacts.length - 1, 'position', e.target.value)}
                      className="col-span-2 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="직책*"
                    />
                    <input
                      type="tel"
                      value={contacts[contacts.length - 1]?.phone || ''}
                      onChange={(e) => updateContact(contacts.length - 1, 'phone', e.target.value)}
                      className="col-span-2 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="전화번호"
                    />
                    <input
                      type="tel"
                      value={contacts[contacts.length - 1]?.mobile || ''}
                      onChange={(e) => updateContact(contacts.length - 1, 'mobile', e.target.value)}
                      className="col-span-2 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="휴대폰"
                    />
                    <input
                      type="email"
                      value={contacts[contacts.length - 1]?.email || ''}
                      onChange={(e) => updateContact(contacts.length - 1, 'email', e.target.value)}
                      className="col-span-2 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="이메일"
                    />
                    <select
                      value={contacts[contacts.length - 1]?.specialty || ''}
                      onChange={(e) => updateContact(contacts.length - 1, 'specialty', e.target.value)}
                      className="col-span-2 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">전문분야</option>
                      <option value="기계">기계</option>
                      <option value="전기">전기</option>
                      <option value="환경">환경</option>
                      <option value="행정">행정</option>
                      <option value="총괄">총괄</option>
                    </select>
                    <input
                      type="text"
                      value={contacts[contacts.length - 1]?.responsibilities || ''}
                      onChange={(e) => updateContact(contacts.length - 1, 'responsibilities', e.target.value)}
                      className="col-span-3 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="담당업무"
                    />
                    <button
                      type="button"
                      onClick={addContact}
                      disabled={!contacts[contacts.length - 1]?.name || !contacts[contacts.length - 1]?.position}
                      className="col-span-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded flex items-center justify-center"
                      title={editingContactIndex !== null ? '수정' : '추가'}
                    >
                      {editingContactIndex !== null ? <Edit className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* 설명 및 특별사항 */}
              <div className="border-t pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      프로젝트 설명
                    </label>
                    <textarea
                      value={values.description}
                      onChange={(e) => setValue('description', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      rows={2}
                      placeholder="프로젝트에 대한 설명"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      특별 주의사항
                    </label>
                    <textarea
                      value={values.specialNotes}
                      onChange={(e) => setValue('specialNotes', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      rows={2}
                      placeholder="안전사항, 접근 제한 등"
                    />
                  </div>
                </div>
              </div>

              {/* 폼 액션 */}
              <div className="flex justify-end space-x-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => {
                    closeModal();
                    reset();
                    setContacts([{ ...initialContact }]);
                  }}
                  className="px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:bg-blue-400 flex items-center space-x-1"
                >
                  <Save className="h-3 w-3" />
                  <span>{isSubmitting ? '저장 중...' : mode === 'edit' ? '수정' : '생성'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {isOpen && mode === 'delete' && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">프로젝트 삭제</h3>
            </div>
            <p className="text-gray-600 mb-6">
              '{selectedItem.name}' 프로젝트를 정말로 삭제하시겠습니까? 
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}