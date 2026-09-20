import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { Case, DutyWorker, CreditCheckDuty, UserProfile } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { ClockOutConfirmModal } from './ClockOutConfirmModal';
import { clockInEmployee } from '../lib/shiftService';
import { 
  Users, 
  UserCheck, 
  Clock, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp, 
  Crown,
  Moon,
  LogOut
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
  activeCases: Case[];
  isOnDuty: boolean;
  isBusy: boolean;
  isOffWork: boolean;
  offWorkAt?: number;
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
  const [dutyWorkers, setDutyWorkers] = useState<DutyWorker[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [clockOutTarget, setClockOutTarget] = useState<UserProfile | null>(null);

  // Subscribe to registered users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as UserProfile;
        list.push({ ...data, uid: d.id });
      });
      setEmployees(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => unsub();
  }, []);

  // Subscribe to Credit Check Duty Station
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_duties', 'credit_check'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as CreditCheckDuty;
        setDutyWorkers(data.workers || []);
      } else {
        setDutyWorkers([]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'system_duties/credit_check');
    });

    return () => unsub();
  }, []);

  // Calculate workloads
  const workloads: EmployeeWorkloadSummary[] = employees.map((emp) => {
    const isSuperAdmin = emp.username?.toLowerCase() === 'gametpl' || emp.uid === 'admin_gametpl';
    const activeCases = cases.filter(
      (c) => (c.assigneeId === emp.uid || c.assigneeName === emp.name) && (c.status === 'processing' || c.status === 'credit_check')
    );
    const closedCount = cases.filter((c) => (c.assigneeId === emp.uid || c.assigneeName === emp.name) && c.status === 'closed').length;
    const isOnDuty = dutyWorkers.some((w) => w.uid === emp.uid || w.username === emp.username);
    const isOffWork = emp.workStatus === 'off_work';
    const isBusy = !isOffWork && (activeCases.length > 0 || isOnDuty);

    return {
      uid: emp.uid,
      name: emp.name || emp.username,
      username: emp.username,
      avatarEmoji: emp.avatarEmoji,
      activeCount: activeCases.length,
      activeCases,
      isOnDuty,
      isBusy,
      isOffWork,
      offWorkAt: emp.offWorkAt,
      closedCount,
      isAdmin: isSuperAdmin,
    };
  });

  // Separate regular employees and admin
  const regularEmployees = workloads.filter((w) => !w.isAdmin);
  const adminWorker = workloads.find((w) => w.isAdmin);

  // Sort: Busy employees first, then on duty, then idle, then off-work at the bottom
  regularEmployees.sort((a, b) => {
    if (a.isOffWork !== b.isOffWork) return a.isOffWork ? 1 : -1;
    if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
    if (b.isOnDuty !== a.isOnDuty) return b.isOnDuty ? 1 : -1;
    return a.name.localeCompare(b.name, 'th');
  });

  const totalBusy = regularEmployees.filter((w) => !w.isOffWork && w.isBusy).length;
  const totalIdle = regularEmployees.filter((w) => !w.isOffWork && !w.isBusy).length;
  const totalOffWork = regularEmployees.filter((w) => w.isOffWork).length;

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden transition-all",
      className
    )}>
      {/* Header Bar (Original style with summary chips) */}
      <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                สรุปงานพนักงาน (ใครกำลังรับกี่เคส)
              </h3>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                  ทำเคสอยู่ {totalBusy} คน
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                  ว่างงาน {totalIdle} คน
                </span>
                {totalOffWork > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    เลิกงาน {totalOffWork} คน
                  </span>
                )}
              </div>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
              กดที่ชื่อพนักงานเพื่อดูเฉพาะเคสของคนนั้นได้ทันที
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedEmployeeName && onSelectEmployee && (
            <button
              type="button"
              onClick={() => onSelectEmployee(null)}
              className="text-[11px] px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 font-semibold cursor-pointer border border-indigo-200 dark:border-indigo-800"
            >
              แสดงทุกคน
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg cursor-pointer transition"
            title={isExpanded ? 'ย่อแถบสรุป' : 'ขยายแถบสรุป'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Employee List Grid (Clean, readable, same compact card format) */}
      {isExpanded && (
        <div className="p-3 sm:p-3.5">
          {regularEmployees.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400">
              ยังไม่มีข้อมูลพนักงานในระบบ
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
              {regularEmployees.map((emp) => {
                const isSelected = selectedEmployeeName === emp.name;
                const canManage = isAdmin || emp.uid === currentUser?.uid;

                return (
                  <div
                    key={emp.uid}
                    onClick={() => onSelectEmployee && onSelectEmployee(isSelected ? null : emp.name)}
                    className={clsx(
                      "p-2 rounded-xl border transition-all text-left flex items-center gap-2 select-none group min-h-[56px]",
                      onSelectEmployee ? "cursor-pointer hover:shadow-xs active:scale-[0.98]" : "",
                      isSelected
                        ? "ring-2 ring-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 shadow-xs"
                        : emp.isOffWork
                        ? "bg-slate-50/70 dark:bg-slate-900/30 border-slate-200/70 dark:border-slate-800/80 opacity-75 hover:opacity-100"
                        : emp.activeCount > 0
                        ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
                        : emp.isOnDuty
                        ? "bg-indigo-50/30 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60"
                        : "bg-emerald-50/20 dark:bg-emerald-950/10 border-slate-200/80 dark:border-slate-800"
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
                      {emp.isOffWork ? (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-slate-400 ring-1 ring-white dark:ring-slate-900" title="เลิกงานแล้ว" />
                      ) : emp.isBusy ? (
                        <span className={clsx(
                          "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white dark:ring-slate-900",
                          emp.isOnDuty && emp.activeCount === 0 ? "bg-indigo-600" : "bg-amber-500 animate-pulse"
                        )} />
                      ) : (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" />
                      )}
                    </div>

                    {/* Right: Info in 2 rows for maximum readability */}
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      {/* Row 1: Name + Logout button */}
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <span 
                          className={clsx(
                            "text-xs sm:text-[13px] font-bold truncate leading-tight",
                            emp.isOffWork ? "text-slate-600 dark:text-slate-400" : "text-slate-900 dark:text-slate-100"
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
                            className="p-0.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-100/70 dark:hover:bg-amber-950/60 transition cursor-pointer shrink-0"
                          >
                            <LogOut className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Row 2: Badges (Never wrap weirdly, easily readable) */}
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {emp.isOffWork ? (
                          <>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                              <Moon className="w-2.5 h-2.5 mr-0.5 text-slate-400 shrink-0" />
                              เลิกงาน
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
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-800 transition cursor-pointer shrink-0 whitespace-nowrap"
                              >
                                เข้างาน
                              </button>
                            )}
                          </>
                        ) : emp.activeCount > 0 ? (
                          <>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-500 text-white shadow-2xs whitespace-nowrap">
                              <Clock className="w-2.5 h-2.5 mr-0.5 shrink-0" />
                              {emp.activeCount} เคส
                            </span>
                            {emp.isOnDuty && (
                              <span className="text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100/70 dark:bg-indigo-950/70 px-1 py-0.5 rounded inline-flex items-center shrink-0 whitespace-nowrap border border-indigo-200/60 dark:border-indigo-800/60">
                                <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                                เวรเช็ค
                              </span>
                            )}
                          </>
                        ) : emp.isOnDuty ? (
                          <>
                            <span className="text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100/70 dark:bg-indigo-950/70 px-1 py-0.5 rounded inline-flex items-center shrink-0 whitespace-nowrap border border-indigo-200/60 dark:border-indigo-800/60">
                              <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                              เวรเช็ค
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                              ว่าง
                            </span>
                          </>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                            <UserCheck className="w-2.5 h-2.5 mr-0.5 text-emerald-600 shrink-0" />
                            ว่าง
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Admin Profile (Original compact bottom card) */}
              {adminWorker && (
                <div className="p-2 rounded-xl border border-dashed border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10 flex items-center gap-2 text-left min-h-[56px]">
                  <div className="relative shrink-0">
                    <AnimalAvatar 
                      avatarEmoji={adminWorker.avatarEmoji} 
                      identifier={adminWorker.username || adminWorker.uid} 
                      name={adminWorker.name} 
                      size="sm" 
                    />
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate">
                        {adminWorker.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                        แอดมิน
                      </span>
                      {adminWorker.activeCount > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white shadow-2xs">
                          {adminWorker.activeCount} เคส
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">
                          ดูแลระบบ
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
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


