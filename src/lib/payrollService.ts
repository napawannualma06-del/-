import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  AdvanceRequest,
  HRPrivateData,
  OvertimeRequest,
  PayrollEmployeeSnapshot,
  PayrollItemDefinition,
  PayrollOTLines,
  PayrollSettingsDoc,
  PayrollSlip,
  PayrollSlipItem,
} from '../types';
import {
  calculateMonthlySSODeduction,
  DEFAULT_SSO_CAP_AMOUNT,
  DEFAULT_SSO_RATE_PERCENT,
} from './hrService';

export const DEFAULT_COMPANY_NAME = 'Thunder Cloud';

export function round2(val: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function getDefaultPayItems(): PayrollItemDefinition[] {
  return [
    {
      id: 'earning_commission',
      name: 'ค่าคอม',
      nameEn: 'Commission',
      type: 'earning',
      enabled: true,
    },
    {
      id: 'earning_bonus',
      name: 'โบนัส',
      nameEn: 'Bonus',
      type: 'earning',
      enabled: true,
    },
    {
      id: 'earning_allowance',
      name: 'เบี้ยเลี้ยง/ค่าครองชีพ',
      nameEn: 'Allowance / Living',
      type: 'earning',
      enabled: true,
    },
    {
      id: 'earning_other',
      name: 'เงินได้อื่นๆ',
      nameEn: 'Other Earnings',
      type: 'earning',
      enabled: true,
    },
    {
      id: 'deduction_absence',
      name: 'หักขาด/ลา/สาย',
      nameEn: 'Absence / Leave / Late',
      type: 'deduction',
      enabled: true,
    },
    {
      id: 'deduction_student_loan',
      name: 'เงินกู้ยืม กยศ./กรอ.',
      nameEn: 'Student Loan (SLF)',
      type: 'deduction',
      enabled: true,
    },
    {
      id: 'deduction_other',
      name: 'รายการหักอื่นๆ',
      nameEn: 'Other Deductions',
      type: 'deduction',
      enabled: true,
    },
  ];
}

export function getDefaultPayrollSettings(): PayrollSettingsDoc {
  return {
    companyName: DEFAULT_COMPANY_NAME,
    logoDataUrl: '',
    otMultiplierHolidayInHours: null,
    otMultiplierHolidayAfterHours: null,
    otMultiplierWorkday: null,
    otMultiplierUnspecified: null,
    payItems: getDefaultPayItems(),
    usedPayItemIds: [],
    defaultPayDates: {},
  };
}

export function areOTMultipliersComplete(settings: PayrollSettingsDoc | null | undefined): boolean {
  if (!settings) return false;
  const fields = [
    settings.otMultiplierHolidayInHours,
    settings.otMultiplierHolidayAfterHours,
    settings.otMultiplierWorkday,
    settings.otMultiplierUnspecified,
  ];
  return fields.every(
    (v) => v !== null && v !== undefined && typeof v === 'number' && Number.isFinite(v) && v >= 0
  );
}

/**
 * โหลดการตั้งค่าสลิปเงินเดือนจาก system_settings/payroll_settings ด้วย getDoc ครั้งเดียว
 * ถ้ายังไม่มีเอกสาร จะคืนค่าเริ่มต้น (ตัวคูณ OT เป็น null ให้แอดมินกรอกเอง)
 * ถ้าเกิด error ในการโหลด จะ throw ออกไปเพื่อให้หน้าจอแจ้งเตือนและปิดปุ่มบันทึก
 */
export async function fetchPayrollSettings(): Promise<PayrollSettingsDoc> {
  try {
    const snap = await getDoc(doc(db, 'system_settings', 'payroll_settings'));
    if (snap.exists()) {
      const data = snap.data() as Partial<PayrollSettingsDoc>;
      const parseMult = (v: unknown): number | null => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      return {
        companyName:
          typeof data.companyName === 'string' && data.companyName.trim()
            ? data.companyName.trim()
            : DEFAULT_COMPANY_NAME,
        logoDataUrl: typeof data.logoDataUrl === 'string' ? data.logoDataUrl : '',
        otMultiplierHolidayInHours: parseMult(data.otMultiplierHolidayInHours),
        otMultiplierHolidayAfterHours: parseMult(data.otMultiplierHolidayAfterHours),
        otMultiplierWorkday: parseMult(data.otMultiplierWorkday),
        otMultiplierUnspecified: parseMult(data.otMultiplierUnspecified),
        payItems: Array.isArray(data.payItems) ? data.payItems : getDefaultPayItems(),
        usedPayItemIds: Array.isArray(data.usedPayItemIds) ? data.usedPayItemIds : [],
        defaultPayDates:
          data.defaultPayDates && typeof data.defaultPayDates === 'object'
            ? data.defaultPayDates
            : {},
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
    return getDefaultPayrollSettings();
  } catch (err) {
    console.error('Error fetching system_settings/payroll_settings:', err);
    throw err;
  }
}

/**
 * บันทึกการตั้งค่าสลิปเงินเดือนลง system_settings/payroll_settings
 */
export async function savePayrollSettings(
  settings: PayrollSettingsDoc,
  updatedBy: string
): Promise<PayrollSettingsDoc> {
  const payload: PayrollSettingsDoc = {
    companyName: (settings.companyName || '').trim() || DEFAULT_COMPANY_NAME,
    logoDataUrl: typeof settings.logoDataUrl === 'string' ? settings.logoDataUrl : '',
    otMultiplierHolidayInHours:
      settings.otMultiplierHolidayInHours !== null &&
      settings.otMultiplierHolidayInHours !== undefined &&
      Number.isFinite(Number(settings.otMultiplierHolidayInHours))
        ? round2(Number(settings.otMultiplierHolidayInHours))
        : null,
    otMultiplierHolidayAfterHours:
      settings.otMultiplierHolidayAfterHours !== null &&
      settings.otMultiplierHolidayAfterHours !== undefined &&
      Number.isFinite(Number(settings.otMultiplierHolidayAfterHours))
        ? round2(Number(settings.otMultiplierHolidayAfterHours))
        : null,
    otMultiplierWorkday:
      settings.otMultiplierWorkday !== null &&
      settings.otMultiplierWorkday !== undefined &&
      Number.isFinite(Number(settings.otMultiplierWorkday))
        ? round2(Number(settings.otMultiplierWorkday))
        : null,
    otMultiplierUnspecified:
      settings.otMultiplierUnspecified !== null &&
      settings.otMultiplierUnspecified !== undefined &&
      Number.isFinite(Number(settings.otMultiplierUnspecified))
        ? round2(Number(settings.otMultiplierUnspecified))
        : null,
    payItems: settings.payItems.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      nameEn: (item.nameEn || '').trim(),
      type: item.type === 'deduction' ? 'deduction' : 'earning',
      enabled: Boolean(item.enabled),
    })),
    usedPayItemIds: Array.from(new Set(settings.usedPayItemIds || [])),
    defaultPayDates: settings.defaultPayDates || {},
    updatedAt: Date.now(),
    updatedBy,
  };

  await setDoc(doc(db, 'system_settings', 'payroll_settings'), payload);
  return payload;
}

