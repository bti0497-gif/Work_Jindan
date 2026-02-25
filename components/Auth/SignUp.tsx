import React, { useState, useRef, useEffect } from 'react';
import { apiClient } from '../../services/apiClient';

declare global {
  interface Window {
    daum?: { Postcode: new (options: { oncomplete: (data: { address: string }) => void }) => { open: () => void } };
  }
}

interface SignUpProps {
  onSignUp: (data: any) => void;
  onBack: () => void;
}

const SignUp: React.FC<SignUpProps> = ({ onSignUp, onBack }) => {
  const [formData, setFormData] = useState({
    id: '', name: '', email: '', phone: '', address: '', detailAddress: '', avatar: 'https://picsum.photos/seed/default/100/100', password: '', passwordConfirm: ''
  });
  const [idAvailable, setIdAvailable] = useState<boolean | null>(null);
  const [emailChecked, setEmailChecked] = useState<boolean>(false);
  const [phoneValid, setPhoneValid] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scriptLoadedRef = useRef<boolean>(false);

  const isEmailValid = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const allowedEmailDomains = new Set([
    'naver.com',
    'daum.net',
    'hanmail.net',
    'gmail.com',
    'outlook.com',
    'hotmail.com'
  ]);

  const isEmailDomainAllowed = (email: string) => {
    const domain = email.split('@')[1]?.toLowerCase();
    return !!domain && allowedEmailDomains.has(domain);
  };

  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };

  const isPhoneValid = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11;
  };

  useEffect(() => {
    if (scriptLoadedRef.current) return;
    const scriptId = 'daum-postcode-script';
    if (document.getElementById(scriptId)) {
      scriptLoadedRef.current = true;
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
    };
    document.body.appendChild(script);
  }, []);

  const handleAvatarSelect = (url: string) => {
    setFormData(prev => ({ ...prev, avatar: url }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, avatar: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const checkId = async () => {
    if (!formData.id || formData.id.length < 4) {
      alert("아이디는 4자 이상 입력해야 합니다.");
      return;
    }

    try {
      const result = await apiClient.get<{ available: boolean }>(`/auth/check-id?id=${encodeURIComponent(formData.id)}`);
      setIdAvailable(result.available);
      alert(result.available ? "사용 가능한 아이디입니다." : "이미 사용 중인 아이디입니다.");
    } catch (error) {
      console.error('ID check failed', error);
      alert("아이디 확인에 실패했습니다.");
    }
  };

  const checkEmail = () => {
    if (!formData.email || !isEmailValid(formData.email)) {
      alert("유효한 이메일 주소를 입력해주세요.");
      setEmailChecked(false);
      return;
    }
    if (!isEmailDomainAllowed(formData.email)) {
      alert("사용 가능한 이메일 도메인이 아닙니다. (naver/daum/gmail 등)");
      setEmailChecked(false);
      return;
    }
    setEmailChecked(true);
    alert("사용 가능한 이메일 형식입니다.");
  };

  const handleAddressSearch = () => {
    if (!window.daum?.Postcode) {
      alert("주소 검색 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data: { address: string }) => {
        setFormData(prev => ({ ...prev, address: data.address }));
      }
    }).open();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // [STRICT CHECK] 모든 필드 필수 입력 확인
    const { id, name, email, phone, address, detailAddress, password, passwordConfirm } = formData;
    if (!id || !name || !email || !phone || !address || !detailAddress || !password || !passwordConfirm) {
      alert("모든 필수 입력란을 작성해야 회원가입이 가능합니다.");
      return;
    }

    if (!isEmailValid(email)) {
      alert("유효한 이메일 주소를 입력해주세요. (비밀번호 찾기 시 필요)");
      return;
    }

    if (idAvailable === null) {
      alert("아이디 중복 확인이 필요합니다.");
      return;
    }

    if (!isPhoneValid(phone)) {
      alert("연락처 형식이 올바르지 않습니다.");
      setPhoneValid(false);
      return;
    }

    if (!emailChecked) {
      alert("이메일 형식 확인이 필요합니다.");
      return;
    }
    if (!isEmailDomainAllowed(email)) {
      alert("사용 가능한 이메일 도메인이 아닙니다.");
      return;
    }

    if (password !== passwordConfirm) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    onSignUp(formData);
  };

  return (
    <div className="h-full w-full flex flex-col items-center bg-slate-900 relative overflow-y-auto">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none overflow-hidden text-white">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600 rounded-full blur-[140px]"></div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 w-full min-h-fit py-8 relative z-10">
        <div className="w-full max-w-[560px] bg-white rounded-[22px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
          <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">기술진단팀원 신규등록</h2>
              <p className="text-slate-400 text-[10px] mt-0.5 uppercase tracking-widest font-medium">모든 필드를 입력해 주세요</p>
            </div>
            <button onClick={onBack} className="size-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-2.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">프로필 사진</label>
              <div className="flex items-center gap-4">
                <div className="relative group shrink-0">
                  <img src={formData.avatar} className="size-16 rounded-2xl object-cover border-2 border-slate-100 shadow-md transition-all group-hover:border-blue-400" alt="Avatar" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute -bottom-1 -right-1 size-6 bg-blue-600 text-white rounded-lg flex items-center justify-center border-1 border-white shadow-lg">
                    <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                </div>
                <div className="flex-1 flex gap-2 overflow-x-auto pb-1">
                  {['user1','user2','user3','user5','user6'].map(s => (
                    <img key={s} src={`https://picsum.photos/seed/${s}/100/100`} onClick={() => handleAvatarSelect(`https://picsum.photos/seed/${s}/100/100`)}
                      className={`size-10 rounded-xl cursor-pointer border-2 shrink-0 transition-all ${formData.avatar.includes(s) ? 'border-blue-600 scale-105' : 'border-slate-50 hover:border-slate-200'}`} alt={s}/>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">계정 아이디</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => { setFormData({...formData, id: e.target.value}); setIdAvailable(null); }}
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none min-w-0"
                    placeholder="4자 이상"
                  />
                  <button type="button" onClick={checkId} className="px-3 bg-slate-800 text-white rounded-xl text-[11px] font-bold hover:bg-slate-700 transition-colors whitespace-nowrap">중복확인</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">성명</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none"
                  placeholder="실명 입력"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">이메일</label>
                <div className="flex gap-1.5">
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => { setFormData({...formData, email: e.target.value}); setEmailChecked(false); }}
                    className="flex-1 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none min-w-0"
                    placeholder="example@thezone.com"
                  />
                  <button type="button" onClick={checkEmail} className="px-3 bg-slate-800 text-white rounded-xl text-[11px] font-bold hover:bg-slate-700 transition-colors whitespace-nowrap">형식확인</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">연락처</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setFormData({...formData, phone: formatted});
                    setPhoneValid(isPhoneValid(formatted) || formatted.length === 0);
                  }}
                  className={`w-full px-4 py-2 bg-slate-50 border rounded-xl text-slate-800 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none ${phoneValid ? 'border-slate-100' : 'border-red-300'}`}
                  placeholder="010-0000-0000"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">비밀번호</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none"
                  placeholder="비밀번호 입력"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">비밀번호 확인</label>
                <input
                  type="password"
                  value={formData.passwordConfirm}
                  onChange={(e) => setFormData({...formData, passwordConfirm: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none"
                  placeholder="비밀번호 재입력"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">주소</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={formData.address}
                  className="flex-1 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm outline-none cursor-default min-w-0"
                  placeholder="주소 검색 버튼 클릭"
                />
                <button type="button" onClick={handleAddressSearch} className="px-4 bg-blue-600 text-white rounded-xl text-[11px] font-bold hover:bg-blue-700 transition-colors whitespace-nowrap">주소 검색</button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">상세 주소</label>
              <input
                type="text"
                value={formData.detailAddress}
                onChange={(e) => setFormData({...formData, detailAddress: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none"
                placeholder="상세 주소 입력"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
               <button type="button" onClick={onBack} className="flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-800 transition-colors">취소</button>
               <button type="submit" className="flex-[2] bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all">진단팀원 등록 완료</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
