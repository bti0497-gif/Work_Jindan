
import React, { useState, useRef } from 'react';
import { User } from '../types';

interface ProfileEditProps {
  user: User;
  onSave: (data: any) => void;
  onClose: () => void;
}

const ProfileEdit: React.FC<ProfileEditProps> = ({ user, onSave, onClose }) => {
  const [formData, setFormData] = useState({ ...user });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-slate-900 px-10 py-8 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight">연구원 프로필 관리</h2>
            <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-medium">Update your professional profile</p>
          </div>
          <button onClick={onClose} className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8 overflow-y-auto max-h-[75vh] sidebar-dark-scrollbar">
          {/* Avatar Selection (Updated to match SignUp) */}
          <div className="space-y-4">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Profile Photo</label>
            <div className="flex items-center gap-8">
              <div className="relative group">
                <img src={formData.avatar} className="size-24 rounded-[32px] object-cover border-4 border-slate-100 shadow-md group-hover:border-blue-400 transition-all" alt="Avatar" />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 size-8 bg-blue-600 text-white rounded-xl flex items-center justify-center border-2 border-white shadow-lg transition-transform active:scale-90"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
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
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
              <h3 className="text-[14px] font-bold text-slate-800">{formData.name}</h3>
              <p className="text-[11px] text-slate-400 font-medium">ID: {formData.id} / 권한: {formData.role}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Email Address</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Phone Number</label>
              <input 
                type="tel" 
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">Address</label>
            <input 
              type="text" 
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none mb-2"
            />
            <input 
              type="text" 
              value={formData.detailAddress}
              onChange={(e) => setFormData({...formData, detailAddress: e.target.value})}
              placeholder="상세 주소"
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 font-bold focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all outline-none"
            />
          </div>

          <div className="pt-6 flex gap-4">
             <button type="button" onClick={onClose} className="flex-1 py-4 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors">닫기</button>
             <button type="submit" className="flex-[2] bg-blue-600 text-white py-4 rounded-[20px] font-bold text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all">수정 사항 저장하기</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileEdit;
