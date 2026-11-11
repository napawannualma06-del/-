import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ShiftTemplate, EmployeeShiftPref, CycleScheduleDoc } from '../types';
import { OTCycleInfo } from './otUtils';

export const DEFAULT_SHIFT_TEMPLATES: ShiftTemplate[] = [
  {
    id: 'morning',
    name: 'กะเช้า',
    startTime: '08:00',
    endTime: '17:00',
    color: '#10b981', // emerald
    shortCode: 'เช้า',
  },
  {
    id: 'day',
    name: 'กะกลางวัน',
    startTime: '10:00',
    endTime: '19:00',
    color: '#6366f1', // indigo
    shortCode: 'กลาง',
  },
  {
    id: 'afternoon',
    name: 'กะบ่าย',
    startTime: '13:00',
    endTime: '22:00',
    color: '#f59e0b', // amber
    shortCode: 'บ่าย',
  },
  {
    id: 'night',
    name: 'กะดึก',
    startTime: '22:00',
    endTime: '07:00',
    color: '#8b5cf6', // purple
    shortCode: 'ดึก',
  },
];

export const SPECIAL_DAYS_CONFIG: Record<
  string,
  { label: string; shortCode: string; color: string; badgeClass: string; dotColor: string }
> = {
  off: {
    label: 'วันหยุด',
    shortCode: 'OFF',
    color: '#64748b',
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    dotColor: '#64748b',
  },
  leave: {
    label: 'ลางาน',
    shortCode: 'ลา',
    color: '#f59e0b',
    badgeClass: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    dotColor: '#f59e0b',
  },
  holiday: {
    label: 'วันนักขัตฤกษ์',
    shortCode: 'นักขัต',
    color: '#ef4444',
    badgeClass: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700',
    dotColor: '#ef4444',
  },
};

export const THAI_WEEKDAY_NAMES = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
export const THAI_WEEKDAY_FULL = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

export interface ScheduleDayCol {
  dateStr: string;     // 'YYYY-MM-DD'
  dayNumber: number;   // 26, 27, ..., 25
  dayOfWeek: number;   // 0 = Sun, 1 = Mon, ..., 6 = Sat
  thaiDayShort: string; // 'อา.', 'จ.'
  isWeekend: boolean;  // Saturday or Sunday
}

/**
 * Generate full list of days in an OT Cycle (from 26th of previous month to 25th of current month)
 */
export function getDaysInCycle(cycleInfo: OTCycleInfo): ScheduleDayCol[] {
  const result: ScheduleDayCol[] = [];
  const startParts = cycleInfo.startDate.split('-').map(Number);
  const endParts = cycleInfo.endDate.split('-').map(Number);

  const cur = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);

  const pad = (n: number) => n.toString().padStart(2, '0');

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const d = cur.getDate();
    const dayOfWeek = cur.getDay();
    const dateStr = `${y}-${pad(m)}-${pad(d)}`;

    result.push({
      dateStr,
      dayNumber: d,
      dayOfWeek,
      thaiDayShort: THAI_WEEKDAY_NAMES[dayOfWeek],
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });

    cur.setDate(cur.getDate() + 1);
  }

  return result;
}

// ===============================================================
// Firestore Operations (Direct getDoc / setDoc, no continuous listeners)
// ===============================================================

export async function fetchShiftTemplates(): Promise<ShiftTemplate[]> {
  try {
    const snap = await getDoc(doc(db, 'system_settings', 'shift_templates'));
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data?.templates) && data.templates.length > 0) {
        return data.templates;
      }
    }
    return DEFAULT_SHIFT_TEMPLATES;
  } catch (err) {
    console.error('Error fetching shift templates:', err);
    throw err;
  }
}

export async function saveShiftTemplates(templates: ShiftTemplate[]): Promise<void> {
  await setDoc(doc(db, 'system_settings', 'shift_templates'), {
    templates,
    updatedAt: Date.now(),
  });
}

export async function fetchShiftPrefs(): Promise<Record<string, EmployeeShiftPref>> {
  try {
    const snap = await getDoc(doc(db, 'system_settings', 'shift_prefs'));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.prefs && typeof data.prefs === 'object') {
        return data.prefs;
      }
    }
    return {};
  } catch (err) {
    console.error('Error fetching shift prefs:', err);
    throw err;
  }
}

