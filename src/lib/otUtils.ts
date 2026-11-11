import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay, addMonths, subMonths } from 'date-fns';
import { th } from 'date-fns/locale';

/**
 * คำนวณรอบการตัดยอด OT:
 * ตัดรอบคำนวณ OT ทุกวันที่ 25 ของเดือน
 * (นับตั้งแต่วันที่ 26 ของเดือนก่อนหน้า ถึง 25 ของเดือนปัจจุบัน)
 * 
 * ตัวอย่าง:
 * รอบ "2026-09" (รอบตัดยอด 25 ก.ย. 2026) คือ วันที่ 26 ส.ค. 2026 ถึง 25 ก.ย. 2026
 * วันที่ 26 ก.ย. 2026 เป็นต้นไป จะเข้าสู่งวดถัดไปคือรอบ "2026-10" (26 ก.ย. - 25 ต.ค.)
 */

export interface OTCycleInfo {
  cycleKey: string;          // e.g. "2026-09"
  cycleLabel: string;        // e.g. "รอบ 25 ก.ย. 2569"
  periodLabel: string;       // e.g. "26 ส.ค. 2569 - 25 ก.ย. 2569"
  startDate: string;         // "2026-08-26"
  endDate: string;           // "2026-09-25"
  cutoffDay: number;         // 25
}

/**
 * ระบุว่าวันที่ YYYY-MM-DD อยู่ในรอบบิล (CycleKey) ใด
 */
export function getOTCycleFromDate(dateStr: string): OTCycleInfo {
  // dateStr format: YYYY-MM-DD
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10); // 1-12
  const day = parseInt(parts[2], 10);

  let targetYear = year;
  let targetMonth = month;

  if (day > 25) {
    // ถ้าเกินวันที่ 25 ให้ปัดไปเป็นรอบของเดือนถัดไป
    if (month === 12) {
      targetYear = year + 1;
      targetMonth = 1;
    } else {
      targetMonth = month + 1;
    }
  }

  return getOTCycleInfo(targetYear, targetMonth);
}

/**
 * สร้างข้อมูลรอบบิลจากปีและเดือนรอบตัดยอด (targetYear, targetMonth)
 */
export function getOTCycleInfo(targetYear: number, targetMonth: number): OTCycleInfo {
  // เดือนก่อนหน้า
  let prevYear = targetYear;
  let prevMonth = targetMonth - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = targetYear - 1;
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const cycleKey = `${targetYear}-${pad(targetMonth)}`;
  
  const startDateStr = `${prevYear}-${pad(prevMonth)}-26`;
  const endDateStr = `${targetYear}-${pad(targetMonth)}-25`;

  // ภาษาไทย พ.ศ.
  const targetDateObj = new Date(targetYear, targetMonth - 1, 25);
  const prevDateObj = new Date(prevYear, prevMonth - 1, 26);

  const cycleLabel = `รอบตัดยอด 25 ${format(targetDateObj, 'MMMM yyyy', { locale: th })}`;
  const periodLabel = `${format(prevDateObj, 'd MMM yyyy', { locale: th })} - ${format(targetDateObj, 'd MMM yyyy', { locale: th })}`;

  return {
    cycleKey,
    cycleLabel,
    periodLabel,
    startDate: startDateStr,
    endDate: endDateStr,
    cutoffDay: 25,
  };
}

/**
 * สร้างรายการรอบบิลย้อนหลังและล่วงหน้าสำหรับ Dropdown Selector
 */
export function getAvailableOTCycles(currentDate = new Date()): OTCycleInfo[] {
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  const currentDay = currentDate.getDate();

  // รอบปัจจุบัน
  let baseYear = currentYear;
  let baseMonth = currentMonth;
  if (currentDay > 25) {
    if (baseMonth === 12) {
      baseYear += 1;
      baseMonth = 1;
    } else {
      baseMonth += 1;
    }
  }

  const list: OTCycleInfo[] = [];

  // ล่วงหน้า 1 รอบ
  let nextYear = baseYear;
  let nextMonth = baseMonth + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  list.push(getOTCycleInfo(nextYear, nextMonth));

  // รอบปัจจุบัน
  list.push(getOTCycleInfo(baseYear, baseMonth));

  // ย้อนหลัง 6 รอบ
  let currY = baseYear;
  let currM = baseMonth;
  for (let i = 0; i < 6; i++) {
    currM -= 1;
    if (currM === 0) {
      currM = 12;
      currY -= 1;
    }
    list.push(getOTCycleInfo(currY, currM));
  }

  return list;
}

