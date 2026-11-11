import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  where,
  limit,
  startAfter,
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore, isUserAdmin } from '../store/useStore';
import { OvertimeRequest, OvertimeStatus, OvertimeType } from '../types';
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
  Plus,
  Tag
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { 
  getOTCycleFromDate, 
  getAvailableOTCycles, 
  exportOTToExcelCsv, 
  OTCycleInfo,
  OT_TYPE_CONFIG,
  getOTTypeInfo
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<any>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | OvertimeStatus>('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Admin Review State
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Real-time listener for ALL pending requests across all cycles (Strictly real-time for admin)
  const [allPendingRequests, setAllPendingRequests] = useState<OvertimeRequest[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    const qPending = query(
      collection(db, 'overtime_requests'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      qPending,
      (snapshot) => {
        const list: OvertimeRequest[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as Omit<OvertimeRequest, 'id'>) });
        });
        setAllPendingRequests(list);
      },
      (err) => console.warn('Pending OT listen error:', err)
    );
    return () => unsub();
  }, [isAdmin]);

  // Load OT requests for current/selected cycle (26-25) via getDocs with limit(100)
  const fetchCycleRequests = async (isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const constraints: any[] = [
        where('date', '>=', selectedCycleInfo.startDate),
        where('date', '<=', selectedCycleInfo.endDate),
        orderBy('date', 'desc'),
        limit(100)
      ];

      if (isLoadMore && lastVisibleDoc) {
        constraints.push(startAfter(lastVisibleDoc));
      }

      const q = query(collection(db, 'overtime_requests'), ...constraints);
      const snapshot = await getDocs(q);
      const list: OvertimeRequest[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as Omit<OvertimeRequest, 'id'>) });
      });

      if (isLoadMore) {
        setRequests((prev) => [...prev, ...list]);
      } else {
        setRequests(list);
      }

      setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length >= 100);
    } catch (error) {
      console.warn('Error fetching cycle OT requests:', error);
      // Fallback: If date index is missing, fetch by limit(100) ordered by createdAt
      try {
        const fallbackQ = query(
          collection(db, 'overtime_requests'),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const fbSnap = await getDocs(fallbackQ);
        const fbList: OvertimeRequest[] = [];
        fbSnap.forEach((docSnap) => {
          fbList.push({ id: docSnap.id, ...(docSnap.data() as Omit<OvertimeRequest, 'id'>) });
        });
        setRequests(fbList);
        setHasMore(false);
      } catch (fbErr) {
        handleFirestoreError(fbErr, OperationType.GET, 'overtime_requests');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCycleRequests(false);
  }, [selectedCycleKey]);

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
      holidayInHours: number;
      holidayAfterHours: number;
      workdayHours: number;
      unspecifiedHours: number;
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
          holidayInHours: 0,
          holidayAfterHours: 0,
          workdayHours: 0,
          unspecifiedHours: 0,
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
        if (req.otType === 'holiday_in_hours') {
          item.holidayInHours += h;
        } else if (req.otType === 'holiday_after_hours') {
          item.holidayAfterHours += h;
        } else if (req.otType === 'workday') {
          item.workdayHours += h;
        } else {
          item.unspecifiedHours += h;
        }
      } else if (req.status === 'pending') {
        item.pendingHours += h;
        item.pendingCount += 1;
      } else if (req.status === 'rejected') {
        item.rejectedHours += h;
        item.rejectedCount += 1;
      }
    });

    // Round hours for neat display
    map.forEach((item) => {
      item.approvedHours = Math.round(item.approvedHours * 100) / 100;
      item.holidayInHours = Math.round(item.holidayInHours * 100) / 100;
      item.holidayAfterHours = Math.round(item.holidayAfterHours * 100) / 100;
      item.workdayHours = Math.round(item.workdayHours * 100) / 100;
      item.unspecifiedHours = Math.round(item.unspecifiedHours * 100) / 100;
    });

    // Sort by approved hours descending
    return Array.from(map.values()).sort((a, b) => b.approvedHours - a.approvedHours);
  }, [cycleRequests]);

  // Approved hours categorized by 3 OT types for the cycle
  const approvedHoursByType = useMemo(() => {
    let holidayInHours = 0;
    let holidayAfterHours = 0;
    let workdayHours = 0;
    let unspecifiedHours = 0;

    cycleRequests.forEach((r) => {
      if (r.status === 'approved') {
        const h = Number(r.hours) || 0;
        if (r.otType === 'holiday_in_hours') {
          holidayInHours += h;
        } else if (r.otType === 'holiday_after_hours') {
          holidayAfterHours += h;
        } else if (r.otType === 'workday') {
          workdayHours += h;
        } else {
          unspecifiedHours += h;
        }
      }
    });

    return {
      holidayInHours: Math.round(holidayInHours * 100) / 100,
      holidayAfterHours: Math.round(holidayAfterHours * 100) / 100,
      workdayHours: Math.round(workdayHours * 100) / 100,
      unspecifiedHours: Math.round(unspecifiedHours * 100) / 100,
    };
  }, [cycleRequests]);

  // Total summary overview
  const totalApprovedHours = useMemo(() => {
    const sum = cycleRequests
      .filter((r) => r.status === 'approved')
      .reduce((acc, r) => acc + (Number(r.hours) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [cycleRequests]);

  const totalPendingHours = useMemo(() => {
    const sum = allPendingRequests
      .reduce((acc, r) => acc + (Number(r.hours) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [allPendingRequests]);

  const totalPendingRequests = useMemo(() => {
    return allPendingRequests.length;
  }, [allPendingRequests]);

  // Filtered list for detailed table
  const filteredRequests = useMemo(() => {
    // If admin is specifically filtering for pending, show ALL pending requests across all cycles
    if (statusFilter === 'pending') {
      return allPendingRequests.filter((r) => {
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

        return matchEmployee && matchSearch;
      });
    }

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
  }, [cycleRequests, allPendingRequests, statusFilter, selectedEmployeeFilter, searchQuery]);

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

  // Edit OT Date State & Handler
  const [editingDateRequest, setEditingDateRequest] = useState<OvertimeRequest | null>(null);
  const [editDateValue, setEditDateValue] = useState<string>('');
  const [isSavingDate, setIsSavingDate] = useState(false);
  const [editDateError, setEditDateError] = useState<string | null>(null);

  const handleSaveDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDateRequest || !isAdmin || !user) return;
    if (!editDateValue) {
      setEditDateError('กรุณาเลือกวันที่ต้องการแก้ไขค่ะ');
      return;
    }

    setIsSavingDate(true);
    setEditDateError(null);
    try {
      const newCycle = getOTCycleFromDate(editDateValue);
      const reqRef = doc(db, 'overtime_requests', editingDateRequest.id);
      const updateData: any = {
        date: editDateValue,
        cyclePeriod: newCycle.cycleKey,
        dateModifiedBy: user.name || 'แอดมิน',
        dateModifiedById: user.uid,
        dateModifiedAt: Date.now(),
        previousDate: editingDateRequest.date,
        updatedAt: Date.now(),
      };

      await updateDoc(reqRef, updateData);

      // Optimistically update local states
      setRequests((prev) =>
        prev.map((r) => (r.id === editingDateRequest.id ? { ...r, ...updateData } : r))
      );
      setAllPendingRequests((prev) =>
        prev.map((r) => (r.id === editingDateRequest.id ? { ...r, ...updateData } : r))
      );

      setEditingDateRequest(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `overtime_requests/${editingDateRequest.id}`);
      setEditDateError('เกิดข้อผิดพลาดในการบันทึกวันที่: ' + (error instanceof Error ? error.message : 'กรุณาลองใหม่ค่ะ'));
    } finally {
      setIsSavingDate(false);
    }
  };

  // Edit OT Type State & Handler
  const [editingOtTypeRequest, setEditingOtTypeRequest] = useState<OvertimeRequest | null>(null);
  const [selectedNewOtType, setSelectedNewOtType] = useState<OvertimeType>('workday');
  const [isSavingOtType, setIsSavingOtType] = useState(false);
  const [otTypeError, setOtTypeError] = useState<string | null>(null);

  const handleSaveOtType = async (newType: OvertimeType) => {
    if (!editingOtTypeRequest || !isAdmin || !user) return;
    setIsSavingOtType(true);
    setOtTypeError(null);
    try {
      const reqRef = doc(db, 'overtime_requests', editingOtTypeRequest.id);
      const updateData: any = {
        otType: newType,
        otTypeModifiedBy: user.name || 'แอดมิน',
        otTypeModifiedAt: Date.now(),
        previousOtType: editingOtTypeRequest.otType || null,
        updatedAt: Date.now(),
      };

      await updateDoc(reqRef, updateData);

      // Optimistically update local states
      setRequests((prev) =>
        prev.map((r) => (r.id === editingOtTypeRequest.id ? { ...r, ...updateData } : r))
      );
      setAllPendingRequests((prev) =>
        prev.map((r) => (r.id === editingOtTypeRequest.id ? { ...r, ...updateData } : r))
      );

      setEditingOtTypeRequest(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `overtime_requests/${editingOtTypeRequest.id}`);
      setOtTypeError('เกิดข้อผิดพลาดในการบันทึกประเภท OT: ' + (error instanceof Error ? error.message : 'กรุณาลองใหม่ค่ะ'));
    } finally {
      setIsSavingOtType(false);
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
            {/* 3-color breakdown badges */}
            <div className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/40 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-semibold" title="OT วันหยุด ในเวลางาน">
                หยุด(ใน): {approvedHoursByType.holidayInHours}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-semibold" title="OT วันหยุด หลังเวลางาน">
                หยุด(หลัง): {approvedHoursByType.holidayAfterHours}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 font-semibold" title="OT วันทำงานปกติ">
                วันปกติ: {approvedHoursByType.workdayHours}
              </span>
              {approvedHoursByType.unspecifiedHours > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium" title="ไม่ระบุ">
                  ไม่ระบุ: {approvedHoursByType.unspecifiedHours}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
              {selectedCycleInfo.cycleLabel}
            </p>
          </div>

          <div 
            onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
            className={clsx(
              "p-3.5 rounded-xl border transition cursor-pointer active:scale-98 select-none",
              statusFilter === 'pending'
                ? "bg-amber-100/80 dark:bg-amber-950/80 border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/30"
                : "bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-200 dark:border-amber-900/60 hover:border-amber-300"
            )}
            title="คลิกเพื่อกรองเฉพาะรายการรออนุมัติทั้งหมด"
          >
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-bold">
              <span>รอแอดมินอนุมัติ</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-amber-950 dark:text-amber-200">
              {totalPendingHours} <span className="text-xs font-normal text-slate-400">ชั่วโมง</span>
            </div>
            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
              {totalPendingRequests} คำขอที่ต้องตรวจสอบ (คลิกดูทั้งหมด)
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

      {/* REAL-TIME PENDING OT REVIEW SECTION (Always visible & actionable for Admin) */}
      {allPendingRequests.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-xs border-2 border-amber-400 dark:border-amber-600 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-amber-100 dark:border-amber-950">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                คำขอ OT รอตรวจอนุมัติ (เรียลไทม์)
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white shadow-2xs">
                  {allPendingRequests.length} รายการ
                </span>
              </h3>
            </div>
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
              ⚡ ตรวจสอบและกดอนุมัติได้ทันทีโดยไม่ต้องรอ
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allPendingRequests.map((req) => {
              const reqCycleInfo = getOTCycleFromDate(req.date);
              const isReviewingThis = reviewingId === req.id;

              return (
                <div
                  key={req.id}
                  className="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/80 shadow-xs flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <AnimalAvatar
                        avatarEmoji={req.employeeAvatarEmoji}
                        identifier={req.employeeUsername || req.employeeId}
                        name={req.employeeName}
                        size="md"
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {req.employeeName}
                          </span>
                          {req.employeeUsername && (
                            <span className="text-[11px] text-slate-400">
                              @{req.employeeUsername}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            รออนุมัติ
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-600 dark:text-slate-300">
                          <span className="flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                            <Calendar className="w-3.5 h-3.5" />
                            {req.date}
                          </span>
                          {/* OT Type badge */}
                          {(() => {
                            const otTypeInfo = getOTTypeInfo(req.otType);
                            return (
                              <span className={clsx(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold border",
                                otTypeInfo.badgeClass
                              )} title={otTypeInfo.description}>
                                {otTypeInfo.label}
                              </span>
                            );
                          })()}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {req.startTime} - {req.endTime} น.
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            {req.hours} ชม.
                          </span>
                          {(req as any).dateModifiedBy && (
                            <span className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 inline-flex items-center gap-1 font-medium">
                              <span>แก้วันที่โดย {(req as any).dateModifiedBy}</span>
                              {(req as any).dateModifiedAt && (
                                <span>({format(new Date((req as any).dateModifiedAt), 'd MMM yyyy HH:mm', { locale: th })})</span>
                              )}
                            </span>
                          )}
                          {(req as any).otTypeModifiedBy && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1 font-medium">
                              <span>แก้ประเภทโดย {(req as any).otTypeModifiedBy}</span>
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          รอบตัดยอด: <span className="font-semibold text-slate-700 dark:text-slate-300">{reqCycleInfo.cycleLabel}</span>
                        </div>

                        <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-amber-200/80 dark:border-amber-900/60">
                          <span className="font-semibold text-slate-500 dark:text-slate-400 block text-[10px]">
                            เหตุผลที่ทำ OT:
                          </span>
                          <p className="mt-0.5 whitespace-pre-wrap">{req.reason}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-amber-200/60 dark:border-amber-800/60 flex items-center justify-between gap-2">
                    {!isReviewingThis ? (
                      <div className="flex items-center gap-2 w-full justify-end flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOtTypeRequest(req);
                            setSelectedNewOtType((req.otType as OvertimeType) || 'workday');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1 cursor-pointer"
                          title="เปลี่ยนประเภท OT ของคำขอนี้"
                        >
                          <Tag className="w-3.5 h-3.5" />
                          เปลี่ยนประเภท
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDateRequest(req);
                            setEditDateValue(req.date);
                            setEditDateError(null);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1 cursor-pointer"
                          title="แก้ไขวันที่ของคำขอ OT"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          แก้วันที่
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewAction(req.id, 'approved')}
                          disabled={isReviewing}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
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
                          className="px-3.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-bold border border-rose-300 dark:border-rose-800 transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          ไม่อนุมัติ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRequest(req.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="ลบคำขอนี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-full space-y-2">
                        <textarea
                          rows={2}
                          value={adminComment}
                          onChange={(e) => setAdminComment(e.target.value)}
                          placeholder="ระบุเหตุผลที่ไม่อนุมัติหรือข้อความแจ้งเตือน..."
                          className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingId(null);
                              setAdminComment('');
                            }}
                            className="px-3 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewAction(req.id, 'rejected')}
                            disabled={isReviewing}
                            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            ยืนยันไม่อนุมัติ
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

                  {/* Hours breakdown by OT Type */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40" title="OT วันหยุด ในเวลางาน">
                      หยุด(ใน): {emp.holidayInHours}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40" title="OT วันหยุด หลังเวลางาน">
                      หยุด(หลัง): {emp.holidayAfterHours}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-900/40" title="OT วันทำงานปกติ">
                      วันปกติ: {emp.workdayHours}
                    </span>
                    {emp.unspecifiedHours > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700" title="ไม่ระบุ">
                        ไม่ระบุ: {emp.unspecifiedHours}
                      </span>
                    )}
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
                          {/* OT Type badge */}
                          {(() => {
                            const otTypeInfo = getOTTypeInfo(req.otType);
                            return (
                              <span className={clsx(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold border",
                                otTypeInfo.badgeClass
                              )} title={otTypeInfo.description}>
                                {otTypeInfo.label}
                              </span>
                            );
                          })()}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {req.startTime} - {req.endTime} น.
                          </span>
                          <span className="font-black text-slate-900 dark:text-white px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                            {req.hours} ชั่วโมง
                          </span>
                          {(req as any).dateModifiedBy && (
                            <span className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800 inline-flex items-center gap-1 font-medium">
                              <span>แก้วันที่โดย {(req as any).dateModifiedBy}</span>
                              {(req as any).dateModifiedAt && (
                                <span>({format(new Date((req as any).dateModifiedAt), 'd MMM yyyy HH:mm', { locale: th })})</span>
                              )}
                            </span>
                          )}
                          {(req as any).otTypeModifiedBy && (
                            <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 inline-flex items-center gap-1 font-medium">
                              <span>แก้ประเภทโดย {(req as any).otTypeModifiedBy}</span>
                            </span>
                          )}
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
                    <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center flex-wrap">
                      {isAdmin && !isReviewingThis && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOtTypeRequest(req);
                              setSelectedNewOtType((req.otType as OvertimeType) || 'workday');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-xs font-semibold border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1 cursor-pointer"
                            title="เปลี่ยนประเภท OT ของคำขอนี้"
                          >
                            <Tag className="w-3.5 h-3.5" />
                            เปลี่ยนประเภท
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDateRequest(req);
                              setEditDateValue(req.date);
                              setEditDateError(null);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-xs font-semibold border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1 cursor-pointer"
                            title="แก้ไขวันที่ของคำขอ OT นี้"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            แก้วันที่
                          </button>
                        </>
                      )}

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

        {/* Load More Button */}
        {hasMore && !loading && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => fetchCycleRequests(true)}
              className="px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 font-semibold text-xs transition cursor-pointer border border-indigo-200 dark:border-indigo-800/80 disabled:opacity-50"
            >
              {loadingMore ? 'กำลังโหลดเพิ่ม...' : 'โหลดเพิ่ม'}
            </button>
          </div>
        )}
      </div>

      {/* Modal สำหรับแอดมินแก้วันที่ของคำขอ OT */}
      {editingDateRequest && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    แก้ไขวันที่คำขอ OT
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {editingDateRequest.employeeName} ({editingDateRequest.hours} ชม.)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDateRequest(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                title="ปิด"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDate} className="mt-4 space-y-4">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  วันที่เดิม: <strong className="text-slate-800 dark:text-slate-200 font-bold">{editingDateRequest.date}</strong>
                </div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  เลือกวันที่ใหม่ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={editDateValue}
                  onChange={(e) => setEditDateValue(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {editDateValue && (
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/80 text-xs text-indigo-900 dark:text-indigo-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CalendarCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>รอบตัดยอดที่จะถูกคำนวณใหม่:</span>
                  </div>
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300 pl-5">
                    <strong>{getOTCycleFromDate(editDateValue).cycleLabel}</strong> ({getOTCycleFromDate(editDateValue).periodLabel})
                  </p>
                </div>
              )}

              {editDateError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{editDateError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDateRequest(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingDate || !editDateValue}
                  className={clsx(
                    "px-4 py-2 rounded-xl text-xs font-bold text-white transition flex items-center gap-1.5 shadow-md active:scale-98 cursor-pointer",
                    isSavingDate || !editDateValue
                      ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed shadow-none"
                      : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                  )}
                >
                  {isSavingDate ? (
                    <>กำลังบันทึก...</>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      บันทึกวันที่ใหม่
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal สำหรับแอดมินเปลี่ยนประเภท OT */}
      {editingOtTypeRequest && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    เปลี่ยนประเภท OT
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {editingOtTypeRequest.employeeName} ({editingOtTypeRequest.hours} ชม.)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOtTypeRequest(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                title="ปิด"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-1">
                <div>
                  วันที่: <strong className="text-slate-800 dark:text-slate-200">{editingOtTypeRequest.date}</strong> ({editingOtTypeRequest.startTime} - {editingOtTypeRequest.endTime} น.)
                </div>
                <div>
                  ประเภทเดิม:{' '}
                  <span className={clsx(
                    "inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ml-1",
                    getOTTypeInfo(editingOtTypeRequest.otType).badgeClass
                  )}>
                    {getOTTypeInfo(editingOtTypeRequest.otType).label}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  เลือกประเภทใหม่ (3 สี) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {(['holiday_in_hours', 'holiday_after_hours', 'workday'] as OvertimeType[]).map((typeKey) => {
                    const cfg = OT_TYPE_CONFIG[typeKey];
                    const isSelected = selectedNewOtType === typeKey;
                    return (
                      <button
                        key={typeKey}
                        type="button"
                        onClick={() => setSelectedNewOtType(typeKey)}
                        className={clsx(
                          "p-3 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer",
                          isSelected
                            ? `${cfg.badgeClass} ring-2 ring-indigo-500/40 font-bold shadow-xs`
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                        )}
                      >
                        <span className={clsx("w-3 h-3 rounded-full mt-0.5 shrink-0", cfg.dotClass)} />
                        <div className="min-w-0">
                          <div className="text-xs font-bold">{cfg.label}</div>
                          <div className="text-[10px] opacity-80 mt-0.5">{cfg.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {otTypeError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{otTypeError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingOtTypeRequest(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveOtType(selectedNewOtType)}
                  disabled={isSavingOtType}
                  className={clsx(
                    "px-4 py-2 rounded-xl text-xs font-bold text-white transition flex items-center gap-1.5 shadow-md active:scale-98 cursor-pointer",
                    isSavingOtType
                      ? "bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed shadow-none"
                      : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                  )}
                >
                  {isSavingOtType ? (
                    <>กำลังบันทึก...</>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      บันทึกประเภทใหม่
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
