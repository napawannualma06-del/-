import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Search, 
  Phone, 
  Copy, 
  Check, 
  MapPin, 
  Bike, 
  ShieldAlert, 
  Flame, 
  ExternalLink,
  ChevronDown,
  RotateCcw,
  Sparkles,
  Award,
  Share2,
  Plus,
  Trash2,
  UserCheck,
  Building,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { 
  MESSENGERS_DATA, 
  MESSENGERS_SOURCE_INFO, 
  UNIQUE_PROVINCES, 
  ALL_THAI_PROVINCES,
  Messenger, 
  searchMessengers 
} from '../data/messengers';
import { db } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useStore } from '../store/useStore';

interface MessengerDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProvince?: string;
}

export function MessengerDirectoryModal({
  isOpen,
  onClose,
  initialProvince = 'all',
}: MessengerDirectoryModalProps) {
  const { user } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvince, setSelectedProvince] = useState<string>(initialProvince || 'all');
  const [sortBy, setSortBy] = useState<'id' | 'jobs' | 'name' | 'province'>('id');
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [copiedTextNotice, setCopiedTextNotice] = useState<string | null>(null);

  // Custom messengers state from Firestore
  const [customMessengers, setCustomMessengers] = useState<Messenger[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // New Messenger Form Fields
  const [newName, setNewName] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newProvince, setNewProvince] = useState('กรุงเทพมหานคร');
  const [newNote, setNewNote] = useState('');
  const [newJobCount, setNewJobCount] = useState<string>('0');

  // Update initial province when modal opens or prop changes
  useEffect(() => {
    if (isOpen && initialProvince) {
      setSelectedProvince(initialProvince);
    }
  }, [isOpen, initialProvince]);

  // Real-time listener for custom messengers in Firestore
  useEffect(() => {
    if (!isOpen) return;

    try {
      const unsub = onSnapshot(
        collection(db, 'custom_messengers'),
        (snapshot) => {
          const list: Messenger[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              id: docSnap.id,
              name: data.name || '',
              nickname: data.nickname || undefined,
              phone: data.phone || '',
              rawPhone: (data.phone || '').replace(/[^0-9]/g, ''),
              province: data.province || 'กรุงเทพมหานคร',
              provincesList: [data.province || 'กรุงเทพมหานคร'],
              jobCount: typeof data.jobCount === 'number' ? data.jobCount : 0,
              note: data.note || undefined,
              isCustom: true,
              createdAt: data.createdAt,
              createdBy: data.createdBy,
            });
          });
          setCustomMessengers(list);
        },
        (err) => {
          console.warn('Could not listen to custom_messengers, falling back to local state:', err);
        }
      );

      return () => unsub();
    } catch (e) {
      console.warn('Firestore snapshot error:', e);
    }
  }, [isOpen]);

  // Popular province quick filter buttons
  const popularProvinces = [
    'all',
    'กรุงเทพมหานคร',
    'ชลบุรี',
    'ปทุมธานี',
    'นนทบุรี',
    'สมุทรปราการ',
    'เชียงใหม่',
    'พระนครศรีอยุธยา',
    'ระยอง',
    'นครราชสีมา',
    'ภูเก็ต',
  ];

  // Combined messengers list (Custom + Default 98 Thunder Cloud)
  const combinedMessengers = useMemo(() => {
    return [...customMessengers, ...MESSENGERS_DATA];
  }, [customMessengers]);

  const filteredMessengers = useMemo(() => {
    let list = searchMessengers(searchTerm, selectedProvince, combinedMessengers);

    // Sorting
    return list.sort((a, b) => {
      // Prioritize custom messengers if sorting by id or default
      if (sortBy === 'id') {
        if (a.isCustom && !b.isCustom) return -1;
        if (!a.isCustom && b.isCustom) return 1;
        if (typeof a.id === 'number' && typeof b.id === 'number') {
          return a.id - b.id;
        }
        return String(a.id).localeCompare(String(b.id));
      }
      if (sortBy === 'jobs') {
        const jobsA = a.jobCount ?? -1;
        const jobsB = b.jobCount ?? -1;
        return jobsB - jobsA;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'th');
      }
      if (sortBy === 'province') {
        return a.province.localeCompare(b.province, 'th');
      }
      return 0;
    });
  }, [searchTerm, selectedProvince, sortBy, combinedMessengers]);

  if (!isOpen) return null;

  const handleCopyPhone = (m: Messenger, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(m.rawPhone);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyFullContact = (m: Messenger, e: React.MouseEvent) => {
    e.stopPropagation();
    const nicknameStr = m.nickname ? ` (${m.nickname})` : '';
    const jobStr = m.jobCount ? ` [วิ่งแล้ว ${m.jobCount} งาน]` : '';
    const noteStr = m.note ? ` [หมายเหตุ: ${m.note}]` : '';
    const text = `🛵 ข้อมูลแมสเซนเจอร์: ${m.name}${nicknameStr} | โทร: ${m.phone} | พื้นที่: ${m.province}${jobStr}${noteStr}`;
    navigator.clipboard.writeText(text);
    setCopiedTextNotice(`คัดลอกข้อมูล "${m.name}" แล้ว`);
    setTimeout(() => setCopiedTextNotice(null), 2500);
  };

  const handleAddMessenger = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = newName.trim();
    const trimmedPhone = newPhone.trim();

    if (!trimmedName) {
      setFormError('กรุณาระบุชื่อ-นามสกุลของแมสเซนเจอร์');
      return;
    }

    if (!trimmedPhone || trimmedPhone.replace(/[^0-9]/g, '').length < 9) {
      setFormError('กรุณาระบุเบอร์โทรศัพท์ที่ถูกต้อง (อย่างน้อย 9-10 หลัก)');
      return;
    }

    // Format phone nicely (e.g. 081-234-5678 or 02-123-4567)
    let formattedPhone = trimmedPhone;
    const cleanDigits = trimmedPhone.replace(/[^0-9]/g, '');
    if (cleanDigits.length === 10) {
      formattedPhone = `${cleanDigits.slice(0, 3)}-${cleanDigits.slice(3, 6)}-${cleanDigits.slice(6)}`;
    } else if (cleanDigits.length === 9) {
      formattedPhone = `${cleanDigits.slice(0, 2)}-${cleanDigits.slice(2, 5)}-${cleanDigits.slice(5)}`;
    }

    setIsSubmitting(true);
    try {
      const parsedJobs = parseInt(newJobCount, 10);
      const payload = {
        name: trimmedName,
        nickname: newNickname.trim() || null,
        phone: formattedPhone,
        rawPhone: cleanDigits,
        province: newProvince,
        note: newNote.trim() || null,
        jobCount: isNaN(parsedJobs) ? 0 : Math.max(0, parsedJobs),
        createdAt: Date.now(),
        createdBy: user?.name || user?.username || 'Admin/Staff',
      };

      await addDoc(collection(db, 'custom_messengers'), payload);

      // Reset form
      setNewName('');
      setNewNickname('');
      setNewPhone('');
      setNewProvince('กรุงเทพมหานคร');
      setNewNote('');
      setNewJobCount('0');
      setShowAddModal(false);
      setCopiedTextNotice(`เพิ่มรายชื่อ "${trimmedName}" เรียบร้อยแล้ว`);
      setTimeout(() => setCopiedTextNotice(null), 3000);
    } catch (err: any) {
      console.error('Error adding custom messenger:', err);
      setFormError(err.message || 'ไม่สามารถบันทึกข้อมูลแมสเซนเจอร์ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomMessenger = async (m: Messenger, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!m.isCustom) return;

    const confirmed = window.confirm(`คุณต้องการลบรายชื่อแมส "${m.name}" ออกจากระบบใช่หรือไม่?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'custom_messengers', String(m.id)));
      setCopiedTextNotice(`ลบรายชื่อ "${m.name}" แล้ว`);
      setTimeout(() => setCopiedTextNotice(null), 2500);
    } catch (err) {
      console.error('Failed to delete messenger:', err);
      alert('เกิดข้อผิดพลาดในการลบรายชื่อ กรุณาลองใหม่');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-sky-50/90 via-indigo-50/50 to-white dark:from-slate-900 dark:via-sky-950/20 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-sky-200 dark:shadow-none shrink-0">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>{MESSENGERS_SOURCE_INFO.title}</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                  ทั้งหมด {combinedMessengers.length} คน
                </span>
                {customMessengers.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    +แมสเพิ่มเติม {customMessengers.length} คน
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ค้นหาและโทรติดต่อแมสเซนเจอร์วิ่งรับ-ส่งเครื่อง ทุกพื้นที่ กรุงเทพฯ และต่างจังหวัด
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* ปุ่มเพิ่มแมสใหม่ */}
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-200 dark:shadow-none transition cursor-pointer"
              title="เพิ่มรายชื่อและเบอร์โทรแมสเซนเจอร์ใหม่ลงในระบบ"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">เพิ่มแมสใหม่</span>
              <span className="sm:hidden">เพิ่ม</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Copy Floating Toast Notice */}
        {copiedTextNotice && (
          <div className="mx-4 sm:mx-6 mt-3 p-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center justify-between shadow-lg animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{copiedTextNotice}</span>
            </div>
            <span className="text-[10px] opacity-80">พร้อมวางในแชท / หมายเหตุเคส</span>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
          <div className="flex flex-col md:flex-row gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="ค้นหาชื่อแมส, ชื่อเล่น, เบอร์โทร (เช่น 084...), หรือจังหวัด..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Province Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative min-w-[170px]">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <select
                  value={selectedProvince}
                  onChange={(e) => setSelectedProvince(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none shadow-2xs cursor-pointer"
                >
                  <option value="all">📍 ทุกจังหวัด (ทั้งหมด)</option>
                  {UNIQUE_PROVINCES.map((prov) => (
                    <option key={prov} value={prov}>
                      {prov}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              </div>

              {/* Sort Dropdown */}
              <div className="relative min-w-[140px]">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full pl-3 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none shadow-2xs cursor-pointer"
                >
                  <option value="id">ลำดับที่ (1-98+)</option>
                  <option value="jobs">งานที่วิ่ง (มากที่สุด)</option>
                  <option value="name">ชื่อแมส (ก-ฮ)</option>
                  <option value="province">จังหวัด (ก-ฮ)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              </div>

              {(searchTerm || selectedProvince !== 'all' || sortBy !== 'id') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedProvince('all');
                    setSortBy('id');
                  }}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 transition cursor-pointer"
                  title="รีเซ็ตตัวกรองทั้งหมด"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Popular Provinces Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0 mr-1">
              ยอดนิยม:
            </span>
            {popularProvinces.map((prov) => {
              const isSelected = selectedProvince === prov;
              return (
                <button
                  key={prov}
                  type="button"
                  onClick={() => setSelectedProvince(prov)}
                  className={clsx(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap",
                    isSelected
                      ? "bg-sky-600 text-white shadow-xs font-bold"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  {prov === 'all' ? 'ทั้งหมด' : prov}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results Counter Bar */}
        <div className="px-4 sm:px-6 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            แสดง <strong className="text-slate-900 dark:text-white font-bold">{filteredMessengers.length}</strong> คน
            {selectedProvince !== 'all' && <span> ในจังหวัด <strong className="text-sky-600 dark:text-sky-400">{selectedProvince}</strong></span>}
            {searchTerm && <span> (ค้นหา "{searchTerm}")</span>}
          </span>
          <span className="hidden sm:inline text-[11px]">
            กดที่เบอร์เพื่อโทรออก หรือกดปุ่มคัดลอกเพื่อส่งต่อข้อมูล
          </span>
        </div>

        {/* Content Body: Table on Desktop, Cards on Mobile */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2.5">
          {filteredMessengers.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Bike className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                ไม่พบรายชื่อแมสเซนเจอร์ที่ตรงกับเงื่อนไข
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                ลองตรวจสอบตัวสะกด หรือเลือกล้างตัวกรองจังหวัดเพื่อดูรายชื่อทั้งหมด หรือกด "เพิ่มแมสใหม่" หากเป็นคนใหม่
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedProvince('all');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300 transition cursor-pointer"
                >
                  ดูแมสทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 transition cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มแมสคนนี้
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredMessengers.map((m, index) => {
                const isCopied = copiedId === m.id;
                const isHighJob = (m.jobCount ?? 0) >= 6;
                const isTopJob = (m.jobCount ?? 0) >= 10;

                return (
                  <div
                    key={m.id}
                    className={clsx(
                      "p-3.5 rounded-xl border transition flex flex-col justify-between gap-2.5 shadow-2xs group relative",
                      m.isCustom 
                        ? "border-sky-300 dark:border-sky-800/80 bg-sky-50/30 dark:bg-sky-950/20 hover:border-sky-400"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/70 hover:border-sky-300 dark:hover:border-sky-700"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Number / Status Badge */}
                        <div className={clsx(
                          "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5",
                          m.isCustom
                            ? "bg-sky-600 text-white shadow-xs"
                            : isTopJob
                            ? "bg-amber-400 text-amber-950 shadow-xs"
                            : isHighJob
                            ? "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        )}>
                          {m.isCustom ? (
                            <Bike className="w-4 h-4" />
                          ) : (
                            m.id
                          )}
                        </div>

                        {/* Name & Nickname */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                              {m.name}
                            </span>
                            {m.nickname && (
                              <span className="px-1.5 py-0.2 rounded-md bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-[10px] font-bold">
                                {m.nickname}
                              </span>
                            )}
                            {m.isCustom && (
                              <span className="px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[9px] font-bold border border-amber-300 dark:border-amber-800">
                                แมสใหม่
                              </span>
                            )}
                          </div>

                          {/* Notes if any */}
                          {m.note && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mt-0.5 line-clamp-2">
                              {m.note}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right top badges: Job count & Delete for custom */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.jobCount !== undefined && m.jobCount !== null ? (
                          <div className={clsx(
                            "px-2 py-0.5 rounded-lg text-[11px] font-black shrink-0 flex items-center gap-1",
                            isTopJob
                              ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                              : isHighJob
                              ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                              : "bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300"
                          )}>
                            {isTopJob && <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />}
                            <span>{m.jobCount} งาน</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            (แมสใหม่)
                          </span>
                        )}

                        {m.isCustom && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCustomMessenger(m, e)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                            title="ลบรายชื่อแมสคนนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Province Location Tags */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <div className="flex items-center gap-1 flex-wrap">
                        {m.provincesList.map((p, idx) => (
                          <span
                            key={idx}
                            onClick={() => setSelectedProvince(p)}
                            className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700/60 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:text-sky-600 rounded text-[11px] cursor-pointer transition font-medium"
                            title={`กรองดูเฉพาะ ${p}`}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions: Call & Copy */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      {/* Phone link */}
                      <a
                        href={`tel:${m.rawPhone}`}
                        className="flex items-center gap-1.5 text-xs font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 py-1 px-2 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/60 transition group-hover:scale-[1.01]"
                        title="กดเพื่อโทรออกทันที"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span className="tracking-wide">{m.phone}</span>
                      </a>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Copy Phone button */}
                        <button
                          type="button"
                          onClick={(e) => handleCopyPhone(m, e)}
                          className={clsx(
                            "px-2 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer border",
                            isCopied
                              ? "bg-emerald-500 text-white border-emerald-500 shadow-2xs"
                              : "bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600"
                          )}
                          title="คัดลอกเฉพาะเบอร์โทรศัพท์"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>คัดลอกแล้ว</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-slate-400" />
                              <span>เบอร์</span>
                            </>
                          )}
                        </button>

                        {/* Copy Full Contact Info */}
                        <button
                          type="button"
                          onClick={(e) => handleCopyFullContact(m, e)}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900 border border-sky-200 dark:border-sky-800 transition flex items-center gap-1 cursor-pointer"
                          title="คัดลอกชื่อ+เบอร์+จังหวัดเพื่อส่งต่อ"
                        >
                          <Share2 className="w-3 h-3 text-sky-500" />
                          <span>ทั้งชุด</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>แมสทั้งหมด <strong>{combinedMessengers.length} คน</strong> (Thunder Cloud {MESSENGERS_SOURCE_INFO.totalCount} คน {customMessengers.length > 0 && `+ แมสใหม่ ${customMessengers.length} คน`})</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 hover:bg-sky-100 font-semibold cursor-pointer border border-sky-200 dark:border-sky-800 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มแมส
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>

      {/* Modal: เพิ่มรายชื่อแมสใหม่ */}
      {showAddModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-100">
          <div 
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-950/40 dark:to-slate-900">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    เพิ่มรายชื่อแมสเซนเจอร์ใหม่
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    บันทึกเบอร์โทรและพื้นที่วิ่ง เพื่อให้ทุกคนในทีมติดต่อได้ทันที
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddMessenger} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สมชาย สปีดแมน"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ชื่อเล่น
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ชาย, โจ้"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    เบอร์โทรศัพท์ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="เช่น 081-234-5678"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    จังหวัดที่วิ่ง <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newProvince}
                    onChange={(e) => setNewProvince(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                  >
                    {ALL_THAI_PROVINCES.map((prov) => (
                      <option key={prov} value={prov}>
                        {prov}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    งานที่เคยวิ่ง (เริ่มต้น)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newJobCount}
                    onChange={(e) => setNewJobCount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  หมายเหตุ / โซนที่วิ่งประจำ
                </label>
                <textarea
                  rows={2}
                  placeholder="เช่น มอเตอร์ไซค์ วิ่งโซนปากเกร็ด-แจ้งวัฒนะ หรือ ประจำสำนักงานใหญ่"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-95 text-white text-xs font-bold shadow-md shadow-sky-200 dark:shadow-none flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>กำลังบันทึก...</span>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>บันทึกรายชื่อแมส</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
