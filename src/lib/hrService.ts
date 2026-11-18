import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User as FirebaseAuthUser,
} from 'firebase/auth';
import { auth, db } from './firebase';
import {
  EmployeeLoginDoc,
  EmployeeSelfSubmittedFields,
  HRPrivateData,
  HRProfile,
  HRProfilesDoc,
  ProfileMaskedSummary,
  ProfileRequestDoc,
  ProfileStatusDoc,
} from '../types';

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
    address: '',
    title: '',
    firstNameTh: '',
    lastNameTh: '',
    firstNameEn: '',
    lastNameEn: '',
    birthDate: '',
    maritalStatus: '',
    idCardExpiry: '',
    currentAddress: '',
    phone: '',
    email: '',
    lineId: '',
    emergencyName: '',
    emergencyRelation: '',
    emergencyPhone: '',
    ssoHospital: '',
    hadSsoBefore: '',
    spouseHasIncome: '',
    childrenCount: 0,
    parentsSupportedCount: 0,
    lifeInsurancePerYear: 0,
    healthInsurancePerYear: 0,
    educationLevel: '',
    educationInstitute: '',
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
        address: typeof data.address === 'string' ? data.address : '',
        title: typeof data.title === 'string' ? data.title : '',
        firstNameTh: typeof data.firstNameTh === 'string' ? data.firstNameTh : '',
        lastNameTh: typeof data.lastNameTh === 'string' ? data.lastNameTh : '',
        firstNameEn: typeof data.firstNameEn === 'string' ? data.firstNameEn : '',
        lastNameEn: typeof data.lastNameEn === 'string' ? data.lastNameEn : '',
        birthDate: typeof data.birthDate === 'string' ? data.birthDate : '',
        maritalStatus: typeof data.maritalStatus === 'string' ? data.maritalStatus : '',
        idCardExpiry: typeof data.idCardExpiry === 'string' ? data.idCardExpiry : '',
        currentAddress: typeof data.currentAddress === 'string' ? data.currentAddress : '',
        phone: typeof data.phone === 'string' ? data.phone : '',
        email: typeof data.email === 'string' ? data.email : '',
        lineId: typeof data.lineId === 'string' ? data.lineId : '',
        emergencyName: typeof data.emergencyName === 'string' ? data.emergencyName : '',
        emergencyRelation: typeof data.emergencyRelation === 'string' ? data.emergencyRelation : '',
        emergencyPhone: typeof data.emergencyPhone === 'string' ? data.emergencyPhone : '',
        ssoHospital: typeof data.ssoHospital === 'string' ? data.ssoHospital : '',
        hadSsoBefore: typeof data.hadSsoBefore === 'string' ? data.hadSsoBefore : '',
        spouseHasIncome: typeof data.spouseHasIncome === 'string' ? data.spouseHasIncome : '',
        childrenCount:
          typeof data.childrenCount === 'number'
            ? data.childrenCount
            : Number(data.childrenCount) || 0,
        parentsSupportedCount:
          typeof data.parentsSupportedCount === 'number'
            ? data.parentsSupportedCount
            : Number(data.parentsSupportedCount) || 0,
        lifeInsurancePerYear:
          typeof data.lifeInsurancePerYear === 'number'
            ? data.lifeInsurancePerYear
            : Number(data.lifeInsurancePerYear) || 0,
        healthInsurancePerYear:
          typeof data.healthInsurancePerYear === 'number'
            ? data.healthInsurancePerYear
            : Number(data.healthInsurancePerYear) || 0,
        educationLevel: typeof data.educationLevel === 'string' ? data.educationLevel : '',
        educationInstitute:
          typeof data.educationInstitute === 'string' ? data.educationInstitute : '',
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
    address: (data.address || '').trim(),
    title: (data.title || '').trim(),
    firstNameTh: (data.firstNameTh || '').trim(),
    lastNameTh: (data.lastNameTh || '').trim(),
    firstNameEn: (data.firstNameEn || '').trim(),
    lastNameEn: (data.lastNameEn || '').trim(),
    birthDate: (data.birthDate || '').trim(),
    maritalStatus: (data.maritalStatus || '').trim(),
    idCardExpiry: (data.idCardExpiry || '').trim(),
    currentAddress: (data.currentAddress || '').trim(),
    phone: (data.phone || '').trim(),
    email: (data.email || '').trim(),
    lineId: (data.lineId || '').trim(),
    emergencyName: (data.emergencyName || '').trim(),
    emergencyRelation: (data.emergencyRelation || '').trim(),
    emergencyPhone: (data.emergencyPhone || '').trim(),
    ssoHospital: (data.ssoHospital || '').trim(),
    hadSsoBefore: (data.hadSsoBefore || '').trim(),
    spouseHasIncome: (data.spouseHasIncome || '').trim(),
    childrenCount: Math.max(0, Math.floor(Number(data.childrenCount) || 0)),
    parentsSupportedCount: Math.min(
      4,
      Math.max(0, Math.floor(Number(data.parentsSupportedCount) || 0))
    ),
    lifeInsurancePerYear: Math.max(0, Number(data.lifeInsurancePerYear) || 0),
    healthInsurancePerYear: Math.max(0, Number(data.healthInsurancePerYear) || 0),
    educationLevel: (data.educationLevel || '').trim(),
    educationInstitute: (data.educationInstitute || '').trim(),
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