/**
 * ตรวจสอบว่ารายการ payItem เคยถูกใช้ในสลิปที่ยืนยันแล้ว (status === 'confirmed') หรือไม่
 */
export async function checkPayItemUsedInConfirmedSlips(
  itemId: string,
  settings: PayrollSettingsDoc,
  loadedSlipsMap?: Record<string, PayrollSlip | null>
): Promise<boolean> {
  if (settings.usedPayItemIds?.includes(itemId)) {
    return true;
  }

  if (loadedSlipsMap) {
    for (const slip of Object.values(loadedSlipsMap)) {
      if (
        slip &&
        slip.status === 'confirmed' &&
        slip.items?.some((it) => it.id === itemId && Number(it.amount) > 0)
      ) {
        return true;
      }
    }
  }

  try {
    const q = query(
      collection(db, 'payroll_slips'),
      where('status', '==', 'confirmed'),
      limit(100)
    );
    const snap = await getDocs(q);
    let found = false;
    snap.forEach((docSnap) => {
      if (found) return;
      const data = docSnap.data() as Partial<PayrollSlip>;
      if (
        Array.isArray(data.items) &&
        data.items.some((it) => it.id === itemId && Number(it.amount) > 0)
      ) {
        found = true;
      }
    });
    return found;
  } catch {
    return false;
  }
}

