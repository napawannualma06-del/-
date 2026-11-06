export interface RefinancePlan {
  termMonths: 1 | 6 | 9 | 12 | 15;
  monthlyAmount: number;
}

export interface RefinanceModelRate {
  id: string;
  series: 'iPhone 13' | 'iPhone 14' | 'iPhone 15' | 'iPhone 16' | 'iPhone 17' | 'iPhone 18';
  seriesLabel?: string;
  model: string;
  loanAmount: number; // ยอดที่ได้ปกติ (บาท)
  isNew?: boolean;
  requiresBoxAndReceipt?: boolean;
  notes?: string;
  plans: {
    term1?: number;
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
  '⚡ อัปเดตตารางใหม่ เริ่มใช้ราคา 5 พ.ย. 69 (v4.0) • งวด 1 เดือน ดอก 22% • ผ่อน 15 เดือน เฉพาะรุ่นที่ยอดที่ได้ 17,000 บาทขึ้นไป',
  'เลือกงวดได้: 1 / 6 / 9 / 12 / 15 เดือน (ช่องงวด = ค่างวดต่อเดือน)',
  'iPhone 18 ทุกรุ่น ต้องมีกล่อง + ใบเสร็จ',
  'แบตเตอรี่: 100–75% รับเต็มยอด • 74–70% หัก 500 บาท (แจ้งเตือนลูกค้า แต่ไม่ลดยอดจัด) • ต่ำกว่า 70% ไม่รับ',
  'รับเครื่องนอก/เครื่องหิ้วทุกโมเดล • รับบัตรเครดิตผ่าน iCloud • ปิดยอดจ่ายร้าน • อายุ 18 ปีขึ้นไป',
  'ลูกค้ามีเครื่องใช้งานต่อ ไม่ต้องฝากเครื่อง • รับ iOS ล่าสุด • ปิดก่อนกำหนดได้ตลอดสัญญา',
  'เครื่องนอก: <10k ลด ~1,000 | 10k-20k ลด ~2,000 | 20k+ ลด ~3,000 (ยึดยอดใกล้เคียงในตาราง)',
  'เครื่องรีเฟอร์บิช (Refurbished): จัดยอดลดลง 50% (ยึดยอดใกล้เคียงในตาราง)',
  'งานซ่อมเปลี่ยนจอ / เปลี่ยนกล้อง: ลดลงไปจัดยอดที่ต่ำกว่าและใกล้เคียงยอดเดิมที่สุดในตาราง',
  'งานซ่อมเปลี่ยนบอร์ด / บอร์ดจิก: ไม่รับทำรายการโดยเด็ดขาด ❌',
  'ส่วนลดปิดยอดก่อนกำหนด: ปิดงวดที่ 1 ลด 20% | ปิดงวดที่ 2 ลด 15% | ปิดงวดที่ 3 เป็นต้นไป ลด 10% (ยกเว้นเลือกผ่อน 1 งวด ไม่มีส่วนลด)',
  'เงื่อนไขการชำระเงิน: ชำระล่าช้า มีค่าดำเนินการวันละ 50 บาท | ค้างชำระ 1 วันขึ้นไป แจ้งเตือนพร้อมภาพหน้าจอ | ค้างชำระเกิน 7 วัน เครื่องจะถูกจำกัดการใช้งาน (ใช้ได้เฉพาะ LINE และแอปธนาคาร)',
  'ยึดราคาและค่างวดที่มีในตารางเท่านั้น ไม่คิดยอดหรือค่างวดใหม่นอกตาราง',
];

export const FOOTER_NOTES = [
  'เริ่มใช้ราคา 5 พ.ย. 69 (v4.0) • งวด 1 เดือน ดอก 22% • ผ่อน 15 เดือน เฉพาะรุ่นที่ยอดที่ได้ 17,000 บาทขึ้นไป',
  'เลือกงวดได้: 1 / 6 / 9 / 12 / 15 เดือน (หน่วย: บาท • ช่องงวด = ค่างวดต่อเดือน)',
  'iPhone 18 Series ทุกรุ่น ต้องมีกล่อง + ใบเสร็จ',
  'แบตเตอรี่: 100–75% รับเต็มยอด • 74–70% หัก 500 บาท (แจ้งเตือนเฉยๆ แต่ไม่ต้องลดยอดจัด) • ต่ำกว่า 70% ไม่รับ',
  'รับเครื่องนอก/เครื่องหิ้วทุกโมเดล • รับบัตรเครดิตผ่าน iCloud • ปิดยอดจ่ายร้าน • อายุ 18 ปีขึ้นไป',
  'ลูกค้ามีเครื่องใช้งานต่อ ไม่ต้องฝากเครื่อง • รับ iOS ล่าสุด • ปิดก่อนกำหนดได้ตลอดสัญญา',
  'เครื่องนอก: ยอดจัด <10,000 ลด ~1,000 | 10,000-20,000 ลด ~2,000 | 20,000+ ลด ~3,000 แล้วเทียบหายอดจัดที่ใกล้เคียงที่สุดในตาราง',
  'เครื่องรีเฟอร์บิช (Refurbished): จัดยอดลดลง 50% แล้วเทียบหายอดจัดที่ใกล้เคียงที่สุดในตาราง',
  'งานซ่อม: หักเปลี่ยนจอ / เปลี่ยนกล้อง ➡️ ไปจัดยอดที่ลดลงมาใกล้กับยอดจัดเดิมที่สุดในตาราง | เปลี่ยนบอร์ด / บอร์ดจิก ❌ ไม่รับทำรายการ',
  'ส่วนลดปิดยอดก่อนกำหนด: ปิดในงวดที่ 1 ลด 20% ของยอดคงเหลือ | ปิดในงวดที่ 2 ลด 15% | ปิดในงวดที่ 3 เป็นต้นไป ลด 10% (ยกเว้นเลือกผ่อน 1 งวด ชำระตามยอดสัญญา ไม่มีส่วนลด)',
  'เงื่อนไขการชำระเงิน: ชำระล่าช้า มีค่าดำเนินการวันละ 50 บาท | ค้างชำระ 1 วันขึ้นไป: แจ้งเตือนพร้อมภาพหน้าจอ | ค้างชำระเกิน 7 วัน: เครื่องจะถูกจำกัดการใช้งาน โดยสามารถใช้ได้เฉพาะ LINE และแอปธนาคาร',
  'กฎเหล็ก THAIPLUS: ยึดราคาและค่างวดในตารางเท่านั้น ไม่คิดยอดใหม่นอกตาราง',
];

export const REFINANCE_RATES: RefinanceModelRate[] = [
  // iPhone 13
  {
    id: 'ip-13',
    series: 'iPhone 13',
    model: 'iPhone 13',
    loanAmount: 5500,
    plans: { term1: 6710, term6: 1742, term9: 1381, term12: 1173 },
  },
  {
    id: 'ip-13-pro',
    series: 'iPhone 13',
    model: 'iPhone 13 Pro',
    loanAmount: 8000,
    plans: { term1: 9760, term6: 2533, term9: 2009, term12: 1707 },
  },
  {
    id: 'ip-13-pm',
    series: 'iPhone 13',
    model: 'iPhone 13 Pro Max',
    loanAmount: 9000,
    plans: { term1: 10980, term6: 2850, term9: 2260, term12: 1920 },
  },

  // iPhone 14
  {
    id: 'ip-14',
    series: 'iPhone 14',
    model: 'iPhone 14',
    loanAmount: 6500,
    plans: { term1: 7930, term6: 2058, term9: 1632, term12: 1387 },
  },
  {
    id: 'ip-14-plus',
    series: 'iPhone 14',
    model: 'iPhone 14 Plus',
    loanAmount: 8500,
    plans: { term1: 10370, term6: 2692, term9: 2134, term12: 1813 },
  },
  {
    id: 'ip-14-pro',
    series: 'iPhone 14',
    model: 'iPhone 14 Pro',
    loanAmount: 10000,
    plans: { term1: 12200, term6: 3167, term9: 2511, term12: 2133 },
  },
  {
    id: 'ip-14-pm',
    series: 'iPhone 14',
    model: 'iPhone 14 Pro Max',
    loanAmount: 12000,
    plans: { term1: 14640, term6: 3800, term9: 3013, term12: 2560 },
  },

  // iPhone 15
  {
    id: 'ip-15',
    series: 'iPhone 15',
    model: 'iPhone 15',
    loanAmount: 9000,
    plans: { term1: 10980, term6: 2850, term9: 2260, term12: 1920 },
  },
  {
    id: 'ip-15-plus',
    series: 'iPhone 15',
    model: 'iPhone 15 Plus',
    loanAmount: 12000,
    plans: { term1: 14640, term6: 3800, term9: 3013, term12: 2560 },
  },
  {
    id: 'ip-15-pro',
    series: 'iPhone 15',
    model: 'iPhone 15 Pro',
    loanAmount: 13000,
    plans: { term1: 15860, term6: 4117, term9: 3264, term12: 2773 },
  },
  {
    id: 'ip-15-pm',
    series: 'iPhone 15',
    model: 'iPhone 15 Pro Max',
    loanAmount: 16000,
    plans: { term1: 19520, term6: 5067, term9: 4018, term12: 3413 },
  },

  // iPhone 16
  {
    id: 'ip-16e',
    series: 'iPhone 16',
    model: 'iPhone 16e',
    loanAmount: 9500,
    plans: { term1: 11590, term6: 3008, term9: 2386, term12: 2027 },
  },
  {
    id: 'ip-16',
    series: 'iPhone 16',
    model: 'iPhone 16',
    loanAmount: 13000,
    plans: { term1: 15860, term6: 4117, term9: 3264, term12: 2773 },
  },
  {
    id: 'ip-16-plus',
    series: 'iPhone 16',
    model: 'iPhone 16 Plus',
    loanAmount: 14000,
    plans: { term1: 17080, term6: 4433, term9: 3516, term12: 2987 },
  },
  {
    id: 'ip-16-pro',
    series: 'iPhone 16',
    model: 'iPhone 16 Pro',
    loanAmount: 16000,
    plans: { term1: 19520, term6: 5067, term9: 4018, term12: 3413 },
  },
  {
    id: 'ip-16-pm',
    series: 'iPhone 16',
    model: 'iPhone 16 Pro Max',
    loanAmount: 20000,
    plans: { term1: 24400, term6: 6333, term9: 5022, term12: 4267, term15: 3733 },
  },

  // iPhone 17
  {
    id: 'ip-17e',
    series: 'iPhone 17',
    model: 'iPhone 17e',
    loanAmount: 11500,
    plans: { term1: 14030, term6: 3642, term9: 2888, term12: 2453 },
  },
  {
    id: 'ip-17',
    series: 'iPhone 17',
    model: 'iPhone 17',
    loanAmount: 16000,
    plans: { term1: 19520, term6: 5067, term9: 4018, term12: 3413 },
  },
  {
    id: 'ip-17-air',
    series: 'iPhone 17',
    model: 'iPhone 17 Air',
    loanAmount: 18000,
    plans: { term1: 21960, term6: 5700, term9: 4520, term12: 3840, term15: 3360 },
  },
  {
    id: 'ip-17-pro',
    series: 'iPhone 17',
    model: 'iPhone 17 Pro',
    loanAmount: 23000,
    plans: { term1: 28060, term6: 7283, term9: 5776, term12: 4907, term15: 4293 },
  },
  {
    id: 'ip-17-pm',
    series: 'iPhone 17',
    model: 'iPhone 17 Pro Max',
    loanAmount: 26500,
    plans: { term1: 32330, term6: 8392, term9: 6654, term12: 5653, term15: 4947 },
  },

  // iPhone 18 (ต้องมีกล่อง + ใบเสร็จ)
  {
    id: 'ip-18',
    series: 'iPhone 18',
    seriesLabel: 'iPhone 18 (ต้องมีกล่อง + ใบเสร็จ)',
    model: 'iPhone 18',
    isNew: true,
    requiresBoxAndReceipt: true,
    loanAmount: 18000,
    plans: { term1: 21960, term6: 5700, term9: 4520, term12: 3840, term15: 3360 },
    notes: 'ต้องมีกล่อง + ใบเสร็จ',
  },
  {
    id: 'ip-18-air',
    series: 'iPhone 18',
    seriesLabel: 'iPhone 18 (ต้องมีกล่อง + ใบเสร็จ)',
    model: 'iPhone 18 Air',
    isNew: true,
    requiresBoxAndReceipt: true,
    loanAmount: 20500,
    plans: { term1: 25010, term6: 6492, term9: 5148, term12: 4373, term15: 3827 },
    notes: 'ต้องมีกล่อง + ใบเสร็จ',
  },
  {
    id: 'ip-18-pro',
    series: 'iPhone 18',
    seriesLabel: 'iPhone 18 (ต้องมีกล่อง + ใบเสร็จ)',
    model: 'iPhone 18 Pro',
    isNew: true,
    requiresBoxAndReceipt: true,
    loanAmount: 26000,
    plans: { term1: 31720, term6: 8233, term9: 6529, term12: 5547, term15: 4853 },
    notes: 'ต้องมีกล่อง + ใบเสร็จ',
  },
  {
    id: 'ip-18-pm-256',
    series: 'iPhone 18',
    seriesLabel: 'iPhone 18 (ต้องมีกล่อง + ใบเสร็จ)',
    model: 'iPhone 18 Pro Max 256GB',
    isNew: true,
    requiresBoxAndReceipt: true,
    loanAmount: 30000,
    plans: { term1: 36600, term6: 9500, term9: 7533, term12: 6400, term15: 5600 },
    notes: 'ต้องมีกล่อง + ใบเสร็จ',
  },
  {
    id: 'ip-18-pm-512',
    series: 'iPhone 18',
    seriesLabel: 'iPhone 18 (ต้องมีกล่อง + ใบเสร็จ)',
    model: 'iPhone 18 Pro Max 512GB',
    isNew: true,
    requiresBoxAndReceipt: true,
    loanAmount: 33000,
    plans: { term1: 40260, term6: 10450, term9: 8287, term12: 7040, term15: 6160 },
    notes: 'ต้องมีกล่อง + ใบเสร็จ',
  },
  {
    id: 'ip-18-pm-1tb',
    series: 'iPhone 18',
    seriesLabel: 'iPhone 18 (ต้องมีกล่อง + ใบเสร็จ)',
    model: 'iPhone 18 Pro Max 1TB',
    isNew: true,
    requiresBoxAndReceipt: true,
    loanAmount: 35000,
    plans: { term1: 42700, term6: 11083, term9: 8789, term12: 7467, term15: 6533 },
    notes: 'ต้องมีกล่อง + ใบเสร็จ',
  },
  {
    id: 'ip-18-pm-2tb',
    series: 'iPhone 18',
    seriesLabel: 'iPhone 18 (ต้องมีกล่อง + ใบเสร็จ)',
    model: 'iPhone 18 Pro Max 2TB',
    isNew: true,
    requiresBoxAndReceipt: true,
    loanAmount: 40000,
    plans: { term1: 48800, term6: 12667, term9: 10044, term12: 8533, term15: 7467 },
    notes: 'ต้องมีกล่อง + ใบเสร็จ',
  },
];

// Unique sorted loan amounts in the table (v4.0):
// [5500, 6500, 8000, 8500, 9000, 9500, 10000, 11500, 12000, 13000, 14000, 16000, 18000, 20000, 20500, 23000, 26000, 26500, 30000, 33000, 35000, 40000]
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