// ===============================================================
// Employee Self-Service Profile Requests & Masked Status Operations
// ===============================================================

/**
 * ปิดบังเบอร์โทรศัพท์ให้เห็นเฉพาะ 4 ตัวท้าย เช่น xxx-xxx-1234
 */
export function maskPhoneLast4(rawPhone?: string): string {
  const trimmed = (rawPhone || '').trim();
  if (!trimmed) return '-';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 4) return 'xxxx';
  const last4 = digits.slice(-4);
  return `xxx-xxx-${last4}`;
}

/**
 * ตรวจสูตรเลขบัตรประชาชน 13 หลักของไทย
 */
export function validateThaiIdCard13Digits(raw?: string): boolean {
  if (!raw) return false;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits.charAt(i), 10) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === parseInt(digits.charAt(12), 10);
}

/**
 * สร้างข้อมูลแบบปิดบัง (maskedSummary) สำหรับเก็บใน profile_status/{employeeId}
 * ห้ามเก็บข้อมูลลับแบบเต็มลงใน profile_status เด็ดขาด
 */
export function buildMaskedSummaryFromHRPrivateAndProfile(
  priv: Partial<HRPrivateData>,
  profile?: Partial<HRProfile>
): ProfileMaskedSummary {
  const hasAddress = Boolean(priv.address && String(priv.address).trim());
  const hasCurrentAddress = Boolean(priv.currentAddress && String(priv.currentAddress).trim());
  const hasEmergency = Boolean(
    (priv.emergencyName && String(priv.emergencyName).trim()) ||
      (priv.emergencyPhone && String(priv.emergencyPhone).trim())
  );
  const hasSsoSection = Boolean(
    (priv.ssoHospital && String(priv.ssoHospital).trim()) ||
      (priv.hadSsoBefore && String(priv.hadSsoBefore).trim())
  );
  const hasTaxSection = Boolean(
    (priv.spouseHasIncome && String(priv.spouseHasIncome).trim()) ||
      Number(priv.childrenCount) > 0 ||
      Number(priv.parentsSupportedCount) > 0 ||
      Number(priv.lifeInsurancePerYear) > 0 ||
      Number(priv.healthInsurancePerYear) > 0
  );
  const hasEducation = Boolean(
    (priv.educationLevel && String(priv.educationLevel).trim()) ||
      (priv.educationInstitute && String(priv.educationInstitute).trim())
  );

  return {
    title: (priv.title || '').trim(),
    firstNameTh: (priv.firstNameTh || '').trim(),
    lastNameTh: (priv.lastNameTh || '').trim(),
    firstNameEn: (priv.firstNameEn || '').trim(),
    lastNameEn: (priv.lastNameEn || '').trim(),
    nickname: (profile?.nickname || '').trim(),
    maritalStatus: (priv.maritalStatus || '').trim(),
    birthDateStatus: priv.birthDate && String(priv.birthDate).trim() ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    ssoNumberMasked:
      priv.ssoNumber && String(priv.ssoNumber).trim()
        ? maskSensitiveNumber(String(priv.ssoNumber))
        : '-',
    idCardExpiryStatus:
      priv.idCardExpiry && String(priv.idCardExpiry).trim() ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    phoneMasked:
      priv.phone && String(priv.phone).trim() ? maskPhoneLast4(String(priv.phone)) : '-',
    emailStatus: priv.email && String(priv.email).trim() ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    lineIdStatus: priv.lineId && String(priv.lineId).trim() ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    bankName: (priv.bankName || '').trim(),
    accountName: (priv.accountName || '').trim(),
    accountNumberMasked:
      priv.accountNumber && String(priv.accountNumber).trim()
        ? maskSensitiveNumber(String(priv.accountNumber))
        : '-',
    addressStatus: hasAddress ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    currentAddressStatus: hasCurrentAddress ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    emergencyStatus: hasEmergency ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    ssoSectionStatus: hasSsoSection ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    taxDeductionStatus: hasTaxSection ? 'กรอกแล้ว' : 'ยังไม่กรอก',
    educationStatus: hasEducation ? 'กรอกแล้ว' : 'ยังไม่กรอก',
  };
}

