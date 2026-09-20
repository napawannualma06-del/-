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
  ExternalLink
} from 'lucide-react';
import { clsx } from 'clsx';

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
  const location = useLocation();
  const [notifGranted, setNotifGranted] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showTechModal, setShowTechModal] = useState(false);
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

    return () => {
      unsub();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [user]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotifGranted(Notification.permission === 'granted');
    }
  }, []);

  const handleRequestNotification = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotifGranted(perm === 'granted');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col text-slate-800 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navbar */}
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-xs transition-colors">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-1.5 sm:gap-4">
            
            {/* Logo & Navigation */}
            <div className="flex items-center gap-1.5 sm:gap-4 lg:gap-6 shrink-0">
              <Link to="/" className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                <Logo size="sm" className="shrink-0" />
                <div className="hidden xs:block border-l border-slate-200 dark:border-slate-800 pl-1.5 sm:pl-2.5 shrink-0">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <span className="font-bold text-[11px] sm:text-xs md:text-sm text-slate-900 dark:text-white leading-none block whitespace-nowrap">
                      ระบบจัดการคิว
                    </span>
                    <span className="inline-flex items-center px-1 py-0.5 sm:px-1.5 rounded-full text-[8px] sm:text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shrink-0">
                      <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 animate-pulse mr-0.5 sm:mr-1"></span>
                      ออนไลน์
                    </span>
                  </div>
                  <span className="text-[9px] sm:text-[11px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap block mt-0.5">
                    ไทย พลัส+
                  </span>
                </div>
              </Link>
 
              {/* Unified Nav Links for ALL Sizes */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <Link
                  to="/"
                  className={clsx(
                    'inline-flex items-center px-2 py-1.5 sm:px-3 sm:py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer',
                    location.pathname === '/' 
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <ListTodo className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0.5 sm:mr-1.5 shrink-0" />
                  <span className="hidden xxs:inline">กระดานคิว</span>
                  <span className="xxs:hidden">คิว</span>
                </Link>
 
                <Link
                  to="/admin"
                  className={clsx(
                    'inline-flex items-center px-2 py-1.5 sm:px-3 sm:py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer',
                    location.pathname === '/admin' 
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0.5 sm:mr-1.5 shrink-0" />
                  <span className="hidden sm:inline">แดชบอร์ด & สถิติ</span>
                  <span className="inline sm:hidden">แดชบอร์ด</span>
                </Link>

                {/* ปุ่มแจ้งปัญหาเทคนิค */}
                <button
                  type="button"
                  onClick={() => setShowTechModal(true)}
                  className={clsx(
                    'relative inline-flex items-center px-2 py-1.5 sm:px-3 sm:py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] sm:text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer',
                    pendingTechCount > 0
                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 shadow-2xs hover:bg-rose-100 dark:hover:bg-rose-900/40'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                  title="แจ้งปัญหาด้านเทคนิค ส่งแอดมิน"
                >
                  <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0.5 sm:mr-1.5 shrink-0 text-rose-500" />
                  <span className="hidden sm:inline">แจ้งปัญหาเทคนิค</span>
                  <span className="inline sm:hidden">แจ้งปัญหา</span>
                  {pendingTechCount > 0 && (
                    <span className="ml-1 sm:ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow-2xs animate-pulse">
                      {pendingTechCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
 
            {/* User Profile & Actions */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleDarkMode}
                className="p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center cursor-pointer shrink-0"
                title={isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? (
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                ) : (
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 shrink-0" />
                )}
              </button>
 
              {/* Notification Center (Bell with unread badge until opened/read) */}
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
                    "px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs whitespace-nowrap",
                    isOffWork
                      ? "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      : "border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                  )}
                  title={isOffWork ? "ขณะนี้เลิกงานแล้ว (คลิกเพื่อเข้างาน)" : "ขณะนี้เข้างานอยู่ (คลิกเพื่อบันทึกเลิกงาน)"}
                >
                  <span className={clsx(
                    "w-2 h-2 rounded-full shrink-0",
                    isOffWork ? "bg-slate-400" : "bg-emerald-500 animate-pulse"
                  )} />
                  <span className="hidden sm:inline">
                    {isOffWork ? 'เลิกงานแล้ว' : 'เข้างานอยู่'}
                  </span>
                  <span className="inline sm:hidden">
                    {isOffWork ? 'เลิกงาน' : 'เข้างาน'}
                  </span>
                </button>
              )}

              {/* Current Member Badge (Click to customize avatar) */}
              <div className="flex items-center pl-1 sm:pl-3 border-l border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  id="open-avatar-selector-btn"
                  type="button"
                  onClick={() => setShowAvatarModal(true)}
                  className="group relative flex items-center p-1 sm:p-1.5 -ml-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer text-left focus:outline-hidden focus:ring-2 focus:ring-amber-500/50"
                  title="คลิกเพื่อเปลี่ยนรูปตัวการ์ตูนประจำตัว"
                >
                  <div className="relative mr-1.5 sm:mr-2 shrink-0">
                    <AnimalAvatar 
                      avatarEmoji={user?.avatarEmoji}
                      identifier={user?.username || user?.uid || 'user'} 
                      name={user?.name || 'User'} 
                      size="sm" 
                      className="sm:hidden" 
                    />
                    <AnimalAvatar 
                      avatarEmoji={user?.avatarEmoji}
                      identifier={user?.username || user?.uid || 'user'} 
                      name={user?.name || 'User'} 
                      size="md" 
                      className="hidden sm:flex" 
                    />
                    <span 
                      className="absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-500 text-white flex items-center justify-center opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-xs text-[8px] sm:text-[9px]"
                      title="เปลี่ยนรูปตัวการ์ตูน"
                    >
                      ✏️
                    </span>
                  </div>
                  <div className="hidden lg:block text-left mr-2 shrink-0">
                    <div className="flex items-center space-x-1.5 whitespace-nowrap">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[110px] group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {user?.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center whitespace-nowrap">
                      <span>@{user?.username || 'member'}</span>
                      <span className="ml-1 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium shrink-0">• เปลี่ยนรูป</span>
                    </div>
                  </div>
                </button>
 
                <button
                  type="button"
                  onClick={logout}
                  className="p-1.5 sm:p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition cursor-pointer shrink-0"
                  title="สลับผู้ใช้ / ออกจากระบบ"
                >
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Page Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7">
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
    </div>
  );
}
