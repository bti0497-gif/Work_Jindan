'use client';

import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

interface Schedule {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  projectId: string;
  createdAt: string;
}

interface ScheduleTaskManagerProps {
  projectId: string | null;
}

export default function ScheduleTaskManager({ projectId }: ScheduleTaskManagerProps) {
  // 상태 관리
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  
  // 폼 상태
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleDescription, setScheduleDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // 일정 조회
  const fetchSchedules = async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/schedules?projectId=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setSchedules(data.schedules || []);
      } else if (response.status === 403) {
        console.warn('프로젝트 일정 접근 권한이 없습니다.');
        setSchedules([]);
      } else {
        console.error('일정 조회 실패:', response.status, response.statusText);
        setSchedules([]);
      }
    } catch (error) {
      console.error('일정 조회 오류:', error);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  // 효과
  useEffect(() => {
    fetchSchedules();
  }, [projectId]);

  // 일정 생성/수정
  const handleSaveSchedule = async () => {
    if (!scheduleTitle.trim() || !projectId) return;

    const startDateTime = `${selectedDate.toISOString().split('T')[0]}T09:00:00`;
    const endDateTime = `${selectedDate.toISOString().split('T')[0]}T10:00:00`;

    try {
      if (isEditing && selectedSchedule) {
        // 수정
        const response = await fetch(`/api/schedules/${selectedSchedule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: scheduleTitle,
            description: scheduleDescription,
          }),
        });

        if (response.ok) {
          await fetchSchedules();
          resetForm();
        } else {
          alert('일정 수정에 실패했습니다.');
        }
      } else {
        // 생성
        const response = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: scheduleTitle,
            description: scheduleDescription,
            startDate: startDateTime,
            endDate: endDateTime,
            projectId,
          }),
        });

        if (response.ok) {
          await fetchSchedules();
          resetForm();
        } else {
          alert('일정 생성에 실패했습니다.');
        }
      }
    } catch (error) {
      console.error('일정 저장 오류:', error);
      alert('일정 저장 중 오류가 발생했습니다.');
    }
  };

  // 폼 초기화
  const resetForm = () => {
    setScheduleTitle('');
    setScheduleDescription('');
    setSelectedSchedule(null);
    setIsEditing(false);
  };

  // 일정 선택
  const handleScheduleSelect = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setScheduleTitle(schedule.title);
    setScheduleDescription(schedule.description || '');
    setIsEditing(true);
  };

  // 달력 관련 함수들
  const getDaysInMonth = (date: Date): Date[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: Date[] = [];

    // 이전 달의 날짜들
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }

    // 현재 달의 날짜들
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    // 다음 달의 날짜들 (42개 칸을 채우기 위해)
    const totalDays = 42;
    const remainingDays = totalDays - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push(new Date(year, month + 1, i));
    }

    return days;
  };

  const getSchedulesForDate = (date: Date): Schedule[] => {
    const dateStr = date.toISOString().split('T')[0];
    return schedules.filter(schedule => {
      const scheduleDate = new Date(schedule.startDate).toISOString().split('T')[0];
      return scheduleDate === dateStr;
    });
  };

  const getSchedulesForSelectedDate = (): Schedule[] => {
    return getSchedulesForDate(selectedDate);
  };

  const getAllUpcomingSchedules = (): Schedule[] => {
    const today = new Date();
    return schedules.filter(schedule => {
      const scheduleDate = new Date(schedule.startDate);
      return scheduleDate >= today;
    }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  };

  const formatTime = (dateTimeString: string): string => {
    return new Date(dateTimeString).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // 이전/다음 달로 이동
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelectedDate = (date: Date): boolean => {
    return date.toDateString() === selectedDate.toDateString();
  };

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentMonth.getMonth();
  };

  // 프로젝트가 선택되지 않은 경우
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">프로젝트를 선택하세요</h3>
          <p className="text-gray-500">일정을 관리하려면 먼저 프로젝트를 선택해주세요.</p>
        </div>
      </div>
    );
  }

  const days = getDaysInMonth(currentMonth);
  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">일정 관리</h2>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 왼쪽: 달력 컴포넌트 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="mb-4">
            {/* 달력 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {currentMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
              </h3>
              <div className="flex space-x-2">
                <button
                  onClick={goToPreviousMonth}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={goToNextMonth}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div key={day} className="text-center text-sm font-medium text-gray-700 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* 달력 그리드 */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                const schedulesForDay = getSchedulesForDate(day);
                const isCurrentMonthDay = isCurrentMonth(day);
                const isTodayDay = isToday(day);
                const isSelected = isSelectedDate(day);

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    className={`relative h-12 text-sm border border-gray-100 ${
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : isCurrentMonthDay
                        ? isTodayDay
                          ? 'bg-blue-100 text-blue-600 font-medium'
                          : 'hover:bg-gray-50'
                        : 'text-gray-300'
                    }`}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span>{day.getDate()}</span>
                      {schedulesForDay.length > 0 && (
                        <span className={`text-xs ${isSelected ? 'text-white' : 'text-red-500'}`}>
                          •{schedulesForDay.length}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 오른쪽: 일정 리스트 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="space-y-4">
            {/* 전체 일정 (공지사항 스타일) */}
            <div className="border-b pb-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">📢 다가오는 일정</h4>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {getAllUpcomingSchedules().slice(0, 3).map((schedule) => (
                  <div key={schedule.id} className="text-xs text-gray-600 flex items-center space-x-2">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(schedule.startDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
                    <span className="truncate">{schedule.title}</span>
                  </div>
                ))}
                {getAllUpcomingSchedules().length === 0 && (
                  <p className="text-xs text-gray-400">등록된 일정이 없습니다.</p>
                )}
              </div>
            </div>

            {/* 선택된 날짜의 일정 */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                {formatDate(selectedDate)} 일정
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {getSchedulesForSelectedDate().map((schedule) => (
                  <div
                    key={schedule.id}
                    onClick={() => handleScheduleSelect(schedule)}
                    className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer border border-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <h5 className="font-medium text-gray-900">{schedule.title}</h5>
                      <span className="text-xs text-gray-500">
                        {formatTime(schedule.startDate)}
                      </span>
                    </div>
                    {schedule.description && (
                      <p className="text-sm text-gray-600 mt-1 truncate">{schedule.description}</p>
                    )}
                  </div>
                ))}
                {getSchedulesForSelectedDate().length === 0 && (
                  <p className="text-sm text-gray-400">이 날짜에 등록된 일정이 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하단: 일정 추가/수정 폼 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          {isEditing ? '일정 수정' : '새 일정 추가'}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">제목</label>
            <input
              type="text"
              value={scheduleTitle}
              onChange={(e) => setScheduleTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="일정 제목을 입력하세요"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">설명</label>
            <textarea
              value={scheduleDescription}
              onChange={(e) => setScheduleDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="일정에 대한 상세 설명을 입력하세요"
            />
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">
              선택된 날짜: {formatDate(selectedDate)}
            </span>
            <div className="flex space-x-3">
              {isEditing && (
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  취소
                </button>
              )}
              <button
                onClick={handleSaveSchedule}
                disabled={!scheduleTitle.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md"
              >
                {isEditing ? '수정' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}