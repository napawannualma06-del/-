import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore } from '../store/useStore';
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
  FileText,
  FileSignature,
  Crown,
  ShieldCheck,
  UserCheck,
  ArrowRightLeft,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

export interface Case {
  id: string;
  agentName: string;
  iphoneModel: string;
  province: string;
  status: 'pending' | 'credit_check' | 'processing' | 'closed' | 'cancelled';
  contractNumber?: string;
  contractUpdatedAt?: number;
  contractUpdatedBy?: string;
  remarks?: string;
  remarksUpdatedAt?: number;
  remarksUpdatedBy?: string;
  assigneeId?: string;
  assigneeName?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  cancelledAt?: number;
}

export const statusMap: Record<Case['status'], { label: string; badgeClass: string; borderClass: string; stepNumber: number }> = {
  pending: {
    label: 'รอรับเคส',
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    borderClass: 'border-slate-200 dark:border-slate-800',
    stepNumber: 0,
  },
  credit_check: {
    label: 'กำลังเช็คเครดิต',
    badgeClass: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    borderClass: 'border-blue-200 dark:border-blue-800/60',
    stepNumber: 1,
  },
  processing: {
    label: 'กำลังทำเคส',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    borderClass: 'border-amber-200 dark:border-amber-800/60',
    stepNumber: 2,
  },
  closed: {
    label: 'จบเคสแล้ว',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    borderClass: 'border-emerald-200 dark:border-emerald-800/60',
    stepNumber: 3,
  },
  cancelled: {
    label: 'ยกเลิกเคส',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    borderClass: 'border-rose-200 dark:border-rose-800/60',
    stepNumber: -1,
  },
};

const POPULAR_IPHONES = [
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 16 Plus',
  'iPhone 16',
  'iPhone 15 Pro Max',
  'iPhone 15 Pro',
  'iPhone 15 Plus',
  'iPhone 15',
  'iPhone 14 Pro Max',
  'iPhone 14 Pro',
  'iPhone 14',
  'iPhone 13',
  'iPhone 12',
  'iPhone 11',
];