export function getPayrollSlipDocId(cycleKey: string, employeeId: string): string {
  return `${cycleKey}_${employeeId}`;
}

export function getYearFromCycleKey(cycleKey: string): number {
  const parts = (cycleKey || '').split('-');
  const y = parseInt(parts[0], 10);
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

/**
 * โหลดสลิปเงินเดือนรายบุคคลจาก payroll_slips/{cycleKey}_{employeeId} ด้วย getDoc
 */
export async function fetchPayrollSlip(
  cycleKey: string,
  employeeId: string
): Promise<PayrollSlip | null> {
  const docId = getPayrollSlipDocId(cycleKey, employeeId);
  try {
    const snap = await getDoc(doc(db, 'payroll_slips', docId));
    if (snap.exists()) {
      const data = snap.data() as PayrollSlip;
      return {
        ...data,
        id: docId,
      };
    }
    return null;
  } catch (err) {
    console.error(`Error fetching payroll_slips/${docId}:`, err);
    throw err;
  }
}

export interface ApprovedOTHoursByType {
  holiday_in_hours: number;
  holiday_after_hours: number;
  workday: number;
  unspecified: number;
  totalHours: number;
}

/**
 * ดึงชั่วโมง OT ที่อนุมัติแล้ว (status === 'approved') ของพนักงานในรอบนั้น
 * ด้วย where('employeeId', '==', employeeId) และ where('cyclePeriod', '==', cycleKey)
 * ห้ามดึงทั้ง collection
 */
export async function fetchEmployeeCycleApprovedOT(
  employeeId: string,
  cycleKey: string
): Promise<ApprovedOTHoursByType> {
  try {
    const q = query(
      collection(db, 'overtime_requests'),
      where('employeeId', '==', employeeId),
      where('cyclePeriod', '==', cycleKey)
    );
    const snap = await getDocs(q);

    let holidayInHours = 0;
    let holidayAfterHours = 0;
    let workday = 0;
    let unspecified = 0;

    snap.forEach((docSnap) => {
      const data = docSnap.data() as Omit<OvertimeRequest, 'id'>;
      if (data.status !== 'approved') return;

      const h = Number(data.hours) || 0;
      if (h <= 0) return;

      if (data.otType === 'holiday_in_hours') {
        holidayInHours += h;
      } else if (data.otType === 'holiday_after_hours') {
        holidayAfterHours += h;
      } else if (data.otType === 'workday') {
        workday += h;
      } else {
        unspecified += h;
      }
    });

    const rHolidayIn = round2(holidayInHours);
    const rHolidayAfter = round2(holidayAfterHours);
    const rWorkday = round2(workday);
    const rUnspecified = round2(unspecified);

    return {
      holiday_in_hours: rHolidayIn,
      holiday_after_hours: rHolidayAfter,
      workday: rWorkday,
      unspecified: rUnspecified,
      totalHours: round2(rHolidayIn + rHolidayAfter + rWorkday + rUnspecified),
    };
  } catch (err) {
    console.error(`Error fetching approved OT for ${employeeId} in ${cycleKey}:`, err);
    throw err;
  }
}

/**
 * ดึงยอดเบิกเงินล่วงหน้าที่อนุมัติแล้ว (status === 'approved') ของพนักงานในรอบนั้น
 * ด้วย where('employeeId', '==', employeeId) และ where('cyclePeriod', '==', cycleKey)
 */
export async function fetchEmployeeCycleApprovedAdvance(
  employeeId: string,
  cycleKey: string
): Promise<number> {
  try {
    const q = query(
      collection(db, 'advance_requests'),
      where('employeeId', '==', employeeId),
      where('cyclePeriod', '==', cycleKey)
    );
    const snap = await getDocs(q);

    let total = 0;
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Omit<AdvanceRequest, 'id'>;
      if (data.status !== 'approved') return;
      total += Number(data.amount) || 0;
    });

    return round2(total);
  } catch (err) {
    console.error(`Error fetching approved advance for ${employeeId} in ${cycleKey}:`, err);
    throw err;
  }
}

