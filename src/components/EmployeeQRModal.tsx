import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  QrCode,
  Search,
  Plus,
  CreditCard,
  Copy,
  Check,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Edit3,
  ExternalLink,
  Sparkles,
  User,
  Coffee,
  ShoppingBag,
  Receipt,
  Share2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  ChevronRight,
  ShieldCheck,
  Eye,
  Camera,
  Coins
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useStore, isUserAdmin } from '../store/useStore';
import { EmployeePaymentMethod, PeerRepayment, RepaymentCategory, PromptPayTargetType } from '../types';
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import {
  THAI_BANKS,
  getBankInfo,
  generatePromptPayPayload,
  generateQrDataUrl,
  formatPaymentTarget
} from '../lib/promptpay';
import { compressSlipImage } from '../lib/advanceUtils';

interface EmployeeQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEmployeeId?: string;
  initialTab?: 'directory' | 'my_qr' | 'history';
}

const CATEGORY_MAP: Record<RepaymentCategory, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  buy_for_me: {
    label: 'ฝากซื้อของ / ข้าว',
    icon: ShoppingBag,
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  },
  excess_refund: {
    label: 'จ่ายเงินเกิน / เงินทอน',
    icon: ArrowRightLeft,
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  },
  shared_expense: {
    label: 'หารค่าใช้จ่าย / ชาบู / ขนม',
    icon: Coffee,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800'
  },
  other: {
    label: 'อื่นๆ',
    icon: Receipt,
    color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
  }
};

const QUICK_AMOUNTS = [20, 40, 50, 60, 100, 150, 200, 300, 500];

