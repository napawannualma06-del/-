import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case, statusMap } from './Queue';
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
  RotateCcw
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { CreditCheckDutyStation } from './CreditCheckDutyStation';
import { ClockOutConfirmModal } from './ClockOutConfirmModal';
import { TransferCaseModal } from './TransferCaseModal';
import { ReturnCaseModal } from './ReturnCaseModal';
import { clockInEmployee } from '../lib/shiftService';
import { useStore } from '../store/useStore';

interface EmployeeProfile {
  uid: string;
  name: string;
  username: string;
  role?: string;
  createdAt?: number;
  workStatus?: 'working' | 'off_work';
  offWorkAt?: number;
}

export function AdminDashboard() {
  const { user, registeredUsers } = useStore();
  const [cases, setCases] = useState<Case[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [dutyWorkers, setDutyWorkers] = useState<DutyWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'all'>('today');
  
  // Dashboard primary view tab: 'simple' (สรุปงานแบบง่าย) | 'workload' (ดูตามพนักงาน) | 'active_cases' (ดูเคสกำลังทำอยู่ทั้งหมด)
  const [dashboardViewTab, setDashboardViewTab] = useState<'simple' | 'workload' | 'active_cases'>('simple');
  const [activeCaseSearch, setActiveCaseSearch] = useState('');
  const [activeCaseStatusFilter, setActiveCaseStatusFilter] = useState<'all' | 'credit_check' | 'processing' | 'pending'>('all');

  // Workload tab filter: 'all' | 'busy' | 'idle' | 'off_work'
  const [workloadFilter, setWorkloadFilter] = useState<'all' | 'busy' | 'idle' | 'off_work'>('all');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [clockOutTarget, setClockOutTarget] = useState<EmployeeProfile | null>(null);

  // Case action modals
  const [activeReassignCase, setActiveReassignCase] = useState<Case | null>(null);
  const [activeReturnCase, setActiveReturnCase] = useState<Case | null>(null);

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

    return () => {
      unsubCases();
      unsubUsers();
      unsubDuty();
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter cases based on selected timeframe
  const filteredCases = timeFilter === 'today'
    ? cases.filter(c => c.createdAt >= today.getTime() || (c.completedAt && c.completedAt >= today.getTime()) || (c.cancelledAt && c.cancelledAt >= today.getTime()))
    : cases;

  const closedCases = filteredCases.filter(c => c.status === 'closed');
  const cancelledCases = filteredCases.filter(c => c.status === 'cancelled');
  const activeCases = filteredCases.filter(c => c.status === 'credit_check' || c.status === 'processing');
  const pendingCases = filteredCases.filter(c => c.status === 'pending');
  const contractedCases = filteredCases.filter(c => !!c.contractNumber?.trim());
  // เคสทั้งหมด (เอาเคสที่จบแล้วออก ตามคำสั่ง: เคสที่จบแล้วให้เอาออกจาก เคสทั้งหมด)
  const totalOpenCases = filteredCases.filter(c => c.status !== 'closed');

  // Merge registered employees with any assignee found in cases
  const employeeMap: Record<string, EmployeeProfile> = {};
  employees.forEach(emp => {
    employeeMap[emp.uid] = emp;
    if (emp.name) {
      employeeMap[emp.name.toLowerCase()] = emp;
    }
  });

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

  // Check if an account is an admin
  const isUserAdmin = (emp: EmployeeProfile) => {
    return (
      emp.role === 'admin' ||
      emp.username?.toLowerCase() === 'gametpl' ||
      emp.uid === 'admin_gametpl' ||
      emp.name?.toLowerCase().includes('admin')
    );
  };

  // Find admin profile if present (for supervisor role display)
  const adminProfile = Object.values(employeeMap).find(e => isUserAdmin(e)) || null;

  // Unique list of operational employees (excluding admin as admin is supervisor, not an employee to count as idle/busy)
  const allEmployees: EmployeeProfile[] = Array.from(
    new Map(Object.values(employeeMap).map(e => [e.uid, e])).values()
  ).filter(emp => !isUserAdmin(emp));

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

  // Employees currently busy vs idle vs off-work
  const busyEmployees = workloads.filter(w => !w.isOffWork && w.isBusy);
  const idleEmployees = workloads.filter(w => !w.isOffWork && !w.isBusy);
  const offWorkEmployees = workloads.filter(w => w.isOffWork);

  // Filter workloads for display
  const displayedWorkloads = workloads.filter((w) => {
    if (workloadFilter === 'busy' && (w.isOffWork || !w.isBusy)) return false;
    if (workloadFilter === 'idle' && (w.isOffWork || w.isBusy)) return false;
    if (workloadFilter === 'off_work' && !w.isOffWork) return false;

    if (employeeSearch.trim()) {
      const q = employeeSearch.toLowerCase();
      const matchName = w.employee.name.toLowerCase().includes(q);
      const matchUsername = w.employee.username.toLowerCase().includes(q);
      const matchCase = w.activeCases.some(c => 
        c.iphoneModel.toLowerCase().includes(q) || 
        c.agentName.toLowerCase().includes(q) ||
        c.province.toLowerCase().includes(q)
      );
      return matchName || matchUsername || matchCase;
    }

    return true;
  });

  // Sort workloads: working employees first (busy first, then idle), then off-work employees at bottom
  displayedWorkloads.sort((a, b) => {
    if (a.isOffWork !== b.isOffWork) return a.isOffWork ? 1 : -1;
    if (a.isBusy && !b.isBusy) return -1;
    if (!a.isBusy && b.isBusy) return 1;
    if (a.isBusy && b.isBusy) return b.activeCases.length - a.activeCases.length;
    return b.closedCount - a.closedCount;
  });

  // Sort employees for leaderboard
  const sortedLeaderboard = [...workloads].sort((a, b) => b.closedCount - a.closedCount);

  // Live active cases across the system
  const allActiveCases = cases.filter(c => c.status === 'credit_check' || c.status === 'processing');
  const allPendingCases = cases.filter(c => c.status === 'pending');

  // Filtered active cases for the 'active_cases' view tab
  const displayedActiveCases = cases.filter((c) => {
    // Status filter
    if (activeCaseStatusFilter === 'credit_check' && c.status !== 'credit_check') return false;
    if (activeCaseStatusFilter === 'processing' && c.status !== 'processing') return false;
    if (activeCaseStatusFilter === 'pending' && c.status !== 'pending') return false;
    if (activeCaseStatusFilter === 'all' && c.status !== 'credit_check' && c.status !== 'processing' && c.status !== 'pending') return false;

    // Search query
    if (activeCaseSearch.trim()) {
      const q = activeCaseSearch.toLowerCase();
      const matchModel = c.iphoneModel?.toLowerCase().includes(q);
      const matchAgent = c.agentName?.toLowerCase().includes(q);
      const matchProvince = c.province?.toLowerCase().includes(q);
      const matchAssignee = c.assigneeName?.toLowerCase().includes(q);
      const matchContract = c.contractNumber?.toLowerCase().includes(q);
      const matchRemarks = c.remarks?.toLowerCase().includes(q);
      return matchModel || matchAgent || matchProvince || matchAssignee || matchContract || matchRemarks;
    }
    return true;
  });

  return (
    <div className="space-y-5 sm:space-y-7 max-w-7xl mx-auto">
      {/* Top Header - Accessible to Everyone */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Logo size="sm" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center">
              แดชบอร์ดและภาพรวมทีมงาน
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1">
            ทุกคนสามารถเข้าดูได้ | สรุปจำนวนพนักงาน ใครรับงานอะไรอยู่ ใครว่างงาน พร้อมสถิติผลงานแบบเรียลไทม์
          </p>
        </div>

        {/* Time Filter Tabs */}
        <div className="flex bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTimeFilter('today')}
            className={clsx(
              "px-3 py-1.5 rounded-lg transition cursor-pointer",
              timeFilter === 'today' 
                ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold" 
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            เฉพาะวันนี้ ({format(new Date(), 'dd MMM', { locale: th })})
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('all')}
            className={clsx(
              "px-3 py-1.5 rounded-lg transition cursor-pointer",
              timeFilter === 'all' 
                ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold" 
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            ทั้งหมด ({cases.length} เคส)
          </button>
        </div>
      </div>

      {/* Credit Check Duty Station (2-person duty roster visible to everyone) */}
      <CreditCheckDutyStation />

      {/* OVERVIEW STAT CARDS (TEAM & CASES) - High density & responsive on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
        {/* Total Employees */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/80 dark:border-slate-800 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400">พนักงานทั้งหมด</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Users className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
              {allEmployees.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">ในระบบ (ไม่รวมแอดมิน)</p>
          </div>
        </div>

        {/* Idle Employees (Free) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-emerald-200/80 dark:border-emerald-900/60 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-emerald-600 dark:text-emerald-400">พนักงานว่างงาน</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {idleEmployees.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5 font-medium line-clamp-1">
              พร้อมกดรับเคสใหม่
            </p>
          </div>
        </div>

        {/* Busy Employees (Handling tasks) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-amber-200/80 dark:border-amber-900/60 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-amber-600 dark:text-amber-400">กำลังรับงานอยู่</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-amber-600 dark:text-amber-400">
              {busyEmployees.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5 font-medium line-clamp-1">
              มีเคสกำลังทำอยู่
            </p>
          </div>
        </div>

        {/* Total Cases (Excluding closed cases) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/80 dark:border-slate-800 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400">เคสในคิว</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Calendar className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 dark:text-white">
              {totalOpenCases.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">รอทำ (ไม่รวมจบแล้ว)</p>
          </div>
        </div>

        {/* Cases with Contract */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-blue-200/80 dark:border-blue-900/60 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-blue-600 dark:text-blue-400">มีเลขสัญญา</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <FileSignature className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-600 dark:text-blue-400">
              {contractedCases.length} <span className="text-[10px] sm:text-xs font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-0.5 line-clamp-1">
              ระบุสัญญาเรียบร้อย
            </p>
          </div>
        </div>

        {/* Completed Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/80 dark:border-slate-800 p-2 sm:p-3 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400">จบเคสแล้ว</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
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
            <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">เคสที่ถูกยกเลิก</p>
          </div>
        </div>
      </div>

      {/* SECTION: REAL-TIME EMPLOYEE WORKLOAD & AVAILABILITY STATUS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 transition-colors">
        {/* Section Header with View Mode Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                สถานะงานและทีมงานเรียลไทม์
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              ตรวจสอบว่าพนักงานคนไหนกำลังทำเคสอะไรอยู่ หรือสลับดูเคสที่กำลังทำทั้งหมดในจอเดียว
            </p>
          </div>

          {/* Primary View Switcher: Simple Summary vs Team Workload vs All Active Cases */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold max-w-full overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setDashboardViewTab('simple')}
              className={clsx(
                "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                dashboardViewTab === 'simple'
                  ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>สรุปแบบง่าย (ใครรับกี่เคส)</span>
            </button>
            <button
              type="button"
              onClick={() => setDashboardViewTab('workload')}
              className={clsx(
                "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                dashboardViewTab === 'workload'
                  ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>ดูการ์ดละเอียด ({allEmployees.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDashboardViewTab('active_cases')}
              className={clsx(
                "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                dashboardViewTab === 'active_cases'
                  ? "bg-indigo-600 text-white shadow-xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Activity className="w-3.5 h-3.5 text-amber-300" />
              <span>ดูเคสกำลังทำทั้งหมด ({allActiveCases.length})</span>
            </button>
          </div>
        </div>

        {dashboardViewTab === 'simple' ? (
          /* SIMPLE SUMMARY VIEW: ใครกำลังรับงานอยู่กี่เคส แสดงแบบง่ายๆ */
          <div className="pt-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-3">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold max-w-full overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setWorkloadFilter('all')}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap",
                    workloadFilter === 'all'
                      ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  พนักงานทั้งหมด ({allEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkloadFilter('busy')}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center whitespace-nowrap",
                    workloadFilter === 'busy'
                      ? "bg-amber-500 text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  กำลังรับงาน ({busyEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkloadFilter('idle')}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center whitespace-nowrap",
                    workloadFilter === 'idle'
                      ? "bg-emerald-600 text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  ว่างงาน ({idleEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkloadFilter('off_work')}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center whitespace-nowrap",
                    workloadFilter === 'off_work'
                      ? "bg-slate-600 text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <Moon className="w-3 h-3 mr-1" />
                  เลิกงาน ({offWorkEmployees.length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-60">
                <input
                  type="text"
                  placeholder="ค้นหาชื่อพนักงาน หรือรุ่น..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition placeholder:text-slate-400"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              </div>
            </div>

            {/* Simple Table / Row Cards */}
            {displayedWorkloads.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
                ไม่พบพนักงานตามเงื่อนไขที่ค้นหา
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {displayedWorkloads.map(({ employee, activeCases, closedCount, isBusy, isOffWork, isOnCreditCheckDuty }) => (
                  <div
                    key={employee.uid}
                    className={clsx(
                      "p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                      isOffWork
                        ? "bg-slate-50/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/80 opacity-85"
                        : isOnCreditCheckDuty
                        ? "bg-indigo-50/30 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60"
                        : isBusy
                        ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
                        : "bg-emerald-50/20 dark:bg-emerald-950/10 border-slate-200/80 dark:border-slate-800"
                    )}
                  >
                    {/* Left: Employee Info */}
                    <div className="flex items-center space-x-3 min-w-[200px]">
                      <div className="relative shrink-0">
                        <AnimalAvatar identifier={employee.username || employee.uid} name={employee.name} size="md" />
                        {isOffWork ? (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-400 ring-2 ring-white dark:ring-slate-900" />
                        ) : isBusy ? (
                          <span className={clsx(
                            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900",
                            isOnCreditCheckDuty && activeCases.length === 0 ? "bg-indigo-600" : "bg-amber-500 animate-ping"
                          )} />
                        ) : (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            {employee.name}
                          </h4>
                          <span className="text-[11px] text-slate-400 font-mono">
                            @{employee.username}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isOffWork ? (
                            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.2 rounded flex items-center">
                              <Moon className="w-3 h-3 mr-0.5 text-slate-400" />
                              เลิกงานแล้ว
                            </span>
                          ) : isOnCreditCheckDuty ? (
                            <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/80 px-1.5 py-0.2 rounded flex items-center">
                              <ShieldCheck className="w-3 h-3 mr-0.5" />
                              เวรเช็คเครดิต
                            </span>
                          ) : null}
                          <span className="text-[10px] text-slate-400">
                            ปิดเคสสะสม: <strong className="text-emerald-600 dark:text-emerald-400">{closedCount}</strong> เคส
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Current Active Cases List (Simple Pills) */}
                    <div className="flex-1 min-w-0">
                      {isOffWork ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium flex items-center">
                          <Moon className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
                          เลิกงานแล้ว (เคสทั้งหมดถูกส่งคืนสู่สถานะ "รอรับเคส")
                        </span>
                      ) : activeCases.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activeCases.map((c) => (
                            <div
                              key={c.id}
                              className="inline-flex items-center px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/50 text-[11px] text-slate-800 dark:text-slate-200 shadow-2xs"
                            >
                              <Smartphone className="w-3 h-3 text-amber-500 mr-1 shrink-0" />
                              <span className="font-semibold mr-1">{c.iphoneModel}</span>
                              <span className="text-slate-400 text-[10px]">({c.province})</span>
                              {c.contractNumber && (
                                <span className="ml-1 text-[9px] font-mono text-blue-600 dark:text-blue-400 font-bold">
                                  #{c.contractNumber}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : isOnCreditCheckDuty ? (
                        <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center">
                          <Sparkles className="w-3 h-3 mr-1 text-indigo-500" />
                          สแตนด์บายตรวจเครดิต & เปิดเคสใหม่เข้าระบบ
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          พร้อมรับเคสใหม่ (ไม่มีเคสค้าง)
                        </span>
                      )}
                    </div>

                    {/* Right: Workload Count Badge & Actions */}
                    <div className="shrink-0 sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                      {isOffWork ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center">
                            <Moon className="w-3.5 h-3.5 mr-1 text-slate-400" />
                            เลิกงานแล้ว
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              await clockInEmployee(employee.uid);
                            }}
                            className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                          >
                            เข้างาน
                          </button>
                        </div>
                      ) : activeCases.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-500 text-white shadow-xs flex items-center">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            กำลังทำ {activeCases.length} เคส
                          </span>
                          <button
                            type="button"
                            onClick={() => setClockOutTarget(employee)}
                            title="สั่งเลิกงานและคืนเคส"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : isOnCreditCheckDuty ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center">
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                            0 เคส (ติดเวร)
                          </span>
                          <button
                            type="button"
                            onClick={() => setClockOutTarget(employee)}
                            title="สั่งเลิกงาน"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center">
                            <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            ว่างงาน (0 เคส)
                          </span>
                          <button
                            type="button"
                            onClick={() => setClockOutTarget(employee)}
                            title="สั่งเลิกงาน"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : dashboardViewTab === 'active_cases' ? (
          /* ACTIVE CASES DIRECT VIEW (DENSE & MULTI-CASE ON MOBILE) */
          <div>
            {/* Filter bar for active cases */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-4 pb-3">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold max-w-full overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveCaseStatusFilter('all')}
                  className={clsx(
                    "px-2.5 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap",
                    activeCaseStatusFilter === 'all'
                      ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  ทั้งหมด ({allActiveCases.length + allPendingCases.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCaseStatusFilter('processing')}
                  className={clsx(
                    "px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center whitespace-nowrap",
                    activeCaseStatusFilter === 'processing'
                      ? "bg-amber-500 text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-200 animate-pulse mr-1"></span>
                  กำลังทำเคส ({cases.filter(c => c.status === 'processing' || c.status === 'credit_check').length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCaseStatusFilter('pending')}
                  className={clsx(
                    "px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center whitespace-nowrap",
                    activeCaseStatusFilter === 'pending'
                      ? "bg-indigo-600 text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse mr-1"></span>
                  รอรับเคส ({allPendingCases.length})
                </button>
              </div>

              {/* Search active cases */}
              <div className="relative w-full sm:w-60">
                <input
                  type="text"
                  placeholder="ค้นหาชื่อพนักงาน, รุ่น, จังหวัด..."
                  value={activeCaseSearch}
                  onChange={(e) => setActiveCaseSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition placeholder:text-slate-400"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              </div>
            </div>

            {/* Cases Grid (2 columns on mobile for fast multi-case scanning!) */}
            {displayedActiveCases.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
                ไม่พบเคสตามเงื่อนไขที่เลือก
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 pt-2">
                {displayedActiveCases.map((c) => {
                  const statusObj = statusMap[c.status] || statusMap.pending;
                  return (
                    <div
                      key={c.id}
                      className={clsx(
                        "bg-white dark:bg-slate-800/90 rounded-xl border p-2.5 sm:p-3 shadow-2xs flex flex-col justify-between transition hover:shadow-xs",
                        c.remarks ? "border-amber-300 dark:border-amber-700/60 ring-1 ring-amber-300/40" : "border-slate-200 dark:border-slate-700"
                      )}
                    >
                      <div>
                        {/* Top: Status & Time */}
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className={clsx(
                            "px-1.5 py-0.5 rounded-md text-[10px] font-bold border flex items-center leading-none shrink-0",
                            statusObj.badgeClass
                          )}>
                            {statusObj.label}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {format(c.createdAt, 'HH:mm', { locale: th })}
                          </span>
                        </div>

                        {/* Model */}
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate leading-tight mt-1" title={c.iphoneModel}>
                          {c.iphoneModel}
                        </h4>

                        {/* Assignee / Employee handling */}
                        <div className="mt-1.5 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                          {c.assigneeName ? (
                            <AnimalAvatar 
                              identifier={c.assigneeId || c.assigneeName} 
                              name={c.assigneeName} 
                              size="xs" 
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white bg-slate-400 shrink-0">
                              ?
                            </div>
                          )}
                          <div className="truncate">
                            <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 block truncate leading-tight">
                              {c.assigneeName || 'ยังไม่มีคนรับ'}
                            </span>
                            <span className="text-[9px] text-slate-400 block truncate">
                              {c.assigneeName ? 'ผู้รับผิดชอบ' : 'รอรับเคส'}
                            </span>
                          </div>
                        </div>

                        {/* Agent & Province */}
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 truncate">
                          ตัวแทน: <span className="font-medium text-slate-700 dark:text-slate-300">{c.agentName}</span> ({c.province})
                        </div>

                        {/* Contract */}
                        {c.contractNumber && (
                          <div className="mt-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 truncate">
                            #{c.contractNumber}
                          </div>
                        )}

                        {/* Remarks */}
                        {c.remarks && (
                          <div className="mt-1 p-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[10px] text-amber-900 dark:text-amber-200">
                            <span className="font-bold flex items-center text-amber-700 dark:text-amber-400">
                              <StickyNote className="w-2.5 h-2.5 mr-0.5 shrink-0" />
                              งานค้าง:
                            </span>
                            <p className="line-clamp-2 mt-0.5">{c.remarks}</p>
                          </div>
                        )}
                      </div>

                      {/* Admin Quick Actions: Transfer & Return to Queue */}
                      {(c.status === 'credit_check' || c.status === 'processing' || c.assigneeId) && (
                        <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setActiveReassignCase(c)}
                            className="py-1 px-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-[10px] font-semibold flex items-center justify-center cursor-pointer transition whitespace-nowrap"
                            title="โยกเคสไปให้พนักงานคนอื่นดูแลต่อ"
                          >
                            <ArrowRightLeft className="w-2.5 h-2.5 mr-1 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <span>โยกเคส</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveReturnCase(c)}
                            className="py-1 px-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-[10px] font-semibold flex items-center justify-center cursor-pointer transition whitespace-nowrap"
                            title="คืนสถานะไปรอรับเคส หากรับมาแล้วแต่ไม่ได้ทำต่อ"
                          >
                            <RotateCcw className="w-2.5 h-2.5 mr-1 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>คืนเคส</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* WORKLOAD VIEW (BY EMPLOYEE) */
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 pb-1">
              {/* Filter Tabs */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold max-w-full overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setWorkloadFilter('all')}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap",
                    workloadFilter === 'all'
                      ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  พนักงานทั้งหมด ({allEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkloadFilter('busy')}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center whitespace-nowrap",
                    workloadFilter === 'busy'
                      ? "bg-amber-500 text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  กำลังรับงาน ({busyEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkloadFilter('idle')}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center whitespace-nowrap",
                    workloadFilter === 'idle'
                      ? "bg-emerald-600 text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  ว่างงาน ({idleEmployees.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkloadFilter('off_work')}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center whitespace-nowrap",
                    workloadFilter === 'off_work'
                      ? "bg-slate-600 text-white shadow-xs font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <Moon className="w-3 h-3 mr-1" />
                  เลิกงาน ({offWorkEmployees.length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  placeholder="ค้นหาชื่อพนักงาน หรือรุ่น iPhone..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition placeholder:text-slate-400"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              </div>
            </div>

            {/* Employee Cards Grid */}
            {displayedWorkloads.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
                ไม่พบพนักงานตามเงื่อนไขที่ค้นหา
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 pt-4">
                {displayedWorkloads.map(({ employee, activeCases, closedCount, cancelledCount, isBusy, isOffWork, isOnCreditCheckDuty }) => (
                  <div 
                    key={employee.uid}
                    className={clsx(
                      "rounded-xl sm:rounded-2xl border p-3.5 sm:p-5 flex flex-col justify-between transition-all hover:shadow-md",
                      isOffWork
                        ? "bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 opacity-85"
                        : isOnCreditCheckDuty
                        ? "bg-indigo-50/20 dark:bg-indigo-950/10 border-indigo-200 dark:border-indigo-900/60"
                        : isBusy 
                        ? "bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60" 
                        : "bg-emerald-50/20 dark:bg-emerald-950/10 border-slate-200 dark:border-slate-800"
                    )}
                  >
                    <div>
                      {/* Employee Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2.5 sm:space-x-3">
                          {/* Animal Cartoon Avatar with Status Pulse Dot */}
                          <div className="relative">
                            <AnimalAvatar 
                              identifier={employee.username || employee.uid} 
                              name={employee.name} 
                              size="lg" 
                            />
                            {isOffWork ? (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-slate-400 ring-2 ring-white dark:ring-slate-900"></span>
                            ) : isBusy ? (
                              <span className={clsx(
                                "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 flex items-center justify-center",
                                isOnCreditCheckDuty ? "bg-indigo-600" : "bg-amber-500"
                              )}>
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                              </span>
                            ) : (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"></span>
                            )}
                          </div>

                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                              {employee.name}
                            </h3>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                              @{employee.username}
                            </p>
                          </div>
                        </div>

                        {/* Status Pill & Action */}
                        <div className="flex items-center gap-1.5">
                          {isOffWork ? (
                            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center">
                              <Moon className="w-3 h-3 mr-1 text-slate-400" />
                              เลิกงานแล้ว
                            </span>
                          ) : isBusy ? (
                            isOnCreditCheckDuty && activeCases.length === 0 ? (
                              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 flex items-center">
                                <ShieldCheck className="w-3 h-3 mr-1 text-indigo-600" />
                                เวรเช็คเครดิต
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center">
                                <Clock className="w-3 h-3 mr-1 text-amber-600 animate-spin" />
                                รับงาน ({activeCases.length})
                              </span>
                            )
                          ) : (
                            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center">
                              <UserCheck className="w-3 h-3 mr-1 text-emerald-600" />
                              ว่างงาน
                            </span>
                          )}

                          {/* Quick Clock out / in button for Admin */}
                          {isOffWork ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await clockInEmployee(employee.uid);
                              }}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition cursor-pointer shadow-2xs"
                              title="เปลี่ยนเป็นเข้างาน"
                            >
                              เข้างาน
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setClockOutTarget(employee)}
                              className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition cursor-pointer"
                              title="บันทึกเลิกงาน & คืนเคส"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Credit Check Duty Station Badge */}
                      {isOnCreditCheckDuty && !isOffWork && (
                        <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-indigo-50/90 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
                          <span className="flex items-center font-bold">
                            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            ประจำเวรเช็คเครดิต (ไม่นับว่าว่างงาน)
                          </span>
                          <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-semibold bg-indigo-100 dark:bg-indigo-900 px-1.5 py-0.2 rounded-full">
                            สร้างเคสได้
                          </span>
                        </div>
                      )}

                      {/* Active Tasks List for Busy Employees or Off-work banner */}
                      {isOffWork ? (
                        <div className="bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-3 text-center my-3">
                          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium flex items-center justify-center">
                            <Moon className="w-3.5 h-3.5 mr-1 text-slate-400" />
                            ขณะนี้อยู่ในสถานะเลิกงาน
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            เคสที่เคยถือครองถูกส่งคืนกลับไประบบ "รอรับเคส" เรียบร้อยแล้ว
                          </p>
                        </div>
                      ) : activeCases.length > 0 ? (
                        <div className="space-y-1.5 sm:space-y-2 mb-3">
                          <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider block">
                            งานที่กำลังรับผิดชอบในขณะนี้:
                          </span>
                          {activeCases.map((c) => {
                            const statusObj = statusMap[c.status];
                            return (
                              <div 
                                key={c.id} 
                                className="bg-white dark:bg-slate-800 p-2 sm:p-2.5 rounded-xl border border-amber-100 dark:border-slate-700 shadow-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center truncate">
                                    <Smartphone className="w-3 h-3 mr-1 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                    <span className="truncate">{c.iphoneModel}</span>
                                  </span>
                                  <span className={clsx(
                                    "px-1.5 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ml-1 leading-none",
                                    statusObj.badgeClass
                                  )}>
                                    {statusObj.label}
                                  </span>
                                </div>
                                <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                                  <span className="flex items-center truncate mr-1">
                                    <MapPin className="w-2.5 h-2.5 mr-0.5 text-slate-400 shrink-0" />
                                    <span className="truncate">ตัวแทน: {c.agentName} ({c.province})</span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                    {format(c.updatedAt || c.createdAt, 'HH:mm', { locale: th })}
                                  </span>
                                </div>
                                {c.contractNumber && (
                                  <div className="mt-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[10px] text-blue-900 dark:text-blue-200 flex items-center justify-between">
                                    <span className="flex items-center font-medium">
                                      <FileSignature className="w-2.5 h-2.5 mr-1 text-blue-600 dark:text-blue-400 shrink-0" />
                                      สัญญา:
                                    </span>
                                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                                      {c.contractNumber}
                                    </span>
                                  </div>
                                )}
                                {c.remarks && (
                                  <div className="mt-1 p-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[10px] text-amber-900 dark:text-amber-200 flex items-start">
                                    <StickyNote className="w-2.5 h-2.5 mr-1 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <span className="line-clamp-2">
                                      <strong>หมายเหตุ:</strong> {c.remarks}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : isOnCreditCheckDuty ? (
                        <div className="bg-indigo-50/50 dark:bg-indigo-950/30 border border-dashed border-indigo-200 dark:border-indigo-900/50 rounded-xl p-2.5 sm:p-3 text-center my-3">
                          <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium flex items-center justify-center">
                            <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-500 shrink-0" />
                            สแตนด์บายตรวจเครดิต & เปิดเคสใหม่
                          </p>
                          <p className="text-[10px] text-indigo-600/80 dark:text-indigo-400 mt-0.5">
                            (ไม่ขึ้นสถานะว่างงาน เนื่องจากติดภารกิจเวร)
                          </p>
                        </div>
                      ) : (
                        <div className="bg-emerald-50/50 dark:bg-emerald-950/30 border border-dashed border-emerald-200 dark:border-emerald-900/50 rounded-xl p-2.5 sm:p-3 text-center my-3">
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                            ✨ ขณะนี้ไม่มีเคสค้างในมือ
                          </p>
                          <p className="text-[10px] text-emerald-600/80 dark:text-emerald-500 mt-0.5">
                            พร้อมกดรับเคสใหม่จากกระดานคิวได้ทันที
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer: Lifetime Accomplishments */}
                    <div className="pt-2 sm:pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                      <span>ปิดเคสสำเร็จ: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{closedCount}</strong></span>
                      {cancelledCount > 0 && (
                        <span className="text-rose-500 dark:text-rose-400">ยกเลิก: {cancelledCount}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
              sortedLeaderboard.map(({ employee, activeCases, closedCount, cancelledCount, isBusy, isOnCreditCheckDuty }, idx) => (
                <div key={employee.uid} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
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
              ))
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
              closedCases.slice(0, 10).map((c) => (
                <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">{c.iphoneModel}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {c.completedAt ? format(c.completedAt, 'HH:mm น.', { locale: th }) : ''}
                    </span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] flex justify-between">
                    <span>ตัวแทน: {c.agentName} ({c.province})</span>
                    {c.contractNumber && (
                      <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold flex items-center">
                        <FileSignature className="w-3 h-3 mr-0.5" />
                        #{c.contractNumber}
                      </span>
                    )}
                  </div>
                  <div className="pt-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center">
                    <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                    ผู้จบเคส: {c.assigneeName || 'ไม่ระบุ'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