const POPULAR_PROVINCES = [
  'กรุงเทพมหานคร',
  'นนทบุรี',
  'ปทุมธานี',
  'สมุทรปราการ',
  'ชลบุรี',
  'เชียงใหม่',
  'นครราชสีมา',
  'ขอนแก่น',
  'ภูเก็ต',
  'สงขลา',
  'ระยอง',
  'อุบลราชธานี',
  'นครปฐม',
  'สุราษฎร์ธานี',
  'พิษณุโลก',
  'อุดรธานี',
  'เชียงราย',
  'สระบุรี',
  'พระนครศรีอยุธยา',
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
  const { user, registeredUsers } = useStore();
  const isAdmin = user?.role === 'admin' && (user?.username?.toLowerCase() === 'gametpl' || user?.uid === 'admin_gametpl');
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'mine' | 'contract' | 'remarks' | 'closed' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default');

  // Form State
  const [formData, setFormData] = useState({
    agentName: '',
    iphoneModel: 'iPhone 16 Pro Max',
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

  // Admin Reassign Modal State
  const [activeReassignCase, setActiveReassignCase] = useState<Case | null>(null);
  const [selectedReassignUser, setSelectedReassignUser] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

  const initialLoadRef = useRef(true);

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
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'cases');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
    if (!isAdmin) return;
    setActiveReassignCase(c);
    setSelectedReassignUser(c.assigneeId || (registeredUsers[0]?.uid || ''));
  };

  const handleSaveReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReassignCase || !selectedReassignUser || !isAdmin) return;
    const targetUser = registeredUsers.find(u => u.uid === selectedReassignUser || u.username === selectedReassignUser);
    if (!targetUser) return;
    setIsReassigning(true);
    try {
      const caseRef = doc(db, 'cases', activeReassignCase.id);
      await updateDoc(caseRef, {
        assigneeId: targetUser.uid,
        assigneeName: targetUser.name,
        updatedAt: Date.now(),
      });
      setActiveReassignCase(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${activeReassignCase.id}`);
    } finally {
      setIsReassigning(false);
    }
  };

  const handleAddCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agentName.trim() || !formData.iphoneModel || !formData.province) return;
    
    setIsSubmitting(true);
    try {
      const newCase: Record<string, unknown> = {
        agentName: formData.agentName.trim(),
        iphoneModel: formData.iphoneModel,
        province: formData.province,
        status: 'pending',
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

      await addDoc(collection(db, 'cases'), newCase);
      setFormData({
        agentName: '',
        iphoneModel: 'iPhone 16 Pro Max',
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
    try {
      const caseRef = doc(db, 'cases', caseId);
      await updateDoc(caseRef, {
        assigneeId: user.uid,
        assigneeName: user.name,
        status: 'credit_check',
        updatedAt: Date.now(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseId}`);
    }
  };

  const handleUpdateStatus = async (caseId: string, newStatus: 'processing' | 'closed') => {
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
      alert('เฉพาะผู้ดูแลระบบ (แอดมิน gametpl) เท่านั้นที่สามารถลบเคสได้');
      return;
    }
    if (!window.confirm('คุณต้องการลบเคสนี้ออกจากระบบอย่างถาวรใช่หรือไม่? (สิทธิ์แอดมิน)')) return;
    try {
      await deleteDoc(doc(db, 'cases', caseId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cases/${caseId}`);
    }
  };

  // Filter & Search Logic
  const filteredCases = cases.filter((c) => {
    if (activeFilter === 'pending') {
      if (c.status !== 'pending') return false;
    } else if (activeFilter === 'mine') {
      if (c.assigneeId !== user?.uid || c.status === 'closed' || c.status === 'cancelled') return false;
    } else if (activeFilter === 'contract') {
      if (!c.contractNumber || c.status === 'cancelled') return false;
    } else if (activeFilter === 'remarks') {
      if (!c.remarks || c.status === 'closed' || c.status === 'cancelled') return false;
    } else if (activeFilter === 'closed') {
      if (c.status !== 'closed') return false;
    } else if (activeFilter === 'cancelled') {
      if (c.status !== 'cancelled') return false;
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

  const pendingCount = cases.filter(c => c.status === 'pending').length;
  const myCount = cases.filter(c => c.assigneeId === user?.uid && c.status !== 'closed' && c.status !== 'cancelled').length;
  const contractCount = cases.filter(c => !!c.contractNumber && c.status !== 'cancelled').length;
  const remarksCount = cases.filter(c => !!c.remarks && c.status !== 'closed' && c.status !== 'cancelled').length;
  const closedCount = cases.filter(c => c.status === 'closed').length;
  const cancelledCount = cases.filter(c => c.status === 'cancelled').length;
  const activeCount = cases.filter(c => c.status !== 'closed' && c.status !== 'cancelled').length;

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
              {activeCount} เคสรอทำ
            </span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            ไทย พลัส+ | รับเคส ตรวจสอบเครดิต ยกเลิกเคส และอัปเดตสถานะงานได้แบบเรียลไทม์
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

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center px-4 py-2.5 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {showAddForm ? 'ปิดแบบฟอร์ม' : 'เพิ่มเคสใหม่'}
          </button>
        </div>
      </div>

      {/* CREATE CASE FORM MODAL / COLLAPSIBLE */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl shadow-sm border border-indigo-100 dark:border-slate-800 ring-1 ring-indigo-500/10">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center">
              <Plus className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
              ลงข้อมูลเคสใหม่เข้าระบบ
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">สถานะเริ่มต้น: รอรับเคส</span>
          </div>

          <form onSubmit={handleAddCase} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Agent Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  ชื่อตัวแทน (ผู้ส่งเคส) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="เช่น ตัวแทนสมบัติ สาขาบางนา"
                    value={formData.agentName}
                    onChange={(e) => setFormData({ ...formData, agentName: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition"
                  />
                  <Send className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* iPhone Model */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  รุ่น iPhone *
                </label>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Filter Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer",
              activeFilter === 'all'
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            เคสทั้งหมด ({cases.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('pending')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center cursor-pointer",
              activeFilter === 'pending'
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            รอรับเคส
            {pendingCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'pending' ? "bg-white text-indigo-700" : "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
              )}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('mine')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center cursor-pointer",
              activeFilter === 'mine'
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            เคสของฉัน
            {myCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'mine' ? "bg-white text-indigo-700" : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
              )}>
                {myCount}
              </span>
            )}
          </button>

          {/* Contract Filter Tab */}
          <button
            type="button"
            onClick={() => setActiveFilter('contract')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center cursor-pointer",
              activeFilter === 'contract'
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <FileSignature className="w-3 h-3 mr-1 text-blue-500" />
            มีเลขสัญญา
            {contractCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'contract' ? "bg-white text-blue-800 font-bold" : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
              )}>
                {contractCount}
              </span>
            )}
          </button>

          {/* Remarks / Stuck Cases Filter */}
          <button
            type="button"
            onClick={() => setActiveFilter('remarks')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center cursor-pointer",
              activeFilter === 'remarks'
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <StickyNote className="w-3 h-3 mr-1 text-amber-500" />
            ติดหมายเหตุ/ค้าง
            {remarksCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'remarks' ? "bg-white text-amber-800 font-bold" : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
              )}>
                {remarksCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('closed')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center cursor-pointer",
              activeFilter === 'closed'
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            จบเคสแล้ว ({closedCount})
          </button>

          {/* New Cancelled Status Filter Tab */}
          <button
            type="button"
            onClick={() => setActiveFilter('cancelled')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center cursor-pointer",
              activeFilter === 'cancelled'
                ? "bg-rose-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <Ban className="w-3 h-3 mr-1 text-rose-500" />
            ยกเลิกเคส
            {cancelledCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'cancelled' ? "bg-white text-rose-700" : "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
              )}>
                {cancelledCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="ค้นหาตัวแทน, รุ่น, จังหวัด..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
        </div>
      </div>

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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCases.map((c) => (
            <CaseCard
              key={c.id}
              data={c}
              currentUserId={user?.uid}
              isAdmin={isAdmin}
              onAccept={() => handleAcceptCase(c.id)}
              onUpdateStatus={(status) => handleUpdateStatus(c.id, status)}
              onCancel={() => handleCancelCase(c.id)}
              onReopen={() => handleReopenCase(c.id)}
              onDelete={() => handleDeleteCase(c.id)}
              onOpenRemark={handleOpenRemark}
              onOpenContract={handleOpenContract}
              onTakeOver={() => handleTakeOverCase(c.id)}
              onOpenReassign={() => handleOpenReassign(c)}
            />
          ))}
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

      {/* ADMIN REASSIGN MODAL DIALOG (Only for admin gametpl) */}
      {isAdmin && activeReassignCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-amber-50/70 dark:bg-amber-950/30">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center">
                    โอนเคสงาน (สิทธิ์แอดมิน gametpl)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeReassignCase.iphoneModel} • ผู้รับผิดชอบเดิม: {activeReassignCase.assigneeName || 'ไม่มี'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveReassignCase(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReassign} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  เลือกพนักงานที่ต้องการมอบหมายเคสนี้:
                </label>
                <select
                  value={selectedReassignUser}
                  onChange={(e) => setSelectedReassignUser(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white dark:focus:bg-slate-800 transition cursor-pointer"
                >
                  {registeredUsers.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.name} (@{u.username}) {u.username.toLowerCase() === 'gametpl' ? '👑 [แอดมิน]' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  เมื่อโอนเคสแล้ว ระบบจะเปลี่ยนผู้รับผิดชอบเป็นพนักงานท่านนี้ทันทีแบบเรียลไทม์
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveReassignCase(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isReassigning}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                  {isReassigning ? 'กำลังโอนเคส...' : 'ยืนยันการโอนเคส'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface CaseCardProps {
  data: Case;
  currentUserId?: string;
  isAdmin?: boolean;
  onAccept: () => void;
  onUpdateStatus: (status: 'processing' | 'closed') => void;
  onCancel: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onOpenRemark: (c: Case) => void;
  onOpenContract: (c: Case) => void;
  onTakeOver: () => void;
  onOpenReassign: () => void;
}

const CaseCard: React.FC<CaseCardProps> = ({
  data,
  currentUserId,
  isAdmin = false,
  onAccept,
  onUpdateStatus,
  onCancel,
  onReopen,
  onDelete,
  onOpenRemark,
  onOpenContract,
  onTakeOver,
  onOpenReassign,
}) => {
  const isAssignee = data.assigneeId === currentUserId;
  const canManage = isAssignee || isAdmin;
  const statusInfo = statusMap[data.status] || statusMap.pending;

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-2xl shadow-xs border p-4 sm:p-5 flex flex-col justify-between transition hover:shadow-md",
      statusInfo.borderClass,
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
              statusInfo.badgeClass
            )}>
              {data.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
              {data.status === 'credit_check' && <Search className="w-3 h-3 mr-1 text-blue-600 dark:text-blue-400" />}
              {data.status === 'processing' && <RefreshCw className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400 animate-spin" />}
              {data.status === 'closed' && <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />}
              {data.status === 'cancelled' && <Ban className="w-3 h-3 mr-1 text-rose-600 dark:text-rose-400" />}
              {statusInfo.label}
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

            <div className="flex items-center text-slate-400 dark:text-slate-500 text-xs">
              <Clock className="w-3 h-3 mr-1" />
              <span>{format(data.createdAt, 'HH:mm น.', { locale: th })}</span>
              
              {/* DELETE BUTTON: ONLY VISIBLE AND ACCESSIBLE TO SOLE ADMIN (gametpl) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="ml-1.5 p-1 text-slate-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 rounded transition cursor-pointer"
                  title="ลบเคสนี้ (สิทธิ์แอดมิน gametpl)"
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
                <span className="text-base font-bold text-slate-900 dark:text-white">{data.iphoneModel}</span>
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
        {data.remarks && (
          <div className="mb-3 p-2.5 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl">
            <div className="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">
              <span className="flex items-center">
                <StickyNote className="w-3.5 h-3.5 mr-1 text-amber-600 dark:text-amber-400" />
                สาเหตุงานค้าง / หมายเหตุ:
              </span>
              <button
                type="button"
                onClick={() => onOpenRemark(data)}
                className="text-[11px] text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-white underline font-medium cursor-pointer"
              >
                แก้ไข
              </button>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed break-words">
              {data.remarks}
            </p>
            {data.remarksUpdatedBy && (
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center justify-between border-t border-amber-200/50 dark:border-amber-900/40 pt-1">
                <span>บันทึกโดย: {data.remarksUpdatedBy}</span>
                {data.remarksUpdatedAt && (
                  <span>{format(data.remarksUpdatedAt, 'HH:mm น.', { locale: th })}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer / Workflow Actions */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
        {data.status === 'pending' ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onAccept}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold shadow-sm shadow-indigo-200 dark:shadow-none transition flex items-center justify-center cursor-pointer"
            >
              <Check className="w-4 h-4 mr-1.5" />
              กดรับเคสนี้ (เริ่มเช็คเครดิต)
            </button>
            
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
              <span className="flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
                จบเคสแล้ว โดย {data.assigneeName || 'พนักงาน'}
              </span>
              {data.completedAt && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  {format(data.completedAt, 'HH:mm น.', { locale: th })}
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
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center">
                {data.assigneeName} {isAssignee ? '(คุณ)' : ''}
              </span>
            </div>

            {/* ADMIN SUPERPOWERS: Take Over or Reassign */}
            {isAdmin && (
              <div className="flex items-center gap-1.5 py-0.5">
                {!isAssignee && (
                  <button
                    type="button"
                    onClick={onTakeOver}
                    className="flex-1 py-1 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition flex items-center justify-center cursor-pointer"
                    title="ดึงเคสนี้มาเป็นความรับผิดชอบของแอดมินทันที"
                  >
                    <Crown className="w-3 h-3 mr-1 text-amber-500" />
                    ดึงมาทำเอง
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenReassign}
                  className="flex-1 py-1 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center justify-center cursor-pointer"
                  title="เปลี่ยนตัวผู้รับผิดชอบงานเคสนี้"
                >
                  <ArrowRightLeft className="w-3 h-3 mr-1 text-blue-500" />
                  โอนเคสให้คนอื่น
                </button>
              </div>
            )}

            {/* Step Progression Buttons */}
            <div className="space-y-1.5 pt-1">
              {canManage ? (
                <>
                  {data.status === 'credit_check' && (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus('processing')}
                      className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white text-xs font-bold shadow-xs shadow-amber-200 dark:shadow-none transition flex items-center justify-center cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      ผ่านเครดิต -&gt; เริ่มทำเคส
                    </button>
                  )}

                  {data.status === 'processing' && (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus('closed')}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs shadow-emerald-200 dark:shadow-none transition flex items-center justify-center cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      เสร็จสิ้น -&gt; จบเคส
                    </button>
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
