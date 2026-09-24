export interface RefinancePlan {
  termMonths: 3 | 6 | 9 | 12 | 15;
  monthlyAmount: number;
}

export interface RefinanceModelRate {
  id: string;
  series: 'iPhone 12-13' | 'iPhone 14' | 'iPhone 15' | 'iPhone 16' | 'iPhone 17';
  model: string;
  loanAmount: number; // ยอดที่ได้ปกติ (บาท)
  isNew?: boolean;
  notes?: string;
  plans: {
    term3?: number;
    term6?: number;
    term9?: number;
    term12?: number;
    term15?: number;
  };
}

export interface BatteryCondition {
  label: string;
  range: string;
  deduction: number;
  status: 'full' | 'deduct' | 'reject';
  description: string;
}

export const BATTERY_CONDITIONS: BatteryCondition[] = [
  {
    label: '100% - 75%',
    range: '75-100',
    deduction: 0,
    status: 'full',
    description: 'รับเต็มยอด ไม่หักค่าแบตเตอรี่',
  },
  {
    label: '74% - 70%',
    range: '70-74',
    deduction: 500,
    status: 'deduct',
    description: 'หัก 500 บาท (แจ้งเตือนลูกค้า แต่ไม่ลดยอดจัด)',
  },
  {
    label: 'ต่ำกว่า 70%',
    range: '<70',
    deduction: 0,
    status: 'reject',
    description: 'ไม่รับทำรายการ',
  },
];

export const GENERAL_CONDITIONS = [
  'รับเครื่องนอก • เครื่องหิ้ว ทุกโมเดล',
  'เครื่องนอก: <10k ลด ~1,000 | 10k-20k ลด ~2,000 | 20k+ ลด ~3,000 (ยึดยอดใกล้เคียงในตาราง)',
  'เครื่องรีเฟอร์บิช (Refurbished): จัดยอดลดลง 50% (ยึดยอดใกล้เคียงในตาราง)',
  'งานซ่อมเปลี่ยนจอ / เปลี่ยนกล้อง: ลดลงไปจัดยอดที่ต่ำกว่าและใกล้เคียงยอดเดิมที่สุดในตาราง',
  'งานซ่อมเปลี่ยนบอร์ด / บอร์ดจิก: ไม่รับทำรายการโดยเด็ดขาด ❌',
  'เปลี่ยนแบต หรือ แบตเตอรี่ 70-74%: แจ้งเตือนหัก 500 บาท แต่ไม่ลดยอดจัด',
  'ส่วนลดปิดยอดก่อนกำหนด: ปิดงวดที่ 1 ลด 20% | ปิดงวดที่ 2 ลด 15% | ปิดงวดที่ 3 เป็นต้นไป ลด 10%',
  'ค่าปรับล่าช้า: เกินกำหนดคิดวันละ 50 บาทนับจากวันแรกที่ล่าช้า | เกิน 16 วัน มีค่าปลดล็อก +500 บาท',
  'ยึดราคาและค่างวดที่มีในตารางเท่านั้น ไม่คิดยอดหรือค่างวดใหม่นอกตาราง',
  'รับบัตรเครดิตผ่าน iCloud • ปิดยอดจ่ายร้าน • ลูกค้ามีเครื่องใช้งานต่อ ไม่ต้องฝากเครื่อง',
];

