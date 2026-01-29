
import React, { useState } from 'react';

interface LoginProps {
  onLogin: (id: string, remember: boolean) => void;
  onGoSignUp: () => void;
  onGoForgot: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onGoSignUp, onGoForgot }) => {
  const [id, setId] = useState('');
  const [remember, setRemember] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(id, remember);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 p-6 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl p-10 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center mb-10">
          <div className="size-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-900/20">
            <span className="material-symbols-outlined text-white text-4xl">biotech</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">협업스튜디오 로그인</h1>
          <p className="text-slate-400 text-sm mt-2 font-medium tracking-wide">Deojon Environment Technology</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">User ID</label>
            <div className="relative group">
              <input 
                type="text" 
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="아이디를 입력하세요"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
              />
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">person</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Password</label>
            <div className="relative group">
              <input 
                type="password" 
                placeholder="비밀번호를 입력하세요"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
              />
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">lock</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-100 transition-all" 
              />
              <span className="text-[12px] font-bold text-slate-500 group-hover:text-slate-700 transition-colors">아이디 저장</span>
            </label>
            <button type="button" onClick={onGoForgot} className="text-[12px] font-bold text-slate-400 hover:text-blue-600 transition-colors">비밀번호 찾기</button>
          </div>

          <button 
            type="submit"
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-[0.98] transition-all mt-4"
          >
            스튜디오 입장하기
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-slate-50 text-center">
          <p className="text-[12px] text-slate-400 font-medium mb-4">아직 계정이 없으신가요?</p>
          <button 
            onClick={onGoSignUp}
            className="text-[13px] font-black text-blue-600 hover:underline underline-offset-4"
          >
            연구원 신규 등록 (회원가입)
          </button>
        </div>
      </div>
      
      <p className="absolute bottom-8 text-[11px] text-slate-600 font-bold tracking-widest uppercase">© 2024 DEOJON TECH STUDIO SYSTEM v2.4</p>
    </div>
  );
};

export default Login;
