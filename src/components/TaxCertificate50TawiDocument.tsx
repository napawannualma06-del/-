import React from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface TaxCertificate50TawiData {
  seqNo: number | string;
  yearBE: number; // ปี พ.ศ.
  // ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (1)
  legalCompanyName: string;
  companyAddress: string;
  companyTaxId: string;
  ssoEmployerAccount: string;
  signerName: string;
  signatureDataUrl?: string;
  // ผู้ถูกหักภาษี ณ ที่จ่าย (2)
  nameOnDoc: string;
  employeeAddress: string;
  employeeCitizenId: string;
  // ยอดรวมทั้งปี
  totalIncome: number;
  totalTax: number;
  totalSso: number;
  // วันที่ออกหนังสือรับรอง (YYYY-MM-DD)
  issueDate: string;
}

/**
 * ตรวจเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก + สูตรเช็คหลักที่ 13 ของไทย
 */
export function isValidThaiCitizenId(raw?: string): boolean {
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
 * แปลงตัวเลขเป็นคำอ่านบาทไทยในวงเล็บ เช่น (ศูนย์บาทถ้วน), (หนึ่งพันสองร้อยบาทห้าสิบสตางค์)
 * รองรับหลักล้านซ้ำ และคำว่า เอ็ด / ยี่ ตามหลักภาษาไทย
 */
export function numberToThaiBahtText(amount: number): string {
  const safe = Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0;
  if (safe === 0) {
    return '(ศูนย์บาทถ้วน)';
  }

  const totalSatang = Math.round(safe * 100);
  const bahtPart = Math.floor(totalSatang / 100);
  const satangPart = totalSatang % 100;

  const digitWords = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const unitWords = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

  const convertUnderMillion = (num: number): string => {
    if (num === 0) return '';
    const str = String(num);
    const len = str.length;
    let out = '';
    for (let i = 0; i < len; i++) {
      const d = parseInt(str.charAt(i), 10);
      const pos = len - 1 - i; // 0 = หน่วย, 1 = สิบ, ...
      if (d === 0) continue;
      if (pos === 1 && d === 1) {
        out += 'สิบ';
      } else if (pos === 1 && d === 2) {
        out += 'ยี่สิบ';
      } else if (pos === 0 && d === 1 && len > 1) {
        out += 'เอ็ด';
      } else {
        out += digitWords[d] + unitWords[pos];
      }
    }
    return out;
  };

  const convertInteger = (num: number): string => {
    if (num === 0) return 'ศูนย์';
    const groups: number[] = [];
    let rem = num;
    while (rem > 0) {
      groups.push(rem % 1000000);
      rem = Math.floor(rem / 1000000);
    }
    let result = '';
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (g > 0) {
        result += convertUnderMillion(g);
      }
      if (i > 0) {
        result += 'ล้าน';
      }
    }
    return result;
  };

  let text = '';
  if (bahtPart > 0) {
    text += convertInteger(bahtPart) + 'บาท';
  }
  if (satangPart === 0) {
    text += 'ถ้วน';
  } else {
    text += convertUnderMillion(satangPart) + 'สตางค์';
  }

  return `(${text})`;
}

/**
 * แปลง YYYY-MM-DD เป็น วว/ดด/ปปปป (พ.ศ.)
 */
