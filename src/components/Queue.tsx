import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy,
  runTransaction 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore, isUserAdmin } from '../store/useStore';
import { 
  Clock, 
  CheckCircle2, 
  Search, 
  User, 
  Plus, 
  Check, 
  Trash2, 
  RefreshCw, 
  Bell, 
  Smartphone, 
  MapPin, 
  Send,
  Filter,
  Ban,
  RotateCcw,
  StickyNote,
  AlertCircle,
  FileText,
  FileSignature,
  Crown,
  ShieldCheck,
  UserCheck,
  ArrowRightLeft,
  Lock,
  X,
  Moon,
  LogOut,
  Building2,
  PauseCircle,
  ClockAlert,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Zap,
  Briefcase
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { findRefinanceRate, getForeignMachineMatchingRate, getRefurbishedMatchingRate, getPreviousLowerTierRate } from '../data/refinanceRates';
import { CreditCheckDutyStation } from './CreditCheckDutyStation';
import { SimpleEmployeeWorkload } from './SimpleEmployeeWorkload';
import { AnimalAvatar } from './AnimalAvatar';
import { ClockOutConfirmModal } from './ClockOutConfirmModal';
import { ReturnCaseModal } from './ReturnCaseModal';
import { TransferCaseModal } from './TransferCaseModal';
import { CloseCaseModal } from './CloseCaseModal';
import { HoldCaseModal } from './HoldCaseModal';
import { RecentActivityFeed } from './RecentActivityFeed';
import { AgentSelect, AgentManagerModal } from './AgentSelect';
import { getPreviousAssignee, isStuckCase, isNewCase, isInProgressCase } from '../lib/caseUtils';
import { DutyWorker, Case, UserProfile } from '../types';
import { logActivity } from '../lib/activityService';
import {
  getExpiredCases,
  autoCancelExpiredCases,
  isCaseOlderThan3Days,
  AUTO_CANCEL_REMARK
} from '../lib/autoCancelService';

export type { Case };
export { isStuckCase, isNewCase, isInProgressCase };

export const statusMap: Record<Case['status'], { label: string; badgeClass: string; borderClass: string; stepNumber: number }> = {
  pending: {
    label: 'เครดิตผ่าน (รอรับเคส)',
    badgeClass: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    borderClass: 'border-indigo-200 dark:border-indigo-800',
    stepNumber: 0,
  },
  credit_check: {
    label: 'กำลังทำเคส',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    borderClass: 'border-amber-200 dark:border-amber-800/60',
    stepNumber: 1,
  },
  processing: {
    label: 'กำลังทำเคส',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    borderClass: 'border-amber-200 dark:border-amber-800/60',
    stepNumber: 1,
  },
  closed: {
    label: 'จบเคสแล้ว',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    borderClass: 'border-emerald-200 dark:border-emerald-800/60',
    stepNumber: 2,
  },
  cancelled: {
    label: 'ยกเลิกเคส',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    borderClass: 'border-rose-200 dark:border-rose-800/60',
    stepNumber: -1,
  },
};

export const POPULAR_IPHONES = [
  'iPhone 17 Pro Max 2TB',
  'iPhone 17 Pro Max',
  'iPhone 17 Pro',
  'iPhone 17 Air',
  'iPhone 17',
  'iPhone 17e',
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 16 Plus',
  'iPhone 16',
  'iPhone 16e',
  'iPhone 15 Pro Max',
  'iPhone 15 Pro',
  'iPhone 15 Plus',
  'iPhone 15',
  'iPhone 14 Pro Max',
  'iPhone 14 Pro',
  'iPhone 14 Plus',
  'iPhone 14',
  'iPhone 13 Pro Max',
  'iPhone 13 Pro',
  'iPhone 13',
  'iPhone 13 mini',
  'iPhone 12 Pro Max',
  'iPhone 12 Pro',
  'iPhone 12',
  'iPhone 11 Pro Max',
  'iPhone 11 Pro',
  'iPhone 11',
  'iPhone SE (รุ่นที่ 3)',
];

// ครบทุก 77 จังหวัดทั่วประเทศไทย
export const POPULAR_PROVINCES = [
  'กรุงเทพมหานคร',
  'กระบี่',
  'กาญจนบุรี',
  'กาฬสินธุ์',
  'กำแพงเพชร',
  'ขอนแก่น',
  'จันทบุรี',
  'ฉะเชิงเทรา',
  'ชลบุรี',
  'ชัยนาท',
  'ชัยภูมิ',
  'ชุมพร',
  'เชียงราย',
  'เชียงใหม่',
  'ตรัง',
  'ตราด',
  'ตาก',
  'นครนายก',
  'นครปฐม',
  'นครพนม',
  'นครราชสีมา',
  'นครศรีธรรมราช',
  'นครสวรรค์',
  'นนทบุรี',
  'นราธิวาส',
  'น่าน',
  'บึงกาฬ',
  'บุรีรัมย์',
  'ปทุมธานี',
  'ประจวบคีรีขันธ์',
  'ปราจีนบุรี',
  'ปัตตานี',
  'พระนครศรีอยุธยา',
  'พะเยา',
  'พังงา',
  'พัทลุง',
  'พิจิตร',
  'พิษณุโลก',
  'เพชรบุรี',
  'เพชรบูรณ์',
  'แพร่',
  'ภูเก็ต',
  'มหาสารคาม',
  'มุกดาหาร',
  'แม่ฮ่องสอน',
  'ยโสธร',
  'ยะลา',
  'ร้อยเอ็ด',
  'ระนอง',
  'ระยอง',
  'ราชบุรี',
  'ลพบุรี',
  'ลำปาง',
  'ลำพูน',
  'เลย',
  'ศรีสะเกษ',
  'สกลนคร',
  'สงขลา',
  'สตูล',
  'สมุทรปราการ',
  'สมุทรสงคราม',
  'สมุทรสาคร',
  'สระแก้ว',
  'สระบุรี',
  'สิงห์บุรี',
  'สุโขทัย',
  'สุพรรณบุรี',
  'สุราษฎร์ธานี',
  'สุรินทร์',
  'หนองคาย',
  'หนองบัวลำภู',
  'อ่างทอง',
  'อำนาจเจริญ',
  'อุดรธานี',
  'อุตรดิตถ์',
  'อุทัยธานี',
  'อุบลราชธานี',
];

export const PRESET_REMARKS = [
  'รอลูกค้าส่งเอกสารเพิ่มเติม',
  'รอตรวจสอบประวัติเครดิต/บูโร',
  'รอลูกค้าโอนเงิน/ชำระเงินดาวน์',
  'ลูกค้าขอเปลี่ยนรุ่น / สี / ความจุ',
  'โทรหาลูกค้าไม่รับสาย / ติดต่อไม่ได้',
  'รอเช็คสต็อกสินค้าหน้าร้าน',
  'รอผู้จัดการอนุมัติเงื่อนไขพิเศษ',
  'ลูกค้านัดหมายเข้ารับเครื่องภายหลัง',
];

// Audio Notification Helper
function playNotificationChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.warn('Audio chime playback not supported or blocked by browser', e);
  }
}

