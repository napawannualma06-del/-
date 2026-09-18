import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Logo } from './Logo';
import { AnimalAvatar } from './AnimalAvatar';
import { ClockOutConfirmModal } from './ClockOutConfirmModal';
import { AvatarSelectorModal } from './AvatarSelectorModal';
import { 
  LogOut, 
  BarChart3, 
  ListTodo, 
  Bell, 
  Sun, 
  Moon,
  Briefcase,
  Smile
} from 'lucide-react';
import { clsx } from 'clsx';

export function Layout() {
  const { user, logout, isDarkMode, toggleDarkMode, clockIn } = useStore();
  const location = useLocation();
  const [notifGranted, setNotifGranted] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const isOffWork = user?.workStatus === 'off_work';

  useEffect(() => {
    if ('Notification' in window) {
      setNotifGranted(Notification.permission === 'granted');
    }
  }, []);

  const handleRequestNotification = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotifGranted(perm === 'granted');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col text-slate-800 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navbar */}
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-xs transition-colors">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-1.5 sm:gap-4">
            
            {/* Logo & Navigation */}
            <div className="flex items-center gap-1.5 sm:gap-4 lg:gap-6 shrink-0">
              <Link to="/" className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                <Logo size="sm" className="shrink-0" />
                <div className="hidden xs:block border-l border-slate-200 dark:border-slate-800 pl-1.5 sm:pl-2.5 shrink-0">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <span className="font-bold text-[11px] sm:text-xs md:text-sm text-slate-900 dark:text-white leading-none block whitespace-nowrap">
                      ระบบจัดการคิว
                    </span>
                    <span className="inline-flex items-center px-1 py-0.5 sm:px-1.5 rounded-full text-[8px] sm:text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shrink-0">
                      <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 animate-pulse mr-0.5 sm:mr-1"></span>
                      ออนไลน์
                    </span>
                  </div>
                  <span className="text-[9px] sm:text-[11px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap block mt-0.5">
                    ไทย พลัส+
                  </span>
                </div>
              </Link>
 
              {/* Unified Nav Links for ALL Sizes */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <Link
                  to="/"
                  className={clsx(
                    'inline-flex items-center px-2 py-1.5 sm:px-3 sm:py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer',
                    location.pathname === '/' 
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <ListTodo className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0.5 sm:mr-1.5 shrink-0" />
                  <span className="hidden xxs:inline">กระดานคิว</span>
                  <span className="xxs:hidden">คิว</span>
                </Link>
 
                <Link
                  to="/admin"
                  className={clsx(
                    'inline-flex items-center px-2 py-1.5 sm:px-3 sm:py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer',
                    location.pathname === '/admin' 
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0.5 sm:mr-1.5 shrink-0" />
                  <span className="hidden sm:inline">แดชบอร์ด & สถิติ</span>
                  <span className="inline sm:hidden">แดชบอร์ด</span>
                </Link>
              </div>
            </div>
 
            {/* User Profile & Actions */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleDarkMode}
                className="p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center cursor-pointer shrink-0"
                title={isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? (
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                ) : (
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 shrink-0" />
                )}
              </button>
 
              {/* Notification Permission Indicator */}
              <button
                type="button"
                onClick={handleRequestNotification}
                className={clsx(
                  "p-1.5 sm:p-2 rounded-xl border text-xs transition flex items-center justify-center cursor-pointer shrink-0",
                  notifGranted 
                    ? "border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/40" 
                    : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
                title={notifGranted ? "เปิดรับการแจ้งเตือนแล้ว" : "คลิกเพื่อเปิดการแจ้งเตือนบนเบราว์เซอร์"}
              >
                <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              </button>

              {/* Employee Work Shift Status (เข้างาน / เลิกงาน) */}
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    if (isOffWork) {
                      clockIn();
                    } else {
                      setShowClockOutModal(true);
                    }
                  }}
                  className={clsx(
                    "px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs whitespace-nowrap",
                    isOffWork
                      ? "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      : "border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                  )}
                  title={isOffWork ? "ขณะนี้เลิกงานแล้ว (คลิกเพื่อเข้างาน)" : "ขณะนี้เข้างานอยู่ (คลิกเพื่อบันทึกเลิกงาน)"}
                >
                  <span className={clsx(
                    "w-2 h-2 rounded-full shrink-0",
                    isOffWork ? "bg-slate-400" : "bg-emerald-500 animate-pulse"
                  )} />
                  <span className="hidden sm:inline">
                    {isOffWork ? 'เลิกงานแล้ว' : 'เข้างานอยู่'}
                  </span>
                  <span className="inline sm:hidden">
                    {isOffWork ? 'เลิกงาน' : 'เข้างาน'}
                  </span>
                </button>
              )}

              {/* Current Member Badge (Click to customize avatar) */}
              <div className="flex items-center pl-1 sm:pl-3 border-l border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  id="open-avatar-selector-btn"
                  type="button"
                  onClick={() => setShowAvatarModal(true)}
                  className="group relative flex items-center p-1 sm:p-1.5 -ml-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer text-left focus:outline-hidden focus:ring-2 focus:ring-amber-500/50"
                  title="คลิกเพื่อเปลี่ยนรูปตัวการ์ตูนประจำตัว"
                >
                  <div className="relative mr-1.5 sm:mr-2 shrink-0">
                    <AnimalAvatar 
                      avatarEmoji={user?.avatarEmoji}
                      identifier={user?.username || user?.uid || 'user'} 
                      name={user?.name || 'User'} 
                      size="sm" 
                      className="sm:hidden" 
                    />
                    <AnimalAvatar 
                      avatarEmoji={user?.avatarEmoji}
                      identifier={user?.username || user?.uid || 'user'} 
                      name={user?.name || 'User'} 
                      size="md" 
                      className="hidden sm:flex" 
                    />
                    <span 
                      className="absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-500 text-white flex items-center justify-center opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-xs text-[8px] sm:text-[9px]"
                      title="เปลี่ยนรูปตัวการ์ตูน"
                    >
                      ✏️
                    </span>
                    {user?.role === 'admin' && (
                      <span className="absolute -top-1.5 -left-1.5 text-[9px] sm:text-[11px] leading-none select-none filter drop-shadow">
                        👑
                      </span>
                    )}
                  </div>
                  <div className="hidden lg:block text-left mr-2 shrink-0">
                    <div className="flex items-center space-x-1.5 whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[110px] group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {user?.name}
                      </span>
                      {user?.role === 'admin' && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 whitespace-nowrap shrink-0">
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center whitespace-nowrap">
                      <span>@{user?.username || 'member'}</span>
                      <span className="ml-1 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium shrink-0">• เปลี่ยนรูป</span>
                    </div>
                  </div>
                </button>
 
                <button
                  type="button"
                  onClick={logout}
                  className="p-1.5 sm:p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition cursor-pointer shrink-0"
                  title="สลับผู้ใช้ / ออกจากระบบ"
                >
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Page Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7">
        <Outlet />
      </main>

      {/* Avatar Customization Modal */}
      {user && (
        <AvatarSelectorModal
          isOpen={showAvatarModal}
          onClose={() => setShowAvatarModal(false)}
        />
      )}

      {/* Clock Out Confirmation Modal */}
      {user && (
        <ClockOutConfirmModal
          isOpen={showClockOutModal}
          onClose={() => setShowClockOutModal(false)}
          employeeId={user.uid}
          employeeName={user.name}
          isSelf={true}
          onSuccess={(res) => {
            if (res.returnedCasesCount > 0) {
              alert(`บันทึกเลิกงานเรียบร้อยแล้ว ส่งเคสคืนกลับไป "รอรับเคส" จำนวน ${res.returnedCasesCount} เคส`);
            }
          }}
        />
      )}
    </div>
  );
}