export function EmployeeQRModal({
  isOpen,
  onClose,
  initialEmployeeId,
  initialTab = 'directory'
}: EmployeeQRModalProps) {
  const { user, registeredUsers, fetchRegisteredUsers } = useStore();
  const isAdmin = isUserAdmin(user);

  const [activeTab, setActiveTab] = useState<'directory' | 'my_qr' | 'history'>(initialTab);
  const [methods, setMethods] = useState<EmployeePaymentMethod[]>([]);
  const [repayments, setRepayments] = useState<PeerRepayment[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [loadingRepayments, setLoadingRepayments] = useState(true);

  // Search & Filter in Directory
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'has_qr' | 'mine'>('all');

  // Selected Employee for Scanning & Paying
  const [selectedEmpMethod, setSelectedEmpMethod] = useState<{
    method?: EmployeePaymentMethod;
    userProfile?: { uid: string; name: string; username?: string; avatarEmoji?: string };
  } | null>(null);

  // Dynamic PromptPay Amount for scanning modal
  const [scanAmountStr, setScanAmountStr] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);
  const [qrViewMode, setQrViewMode] = useState<'promptpay_auto' | 'uploaded_image'>('promptpay_auto');

  // Toast / Copy Feedback
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // "My QR" / Add / Edit Form State
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [formEmployeeId, setFormEmployeeId] = useState<string>('');
  const [formEmployeeName, setFormEmployeeName] = useState<string>('');
  const [formBankName, setFormBankName] = useState<string>('พร้อมเพย์ (PromptPay)');
  const [formAccountNumber, setFormAccountNumber] = useState<string>('');
  const [formAccountName, setFormAccountName] = useState<string>('');
  const [formPromptpayType, setFormPromptpayType] = useState<PromptPayTargetType>('phone');
  const [formQrImageUrl, setFormQrImageUrl] = useState<string>('');
  const [formNote, setFormNote] = useState<string>('');
  const [isSavingMethod, setIsSavingMethod] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const qrFileInputRef = useRef<HTMLInputElement>(null);

  // Quick Repayment Form Modal
  const [showLogRepayModal, setShowLogRepayModal] = useState(false);
  const [repayTargetEmployee, setRepayTargetEmployee] = useState<{ uid: string; name: string } | null>(null);
  const [repayAmountStr, setRepayAmountStr] = useState('');
  const [repayCategory, setRepayCategory] = useState<RepaymentCategory>('buy_for_me');
  const [repayDesc, setRepayDesc] = useState('');
  const [repaySlipUrl, setRepaySlipUrl] = useState<string>('');
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  const [isSavingRepay, setIsSavingRepay] = useState(false);
  const repaySlipInputRef = useRef<HTMLInputElement>(null);

  // Slip preview Lightbox
  const [previewSlipImage, setPreviewSlipImage] = useState<{ url: string; title: string } | null>(null);

  // Real-time listener for Employee Payment Methods
  useEffect(() => {
    if (!isOpen) return;

    fetchRegisteredUsers?.();

    const unsubMethods = onSnapshot(
      collection(db, 'employee_payment_methods'),
      (snapshot) => {
        const list: EmployeePaymentMethod[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            employeeId: data.employeeId || docSnap.id,
            employeeName: data.employeeName || 'พนักงาน',
            employeeUsername: data.employeeUsername || '',
            avatarEmoji: data.avatarEmoji || '',
            bankName: data.bankName || 'พร้อมเพย์',
            accountNumber: data.accountNumber || '',
            accountName: data.accountName || '',
            promptpayType: data.promptpayType || 'phone',
            qrImageUrl: data.qrImageUrl || '',
            note: data.note || '',
            createdAt: data.createdAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            updatedBy: data.updatedBy || '',
          });
        });
        setMethods(list);
        setLoadingMethods(false);
      },
      (err) => {
        console.error('Error fetching employee payment methods:', err);
        setLoadingMethods(false);
      }
    );

    const repayQuery = query(collection(db, 'peer_repayments'), orderBy('createdAt', 'desc'));
    const unsubRepayments = onSnapshot(
      repayQuery,
      (snapshot) => {
        const list: PeerRepayment[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            fromEmployeeId: data.fromEmployeeId || '',
            fromEmployeeName: data.fromEmployeeName || '',
            fromEmployeeUsername: data.fromEmployeeUsername || '',
            fromAvatarEmoji: data.fromAvatarEmoji || '',
            toEmployeeId: data.toEmployeeId || '',
            toEmployeeName: data.toEmployeeName || '',
            toEmployeeUsername: data.toEmployeeUsername || '',
            toAvatarEmoji: data.toAvatarEmoji || '',
            amount: Number(data.amount) || 0,
            category: data.category || 'buy_for_me',
            description: data.description || '',
            slipUrl: data.slipUrl || '',
            status: data.status || 'completed',
            createdAt: data.createdAt || Date.now(),
          });
        });
        setRepayments(list);
        setLoadingRepayments(false);
      },
      (err) => {
        console.error('Error fetching peer repayments:', err);
        setLoadingRepayments(false);
      }
    );

    return () => {
      unsubMethods();
      unsubRepayments();
    };
  }, [isOpen, fetchRegisteredUsers]);

  // Initial tab and target selection
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialEmployeeId) {
        // Will be matched once methods or registered users are loaded
      }
    }
  }, [isOpen, initialTab, initialEmployeeId]);

  // Auto populate my form if editing own QR
  const myExistingMethod = useMemo(() => {
    if (!user) return undefined;
    return methods.find((m) => m.employeeId === user.uid);
  }, [methods, user]);

  const startEditOwnQr = () => {
    if (!user) return;
    setEditingTargetId(user.uid);
    setFormEmployeeId(user.uid);
    setFormEmployeeName(myExistingMethod?.employeeName || user.name || '');
    setFormBankName(myExistingMethod?.bankName || 'พร้อมเพย์ (PromptPay)');
    setFormAccountNumber(myExistingMethod?.accountNumber || '');
    setFormAccountName(myExistingMethod?.accountName || user.name || '');
    setFormPromptpayType(myExistingMethod?.promptpayType || 'phone');
    setFormQrImageUrl(myExistingMethod?.qrImageUrl || '');
    setFormNote(myExistingMethod?.note || '');
    setActiveTab('my_qr');
  };

  const startEditOtherQr = (empId: string, empName: string) => {
    const existing = methods.find((m) => m.employeeId === empId);
    setEditingTargetId(empId);
    setFormEmployeeId(empId);
    setFormEmployeeName(existing?.employeeName || empName);
    setFormBankName(existing?.bankName || 'พร้อมเพย์ (PromptPay)');
    setFormAccountNumber(existing?.accountNumber || '');
    setFormAccountName(existing?.accountName || empName);
    setFormPromptpayType(existing?.promptpayType || 'phone');
    setFormQrImageUrl(existing?.qrImageUrl || '');
    setFormNote(existing?.note || '');
    setActiveTab('my_qr');
  };

  // Generate QR dynamically when selected employee or scan amount changes
  useEffect(() => {
    if (!selectedEmpMethod) {
      setQrCodeDataUrl('');
      return;
    }

    const method = selectedEmpMethod.method;
    if (!method || !method.accountNumber) {
      setQrCodeDataUrl('');
      return;
    }

    const amt = parseFloat(scanAmountStr);
    const amountVal = !isNaN(amt) && amt > 0 ? amt : null;

    setIsGeneratingQr(true);
    const payload = generatePromptPayPayload(method.accountNumber, amountVal);

    generateQrDataUrl(payload, { width: 340, margin: 2 })
      .then((dataUrl) => {
        setQrCodeDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error('Failed to generate QR data URL:', err);
      })
      .finally(() => {
        setIsGeneratingQr(false);
      });
  }, [selectedEmpMethod, scanAmountStr]);

  // Merge registered users with configured payment methods
  const combinedDirectory = useMemo(() => {
    const list: Array<{
      uid: string;
      name: string;
      username?: string;
      avatarEmoji?: string;
      method?: EmployeePaymentMethod;
      isCurrentUser: boolean;
    }> = [];

    const processedUids = new Set<string>();

    // 1. Add current user first
    if (user) {
      const myMethod = methods.find((m) => m.employeeId === user.uid);
      list.push({
        uid: user.uid,
        name: user.name || 'ฉัน',
        username: user.username,
        avatarEmoji: user.avatarEmoji,
        method: myMethod,
        isCurrentUser: true,
      });
      processedUids.add(user.uid);
    }

    // 2. Add registered users
    if (registeredUsers && registeredUsers.length > 0) {
      registeredUsers.forEach((u) => {
        if (!processedUids.has(u.uid)) {
          const m = methods.find((item) => item.employeeId === u.uid);
          list.push({
            uid: u.uid,
            name: u.name,
            username: u.username,
            avatarEmoji: u.avatarEmoji,
            method: m,
            isCurrentUser: false,
          });
          processedUids.add(u.uid);
        }
      });
    }

    // 3. Add any standalone payment methods not matching a registered user UID
    methods.forEach((m) => {
      if (!processedUids.has(m.employeeId)) {
        list.push({
          uid: m.employeeId,
          name: m.employeeName,
          username: m.employeeUsername,
          avatarEmoji: m.avatarEmoji,
          method: m,
          isCurrentUser: user?.uid === m.employeeId,
        });
        processedUids.add(m.employeeId);
      }
    });

    return list;
  }, [user, registeredUsers, methods]);

  // Filtered Directory
  const filteredDirectory = useMemo(() => {
    let result = combinedDirectory;

    if (selectedFilter === 'has_qr') {
      result = result.filter((item) => !!item.method?.accountNumber);
    } else if (selectedFilter === 'mine') {
      result = result.filter((item) => item.isCurrentUser);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.username && item.username.toLowerCase().includes(q)) ||
          (item.method?.accountNumber && item.method.accountNumber.includes(q)) ||
          (item.method?.bankName && item.method.bankName.toLowerCase().includes(q)) ||
          (item.method?.accountName && item.method.accountName.toLowerCase().includes(q))
      );
    }

    return result;
  }, [combinedDirectory, selectedFilter, searchQuery]);

  // Copy to clipboard helper
  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => {
      setCopiedText((prev) => (prev === label ? null : prev));
    }, 2000);
  };

  // Handle image upload for QR Code
  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const res = await compressSlipImage(file, 800, 800, 0.8);
      setFormQrImageUrl(res.dataUrl);
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถอัปโหลดรูปภาพได้');
    } finally {
      setUploadingImage(false);
      if (qrFileInputRef.current) qrFileInputRef.current.value = '';
    }
  };

  // Save My QR / Payment Method
  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('กรุณาเข้าสู่ระบบก่อนทำการบันทึกข้อมูล');
      return;
    }

    const targetEmpId = editingTargetId || user.uid;
    const targetName = formEmployeeName.trim() || user.name || 'พนักงาน';

    if (!formAccountNumber.trim()) {
      alert('กรุณาระบุเลขที่บัญชี หรือ เบอร์พร้อมเพย์ค่ะ');
      return;
    }

    setIsSavingMethod(true);
    try {
      const docRef = doc(db, 'employee_payment_methods', targetEmpId);
      const payload: Partial<EmployeePaymentMethod> = {
        id: targetEmpId,
        employeeId: targetEmpId,
        employeeName: targetName,
        employeeUsername:
          targetEmpId === user.uid
            ? user.username
            : registeredUsers.find((u) => u.uid === targetEmpId)?.username || '',
        avatarEmoji:
          targetEmpId === user.uid
            ? user.avatarEmoji
            : registeredUsers.find((u) => u.uid === targetEmpId)?.avatarEmoji || '',
        bankName: formBankName,
        accountNumber: formAccountNumber.trim(),
        accountName: formAccountName.trim() || targetName,
        promptpayType: formPromptpayType,
        qrImageUrl: formQrImageUrl || '',
        note: formNote.trim(),
        updatedAt: Date.now(),
        updatedBy: user.name || user.username || 'System',
      };

      if (!myExistingMethod && targetEmpId === user.uid) {
        payload.createdAt = Date.now();
      }

      await setDoc(docRef, payload, { merge: true });

      alert('บันทึกข้อมูล QR Code และบัญชีรับเงินสำเร็จเรียบร้อยแล้วค่ะ!');
      setEditingTargetId(null);
      setActiveTab('directory');
    } catch (err: any) {
      console.error('Error saving payment method:', err);
      alert('บันทึกไม่สำเร็จ: ' + (err.message || 'เกิดข้อผิดพลาด'));
    } finally {
      setIsSavingMethod(false);
    }
  };

  // Delete Payment Method
  const handleDeletePaymentMethod = async (empId: string) => {
    if (!confirm('คุณต้องการลบข้อมูล QR Code และบัญชีนี้ใช่หรือไม่?')) return;
    try {
      await deleteDoc(doc(db, 'employee_payment_methods', empId));
      if (selectedEmpMethod?.userProfile?.uid === empId) {
        setSelectedEmpMethod(null);
      }
      alert('ลบข้อมูลเรียบร้อยแล้วค่ะ');
    } catch (err: any) {
      alert('ลบไม่สำเร็จ: ' + err.message);
    }
  };

  // Handle Repayment Slip Upload
  const handleRepaySlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingSlip(true);
      const res = await compressSlipImage(file, 900, 1200, 0.75);
      setRepaySlipUrl(res.dataUrl);
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถอัปโหลดสลิปได้');
    } finally {
      setIsUploadingSlip(false);
      if (repaySlipInputRef.current) repaySlipInputRef.current.value = '';
    }
  };

  // Submit Repayment Record
  const handleSubmitRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('กรุณาเข้าสู่ระบบก่อนทำการบันทึก');
      return;
    }
    if (!repayTargetEmployee) {
      alert('กรุณาเลือกเพื่อนร่วมงานที่โอนคืน');
      return;
    }

    const amt = parseFloat(repayAmountStr);
    if (isNaN(amt) || amt <= 0) {
      alert('กรุณาระบุยอดเงินที่โอนคืนให้ถูกต้อง (มากกว่า 0 บาท)');
      return;
    }

    setIsSavingRepay(true);
    try {
      const payload: Omit<PeerRepayment, 'id'> = {
        fromEmployeeId: user.uid,
        fromEmployeeName: user.name || 'พนักงาน',
        fromEmployeeUsername: user.username,
        fromAvatarEmoji: user.avatarEmoji,
        toEmployeeId: repayTargetEmployee.uid,
        toEmployeeName: repayTargetEmployee.name,
        amount: amt,
        category: repayCategory,
        description: repayDesc.trim() || CATEGORY_MAP[repayCategory].label,
        slipUrl: repaySlipUrl || '',
        status: 'completed',
        createdAt: Date.now(),
      };

      await addDoc(collection(db, 'peer_repayments'), payload);
      alert(`บันทึกการโอนเงินคืนให้คุณ ${repayTargetEmployee.name} เรียบร้อยแล้วค่ะ!`);
      setShowLogRepayModal(false);
      setRepayAmountStr('');
      setRepayDesc('');
      setRepaySlipUrl('');
      setActiveTab('history');
    } catch (err: any) {
      console.error('Error logging repayment:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    } finally {
      setIsSavingRepay(false);
    }
  };

  // Delete Repayment record
  const handleDeleteRepayment = async (repayId: string) => {
    if (!confirm('คุณต้องการลบประวัติการโอนคืนรายการนี้ใช่หรือไม่?')) return;
    try {
      await deleteDoc(doc(db, 'peer_repayments', repayId));
    } catch (err: any) {
      alert('ลบไม่สำเร็จ: ' + err.message);
    }
  };

  // Download QR Code PNG
  const handleDownloadQr = () => {
    const src = qrViewMode === 'uploaded_image' && selectedEmpMethod?.method?.qrImageUrl
      ? selectedEmpMethod.method.qrImageUrl
      : qrCodeDataUrl;

    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `QR_${selectedEmpMethod?.userProfile?.name || 'PromptPay'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-linear-to-r from-sky-600 via-indigo-600 to-blue-700 text-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-inner">
                <QrCode className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold truncate flex items-center gap-2">
                  <span>ระบบ QR Code พนักงาน</span>
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-white border border-white/25">
                    โอนคืน & ฝากซื้อของ
                  </span>
                </h2>
                <p className="text-xs text-sky-100 truncate">
                  สแกนจ่ายเงินเกิน • ฝากซื้อข้าว/ของกิน • บันทึกโอนเงินคืนเพื่อนร่วมงาน
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-4 pt-2 border-t border-white/15 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('directory')}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 whitespace-nowrap cursor-pointer',
                activeTab === 'directory'
                  ? 'bg-white text-sky-800 shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              )}
            >
              <QrCode className="w-4 h-4" />
              <span>สมุด QR พนักงาน ({combinedDirectory.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                startEditOwnQr();
              }}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 whitespace-nowrap cursor-pointer',
                activeTab === 'my_qr'
                  ? 'bg-white text-sky-800 shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              )}
            >
              <Edit3 className="w-4 h-4" />
              <span>
                {myExistingMethod ? 'QR Code ของฉัน' : '+ เพิ่ม QR Code ของฉัน'}
              </span>
              {myExistingMethod && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={clsx(
                'px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 whitespace-nowrap cursor-pointer',
                activeTab === 'history'
                  ? 'bg-white text-sky-800 shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              )}
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>ประวัติการโอนคืน ({repayments.length})</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {/* TAB 1: DIRECTORY & SCAN */}
          {activeTab === 'directory' && (
            <div className="space-y-4">
              {/* Callout if current user doesn't have a QR registered */}
              {!myExistingMethod && user && (
                <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
                        คุณยังไม่ได้เพิ่ม QR Code รับเงินโอนคืน!
                      </p>
                      <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400">
                        เพิ่มพร้อมเพย์หรือเลขบัญชีเพื่อให้เพื่อนๆ สแกนโอนเงินคืนได้ทันทีเมื่อฝากซื้อของหรือจ่ายเกิน
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={startEditOwnQr}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition shrink-0 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่ม QR ของฉันเลย</span>
                  </button>
                </div>
              )}

              {/* Search & Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาชื่อเพื่อน, ชื่อเล่น, พร้อมเพย์, เลขบัญชี, ธนาคาร..."
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('all')}
                    className={clsx(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer',
                      selectedFilter === 'all'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    )}
                  >
                    ทั้งหมด ({combinedDirectory.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('has_qr')}
                    className={clsx(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer',
                      selectedFilter === 'has_qr'
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    )}
                  >
                    มี QR แล้ว ({combinedDirectory.filter((i) => !!i.method?.accountNumber).length})
                  </button>
                  {user && (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter('mine')}
                      className={clsx(
                        'px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer',
                        selectedFilter === 'mine'
                          ? 'bg-sky-600 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      )}
                    >
                      ของฉัน
                    </button>
                  )}
                </div>
              </div>

              {/* Cards Grid */}
              {loadingMethods ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mb-2 text-sky-500" />
                  <p className="text-xs">กำลังโหลดข้อมูล QR Code พนักงาน...</p>
                </div>
              ) : filteredDirectory.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <QrCode className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
                    ไม่พบข้อมูลเพื่อนร่วมงานที่ค้นหา
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    ลองพิมพ์คำค้นหาใหม่ หรือคลิก "+ เพิ่ม QR Code ของฉัน"
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredDirectory.map((item) => {
                    const hasMethod = !!item.method?.accountNumber;
                    const bank = getBankInfo(item.method?.bankName);
                    const canEdit = item.isCurrentUser || isAdmin;

                    return (
                      <div
                        key={item.uid}
                        className={clsx(
                          'p-3.5 rounded-2xl border transition flex flex-col justify-between gap-3 relative group',
                          hasMethod
                            ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:shadow-md hover:border-sky-300 dark:hover:border-sky-700'
                            : 'bg-slate-50/60 dark:bg-slate-900/40 border-dashed border-slate-200 dark:border-slate-800 opacity-90'
                        )}
                      >
                        {/* Top: Avatar & Name */}
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0 shadow-2xs">
                                {item.avatarEmoji || '👤'}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {item.name}
                                  </span>
                                  {item.isCurrentUser && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                      ฉัน
                                    </span>
                                  )}
                                </div>
                                {item.username && (
                                  <span className="text-[10px] text-slate-400 block truncate">
                                    @{item.username}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Edit Button */}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  item.isCurrentUser
                                    ? startEditOwnQr()
                                    : startEditOtherQr(item.uid, item.name)
                                }
                                className="p-1 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 transition cursor-pointer"
                                title="แก้ไขข้อมูล QR / บัญชี"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Bank & Details */}
                          {hasMethod && item.method ? (
                            <div className="mt-3 space-y-1.5">
                              {/* Bank Badge */}
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 rounded-lg text-[10px] font-semibold border flex items-center gap-1.5 truncate',
                                    bank.bgLight,
                                    bank.borderLight,
                                    bank.textColor
                                  )}
                                >
                                  <CreditCard className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{bank.name}</span>
                                </span>

                                {item.method.qrImageUrl && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                                    มีรูป QR
                                  </span>
                                )}
                              </div>

                              {/* Account Number & Copy */}
                              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                <div className="min-w-0 pr-2">
                                  <span className="text-[10px] text-slate-400 block">
                                    {item.method.accountName || item.name}
                                  </span>
                                  <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100 truncate block">
                                    {formatPaymentTarget(item.method.accountNumber)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopy(
                                      item.method!.accountNumber,
                                      `acc_${item.uid}`
                                    )
                                  }
                                  className={clsx(
                                    'p-1.5 rounded-lg text-xs transition cursor-pointer shrink-0',
                                    copiedText === `acc_${item.uid}`
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700'
                                  )}
                                  title="คัดลอกเลขบัญชี / พร้อมเพย์"
                                >
                                  {copiedText === `acc_${item.uid}` ? (
                                    <Check className="w-3.5 h-3.5" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>

                              {item.method.note && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 italic px-1">
                                  "{item.method.note}"
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="mt-3 py-2 text-center bg-slate-100/60 dark:bg-slate-800/40 rounded-xl">
                              <p className="text-[11px] text-slate-400">ยังไม่ได้ลงทะเบียน QR</p>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    item.isCurrentUser
                                      ? startEditOwnQr()
                                      : startEditOtherQr(item.uid, item.name)
                                  }
                                  className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline mt-0.5 inline-block cursor-pointer"
                                >
                                  + เพิ่ม QR Code ตอนนี้
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Bottom Actions */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5">
                          {hasMethod ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEmpMethod({
                                    method: item.method,
                                    userProfile: item,
                                  });
                                  setScanAmountStr('');
                                  setQrViewMode(
                                    item.method?.qrImageUrl
                                      ? 'uploaded_image'
                                      : 'promptpay_auto'
                                  );
                                }}
                                className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                <span>สแกนจ่าย / QR</span>
                              </button>

                              {!item.isCurrentUser && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRepayTargetEmployee({
                                      uid: item.uid,
                                      name: item.name,
                                    });
                                    setRepayAmountStr('');
                                    setShowLogRepayModal(true);
                                  }}
                                  className="py-1.5 px-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 transition flex items-center justify-center gap-1 cursor-pointer"
                                  title="บันทึกว่าโอนเงินคืนแล้ว (แนบสลิป)"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">โอนคืน</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                item.isCurrentUser
                                  ? startEditOwnQr()
                                  : startEditOtherQr(item.uid, item.name)
                              }
                              className="w-full py-1.5 px-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>เพิ่มข้อมูลให้เพื่อน</span>
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

          {/* TAB 2: MY QR / ADD / EDIT QR */}
          {activeTab === 'my_qr' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="p-4 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/60 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-sky-900 dark:text-sky-200">
                    {editingTargetId && editingTargetId !== user?.uid
                      ? `แก้ไขข้อมูล QR Code สำหรับคุณ ${formEmployeeName}`
                      : 'ตั้งค่า QR Code รับเงินโอนคืนของคุณ'}
                  </h3>
                  <p className="text-xs text-sky-700 dark:text-sky-400 mt-0.5">
                    ระบุพร้อมเพย์หรือเลขบัญชีธนาคาร และสามารถอัปโหลดรูป QR Code จากแอปธนาคารเพื่อให้เพื่อนๆ สแกนโอนเงินคืนได้สะดวก
                  </p>
                </div>
              </div>

              <form onSubmit={handleSavePaymentMethod} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Account Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      ชื่อ-นามสกุล เจ้าของบัญชี <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formAccountName}
                      onChange={(e) => setFormAccountName(e.target.value)}
                      placeholder="เช่น สมชาย ใจดี"
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  {/* Bank Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      ธนาคาร / ช่องทางรับเงิน <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formBankName}
                      onChange={(e) => setFormBankName(e.target.value)}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                    >
                      {THAI_BANKS.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* PromptPay Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      ประเภทข้อมูล
                    </label>
                    <select
                      value={formPromptpayType}
                      onChange={(e) => setFormPromptpayType(e.target.value as PromptPayTargetType)}
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="phone">เบอร์โทรศัพท์มือถือ (พร้อมเพย์)</option>
                      <option value="id_card">เลขประจำตัวประชาชน (พร้อมเพย์)</option>
                      <option value="bank_account">เลขที่บัญชีธนาคาร</option>
                      <option value="other">อื่นๆ</option>
                    </select>
                  </div>

                  {/* Account / PromptPay Number */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      เลขที่บัญชี / เบอร์พร้อมเพย์ <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formAccountNumber}
                      onChange={(e) => setFormAccountNumber(e.target.value)}
                      placeholder="เช่น 0812345678 หรือ 1234567890"
                      className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      ใส่เฉพาะตัวเลข ระบบจะจัดรูปแบบให้อัตโนมัติ
                    </span>
                  </div>
                </div>

                {/* Upload QR Code Image */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    รูป QR Code จากแอปธนาคาร (ตัวเลือกเสริม / ภาพแคปหน้าจอ)
                  </label>
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    {formQrImageUrl ? (
                      <div className="relative group shrink-0">
                        <img
                          src={formQrImageUrl}
                          alt="QR Code Preview"
                          className="w-28 h-28 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-2xs p-1"
                        />
                        <button
                          type="button"
                          onClick={() => setFormQrImageUrl('')}
                          className="absolute -top-2 -right-2 p-1 rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700 transition cursor-pointer"
                          title="ลบรูป"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-28 h-28 rounded-xl bg-slate-200 dark:bg-slate-700/60 flex flex-col items-center justify-center text-slate-400 shrink-0">
                        <Camera className="w-8 h-8 mb-1 opacity-70" />
                        <span className="text-[10px]">ยังไม่มีรูป</span>
                      </div>
                    )}

                    <div className="flex-1 text-center sm:text-left space-y-2">
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        แคปภาพ QR Code จากแอปธนาคารของคุณ (K PLUS, SCB EASY ฯลฯ) แล้วอัปโหลดไว้ เพื่อให้เพื่อนๆ สแกนจ่ายได้ตรงจากภาพจริง
                      </p>
                      <div className="flex items-center gap-2 justify-center sm:justify-start">
                        <input
                          type="file"
                          ref={qrFileInputRef}
                          accept="image/*"
                          onChange={handleQrImageUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={uploadingImage}
                          onClick={() => qrFileInputRef.current?.click()}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          {uploadingImage ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>กำลังย่อขนาดรูป...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5 text-sky-600" />
                              <span>{formQrImageUrl ? 'เปลี่ยนรูป QR' : 'เลือกรูป QR Code'}</span>
                            </>
                          )}
                        </button>

                        {formQrImageUrl && (
                          <button
                            type="button"
                            onClick={() => setFormQrImageUrl('')}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          >
                            ลบรูป
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    หมายเหตุ / ข้อความถึงเพื่อนร่วมงาน (ตัวเลือกเสริม)
                  </label>
                  <input
                    type="text"
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    placeholder="เช่น ฝากซื้อข้าวโอนเข้าเบอร์นี้นะครับ, ขอบคุณล่วงหน้าครับ"
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {/* Action Buttons */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                  {myExistingMethod && editingTargetId === user?.uid ? (
                    <button
                      type="button"
                      onClick={() => handleDeletePaymentMethod(user.uid)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>ลบ QR Code ของฉัน</span>
                    </button>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTargetId(null);
                        setActiveTab('directory');
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingMethod}
                      className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingMethod ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>กำลังบันทึก...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>บันทึกข้อมูล QR Code</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: REPAYMENT HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* Header summary banner */}
              <div className="p-4 rounded-2xl bg-linear-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border border-emerald-200 dark:border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      บันทึกประวัติการโอนเงินคืน & ฝากซื้อของ
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      รวมรายการโอนคืนค่าข้าว ของกิน เงินทอน หรือค่าใช้จ่ายที่หารกันในทีม
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setRepayTargetEmployee(null);
                    setRepayAmountStr('');
                    setShowLogRepayModal(true);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>บันทึกรายการโอนคืนใหม่</span>
                </button>
              </div>

              {/* Repayments List */}
              {loadingRepayments ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mb-2 text-emerald-500" />
                  <p className="text-xs">กำลังโหลดประวัติการโอนคืน...</p>
                </div>
              ) : repayments.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <ArrowRightLeft className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
                    ยังไม่มีประวัติการโอนเงินคืนในระบบ
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    เมื่อโอนคืนค่าข้าว หรือของที่ฝากซื้อ สามารถกดบันทึกรายการพร้อมแนบสลิปได้เลย
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {repayments.map((repay) => {
                    const catInfo = CATEGORY_MAP[repay.category] || CATEGORY_MAP.other;
                    const CatIcon = catInfo.icon;
                    const isMyPayment = repay.fromEmployeeId === user?.uid;
                    const isMyReceipt = repay.toEmployeeId === user?.uid;
                    const canDelete = isMyPayment || isAdmin;

                    return (
                      <div
                        key={repay.id}
                        className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs hover:shadow-xs transition"
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0">
                            {repay.fromAvatarEmoji || '👤'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                                {repay.fromEmployeeName}
                              </span>
                              <span className="text-xs text-slate-400 font-semibold">โอนคืนให้</span>
                              <span className="text-xs sm:text-sm font-bold text-sky-600 dark:text-sky-400">
                                {repay.toEmployeeName}
                              </span>

                              {isMyPayment && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  ฉันโอน
                                </span>
                              )}
                              {isMyReceipt && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  ฉันได้รับ
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-1 flex-wrap text-slate-500">
                              <span
                                className={clsx(
                                  'px-2 py-0.5 rounded-lg text-[10px] font-semibold border flex items-center gap-1',
                                  catInfo.color
                                )}
                              >
                                <CatIcon className="w-3 h-3" />
                                <span>{catInfo.label}</span>
                              </span>

                              {repay.description && (
                                <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-xs">
                                  {repay.description}
                                </span>
                              )}

                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{format(new Date(repay.createdAt), 'dd MMM yyyy HH:mm', { locale: th })}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Amount & Actions */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 shrink-0">
                          <div className="text-right">
                            <span className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                              +{repay.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                              โอนเรียบร้อย
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {repay.slipUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewSlipImage({
                                    url: repay.slipUrl!,
                                    title: `สลิปโอนคืน: ${repay.fromEmployeeName} -> ${repay.toEmployeeName} (${repay.amount} ฿)`
                                  })
                                }
                                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
                                title="ดูสลิปโอนเงิน"
                              >
                                <Receipt className="w-3.5 h-3.5 text-sky-600" />
                                <span className="hidden sm:inline">ดูสลิป</span>
                              </button>
                            )}

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteRepayment(repay.id)}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                title="ลบรายการ"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>พร้อมเพย์ EMVCo มาตรฐานสแกนได้ทุกแอปธนาคาร</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            ปิด
          </button>
        </div>

        {/* MODAL 1: SCAN & PAY VIEW FOR SELECTED EMPLOYEE */}
        {selectedEmpMethod && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
              {/* Top Banner */}
              <div className="p-4 bg-linear-to-r from-sky-600 to-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-lg shrink-0">
                    {selectedEmpMethod.userProfile?.avatarEmoji || '👤'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">
                      สแกนโอนเงินให้คุณ {selectedEmpMethod.userProfile?.name}
                    </h3>
                    <p className="text-[11px] text-sky-100 truncate">
                      {selectedEmpMethod.method?.bankName || 'พร้อมเพย์'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEmpMethod(null)}
                  className="p-1.5 rounded-xl hover:bg-white/20 text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                {/* Toggle View Mode if they have an uploaded custom QR */}
                {selectedEmpMethod.method?.qrImageUrl && (
                  <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setQrViewMode('promptpay_auto')}
                      className={clsx(
                        'flex-1 py-1.5 text-xs font-bold rounded-lg transition text-center cursor-pointer',
                        qrViewMode === 'promptpay_auto'
                          ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      )}
                    >
                      QR ใส่ยอดเงินได้
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrViewMode('uploaded_image')}
                      className={clsx(
                        'flex-1 py-1.5 text-xs font-bold rounded-lg transition text-center cursor-pointer',
                        qrViewMode === 'uploaded_image'
                          ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      )}
                    >
                      รูป QR ต้นฉบับของเพื่อน
                    </button>
                  </div>
                )}

                {/* QR Display Card */}
                <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                  {qrViewMode === 'uploaded_image' && selectedEmpMethod.method?.qrImageUrl ? (
                    <div className="relative flex flex-col items-center">
                      <img
                        src={selectedEmpMethod.method.qrImageUrl}
                        alt="Employee QR Code"
                        className="w-64 h-64 sm:w-72 sm:h-72 object-contain rounded-2xl bg-white p-2 shadow-md border border-slate-200 dark:border-slate-700"
                      />
                      <span className="text-[11px] text-slate-500 mt-2 font-medium">
                        รูปภาพ QR Code ที่พนักงานอัปโหลดไว้
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200 flex items-center justify-center">
                        {isGeneratingQr ? (
                          <div className="w-56 h-56 flex items-center justify-center">
                            <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
                          </div>
                        ) : qrCodeDataUrl ? (
                          <img
                            src={qrCodeDataUrl}
                            alt="PromptPay QR"
                            className="w-56 h-56 sm:w-64 sm:h-64 object-contain"
                          />
                        ) : (
                          <div className="w-56 h-56 flex items-center justify-center text-xs text-slate-400">
                            ไม่สามารถสร้าง QR Code ได้
                          </div>
                        )}
                      </div>

                      {/* PromptPay Banner */}
                      <div className="mt-3 text-center">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800 inline-flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                          <span>ไทยพร้อมเพย์ (Thai PromptPay)</span>
                        </span>
                        {parseFloat(scanAmountStr) > 0 && (
                          <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-1.5 font-mono">
                            ยอดระบุใน QR: {parseFloat(scanAmountStr).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Account detail in card */}
                  <div className="w-full mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-center space-y-0.5">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {selectedEmpMethod.method?.accountName || selectedEmpMethod.userProfile?.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {selectedEmpMethod.method?.bankName}: {formatPaymentTarget(selectedEmpMethod.method?.accountNumber || '')}
                    </p>
                  </div>
                </div>

                {/* Amount Customizer (only for promptpay_auto mode) */}
                {qrViewMode === 'promptpay_auto' && (
                  <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      ระบุยอดเงินที่ต้องการโอนคืน (บาท):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={scanAmountStr}
                        onChange={(e) => setScanAmountStr(e.target.value)}
                        placeholder="ระบุจำนวนเงิน เช่น 50, 65, 120 (เว้นว่างไว้สแกนใส่ยอดเอง)"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                      />
                      {scanAmountStr && (
                        <button
                          type="button"
                          onClick={() => setScanAmountStr('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Quick amount presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {QUICK_AMOUNTS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setScanAmountStr(amt.toString())}
                          className={clsx(
                            'px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer',
                            scanAmountStr === amt.toString()
                              ? 'bg-sky-600 text-white'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          )}
                        >
                          {amt}฿
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        selectedEmpMethod.method?.accountNumber || '',
                        'modal_acc'
                      )
                    }
                    className={clsx(
                      'py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border cursor-pointer',
                      copiedText === 'modal_acc'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                    )}
                  >
                    {copiedText === 'modal_acc' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>คัดลอกเลขบัญชี</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="py-2 px-3 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-600" />
                    <span>บันทึกรูป QR</span>
                  </button>
                </div>

                {/* Copy for LINE / Chat */}
                <button
                  type="button"
                  onClick={() => {
                    const text = `💸 โอนเงินคืนให้คุณ ${selectedEmpMethod.userProfile?.name}\nธนาคาร/ช่องทาง: ${selectedEmpMethod.method?.bankName}\nเลขบัญชี: ${selectedEmpMethod.method?.accountNumber}\nชื่อบัญชี: ${selectedEmpMethod.method?.accountName || selectedEmpMethod.userProfile?.name}${scanAmountStr ? `\nยอดเงิน: ${scanAmountStr} บาท` : ''}`;
                    handleCopy(text, 'modal_chat_text');
                  }}
                  className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {copiedText === 'modal_chat_text'
                      ? 'คัดลอกข้อความสำหรับ LINE แล้ว!'
                      : 'คัดลอกข้อความส่งใน LINE / แชท'}
                  </span>
                </button>

                {/* Log repayment button */}
                <button
                  type="button"
                  onClick={() => {
                    setRepayTargetEmployee({
                      uid: selectedEmpMethod.userProfile!.uid,
                      name: selectedEmpMethod.userProfile!.name,
                    });
                    setRepayAmountStr(scanAmountStr || '');
                    setSelectedEmpMethod(null);
                    setShowLogRepayModal(true);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>โอนแล้ว? กดบันทึกรายการโอนคืน (แนบสลิป)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: LOG REPAYMENT & ATTACH SLIP */}
        {showLogRepayModal && (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-3 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
              <div className="p-4 bg-linear-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5" />
                  <h3 className="text-sm font-bold">บันทึกรายการโอนเงินคืนเพื่อน</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLogRepayModal(false)}
                  className="p-1.5 rounded-xl hover:bg-white/20 text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitRepayment} className="p-4 sm:p-5 overflow-y-auto space-y-4">
                {/* Target Employee */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    เพื่อนร่วมงานที่โอนคืนให้ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={repayTargetEmployee?.uid || ''}
                    onChange={(e) => {
                      const emp = combinedDirectory.find((item) => item.uid === e.target.value);
                      if (emp) {
                        setRepayTargetEmployee({ uid: emp.uid, name: emp.name });
                      }
                    }}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- เลือกเพื่อนร่วมงาน --</option>
                    {combinedDirectory
                      .filter((item) => item.uid !== user?.uid)
                      .map((item) => (
                        <option key={item.uid} value={item.uid}>
                          {item.name} {item.username ? `(@${item.username})` : ''}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    ยอดเงินที่โอนคืน (บาท) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={repayAmountStr}
                    onChange={(e) => setRepayAmountStr(e.target.value)}
                    placeholder="เช่น 65, 120.00"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    ประเภทรายการ
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(CATEGORY_MAP) as RepaymentCategory[]).map((cat) => {
                      const info = CATEGORY_MAP[cat];
                      const Icon = info.icon;
                      const isSelected = repayCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setRepayCategory(cat)}
                          className={clsx(
                            'p-2 rounded-xl text-xs font-semibold border flex items-center gap-2 transition text-left cursor-pointer',
                            isSelected
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                          )}
                        >
                          <Icon className="w-4 h-4 shrink-0 text-emerald-600" />
                          <span className="truncate">{info.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    รายละเอียด / รายการของที่ฝากซื้อ
                  </label>
                  <input
                    type="text"
                    value={repayDesc}
                    onChange={(e) => setRepayDesc(e.target.value)}
                    placeholder="เช่น ค่าข้าวมันไก่เที่ยงนี้, ค่าของ 7-11, เงินทอนเคส..."
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Attach Slip */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    แนบสลิปการโอนเงิน (ตัวเลือกเสริม)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      ref={repaySlipInputRef}
                      accept="image/*"
                      onChange={handleRepaySlipUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isUploadingSlip}
                      onClick={() => repaySlipInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      {isUploadingSlip ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>กำลังประมวลผลสลิป...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{repaySlipUrl ? 'เปลี่ยนรูปสลิป' : 'อัปโหลดสลิปโอนเงิน'}</span>
                        </>
                      )}
                    </button>

                    {repaySlipUrl && (
                      <div className="flex items-center gap-2">
                        <img
                          src={repaySlipUrl}
                          alt="Slip Preview"
                          className="w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                          onClick={() =>
                            setPreviewSlipImage({
                              url: repaySlipUrl,
                              title: 'ภาพสลิปการโอนเงินที่แนบ',
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setRepaySlipUrl('')}
                          className="text-xs text-rose-600 hover:underline cursor-pointer"
                        >
                          ลบสลิป
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit & Cancel */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogRepayModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingRepay}
                    className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingRepay ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>บันทึกการโอนคืน</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* LIGHTBOX: PREVIEW SLIP IMAGE */}
        {previewSlipImage && (
          <div className="fixed inset-0 z-80 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
            <div className="relative max-w-lg w-full bg-slate-900 rounded-3xl p-4 flex flex-col items-center">
              <div className="w-full flex items-center justify-between text-white pb-3 border-b border-slate-800">
                <span className="text-xs font-bold truncate pr-2">
                  {previewSlipImage.title}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewSlipImage(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="py-4 max-h-[75vh] overflow-auto flex items-center justify-center">
                <img
                  src={previewSlipImage.url}
                  alt="Slip Full"
                  className="max-h-[70vh] object-contain rounded-xl shadow-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