export const FOOTER_NOTES = [
  'เครื่องนอก: ยอดจัด <10,000 ลด ~1,000 | 10,000-20,000 ลด ~2,000 | 20,000+ ลด ~3,000 แล้วเทียบหายอดจัดที่ใกล้เคียงที่สุดในตาราง',
  'เครื่องรีเฟอร์บิช (Refurbished): จัดยอดลดลง 50% แล้วเทียบหายอดจัดที่ใกล้เคียงที่สุดในตาราง',
  'งานซ่อม: หักเปลี่ยนจอ / เปลี่ยนกล้อง ➡️ ไปจัดยอดที่ลดลงมาใกล้กับยอดจัดเดิมที่สุดในตาราง (เช่น 16e 10,000 บ. ➡️ ไปจัดยอด 15 ที่ 9,500 บ., 16 Pro 17,000 บ. ➡️ ไปจัดยอด 16 Plus ที่ 15,000 บ.)',
  'งานซ่อม: เปลี่ยนบอร์ด / บอร์ดจิก ❌ ไม่รับทำรายการ',
  'แบตเตอรี่: เปลี่ยนแบต หรือ สุขภาพแบต 70-74% ⚠️ แจ้งเตือนเฉยๆ ว่าหัก 500 บาท แต่ไม่ต้องลดยอดจัด (แบต <70% ไม่รับ)',
  'ส่วนลดปิดยอดก่อนกำหนด: ปิดในงวดที่ 1 ลด 20% ของยอดคงเหลือ | ปิดในงวดที่ 2 ลด 15% | ปิดในงวดที่ 3 เป็นต้นไป ลด 10%',
  'เบี้ยปรับล่าช้า: คิดวันละ 50 บาท (นับแต่วันแรกที่ล่าช้า) | หากล่าช้าเกิน 16 วัน มีค่าบริการปลดล็อกเพิ่ม 500 บาท',
  'กฎเหล็ก THAIPLUS: ยึดราคาและค่างวดในตารางเท่านั้น ไม่คิดยอดใหม่นอกตาราง',
];

