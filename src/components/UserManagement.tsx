'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getUserLevelText, getUserLevelColor, UserLevel } from '@/lib/permissions';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  position?: string;
  userLevel: UserLevel;
  isActive: boolean;
  createdAt: string;
  _count?: {
    posts: number;
    comments: number;
  };
}

interface UserManagementLog {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
  manager: {
    name: string;
    email: string;
  };
  targetUser: {
    name: string;
    email: string;
  };
}

export default function UserManagement() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<UserManagementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState<'level' | 'deactivate'>('level');
  const [newLevel, setNewLevel] = useState<UserLevel>(2);
  const [reason, setReason] = useState('');

  // 사용자 목록 조회
  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('사용자 목록 조회 실패:', error);
    }
  };

  // 관리 로그 조회
  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/admin/users/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('관리 로그 조회 실패:', error);
    }
  };

  useEffect(() => {
    if (session?.user) {
      fetchUsers();
      fetchLogs();
      setLoading(false);
    }
  }, [session]);

  // 사용자 등급 변경
  const handleLevelChange = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch('/api/admin/users/level', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          newLevel,
          reason,
        }),
      });

      if (response.ok) {
        await fetchUsers();
        await fetchLogs();
        setShowModal(false);
        setReason('');
        alert('사용자 등급이 변경되었습니다.');
      } else {
        alert('등급 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('등급 변경 실패:', error);
      alert('등급 변경 중 오류가 발생했습니다.');
    }
  };

  // 사용자 비활성화/활성화
  const handleToggleActive = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch('/api/admin/users/toggle', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          reason,
        }),
      });

      if (response.ok) {
        await fetchUsers();
        await fetchLogs();
        setShowModal(false);
        setReason('');
        alert(`사용자가 ${selectedUser.isActive ? '비활성화' : '활성화'}되었습니다.`);
      } else {
        alert('상태 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('상태 변경 실패:', error);
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'LEVEL_CHANGE': return '등급 변경';
      case 'DEACTIVATE': return '비활성화';
      case 'ACTIVATE': return '활성화';
      case 'DELETE': return '삭제';
      default: return action;
    }
  };

  if (loading) return <div className="p-4">로딩 중...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">팀원 관리</h1>
        
        {/* 탭 네비게이션 */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('users')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              팀원 목록 ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'logs'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              관리 기록 ({logs.length})
            </button>
          </nav>
        </div>
      </div>

      {/* 팀원 목록 탭 */}
      {activeTab === 'users' && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    사용자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    연락처/직책
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    등급
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    활동
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    가입일
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {user.phone && (
                          <div className="text-sm text-gray-900">{user.phone}</div>
                        )}
                        {user.position && (
                          <div className="text-sm text-gray-500">{user.position}</div>
                        )}
                        {!user.phone && !user.position && (
                          <div className="text-sm text-gray-400">-</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getUserLevelColor(user.userLevel)}`}>
                        {getUserLevelText(user.userLevel)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.isActive ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>게시글 {user._count?.posts || 0}개</div>
                      <div>댓글 {user._count?.comments || 0}개</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {user.userLevel !== 0 && ( // 최고관리자는 관리 불가
                        <div className="space-x-2">
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setActionType('level');
                              setNewLevel(user.userLevel);
                              setShowModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            등급변경
                          </button>
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setActionType('deactivate');
                              setShowModal(true);
                            }}
                            className={`${
                              user.isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'
                            }`}
                          >
                            {user.isActive ? '비활성화' : '활성화'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 관리 기록 탭 */}
      {activeTab === 'logs' && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    관리자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    대상 사용자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    변경 내용
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    사유
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    일시
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{log.manager.name}</div>
                        <div className="text-sm text-gray-500">{log.manager.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{log.targetUser.name}</div>
                        <div className="text-sm text-gray-500">{log.targetUser.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                        {getActionText(log.action)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.oldValue && log.newValue && (
                        <span>{getUserLevelText(parseInt(log.oldValue) as UserLevel)} → {getUserLevelText(parseInt(log.newValue) as UserLevel)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {log.reason || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 관리 모달 */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {actionType === 'level' ? '등급 변경' : selectedUser.isActive ? '사용자 비활성화' : '사용자 활성화'}
              </h3>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  <strong>대상:</strong> {selectedUser.name} ({selectedUser.email})
                </p>
              </div>

              {actionType === 'level' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    새로운 등급
                  </label>
                  <select
                    value={newLevel}
                    onChange={(e) => setNewLevel(parseInt(e.target.value) as UserLevel)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={1}>관리자 (1등급)</option>
                    <option value={2}>일반회원 (2등급)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {newLevel === 1 ? 
                      '프로젝트 생성/수정/삭제, 공정관리, 팀일정 관리 권한' : 
                      '프로젝트 조회, 개인일정, 개인작업, 파일관리 권한만 가능'
                    }
                  </p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  사유 (선택사항)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="관리 사유를 입력하세요..."
                />
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={actionType === 'level' ? handleLevelChange : handleToggleActive}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  확인
                </button>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setReason('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}