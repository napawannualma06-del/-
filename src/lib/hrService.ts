import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { HRProfile, HRProfilesDoc } from '../types';

export const DEFAULT_PROBATION_DAYS = 119;

export function getDefaultHRProfile(fallbackName = ''): HRProfile {
  return {
    fullName: fallbackName,
    nickname: '',
    position: '',
    startDate: '',
    probationDays: DEFAULT_PROBATION_DAYS,
    probationEndDate: '',
    probationStatus: 'probation',
    notEmployee: false,
  };
}

/**
 * โหลดข้อมูลพื้นฐานพนักงานจาก system_settings/hr_profiles ครั้งเดียวด้วย getDoc
 * ถ้ายังไม่มีเอกสาร (ครั้งแรก) จะคืนค่า { profiles: {} }
 * ถ้าเกิด error ในการดึงข้อมูล จะ throw ออกไปเพื่อให้หน้าจอแสดงข้อความแจ้งเตือนและปิดปุ่มบันทึก
 */
export async function fetchHRProfiles(): Promise<HRProfilesDoc> {
  try {
    const snap = await getDoc(doc(db, 'system_settings', 'hr_profiles'));
    if (snap.exists()) {
      const data = snap.data() as HRProfilesDoc;
      return {
        profiles: data.profiles && typeof data.profiles === 'object' ? data.profiles : {},
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
    return { profiles: {} };
  } catch (err) {
    console.error('Error fetching HR profiles:', err);
    throw err;
  }
}

/**
 * บันทึกข้อมูลพื้นฐานพนักงานลง system_settings/hr_profiles
 */
export async function saveHRProfiles(
  profiles: Record<string, HRProfile>,
  updatedBy: string
): Promise<void> {
  await setDoc(doc(db, 'system_settings', 'hr_profiles'), {
    profiles,
    updatedAt: Date.now(),
    updatedBy,
  });
}

/**
 * คำนวณวันผ่านโปรอัตโนมัติ = วันเริ่มงาน (YYYY-MM-DD) + probationDays
 */
export function calculateProbationEndDate(
  startDateStr: string,
  probationDays: number = DEFAULT_PROBATION_DAYS
): string {
  if (!startDateStr) return '';
  const parts = startDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '';

  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(d.getTime())) return '';

  const daysToAdd = Number.isFinite(probationDays) ? probationDays : DEFAULT_PROBATION_DAYS;
  d.setDate(d.getDate() + daysToAdd);

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * คำนวณอายุงาน (ปี เดือน วัน) จากวันเริ่มงานถึงปัจจุบัน
 */
export function calculateTenureText(startDateStr: string, nowDate = new Date()): string {
  if (!startDateStr) return '-';
  const parts = startDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '-';

  const start = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

  if (isNaN(start.getTime())) return '-';
  if (start > today) {
    return '0 ปี 0 เดือน 0 วัน';
  }

  let years = today.getFullYear() - start.getFullYear();
  let months = today.getMonth() - start.getMonth();
  let days = today.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    // จำนวนวันของเดือนก่อนหน้าของ today
    const prevMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return `${years} ปี ${months} เดือน ${days} วัน`;
}

export interface ProbationBadgeInfo {
  key: 'passed' | 'completed_pending' | 'near' | 'probation';
  label: string;
  badgeClass: string;
  daysLeft?: number;
}

/**
 * ประเมินป้ายสถานะการทดลองงาน:
 * - "ผ่านโปรแล้ว" เมื่อ probationStatus === 'passed'
 * - "ครบโปรแล้ว รอยืนยัน" เมื่อเลยวันผ่านโปรแต่ยังไม่กดยืนยันผ่านโปร
 * - "ใกล้ครบโปร (เหลือ X วัน)" เมื่อเหลือไม่เกิน 15 วัน (0..15 วัน)
 * - "ทดลองงาน" เมื่ออยู่ในช่วงทดลองงานปกติ
 */
export function getProbationBadgeInfo(
  profile?: Partial<HRProfile>,
  nowDate = new Date()
): ProbationBadgeInfo {
  if (profile?.probationStatus === 'passed') {
    return {
      key: 'passed',
      label: 'ผ่านโปรแล้ว',
      badgeClass:
        'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
    };
  }

  const endDateStr = profile?.probationEndDate;
  if (endDateStr) {
    const parts = endDateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const endObj = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
      const todayObj = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        nowDate.getDate(),
        0,
        0,
        0,
        0
      );
      const diffMs = endObj.getTime() - todayObj.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        return {
          key: 'completed_pending',
          label: 'ครบโปรแล้ว รอยืนยัน',
          badgeClass:
            'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
          daysLeft: diffDays,
        };
      }

      if (diffDays <= 15) {
        return {
          key: 'near',
          label: `ใกล้ครบโปร (เหลือ ${diffDays} วัน)`,
          badgeClass:
            'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
          daysLeft: diffDays,
        };
      }
    }
  }

  return {
    key: 'probation',
    label: 'ทดลองงาน',
    badgeClass:
      'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800',
  };
}

/**
 * ส่งออกข้อมูลพื้นฐานพนักงานเป็นไฟล์ Excel CSV (UTF-8 BOM)
 */
export function exportHRProfilesToCsv(
  employees: Array<{ uid: string; name: string; username?: string }>,
  profiles: Record<string, HRProfile>
): void {
  const headers = [
    'ชื่อในระบบ',
    'Username',
    'ชื่อ-นามสกุลจริง',
    'ชื่อเล่น',
    'ตำแหน่ง',
    'วันเริ่มงาน',
    'อายุงาน',
    'จำนวนวันทดลองงาน',
    'วันผ่านโปร',
    'สถานะโปร',
  ];

  const escapeCsv = (val: string | number | undefined | null) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  const rows = employees.map((emp) => {
    const p = profiles[emp.uid] || getDefaultHRProfile(emp.name);
    const tenure = calculateTenureText(p.startDate);
    const badge = getProbationBadgeInfo(p);

    return [
      escapeCsv(emp.name),
      escapeCsv(emp.username ? `@${emp.username}` : '-'),
      escapeCsv(p.fullName || '-'),
      escapeCsv(p.nickname || '-'),
      escapeCsv(p.position || '-'),
      escapeCsv(p.startDate || '-'),
      escapeCsv(tenure),
      escapeCsv(p.probationDays ?? DEFAULT_PROBATION_DAYS),
      escapeCsv(p.probationEndDate || '-'),
      escapeCsv(badge.label),
    ];
  });

  const BOM = '\uFEFF';
  const csvContent = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateTag = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `HR_Employees_${dateTag}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