export const REFINANCE_RATES: RefinanceModelRate[] = [
  // iPhone 12 - 13
  {
    id: 'ip-12-pm',
    series: 'iPhone 12-13',
    model: 'iPhone 12 Pro Max',
    loanAmount: 4500,
    plans: { term3: 2400, term6: 1425, term9: 1040, term12: 915 },
  },
  {
    id: 'ip-13-mini',
    series: 'iPhone 12-13',
    model: 'iPhone 13 mini',
    loanAmount: 4500,
    plans: { term3: 2400, term6: 1425, term9: 1040, term12: 915 },
  },
  {
    id: 'ip-13',
    series: 'iPhone 12-13',
    model: 'iPhone 13',
    loanAmount: 6000,
    plans: { term3: 3200, term6: 1900, term9: 1387, term12: 1220 },
  },
  {
    id: 'ip-13-pro',
    series: 'iPhone 12-13',
    model: 'iPhone 13 Pro',
    loanAmount: 8500,
    plans: { term3: 4533, term6: 2692, term9: 1964, term12: 1728 },
  },
  {
    id: 'ip-13-pm',
    series: 'iPhone 12-13',
    model: 'iPhone 13 Pro Max',
    loanAmount: 9500,
    plans: { term3: 5067, term6: 3008, term9: 2196, term12: 1932 },
  },

  // iPhone 14
  {
    id: 'ip-14',
    series: 'iPhone 14',
    model: 'iPhone 14',
    loanAmount: 7000,
    plans: { term3: 3733, term6: 2217, term9: 1618, term12: 1423 },
  },
  {
    id: 'ip-14-plus',
    series: 'iPhone 14',
    model: 'iPhone 14 Plus',
    loanAmount: 9000,
    plans: { term3: 4800, term6: 2850, term9: 2080, term12: 1830 },
  },
  {
    id: 'ip-14-pro',
    series: 'iPhone 14',
    model: 'iPhone 14 Pro',
    loanAmount: 10500,
    plans: { term3: 5600, term6: 3325, term9: 2427, term12: 2135 },
  },
  {
    id: 'ip-14-pm',
    series: 'iPhone 14',
    model: 'iPhone 14 Pro Max',
    loanAmount: 12500,
    plans: { term3: 6667, term6: 3958, term9: 2889, term12: 2542, term15: 2083 },
  },

  // iPhone 15
  {
    id: 'ip-15',
    series: 'iPhone 15',
    model: 'iPhone 15',
    loanAmount: 9500,
    plans: { term3: 5067, term6: 3008, term9: 2196, term12: 1932, term15: 1583 },
  },
  {
    id: 'ip-15-plus',
    series: 'iPhone 15',
    model: 'iPhone 15 Plus',
    loanAmount: 12500,
    plans: { term3: 6667, term6: 3958, term9: 2889, term12: 2542, term15: 2083 },
  },
  {
    id: 'ip-15-pro',
    series: 'iPhone 15',
    model: 'iPhone 15 Pro',
    loanAmount: 13500,
    plans: { term3: 7200, term6: 4275, term9: 3120, term12: 2745, term15: 2250 },
  },
  {
    id: 'ip-15-pm',
    series: 'iPhone 15',
    model: 'iPhone 15 Pro Max',
    loanAmount: 17000,
    plans: { term3: 9067, term6: 5383, term9: 3929, term12: 3457, term15: 2833 },
  },

  // iPhone 16
  {
    id: 'ip-16e',
    series: 'iPhone 16',
    model: 'iPhone 16e',
    loanAmount: 10000,
    plans: { term3: 5333, term6: 3167, term9: 2311, term12: 2033, term15: 1667 },
  },
  {
    id: 'ip-16',
    series: 'iPhone 16',
    model: 'iPhone 16',
    loanAmount: 13500,
    plans: { term3: 7200, term6: 4275, term9: 3120, term12: 2745, term15: 2250 },
  },
  {
    id: 'ip-16-plus',
    series: 'iPhone 16',
    model: 'iPhone 16 Plus',
    loanAmount: 15000,
    plans: { term3: 8000, term6: 4750, term9: 3467, term12: 3050, term15: 2500 },
  },
  {
    id: 'ip-16-pro',
    series: 'iPhone 16',
    model: 'iPhone 16 Pro',
    loanAmount: 17000,
    plans: { term3: 9067, term6: 5383, term9: 3929, term12: 3457, term15: 2833 },
  },
  {
    id: 'ip-16-pm',
    series: 'iPhone 16',
    model: 'iPhone 16 Pro Max',
    loanAmount: 21000,
    plans: { term3: 11200, term6: 6650, term9: 4853, term12: 4270, term15: 3500 },
  },

  // iPhone 17
  {
    id: 'ip-17e',
    series: 'iPhone 17',
    model: 'iPhone 17e',
    loanAmount: 12000,
    plans: { term3: 6400, term6: 3800, term9: 2773, term12: 2440, term15: 2000 },
  },
  {
    id: 'ip-17',
    series: 'iPhone 17',
    model: 'iPhone 17',
    loanAmount: 17000,
    plans: { term3: 9067, term6: 5383, term9: 3929, term12: 3457, term15: 2833 },
  },
  {
    id: 'ip-17-air',
    series: 'iPhone 17',
    model: 'iPhone 17 Air',
    loanAmount: 19000,
    plans: { term3: 10133, term6: 6017, term9: 4391, term12: 3863, term15: 3167 },
  },
  {
    id: 'ip-17-pro',
    series: 'iPhone 17',
    model: 'iPhone 17 Pro',
    loanAmount: 24000,
    plans: { term3: 12800, term6: 7600, term9: 5547, term12: 4880, term15: 4000 },
  },
  {
    id: 'ip-17-pm',
    series: 'iPhone 17',
    model: 'iPhone 17 Pro Max',
    loanAmount: 28000,
    plans: { term3: 14933, term6: 8867, term9: 6471, term12: 5693, term15: 4667 },
  },
  {
    id: 'ip-17-pm-2tb',
    series: 'iPhone 17',
    model: 'iPhone 17 Pro Max 2TB',
    isNew: true,
    loanAmount: 30000,
    plans: { term3: 16000, term6: 9500, term9: 6933, term12: 6100, term15: 5000 },
    notes: 'ความจุพิเศษ 2TB รับยอดสูงสุด',
  },
];

// Unique sorted loan amounts in the table:
// [4500, 6000, 7000, 8500, 9000, 9500, 10000, 10500, 12000, 12500, 13500, 15000, 17000, 19000, 21000, 24000, 28000, 30000]
export const UNIQUE_LOAN_TIERS = Array.from(new Set(REFINANCE_RATES.map(r => r.loanAmount))).sort((a, b) => a - b);

/**
 * ค้นหา Rate ต้นแบบในตารางที่มี loanAmount ใกล้เคียงกับ targetAmount ที่สุด
 * โดย preference จะปัดลงหากระยะห่างเท่ากัน เพื่อความปลอดภัยในการปล่อยสินเชื่อ
 * และยึดตัวเลขราคาและค่างวดจริงในตารางเท่านั้น
 */
