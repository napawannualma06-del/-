import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, 
  CalendarCheck, 
  Clock, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  Download, 
  Users, 
  Settings, 
  Sparkles, 
  Copy, 
  Flag, 
  AlertCircle, 
  Check, 
  X, 
  ChevronDown,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { clsx } from 'clsx';
import { useStore, isUserAdmin } from '../store/useStore';
import { ShiftTemplate, EmployeeShiftPref } from '../types';
import { 
  getAvailableOTCycles, 
  getOTCycleInfo,
  getOTCycleFromDate,
  OTCycleInfo 
} from '../lib/otUtils';
import { 
  fetchShiftTemplates, 
  saveShiftTemplates, 
  fetchShiftPrefs, 
  saveShiftPrefs, 
  fetchCycleSchedule, 
  saveCycleSchedule, 
  getDaysInCycle, 
  exportScheduleToCsv,
  DEFAULT_SHIFT_TEMPLATES,
  SPECIAL_DAYS_CONFIG,
  THAI_WEEKDAY_NAMES,
  THAI_WEEKDAY_FULL,
  ScheduleDayCol
} from '../lib/shiftScheduleService';
import { AnimalAvatar } from './AnimalAvatar';

export function AdminShiftDashboard() {
  const { user, registeredUsers } = useStore();
  const isAdmin = isUserAdmin(user);

  // Available cycles
  const availableCycles = useMemo(() => getAvailableOTCycles(), []);
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return getOTCycleFromDate(todayStr).cycleKey;
  });

  const selectedCycleInfo = useMemo(() => {
    const found = availableCycles.find((c) => c.cycleKey === selectedCycleKey);
    if (found) return found;
    const [y, m] = selectedCycleKey.split('-').map(Number);
    return getOTCycleInfo(y, m);
  }, [availableCycles, selectedCycleKey]);

  const daysCols = useMemo(() => getDaysInCycle(selectedCycleInfo), [selectedCycleInfo]);

  // Data states
  const [templates, setTemplates] = useState<ShiftTemplate[]>(DEFAULT_SHIFT_TEMPLATES);
  const [prefs, setPrefs] = useState<Record<string, EmployeeShiftPref>>({});
  const [scheduleDays, setScheduleDays] = useState<Record<string, Record<string, string>>>({});
  
  // Loading, error & dirty tracking
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals & Popovers
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showPrefModal, setShowPrefModal] = useState(false);
  const [showFillAutoModal, setShowFillAutoModal] = useState(false);
  const [fillOverwriteExisting, setFillOverwriteExisting] = useState(false);
  const [showCopyPrevModal, setShowCopyPrevModal] = useState(false);
  const [copyOverwriteExisting, setCopyOverwriteExisting] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [selectedHolidayDate, setSelectedHolidayDate] = useState<string>('');
  const [activeCellPicker, setActiveCellPicker] = useState<{ empId: string; dateStr: string } | null>(null);

  // Pending cycle switch warning if dirty
  const [pendingCycleKey, setPendingCycleKey] = useState<string | null>(null);

  // Initial Load & cycle change
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoading(true);
      setLoadError(false);
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
          setIsDirty(false);
          setLoadError(false);
        }
      } catch (err) {
        console.error('Error loading shift dashboard data:', err);
        if (!isCancelled) {
          setLoadError(true);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [selectedCycleKey, reloadTrigger]);

  // Prompt before window unload if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Active visible employees for schedule (exclude hidden)
  const visibleEmployees = useMemo(() => {
    return (registeredUsers || [])
      .filter((u) => u.accountStatus !== 'rejected')
      .filter((u) => !prefs[u.uid]?.hiddenFromSchedule)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [registeredUsers, prefs]);

  // Helper map for quick template lookup
  const templateMap = useMemo(() => {
    const map = new Map<string, ShiftTemplate>();
    templates.forEach((t) => map.set(t.id, t));
    return map;
  }, [templates]);

  // Handle cell click / selection
  const handleSetCell = (empId: string, dateStr: string, value: string) => {
    setScheduleDays((prev) => {
      const empSchedule = { ...(prev[empId] || {}) };
      if (!value) {
        delete empSchedule[dateStr];
      } else {
        empSchedule[dateStr] = value;
      }
      return {
        ...prev,
        [empId]: empSchedule,
      };
    });
    setIsDirty(true);
    setActiveCellPicker(null);
  };

  // Save changes to Firestore
  const handleSave = async () => {
    if (!isAdmin || !user || loadError || loading) return;
    setIsSaving(true);
    setStatusNotice(null);

    try {
      await saveCycleSchedule(selectedCycleKey, scheduleDays, user.name || 'แอดมิน');
      setIsDirty(false);
      setStatusNotice({
        type: 'success',
        message: `บันทึกตารางกะงานสำหรับ ${selectedCycleInfo.cycleLabel} เรียบร้อยแล้ว`,
      });
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (err) {
      console.error('Save schedule error:', err);
      setStatusNotice({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการบันทึกตารางกะ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper: Auto-fill from regular off days & default shift
  const handleExecuteFillAuto = () => {
    setScheduleDays((prev) => {
      const next = { ...prev };

      visibleEmployees.forEach((emp) => {
        const empPref = prefs[emp.uid];
        const regularOff = empPref?.regularOffDays || [];
        const defaultShift = empPref?.defaultShiftId;

        const curEmpSchedule = { ...(next[emp.uid] || {}) };

        daysCols.forEach((col) => {
          const hasExisting = !!curEmpSchedule[col.dateStr];
          if (hasExisting && !fillOverwriteExisting) {
            return;
          }

          if (regularOff.includes(col.dayOfWeek)) {
            curEmpSchedule[col.dateStr] = 'off';
          } else if (defaultShift) {
            curEmpSchedule[col.dateStr] = defaultShift;
          }
        });

        next[emp.uid] = curEmpSchedule;
      });

      return next;
    });

    setIsDirty(true);
    setShowFillAutoModal(false);
    setStatusNotice({
      type: 'success',
      message: 'เติมตารางจากวันหยุดประจำและกะประจำเรียบร้อยแล้ว (อย่าลืมกดบันทึก)',
    });
    setTimeout(() => setStatusNotice(null), 4000);
  };

  // Helper: Copy from previous cycle
  const handleCopyFromPreviousCycle = async () => {
    const curIdx = availableCycles.findIndex((c) => c.cycleKey === selectedCycleKey);
    let prevCycleInfo: OTCycleInfo;

    if (curIdx >= 0 && curIdx < availableCycles.length - 1) {
      prevCycleInfo = availableCycles[curIdx + 1];
    } else {
      const [y, m] = selectedCycleKey.split('-').map(Number);
      prevCycleInfo = getOTCycleInfo(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
    }

    try {
      const prevDoc = await fetchCycleSchedule(prevCycleInfo.cycleKey);
      if (!prevDoc.days || Object.keys(prevDoc.days).length === 0) {
        setShowCopyPrevModal(false);
        setStatusNotice({
          type: 'error',
          message: `ไม่พบข้อมูลตารางกะของ ${prevCycleInfo.cycleLabel}`,
        });
        return;
      }

      const prevCols = getDaysInCycle(prevCycleInfo);
      // Group previous cycle days by day-of-week sequence
      const prevDaysByWeekday = new Map<number, string[]>();
      prevCols.forEach((col) => {
        if (!prevDaysByWeekday.has(col.dayOfWeek)) {
          prevDaysByWeekday.set(col.dayOfWeek, []);
        }
        prevDaysByWeekday.get(col.dayOfWeek)!.push(col.dateStr);
      });

      const weekdayOccurrenceIndex = new Map<number, number>();

      setScheduleDays((prev) => {
        const next = { ...prev };

        visibleEmployees.forEach((emp) => {
          const prevEmpDays = prevDoc.days[emp.uid] || {};
          const curEmpSchedule = { ...(next[emp.uid] || {}) };

          weekdayOccurrenceIndex.clear();

          daysCols.forEach((col) => {
            const occ = weekdayOccurrenceIndex.get(col.dayOfWeek) || 0;
            weekdayOccurrenceIndex.set(col.dayOfWeek, occ + 1);

            const prevMatchingDates = prevDaysByWeekday.get(col.dayOfWeek) || [];
            const matchingPrevDate = prevMatchingDates[occ] || prevMatchingDates[prevMatchingDates.length - 1];
            const prevVal = matchingPrevDate ? prevEmpDays[matchingPrevDate] : '';

            // คัดลอกเฉพาะกะและวันหยุด (off) ไม่คัดลอก leave และ holiday
            if (!prevVal || prevVal === 'leave' || prevVal === 'holiday') {
              return;
            }

            // ไม่ทับช่องที่กรอกไว้แล้ว ยกเว้นติ๊ก "ทับทั้งหมด"
            const hasExisting = !!curEmpSchedule[col.dateStr];
            if (hasExisting && !copyOverwriteExisting) {
              return;
            }

            curEmpSchedule[col.dateStr] = prevVal;
          });

          next[emp.uid] = curEmpSchedule;
        });

        return next;
      });

      setIsDirty(true);
      setShowCopyPrevModal(false);
      setStatusNotice({
        type: 'success',
        message: `คัดลอกตารางกะและวันหยุดจาก ${prevCycleInfo.cycleLabel} (ตามวันในสัปดาห์) เรียบร้อยแล้ว (อย่าลืมกดบันทึก)`,
      });
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (err) {
      console.error('Error copying from previous cycle:', err);
      setShowCopyPrevModal(false);
      setStatusNotice({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรอบก่อนหน้า',
      });
    }
  };

  // Helper: Set Holiday for everyone
  const handleApplyHoliday = () => {
    if (!selectedHolidayDate) return;
    setScheduleDays((prev) => {
      const next = { ...prev };
      visibleEmployees.forEach((emp) => {
        const cur = { ...(next[emp.uid] || {}) };
        cur[selectedHolidayDate] = 'holiday';
        next[emp.uid] = cur;
      });
      return next;
    });
    setIsDirty(true);
    setShowHolidayModal(false);
    setSelectedHolidayDate('');
    setStatusNotice({
      type: 'success',
      message: `กำหนดวันนักขัตฤกษ์สำหรับวันที่ ${selectedHolidayDate} ให้ทุกคนเรียบร้อยแล้ว`,
    });
    setTimeout(() => setStatusNotice(null), 4000);
  };

  // Export to Excel CSV
  const handleExportExcel = () => {
    exportScheduleToCsv(
      selectedCycleInfo,
      daysCols,
      visibleEmployees,
      scheduleDays,
      templates
    );
  };

  // Cycle change with unsaved confirmation
  const handleCycleSelectChange = (newKey: string) => {
    if (newKey === selectedCycleKey) return;
    if (isDirty) {
      setPendingCycleKey(newKey);
    } else {
      setSelectedCycleKey(newKey);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 shadow-xs border border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <CalendarCheck className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  ตารางกะงานพนักงาน (แอดมินจัดตาราง)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  จัดกะงาน วันหยุดประจำ วันลา และวันนักขัตฤกษ์ตามรอบบิล (26 ถึง 25) พร้อมส่งออก Excel
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Cycle Selector */}
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl shadow-2xs">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div>
                <div className="text-[9px] font-semibold text-slate-400 leading-none">รอบตัดยอด (26 - 25)</div>
                <select
                  value={selectedCycleKey}
                  onChange={(e) => handleCycleSelectChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden cursor-pointer"
                >
                  {availableCycles.map((c) => (
                    <option key={c.cycleKey} value={c.cycleKey} className="dark:bg-slate-800">
                      {c.cycleLabel} ({c.periodLabel})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Template Management Button */}
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              disabled={loadError || loading}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="เพิ่ม แก้ไข หรือลบกะงาน"
            >
              <Clock className="w-4 h-4 text-indigo-500" />
              <span>จัดการกะ ({templates.length})</span>
            </button>

            {/* Employee Prefs Button */}
            <button
              type="button"
              onClick={() => setShowPrefModal(true)}
              disabled={loadError || loading}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="ตั้งค่าวันหยุดประจำและกะประจำต่อพนักงาน"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>ตั้งค่าพนักงาน</span>
            </button>

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={loadError || loading}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              title="ดาวน์โหลดตารางกะเป็นไฟล์ Excel CSV (UTF-8 BOM)"
            >
              <Download className="w-4 h-4" />
              <span>ส่งออก Excel</span>
            </button>

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isDirty || loadError || loading}
              className={clsx(
                "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95 whitespace-nowrap",
                isDirty && !loadError && !loading
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25 animate-pulse"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none"
              )}
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'กำลังบันทึก...' : isDirty ? 'บันทึกตารางกะ *' : 'บันทึกแล้ว'}</span>
            </button>
          </div>
        </div>

        {/* Quick Helper Tools Toolbar */}
        <div className="pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              เครื่องมือช่วยกรอก:
            </span>

            <button
              type="button"
              onClick={() => setShowFillAutoModal(true)}
              disabled={loadError || loading}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800 transition cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              เติมทั้งรอบจากวันหยุดประจำ
            </button>

            <button
              type="button"
              onClick={() => setShowCopyPrevModal(true)}
              disabled={loadError || loading}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              คัดลอกจากรอบก่อน
            </button>

            <button
              type="button"
              onClick={() => setShowHolidayModal(true)}
              disabled={loadError || loading}
              className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold border border-rose-200 dark:border-rose-800 transition cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Flag className="w-3.5 h-3.5 text-rose-500" />
              ตั้งวันนักขัตฤกษ์
            </button>
          </div>

          {/* Quick Legend */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {templates.map((t) => (
              <span
                key={t.id}
                className="px-2 py-0.5 rounded-md font-bold text-white shadow-2xs"
                style={{ backgroundColor: t.color }}
                title={`${t.name} (${t.startTime} - ${t.endTime} น.)`}
              >
                {t.shortCode || t.name}: {t.startTime}-{t.endTime}
              </span>
            ))}
            <span className="px-2 py-0.5 rounded-md font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              OFF: หยุด
            </span>
            <span className="px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              ลา: ลางาน
            </span>
            <span className="px-2 py-0.5 rounded-md font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              นักขัต: นักขัตฤกษ์
            </span>
          </div>
        </div>

        {/* Load Error Banner */}
        {loadError && (
          <div className="mt-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>โหลดตารางไม่สำเร็จ กรุณากดโหลดใหม่</span>
            </div>
            <button
              type="button"
              onClick={() => setReloadTrigger((c) => c + 1)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>โหลดใหม่</span>
            </button>
          </div>
        )}

        {/* Status Notice Banner */}
        {statusNotice && (
          <div
            className={clsx(
              "mt-3 p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200",
              statusNotice.type === 'success'
                ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                : "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200"
            )}
          >
            <div className="flex items-center gap-2 font-medium">
              {statusNotice.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{statusNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Unsaved changes warning indicator */}
        {isDirty && !loadError && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              มีการแก้ไขตารางกะที่ยังไม่ได้บันทึก อย่าลืมกดปุ่ม <strong>"บันทึกตารางกะ"</strong> มุมขวาบนนะคะ
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || loadError || loading}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              บันทึกเลย
            </button>
          </div>
        )}
      </div>

      {/* Main Schedule Matrix Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors">
        {loading ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
            กำลังโหลดข้อมูลตารางกะงานรอบ {selectedCycleInfo.cycleLabel}...
          </div>
        ) : loadError ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
              โหลดตารางไม่สำเร็จ กรุณากดโหลดใหม่
            </p>
            <button
              type="button"
              onClick={() => setReloadTrigger((c) => c + 1)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>โหลดใหม่</span>
            </button>
          </div>
        ) : visibleEmployees.length === 0 ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            ไม่พบรายชื่อพนักงานที่แสดงในตาราง (ตรวจสอบที่ปุ่ม "ตั้งค่าพนักงาน")
          </div>
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full border-collapse text-xs select-none">
              <thead>
                <tr className="bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                  {/* Sticky Employee Column */}
                  <th className="sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-left font-bold text-slate-700 dark:text-slate-200 min-w-[140px] shadow-[2px_0_5px_rgba(0,0,0,0.04)]">
                    พนักงาน ({visibleEmployees.length})
                  </th>

                  {/* Date Columns */}
                  {daysCols.map((col) => (
                    <th
                      key={col.dateStr}
                      className={clsx(
                        "px-1.5 py-2 text-center font-bold min-w-[44px] border-l border-slate-200/60 dark:border-slate-800/60",
                        col.isWeekend
                          ? "bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-extrabold"
                          : "text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <div className="text-[10px] opacity-75">{col.thaiDayShort}</div>
                      <div className="text-sm font-black leading-tight">{col.dayNumber}</div>
                    </th>
                  ))}

                  {/* Summary Columns */}
                  <th className="px-2 py-2 text-center font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 border-l border-indigo-200 dark:border-indigo-900/60 min-w-[50px]">
                    ทำงาน
                  </th>
                  <th className="px-2 py-2 text-center font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 min-w-[44px]">
                    หยุด
                  </th>
                  <th className="px-2 py-2 text-center font-bold text-amber-700 dark:text-amber-400 bg-amber-50/70 dark:bg-amber-950/40 min-w-[44px]">
                    ลา
                  </th>
                  <th className="px-2 py-2 text-center font-bold text-rose-700 dark:text-rose-400 bg-rose-50/70 dark:bg-rose-950/40 min-w-[44px]">
                    นักขัต
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {visibleEmployees.map((emp) => {
                  const empSchedule = scheduleDays[emp.uid] || {};

                  // Compute summary stats
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
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Sticky Employee Header */}
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 text-left font-bold text-slate-900 dark:text-white shadow-[2px_0_5px_rgba(0,0,0,0.04)] border-r border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <AnimalAvatar
                            avatarEmoji={emp.avatarEmoji}
                            identifier={emp.username || emp.uid}
                            name={emp.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">{emp.name}</div>
                            {emp.username && (
                              <div className="text-[10px] text-slate-400 truncate">@{emp.username}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Day Cells */}
                      {daysCols.map((col) => {
                        const cellVal = empSchedule[col.dateStr] || '';
                        const isPickingThis =
                          activeCellPicker?.empId === emp.uid && activeCellPicker?.dateStr === col.dateStr;

                        const shiftTemplate = templateMap.get(cellVal);
                        const specialConfig = SPECIAL_DAYS_CONFIG[cellVal];

                        return (
                          <td
                            key={col.dateStr}
                            onClick={() => {
                              setActiveCellPicker(
                                isPickingThis ? null : { empId: emp.uid, dateStr: col.dateStr }
                              );
                            }}
                            className={clsx(
                              "p-1 text-center border-l border-slate-100 dark:border-slate-800/60 cursor-pointer transition relative group",
                              col.isWeekend && "bg-amber-50/30 dark:bg-amber-950/10",
                              isPickingThis && "ring-2 ring-indigo-500 z-30"
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
                                  title={`${shiftTemplate.name}: ${shiftTemplate.startTime} - ${shiftTemplate.endTime} (${col.dateStr})`}
                                >
                                  {shiftTemplate.shortCode || shiftTemplate.name}
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                  {cellVal}
                                </span>
                              )
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700 group-hover:text-slate-400 font-mono text-xs">
                                -
                              </span>
                            )}

                            {/* Dropdown Selector Popover on Active Cell */}
                            {isPickingThis && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-40 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 w-48 text-left space-y-1 animate-in fade-in zoom-in-95 duration-100"
                              >
                                <div className="text-[10px] font-bold text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-800">
                                  {emp.name} • {col.dayNumber} {col.thaiDayShort}
                                </div>

                                {/* Shift Templates */}
                                <div className="space-y-0.5">
                                  {templates.map((t) => (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => handleSetCell(emp.uid, col.dateStr, t.id)}
                                      className="w-full px-2 py-1.5 rounded-lg text-left text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-between cursor-pointer"
                                    >
                                      <span className="flex items-center gap-1.5 truncate">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full shrink-0"
                                          style={{ backgroundColor: t.color }}
                                        />
                                        <span className="truncate">{t.name}</span>
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                        {t.startTime}
                                      </span>
                                    </button>
                                  ))}
                                </div>

                                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                                {/* Special Days */}
                                <button
                                  type="button"
                                  onClick={() => handleSetCell(emp.uid, col.dateStr, 'off')}
                                  className="w-full px-2 py-1.5 rounded-lg text-left text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5 cursor-pointer"
                                >
                                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                                  <span>วันหยุด (OFF)</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSetCell(emp.uid, col.dateStr, 'leave')}
                                  className="w-full px-2 py-1.5 rounded-lg text-left text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/60 text-amber-700 dark:text-amber-300 transition flex items-center gap-1.5 cursor-pointer"
                                >
                                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                                  <span>ลางาน (Leave)</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSetCell(emp.uid, col.dateStr, 'holiday')}
                                  className="w-full px-2 py-1.5 rounded-lg text-left text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-300 transition flex items-center gap-1.5 cursor-pointer"
                                >
                                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                                  <span>วันนักขัตฤกษ์ (Holiday)</span>
                                </button>

                                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                                <button
                                  type="button"
                                  onClick={() => handleSetCell(emp.uid, col.dateStr, '')}
                                  className="w-full px-2 py-1 rounded-lg text-left text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center gap-1 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                  <span>ล้างค่า (ว่าง)</span>
                                </button>
                              </div>
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
          </div>
        )}
      </div>

      {/* MODAL 1: Shift Templates Management */}
      {showTemplateModal && (
        <ShiftTemplateModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          templates={templates}
          disabledSave={loadError || loading}
          onSave={async (newTemplates) => {
            if (loadError || loading) return;
            setTemplates(newTemplates);
            await saveShiftTemplates(newTemplates);
            setShowTemplateModal(false);
            setStatusNotice({
              type: 'success',
              message: 'บันทึกรูปแบบกะงานเรียบร้อยแล้ว',
            });
            setTimeout(() => setStatusNotice(null), 4000);
          }}
        />
      )}

      {/* MODAL 2: Employee Shift Preferences */}
      {showPrefModal && (
        <EmployeePrefModal
          isOpen={showPrefModal}
          onClose={() => setShowPrefModal(false)}
          employees={registeredUsers || []}
          templates={templates}
          prefs={prefs}
          disabledSave={loadError || loading}
          onSave={async (newPrefs) => {
            if (loadError || loading) return;
            setPrefs(newPrefs);
            await saveShiftPrefs(newPrefs);
            setShowPrefModal(false);
            setStatusNotice({
              type: 'success',
              message: 'บันทึกวันหยุดประจำและกะประจำต่อพนักงานเรียบร้อยแล้ว',
            });
            setTimeout(() => setStatusNotice(null), 4000);
          }}
        />
      )}

      {/* MODAL 3: Auto-Fill Confirmation */}
      {showFillAutoModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                เติมทั้งรอบจากวันหยุดประจำ
              </h4>
              <button
                type="button"
                onClick={() => setShowFillAutoModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              ระบบจะเติม <strong>"OFF" (วันหยุด)</strong> ในวันหยุดประจำสัปดาห์ของพนักงานแต่ละคน 
              และเติม <strong>กะประจำ</strong> ในวันอื่นๆ ตลอดทั้งรอบ {selectedCycleInfo.cycleLabel}
            </p>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={fillOverwriteExisting}
                onChange={(e) => setFillOverwriteExisting(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <span>ทับช่องที่กรอกไว้แล้วทั้งหมด</span>
            </label>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFillAutoModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleExecuteFillAuto}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md active:scale-98"
              >
                ยืนยันการเติม
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3.5: Copy From Previous Cycle Confirmation */}
      {showCopyPrevModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Copy className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                คัดลอกจากรอบก่อน
              </h4>
              <button
                type="button"
                onClick={() => setShowCopyPrevModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              ระบบจะคัดลอกเฉพาะ <strong>กะงาน</strong> และ <strong>วันหยุด (OFF)</strong> จากรอบก่อนหน้ามาใส่ในรอบ {selectedCycleInfo.cycleLabel} 
              (ไม่คัดลอกวันลาและวันนักขัตฤกษ์)
            </p>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={copyOverwriteExisting}
                onChange={(e) => setCopyOverwriteExisting(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <span>ทับทั้งหมด (ทับช่องที่กรอกไว้แล้ว)</span>
            </label>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCopyPrevModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleCopyFromPreviousCycle}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md active:scale-98 disabled:opacity-50"
              >
                {loading ? 'กำลังคัดลอก...' : 'ยืนยันการคัดลอก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Holiday Setter */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-rose-500" />
                ตั้งวันนักขัตฤกษ์สำหรับทุกคน
              </h4>
              <button
                type="button"
                onClick={() => setShowHolidayModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              เลือกวันที่ในรอบ {selectedCycleInfo.cycleLabel} เพื่อตั้งค่าเป็น <strong>"วันนักขัตฤกษ์ (Holiday)"</strong> ให้พนักงานทุกคนในตาราง
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                เลือกวันที่ในรอบนี้:
              </label>
              <select
                value={selectedHolidayDate}
                onChange={(e) => setSelectedHolidayDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200"
              >
                <option value="">-- เลือกวันที่ --</option>
                {daysCols.map((c) => (
                  <option key={c.dateStr} value={c.dateStr}>
                    {c.dateStr} ({c.thaiDayShort})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowHolidayModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={!selectedHolidayDate}
                onClick={handleApplyHoliday}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md active:scale-98 disabled:opacity-50"
              >
                ตั้งวันนักขัตฤกษ์
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: Unsaved warning before cycle switch */}
      {pendingCycleKey && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-amber-300 dark:border-amber-800 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold">ตารางกะยังไม่ได้บันทึก</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              คุณมีการแก้ไขตารางกะของรอบนี้ที่ยังไม่ได้กดบันทึก หากเปลี่ยนรอบตอนนี้ ข้อมูลที่แก้จะหายไป ต้องการบันทึกก่อนหรือไม่?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedCycleKey(pendingCycleKey);
                  setPendingCycleKey(null);
                  setIsDirty(false);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                ละทิ้งการแก้ไข
              </button>
              <button
                type="button"
                disabled={loadError || loading || isSaving}
                onClick={async () => {
                  if (loadError || loading) return;
                  await handleSave();
                  setSelectedCycleKey(pendingCycleKey);
                  setPendingCycleKey(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                บันทึกแล้วเปลี่ยนรอบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===============================================================
// Sub-Modal: Shift Template Editor
// ===============================================================

function ShiftTemplateModal({
  isOpen,
  onClose,
  templates,
  disabledSave,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  templates: ShiftTemplate[];
  disabledSave?: boolean;
  onSave: (templates: ShiftTemplate[]) => Promise<void>;
}) {
  const [list, setList] = useState<ShiftTemplate[]>(templates);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [color, setColor] = useState('#10b981');
  const [shortCode, setShortCode] = useState('');

  const PRESET_COLORS = [
    '#10b981', // emerald
    '#6366f1', // indigo
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#0ea5e9', // sky
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
    '#64748b', // slate
  ];

  const handleStartAdd = () => {
    setEditingId('new');
    setName('');
    setStartTime('08:00');
    setEndTime('17:00');
    setColor('#10b981');
    setShortCode('');
  };

  const handleStartEdit = (t: ShiftTemplate) => {
    setEditingId(t.id);
    setName(t.name);
    setStartTime(t.startTime);
    setEndTime(t.endTime);
    setColor(t.color);
    setShortCode(t.shortCode || '');
  };

  const handleSaveItem = () => {
    if (!name.trim()) return;
    const finalCode = shortCode.trim() || name.trim().slice(0, 3);

    if (editingId === 'new') {
      const newItem: ShiftTemplate = {
        id: `shift_${Date.now()}`,
        name: name.trim(),
        startTime,
        endTime,
        color,
        shortCode: finalCode,
      };
      setList([...list, newItem]);
    } else {
      setList(
        list.map((item) =>
          item.id === editingId
            ? { ...item, name: name.trim(), startTime, endTime, color, shortCode: finalCode }
            : item
        )
      );
    }
    setEditingId(null);
  };

  const handleDeleteItem = (id: string) => {
    setList(list.filter((item) => item.id !== id));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-4 h-4" />
            </span>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              จัดการรายการกะงาน (Shift Templates)
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List of current shifts */}
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {list.map((t) => (
            <div
              key={t.id}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: t.color }}
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                    <span>{t.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-slate-600 dark:text-slate-300">
                      [{t.shortCode || t.name}]
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {t.startTime} - {t.endTime} น.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStartEdit(t)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="แก้ไขกะนี้"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteItem(t.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title="ลบกะนี้"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Form to Add / Edit */}
        {editingId ? (
          <div className="p-3.5 rounded-xl border-2 border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-3">
            <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
              {editingId === 'new' ? '+ เพิ่มกะงานใหม่' : 'แก้ไขกะงาน'}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ชื่อกะ (เช่น กะเช้า):
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น กะเช้า, กะดึก"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ตัวย่อในช่อง (เช่น เช้า):
                </label>
                <input
                  type="text"
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value)}
                  placeholder="เช่น เช้า, บ่าย"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  เวลาเริ่ม (HH:mm):
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  เวลาเลิก (HH:mm):
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                />
              </div>
            </div>

            {/* Color selection */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                เลือกสีประจำกะ:
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={clsx(
                      "w-6 h-6 rounded-full transition cursor-pointer border-2",
                      color === c ? "border-indigo-600 scale-110 shadow-sm" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-3 py-1 text-xs rounded-lg text-slate-600 hover:bg-slate-200"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveItem}
                disabled={!name.trim()}
                className="px-3 py-1 text-xs font-bold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                ตกลง
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStartAdd}
            className="w-full py-2 border-2 border-dashed border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มกะงานใหม่</span>
          </button>
        )}

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={disabledSave}
            onClick={() => onSave(list)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md active:scale-98 disabled:opacity-50"
          >
            บันทึกการจัดการกะ
          </button>
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// Sub-Modal: Employee Preferences (Off-days, Default shift, Hide)
// ===============================================================

function EmployeePrefModal({
  isOpen,
  onClose,
  employees,
  templates,
  prefs,
  disabledSave,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  employees: Array<{ uid: string; name: string; username?: string; avatarEmoji?: string }>;
  templates: ShiftTemplate[];
  prefs: Record<string, EmployeeShiftPref>;
  disabledSave?: boolean;
  onSave: (prefs: Record<string, EmployeeShiftPref>) => Promise<void>;
}) {
  const [localPrefs, setLocalPrefs] = useState<Record<string, EmployeeShiftPref>>({ ...prefs });

  const handleToggleOffDay = (empId: string, dayIndex: number) => {
    setLocalPrefs((prev) => {
      const cur = prev[empId] || { employeeId: empId, regularOffDays: [] };
      const offDays = cur.regularOffDays || [];
      const updated = offDays.includes(dayIndex)
        ? offDays.filter((d) => d !== dayIndex)
        : [...offDays, dayIndex].sort((a, b) => a - b);

      return {
        ...prev,
        [empId]: {
          ...cur,
          regularOffDays: updated,
        },
      };
    });
  };

  const handleSetDefaultShift = (empId: string, shiftId: string) => {
    setLocalPrefs((prev) => {
      const cur = prev[empId] || { employeeId: empId, regularOffDays: [] };
      return {
        ...prev,
        [empId]: {
          ...cur,
          defaultShiftId: shiftId || undefined,
        },
      };
    });
  };

  const handleToggleHide = (empId: string) => {
    setLocalPrefs((prev) => {
      const cur = prev[empId] || { employeeId: empId, regularOffDays: [] };
      return {
        ...prev,
        [empId]: {
          ...cur,
          hiddenFromSchedule: !cur.hiddenFromSchedule,
        },
      };
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <Settings className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                ตั้งค่ากะงานและวันหยุดประจำต่อพนักงาน
              </h4>
              <p className="text-[11px] text-slate-400">
                กำหนดวันหยุดประจำสัปดาห์ (เลือกได้หลายวัน) และกะประจำ เพื่อใช้เติมตารางอัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Employee List Table */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-3">
          {employees.map((emp) => {
            const p = localPrefs[emp.uid] || { employeeId: emp.uid, regularOffDays: [] };
            const isHidden = !!p.hiddenFromSchedule;

            return (
              <div
                key={emp.uid}
                className={clsx(
                  "p-3 rounded-xl border transition-all space-y-2",
                  isHidden
                    ? "bg-slate-100/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800 opacity-60"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <AnimalAvatar
                      avatarEmoji={emp.avatarEmoji}
                      identifier={emp.username || emp.uid}
                      name={emp.name}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate block">
                        {emp.name}
                      </span>
                      {emp.username && (
                        <span className="text-[10px] text-slate-400 truncate block">
                          @{emp.username}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Toggle Hide */}
                  <button
                    type="button"
                    onClick={() => handleToggleHide(emp.uid)}
                    className={clsx(
                      "px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer",
                      isHidden
                        ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    )}
                    title={isHidden ? "คลิกเพื่อแสดงในตาราง" : "คลิกเพื่อซ่อนจากตาราง"}
                  >
                    {isHidden ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>ซ่อนอยู่</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>แสดงในตาราง</span>
                      </>
                    )}
                  </button>
                </div>

                {!isHidden && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {/* Weekly Off Days Checkboxes */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                        วันหยุดประจำสัปดาห์ (OFF):
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {THAI_WEEKDAY_NAMES.map((wName, idx) => {
                          const isOff = (p.regularOffDays || []).includes(idx);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleToggleOffDay(emp.uid, idx)}
                              className={clsx(
                                "w-7 h-7 rounded-lg text-[10px] font-bold transition flex items-center justify-center cursor-pointer",
                                isOff
                                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-2xs"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700"
                              )}
                              title={THAI_WEEKDAY_FULL[idx]}
                            >
                              {wName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Default Shift Selector */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                        กะประจำ:
                      </span>
                      <select
                        value={p.defaultShiftId || ''}
                        onChange={(e) => handleSetDefaultShift(emp.uid, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
                      >
                        <option value="">-- ไม่ระบุกะประจำ --</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.startTime} - {t.endTime})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={disabledSave}
            onClick={() => onSave(localPrefs)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md active:scale-98 disabled:opacity-50"
          >
            บันทึกการตั้งค่าพนักงาน
          </button>
        </div>
      </div>
    </div>
  );
}
