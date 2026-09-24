import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  CheckCheck, 
  CheckCircle2, 
  Clock, 
  Wrench, 
  ExternalLink, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

export interface TechNotificationItem {
  id: string;              // issue document id
  title: string;
  serialNumber: string;
  status: 'in_progress' | 'resolved';
  statusChangedBy?: string;
  adminNote?: string;
  updatedAt: number;
  read: boolean;
  notifKey: string;
}

interface NotificationCenterProps {
  notifications: TechNotificationItem[];
  unreadCount: number;
  onMarkAsRead: (notifKey: string) => void;
  onMarkAllAsRead: () => void;
  onOpenIssue: (issueId: string) => void;
  onOpenAllIssues: () => void;
  notifGranted: boolean;
  onRequestNotificationPermission: () => void;
}

export function NotificationCenter({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onOpenIssue,
  onOpenAllIssues,
  notifGranted,
  onRequestNotificationPermission,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = (item: TechNotificationItem) => {
    onMarkAsRead(item.notifKey);
    onOpenIssue(item.id);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={clsx(
          'relative p-1.5 sm:p-2 rounded-xl border text-xs transition flex items-center justify-center cursor-pointer shrink-0',
          unreadCount > 0
            ? 'border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 shadow-sm ring-2 ring-rose-500/20'
            : notifGranted
              ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
        )}
        title={
          unreadCount > 0
            ? `มีการแจ้งเตือนใหม่ ${unreadCount} รายการ (คลิกเพื่ออ่าน)`
            : 'การแจ้งเตือนพนักงาน'
        }
        aria-label="Notifications"
      >
        <Bell
          className={clsx(
            'w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform duration-200',
            unreadCount > 0 && 'text-rose-600 dark:text-rose-400 animate-bell-ring'
          )}
        />

        {/* Unread Badge - Remains until opened and read */}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center shadow-md animate-pulse border-2 border-white dark:border-slate-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  การแจ้งเตือน
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {unreadCount > 0 ? `ยังไม่อ่าน ${unreadCount} รายการ` : 'อ่านทั้งหมดแล้ว'}
                </p>
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                title="ทำเครื่องหมายว่าอ่านแล้วทั้งหมด"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>อ่านทั้งหมด</span>
              </button>
            )}
          </div>

          {/* List of Notifications */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <Sparkles className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  ยังไม่มีการแจ้งเตือน
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-[240px] mx-auto leading-relaxed">
                  เมื่อมีผู้รับเรื่องหรือแก้ไขปัญหาของคุณ จะมีแจ้งเตือนขึ้นที่นี่ทันที
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const isResolved = item.status === 'resolved';

                return (
                  <div
                    key={item.notifKey}
                    onClick={() => handleItemClick(item)}
                    className={clsx(
                      'p-3.5 transition-colors cursor-pointer flex items-start gap-3 group relative text-left',
                      !item.read
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    {/* Status Icon */}
                    <div
                      className={clsx(
                        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs',
                        isResolved
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                          : 'bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400'
                      )}
                    >
                      {isResolved ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span
                          className={clsx(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border',
                            isResolved
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                          )}
                        >
                          {isResolved ? '✅ แก้ไขเสร็จสิ้น' : '🛠️ รับเรื่องแล้ว'}
                        </span>

                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatDistanceToNow(item.updatedAt, { addSuffix: true, locale: th })}
                        </span>
                      </div>

                      <h4
                        className={clsx(
                          'text-xs leading-snug truncate',
                          !item.read
                            ? 'font-bold text-slate-900 dark:text-white'
                            : 'font-medium text-slate-700 dark:text-slate-300'
                        )}
                      >
                        {item.title}
                      </h4>

                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                        {item.serialNumber && item.serialNumber !== '-' && (
                          <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded text-[10px]">
                            SN: {item.serialNumber}
                          </span>
                        )}
                        {item.statusChangedBy && (
                          <span>โดย {item.statusChangedBy}</span>
                        )}
                      </div>

                      {item.adminNote && (
                        <div className="mt-2 text-[11px] bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-600 dark:text-slate-300 italic">
                          "{item.adminNote}"
                        </div>
                      )}
                    </div>

                    {/* Unread Indicator Dot / Arrow */}
                    <div className="shrink-0 flex items-center self-center pl-1">
                      {!item.read ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-100 dark:ring-rose-950/60" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 transition" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700/80 flex flex-col gap-2">
            {!notifGranted && (
              <button
                type="button"
                onClick={onRequestNotificationPermission}
                className="w-full py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-amber-500" />
                <span>เปิดแจ้งเตือนบนเบราว์เซอร์</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onOpenAllIssues();
                setIsOpen(false);
              }}
              className="w-full py-2 px-3 rounded-xl bg-slate-200/80 hover:bg-slate-300/80 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Wrench className="w-3.5 h-3.5 text-rose-500" />
              <span>ดูรายการแจ้งปัญหาทั้งหมด</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
