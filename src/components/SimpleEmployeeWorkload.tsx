import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { Case, UserProfile } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { ClockOutConfirmModal } from './ClockOutConfirmModal';
import { clockInEmployee } from '../lib/shiftService';
import { 
  Users, 
  UserCheck, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Moon,
  LogOut,
  Briefcase
} from 'lucide-react';
import { clsx } from 'clsx';

interface SimpleEmployeeWorkloadProps {
  cases: Case[];
  selectedEmployeeName?: string;
  onSelectEmployee?: (employeeName: string | null) => void;
  className?: string;
}

interface EmployeeWorkloadSummary {
  uid: string;
  name: string;
  username: string;
  avatarEmoji?: string;
  activeCount: number;
  regularCaseCount: number;
  customTaskCount: number;
  activeCases: Case[];
  isBusy: boolean;
  isOffWork: boolean;
  offWorkAt?: number;
  lastActiveAt?: number;
  autoClockOutReason?: string;
  closedCount: number;
  isAdmin: boolean;
}

export const SimpleEmployeeWorkload: React.FC<SimpleEmployeeWorkloadProps> = ({
  cases,
  selectedEmployeeName,
  onSelectEmployee,
  className,
}) => {
  const { user: currentUser, clockIn, fetchRegisteredUsers } = useStore();
  const isAdmin = currentUser?.role === 'admin';
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [clockOutTarget, setClockOutTarget] = useState<UserProfile | null>(null);

  // Subscribe to registered users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as UserProfile;
        let displayName = data.name;
        if (displayName === 'คุณเกม' || data.username?.toLowerCase() === 'gametpl' || d.id === 'admin_gametpl') {
          displayName = 'Game';
        }
        list.push({ ...data, name: displayName, uid: d.id });
      });
      setEmployees(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => unsub();
  }, []);

  // Calculate workloads
  const workloads: EmployeeWorkloadSummary[] = employees.map((emp) => {
    const isSuperAdmin = emp.username?.toLowerCase() === 'gametpl' || emp.uid === 'admin_gametpl' || emp.name === 'Game' || emp.name === 'คุณเกม';
    const isGame = isSuperAdmin;
    const activeCases = cases.filter(
      (c) => (c.assigneeId === emp.uid || c.assigneeName === emp.name || (isGame && (c.assigneeName === 'คุณเกม' || c.assigneeName === 'Game'))) && (c.status === 'processing' || c.status === 'credit_check')
    );
    const regularCaseCount = activeCases.filter(c => !c.isCustomTask && c.caseType !== 'custom_task').length;
    const customTaskCount = activeCases.filter(c => c.isCustomTask || c.caseType === 'custom_task').length;
    const closedCount = cases.filter((c) => (c.assigneeId === emp.uid || c.assigneeName === emp.name || (isGame && (c.assigneeName === 'คุณเกม' || c.assigneeName === 'Game'))) && c.status === 'closed').length;
    const isOffWork = emp.workStatus === 'off_work';
    const isBusy = !isOffWork && activeCases.length > 0;

    return {
      uid: emp.uid,
      name: emp.name || emp.username,
      username: emp.username,
      avatarEmoji: emp.avatarEmoji,
      activeCount: activeCases.length,
      regularCaseCount,
      customTaskCount,
      activeCases,
      isBusy,
      isOffWork,
      offWorkAt: emp.offWorkAt,
      lastActiveAt: emp.lastActiveAt,
      autoClockOutReason: emp.autoClockOutReason,
      closedCount,
      isAdmin: isSuperAdmin,
    };
  });

  // Filter team members to show (hide inactive dummy system account if no cases)
  const regularEmployees = workloads.filter((w) => {
    const isSystemAdmin = w.username?.toLowerCase() === 'gametpl' || w.uid === 'admin_gametpl';
    if (isSystemAdmin && w.activeCount === 0) return false;
    return true;
  });

  // Sort: Busy employees first, then idle, then off-work at the bottom
  regularEmployees.sort((a, b) => {
    if (a.isOffWork !== b.isOffWork) return a.isOffWork ? 1 : -1;
    if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
    return a.name.localeCompare(b.name, 'th');
  });

  const totalBusy = regularEmployees.filter((w) => !w.isOffWork && w.isBusy).length;
  const totalIdle = regularEmployees.filter((w) => !w.isOffWork && !w.isBusy).length;
  const totalOffWork = regularEmployees.filter((w) => w.isOffWork).length;

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-all",
      className
    )}>
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
              สถานะทีมงาน
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>ติดเคส <strong className="text-slate-800 dark:text-slate-200">{totalBusy}</strong></span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>ว่าง <strong className="text-slate-800 dark:text-slate-200">{totalIdle}</strong></span>
            </span>
            {totalOffWork > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>เลิกงาน <strong className="text-slate-800 dark:text-slate-200">{totalOffWork}</strong></span>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedEmployeeName && onSelectEmployee && (
            <button
              type="button"
              onClick={() => onSelectEmployee(null)}
              className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 font-semibold cursor-pointer transition"
            >
              แสดงทุกคน
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition flex items-center gap-1"
            title={isExpanded ? 'ย่อแถบสรุป' : 'ขยายแถบสรุป'}
          >
            <span className="hidden sm:inline">{isExpanded ? 'ซ่อน' : 'ดูรายชื่อ'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Employee List Grid */}
      {isExpanded && (
        <div className="p-3 sm:p-4">
          {regularEmployees.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400">
              ยังไม่มีข้อมูลพนักงานในระบบ
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {regularEmployees.map((emp) => {
                const isSelected = selectedEmployeeName === emp.name;
                const canManage = isAdmin || emp.uid === currentUser?.uid;

                return (
                  <div
                    key={emp.uid}
                    onClick={() => onSelectEmployee && onSelectEmployee(isSelected ? null : emp.name)}
                    className={clsx(
                      "p-2.5 rounded-xl border transition-all text-left flex items-center gap-2.5 select-none group min-h-[54px]",
                      onSelectEmployee ? "cursor-pointer" : "",
                      isSelected
                        ? "ring-2 ring-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700"
                        : emp.isOffWork
                        ? "bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-65 hover:opacity-100"
                        : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    )}
                  >
                    {/* Left: Animal Avatar with status indicator */}
                    <div className="relative shrink-0">
                      <AnimalAvatar 
                        avatarEmoji={emp.avatarEmoji} 
                        identifier={emp.username || emp.uid} 
                        name={emp.name} 
                        size="sm" 
                      />
                      <span
                        className={clsx(
                          "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900",
                          emp.isOffWork
                            ? "bg-slate-400"
                            : emp.isBusy
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        )}
                      />
                    </div>

                    {/* Right: Info in 2 clean rows */}
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <span 
                          className={clsx(
                            "text-xs font-bold truncate leading-tight",
                            emp.isOffWork ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-slate-100"
                          )}
                          title={emp.name}
                        >
                          {emp.name}
                        </span>

                        {canManage && !emp.isOffWork && (
                          <button
                            type="button"
                            title="คลิกเพื่อบันทึกเลิกงาน (คืนเคสกลับไปรอรับเคส)"
                            onClick={(e) => {
                              e.stopPropagation();
                              const found = employees.find((x) => x.uid === emp.uid) || {
                                uid: emp.uid,
                                name: emp.name,
                                username: emp.username,
                                role: 'employee',
                                createdAt: Date.now(),
                              };
                              setClockOutTarget(found);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition cursor-pointer shrink-0 opacity-70 group-hover:opacity-100"
                          >
                            <LogOut className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Row 2: Clean status text / pill */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap tabular-nums">
                        {emp.isOffWork ? (
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="text-[11px] font-medium text-slate-400 dark:text-slate-500"
                              title={emp.autoClockOutReason ? `ออกงานอัตโนมัติ: ${emp.autoClockOutReason}` : undefined}
                            >
                              เลิกงาน{emp.autoClockOutReason ? ' (ระบบ)' : ''}
                            </span>
                            {canManage && (
                              <button
                                type="button"
                                title="คลิกเพื่อบันทึกเข้างาน"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (currentUser && (currentUser.uid === emp.uid || currentUser.username === emp.username)) {
                                    await clockIn();
                                  } else {
                                    await clockInEmployee(emp.uid);
                                    fetchRegisteredUsers();
                                  }
                                }}
                                className="px-1.5 py-0.2 rounded text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer shrink-0"
                              >
                                เข้างาน
                              </button>
                            )}
                          </div>
                        ) : emp.activeCount > 0 ? (
                          <div className="flex items-center gap-1">
                            {emp.regularCaseCount > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 whitespace-nowrap">
                                {emp.regularCaseCount} เคส
                              </span>
                            )}
                            {emp.customTaskCount > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 whitespace-nowrap">
                                {emp.customTaskCount} งาน
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            ว่างรับเคส
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Clock Out Confirmation Modal */}
      {clockOutTarget && (
        <ClockOutConfirmModal
          isOpen={true}
          onClose={() => setClockOutTarget(null)}
          employeeId={clockOutTarget.uid}
          employeeName={clockOutTarget.name}
          isSelf={clockOutTarget.uid === currentUser?.uid}
          onSuccess={(res) => {
            if (res.returnedCasesCount > 0) {
              alert(`บันทึกเลิกงานให้ ${clockOutTarget.name} สำเร็จ! ส่งคืนเคสกลับไป "รอรับเคส" จำนวน ${res.returnedCasesCount} เคส`);
            }
          }}
        />
      )}
    </div>
  );
};