export function Queue() {
  const { user, registeredUsers, clockIn } = useStore();
  const isAdmin = isUserAdmin(user);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'new' | 'pending' | 'in_progress' | 'stuck' | 'remarks' | 'mine' | 'closed' | 'cancelled'>('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string | null>(null);
  const [showQueueClockOutModal, setShowQueueClockOutModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode] = useState<'row' | 'compact' | 'card'>('compact');

  // Pagination State (แสดงสูงสุด 30 เคสต่อหน้า)
  const [currentPage, setCurrentPage] = useState(1);

  // เมื่อเปลี่ยนตัวกรองค้นหา หรือเปลี่ยนแท็บ ให้กลับไปหน้า 1 เสมอ
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, selectedEmployeeFilter, searchQuery]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showAgentManagerModal, setShowAgentManagerModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default');

  // Custom Task Modal State (For Admin to add task/job outside normal case intake)
  const [showCustomTaskModal, setShowCustomTaskModal] = useState(false);
  const [customTaskTitle, setCustomTaskTitle] = useState('');
  const [customTaskRemarks, setCustomTaskRemarks] = useState('');
  const [isSubmittingCustomTask, setIsSubmittingCustomTask] = useState(false);

  // Credit Check Duty State (Max 2 workers, only they + admin can create cases)
  const [isCreditChecker, setIsCreditChecker] = useState(false);
  const [dutyWorkers, setDutyWorkers] = useState<DutyWorker[]>([]);
  const canCreateCase = isAdmin || isCreditChecker;

  const handleDutyStatusChange = useCallback((isWorker: boolean, workers: DutyWorker[]) => {
    setIsCreditChecker(isWorker);
    setDutyWorkers(workers);
  }, []);

  // Form State
  const [formData, setFormData] = useState({
    agentName: '',
    iphoneModel: 'iPhone 17 Pro Max',
    province: 'กรุงเทพมหานคร',
    contractNumber: '',
    remarks: '',
  });

  // Remark Modal State
  const [activeRemarkCase, setActiveRemarkCase] = useState<Case | null>(null);
  const [remarkInput, setRemarkInput] = useState('');
  const [isSavingRemark, setIsSavingRemark] = useState(false);

  // Contract Modal State (Add/Edit contract at any time after acceptance)
  const [activeContractCase, setActiveContractCase] = useState<Case | null>(null);
  const [contractInput, setContractInput] = useState('');
  const [isSavingContract, setIsSavingContract] = useState(false);

  // Reassign & Return & Hold Case Modals
  const [activeReassignCase, setActiveReassignCase] = useState<Case | null>(null);
  const [activeReturnCase, setActiveReturnCase] = useState<Case | null>(null);
  const [activeCloseCase, setActiveCloseCase] = useState<Case | null>(null);
  const [activeHoldCase, setActiveHoldCase] = useState<Case | null>(null);

  const initialLoadRef = useRef(true);
  const [isCheckingAutoCancel, setIsCheckingAutoCancel] = useState(false);
  const [autoCancelToast, setAutoCancelToast] = useState<string | null>(null);
  const lastAutoCancelCheckRef = useRef<number>(0);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission);
    }

    const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData: Case[] = [];
      let hasNewPending = false;

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !initialLoadRef.current) {
          const addedData = change.doc.data() as Case;
          if (addedData.status === 'pending') {
            hasNewPending = true;
          }
        }
      });

      if (hasNewPending && !initialLoadRef.current) {
        playNotificationChime();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('มีเคสใหม่เข้ามาในคิว!', {
            body: 'มีเคสใหม่รอพนักงานกดรับงาน ตรวจสอบในหน้าคิวงานได้ทันที',
            icon: '/vite.svg',
          });
        }
      }

      snapshot.forEach((doc) => {
        casesData.push({ id: doc.id, ...doc.data() } as Case);
      });

      setCases(casesData);
      setLoading(false);
      initialLoadRef.current = false;

      // Auto-cancel check: only stuck cases & new cases older than 3 days (never cancel closed cases)
      const now = Date.now();
      if (now - lastAutoCancelCheckRef.current > 30000) {
        lastAutoCancelCheckRef.current = now;
        const expired = getExpiredCases(casesData, now, registeredUsers);
        if (expired.length > 0) {
          autoCancelExpiredCases(expired, 'auto', registeredUsers).catch((err) => {
            console.error('Error auto-cancelling expired cases:', err);
          });
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'cases');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [registeredUsers]);

  // Periodic check every 3 minutes for cases that cross 3 days
  useEffect(() => {
    const interval = setInterval(() => {
      const expired = getExpiredCases(cases, Date.now(), registeredUsers);
      if (expired.length > 0) {
        autoCancelExpiredCases(expired, 'auto', registeredUsers).catch((err) => {
          console.error('Periodic auto-cancel error:', err);
        });
      }
    }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [cases, registeredUsers]);

  // Manual trigger for checking and cancelling cases older than 3 days (stuck & new cases only)
  const handleManualAutoCancelCheck = async () => {
    setIsCheckingAutoCancel(true);
    try {
      const expired = getExpiredCases(cases, Date.now(), registeredUsers);
      if (expired.length === 0) {
        setAutoCancelToast('ไม่พบเคสค้างหรือเคสใหม่ที่อยู่เกิน 3 วัน (เคสจบแล้วจะไม่ถูกยกเลิก)');
        setTimeout(() => setAutoCancelToast(null), 4000);
        return;
      }
      const res = await autoCancelExpiredCases(expired, 'manual', registeredUsers);
      if (res.count > 0) {
        setAutoCancelToast(`ย้ายเคสค้าง/เคสใหม่ที่เกิน 3 วันไปยังสถานะยกเลิกแล้ว ${res.count} เคส`);
      } else {
        setAutoCancelToast('กำลังดำเนินการยกเลิกเคส...');
      }
      setTimeout(() => setAutoCancelToast(null), 5000);
    } catch (e) {
      console.error('Error in handleManualAutoCancelCheck:', e);
      setAutoCancelToast('เกิดข้อผิดพลาดในการตรวจสอบเคส');
      setTimeout(() => setAutoCancelToast(null), 4000);
    } finally {
      setIsCheckingAutoCancel(false);
    }
  };

  const requestNotification = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotificationStatus(perm);
      if (perm === 'granted') {
        playNotificationChime();
        new Notification('ระบบแจ้งเตือนคิวพนักงาน', {
          body: 'เปิดการแจ้งเตือนเคสใหม่เรียบร้อยแล้ว!',
        });
      }
    }
  };

  const handleOpenRemark = (c: Case) => {
    setActiveRemarkCase(c);
    setRemarkInput(c.remarks || '');
  };

  const handleSaveRemark = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRemarkCase) return;
    setIsSavingRemark(true);
    try {
      const caseRef = doc(db, 'cases', activeRemarkCase.id);
      const trimmed = remarkInput.trim();
      const updates: Record<string, unknown> = {
        updatedAt: Date.now(),
      };
      if (trimmed) {
        updates.remarks = trimmed;
        updates.remarksUpdatedAt = Date.now();
        updates.remarksUpdatedBy = user?.name || 'พนักงาน';
      } else {
        updates.remarks = '';
      }
      await updateDoc(caseRef, updates);
      setActiveRemarkCase(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${activeRemarkCase.id}`);
    } finally {
      setIsSavingRemark(false);
    }
  };

  const handleClearRemark = async () => {
    if (!activeRemarkCase) return;
    setIsSavingRemark(true);
    try {
      const caseRef = doc(db, 'cases', activeRemarkCase.id);
      await updateDoc(caseRef, {
        remarks: '',
        updatedAt: Date.now(),
      });
      setActiveRemarkCase(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${activeRemarkCase.id}`);
    } finally {
      setIsSavingRemark(false);
    }
  };

  // Contract Modal Handlers
  const handleOpenContract = (c: Case) => {
    setActiveContractCase(c);
    setContractInput(c.contractNumber || '');
  };

  const handleSaveContract = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeContractCase) return;
    setIsSavingContract(true);
    try {
      const caseRef = doc(db, 'cases', activeContractCase.id);
      const trimmed = contractInput.trim();
      const updates: Record<string, unknown> = {
        updatedAt: Date.now(),
      };
      if (trimmed) {
        updates.contractNumber = trimmed;
        updates.contractUpdatedAt = Date.now();
        updates.contractUpdatedBy = user?.name || 'พนักงาน';
      } else {
        updates.contractNumber = '';
      }
      await updateDoc(caseRef, updates);
      setActiveContractCase(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${activeContractCase.id}`);
    } finally {
      setIsSavingContract(false);
    }
  };

  const handleClearContract = async () => {
    if (!activeContractCase) return;
    setIsSavingContract(true);
    try {
      const caseRef = doc(db, 'cases', activeContractCase.id);
      await updateDoc(caseRef, {
        contractNumber: '',
        updatedAt: Date.now(),
      });
      setActiveContractCase(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${activeContractCase.id}`);
    } finally {
      setIsSavingContract(false);
    }
  };

  // Admin Specific Handlers
  const handleTakeOverCase = async (caseId: string) => {
    if (!user || !isAdmin) return;
    try {
      const caseRef = doc(db, 'cases', caseId);
      await updateDoc(caseRef, {
        assigneeId: user.uid,
        assigneeName: user.name,
        updatedAt: Date.now(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseId}`);
    }
  };

  const handleOpenReassign = (c: Case) => {
    setActiveReassignCase(c);
  };

  const handleOpenReturnToPending = (c: Case) => {
    setActiveReturnCase(c);
  };

  const handleAddCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agentName.trim() || !formData.iphoneModel || !formData.province) return;

    if (!canCreateCase) {
      alert('เฉพาะผู้ที่กำลังปฏิบัติหน้าที่ "งานเช็คเครดิต" (จำกัด 2 คน) หรือแอดมินเท่านั้นที่สามารถสร้างเคสได้\n\nกรุณากดปุ่ม "เข้าประจำเวรเช็คเครดิต" ด้านบนก่อนเปิดเคส');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const newCase: Record<string, unknown> = {
        agentName: formData.agentName.trim(),
        iphoneModel: formData.iphoneModel,
        province: formData.province,
        status: 'pending', // เครดิตผ่านทันที รอพนักงานกดรับไปทำเคส
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      if (formData.contractNumber.trim()) {
        newCase.contractNumber = formData.contractNumber.trim();
        newCase.contractUpdatedAt = Date.now();
        newCase.contractUpdatedBy = user?.name || 'พนักงาน';
      }

      if (formData.remarks.trim()) {
        newCase.remarks = formData.remarks.trim();
        newCase.remarksUpdatedAt = Date.now();
        newCase.remarksUpdatedBy = user?.name || 'พนักงาน';
      }

      const docRef = await addDoc(collection(db, 'cases'), newCase);
      logActivity({
        type: 'create_case',
        actorId: user?.uid || 'unknown',
        actorName: user?.name || 'พนักงาน',
        actorAvatarEmoji: user?.avatarEmoji,
        description: `เปิดเคสใหม่: ${formData.iphoneModel} (ตัวแทน: ${formData.agentName.trim()})`,
        caseId: docRef.id,
        iphoneModel: formData.iphoneModel,
      }).catch(console.error);

      setFormData({
        agentName: '',
        iphoneModel: 'iPhone 17 Pro Max',
        province: 'กรุงเทพมหานคร',
        contractNumber: '',
        remarks: '',
      });
      setShowAddForm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'cases');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptCase = async (caseId: string) => {
    if (!user) return;
    if (user.workStatus === 'off_work') {
      const confirmClockIn = window.confirm(
        'ขณะนี้คุณอยู่ในสถานะ "เลิกงานแล้ว" ต้องการเปลี่ยนสถานะเป็น "เข้างาน" และรับเคสนี้ใช่หรือไม่?'
      );
      if (!confirmClockIn) return;
      await clockIn();
    }
    try {
      const caseRef = doc(db, 'cases', caseId);
      let targetCaseData: Case | null = null;
      await runTransaction(db, async (transaction) => {
        const caseDoc = await transaction.get(caseRef);
        if (!caseDoc.exists()) {
          throw new Error('CASE_NOT_FOUND');
        }
        const currentData = caseDoc.data() as Case;
        targetCaseData = { ...currentData, id: caseDoc.id };
        if (currentData.status !== 'pending') {
          throw new Error(`ALREADY_ACCEPTED:${currentData.assigneeName || 'พนักงานท่านอื่น'}`);
        }
        transaction.update(caseRef, {
          assigneeId: user.uid,
          assigneeName: user.name,
          status: 'processing', // สร้างเคส = เครดิตผ่านเลย เมื่อกดรับเคสจะเริ่มทำเคสทันที
          isStuck: false,
          updatedAt: Date.now(),
        });
      });

      if (targetCaseData) {
        const c = targetCaseData as Case;
        logActivity({
          type: 'accept_case',
          actorId: user.uid,
          actorName: user.name,
          actorAvatarEmoji: user.avatarEmoji,
          description: `กดรับเคส ${c.iphoneModel} (ตัวแทน: ${c.agentName})`,
          caseId,
          iphoneModel: c.iphoneModel,
        }).catch(console.error);
      }
    } catch (error: any) {
      if (error?.message?.startsWith('ALREADY_ACCEPTED:')) {
        const takenBy = error.message.split(':')[1];
        alert(`เคสนี้ถูกรับไปแล้วโดย ${takenBy}`);
      } else if (error?.message === 'CASE_NOT_FOUND') {
        alert('ไม่พบเคสนี้ในระบบ หรืออาจถูกลบไปแล้ว');
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `cases/${caseId}`);
      }
    }
  };

  const handleOpenCloseCase = (c: Case) => {
    setActiveCloseCase(c);
  };

  const handleUpdateStatus = async (caseId: string, newStatus: 'processing' | 'closed') => {
    if (newStatus === 'closed') {
      const targetCase = cases.find((c) => c.id === caseId);
      if (targetCase) {
        handleOpenCloseCase(targetCase);
        return;
      }
    }
    try {
      const caseRef = doc(db, 'cases', caseId);
      const updates: Record<string, unknown> = {
        status: newStatus,
        updatedAt: Date.now(),
      };
      
      if (newStatus === 'closed') {
        updates.completedAt = Date.now();
      }
      
      await updateDoc(caseRef, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseId}`);
    }
  };

  const handleCancelCase = async (caseId: string) => {
    if (!window.confirm('คุณต้องการยกเลิกเคสนี้ใช่หรือไม่?')) return;
    try {
      const caseRef = doc(db, 'cases', caseId);
      await updateDoc(caseRef, {
        status: 'cancelled',
        cancelledAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseId}`);
    }
  };

  const handleReopenCase = async (caseId: string) => {
    try {
      const caseRef = doc(db, 'cases', caseId);
      await updateDoc(caseRef, {
        status: 'pending',
        assigneeId: '',
        assigneeName: '',
        updatedAt: Date.now(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseId}`);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    if (!isAdmin) {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบเคสได้');
      return;
    }
    if (!window.confirm('คุณต้องการลบเคสนี้ออกจากระบบอย่างถาวรใช่หรือไม่?')) return;
    try {
      await deleteDoc(doc(db, 'cases', caseId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cases/${caseId}`);
    }
  };

  // Filter & Search Logic
  const filteredCases = cases.filter((c) => {
    if (selectedEmployeeFilter) {
      // ตรวจสอบว่าเคสเป็นของพนักงานที่ถูกเลือกหรือไม่
      const matchName = c.assigneeName === selectedEmployeeFilter;
      const matchId = c.assigneeId === selectedEmployeeFilter;
      const empUser = registeredUsers.find(
        (u) => u.name === selectedEmployeeFilter || u.username === selectedEmployeeFilter || u.uid === selectedEmployeeFilter
      );
      const isEmployeeCase =
        matchName ||
        matchId ||
        (empUser && (c.assigneeId === empUser.uid || c.assigneeName === empUser.name || c.assigneeName === empUser.username));

      if (!isEmployeeCase) return false;

      // กรองสถานะตามแท็บที่เลือกขณะระบุชื่อพนักงาน
      if (activeFilter === 'closed') {
        if (c.status !== 'closed') return false;
      } else if (activeFilter === 'cancelled') {
        if (c.status !== 'cancelled') return false;
      } else if (activeFilter === 'in_progress') {
        if (!isInProgressCase(c, registeredUsers)) return false;
      } else if (activeFilter === 'stuck' || activeFilter === 'remarks') {
        if (!isStuckCase(c, registeredUsers) || c.status === 'closed' || c.status === 'cancelled') return false;
      } else {
        // ค่าเริ่มต้นเมื่อกดเลือกดูเคสของพนักงานแต่ละคน: แสดงเคสที่กำลังทำอยู่/เคสค้างทั้งหมดของพนักงานท่านนั้น
        if (c.status === 'closed' || c.status === 'cancelled') return false;
      }
    } else {
      if (activeFilter === 'all') {
        // เคสทั้งหมดที่ยังดำเนินการอยู่: เคสใหม่, กำลังทำ, เคสค้าง
        if (c.status === 'closed' || c.status === 'cancelled') return false;
      } else if (activeFilter === 'pending' || activeFilter === 'new') {
        // เคสใหม่: ยังไม่มีใครรับ
        if (!isNewCase(c, registeredUsers)) return false;
      } else if (activeFilter === 'in_progress') {
        // เคสกำลังทำ: มีผู้รับเคสไปดำเนินการแล้วและยังไม่ออกงาน
        if (!isInProgressCase(c, registeredUsers)) return false;
      } else if (activeFilter === 'stuck' || activeFilter === 'remarks') {
        // เคสค้าง: ต้องเป็นเคสที่ถูกกดเคสค้าง หรือคนทำออกงานแล้ว
        if (!isStuckCase(c, registeredUsers) || c.status === 'closed' || c.status === 'cancelled') return false;
      } else if (activeFilter === 'mine') {
        if (c.assigneeId !== user?.uid || c.status === 'closed' || c.status === 'cancelled') return false;
      } else if (activeFilter === 'closed') {
        if (c.status !== 'closed') return false;
      } else if (activeFilter === 'cancelled') {
        if (c.status !== 'cancelled') return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchAgent = c.agentName.toLowerCase().includes(q);
      const matchModel = c.iphoneModel.toLowerCase().includes(q);
      const matchProvince = c.province.toLowerCase().includes(q);
      const matchAssignee = (c.assigneeName || '').toLowerCase().includes(q);
      const matchRemark = (c.remarks || '').toLowerCase().includes(q);
      const matchContract = (c.contractNumber || '').toLowerCase().includes(q);
      return matchAgent || matchModel || matchProvince || matchAssignee || matchRemark || matchContract;
    }

    return true;
  });

  const newCount = cases.filter(c => isNewCase(c, registeredUsers)).length;
  const inProgressCount = cases.filter(c => isInProgressCase(c, registeredUsers)).length;
  const stuckCount = cases.filter(c => isStuckCase(c, registeredUsers) && c.status !== 'closed' && c.status !== 'cancelled').length;
  const myCount = cases.filter(c => c.assigneeId === user?.uid && c.status !== 'closed' && c.status !== 'cancelled').length;
  const closedCount = cases.filter(c => c.status === 'closed').length;
  const cancelledCount = cases.filter(c => c.status === 'cancelled').length;
  const allActiveCount = cases.filter(c => c.status !== 'closed' && c.status !== 'cancelled').length;
  const expiredCount = cases.filter(c => isCaseOlderThan3Days(c, Date.now(), registeredUsers)).length;

  // Pagination: แสดงเคสสูงสุด 30 เคสต่อหน้า
  const CASES_PER_PAGE = 30;
  const totalCases = filteredCases.length;
  const totalPages = Math.max(1, Math.ceil(totalCases / CASES_PER_PAGE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * CASES_PER_PAGE;
  const endIndex = Math.min(startIndex + CASES_PER_PAGE, totalCases);
  const paginatedCases = filteredCases.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3"></div>
        <p className="text-sm">กำลังโหลดข้อมูลคิวงาน...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Action Header & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center">
            กระดานคิวงาน
            <span className="ml-2.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
              {allActiveCount} เคสทั้งหมดในคิว
            </span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            ไทย พลัส+ | สร้างเคส = เครดิตผ่านทันที • เฉพาะผู้เข้าเวรเช็คเครดิต (2 คน) เท่านั้นที่สร้างเคสได้
          </p>
        </div>

        <div className="flex items-center gap-2">
          {notificationStatus !== 'granted' && (
            <button
              type="button"
              onClick={requestNotification}
              className="inline-flex items-center px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition cursor-pointer"
              title="เปิดการแจ้งเตือนเคสใหม่"
            >
              <Bell className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              เปิดแจ้งเตือนเคสใหม่
            </button>
          )}

          {/* Top Bar Action: View & Manage Agents directly */}
          <button
            type="button"
            onClick={() => setShowAgentManagerModal(true)}
            className="inline-flex items-center px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition cursor-pointer"
            title="ดูรายชื่อตัวแทน เพิ่ม หรือจัดการตัวแทนในระบบ"
          >
            <Building2 className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
            รายชื่อตัวแทน
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCustomTaskModal(true)}
              className="inline-flex items-center px-3.5 py-2.5 border border-purple-200 dark:border-purple-800 rounded-xl shadow-xs text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 transition cursor-pointer active:scale-95"
              title="เพิ่มงานที่นอกเหนือการรับเคสปกติ (ระบุชื่องาน และหมายเหตุ)"
            >
              <Briefcase className="w-4 h-4 mr-1.5 text-purple-200" />
              <span>เพิ่มงานพิเศษ</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!canCreateCase) {
                alert('เฉพาะผู้ที่กำลังปฏิบัติหน้าที่ "งานเช็คเครดิต" (จำกัด 2 คนพร้อมกัน) หรือแอดมินเท่านั้นที่สามารถสร้างเคสได้\n\n👉 กรุณากดปุ่ม "เข้าประจำเวรเช็คเครดิต" ที่กล่องด้านล่างก่อนเริ่มเปิดเคส');
                return;
              }
              setShowAddForm(!showAddForm);
            }}
            className={clsx(
              "inline-flex items-center px-4 py-2.5 border rounded-xl shadow-xs text-sm font-semibold transition cursor-pointer active:scale-95",
              canCreateCase
                ? "border-transparent text-white bg-indigo-600 hover:bg-indigo-700"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            )}
            title={canCreateCase ? "สร้างเคสใหม่" : "เฉพาะผู้เข้าเวรเช็คเครดิต 2 คน หรือแอดมินเท่านั้นที่สามารถสร้างเคสได้"}
          >
            {canCreateCase ? (
              <Plus className="w-4 h-4 mr-1.5" />
            ) : (
              <Lock className="w-4 h-4 mr-1.5 text-slate-400" />
            )}
            {showAddForm ? 'ปิดแบบฟอร์ม' : 'เพิ่มเคสใหม่'}
            {!canCreateCase && (
              <span className="ml-1 text-[11px] font-normal opacity-80">(เฉพาะเวรเช็คเครดิต)</span>
            )}
          </button>
        </div>
      </div>

      {/* Custom Task Modal (Admin only, task title and remarks) */}
      {showCustomTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400">
                  <Briefcase className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">เพิ่มงานพิเศษ / งานนอกเหนือเคสปกติ</h3>
                  <p className="text-xs text-slate-400">สำหรับแอดมินสร้างงานมอบหมายให้พนักงานในคิว (ระบุชื่องาน และหมายเหตุ)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomTaskModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!customTaskTitle.trim()) {
                alert('กรุณาระบุชื่องานค่ะ');
                return;
              }
              setIsSubmittingCustomTask(true);
              try {
                const newTask: Record<string, unknown> = {
                  taskTitle: customTaskTitle.trim(),
                  agentName: 'งานพิเศษ/งานนอก',
                  iphoneModel: `[งานพิเศษ] ${customTaskTitle.trim()}`,
                  province: '-',
                  status: 'pending',
                  remarks: customTaskRemarks.trim() || null,
                  remarksUpdatedAt: customTaskRemarks.trim() ? Date.now() : null,
                  remarksUpdatedBy: customTaskRemarks.trim() ? (user?.name || 'แอดมิน') : null,
                  isCustomTask: true,
                  caseType: 'custom_task',
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };

                const docRef = await addDoc(collection(db, 'cases'), newTask);
                logActivity({
                  type: 'create_case',
                  actorId: user?.uid || 'admin',
                  actorName: user?.name || 'แอดมิน',
                  actorAvatarEmoji: user?.avatarEmoji,
                  description: `เพิ่มงานพิเศษ: "${customTaskTitle.trim()}"`,
                  caseId: docRef.id,
                  iphoneModel: `[งานพิเศษ] ${customTaskTitle.trim()}`,
                }).catch(console.warn);

                setCustomTaskTitle('');
                setCustomTaskRemarks('');
                setShowCustomTaskModal(false);
                alert('สร้างงานพิเศษเรียบร้อยแล้ว พนักงานสามารถกดรับงานในคิวได้ทันทีค่ะ');
              } catch (err) {
                console.error(err);
                alert('เกิดข้อผิดพลาดในการสร้างงานพิเศษ');
              } finally {
                setIsSubmittingCustomTask(false);
              }
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  ชื่องาน (Task Title) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น ตรวจเช็คสต็อกเครื่องหน้าร้าน, จัดส่งเอกสารด่วน"
                  value={customTaskTitle}
                  onChange={(e) => setCustomTaskTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  หมายเหตุ / รายละเอียด (Remarks)
                </label>
                <textarea
                  placeholder="ระบุรายละเอียดเพิ่มเติม หรือคำสั่งงาน (ถ้ามี)"
                  value={customTaskRemarks}
                  onChange={(e) => setCustomTaskRemarks(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCustomTaskModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCustomTask}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingCustomTask ? 'กำลังสร้าง...' : 'บันทึก & เปิดงาน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real-time Activity Feed Banner & Modal */}
      <RecentActivityFeed />

      {/* CREDIT CHECK DUTY STATION (Max 2 workers, only they can create cases) */}
      <CreditCheckDutyStation 
        onStatusChange={handleDutyStatusChange} 
      />

      {/* SIMPLE EMPLOYEE WORKLOAD OVERVIEW (ใครกำลังรับงานอยู่กี่เคส แสดงแบบง่ายๆ) */}
      <SimpleEmployeeWorkload 
        cases={cases}
        selectedEmployeeName={selectedEmployeeFilter}
        onSelectEmployee={(empName) => {
          setSelectedEmployeeFilter(empName);
          if (empName && (activeFilter === 'pending' || activeFilter === 'new')) {
            setActiveFilter('all');
          }
        }}
      />

      {/* CREATE CASE FORM MODAL / COLLAPSIBLE */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl shadow-sm border border-indigo-100 dark:border-slate-800 ring-1 ring-indigo-500/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800 gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center">
                <Plus className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                ลงข้อมูลเคสใหม่เข้าระบบ
              </h2>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5 font-medium">
                ✓ สร้างเคส = เครดิตผ่านทันที (ไม่ต้องผ่านขั้นตอนตรวจเครดิตซ้ำ) พนักงานท่านอื่นสามารถกดรับไปทำเคสได้เลย
              </p>
            </div>
            <span className="self-start sm:self-auto text-xs px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
              สถานะ: เครดิตผ่าน (รอรับเคส)
            </span>
          </div>

          <form onSubmit={handleAddCase} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Agent Name (Dropdown with direct add ability for credit checkers) */}
              <AgentSelect
                value={formData.agentName}
                onChange={(selectedName) => setFormData({ ...formData, agentName: selectedName })}
                currentUser={user}
                cases={cases}
                required
              />

              {/* iPhone Model */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    รุ่น iPhone *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('open-refinance-guide', { detail: { model: formData.iphoneModel } }));
                    }}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer transition"
                    title="เปิดดูเรทเงินและค่างวดของรุ่นนี้"
                  >
                    <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                    ดูเรทเงิน & ค่างวดรุ่นนี้
                  </button>
                </div>
                <div className="relative">
                  <select
                    value={formData.iphoneModel}
                    onChange={(e) => setFormData({ ...formData, iphoneModel: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition appearance-none cursor-pointer"
                  >
                    {POPULAR_IPHONES.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                    <option value="รุ่นอื่นๆ">รุ่นอื่นๆ</option>
                  </select>
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>

                {/* Instant Rate Hint */}
                {(() => {
                  const rate = findRefinanceRate(formData.iphoneModel);
                  if (!rate) return null;
                  const foreignRes = getForeignMachineMatchingRate(rate);
                  const refRes = getRefurbishedMatchingRate(rate.loanAmount);
                  const repairTier = getPreviousLowerTierRate(rate.loanAmount);
                  return (
                    <div 
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-refinance-guide', { detail: { model: formData.iphoneModel } }));
                      }}
                      className="mt-1.5 p-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300 cursor-pointer hover:bg-blue-100/60 transition"
                      title="กดเพื่อเปิดคำนวณและดูเรทเต็ม"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1">
                          ⚡ ยอดจัดปกติ (ศูนย์ไทย): <span className="font-bold text-blue-800 dark:text-blue-200">{rate.loanAmount.toLocaleString()} บ.</span>
                        </span>
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium underline">
                          เปิดเครื่องคำนวณ &gt;
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                        <span>• เครื่องนอก: <strong>{foreignRes.matchedRate.loanAmount.toLocaleString()} บ.</strong> (ยึด {foreignRes.matchedRate.model})</span>
                        <span>• รีเฟอร์บิช: <strong>{refRes.matchedRate.loanAmount.toLocaleString()} บ.</strong> (ยึด {refRes.matchedRate.model})</span>
                        <span>• หักเปลี่ยนจอ/กล้อง: <strong>{repairTier.loanAmount.toLocaleString()} บ.</strong> (ยึด {repairTier.model})</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Province */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  จังหวัด *
                </label>
                <div className="relative">
                  <select
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition appearance-none cursor-pointer"
                  >
                    {POPULAR_PROVINCES.map((prov) => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* Optional Contract Number */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center">
                    <FileSignature className="w-3.5 h-3.5 mr-1 text-blue-500" />
                    เลขที่สัญญา
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal lowercase">ใส่ทีหลังได้</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="เช่น CNT-2025-01 หรือใส่ทีหลังได้"
                    value={formData.contractNumber}
                    onChange={(e) => setFormData({ ...formData, contractNumber: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 transition"
                  />
                  <FileSignature className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* Optional Remarks */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>หมายเหตุ / สาเหตุค้าง (ถ้ามี)</span>
                  <span className="text-[11px] text-slate-400 font-normal lowercase">ไม่บังคับ</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="เช่น รอลูกค้าโอนมัดจำ, ติดต่อลูกค้าช่วงบ่าย, เอกสารรอส่งเพิ่มเติม..."
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition"
                  />
                  <StickyNote className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition disabled:opacity-50 flex items-center cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {isSubmitting ? 'กำลังบันทึก...' : 'เพิ่มเคสเข้าคิว'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Filter Pills - Always strictly on 1 single line (flex-nowrap) */}
        <div className="flex items-center flex-nowrap overflow-x-auto no-scrollbar gap-1 sm:gap-1.5 min-w-0 py-0.5">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={clsx(
              "px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer",
              activeFilter === 'all'
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            ทั้งหมด ({allActiveCount})
          </button>

          {/* เคสใหม่ */}
          <button
            type="button"
            onClick={() => setActiveFilter('pending')}
            className={clsx(
              "px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center cursor-pointer",
              activeFilter === 'pending' || activeFilter === 'new'
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            เคสใหม่
            {newCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'pending' || activeFilter === 'new' ? "bg-white text-indigo-700 font-bold" : "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium"
              )}>
                {newCount}
              </span>
            )}
          </button>

          {/* เคสกำลังทำ */}
          <button
            type="button"
            onClick={() => setActiveFilter('in_progress')}
            className={clsx(
              "px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center cursor-pointer",
              activeFilter === 'in_progress'
                ? "bg-amber-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <Clock className="w-3.5 h-3.5 mr-1 text-amber-500" />
            กำลังทำ
            {inProgressCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'in_progress' ? "bg-white text-amber-800 font-bold" : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium"
              )}>
                {inProgressCount}
              </span>
            )}
          </button>

          {/* เคสค้าง */}
          <button
            type="button"
            onClick={() => setActiveFilter('stuck')}
            className={clsx(
              "px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center cursor-pointer",
              activeFilter === 'stuck' || activeFilter === 'remarks'
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <PauseCircle className="w-3.5 h-3.5 mr-1 text-amber-500" />
            เคสค้าง
            {stuckCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'stuck' || activeFilter === 'remarks' ? "bg-white text-amber-800 font-bold" : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium"
              )}>
                {stuckCount}
              </span>
            )}
          </button>

          {/* เคสของฉัน */}
          <button
            type="button"
            onClick={() => setActiveFilter('mine')}
            className={clsx(
              "px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center cursor-pointer",
              activeFilter === 'mine'
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            เคสของฉัน
            {myCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'mine' ? "bg-white text-indigo-700 font-bold" : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium"
              )}>
                {myCount}
              </span>
            )}
          </button>

          {/* จบเคสแล้ว */}
          <button
            type="button"
            onClick={() => setActiveFilter('closed')}
            className={clsx(
              "px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center cursor-pointer",
              activeFilter === 'closed'
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            จบเคสแล้ว ({closedCount})
          </button>

          {/* ยกเลิกเคส */}
          <button
            type="button"
            onClick={() => setActiveFilter('cancelled')}
            className={clsx(
              "px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center cursor-pointer",
              activeFilter === 'cancelled'
                ? "bg-rose-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <Ban className="w-3 h-3 mr-1 text-rose-500" />
            ยกเลิก ({cancelledCount})
          </button>

          {/* ตรวจสอบเคสเกิน 3 วัน */}
          <button
            type="button"
            onClick={handleManualAutoCancelCheck}
            disabled={isCheckingAutoCancel}
            className={clsx(
              "px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 cursor-pointer border",
              expiredCount > 0
                ? "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            )}
            title="ระบบตรวจสอบเคสที่อยู่เกิน 3 วัน และยกเลิกให้อัตโนมัติ (คลิกเพื่อสั่งตรวจสอบทันที)"
          >
            <ClockAlert className={clsx("w-3.5 h-3.5", expiredCount > 0 ? "text-rose-500 animate-pulse" : "text-slate-400")} />
            <span>เคสเกิน 3 วัน</span>
            {expiredCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                {expiredCount}
              </span>
            ) : (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                (ปกติ)
              </span>
            )}
          </button>
        </div>

        {/* Search Box - Clean & Right Aligned on same single row */}
        <div className="relative w-36 sm:w-48 md:w-56 shrink-0 sm:ml-auto">
          <input
            type="text"
            placeholder="ค้นหาตัวแทน, รุ่น, จังหวัด..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
            title="ค้นหาชื่อตัวแทน, รุ่นไอโฟน, เลขที่สัญญา, เบอร์โทร, จังหวัด"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1 py-0.5 rounded cursor-pointer"
              title="ล้างคำค้นหา"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Active Employee Filter Banner */}
      {selectedEmployeeFilter && (
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">กำลังแสดงเฉพาะเคสของ:</span>
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 shadow-2xs">
              {selectedEmployeeFilter}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              (พบ {filteredCases.length} เคส)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedEmployeeFilter(null)}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-950 dark:hover:text-white px-2 py-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer transition"
          >
            <X className="w-3.5 h-3.5" />
            ล้างตัวกรอง
          </button>
        </div>
      )}

      {/* Off-work status banner for "My Cases" tab */}
      {activeFilter === 'mine' && user?.workStatus === 'off_work' && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 shadow-2xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 shrink-0">
              <Moon className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200">คุณอยู่ในสถานะ: เลิกงานแล้ว</span>
              <span className="text-slate-500 dark:text-slate-400 ml-1.5 hidden sm:inline">(เคสที่เคยถือครองถูกส่งคืนกลับไป "รอรับเคส" เรียบร้อยแล้ว)</span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await clockIn();
            }}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer shadow-xs whitespace-nowrap"
          >
            คลิกเพื่อเข้างาน
          </button>
        </div>
      )}

      {/* Active Workload & Quick Clock-Out for "My Cases" tab */}
      {activeFilter === 'mine' && user?.workStatus !== 'off_work' && myCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-xl text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-800 dark:text-amber-300">คุณมีงานที่กำลังทำอยู่:</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white font-bold text-[11px]">
              {myCount} เคส
            </span>
            <span className="text-amber-700/80 dark:text-amber-400/80 text-[11px] hidden sm:inline">
              (เมื่อเลิกงาน สามารถกดบันทึกเพื่อคืนเคสทั้งหมดกลับไป "รอรับเคส" ได้ทันที)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowQueueClockOutModal(true)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
          >
            <LogOut className="w-3.5 h-3.5 text-amber-600" />
            <span>บันทึกเลิกงาน (คืน {myCount} เคส)</span>
          </button>
        </div>
      )}

      {/* Case List Grid */}
      {filteredCases.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">ไม่พบเคสตามเงื่อนไขที่เลือก</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {searchQuery ? 'ลองเปลี่ยนคำค้นหา หรือกดล้างการค้นหา' : 'คุณสามารถกด "เพิ่มเคสใหม่" ด้านบนเพื่อเริ่มเปิดเคส'}
          </p>
        </div>
      ) : viewMode === 'row' ? (
        /* ROW / LIST VIEW: single line / compact horizontal strip per case */
        <div className="space-y-1.5 sm:space-y-2">
          {paginatedCases.map((c) => (
            <RowCaseItem
              key={c.id}
              data={c}
              currentUserId={user?.uid}
              isAdmin={isAdmin}
              registeredUsers={registeredUsers}
              onAccept={() => handleAcceptCase(c.id)}
              onUpdateStatus={(status) => handleUpdateStatus(c.id, status)}
              onCloseCase={() => handleOpenCloseCase(c)}
              onCancel={() => handleCancelCase(c.id)}
              onReopen={() => handleReopenCase(c.id)}
              onReturnToPending={() => handleOpenReturnToPending(c)}
              onDelete={() => handleDeleteCase(c.id)}
              onOpenRemark={handleOpenRemark}
              onOpenContract={handleOpenContract}
              onTakeOver={() => handleTakeOverCase(c.id)}
              onOpenReassign={() => handleOpenReassign(c)}
              onOpenHoldModal={(target) => setActiveHoldCase(target)}
            />
          ))}
        </div>
      ) : viewMode === 'compact' ? (
        /* COMPACT GRID: 2 columns on mobile so multiple cases fit on screen! */
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
          {paginatedCases.map((c) => (
            <CompactCaseCard
              key={c.id}
              data={c}
              currentUserId={user?.uid}
              isAdmin={isAdmin}
              registeredUsers={registeredUsers}
              onAccept={() => handleAcceptCase(c.id)}
              onUpdateStatus={(status) => handleUpdateStatus(c.id, status)}
              onCloseCase={() => handleOpenCloseCase(c)}
              onCancel={() => handleCancelCase(c.id)}
              onReopen={() => handleReopenCase(c.id)}
              onReturnToPending={() => handleOpenReturnToPending(c)}
              onDelete={() => handleDeleteCase(c.id)}
              onOpenRemark={handleOpenRemark}
              onOpenContract={handleOpenContract}
              onTakeOver={() => handleTakeOverCase(c.id)}
              onOpenReassign={() => handleOpenReassign(c)}
              onOpenHoldModal={(target) => setActiveHoldCase(target)}
            />
          ))}
        </div>
      ) : (
        /* FULL CARD GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {paginatedCases.map((c) => (
            <CaseCard
              key={c.id}
              data={c}
              currentUserId={user?.uid}
              isAdmin={isAdmin}
              registeredUsers={registeredUsers}
              onAccept={() => handleAcceptCase(c.id)}
              onUpdateStatus={(status) => handleUpdateStatus(c.id, status)}
              onCloseCase={() => handleOpenCloseCase(c)}
              onCancel={() => handleCancelCase(c.id)}
              onReopen={() => handleReopenCase(c.id)}
              onReturnToPending={() => handleOpenReturnToPending(c)}
              onDelete={() => handleDeleteCase(c.id)}
              onOpenRemark={handleOpenRemark}
              onOpenContract={handleOpenContract}
              onTakeOver={() => handleTakeOverCase(c.id)}
              onOpenReassign={() => handleOpenReassign(c)}
              onOpenHoldModal={(target) => setActiveHoldCase(target)}
            />
          ))}
        </div>
      )}

      {/* PAGINATION (ระบบแบ่งหน้า - แสดงสูงสุด 30 เคสต่อหน้า) */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          {/* Information & Summary */}
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-white">
              หน้า {safeCurrentPage} / {totalPages}
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span>
              แสดงเคสที่ <strong className="text-slate-800 dark:text-slate-200">{startIndex + 1} - {endIndex}</strong> จากทั้งหมด <strong className="text-indigo-600 dark:text-indigo-400">{totalCases}</strong> เคส
            </span>
            <span className="hidden md:inline text-[11px] text-slate-400 dark:text-slate-500">
              (สูงสุด 30 เคส/หน้า)
            </span>
          </div>

          {/* Page navigation buttons */}
          <div className="flex items-center gap-1">
            {/* First Page */}
            {totalPages > 4 && (
              <button
                type="button"
                onClick={() => {
                  setCurrentPage(1);
                  window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
                disabled={safeCurrentPage <= 1}
                className={clsx(
                  "p-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center justify-center",
                  safeCurrentPage <= 1
                    ? "border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
                title="หน้าแรก"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            )}

            {/* Previous Page */}
            <button
              type="button"
              onClick={() => {
                setCurrentPage((prev) => Math.max(1, prev - 1));
                window.scrollTo({ top: 300, behavior: 'smooth' });
              }}
              disabled={safeCurrentPage <= 1}
              className={clsx(
                "px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1",
                safeCurrentPage <= 1
                  ? "border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50"
                  : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs"
              )}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ก่อนหน้า</span>
            </button>

            {/* Numbered Page Buttons with Smart Window */}
            <div className="flex items-center gap-1 mx-0.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                if (
                  totalPages > 6 &&
                  pageNum !== 1 &&
                  pageNum !== totalPages &&
                  Math.abs(pageNum - safeCurrentPage) > 1
                ) {
                  if (pageNum === 2 || pageNum === totalPages - 1) {
                    return (
                      <span key={pageNum} className="w-6 text-center text-slate-400 dark:text-slate-600 select-none">
                        ...
                      </span>
                    );
                  }
                  return null;
                }

                const isActive = pageNum === safeCurrentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => {
                      setCurrentPage(pageNum);
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    className={clsx(
                      "min-w-8 h-8 px-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center",
                      isActive
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            {/* Next Page */}
            <button
              type="button"
              onClick={() => {
                setCurrentPage((prev) => Math.min(totalPages, prev + 1));
                window.scrollTo({ top: 300, behavior: 'smooth' });
              }}
              disabled={safeCurrentPage >= totalPages}
              className={clsx(
                "px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1",
                safeCurrentPage >= totalPages
                  ? "border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50"
                  : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs"
              )}
            >
              <span className="hidden sm:inline">ถัดไป</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Last Page */}
            {totalPages > 4 && (
              <button
                type="button"
                onClick={() => {
                  setCurrentPage(totalPages);
                  window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
                disabled={safeCurrentPage >= totalPages}
                className={clsx(
                  "p-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center justify-center",
                  safeCurrentPage >= totalPages
                    ? "border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
                )}
                title="หน้าสุดท้าย"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* REMARK MODAL DIALOG */}
      {activeRemarkCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-amber-50/50 dark:bg-amber-950/20">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
                  <StickyNote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center">
                    หมายเหตุงาน (ระบุสาเหตุที่งานค้าง)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeRemarkCase.iphoneModel} • ตัวแทน: {activeRemarkCase.agentName} ({activeRemarkCase.province})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveRemarkCase(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRemark} className="p-5 space-y-4">
              {/* Quick Presets */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  คลิกเลือกสาเหตุงานค้างที่พบบ่อย (กดเพื่อเลือกทันที):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_REMARKS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRemarkInput(preset)}
                      className={clsx(
                        "px-2.5 py-1 text-xs rounded-lg border transition cursor-pointer text-left",
                        remarkInput === preset
                          ? "bg-amber-500 text-white border-amber-600 font-semibold shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300"
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  รายละเอียดหมายเหตุ:
                </label>
                <textarea
                  rows={3}
                  value={remarkInput}
                  onChange={(e) => setRemarkInput(e.target.value)}
                  placeholder="พิมพ์เหตุผลที่งานค้าง เช่น รอลูกค้าส่งเอกสารบัตรประชาชน, รอลูกค้าโอนเงินมัดจำภายใน 16:00 น...."
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white dark:focus:bg-slate-800 transition"
                />
                {activeRemarkCase.remarksUpdatedBy && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                    บันทึกล่าสุดโดย {activeRemarkCase.remarksUpdatedBy}
                    {activeRemarkCase.remarksUpdatedAt && ` (${format(activeRemarkCase.remarksUpdatedAt, 'dd MMM HH:mm น.', { locale: th })})`}
                  </p>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  {activeRemarkCase.remarks && (
                    <button
                      type="button"
                      onClick={handleClearRemark}
                      disabled={isSavingRemark}
                      className="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition cursor-pointer disabled:opacity-50"
                    >
                      ลบหมายเหตุออก
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setActiveRemarkCase(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingRemark}
                    className="px-5 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 active:scale-[0.98] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center"
                  >
                    <StickyNote className="w-3.5 h-3.5 mr-1.5" />
                    {isSavingRemark ? 'กำลังบันทึก...' : 'บันทึกหมายเหตุ'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONTRACT MODAL DIALOG (Add / Edit contract at any time after job acceptance) */}
      {activeContractCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
                  <FileSignature className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center">
                    ระบุเลขที่สัญญา
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeContractCase.iphoneModel} • {activeContractCase.agentName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveContractCase(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveContract} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>เลขที่สัญญา / Contract Number:</span>
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-normal">ใส่ตอนไหนก็ได้หลังรับงาน</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={contractInput}
                    onChange={(e) => setContractInput(e.target.value)}
                    placeholder="เช่น CNT-2025-0105 หรือ 6800123"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 transition"
                  />
                  <FileSignature className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  ระบุเลขที่สัญญาเพื่อความสะดวกในการติดตามเคสและสรุปยอดในภายหลัง
                </p>
                {activeContractCase.contractUpdatedBy && (
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                    อัปเดตสัญญาล่าสุดโดย {activeContractCase.contractUpdatedBy}
                    {activeContractCase.contractUpdatedAt && ` (${format(activeContractCase.contractUpdatedAt, 'dd MMM HH:mm น.', { locale: th })})`}
                  </p>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  {activeContractCase.contractNumber && (
                    <button
                      type="button"
                      onClick={handleClearContract}
                      disabled={isSavingContract}
                      className="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition cursor-pointer disabled:opacity-50"
                    >
                      ลบเลขสัญญา
                    </button>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setActiveContractCase(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingContract}
                    className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center"
                  >
                    <FileSignature className="w-3.5 h-3.5 mr-1.5" />
                    {isSavingContract ? 'กำลังบันทึก...' : 'บันทึกสัญญา'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSFER / REASSIGN CASE MODAL */}
      {activeReassignCase && (
        <TransferCaseModal
          isOpen={!!activeReassignCase}
          onClose={() => setActiveReassignCase(null)}
          caseData={activeReassignCase}
          currentUser={user}
          registeredUsers={registeredUsers}
          onSuccess={() => setActiveReassignCase(null)}
        />
      )}

      {/* RETURN CASE TO PENDING MODAL */}
      {activeReturnCase && (
        <ReturnCaseModal
          isOpen={!!activeReturnCase}
          onClose={() => setActiveReturnCase(null)}
          caseData={activeReturnCase}
          currentUser={user}
          onSuccess={() => setActiveReturnCase(null)}
        />
      )}

      {/* CLOSE CASE MODAL (Enforces Contract Number) */}
      {activeCloseCase && (
        <CloseCaseModal
          isOpen={!!activeCloseCase}
          onClose={() => setActiveCloseCase(null)}
          caseData={activeCloseCase}
          currentUser={user}
          onSuccess={() => setActiveCloseCase(null)}
        />
      )}

      {/* HOLD CASE MODAL (Enforces Remarks and separates new vs stuck) */}
      {activeHoldCase && (
        <HoldCaseModal
          isOpen={!!activeHoldCase}
          onClose={() => setActiveHoldCase(null)}
          caseData={activeHoldCase}
          currentUser={user}
          onSuccess={() => setActiveHoldCase(null)}
        />
      )}

      {/* Agent Manager & Add Agent Modal (Direct from Header) */}
      <AgentManagerModal
        isOpen={showAgentManagerModal}
        onClose={() => setShowAgentManagerModal(false)}
        currentUser={user}
        cases={cases}
        currentSelectedAgent={formData.agentName}
        onSelectAgent={(agentName) => {
          setFormData((prev) => ({ ...prev, agentName }));
        }}
      />

      {/* Clock Out Confirmation Modal */}
      {user && (
        <ClockOutConfirmModal
          isOpen={showQueueClockOutModal}
          onClose={() => setShowQueueClockOutModal(false)}
          employeeId={user.uid}
          employeeName={user.name}
          isSelf={true}
          onSuccess={(res) => {
            if (res.returnedCasesCount > 0) {
              alert(`บันทึกเลิกงานเรียบร้อยแล้ว ส่งเคสคืนกลับไป "รอรับเคส" จำนวน ${res.returnedCasesCount} เคส`);
            }
          }}
        />
      )}

      {/* Auto Cancel Notification Toast */}
      {autoCancelToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-3 rounded-2xl shadow-xl border border-slate-700 dark:border-slate-200 text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <ClockAlert className="w-4 h-4 text-amber-400 dark:text-amber-600 shrink-0" />
            <span className="truncate">{autoCancelToast}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setAutoCancelToast(null)} 
            className="text-slate-400 hover:text-white dark:hover:text-slate-900 cursor-pointer text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

interface CaseCardProps {
  data: Case;
  currentUserId?: string;
  isAdmin?: boolean;
  registeredUsers?: UserProfile[];
  onAccept: () => void;
  onUpdateStatus: (status: 'processing' | 'closed') => void;
  onCloseCase?: () => void;
  onCancel: () => void;
  onReopen: () => void;
  onReturnToPending: () => void;
  onDelete: () => void;
  onOpenRemark: (c: Case) => void;
  onOpenContract: (c: Case) => void;
  onTakeOver: () => void;
  onOpenReassign: () => void;
  onOpenHoldModal?: (c: Case) => void;
}

const RowCaseItem: React.FC<CaseCardProps> = ({
  data,
  currentUserId,
  isAdmin = false,
  registeredUsers,
  onAccept,
  onUpdateStatus,
  onCloseCase,
  onCancel,
  onReopen,
  onReturnToPending,
  onDelete,
  onOpenRemark,
  onOpenContract,
  onTakeOver,
  onOpenReassign,
  onOpenHoldModal,
}) => {
  const isAssignee = data.assigneeId === currentUserId;
  const canManage = isAssignee || isAdmin;
  const statusInfo = statusMap[data.status] || statusMap.pending;
  const prevWorker = getPreviousAssignee(data);
  const isStuck = isStuckCase(data, registeredUsers);
  const isNew = isNewCase(data, registeredUsers);

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-xl border p-2 sm:p-2.5 transition hover:shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs",
      data.status === 'pending'
        ? isStuck
          ? "border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10"
          : "border-indigo-200 dark:border-indigo-800/60"
        : statusInfo.borderClass,
      data.remarks ? "ring-1 ring-amber-400/40" : "",
      data.contractNumber ? "border-blue-200 dark:border-blue-900/60" : "",
      data.status === 'closed' ? "opacity-85 bg-slate-50/50 dark:bg-slate-900/50" : "",
      data.status === 'cancelled' ? "opacity-80 bg-rose-50/30 dark:bg-rose-950/20" : ""
    )}>
      {/* Left content: Status, Time, Model, Agent, Province, Contract, Remarks */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Status Badge */}
        <span className={clsx(
          "px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold border flex items-center shrink-0 leading-tight",
          data.status === 'pending'
            ? isStuck
              ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
              : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
            : statusInfo.badgeClass
        )}>
          {data.status === 'pending' && isStuck && (
            <PauseCircle className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400" />
          )}
          {data.status === 'pending' && isNew && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse mr-1" />
          )}
          {data.status === 'credit_check' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-spin mr-1" />}
          {data.status === 'processing' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-1" />}
          {data.status === 'closed' && <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />}
          {data.status === 'cancelled' && <Ban className="w-3 h-3 mr-1 text-rose-600 dark:text-rose-400" />}
          {data.status === 'pending'
            ? isStuck
              ? 'เคสค้าง'
              : 'เคสใหม่'
            : statusInfo.label}
        </span>

        {/* Time */}
        <span 
          className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-mono shrink-0 whitespace-nowrap"
          title={format(data.createdAt, 'd MMMM yyyy HH:mm:ss น.', { locale: th })}
        >
          {format(data.createdAt, 'd MMM HH:mm น.', { locale: th })}
        </span>

        {/* Model */}
        <div className="font-bold text-slate-900 dark:text-white truncate sm:min-w-[140px] sm:max-w-[180px]" title={data.iphoneModel}>
          {data.iphoneModel}
        </div>

        {/* Agent & Province */}
        <div className="flex items-center text-slate-500 dark:text-slate-400 text-[11px] truncate sm:min-w-[150px]">
          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{data.agentName}</span>
          <span className="mx-1 text-slate-300 dark:text-slate-600">•</span>
          <span className="truncate text-slate-400">{data.province}</span>
        </div>

        {/* Contract badge */}
        {data.contractNumber ? (
          <button
            type="button"
            onClick={() => onOpenContract(data)}
            className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 flex items-center hover:bg-blue-100 dark:hover:bg-blue-900/60 cursor-pointer shrink-0"
            title="แก้ไขเลขสัญญา"
          >
            <FileSignature className="w-2.5 h-2.5 mr-1 text-blue-500" />
            #{data.contractNumber}
          </button>
        ) : data.status !== 'pending' && (
          <button
            type="button"
            onClick={() => onOpenContract(data)}
            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center cursor-pointer shrink-0"
          >
            <FileSignature className="w-2.5 h-2.5 mr-0.5 text-blue-500" />
            +สัญญา
          </button>
        )}

        {/* Remarks badge */}
        {data.remarks ? (
          <div
            className={clsx(
              "px-2.5 py-1.5 rounded-lg border text-[10px] flex flex-col items-start max-w-[280px] shrink-0 text-left",
              data.remarks.includes(AUTO_CANCEL_REMARK)
                ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200"
                : "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200"
            )}
            title={data.remarks}
          >
            <div className="flex items-start justify-between w-full gap-1">
              <div
                onClick={() => onOpenRemark(data)}
                className="flex items-start gap-1 flex-1 min-w-0 cursor-pointer hover:opacity-80"
              >
                {data.remarks.includes(AUTO_CANCEL_REMARK) ? (
                  <ClockAlert className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <StickyNote className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                )}
                <span className="break-words whitespace-pre-wrap font-medium leading-relaxed">{data.remarks}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenRemark(data)}
                className={clsx(
                  "text-[9px] underline font-normal shrink-0 cursor-pointer ml-1",
                  data.remarks.includes(AUTO_CANCEL_REMARK)
                    ? "text-rose-600 dark:text-rose-400 hover:text-rose-800"
                    : "text-amber-600 dark:text-amber-400 hover:text-amber-800"
                )}
                title="แก้ไขหมายเหตุ"
              >
                แก้
              </button>
            </div>
          </div>
        ) : (data.status === 'credit_check' || data.status === 'processing') && (
          <button
            type="button"
            onClick={() => onOpenRemark(data)}
            className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center cursor-pointer shrink-0"
          >
            <StickyNote className="w-2.5 h-2.5 mr-0.5 text-amber-500" />
            +หมายเหตุ
          </button>
        )}

        {/* Previous Assignee badge if returned */}
        {prevWorker && (
          <span
            className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 text-[10px] text-amber-800 dark:text-amber-300 flex items-center shrink-0 font-medium"
            title={`พนักงานที่เคยรับเคสก่อนนี้: ${prevWorker.name}${prevWorker.reason ? ` (เหตุผล: ${prevWorker.reason})` : ''}${prevWorker.returnedAt ? ` เวลา ${format(prevWorker.returnedAt, 'HH:mm น.', { locale: th })}` : ''}`}
          >
            <RotateCcw className="w-2.5 h-2.5 mr-1 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate max-w-[130px]">เคยรับ: <strong className="font-semibold">{prevWorker.name}</strong></span>
          </span>
        )}
      </div>

      {/* Right content: Assignee with AnimalAvatar + Actions */}
      <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 border-t sm:border-t-0 pt-1.5 sm:pt-0 border-slate-100 dark:border-slate-800">
        {/* Assignee display with Animal Cartoon Avatar */}
        {data.assigneeName ? (
          <div className="flex flex-col items-start sm:items-end min-w-[95px]">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <AnimalAvatar identifier={data.assigneeId || data.assigneeName} name={data.assigneeName} size="xs" />
              <span className="font-semibold truncate max-w-[90px]">{data.assigneeName}</span>
              {isAssignee && <span className="text-indigo-600 dark:text-indigo-400 font-bold text-[10px] shrink-0">(คุณ)</span>}
            </div>
            {prevWorker && (
              <span
                className="text-[9px] text-amber-700 dark:text-amber-400 flex items-center gap-0.5 mt-0.5 truncate max-w-[110px]"
                title={`พนักงานที่เคยรับเคสก่อนนี้: ${prevWorker.name}`}
              >
                <RotateCcw className="w-2 h-2 shrink-0" />
                <span className="truncate">เคยรับ: {prevWorker.name}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start sm:items-end min-w-[95px]">
            <span className={clsx(
              "text-[10px] font-semibold",
              isStuck ? "text-amber-600 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400"
            )}>
              {isStuck ? 'เคสค้าง' : 'เคสใหม่'}
            </span>
            {prevWorker && (
              <span
                className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-900/60 px-1.5 py-0.5 rounded flex items-center gap-1 mt-0.5"
                title={`พนักงานที่เคยรับเคสก่อนนี้: ${prevWorker.name}${prevWorker.reason ? ` (เหตุผล: ${prevWorker.reason})` : ''}`}
              >
                <RotateCcw className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate max-w-[95px]">เคยรับ: {prevWorker.name}</span>
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {data.status === 'pending' && (
            <>
              <button
                type="button"
                onClick={onAccept}
                className={clsx(
                  "px-3 py-1 active:scale-95 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center cursor-pointer transition",
                  isStuck ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"
                )}
              >
                <Check className="w-3 h-3 mr-1" />
                {isStuck ? 'รับเคสนี้ต่อ' : 'รับเคส'}
              </button>
              <button
                type="button"
                onClick={() => onOpenHoldModal && onOpenHoldModal(data)}
                className="px-2 py-1 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                title="บันทึกเป็นเคสค้าง (ต้องระบุหมายเหตุ)"
              >
                <PauseCircle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>เคสค้าง</span>
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-2 py-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-xs cursor-pointer transition"
                title="ยกเลิกเคส"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {(data.status === 'credit_check' || data.status === 'processing') && (
            <>
              {canManage && (
                <button
                  type="button"
                  onClick={() => (onCloseCase ? onCloseCase() : onUpdateStatus('closed'))}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center cursor-pointer transition whitespace-nowrap"
                  title="บันทึกจบเคสเสร็จสิ้น (บังคับใส่เลขที่สัญญา)"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  จบเคส
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => onOpenHoldModal && onOpenHoldModal(data)}
                  className="px-2 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                  title="บันทึกเป็นเคสค้าง (ต้องระบุหมายเหตุ)"
                >
                  <PauseCircle className="w-3 h-3" />
                  <span>เคสค้าง</span>
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={onOpenReassign}
                  className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                  title="โยกเคสไปให้พนักงานคนอื่นดูแลต่อ"
                >
                  <ArrowRightLeft className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>โยกเคส</span>
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={onReturnToPending}
                  className="px-2 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                  title="คืนสถานะไปรอรับเคส หากรับมาแล้วแต่ไม่ได้ทำต่อ"
                >
                  <RotateCcw className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>คืนเคส</span>
                </button>
              )}
              {isAdmin && !isAssignee && (
                <button
                  type="button"
                  onClick={onTakeOver}
                  className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold cursor-pointer transition"
                  title="👑 แอดมิน: ดึงเคสมาทำเอง"
                >
                  <Crown className="w-3 h-3" />
                </button>
              )}
            </>
          )}

          {data.status === 'closed' && (
            <div className="flex items-center gap-1">
              <span className="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 rounded border border-emerald-200 dark:border-emerald-800">
                ✓ เรียบร้อย
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onReopen}
                  className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                  title="👑 แอดมิน: กู้คืนเคส"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {data.status === 'cancelled' && (
            <button
              type="button"
              onClick={onReopen}
              className="px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 flex items-center cursor-pointer"
              title="กู้คืนเคส"
            >
              <RotateCcw className="w-3 h-3 mr-1 text-indigo-500" />
              กู้คืน
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1 text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 rounded transition cursor-pointer"
              title="ลบเคสนี้"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const CompactCaseCard: React.FC<CaseCardProps> = ({
  data,
  currentUserId,
  isAdmin = false,
  registeredUsers,
  onAccept,
  onUpdateStatus,
  onCloseCase,
  onCancel,
  onReopen,
  onReturnToPending,
  onDelete,
  onOpenRemark,
  onOpenContract,
  onTakeOver,
  onOpenReassign,
  onOpenHoldModal,
}) => {
  const isAssignee = data.assigneeId === currentUserId;
  const canManage = isAssignee || isAdmin;
  const statusInfo = statusMap[data.status] || statusMap.pending;
  const prevWorker = getPreviousAssignee(data);
  const isStuck = isStuckCase(data, registeredUsers);
  const isNew = isNewCase(data, registeredUsers);

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-xl shadow-2xs border p-2.5 sm:p-3 flex flex-col justify-between transition hover:shadow-xs",
      data.status === 'pending'
        ? isStuck
          ? "border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10"
          : "border-indigo-200 dark:border-indigo-800/60"
        : statusInfo.borderClass,
      data.remarks ? "ring-1 ring-amber-400/40" : "",
      data.contractNumber ? "border-blue-200 dark:border-blue-900/60" : "",
      data.status === 'closed' ? "opacity-85 bg-slate-50/50 dark:bg-slate-900/50" : "",
      data.status === 'cancelled' ? "opacity-80 bg-rose-50/30 dark:bg-rose-950/20" : ""
    )}>
      <div>
        {/* Top bar: Status Badge & Time & Admin Delete */}
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span className={clsx(
            "px-1.5 py-0.5 rounded-md text-[10px] font-bold border flex items-center shrink-0 leading-none",
            data.status === 'pending'
              ? isStuck
                ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
              : statusInfo.badgeClass
          )}>
            {data.status === 'pending' && isStuck && (
              <PauseCircle className="w-2.5 h-2.5 mr-0.5 text-amber-600 dark:text-amber-400" />
            )}
            {data.status === 'pending' && isNew && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse mr-1" />
            )}
            {data.status === 'credit_check' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-spin mr-1" />}
            {data.status === 'processing' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-1" />}
            {data.status === 'closed' && <CheckCircle2 className="w-2.5 h-2.5 mr-0.5 text-emerald-600 dark:text-emerald-400" />}
            {data.status === 'cancelled' && <Ban className="w-2.5 h-2.5 mr-0.5 text-rose-600 dark:text-rose-400" />}
            {data.status === 'pending'
              ? isStuck
                ? 'เคสค้าง'
                : 'เคสใหม่'
              : statusInfo.label}
          </span>

          <div 
            className="flex items-center text-[10px] text-slate-400 dark:text-slate-500 gap-1 font-mono shrink-0 whitespace-nowrap"
            title={format(data.createdAt, 'd MMMM yyyy HH:mm:ss น.', { locale: th })}
          >
            <span>{format(data.createdAt, 'd MMM HH:mm น.', { locale: th })}</span>
            {isAdmin && (
              <button
                type="button"
                onClick={onDelete}
                className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 rounded transition cursor-pointer"
                title="ลบเคสนี้"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* iPhone Model & Agent */}
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate leading-tight" title={data.iphoneModel}>
            {data.iphoneModel}
          </h4>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center mt-0.5">
            <span className="truncate font-medium text-slate-700 dark:text-slate-300">{data.agentName}</span>
            <span className="mx-1 text-slate-300 dark:text-slate-600 shrink-0">•</span>
            <span className="truncate shrink-0 text-slate-400">{data.province}</span>
          </div>
        </div>

        {/* Contract & Remarks badges */}
        <div className="mt-1.5 space-y-1">
          {data.contractNumber ? (
            <button
              type="button"
              onClick={() => onOpenContract(data)}
              className="w-full text-left px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-[10px] font-mono font-bold text-blue-700 dark:text-blue-300 flex items-center justify-between cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/60"
              title="แก้ไขเลขสัญญา"
            >
              <span className="flex items-center truncate">
                <FileSignature className="w-2.5 h-2.5 mr-1 text-blue-500 shrink-0" />
                <span className="truncate">#{data.contractNumber}</span>
              </span>
              <span className="text-[9px] text-blue-500 underline font-normal shrink-0 ml-1">แก้</span>
            </button>
          ) : data.status !== 'pending' && (
            <button
              type="button"
              onClick={() => onOpenContract(data)}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center cursor-pointer py-0.5"
            >
              <FileSignature className="w-2.5 h-2.5 mr-0.5 text-blue-500" />
              + ระบุเลขสัญญา
            </button>
          )}

          {data.remarks ? (
            <div
              className={clsx(
                "w-full text-left p-1.5 rounded-lg border text-[10px]",
                data.remarks.includes(AUTO_CANCEL_REMARK)
                  ? "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200"
                  : "bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200"
              )}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div
                  onClick={() => onOpenRemark(data)}
                  className="flex items-start gap-1 flex-1 min-w-0 cursor-pointer hover:opacity-85 transition"
                  title="คลิกเพื่อดูหรือแก้ไขหมายเหตุ"
                >
                  {data.remarks.includes(AUTO_CANCEL_REMARK) ? (
                    <ClockAlert className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <StickyNote className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <span className="font-medium text-slate-800 dark:text-slate-200 break-words whitespace-pre-wrap leading-relaxed">
                    {data.remarks}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenRemark(data)}
                  className={clsx(
                    "text-[9px] underline font-normal shrink-0 ml-1 cursor-pointer pt-0.5",
                    data.remarks.includes(AUTO_CANCEL_REMARK)
                      ? "text-rose-600 dark:text-rose-400 hover:text-rose-800"
                      : "text-amber-600 dark:text-amber-400 hover:text-amber-800"
                  )}
                  title="แก้ไขหมายเหตุ"
                >
                  แก้
                </button>
              </div>
            </div>
          ) : (data.status === 'credit_check' || data.status === 'processing') && (
            <button
              type="button"
              onClick={() => onOpenRemark(data)}
              className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center cursor-pointer py-0.5"
            >
              <StickyNote className="w-2.5 h-2.5 mr-0.5 text-amber-500" />
              + ระบุหมายเหตุงานค้าง
            </button>
          )}
        </div>

        {/* Assignee display with Animal Cartoon Avatar */}
        {data.assigneeName ? (
          <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
            <AnimalAvatar identifier={data.assigneeId || data.assigneeName} name={data.assigneeName} size="xs" />
            <span className="truncate font-semibold text-slate-700 dark:text-slate-300">{data.assigneeName}</span>
            {isAssignee && <span className="text-indigo-600 dark:text-indigo-400 font-bold ml-0.5 shrink-0">(คุณ)</span>}
          </div>
        ) : (
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px]">
            <span className={clsx(
              "font-semibold",
              isStuck ? "text-amber-600 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400"
            )}>
              {isStuck ? 'เคสค้าง' : 'เคสใหม่'}
            </span>
            {prevWorker && (
              <span
                className="text-[9px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-900/60 px-1 py-0.5 rounded flex items-center gap-0.5 truncate max-w-[105px]"
                title={`พนักงานที่เคยรับเคสก่อนนี้: ${prevWorker.name}${prevWorker.reason ? ` (เหตุผล: ${prevWorker.reason})` : ''}`}
              >
                <RotateCcw className="w-2 h-2 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">เคยรับ: {prevWorker.name}</span>
              </span>
            )}
          </div>
        )}

        {/* If case has current assignee AND also was returned by previous worker */}
        {data.assigneeName && prevWorker && (
          <div
            className="mt-1 px-1.5 py-0.5 rounded bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-900/50 text-[9px] text-amber-800 dark:text-amber-300 flex items-center gap-1 truncate"
            title={`พนักงานที่เคยรับเคสก่อนนี้: ${prevWorker.name}${prevWorker.reason ? ` (เหตุผล: ${prevWorker.reason})` : ''}`}
          >
            <RotateCcw className="w-2 h-2 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate">เคยรับก่อนนี้: <span className="font-semibold">{prevWorker.name}</span></span>
          </div>
        )}
      </div>

      {/* Action Buttons Footer */}
      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
        {data.status === 'pending' && (
          <div>
            <div className="grid grid-cols-2 gap-1.5 mb-1">
              <button
                type="button"
                onClick={onAccept}
                className={clsx(
                  "py-1.5 px-2 active:scale-95 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center justify-center cursor-pointer transition",
                  isStuck ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"
                )}
              >
                <Check className="w-3 h-3 mr-1" />
                {isStuck ? 'รับต่อ' : 'รับเคส'}
              </button>
              <button
                type="button"
                onClick={() => onOpenHoldModal && onOpenHoldModal(data)}
                className="py-1.5 px-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded-lg text-xs font-semibold flex items-center justify-center cursor-pointer transition"
                title="บันทึกเป็นเคสค้าง (ต้องระบุหมายเหตุ)"
              >
                <PauseCircle className="w-3 h-3 mr-0.5 text-amber-600 dark:text-amber-400" />
                <span>เคสค้าง</span>
              </button>
            </div>
            <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-slate-400">
              <button type="button" onClick={() => onOpenContract(data)} className="hover:text-blue-600 cursor-pointer">+สัญญา</button>
              <button type="button" onClick={() => onOpenRemark(data)} className="hover:text-amber-600 cursor-pointer">+หมายเหตุ</button>
              <button type="button" onClick={onCancel} className="text-rose-400 hover:text-rose-600 cursor-pointer">ยกเลิก</button>
            </div>
          </div>
        )}

        {(data.status === 'credit_check' || data.status === 'processing') && (
          <div className="space-y-1.5">
            {canManage ? (
              <button
                type="button"
                onClick={() => (onCloseCase ? onCloseCase() : onUpdateStatus('closed'))}
                className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center justify-center cursor-pointer transition whitespace-nowrap"
                title="บันทึกจบเคสเสร็จสิ้น (บังคับใส่เลขที่สัญญา)"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                จบเคส
              </button>
            ) : (
              <div className="w-full py-1 px-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg text-[10px] text-center truncate">
                กำลังทำ: {data.assigneeName}
              </div>
            )}

            {canManage && (
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => onOpenHoldModal && onOpenHoldModal(data)}
                  className="py-1 px-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center cursor-pointer transition whitespace-nowrap shadow-2xs"
                  title="บันทึกเป็นเคสค้าง (ต้องระบุหมายเหตุ)"
                >
                  <PauseCircle className="w-2.5 h-2.5 mr-0.5 shrink-0" />
                  <span>เคสค้าง</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenReassign}
                  className="py-1 px-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-[10px] font-semibold flex items-center justify-center cursor-pointer transition whitespace-nowrap"
                  title="โยกเคสไปให้พนักงานคนอื่นดูแลต่อ"
                >
                  <ArrowRightLeft className="w-2.5 h-2.5 mr-0.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>โยกเคส</span>
                </button>
                <button
                  type="button"
                  onClick={onReturnToPending}
                  className="py-1 px-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-[10px] font-semibold flex items-center justify-center cursor-pointer transition whitespace-nowrap"
                  title="คืนสถานะไปรอรับเคส หากรับมาแล้วแต่ไม่ได้ทำต่อ"
                >
                  <RotateCcw className="w-2.5 h-2.5 mr-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>คืนเคส</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-0.5 px-1 text-[10px] text-slate-400">
              <button type="button" onClick={() => onOpenContract(data)} className="hover:text-blue-600 cursor-pointer">สัญญา</button>
              <button type="button" onClick={() => onOpenRemark(data)} className="hover:text-amber-600 cursor-pointer">หมายเหตุ</button>
              {canManage ? (
                <button type="button" onClick={onCancel} className="text-rose-400 hover:text-rose-600 cursor-pointer">ยกเลิก</button>
              ) : isAdmin ? (
                <button type="button" onClick={onTakeOver} className="text-indigo-600 font-bold hover:underline cursor-pointer">ดึงงาน</button>
              ) : null}
            </div>
          </div>
        )}

        {data.status === 'closed' && (
          <div>
            <div className="w-full py-1 px-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-lg text-[10px] font-semibold text-center truncate">
              ✓ จบแล้ว ({data.assigneeName})
            </div>
            <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-slate-400">
              <button type="button" onClick={() => onOpenContract(data)} className="hover:text-blue-600 cursor-pointer">สัญญา</button>
              {isAdmin && (
                <button type="button" onClick={onReopen} className="text-indigo-600 hover:underline cursor-pointer flex items-center">
                  <RotateCcw className="w-2.5 h-2.5 mr-0.5" />กู้คืนเคส
                </button>
              )}
            </div>
          </div>
        )}

        {data.status === 'cancelled' && (
          <div>
            <div className="w-full py-1 px-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-lg text-[10px] font-medium text-center truncate">
              ยกเลิกเคส
            </div>
            <button
              type="button"
              onClick={onReopen}
              className="mt-1 w-full text-[10px] text-slate-500 hover:text-indigo-600 py-0.5 border border-slate-200 dark:border-slate-700 rounded flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5 mr-0.5" />กู้คืนเคส
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const CaseCard: React.FC<CaseCardProps> = ({
  data,
  currentUserId,
  isAdmin = false,
  registeredUsers,
  onAccept,
  onUpdateStatus,
  onCloseCase,
  onCancel,
  onReopen,
  onReturnToPending,
  onDelete,
  onOpenRemark,
  onOpenContract,
  onTakeOver,
  onOpenReassign,
  onOpenHoldModal,
}) => {
  const isAssignee = data.assigneeId === currentUserId;
  const canManage = isAssignee || isAdmin;
  const statusInfo = statusMap[data.status] || statusMap.pending;
  const prevWorker = getPreviousAssignee(data);
  const isStuck = isStuckCase(data, registeredUsers);
  const isNew = isNewCase(data, registeredUsers);

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-2xl shadow-xs border p-4 sm:p-5 flex flex-col justify-between transition hover:shadow-md",
      data.status === 'pending'
        ? isStuck
          ? "border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10"
          : "border-indigo-200 dark:border-indigo-800/60"
        : statusInfo.borderClass,
      data.remarks ? "ring-1 ring-amber-400/30" : "",
      data.contractNumber ? "border-blue-200 dark:border-blue-900/60" : "",
      data.status === 'closed' ? "opacity-80 bg-slate-50/50 dark:bg-slate-900/50" : "",
      data.status === 'cancelled' ? "opacity-80 bg-rose-50/30 dark:bg-rose-950/20" : ""
    )}>
      <div>
        {/* Top Header: Status & Contract & Remarks & Time & Admin Delete */}
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className={clsx(
              "px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center shrink-0",
              data.status === 'pending'
                ? isStuck
                  ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold"
                  : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 font-bold"
                : statusInfo.badgeClass
            )}>
              {data.status === 'pending' && isStuck && <PauseCircle className="w-3.5 h-3.5 mr-1 text-amber-600 dark:text-amber-400" />}
              {data.status === 'pending' && isNew && <Clock className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400 animate-pulse" />}
              {data.status === 'credit_check' && <Search className="w-3 h-3 mr-1 text-blue-600 dark:text-blue-400" />}
              {data.status === 'processing' && <RefreshCw className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400 animate-spin" />}
              {data.status === 'closed' && <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />}
              {data.status === 'cancelled' && <Ban className="w-3 h-3 mr-1 text-rose-600 dark:text-rose-400" />}
              {data.status === 'pending'
                ? isStuck
                  ? 'เคสค้าง'
                  : 'เคสใหม่'
                : statusInfo.label}
            </span>

            {/* Contract Quick Badge in Header */}
            <button
              type="button"
              onClick={() => onOpenContract(data)}
              className={clsx(
                "inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium transition cursor-pointer border",
                data.contractNumber
                  ? "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100"
                  : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 dark:hover:text-blue-400"
              )}
              title={data.contractNumber ? 'แก้ไขเลขที่สัญญา' : 'ระบุสัญญา (ใส่ตอนไหนก็ได้หลังรับงาน)'}
            >
              <FileSignature className="w-3.5 h-3.5 mr-1 text-blue-500" />
              <span>{data.contractNumber ? `สัญญา: ${data.contractNumber}` : '+ สัญญา'}</span>
            </button>
          </div>

          <div className="flex items-center text-slate-400 dark:text-slate-500 text-xs gap-1.5">
            {/* Quick Remarks Button in Top Header */}
            <button
              type="button"
              onClick={() => onOpenRemark(data)}
              className={clsx(
                "inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium transition cursor-pointer border",
                data.remarks
                  ? "bg-amber-100/90 dark:bg-amber-950/70 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-200"
                  : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-amber-300 hover:text-amber-600 dark:hover:text-amber-400"
              )}
              title={data.remarks ? 'แก้ไขหมายเหตุงานค้าง' : 'เพิ่มหมายเหตุ (ระบุว่างานค้างเพราะอะไร)'}
            >
              <StickyNote className="w-3.5 h-3.5 mr-1 text-amber-500" />
              <span>{data.remarks ? 'หมายเหตุ' : '+ หมายเหตุ'}</span>
            </button>

            <div 
              className="flex items-center text-slate-400 dark:text-slate-500 text-xs shrink-0 whitespace-nowrap"
              title={format(data.createdAt, 'd MMMM yyyy HH:mm:ss น.', { locale: th })}
            >
              <Clock className="w-3 h-3 mr-1" />
              <span>{format(data.createdAt, 'd MMM HH:mm น.', { locale: th })}</span>
              
              {/* DELETE BUTTON: ONLY VISIBLE AND ACCESSIBLE TO SOLE ADMIN (gametpl) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="ml-1.5 p-1 text-slate-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 rounded transition cursor-pointer"
                  title="ลบเคสนี้"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Case Info */}
        <div className="space-y-2 mb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <Smartphone className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">รุ่น iPhone</span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-900 dark:text-white">{data.iphoneModel}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new CustomEvent('open-refinance-guide', { detail: { model: data.iphoneModel } }));
                    }}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition cursor-pointer"
                    title="เปิดดูเรทเงินและค่างวดของรุ่นนี้"
                  >
                    <Zap className="w-2.5 h-2.5 mr-0.5 text-amber-500 fill-amber-500" />
                    เรทผ่อน
                  </button>
                </div>
              </div>
            </div>

            {isAdmin && (
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
                <Crown className="w-3 h-3 mr-1 text-amber-500" />
                แอดมินคุมได้
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-slate-50 dark:bg-slate-800/80 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-medium">ตัวแทน (ผู้ส่ง)</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">{data.agentName}</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-medium">จังหวัด</span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block flex items-center">
                <MapPin className="w-3 h-3 mr-1 text-slate-400" />
                {data.province}
              </span>
            </div>
          </div>

          {/* Previous Assignee if returned */}
          {prevWorker && (
            <div className="mt-2.5 p-2.5 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/70 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <span className="text-[10px] text-amber-800 dark:text-amber-400 block font-medium">
                      พนักงานที่เคยรับเคสก่อนนี้
                    </span>
                    <div className="flex items-center space-x-1.5 font-bold text-amber-950 dark:text-amber-200 text-xs truncate">
                      <AnimalAvatar
                        identifier={data.previousAssigneeId || prevWorker.id || prevWorker.name}
                        name={prevWorker.name}
                        size="xs"
                      />
                      <span className="truncate">{prevWorker.name}</span>
                    </div>
                  </div>
                </div>
                {prevWorker.returnedAt && (
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 shrink-0 font-mono ml-1">
                    {format(prevWorker.returnedAt, 'HH:mm น.', { locale: th })}
                  </span>
                )}
              </div>
              {prevWorker.reason && (
                <div className="mt-1.5 pt-1.5 border-t border-amber-200/60 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-200 flex items-start">
                  <span className="text-amber-700 dark:text-amber-400 font-semibold shrink-0 mr-1">เหตุผล:</span>
                  <span className="line-clamp-2">{prevWorker.reason}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* CONTRACT NUMBER BOX (Editable anytime after job acceptance) */}
        {data.contractNumber ? (
          <div className="mb-3 p-2.5 bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl">
            <div className="flex items-center justify-between text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">
              <span className="flex items-center">
                <FileSignature className="w-3.5 h-3.5 mr-1 text-blue-600 dark:text-blue-400" />
                เลขที่สัญญา:
              </span>
              <button
                type="button"
                onClick={() => onOpenContract(data)}
                className="text-[11px] text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-white underline font-medium cursor-pointer"
              >
                แก้ไขสัญญา
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-blue-950 dark:text-blue-100 font-mono tracking-wider">
                {data.contractNumber}
              </p>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                บันทึกแล้ว
              </span>
            </div>
            {data.contractUpdatedBy && (
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center justify-between border-t border-blue-200/50 dark:border-blue-900/40 pt-1">
                <span>ระบุโดย: {data.contractUpdatedBy}</span>
                {data.contractUpdatedAt && (
                  <span>{format(data.contractUpdatedAt, 'HH:mm น.', { locale: th })}</span>
                )}
              </div>
            )}
          </div>
        ) : data.status !== 'pending' && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => onOpenContract(data)}
              className="w-full py-1.5 px-3 rounded-xl border border-dashed border-blue-300 dark:border-blue-800/80 bg-blue-50/40 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100/50 text-xs font-medium transition flex items-center justify-center cursor-pointer"
            >
              <FileSignature className="w-3.5 h-3.5 mr-1 text-blue-500" />
              + ระบุเลขที่สัญญา (ใส่ตอนไหนก็ได้หลังรับงาน)
            </button>
          </div>
        )}

        {/* Remarks Box if present */}
        {data.remarks ? (
          <div className={clsx(
            "mb-3 p-2.5 rounded-xl border",
            data.remarks.includes(AUTO_CANCEL_REMARK)
              ? "bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60"
              : "bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60"
          )}>
            <div className={clsx(
              "flex items-center justify-between text-xs font-bold mb-1",
              data.remarks.includes(AUTO_CANCEL_REMARK)
                ? "text-rose-800 dark:text-rose-300"
                : "text-amber-800 dark:text-amber-300"
            )}>
              <span className="flex items-center">
                {data.remarks.includes(AUTO_CANCEL_REMARK) ? (
                  <ClockAlert className="w-3.5 h-3.5 mr-1 text-rose-600 dark:text-rose-400" />
                ) : (
                  <StickyNote className="w-3.5 h-3.5 mr-1 text-amber-600 dark:text-amber-400" />
                )}
                {data.remarks.includes(AUTO_CANCEL_REMARK) ? 'ยกเลิกอัตโนมัติ / หมายเหตุ:' : 'สาเหตุงานค้าง / หมายเหตุ:'}
              </span>
              <button
                type="button"
                onClick={() => onOpenRemark(data)}
                className={clsx(
                  "text-[11px] underline font-medium cursor-pointer",
                  data.remarks.includes(AUTO_CANCEL_REMARK)
                    ? "text-rose-700 dark:text-rose-300 hover:text-rose-900"
                    : "text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-white"
                )}
              >
                แก้ไข
              </button>
            </div>
            <p className={clsx(
              "text-xs font-medium leading-relaxed break-words whitespace-pre-wrap",
              data.remarks.includes(AUTO_CANCEL_REMARK)
                ? "text-rose-950 dark:text-rose-200"
                : "text-slate-800 dark:text-slate-200"
            )}>
              {data.remarks}
            </p>
            {data.remarksUpdatedBy && (
              <div className={clsx(
                "text-[10px] mt-1.5 flex items-center justify-between border-t pt-1",
                data.remarks.includes(AUTO_CANCEL_REMARK)
                  ? "text-rose-500/80 dark:text-rose-400/80 border-rose-200/50 dark:border-rose-900/40"
                  : "text-slate-400 dark:text-slate-500 border-amber-200/50 dark:border-amber-900/40"
              )}>
                <span>บันทึกโดย: {data.remarksUpdatedBy}</span>
                {data.remarksUpdatedAt && (
                  <span>{format(data.remarksUpdatedAt, 'HH:mm น.', { locale: th })}</span>
                )}
              </div>
            )}
          </div>
        ) : (data.status === 'credit_check' || data.status === 'processing') ? (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => onOpenRemark(data)}
              className="w-full py-1.5 px-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70 text-xs font-medium transition flex items-center justify-center cursor-pointer shadow-2xs"
            >
              <StickyNote className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              ระบุหมายเหตุ (งานค้างเพราะอะไร)
            </button>
          </div>
        ) : null}
      </div>

      {/* Footer / Workflow Actions */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
        {data.status === 'pending' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onAccept}
                className={clsx(
                  "py-2.5 px-3 rounded-xl active:scale-[0.98] text-white text-xs font-bold shadow-sm transition flex items-center justify-center cursor-pointer",
                  isStuck
                    ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200 dark:shadow-none"
                    : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 dark:shadow-none"
                )}
              >
                <Check className="w-4 h-4 mr-1.5" />
                {isStuck ? 'รับเคสนี้ต่อ' : 'กดรับเคสนี้'}
              </button>

              <button
                type="button"
                onClick={() => onOpenHoldModal && onOpenHoldModal(data)}
                className="py-2.5 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-2xs"
                title="บันทึกเป็นเคสค้าง (ต้องระบุหมายเหตุ)"
              >
                <PauseCircle className="w-4 h-4 mr-1.5 text-amber-600 dark:text-amber-400" />
                <span>เคสค้าง</span>
              </button>
            </div>
            
            {/* Quick Contract on Pending */}
            <button
              type="button"
              onClick={() => onOpenContract(data)}
              className="w-full py-1.5 px-3 rounded-xl border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-medium transition flex items-center justify-center cursor-pointer"
            >
              <FileSignature className="w-3.5 h-3.5 mr-1 text-blue-500" />
              {data.contractNumber ? `สัญญา: ${data.contractNumber}` : '+ ระบุเลขที่สัญญา'}
            </button>

            {/* Remarks Button for Pending */}
            <button
              type="button"
              onClick={() => onOpenRemark(data)}
              className="w-full py-1.5 px-3 rounded-xl border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-medium transition flex items-center justify-center cursor-pointer"
            >
              <StickyNote className="w-3.5 h-3.5 mr-1 text-amber-500" />
              {data.remarks ? 'ดู/แก้ไขหมายเหตุงานค้าง' : 'ระบุหมายเหตุ (งานค้างเพราะอะไร)'}
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="w-full py-1.5 px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition flex items-center justify-center cursor-pointer"
            >
              <Ban className="w-3.5 h-3.5 mr-1" />
              ยกเลิกเคสนี้
            </button>
          </div>
        ) : data.status === 'cancelled' ? (
          <div className="space-y-2">
            <div className="text-center py-1 text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-100 dark:border-rose-900/40">
              เคสนี้ถูกยกเลิกแล้ว
            </div>
            
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onOpenContract(data)}
                className="py-1 px-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 text-[11px] border border-slate-200 dark:border-slate-800 transition flex items-center justify-center cursor-pointer"
              >
                <FileSignature className="w-3 h-3 mr-1 text-blue-500" />
                {data.contractNumber ? 'ดูสัญญา' : '+ สัญญา'}
              </button>

              <button
                type="button"
                onClick={() => onOpenRemark(data)}
                className="py-1 px-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 text-[11px] border border-slate-200 dark:border-slate-800 transition flex items-center justify-center cursor-pointer"
              >
                <StickyNote className="w-3 h-3 mr-1 text-amber-500" />
                {data.remarks ? 'ดูหมายเหตุ' : '+ หมายเหตุ'}
              </button>
            </div>

            <button
              type="button"
              onClick={onReopen}
              className="w-full py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1 text-indigo-500" />
              กู้คืนเคส / นำกลับมารอรับ
            </button>
          </div>
        ) : data.status === 'closed' ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs bg-emerald-50/70 dark:bg-emerald-950/30 px-2.5 py-1.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300">
              <span className="flex items-center gap-1.5 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                {data.assigneeName && (
                  <AnimalAvatar identifier={data.assigneeId || data.assigneeName} name={data.assigneeName} size="xs" />
                )}
                <span className="truncate">จบเคสแล้ว โดย {data.assigneeName || 'พนักงาน'}</span>
              </span>
              {data.completedAt && (
                <span 
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0 whitespace-nowrap"
                  title={format(data.completedAt, 'd MMMM yyyy HH:mm:ss น.', { locale: th })}
                >
                  {format(data.completedAt, 'd MMM HH:mm น.', { locale: th })}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onOpenContract(data)}
                className="py-1 px-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 text-[11px] border border-slate-200 dark:border-slate-700 transition flex items-center justify-center cursor-pointer"
              >
                <FileSignature className="w-3 h-3 mr-1 text-blue-500" />
                {data.contractNumber ? `สัญญา: ${data.contractNumber}` : '+ ระบุสัญญา'}
              </button>

              <button
                type="button"
                onClick={() => onOpenRemark(data)}
                className="py-1 px-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 text-[11px] border border-slate-200 dark:border-slate-700 transition flex items-center justify-center cursor-pointer"
              >
                <StickyNote className="w-3 h-3 mr-1 text-amber-500" />
                {data.remarks ? 'ดูหมายเหตุ' : '+ หมายเหตุ'}
              </button>
            </div>

            {/* Admin can reopen closed cases */}
            {isAdmin && (
              <button
                type="button"
                onClick={onReopen}
                className="w-full py-1 px-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 text-[11px] border border-dashed border-slate-200 dark:border-slate-700 transition flex items-center justify-center cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 mr-1 text-indigo-500" />
                👑 แอดมิน: กู้คืนเคสกลับมาทำใหม่
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Assignee Badge */}
            <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center">
                <User className="w-3.5 h-3.5 mr-1 text-slate-400" />
                ผู้รับผิดชอบ:
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <AnimalAvatar identifier={data.assigneeId || data.assigneeName || 'user'} name={data.assigneeName || 'พนักงาน'} size="xs" />
                <span>{data.assigneeName} {isAssignee ? '(คุณ)' : ''}</span>
              </span>
            </div>

            {/* ADMIN SUPERPOWERS: Take Over if admin and not assignee */}
            {isAdmin && !isAssignee && (
              <button
                type="button"
                onClick={onTakeOver}
                className="w-full py-1.5 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition flex items-center justify-center cursor-pointer mb-1"
                title="ดึงเคสนี้มาเป็นความรับผิดชอบของแอดมินทันที"
              >
                <Crown className="w-3 h-3 mr-1 text-amber-500" />
                ดึงมาทำเอง (สิทธิ์แอดมิน)
              </button>
            )}

            {/* Step Progression Buttons */}
            <div className="space-y-1.5 pt-1">
              {canManage ? (
                <>
                  {(data.status === 'processing' || data.status === 'credit_check') && (
                    <>
                      <button
                        type="button"
                        onClick={() => (onCloseCase ? onCloseCase() : onUpdateStatus('closed'))}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs shadow-emerald-200 dark:shadow-none transition flex items-center justify-center cursor-pointer whitespace-nowrap"
                        title="บันทึกจบเคสเสร็จสิ้น (บังคับใส่เลขที่สัญญา)"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        เสร็จสิ้น -&gt; จบเคส
                      </button>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenHoldModal && onOpenHoldModal(data)}
                          className="py-1.5 px-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white text-xs font-bold transition flex items-center justify-center cursor-pointer whitespace-nowrap shadow-2xs"
                          title="บันทึกเป็นเคสค้าง (ต้องระบุหมายเหตุ)"
                        >
                          <PauseCircle className="w-3.5 h-3.5 mr-1 shrink-0" />
                          <span>เคสค้าง</span>
                        </button>
                        <button
                          type="button"
                          onClick={onOpenReassign}
                          className="py-1.5 px-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-semibold transition flex items-center justify-center cursor-pointer whitespace-nowrap"
                          title="โยกเคสไปให้พนักงานคนอื่นดูแลต่อ"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>โยกเคส</span>
                        </button>
                        <button
                          type="button"
                          onClick={onReturnToPending}
                          className="py-1.5 px-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-xs font-semibold transition flex items-center justify-center cursor-pointer whitespace-nowrap"
                          title="คืนสถานะไปรอรับเคส หากรับมาแล้วแต่ไม่ได้ทำต่อ"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>คืนเคส</span>
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-1 text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                  กำลังดำเนินการโดย {data.assigneeName}
                </div>
              )}

              {/* Quick Contract & Remarks Row */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenContract(data)}
                  className="py-1.5 px-2 rounded-xl border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-medium transition flex items-center justify-center cursor-pointer truncate"
                  title="ระบุหรือแก้ไขเลขที่สัญญา"
                >
                  <FileSignature className="w-3.5 h-3.5 mr-1 text-blue-500 shrink-0" />
                  <span className="truncate">{data.contractNumber ? `สัญญา: ${data.contractNumber}` : '+ สัญญา'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenRemark(data)}
                  className="py-1.5 px-2 rounded-xl border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-medium transition flex items-center justify-center cursor-pointer truncate"
                  title="ระบุหรือแก้ไขหมายเหตุงานค้าง"
                >
                  <StickyNote className="w-3.5 h-3.5 mr-1 text-amber-500 shrink-0" />
                  <span className="truncate">{data.remarks ? 'หมายเหตุ' : '+ หมายเหตุ'}</span>
                </button>
              </div>

              {/* Cancel case action */}
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-1.5 px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition flex items-center justify-center cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 mr-1" />
                ยกเลิกเคส
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