export function formatIssueDateSlashBE(dateStr?: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const yearBE = y + 543;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${yearBE}`;
}

function formatMoneyOrDash(val: number): string {
  const n = Number(val) || 0;
  if (Math.abs(n) < 0.005) return '-';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * เรนเดอร์ช่องเลข 13 หลัก รูปแบบ X XXXX XXXXX XX X
 */
function ThirteenDigitBoxes({ value }: { value: string }) {
  const digits = String(value || '').replace(/\D/g, '').padEnd(13, ' ').slice(0, 13).split('');
  const renderBox = (ch: string, idx: number) => (
    <span
      key={idx}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '17px',
        height: '20px',
        border: '1px solid #111827',
        fontSize: '12px',
        fontWeight: 700,
        backgroundColor: '#ffffff',
        lineHeight: 1,
      }}
    >
      {ch.trim()}
    </span>
  );

  const dash = (key: string) => (
    <span key={key} style={{ margin: '0 2px', fontWeight: 700, fontSize: '11px' }}>
      -
    </span>
  );

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
      {renderBox(digits[0], 0)}
      {dash('d1')}
      {renderBox(digits[1], 1)}
      {renderBox(digits[2], 2)}
      {renderBox(digits[3], 3)}
      {renderBox(digits[4], 4)}
      {dash('d2')}
      {renderBox(digits[5], 5)}
      {renderBox(digits[6], 6)}
      {renderBox(digits[7], 7)}
      {renderBox(digits[8], 8)}
      {renderBox(digits[9], 9)}
      {dash('d3')}
      {renderBox(digits[10], 10)}
      {renderBox(digits[11], 11)}
      {dash('d4')}
      {renderBox(digits[12], 12)}
    </div>
  );
}

function CheckboxMark({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '10px' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '13px',
          height: '13px',
          border: '1px solid #111827',
          fontSize: '10px',
          fontWeight: 700,
          lineHeight: 1,
          backgroundColor: '#ffffff',
        }}
      >
        {checked ? '✓' : ''}
      </span>
      <span>{label}</span>
    </span>
  );
}

export const TaxCertificate50TawiDocument = React.forwardRef<
  HTMLDivElement,
  { data: TaxCertificate50TawiData }
>(({ data }, ref) => {
  const bahtText = numberToThaiBahtText(data.totalTax);
  const issueDateSlash = formatIssueDateSlashBE(data.issueDate);

  const incomeRows: Array<{
    main: string;
    sub?: string;
    dateText?: string;
    incomeText?: string;
    taxText?: string;
  }> = [
    {
      main: '1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)',
      dateText: String(data.yearBE),
      incomeText: formatMoneyOrDash(data.totalIncome),
      taxText: formatMoneyOrDash(data.totalTax),
    },
    {
      main: '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)',
    },
    {
      main: '3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)',
    },
    {
      main: '4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)',
      sub: '   (ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)',
    },
    {
      main: '5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลด หรือประโยชน์ใดๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ',
    },
    {
      main: '6. อื่นๆ (ระบุ) ............................................................................................................',
    },
  ];

  return (
    <div
      ref={ref}
      style={{
        width: '794px', // A4 Portrait @ 96 DPI (210mm x 297mm)
        minHeight: '1123px',
        backgroundColor: '#ffffff',
        color: '#111827',
        fontFamily: "'Sarabun', 'Noto Sans Thai', 'Tahoma', sans-serif",
        padding: '24px 28px',
        boxSizing: 'border-box',
        fontSize: '11.5px',
        lineHeight: 1.38,
      }}
    >
      {/* กรอบนอกสุด */}
      <div style={{ border: '1.5px solid #111827', padding: '10px 12px' }}>
        {/* หัวเอกสาร */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '6px',
          }}
        >
          <div style={{ width: '130px', fontSize: '10px', color: '#374151' }}>
            ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)
            <br />
            ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>
              หนังสือรับรองการหักภาษี ณ ที่จ่าย
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>
              ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
            </div>
          </div>
          <div
            style={{
              width: '155px',
              textAlign: 'right',
              fontSize: '11.5px',
              fontWeight: 600,
            }}
          >
            <div
              style={{
                border: '1px solid #111827',
                padding: '4px 8px',
                display: 'inline-block',
                backgroundColor: '#f9fafb',
              }}
            >
              ลำดับที่ <span style={{ fontWeight: 700, padding: '0 4px' }}>{data.seqNo}</span> ในแบบ
            </div>
          </div>
        </div>

        {/* กรอบที่ 1: ผู้มีหน้าที่หักภาษี ณ ที่จ่าย */}
        <div
          style={{
            border: '1px solid #111827',
            padding: '6px 10px',
            marginBottom: '6px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px',
              marginBottom: '4px',
            }}
          >
            <div style={{ fontWeight: 700 }}>
              ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '11px' }}>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)</span>
              <ThirteenDigitBoxes value={data.companyTaxId} />
            </div>
          </div>
          <div style={{ marginBottom: '3px' }}>
            <span style={{ fontWeight: 600 }}>ชื่อ </span>
            <span
              style={{
                borderBottom: '1px dotted #374151',
                display: 'inline-block',
                minWidth: '640px',
                paddingLeft: '6px',
                fontWeight: 700,
              }}
            >
              {data.legalCompanyName || '-'}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#4b5563', marginBottom: '3px' }}>
            (ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)
          </div>
          <div>
            <span style={{ fontWeight: 600 }}>ที่อยู่ </span>
            <span
              style={{
                borderBottom: '1px dotted #374151',
                display: 'inline-block',
                minWidth: '630px',
                paddingLeft: '6px',
              }}
            >
              {data.companyAddress || '-'}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#4b5563' }}>
            (ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)
          </div>
        </div>

        {/* กรอบที่ 2: ผู้ถูกหักภาษี ณ ที่จ่าย */}
        <div
          style={{
            border: '1px solid #111827',
            padding: '6px 10px',
            marginBottom: '6px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px',
              marginBottom: '4px',
            }}
          >
            <div style={{ fontWeight: 700 }}>
              ผู้ถูกหักภาษี ณ ที่จ่าย : -
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 600, fontSize: '11px' }}>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)</span>
              <ThirteenDigitBoxes value={data.employeeCitizenId} />
            </div>
          </div>
          <div style={{ marginBottom: '3px' }}>
            <span style={{ fontWeight: 600 }}>ชื่อ </span>
            <span
              style={{
                borderBottom: '1px dotted #374151',
                display: 'inline-block',
                minWidth: '640px',
                paddingLeft: '6px',
                fontWeight: 700,
              }}
            >
              {data.nameOnDoc || '-'}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#4b5563', marginBottom: '3px' }}>
            (ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)
          </div>
          <div>
            <span style={{ fontWeight: 600 }}>ที่อยู่ </span>
            <span
              style={{
                borderBottom: '1px dotted #374151',
                display: 'inline-block',
                minWidth: '630px',
                paddingLeft: '6px',
              }}
            >
              {data.employeeAddress || '-'}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#4b5563' }}>
            (ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)
          </div>
        </div>

        {/* ประเภทแบบ ภ.ง.ด. */}
        <div
          style={{
            border: '1px solid #111827',
            padding: '6px 10px',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          <span style={{ fontWeight: 700, marginRight: '8px' }}>
            ลำดับที่ <span style={{ textDecoration: 'underline', padding: '0 4px' }}>{data.seqNo}</span> ในแบบ
          </span>
          <CheckboxMark checked={true} label="(1) ภ.ง.ด.1ก" />
          <CheckboxMark checked={false} label="(2) ภ.ง.ด.1ก พิเศษ" />
          <CheckboxMark checked={false} label="(3) ภ.ง.ด.2" />
          <CheckboxMark checked={false} label="(4) ภ.ง.ด.3" />
          <CheckboxMark checked={false} label="(5) ภ.ง.ด.2ก" />
          <CheckboxMark checked={false} label="(6) ภ.ง.ด.3ก" />
          <CheckboxMark checked={false} label="(7) ภ.ง.ด.53" />
        </div>

        {/* ตารางประเภทเงินได้พึงประเมินที่จ่าย */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #111827',
            marginBottom: '6px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6' }}>
              <th
                style={{
                  border: '1px solid #111827',
                  padding: '5px 8px',
                  textAlign: 'center',
                  fontWeight: 700,
                  width: '52%',
                }}
              >
                ประเภทเงินได้พึงประเมินที่จ่าย
              </th>
              <th
                style={{
                  border: '1px solid #111827',
                  padding: '5px 6px',
                  textAlign: 'center',
                  fontWeight: 700,
                  width: '16%',
                }}
              >
                วัน เดือน หรือปีภาษี ที่จ่าย
              </th>
              <th
                style={{
                  border: '1px solid #111827',
                  padding: '5px 8px',
                  textAlign: 'center',
                  fontWeight: 700,
                  width: '16%',
                }}
              >
                จำนวนเงินที่จ่าย
              </th>
              <th
                style={{
                  border: '1px solid #111827',
                  padding: '5px 8px',
                  textAlign: 'center',
                  fontWeight: 700,
                  width: '16%',
                }}
              >
                ภาษีที่หัก และนำส่งไว้
              </th>
            </tr>
          </thead>
          <tbody>
            {incomeRows.map((row, idx) => (
              <tr key={idx}>
                <td
                  style={{
                    borderLeft: '1px solid #111827',
                    borderRight: '1px solid #111827',
                    borderBottom: idx === incomeRows.length - 1 ? '1px solid #111827' : '1px dotted #9ca3af',
                    padding: '5px 8px',
                    verticalAlign: 'top',
                  }}
                >
                  <div>{row.main}</div>
                  {row.sub && <div style={{ marginTop: '2px' }}>{row.sub}</div>}
                </td>
                <td
                  style={{
                    borderLeft: '1px solid #111827',
                    borderRight: '1px solid #111827',
                    borderBottom: idx === incomeRows.length - 1 ? '1px solid #111827' : '1px dotted #9ca3af',
                    padding: '5px 6px',
                    textAlign: 'center',
                    verticalAlign: 'top',
                    fontWeight: row.dateText ? 700 : 400,
                  }}
                >
                  {row.dateText || ''}
                </td>
                <td
                  style={{
                    borderLeft: '1px solid #111827',
                    borderRight: '1px solid #111827',
                    borderBottom: idx === incomeRows.length - 1 ? '1px solid #111827' : '1px dotted #9ca3af',
                    padding: '5px 8px',
                    textAlign: 'right',
                    verticalAlign: 'top',
                    fontWeight: row.incomeText ? 700 : 400,
                  }}
                >
                  {row.incomeText || ''}
                </td>
                <td
                  style={{
                    borderLeft: '1px solid #111827',
                    borderRight: '1px solid #111827',
                    borderBottom: idx === incomeRows.length - 1 ? '1px solid #111827' : '1px dotted #9ca3af',
                    padding: '5px 8px',
                    textAlign: 'right',
                    verticalAlign: 'top',
                    fontWeight: row.taxText ? 700 : 400,
                  }}
                >
                  {row.taxText || ''}
                </td>
              </tr>
            ))}

            {/* แถวรวมเงินที่จ่ายและภาษีที่หักนำส่ง */}
            <tr style={{ backgroundColor: '#f9fafb' }}>
              <td
                colSpan={2}
                style={{
                  border: '1px solid #111827',
                  padding: '6px 8px',
                  textAlign: 'right',
                  fontWeight: 700,
                }}
              >
                รวมเงินที่จ่ายและภาษีที่หักนำส่ง
              </td>
              <td
                style={{
                  border: '1px solid #111827',
                  padding: '6px 8px',
                  textAlign: 'right',
                  fontWeight: 700,
                }}
              >
                {formatMoneyOrDash(data.totalIncome)}
              </td>
              <td
                style={{
                  border: '1px solid #111827',
                  padding: '6px 8px',
                  textAlign: 'right',
                  fontWeight: 700,
                }}
              >
                {formatMoneyOrDash(data.totalTax)}
              </td>
            </tr>

            {/* แถวรวมเงินภาษีที่หักนำส่ง (ตัวอักษร) */}
            <tr>
              <td
                colSpan={4}
                style={{
                  border: '1px solid #111827',
                  padding: '6px 10px',
                }}
              >
                <span style={{ fontWeight: 700, marginRight: '10px' }}>
                  รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)
                </span>
                <span
                  style={{
                    display: 'inline-block',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #9ca3af',
                    padding: '2px 14px',
                    fontWeight: 700,
                    minWidth: '420px',
                  }}
                >
                  {bahtText}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* เงินที่จ่ายเข้า กองทุนต่างๆ */}
        <div
          style={{
            border: '1px solid #111827',
            padding: '6px 10px',
            marginBottom: '6px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontWeight: 700 }}>เงินที่จ่ายเข้า :</span>
            <span>
              กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน{' '}
              <strong style={{ padding: '0 6px', borderBottom: '1px dotted #374151' }}>-</strong> บาท
            </span>
            <span>
              กองทุนประกันสังคม{' '}
              <strong style={{ padding: '0 8px', borderBottom: '1px dotted #374151' }}>
                {formatMoneyOrDash(data.totalSso)}
              </strong>{' '}
              บาท
            </span>
            <span>
              กองทุนสำรองเลี้ยงชีพ{' '}
              <strong style={{ padding: '0 6px', borderBottom: '1px dotted #374151' }}>-</strong> บาท
            </span>
          </div>
          <div style={{ marginTop: '4px', fontSize: '11px' }}>
            <span>เลขที่บัญชีนายจ้าง (กองทุนประกันสังคม) : </span>
            <strong style={{ padding: '0 6px', borderBottom: '1px dotted #374151' }}>
              {data.ssoEmployerAccount || '-'}
            </strong>
          </div>
        </div>

        {/* ผู้จ่ายเงิน */}
        <div
          style={{
            border: '1px solid #111827',
            padding: '6px 10px',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span style={{ fontWeight: 700, marginRight: '8px' }}>ผู้จ่ายเงิน :</span>
          <CheckboxMark checked={true} label="(1) หักภาษี ณ ที่จ่าย" />
          <CheckboxMark checked={false} label="(2) ออกภาษีให้ตลอดไป" />
          <CheckboxMark checked={false} label="(3) ออกภาษีให้ครั้งเดียว" />
          <CheckboxMark checked={false} label="(4) อื่นๆ (ระบุ) ...................................." />
        </div>

        {/* คำเตือน และ รับรอง / ลงชื่อ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '42% 58%',
            border: '1px solid #111827',
          }}
        >
          <div
            style={{
              borderRight: '1px solid #111827',
              padding: '8px 10px',
              fontSize: '10.5px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '3px' }}>คำเตือน :</div>
            <div>
              ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย
              ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
              ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
            </div>
          </div>

          <div
            style={{
              padding: '8px 12px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>
              ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '58px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                <span>ลงชื่อ</span>
                <span
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    minWidth: '190px',
                    minHeight: '42px',
                    borderBottom: '1px dotted #374151',
                    paddingBottom: '2px',
                  }}
                >
                  {data.signatureDataUrl ? (
                    <img
                      src={data.signatureDataUrl}
                      alt="ลายเซ็นผู้มีหน้าที่หักภาษี ณ ที่จ่าย"
                      style={{
                        maxHeight: '38px',
                        maxWidth: '160px',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 600, fontSize: '12px' }}>
                      {data.signerName || ''}
                    </span>
                  )}
                </span>
                <span>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย</span>
              </div>
              <div style={{ fontSize: '11px', marginTop: '3px' }}>
                ({data.signerName || '......................................................'})
              </div>
            </div>

            <div style={{ marginTop: '4px', fontSize: '11px' }}>
              <span style={{ fontWeight: 600, padding: '0 6px', borderBottom: '1px dotted #374151' }}>
                {issueDateSlash || '....../....../..........'}
              </span>{' '}
              <span>(วันที่ออกหนังสือรับรอง)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

TaxCertificate50TawiDocument.displayName = 'TaxCertificate50TawiDocument';

/**
 * สร้าง PDF ใบเดียวจาก DOM element ของ TaxCertificate50TawiDocument
 */
export async function downloadSingle50TawiPdf(
  element: HTMLElement,
  yearBE: number,
  nameOnDoc: string
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));

  const safeName = String(nameOnDoc || 'พนักงาน')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_');
  pdf.save(`50ทวิ_${yearBE}_${safeName}.pdf`);
}

/**
 * สร้าง PDF รวมทุกคนที่สถานะ "พร้อม" (1 คน = 1 หน้า เรียงตามลำดับที่)
 */
export async function downloadBatch50TawiPdf(
  elements: HTMLElement[],
  yearBE: number
): Promise<void> {
  if (elements.length === 0) return;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pageMaxHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < elements.length; i++) {
    if (i > 0) {
      pdf.addPage();
    }
    const canvas = await html2canvas(elements[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });
    const imgData = canvas.toDataURL('image/png');
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pageMaxHeight));
  }

  pdf.save(`50ทวิ_${yearBE}_ทั้งหมด.pdf`);
}
