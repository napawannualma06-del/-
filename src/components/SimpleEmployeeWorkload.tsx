import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case, DutyWorker, CreditCheckDuty, UserProfile } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  Users, 
  UserCheck, 
  Clock, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp, 
  Crown,
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
  activeCount: number;
  activeCases: Case[];
  isOnDuty: boolean;
  isBusy: boolean;
  closedCount: number;
  isAdmin: boolean;
}

export const SimpleEmployeeWorkload: React.FC<SimpleEmployeeWorkloadProps> = ({
  cases,
  selectedEmployeeName,
  onSelectEmployee,
  className,
}) => {
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [dutyWorkers, setDutyWorkers] = useState<DutyWorker[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

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
      (c) => c.assigneeId === emp.uid && (c.status === 'processing' || c.status === 'credit_check')
    );
    const closedCount = cases.filter((c) => c.assigneeId === emp.uid && c.status === 'closed').length;
    const isOnDuty = dutyWorkers.some((w) => w.uid === emp.uid || w.username === emp.username);
    const isBusy = activeCases.length > 0 || isOnDuty;

    return {
      uid: emp.uid,
      name: emp.name || emp.username,
      username: emp.username,
      activeCount: activeCases.length,
      activeCases,
      isOnDuty,
      isBusy,
      closedCount,
      isAdmin: isSuperAdmin,
    };
  });

  // Separate regular employees and admin
  const regularEmployees = workloads.filter((w) => !w.isAdmin);
  const adminWorker = workloads.find((w) => w.isAdmin);

  // Sort: Busy employees (highest active count first), then on duty, then idle
  regularEmployees.sort((a, b) => {
    if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
    if (b.isOnDuty !== a.isOnDuty) return b.isOnDuty ? 1 : -1;
    return a.name.localeCompare(b.name, 'th');
  });

  const totalBusy = regularEmployees.filter((w) => w.isBusy).length;
  const totalIdle = regularEmployees.filter((w) => !w.isBusy).length;

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden transition-all",
      className
    )}>
      {/* Header Bar */}
      <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                สรุปงานพนักงาน (ใครกำลังรับกี่เคส)
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                  ทำเคสอยู่ {totalBusy} คน
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                  ว่างงาน {totalIdle} คน
                </span>
              </div>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
              กดที่ชื่อพนักงานเพื่อดูเฉพาะเคสของคนนั้นได้ทันที
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {selectedEmployeeName && onSelectEmployee && (
            <button
              type="button"
              onClick={() => onSelectEmployee(null)}
              className="text-[11px] px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 font-semibold cursor-pointer"
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

      {/* Simple Employee List / Grid */}
      {isExpanded && (
        <div className="p-3 sm:p-3.5">
          {regularEmployees.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400">
              ยังไม่มีข้อมูลพนักงานในระบบ
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {regularEmployees.map((emp) => {
                const isSelected = selectedEmployeeName === emp.name;
                return (
                  <div
                    key={emp.uid}
                    onClick={() => onSelectEmployee && onSelectEmployee(isSelected ? null : emp.name)}
                    className={clsx(
                      "p-2 sm:p-2.5 rounded-xl border transition-all text-left flex items-center justify-between gap-2 select-none",
                      onSelectEmployee ? "cursor-pointer hover:shadow-xs active:scale-[0.98]" : "",
                      isSelected
                        ? "ring-2 ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700"
                        : emp.activeCount > 0
                        ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
                        : emp.isOnDuty
                        ? "bg-indigo-50/30 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60"
                        : "bg-emerald-50/20 dark:bg-emerald-950/10 border-slate-200/80 dark:border-slate-800"
                    )}
                  >
                    {/* Left: Animal Avatar + Name */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="relative shrink-0">
                        <AnimalAvatar identifier={emp.username || emp.uid} name={emp.name} size="sm" />
                        {emp.isBusy ? (
                          <span className={clsx(
                            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white dark:ring-slate-900",
                            emp.isOnDuty && emp.activeCount === 0 ? "bg-indigo-600" : "bg-amber-500 animate-ping"
                          )} />
                        ) : (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate leading-tight">
                          {emp.name}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {emp.isOnDuty && (
                            <span className="text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100/70 dark:bg-indigo-950/70 px-1 rounded flex items-center shrink-0">
                              <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                              เวรเช็ค
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Case Count Badge (Simple & Clear) */}
                    <div className="shrink-0 text-right">
                      {emp.activeCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-500 text-white shadow-2xs">
                          <Clock className="w-3 h-3 mr-1" />
                          {emp.activeCount} เคส
                        </span>
                      ) : emp.isOnDuty ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-lg text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          0 เคส
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <UserCheck className="w-2.5 h-2.5 mr-0.5 text-emerald-600" />
                          ว่าง
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Admin Profile (Separate, not counted as regular employee) */}
              {adminWorker && (
                <div className="p-2 sm:p-2.5 rounded-xl border border-dashed border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10 flex items-center justify-between gap-2 text-left">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <AnimalAvatar identifier={adminWorker.username || adminWorker.uid} name={adminWorker.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {adminWorker.name}
                        </span>
                      </div>
                      <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                        แอดมินระบบ
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {adminWorker.activeCount > 0 ? (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-500 text-white">
                        {adminWorker.activeCount} เคส
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">
                        ดูแลระบบ
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
