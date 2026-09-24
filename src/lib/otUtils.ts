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
 * ฟังก์ชันดาวน์โหลดเป็นไฟล์ Excel CSV (.csv ที่เปิดใน Excel ภาษาไทยได้ 100% ด้วย UTF-8 BOM)
 */
export function exportOTToExcelCsv(
  requests: any[],
  cycleInfo: OTCycleInfo,
  titlePrefix = 'สรุปยอด_OT'
) {
  const headers = [
    'ลำดับ',
    'วันที่ทำงาน OT',
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

  const rows = requests.map((req, idx) => {
    const statusText = req.status === 'approved' ? 'อนุมัติแล้ว' : req.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ';
    const approvedDate = req.reviewedAt ? format(new Date(req.reviewedAt), 'dd/MM/yyyy HH:mm') : '-';
    
    return [
      idx + 1,
      req.date,
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

  // UTF-8 BOM for Thai Excel compatibility
  const BOM = '\uFEFF';
  const csvContent = BOM + [
    headers.join(','),
    ...rows.map(e => e.join(','))
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
