import React, { useState, useEffect } from 'react';
import { useStore, UserProfile } from '../store/useStore';
import { Logo } from './Logo';
import { 
  Users, 
  UserPlus, 
  LogIn, 
  KeyRound, 
  UserCheck, 
  // Building2
  ChevronRight,
  User,
  Sun,
  Moon
} from 'lucide-react';
import { clsx } from 'clsx';

export function Login() {
  const { 
    loginWithUsername, 
    registerEmployee, 
    registeredUsers,
    fetchRegisteredUsers,
    setUserDirectly,
    isDarkMode,
    toggleDarkMode
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
      const res = await registerEmployee(regName, regUsername, regPin);
      if (!res.success) {
        setErrorMsg(res.message || 'ลงทะเบียนไม่สำเร็จ');
      } else {
        setSuccessMsg('ลงทะเบียนสำเร็จ กำลังเข้าสู่ระบบ...');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = async (u: UserProfile) => {
    if (u.username === 'gametpl') {
      setActiveTab('login');
      setLoginUsername('gametpl');
      setLoginPin('gametpl');
      // Directly log in as super admin
      setLoading(true);
      try {
        const res = await loginWithUsername('gametpl', 'gametpl');
        if (!res.success) {
          setErrorMsg(res.message || 'เข้าสู่ระบบแอดมินไม่สำเร็จ');
        }
      } finally {
        setLoading(false);
      }
      return;
    }
    setUserDirectly(u);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      {/* Dark Mode Toggle Top-Right */}
      <div className="fixed top-4 right-4 z-50">
        <button
          type="button"
          onClick={toggleDarkMode}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm transition flex items-center gap-1.5 text-xs font-medium"
          title={isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
          aria-label="Toggle Dark Mode"
        >
          {isDarkMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>โหมดสว่าง</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-500" />
              <span>โหมดมืด</span>
            </>
          )}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* App Logo & Header */}
        <div className="text-center">
          <div className="flex justify-center mb-2">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            ไทย พลัส+
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
            ระบบจัดการคิวพนักงาน
          </p>
          <div className="mt-2 flex items-center justify-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
              ระบบออนไลน์พร้อมใช้งาน (Online)
            </span>
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            ระบบรับเคส ตรวจสอบเครดิต ยกเลิกเคส และติดตามสถานะงาน
          </p>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-6 px-4 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl sm:px-8 transition-colors">
          
          {/* Tab Selector */}
          <div className="flex p-1 space-x-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setActiveTab('login'); setErrorMsg(null); }}
              className={clsx(
                'flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center',
                activeTab === 'login'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              )}
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              ลงทะเบียนเข้าใช้งาน
            </button>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              {successMsg}
            </div>
          )}

          {/* LOGIN FORM */}
          {activeTab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  ชื่อผู้ใช้ / รหัสพนักงาน
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="เช่น emp01, somchai"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  รหัสผ่าน หรือ PIN (ถ้ามีตั้งไว้)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="หากไม่มี PIN เว้นว่างได้"
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-semibold text-sm rounded-xl shadow-md shadow-indigo-200 dark:shadow-none transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
              >
                <LogIn className="w-4 h-4 mr-2" />
                {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
              </button>

              {/* Admin gametpl Quick Fill Card */}
              <div className="mt-3 p-2.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/30 flex items-center justify-between">
                <div className="text-left">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center">
                    <span className="mr-1">👑</span> แอดมินสูงสุด (Super Admin):
                  </div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 font-mono mt-0.5">
                    ID: <strong>gametpl</strong> / Pass: <strong>gametpl</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoginUsername('gametpl');
                    setLoginPin('gametpl');
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition cursor-pointer shrink-0 ml-2"
                >
                  กรอกข้อมูล
                </button>
              </div>
            </form>
          )}

          {/* REGISTER FORM */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  ชื่อ-นามสกุล หรือชื่อเล่น *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สมชาย สดใส หรือ น้องแนน"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  รหัสพนักงาน หรือ Username (ภาษาอังกฤษ/ตัวเลข) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น emp01, staff_nan"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  รหัสผ่าน หรือ PIN 4-6 หลัก (ไม่บังคับ)
                </label>
                <input
                  type="password"
                  placeholder="เช่น 1234 หรือ เว้นว่างได้"
                  value={regPin}
                  onChange={(e) => setRegPin(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-3 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-200 dark:shadow-none transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {loading ? 'กำลังบันทึก...' : 'ลงทะเบียนและเข้าสู่ระบบทันที'}
              </button>
            </form>
          )}

          {/* Quick Switch / Registered Users List */}
          {registeredUsers.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center">
                  <UserCheck className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  รายชื่อผู้ใช้ในระบบ (กดเพื่อเข้าใช้งาน):
                </span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {registeredUsers.map((u) => {
                  const isSuperAdmin = u.username === 'gametpl' || u.role === 'admin';
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => handleQuickSelect(u)}
                      className={clsx(
                        "w-full flex items-center justify-between p-2 rounded-xl transition text-left text-xs group cursor-pointer border",
                        isSuperAdmin
                          ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 hover:bg-amber-100/70"
                          : "bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50/80 dark:hover:bg-slate-750 border-slate-200/70 dark:border-slate-700 hover:border-indigo-200"
                      )}
                    >
                      <div className="flex items-center min-w-0">
                        <div className={clsx(
                          "w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] mr-2 shrink-0",
                          isSuperAdmin 
                            ? "bg-amber-400 text-amber-950" 
                            : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 group-hover:bg-indigo-200 group-hover:text-indigo-800"
                        )}>
                          {isSuperAdmin ? '👑' : u.name.charAt(0)}
                        </div>
                        <div className="truncate">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{u.name}</span>
                          <span className="text-slate-400 dark:text-slate-500 ml-1.5 text-[11px]">(@{u.username})</span>
                          {isSuperAdmin && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                              แอดมิน
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center shrink-0 ml-2">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