/**
 * สร้าง maskedSummary จากข้อมูลที่พนักงานส่งครั้งแรก (หรือผสานกับ maskedSummary เดิม)
 */
export function buildMaskedSummaryFromSubmittedFields(
  submitted: Partial<EmployeeSelfSubmittedFields>,
  existingSummary?: ProfileMaskedSummary
): ProfileMaskedSummary {
  const prev = existingSummary || {};

  const pickStr = (newVal: string | undefined, oldVal: string | undefined) =>
    newVal !== undefined && String(newVal).trim() !== '' ? String(newVal).trim() : oldVal || '';

  const hasNewTax =
    (submitted.spouseHasIncome && submitted.spouseHasIncome.trim() !== '') ||
    (submitted.childrenCount !== undefined && Number(submitted.childrenCount) >= 0) ||
    (submitted.parentsSupportedCount !== undefined && Number(submitted.parentsSupportedCount) >= 0) ||
    (submitted.lifeInsurancePerYear !== undefined && Number(submitted.lifeInsurancePerYear) >= 0) ||
    (submitted.healthInsurancePerYear !== undefined && Number(submitted.healthInsurancePerYear) >= 0);

  return {
    title: pickStr(submitted.title, prev.title),
    firstNameTh: pickStr(submitted.firstNameTh, prev.firstNameTh),
    lastNameTh: pickStr(submitted.lastNameTh, prev.lastNameTh),
    firstNameEn: pickStr(submitted.firstNameEn, prev.firstNameEn),
    lastNameEn: pickStr(submitted.lastNameEn, prev.lastNameEn),
    nickname: pickStr(submitted.nickname, prev.nickname),
    maritalStatus: pickStr(submitted.maritalStatus, prev.maritalStatus),
    birthDateStatus:
      submitted.birthDate && submitted.birthDate.trim()
        ? 'กรอกแล้ว'
        : prev.birthDateStatus || 'ยังไม่กรอก',
    ssoNumberMasked:
      submitted.ssoNumber && submitted.ssoNumber.trim()
        ? maskSensitiveNumber(submitted.ssoNumber)
        : prev.ssoNumberMasked || '-',
    idCardExpiryStatus:
      submitted.idCardExpiry && submitted.idCardExpiry.trim()
        ? 'กรอกแล้ว'
        : prev.idCardExpiryStatus || 'ยังไม่กรอก',
    phoneMasked:
      submitted.phone && submitted.phone.trim()
        ? maskPhoneLast4(submitted.phone)
        : prev.phoneMasked || '-',
    emailStatus:
      submitted.email && submitted.email.trim() ? 'กรอกแล้ว' : prev.emailStatus || 'ยังไม่กรอก',
    lineIdStatus:
      submitted.lineId && submitted.lineId.trim() ? 'กรอกแล้ว' : prev.lineIdStatus || 'ยังไม่กรอก',
    bankName: pickStr(submitted.bankName, prev.bankName),
    accountName: pickStr(submitted.accountName, prev.accountName),
    accountNumberMasked:
      submitted.accountNumber && submitted.accountNumber.trim()
        ? maskSensitiveNumber(submitted.accountNumber)
        : prev.accountNumberMasked || '-',
    addressStatus:
      submitted.address && submitted.address.trim()
        ? 'กรอกแล้ว'
        : prev.addressStatus || 'ยังไม่กรอก',
    currentAddressStatus:
      submitted.currentAddress && submitted.currentAddress.trim()
        ? 'กรอกแล้ว'
        : prev.currentAddressStatus || 'ยังไม่กรอก',
    emergencyStatus:
      (submitted.emergencyName && submitted.emergencyName.trim()) ||
      (submitted.emergencyPhone && submitted.emergencyPhone.trim())
        ? 'กรอกแล้ว'
        : prev.emergencyStatus || 'ยังไม่กรอก',
    ssoSectionStatus:
      (submitted.ssoHospital && submitted.ssoHospital.trim()) ||
      (submitted.hadSsoBefore && submitted.hadSsoBefore.trim())
        ? 'กรอกแล้ว'
        : prev.ssoSectionStatus || 'ยังไม่กรอก',
    taxDeductionStatus: hasNewTax ? 'กรอกแล้ว' : prev.taxDeductionStatus || 'ยังไม่กรอก',
    educationStatus:
      (submitted.educationLevel && submitted.educationLevel.trim()) ||
      (submitted.educationInstitute && submitted.educationInstitute.trim())
        ? 'กรอกแล้ว'
        : prev.educationStatus || 'ยังไม่กรอก',
  };
}

/**
 * อ่าน profile_status/{employeeId} ด้วย getDoc ครั้งเดียว
 * พนักงานเรียกได้ (ไม่อ่าน hr_private หรือ profile_requests)
 */
