import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { AdvanceRequest, AdvanceStatus } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  Banknote, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
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
  ShieldCheck, 
  Upload, 
  Image as ImageIcon, 
  Eye, 
  CreditCard, 
  Coins, 
  Receipt,
  FileCheck,
  TrendingDown
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { getOTCycleFromDate, getAvailableOTCycles, OTCycleInfo } from '../lib/otUtils';
import { compressSlipImage, exportAdvanceToExcelCsv } from '../lib/advanceUtils';

interface AdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'my' | 'admin' | 'new';
}

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

const COMMON_BANKS = [
  'กสิกรไทย (KBANK)',
  'ไทยพาณิชย์ (SCB)',
  'กรุงเทพ (BBL)',
  'กรุงไทย (KTB)',
  'กรุงศรีอยุธยา (BAY)',
  'ทีทีบี (TTB)',
  'ออมสิน (GSB)',
  'ธ.ก.ส. (BAAC)',
  'พร้อมเพย์ (PromptPay)'
];

export function AdvanceModal({ isOpen, onClose, defaultTab = 'my' }: AdvanceModalProps) {
  const { user } = useStore();
  const isAdmin = isUserAdmin(user);

  // Tabs
  const [activeTab, setActiveTab] = useState<'my' | 'admin' | 'new'>(defaultTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  // Billing Cycle (Cutoff on the 25th of month)
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

  // Form State: ขอเบิกเงินแอดวานซ์
  const [amountStr, setAmountStr] = useState('');
  const [requestDate, setRequestDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('');
  const [bankName, setBankName] = useState(COMMON_BANKS[0]);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Search & Filter
  const [statusFilter, setStatusFilter] = useState<'all' | AdvanceStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Admin Review / Attach Slip Modal & State
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [adminSlipData, setAdminSlipData] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [isCompressingSlip, setIsCompressingSlip] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const adminFileInputRef = useRef<HTMLInputElement | null>(null);

  // Lightbox View for Slips
  const [viewingSlipUrl, setViewingSlipUrl] = useState<{ url: string; title: string } | null>(null);

  // Subscribe to advance_requests collection
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
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
  }, [isOpen]);

  // Handle file select for Admin Slip Attachment
  const handleAdminSlipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingSlip(true);
      const res = await compressSlipImage(file, 1000, 1400, 0.75);
      setAdminSlipData({ dataUrl: res.dataUrl, fileName: res.fileName });
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการโหลดรูปภาพ');
    } finally {
      setIsCompressingSlip(false);
      if (adminFileInputRef.current) adminFileInputRef.current.value = '';
    }
  };

  // Submit Form: ขอยื่นเบิกเงินแอดวานซ์ (ไม่มีแนบสลิปตอนยื่น)
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('กรุณาเข้าสู่ระบบก่อนทำรายการค่ะ');
      return;
    }

    const amountNum = parseFloat(amountStr);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('กรุณาระบุจำนวนเงินที่ถูกต้อง (มากกว่า 0 บาท) ค่ะ');
      return;
    }

    if (!requestDate) {
      alert('กรุณาระบุวันที่ต้องการเบิกค่ะ');
      return;
    }

    if (!reason.trim()) {
      alert('กรุณาระบุเหตุผลหรือวัตถุประสงค์ในการขอเบิกเงินค่ะ');
      return;
    }

    setIsSubmitting(true);
    try {
      const cycleInfo = getOTCycleFromDate(requestDate);
      const newAdvance: any = {
        employeeId: user.uid,
        employeeName: user.name || 'พนักงาน',
        amount: Math.round(amountNum * 100) / 100,
        requestDate,
        reason: reason.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim() || null,
        accountName: accountName.trim() || user.name || null,
        status: 'pending',
        cyclePeriod: cycleInfo.cycleKey,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (user.username) newAdvance.employeeUsername = user.username;
      if (user.avatarEmoji) newAdvance.employeeAvatarEmoji = user.avatarEmoji;

      await addDoc(collection(db, 'advance_requests'), newAdvance);

      // Audit log activity
      try {
        const actData: any = {
          type: 'request_advance',
          actorId: user.uid,
          actorName: user.name || 'พนักงาน',
          description: `ยื่นขอเบิกเงินแอดวานซ์ ${amountNum.toLocaleString()} บาท (รอบ 25) - "${reason.trim().slice(0, 30)}"`,
          timestamp: Date.now(),
        };
        if (user.avatarEmoji) actData.actorAvatarEmoji = user.avatarEmoji;
        await addDoc(collection(db, 'activities'), actData);
      } catch (err) {
        console.warn('Could not record activity:', err);
      }

      setSubmitSuccess(true);
      setAmountStr('');
      setReason('');
      setAccountNumber('');
      setAccountName('');

      setTimeout(() => {
        setSubmitSuccess(false);
        setActiveTab('my');
      }, 1500);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'advance_requests');
      alert('เกิดข้อผิดพลาดในการบันทึกคำขอ: ' + (error instanceof Error ? error.message : 'กรุณาลองใหม่อีกครั้งค่ะ'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin Approve / Reject / Attach Slip Action
  const handleReviewAction = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!isAdmin || !user) return;

    // หากเป็นการอนุมัติ ต้องบังคับเพิ่มสลิปการโอนเงิน
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

      // Audit activity
      try {
        await addDoc(collection(db, 'activities'), {
          type: status === 'approved' ? 'approve_advance' : 'reject_advance',
          actorId: user.uid,
          actorName: user.name || 'แอดมิน',
          description: `${status === 'approved' ? 'อนุมัติ/โอนเงินแอดวานซ์' : 'ไม่อนุมัติแอดวานซ์'} ของ ${targetReq?.employeeName || 'พนักงาน'} (${targetReq?.amount.toLocaleString() || 0} บาท)${adminSlipData ? ' พร้อมแนบสลิป' : ''}`,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn('Could not record activity:', err);
      }

      setReviewingId(null);
      setAdminComment('');
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

  // Attach / Update Slip directly on an existing request (e.g. upload after transferred)
  const handleAttachSlipOnly = async (requestId: string) => {
    if (!adminSlipData || !user) return;
    setIsReviewing(true);

    try {
      const reqRef = doc(db, 'advance_requests', requestId);
      await updateDoc(reqRef, {
        slipUrl: adminSlipData.dataUrl,
        slipFileName: adminSlipData.fileName,
        slipUploadedAt: Date.now(),
        slipUploadedBy: user.name || (isAdmin ? 'แอดมิน' : 'พนักงาน'),
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

  // Filter requests based on selected cycle and user identity
  const myRequests = useMemo(() => {
    if (!user) return [];
    const currentUid = (user.uid || '').toLowerCase();
    const currentUsername = (user.username || '').toLowerCase();
    const currentName = (user.name || '').toLowerCase();

    return requests.filter((r) => {
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
    return requests.filter((r) => {
      const reqCycle = r.cyclePeriod || getOTCycleFromDate(r.requestDate).cycleKey;
      return reqCycle === selectedCycleKey;
    });
  }, [requests, selectedCycleKey]);

  const cycleFilteredMyRequests = useMemo(() => {
    return myRequests.filter((r) => {
      const reqCycle = r.cyclePeriod || getOTCycleFromDate(r.requestDate).cycleKey;
      return reqCycle === selectedCycleKey;
    });
  }, [myRequests, selectedCycleKey]);

  // Total summary for current cycle
  const cycleSummary = useMemo(() => {
    const list = isAdmin && activeTab === 'admin' ? cycleFilteredRequests : cycleFilteredMyRequests;
    const totalApprovedAmount = list
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalPendingAmount = list
      .filter((r) => r.status === 'pending')
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalRequestsCount = list.length;
    const pendingCount = list.filter((r) => r.status === 'pending').length;

    return {
      totalApprovedAmount: Math.round(totalApprovedAmount * 100) / 100,
      totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
      totalRequestsCount,
      pendingCount,
    };
  }, [isAdmin, activeTab, cycleFilteredRequests, cycleFilteredMyRequests]);

  // Filtered list to display in table/cards
  const displayRequests = useMemo(() => {
    const baseList = isAdmin && activeTab === 'admin' ? cycleFilteredRequests : cycleFilteredMyRequests;

    return baseList.filter((r) => {
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        q === '' ||
        (r.employeeName && r.employeeName.toLowerCase().includes(q)) ||
        (r.employeeUsername && r.employeeUsername.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        (r.bankName && r.bankName.toLowerCase().includes(q)) ||
        (r.accountNumber && r.accountNumber.includes(q)) ||
        (r.requestDate && r.requestDate.includes(q));

      return matchStatus && matchSearch;
    });
  }, [isAdmin, activeTab, cycleFilteredRequests, cycleFilteredMyRequests, statusFilter, searchQuery]);

  // Export to Excel
  const handleExportExcel = () => {
    const targetList = isAdmin && activeTab === 'admin' ? cycleFilteredRequests : cycleFilteredMyRequests;
    if (targetList.length === 0) {
      alert(`ไม่พบข้อมูลการขอเบิกเงินแอดวานซ์ใน ${selectedCycleInfo.cycleLabel} ค่ะ`);
      return;
    }
    const prefix = isAdmin && activeTab === 'admin' ? 'สรุปยอด_ขอเบิกแอดวานซ์_ทุกคน' : `สรุปยอด_แอดวานซ์_${user?.name || 'พนักงาน'}`;
    exportAdvanceToExcelCsv(targetList, selectedCycleInfo, prefix);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header Bar */}
        <div className="px-4 sm:px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15 backdrop-blur-xs shadow-inner">
              <Banknote className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  ระบบขอเบิกเงินแอดวานซ์ (Advance Payment)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-emerald-100">
                  ตัดรอบ 25
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/90 hidden sm:block">
                พนักงานยื่นขอเบิกเงินล่วงหน้า แอดมินตรวจสอบ โอนเงิน และแนบสลิปหลักฐาน
              </p>
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
                  ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <User className="w-3.5 h-3.5" />
              <span>แอดวานซ์ของฉัน</span>
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
                  ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>กรอกฟอร์มขอเบิก</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer relative",
                  activeTab === 'admin'
                    ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                <span>แอดมินตรวจอนุมัติ & แนบสลิป</span>
                {requests.filter((r) => r.status === 'pending').length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-2xs animate-pulse">
                    {requests.filter((r) => r.status === 'pending').length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Right Controls: รอบบิลตัดยอด & ปุ่มดาวน์โหลด Excel */}
          <div className="flex items-center gap-2">
            {/* Cycle Selector */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-xl shadow-2xs text-xs">
              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 leading-none">รอบตัดยอด (26 - 25)</span>
                <select
                  value={selectedCycleKey}
                  onChange={(e) => setSelectedCycleKey(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
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
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
              title="ดาวน์โหลดสรุปยอดเป็นไฟล์ Excel CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        </div>

        {/* Cycle Overview Banner */}
        <div className="px-4 sm:px-6 py-2 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/40 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-emerald-600" />
              สรุปงวด {selectedCycleInfo.cycleLabel}:
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              ({selectedCycleInfo.periodLabel})
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 font-semibold">
            <div className="flex items-center gap-1">
              <span className="text-slate-500 dark:text-slate-400">อนุมัติแล้ว:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {cycleSummary.totalApprovedAmount.toLocaleString()} บาท
              </span>
            </div>
            {cycleSummary.pendingCount > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-slate-500 dark:text-slate-400">รออนุมัติ:</span>
                <span className="text-amber-600 dark:text-amber-400 font-bold">
                  {cycleSummary.totalPendingAmount.toLocaleString()} บาท ({cycleSummary.pendingCount} คำขอ)
                </span>
              </div>
            )}
            <div className="text-slate-400">
              รวม {cycleSummary.totalRequestsCount} คำขอ
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* TAB 1: NEW ADVANCE FORM (แบบฟอร์มขอเบิกเงินแอดวานซ์) */}
          {activeTab === 'new' && (
            <div className="max-w-2xl mx-auto">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      แบบฟอร์มขอเบิกเงินแอดวานซ์ (ล่วงหน้า)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      กรอกยอดเงินและรายละเอียดการโอน ระบบจะคำนวณตัดรอบวันที่ 25 ให้อัตโนมัติ
                    </p>
                  </div>
                </div>

                {submitSuccess && (
                  <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-semibold animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>บันทึกการขอเบิกเงินสำเร็จแล้ว! แอดมินจะดำเนินการตรวจสอบและโอนเงินให้ค่ะ</span>
                  </div>
                )}

                <form onSubmit={handleSubmitRequest} className="space-y-4">
                  {/* Current User Info */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs">
                    <div className="flex items-center gap-2">
                      <AnimalAvatar
                        avatarEmoji={user?.avatarEmoji}
                        identifier={user?.username || user?.uid || 'user'}
                        name={user?.name || 'พนักงาน'}
                        size="sm"
                      />
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {user?.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          @{user?.username || 'member'} • ผู้ขอเบิก
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900">
                      {user?.role === 'admin' ? 'แอดมิน' : 'พนักงาน'}
                    </span>
                  </div>

                  {/* ยอดเงินขอเบิก & วันที่ขอเบิก */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        ยอดเงินที่ต้องการขอเบิก (บาท) <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="1"
                          max="1000000"
                          placeholder="เช่น 1000, 2500"
                          value={amountStr}
                          onChange={(e) => setAmountStr(e.target.value)}
                          className="w-full pl-8 pr-12 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-emerald-700 dark:text-emerald-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                          required
                        />
                        <Coins className="w-4 h-4 text-emerald-600 absolute left-2.5 top-2.5" />
                        <span className="absolute right-3 top-2.5 text-xs font-medium text-slate-400">
                          บาท
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        วันที่ขอเบิก <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={requestDate}
                        onChange={(e) => setRequestDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                      {requestDate && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                          <CalendarCheck className="w-3 h-3" />
                          <span>จะถูกนับใน: <strong>{getOTCycleFromDate(requestDate).cycleLabel}</strong> ({getOTCycleFromDate(requestDate).periodLabel})</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ช่องทางการรับเงิน (ธนาคาร, เลขที่บัญชี, ชื่อบัญชี) */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                      <CreditCard className="w-4 h-4 text-indigo-500" />
                      <span>ข้อมูลบัญชีธนาคารสำหรับโอนเงิน</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          ธนาคาร
                        </label>
                        <select
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                        >
                          {COMMON_BANKS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          เลขที่บัญชี / พร้อมเพย์
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น 123-4-56789-0"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          ชื่อบัญชี
                        </label>
                        <input
                          type="text"
                          placeholder={user?.name || 'ชื่อเจ้าของบัญชี'}
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* เหตุผลการขอเบิก */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      เหตุผลหรือวัตถุประสงค์ในการขอเบิก <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="ระบุเหตุผล เช่น ค่าเดินทางไปพบลูกค้า, ค่าอะไหล่สำรองด่วน, ค่าใช้จ่ายฉุกเฉิน..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || isCompressingSlip}
                      className={clsx(
                        "w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-98",
                        isSubmitting || isCompressingSlip
                          ? "bg-emerald-400 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                      )}
                    >
                      {isSubmitting ? (
                        <>กำลังบันทึกข้อมูล...</>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>ส่งคำขอเบิกเงินแอดวานซ์</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2 & 3: LISTINGS (OT ของฉัน & แอดมินตรวจอนุมัติ) */}
          {(activeTab === 'my' || activeTab === 'admin') && (
            <div className="space-y-4">
              
              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2">
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

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อ, วันที่, เหตุผล, บัญชี..."
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

              {/* Requests List */}
              {loading ? (
                <div className="py-16 text-center text-slate-400">
                  กำลังโหลดข้อมูลคำขอเบิกเงิน...
                </div>
              ) : displayRequests.length === 0 ? (
                <div className="py-16 text-center text-slate-400 dark:text-slate-500">
                  <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-semibold">
                    {activeTab === 'my' ? 'คุณยังไม่มีรายการขอเบิกเงินในรอบนี้' : 'ไม่พบรายการคำขอเบิกเงิน'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedCycleInfo.cycleLabel} ({selectedCycleInfo.periodLabel})
                  </p>
                  {activeTab === 'my' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('new')}
                      className="mt-3 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer hover:bg-emerald-700"
                    >
                      <Plus className="w-4 h-4" />
                      <span>กรอกฟอร์มขอเบิกเงิน</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                  {displayRequests.map((req) => {
                    const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                    const StatusIcon = statusCfg.icon;
                    const isReviewingThis = reviewingId === req.id;
                    const isOwner = user?.uid === req.employeeId || (user?.username && user.username === req.employeeUsername);

                    return (
                      <div
                        key={req.id}
                        className={clsx(
                          "p-4 sm:p-5 transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40",
                          req.status === 'pending' && "bg-amber-50/20 dark:bg-amber-950/10"
                        )}
                      >
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          
                          {/* Left: Employee Info & Request details */}
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
                                <span
                                  className={clsx(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1",
                                    statusCfg.badgeClass
                                  )}
                                >
                                  <StatusIcon className="w-3 h-3" />
                                  {statusCfg.label}
                                </span>
                              </div>

                              {/* Amount & Date */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                                <div className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                  <span>{req.amount.toLocaleString()}</span>
                                  <span className="text-xs font-normal text-slate-400">บาท</span>
                                </div>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  วันที่ขอ: {req.requestDate}
                                </span>
                              </div>

                              {/* Bank Details */}
                              {(req.bankName || req.accountNumber) && (
                                <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-200/50 dark:border-slate-800 inline-flex">
                                  <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>{req.bankName || 'ธนาคาร'}</span>
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
                              <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
                                <span className="font-semibold text-slate-400 block text-[10px]">
                                  เหตุผลการขอเบิก:
                                </span>
                                <p className="mt-0.5 whitespace-pre-wrap">{req.reason}</p>
                              </div>

                              {/* Review info & Admin note */}
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

                          {/* Right: Slip Attachment Thumbnail & Action Buttons */}
                          <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end gap-3 shrink-0">
                            
                            {/* Slip Image Badge / Preview */}
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
                                    คลิกดูสลิปขนาดเต็ม
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                <span>ยังไม่มีสลิป</span>
                              </span>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-1.5">
                              {/* Admin Approve / Review Button */}
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
                                  <span>{req.status === 'pending' ? 'ตรวจอนุมัติ & แนบสลิป' : 'แก้ไขผล / เพิ่มสลิป'}</span>
                                </button>
                              )}

                              {/* Delete for Admin or pending creator */}
                              {(isAdmin || (isOwner && req.status === 'pending')) && (
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

                            {/* Slip File Upload in Review Panel */}
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
                                    id={`admin-slip-${req.id}`}
                                  />
                                  <label
                                    htmlFor={`admin-slip-${req.id}`}
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

                            {/* Action Buttons */}
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
          )}

        </div>
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