export function findClosestRateInTable(targetAmount: number): RefinanceModelRate {
  let closestRate = REFINANCE_RATES[0];
  let minDiff = Math.abs(closestRate.loanAmount - targetAmount);

  for (const rate of REFINANCE_RATES) {
    const diff = Math.abs(rate.loanAmount - targetAmount);
    if (diff < minDiff) {
      minDiff = diff;
      closestRate = rate;
    } else if (diff === minDiff && rate.loanAmount <= targetAmount) {
      closestRate = rate;
    }
  }

  return closestRate;
}

/**
 * ค้นหายอดจัดที่ "ลดลงมาต่ำกว่ายอดจัดเดิม และใกล้กับยอดจัดเดิมที่สุดในตาราง"
 * ใช้สำหรับงานซ่อม: เปลี่ยนจอ, เปลี่ยนกล้อง
 * ตัวอย่าง:
 * - 16e (10,000) ➡️ ยอดต่ำลงมาที่ใกล้ที่สุดคือ 9,500 (iPhone 15)
 * - 16 Pro (17,000) ➡️ ยอดต่ำลงมาที่ใกล้ที่สุดคือ 15,000 (iPhone 16 Plus)
 */
export function getPreviousLowerTierRate(currentLoanAmount: number): RefinanceModelRate {
  const lowerTiers = UNIQUE_LOAN_TIERS.filter(amount => amount < currentLoanAmount);
  if (lowerTiers.length > 0) {
    const targetAmount = lowerTiers[lowerTiers.length - 1]; // ยอดจัดที่ต่ำกว่าและใกล้ที่สุด
    const match = REFINANCE_RATES.find(r => r.loanAmount === targetAmount);
    if (match) return match;
  }
  return findClosestRateInTable(currentLoanAmount);
}

/**
 * คำนวณหายอดจัดและ Rate ในตารางสำหรับ "เครื่องนอก"
 * กฎ:
 * - ต่ำกว่า 10,000: ลดยอดประมาณ 1,000
 * - 10,000 - 20,000: ลดยอดประมาณ 2,000
 * - 20,000 ขึ้นไป: ลดยอดประมาณ 3,000
 * จากนั้นเทียบหายอดจัดของรุ่นในตารางที่ใกล้เคียงที่สุด (ยึดราคาและค่างวดในตารางเท่านั้น)
 */
export function getForeignMachineMatchingRate(modelRate: RefinanceModelRate): {
  targetAmount: number;
  nominalReduction: number;
  matchedRate: RefinanceModelRate;
} {
  const currentLoan = modelRate.loanAmount;
  let nominalReduction = 1000;

  if (currentLoan < 10000) {
    nominalReduction = 1000;
  } else if (currentLoan <= 20000) {
    nominalReduction = 2000;
  } else {
    nominalReduction = 3000;
  }

  const targetAmount = Math.max(4500, currentLoan - nominalReduction);
  const matchedRate = findClosestRateInTable(targetAmount);

  return {
    targetAmount,
    nominalReduction,
    matchedRate,
  };
}

/**
 * คำนวณหายอดจัดและ Rate ในตารางสำหรับ "เครื่องรีเฟอร์บิช (Refurbished)"
 * กฎ:
 * - จัดยอดลดลง 50% ของยอดจัด
 * - ไปดูในตารางว่าใกล้กับยอดจัดรุ่นไหน (ยึดราคาและค่างวดในตารางเท่านั้น)
 */
export function getRefurbishedMatchingRate(baseLoanAmount: number): {
  targetAmount: number;
  matchedRate: RefinanceModelRate;
} {
  const targetAmount = Math.max(4500, Math.round(baseLoanAmount * 0.5));
  const matchedRate = findClosestRateInTable(targetAmount);

  return {
    targetAmount,
    matchedRate,
  };
}

export function findRefinanceRate(modelName: string): RefinanceModelRate | undefined {
  if (!modelName) return undefined;
  const normalized = modelName.trim().toLowerCase();

  const exact = REFINANCE_RATES.find(r => r.model.toLowerCase() === normalized);
  if (exact) return exact;

  if (normalized.includes('2tb') && normalized.includes('17')) {
    return REFINANCE_RATES.find(r => r.id === 'ip-17-pm-2tb');
  }

  return REFINANCE_RATES.find(r => normalized.includes(r.model.toLowerCase()) || r.model.toLowerCase().includes(normalized));
}

export type MachineOrigin = 'thai' | 'foreign'; // 'thai' = ศูนย์ไทย, 'foreign' = เครื่องนอก/เครื่องหิ้ว

