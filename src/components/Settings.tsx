'use client';

import { useState } from 'react';
import { X, Save, Monitor, Sun, Moon } from 'lucide-react';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

type Theme = 'light' | 'dark' | 'system';
type Language = 'ko' | 'en';

export default function Settings({ isOpen, onClose }: SettingsProps) {
  const [settings, setSettings] = useState({
    theme: 'light' as Theme,
    language: 'ko' as Language,
    notifications: {
      email: true,
      push: true,
      teamUpdates: true,
      projectDeadlines: true,
    },
    privacy: {
      showOnlineStatus: true,
      allowDirectMessages: true,
    }
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    
    // 설정 저장 로직 (추후 구현)
    try {
      // localStorage에 저장
      localStorage.setItem('userSettings', JSON.stringify(settings));
      setMessage('설정이 저장되었습니다.');
      
      // 테마 적용 로직 (추후 구현)
      if (settings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      setMessage('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-0 border w-full max-w-2xl shadow-lg rounded-lg bg-white">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">설정</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* 메시지 표시 */}
        {message && (
          <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
            {message}
          </div>
        )}

        {/* 설정 내용 */}
        <div className="p-6 space-y-8">
          {/* 테마 설정 */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">테마</h3>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="theme"
                  value="light"
                  checked={settings.theme === 'light'}
                  onChange={(e) => setSettings({ ...settings, theme: e.target.value as Theme })}
                  className="mr-3 text-blue-600"
                />
                <Sun className="h-4 w-4 mr-2 text-yellow-500" />
                라이트 모드
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="theme"
                  value="dark"
                  checked={settings.theme === 'dark'}
                  onChange={(e) => setSettings({ ...settings, theme: e.target.value as Theme })}
                  className="mr-3 text-blue-600"
                />
                <Moon className="h-4 w-4 mr-2 text-blue-600" />
                다크 모드
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="theme"
                  value="system"
                  checked={settings.theme === 'system'}
                  onChange={(e) => setSettings({ ...settings, theme: e.target.value as Theme })}
                  className="mr-3 text-blue-600"
                />
                <Monitor className="h-4 w-4 mr-2 text-gray-600" />
                시스템 설정 따르기
              </label>
            </div>
          </div>

          {/* 언어 설정 */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">언어</h3>
            <select
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value as Language })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ko">한국어</option>
              <option value="en">English (준비 중)</option>
            </select>
          </div>

          {/* 알림 설정 */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">알림 설정</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">이메일 알림</span>
                <input
                  type="checkbox"
                  checked={settings.notifications.email}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, email: e.target.checked }
                  })}
                  className="text-blue-600 rounded"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">푸시 알림</span>
                <input
                  type="checkbox"
                  checked={settings.notifications.push}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, push: e.target.checked }
                  })}
                  className="text-blue-600 rounded"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">팀 업데이트</span>
                <input
                  type="checkbox"
                  checked={settings.notifications.teamUpdates}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, teamUpdates: e.target.checked }
                  })}
                  className="text-blue-600 rounded"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">프로젝트 마감일</span>
                <input
                  type="checkbox"
                  checked={settings.notifications.projectDeadlines}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, projectDeadlines: e.target.checked }
                  })}
                  className="text-blue-600 rounded"
                />
              </label>
            </div>
          </div>

          {/* 개인정보 설정 */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">개인정보</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">온라인 상태 표시</span>
                <input
                  type="checkbox"
                  checked={settings.privacy.showOnlineStatus}
                  onChange={(e) => setSettings({
                    ...settings,
                    privacy: { ...settings.privacy, showOnlineStatus: e.target.checked }
                  })}
                  className="text-blue-600 rounded"
                />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">다이렉트 메시지 허용</span>
                <input
                  type="checkbox"
                  checked={settings.privacy.allowDirectMessages}
                  onChange={(e) => setSettings({
                    ...settings,
                    privacy: { ...settings.privacy, allowDirectMessages: e.target.checked }
                  })}
                  className="text-blue-600 rounded"
                />
              </label>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}