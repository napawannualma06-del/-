import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  inMemoryPersistence,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseAuthUser,
} from 'firebase/auth';
import { auth, db } from './firebase';
import { HRPrivateData, HRProfile, HRProfilesDoc } from '../types';

export const DEFAULT_PROBATION_DAYS = 119;
export const DEFAULT_SSO_RATE_PERCENT = 5;
export const DEFAULT_SSO_CAP_AMOUNT = 875;
export const HR_PRIVATE_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 นาที

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

// ===============================================================
// HR Confidential Private Data Operations (hr_private/{employeeId})
// ===============================================================

export function getDefaultHRPrivateData(fallbackAccountName = ''): HRPrivateData {
  return {
    bankName: '',
    accountNumber: '',
    accountName: fallbackAccountName,
    salary: 0,
    ssoNumber: '',
    ssoStatus: 'enrolled',
    ssoRatePercent: DEFAULT_SSO_RATE_PERCENT,
    ssoCapAmount: DEFAULT_SSO_CAP_AMOUNT,
  };
}

/**
 * โหลดข้อมูลลับ HR รายบุคคลจาก hr_private/{employeeId} ด้วย getDoc ครั้งเดียว
 * ห้ามดึงทั้ง collection
 * ถ้ายังไม่มีเอกสาร จะคืนค่าเริ่มต้น
 * ถ้าไม่มีสิทธิ์หรือโหลดไม่สำเร็จ จะ throw error ออกไปเพื่อให้แสดงข้อความและปิดปุ่มบันทึก
 */
export async function fetchHRPrivateEmployee(
  employeeId: string,
  fallbackAccountName = ''
): Promise<HRPrivateData> {
  try {
    const snap = await getDoc(doc(db, 'hr_private', employeeId));
    if (snap.exists()) {
      const data = snap.data() as Partial<HRPrivateData>;
      return {
        bankName: data.bankName ?? '',
        accountNumber: data.accountNumber ?? '',
        accountName: data.accountName ?? fallbackAccountName,
        salary: typeof data.salary === 'number' ? data.salary : Number(data.salary) || 0,
        ssoNumber: data.ssoNumber ?? '',
        ssoStatus: data.ssoStatus === 'not_enrolled' ? 'not_enrolled' : 'enrolled',
        ssoRatePercent:
          typeof data.ssoRatePercent === 'number'
            ? data.ssoRatePercent
            : DEFAULT_SSO_RATE_PERCENT,
        ssoCapAmount:
          typeof data.ssoCapAmount === 'number'
            ? data.ssoCapAmount
            : DEFAULT_SSO_CAP_AMOUNT,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
    return getDefaultHRPrivateData(fallbackAccountName);
  } catch (err) {
    console.error(`Error fetching hr_private/${employeeId}:`, err);
    throw err;
  }
}

/**
 * บันทึกข้อมูลลับ HR รายบุคคลลงใน hr_private/{employeeId} เท่านั้น
 * ห้ามบันทึกไว้ใน system_settings หรือ collection อื่นเด็ดขาด
 */
export async function saveHRPrivateEmployee(
  employeeId: string,
  data: HRPrivateData,
  updatedBy: string
): Promise<void> {
  const payload: HRPrivateData = {
    bankName: (data.bankName || '').trim(),
    accountNumber: (data.accountNumber || '').trim(),
    accountName: (data.accountName || '').trim(),
    salary: Number(data.salary) || 0,
    ssoNumber: (data.ssoNumber || '').trim(),
    ssoStatus: data.ssoStatus === 'not_enrolled' ? 'not_enrolled' : 'enrolled',
    ssoRatePercent:
      Number.isFinite(Number(data.ssoRatePercent)) && Number(data.ssoRatePercent) >= 0
        ? Number(data.ssoRatePercent)
        : DEFAULT_SSO_RATE_PERCENT,
    ssoCapAmount:
      Number.isFinite(Number(data.ssoCapAmount)) && Number(data.ssoCapAmount) >= 0
        ? Number(data.ssoCapAmount)
        : DEFAULT_SSO_CAP_AMOUNT,
    updatedAt: Date.now(),
    updatedBy,
  };

  await setDoc(doc(db, 'hr_private', employeeId), payload);
}

/**
 * คำนวณยอดหักประกันสังคมต่อเดือน = min(salary × % ÷ 100, เพดาน)
 */
export function calculateMonthlySSODeduction(
  salary: number,
  ratePercent: number = DEFAULT_SSO_RATE_PERCENT,
  capAmount: number = DEFAULT_SSO_CAP_AMOUNT
): number {
  const cleanSalary = Math.max(0, Number(salary) || 0);
  const cleanRate = Math.max(0, Number(ratePercent) || 0);
  const cleanCap = Math.max(0, Number(capAmount) || 0);

  const raw = (cleanSalary * cleanRate) / 100;
  const result = Math.min(raw, cleanCap);
  return Math.round(result * 100) / 100;
}

/**
 * ซ่อนตัวเลขบางส่วนของเลขบัญชีหรือเลขประกันสังคม เช่น xxx-x-x1234-x
 */
export function maskSensitiveNumber(rawValue: string): string {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) return '-';

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 10) {
    // รูปแบบเลขบัญชีธนาคาร 10 หลัก: xxx-x-x1234-x
    const visible4 = digitsOnly.slice(5, 9);
    return `xxx-x-x${visible4}-x`;
  }

  if (digitsOnly.length === 13) {
    // รูปแบบเลขประกันสังคม / เลขบัตร 13 หลัก: x-xxxx-x1234-xx-x
    const visible4 = digitsOnly.slice(6, 10);
    return `x-xxxx-x${visible4}-xx-x`;
  }

  if (trimmed.length <= 4) {
    return 'xxxx';
  }

  // กรณีความยาวอื่นๆ แสดงเฉพาะ 4 ตัวท้ายหรือก่อนตัวสุดท้าย
  const last4 = trimmed.slice(-4);
  return `${'x'.repeat(Math.max(3, trimmed.length - 4))}${last4}`;
}

/**
 * ยืนยันตัวตนแอดมิน HR ด้วยอีเมลและรหัสผ่านผ่าน Firebase Auth (ไม่จำรหัสผ่านไว้ในเครื่อง)
 */
export async function signInHrAdminEmail(
  email: string,
  password: string
): Promise<FirebaseAuthUser> {
  // ใช้ inMemoryPersistence เพื่อไม่ให้จำสถานะล็อกอินอีเมลค้างในเครื่อง
  try {
    await setPersistence(auth, inMemoryPersistence);
  } catch {
    // fallback if persistence change is restricted
  }
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

/**
 * ล็อกข้อมูลลับและออกจากระบบอีเมลทันที พร้อมคืนค่าการเชื่อมต่อปกติของแอป
 */
export async function lockHrAdminEmailSession(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Error signing out HR admin email session:', err);
  }

  // คืนค่า anonymous auth ตามปกติของระบบ (ถ้าเปิดใช้งานไว้) โดยไม่กระทบระบบล็อกอิน PIN
  try {
    await signInAnonymously(auth);
  } catch {
    // ignore if anonymous auth is disabled
  }
}