export async function saveShiftPrefs(prefs: Record<string, EmployeeShiftPref>): Promise<void> {
  await setDoc(doc(db, 'system_settings', 'shift_prefs'), {
    prefs,
    updatedAt: Date.now(),
  });
}

export async function fetchCycleSchedule(cycleKey: string): Promise<CycleScheduleDoc> {
  try {
    const snap = await getDoc(doc(db, 'system_settings', `schedule_${cycleKey}`));
    if (snap.exists()) {
      const data = snap.data() as CycleScheduleDoc;
      return {
        days: data.days || {},
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
    return { days: {} };
  } catch (err) {
    console.error(`Error fetching schedule_${cycleKey}:`, err);
    throw err;
  }
}

export async function saveCycleSchedule(
  cycleKey: string,
  days: Record<string, Record<string, string>>,
  updatedBy: string
): Promise<void> {
  await setDoc(doc(db, 'system_settings', `schedule_${cycleKey}`), {
    days,
    updatedAt: Date.now(),
    updatedBy,
  });
}

// ===============================================================
// Export Schedule to Excel CSV (UTF-8 BOM)
// ===============================================================

export function exportScheduleToCsv(
  cycleInfo: OTCycleInfo,
  daysCols: ScheduleDayCol[],
  employees: Array<{ uid: string; name: string; username?: string }>,
  scheduleDays: Record<string, Record<string, string>>,
  templates: ShiftTemplate[]
) {
  const templateMap = new Map<string, ShiftTemplate>();
  templates.forEach((t) => templateMap.set(t.id, t));

  const headers = [
    'ลำดับ',
    'ชื่อพนักงาน',
    'Username',
    ...daysCols.map((d) => `"${d.dayNumber} (${d.thaiDayShort})"`),
    'วันทำงาน',
    'วันหยุด (OFF)',
    'วันลา',
    'นักขัตฤกษ์',
  ];

  const rows = employees.map((emp, idx) => {
    const empDays = scheduleDays[emp.uid] || {};
    let workDays = 0;
    let offDays = 0;
    let leaveDays = 0;
    let holidayDays = 0;

    const dayValues = daysCols.map((col) => {
      const val = empDays[col.dateStr] || '';
      if (!val) return '""';
      if (val === 'off') {
        offDays++;
        return '"หยุด"';
      }
      if (val === 'leave') {
        leaveDays++;
        return '"ลา"';
      }
      if (val === 'holiday') {
        holidayDays++;
        return '"นักขัต"';
      }
      const t = templateMap.get(val);
      if (t) {
        workDays++;
        return `"${t.name} (${t.startTime}-${t.endTime})"`;
      }
      workDays++;
      return `"${val}"`;
    });

    return [
      idx + 1,
      `"${(emp.name || '').replace(/"/g, '""')}"`,
      emp.username ? `@${emp.username}` : `"${emp.uid}"`,
      ...dayValues,
      workDays,
      offDays,
      leaveDays,
      holidayDays,
    ];
  });

  // Summary footer
  const summaryRow = [
    [],
    ['--- สรุปข้อมูลกะงานของรอบ ---'],
    ['รอบตัดยอด', `"${cycleInfo.cycleLabel} (${cycleInfo.periodLabel})"`],
    ['จำนวนพนักงานในตาราง', employees.length],
    [],
    ['รหัสกะงานที่ใช้งาน:'],
    ['ชื่อกะ', 'เวลาเริ่ม', 'เวลาเลิก'],
    ...templates.map((t) => [`"${t.name}"`, t.startTime, t.endTime]),
    ['วันหยุด (OFF)', '-', '-'],
    ['ลางาน (leave)', '-', '-'],
    ['วันนักขัตฤกษ์ (holiday)', '-', '-'],
  ];

  const BOM = '\uFEFF';
  const csvContent = BOM + [
    headers.join(','),
    ...rows.map((r) => r.join(',')),
    ...summaryRow.map((r) => r.join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ตารางกะงาน_${cycleInfo.cycleKey}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
