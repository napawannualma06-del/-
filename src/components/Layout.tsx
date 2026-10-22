import React, { useEffect, useState, useRef } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Logo } from './Logo';
import { AnimalAvatar } from './AnimalAvatar';
import { ClockOutConfirmModal } from './ClockOutConfirmModal';
import { AvatarSelectorModal } from './AvatarSelectorModal';
import { TeamChatBubble } from './TeamChatBubble';
import { TechnicalIssueModal } from './TechnicalIssueModal';
import { NotificationCenter, TechNotificationItem } from './NotificationCenter';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { playNotificationChime } from '../lib/sound';
import { 
  LogOut, 
  BarChart3, 
  ListTodo, 
  Bell, 
  Sun, 
  Moon,
  Briefcase,
  Smile,
  Wrench,
  CheckCircle2,
  Clock,
  X,
  ExternalLink,
  Zap,
  Banknote,
  ChevronDown,
  Layers,
  Bike,
  QrCode,
  Building2
} from 'lucide-react';
import { clsx } from 'clsx';
import { RefinanceGuideModal } from './RefinanceGuideModal';
import { OvertimeModal } from './OvertimeModal';
import { AdvanceModal } from './AdvanceModal';
import { MessengerDirectoryModal } from './MessengerDirectoryModal';
import { EmployeeQRModal } from './EmployeeQRModal';
import { MobileBottomNav } from './MobileBottomNav';
import { isUserAdmin } from '../store/useStore';
import { useInactivityTracker } from '../hooks/useInactivityTracker';
import { InactivityWarningModal } from './InactivityWarningModal';

interface TechStatusToast {
  id: string;
  issueId: string;
  notifKey: string;
  title: string;
  serialNumber: string;
  status: 'in_progress' | 'resolved';
  statusChangedBy?: string;
  adminNote?: string;
}

