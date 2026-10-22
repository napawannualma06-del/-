import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  ListTodo, 
  BarChart3, 
  Building2, 
  MoreHorizontal, 
  Clock, 
  Banknote, 
  Zap, 
  Bike, 
  QrCode, 
  Wrench, 
  Sun, 
  Moon, 
  LogOut, 
  X, 
  Key,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { AnimalAvatar } from './AnimalAvatar';
import { isUserAdmin } from '../store/useStore';

interface MobileBottomNavProps {
  user: any;
  pendingOTCount: number;
  pendingAdvanceCount: number;
  pendingTechCount: number;
  onOpenOT: () => void;
  onOpenAdvance: () => void;
  onOpenRefinance: () => void;
  onOpenMessenger: () => void;
  onOpenEmployeeQR: () => void;
  onOpenTech: () => void;
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
  onClockToggle: () => void;
  isOffWork: boolean;
  onLogout: () => void;
}

export function MobileBottomNav({
  user,
  pendingOTCount,
  pendingAdvanceCount,
  pendingTechCount,
  onOpenOT,
  onOpenAdvance,
  onOpenRefinance,
  onOpenMessenger,
  onOpenEmployeeQR,
  onOpenTech,
  onToggleDarkMode,
  isDarkMode,
  onClockToggle,
  isOffWork,
  onLogout,
}: MobileBottomNavProps) {
  const location = useLocation();
  const [showDrawer, setShowDrawer] = useState(false);
  const totalAlertCount = pendingOTCount + pendingAdvanceCount + pendingTechCount;
  const isAdmin = isUserAdmin(user);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* 1. Mobile Bottom Dock (Floating, Ergonomic Thumb Zone) */}
      <nav 
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 transition-all"
      >
        <div className="grid grid-cols-4 items-center h-14 px-2 max-w-md mx-auto">
          {/* Tab 1: คิวงาน */}
          <Link
            to="/"
            onClick={() => setShowDrawer(false)}
            className={clsx(
              "flex flex-col items-center justify-center h-full min-h-[44px] rounded-xl transition-all cursor-pointer relative",
              isActive('/')
                ? "text-indigo-600 dark:text-indigo-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <div className={clsx(
              "relative p-1 rounded-xl transition-all",
              isActive('/') && "bg-indigo-50 dark:bg-indigo-950/60"
            )}>
              <ListTodo className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[11px] font-medium tracking-tight mt-0.5">
              คิวงาน
            </span>
            {isActive('/') && (
              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </Link>

          {/* Tab 2: แดชบอร์ด */}
          <Link
            to="/admin"
            onClick={() => setShowDrawer(false)}
            className={clsx(
              "flex flex-col items-center justify-center h-full min-h-[44px] rounded-xl transition-all cursor-pointer relative",
              isActive('/admin')
                ? "text-indigo-600 dark:text-indigo-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <div className={clsx(
              "relative p-1 rounded-xl transition-all",
              isActive('/admin') && "bg-indigo-50 dark:bg-indigo-950/60"
            )}>
              <BarChart3 className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[11px] font-medium tracking-tight mt-0.5">
              แดชบอร์ด
            </span>
            {isActive('/admin') && (
              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </Link>

          {/* Tab 3: Agent */}
          <Link
            to="/agents"
            onClick={() => setShowDrawer(false)}
            className={clsx(
              "flex flex-col items-center justify-center h-full min-h-[44px] rounded-xl transition-all cursor-pointer relative",
              isActive('/agents')
                ? "text-indigo-600 dark:text-indigo-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <div className={clsx(
              "relative p-1 rounded-xl transition-all",
              isActive('/agents') && "bg-indigo-50 dark:bg-indigo-950/60"
            )}>
              <Building2 className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[11px] font-medium tracking-tight mt-0.5">
              Agent
            </span>
            {isActive('/agents') && (
              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </Link>

          {/* Tab 4: เพิ่มเติม / บริการ */}
          <button
            type="button"
            onClick={() => setShowDrawer(!showDrawer)}
            className={clsx(
              "flex flex-col items-center justify-center h-full min-h-[44px] rounded-xl transition-all cursor-pointer relative",
              showDrawer
                ? "text-indigo-600 dark:text-indigo-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <div className={clsx(
              "relative p-1 rounded-xl transition-all",
              showDrawer && "bg-indigo-50 dark:bg-indigo-950/60"
            )}>
              <MoreHorizontal className="w-5 h-5 shrink-0" />
              {totalAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 text-white rounded-full text-[9px] font-extrabold flex items-center justify-center shadow-xs animate-pulse">
                  {totalAlertCount > 9 ? '9+' : totalAlertCount}
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium tracking-tight mt-0.5 flex items-center gap-1">
              เพิ่มเติม
            </span>
            {showDrawer && (
              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>
        </div>
      </nav>

      {/* 2. Mobile Action Bottom Sheet (Sliding Drawer) */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
          {/* Dimmed backdrop */}
          <div 
            onClick={() => setShowDrawer(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
          />

          {/* Drawer Container */}
          <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-5 max-h-[85vh] flex flex-col overflow-y-auto z-10 animate-in slide-in-from-bottom duration-250 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
            {/* Grab Handle */}
            <div 
              onClick={() => setShowDrawer(false)}
              className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto -mt-1 mb-3 cursor-pointer"
            />

            {/* User Profile Card & Shift Switch */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <AnimalAvatar
                  avatarEmoji={user?.avatarEmoji}
                  identifier={user?.username || user?.uid || 'user'}
                  name={user?.name || 'User'}
                  size="md"
                />
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {user?.name || 'สมาชิก'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    @{user?.username || 'user'} {isAdmin && '• 👑 แอดมิน'}
                  </p>
                </div>
              </div>

              {/* Work Status Toggle */}
              <button
                type="button"
                onClick={() => {
                  onClockToggle();
                  setShowDrawer(false);
                }}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs whitespace-nowrap",
                  isOffWork
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
                    : "bg-emerald-500 text-white shadow-emerald-500/20"
                )}
              >
                <span className={clsx(
                  "w-2 h-2 rounded-full shrink-0",
                  isOffWork ? "bg-slate-400" : "bg-white animate-pulse"
                )} />
                <span>{isOffWork ? 'ว่างงาน' : 'เข้างานอยู่'}</span>
              </button>
            </div>

            {/* Section Title */}
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                บริการและฟีเจอร์ทั้งหมด
              </span>
              <button
                type="button"
                onClick={() => setShowDrawer(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Grid of Quick Actions (Touch targets >= 48px) */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {/* 1. ขอเบิกเงินแอดวานซ์ */}
              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  onOpenAdvance();
                }}
                className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl flex items-start gap-2.5 text-left active:scale-[0.98] transition cursor-pointer shadow-2xs group hover:border-emerald-300 dark:hover:border-emerald-700"
              >
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 shrink-0">
                  <Banknote className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block group-hover:text-emerald-600 transition-colors">
                      เบิกแอดวานซ์
                    </span>
                    {pendingAdvanceCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-600 text-white animate-pulse">
                        {pendingAdvanceCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                    ตัดรอบวันที่ 25
                  </span>
                </div>
              </button>

              {/* 2. ระบบขอและอนุมัติ OT */}
              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  onOpenOT();
                }}
                className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl flex items-start gap-2.5 text-left active:scale-[0.98] transition cursor-pointer shadow-2xs group hover:border-indigo-300 dark:hover:border-indigo-700"
              >
                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block group-hover:text-indigo-600 transition-colors">
                      จัดการ OT
                    </span>
                    {pendingOTCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white animate-pulse">
                        {pendingOTCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                    บันทึกเวลาล่วงเวลา
                  </span>
                </div>
              </button>

              {/* 3. ตารางรีไฟแนนซ์ iPhone */}
              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  onOpenRefinance();
                }}
                className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl flex items-start gap-2.5 text-left active:scale-[0.98] transition cursor-pointer shadow-2xs group hover:border-blue-300 dark:hover:border-blue-700"
              >
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400 shrink-0">
                  <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block group-hover:text-blue-600 transition-colors">
                    เรทรีไฟแนนซ์
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                    คำนวณค่างวด iPhone
                  </span>
                </div>
              </button>

              {/* 4. รายชื่อแมสเซนเจอร์ */}
              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  onOpenMessenger();
                }}
                className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl flex items-start gap-2.5 text-left active:scale-[0.98] transition cursor-pointer shadow-2xs group hover:border-sky-300 dark:hover:border-sky-700"
              >
                <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-400 shrink-0">
                  <Bike className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block group-hover:text-sky-600 transition-colors">
                    รายชื่อแมส
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                    Thunder Cloud 98+ คน
                  </span>
                </div>
              </button>

              {/* 5. QR Code พนักงาน */}
              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  onOpenEmployeeQR();
                }}
                className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl flex items-start gap-2.5 text-left active:scale-[0.98] transition cursor-pointer shadow-2xs group hover:border-purple-300 dark:hover:border-purple-700"
              >
                <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-400 shrink-0">
                  <QrCode className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block group-hover:text-purple-600 transition-colors">
                    QR พนักงาน
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                    โอนเงินคืน / ฝากซื้อ
                  </span>
                </div>
              </button>

              {/* 6. แจ้งปัญหาเทคนิค */}
              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  onOpenTech();
                }}
                className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl flex items-start gap-2.5 text-left active:scale-[0.98] transition cursor-pointer shadow-2xs group hover:border-rose-300 dark:hover:border-rose-700"
              >
                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 shrink-0">
                  <Wrench className="w-5 h-5 text-rose-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block group-hover:text-rose-600 transition-colors">
                      ปัญหาเทคนิค
                    </span>
                    {pendingTechCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                        {pendingTechCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                    แจ้งเครื่อง / ระบบขัดข้อง
                  </span>
                </div>
              </button>
            </div>

            {/* Quick Links for Admin (API Web) */}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setShowDrawer(false)}
                className="mb-3 p-3 bg-sky-50/80 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-2xl flex items-center justify-between text-left active:scale-[0.98] transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-sky-500 text-white">
                    <Key className="w-4 h-4" />
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-sky-900 dark:text-sky-200">
                      API ยืนยันรหัสเคสสำหรับเว็บหลัก
                    </h5>
                    <p className="text-[10px] text-sky-600 dark:text-sky-400">
                      ดู Secret Key และโค้ดตัวอย่างเชื่อมต่อ Thunder Cloud CRM
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-sky-500" />
              </Link>
            )}

            {/* Settings & System Actions Row */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              {/* Dark mode switch */}
              <button
                type="button"
                onClick={onToggleDarkMode}
                className="flex-1 py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
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

              {/* Logout button */}
              <button
                type="button"
                onClick={() => {
                  setShowDrawer(false);
                  onLogout();
                }}
                className="flex-1 py-2.5 px-3 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
