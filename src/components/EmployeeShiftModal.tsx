import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  CalendarCheck, 
  Clock, 
  Download, 
  Users, 
  X, 
  RefreshCw 
} from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';
import { ShiftTemplate } from '../types';
import { 
  getAvailableOTCycles, 
  getOTCycleInfo,
  getOTCycleFromDate,
  OTCycleInfo 
} from '../lib/otUtils';
import { 
  fetchShiftTemplates, 
  fetchShiftPrefs,
  fetchCycleSchedule, 
  getDaysInCycle, 
  exportScheduleToCsv,
  DEFAULT_SHIFT_TEMPLATES,
  SPECIAL_DAYS_CONFIG,
  ScheduleDayCol
} from '../lib/shiftScheduleService';
import { AnimalAvatar } from './AnimalAvatar';

interface EmployeeShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmployeeShiftModal({ isOpen, onClose }: EmployeeShiftModalProps) {
  const { user, registeredUsers } = useStore();

  const availableCycles = useMemo(() => getAvailableOTCycles(), []);
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>(() => {
    return availableCycles[0]?.cycleKey || getOTCycleFromDate(new Date().toISOString().split('T')[0]).cycleKey;
  });

  const selectedCycleInfo = useMemo(() => {
    const found = availableCycles.find((c) => c.cycleKey === selectedCycleKey);
    if (found) return found;
    const [y, m] = selectedCycleKey.split('-').map(Number);
    return getOTCycleInfo(y, m);
  }, [availableCycles, selectedCycleKey]);

  const daysCols = useMemo(() => getDaysInCycle(selectedCycleInfo), [selectedCycleInfo]);