/**
 * ดึงสลิปที่ยืนยันแล้ว (status === 'confirmed') ของพนักงานในปีเดียวกัน
 * ด้วย where('employeeId', '==', employeeId) และ where('year', '==', year)
 */
export async function fetchEmployeeYearConfirmedSlips(
  employeeId: string,
  year: number
): Promise<PayrollSlip[]> {
  try {
    const q = query(
      collection(db, 'payroll_slips'),
      where('employeeId', '==', employeeId),
      where('year', '==', year)
    );
    const snap = await getDocs(q);

    const list: PayrollSlip[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as PayrollSlip;
      if (data.status === 'confirmed') {
        list.push({
          ...data,
          id: docSnap.id,
        });
      }
    });

    return list;
  } catch (err) {
    console.error(`Error fetching year confirmed slips for ${employeeId} (${year}):`, err);
    throw err;
  }
}

export interface CalculatedPayrollResult {
  salary: number;
  hourlyRate: number;
  otLines: PayrollOTLines;
  otTotal: number;
  ssoAmount: number;
  advanceAmount: number;
  withholdingTax: number;
  items: PayrollSlipItem[];
  earningItemsTotal: number;
  deductionItemsTotal: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
}

/**
 * คำนวณตัวเลขสลิปเงินเดือนทั้งหมดตามสูตร (ปัดทศนิยม 2 ตำแหน่ง):
 * - ค่าแรงต่อชั่วโมง = salary ÷ 30 ÷ 8
 * - ค่า OT แต่ละประเภท = ชั่วโมง OT ที่อนุมัติแล้ว × ค่าแรงต่อชั่วโมง × ตัวคูณของประเภทนั้น
 * - ประกันสังคม = min(salary × % ÷ 100, เพดาน) ถ้าสถานะไม่เข้าประกันสังคม = 0
 * - เบิกล่วงหน้า = ยอดเบิกที่อนุมัติแล้วในรอบนั้น
 * - ภาษีหัก ณ ที่จ่าย = แอดมินกรอกเอง
 * - รวมเงินได้ = salary + OT ทุกประเภท + รายการเงินได้ทั้งหมด
 * - รวมรายการหัก = ประกันสังคม + ภาษี + เบิกล่วงหน้า + รายการหักทั้งหมด
 * - เงินได้สุทธิ = รวมเงินได้ − รวมรายการหัก
 */