  const targetAmount = Math.max(5500, currentLoan - nominalReduction);
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
  const targetAmount = Math.max(5500, Math.round(baseLoanAmount * 0.5));
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

  // Map legacy "iPhone 18 Pro Max" without storage to 256GB
  if (normalized === 'iphone 18 pro max') {
    return REFINANCE_RATES.find(r => r.id === 'ip-18-pm-256');
  }

  // Legacy "iPhone 17 Pro Max 2TB" -> iPhone 17 Pro Max
  if (normalized.includes('17 pro max')) {
    return REFINANCE_RATES.find(r => r.id === 'ip-17-pm');
  }

  // Sort from longest model name to shortest to avoid partial matches
  const sortedByLength = [...REFINANCE_RATES].sort((a, b) => b.model.length - a.model.length);
  return sortedByLength.find(r => normalized.includes(r.model.toLowerCase()) || r.model.toLowerCase().includes(normalized));
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
 * - ยกเว้นเลือกผ่อน 1 งวด (selectedTerm === 1) ไม่ต้องมีส่วนลด (0% ชำระตามสัญญา)
 * - สัญญาระยะอื่นๆ เมื่อปิดก่อนกำหนด:
 *   - ปิดในงวดที่ 1 ลด 20% ของยอดคงเหลือ
 *   - ปิดในงวดที่ 2 ลด 15% ของยอดคงเหลือ
 *   - ปิดในงวดที่ 3 เป็นต้นไป ลด 10% ของยอดคงเหลือ
 * - จ่ายเกินกำหนด: วันละ 50 บาท (นับจากวันแรก)
 * - ล่าช้าเกิน 16 วัน: บวกค่าปลดล็อกเพิ่ม 500 บาท
 */
export interface EarlyPayoffCalculation {
  selectedTerm: 1 | 6 | 9 | 12 | 15;
  monthlyAmount: number;
  totalContractAmount: number;
  closingAtInstallment: number; // งวดที่ปิด (เช่น งวดที่ 1, 2, 3...)
  paidInstallments: number; // จำนวนงวดที่จ่ายไปแล้วก่อนปิด (ปกติ closingAtInstallment - 1)
  remainingInstallments: number; // จำนวนงวดคงเหลือที่จะปิด
  remainingBalance: number; // ยอดคงเหลือก่อนหักส่วนลด (remainingInstallments * monthlyAmount)
  discountRatePercent: number; // 0%, 20%, 15%, หรือ 10%
  discountAmount: number; // จำนวนเงินส่วนลดที่ได้
  lateDays: number; // จำนวนวันที่ล่าช้า
  lateFee: number; // ค่าล่าช้า (50 บ./วัน)
  unlockFee: number; // ค่าปลดล็อก 500 บาท (ถ้าเกิน 16 วัน)
  totalLateCharges: number; // ค่าล่าช้ารวมปลดล็อก
  netPayoffAmount: number; // ยอดปิดบัญชีสุทธิ (ยอดคงเหลือ - ส่วนลด + ค่าล่าช้า + ค่าปลดล็อก)
}

export function calculateEarlyPayoffDiscount(
  selectedTerm: 1 | 6 | 9 | 12 | 15,
  monthlyAmount: number,
  closingAtInstallment: number = 1,
  lateDays: number = 0
): EarlyPayoffCalculation {
  const totalContractAmount = monthlyAmount * selectedTerm;
  const safeClosingAt = Math.max(1, Math.min(selectedTerm, closingAtInstallment));
  const paidInstallments = safeClosingAt - 1;
  const remainingInstallments = selectedTerm - paidInstallments;
  const remainingBalance = remainingInstallments * monthlyAmount;

  let discountRatePercent = 0;
  if (selectedTerm === 1) {
    discountRatePercent = 0;
  } else if (safeClosingAt === 1) {
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
