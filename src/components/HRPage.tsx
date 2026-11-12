import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Users,
  Briefcase,
  CalendarCheck,
  FileText,
  Clock,
  Banknote,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useStore, isUserAdmin } from '../store/useStore';
import { AdminHRDashboard } from './AdminHRDashboard';
import { AdminShiftDashboard } from './AdminShiftDashboard';
import { AdminPayrollDashboard } from './AdminPayrollDashboard';
import { AdminOTDashboard } from './AdminOTDashboard';
import { AdminAdvanceDashboard } from './AdminAdvanceDashboard';
import { UserManagementModal } from './UserManagementModal';

type HRTabKey = 'employees_info' | 'shifts' | 'payroll' | 'ot' | 'advance' | 'manage_users';

const HR_TAB_STORAGE_KEY = 'hr_page_active_tab';

const VALID_TABS: HRTabKey[] = [
  'employees_info',
  'shifts',
  'payroll',
  'ot',
  'advance',
  'manage_users',
];

export function HRPage() {
  const { user, registeredUsers } = useStore();
  const isAdmin = isUserAdmin(user);

  const [activeTab, setActiveTab] = useState<HRTabKey>(() => {
    try {
      const saved = localStorage.getItem(HR_TAB_STORAGE_KEY) as HRTabKey | null;
      if (saved && VALID_TABS.includes(saved)) {
        return saved;
      }
    } catch (e) {
      console.warn(e);
    }
    return 'employees_info';
  });

  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(HR_TAB_STORAGE_KEY, activeTab);
    } catch (e) {
      console.warn(e);
    }
  }, [activeTab]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const pendingUserCount = registeredUsers.filter((u) => u.accountStatus === 'pending').length;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Tab Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:px-5 sm:py-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                ระบบพนักงาน HR
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {activeTab === 'employees_info'
                  ? 'จัดการข้อมูลพื้นฐานพนักงาน ข้อมูลลับ HR อายุงาน และสถานะการทดลองงาน'
                  : activeTab === 'shifts'
                  ? 'จัดตารางกะงาน วันหยุด และวันลาตามรอบ 26 ถึง 25'
                  : activeTab === 'payroll'
                  ? 'ตั้งค่าตัวคูณ OT รายการเงินได้/หัก คำนวณและดาวน์โหลดสลิปเงินเดือน PDF'
                  : activeTab === 'ot'
                  ? 'ตรวจอนุมัติ สรุปยอดชั่วโมง OT รายบุคคล และส่งออกไฟล์ Excel (ตัดรอบทุกวันที่ 25)'
                  : activeTab === 'advance'
                  ? 'ตรวจอนุมัติเบิกเงินแอดวานซ์ โอนเงิน แนบสลิป และส่งออกไฟล์ Excel (ตัดรอบทุกวันที่ 25)'
                  : 'จัดการบัญชีพนักงาน อนุมัติผู้สมัครใหม่ และตั้งค่าสิทธิ์การใช้งาน'}
              </p>
            </div>
          </div>

          {/* HR Navigation Tabs */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/70 dark:border-slate-700/60 overflow-x-auto max-w-full gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('employees_info')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0',
                activeTab === 'employees_info'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <Briefcase className="w-3.5 h-3.5 shrink-0" />
              <span>ข้อมูลพนักงาน</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('shifts')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0',
                activeTab === 'shifts'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
              <span>ตารางกะ</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('payroll')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0',
                activeTab === 'payroll'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>สลิปเงินเดือน</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ot')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0',
                activeTab === 'ot'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>OT</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('advance')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0',
                activeTab === 'advance'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <Banknote className="w-3.5 h-3.5 shrink-0" />
              <span>แอดวานซ์</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manage_users')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0',
                activeTab === 'manage_users'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>จัดการพนักงาน</span>
              {pendingUserCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold tabular-nums">
                  {pendingUserCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'employees_info' && <AdminHRDashboard />}
      {activeTab === 'shifts' && <AdminShiftDashboard />}
      {activeTab === 'payroll' && <AdminPayrollDashboard />}
      {activeTab === 'ot' && <AdminOTDashboard />}
      {activeTab === 'advance' && <AdminAdvanceDashboard />}

      {activeTab === 'manage_users' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-5">
          {pendingUserCount > 0 && (
            <div className="p-4 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>มีผู้สมัครใหม่รอการอนุมัติ</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white tabular-nums">
                      {pendingUserCount} บัญชี
                    </span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    ผู้สมัครจะไม่สามารถเข้าสู่ระบบหรือรับเคสได้จนกว่าแอดมินจะกดอนุมัติการเข้าใช้งาน
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUserModal(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <UserCheck className="w-4 h-4" />
                <span>ตรวจและอนุมัติทันที ({pendingUserCount})</span>
              </button>
            </div>
          )}

          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto">
              <Users className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                จัดการบัญชีพนักงานและอนุมัติผู้ใช้งาน
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                เพิ่มบัญชีพนักงานใหม่ อนุมัติผู้สมัคร รีเซ็ตรหัสผ่าน/PIN ปรับสิทธิ์แอดมิน หรือจัดการสถานะบัญชีของพนักงานในระบบ
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setShowUserModal(true)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-md transition cursor-pointer"
              >
                <Users className="w-4 h-4" />
                <span>เปิดหน้าต่างจัดการพนักงาน</span>
                {pendingUserCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500 text-white font-bold">
                    รออนุมัติ {pendingUserCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UserManagementModal */}
      {showUserModal && (
        <UserManagementModal
          isOpen={showUserModal}
          onClose={() => setShowUserModal(false)}
        />
      )}
    </div>
  );
}
