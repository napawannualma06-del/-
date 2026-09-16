import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { 
  Plus, 
  Check, 
  Clock, 
  CheckCircle2, 
  User, 
  Smartphone, 
  MapPin, 
  Send, 
  Bell, 
  Volume2, 
  Trash2,
  Filter,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

export interface Case {
  id: string;
  agentName: string;
  iphoneModel: string;
  province: string;
  status: 'pending' | 'credit_check' | 'processing' | 'closed';
  assigneeId?: string;
  assigneeName?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

const statusMap: Record<Case['status'], { label: string; badgeClass: string; borderClass: string; stepNumber: number }> = {
  pending: { 
    label: 'รอรับเคส', 
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    borderClass: 'border-slate-200',
    stepNumber: 0
  },
  credit_check: { 
    label: 'เช็คเครดิต', 
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-300',
    borderClass: 'border-blue-200',
    stepNumber: 1
  },
  processing: { 
    label: 'กำลังทำเคส', 
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-300',
    borderClass: 'border-amber-200',
    stepNumber: 2
  },
  closed: { 
    label: 'จบเคสแล้ว', 
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    borderClass: 'border-emerald-200',
    stepNumber: 3
  },
};

const POPULAR_IPHONES = [
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 16',
  'iPhone 15 Pro Max',
  'iPhone 15 Pro',
  'iPhone 15',
  'iPhone 14 Pro Max',
  'iPhone 14',
  'iPhone 13'
];

const POPULAR_PROVINCES = [
  'กรุงเทพมหานคร',
  'นนทบุรี',
  'ปทุมธานี',
  'สมุทรปราการ',
  'เชียงใหม่',
  'ชลบุรี',
  'ขอนแก่น',
  'นครราชสีมา',
  'สงขลา',
  'ภูเก็ต'
];

// Play a gentle notification chime
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (_) {
    // AudioContext blocked or unmuted
  }
}

export function Queue() {
  const { user } = useStore();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'mine' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form inputs
  const [formData, setFormData] = useState({
    agentName: '',
    iphoneModel: 'iPhone 15 Pro Max',
    province: 'กรุงเทพมหานคร',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<string>('default');

  const initialLoadRef = useRef(true);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission);
    }

    const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData: Case[] = [];
      
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !initialLoadRef.current) {
          const newCaseData = change.doc.data() as Case;
          
          // Sound Alert
          playNotificationChime();

          // Browser Push Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('🔔 มีเคสใหม่เข้ามา!', {
                body: `ตัวแทน: ${newCaseData.agentName} | ${newCaseData.iphoneModel} (${newCaseData.province})`,
                icon: '/vite.svg'
              });
            } catch (e) {
              console.warn('Browser notification error', e);
            }
          }
        }
      });

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
        iphoneModel: 'iPhone 15 Pro Max',
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
    if (!user) return;
    try {
      const caseRef = doc(db, 'cases', caseId);
      const updates: any = {
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

  const handleDeleteCase = async (caseId: string) => {
    if (!window.confirm('คุณต้องการลบเคสนี้ใช่หรือไม่?')) return;
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
      if (c.assigneeId !== user?.uid || c.status === 'closed') return false;
    } else if (activeFilter === 'closed') {
      if (c.status !== 'closed') return false;
    } else {
      // 'all' tab shows active cases first, or all non-closed
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
  const myCount = cases.filter(c => c.assigneeId === user?.uid && c.status !== 'closed').length;
  const closedCount = cases.filter(c => c.status === 'closed').length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center">
            กระดานคิวงาน
            <span className="ml-2.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
              {cases.filter(c => c.status !== 'closed').length} เคสรอทำ
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            รับเคส ตรวจสอบเครดิต และอัปเดตสถานะงานได้แบบเรียลไทม์
          </p>
        </div>

        <div className="flex items-center gap-2">
          {notificationStatus !== 'granted' && (
            <button
              type="button"
              onClick={requestNotification}
              className="inline-flex items-center px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 shadow-sm transition"
              title="เปิดการแจ้งเตือนเคสใหม่"
            >
              <Bell className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              เปิดแจ้งเตือนเคสใหม่
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center px-4 py-2.5 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {showAddForm ? 'ปิดแบบฟอร์ม' : 'เพิ่มเคสใหม่'}
          </button>
        </div>
      </div>

      {/* CREATE CASE FORM MODAL / COLLAPSIBLE */}
      {showAddForm && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-indigo-100 ring-1 ring-indigo-500/10">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center">
              <Plus className="w-4 h-4 mr-2 text-indigo-600" />
              ลงข้อมูลเคสใหม่เข้าระบบ
            </h2>
            <span className="text-xs text-slate-400">สถานะเริ่มต้น: รอรับเคส</span>
          </div>

          <form onSubmit={handleAddCase} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Agent Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  ชื่อตัวแทน (ผู้ส่งเคส) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="เช่น ตัวแทนสมบัติ สาขาบางนา"
                    value={formData.agentName}
                    onChange={(e) => setFormData({ ...formData, agentName: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                  <Send className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* iPhone Model */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  รุ่น iPhone *
                </label>
                <div className="relative">
                  <select
                    value={formData.iphoneModel}
                    onChange={(e) => setFormData({ ...formData, iphoneModel: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition appearance-none"
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
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  จังหวัด *
                </label>
                <div className="relative">
                  <select
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition appearance-none"
                  >
                    {POPULAR_PROVINCES.map((prov) => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition disabled:opacity-50 flex items-center"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {isSubmitting ? 'กำลังบันทึก...' : 'เพิ่มเคสเข้าคิว'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200 shadow-sm">
        {/* Filter Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition",
              activeFilter === 'all'
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            เคสทั้งหมด ({cases.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('pending')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center",
              activeFilter === 'pending'
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            รอรับเคส
            {pendingCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'pending' ? "bg-white text-indigo-700" : "bg-indigo-100 text-indigo-700"
              )}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('mine')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center",
              activeFilter === 'mine'
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            เคสของฉัน
            {myCount > 0 && (
              <span className={clsx(
                "ml-1.5 px-1.5 py-0.2 rounded-full text-[10px]",
                activeFilter === 'mine' ? "bg-white text-indigo-700" : "bg-amber-100 text-amber-700"
              )}>
                {myCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('closed')}
            className={clsx(
              "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition",
              activeFilter === 'closed'
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            จบเคสแล้ว ({closedCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="ค้นหาตัวแทน, รุ่น, จังหวัด..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
        </div>
      </div>

      {/* Case List Grid */}
      {filteredCases.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-700">ไม่พบเคสตามเงื่อนไขที่เลือก</h3>
          <p className="text-xs text-slate-400 mt-1">
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
              isAdmin={user?.role === 'admin'}
              onAccept={() => handleAcceptCase(c.id)}
              onUpdateStatus={(status) => handleUpdateStatus(c.id, status)}
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
  isAdmin?: boolean;
  onAccept: () => void;
  onUpdateStatus: (status: 'processing' | 'closed') => void;
  onDelete?: () => void;
}

const CaseCard: React.FC<CaseCardProps> = ({
  data,
  currentUserId,
  isAdmin,
  onAccept,
  onUpdateStatus,
  onDelete
}) => {
  const isAssignee = data.assigneeId === currentUserId;
  const statusInfo = statusMap[data.status];

  return (
    <div className={clsx(
      "bg-white rounded-2xl shadow-sm border p-4 sm:p-5 flex flex-col justify-between transition hover:shadow-md",
      statusInfo.borderClass,
      data.status === 'closed' ? "opacity-75 bg-slate-50/50" : ""
    )}>
      <div>
        {/* Top Header: Status & Time */}
        <div className="flex items-center justify-between mb-3">
          <span className={clsx(
            "px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center",
            statusInfo.badgeClass
          )}>
            {data.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
            {data.status === 'credit_check' && <Search className="w-3 h-3 mr-1 text-blue-600" />}
            {data.status === 'processing' && <RefreshCw className="w-3 h-3 mr-1 text-amber-600 animate-spin" />}
            {data.status === 'closed' && <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />}
            {statusInfo.label}
          </span>

          <div className="flex items-center text-slate-400 text-xs">
            <Clock className="w-3 h-3 mr-1" />
            <span>{format(data.createdAt, 'HH:mm น.', { locale: th })}</span>
            {isAdmin && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-2 p-1 text-slate-300 hover:text-red-600 rounded transition"
                title="ลบเคส (แอดมิน)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Case Info */}
        <div className="space-y-2 mb-4">
          <div className="flex items-start">
            <Smartphone className="w-4 h-4 mr-2 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">รุ่น iPhone</span>
              <span className="text-base font-bold text-slate-900">{data.iphoneModel}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-slate-50 p-2 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">ตัวแทน (ผู้ส่ง)</span>
              <span className="text-xs font-semibold text-slate-800 truncate block">{data.agentName}</span>
            </div>

            <div className="bg-slate-50 p-2 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">จังหวัด</span>
              <span className="text-xs font-semibold text-slate-800 truncate block flex items-center">
                <MapPin className="w-3 h-3 mr-1 text-slate-400" />
                {data.province}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Workflow Actions */}
      <div className="pt-3 border-t border-slate-100">
        {data.status === 'pending' ? (
          <button
            type="button"
            onClick={onAccept}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold shadow-sm shadow-indigo-200 transition flex items-center justify-center"
          >
            <Check className="w-4 h-4 mr-1.5" />
            กดรับเคสนี้ (เริ่มเช็คเครดิต)
          </button>
        ) : (
          <div className="space-y-2">
            {/* Assignee Badge */}
            <div className="flex items-center justify-between text-xs bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
              <span className="text-slate-500 text-[11px] flex items-center">
                <User className="w-3.5 h-3.5 mr-1 text-slate-400" />
                ผู้รับผิดชอบ:
              </span>
              <span className="font-semibold text-slate-800">
                {data.assigneeName} {isAssignee ? '(คุณ)' : ''}
              </span>
            </div>

            {/* Step Progression Buttons (Enabled for assignee or admin) */}
            {(isAssignee || isAdmin) && (
              <div className="pt-1">
                {data.status === 'credit_check' && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus('processing')}
                    className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white text-xs font-bold shadow-sm shadow-amber-200 transition flex items-center justify-center"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    ผ่านเครดิต -&gt; เริ่มทำเคส
                  </button>
                )}

                {data.status === 'processing' && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus('closed')}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold shadow-sm shadow-emerald-200 transition flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    เสร็จสิ้น -&gt; จบเคส
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
