import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy 
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
  AlertCircle, 
  Search, 
  X, 
  Send, 
  Trash2, 
  Filter, 
  Plus, 
  Check, 
  Download,
  CalendarCheck,
  Building2,
  FileSpreadsheet,
  User,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { 
  getOTCycleFromDate, 
  getAvailableOTCycles, 
  calculateHoursBetween, 
  exportOTToExcelCsv, 
  OTCycleInfo 
} from '../lib/otUtils';

interface OvertimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'my' | 'admin' | 'new';
}

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

export function OvertimeModal({ 
  isOpen, 
  onClose, 
  defaultTab = 'my' 
}: OvertimeModalProps) {
  const { user } = useStore();
  const isAdmin = isUserAdmin(user);

  const availableCycles = useMemo(() => getAvailableOTCycles(), []);
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>(() => {
    // เลือกตัดรอบปัจจุบัน
    const nowStr = format(new Date(), 'yyyy-MM-dd');
    return getOTCycleFromDate(nowStr).cycleKey;
  });

  const selectedCycleInfo = useMemo(() => {
    return availableCycles.find(c => c.cycleKey === selectedCycleKey) || availableCycles[1] || availableCycles[0];
  }, [availableCycles, selectedCycleKey]);

  // Tab State: 'my' (OT ของฉัน) | 'admin' (แอดมินจัดการ) | 'new' (แบบฟอร์มขอ OT)
  const [activeTab, setActiveTab] = useState<'my' | 'admin' | 'new'>(() => {
    if (defaultTab === 'admin' && isAdmin) return 'admin';
    return defaultTab === 'admin' ? 'my' : defaultTab;
  });

  // Strict Tab Guard: Non-admin can never enter or stay in 'admin' tab
  useEffect(() => {
    if (!isAdmin && activeTab === 'admin') {
      setActiveTab('my');
    }
  }, [isAdmin, activeTab]);

  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');
  const [manualHours, setManualHours] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Auto-calculated hours from start and end time
  const autoHours = useMemo(() => {
    return calculateHoursBetween(startTime, endTime);
  }, [startTime, endTime]);

  const effectiveHours = manualHours !== '' ? parseFloat(manualHours) || 0 : autoHours;

  // Search & Filter
  const [statusFilter, setStatusFilter] = useState<'all' | OvertimeStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Admin Review State
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  // Subscribe to overtime_requests collection (Strictly isolated by role)
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const q = query(collection(db, 'overtime_requests'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: OvertimeRequest[] = [];
        snapshot.forEach((docSnap) => {
          const req = { id: docSnap.id, ...(docSnap.data() as Omit<OvertimeRequest, 'id'>) };
          if (isAdmin) {
            list.push(req);
          } else {
            // Strictly guard: non-admin employee can ONLY access and see their own requests!
            const currentUid = (user?.uid || '').toLowerCase();
            const currentUsername = (user?.username || '').toLowerCase();
            const currentName = (user?.name || '').toLowerCase();

            const rUid = (req.employeeId || '').toLowerCase();
            const rUsername = (req.employeeUsername || '').toLowerCase();
            const rName = (req.employeeName || '').toLowerCase();

            const isOwn =
              (currentUid && rUid === currentUid) ||
              (currentUsername && rUsername === currentUsername) ||
              (currentName && rName === currentName);

            if (isOwn) {
              list.push(req);
            }
          }
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
  }, [isOpen, isAdmin, user]);

  // Submit Form: ขอทำ OT
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('กรุณาเข้าสู่ระบบก่อนทำรายการค่ะ');
      return;
    }

    if (!date) {
      alert('กรุณาระบุวันที่ทำ OT ค่ะ');
      return;
    }

    if (effectiveHours <= 0) {
      alert('กรุณาระบุเวลาเริ่ม-สิ้นสุด หรือจำนวนชั่วโมงให้ถูกต้อง (มากกว่า 0 ชม.) ค่ะ');
      return;
    }

    if (!reason.trim()) {
      alert('กรุณาระบุเหตุผลการทำ OT ค่ะ');
      return;
    }

    setIsSubmitting(true);
    try {
      const cycleInfo = getOTCycleFromDate(date);
      const newOT: any = {
        employeeId: user.uid,
        employeeName: user.name || 'พนักงาน',
        date,
        startTime,
        endTime,
        hours: effectiveHours,
        reason: reason.trim(),
        status: 'pending',
        cyclePeriod: cycleInfo.cycleKey,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (user.username) {
        newOT.employeeUsername = user.username;
      }
      if (user.avatarEmoji) {
        newOT.employeeAvatarEmoji = user.avatarEmoji;
      }

      await addDoc(collection(db, 'overtime_requests'), newOT);

      setSubmitSuccess(true);
      setReason('');
      setManualHours('');
      setTimeout(() => {
        setSubmitSuccess(false);
        setActiveTab('my');
      }, 1500);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'overtime_requests');
      alert('เกิดข้อผิดพลาดในการบันทึกคำขอ: ' + (error instanceof Error ? error.message : 'กรุณาลองใหม่อีกครั้งค่ะ'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin Approve / Reject
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

  // Filter requests based on selected cycle and tabs
  const myRequests = useMemo(() => {
    if (!user) return [];
    const currentUid = (user.uid || '').toLowerCase();
    const currentUsername = (user.username || '').toLowerCase();
    const currentName = (user.name || '').toLowerCase();

    return requests.filter(r => {
      const rUid = (r.employeeId || '').toLowerCase();
      const rUsername = (r.employeeUsername || '').toLowerCase();
      const rName = (r.employeeName || '').toLowerCase();

      return (
        rUid === currentUid ||
        (currentUsername && rUsername === currentUsername) ||
        (currentName && rName === currentName)
      );
    });
  }, [requests, user]);

  const cycleFilteredRequests = useMemo(() => {
    return requests.filter(r => {
      // จับคู่งวดตัดรอบ cyclePeriod หรือคำนวณจากวันที่ r.date
      const reqCycle = r.cyclePeriod || getOTCycleFromDate(r.date).cycleKey;
      return reqCycle === selectedCycleKey;
    });
  }, [requests, selectedCycleKey]);

  const cycleFilteredMyRequests = useMemo(() => {
    return myRequests.filter(r => {
      const reqCycle = r.cyclePeriod || getOTCycleFromDate(r.date).cycleKey;
      return reqCycle === selectedCycleKey;
    });
  }, [myRequests, selectedCycleKey]);

  // Total summary for current cycle (Admin & Employee)
  const cycleSummary = useMemo(() => {
    const list = isAdmin && activeTab === 'admin' ? cycleFilteredRequests : cycleFilteredMyRequests;
    const totalApprovedHours = list
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
    const totalPendingHours = list
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
    const totalRequestsCount = list.length;
    const pendingCount = list.filter(r => r.status === 'pending').length;

    return {
      totalApprovedHours: Math.round(totalApprovedHours * 100) / 100,
      totalPendingHours: Math.round(totalPendingHours * 100) / 100,
      totalRequestsCount,
      pendingCount,
    };
  }, [isAdmin, activeTab, cycleFilteredRequests, cycleFilteredMyRequests]);

  // Export to Excel CSV
  const handleExportExcel = () => {
    // กรองเฉพาะรายการที่อนุมัติแล้ว หรือทั้งหมดในรอบบิล
    const targetData = isAdmin && activeTab === 'admin' ? cycleFilteredRequests : cycleFilteredMyRequests;
    if (targetData.length === 0) {
      alert(`ไม่พบข้อมูล OT ใน ${selectedCycleInfo.cycleLabel} ค่ะ`);
      return;
    }
    const prefix = isAdmin && activeTab === 'admin' ? 'สรุปยอด_OT_บริษัท_Thaiplus' : `สรุปยอด_OT_${user?.name || 'พนักงาน'}`;
    exportOTToExcelCsv(targetData, selectedCycleInfo, prefix);
  };

  // Filtered list based on status & search
  const displayedRequests = useMemo(() => {
    const baseList = activeTab === 'admin' && isAdmin ? cycleFilteredRequests : cycleFilteredMyRequests;
    return baseList.filter(r => {
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = q === '' ||
        (r.employeeName && r.employeeName.toLowerCase().includes(q)) ||
        (r.employeeUsername && r.employeeUsername.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        (r.date && r.date.includes(q));
      return matchStatus && matchSearch;
    });
  }, [activeTab, isAdmin, cycleFilteredRequests, cycleFilteredMyRequests, statusFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs border border-white/20 shadow-xs">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/20">
                  Thaiplus OT
                </span>
                <span className="text-xs text-blue-100 hidden sm:inline">
                  ระบบบันทึกและอนุมัติทำงานล่วงเวลา (OT)
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5 mt-0.5">
                ระบบจัดการและขออนุมัติ OT
                <span className="text-xs font-normal text-blue-200">(ตัดรอบทุกวันที่ 25 ของเดือน)</span>
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab & Cycle Filter Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('my')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer",
                activeTab === 'my'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <User className="w-3.5 h-3.5" />
              <span>OT ของฉัน</span>
              {myRequests.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                  {myRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer",
                activeTab === 'new'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>กรอกฟอร์มขอ OT</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer relative",
                  activeTab === 'admin'
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                <span>แอดมินตรวจอนุมัติ</span>
                {requests.filter(r => r.status === 'pending').length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-2xs animate-pulse">
                    {requests.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Right Controls: รอบบิลตัดยอด & ปุ่มดาวน์โหลด Excel */}
          <div className="flex items-center gap-2">
            {/* Cycle Selector */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-xl shadow-2xs">
              <CalendarCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] font-semibold text-slate-400 leading-none">รอบตัดยอด (26 - 25)</span>
                <select
                  value={selectedCycleKey}
                  onChange={(e) => setSelectedCycleKey(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden cursor-pointer"
                >
                  {availableCycles.map(c => (
                    <option key={c.cycleKey} value={c.cycleKey}>
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
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95 whitespace-nowrap"
              title="ส่งออกสรุปยอด OT ตามรอบบิลเป็นไฟล์ Excel CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ดาวน์โหลด Excel</span>
              <span className="inline sm:hidden">Excel</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">

          {/* TAB 1: NEW REQUEST FORM (กรอกฟอร์มขอ OT) */}
          {activeTab === 'new' && (
            <div className="max-w-xl mx-auto py-2">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      แบบฟอร์มบันทึกขอทำงานล่วงเวลา (OT)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      ตัดรอบคำนวณทุกวันที่ 25 (นับ 26 เดือนก่อนหน้า ถึง 25 เดือนปัจจุบัน)
                    </p>
                  </div>
                </div>

                {submitSuccess ? (
                  <div className="p-6 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-center animate-in fade-in">
                    <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                    <h4 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                      ส่งคำขอทำ OT เรียบร้อยแล้วค่ะ!
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                      ระบบได้ส่งข้อมูลให้แอดมินพิจารณาอนุมัติเรียบร้อยแล้ว กำลังนำท่านไปยังหน้ารายการ...
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitRequest} className="space-y-4">
                    {/* ข้อมูลผู้ยื่น */}
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <AnimalAvatar 
                          avatarEmoji={user?.avatarEmoji}
                          identifier={user?.username || user?.uid || 'user'}
                          name={user?.name || 'พนักงาน'}
                          size="sm"
                        />
                        <div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                            {user?.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            @{user?.username || 'member'} • ผู้ขอทำ OT
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-900">
                        {user?.role === 'admin' ? 'แอดมิน' : 'พนักงาน'}
                      </span>
                    </div>

                    {/* วันที่ทำ OT */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        วันที่ทำงานล่วงเวลา (OT) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      {date && (
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1 font-medium">
                          <CalendarCheck className="w-3 h-3" />
                          <span>จะถูกนับรวมใน: <strong>{getOTCycleFromDate(date).cycleLabel}</strong> ({getOTCycleFromDate(date).periodLabel})</span>
                        </div>
                      )}
                    </div>

                    {/* เวลาเริ่ม - เวลาสิ้นสุด */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          เวลาเริ่มต้น <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          เวลาสิ้นสุด <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                          required
                        />
                      </div>
                    </div>

                    {/* จำนวนชั่วโมง (คำนวณให้อัตโนมัติ + แก้ไขได้) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          จำนวนชั่วโมง OT รวม <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          (คำนวณอัตโนมัติ {autoHours} ชม. หรือแก้ไขตัวเลขได้)
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          max="24"
                          placeholder={`${autoHours}`}
                          value={manualHours}
                          onChange={(e) => setManualHours(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="absolute right-3 top-2 text-xs font-medium text-slate-400">
                          ชั่วโมง
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>ยอดชั่วโมงที่จะบันทึก: <strong className="text-slate-900 dark:text-white font-bold">{effectiveHours} ชั่วโมง</strong></span>
                        {manualHours !== '' && (
                          <button
                            type="button"
                            onClick={() => setManualHours('')}
                            className="text-indigo-600 dark:text-indigo-400 underline text-[10px] cursor-pointer"
                          >
                            รีเซ็ตใช้ยอดอัตโนมัติ ({autoHours} ชม.)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* เหตุผลการทำ OT */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        เหตุผลการทำ OT / รายละเอียดงานที่ทำ <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="ระบุเหตุผล เช่น เคลียร์คิวเคสคงค้างช่วงเย็น, ดูแลลูกค้ารีไฟแนนซ์รอบดึก, สรุปยอดสัญญา..."
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                        required
                      />
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className={clsx(
                          "w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98",
                          isSubmitting
                            ? "bg-indigo-400 cursor-not-allowed"
                            : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                        )}
                      >
                        {isSubmitting ? (
                          <>กำลังบันทึกข้อมูล...</>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            ส่งคำขอทำ OT ({effectiveHours} ชม.)
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 2 & 3: LIST VIEW (OT ของฉัน & แอดมินตรวจอนุมัติ) */}
          {(activeTab === 'my' || activeTab === 'admin') && (
            <div className="space-y-4">
              
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-200 dark:border-indigo-900/60">
                  <div className="flex items-center justify-between text-indigo-700 dark:text-indigo-400 text-xs font-bold">
                    <span>{activeTab === 'admin' ? 'OT อนุมัติรวมทั้งทีม' : 'OT ของฉันที่อนุมัติ'}</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="mt-1 text-2xl font-black text-indigo-900 dark:text-white">
                    {cycleSummary.totalApprovedHours}
                    <span className="text-xs font-normal text-slate-400 ml-1">ชม.</span>
                  </div>
                  <span className="text-[10px] text-slate-400">ใน {selectedCycleInfo.cycleLabel}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-200 dark:border-amber-900/60">
                  <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-bold">
                    <span>รออนุมัติ</span>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="mt-1 text-2xl font-black text-amber-900 dark:text-amber-200">
                    {cycleSummary.totalPendingHours}
                    <span className="text-xs font-normal text-slate-400 ml-1">ชม.</span>
                  </div>
                  <span className="text-[10px] text-slate-400">({cycleSummary.pendingCount} คำขอ)</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-slate-600 dark:text-slate-400 text-xs font-bold flex items-center justify-between">
                    <span>รอบบิลคำนวณ</span>
                    <CalendarCheck className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="mt-1 text-xs font-extrabold text-slate-900 dark:text-white truncate">
                    {selectedCycleInfo.cycleLabel}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {selectedCycleInfo.periodLabel}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                  <div className="text-slate-600 dark:text-slate-400 text-xs font-bold flex items-center justify-between">
                    <span>ดาวน์โหลดไฟล์</span>
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  </div>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="mt-1 w-full py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3 h-3" />
                    ส่งออก Excel (.csv)
                  </button>
                </div>
              </div>

              {/* Filter Chips & Search Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1 shrink-0">
                    สถานะ:
                  </span>
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
                        "px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer",
                        statusFilter === s.id
                          ? "bg-indigo-600 text-white font-bold shadow-2xs"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อพนักงาน, วันที่, เหตุผล..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
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

              {/* Requests List */}
              {loading ? (
                <div className="py-12 text-center text-slate-400">
                  กำลังโหลดข้อมูลคำขอ OT...
                </div>
              ) : displayedRequests.length === 0 ? (
                <div className="py-12 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 space-y-2">
                  <Clock className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold">
                    {activeTab === 'my' 
                      ? `ไม่พบประวัติการขอ OT ของคุณใน ${selectedCycleInfo.cycleLabel}` 
                      : `ไม่มีคำขอ OT ใน ${selectedCycleInfo.cycleLabel}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('new')}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition cursor-pointer"
                  >
                    + กรอกฟอร์มขอ OT ตอนนี้
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedRequests.map((req) => {
                    const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                    const StatusIcon = statusCfg.icon;
                    const isMyOwn = user && req.employeeId === user.uid;
                    const isReviewingThis = reviewingId === req.id;

                    return (
                      <div
                        key={req.id}
                        className={clsx(
                          "p-4 rounded-xl border transition-all bg-white dark:bg-slate-900 shadow-2xs",
                          req.status === 'pending'
                            ? "border-amber-200 dark:border-amber-900/60"
                            : req.status === 'approved'
                            ? "border-emerald-200 dark:border-emerald-900/60"
                            : "border-slate-200 dark:border-slate-800"
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2.5">
                          {/* Left: Employee Info & OT details */}
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
                                <span className={clsx(
                                  "px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1",
                                  statusCfg.badgeClass
                                )}>
                                  <StatusIcon className="w-3 h-3" />
                                  {statusCfg.label}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-600 dark:text-slate-300">
                                <span className="flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {req.date}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  {req.startTime} - {req.endTime} น.
                                </span>
                                <span className="font-bold text-slate-900 dark:text-white px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                                  {req.hours} ชั่วโมง
                                </span>
                              </div>

                              {/* เหตุผล */}
                              <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                                <span className="font-semibold text-slate-500 dark:text-slate-400 block text-[10px]">
                                  เหตุผลที่ทำ OT:
                                </span>
                                <p className="mt-0.5 whitespace-pre-wrap">{req.reason}</p>
                              </div>

                              {/* ข้อมูลการอนุมัติ / หมายเหตุแอดมิน (ถ้ามี) */}
                              {req.status !== 'pending' && (
                                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                  <span>พิจารณาโดย: <strong>{req.approvedBy || 'แอดมิน'}</strong></span>
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
                          <div className="flex items-center gap-1.5 self-start">
                            {/* Admin Review Action Buttons */}
                            {isAdmin && activeTab === 'admin' && req.status === 'pending' && !isReviewingThis && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleReviewAction(req.id, 'approved')}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
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
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-bold border border-rose-300 dark:border-rose-800 transition flex items-center gap-1 cursor-pointer"
                                  title="พิจารณาหรือไม่อนุมัติ"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  ไม่อนุมัติ / บันทึก
                                </button>
                              </div>
                            )}

                            {/* ลบคำขอ (ถ้าเป็นของตัวเองและยังรออนุมัติ หรือแอดมิน) */}
                            {(isAdmin || (isMyOwn && req.status === 'pending')) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteRequest(req.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                title="ลบคำขอ OT นี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Admin Detailed Review Box (เมื่อกดปุ่มไม่อนุมัติ / บันทึกหมายเหตุ) */}
                        {isReviewingThis && (
                          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 animate-in fade-in">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                              หมายเหตุการพิจารณา (ตัวเลือก):
                            </label>
                            <input
                              type="text"
                              value={adminComment}
                              onChange={(e) => setAdminComment(e.target.value)}
                              placeholder="ระบุเหตุผลที่ไม่อนุมัติ หรือหมายเหตุถึงพนักงาน..."
                              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 mb-2 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setReviewingId(null)}
                                className="px-3 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                ยกเลิก
                              </button>
                              <button
                                type="button"
                                disabled={isReviewing}
                                onClick={() => handleReviewAction(req.id, 'rejected')}
                                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                              >
                                ยืนยันไม่อนุมัติ
                              </button>
                              <button
                                type="button"
                                disabled={isReviewing}
                                onClick={() => handleReviewAction(req.id, 'approved')}
                                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                              >
                                ยืนยันอนุมัติพร้อมบันทึก
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
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-500" />
            <span>Thaiplus: ตัดรอบ OT ทุกวันที่ 25 ของเดือน (นับ 26 เดือนก่อนหน้า ถึง 25 เดือนปัจจุบัน)</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-semibold transition cursor-pointer"
          >
            ปิด
          </button>
        </div>

      </div>
    </div>
  );
}