/**
 * คำนวณชั่วโมงระหว่างเวลาเริ่มและเวลาสิ้นสุด เช่น "17:30" ถึง "20:30" => 3 ชม.
 * รองรับการข้ามเที่ยงคืน เช่น "22:00" ถึง "02:00" => 4 ชม.
 */
export function calculateHoursBetween(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

  let totalStartMinutes = startH * 60 + startM;
  let totalEndMinutes = endH * 60 + endM;

  if (totalEndMinutes < totalStartMinutes) {
    // ข้ามเที่ยงคืน
    totalEndMinutes += 24 * 60;
  }

  const diffMinutes = totalEndMinutes - totalStartMinutes;
  const hours = diffMinutes / 60;
  // ปัดทศนิยม 2 ตำแหน่ง
  return Math.round(hours * 100) / 100;
}

/**
 * โครงสร้างและค่าคงที่สำหรับประเภท OT (3 สี)
 * - holiday_in_hours: OT วันหยุด ในเวลางาน = สีแดง
 * - holiday_after_hours: OT วันหยุด หลังเวลางาน = สีเขียว
 * - workday: OT วันทำงานปกติ = สีฟ้า
 * - คำขอเดิมที่ไม่มีประเภท = "ไม่ระบุ" สีเทา
 */
import { OvertimeType, ShiftTemplate, EmployeeShiftPref } from '../types';

export interface OTTypeConfig {
  key: OvertimeType;
  label: string;
  shortLabel: string;
  description: string;
  colorName: 'red' | 'green' | 'blue';
  badgeClass: string;
  dotClass: string;
  textClass: string;
  buttonBorderClass: string;
  buttonSelectedClass: string;
}

export const OT_TYPE_CONFIG: Record<OvertimeType, OTTypeConfig> = {
  holiday_in_hours: {
    key: 'holiday_in_hours',
    label: 'OT วันหยุด ในเวลางาน',
    shortLabel: 'วันหยุด ในเวลา',
    description: 'ทำในวันหยุด ช่วงเวลาทำการปกติ (เช่น 09:00 - 18:00 น.)',
    colorName: 'red',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-600 dark:text-rose-400',
    buttonBorderClass: 'border-slate-200 dark:border-slate-700 hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/30',
    buttonSelectedClass: 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 ring-2 ring-rose-500/30 text-rose-900 dark:text-rose-100 font-bold',
  },
  holiday_after_hours: {
    key: 'holiday_after_hours',
    label: 'OT วันหยุด หลังเวลางาน',
    shortLabel: 'วันหยุด หลังเวลา',
    description: 'ทำในวันหยุด ช่วงนอกเวลาทำการ (เช่น หลัง 18:00 น. หรือช่วงค่ำ/ดึก)',
    colorName: 'green',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    buttonBorderClass: 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30',
    buttonSelectedClass: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 ring-2 ring-emerald-500/30 text-emerald-900 dark:text-emerald-100 font-bold',
  },
  workday: {
    key: 'workday',
    label: 'OT วันทำงานปกติ',
    shortLabel: 'วันทำงานปกติ',
    description: 'ทำในวันทำงานปกติ หลังเวลาเลิกงาน (เช่น หลัง 18:00 น.)',
    colorName: 'blue',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800',
    dotClass: 'bg-sky-500',
    textClass: 'text-sky-600 dark:text-sky-400',
    buttonBorderClass: 'border-slate-200 dark:border-slate-700 hover:border-sky-400 hover:bg-sky-50/50 dark:hover:bg-sky-950/30',
    buttonSelectedClass: 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 ring-2 ring-sky-500/30 text-sky-900 dark:text-sky-100 font-bold',
  },
};

export const UNKNOWN_OT_TYPE_CONFIG = {
  key: undefined,
  label: 'ไม่ระบุ',
  shortLabel: 'ไม่ระบุ',
  description: 'คำขอเดิมที่ยังไม่ได้ระบุประเภท OT',
  colorName: 'gray' as const,
  badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  dotClass: 'bg-slate-400',
  textClass: 'text-slate-500 dark:text-slate-400',
  buttonBorderClass: 'border-slate-200',
  buttonSelectedClass: '',
};

export function getOTTypeInfo(otType?: string): OTTypeConfig | typeof UNKNOWN_OT_TYPE_CONFIG {
  if (otType && otType in OT_TYPE_CONFIG) {
    return OT_TYPE_CONFIG[otType as OvertimeType];
  }
  return UNKNOWN_OT_TYPE_CONFIG;
}

