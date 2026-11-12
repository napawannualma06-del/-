import React from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PayrollSlip, PayrollSlipItem } from '../types';

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/**
 * แปลงวันที่ YYYY-MM-DD เป็นรูปแบบไทย พ.ศ. เช่น "25 พ.ย. 2569"
 */
export function formatDateThaiBuddhist(dateStr?: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.trim().split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return dateStr;
  }
  const [yearAD, month, day] = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return dateStr;
  }
  const yearBE = yearAD + 543;
  const dayStr = String(day).padStart(2, '0');
  return `${dayStr} ${THAI_SHORT_MONTHS[month - 1]} ${yearBE}`;
}

/**
 * แปลง cycleKey (เช่น "2026-11") เป็นช่วงรอบเงินเดือนแบบไทย พ.ศ.
 * เช่น "26 ต.ค. 2569 - 25 พ.ย. 2569"
 */
export function formatPayrollPeriodThaiBuddhist(cycleKey: string): string {
  const parts = (cycleKey || '').split('-').map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    return cycleKey || '-';
  }
  const [targetYear, targetMonth] = parts;
  let prevYear = targetYear;
  let prevMonth = targetMonth - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = targetYear - 1;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const startStr = `${prevYear}-${pad(prevMonth)}-26`;
  const endStr = `${targetYear}-${pad(targetMonth)}-25`;

  return `${formatDateThaiBuddhist(startStr)} - ${formatDateThaiBuddhist(endStr)}`;
}

/**
 * แปลงตัวเลขเป็นทศนิยม 2 ตำแหน่งพร้อมลูกน้ำ เช่น 37,000.00 หรือ 0.00
 */
