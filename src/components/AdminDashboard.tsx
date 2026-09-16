import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case, statusMap } from './Queue';
import { Logo } from './Logo';
import { 
  BarChart3, 
  Users, 
  CheckCircle, 
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
  FileSignature
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

interface EmployeeProfile {
  uid: string;
  name: string;
  username: string;
  role?: string;
  createdAt?: number;
}

export function AdminDashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'all'>('today');
  
  // Workload tab filter: 'all' | 'busy' | 'idle'
  const [workloadFilter, setWorkloadFilter] = useState<'all' | 'busy' | 'idle'>('all');
  const [employeeSearch, setEmployeeSearch] = useState('');

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
        });
      });
      setEmployees(usersData);
    }, (error) => {
      console.warn('Could not read users collection, using fallback from cases:', error);
    });

    return () => {
      unsubCases();
      unsubUsers();
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

  // Unique list of all employees
  const allEmployees: EmployeeProfile[] = Array.from(
    new Map(Object.values(employeeMap).map(e => [e.uid, e])).values()
  );

  // Compute workload for each employee based on current live cases
  interface EmployeeWorkload {
    employee: EmployeeProfile;
    activeCases: Case[];
    closedCount: number;
    cancelledCount: number;
    isBusy: boolean;
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

    return {
      employee: emp,
      activeCases: empActiveCases,
      closedCount: empClosedCount,
      cancelledCount: empCancelledCount,
      isBusy: empActiveCases.length > 0,
    };
  });

  // Employees currently busy vs idle
  const busyEmployees = workloads.filter(w => w.isBusy);
  const idleEmployees = workloads.filter(w => !w.isBusy);

  // Filter workloads for display
  const displayedWorkloads = workloads.filter((w) => {
    if (workloadFilter === 'busy' && !w.isBusy) return false;
    if (workloadFilter === 'idle' && w.isBusy) return false;

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

  // Sort workloads: busy employees first (by number of active cases desc), then by closedCount desc
  displayedWorkloads.sort((a, b) => {
    if (a.isBusy && !b.isBusy) return -1;
    if (!a.isBusy && b.isBusy) return 1;
    if (a.isBusy && b.isBusy) return b.activeCases.length - a.activeCases.length;
    return b.closedCount - a.closedCount;
  });

  // Sort employees for leaderboard
  const sortedLeaderboard = [...workloads].sort((a, b) => b.closedCount - a.closedCount);

  return (
    <div className="space-y-7 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Logo size="sm" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center">
              แดชบอร์ดและภาพรวมทีมงาน
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            สรุปจำนวนพนักงาน ใครรับงานอะไรอยู่ ใครว่างงาน พร้อมสถิติผลงานแบบเรียลไทม์
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
                ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs" 
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
                ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs" 
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            ทั้งหมด ({cases.length} เคส)
          </button>
        </div>
      </div>

      {/* OVERVIEW STAT CARDS (TEAM & CASES) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
        {/* Total Employees */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">พนักงานทั้งหมด</span>
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {allEmployees.length} <span className="text-sm font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">ในระบบไทย พลัส+</p>
          </div>
        </div>

        {/* Idle Employees (Free) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-emerald-200/80 dark:border-emerald-900/60 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">พนักงานว่างงาน</span>
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {idleEmployees.length} <span className="text-sm font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5 font-medium">
              พร้อมกดรับเคสใหม่
            </p>
          </div>
        </div>

        {/* Busy Employees (Handling tasks) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-amber-200/80 dark:border-amber-900/60 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">กำลังรับงานอยู่</span>
            <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">
              {busyEmployees.length} <span className="text-sm font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-0.5 font-medium">
              มีเคสกำลังทำอยู่
            </p>
          </div>
        </div>

        {/* Total Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">เคสทั้งหมด</span>
            <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {filteredCases.length} <span className="text-sm font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">ในรอบเวลาที่เลือก</p>
          </div>
        </div>

        {/* Cases with Contract */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-blue-200/80 dark:border-blue-900/60 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">มีเลขสัญญา</span>
            <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <FileSignature className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
              {contractedCases.length} <span className="text-sm font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 mt-0.5">
              ระบุสัญญาเรียบร้อย
            </p>
          </div>
        </div>

        {/* Completed Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">จบเคสแล้ว</span>
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {closedCases.length} <span className="text-sm font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {filteredCases.length > 0 ? Math.round((closedCases.length / filteredCases.length) * 100) : 0}% สำเร็จ
            </p>
          </div>
        </div>

        {/* Cancelled Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ยกเลิกเคส</span>
            <span className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Ban className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">
              {cancelledCases.length} <span className="text-sm font-normal text-slate-400">เคส</span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">เคสที่ถูกยกเลิก</p>
          </div>
        </div>
      </div>

      {/* SECTION: REAL-TIME EMPLOYEE WORKLOAD & AVAILABILITY STATUS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
              สถานะการทำงานของพนักงาน (ใครรับงานอะไรอยู่ / ใครว่างงาน)
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              ตรวจสอบว่าพนักงานคนไหนกำลังทำเคสรุ่นอะไรอยู่ และคนไหนว่างงานพร้อมรับเคสใหม่
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setWorkloadFilter('all')}
                className={clsx(
                  "px-3 py-1.5 rounded-lg transition cursor-pointer",
                  workloadFilter === 'all'
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                พนักงานทั้งหมด ({allEmployees.length})
              </button>
              <button
                type="button"
                onClick={() => setWorkloadFilter('busy')}
                className={clsx(
                  "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center",
                  workloadFilter === 'busy'
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                กำลังรับงาน ({busyEmployees.length})
              </button>
              <button
                type="button"
                onClick={() => setWorkloadFilter('idle')}
                className={clsx(
                  "px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center",
                  workloadFilter === 'idle'
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                ว่างงาน ({idleEmployees.length})
              </button>
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-56">
              <input
                type="text"
                placeholder="ค้นหาชื่อพนักงาน หรือรุ่น iPhone..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            </div>
          </div>
        </div>

        {/* Employee Cards Grid */}
        {displayedWorkloads.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
            ไม่พบพนักงานตามเงื่อนไขที่ค้นหา
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-5">
            {displayedWorkloads.map(({ employee, activeCases, closedCount, cancelledCount, isBusy }) => (
              <div 
                key={employee.uid}
                className={clsx(
                  "rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all hover:shadow-md",
                  isBusy 
                    ? "bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60" 
                    : "bg-emerald-50/20 dark:bg-emerald-950/10 border-slate-200 dark:border-slate-800"
                )}
              >
                <div>
                  {/* Employee Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      {/* Avatar with Status Pulse Dot */}
                      <div className="relative">
                        <div className={clsx(
                          "w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shadow-xs",
                          isBusy 
                            ? "bg-amber-500 text-white shadow-amber-200 dark:shadow-none" 
                            : "bg-emerald-600 text-white shadow-emerald-200 dark:shadow-none"
                        )}>
                          {employee.name.charAt(0)}
                        </div>
                        {isBusy ? (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                          </span>
                        ) : (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"></span>
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

                    {/* Status Pill */}
                    {isBusy ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center">
                        <Clock className="w-3 h-3 mr-1 text-amber-600 animate-spin" />
                        รับงานอยู่ ({activeCases.length})
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center">
                        <UserCheck className="w-3 h-3 mr-1 text-emerald-600" />
                        ว่างงาน (พร้อมรับ)
                      </span>
                    )}
                  </div>

                  {/* Active Tasks List for Busy Employees */}
                  {isBusy ? (
                    <div className="space-y-2 mb-3">
                      <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider block">
                        งานที่กำลังรับผิดชอบในขณะนี้:
                      </span>
                      {activeCases.map((c) => {
                        const statusObj = statusMap[c.status];
                        return (
                          <div 
                            key={c.id} 
                            className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-amber-100 dark:border-slate-700 shadow-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center">
                                <Smartphone className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
                                {c.iphoneModel}
                              </span>
                              <span className={clsx(
                                "px-2 py-0.5 rounded-md text-[10px] font-semibold border",
                                statusObj.badgeClass
                              )}>
                                {statusObj.label}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                              <span className="flex items-center">
                                <MapPin className="w-3 h-3 mr-0.5 text-slate-400" />
                                ตัวแทน: {c.agentName} ({c.province})
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {format(c.updatedAt || c.createdAt, 'HH:mm น.', { locale: th })}
                              </span>
                            </div>
                            {c.contractNumber && (
                              <div className="mt-1.5 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-900 dark:text-blue-200 flex items-center justify-between">
                                <span className="flex items-center font-medium">
                                  <FileSignature className="w-3 h-3 mr-1 text-blue-600 dark:text-blue-400 shrink-0" />
                                  เลขสัญญา:
                                </span>
                                <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                                  {c.contractNumber}
                                </span>
                              </div>
                            )}
                            {c.remarks && (
                              <div className="mt-2 p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-900 dark:text-amber-200 flex items-start">
                                <StickyNote className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2">
                                  <strong>หมายเหตุ:</strong> {c.remarks}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-emerald-50/50 dark:bg-emerald-950/30 border border-dashed border-emerald-200 dark:border-emerald-900/50 rounded-xl p-3 text-center my-3">
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
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
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
              sortedLeaderboard.map(({ employee, activeCases, closedCount, cancelledCount, isBusy }, idx) => (
                <div key={employee.uid} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <div className="flex items-center min-w-0">
                    <div className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mr-3 shrink-0",
                      idx === 0 ? "bg-amber-100 text-amber-800 ring-2 ring-amber-300 dark:bg-amber-950 dark:text-amber-200" :
                      idx === 1 ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" :
                      idx === 2 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        {employee.name}
                        {isBusy ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-normal">
                            กำลังทำ {activeCases.length} งาน
                          </span>
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
    </div>
  );
}