export interface RepairConditions {
  screenReplaced?: boolean; // หักเปลี่ยนจอ -> ลดยอดลงมาที่ใกล้เดิมที่สุด
  cameraReplaced?: boolean; // หักเปลี่ยนกล้อง -> ลดยอดลงมาที่ใกล้เดิมที่สุด
  motherboardRepaired?: boolean; // เปลี่ยนบอร์ด/บอร์ดจิก -> ไม่รับ ❌
  batteryReplaced?: boolean; // เปลี่ยนแบต -> แจ้งเตือนหัก 500 แต่ไม่ลดยอดจัด
}

export interface RefinanceCalcOptions {
  batteryHealth?: number | null;
  machineOrigin?: MachineOrigin; // 'foreign' -> ลด ~1k/<10k, ~2k/10k-20k, ~3k/20k+ แล้วยึดยอดในตาราง
  isRefurbished?: boolean; // รีเฟอร์บิช -> ยอดลดลง 50% แล้วยึดยอดในตาราง
  isRepaired?: boolean; // เครื่องซ่อมทั่วไป
  repairConditions?: RepairConditions; // เงื่อนไขงานซ่อมเฉพาะ
}

/**
 * คำนวณส่วนลดปิดสัญญาก่อนกำหนด และค่าปรับล่าช้า
 * กฎ:
 * - ปิดในงวดที่ 1 ลด 20% ของยอดคงเหลือ
 * - ปิดในงวดที่ 2 ลด 15% ของยอดคงเหลือ
 * - ปิดในงวดที่ 3 เป็นต้นไป ลด 10% ของยอดคงเหลือ
 * - จ่ายเกินกำหนด: วันละ 50 บาท (นับจากวันแรก)
 * - ล่าช้าเกิน 16 วัน: บวกค่าปลดล็อกเพิ่ม 500 บาท
 */
export interface EarlyPayoffCalculation {
  selectedTerm: 3 | 6 | 9 | 12 | 15;
  monthlyAmount: number;
  totalContractAmount: number;
  closingAtInstallment: number; // งวดที่ปิด (เช่น งวดที่ 1, 2, 3...)
  paidInstallments: number; // จำนวนงวดที่จ่ายไปแล้วก่อนปิด (ปกติ closingAtInstallment - 1)
  remainingInstallments: number; // จำนวนงวดคงเหลือที่จะปิด
  remainingBalance: number; // ยอดคงเหลือก่อนหักส่วนลด (remainingInstallments * monthlyAmount)
  discountRatePercent: number; // 20%, 15%, หรือ 10%
  discountAmount: number; // จำนวนเงินส่วนลดที่ได้
  lateDays: number; // จำนวนวันที่ล่าช้า
  lateFee: number; // ค่าล่าช้า (50 บ./วัน)
  unlockFee: number; // ค่าปลดล็อก 500 บาท (ถ้าเกิน 16 วัน)
  totalLateCharges: number; // ค่าล่าช้ารวมปลดล็อก
  netPayoffAmount: number; // ยอดปิดบัญชีสุทธิ (ยอดคงเหลือ - ส่วนลด + ค่าล่าช้า + ค่าปลดล็อก)
}

export function calculateEarlyPayoffDiscount(
  selectedTerm: 3 | 6 | 9 | 12 | 15,
  monthlyAmount: number,
  closingAtInstallment: number = 1,
  lateDays: number = 0
): EarlyPayoffCalculation {
  const totalContractAmount = monthlyAmount * selectedTerm;
  const safeClosingAt = Math.max(1, Math.min(selectedTerm, closingAtInstallment));
  const paidInstallments = safeClosingAt - 1;
  const remainingInstallments = selectedTerm - paidInstallments;
  const remainingBalance = remainingInstallments * monthlyAmount;

  // เปอร์เซ็นต์ส่วนลดตามงวดที่ปิด
  let discountRatePercent = 10;
  if (safeClosingAt === 1) {
    discountRatePercent = 20;
  } else if (safeClosingAt === 2) {
    discountRatePercent = 15;
  } else {
    discountRatePercent = 10;
  }

  const discountAmount = Math.round(remainingBalance * (discountRatePercent / 100));

  // ค่าล่าช้า และ ค่าปลดล็อก
  const safeLateDays = Math.max(0, lateDays);
  const lateFee = safeLateDays * 50; // วันละ 50 บาทนับจากวันแรก
  const unlockFee = safeLateDays > 16 ? 500 : 0; // เกิน 16 วันบวกเพิ่ม 500
  const totalLateCharges = lateFee + unlockFee;

  const netPayoffAmount = Math.max(0, remainingBalance - discountAmount + totalLateCharges);

  return {
    selectedTerm,
    monthlyAmount,
    totalContractAmount,
    closingAtInstallment: safeClosingAt,
    paidInstallments,
    remainingInstallments,
    remainingBalance,
    discountRatePercent,
    discountAmount,
    lateDays: safeLateDays,
    lateFee,
    unlockFee,
    totalLateCharges,
    netPayoffAmount,
  };
}

