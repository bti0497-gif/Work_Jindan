'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Bell, LogOut, Plus, Calendar, User, Settings, ChevronDown } from 'lucide-react';
// import UserProfile from '../UserProfile';
// import SettingsModal from '../Settings';

interface LeftSidebarProps {
  // 필요에 따라 나중에 props 추가 가능
}

interface UserSchedule {
  id: string;
  title: string;
  description?: string;
  date: string;
  isCompleted: boolean;
  isTeamEvent: boolean;
  userId: string;
  user: {
    id: string;
    name: string;
    avatar?: string;
    position?: string;
  };
}

export default function LeftSidebar({}: LeftSidebarProps = {}) {
  const { data: session } = useSession();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [todaySchedules, setTodaySchedules] = useState<UserSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingSchedule, setIsAddingSchedule] = useState(false);
  const [newScheduleTitle, setNewScheduleTitle] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [onlineUsersLoading, setOnlineUsersLoading] = useState(true);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 오늘의 일정 가져오기
  useEffect(() => {
    if (session?.user) {
      fetchTodaySchedules();
      fetchOnlineUsers();
      
      // 주기적으로 온라인 사용자 업데이트 (30초마다)
      const interval = setInterval(() => {
        updateUserStatus();
        fetchOnlineUsers();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [session]);

  const fetchOnlineUsers = async () => {
    try {
      const response = await fetch('/api/users/online');
      
      if (response.ok) {
        const data = await response.json();
        setOnlineUsers(data.users || []);
      } else {
        console.error('API 오류:', response.statusText);
      }
    } catch (error) {
      console.error('온라인 사용자 가져오기 실패:', error);
    } finally {
      setOnlineUsersLoading(false);
    }
  };

  const updateUserStatus = async () => {
    try {
      await fetch('/api/users/online', {
        method: 'POST',
      });
    } catch (error) {
      console.error('사용자 상태 업데이트 실패:', error);
    }
  };

  const fetchTodaySchedules = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/schedules/user?date=${today}`);
      
      if (response.ok) {
        const data = await response.json();
        setTodaySchedules(data.schedules || []);
      } else {
        setTodaySchedules([]);
      }
    } catch (error) {
      console.error('일정 가져오기 실패:', error);
      setTodaySchedules([]);
    } finally {
      setLoading(false);
    }
  };

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-400';
      case 'away': return 'bg-yellow-400';
      case 'offline': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  // 사용자 아바타 색상 매핑
  const getAvatarColor = (userId: string) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 
      'bg-red-500', 'bg-pink-500', 'bg-indigo-500', 'bg-yellow-500'
    ];
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  // 사용자 이니셜 가져오기
  const getUserInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  // 팀 일정과 개인 일정 분리
  const teamSchedules = todaySchedules.filter(schedule => schedule.isTeamEvent);
  const personalSchedules = todaySchedules.filter(schedule => !schedule.isTeamEvent);

  // 완료 상태 토글
  const toggleScheduleCompletion = async (scheduleId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/schedules/user/${scheduleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isCompleted: !currentStatus
        }),
      });

      if (response.ok) {
        await fetchTodaySchedules(); // 데이터 새로고침
      }
    } catch (error) {
      console.error('일정 상태 업데이트 실패:', error);
    }
  };

  // 새 일정 추가
  const addNewSchedule = async () => {
    if (!newScheduleTitle.trim()) return;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch('/api/schedules/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newScheduleTitle.trim(),
          date: today,
          isTeamEvent: false
        }),
      });

      if (response.ok) {
        setNewScheduleTitle('');
        setIsAddingSchedule(false);
        await fetchTodaySchedules(); // 데이터 새로고침
      }
    } catch (error) {
      console.error('일정 추가 실패:', error);
    }
  };

  return (
    <div className="w-full h-full bg-white shadow-lg flex flex-col overflow-hidden">
      {/* 사용자 정보 */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0 relative">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {session?.user?.name?.charAt(0) || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{session?.user?.name || '사용자'}</h3>
            <p className="text-xs text-gray-500 truncate">{session?.user?.email || 'email@example.com'}</p>
          </div>
          <div className="flex items-center space-x-1">
            {/* 알림 버튼 */}
            <button 
              className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors relative"
              title="알림"
            >
              <Bell className="h-4 w-4" />
              {/* 알림 배지 (예시) */}
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            
            {/* 사용자 메뉴 드롭다운 */}
            <div className="relative" ref={userMenuRef}>
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors flex items-center"
                title="사용자 메뉴"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {/* 드롭다운 메뉴 */}
              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <button 
                    onClick={() => {
                      setIsProfileOpen(true);
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <User className="h-4 w-4 mr-3" />
                    내 정보 수정
                  </button>
                  <button 
                    onClick={() => {
                      setIsSettingsOpen(true);
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <Settings className="h-4 w-4 mr-3" />
                    설정
                  </button>
                  <hr className="my-2 border-gray-200" />
                  <button 
                    onClick={() => signOut()}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
                  >
                    <LogOut className="h-4 w-4 mr-3" />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 오늘의 팀 일정 */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-900 flex items-center">
            <Calendar className="h-4 w-4 mr-2 text-blue-600" />
            오늘의 팀 일정
          </h4>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsAddingSchedule(!isAddingSchedule)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="일정 추가"
            >
              <Plus className="h-3 w-3 text-gray-600" />
            </button>
            <span className="text-xs text-gray-500">
              {new Date().toLocaleDateString('ko-KR', { 
                month: 'short', 
                day: 'numeric',
                weekday: 'short'
              })}
            </span>
          </div>
        </div>

        {/* 일정 추가 입력폼 */}
        {isAddingSchedule && (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg border">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newScheduleTitle}
                onChange={(e) => setNewScheduleTitle(e.target.value)}
                placeholder="새 일정을 입력하세요..."
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    addNewSchedule();
                  }
                }}
                autoFocus
              />
              <button
                onClick={addNewSchedule}
                className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
              >
                추가
              </button>
              <button
                onClick={() => {
                  setIsAddingSchedule(false);
                  setNewScheduleTitle('');
                }}
                className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}
        
        {/* 스크롤 가능한 일정 목록 */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-4">
                <div className="text-xs text-gray-500">일정을 불러오는 중...</div>
              </div>
            ) : (
              <>
                {/* 팀 일정 */}
                {teamSchedules.length > 0 && (
                  <>
                    <div className="text-xs font-medium text-blue-600 mb-2 flex items-center">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5"></div>
                      팀 공지 일정
                    </div>
                    {teamSchedules.map((schedule) => (
                      <div key={schedule.id} className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 rounded-lg p-3 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900 mb-1">{schedule.title}</div>
                            {schedule.description && (
                              <div className="text-xs text-gray-600 mb-2">{schedule.description}</div>
                            )}
                            <div className="flex items-center space-x-2">
                              <div className={`w-5 h-5 ${getAvatarColor(schedule.user.id)} rounded-full flex items-center justify-center flex-shrink-0`}>
                                <span className="text-white text-xs font-medium">{getUserInitial(schedule.user.name)}</span>
                              </div>
                              <span className="text-xs text-gray-600">{schedule.user.name}</span>
                              {schedule.user.position && (
                                <span className="text-xs text-gray-500">· {schedule.user.position}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {personalSchedules.length > 0 && (
                      <div className="border-t border-gray-200 my-3"></div>
                    )}
                  </>
                )}

                {/* 개인 일정 */}
                {personalSchedules.length > 0 && (
                  <>
                    <div className="text-xs font-medium text-green-600 mb-2 flex items-center">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></div>
                      팀원 개인 일정
                    </div>
                    {personalSchedules.map((schedule) => (
                      <div key={schedule.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <div className={`w-5 h-5 ${getAvatarColor(schedule.user.id)} rounded-full flex items-center justify-center flex-shrink-0`}>
                                <span className="text-white text-xs font-medium">{getUserInitial(schedule.user.name)}</span>
                              </div>
                              <span className="text-xs font-medium text-gray-900">{schedule.user.name}</span>
                              {schedule.user.position && (
                                <span className="text-xs text-gray-500">· {schedule.user.position}</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-800 mb-1">{schedule.title}</div>
                            {schedule.description && (
                              <div className="text-xs text-gray-600">{schedule.description}</div>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 ml-2">
                            {schedule.userId === session?.user?.id && (
                              <button
                                onClick={() => toggleScheduleCompletion(schedule.id, schedule.isCompleted)}
                                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                  schedule.isCompleted 
                                    ? 'bg-green-500 border-green-500' 
                                    : 'border-gray-300 hover:border-green-400'
                                }`}
                              >
                                {schedule.isCompleted && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            )}
                            {schedule.isCompleted && (
                              <span className="text-xs text-green-600 font-medium">완료</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* 일정이 없는 경우 */}
                {todaySchedules.length === 0 && (
                  <div className="text-center py-8">
                    <Calendar className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <div className="text-xs text-gray-500">오늘 등록된 일정이 없습니다</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 접속 중인 팀원들 */}
      <div className="border-t border-gray-200 flex-shrink-0">
        <div className="p-3 pb-1">
          <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></div>
            접속 중인 팀원 ({onlineUsers.filter(u => u.status === 'online').length}명)
          </h4>
        </div>
        
        {/* 스크롤 가능한 팀원 목록 */}
        <div className="max-h-48 overflow-y-auto px-3 pb-3">
          <div className="space-y-1">
            {onlineUsersLoading ? (
              <div className="text-center py-4">
                <div className="text-xs text-gray-500">팀원 목록을 불러오는 중...</div>
              </div>
            ) : onlineUsers.length === 0 ? (
              <div className="text-center py-4">
                <div className="text-xs text-gray-500">접속 중인 팀원이 없습니다</div>
              </div>
            ) : (
              onlineUsers.map((user) => (
                <div key={user.id} className="flex items-center space-x-2 p-1.5 rounded hover:bg-gray-50 transition-colors">
                  <div className={`w-6 h-6 ${getAvatarColor(user.id)} rounded-full flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white text-xs font-medium">{getUserInitial(user.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1">
                      <p className="text-xs font-medium text-gray-900 truncate">{user.name}</p>
                      {user.id === session?.user?.id && (
                        <span className="text-xs text-blue-600 font-medium">(나)</span>
                      )}
                    </div>
                    <div className="flex items-center">
                      <div className={`w-1.5 h-1.5 ${getStatusColor(user.status)} rounded-full mr-1`}></div>
                      <span className="text-xs text-gray-500">{user.lastSeenText}</span>
                      {user.position && (
                        <span className="text-xs text-gray-400 ml-1">· {user.position}</span>
                      )}
                    </div>
                  </div>
                  {user.status === 'online' && (
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse flex-shrink-0"></div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 하단 바텀 바 */}
      <div className="border-t border-gray-200 p-3 bg-gray-50 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
            <span>활성</span>
          </div>
          <div className="text-right">
            <div>Team Workspace</div>
            <div className="text-xs text-gray-400">v1.0.0</div>
          </div>
        </div>
      </div>

      {/* 사용자 프로필 모달 */}
      {/* <UserProfile 
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      /> */}
      
      {/* 설정 모달 */}
      {/* <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      /> */}
    </div>
  );
}