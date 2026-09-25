import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  addDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore, isUserAdmin } from '../store/useStore';
import { OvertimeRequest, OvertimeStatus } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  Clock, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Download, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Check, 
  X, 
  Trash2, 
  Users, 
  CalendarCheck,
  TrendingUp,
  Building2,
  AlertCircle,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { 
  getOTCycleFromDate, 
  getAvailableOTCycles, 
  exportOTToExcelCsv, 
  OTCycleInfo 
} from '../lib/otUtils';

const STATUS_CONFIG: Record<
  OvertimeStatus, 
  { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: 'รออนุมัติ',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    icon: Clock,
  },
  approved: {
    label: 'อนุมัติแล้ว',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'ไม่อนุมัติ',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    icon: XCircle,
  },
};

export function AdminOTDashboard() {
  const { user } = useStore();
  const isAdmin = isUserAdmin(user);

  const availableCycles = useMemo(() => getAvailableOTCycles(), []);
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>(() => {
    const nowStr = format(new Date(), 'yyyy-MM-dd');
    return getOTCycleFromDate(nowStr).cycleKey;
  });

  const selectedCycleInfo = useMemo(() => {
    return availableCycles.find(c => c.cycleKey === selectedCycleKey) || availableCycles[1] || availableCycles[0];
  }, [availableCycles, selectedCycleKey]);

  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | OvertimeStatus>('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Admin Review State
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Real-time listener for all OT requests
  useEffect(() => {
    const q = query(collection(db, 'overtime_requests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: OvertimeRequest[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...(doc.data() as Omit<OvertimeRequest, 'id'>) });
        });
        setRequests(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'overtime_requests');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter requests by cycle period (26th prev month to 25th current month)
  const cycleRequests = useMemo(() => {
    return requests.filter((r) => {
      const reqCycle = r.cyclePeriod || getOTCycleFromDate(r.date).cycleKey;
      return reqCycle === selectedCycleKey;
    });
  }, [requests, selectedCycleKey]);

  // Aggregate stats per employee for the selected cycle
  const employeeOTSummary = useMemo(() => {
    const map = new Map<string, {
      employeeId: string;
      name: string;
      username?: string;
      avatarEmoji?: string;
      approvedHours: number;
      pendingHours: number;
      rejectedHours: number;
      totalRequests: number;
      approvedCount: number;
      pendingCount: number;
      rejectedCount: number;
      requests: OvertimeRequest[];
    }>();

    cycleRequests.forEach((req) => {
      const key = req.employeeId || req.employeeUsername || req.employeeName;
      if (!map.has(key)) {
        map.set(key, {
          employeeId: req.employeeId,
          name: req.employeeName,
          username: req.employeeUsername,
          avatarEmoji: req.employeeAvatarEmoji,
          approvedHours: 0,
          pendingHours: 0,
          rejectedHours: 0,
          totalRequests: 0,
          approvedCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
          requests: [],
        });
      }

      const item = map.get(key)!;
      item.totalRequests += 1;
      item.requests.push(req);

      const h = Number(req.hours) || 0;
      if (req.status === 'approved') {
        item.approvedHours += h;
        item.approvedCount += 1;
      } else if (req.status === 'pending') {
        item.pendingHours += h;
        item.pendingCount += 1;
      } else if (req.status === 'rejected') {
        item.rejectedHours += h;
        item.rejectedCount += 1;
      }
    });

    // Sort by approved hours descending
    return Array.from(map.values()).sort((a, b) => b.approvedHours - a.approvedHours);
  }, [cycleRequests]);

  // Total summary overview
  const totalApprovedHours = useMemo(() => {
    const sum = cycleRequests
      .filter((r) => r.status === 'approved')
      .reduce((acc, r) => acc + (Number(r.hours) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [cycleRequests]);

  const totalPendingHours = useMemo(() => {
    const sum = cycleRequests
      .filter((r) => r.status === 'pending')
      .reduce((acc, r) => acc + (Number(r.hours) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [cycleRequests]);

  const totalPendingRequests = useMemo(() => {
    return cycleRequests.filter((r) => r.status === 'pending').length;
  }, [cycleRequests]);

  // Filtered list for detailed table
  const filteredRequests = useMemo(() => {
    return cycleRequests.filter((r) => {
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchEmployee = selectedEmployeeFilter === 'all' || 
        r.employeeId === selectedEmployeeFilter ||
        r.employeeUsername === selectedEmployeeFilter ||
        r.employeeName === selectedEmployeeFilter;
      
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = q === '' ||
        (r.employeeName && r.employeeName.toLowerCase().includes(q)) ||
        (r.employeeUsername && r.employeeUsername.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        (r.date && r.date.includes(q));

      return matchStatus && matchEmployee && matchSearch;
    });
  }, [cycleRequests, statusFilter, selectedEmployeeFilter, searchQuery]);

  // Admin Approve / Reject action
  const handleReviewAction = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!isAdmin || !user) return;
    setIsReviewing(true);

    try {
      const reqRef = doc(db, 'overtime_requests', requestId);
      await updateDoc(reqRef, {
        status,
        approvedBy: user.name || 'แอดมิน',
        approvedById: user.uid,
        reviewedAt: Date.now(),
        adminComment: adminComment.trim() || null,
        updatedAt: Date.now(),
      });

      setReviewingId(null);
      setAdminComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `overtime_requests/${requestId}`);
      alert('เกิดข้อผิดพลาดในการบันทึกผลการพิจารณาค่ะ');
    } finally {
      setIsReviewing(false);
    }
  };

  // Delete Request
  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm('คุณต้องการลบคำขอ OT นี้ใช่หรือไม่?')) return;

    try {
      await deleteDoc(doc(db, 'overtime_requests', requestId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `overtime_requests/${requestId}`);
      alert('ไม่สามารถลบรายการได้ค่ะ');
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (cycleRequests.length === 0) {
      alert(`ไม่พบข้อมูล OT ใน ${selectedCycleInfo.cycleLabel} ค่ะ`);
      return;
    }
    exportOTToExcelCsv(cycleRequests, selectedCycleInfo, 'สรุปยอด_OT_พนักงานทุกคน_Thaiplus');
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card with Cycle Selector and Quick Stats */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-xs border border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <Clock className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                แดชบอร์ด OT พนักงานทุกคน (ภาพรวมแอดมิน)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              ตรวจสอบคำขอ OT อนุมัติ/ปฏิเสธ สรุปชั่วโมงทำงานล่วงหน้า และส่งออก Excel ตามรอบบิล (ตัดรอบทุกวันที่ 25)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Cycle Selector */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-2xs">
              <CalendarCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div>
                <div className="text-[9px] font-semibold text-slate-400 leading-none">รอบตัดยอด (26 - 25)</div>
                <select
                  value={selectedCycleKey}
                  onChange={(e) => setSelectedCycleKey(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden cursor-pointer"
                >
                  {availableCycles.map((c) => (
                    <option key={c.cycleKey} value={c.cycleKey} className="dark:bg-slate-800">
                      {c.cycleLabel} ({c.periodLabel})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95 whitespace-nowrap"
              title="ส่งออกสรุปยอด OT พนักงานทุกคนเป็นไฟล์ Excel CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ดาวน์โหลด Excel</span>
            </button>

            {/* Quick Open OT Form modal */}
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-ot-modal', { detail: { tab: 'new' } }));
              }}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-xs active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>บันทึกขอ OT</span>
            </button>
          </div>
        </div>

        {/* 4 Overview Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-200 dark:border-indigo-900/60">
            <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-400 text-xs font-bold">
              <span>ชั่วโมง OT อนุมัติแล้ว</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-indigo-950 dark:text-white">
              {totalApprovedHours} <span className="text-xs font-normal text-slate-400">ชั่วโมง</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {selectedCycleInfo.cycleLabel}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-200 dark:border-amber-900/60">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-bold">
              <span>รอแอดมินอนุมัติ</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-amber-950 dark:text-amber-200">
              {totalPendingHours} <span className="text-xs font-normal text-slate-400">ชั่วโมง</span>
            </div>
            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
              {totalPendingRequests} คำขอที่ต้องตรวจสอบ
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-bold">
              <span>พนักงานที่ยื่น OT</span>
              <Users className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              {employeeOTSummary.length} <span className="text-xs font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              ทั้งหมด {cycleRequests.length} รายการคำขอ
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-bold">
              <span>รอบการคำนวณ</span>
              <CalendarCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-1.5 text-xs font-extrabold text-slate-900 dark:text-white truncate">
              {selectedCycleInfo.cycleLabel}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {selectedCycleInfo.periodLabel}
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 1: EMPLOYEE OT SUMMARY CARDS (สรุปยอด OT รายบุคคล) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              สรุปยอด OT รายบุคคลในรอบนี้ (ตัดรอบ 25)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              คลิกที่ชื่อพนักงานเพื่อกรองดูรายการคำขอทั้งหมดของคนนั้น
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
            {employeeOTSummary.length} พนักงาน
          </span>
        </div>

        {employeeOTSummary.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            ยังไม่มีข้อมูลคำขอ OT ในรอบ {selectedCycleInfo.cycleLabel}
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {employeeOTSummary.map((emp, idx) => {
              const isSelected = selectedEmployeeFilter === emp.employeeId || selectedEmployeeFilter === emp.username || selectedEmployeeFilter === emp.name;

              return (
                <div
                  key={emp.employeeId || emp.username || idx}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedEmployeeFilter('all');
                    } else {
                      setSelectedEmployeeFilter(emp.employeeId || emp.username || emp.name);
                    }
                  }}
                  className={clsx(
                    "p-3.5 rounded-xl border transition cursor-pointer relative",
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 hover:border-slate-300 dark:hover:border-slate-700"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AnimalAvatar
                        avatarEmoji={emp.avatarEmoji}
                        identifier={emp.username || emp.employeeId}
                        name={emp.name}
                        size="md"
                      />
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                          {emp.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 truncate">
                          @{emp.username || 'member'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-black text-indigo-600 dark:text-indigo-400 leading-tight">
                        {emp.approvedHours} <span className="text-[10px] font-normal text-slate-400">ชม.</span>
                      </div>
                      <span className="text-[9px] text-slate-400">อนุมัติแล้ว</span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        ✓ {emp.approvedCount} ผ่าน
                      </span>
                      {emp.pendingCount > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-bold animate-pulse">
                          ⏳ {emp.pendingCount} รอ
                        </span>
                      )}
                      {emp.rejectedCount > 0 && (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">
                          ✕ {emp.rejectedCount} ไม่ผ่าน
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      รวม {emp.totalRequests} ครั้ง
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: ALL OT REQUESTS DETAILED TABLE (รายการคำขอ OT ทั้งหมด) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              รายการคำขอ OT ทั้งหมด ({filteredRequests.length} รายการ)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              แอดมินสามารถกดอนุมัติ ปฏิเสธ หรือใส่หมายเหตุการพิจารณาได้ทันที
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              {[
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'pending', label: 'รออนุมัติ' },
                { id: 'approved', label: 'อนุมัติแล้ว' },
                { id: 'rejected', label: 'ไม่อนุมัติ' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatusFilter(s.id as any)}
                  className={clsx(
                    "px-2.5 py-1 rounded-lg font-medium transition cursor-pointer",
                    statusFilter === s.id
                      ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Clear employee filter badge */}
            {selectedEmployeeFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedEmployeeFilter('all')}
                className="px-2.5 py-1 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>กรองเฉพาะพนักงาน</span>
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, วันที่, เหตุผล..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="py-12 text-center text-slate-400">
            กำลังโหลดข้อมูลคำขอ OT...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            ไม่พบรายการคำขอ OT ตามเงื่อนไขที่เลือก
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRequests.map((req) => {
              const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              const isReviewingThis = reviewingId === req.id;

              return (
                <div
                  key={req.id}
                  className={clsx(
                    "p-4 sm:px-6 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition",
                    req.status === 'pending' && "bg-amber-50/20 dark:bg-amber-950/10"
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left: Employee and OT info */}
                    <div className="flex items-start gap-3 min-w-0">
                      <AnimalAvatar
                        avatarEmoji={req.employeeAvatarEmoji}
                        identifier={req.employeeUsername || req.employeeId}
                        name={req.employeeName}
                        size="md"
                      />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {req.employeeName}
                          </span>
                          {req.employeeUsername && (
                            <span className="text-xs text-slate-400">
                              @{req.employeeUsername}
                            </span>
                          )}
                          <span className={clsx(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1",
                            statusCfg.badgeClass
                          )}>
                            <StatusIcon className="w-3 h-3" />
                            {statusCfg.label}
                          </span>
                        </div>

                        {/* Date & Time */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-600 dark:text-slate-300">
                          <span className="flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                            <Calendar className="w-3.5 h-3.5" />
                            {req.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {req.startTime} - {req.endTime} น.
                          </span>
                          <span className="font-black text-slate-900 dark:text-white px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                            {req.hours} ชั่วโมง
                          </span>
                        </div>

                        {/* Reason Box */}
                        <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
                          <span className="font-semibold text-slate-400 block text-[10px]">
                            เหตุผลการทำ OT:
                          </span>
                          <p className="mt-0.5 whitespace-pre-wrap">{req.reason}</p>
                        </div>

                        {/* Approval meta info */}
                        {req.status !== 'pending' && (
                          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                            <span>พิจารณาโดย: <strong className="text-slate-800 dark:text-slate-200">{req.approvedBy || 'แอดมิน'}</strong></span>
                            {req.reviewedAt && (
                              <span>• {format(new Date(req.reviewedAt), 'd MMM yyyy HH:mm', { locale: th })}</span>
                            )}
                            {req.adminComment && (
                              <span className="text-amber-700 dark:text-amber-400 font-medium">
                                (หมายเหตุ: {req.adminComment})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                      {isAdmin && req.status === 'pending' && !isReviewingThis && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleReviewAction(req.id, 'approved')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                            title="อนุมัติคำขอ OT นี้"
                          >
                            <Check className="w-3.5 h-3.5" />
                            อนุมัติ
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingId(req.id);
                              setAdminComment('');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-bold border border-rose-300 dark:border-rose-800 transition flex items-center gap-1 cursor-pointer"
                            title="ปฏิเสธ หรือใส่หมายเหตุ"
                          >
                            <X className="w-3.5 h-3.5" />
                            ไม่อนุมัติ
                          </button>
                        </div>
                      )}

                      {/* Admin re-evaluation button if already approved/rejected */}
                      {isAdmin && req.status !== 'pending' && !isReviewingThis && (
                        <button
                          type="button"
                          onClick={() => {
                            setReviewingId(req.id);
                            setAdminComment(req.adminComment || '');
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                        >
                          เปลี่ยนผลพิจารณา
                        </button>
                      )}

                      {/* Delete */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRequest(req.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="ลบคำขอนี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Review Box */}
                  {isReviewingThis && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 animate-in fade-in">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        หมายเหตุการพิจารณาถึงพนักงาน (ตัวเลือก):
                      </label>
                      <input
                        type="text"
                        value={adminComment}
                        onChange={(e) => setAdminComment(e.target.value)}
                        placeholder="ระบุเหตุผลหรือคำชี้แจงถึงพนักงาน..."
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 mb-2 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setReviewingId(null)}
                          className="px-3 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          disabled={isReviewing}
                          onClick={() => handleReviewAction(req.id, 'rejected')}
                          className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          ยืนยันไม่อนุมัติ
                        </button>
                        <button
                          type="button"
                          disabled={isReviewing}
                          onClick={() => handleReviewAction(req.id, 'approved')}
                          className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          ยืนยันอนุมัติ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
