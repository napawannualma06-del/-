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
  RotateCcw
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
  const { user } = useStore();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'mine' | 'closed' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>('default');

  // Form State
  const [formData, setFormData] = useState({
    agentName: '',
    iphoneModel: 'iPhone 16 Pro Max',
    province: 'กรุงเทพมหานคร',
  });

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

  const handleAddCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agentName.trim() || !formData.iphoneModel || !formData.province) return;
    
    setIsSubmitting(true);
    try {
      const newCase = {
        agentName: formData.agentName.trim(),
        iphoneModel: formData.iphoneModel,
        province: formData.province,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      await addDoc(collection(db, 'cases'), newCase);
      setFormData({
        agentName: '',
        iphoneModel: 'iPhone 16 Pro Max',
        province: 'กรุงเทพมหานคร',
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
    if (!window.confirm('คุณต้องการลบเคสนี้ออกจากระบบอย่างถาวรใช่หรือไม่?')) return;
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
      return matchAgent || matchModel || matchProvince || matchAssignee;
    }

    return true;
  });

  const pendingCount = cases.filter(c => c.status === 'pending').length;
  const myCount = cases.filter(c => c.assigneeId === user?.uid && c.status !== 'closed' && c.status !== 'cancelled').length;
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
            รับเคส ตรวจสอบเครดิต ยกเลิกเคส และอัปเดตสถานะงานได้แบบเรียลไทม์
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
              onAccept={() => handleAcceptCase(c.id)}
              onUpdateStatus={(status) => handleUpdateStatus(c.id, status)}
              onCancel={() => handleCancelCase(c.id)}
              onReopen={() => handleReopenCase(c.id)}
              onDelete={() => handleDeleteCase(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CaseCardProps {
  data: Case;
  currentUserId?: string;
  onAccept: () => void;
  onUpdateStatus: (status: 'processing' | 'closed') => void;
  onCancel: () => void;
  onReopen: () => void;
  onDelete: () => void;
}

const CaseCard: React.FC<CaseCardProps> = ({
  data,
  currentUserId,
  onAccept,
  onUpdateStatus,
  onCancel,
  onReopen,
  onDelete
}) => {
  const isAssignee = data.assigneeId === currentUserId;
  const statusInfo = statusMap[data.status] || statusMap.pending;

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-2xl shadow-xs border p-4 sm:p-5 flex flex-col justify-between transition hover:shadow-md",
      statusInfo.borderClass,
      data.status === 'closed' ? "opacity-80 bg-slate-50/50 dark:bg-slate-900/50" : "",
      data.status === 'cancelled' ? "opacity-80 bg-rose-50/30 dark:bg-rose-950/20" : ""
    )}>
      <div>
        {/* Top Header: Status & Time & Delete */}
        <div className="flex items-center justify-between mb-3">
          <span className={clsx(
            "px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center",
            statusInfo.badgeClass
          )}>
            {data.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
            {data.status === 'credit_check' && <Search className="w-3 h-3 mr-1 text-blue-600 dark:text-blue-400" />}
            {data.status === 'processing' && <RefreshCw className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400 animate-spin" />}
            {data.status === 'closed' && <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />}
            {data.status === 'cancelled' && <Ban className="w-3 h-3 mr-1 text-rose-600 dark:text-rose-400" />}
            {statusInfo.label}
          </span>

          <div className="flex items-center text-slate-400 dark:text-slate-500 text-xs">
            <Clock className="w-3 h-3 mr-1" />
            <span>{format(data.createdAt, 'HH:mm น.', { locale: th })}</span>
            
            {/* Delete button accessible to everyone since admin role restriction is removed */}
            <button
              type="button"
              onClick={onDelete}
              className="ml-2 p-1 text-slate-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 rounded transition cursor-pointer"
              title="ลบเคสนี้"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Case Info */}
        <div className="space-y-2 mb-4">
          <div className="flex items-start">
            <Smartphone className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">รุ่น iPhone</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">{data.iphoneModel}</span>
            </div>
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
          </div>
        ) : (
          <div className="space-y-2">
            {/* Assignee Badge */}
            <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center">
                <User className="w-3.5 h-3.5 mr-1 text-slate-400" />
                ผู้รับผิดชอบ:
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {data.assigneeName} {isAssignee ? '(คุณ)' : ''}
              </span>
            </div>

            {/* Step Progression Buttons */}
            <div className="space-y-1.5 pt-1">
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
