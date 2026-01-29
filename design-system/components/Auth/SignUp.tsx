
import React, { useState, useRef } from 'react';

interface SignUpProps {
  onSignUp: (data: any) => void;
  onBack: () => void;
}

const SignUp: React.FC<SignUpProps> = ({ onSignUp, onBack }) => {
  const [formData, setFormData] = useState({
    id: '', name: '', email: '', phone: '', address: '', detailAddress: '', avatar: 'https://picsum.photos/seed/default/100/100'
  });
  const [idAvailable, setIdAvailable] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarOptions = [
    'https://picsum.photos/seed/user1/100/100',
    'https://picsum.photos/seed/user2/100/100',
    'https://picsum.photos/seed/user3/100/100',
    'https://picsum.photos/seed/user5/100/100',
    'https://picsum.photos/seed/user6/100/100'
  ];

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

  const checkId = () => {
    if (!formData.id) return;
    // Mock API Check
    // setIdAvailable(formData.id !== 'master' && formData.id.length >= 4); // master 제한 주석 처리
    setIdAvailable(formData.id.length >= 4);
  };

  const mockAddressSearch = () => {
    setFormData({ ...formData, address: '경기도 성남시 분당구 판교역로 166' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idAvailable === false) return alert('이미 사용 중인 아이디입니다.');
    if (idAvailable === null) return alert('아이디 중복 확인을 해주세요.');
    onSignUp(formData);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
        <div className="bg-slate-900 px-10 py-8 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">기술진단팀 연구원 등록</h2>
            <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-medium">Create your professional account</p>
          </div>
          <button onClick={onBack} className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8">
          {/* Avatar Selection */}
          <div className="space-y-4">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Profile Photo</label>
            <div className="flex items-center gap-6">
              <div className="relative group">
                <img src={formData.avatar} className="size-24 rounded-[32px] object-cover border-4 border-slate-100 shadow-md transition-all group-hover:border-blue-400" alt="Avatar" />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 size-8 bg-blue-600 text-white rounded-xl flex items-center justify-center border-2 border-white shadow-lg hover:bg-blue-700 transition-transform active:scale-90"
                >
                  <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept="image/*" 
                />
              </div>
              <div className="flex-1 grid grid-cols-5 gap-3">
                {avatarOptions.map((url, i) => (
                  <img 
                    key={i} 
                    src={url} 
                    onClick={() => handleAvatarSelect(url)}
                    className={`size-12 rounded-2xl cursor-pointer border-2 transition-all ${formData.avatar === url ? 'border-blue-600 scale-110 shadow-lg' : 'border-slate-50 hover:border-slate-200'}`} 
                    alt={`option-${i}`}
                  />
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium px-1">위 아이콘 중 하나를 선택하거나 카메라 아이콘을 눌러 직접 사진을 업로드하세요.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Account ID</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  required
                  value={formData.id}
                  onChange={(e) => { setFormData({...formData, id: e.target.value}); setIdAvailable(null); }}
                  placeholder="ID 입력 (4자 이상)"
                  className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
                />
                <button type="button" onClick={checkId} className="px-4 bg-slate-800 text-white rounded-2xl text-[12px] font-bold hover:bg-slate-700 transition-colors shrink-0">중복확인</button>
              </div>
              {idAvailable !== null && (
                <p className={`text-[11px] font-bold px-1 ${idAvailable ? 'text-green-600' : 'text-red-500'}`}>
                  {idAvailable ? '사용 가능한 아이디입니다.' : '사용할 수 없는 아이디입니다.'}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Full Name</label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="실명을 입력하세요"
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Email (Temp Password Recipient)</label>
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                placeholder="example@deojon.com"
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Phone Number</label>
              <input 
                type="tel" 
                required
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                placeholder="010-0000-0000"
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Work/Home Address</label>
            <div className="flex gap-2 mb-2">
              <input 
                type="text" 
                readOnly
                value={formData.address}
                placeholder="주소 검색을 클릭하세요"
                className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold outline-none cursor-default"
              />
              <button type="button" onClick={mockAddressSearch} className="px-5 bg-blue-600 text-white rounded-2xl text-[12px] font-bold hover:bg-blue-700 transition-colors shrink-0">주소 검색</button>
            </div>
            <input 
              type="text" 
              value={formData.detailAddress}
              onChange={(e) => setFormData({...formData, detailAddress: e.target.value})}
              placeholder="상세 주소를 입력하세요"
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
            />
          </div>

          <div className="pt-4 flex items-center gap-4">
             <button type="button" onClick={onBack} className="flex-1 py-4 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors">이전 화면으로</button>
             <button type="submit" className="flex-[2] bg-blue-600 text-white py-4 rounded-[20px] font-bold text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all">신규 연구원 등록 완료</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignUp;