export function calculatePayrollSlipValues(params: {
  privateData: HRPrivateData;
  otHours: ApprovedOTHoursByType;
  settings: PayrollSettingsDoc;
  approvedAdvanceAmount: number;
  withholdingTax: number;
  items: PayrollSlipItem[];
}): CalculatedPayrollResult {
  const {
    privateData,
    otHours,
    settings,
    approvedAdvanceAmount,
    withholdingTax,
    items,
  } = params;

  const salary = round2(Math.max(0, Number(privateData.salary) || 0));
  const hourlyRate = round2(salary / 30 / 8);

  const multRed = round2(Math.max(0, Number(settings.otMultiplierHolidayInHours) || 0));
  const multGreen = round2(Math.max(0, Number(settings.otMultiplierHolidayAfterHours) || 0));
  const multBlue = round2(Math.max(0, Number(settings.otMultiplierWorkday) || 0));
  const multGray = round2(Math.max(0, Number(settings.otMultiplierUnspecified) || 0));

  const hRed = round2(otHours.holiday_in_hours);
  const hGreen = round2(otHours.holiday_after_hours);
  const hBlue = round2(otHours.workday);
  const hGray = round2(otHours.unspecified);

  const amtRed = round2(hRed * hourlyRate * multRed);
  const amtGreen = round2(hGreen * hourlyRate * multGreen);
  const amtBlue = round2(hBlue * hourlyRate * multBlue);
  const amtGray = round2(hGray * hourlyRate * multGray);

  const otLines: PayrollOTLines = {
    holiday_in_hours: {
      hours: hRed,
      multiplier: multRed,
      amount: amtRed,
    },
    holiday_after_hours: {
      hours: hGreen,
      multiplier: multGreen,
      amount: amtGreen,
    },
    workday: {
      hours: hBlue,
      multiplier: multBlue,
      amount: amtBlue,
    },
    unspecified: {
      hours: hGray,
      multiplier: multGray,
      amount: amtGray,
    },
  };

  const otTotal = round2(amtRed + amtGreen + amtBlue + amtGray);

  const ssoAmount =
    privateData.ssoStatus === 'not_enrolled'
      ? 0
      : calculateMonthlySSODeduction(
          salary,
          privateData.ssoRatePercent ?? DEFAULT_SSO_RATE_PERCENT,
          privateData.ssoCapAmount ?? DEFAULT_SSO_CAP_AMOUNT
        );

  const advanceAmount = round2(Math.max(0, Number(approvedAdvanceAmount) || 0));
  const cleanTax = round2(Math.max(0, Number(withholdingTax) || 0));

  const normalizedItems: PayrollSlipItem[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    nameEn: it.nameEn || '',
    type: it.type === 'deduction' ? 'deduction' : 'earning',
    amount: round2(Math.max(0, Number(it.amount) || 0)),
  }));

  const earningItemsTotal = round2(
    normalizedItems
      .filter((it) => it.type === 'earning')
      .reduce((sum, it) => sum + it.amount, 0)
  );

  const deductionItemsTotal = round2(
    normalizedItems
      .filter((it) => it.type === 'deduction')
      .reduce((sum, it) => sum + it.amount, 0)
  );

  const totalEarnings = round2(salary + otTotal + earningItemsTotal);
  const totalDeductions = round2(ssoAmount + cleanTax + advanceAmount + deductionItemsTotal);
  const netPay = round2(totalEarnings - totalDeductions);

  return {
    salary,
    hourlyRate,
    otLines,
    otTotal,
    ssoAmount,
    advanceAmount,
    withholdingTax: cleanTax,
    items: normalizedItems,
    earningItemsTotal,
    deductionItemsTotal,
    totalEarnings,
    totalDeductions,
    netPay,
  };
}

/**
 * คำนวณยอดสะสมทั้งปี (YTD) จากสลิปที่ยืนยันแล้วในปีเดียวกันของพนักงานคนนั้น + รวมสลิปรอบนี้
 */
export function calculateYTDTotals(
  otherConfirmedSlipsInYear: PayrollSlip[],
  currentCycleKey: string,
  currentSlipValues: {
    totalEarnings: number;
    withholdingTax: number;
    ssoAmount: number;
  }
): {
  ytdEarnings: number;
  ytdTax: number;
  ytdSso: number;
  previousConfirmedCount: number;
} {
  const previousSlips = otherConfirmedSlipsInYear.filter(
    (s) => s.cycleKey !== currentCycleKey && s.status === 'confirmed'
  );

  const prevEarnings = previousSlips.reduce((sum, s) => sum + (Number(s.totalEarnings) || 0), 0);
  const prevTax = previousSlips.reduce((sum, s) => sum + (Number(s.withholdingTax) || 0), 0);
  const prevSso = previousSlips.reduce((sum, s) => sum + (Number(s.ssoAmount) || 0), 0);

  return {
    ytdEarnings: round2(prevEarnings + (Number(currentSlipValues.totalEarnings) || 0)),
    ytdTax: round2(prevTax + (Number(currentSlipValues.withholdingTax) || 0)),
    ytdSso: round2(prevSso + (Number(currentSlipValues.ssoAmount) || 0)),
    previousConfirmedCount: previousSlips.length,
  };
}

