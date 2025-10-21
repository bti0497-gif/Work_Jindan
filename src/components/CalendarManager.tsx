'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Users, Plus, X, Edit, RefreshCw, CheckSquare, Target } from 'lucide-react';

interface Schedule {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  projectId: string;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeId?: string;
  dueDate?: string;
  projectId: string;
  createdAt: string;
}

interface CalendarManagerProps {
  projectId: string | null;
}

export default function CalendarManager({ projectId }: CalendarManagerProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'calendar' | 'tasks'>('calendar');
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as Task['priority'],
    dueDate: '',
    dueTime: '',
  });

  // 일정 목록 조회
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

  // 작업 목록 조회
  const fetchTasks = async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks?projectId=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      } else {
        console.error('작업 조회 실패');
      }
    } catch (error) {
      console.error('작업 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 프로젝트가 변경될 때마다 데이터 조회
  useEffect(() => {
    if (activeView === 'calendar') {
      fetchSchedules();
    } else {
      fetchTasks();
    }
  }, [projectId, activeView]);

  // 새 일정 생성
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.startDate || !newEvent.startTime || !projectId) return;

    const startDateTime = `${newEvent.startDate}T${newEvent.startTime}:00`;
    const endDateTime = newEvent.endDate && newEvent.endTime 
      ? `${newEvent.endDate}T${newEvent.endTime}:00`
      : new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString().slice(0, 19);

    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newEvent.title,
          description: newEvent.description || null,
          startDate: startDateTime,
          endDate: endDateTime,
          projectId,
        }),
      });

      if (response.ok) {
        await fetchSchedules(); // 일정 목록 새로고침
        setNewEvent({
          title: '',
          description: '',
          startDate: '',
          startTime: '',
          endDate: '',
          endTime: '',
        });
        setIsCreatingEvent(false);
      } else {
        const errorData = await response.json();
        alert(errorData.error || '일정 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('일정 생성 오류:', error);
      alert('일정 생성 중 오류가 발생했습니다.');
    }
  };

  // 일정 삭제
  const handleDeleteEvent = async (scheduleId: string) => {
    if (!confirm('정말로 이 일정을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchSchedules(); // 일정 목록 새로고침
      } else {
        const errorData = await response.json();
        alert(errorData.error || '일정 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('일정 삭제 오류:', error);
      alert('일정 삭제 중 오류가 발생했습니다.');
    }
  };

  const formatDateTime = (dateTimeString: string) => {
    const date = new Date(dateTimeString);
    return {
      date: date.toLocaleDateString('ko-KR'),
      time: date.toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
    };
  };

  const getDurationText = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const durationMs = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
    }
    return `${minutes}분`;
  };

  const isUpcoming = (dateTimeString: string) => {
    return new Date(dateTimeString) > new Date();
  };

  // 프로젝트가 선택되지 않은 경우
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">프로젝트를 선택하세요</h3>
          <p className="text-gray-500">일정을 관리하려면 먼저 프로젝트를 선택해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">일정 & 작업 관리</h2>
        <div className="flex space-x-3">
          <button
            onClick={activeView === 'calendar' ? fetchSchedules : fetchTasks}
            disabled={loading}
            className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
          
          <button
            onClick={() => activeView === 'calendar' ? setIsCreatingEvent(true) : setIsCreatingTask(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>{activeView === 'calendar' ? '새 일정' : '새 작업'}</span>
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveView('calendar')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeView === 'calendar'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Calendar className="h-4 w-4 inline mr-2" />
            일정 관리
          </button>
          <button
            onClick={() => setActiveView('tasks')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeView === 'tasks'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CheckSquare className="h-4 w-4 inline mr-2" />
            작업 관리
          </button>
        </nav>
      </div>

      {isCreatingEvent && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                일정 제목 *
              </label>
              <input
                type="text"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="일정 제목을 입력하세요"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                설명
              </label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="일정에 대한 상세 설명을 입력하세요"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  시작 날짜 *
                </label>
                <input
                  type="date"
                  value={newEvent.startDate}
                  onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  시작 시간 *
                </label>
                <input
                  type="time"
                  value={newEvent.startTime}
                  onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  종료 날짜
                </label>
                <input
                  type="date"
                  value={newEvent.endDate}
                  onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  종료 시간
                </label>
                <input
                  type="time"
                  value={newEvent.endTime}
                  onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsCreatingEvent(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              >
                생성
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">일정을 불러오는 중...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
            .map((schedule) => {
              const startTime = formatDateTime(schedule.startDate);
              const endTime = formatDateTime(schedule.endDate);
              const upcoming = isUpcoming(schedule.startDate);
              
              return (
                <div
                  key={schedule.id}
                  className={`bg-white border rounded-lg p-4 ${
                    upcoming ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Calendar className={`h-5 w-5 ${upcoming ? 'text-blue-600' : 'text-gray-500'}`} />
                        <h3 className="font-semibold text-gray-900">{schedule.title}</h3>
                        {upcoming && (
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                            예정
                          </span>
                        )}
                      </div>
                      
                      {schedule.description && (
                        <p className="text-gray-600 mb-3">{schedule.description}</p>
                      )}
                      
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>
                            {startTime.date} {startTime.time} - {endTime.time}
                          </span>
                        </div>
                        
                        <span>({getDurationText(schedule.startDate, schedule.endDate)})</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        className="text-gray-400 hover:text-blue-600"
                        title="수정"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(schedule.id)}
                        className="text-gray-400 hover:text-red-600"
                        title="삭제"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {!loading && schedules.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Calendar className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">일정이 없습니다</h3>
          <p className="text-gray-500">새로운 일정을 추가해보세요.</p>
        </div>
      )}
    </div>
  );
}