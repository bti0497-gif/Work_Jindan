
import { useState, useEffect } from 'react';
import { User } from '../types';
import { LoginParams, SignupParams, UpdateProfileParams } from '../services/apiContract';

export const useAuthViewModel = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [isInitialized, setIsInitialized] = useState(false);

  // 초기 로드 시 세션 확인 (Mock)
  useEffect(() => {
    const savedId = localStorage.getItem('savedUserId');
    // 실제로는 토큰 기반 체크를 수행
    setIsInitialized(true);
  }, []);

  const actions = {
    login: async (params: LoginParams) => {
      // Mock Login Logic
      /* master 전용 로그인 주석 처리
      if (params.id === 'master') {
        const mockUser: User = {
          id: 'master',
          name: '김진단 팀장',
          email: 'master@deojon.com',
          phone: '010-1234-5678',
          address: '경기도 성남시 분당구 판교역로 166',
          detailAddress: '카카오판교오피스 10층',
          avatar: 'https://picsum.photos/seed/master/100/100',
          role: 'master'
        };
        setCurrentUser(mockUser);
        if (params.rememberId) localStorage.setItem('savedUserId', params.id);
        else localStorage.removeItem('savedUserId');
        return true;
      }
      alert('아이디를 확인해주세요. (테스트용 ID: master)');
      return false;
      */

      // 범용 Mock Login (입력한 ID로 로그인 처리)
      const mockUser: User = {
        id: params.id,
        name: `${params.id} 연구원`,
        email: `${params.id}@deojon.com`,
        phone: '010-0000-0000',
        address: '등록된 주소 없음',
        detailAddress: '',
        avatar: `https://picsum.photos/seed/${params.id}/100/100`,
        role: 'user'
      };
      setCurrentUser(mockUser);
      if (params.rememberId) localStorage.setItem('savedUserId', params.id);
      return true;
    },
    
    signup: async (params: SignupParams) => {
      console.log('Registering user:', params);
      alert('회원가입이 완료되었습니다. 로그인해주세요.');
      setAuthMode('login');
      return true;
    },

    logout: () => {
      setCurrentUser(null);
      setAuthMode('login');
    },

    updateProfile: async (params: UpdateProfileParams) => {
      if (!currentUser) return false;
      const updated = { ...currentUser, ...params };
      setCurrentUser(updated as User);
      alert('프로필 정보가 수정되었습니다.');
      return true;
    },

    sendTempPassword: async (email: string) => {
      console.log(`Sending temp password to ${email} via Google Mail Server...`);
      alert(`${email}로 임시 비밀번호가 발송되었습니다.`);
      setAuthMode('login');
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
