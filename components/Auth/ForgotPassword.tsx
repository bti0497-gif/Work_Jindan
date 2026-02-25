import React, { useState } from 'react';

interface ForgotPasswordProps {
  onSend: (email: string) => void;
  onBack: () => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onSend, onBack }) => {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      alert('�̸����� �Է����ּ���.');
      return;
    }
    onSend(email);
  };

  return (
    <div className="h-full w-full flex flex-col items-center bg-slate-900 relative overflow-y-auto">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none overflow-hidden text-white">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600 rounded-full blur-[140px]"></div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 w-full min-h-fit py-8 relative z-10">
        <div className="w-full max-w-[380px] bg-white rounded-[24px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
          <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">��й�ȣ ã��</h2>
              <p className="text-slate-400 text-[10px] mt-0.5 uppercase tracking-widest font-medium">�̸��Ϸ� �ӽ� ��й�ȣ �߼�</p>
            </div>
            <button onClick={onBack} className="size-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">��ϵ� �̸���</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-slate-800 font-bold text-sm focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none"
                placeholder="example@thezone.com"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button type="button" onClick={onBack} className="flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-800 transition-colors">���</button>
              <button type="submit" className="flex-[2] bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all">�ӽ� ��й�ȣ �߼�</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