export async function fetchEmployeeProfileStatus(
  employeeId: string
): Promise<ProfileStatusDoc | null> {
  const snap = await getDoc(doc(db, 'profile_status', employeeId));
  if (!snap.exists()) return null;
  const data = snap.data() as ProfileStatusDoc;
  return {
    ...data,
    employeeId,
  };
}

/**
 * นับจำนวนคำขอแก้ไขข้อมูลที่รออนุมัติ (อ่านจาก profile_status ที่ lastStatus == 'pending')
 */
export async function fetchPendingProfileRequestsCount(): Promise<number> {
  try {
    const q = query(collection(db, 'profile_status'), where('lastStatus', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.size;
  } catch (err) {
    console.warn('Error fetching pending profile_status count:', err);
    return 0;
  }
}

/**
 * พนักงานส่งข้อมูลตัวเอง (ครั้งแรก 'first_time' หรือ ขอแก้ไข 'edit')
 * สร้างเอกสารใน profile_requests และอัปเดต profile_status/{employeeId}
 */
export async function submitEmployeeProfileRequest(params: {
  employeeId: string;
  employeeName: string;
  isFirstTime: boolean;
  data: Partial<EmployeeSelfSubmittedFields>;
  existingStatus: ProfileStatusDoc | null;
}): Promise<ProfileStatusDoc> {
  const { employeeId, employeeName, isFirstTime, data, existingStatus } = params;
  const now = Date.now();

  const reqRef = doc(collection(db, 'profile_requests'));
  const reqType = isFirstTime ? 'first_time' : 'edit';
  const reqStatus = isFirstTime ? 'first_time' : 'pending';

  const requestPayload: ProfileRequestDoc = {
    id: reqRef.id,
    employeeId,
    employeeName,
    type: reqType,
    status: reqStatus,
    data,
    submittedAt: now,
    decidedAt: null,
    decidedBy: null,
    rejectReason: '',
  };

  await setDoc(reqRef, requestPayload);

  // สำหรับครั้งแรก: พนักงานเห็น "บันทึกแล้ว" ทันที และเห็น maskedSummary ของสิ่งที่กรอกทันที
  // สำหรับครั้งที่ 2 ขึ้นไป ('edit'): สถานะ 'pending' รอแอดมินอนุมัติ (คง maskedSummary เดิมไว้จนกว่าแอดมินจะอนุมัติ)
  const nextMaskedSummary = isFirstTime
    ? buildMaskedSummaryFromSubmittedFields(data, existingStatus?.maskedSummary)
    : existingStatus?.maskedSummary || buildMaskedSummaryFromSubmittedFields(data);

  const statusPayload: ProfileStatusDoc = {
    employeeId,
    hasSubmittedFirstTime: true,
    pendingRequestId: isFirstTime ? null : reqRef.id,
    lastStatus: isFirstTime ? 'applied' : 'pending',
    rejectReason: '',
    submittedAt: now,
    decidedAt: isFirstTime ? now : null,
    maskedSummary: nextMaskedSummary,
  };

  await setDoc(doc(db, 'profile_status', employeeId), statusPayload);
  return statusPayload;
}

export const SELF_PROFILE_FIELD_LABELS: Record<keyof EmployeeSelfSubmittedFields, string> = {
  title: 'คำนำหน้า',
  firstNameTh: 'ชื่อจริง (ไทย)',
  lastNameTh: 'นามสกุล (ไทย)',
  firstNameEn: 'ชื่อจริง (อังกฤษ)',
  lastNameEn: 'นามสกุล (อังกฤษ)',
  nickname: 'ชื่อเล่น',
  birthDate: 'วันเกิด',
  maritalStatus: 'สถานภาพสมรส',
  ssoNumber: 'เลขบัตรประชาชน (13 หลัก)',
  idCardExpiry: 'วันหมดอายุบัตรประชาชน',
  address: 'ที่อยู่ตามบัตรประชาชน',
  currentAddress: 'ที่อยู่ปัจจุบัน',
  phone: 'เบอร์โทรศัพท์',
  email: 'อีเมล',
  lineId: 'LINE ID',
  emergencyName: 'ชื่อผู้ติดต่อฉุกเฉิน',
  emergencyRelation: 'ความสัมพันธ์ผู้ติดต่อฉุกเฉิน',
  emergencyPhone: 'เบอร์โทรผู้ติดต่อฉุกเฉิน',
  bankName: 'ธนาคารรับเงินเดือน',
  accountNumber: 'เลขที่บัญชีธนาคาร',
  accountName: 'ชื่อบัญชีธนาคาร',
  ssoHospital: 'โรงพยาบาลประกันสังคม',
  hadSsoBefore: 'ประวัติการมีประกันสังคม',
  spouseHasIncome: 'สถานะรายได้คู่สมรส (ลดหย่อนภาษี)',
  childrenCount: 'จำนวนบุตร (ลดหย่อนภาษี)',
  parentsSupportedCount: 'จำนวนบิดามารดาที่อุปการะ (0-4)',
  lifeInsurancePerYear: 'เบี้ยประกันชีวิตต่อปี (บาท)',
  healthInsurancePerYear: 'เบี้ยประกันสุขภาพต่อปี (บาท)',
  educationLevel: 'ระดับการศึกษาสูงสุด',
  educationInstitute: 'สถาบันการศึกษา',
};

export const ALL_SELF_PROFILE_KEYS: Array<keyof EmployeeSelfSubmittedFields> = [
  'title',
  'firstNameTh',
  'lastNameTh',
  'firstNameEn',
  'lastNameEn',
  'nickname',
  'birthDate',
  'maritalStatus',
  'ssoNumber',
  'idCardExpiry',
  'address',
  'currentAddress',
  'phone',
  'email',
  'lineId',
  'emergencyName',
  'emergencyRelation',
  'emergencyPhone',
  'bankName',
  'accountNumber',
  'accountName',
  'ssoHospital',
  'hadSsoBefore',
  'spouseHasIncome',
  'childrenCount',
  'parentsSupportedCount',
  'lifeInsurancePerYear',
  'healthInsurancePerYear',
  'educationLevel',
  'educationInstitute',
];

function isFieldEmpty(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (typeof val === 'number') return val === 0;
  return false;
}

function areFieldValuesEqual(key: keyof EmployeeSelfSubmittedFields, a: unknown, b: unknown): boolean {
  if (
    key === 'childrenCount' ||
    key === 'parentsSupportedCount' ||
    key === 'lifeInsurancePerYear' ||
    key === 'healthInsurancePerYear'
  ) {
    return (Number(a) || 0) === (Number(b) || 0);
  }
  const cleanA = String(a ?? '').trim();
  const cleanB = String(b ?? '').trim();
  if (key === 'ssoNumber' || key === 'accountNumber' || key === 'phone' || key === 'emergencyPhone') {
    return cleanA.replace(/\D/g, '') === cleanB.replace(/\D/g, '');
  }
  return cleanA === cleanB;
}

/**
 * นำข้อมูลครั้งแรก (status == 'first_time') ไปใช้อัตโนมัติเมื่อแอดมินยืนยันตัวตนด้วยอีเมลในหน้า HR
 * กฎสำคัญ: เติมเฉพาะช่องที่ใน hr_private (และ hr_profiles.nickname) ยังว่างอยู่
 * ถ้าช่องไหนมีค่าเดิมอยู่แล้วและพนักงานกรอกไม่ตรงกัน ห้ามทับ ให้แยกช่องนั้นออกมาเป็นคำขอ 'pending'
 */
export async function autoApplyFirstTimeProfileRequests(
  currentProfiles: Record<string, HRProfile>,
  actorEmail: string
): Promise<{
  appliedCount: number;
  conflictCreatedCount: number;
  updatedProfiles: Record<string, HRProfile>;
}> {
  const q = query(collection(db, 'profile_requests'), where('status', '==', 'first_time'));
  const snap = await getDocs(q);
  if (snap.empty) {
    return {
      appliedCount: 0,
      conflictCreatedCount: 0,
      updatedProfiles: currentProfiles,
    };
  }

  let appliedCount = 0;
  let conflictCreatedCount = 0;
  const nextProfiles: Record<string, HRProfile> = { ...currentProfiles };
  let profilesChanged = false;

  for (const docSnap of snap.docs) {
    const req = { ...(docSnap.data() as ProfileRequestDoc), id: docSnap.id };
    const empId = req.employeeId;
    const empProfile = nextProfiles[empId] || getDefaultHRProfile(req.employeeName);
    const priv = await fetchHRPrivateEmployee(empId, empProfile.fullName || req.employeeName);

    const nextPriv: HRPrivateData = { ...priv };
    const nextEmpProfile: HRProfile = { ...empProfile };
    const conflicts: Partial<EmployeeSelfSubmittedFields> = {};
    let hasConflicts = false;

    const submittedData = req.data || {};

    for (const key of ALL_SELF_PROFILE_KEYS) {
      if (!(key in submittedData)) continue;
      const submittedVal = submittedData[key];
      if (submittedVal === undefined || submittedVal === null) continue;
      if (typeof submittedVal === 'string' && submittedVal.trim() === '') continue;

      if (key === 'nickname') {
        const curNick = (nextEmpProfile.nickname || '').trim();
        const newNick = String(submittedVal).trim();
        if (!curNick) {
          nextEmpProfile.nickname = newNick;
          profilesChanged = true;
        } else if (curNick !== newNick) {
          conflicts.nickname = newNick;
          hasConflicts = true;
        }
        continue;
      }

      const curVal = nextPriv[key as keyof HRPrivateData];
      if (key === 'bankName' || key === 'accountNumber' || key === 'accountName') {
        (conflicts as any)[key] = submittedVal;
        hasConflicts = true;
      } else if (isFieldEmpty(curVal)) {
        (nextPriv as any)[key] = submittedVal;
      } else if (!areFieldValuesEqual(key, curVal, submittedVal)) {
        (conflicts as any)[key] = submittedVal;
        hasConflicts = true;
      }
    }

    // ถ้า fullName ใน hr_profiles ยังว่างหรือเป็นค่าเริ่มต้น และมีการเติมชื่อ-นามสกุลไทย
    const combinedThName = [nextPriv.firstNameTh, nextPriv.lastNameTh]
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .join(' ');
    if (combinedThName && !nextEmpProfile.fullName) {
      nextEmpProfile.fullName = combinedThName;
      profilesChanged = true;
    }

    nextProfiles[empId] = nextEmpProfile;

    // 1. บันทึกข้อมูลที่เติมลง hr_private/{empId}
    await saveHRPrivateEmployee(empId, nextPriv, actorEmail);

    const now = Date.now();
    // 2. เปลี่ยนสถานะคำขอ first_time เป็น 'applied'
    await setDoc(
      doc(db, 'profile_requests', docSnap.id),
      {
        status: 'applied',
        decidedAt: now,
        decidedBy: actorEmail,
      },
      { merge: true }
    );
    appliedCount++;

    // 3. หากมีช่องที่ขัดแย้งกัน ให้สร้างคำขอ 'pending' แยกออกมาให้แอดมินกดอนุมัติเอง
    let pendingReqId: string | null = null;
    if (hasConflicts) {
      const conflictRef = doc(collection(db, 'profile_requests'));
      const conflictDoc: ProfileRequestDoc = {
        id: conflictRef.id,
        employeeId: empId,
        employeeName: nextEmpProfile.fullName || req.employeeName,
        type: 'edit',
        status: 'pending',
        data: conflicts,
        submittedAt: now,
        decidedAt: null,
        decidedBy: null,
        rejectReason: '',
      };
      await setDoc(conflictRef, conflictDoc);
      pendingReqId = conflictRef.id;
      conflictCreatedCount++;
    }

    // 4. อัปเดต profile_status/{empId} พร้อม maskedSummary ที่ตรงกับข้อมูลจริงล่าสุด
    const latestMasked = buildMaskedSummaryFromHRPrivateAndProfile(nextPriv, nextEmpProfile);
    const nextStatusDoc: ProfileStatusDoc = {
      employeeId: empId,
      hasSubmittedFirstTime: true,
      pendingRequestId: pendingReqId,
      lastStatus: hasConflicts ? 'pending' : 'applied',
      rejectReason: '',
      submittedAt: req.submittedAt || now,
      decidedAt: hasConflicts ? null : now,
      maskedSummary: latestMasked,
    };
    await setDoc(doc(db, 'profile_status', empId), nextStatusDoc);
  }

  if (profilesChanged) {
    await saveHRProfiles(nextProfiles, actorEmail);
  }

  return {
    appliedCount,
    conflictCreatedCount,
    updatedProfiles: nextProfiles,
  };
}

/**
 * แอดมินกด "อนุมัติ" คำขอแก้ไขข้อมูลพนักงาน
 */
export async function approveEmployeeProfileRequest(params: {
  request: ProfileRequestDoc;
  currentProfiles: Record<string, HRProfile>;
  actorEmail: string;
}): Promise<{
  updatedProfiles: Record<string, HRProfile>;
}> {
  const { request, currentProfiles, actorEmail } = params;
  if (!request.id) throw new Error('Missing request ID');

  const empId = request.employeeId;
  const nextProfiles: Record<string, HRProfile> = { ...currentProfiles };
  const empProfile: HRProfile = {
    ...(nextProfiles[empId] || getDefaultHRProfile(request.employeeName)),
  };
  const priv = await fetchHRPrivateEmployee(empId, empProfile.fullName || request.employeeName);
  const nextPriv: HRPrivateData = { ...priv };

  let profileChanged = false;
  const submittedData = request.data || {};

  for (const key of ALL_SELF_PROFILE_KEYS) {
    if (!(key in submittedData)) continue;
    const newVal = submittedData[key];
    if (newVal === undefined || newVal === null) continue;
    if (typeof newVal === 'string' && newVal.trim() === '') continue;

    if (key === 'nickname') {
      empProfile.nickname = String(newVal).trim();
      profileChanged = true;
    } else {
      (nextPriv as any)[key] = newVal;
    }
  }

  // ถ้ามีการเปลี่ยนชื่อจริงหรือนามสกุลไทย ให้อัปเดต fullName ใน hr_profiles ด้วย
  if ('firstNameTh' in submittedData || 'lastNameTh' in submittedData) {
    const fullTh = [nextPriv.firstNameTh, nextPriv.lastNameTh]
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .join(' ');
    if (fullTh) {
      empProfile.fullName = fullTh;
      profileChanged = true;
    }
  }

  nextProfiles[empId] = empProfile;

  await saveHRPrivateEmployee(empId, nextPriv, actorEmail);
  if (profileChanged) {
    await saveHRProfiles(nextProfiles, actorEmail);
  }

  const now = Date.now();
  await setDoc(
    doc(db, 'profile_requests', request.id),
    {
      status: 'approved',
      decidedAt: now,
      decidedBy: actorEmail,
      rejectReason: '',
    },
    { merge: true }
  );

  const latestMasked = buildMaskedSummaryFromHRPrivateAndProfile(nextPriv, empProfile);
  const statusPayload: ProfileStatusDoc = {
    employeeId: empId,
    hasSubmittedFirstTime: true,
    pendingRequestId: null,
    lastStatus: 'approved',
    rejectReason: '',
    submittedAt: request.submittedAt || now,
    decidedAt: now,
    maskedSummary: latestMasked,
  };
  await setDoc(doc(db, 'profile_status', empId), statusPayload);

  return { updatedProfiles: nextProfiles };
}

/**
 * แอดมินกด "ไม่อนุมัติ" คำขอแก้ไขข้อมูลพนักงาน (ต้องระบุเหตุผล)
 */
export async function rejectEmployeeProfileRequest(params: {
  request: ProfileRequestDoc;
  rejectReason: string;
  currentProfiles: Record<string, HRProfile>;
  actorEmail: string;
}): Promise<void> {
  const { request, rejectReason, currentProfiles, actorEmail } = params;
  if (!request.id) throw new Error('Missing request ID');
  const trimmedReason = rejectReason.trim();
  if (!trimmedReason) throw new Error('กรุณาระบุเหตุผลที่ไม่อนุมัติ');

  const empId = request.employeeId;
  const empProfile = currentProfiles[empId] || getDefaultHRProfile(request.employeeName);
  const priv = await fetchHRPrivateEmployee(empId, empProfile.fullName || request.employeeName);

  const now = Date.now();
  await setDoc(
    doc(db, 'profile_requests', request.id),
    {
      status: 'rejected',
      rejectReason: trimmedReason,
      decidedAt: now,
      decidedBy: actorEmail,
    },
    { merge: true }
  );

  const latestMasked = buildMaskedSummaryFromHRPrivateAndProfile(priv, empProfile);
  const statusPayload: ProfileStatusDoc = {
    employeeId: empId,
    hasSubmittedFirstTime: true,
    pendingRequestId: null,
    lastStatus: 'rejected',
    rejectReason: trimmedReason,
    submittedAt: request.submittedAt || now,
    decidedAt: now,
    maskedSummary: latestMasked,
  };
  await setDoc(doc(db, 'profile_status', empId), statusPayload);
}

/**
 * ซิงก์ profile_status/{employeeId} ให้ตรงกับข้อมูลล่าสุดเมื่อแอดมินแก้ไขข้อมูลในหน้า HR โดยตรง
 */
export async function syncProfileStatusMaskedSummaryByAdmin(
  employeeId: string,
  priv: HRPrivateData,
  profile: HRProfile
): Promise<void> {
  try {
    const existingSnap = await getDoc(doc(db, 'profile_status', employeeId));
    const existing = existingSnap.exists() ? (existingSnap.data() as ProfileStatusDoc) : null;
    const latestMasked = buildMaskedSummaryFromHRPrivateAndProfile(priv, profile);
    const now = Date.now();

    const payload: ProfileStatusDoc = {
      employeeId,
      hasSubmittedFirstTime: existing?.hasSubmittedFirstTime ?? true,
      pendingRequestId: existing?.pendingRequestId ?? null,
      lastStatus: existing?.lastStatus ?? 'applied',
      rejectReason: existing?.rejectReason ?? '',
      submittedAt: existing?.submittedAt ?? now,
      decidedAt: existing?.decidedAt ?? now,
      maskedSummary: latestMasked,
    };
    await setDoc(doc(db, 'profile_status', employeeId), payload, { merge: true });
  } catch (err) {
    console.warn('Could not sync profile_status maskedSummary:', err);
  }
}

// ===============================================================
// Employee Google Login & employee_logins/{employeeId}
// ===============================================================

const EMPLOYEE_LOGINS_COLLECTION = 'employee_logins';

/**
 * ตรวจสอบว่า Firebase Auth user ปัจจุบันเป็นการล็อกอินแอดมิน HR (password provider) หรือไม่
 */
export function isHrAdminAuthUser(fbUser: FirebaseAuthUser | null): boolean {
  if (!fbUser || fbUser.isAnonymous) return false;
  const email = (fbUser.email || '').toLowerCase();
  if (!email) return false;
  return fbUser.providerData.some((p) => p.providerId === 'password');
}

/**
 * ตรวจสอบว่า Firebase Auth user ปัจจุบันเป็นการล็อกอินด้วย Google หรือไม่
 */
export function isEmployeeGoogleAuthUser(fbUser: FirebaseAuthUser | null): boolean {
  if (!fbUser || fbUser.isAnonymous) return false;
  const email = (fbUser.email || '').toLowerCase();
  if (!email) return false;
  return fbUser.providerData.some((p) => p.providerId === 'google.com');
}

/**
 * ดึงข้อมูลการผูก Gmail ของพนักงานจาก employee_logins/{employeeId}
 */
export async function fetchEmployeeLoginLink(
  employeeId: string
): Promise<EmployeeLoginDoc | null> {
  if (!employeeId) return null;
  const ref = doc(db, EMPLOYEE_LOGINS_COLLECTION, employeeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<EmployeeLoginDoc>;
  if (!data.email) return null;
  return {
    employeeId,
    email: String(data.email).trim().toLowerCase(),
    linkedAt: typeof data.linkedAt === 'number' ? data.linkedAt : 0,
    linkedBy: typeof data.linkedBy === 'string' ? data.linkedBy : '',
  };
}

/**
 * ผูก Gmail กับพนักงานใน employee_logins/{employeeId}
 * (1 อีเมลผูกได้แค่ 1 พนักงาน ถ้าซ้ำให้โยน Error แจ้งเตือน)
 */
export async function saveEmployeeLoginLink(
  employeeId: string,
  email: string,
  linkedBy: string
): Promise<EmployeeLoginDoc> {
  if (!employeeId) throw new Error('ไม่พบรหัสพนักงาน');
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('กรุณากรอกอีเมลให้ถูกต้อง');
  }

  // ตรวจสอบว่าอีเมลนี้ถูกผูกกับพนักงานคนอื่นแล้วหรือไม่
  const dupQ = query(
    collection(db, EMPLOYEE_LOGINS_COLLECTION),
    where('email', '==', cleanEmail)
  );
  const dupSnap = await getDocs(dupQ);
  for (const d of dupSnap.docs) {
    if (d.id !== employeeId) {
      throw new Error('อีเมลนี้ถูกผูกกับพนักงานคนอื่นแล้ว (1 อีเมลผูกได้แค่ 1 พนักงาน)');
    }
  }

  const payload: EmployeeLoginDoc = {
    email: cleanEmail,
    linkedAt: Date.now(),
    linkedBy,
  };
  await setDoc(doc(db, EMPLOYEE_LOGINS_COLLECTION, employeeId), payload);
  return {
    employeeId,
    ...payload,
  };
}

/**
 * ยกเลิกการผูก Gmail ของพนักงาน (ลบ employee_logins/{employeeId})
 */
export async function unlinkEmployeeLoginLink(employeeId: string): Promise<void> {
  if (!employeeId) return;
  await deleteDoc(doc(db, EMPLOYEE_LOGINS_COLLECTION, employeeId));
}

/**
 * ค้นหา employeeId ที่ผูกกับอีเมล Google นี้
 */
export async function findEmployeeIdByGoogleEmail(email: string): Promise<string | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;
  const q = query(
    collection(db, EMPLOYEE_LOGINS_COLLECTION),
    where('email', '==', cleanEmail),
    limit(2)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id;
}

/**
 * เข้าสู่ระบบด้วย Google สำหรับพนักงานเพื่อดูข้อมูลเต็มของตัวเองในหน้า /me
 */
export async function signInEmployeeWithGoogle(): Promise<FirebaseAuthUser> {
  await setPersistence(auth, inMemoryPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

/**
 * ออกจากระบบ Google ของพนักงาน และกลับสู่ Anonymous Auth สำหรับการใช้งานระบบปกติ
 */
export async function signOutEmployeeGoogleSession(): Promise<void> {
  try {
    if (auth.currentUser && isEmployeeGoogleAuthUser(auth.currentUser)) {
      await signOut(auth);
    }
  } catch (e) {
    console.warn('Sign out employee google session warning:', e);
  }
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  } catch (e) {
    console.warn('Anonymous fallback warning:', e);
  }
}



