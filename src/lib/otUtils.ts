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
import { OvertimeType } from '../types';

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
