import React, { useState } from 'react';

interface LoginProps {
  onLogin: (id: string, password: string, remember: boolean) => Promise<boolean>;
  onGoSignUp: () => void;
  onGoForgot: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onGoSignUp, onGoForgot }) => {
  const [id, setId] = useState(localStorage.getItem('savedUserId') || '');
  const [password, setPassword] = useState(''); 
  const [remember, setRemember] = useState(!!localStorage.getItem('savedUserId'));
  const [error, setError] = useState<string | null>(null);
  const [isServerConnecting, setIsServerConnecting] = useState(true);

  // Check backend availability on mount
  React.useEffect(() => {
    let mounted = true;
    const checkServer = async () => {
      try {
        // Try localhost first, fallback to 127.0.0.1 for faster resolution
        const response = await fetch('http://localhost:5000/api/health', { signal: AbortSignal.timeout(1000) });
        if (mounted && response.ok) {
          setIsServerConnecting(false);
          return;
        }
      } catch (e) {
        console.warn("Retrying server connection...", e);
      }
      
      if (mounted) setTimeout(checkServer, 1000);
    };
    checkServer();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!id.trim()) {
      setError('아이디를 입력해주세요.');
      return;
    }
    if (!password.trim()) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    const success = await onLogin(id, password, remember);
    if (!success) {
      setError('로그인에 실패했습니다. 정보를 확인해주세요.');
    }
  };

  return (
    <div className="h-full w-full flex flex-col items-center bg-slate-900 relative overflow-y-auto">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600 rounded-full blur-[140px]"></div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 w-full min-h-fit py-8 relative z-10">
        <div className="w-full max-w-[320px] bg-white rounded-[20px] shadow-2xl p-6 relative z-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center mb-5">
            <div className="size-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-[14px] flex items-center justify-center mx-auto mb-3 shadow-xl shadow-blue-500/20 transform hover:scale-105 transition-transform duration-500">
              <span className="material-symbols-outlined text-white text-2xl">microscope</span>
            </div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">협업스튜디오 로그인</h1>
            <p className="text-slate-400 text-[10px] mt-0.5 font-bold tracking-tight">더죤환경기술(주)</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">User ID</label>
              <div className="relative group">
                <input 
                  type="text" 
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    if(error) setError(null);
                  }}
                  placeholder="아이디를 입력하세요"
                  className={`w-full pl-9 pr-3 py-2.5 bg-slate-50 border rounded-lg text-slate-800 font-bold text-xs focus:bg-white focus:ring-4 transition-all outline-none ${
                    error && !id ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100 focus:ring-blue-50 focus:border-blue-400'
                  }`}
                />
                <span className={`material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] transition-colors ${
                  error && !id ? 'text-red-400' : 'text-slate-300 group-focus-within:text-blue-500'
                }`}>person</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Password</label>
              <div className="relative group">
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if(error) setError(null);
                  }}
                  placeholder="비밀번호를 입력하세요"
                  className={`w-full pl-9 pr-3 py-2.5 bg-slate-50 border rounded-lg text-slate-800 font-bold text-xs focus:bg-white focus:ring-4 transition-all outline-none ${
                    error && !password ? 'border-red-300 ring-4 ring-red-50' : 'border-slate-100 focus:ring-blue-50 focus:border-blue-400'
                  }`}
                />
                <span className={`material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] transition-colors ${
                  error && !password ? 'text-red-400' : 'text-slate-300 group-focus-within:text-blue-500'
                }`}>lock</span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 px-1 text-red-500 animate-in fade-in slide-in-from-top-1">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span className="text-[10px] font-bold">{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-100 transition-all" 
                />
                <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-700 transition-colors">아이디 저장</span>
              </label>
              <button type="button" onClick={onGoForgot} className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors">비밀번호 찾기</button>
            </div>

            <button 
              type="submit"
              disabled={isServerConnecting}
              className={`w-full py-3 rounded-lg font-bold text-xs shadow-lg transition-all mt-2 ${
                isServerConnecting 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700 active:scale-[0.98]'
              }`}
            >
              {isServerConnecting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                  서버 연결 대기 중...
                </div>
              ) : '스튜디오 입장하기'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-50 text-center">
            <p className="text-[10px] text-slate-400 font-medium mb-3">아직 계정이 없으신가요?</p>
            <button 
              onClick={onGoSignUp}
              className="text-[11px] font-black text-blue-600 hover:underline underline-offset-4"
            >
              진단팀원 신규등록 (회원가입)
            </button>
          </div>
        </div>
      </div>
      
      <div className="p-8 shrink-0">
        <p className="text-[11px] text-slate-600 font-bold tracking-widest uppercase">Developed by BTI0497</p>
      </div>
    </div>
  );
};

export default Login;