export function formatSlipAmount(value: number | undefined | null): string {
  const num = Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getEnglishSubtitleForItem(item: PayrollSlipItem): string {
  if (item.nameEn && item.nameEn.trim()) {
    return item.nameEn.trim();
  }
  const name = (item.name || '').trim();
  if (name.includes('ค่าคอม')) return 'Commission';
  if (name.includes('โบนัส')) return 'Bonus';
  if (name.includes('เบี้ยเลี้ยง') || name.includes('ค่าครองชีพ'))
    return 'Allowance/Cost of livings';
  if (name.includes('กยศ') || name.includes('กรอ')) return 'Student Loan Fund';
  if (name.includes('ขาด') || name.includes('ลา') || name.includes('สาย'))
    return 'Absent/Leave/Late';
  if (name.includes('ประกัน')) return 'Deposit';
  if (name.includes('อื่นๆ')) return 'Others';
  return item.type === 'earning' ? 'Other Earnings' : 'Other Deductions';
}

function formatCleanNumber(val: number): string {
  const n = Number(val) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export interface PayslipYTDInfo {
  ytdEarnings: number;
  ytdTax: number;
  ytdSso: number;
}

export interface PayslipDocumentProps {
  slip: PayrollSlip;
  companyName: string;
  logoDataUrl?: string;
  employeeUsername?: string;
  ytdTotals: PayslipYTDInfo;
}

/**
 * คอมโพเนนต์เอกสารสลิปเงินเดือนสองภาษา (ไทย/อังกฤษ) ตามรูปแบบมาตรฐาน
 * ใช้ข้อมูลจากเอกสารใน payroll_slips เท่านั้น (รวม snapshot ชื่อ ตำแหน่ง ธนาคาร เลขบัญชี)
 */
export const PayslipDocument = React.forwardRef<HTMLDivElement, PayslipDocumentProps>(
  ({ slip, companyName, logoDataUrl, employeeUsername, ytdTotals }, ref) => {
    const isDraft = slip.status === 'draft';

    const displayFullName =
      slip.snapshot?.fullName || slip.employeeName || slip.employeeId || '-';
    const displayCode = employeeUsername || slip.employeeId || '-';
    const displayPosition = slip.snapshot?.position || slip.position || '-';
    const displayAccountNumber =
      slip.snapshot?.accountNumber || slip.accountNumber || '-';

    const periodText = formatPayrollPeriodThaiBuddhist(slip.cycleKey);
    const payDateText = formatDateThaiBuddhist(slip.payDate);
    const yearAD =
      typeof slip.year === 'number' && Number.isFinite(slip.year)
        ? slip.year
        : parseInt((slip.cycleKey || '').split('-')[0], 10) || new Date().getFullYear();
    const yearBE = yearAD + 543;

    const earningItems = (slip.items || []).filter((it) => it.type === 'earning');
    const deductionItems = (slip.items || []).filter((it) => it.type === 'deduction');

    // รายการย่อยของ OT เฉพาะสีที่มีชั่วโมง > 0
    const otSubLines: Array<{ label: string; amount: number }> = [];
    if (slip.otLines) {
      if ((slip.otLines.holiday_in_hours?.hours || 0) > 0) {
        const l = slip.otLines.holiday_in_hours;
        otSubLines.push({
          label: `วันหยุด ในเวลางาน ${formatCleanNumber(l.hours)} ชม. × ${formatCleanNumber(l.multiplier)}`,
          amount: l.amount,
        });
      }
      if ((slip.otLines.holiday_after_hours?.hours || 0) > 0) {
        const l = slip.otLines.holiday_after_hours;
        otSubLines.push({
          label: `วันหยุด หลังเวลางาน ${formatCleanNumber(l.hours)} ชม. × ${formatCleanNumber(l.multiplier)}`,
          amount: l.amount,
        });
      }
      if ((slip.otLines.workday?.hours || 0) > 0) {
        const l = slip.otLines.workday;
        otSubLines.push({
          label: `วันทำงานปกติ ${formatCleanNumber(l.hours)} ชม. × ${formatCleanNumber(l.multiplier)}`,
          amount: l.amount,
        });
      }
      if ((slip.otLines.unspecified?.hours || 0) > 0) {
        const l = slip.otLines.unspecified;
        otSubLines.push({
          label: `ไม่ระบุประเภท ${formatCleanNumber(l.hours)} ชม. × ${formatCleanNumber(l.multiplier)}`,
          amount: l.amount,
        });
      }
    }

    const hasLogo = Boolean(logoDataUrl && logoDataUrl.trim());

    return (
      <div
        ref={ref}
        style={{
          width: '1122px',
          minHeight: '793px',
          backgroundColor: '#ffffff',
          color: '#111111',
          fontFamily: "'IBM Plex Sans Thai', 'Sarabun', 'Noto Sans Thai', 'Tahoma', sans-serif",
          padding: '42px 48px 36px 48px',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          letterSpacing: '0px',
          lineHeight: 1.45,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* มุมสามเหลี่ยมขวาบนตามรูปแบบเอกสาร */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: '24px',
            width: 0,
            height: 0,
            borderTop: '48px solid #8c8c8c',
            borderLeft: '48px solid transparent',
          }}
        />

        {/* ลายน้ำตัวใหญ่กรณีสถานะ "ร่าง" */}
        {isDraft && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            <div
              style={{
                transform: 'rotate(-20deg)',
                fontSize: '68px',
                fontWeight: 700,
                color: 'rgba(220, 38, 38, 0.22)',
                border: '6px solid rgba(220, 38, 38, 0.22)',
                borderRadius: '16px',
                padding: '12px 44px',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              ร่าง - ยังไม่ยืนยัน
            </div>
          </div>
        )}

        <div>
          {/* ส่วนหัวสลิป (ซ้าย / ขวา) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '26px',
            }}
          >
            {/* หัวซ้าย: ข้อมูลบริษัท, ชื่อพนักงาน(รหัส), ตำแหน่ง */}
            <div style={{ width: '54%' }}>
              {hasLogo ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    marginBottom: '16px',
                  }}
                >
                  <img
                    src={logoDataUrl}
                    alt="Company Logo"
                    style={{
                      height: '56px',
                      width: 'auto',
                      maxWidth: '180px',
                      objectFit: 'contain',
                      display: 'block',
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                    }}
                  >
                    <div
                      style={{
                        width: '110px',
                        fontWeight: 700,
                        fontSize: '16px',
                        color: '#111111',
                        flexShrink: 0,
                      }}
                    >
                      ข้อมูลบริษัท
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '19px',
                        color: '#111111',
                      }}
                    >
                      {companyName || 'Thunder Cloud'}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '135px',
                      fontWeight: 700,
                      fontSize: '16px',
                      color: '#111111',
                      flexShrink: 0,
                    }}
                  >
                    ข้อมูลบริษัท
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '19px',
                      color: '#111111',
                    }}
                  >
                    {companyName || 'Thunder Cloud'}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  marginBottom: '14px',
                }}
              >
                <div style={{ width: '135px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                    ชื่อพนักงาน(รหัส):
                  </div>
                  <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                    Emp. name (Code)
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '15px',
                    color: '#111111',
                    paddingTop: '1px',
                  }}
                >
                  {displayFullName} ({displayCode})
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ width: '135px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                    ตำแหน่ง:
                  </div>
                  <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                    Position
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '15px',
                    color: '#111111',
                    paddingTop: '1px',
                  }}
                >
                  {displayPosition}
                </div>
              </div>
            </div>

            {/* หัวขวา: สลิปเงินเดือน / Pay Slip, รอบเงินเดือน, วันที่จ่าย, เลขที่บัญชี */}
            <div style={{ width: '40%', paddingRight: '32px' }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '28px',
                  color: '#111111',
                  marginBottom: '12px',
                  lineHeight: 1.25,
                }}
              >
                สลิปเงินเดือน / Pay Slip
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  marginBottom: '10px',
                }}
              >
                <div style={{ width: '115px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                    รอบเงินเดือน:
                  </div>
                  <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                    Payroll Period
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '15px',
                    color: '#111111',
                    paddingTop: '1px',
                  }}
                >
                  {periodText}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  marginBottom: '10px',
                }}
              >
                <div style={{ width: '115px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                    วันที่จ่าย:
                  </div>
                  <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                    Payment Date
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '15px',
                    color: '#111111',
                    paddingTop: '1px',
                  }}
                >
                  {payDateText}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ width: '115px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                    เลขที่บัญชี:
                  </div>
                  <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                    Bank Account
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '15px',
                    color: '#111111',
                    paddingTop: '1px',
                  }}
                >
                  {displayAccountNumber}
                </div>
              </div>
            </div>
          </div>

          {/* ตารางหลัก 3 ช่อง (เงินได้ | รายการหัก | ปี พ.ศ.) */}
          <div
            style={{
              border: '1.5px solid #111111',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {/* แถวหัวตาราง */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                borderBottom: '1.5px solid #111111',
              }}
            >
              <div
                style={{
                  padding: '8px 14px',
                  textAlign: 'center',
                  borderRight: '1.5px solid #111111',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>เงินได้</div>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#222222' }}>Earnings</div>
              </div>

              <div
                style={{
                  padding: '8px 14px',
                  textAlign: 'center',
                  borderRight: '1.5px solid #111111',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                  รายการหัก
                </div>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#222222' }}>
                  Deductions
                </div>
              </div>

              <div
                style={{
                  padding: '8px 14px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>ปี</div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#111111' }}>{yearBE}</div>
              </div>
            </div>

            {/* เนื้อหาตาราง 3 ช่อง */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                minHeight: '340px',
              }}
            >
              {/* ช่องที่ 1: เงินได้ (Earnings) */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRight: '1.5px solid #111111',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* เงินเดือน/ค่าจ้าง */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                      เงินเดือน/ค่าจ้าง
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                      Salary/Wage
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '15px',
                      color: '#111111',
                      textAlign: 'right',
                    }}
                  >
                    {formatSlipAmount(slip.salary)}
                  </div>
                </div>

                {/* ค่าล่วงเวลา + บรรทัดย่อยแต่ละสีที่มีชั่วโมง */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                        ค่าล่วงเวลา
                      </div>
                      <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                        Overtime
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#111111',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(slip.otTotal)}
                    </div>
                  </div>

                  {otSubLines.length > 0 && (
                    <div
                      style={{
                        marginTop: '4px',
                        paddingLeft: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                      }}
                    >
                      {otSubLines.map((sub, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            fontSize: '12px',
                            color: '#333333',
                          }}
                        >
                          <span>- {sub.label}</span>
                          <span style={{ fontWeight: 500, color: '#444444' }}>
                            ({formatSlipAmount(sub.amount)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* รายการเงินได้จาก items ของสลิปนั้นทุกรายการ */}
                {earningItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                        {item.name}
                      </div>
                      <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                        {getEnglishSubtitleForItem(item)}
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#111111',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(item.amount)}
                    </div>
                  </div>
                ))}
              </div>

              {/* ช่องที่ 2: รายการหัก (Deductions) */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRight: '1.5px solid #111111',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* ประกันสังคม */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                      ประกันสังคม
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                      Social Security Fund
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '15px',
                      color: '#111111',
                      textAlign: 'right',
                    }}
                  >
                    {formatSlipAmount(slip.ssoAmount)}
                  </div>
                </div>

                {/* ภาษีหัก ณ ที่จ่าย */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                      ภาษีหัก ณ ที่จ่าย
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                      Withholding tax
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '15px',
                      color: '#111111',
                      textAlign: 'right',
                    }}
                  >
                    {formatSlipAmount(slip.withholdingTax)}
                  </div>
                </div>

                {/* เบิกล่วงหน้า */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                      เบิกล่วงหน้า
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                      Salary Advance
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '15px',
                      color: '#111111',
                      textAlign: 'right',
                    }}
                  >
                    {formatSlipAmount(slip.advanceAmount)}
                  </div>
                </div>

                {/* รายการหักจาก items ของสลิปนั้นทุกรายการ */}
                {deductionItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                        {item.name}
                      </div>
                      <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                        {getEnglishSubtitleForItem(item)}
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#111111',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(item.amount)}
                    </div>
                  </div>
                ))}
              </div>

              {/* ช่องที่ 3: ปี พ.ศ. (ยอดสะสมทั้งปี + เส้นคั่น + รวมเงินได้/รายการหักรวม/เงินได้สุทธิ) */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* ครึ่งบน: ยอดสะสมทั้งปี */}
                <div
                  style={{
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                        เงินได้สะสม
                      </div>
                      <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                        YTD Earnings
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#111111',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(ytdTotals.ytdEarnings)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                        ภาษีหัก ณ ที่จ่ายสะสม
                      </div>
                      <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                        YTD Withholding tax
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#111111',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(ytdTotals.ytdTax)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                        เงินประกันสังคมสะสม
                      </div>
                      <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                        Accumulated SSF
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#111111',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(ytdTotals.ytdSso)}
                    </div>
                  </div>
                </div>

                {/* เส้นคั่นแนวนอน */}
                <div style={{ borderTop: '1.5px solid #111111' }} />

                {/* ครึ่งล่าง: รวมเงินได้ / รายการหักรวม / เงินได้สุทธิ (ตัวหนา) */}
                <div
                  style={{
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                        รวมเงินได้
                      </div>
                      <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                        Total earnings
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#111111',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(slip.totalEarnings)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                        รายการหักรวม
                      </div>
                      <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                        Total deductions
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: '#111111',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(slip.totalDeductions)}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginTop: '4px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#000000' }}>
                        เงินได้สุทธิ
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '12px', color: '#222222' }}>
                        Net pay
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '16px',
                        color: '#000000',
                        textAlign: 'right',
                      }}
                    >
                      {formatSlipAmount(slip.netPay)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ใต้ตาราง: หมายเหตุ และ ลายมือผู้จ่ายเงิน */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginTop: '20px',
              paddingBottom: '18px',
            }}
          >
            {/* หมายเหตุ */}
            <div style={{ width: '58%', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>หมายเหตุ:</div>
                <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>Remarks</div>
              </div>
              <div
                style={{
                  fontSize: '14px',
                  color: '#111111',
                  paddingTop: '1px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {slip.remark || ''}
              </div>
            </div>

            {/* ลายมือผู้จ่ายเงิน */}
            <div
              style={{
                width: '38%',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                gap: '14px',
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#111111' }}>
                  ลายมือผู้จ่ายเงิน:
                </div>
                <div style={{ fontWeight: 400, fontSize: '12px', color: '#333333' }}>
                  Employer&apos;s Signature
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  maxWidth: '220px',
                  borderBottom: '1.2px solid #111111',
                  height: '28px',
                }}
              />
            </div>
          </div>
        </div>

        {/* ท้ายกระดาษ: เส้นคั่นและข้อความ保密สองภาษา */}
        <div
          style={{
            borderTop: '1.2px solid #222222',
            paddingTop: '14px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: '13px',
              color: '#111111',
              marginBottom: '4px',
            }}
          >
            ข้อมูลเงินเดือนและค่าจ้างเป็นข้อมูลส่วนบุคคล ห้ามเปิดเผยโดยเด็ดขาด นอกจากได้รับอนุญาตจากผู้มีอำนาจของทางบริษัทเท่านั้น
          </div>
          <div
            style={{
              fontWeight: 500,
              fontSize: '12px',
              color: '#222222',
            }}
          >
            Salary and wages are confidential information. Disclosure is strictly prohibited. This document is only valid with an authorized signature and company stamp.
          </div>
        </div>
      </div>
    );
  }
);

PayslipDocument.displayName = 'PayslipDocument';

/**
 * แปลง DOM Element ของ PayslipDocument เป็น Canvas ความละเอียดสูง
 * พร้อมป้องกันปัญหาสี oklch ของ Tailwind v4 และรอฟอนต์ภาษาไทยให้พร้อมก่อนเรนเดอร์
 */
async function renderPayslipElementToCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
    try {
      await (document as any).fonts.ready;
    } catch {
      // ignore font ready error
    }
  }

  // รอให้รูปภาพทั้งหมดภายในสลิป (เช่น โลโก้บริษัท) โหลดและ decode เสร็จสมบูรณ์ก่อนแคปเจอร์เป็น PDF
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      }
      if (typeof img.decode === 'function') {
        try {
          await img.decode();
        } catch {
          // ignore decode error
        }
      }
    })
  );

  return html2canvas(element, {
    scale: 2.5,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: 1122,
    windowWidth: 1200,
    onclone: (clonedDoc) => {
      // แปลงฟังก์ชันสี oklch/oklab/color-mix ใน style tags ของ Tailwind v4 เพื่อไม่ให้ html2canvas error
      const styleTags = clonedDoc.querySelectorAll('style');
      styleTags.forEach((styleEl) => {
        if (styleEl.textContent) {
          styleEl.textContent = styleEl.textContent
            .replace(/oklch\([^)]*\)/g, '#111827')
            .replace(/oklab\([^)]*\)/g, '#111827')
            .replace(/color-mix\([^)]*\)/g, '#111827');
        }
      });
    },
  });
}