  const [templates, setTemplates] = useState<ShiftTemplate[]>(DEFAULT_SHIFT_TEMPLATES);
  const [scheduleDays, setScheduleDays] = useState<Record<string, Record<string, string>>>({});
  const [prefs, setPrefs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Fetch read-only schedule for the selected cycle
  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    async function loadSchedule() {
      setLoading(true);
      try {
        const [loadedTemplates, loadedPrefs, loadedSchedule] = await Promise.all([
          fetchShiftTemplates(),
          fetchShiftPrefs(),
          fetchCycleSchedule(selectedCycleKey),
        ]);

        if (!isCancelled) {
          setTemplates(loadedTemplates);
          setPrefs(loadedPrefs);
          setScheduleDays(loadedSchedule.days || {});
        }
      } catch (err) {
        console.error('Error loading employee shift view:', err);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadSchedule();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, selectedCycleKey]);

  // Visible employees (exclude hidden)
  const visibleEmployees = useMemo(() => {
    return (registeredUsers || [])
      .filter((u) => u.accountStatus !== 'rejected')
      .filter((u) => !prefs[u.uid]?.hiddenFromSchedule)
      .sort((a, b) => {
        // Put logged-in user at the top or in natural alphabetical
        if (user && a.uid === user.uid) return -1;
        if (user && b.uid === user.uid) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [registeredUsers, prefs, user]);

  const templateMap = useMemo(() => {
    const map = new Map<string, ShiftTemplate>();
    templates.forEach((t) => map.set(t.id, t));
    return map;
  }, [templates]);

  const handleExportExcel = () => {
    exportScheduleToCsv(
      selectedCycleInfo,
      daysCols,
      visibleEmployees,
      scheduleDays,
      templates
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-7xl p-4 sm:p-6 space-y-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 shrink-0">
              <CalendarCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  ตารางกะการทำงานพนักงาน
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  ดูทั้งทีม
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ตรวจสอบวันเข้ากะ วันหยุดประจำสัปดาห์ และวันนักขัตฤกษ์ (ตัดรอบทุกวันที่ 25)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
            {/* Cycle Selector */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-2xs">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div>
                <div className="text-[9px] font-semibold text-slate-400 leading-none">เลือกรอบบิล</div>
                <select
                  value={selectedCycleKey}
                  onChange={(e) => setSelectedCycleKey(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden cursor-pointer"
                >
                  {availableCycles.slice(0, 4).map((c) => (
                    <option key={c.cycleKey} value={c.cycleKey} className="dark:bg-slate-800">
                      {c.cycleLabel} ({c.periodLabel})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
              title="ส่งออกตารางกะเป็นไฟล์ Excel CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ดาวน์โหลด Excel</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="ปิด"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs py-1 px-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-500 dark:text-slate-400 text-[11px]">
              สัญลักษณ์กะงาน:
            </span>
            {templates.map((t) => (
              <span
                key={t.id}
                className="px-2 py-0.5 rounded-md font-bold text-white shadow-2xs text-[11px]"
                style={{ backgroundColor: t.color }}
              >
                {t.shortCode || t.name}: {t.startTime} - {t.endTime} น.
              </span>
            ))}
            <span className="px-2 py-0.5 rounded-md font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px]">
              OFF: วันหยุด
            </span>
            <span className="px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[11px]">
              ลา: ลางาน
            </span>
            <span className="px-2 py-0.5 rounded-md font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[11px]">
              นักขัต: นักขัตฤกษ์
            </span>
          </div>

          {user && (
            <div className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0 animate-pulse" />
              <span>แถวที่มีกรอบสีน้ำเงินคือตารางของคุณ</span>
            </div>
          )}
        </div>

        {/* Schedule Table Container */}
        <div className="overflow-auto flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          {loading ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              กำลังโหลดข้อมูลตารางกะงานรอบ {selectedCycleInfo.cycleLabel}...
            </div>
          ) : visibleEmployees.length === 0 ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
              ไม่พบรายชื่อพนักงานในตารางของรอบนี้
            </div>
          ) : (
            <table className="w-full border-collapse text-xs select-none">
              <thead>
                <tr className="bg-slate-100/90 dark:bg-slate-800/90 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700">
                  <th className="sticky left-0 z-30 bg-slate-200/90 dark:bg-slate-800 px-3 py-2 text-left font-bold text-slate-700 dark:text-slate-200 min-w-[140px] shadow-[2px_0_5px_rgba(0,0,0,0.06)]">
                    พนักงาน ({visibleEmployees.length})
                  </th>

                  {daysCols.map((col) => (
                    <th
                      key={col.dateStr}
                      className={clsx(
                        "px-1.5 py-2 text-center font-bold min-w-[42px] border-l border-slate-200/70 dark:border-slate-700/60",
                        col.isWeekend
                          ? "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-extrabold"
                          : "text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <div className="text-[10px] opacity-75">{col.thaiDayShort}</div>
                      <div className="text-sm font-black leading-tight">{col.dayNumber}</div>
                    </th>
                  ))}

                  <th className="px-2 py-2 text-center font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-l border-indigo-200 dark:border-indigo-900/60 min-w-[46px]">
                    ทำงาน
                  </th>
                  <th className="px-2 py-2 text-center font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 min-w-[42px]">
                    หยุด
                  </th>
                  <th className="px-2 py-2 text-center font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 min-w-[42px]">
                    ลา
                  </th>
                  <th className="px-2 py-2 text-center font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 min-w-[42px]">
                    นักขัต
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {visibleEmployees.map((emp) => {
                  const isMyRow = user && emp.uid === user.uid;
                  const empSchedule = scheduleDays[emp.uid] || {};

                  let workDays = 0;
                  let offDays = 0;
                  let leaveDays = 0;
                  let holidayDays = 0;

                  daysCols.forEach((c) => {
                    const val = empSchedule[c.dateStr];
                    if (!val) return;
                    if (val === 'off') offDays++;
                    else if (val === 'leave') leaveDays++;
                    else if (val === 'holiday') holidayDays++;
                    else workDays++;
                  });

                  return (
                    <tr
                      key={emp.uid}
                      className={clsx(
                        "transition-colors",
                        isMyRow
                          ? "bg-indigo-50/70 dark:bg-indigo-950/40 font-bold ring-2 ring-indigo-500/40 relative z-10"
                          : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      )}
                    >
                      {/* Sticky Employee Cell */}
                      <td
                        className={clsx(
                          "sticky left-0 z-10 px-3 py-2 text-left shadow-[2px_0_5px_rgba(0,0,0,0.04)] border-r border-slate-200 dark:border-slate-800",
                          isMyRow
                            ? "bg-indigo-100/90 dark:bg-indigo-950 text-indigo-950 dark:text-white"
                            : "bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <AnimalAvatar
                            avatarEmoji={emp.avatarEmoji}
                            identifier={emp.username || emp.uid}
                            name={emp.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-xs font-bold truncate">{emp.name}</span>
                              {isMyRow && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-indigo-600 text-white shrink-0">
                                  คุณ
                                </span>
                              )}
                            </div>
                            {emp.username && (
                              <div className="text-[10px] text-slate-400 truncate">@{emp.username}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Day Cells */}
                      {daysCols.map((col) => {
                        const cellVal = empSchedule[col.dateStr] || '';
                        const shiftTemplate = templateMap.get(cellVal);
                        const specialConfig = SPECIAL_DAYS_CONFIG[cellVal];

                        return (
                          <td
                            key={col.dateStr}
                            className={clsx(
                              "p-1 text-center border-l border-slate-100 dark:border-slate-800/60",
                              col.isWeekend && "bg-amber-50/20 dark:bg-amber-950/10"
                            )}
                          >
                            {cellVal ? (
                              specialConfig ? (
                                <span
                                  className={clsx(
                                    "inline-block px-1.5 py-1 rounded-md text-[10px] font-bold border leading-none shadow-2xs whitespace-nowrap",
                                    specialConfig.badgeClass
                                  )}
                                  title={`${specialConfig.label} (${col.dateStr})`}
                                >
                                  {specialConfig.shortCode}
                                </span>
                              ) : shiftTemplate ? (
                                <span
                                  className="inline-block px-1.5 py-1 rounded-md text-[10px] font-bold text-white leading-none shadow-2xs whitespace-nowrap"
                                  style={{ backgroundColor: shiftTemplate.color }}
                                  title={`${shiftTemplate.name}: ${shiftTemplate.startTime} - ${shiftTemplate.endTime} น.`}
                                >
                                  {shiftTemplate.shortCode || shiftTemplate.name}
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                  {cellVal}
                                </span>
                              )
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700 font-mono text-xs">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Summary Columns */}
                      <td className="px-2 py-2 text-center font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 border-l border-indigo-200/60 dark:border-indigo-900/40 tabular-nums">
                        {workDays}
                      </td>
                      <td className="px-2 py-2 text-center font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-l border-slate-200/60 dark:border-slate-800 tabular-nums">
                        {offDays}
                      </td>
                      <td className="px-2 py-2 text-center font-bold text-amber-700 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20 border-l border-slate-200/60 dark:border-slate-800 tabular-nums">
                        {leaveDays}
                      </td>
                      <td className="px-2 py-2 text-center font-bold text-rose-700 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20 border-l border-slate-200/60 dark:border-slate-800 tabular-nums">
                        {holidayDays}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <span>รอบการทำงานปัจจุบัน: <strong>{selectedCycleInfo.periodLabel}</strong></span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
