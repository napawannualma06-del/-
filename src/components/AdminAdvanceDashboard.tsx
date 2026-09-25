import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { AdvanceRequest, AdvanceStatus } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  Banknote, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Check, 
  X, 
  Trash2, 
  Users, 
  CalendarCheck, 
  Coins, 
  Plus, 
  Upload, 
  Eye, 
  CreditCard, 
  FileCheck,
  AlertCircle,
  Download,
  ShieldCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { getOTCycleFromDate, getAvailableOTCycles, OTCycleInfo } from '../lib/otUtils';
import { compressSlipImage, exportAdvanceToExcelCsv } from '../lib/advanceUtils';

const STATUS_CONFIG: Record<
  AdvanceStatus, 
  { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: 'รออนุมัติ / รอโอน',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    icon: Clock,
  },
  approved: {
    label: 'อนุมัติ / โอนแล้ว',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'ไม่อนุมัติ',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    icon: XCircle,
  },
};

export function AdminAdvanceDashboard() {
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

  const [requests, setRequests] = useState<AdvanceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'all' | AdvanceStatus>('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Admin Review / Attach Slip State
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [adminSlipData, setAdminSlipData] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const adminFileInputRef = useRef<HTMLInputElement | null>(null);

  // Lightbox View for Slips
  const [viewingSlipUrl, setViewingSlipUrl] = useState<{ url: string; title: string } | null>(null);

  // Real-time listener for all advance requests
  useEffect(() => {
    const q = query(collection(db, 'advance_requests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: AdvanceRequest[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as Omit<AdvanceRequest, 'id'>) });
        });
        setRequests(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'advance_requests');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter requests by cycle period (26th prev month to 25th current month)
  const cycleRequests = useMemo(() => {
    return requests.filter((r) => {
      const reqCycle = r.cyclePeriod || getOTCycleFromDate(r.requestDate).cycleKey;
      return reqCycle === selectedCycleKey;
    });
  }, [requests, selectedCycleKey]);

  // Aggregate stats per employee for the selected cycle
  const employeeAdvanceSummary = useMemo(() => {
    const map = new Map<string, {
      employeeId: string;
      name: string;
      username?: string;
      avatarEmoji?: string;
      approvedAmount: number;
      pendingAmount: number;
      rejectedAmount: number;
      totalRequests: number;
      approvedCount: number;
      pendingCount: number;
      rejectedCount: number;
      requests: AdvanceRequest[];
    }>();

    cycleRequests.forEach((req) => {
      const key = req.employeeId || req.employeeUsername || req.employeeName;
      if (!map.has(key)) {
        map.set(key, {
          employeeId: req.employeeId,
          name: req.employeeName,
          username: req.employeeUsername,
          avatarEmoji: req.employeeAvatarEmoji,
          approvedAmount: 0,
          pendingAmount: 0,
          rejectedAmount: 0,
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

      const amt = Number(req.amount) || 0;
      if (req.status === 'approved') {
        item.approvedAmount += amt;
        item.approvedCount += 1;
      } else if (req.status === 'pending') {
        item.pendingAmount += amt;
        item.pendingCount += 1;
      } else if (req.status === 'rejected') {
        item.rejectedAmount += amt;
        item.rejectedCount += 1;
      }
    });

    // Sort by approved amount descending
    return Array.from(map.values()).sort((a, b) => b.approvedAmount - a.approvedAmount);
  }, [cycleRequests]);

  // Total summary overview
  const totalApprovedAmount = useMemo(() => {
    const sum = cycleRequests
      .filter((r) => r.status === 'approved')
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [cycleRequests]);

  const totalPendingAmount = useMemo(() => {
    const sum = cycleRequests
      .filter((r) => r.status === 'pending')
      .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
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
        (r.bankName && r.bankName.toLowerCase().includes(q)) ||
        (r.accountNumber && r.accountNumber.includes(q)) ||
        (r.requestDate && r.requestDate.includes(q));

      return matchStatus && matchEmployee && matchSearch;
    });
  }, [cycleRequests, statusFilter, selectedEmployeeFilter, searchQuery]);

  // Handle file select for Admin Slip Attachment
  const handleAdminSlipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await compressSlipImage(file, 1000, 1400, 0.75);
      setAdminSlipData({ dataUrl: res.dataUrl, fileName: res.fileName });
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการโหลดรูปภาพ');
    } finally {
      if (adminFileInputRef.current) adminFileInputRef.current.value = '';
    }
  };

  // Admin Approve / Reject action (requires slip when approving)
  const handleReviewAction = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!isAdmin || !user) return;

    // หากเป็นการอนุมัติ ต้องบังคับแนบสลิปการโอนเงิน
    const targetReq = requests.find((r) => r.id === requestId);
    const hasExistingSlip = !!targetReq?.slipUrl;
    if (status === 'approved' && !adminSlipData && !hasExistingSlip) {
      alert('⚠️ หากอนุมัติคำขอ ต้องแนบสลิปหลักฐานการโอนเงินด้วยค่ะ กรุณาคลิกเลือกรูปภาพสลิปก่อนกดยืนยันอนุมัติ');
      return;
    }

    setIsReviewing(true);

    try {
      const reqRef = doc(db, 'advance_requests', requestId);
      const updatePayload: any = {
        status,
        approvedBy: user.name || 'แอดมิน',
        approvedById: user.uid,
        reviewedAt: Date.now(),
        adminComment: adminComment.trim() || null,
        updatedAt: Date.now(),
      };

      if (adminSlipData) {
        updatePayload.slipUrl = adminSlipData.dataUrl;
        updatePayload.slipFileName = adminSlipData.fileName;
        updatePayload.slipUploadedAt = Date.now();
        updatePayload.slipUploadedBy = user.name || 'แอดมิน';
      }

      await updateDoc(reqRef, updatePayload);

      setReviewingId(null);
      setAdminComment('');
      setAdminSlipData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `advance_requests/${requestId}`);
      alert('เกิดข้อผิดพลาดในการบันทึกผลการพิจารณาค่ะ');
    } finally {
      setIsReviewing(false);
    }
  };

  // Attach slip only
  const handleAttachSlipOnly = async (requestId: string) => {
    if (!adminSlipData || !user) return;
    setIsReviewing(true);

    try {
      const reqRef = doc(db, 'advance_requests', requestId);
      await updateDoc(reqRef, {
        slipUrl: adminSlipData.dataUrl,
        slipFileName: adminSlipData.fileName,
        slipUploadedAt: Date.now(),
        slipUploadedBy: user.name || 'แอดมิน',
        updatedAt: Date.now(),
      });

      alert('แนบสลิปเรียบร้อยแล้วค่ะ');
      setReviewingId(null);
      setAdminSlipData(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `advance_requests/${requestId}`);
      alert('ไม่สามารถบันทึกสลิปได้');
    } finally {
      setIsReviewing(false);
    }
  };

  // Delete Request
  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm('คุณต้องการลบรายการขอเบิกเงินแอดวานซ์นี้ใช่หรือไม่?')) return;

    try {
      await deleteDoc(doc(db, 'advance_requests', requestId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `advance_requests/${requestId}`);
      alert('ไม่สามารถลบรายการได้ค่ะ');
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (cycleRequests.length === 0) {
      alert(`ไม่พบข้อมูลการขอเบิกเงินแอดวานซ์ใน ${selectedCycleInfo.cycleLabel} ค่ะ`);
      return;
    }
    exportAdvanceToExcelCsv(cycleRequests, selectedCycleInfo, 'สรุปยอด_ขอเบิกแอดวานซ์_ทุกคน_Thaiplus');
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card with Cycle Selector and Quick Stats */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-xs border border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <Banknote className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                แดชบอร์ดเบิกเงินแอดวานซ์ พนักงานทุกคน (ภาพรวมแอดมิน)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              ตรวจสอบคำขอเบิกเงินแอดวานซ์ ตรวจสอบบัญชี โอนเงิน แนบสลิปหลักฐาน และส่งออก Excel (ตัดรอบทุกวันที่ 25)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Cycle Selector */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-2xs">
              <CalendarCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
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
              title="ส่งออกสรุปยอดขอเบิกเงินแอดวานซ์พนักงานทุกคนเป็นไฟล์ Excel CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ดาวน์โหลด Excel</span>
            </button>

            {/* Quick Open Advance Form Modal */}
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-advance-modal', { detail: { tab: 'new' } }));
              }}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-xs active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>เปิดฟอร์มขอเบิก</span>
            </button>
          </div>
        </div>

        {/* 4 Overview Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-200 dark:border-emerald-900/60">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-bold">
              <span>ยอดเงินอนุมัติแล้ว</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-emerald-950 dark:text-white">
              {totalApprovedAmount.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {selectedCycleInfo.cycleLabel}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-200 dark:border-amber-900/60">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-bold">
              <span>รอแอดมินอนุมัติ/โอน</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-amber-950 dark:text-amber-200">
              {totalPendingAmount.toLocaleString()} <span className="text-xs font-normal text-slate-400">บาท</span>
            </div>
            <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
              {totalPendingRequests} คำขอที่ต้องดำเนินการ
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-bold">
              <span>พนักงานที่ขอเบิก</span>
              <Users className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              {employeeAdvanceSummary.length} <span className="text-xs font-normal text-slate-400">คน</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              รวม {cycleRequests.length} รายการคำขอ
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs font-bold">
              <span>รอบการคำนวณ</span>
              <CalendarCheck className="w-4 h-4 text-teal-500" />
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

      {/* SECTION 1: EMPLOYEE ADVANCE SUMMARY CARDS (สรุปยอดรายบุคคล) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              สรุปยอดขอเบิกเงินแอดวานซ์ รายบุคคลในรอบนี้ (ตัดรอบ 25)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              คลิกที่การ์ดพนักงานเพื่อกรองดูรายการคำขอทั้งหมดของคนนั้น
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
            {employeeAdvanceSummary.length} พนักงาน
          </span>
        </div>

        {employeeAdvanceSummary.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            ยังไม่มีข้อมูลคำขอเบิกเงินแอดวานซ์ในรอบ {selectedCycleInfo.cycleLabel}
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {employeeAdvanceSummary.map((emp, idx) => {
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
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20"
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
                      <div className="text-base font-black text-emerald-600 dark:text-emerald-400 leading-tight">
                        {emp.approvedAmount.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">บาท</span>
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

      {/* SECTION 2: ALL ADVANCE REQUESTS DETAILED TABLE (รายการคำขอทั้งหมด) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              รายการขอเบิกเงินแอดวานซ์ทั้งหมด ({filteredRequests.length} รายการ)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              แอดมินสามารถกดอนุมัติ ปฏิเสธ หรือแนบสลิปโอนเงินได้ทันที
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              {[
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'pending', label: 'รออนุมัติ' },
                { id: 'approved', label: 'อนุมัติ/โอนแล้ว' },
                { id: 'rejected', label: 'ไม่อนุมัติ' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatusFilter(s.id as any)}
                  className={clsx(
                    "px-2.5 py-1 rounded-lg font-medium transition cursor-pointer",
                    statusFilter === s.id
                      ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 font-bold shadow-2xs"
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
                className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
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
                placeholder="ค้นหาชื่อ, บัญชี, เหตุผล..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
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
            กำลังโหลดข้อมูลคำขอเบิกเงิน...
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            ไม่พบรายการคำขอเบิกเงินแอดวานซ์ตามเงื่อนไขที่เลือก
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
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    
                    {/* Left: Info */}
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

                        {/* Amount & Date */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-600 dark:text-slate-300">
                          <div className="text-base font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <span>{req.amount.toLocaleString()}</span>
                            <span className="text-xs font-normal text-slate-400">บาท</span>
                          </div>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            วันที่ขอ: {req.requestDate}
                          </span>
                        </div>

                        {/* Bank info */}
                        {(req.bankName || req.accountNumber) && (
                          <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-lg border border-slate-200/50 dark:border-slate-800 inline-flex">
                            <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{req.bankName}</span>
                            {req.accountNumber && (
                              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                เลขที่ {req.accountNumber}
                              </span>
                            )}
                            {req.accountName && (
                              <span className="text-slate-500 dark:text-slate-400">
                                ({req.accountName})
                              </span>
                            )}
                          </div>
                        )}

                        {/* Reason */}
                        <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
                          <span className="font-semibold text-slate-400 block text-[10px]">
                            เหตุผลการขอเบิก:
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

                    {/* Right: Slip and Admin Actions */}
                    <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end gap-3 shrink-0">
                      
                      {/* Slip preview thumbnail */}
                      {req.slipUrl ? (
                        <div className="flex items-center gap-2 p-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                          <img
                            src={req.slipUrl}
                            alt="Slip"
                            className="w-12 h-12 object-cover rounded-lg border border-emerald-300 dark:border-emerald-700 cursor-pointer hover:opacity-90"
                            onClick={() => setViewingSlipUrl({ url: req.slipUrl!, title: `สลิปโอนเงิน ${req.employeeName} (${req.amount.toLocaleString()} บาท)` })}
                          />
                          <div className="text-left pr-1">
                            <div className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                              <FileCheck className="w-3 h-3 text-emerald-600" />
                              <span>แนบสลิปแล้ว</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setViewingSlipUrl({ url: req.slipUrl!, title: `สลิปโอนเงิน ${req.employeeName} (${req.amount.toLocaleString()} บาท)` })}
                              className="text-[10px] text-emerald-600 dark:text-emerald-400 underline font-medium cursor-pointer"
                            >
                              ดูสลิปขนาดเต็ม
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>ยังไม่มีสลิป</span>
                        </span>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5">
                        {isAdmin && !isReviewingThis && (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingId(req.id);
                              setAdminComment(req.adminComment || '');
                              setAdminSlipData(null);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>{req.status === 'pending' ? 'พิจารณา & แนบสลิป' : 'แก้ไขผล / เพิ่มสลิป'}</span>
                          </button>
                        )}

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
                  </div>

                  {/* Inline Admin Review & Slip Attachment Panel */}
                  {isReviewingThis && isAdmin && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 p-4 rounded-xl space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>แอดมินพิจารณาคำขอ & แนบสลิปโอนเงิน</span>
                        </h4>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewingId(null);
                            setAdminSlipData(null);
                          }}
                          className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          ปิด
                        </button>
                      </div>

                      {/* Slip File Upload */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          แนบสลิปการโอนเงิน (สลิปธนาคาร):
                        </label>
                        
                        {adminSlipData ? (
                          <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900 border border-emerald-300 rounded-xl">
                            <div className="flex items-center gap-2">
                              <img
                                src={adminSlipData.dataUrl}
                                alt="Slip preview"
                                className="w-10 h-10 object-cover rounded-lg border"
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 dark:text-white block truncate">
                                  {adminSlipData.fileName}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-semibold">
                                  พร้อมแนบเป็นหลักฐานการโอน
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAdminSlipData(null)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <input
                              ref={adminFileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleAdminSlipChange}
                              className="hidden"
                              id={`admin-dashboard-slip-${req.id}`}
                            />
                            <label
                              htmlFor={`admin-dashboard-slip-${req.id}`}
                              className="w-full py-2.5 px-3 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-xl text-xs text-slate-600 dark:text-slate-400 flex items-center justify-center gap-2 cursor-pointer bg-white dark:bg-slate-900"
                            >
                              <Upload className="w-4 h-4 text-emerald-600" />
                              <span>คลิกเพื่อแนบสลิปโอนเงิน (JPG, PNG)</span>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Comment */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          หมายเหตุการพิจารณา / ข้อความถึงพนักงาน:
                        </label>
                        <input
                          type="text"
                          value={adminComment}
                          onChange={(e) => setAdminComment(e.target.value)}
                          placeholder="เช่น โอนเข้าบัญชีเรียบร้อยแล้ว, หักคืนในรอบเงินเดือน 25 ก.ย...."
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          {adminSlipData && req.status === 'approved' && (
                            <button
                              type="button"
                              disabled={isReviewing}
                              onClick={() => handleAttachSlipOnly(req.id)}
                              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
                            >
                              บันทึกแนบสลิปอย่างเดียว
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setReviewingId(null)}
                            className="px-3 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            disabled={isReviewing}
                            onClick={() => handleReviewAction(req.id, 'rejected')}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                          >
                            ไม่อนุมัติ
                          </button>
                          <button
                            type="button"
                            disabled={isReviewing}
                            onClick={() => handleReviewAction(req.id, 'approved')}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>อนุมัติ & บันทึกการโอน</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* LIGHTBOX MODAL FOR VIEWING SLIP FULLSCREEN */}
      {viewingSlipUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {viewingSlipUrl.title}
              </h3>
              <button
                type="button"
                onClick={() => setViewingSlipUrl(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950/20">
              <img
                src={viewingSlipUrl.url}
                alt="Full Slip"
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-lg border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end">
              <a
                href={viewingSlipUrl.url}
                download="advance_slip.jpg"
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลดรูปสลิป</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
