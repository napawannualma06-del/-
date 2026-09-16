import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { 
  LogOut, 
  BarChart3, 
  ListTodo, 
  Bell, 
  Building2, 
  User,
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
            <div className="flex items-center space-x-6">
              <Link to="/" className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-base text-slate-900 dark:text-white leading-none block">
                      ระบบจัดการคิว
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1"></span>
                      ออนไลน์
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                    คิวงานพนักงาน
                  </span>
                </div>
              </Link>

              {/* Desktop Nav Links - Accessible to Everyone */}
              <div className="hidden sm:flex sm:space-x-2">
                <Link
                  to="/"
                  className={clsx(
                    'inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-semibold transition',
                    location.pathname === '/' 
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <ListTodo className="w-4 h-4 mr-1.5" />
                  กระดานคิวงาน
                </Link>

                <Link
                  to="/admin"
                  className={clsx(
                    'inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-semibold transition',
                    location.pathname === '/admin' 
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <BarChart3 className="w-4 h-4 mr-1.5" />
                  แดชบอร์ด & สถิติ
                </Link>
              </div>
            </div>

            {/* User Profile & Actions */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleDarkMode}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center cursor-pointer"
                title={isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-500" />
                )}
              </button>

              {/* Notification Permission Indicator */}
              <button
                type="button"
                onClick={handleRequestNotification}
                className={clsx(
                  "p-2 rounded-xl border text-xs transition flex items-center cursor-pointer",
                  notifGranted 
                    ? "border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/40" 
                    : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
                title={notifGranted ? "เปิดรับการแจ้งเตือนแล้ว" : "คลิกเพื่อเปิดการแจ้งเตือนบนเบราว์เซอร์"}
              >
                <Bell className="w-4 h-4" />
              </button>

              {/* Current Member Badge */}
              <div className="flex items-center pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs mr-2">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div className="hidden sm:block text-left mr-3">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[130px]">
                    {user?.name}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">
                    @{user?.username || 'member'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition cursor-pointer"
                  title="สลับผู้ใช้ / ออกจากระบบ"
                >
                  <LogOut className="w-4 h-4" />
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
