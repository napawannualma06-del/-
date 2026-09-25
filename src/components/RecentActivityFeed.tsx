import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ActivityLog } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  Activity, 
  ChevronRight, 
  X, 
  Clock, 
  Sparkles, 
  CheckCircle2, 
  PauseCircle, 
  RotateCcw, 
  ArrowRightLeft, 
  PlusCircle, 
  FileSignature, 
  StickyNote,
  Ban,
  Search
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

export const RecentActivityFeed: React.FC = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    const q = query(
      collection(db, 'activities'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: ActivityLog[] = [];
        snapshot.forEach((doc) => {
          const item = { id: doc.id, ...doc.data() } as ActivityLog;
          const typeStr = String(item.type || '').toLowerCase();
          const descStr = String(item.description || '').toLowerCase();
          // Exclude personal confidential activities (OT, advance, funds) from public ticker
          if (
            typeStr.includes('ot') ||
            typeStr.includes('advance') ||
            descStr.includes('ot') ||
            descStr.includes('แอดวานซ์') ||
            descStr.includes('เบิกเงิน')
          ) {
            return;
          }
          list.push(item);
        });
        setActivities(list);
      },
      (err) => {
        console.warn('Realtime activities listener error:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  const latest = activities[0];

  const getActionBadge = (type: ActivityLog['type']) => {
    switch (type) {
      case 'create_case':
        return {
          icon: <PlusCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
          label: 'สร้างเคสใหม่',
          bg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        };
      case 'accept_case':
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />,
          label: 'รับเคส',
          bg: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        };
      case 'stuck_case':
        return {
          icon: <PauseCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
          label: 'เคสค้าง',
          bg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        };
      case 'transfer_case':
        return {
          icon: <ArrowRightLeft className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />,
          label: 'โยกเคส',
          bg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        };
      case 'return_case':
        return {
          icon: <RotateCcw className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />,
          label: 'คืนเคส',
          bg: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
        };
      case 'close_case':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
          label: 'จบเคส',
          bg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        };
      case 'contract_case':
        return {
          icon: <FileSignature className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />,
          label: 'เลขสัญญา',
          bg: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
        };
      case 'remark_case':
        return {
          icon: <StickyNote className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />,
          label: 'หมายเหตุ',
          bg: 'bg-yellow-50 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
        };
      case 'cancel_case':
        return {
          icon: <Ban className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
          label: 'ยกเลิกเคส',
          bg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        };
      default:
        return {
          icon: <Activity className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />,
          label: 'กิจกรรม',
          bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
        };
    }
  };

  const filteredActivities = activities.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.actorName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.iphoneModel || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="w-full">
      {/* Real-time Ticker Bar */}
      <div 
        id="recent-activity-ticker"
        className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-2 sm:px-3.5 sm:py-2 shadow-2xs flex items-center justify-between gap-2.5 transition-colors"
      >
        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
          {/* Live indicator dot */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-200">
              <Activity className="w-3.5 h-3.5 text-indigo-500 hidden xs:inline" />
              <span>กิจกรรมล่าสุด:</span>
            </div>
          </div>

          {/* Latest Item Summary */}
          {latest ? (
            <div className="flex items-center space-x-2 min-w-0 text-xs truncate">
              <AnimalAvatar
                identifier={latest.actorId}
                name={latest.actorName}
                avatarEmoji={latest.actorAvatarEmoji}
                size="xs"
              />
              <span className="font-semibold text-slate-900 dark:text-white shrink-0">
                {latest.actorName}
              </span>
              <span className="text-slate-500 dark:text-slate-400 truncate">
                {latest.description}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 hidden md:inline">
                • {formatDistanceToNow(latest.timestamp, { addSuffix: true, locale: th })}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic truncate">
              ยังไม่มีกิจกรรมใหม่เกิดขึ้นในระบบ
            </span>
          )}
        </div>

        {/* View All Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="shrink-0 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-xl transition flex items-center gap-1 cursor-pointer"
        >
          <span>ดูทั้งหมด ({activities.length})</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded Modal / Drawer for Activity Logs */}
      {isExpanded && (
        <div 
          id="activity-history-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsExpanded(false);
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-850/80">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800 shadow-2xs">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    ประวัติกิจกรรมเรียลไทม์
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                      สด
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ติดตามว่าใครทำ Action อะไรในคิวงานบ้าง แบบเรียลไทม์
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อคน, รุ่น iPhone, หรือกิจกรรม..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 text-xs">
                {[
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'accept_case', label: 'รับเคส' },
                  { id: 'stuck_case', label: 'เคสค้าง' },
                  { id: 'close_case', label: 'จบเคส' },
                  { id: 'create_case', label: 'สร้างเคส' },
                  { id: 'transfer_case', label: 'โยกเคส' },
                  { id: 'return_case', label: 'คืนเคส' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTypeFilter(tab.id)}
                    className={clsx(
                      "px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition cursor-pointer",
                      typeFilter === tab.id
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Activities */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredActivities.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  ไม่พบรายการกิจกรรมตามเงื่อนไขที่ระบุ
                </div>
              ) : (
                filteredActivities.map((act) => {
                  const badge = getActionBadge(act.type);
                  return (
                    <div 
                      key={act.id} 
                      className="pt-2.5 first:pt-0 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start space-x-2.5 min-w-0">
                        <div className="mt-0.5">
                          <AnimalAvatar
                            identifier={act.actorId}
                            name={act.actorName}
                            avatarEmoji={act.actorAvatarEmoji}
                            size="sm"
                          />
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {act.actorName}
                            </span>
                            <span className={clsx("px-1.5 py-0.2 rounded-md text-[10px] font-semibold border flex items-center gap-1", badge.bg)}>
                              {badge.icon}
                              <span>{badge.label}</span>
                            </span>
                          </div>

                          <p className="text-slate-600 dark:text-slate-300 leading-snug break-words">
                            {act.description}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block">
                          {format(act.timestamp, 'HH:mm น.', { locale: th })}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {formatDistanceToNow(act.timestamp, { addSuffix: true, locale: th })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/60 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                อัปเดตอัตโนมัติแบบเรียลไทม์
              </span>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 transition cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
