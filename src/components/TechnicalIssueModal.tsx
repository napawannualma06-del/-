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
import { TechnicalIssue, TechnicalIssueStatus } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  Wrench, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Search, 
  X, 
  Send, 
  Trash2, 
  Filter, 
  Plus, 
  Check, 
  MessageSquare,
  Hash,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

interface TechnicalIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'new' | 'list';
  highlightIssueId?: string;
}

const STATUS_CONFIG: Record<
  TechnicalIssueStatus, 
  { label: string; badgeClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: 'รอแก้',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    icon: Clock,
  },
  in_progress: {
    label: 'รับเรื่อง',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
    icon: Wrench,
  },
  resolved: {
    label: 'เสร็จสิ้น',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    icon: CheckCircle2,
  },
};

export function TechnicalIssueModal({ 
  isOpen, 
  onClose, 
  defaultTab = 'list',
  highlightIssueId 
}: TechnicalIssueModalProps) {
  const { user } = useStore();
  const isAdmin = isUserAdmin(user);

  const [activeTab, setActiveTab] = useState<'new' | 'list'>(defaultTab);
  const [issues, setIssues] = useState<TechnicalIssue[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State - หัวข้อ, เลข SN, กล่อง Text แค่นั้นพอ
  const [title, setTitle] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Filter & Search in list
  const [statusFilter, setStatusFilter] = useState<'all' | TechnicalIssueStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Editing Admin Note
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    if (isOpen && highlightIssueId) {
      setActiveTab('list');
      setStatusFilter('all');
    }
  }, [isOpen, highlightIssueId]);

  // Subscribe to technical_issues collection
  useEffect(() => {
    if (!isOpen) return;

    const q = query(collection(db, 'technical_issues'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: TechnicalIssue[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as TechnicalIssue);
        });
        setIssues(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching technical issues:', err);
        handleFirestoreError(err, OperationType.GET, 'technical_issues');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  // Submit new issue
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      alert('กรุณากรอกหัวข้อปัญหาและรายละเอียด');
      return;
    }

    setIsSubmitting(true);
    const now = Date.now();

    try {
      await addDoc(collection(db, 'technical_issues'), {
        title: title.trim(),
        serialNumber: serialNumber.trim() || '-',
        description: description.trim(),
        status: 'pending', // สถานะเริ่มต้น: รอแก้
        reporterId: user?.uid || 'anonymous',
        reporterName: user?.name || 'พนักงาน',
        reporterUsername: user?.username || '',
        reporterAvatarEmoji: user?.avatarEmoji || '👤',
        createdAt: now,
        updatedAt: now,
      });

      // Clear form
      setTitle('');
      setSerialNumber('');
      setDescription('');
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setActiveTab('list'); // Switch to list so they see their reported issue
      }, 1200);
    } catch (err) {
      console.error('Failed to submit technical issue:', err);
      handleFirestoreError(err, OperationType.CREATE, 'technical_issues');
      alert('เกิดข้อผิดพลาดในการส่งแจ้งปัญหา กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Issue Status (รอแก้, รับเรื่อง, เสร็จสิ้น)
  const handleUpdateStatus = async (issueId: string, newStatus: TechnicalIssueStatus) => {
    try {
      const now = Date.now();
      const issueRef = doc(db, 'technical_issues', issueId);
      const updateData: Partial<TechnicalIssue> = {
        status: newStatus,
        updatedAt: now,
        statusChangedBy: user?.name || 'ทีมงาน',
      };

      if (newStatus === 'resolved') {
        updateData.resolvedAt = now;
        updateData.resolvedBy = user?.name || 'ทีมงาน';
      }

      await updateDoc(issueRef, updateData);

      // Notify in team chat if moves to in_progress or resolved
      const target = issues.find((i) => i.id === issueId);
      if (target && target.reporterUsername && (newStatus === 'in_progress' || newStatus === 'resolved')) {
        try {
          const isProgress = newStatus === 'in_progress';
          const titleText = target.title;
          const snText = target.serialNumber && target.serialNumber !== '-' ? `(SN: ${target.serialNumber})` : '';
          const statusLabel = isProgress ? '🛠️ รับเรื่องแล้ว' : '✅ ปัญหาได้รับการแก้ไขเสร็จสิ้น';

          await addDoc(collection(db, 'team_chats'), {
            senderId: user?.uid || 'support',
            senderName: user?.name || 'ทีมงาน',
            senderUsername: user?.username || 'support',
            senderRole: 'admin',
            senderAvatarEmoji: isProgress ? '🛠️' : '✅',
            text: `${statusLabel}: เรื่อง "${titleText}" ${snText} ของ @${target.reporterUsername}`,
            mentions: [target.reporterUsername],
            createdAt: now,
          });
        } catch (chatErr) {
          console.warn('Failed to send notification to team chat:', chatErr);
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'technical_issues');
      alert('ไม่สามารถอัปเดตสถานะได้');
    }
  };

  // Save Admin Note
  const handleSaveNote = async (issueId: string) => {
    setIsSavingNote(true);
    try {
      const now = Date.now();
      const issueRef = doc(db, 'technical_issues', issueId);
      await updateDoc(issueRef, {
        adminNote: noteInput.trim(),
        updatedAt: now,
      });
      setEditingNoteId(null);
      setNoteInput('');
    } catch (err) {
      console.error('Failed to save admin note:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'technical_issues');
      alert('ไม่สามารถบันทึกหมายเหตุได้');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Delete Issue
  const handleDelete = async (issueId: string) => {
    if (!window.confirm('คุณต้องการลบรายการแจ้งปัญหานี้ใช่หรือไม่?')) return;
    try {
      await deleteDoc(doc(db, 'technical_issues', issueId));
    } catch (err) {
      console.error('Failed to delete issue:', err);
      handleFirestoreError(err, OperationType.DELETE, 'technical_issues');
      alert('ไม่สามารถลบรายการได้');
    }
  };

  // Counts
  const pendingCount = useMemo(() => issues.filter((i) => i.status === 'pending').length, [issues]);
  const inProgressCount = useMemo(() => issues.filter((i) => i.status === 'in_progress').length, [issues]);
  const resolvedCount = useMemo(() => issues.filter((i) => i.status === 'resolved').length, [issues]);

  // Filtered List
  const filteredIssues = useMemo(() => {
    return issues.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchSN = item.serialNumber.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchReporter = item.reporterName.toLowerCase().includes(q);
        return matchTitle || matchSN || matchDesc || matchReporter;
      }
      return true;
    });
  }, [issues, statusFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-xs">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  แจ้งปัญหาด้านเทคนิค
                </h2>
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-white">
                    รอแก้ {pendingCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                แจ้งเรื่องปัญหาเทคนิค ติดตามสถานะได้แบบเรียลไทม์
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 pt-3 gap-2 bg-white dark:bg-slate-900 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={clsx(
              'pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer',
              activeTab === 'new'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            )}
          >
            <Plus className="w-4 h-4" />
            <span>แจ้งปัญหาใหม่</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={clsx(
              'pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer',
              activeTab === 'list'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            )}
          >
            <FileText className="w-4 h-4" />
            <span>รายการปัญหา ({issues.length})</span>
            {pendingCount > 0 && (
              <span className="ml-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'new' ? (
            /* TAB 1: แบบฟอร์มแจ้งปัญหา แบบง่ายๆ แค่หัวข้อ, เลข SN, กล่อง Text */
            <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-4 py-2">
              {submitSuccess && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>ส่งข้อมูลแจ้งปัญหาเรียบร้อยแล้ว! ระบบกำลังนำไปหน้ารายการ...</span>
                </div>
              )}

              {/* ข้อมูลผู้ส่งแจ้ง (ระบุให้อัตโนมัติ) */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <AnimalAvatar
                    avatarEmoji={user?.avatarEmoji}
                    identifier={user?.username || user?.uid || 'user'}
                    name={user?.name || 'User'}
                    size="sm"
                  />
                  <div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 block">ผู้ส่งแจ้ง</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {user?.name || 'สมาชิก'} {user?.username ? `(@${user.username})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* 1. หัวข้อ */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  หัวข้อปัญหา <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ปิดพร็อกซี่ , เปิด Find my Phone, โหลดแอพไม่ได้"
                  className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition placeholder:text-slate-400"
                />
                {/* ปุ่มเลือกด่วนตามตัวอย่าง */}
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">กดเลือกด่วน:</span>
                  {['ปิดพร็อกซี่', 'เปิด Find my Phone', 'โหลดแอพไม่ได้'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTitle(preset)}
                      className={clsx(
                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer border',
                        title === preset
                          ? 'bg-rose-500 text-white border-rose-500 shadow-2xs'
                          : 'bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 hover:text-rose-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      )}
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. เลข SN */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>เลข SN (Serial Number)</span>
                  <span className="text-[11px] text-slate-400 font-normal">(ถ้ามี หรือระบุ - ได้)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="เช่น F17DT0Y00D77 หรือเลขเครื่อง"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition placeholder:text-slate-400"
                  />
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* 3. ข้อมูลลูกค้า */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ข้อมูลลูกค้า <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-y"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !title.trim() || !description.trim()}
                  className={clsx(
                    "px-5 py-2.5 rounded-xl text-xs font-bold text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs",
                    isSubmitting || !title.trim() || !description.trim()
                      ? "bg-indigo-400 dark:bg-indigo-800 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
                  )}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'กำลังส่งแจ้ง...' : 'ส่งแจ้งปัญหา'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* TAB 2: รายการแจ้งปัญหา พร้อมตัวกรองและเปลี่ยนสถานะ */
            <div className="space-y-3.5">
              {/* Filter Row */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1">
                {/* Status Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0',
                      statusFilter === 'all'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    )}
                  >
                    ทั้งหมด ({issues.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('pending')}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1',
                      statusFilter === 'pending'
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                    )}
                  >
                    <Clock className="w-3 h-3" />
                    <span>รอแก้ ({pendingCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('in_progress')}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1',
                      statusFilter === 'in_progress'
                        ? 'bg-sky-500 text-white'
                        : 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 hover:bg-sky-100'
                    )}
                  >
                    <Wrench className="w-3 h-3" />
                    <span>รับเรื่อง ({inProgressCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('resolved')}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 flex items-center gap-1',
                      statusFilter === 'resolved'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                    )}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>เสร็จสิ้น ({resolvedCount})</span>
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-56">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาหัวข้อ, SN, ผู้แจ้ง..."
                    className="w-full pl-8 pr-7 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1.5 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Issue List */}
              {loading ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  กำลังโหลดข้อมูล...
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="py-14 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6">
                  <Wrench className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {searchQuery ? 'ไม่พบข้อมูลตามคำค้นหา' : 'ยังไม่มีรายการแจ้งปัญหาในหมวดนี้'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('new')}
                    className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>แจ้งปัญหาใหม่</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredIssues.map((issue) => {
                    const statusObj = STATUS_CONFIG[issue.status] || STATUS_CONFIG.pending;
                    const StatusIcon = statusObj.icon;
                    const isEditingNote = editingNoteId === issue.id;

                    const isHighlighted = highlightIssueId === issue.id;

                    return (
                      <div
                        key={issue.id}
                        id={`tech-issue-${issue.id}`}
                        className={clsx(
                          "p-4 rounded-xl border transition shadow-2xs bg-white dark:bg-slate-800/90 space-y-3",
                          isHighlighted && "ring-2 ring-indigo-500 shadow-lg bg-indigo-50/20 dark:bg-indigo-950/20",
                          issue.status === 'pending'
                            ? "border-amber-200 dark:border-amber-900/50"
                            : issue.status === 'in_progress'
                            ? "border-sky-200 dark:border-sky-900/50"
                            : "border-slate-200 dark:border-slate-800 opacity-90"
                        )}
                      >
                        {/* Top: Title, SN, and Status Badge */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                                {issue.title}
                              </h3>
                              {issue.serialNumber && issue.serialNumber !== '-' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                                  SN: {issue.serialNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 flex-wrap">
                              <span>แจ้งเมื่อ:</span>
                              <span className="font-medium text-slate-600 dark:text-slate-300">
                                {format(issue.createdAt, 'd MMM yyyy HH:mm น.', { locale: th })}
                              </span>
                              <span>•</span>
                              <span>ผู้ส่งแจ้ง:</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                                <AnimalAvatar
                                  avatarEmoji={issue.reporterAvatarEmoji}
                                  identifier={issue.reporterUsername || issue.reporterId}
                                  name={issue.reporterName}
                                  size="xs"
                                />
                                {issue.reporterName}
                              </span>
                            </div>
                          </div>

                          {/* Current Status Badge */}
                          <div className="shrink-0 flex items-center gap-1.5">
                            <span
                              className={clsx(
                                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border",
                                statusObj.badgeClass
                              )}
                            >
                              <StatusIcon className="w-3.5 h-3.5" />
                              <span>{statusObj.label}</span>
                            </span>

                            {/* Delete (Admin only) */}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDelete(issue.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                                title="ลบรายการนี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Middle: กล่อง Text รายละเอียดปัญหา */}
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {issue.description}
                        </div>

                        {/* Admin Note / Response (if any) */}
                        {issue.adminNote && !isEditingNote && (
                          <div className="p-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200/70 dark:border-indigo-900/50 text-xs space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-900 dark:text-indigo-300">
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                                หมายเหตุ / การตอบกลับ:
                              </span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNoteId(issue.id);
                                    setNoteInput(issue.adminNote || '');
                                  }}
                                  className="text-[10px] text-indigo-600 hover:underline cursor-pointer"
                                >
                                  แก้ไข
                                </button>
                              )}
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                              {issue.adminNote}
                            </p>
                          </div>
                        )}

                        {/* Edit Note Form */}
                        {isEditingNote && (
                          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs">
                            <label className="font-bold text-slate-700 dark:text-slate-300 block">
                              บันทึกหมายเหตุ:
                            </label>
                            <textarea
                              rows={2}
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              placeholder="เช่น ส่งเคลมศูนย์แล้ว, เปลี่ยนอะไหล่เรียบร้อย..."
                              className="w-full p-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingNoteId(null)}
                                className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                              >
                                ยกเลิก
                              </button>
                              <button
                                type="button"
                                disabled={isSavingNote}
                                onClick={() => handleSaveNote(issue.id)}
                                className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                              >
                                {isSavingNote ? 'กำลังบันทึก...' : 'บันทึก'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Bottom: Status Changer Controls (กดเปลี่ยนสถานะ: รอแก้ / รับเรื่อง / เสร็จสิ้น) */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 mr-1">
                              เปลี่ยนสถานะ:
                            </span>

                            {/* ปุ่ม รอแก้ */}
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(issue.id, 'pending')}
                              disabled={issue.status === 'pending'}
                              className={clsx(
                                "px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border",
                                issue.status === 'pending'
                                  ? "bg-amber-500 text-white border-amber-600 shadow-2xs font-bold"
                                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                              )}
                            >
                              <Clock className="w-3 h-3" />
                              <span>รอแก้</span>
                            </button>

                            {/* ปุ่ม รับเรื่อง */}
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(issue.id, 'in_progress')}
                              disabled={issue.status === 'in_progress'}
                              className={clsx(
                                "px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border",
                                issue.status === 'in_progress'
                                  ? "bg-sky-500 text-white border-sky-600 shadow-2xs font-bold"
                                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-950/50"
                              )}
                            >
                              <Wrench className="w-3 h-3" />
                              <span>รับเรื่อง</span>
                            </button>

                            {/* ปุ่ม เสร็จสิ้น */}
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(issue.id, 'resolved')}
                              disabled={issue.status === 'resolved'}
                              className={clsx(
                                "px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border",
                                issue.status === 'resolved'
                                  ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs font-bold"
                                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              )}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>เสร็จสิ้น</span>
                            </button>
                          </div>

                          {/* Add Note Button for Admin if not yet set */}
                          {isAdmin && !issue.adminNote && !isEditingNote && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(issue.id);
                                setNoteInput('');
                              }}
                              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>+ เพิ่มหมายเหตุตอบกลับ</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs text-slate-500">
          <span>ระบบแจ้งปัญหาเทคนิค ไทย พลัส+</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
