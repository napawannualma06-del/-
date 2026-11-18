import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Logo } from './Logo';
import { 
  UserPlus, 
  LogIn, 
  KeyRound, 
  UserCheck, 
  // Building2
  ChevronRight,
  User,
  Sun,
  Moon,
  Clock,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { clsx } from 'clsx';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { fetchHRProfiles } from '../lib/hrService';

export function Login() {
  const { 
    loginWithGoogle,
    loginWithUsername, 
    registerEmployee, 
    fetchRegisteredUsers,
    isDarkMode,
    toggleDarkMode
  } = useStore();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingApprovalNotice, setPendingApprovalNotice] = useState<string | null>(null);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  // Google Primary Login State
  const [isPersonalDevice, setIsPersonalDevice] = useState(false); // ค่าเริ่มต้น = ไม่ติ๊ก
  const [showPinForm, setShowPinForm] = useState(false);
  const [allowPinLogin, setAllowPinLogin] = useState(true); // ค่าเริ่มต้น = เปิด

  // Login Form (ID/PIN ชั่วคราว)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPin, setLoginPin] = useState('');

  // Register Form
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPin, setRegPin] = useState('');

  useEffect(() => {
    fetchRegisteredUsers();
    let isCancelled = false;
    fetchHRProfiles()
      .then((docData) => {
        if (!isCancelled) {
          const allowed =
            typeof docData.allowPinLogin === 'boolean' ? docData.allowPinLogin : true;
          setAllowPinLogin(allowed);
          if (!allowed) {
            setShowPinForm(false);
          }
        }
      })
      .catch(() => {
        // fallback allowPinLogin = true
      });
    return () => {
      isCancelled = true;
    };
  }, [fetchRegisteredUsers]);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setGoogleLoading(true);
    try {
      const res = await loginWithGoogle(isPersonalDevice);
      if (!res.success && res.message && res.message !== 'ยกเลิกการเข้าสู่ระบบด้วย Google') {
        setErrorMsg(res.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

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
    setPendingApprovalNotice(null);
    setLoading(true);
    try {
      const res = await registerEmployee(regName, regUsername, regPin);
      if (!res.success) {
        setErrorMsg(res.message || 'ลงทะเบียนไม่สำเร็จ');
      } else if (res.pendingApproval) {
        setPendingApprovalNotice(
          `ลงทะเบียนสำเร็จเรียบร้อยแล้ว! บัญชีของคุณ "${regName}" (${regUsername}) อยู่ระหว่างรอผู้ดูแลระบบ (แอดมิน) อนุมัติการเข้าใช้งาน กรุณาแจ้งแอดมินเพื่อกดอนุมัติก่อนเข้าสู่ระบบ`
        );
        setRegName('');
        setRegUsername('');
        setRegPin('');
      } else {
        setSuccessMsg('ลงทะเบียนสำเร็จ กำลังเข้าสู่ระบบ...');
      }
    } finally {
      setLoading(false);
    }
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
          {pendingApprovalNotice && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 rounded-xl text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-2 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>รอผู้ดูแลระบบ (แอดมิน) อนุมัติ</span>
              </div>
              <p>{pendingApprovalNotice}</p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setPendingApprovalNotice(null);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs transition cursor-pointer"
                >
                  ไปที่หน้าเข้าสู่ระบบ
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            errorMsg.includes('โควต้า') || errorMsg.includes('Quota') ? (
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 rounded-xl text-amber-900 dark:text-amber-200 text-xs space-y-2.5 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>โควต้าฐานข้อมูลฟรีรายวันเต็ม (Quota Limit)</span>
                </div>
                <p className="leading-relaxed">
                  {errorMsg}
                </p>
                <div className="pt-1 flex flex-col sm:flex-row gap-2">
                  <a
                    href="https://console.firebase.google.com/project/boreal-phantasmata-5thv3/firestore/databases/ai-studio-remix-908bc4ff-dfd6-489a-81dc-d04498181529/data?openUpgradeDialog=true"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs transition cursor-pointer shadow-xs"
                  >
                    <span>เปิด Firebase Console เพื่ออัปเกรด</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center justify-center px-3 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-lg font-semibold text-xs transition hover:bg-amber-50 cursor-pointer"
                  >
                    ลองรีโหลดหน้าเว็บใหม่
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300 text-xs font-medium">
                {errorMsg}
              </div>
            )
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              {successMsg}
            </div>
          )}

          {/* LOGIN FORM */}
          {activeTab === 'login' && (
            <div className="space-y-4">
              {/* ช่องติ๊ก "นี่คือมือถือ/เครื่องส่วนตัวของฉัน" เหนือปุ่มเข้าสู่ระบบด้วย Google */}
              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPersonalDevice}
                    onChange={(e) => setIsPersonalDevice(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                    นี่คือมือถือ/เครื่องส่วนตัวของฉัน
                  </span>
                </label>

                {!isPersonalDevice && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      เครื่องที่ใช้ร่วมกัน: กรุณาเปิด Chrome แบบไม่ระบุตัวตน (Cmd+Shift+N หรือ Ctrl+Shift+N) ก่อนล็อกอิน และปิดหน้าต่างเมื่อใช้เสร็จ
                    </span>
                  </div>
                )}
              </div>

              {/* ปุ่มหลักใหญ่: เข้าสู่ระบบด้วย Google */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-xl shadow-md shadow-indigo-200 dark:shadow-none transition disabled:opacity-50 flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <span className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </span>
                <span>{googleLoading ? 'กำลังเข้าสู่ระบบด้วย Google...' : 'เข้าสู่ระบบด้วย Google'}</span>
              </button>

              {/* ลิงก์เล็กด้านล่าง: เข้าด้วย ID/PIN (ชั่วคราว) - ซ่อนถ้าแอดมินปิด */}
              {allowPinLogin && (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPinForm((prev) => !prev);
                      setErrorMsg(null);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 underline underline-offset-4 transition cursor-pointer"
                  >
                    เข้าด้วย ID/PIN (ชั่วคราว)
                  </button>
                </div>
              )}

              {/* ฟอร์มเข้าด้วย ID/PIN เดิม */}
              {allowPinLogin && showPinForm && (
                <form
                  onSubmit={handleLogin}
                  className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800 animate-in fade-in duration-150"
                >
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
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPasswordModal(true);
                          setErrorMsg(null);
                        }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold hover:underline transition cursor-pointer"
                      >
                        ลืมรหัสผ่าน / PIN?
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 active:scale-[0.99] text-white font-semibold text-sm rounded-xl transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบด้วย ID/PIN'}
                  </button>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginUsername('23');
                        setLoginPin('23');
                        setErrorMsg(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition cursor-pointer border border-indigo-200/80 dark:border-indigo-800/80 shadow-xs"
                      title="คลิกเพื่อกรอกชื่อผู้ใช้ 23 และรหัส 23 อัตโนมัติ"
                    >
                      <span>⚡ บัญชีด่วนฉุกเฉิน (ไม่ใช้ Database):</span>
                      <span className="font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-700 text-indigo-900 dark:text-indigo-100 font-bold">23 / 23</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
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

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>
                  <strong>การสมัครใหม่:</strong> เมื่อกดลงทะเบียน บัญชีจะถูกส่งให้ผู้ดูแลระบบ (แอดมิน) อนุมัติก่อน จึงจะสามารถเข้าสู่ระบบและเริ่มทำงานได้
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-200 dark:shadow-none transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {loading ? 'กำลังส่งคำขอลงทะเบียน...' : 'ลงทะเบียนขอเข้าใช้งาน (รอแอดมินอนุมัติ)'}
              </button>
            </form>
          )}

        </div>
      </div>

      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
        onSuccessReset={(u, p) => {
          setLoginUsername(u);
          setLoginPin(p);
          setSuccessMsg('รีเซ็ตรหัสผ่านสำเร็จแล้ว! สามารถกดเข้าสู่ระบบได้ทันที');
        }}
      />
    </div>
  );
}
