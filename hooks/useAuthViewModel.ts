import { useState, useEffect } from 'react';
import { User } from '../types';
import { LoginParams, SignupParams, UpdateProfileParams } from '../services/apiContract';
import { apiClient } from '../services/apiClient';

interface LoginResponse {
  token: string;
  user: User;
}

export const useAuthViewModel = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setIsInitialized(true);
      return;
    }

    const init = async () => {
      try {
        // Initial profile fetch attempt with a short timeout to avoid blocking UI during backend cold start
        const user = await apiClient.get<User>('/user/profile');
        setCurrentUser(user);
      } catch (error: any) {
        console.warn('Initial auth check failed, might be cold start:', error.message);
        // If it was a real auth error (401), clear token. If it was connection error (timeout/network),
        // we might want to stay in login state or keep token for a second attempt later.
        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
            localStorage.removeItem('authToken');
        }
      } finally {
        setIsInitialized(true);
      }
    };

    init();
  }, []);

  const actions = {
    login: async (params: LoginParams) => {
      if (!params.id || params.id.trim() === '') {
        return false;
      }

      try {
        const response = await apiClient.post<LoginResponse>('/auth/login', params);
        localStorage.setItem('authToken', response.token);
        setCurrentUser(response.user);

        if (params.rememberId) {
          localStorage.setItem('savedUserId', params.id);
        } else {
          localStorage.removeItem('savedUserId');
        }

        return true;
      } catch (error) {
        console.error('Login failed', error);
        return false;
      }
    },
    signup: async (params: SignupParams) => {
      try {
        await apiClient.post<User>('/auth/signup', params);
        alert('회원가입이 완료되었습니다. 로그인해주세요.');
        setAuthMode('login');
        return true;
      } catch (error) {
        console.error('Registering user failed:', error);
        alert('회원가입에 실패했습니다. 입력 정보를 확인해주세요.');
        return false;
      }
    },
    logout: () => {
      localStorage.removeItem('authToken');
      setCurrentUser(null);
      setAuthMode('login');
    },
    updateProfile: async (params: UpdateProfileParams) => {
      if (!currentUser) return false;
      try {
        const updated = await apiClient.patch<User>('/user/profile', params);
        setCurrentUser(updated);
        alert('프로필 정보가 수정되었습니다.');
        return true;
      } catch (error) {
        console.error('Profile update failed', error);
        return false;
      }
    },
    sendTempPassword: async (email: string) => {
      try {
        await apiClient.post<void>('/auth/forgot', { email });
        alert(`${email}로 임시 비밀번호가 발송되었습니다.`);
        setAuthMode('login');
      } catch (error) {
        console.error('Temp password failed', error);
        alert('임시 비밀번호 발송에 실패했습니다. 이메일을 확인해주세요.');
      }
    },
    setMode: (mode: 'login' | 'signup' | 'forgot') => setAuthMode(mode)
  };

  return {
    currentUser,
    authMode,
    isInitialized,
    actions
  };
};
