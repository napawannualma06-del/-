import { OTCycleInfo } from './otUtils';
import { format } from 'date-fns';
import { AdvanceRequest } from '../types';

/**
 * ฟังก์ชันย่อขนาดรูปภาพ (Client-Side Compression) ให้อยู่ในขนาดกะทัดรัด (เช่น ไม่เกิน 400KB)
 * ก่อนบันทึกลงใน Firestore เป็น Base64 Data URL โดยยังคงความคมชัดของสลิปโอนเงิน
 */
export async function compressSlipImage(
  file: File, 
  maxWidth = 1000, 
  maxHeight = 1400, 
  quality = 0.75
): Promise<{ dataUrl: string; fileName: string; fileSizeKB: number }> {
  return new Promise((resolve, reject) => {
    // ตรวจสอบประเภทไฟล์
    if (!file.type.startsWith('image/')) {
      reject(new Error('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // คำนวณอัตราส่วนย่อรูป
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'));
          return;
        }

        // วาดรูปลง canvas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // แปลงเป็น JPEG Data URL
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const approxSizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);

        resolve({
          dataUrl,
          fileName: file.name,
          fileSizeKB: approxSizeKB,
        });
      };

      img.onerror = () => {
        reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('เกิดข้อผิดพลาดในการโหลดไฟล์'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * ส่งออกรายการขอเบิกเงินแอดวานซ์เป็นไฟล์ Excel CSV (.csv UTF-8 BOM สำหรับ Excel ภาษาไทย)
 */
export function exportAdvanceToExcelCsv(
  requests: AdvanceRequest[],
  cycleInfo: OTCycleInfo,
  titlePrefix = 'สรุปยอด_ขอเบิกเงินแอดวานซ์_Thaiplus'
) {
  const headers = [
    'ลำดับ',
    'วันที่ขอเบิก',
    'รหัสพนักงาน',
    'ชื่อพนักงาน',
    'ยอดเงินขอเบิก (บาท)',
    'ธนาคาร',
    'เลขที่บัญชี',
    'ชื่อบัญชี',
    'เหตุผลการขอเบิกเงิน',
    'สถานะคำขอ',
    'มีแนบสลิปหรือไม่',
    'ผู้อนุมัติ/โอน',
    'วันที่พิจารณา',
    'หมายเหตุแอดมิน',
    'รอบบิลตัดยอด 25'
  ];

  const rows = requests.map((req, idx) => {
    const statusText = 
      req.status === 'approved' ? 'อนุมัติแล้ว (โอนแล้ว)' : 
      req.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ';
    
    const reviewedDate = req.reviewedAt ? format(new Date(req.reviewedAt), 'dd/MM/yyyy HH:mm') : '-';
    const hasSlip = req.slipUrl ? 'แนบสลิปแล้ว' : 'ยังไม่มีสลิป';

    return [
      idx + 1,
      req.requestDate,
      req.employeeUsername ? `@${req.employeeUsername}` : req.employeeId,
      `"${(req.employeeName || '').replace(/"/g, '""')}"`,
      req.amount,
      `"${(req.bankName || '-').replace(/"/g, '""')}"`,
      `"${(req.accountNumber || '-').replace(/"/g, '""')}"`,
      `"${(req.accountName || '-').replace(/"/g, '""')}"`,
      `"${(req.reason || '').replace(/"/g, '""')}"`,
      statusText,
      hasSlip,
      `"${(req.approvedBy || '-').replace(/"/g, '""')}"`,
      reviewedDate,
      `"${(req.adminComment || '-').replace(/"/g, '""')}"`,
      `"${cycleInfo.periodLabel}"`
    ];
  });

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