/**
 * สร้างและดาวน์โหลดไฟล์ PDF สลิปเงินเดือนรายบุคคล (ขนาด A4 แนวนอน) ในเครื่องเท่านั้น
 * ชื่อไฟล์: สลิปเงินเดือน_<ชื่อจริง>_<cycleKey>.pdf
 */
export async function downloadSinglePayslipPdf(
  element: HTMLElement,
  fullName: string,
  cycleKey: string
): Promise<void> {
  const canvas = await renderPayslipElementToCanvas(element);
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 297 mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 210 mm

  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

  const safeName = (fullName || 'พนักงาน').trim().replace(/[\\/:*?"<>|]/g, '_');
  pdf.save(`สลิปเงินเดือน_${safeName}_${cycleKey}.pdf`);
}

/**
 * สร้างและดาวน์โหลดไฟล์ PDF สลิปเงินเดือนทั้งรอบ (1 หน้าต่อคน เฉพาะที่ยืนยันแล้ว) ในเครื่องเท่านั้น
 */
export async function downloadBatchPayslipsPdf(
  elements: HTMLElement[],
  cycleKey: string
): Promise<void> {
  if (elements.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < elements.length; i++) {
    if (i > 0) {
      pdf.addPage('a4', 'landscape');
    }
    const canvas = await renderPayslipElementToCanvas(elements[i]);
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
  }

  pdf.save(`สลิปเงินเดือน_ทั้งรอบ_${cycleKey}.pdf`);
}