/**
 * บันทึกสลิปเงินเดือน (ร่าง หรือ ยืนยันแล้ว) ลงใน payroll_slips/{cycleKey}_{employeeId}
 */
export async function savePayrollSlip(params: {
  employeeId: string;
  cycleKey: string;
  payDate: string;
  status: 'draft' | 'confirmed';
  calc: CalculatedPayrollResult;
  remark: string;
  snapshot: PayrollEmployeeSnapshot;
  actorName: string;
  existingSlip?: PayrollSlip | null;
}): Promise<PayrollSlip> {
  const {
    employeeId,
    cycleKey,
    payDate,
    status,
    calc,
    remark,
    snapshot,
    actorName,
    existingSlip,
  } = params;

  const docId = getPayrollSlipDocId(cycleKey, employeeId);
  const now = Date.now();
  const year = getYearFromCycleKey(cycleKey);

  const payload: PayrollSlip = {
    id: docId,
    employeeId,
    cycleKey,
    year,
    payDate: payDate || `${cycleKey}-25`,
    status,
    salary: calc.salary,
    hourlyRate: calc.hourlyRate,
    otLines: calc.otLines,
    otTotal: calc.otTotal,
    ssoAmount: calc.ssoAmount,
    advanceAmount: calc.advanceAmount,
    withholdingTax: calc.withholdingTax,
    items: calc.items,
    totalEarnings: calc.totalEarnings,
    totalDeductions: calc.totalDeductions,
    netPay: calc.netPay,
    remark: (remark || '').trim(),
    snapshot: {
      fullName: snapshot.fullName || '',
      nickname: snapshot.nickname || '',
      position: snapshot.position || '',
      bankName: snapshot.bankName || '',
      accountNumber: snapshot.accountNumber || '',
      accountName: snapshot.accountName || '',
    },
    employeeName: snapshot.fullName || '',
    position: snapshot.position || '',
    bankName: snapshot.bankName || '',
    accountNumber: snapshot.accountNumber || '',
    accountName: snapshot.accountName || '',
    confirmedAt: status === 'confirmed' ? now : existingSlip?.confirmedAt ?? null,
    confirmedBy: status === 'confirmed' ? actorName : existingSlip?.confirmedBy ?? null,
    unconfirmedAt: existingSlip?.unconfirmedAt,
    unconfirmedBy: existingSlip?.unconfirmedBy,
    unconfirmReason: existingSlip?.unconfirmReason,
    updatedAt: now,
    updatedBy: actorName,
  };

  // ลบ field ที่เป็น undefined ออกเพื่อความปลอดภัยของ Firestore
  const cleanPayload: Record<string, any> = {};
  Object.entries(payload).forEach(([k, v]) => {
    if (v !== undefined) {
      cleanPayload[k] = v;
    }
  });

  await setDoc(doc(db, 'payroll_slips', docId), cleanPayload);
  return payload;
}

/**
 * ยกเลิกการยืนยันสลิป (เปลี่ยนจาก confirmed เป็น draft พร้อมบันทึกเหตุผล)
 */
export async function unconfirmPayrollSlip(params: {
  slip: PayrollSlip;
  reason: string;
  actorName: string;
}): Promise<PayrollSlip> {
  const { slip, reason, actorName } = params;
  const docId = getPayrollSlipDocId(slip.cycleKey, slip.employeeId);
  const now = Date.now();

  const updated: PayrollSlip = {
    ...slip,
    id: docId,
    status: 'draft',
    confirmedAt: null,
    confirmedBy: null,
    unconfirmedAt: now,
    unconfirmedBy: actorName,
    unconfirmReason: reason.trim(),
    updatedAt: now,
    updatedBy: actorName,
  };

  const cleanPayload: Record<string, any> = {};
  Object.entries(updated).forEach(([k, v]) => {
    if (v !== undefined) {
      cleanPayload[k] = v;
    }
  });

  await setDoc(doc(db, 'payroll_slips', docId), cleanPayload);
  return updated;
}