export function Layout() {
  const { user, logout, isDarkMode, toggleDarkMode, clockIn } = useStore();
  const {
    isWarning: isIdleWarning,
    remainingMs: idleRemainingMs,
    isAutoClockedOut,
    returnedCasesCount: autoReturnedCasesCount,
    resetActivity,
    dismissAutoClockOut,
  } = useInactivityTracker();
  const location = useLocation();
  const [notifGranted, setNotifGranted] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showTechModal, setShowTechModal] = useState(false);
  const [showOTModal, setShowOTModal] = useState(false);
  const [otDefaultTab, setOtDefaultTab] = useState<'my' | 'admin' | 'new'>('my');
  const [pendingOTCount, setPendingOTCount] = useState(0);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceDefaultTab, setAdvanceDefaultTab] = useState<'my' | 'admin' | 'new'>('my');
  const [pendingAdvanceCount, setPendingAdvanceCount] = useState(0);
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const toolsDropdownRef = useRef<HTMLDivElement | null>(null);
  const [showRefinanceModal, setShowRefinanceModal] = useState(false);
  const [refinanceModalModel, setRefinanceModalModel] = useState<string | undefined>(undefined);
  const [showMessengerModal, setShowMessengerModal] = useState(false);
  const [messengerInitialProvince, setMessengerInitialProvince] = useState<string>('all');
  const [showEmployeeQRModal, setShowEmployeeQRModal] = useState(false);
  const [employeeQRDefaultTab, setEmployeeQRDefaultTab] = useState<'directory' | 'my_qr' | 'history'>('directory');
  const [selectedEmployeeQRId, setSelectedEmployeeQRId] = useState<string | undefined>(undefined);
  const [pendingTechCount, setPendingTechCount] = useState(0);
  const [activeTechToast, setActiveTechToast] = useState<TechStatusToast | null>(null);
  const [techNotifications, setTechNotifications] = useState<TechNotificationItem[]>([]);
  const [highlightTechIssueId, setHighlightTechIssueId] = useState<string | undefined>(undefined);
  const initialTechLoadRef = useRef(true);
  const knownTechStatusRef = useRef<Map<string, string>>(new Map());
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isOffWork = user?.workStatus === 'off_work';

  // Read notification keys tracking
  const [readNotifKeys, setReadNotifKeys] = useState<Set<string>>(() => {
    if (!user?.uid) return new Set<string>();
    try {
      const raw = localStorage.getItem(`read_tech_notifs_${user.uid}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set<string>(arr.filter((x): x is string => typeof x === 'string'));
        }
      }
    } catch (e) {
      console.warn(e);
    }
    return new Set<string>();
  });
  const readNotifKeysRef = useRef<Set<string>>(readNotifKeys);
  readNotifKeysRef.current = readNotifKeys;

  // Sync readNotifKeys with localStorage on user change
  useEffect(() => {
    if (!user?.uid) {
      setReadNotifKeys(new Set<string>());
      return;
    }
    try {
      const raw = localStorage.getItem(`read_tech_notifs_${user.uid}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setReadNotifKeys(new Set<string>(arr.filter((x): x is string => typeof x === 'string')));
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }, [user?.uid]);

  const saveReadKeys = (newSet: Set<string>) => {
    setReadNotifKeys(newSet);
    readNotifKeysRef.current = newSet;
    if (user?.uid) {
      try {
        localStorage.setItem(`read_tech_notifs_${user.uid}`, JSON.stringify(Array.from(newSet)));
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const handleMarkAsRead = (notifKey: string) => {
    const updated = new Set<string>(Array.from(readNotifKeysRef.current));
    updated.add(notifKey);
    saveReadKeys(updated);
    setTechNotifications((prev) =>
      prev.map((n) => (n.notifKey === notifKey ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllAsRead = () => {
    const updated = new Set<string>(Array.from(readNotifKeysRef.current));
    techNotifications.forEach((n) => updated.add(n.notifKey));
    saveReadKeys(updated);
    setTechNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // Listen to technical_issues for pending badge and employee status update notifications
  useEffect(() => {
    const q = query(collection(db, 'technical_issues'));
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      const notifsList: TechNotificationItem[] = [];

      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === 'pending' || d.status === 'in_progress') {
          count++;
        }

        // Check if this issue belongs to the currently logged in user
        const isMyIssue = user && (d.reporterId === user.uid || (user.username && d.reporterUsername === user.username));
        if (isMyIssue) {
          const oldStatus = knownTechStatusRef.current.get(doc.id);
          const newStatus = d.status as 'pending' | 'in_progress' | 'resolved';

          // If status is in_progress or resolved, add to employee notification center list
          if (newStatus === 'in_progress' || newStatus === 'resolved') {
            const notifKey = `${doc.id}_${newStatus}_${d.updatedAt || 0}`;
            notifsList.push({
              id: doc.id,
              title: d.title || 'ปัญหาเทคนิค',
              serialNumber: d.serialNumber || '-',
              status: newStatus,
              statusChangedBy: d.statusChangedBy,
              adminNote: d.adminNote,
              updatedAt: d.updatedAt || d.createdAt || Date.now(),
              read: readNotifKeysRef.current.has(notifKey),
              notifKey,
            });
          }

          // If not initial load and status has changed to in_progress or resolved
          if (!initialTechLoadRef.current && oldStatus && oldStatus !== newStatus && (newStatus === 'in_progress' || newStatus === 'resolved')) {
            // Play notification chime
            playNotificationChime();

            const notifKey = `${doc.id}_${newStatus}_${d.updatedAt || Date.now()}`;
            // Set floating in-app toast
            const toastData: TechStatusToast = {
              id: `${doc.id}-${Date.now()}`,
              issueId: doc.id,
              notifKey,
              title: d.title || 'ปัญหาเทคนิค',
              serialNumber: d.serialNumber || '-',
              status: newStatus,
              statusChangedBy: d.statusChangedBy,
              adminNote: d.adminNote,
            };
            setActiveTechToast(toastData);

            // Auto dismiss after 9 seconds
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => {
              setActiveTechToast(null);
            }, 9000);

            // Trigger system browser notification if granted
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                const notifTitle = newStatus === 'in_progress' ? '🛠️ แอดมินรับเรื่องแล้ว!' : '✅ ปัญหาได้รับการแก้ไขเสร็จสิ้น!';
                const notifBody = `หัวข้อ: ${d.title}${d.serialNumber && d.serialNumber !== '-' ? ` (SN: ${d.serialNumber})` : ''}\nแอดมินได้${newStatus === 'in_progress' ? 'รับเรื่องแล้ว' : 'แก้ไขเสร็จสิ้นเรียบร้อยแล้ว'}`;
                new Notification(notifTitle, {
                  body: notifBody,
                  icon: '/icon.png',
                });
              } catch (e) {
                console.warn('Browser notification failed:', e);
              }
            }
          }

          // Save current status for tracking next change
          knownTechStatusRef.current.set(doc.id, newStatus);
        }
      });

      notifsList.sort((a, b) => b.updatedAt - a.updatedAt);
      setTechNotifications(notifsList);
      initialTechLoadRef.current = false;
      setPendingTechCount(count);
    }, () => {});

    // Listen to overtime_requests for pending badge (for admins: all, for employees: only own pending)
    const otQuery = query(collection(db, 'overtime_requests'));
    const unsubOT = onSnapshot(otQuery, (snap) => {
      let pendingCount = 0;
      const isAdmin = isUserAdmin(user);
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === 'pending') {
          if (isAdmin) {
            pendingCount++;
          } else if (
            user &&
            (d.employeeId === user.uid || (user.username && d.employeeUsername === user.username))
          ) {
            pendingCount++;
          }
        }
      });
      setPendingOTCount(pendingCount);
    }, () => {});

    // Listen to advance_requests for pending badge (for admins: all, for employees: only own pending)
    const advanceQuery = query(collection(db, 'advance_requests'));
    const unsubAdvance = onSnapshot(advanceQuery, (snap) => {
      let pendingCount = 0;
      const isAdmin = isUserAdmin(user);
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === 'pending') {
          if (isAdmin) {
            pendingCount++;
          } else if (
            user &&
            (d.employeeId === user.uid || (user.username && d.employeeUsername === user.username))
          ) {
            pendingCount++;
          }
        }
      });
      setPendingAdvanceCount(pendingCount);
    }, () => {});

    return () => {
      unsub();
      unsubOT();
      unsubAdvance();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [user]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotifGranted(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    const handleOpenRefinance = (e: any) => {
      if (e.detail?.model) {
        setRefinanceModalModel(e.detail.model);
      }
      setShowRefinanceModal(true);
    };

    const handleOpenOT = (e: any) => {
      if (e.detail?.tab) {
        setOtDefaultTab(e.detail.tab);
      }
      setShowOTModal(true);
    };

    const handleOpenAdvance = (e: any) => {
      if (e.detail?.tab) {
        setAdvanceDefaultTab(e.detail.tab);
      }
      setShowAdvanceModal(true);
    };

    const handleOpenMessenger = (e: any) => {
      if (e.detail?.province) {
        setMessengerInitialProvince(e.detail.province);
      } else {
        setMessengerInitialProvince('all');
      }
      setShowMessengerModal(true);
    };

    const handleOpenEmployeeQR = (e: any) => {
      if (e.detail?.tab) {
        setEmployeeQRDefaultTab(e.detail.tab);
      } else {
        setEmployeeQRDefaultTab('directory');
      }
      if (e.detail?.employeeId) {
        setSelectedEmployeeQRId(e.detail.employeeId);
      }
      setShowEmployeeQRModal(true);
    };

    window.addEventListener('open-refinance-guide', handleOpenRefinance);
    window.addEventListener('open-ot-modal', handleOpenOT);
    window.addEventListener('open-advance-modal', handleOpenAdvance);
    window.addEventListener('open-messenger-modal', handleOpenMessenger);
    window.addEventListener('open-employee-qr-modal', handleOpenEmployeeQR);
    return () => {
      window.removeEventListener('open-refinance-guide', handleOpenRefinance);
      window.removeEventListener('open-ot-modal', handleOpenOT);
      window.removeEventListener('open-advance-modal', handleOpenAdvance);
      window.removeEventListener('open-messenger-modal', handleOpenMessenger);
      window.removeEventListener('open-employee-qr-modal', handleOpenEmployeeQR);
    };
  }, []);

  // Click outside to close tools dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
        setShowToolsDropdown(false);
      }
    };

    if (showToolsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showToolsDropdown]);

  const handleRequestNotification = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotifGranted(perm === 'granted');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex flex-col text-slate-800 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navbar */}
      <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 sticky top-0 z-30 transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 gap-2 sm:gap-4">
            
            {/* Logo & Navigation */}
            <div className="flex items-center gap-3 lg:gap-6 shrink-0 min-w-0">
              <Link to="/" className="flex items-center gap-2.5 shrink-0 group" title="หน้าแรก">
                <Logo size="sm" className="shrink-0 scale-95 sm:scale-100 transition-transform group-hover:scale-105" />
                <div className="hidden lg:block border-l border-slate-200 dark:border-slate-800 pl-3 shrink-0">
                  <span className="font-bold text-sm text-slate-900 dark:text-white leading-tight block whitespace-nowrap tracking-tight">
                    ไทย พลัส+
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap block">
                    ระบบจัดการคิวงาน
                  </span>
                </div>
              </Link>
 
              {/* Unified Nav Links (iPad & Desktop - Mobile uses Bottom Dock) */}
              <div className="hidden md:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/50 shrink-0">
                <Link
                  to="/"
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer',
                    location.pathname === '/' 
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                  title="กระดานคิว"
                >
                  <ListTodo className="w-4 h-4 shrink-0" />
                  <span>คิวงาน</span>
                </Link>
 
                <Link
                  to="/admin"
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer',
                    location.pathname === '/admin' 
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                  title="แดชบอร์ด & สถิติ"
                >
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  <span>แดชบอร์ด</span>
                </Link>

                <Link
                  to="/agents"
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer',
                    location.pathname === '/agents' 
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  )}
                  title="รายชื่อ Agent & ข้อมูลบัญชีธนาคาร"
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>Agent</span>
                </Link>

                {/* เมนูดรอปดาวน์รวมเครื่องมือและบริการ */}
                <div className="relative" ref={toolsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowToolsDropdown(!showToolsDropdown)}
                    className={clsx(
                      'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer',
                      showToolsDropdown
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : (pendingOTCount > 0 || pendingAdvanceCount > 0 || pendingTechCount > 0)
                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/25'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    )}
                    title="บริการและคำขอ (OT, เบิกแอดวานซ์, เรทผ่อน, แจ้งปัญหา)"
                  >
                    <Layers className={clsx("w-4 h-4 shrink-0", showToolsDropdown ? "text-white" : "text-indigo-500")} />
                    <span>บริการ & คำขอ</span>
                    
                    {/* Badge รวมเตือนรายการรอดำเนินการ */}
                    {(pendingOTCount > 0 || pendingAdvanceCount > 0 || pendingTechCount > 0) && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white tabular-nums">
                        {(pendingOTCount + pendingAdvanceCount) + pendingTechCount}
                      </span>
                    )}

                    <ChevronDown className={clsx(
                      "w-3.5 h-3.5 transition-transform duration-200 shrink-0 opacity-70",
                      showToolsDropdown && "rotate-180"
                    )} />
                  </button>

                  {/* Dropdown Menu Panel */}
                  {showToolsDropdown && (
                    <div className="absolute left-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        บริการและแบบฟอร์มพนักงาน
                      </div>

                      {/* 1. ขอเบิกเงินแอดวานซ์ */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowToolsDropdown(false);
                          setAdvanceDefaultTab(isUserAdmin(user) ? 'admin' : 'my');
                          setShowAdvanceModal(true);
                        }}
                        className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Banknote className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                              ขอเบิกเงินแอดวานซ์
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              ตัดรอบทุกวันที่ 25 · แนบสลิปโอน
                            </span>
                          </div>
                        </div>

                        {pendingAdvanceCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shrink-0 tabular-nums">
                            {pendingAdvanceCount}
                          </span>
                        )}
                      </button>

                      {/* 2. ระบบขอและอนุมัติ OT */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowToolsDropdown(false);
                          setOtDefaultTab(isUserAdmin(user) ? 'admin' : 'my');
                          setShowOTModal(true);
                        }}
                        className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 shrink-0">
                            <Clock className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                              ระบบขอและอนุมัติ OT
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              บันทึกเวลาทำงานล่วงเวลา
                            </span>
                          </div>
                        </div>

                        {pendingOTCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shrink-0 tabular-nums">
                            {pendingOTCount}
                          </span>
                        )}
                      </button>

                      {/* 3. ตารางรีไฟแนนซ์ iPhone */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowToolsDropdown(false);
                          setRefinanceModalModel(undefined);
                          setShowRefinanceModal(true);
                        }}
                        className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 shrink-0">
                            <Zap className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block group-hover:text-amber-600 dark:group-hover:text-amber-400">
                              ตารางรีไฟแนนซ์ iPhone
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              คำนวณค่างวดผ่อน & สุขภาพแบต
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                      {/* 4. รายชื่อแมสเซนเจอร์ Thunder Cloud */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowToolsDropdown(false);
                          setMessengerInitialProvince('all');
                          setShowMessengerModal(true);
                        }}
                        className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 shrink-0">
                            <Bike className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block group-hover:text-sky-600 dark:group-hover:text-sky-400">
                              รายชื่อแมสเซนเจอร์
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              ติดต่อแมส 98+ คน ทุกพื้นที่ทั่วประเทศ
                            </span>
                          </div>
                        </div>
                      </button>

                      {/* 5. ระบบ QR Code พนักงาน */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowToolsDropdown(false);
                          setEmployeeQRDefaultTab('directory');
                          setShowEmployeeQRModal(true);
                        }}
                        className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 shrink-0">
                            <QrCode className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block group-hover:text-purple-600 dark:group-hover:text-purple-400">
                              QR Code พนักงาน
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              โอนเงินคืน · ฝากซื้อของ · เพิ่ม QR
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                      {/* 6. แจ้งปัญหาเทคนิค */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowToolsDropdown(false);
                          setShowTechModal(true);
                        }}
                        className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shrink-0">
                            <Wrench className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block group-hover:text-rose-600 dark:group-hover:text-rose-400">
                              แจ้งปัญหาเทคนิค
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">
                              รายงานระบบขัดข้องหรือตัวเครื่อง
                            </span>
                          </div>
                        </div>

                        {pendingTechCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shrink-0 tabular-nums">
                            {pendingTechCount}
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
 
            {/* User Profile & Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Employee Work Shift Status (เข้างาน / เลิกงาน) */}
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    if (isOffWork) {
                      clockIn();
                    } else {
                      setShowClockOutModal(true);
                    }
                  }}
                  className={clsx(
                    "h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap",
                    isOffWork
                      ? "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      : "border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/80"
                  )}
                  title={isOffWork ? "ขณะนี้ว่างงาน (คลิกเพื่อเข้างาน)" : "ขณะนี้เข้างานอยู่ (คลิกเพื่อบันทึกเลิกงาน)"}
                >
                  <span className={clsx(
                    "w-2 h-2 rounded-full shrink-0",
                    isOffWork ? "bg-slate-400" : "bg-emerald-500"
                  )} />
                  <span className="hidden sm:inline">
                    {isOffWork ? 'ว่างงาน' : 'เข้างานอยู่'}
                  </span>
                </button>
              )}

              {/* Notification Center */}
              <NotificationCenter
                notifications={techNotifications}
                unreadCount={techNotifications.filter((n) => !n.read).length}
                onMarkAsRead={handleMarkAsRead}
                onMarkAllAsRead={handleMarkAllAsRead}
                onOpenIssue={(issueId) => {
                  setHighlightTechIssueId(issueId);
                  setShowTechModal(true);
                }}
                onOpenAllIssues={() => {
                  setHighlightTechIssueId(undefined);
                  setShowTechModal(true);
                }}
                notifGranted={notifGranted}
                onRequestNotificationPermission={handleRequestNotification}
              />

              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleDarkMode}
                className="w-9 h-9 rounded-xl border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center cursor-pointer shrink-0"
                title={isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? (
                  <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-600 shrink-0" />
                )}
              </button>
 
              {/* Current Member Badge */}
              <div className="flex items-center pl-1.5 sm:pl-2 border-l border-slate-200/80 dark:border-slate-800 shrink-0 gap-1">
                <button
                  id="open-avatar-selector-btn"
                  type="button"
                  onClick={() => setShowAvatarModal(true)}
                  className="group relative flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer text-left shrink-0"
                  title="คลิกเพื่อเปลี่ยนรูปตัวการ์ตูนประจำตัว"
                >
                  <div className="relative shrink-0">
                    <AnimalAvatar 
                      avatarEmoji={user?.avatarEmoji}
                      identifier={user?.username || user?.uid || 'user'} 
                      name={user?.name || 'User'} 
                      size="sm" 
                    />
                  </div>
                  <div className="hidden lg:block text-left mr-1 shrink-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[100px] block leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {user?.name}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-tight">
                      @{user?.username || 'member'}
                    </span>
                  </div>
                </button>
 
                <button
                  type="button"
                  onClick={logout}
                  className="hidden md:flex w-9 h-9 items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition cursor-pointer shrink-0"
                  title="สลับผู้ใช้ / ออกจากระบบ"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Page Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-28 md:py-6">
        <Outlet />
      </main>

      {/* Avatar Customization Modal */}
      {user && (
        <AvatarSelectorModal
          isOpen={showAvatarModal}
          onClose={() => setShowAvatarModal(false)}
        />
      )}

      {/* Clock Out Confirmation Modal */}
      {user && (
        <ClockOutConfirmModal
          isOpen={showClockOutModal}
          onClose={() => setShowClockOutModal(false)}
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

      {/* Auto Clock-Out & Inactivity Warning Modal */}
      <InactivityWarningModal
        isWarning={isIdleWarning}
        remainingMs={idleRemainingMs}
        isAutoClockedOut={isAutoClockedOut}
        returnedCasesCount={autoReturnedCasesCount}
        onResetActivity={resetActivity}
        onDismissAutoClockOut={dismissAutoClockOut}
      />

      {/* Real-time Team Chat Floating Bubble */}
      {user && <TeamChatBubble />}

      {/* Technical Issues Modal */}
      {user && (
        <TechnicalIssueModal
          isOpen={showTechModal}
          onClose={() => {
            setShowTechModal(false);
            setHighlightTechIssueId(undefined);
          }}
          highlightIssueId={highlightTechIssueId}
        />
      )}

      {/* Refinance Rates & Installment Guide Modal */}
      <RefinanceGuideModal
        isOpen={showRefinanceModal}
        onClose={() => setShowRefinanceModal(false)}
        initialModel={refinanceModalModel}
      />

      {/* Messenger Directory Modal (Thunder Cloud 98 couriers) */}
      <MessengerDirectoryModal
        isOpen={showMessengerModal}
        onClose={() => setShowMessengerModal(false)}
        initialProvince={messengerInitialProvince}
      />

      {/* Overtime Request & Approval Modal */}
      {user && (
        <OvertimeModal
          isOpen={showOTModal}
          onClose={() => setShowOTModal(false)}
          defaultTab={otDefaultTab}
        />
      )}

      {/* Advance Request & Approval Modal (with slip attachment) */}
      {user && (
        <AdvanceModal
          isOpen={showAdvanceModal}
          onClose={() => setShowAdvanceModal(false)}
          defaultTab={advanceDefaultTab}
        />
      )}

      {/* Employee QR Code & Peer Repayment Modal */}
      <EmployeeQRModal
        isOpen={showEmployeeQRModal}
        onClose={() => {
          setShowEmployeeQRModal(false);
          setSelectedEmployeeQRId(undefined);
        }}
        initialEmployeeId={selectedEmployeeQRId}
        initialTab={employeeQRDefaultTab}
      />

      {/* Floating Status Notification for Employee */}
      {activeTechToast && (
        <div className="fixed top-20 right-3 sm:right-6 z-50 max-w-sm sm:max-w-md w-[calc(100vw-1.5rem)] animate-in slide-in-from-top-4 fade-in duration-300">
          <div
            className={clsx(
              'p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all',
              activeTechToast.status === 'in_progress'
                ? 'bg-sky-50/95 dark:bg-sky-950/95 border-sky-300 dark:border-sky-800 text-sky-950 dark:text-sky-100 shadow-sky-500/10'
                : 'bg-emerald-50/95 dark:bg-emerald-950/95 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100 shadow-emerald-500/10'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={clsx(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs',
                  activeTechToast.status === 'in_progress'
                    ? 'bg-sky-500 text-white animate-pulse'
                    : 'bg-emerald-500 text-white'
                )}
              >
                {activeTechToast.status === 'in_progress' ? (
                  <Clock className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                      activeTechToast.status === 'in_progress'
                        ? 'bg-sky-200 dark:bg-sky-900 text-sky-800 dark:text-sky-200'
                        : 'bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                    )}
                  >
                    {activeTechToast.status === 'in_progress' ? '🛠️ แอดมินรับเรื่องแล้ว' : '✅ แก้ไขเสร็จสิ้นแล้ว'}
                  </span>
                  {activeTechToast.statusChangedBy && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      โดย {activeTechToast.statusChangedBy}
                    </span>
                  )}
                </div>

                <h4 className="font-bold text-sm mt-1 truncate text-slate-900 dark:text-white">
                  {activeTechToast.title}
                </h4>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                  SN: <span className="font-mono font-semibold">{activeTechToast.serialNumber}</span>
                  {activeTechToast.adminNote ? ` • "${activeTechToast.adminNote}"` : ''}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleMarkAsRead(activeTechToast.notifKey);
                      setHighlightTechIssueId(activeTechToast.issueId);
                      setShowTechModal(true);
                      setActiveTechToast(null);
                    }}
                    className={clsx(
                      'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs',
                      activeTechToast.status === 'in_progress'
                        ? 'bg-sky-600 hover:bg-sky-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    )}
                  >
                    <span>เปิดดูรายละเอียด</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTechToast(null)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
                  >
                    ปิด
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTechToast(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
                title="ปิดการแจ้งเตือน"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Dock & Action Drawer */}
      {user && (
        <MobileBottomNav
          user={user}
          pendingOTCount={pendingOTCount}
          pendingAdvanceCount={pendingAdvanceCount}
          pendingTechCount={pendingTechCount}
          onOpenOT={() => {
            setOtDefaultTab(isUserAdmin(user) ? 'admin' : 'my');
            setShowOTModal(true);
          }}
          onOpenAdvance={() => {
            setAdvanceDefaultTab(isUserAdmin(user) ? 'admin' : 'my');
            setShowAdvanceModal(true);
          }}
          onOpenRefinance={() => {
            setRefinanceModalModel(undefined);
            setShowRefinanceModal(true);
          }}
          onOpenMessenger={() => {
            setMessengerInitialProvince('all');
            setShowMessengerModal(true);
          }}
          onOpenEmployeeQR={() => {
            setEmployeeQRDefaultTab('directory');
            setShowEmployeeQRModal(true);
          }}
          onOpenTech={() => {
            setShowTechModal(true);
          }}
          onToggleDarkMode={toggleDarkMode}
          isDarkMode={isDarkMode}
          onClockToggle={() => {
            if (isOffWork) {
              clockIn();
            } else {
              setShowClockOutModal(true);
            }
          }}
          isOffWork={isOffWork}
          onLogout={logout}
        />
      )}
    </div>
  );
}
