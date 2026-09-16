import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Logo } from './Logo';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  LogOut, 
  BarChart3, 
  ListTodo, 
  Bell, 
  Sun, 
  Moon
} from 'lucide-react';
import { clsx } from 'clsx';

export function Layout() {
  const { user, logout, isDarkMode, toggleDarkMode } = useStore();
  const location = useLocation();
  const [notifGranted, setNotifGranted] = useState(false);

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            
            {/* Logo & Navigation */}
            <div className="flex items-center space-x-4 lg:space-x-6 shrink-0">
              <Link to="/" className="flex items-center space-x-2.5 shrink-0">
                <Logo size="sm" className="shrink-0" />
                <div className="hidden sm:block border-l border-slate-200 dark:border-slate-800 pl-2.5 shrink-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-white leading-none block whitespace-nowrap">
                      ระบบจัดการคิว
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1"></span>
                      ออนไลน์
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap block mt-0.5">
                    ไทย พลัส+
                  </span>
                </div>
              </Link>
 
              {/* Desktop Nav Links - Accessible to Everyone */}
              <div className="hidden sm:flex sm:items-center sm:space-x-1.5 lg:space-x-2 shrink-0">
                <Link
                  to="/"
                  className={clsx(
                    'inline-flex items-center px-3 py-1.5 md:px-3.5 md:py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap shrink-0',
                    location.pathname === '/' 
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <ListTodo className="w-4 h-4 mr-1.5 shrink-0" />
                  กระดานคิวงาน
                </Link>
 
                <Link
                  to="/admin"
                  className={clsx(
                    'inline-flex items-center px-3 py-1.5 md:px-3.5 md:py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap shrink-0',
                    location.pathname === '/admin' 
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <BarChart3 className="w-4 h-4 mr-1.5 shrink-0" />
                  แดชบอร์ด & สถิติ
                </Link>
              </div>
            </div>
 
            {/* User Profile & Actions */}
            <div className="flex items-center space-x-1.5 sm:space-x-2.5 shrink-0">
              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleDarkMode}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center cursor-pointer shrink-0"
                title={isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? (
                  <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-500 shrink-0" />
                )}
              </button>
 
              {/* Notification Permission Indicator */}
              <button
                type="button"
                onClick={handleRequestNotification}
                className={clsx(
                  "p-2 rounded-xl border text-xs transition flex items-center justify-center cursor-pointer shrink-0",
                  notifGranted 
                    ? "border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/40" 
                    : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
                title={notifGranted ? "เปิดรับการแจ้งเตือนแล้ว" : "คลิกเพื่อเปิดการแจ้งเตือนบนเบราว์เซอร์"}
              >
                <Bell className="w-4 h-4 shrink-0" />
              </button>
 
              {/* Current Member Badge */}
              <div className="flex items-center pl-2.5 sm:pl-3.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
                <div className="relative mr-2 shrink-0">
                  <AnimalAvatar identifier={user?.username || user?.uid || 'user'} name={user?.name || 'User'} size="md" />
                  {user?.role === 'admin' && (
                    <span className="absolute -bottom-1 -right-1 text-[11px] leading-none select-none filter drop-shadow">
                      👑
                    </span>
                  )}
                </div>
                <div className="hidden md:block text-left mr-3 shrink-0">
                  <div className="flex items-center space-x-1.5 whitespace-nowrap">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[130px]">
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
                    {user?.role === 'admin' ? (
                      <span className="ml-1 text-amber-600 dark:text-amber-400 font-semibold shrink-0">• ผู้ดูแลระบบสูงสุด</span>
                    ) : (
                      <span className="ml-1 shrink-0">• พนักงาน</span>
                    )}
                  </div>
                </div>
 
                <button
                  type="button"
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition cursor-pointer shrink-0"
                  title="สลับผู้ใช้ / ออกจากระบบ"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation bar at bottom of header */}
        <div className="sm:hidden border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 px-4 py-1.5 flex justify-around">
          <Link
            to="/"
            className={clsx(
              'flex items-center px-3 py-1 rounded-lg text-xs font-semibold',
              location.pathname === '/' 
                ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-950/60' 
                : 'text-slate-600 dark:text-slate-400'
            )}
          >
            <ListTodo className="w-3.5 h-3.5 mr-1.5" />
            กระดานคิว
          </Link>
          <Link
            to="/admin"
            className={clsx(
              'flex items-center px-3 py-1 rounded-lg text-xs font-semibold',
              location.pathname === '/admin' 
                ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-950/60' 
                : 'text-slate-600 dark:text-slate-400'
            )}
          >
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            แดชบอร์ด & สถิติ
          </Link>
        </div>
      </nav>

      {/* Main Page Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7">
        <Outlet />
      </main>
    </div>
  );
}