export function calculateAdjustedRefinance(
  modelRate: RefinanceModelRate,
  options?: RefinanceCalcOptions | number | null,
  legacyIsRepaired?: boolean
) {
  let batteryHealth: number | null | undefined;
  let machineOrigin: MachineOrigin = 'thai';
  let isRefurbished = false;
  let isRepaired = false;
  let repairConditions: RepairConditions = {};

  if (typeof options === 'object' && options !== null) {
    batteryHealth = options.batteryHealth;
    machineOrigin = options.machineOrigin || 'thai';
    isRefurbished = options.isRefurbished || false;
    isRepaired = options.isRepaired || false;
    repairConditions = options.repairConditions || {};
  } else {
    batteryHealth = typeof options === 'number' ? options : (options === null ? null : undefined);
    isRepaired = !!legacyIsRepaired;
  }

  // 1. ตรวจสอบเงื่อนไข "ไม่รับ" ทันที:
  // - เปลี่ยนบอร์ด / บอร์ดจิก ❌ ไม่รับเด็ดขาด
  // - สุขภาพแบตเตอรี่ < 70% ❌ ไม่รับ
  const isMotherboardRejected = !!repairConditions.motherboardRepaired;
  let isBatteryRejected = false;
  if (typeof batteryHealth === 'number' && batteryHealth < 70) {
    isBatteryRejected = true;
  }

  const isRejected = isMotherboardRejected || isBatteryRejected;
  let rejectReason = '';
  if (isMotherboardRejected) {
    rejectReason = 'เครื่องผ่านการเปลี่ยนบอร์ด / บอร์ดจิก (ไม่รับทำรายการโดยเด็ดขาด ❌)';
  } else if (isBatteryRejected) {
    rejectReason = 'สุขภาพแบตเตอรี่ต่ำกว่า 70% (ไม่รับทำรายการ ❌)';
  }

  // 2. ยอดจัดตั้งต้นตามรุ่น (เครื่องศูนย์ไทยปกติ)
  const standardLoan = modelRate.loanAmount;
  let currentMatchedRate: RefinanceModelRate = modelRate;
  let originTargetLoan = standardLoan;
  let originNominalReduction = 0;
  let originMatchNote = '';

  // 3. ถ้าเป็นเครื่องนอก
  // <10,000 ลด 1,000 | 10,000-20,000 ลด 2,000 | 20,000+ ลด 3,000
  // แล้วเทียบหายอดจัดในตารางที่ใกล้ที่สุด
  if (machineOrigin === 'foreign') {
    const foreignRes = getForeignMachineMatchingRate(currentMatchedRate);
    currentMatchedRate = foreignRes.matchedRate;
    originTargetLoan = foreignRes.targetAmount;
    originNominalReduction = foreignRes.nominalReduction;
    originMatchNote = `ลด ~${foreignRes.nominalReduction.toLocaleString()} บ. (เป้า ${foreignRes.targetAmount.toLocaleString()} บ.) ➡️ ยึดยอดรุ่น ${foreignRes.matchedRate.model} (${foreignRes.matchedRate.loanAmount.toLocaleString()} บ.)`;
  }

  // 4. ถ้าเป็นเครื่องรีเฟอร์บิช (Refurbished)
  // จัดยอดลดลง 50% แล้วไปดูในตารางว่าใกล้กับยอดจัดรุ่นไหน
  let refurbishedTargetLoan = currentMatchedRate.loanAmount;
  let refurbishedMatchNote = '';
  if (isRefurbished) {
    const refRes = getRefurbishedMatchingRate(currentMatchedRate.loanAmount);
    currentMatchedRate = refRes.matchedRate;
    refurbishedTargetLoan = refRes.targetAmount;
    refurbishedMatchNote = `ลด 50% (เป้า ${refRes.targetAmount.toLocaleString()} บ.) ➡️ ยึดยอดรุ่น ${refRes.matchedRate.model} (${refRes.matchedRate.loanAmount.toLocaleString()} บ.)`;
  }

  // 5. ถ้ามีงานซ่อม "เปลี่ยนจอ" หรือ "เปลี่ยนกล้อง"
  // ให้ไปจัดยอดลดลงมาที่ใกล้ยอดจัดเดิมที่สุดในตาราง
  let repairMatchNote = '';
  const screenRepaired = !!repairConditions.screenReplaced;
  const cameraRepaired = !!repairConditions.cameraReplaced;

  if (screenRepaired || cameraRepaired) {
    let lowerRate = getPreviousLowerTierRate(currentMatchedRate.loanAmount);
    const parts = [];
    if (screenRepaired) parts.push('เปลี่ยนจอ');
    if (cameraRepaired) parts.push('เปลี่ยนกล้อง');
    
    if (screenRepaired && cameraRepaired) {
      lowerRate = getPreviousLowerTierRate(lowerRate.loanAmount);
    }

    repairMatchNote = `หัก${parts.join(' & ')} ➡️ ลดยอดมาจัดที่รุ่น ${lowerRate.model} (${lowerRate.loanAmount.toLocaleString()} บ.)`;
    currentMatchedRate = lowerRate;
  }

  // ตอนนี้ currentMatchedRate คือ Rate จริงในตารางที่ยึดราคาและค่างวด
  const tableLoanAmount = currentMatchedRate.loanAmount;

  // 6. ตรวจสอบเงื่อนไข แบตเตอรี่ (เปลี่ยนแบต หรือ สุขภาพแบต 70-74%):
  // แจ้งเตือนเฉยๆ ว่าต้องหัก 500 แต่ไม่ต้องลดยอดจัด
  let batteryNotice = '';
  let hasBatteryWarning = false;
  const hasBatteryReplaced = !!repairConditions.batteryReplaced;
  const isBattery70to74 = typeof batteryHealth === 'number' && batteryHealth >= 70 && batteryHealth < 75;

  if (hasBatteryReplaced && isBattery70to74) {
    hasBatteryWarning = true;
    batteryNotice = '⚠️ เปลี่ยนแบต และ สุขภาพแบต 70-74%: แจ้งเตือนหัก 500 บาท (ยอดจัดในตารางยังคงเดิม)';
  } else if (hasBatteryReplaced) {
    hasBatteryWarning = true;
    batteryNotice = '⚠️ เครื่องผ่านการเปลี่ยนแบตเตอรี่: แจ้งเตือนหัก 500 บาท (ยอดจัดในตารางยังคงเดิม)';
  } else if (isBattery70to74) {
    hasBatteryWarning = true;
    batteryNotice = '⚠️ สุขภาพแบต 70-74%: แจ้งเตือนหัก 500 บาท (ยอดจัดในตารางยังคงเดิม)';
  } else if (typeof batteryHealth === 'number' && batteryHealth >= 75) {
    batteryNotice = '✅ สุขภาพแบตเตอรี่ 75-100% รับเต็มยอด';
  }

  const finalLoan = isRejected ? 0 : tableLoanAmount;

  return {
    originalLoan: standardLoan,
    matchedModelRate: currentMatchedRate,
    tableLoanAmount,
    originTargetLoan,
    originNominalReduction,
    originMatchNote,
    refurbishedTargetLoan,
    refurbishedMatchNote,
    repairMatchNote,
    machineOrigin,
    isRefurbished,
    isRepaired,
    repairConditions,
    isRejected,
    rejectReason,
    hasBatteryWarning,
    batteryNotice,
    totalDeduction: standardLoan - finalLoan,
    finalLoan,
    plans: currentMatchedRate.plans, // ยึดค่างวดจริงในตารางเสมอ 100%
  };
}
