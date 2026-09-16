import React, { useState, useEffect } from 'react';
import { useStore, Role, UserProfile } from '../store/useStore';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  LogIn, 
  Sparkles, 
  KeyRound, 
  UserCheck, 
  Building2,
  ChevronRight,
  User
} from 'lucide-react';
import { clsx } from 'clsx';

export function Login() {
  const { 
    loginWithUsername, 
    registerEmployee, 
    loginWithDemo, 
    loginWithGoogle,
    registeredUsers,
    fetchRegisteredUsers,
    setUserDirectly
  } = useStore();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Login Form
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPin, setLoginPin] = useState('');

  // Register Form
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regRole, setRegRole] = useState<Role>('employee');

  useEffect(() => {
    fetchRegisteredUsers();
  }, [fetchRegisteredUsers]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await loginWithUsername(loginUsername, loginPin);
      if (!res.success) {
        setErrorMsg(res.message || 'เข้าสู่ระบบไม่สำเร็จ');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await registerEmployee(regName, regUsername, regPin, regRole);
      if (!res.success) {
        setErrorMsg(res.message || 'ลงทะเบียนไม่สำเร็จ');
      } else {
        setSuccessMsg('ลงทะเบียนสำเร็จ กำลังเข้าสู่ระบบ...');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (u: UserProfile) => {
    setUserDirectly(u);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* App Logo & Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200 mb-3">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            ระบบจัดการคิวพนักงาน
          </h1>
          <div className="mt-1.5 flex items-center justify-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
              ระบบออนไลน์พร้อมใช้งาน (Online)
            </span>
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
            ระบบรับเคส ตรวจสอบเครดิต และติดตามสถานะงาน
          </p>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 px-4 shadow-sm border border-slate-200 rounded-2xl sm:px-8">
          
          {/* Quick Demo Access Bar */}
          <div className="mb-6 p-3.5 bg-gradient-to-r from-indigo-50 via-sky-50 to-blue-50 rounded-xl border border-indigo-100">
            <div className="flex items-center text-xs font-semibold text-indigo-900 mb-2">
              <Sparkles className="w-4 h-4 mr-1.5 text-indigo-600" />
              ทดลองเข้าใช้งานด่วน (ไม่ต้องพิมพ์):
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => loginWithDemo('employee')}
                className="flex items-center justify-center py-2 px-3 text-xs font-medium rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-sm transition active:scale-95"
              >
                <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                พนักงาน (สมชาย)
              </button>
              <button
                type="button"
                onClick={() => loginWithDemo('admin')}
                className="flex items-center justify-center py-2 px-3 text-xs font-medium rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-sm transition active:scale-95"
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                ผู้ดูแลระบบ (Admin)
              </button>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex p-1 space-x-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setActiveTab('login'); setErrorMsg(null); }}
              className={clsx(
                'flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center',
                activeTab === 'login'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <LogIn className="w-4 h-4 mr-1.5" />
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('register'); setErrorMsg(null); }}
              className={clsx(
                'flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center',
                activeTab === 'register'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              ลงทะเบียนพนักงาน
            </button>
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-sm">
              {successMsg}
            </div>
          )}

          {/* LOGIN FORM */}
          {activeTab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  ชื่อผู้ใช้ หรือ รหัสพนักงาน
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="เช่น somchai หรือ emp01"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  รหัสผ่าน / PIN (ไม่บังคับ)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="ระบุรหัสผ่าน (ถ้ามีตั้งไว้)"
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-md shadow-indigo-200 transition disabled:opacity-50 flex items-center justify-center"
              >
                <LogIn className="w-4 h-4 mr-2" />
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          )}

          {/* REGISTER FORM */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  ชื่อ-นามสกุล หรือชื่อเล่นพนักงาน *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สมชาย สดใส หรือ น้องแนน"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  รหัสพนักงาน หรือ Username (ภาษาอังกฤษ/ตัวเลข) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น emp01, staff_nan"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  รหัสผ่าน หรือ PIN 4-6 หลัก (ไม่บังคับ)
                </label>
                <input
                  type="password"
                  placeholder="เช่น 1234 หรือ เว้นว่างได้"
                  value={regPin}
                  onChange={(e) => setRegPin(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  บทบาทในระบบ *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={clsx(
                      'flex items-center p-2.5 rounded-xl border cursor-pointer text-xs font-medium transition',
                      regRole === 'employee'
                        ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 ring-1 ring-indigo-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <input
                      type="radio"
                      name="regRole"
                      value="employee"
                      checked={regRole === 'employee'}
                      onChange={() => setRegRole('employee')}
                      className="sr-only"
                    />
                    <Users className="w-4 h-4 mr-2 text-indigo-600 shrink-0" />
                    <span>พนักงานทั่วไป</span>
                  </label>

                  <label
                    className={clsx(
                      'flex items-center p-2.5 rounded-xl border cursor-pointer text-xs font-medium transition',
                      regRole === 'admin'
                        ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 ring-1 ring-indigo-500'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <input
                      type="radio"
                      name="regRole"
                      value="admin"
                      checked={regRole === 'admin'}
                      onChange={() => setRegRole('admin')}
                      className="sr-only"
                    />
                    <ShieldCheck className="w-4 h-4 mr-2 text-indigo-600 shrink-0" />
                    <span>ผู้ดูแล (Admin)</span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-3 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-md shadow-emerald-200 transition disabled:opacity-50 flex items-center justify-center"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {loading ? 'กำลังบันทึก...' : 'สมัครสมาชิกและเข้าสู่ระบบ'}
              </button>
            </form>
          )}

          {/* Quick Switch / Registered Employees List */}
          {registeredUsers.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-slate-600 flex items-center">
                  <UserCheck className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  รายชื่อพนักงานในระบบ (กดเพื่อเข้าใช้งาน):
                </span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {registeredUsers.map((u) => (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => handleQuickSelect(u)}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-indigo-50/80 border border-slate-200/70 hover:border-indigo-200 transition text-left text-xs group"
                  >
                    <div className="flex items-center min-w-0">
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] mr-2 shrink-0 group-hover:bg-indigo-200 group-hover:text-indigo-800">
                        {u.name.charAt(0)}
                      </div>
                      <div className="truncate">
                        <span className="font-medium text-slate-800">{u.name}</span>
                        <span className="text-slate-400 ml-1.5 text-[11px]">(@{u.username})</span>
                      </div>
                    </div>
                    <div className="flex items-center shrink-0 ml-2">
                      <span className={clsx(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium mr-1",
                        u.role === 'admin' ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                      )}>
                        {u.role === 'admin' ? 'แอดมิน' : 'พนักงาน'}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Optional Google Login */}
          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 mb-2">หรือหากต้องการใช้บัญชี Google:</p>
            <button
              type="button"
              onClick={() => loginWithGoogle('employee')}
              className="inline-flex items-center text-xs font-medium text-slate-600 hover:text-indigo-600 hover:underline"
            >
              เข้าสู่ระบบด้วย Google (Gmail)
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
