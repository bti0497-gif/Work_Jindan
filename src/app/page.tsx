'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import NewLoginForm from '@/components/NewLoginForm';
import NewRegisterForm from '@/components/NewRegisterForm';
import MainLayout from '@/components/MainLayout';

export default function Home() {
  const { data: session, status } = useSession();
  const [isRegistering, setIsRegistering] = useState(false);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return (
      <MainLayout>
        <div />
      </MainLayout>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
      {isRegistering ? (
        <NewRegisterForm onCancelClick={() => setIsRegistering(false)} />
      ) : (
        <NewLoginForm onRegisterClick={() => setIsRegistering(true)} />
      )}
    </div>
  );
}