/**
 * ฟังก์ชันดาวน์โหลดเป็นไฟล์ Excel CSV (.csv ที่เปิดใน Excel ภาษาไทยได้ 100% ด้วย UTF-8 BOM)
 * รองรับคอลัมน์ประเภท OT (3 สี) และสรุปยอดแยกตามประเภทท้ายไฟล์
 */
export function exportOTToExcelCsv(
  requests: any[],
  cycleInfo: OTCycleInfo,
  titlePrefix = 'สรุปยอด_OT'
) {
  const headers = [
    'ลำดับ',
    'วันที่ทำงาน OT',
    'ประเภท OT',
    'รหัสพนักงาน',
    'ชื่อพนักงาน',
    'เวลาเริ่ม',
    'เวลาสิ้นสุด',
    'จำนวนชั่วโมง',
    'เหตุผลการทำ OT',
    'สถานะคำขอ',
    'ผู้อนุมัติ',
    'วันที่อนุมัติ',
    'รอบบิลตัดยอด'
  ];

  let totalHolidayInHours = 0;
  let totalHolidayAfterHours = 0;
  let totalWorkday = 0;
  let totalUnspecified = 0;
  let grandTotalHours = 0;

  const rows = requests.map((req, idx) => {
    const statusText = req.status === 'approved' ? 'อนุมัติแล้ว' : req.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ';
    const approvedDate = req.reviewedAt ? format(new Date(req.reviewedAt), 'dd/MM/yyyy HH:mm') : '-';
    const typeInfo = getOTTypeInfo(req.otType);
    const h = Number(req.hours) || 0;

    if (req.status === 'approved') {
      grandTotalHours += h;
      if (req.otType === 'holiday_in_hours') {
        totalHolidayInHours += h;
      } else if (req.otType === 'holiday_after_hours') {
        totalHolidayAfterHours += h;
      } else if (req.otType === 'workday') {
        totalWorkday += h;
      } else {
        totalUnspecified += h;
      }
    }

    return [
      idx + 1,
      req.date,
      `"${typeInfo.label}"`,
      req.employeeUsername ? `@${req.employeeUsername}` : req.employeeId,
      `"${(req.employeeName || '').replace(/"/g, '""')}"`,
      req.startTime,
      req.endTime,
      req.hours,
      `"${(req.reason || '').replace(/"/g, '""')}"`,
      statusText,
      `"${(req.approvedBy || '-').replace(/"/g, '""')}"`,
      approvedDate,
      `"${cycleInfo.periodLabel}"`
    ];
  });

  // ท้ายไฟล์เพิ่มแถวสรุปชั่วโมงแยกตามประเภท
  const summaryRows = [
    [],
    ['--- สรุปชั่วโมง OT ที่อนุมัติแล้ว แยกตามประเภท ---'],
    ['ประเภท OT', 'จำนวนชั่วโมง (ชม.)'],
    ['OT วันหยุด ในเวลางาน (สีแดง)', (Math.round(totalHolidayInHours * 100) / 100).toFixed(2)],
    ['OT วันหยุด หลังเวลางาน (สีเขียว)', (Math.round(totalHolidayAfterHours * 100) / 100).toFixed(2)],
    ['OT วันทำงานปกติ (สีฟ้า)', (Math.round(totalWorkday * 100) / 100).toFixed(2)],
  ];

  if (totalUnspecified > 0) {
    summaryRows.push(['ไม่ระบุประเภท (สีเทา)', (Math.round(totalUnspecified * 100) / 100).toFixed(2)]);
  }
  summaryRows.push(['รวมชั่วโมง OT ทั้งหมด', (Math.round(grandTotalHours * 100) / 100).toFixed(2)]);

  // UTF-8 BOM for Thai Excel compatibility
  const BOM = '\uFEFF';
  const csvContent = BOM + [
    headers.join(','),
    ...rows.map(e => e.join(',')),
    ...summaryRows.map(e => e.join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${titlePrefix}_${cycleInfo.cycleKey}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * ผลลัพธ์การแนะนำประเภท OT อัตโนมัติจากตารางกะ
 */
export interface OTSuggestionResult {
  suggestedType: OvertimeType | null;
  reason: string;
  isSpanning?: boolean;
}

/**
 * วิเคราะห์ประเภท OT อัตโนมัติจากตารางกะของพนักงาน
 * 
 * กฎการเลือก:
 * 1. ตารางวันนั้นเป็น "off" หรือ "holiday" = วันหยุด
 *    - เทียบเวลา OT กับเวลาของกะประจำ (defaultShiftId ใน shift_prefs)
 *    - OT อยู่ในช่วงเวลากะทั้งหมด = holiday_in_hours (แดง)
 *    - OT อยู่นอกช่วงเวลากะทั้งหมด = holiday_after_hours (เขียว)
 *    - OT คร่อมทั้งในและนอกเวลากะ = ไม่เลือกให้ (null) และขึ้นข้อความแนะนำให้แยกเป็น 2 คำขอ พร้อมบอกช่วงเวลาที่ควรแยก
 *    - ถ้าไม่มีกะประจำ = ไม่เลือกให้ (null)
 * 2. ตารางวันนั้นเป็นรหัสกะ (มีกะทำงาน) = workday (ฟ้า)
 * 3. ตารางวันนั้นเป็น "leave" หรือยังไม่มีตาราง = ไม่เลือกให้ (null) ให้พนักงานเลือกเอง
 * 
 * รองรับกะที่ข้ามเที่ยงคืน (เช่น 17:00 ถึง 02:00 หรือ 22:00 ถึง 07:00) และ OT ที่ข้ามเที่ยงคืน
 */
export function determineSuggestedOTType(params: {
  date: string;
  startTime: string;
  endTime: string;
  employeeId: string;
  shiftPrefs: Record<string, EmployeeShiftPref>;
  scheduleDays: Record<string, Record<string, string>>;
  shiftTemplates: ShiftTemplate[];
}): OTSuggestionResult {
  const { date, startTime, endTime, employeeId, shiftPrefs, scheduleDays, shiftTemplates } = params;

  if (!date || !startTime || !endTime) {
    return { suggestedType: null, reason: '' };
  }

  // แปลงวันที่เป็นภาษาไทยแบบสั้น (เช่น "7 พ.ย.")
  let thaiDate = date;
  try {
    const [y, m, d] = date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    thaiDate = format(dateObj, 'd MMM', { locale: th });
  } catch {
    thaiDate = date;
  }

  const empSchedule = scheduleDays[employeeId] || {};
  const cellVal = empSchedule[date];

  // ถ้ายังไม่มีตารางวันนั้น
  if (!cellVal) {
    return {
      suggestedType: null,
      reason: `วันที่ ${thaiDate} ยังไม่มีข้อมูลในตารางกะ กรุณาเลือกประเภท OT ด้วยตนเองค่ะ`,
    };
  }

  // ถ้าเป็น "leave" (ลางาน)
  if (cellVal === 'leave') {
    return {
      suggestedType: null,
      reason: `วันที่ ${thaiDate} คุณบันทึกลางาน กรุณาเลือกประเภท OT ด้วยตนเองค่ะ`,
    };
  }

  const templateMap = new Map<string, ShiftTemplate>();
  shiftTemplates.forEach((t) => templateMap.set(t.id, t));

  // ถ้าเป็นรหัสกะ (มีกะทำงาน) = workday (ฟ้า)
  if (cellVal !== 'off' && cellVal !== 'holiday') {
    const shift = templateMap.get(cellVal);
    const shiftText = shift
      ? `${shift.name} (${shift.startTime}-${shift.endTime} น.)`
      : `กะทำงาน [${cellVal}]`;
    return {
      suggestedType: 'workday',
      reason: `ระบบเลือกให้: วันที่ ${thaiDate} คุณมีกะทำงาน ${shiftText} (OT วันทำงานปกติ)`,
    };
  }

  // กรณี cellVal เป็น "off" หรือ "holiday" (วันหยุด)
  const dayOffLabel = cellVal === 'off' ? 'OFF' : 'วันนักขัตฤกษ์';
  const userPref = shiftPrefs[employeeId];
  const defaultShiftId = userPref?.defaultShiftId;

  if (!defaultShiftId) {
    return {
      suggestedType: null,
      reason: `วันที่ ${thaiDate} คุณหยุด (${dayOffLabel}) แต่ยังไม่ได้ตั้งค่ากะประจำ จึงไม่สามารถเลือกประเภทให้อัตโนมัติได้ กรุณาเลือกประเภท OT ด้วยตนเองค่ะ`,
    };
  }

  const defaultShift = templateMap.get(defaultShiftId);
  if (!defaultShift) {
    return {
      suggestedType: null,
      reason: `วันที่ ${thaiDate} คุณหยุด (${dayOffLabel}) แต่ไม่พบข้อมูลกะประจำในระบบ กรุณาเลือกประเภท OT ด้วยตนเองค่ะ`,
    };
  }

  // ฟังก์ชันแปลง "HH:mm" เป็นจำนวนนาทีจาก 00:00 (0 - 1439)
  const toMinutes = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    return h * 60 + m;
  };

  const sStart = toMinutes(defaultShift.startTime);
  const sEnd = toMinutes(defaultShift.endTime);

  const otStart = toMinutes(startTime);
  const otEnd = toMinutes(endTime);

  // คำนวณระยะเวลา OT ทั้งหมด (นาที) รองรับการข้ามเที่ยงคืน
  const otDuration = otEnd < otStart ? (otEnd + 1440 - otStart) : (otEnd - otStart);
  if (otDuration <= 0) {
    return { suggestedType: null, reason: '' };
  }

  // ตรวจสอบว่านาที m (0..1439) อยู่ในกะหรือไม่
  const isInsideShift = (m: number): boolean => {
    if (sEnd > sStart) {
      return m >= sStart && m < sEnd;
    } else {
      // กะข้ามเที่ยงคืน (เช่น 17:00 ถึง 02:00 หรือ 22:00 ถึง 07:00)
      return m >= sStart || m < sEnd;
    }
  };

  let inMinutes = 0;
  let outMinutes = 0;

  for (let k = 0; k < otDuration; k++) {
    const m = (otStart + k) % 1440;
    if (isInsideShift(m)) {
      inMinutes++;
    } else {
      outMinutes++;
    }
  }

  const shiftLabel = `${defaultShift.name} (${defaultShift.startTime}-${defaultShift.endTime})`;

  // 1. OT อยู่ในช่วงเวลากะทั้งหมด = holiday_in_hours (แดง)
  if (outMinutes === 0 && inMinutes > 0) {
    return {
      suggestedType: 'holiday_in_hours',
      reason: `ระบบเลือกให้: วันที่ ${thaiDate} คุณหยุด (${dayOffLabel}) และ OT ${startTime}-${endTime} อยู่ในเวลากะ ${shiftLabel}`,
    };
  }

  // 2. OT อยู่นอกช่วงเวลากะทั้งหมด = holiday_after_hours (เขียว)
  if (inMinutes === 0 && outMinutes > 0) {
    return {
      suggestedType: 'holiday_after_hours',
      reason: `ระบบเลือกให้: วันที่ ${thaiDate} คุณหยุด (${dayOffLabel}) และ OT ${startTime}-${endTime} อยู่นอกเวลากะ ${shiftLabel}`,
    };
  }

  // 3. OT คร่อมทั้งในและนอกเวลากะ = ไม่เลือกให้ และขึ้นข้อความแนะนำให้แยกเป็น 2 คำขอ พร้อมบอกช่วงเวลาที่ควรแยก
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatMins = (mins: number) => {
    const norm = ((mins % 1440) + 1440) % 1440;
    return `${pad(Math.floor(norm / 60))}:${pad(norm % 60)}`;
  };

  interface Segment {
    inside: boolean;
    startK: number;
    endK: number;
  }
  const segments: Segment[] = [];
  let curInside = isInsideShift((otStart + 0) % 1440);
  let curStart = 0;

  for (let k = 1; k < otDuration; k++) {
    const inside = isInsideShift((otStart + k) % 1440);
    if (inside !== curInside) {
      segments.push({ inside: curInside, startK: curStart, endK: k });
      curInside = inside;
      curStart = k;
    }
  }
  segments.push({ inside: curInside, startK: curStart, endK: otDuration });

  const insideRanges = segments
    .filter((s) => s.inside)
    .map((s) => `${formatMins(otStart + s.startK)}-${formatMins(otStart + s.endK)}`)
    .join(', ');

  const outsideRanges = segments
    .filter((s) => !s.inside)
    .map((s) => `${formatMins(otStart + s.startK)}-${formatMins(otStart + s.endK)}`)
    .join(', ');

  const adviceText = `คำแนะนำ: OT ช่วงเวลา ${startTime}-${endTime} น. คร่อมทั้งในและนอกเวลากะ ${shiftLabel} แนะนำให้แยกเป็น 2 คำขอ: ในเวลากะ ${insideRanges} น. (OT วันหยุด ในเวลางาน) และนอกเวลากะ ${outsideRanges} น. (OT วันหยุด หลังเวลางาน)`;

  return {
    suggestedType: null,
    reason: adviceText,
    isSpanning: true,
  };
}

