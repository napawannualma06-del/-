import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case, statusMap } from './Queue';
import { isStuckCase, isNewCase } from '../lib/caseUtils';
import { Logo } from './Logo';
import { AnimalAvatar } from './AnimalAvatar';
import { DutyWorker, CreditCheckDuty } from '../types';
import { 
  BarChart3, 
  Users, 
  CheckCircle, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  Ban,
  UserCheck,
  UserX,
  Smartphone,
  Search,
  Filter,
  MapPin,
  ChevronRight,
  ShieldCheck,
  Banknote,
  Sparkles,
  StickyNote,
  FileSignature,
  Activity,
  LayoutGrid,
  Layers,
  Crown,
  Moon,
  LogOut,
  ArrowRightLeft,
  RotateCcw,
  ClockAlert
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { CreditCheckDutyStation } from './CreditCheckDutyStation';
import { ClockOutConfirmModal } from './ClockOutConfirmModal';
import { TransferCaseModal } from './TransferCaseModal';
import { ReturnCaseModal } from './ReturnCaseModal';
import { CloseCaseModal } from './CloseCaseModal';
import { TechnicalIssueModal } from './TechnicalIssueModal';
import { AdminOTDashboard } from './AdminOTDashboard';
import { AdminAdvanceDashboard } from './AdminAdvanceDashboard';
import { getPreviousAssignee } from '../lib/caseUtils';
import { 
  getExpiredCases, 
  autoCancelExpiredCases, 
  AUTO_CANCEL_REMARK 
} from '../lib/autoCancelService';
import { clockInEmployee } from '../lib/shiftService';
import { useStore, isUserAdmin } from '../store/useStore';
import { Wrench } from 'lucide-react';

interface EmployeeProfile {
  uid: string;
  name: string;
  username: string;
  role?: string;
  createdAt?: number;
  workStatus?: 'working' | 'off_work';
  offWorkAt?: number;
}

export type TimeframeMode = 'today' | 'yesterday' | 'last7days' | 'thisMonth' | 'custom' | 'all';

export function AdminDashboard() {
  const { user, registeredUsers } = useStore();
  const isAdmin = isUserAdmin(user);

  const [cases, setCases] = useState<Case[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [dutyWorkers, setDutyWorkers] = useState<DutyWorker[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date Granularity (Cutoff at Midnight: 00:00:00 - 23:59:59.999)
  const [timeFilter, setTimeFilter] = useState<TimeframeMode>('today');
  const [customStartDate, setCustomStartDate] = useState(() => {
    return format(new Date(), 'yyyy-MM-dd');
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return format(new Date(), 'yyyy-MM-dd');
  });

  const [clockOutTarget, setClockOutTarget] = useState<EmployeeProfile | null>(null);

  // Case action modals
  const [activeReassignCase, setActiveReassignCase] = useState<Case | null>(null);
  const [activeReturnCase, setActiveReturnCase] = useState<Case | null>(null);
  const [activeCloseCase, setActiveCloseCase] = useState<Case | null>(null);
  const [showTechModal, setShowTechModal] = useState(false);
  const [pendingTechCount, setPendingTechCount] = useState(0);
  const [pendingOTCount, setPendingOTCount] = useState(0);
  const [pendingAdvanceCount, setPendingAdvanceCount] = useState(0);
  const [mainTab, setMainTab] = useState<'cases' | 'ot' | 'advance'>('cases');

  // Subscribe to technical_issues count
  useEffect(() => {
    const q = query(collection(db, 'technical_issues'));
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === 'pending' || d.status === 'in_progress') {
          count++;
        }
      });
      setPendingTechCount(count);
    }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    // 1. Subscribe to cases collection
    const qCases = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
    const unsubCases = onSnapshot(qCases, (snapshot) => {
      const casesData: Case[] = [];
      snapshot.forEach((doc) => {
        casesData.push({ id: doc.id, ...doc.data() } as Case);
      });
      setCases(casesData);
      setLoading(false);

      // Auto-cancel cases older than 3 days
      const expired = getExpiredCases(casesData);
      if (expired.length > 0) {
        autoCancelExpiredCases(expired, 'auto').catch(() => {});
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'cases');
      setLoading(false);
    });

    // 2. Subscribe to users collection
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const usersData: EmployeeProfile[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        usersData.push({
          uid: doc.id,
          name: d.name || 'พนักงาน',
          username: d.username || doc.id,
          role: d.role || 'employee',
          createdAt: d.createdAt,
          workStatus: d.workStatus || 'working',
          offWorkAt: d.offWorkAt,
        });
      });
      setEmployees(usersData);
    }, (error) => {
      console.warn('Could not read users collection, using fallback from cases:', error);
    });

    // 3. Subscribe to credit check duty station (so duty workers are NEVER marked idle/ว่างงาน)
    const dutyDocRef = doc(db, 'system_duties', 'credit_check');
    const unsubDuty = onSnapshot(dutyDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CreditCheckDuty;
        setDutyWorkers(Array.isArray(data.workers) ? data.workers : []);
      } else {
        setDutyWorkers([]);
      }
    }, (err) => {
      console.warn('Could not read credit check duty in admin dashboard:', err);
    });

    // 4. Subscribe to overtime_requests count
    const qOT = query(collection(db, 'overtime_requests'));
    const unsubOT = onSnapshot(qOT, (snap) => {
      let count = 0;
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === 'pending') {
          count++;
        }
      });
      setPendingOTCount(count);
    }, () => {});

    // 5. Subscribe to advance_requests count
    const qAdv = query(collection(db, 'advance_requests'));
    const unsubAdv = onSnapshot(qAdv, (snap) => {
      let count = 0;
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === 'pending') {
          count++;
        }
      });
      setPendingAdvanceCount(count);
    }, () => {});

    return () => {
      unsubCases();
      unsubUsers();
      unsubDuty();
      unsubOT();
      unsubAdv();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3"></div>
        <p className="text-sm">กำลังโหลดข้อมูลแดชบอร์ด...</p>
      </div>
    );
  }

  // Midnight Cutoff Time Calculations (00:00:00.000 - 23:59:59.999)
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const startOfYesterday = new Date(yesterdayDate.getFullYear(), yesterdayDate.getMonth(), yesterdayDate.getDate(), 0, 0, 0, 0).getTime();
  const endOfYesterday = new Date(yesterdayDate.getFullYear(), yesterdayDate.getMonth(), yesterdayDate.getDate(), 23, 59, 59, 999).getTime();

  const sevenDaysDate = new Date(now);
  sevenDaysDate.setDate(sevenDaysDate.getDate() - 6);
  const startOf7Days = new Date(sevenDaysDate.getFullYear(), sevenDaysDate.getMonth(), sevenDaysDate.getDate(), 0, 0, 0, 0).getTime();

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

  let customStartTs = startOfToday;
  let customEndTs = endOfToday;
  if (customStartDate) {
    const parts = customStartDate.split('-').map(Number);
    if (parts.length === 3) {
      customStartTs = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
    }
  }
  if (customEndDate) {
    const parts = customEndDate.split('-').map(Number);
    if (parts.length === 3) {
      customEndTs = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();
    }
  }

  // Filter cases based on selected timeframe with strict midnight cutoffs
  const filteredCases = cases.filter((c) => {
    if (timeFilter === 'all') return true;

    let minT = startOfToday;
    let maxT = endOfToday;

    if (timeFilter === 'today') {
      minT = startOfToday;
      maxT = endOfToday;
    } else if (timeFilter === 'yesterday') {
      minT = startOfYesterday;
      maxT = endOfYesterday;
    } else if (timeFilter === 'last7days') {
      minT = startOf7Days;
      maxT = endOfToday;
    } else if (timeFilter === 'thisMonth') {
      minT = startOfMonth;
      maxT = endOfToday;
    } else if (timeFilter === 'custom') {
      minT = customStartTs;
      maxT = customEndTs;
    }

    const tCreated = c.createdAt || 0;
    const tCompleted = c.completedAt || 0;
    const tCancelled = c.cancelledAt || 0;

    return (
      (tCreated >= minT && tCreated <= maxT) ||
      (tCompleted >= minT && tCompleted <= maxT) ||
      (tCancelled >= minT && tCancelled <= maxT)
    );
  });

  const closedCases = filteredCases.filter(c => c.status === 'closed');
  const cancelledCases = filteredCases.filter(c => c.status === 'cancelled');
  const activeCases = filteredCases.filter(c => c.status === 'credit_check' || c.status === 'processing');
  const pendingCases = filteredCases.filter(c => c.status === 'pending');
  const contractedCases = filteredCases.filter(c => !!c.contractNumber?.trim());
  
  // Separated New vs Stuck cases
  const stuckCases = filteredCases.filter(c => isStuckCase(c, employees) && c.status !== 'closed' && c.status !== 'cancelled');
  const newCases = filteredCases.filter(c => isNewCase(c, employees));
  const totalNewAndStuckCases = filteredCases.filter(c => (isStuckCase(c, employees) || isNewCase(c, employees)) && c.status !== 'closed' && c.status !== 'cancelled');

  // Merge registered employees with any assignee found in cases
  const employeeMap: Record<string, EmployeeProfile> = {};
  employees.forEach(emp => {
    employeeMap[emp.uid] = emp;
    if (emp.name) {
      employeeMap[emp.name.toLowerCase()] = emp;
    }
  });

  // Also include registeredUsers from store if not in employeeMap
  registeredUsers.forEach(u => {
    if (u.uid && !employeeMap[u.uid]) {
      employeeMap[u.uid] = {
        uid: u.uid,
        name: u.name,
        username: u.username || u.uid,
        role: u.role,
        workStatus: u.workStatus || 'working',
        offWorkAt: u.offWorkAt,
      };
    }
  });

  // Ensure current logged in user (Napawan) is present in employeeMap
  if (user && user.uid && !employeeMap[user.uid]) {
    employeeMap[user.uid] = {
      uid: user.uid,
      name: user.name || 'Napawan',
      username: user.username || 'napawan',
      role: user.role || 'admin',
      workStatus: user.workStatus || 'working',
      offWorkAt: user.offWorkAt,
    };
  }

  // Also include any assignee who worked on a case if not in users list
  cases.forEach(c => {
    if (c.assigneeId && !employeeMap[c.assigneeId]) {
      const syntheticEmp: EmployeeProfile = {
        uid: c.assigneeId,
        name: c.assigneeName || c.assigneeId,
        username: c.assigneeName ? c.assigneeName.toLowerCase().replace(/\s+/g, '') : c.assigneeId,
      };
      employeeMap[c.assigneeId] = syntheticEmp;
    }
  });

  // Unique list of operational employees and team members (including Napawan)
  const allEmployees: EmployeeProfile[] = Array.from(
    new Map(Object.values(employeeMap).map(e => [e.uid, e])).values()
  ).filter(emp => {
    const isNapawan = 
      emp.username?.toLowerCase() === 'napawan' ||
      emp.name?.toLowerCase().includes('napawan') ||
      emp.uid === 'admin_napawan' ||
      ((emp as any).email && (emp as any).email.toLowerCase().includes('napawan'));

    if (isNapawan) return true; // Explicitly ensure Napawan is included in performance and dashboard

    // Only exclude technical super-admin gametpl if they don't have any cases
    if (emp.username?.toLowerCase() === 'gametpl' || emp.uid === 'admin_gametpl') {
      const hasCases = cases.some(c => c.assigneeId === emp.uid || c.assigneeName?.toLowerCase() === emp.name?.toLowerCase());
      return hasCases;
    }

    return true;
  });

  // Compute workload for each employee based on current live cases
  interface EmployeeWorkload {
    employee: EmployeeProfile;
    activeCases: Case[];
    closedCount: number;
    cancelledCount: number;
    isBusy: boolean;
    isOffWork: boolean;
    isOnCreditCheckDuty: boolean;
  }

  const workloads: EmployeeWorkload[] = allEmployees.map((emp) => {
    // Current active cases assigned to this employee (credit_check or processing)
    const empActiveCases = cases.filter(c => 
      (c.status === 'credit_check' || c.status === 'processing') &&
      (c.assigneeId === emp.uid || (c.assigneeName && c.assigneeName.toLowerCase() === emp.name.toLowerCase()))
    );

    // Filtered closed cases
    const empClosedCount = filteredCases.filter(c => 
      c.status === 'closed' &&
      (c.assigneeId === emp.uid || (c.assigneeName && c.assigneeName.toLowerCase() === emp.name.toLowerCase()))
    ).length;

    // Filtered cancelled cases
    const empCancelledCount = filteredCases.filter(c => 
      c.status === 'cancelled' &&
      (c.assigneeId === emp.uid || (c.assigneeName && c.assigneeName.toLowerCase() === emp.name.toLowerCase()))
    ).length;

    // Check if this employee is currently on credit check duty (Max 2 workers)
    const isOnCreditCheckDuty = dutyWorkers.some(w => 
      w.uid === emp.uid || 
      (w.username && w.username.toLowerCase() === emp.username.toLowerCase()) || 
      (w.name && w.name.toLowerCase() === emp.name.toLowerCase())
    );

    const isOffWork = emp.workStatus === 'off_work';
    // If off work, they are not busy and cannot hold active cases
    const isBusy = !isOffWork && (empActiveCases.length > 0 || isOnCreditCheckDuty);

    return {
      employee: emp,
      activeCases: empActiveCases,
      closedCount: empClosedCount,
      cancelledCount: empCancelledCount,
      isBusy,
      isOffWork,
      isOnCreditCheckDuty,
    };
  });

  // Sort employees for leaderboard
  const sortedLeaderboard = [...workloads].sort((a, b) => b.closedCount - a.closedCount);

  return (
    <div className="space-y-5 sm:space-y-7 max-w-7xl mx-auto">
      {/* Top Header - Accessible to Everyone */}
      <div className="flex flex-col gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Logo size="sm" />
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center">
                {mainTab === 'cases' ? 'แดชบอร์ดและสถิติภาพรวม' : mainTab === 'ot' ? 'แดชบอร์ด OT พนักงานทุกคน' : 'แดชบอร์ดขอเบิกเงินแอดวานซ์ พนักงานทุกคน'}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1">
              {mainTab === 'cases'
                ? 'สรุปข้อมูลการดำเนินงาน สถิติปิดเคส และตารางอันดับผลงาน (ระบบตัดรอบเวลาเที่ยงคืน 00:00 - 23:59 น.)'
                : mainTab === 'ot'
                ? 'แดชบอร์ดแอดมินสำหรับตรวจอนุมัติ สรุปยอดชั่วโมง OT รายบุคคล และส่งออกไฟล์ Excel (ตัดรอบทุกวันที่ 25)'
                : 'แดชบอร์ดแอดมินสำหรับตรวจอนุมัติเบิกเงิน โอนเงิน แนบสลิปหลักฐาน และส่งออกไฟล์ Excel (ตัดรอบทุกวันที่ 25)'}
            </p>
          </div>

          {/* Action Modals and Tab Switchers */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Main Section Switcher: แดชบอร์ดเคส vs แดชบอร์ด OT vs แดชบอร์ดแอดวานซ์ */}
            <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setMainTab('cases')}
                className={clsx(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0",
                  mainTab === 'cases'
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span>เคส</span>
              </button>

              <button
                type="button"
                onClick={() => setMainTab('ot')}
                className={clsx(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap relative shrink-0",
                  mainTab === 'ot'
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>OT</span>
                {pendingOTCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-2xs animate-pulse">
                    {pendingOTCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setMainTab('advance')}
                className={clsx(
                  "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap relative shrink-0",
                  mainTab === 'advance'
                    ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Banknote className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>แอดวานซ์</span>
                {pendingAdvanceCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-2xs animate-pulse">
                    {pendingAdvanceCount}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTechModal(true)}
              className={clsx(
                "px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap",
                pendingTechCount > 0
                  ? "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              )}
              title="ดูรายการแจ้งปัญหาด้านเทคนิค"
            >
              <Wrench className="w-3.5 h-3.5 text-rose-500" />
              <span>ปัญหาเทคนิค</span>
              {pendingTechCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold animate-pulse">
                  รอแก้ {pendingTechCount}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-normal">(ปกติ)</span>
              )}
            </button>
          </div>

          {/* Timeframe Presets - Only for cases dashboard */}
          {mainTab === 'cases' && (
            <div className="flex items-center flex-wrap gap-1 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTimeFilter('today')}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap",
                  timeFilter === 'today' 
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                วันนี้ ({format(new Date(), 'dd MMM', { locale: th })})
              </button>

              <button
                type="button"
                onClick={() => setTimeFilter('yesterday')}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap",
                  timeFilter === 'yesterday' 
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                เมื่อวาน
              </button>

              <button
                type="button"
                onClick={() => setTimeFilter('last7days')}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap",
                  timeFilter === 'last7days' 
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                7 วันล่าสุด
              </button>

              <button
                type="button"
                onClick={() => setTimeFilter('thisMonth')}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap",
                  timeFilter === 'thisMonth' 
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                เดือนนี้
              </button>

              <button
                type="button"
                onClick={() => setTimeFilter('custom')}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap flex items-center gap-1",
                  timeFilter === 'custom' 
                    ? "bg-indigo-600 text-white shadow-xs font-bold" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <Calendar className="w-3 h-3" />
                <span>ระบุช่วงวัน</span>
              </button>

              <button
                type="button"
                onClick={() => setTimeFilter('all')}
                className={clsx(
                  "px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap",
                  timeFilter === 'all' 
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold" 
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                ทั้งหมด ({cases.length})
              </button>
            </div>
          )}
        </div>

        {/* Custom Date Range Selector (Midnight Cutoff) */}
        {mainTab === 'cases' && timeFilter === 'custom' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl">
            <div className="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="font-medium">
                เลือกช่วงวันที่ต้องการดู (ตัดรอบเวลาเที่ยงคืน 00:00:00 - 23:59:59 น.):
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <span className="text-slate-400">จาก:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-slate-800 dark:text-slate-200 font-medium focus:outline-none cursor-pointer"
                />
              </div>

              <span className="text-slate-400 text-xs">ถึง</span>

              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <span className="text-slate-400">ถึง:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-slate-800 dark:text-slate-200 font-medium focus:outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conditional Rendering based on Main Tab */}
      {mainTab === 'ot' ? (
        isAdmin ? (
          <AdminOTDashboard />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-4 max-w-xl mx-auto my-6 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">บันทึกเวลาทำงานล่วงเวลา (OT) ของฉัน</h3>
              <p className="text-xs text-slate-500 mt-1">เพื่อความเป็นส่วนตัว คุณสามารถดูประวัติการขอ OT และส่งคำขอใหม่ได้ที่หน้าต่าง OT ส่วนตัว</p>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-ot-modal'))}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              เปิดหน้าต่างจัดการ OT ของฉัน
            </button>
          </div>
        )
      ) : mainTab === 'advance' ? (
        isAdmin ? (
          <AdminAdvanceDashboard />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-4 max-w-xl mx-auto my-6 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Banknote className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">รายการขอเบิกเงินแอดวานซ์ (Advance) ของฉัน</h3>
              <p className="text-xs text-slate-500 mt-1">เพื่อความเป็นส่วนตัว คุณสามารถดูประวัติการขอเบิกและสลิปการโอนเงินได้ที่หน้าต่างแอดวานซ์ส่วนตัว</p>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-advance-modal'))}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <Banknote className="w-4 h-4" />
              เปิดหน้าต่างเบิกแอดวานซ์ของฉัน
            </button>
          </div>
        )
      ) : (
        <>
          {/* Credit Check Duty Station (2-person duty roster visible to everyone) */}
          <CreditCheckDutyStation />

          {/* OVERVIEW STAT CARDS (Focused on Cases & Results) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
        {/* Closed Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/80 dark:border-slate-800 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400">จบเคสแล้ว (สำเร็จ)</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {closedCases.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">
              {filteredCases.length > 0 ? Math.round((closedCases.length / filteredCases.length) * 100) : 0}% สำเร็จ
            </p>
          </div>
        </div>

        {/* New Cases (ยังไม่มีใครรับ) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/80 dark:border-slate-800 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400">เคสใหม่ (รอรับ)</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {newCases.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">ยังไม่มีใครรับ</p>
          </div>
        </div>

        {/* Stuck Cases (เคสค้าง) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-amber-200/80 dark:border-amber-900/60 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-amber-600 dark:text-amber-400">เคสค้าง</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <StickyNote className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stuckCases.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 line-clamp-1">ติดหมายเหตุ/เคยรับแล้ว</p>
          </div>
        </div>

        {/* Active In-Progress Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/80 dark:border-slate-800 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400">กำลังทำเคส</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Search className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-600 dark:text-blue-400">
              {activeCases.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">มีพนักงานดูแลอยู่</p>
          </div>
        </div>

        {/* Cases with Contract */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-sky-200/80 dark:border-sky-900/60 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-sky-600 dark:text-sky-400">มีเลขสัญญา</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <FileSignature className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-sky-600 dark:text-sky-400">
              {contractedCases.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-sky-600/80 dark:text-sky-400/80 mt-0.5 line-clamp-1">ระบุสัญญาเรียบร้อย</p>
          </div>
        </div>

        {/* Cancelled Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/80 dark:border-slate-800 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400">ยกเลิกเคส</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Ban className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-rose-600 dark:text-rose-400">
              {cancelledCases.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">เคส</span>
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
              <span>เคสที่ถูกยกเลิก</span>
              {cancelledCases.filter(c => c.remarks?.includes(AUTO_CANCEL_REMARK)).length > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-medium">
                  (เกิน 3 วัน {cancelledCases.filter(c => c.remarks?.includes(AUTO_CANCEL_REMARK)).length})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Total Employees */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/80 dark:border-slate-800 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400">พนักงานในระบบ</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              <Users className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
              {allEmployees.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">รวมทีมงานและแอดมิน</p>
          </div>
        </div>
      </div>

      {/* LOWER SECTION: PERFORMANCE LEADERBOARD & RECENT COMPLETED */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Employee Leaderboard */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center">
                <Users className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                ตารางผลงานพนักงาน (Performance Ranking)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                เรียงตามจำนวนเคสที่ปิดได้สำเร็จในช่วงเวลาที่เลือก
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
              {sortedLeaderboard.length} คน
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedLeaderboard.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                ยังไม่มีข้อมูลผลงานพนักงานในช่วงเวลานี้
              </div>
            ) : (
              sortedLeaderboard.map(({ employee, activeCases, closedCount, cancelledCount, isBusy, isOnCreditCheckDuty }, idx) => {
                const isMe = user && (employee.uid === user.uid || employee.username === user.username);
                return (
                <div key={employee.uid} className={clsx(
                  "px-5 py-3.5 flex items-center justify-between transition",
                  isMe ? "bg-indigo-50/80 dark:bg-indigo-950/50 border-l-4 border-indigo-600" : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                )}>
                  <div className="flex items-center min-w-0">
                    <div className="mr-3 shrink-0 relative">
                      <AnimalAvatar identifier={employee.username || employee.uid} name={employee.name} size="md" />
                      <span className={clsx(
                        "absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] shadow-xs ring-1 ring-white dark:ring-slate-900",
                        idx === 0 ? "bg-amber-400 text-amber-950 font-extrabold" :
                        idx === 1 ? "bg-slate-300 text-slate-800 font-bold" :
                        idx === 2 ? "bg-amber-200 text-amber-900 font-bold" : "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 font-bold"
                      )}>
                        {idx + 1}
                      </span>
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        {employee.name}
                        {isMe && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-600 text-white font-bold shadow-xs">
                            คุณ
                          </span>
                        )}
                        {isUserAdmin(employee) && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-medium">
                            แอดมิน
                          </span>
                        )}
                        {isBusy ? (
                          isOnCreditCheckDuty && activeCases.length === 0 ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-normal">
                              เวรเช็คเครดิต
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-normal">
                              กำลังทำ {activeCases.length} งาน
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-normal">
                            ว่างงาน
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>รหัส: @{employee.username}</span>
                        {cancelledCount > 0 && (
                          <span className="text-rose-500 dark:text-rose-400">ยกเลิก: {cancelledCount}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1 text-xs font-bold rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      ปิดแล้ว {closedCount} เคส
                    </span>
                  </div>
                </div>
              );
              })
            )}
          </div>
        </div>

        {/* Right: Recent Completed Cases Feed */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400" />
              เคสที่จบแล้วล่าสุด
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">รายการเคสที่ปิดสมบูรณ์แล้ว</p>
          </div>

          <div className="p-4 flex-1 overflow-y-auto max-h-[420px] space-y-2.5">
            {closedCases.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                ยังไม่มีเคสที่จบในรอบนี้
              </div>
            ) : (
              closedCases.slice(0, 10).map((c) => {
                const isCustom = Boolean(c.isCustomTask || c.caseType === 'custom_task');
                return (
                  <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      {isCustom ? (
                        <span className="font-semibold text-purple-700 dark:text-purple-300 truncate flex items-center gap-1">
                          <span className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-[10px] font-bold">งานพิเศษ</span>
                          <span className="truncate text-slate-900 dark:text-white">{c.taskTitle || c.iphoneModel.replace('[งานพิเศษ] ', '')}</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-900 dark:text-white truncate">{c.iphoneModel}</span>
                      )}
                      <span 
                        className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 whitespace-nowrap"
                        title={c.completedAt ? format(c.completedAt, 'd MMMM yyyy HH:mm:ss น.', { locale: th }) : ''}
                      >
                        {c.completedAt ? format(c.completedAt, 'd MMM HH:mm น.', { locale: th }) : ''}
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px] flex justify-between">
                      <span>{isCustom ? 'งานมอบหมายโดยแอดมิน' : `ตัวแทน: ${c.agentName} (${c.province})`}</span>
                      {!isCustom && c.contractNumber && (
                        <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold flex items-center">
                          <FileSignature className="w-3 h-3 mr-0.5" />
                          #{c.contractNumber}
                        </span>
                      )}
                    </div>
                    <div className="pt-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center">
                      <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                      {isCustom ? `ผู้จบงาน: ${c.assigneeName || 'ไม่ระบุ'}` : `ผู้จบเคส: ${c.assigneeName || 'ไม่ระบุ'}`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
        </>
      )}

      {/* Clock Out Confirm Modal for Admin */}
      {clockOutTarget && (
        <ClockOutConfirmModal
          isOpen={!!clockOutTarget}
          onClose={() => setClockOutTarget(null)}
          employeeId={clockOutTarget.uid}
          employeeName={clockOutTarget.name}
          isSelf={false}
          onSuccess={(res) => {
            alert(`บันทึกเลิกงานให้ ${clockOutTarget.name} เรียบร้อยแล้ว (คืนเคสกลับไป "รอรับเคส" จำนวน ${res.returnedCasesCount} เคส)`);
            setClockOutTarget(null);
          }}
        />
      )}

      {/* Transfer Case Modal */}
      {activeReassignCase && (
        <TransferCaseModal
          isOpen={!!activeReassignCase}
          onClose={() => setActiveReassignCase(null)}
          caseData={activeReassignCase}
          currentUser={user}
          registeredUsers={registeredUsers && registeredUsers.length > 0 ? registeredUsers : (employees as any)}
          onSuccess={() => setActiveReassignCase(null)}
        />
      )}

      {/* Return Case to Pending Modal */}
      {activeReturnCase && (
        <ReturnCaseModal
          isOpen={!!activeReturnCase}
          onClose={() => setActiveReturnCase(null)}
          caseData={activeReturnCase}
          currentUser={user}
          onSuccess={() => setActiveReturnCase(null)}
        />
      )}

      {/* Close Case Modal */}
      {activeCloseCase && (
        <CloseCaseModal
          isOpen={!!activeCloseCase}
          onClose={() => setActiveCloseCase(null)}
          caseData={activeCloseCase}
          currentUser={user}
          onSuccess={() => setActiveCloseCase(null)}
        />
      )}

      {/* Technical Issues Modal */}
      {showTechModal && (
        <TechnicalIssueModal
          isOpen={showTechModal}
          onClose={() => setShowTechModal(false)}
          defaultTab="list"
        />
      )}
    </div>
  );
}
