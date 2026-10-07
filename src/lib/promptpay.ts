import QRCode from 'qrcode';

export interface BankInfo {
  id: string;
  name: string;
  shortName: string;
  color: string;
  bgLight: string;
  borderLight: string;
  textColor: string;
}

export const THAI_BANKS: BankInfo[] = [
  {
    id: 'promptpay',
    name: 'พร้อมเพย์ (PromptPay)',
    shortName: 'PromptPay',
    color: '#003D6B',
    bgLight: 'bg-sky-50 dark:bg-sky-950/40',
    borderLight: 'border-sky-200 dark:border-sky-800',
    textColor: 'text-sky-700 dark:text-sky-300',
  },
  {
    id: 'kbank',
    name: 'ธนาคารกสิกรไทย (KBANK)',
    shortName: 'กสิกรไทย',
    color: '#138f2d',
    bgLight: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderLight: 'border-emerald-200 dark:border-emerald-800',
    textColor: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    id: 'scb',
    name: 'ธนาคารไทยพาณิชย์ (SCB)',
    shortName: 'ไทยพาณิชย์',
    color: '#4e2e7f',
    bgLight: 'bg-purple-50 dark:bg-purple-950/40',
    borderLight: 'border-purple-200 dark:border-purple-800',
    textColor: 'text-purple-700 dark:text-purple-300',
  },
  {
    id: 'bbl',
    name: 'ธนาคารกรุงเทพ (BBL)',
    shortName: 'กรุงเทพ',
    color: '#1e4598',
    bgLight: 'bg-blue-50 dark:bg-blue-950/40',
    borderLight: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-700 dark:text-blue-300',
  },
  {
    id: 'ktb',
    name: 'ธนาคารกรุงไทย (KTB)',
    shortName: 'กรุงไทย',
    color: '#00a6e6',
    bgLight: 'bg-cyan-50 dark:bg-cyan-950/40',
    borderLight: 'border-cyan-200 dark:border-cyan-800',
    textColor: 'text-cyan-700 dark:text-cyan-300',
  },
  {
    id: 'ttb',
    name: 'ธนาคารทหารไทยธนชาต (ttb)',
    shortName: 'ttb',
    color: '#002d63',
    bgLight: 'bg-blue-50 dark:bg-blue-950/40',
    borderLight: 'border-blue-300 dark:border-blue-800',
    textColor: 'text-blue-800 dark:text-blue-300',
  },
  {
    id: 'bay',
    name: 'ธนาคารกรุงศรีอยุธยา (BAY)',
    shortName: 'กรุงศรี',
    color: '#fec43b',
    bgLight: 'bg-amber-50 dark:bg-amber-950/40',
    borderLight: 'border-amber-200 dark:border-amber-800',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
  {
    id: 'gsb',
    name: 'ธนาคารออมสิน (GSB)',
    shortName: 'ออมสิน',
    color: '#eb198d',
    bgLight: 'bg-pink-50 dark:bg-pink-950/40',
    borderLight: 'border-pink-200 dark:border-pink-800',
    textColor: 'text-pink-700 dark:text-pink-300',
  },
  {
    id: 'baac',
    name: 'ธ.ก.ส. (ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร)',
    shortName: 'ธ.ก.ส.',
    color: '#288844',
    bgLight: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderLight: 'border-emerald-200 dark:border-emerald-800',
    textColor: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'uob',
    name: 'ธนาคารยูโอบี (UOB)',
    shortName: 'UOB',
    color: '#0b3979',
    bgLight: 'bg-slate-50 dark:bg-slate-800',
    borderLight: 'border-slate-300 dark:border-slate-700',
    textColor: 'text-slate-800 dark:text-slate-200',
  },
  {
    id: 'cimb',
    name: 'ธนาคารซีไอเอ็มบี ไทย (CIMB)',
    shortName: 'CIMB',
    color: '#7e1518',
    bgLight: 'bg-rose-50 dark:bg-rose-950/40',
    borderLight: 'border-rose-200 dark:border-rose-800',
    textColor: 'text-rose-700 dark:text-rose-300',
  },
  {
    id: 'truemoney',
    name: 'ทรูมันนี่ วอลเล็ท (TrueMoney)',
    shortName: 'TrueMoney',
    color: '#f47920',
    bgLight: 'bg-orange-50 dark:bg-orange-950/40',
    borderLight: 'border-orange-200 dark:border-orange-800',
    textColor: 'text-orange-700 dark:text-orange-300',
  },
  {
    id: 'other',
    name: 'ธนาคารอื่นๆ / อื่นๆ',
    shortName: 'อื่นๆ',
    color: '#64748b',
    bgLight: 'bg-slate-50 dark:bg-slate-800',
    borderLight: 'border-slate-200 dark:border-slate-700',
    textColor: 'text-slate-700 dark:text-slate-300',
  },
];

export function getBankInfo(nameOrId?: string): BankInfo {
  if (!nameOrId) return THAI_BANKS[0];
  const query = nameOrId.toLowerCase().trim();
  const found = THAI_BANKS.find(
    (b) =>
      b.id.toLowerCase() === query ||
      b.name.toLowerCase().includes(query) ||
      b.shortName.toLowerCase().includes(query)
  );
  return found || THAI_BANKS[THAI_BANKS.length - 1];
}

// CRC16-CCITT (polynomial 0x1021, initial 0xFFFF)
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Generate EMVCo PromptPay Payload string
 * supports mobile phone (9 or 10 digits) or National ID (13 digits)
 */
export function generatePromptPayPayload(target: string, amount?: number | null): string {
  // Strip non-numeric chars
  const cleaned = target.replace(/\D/g, '');

  let tag29Subtag = '';
  if (cleaned.length === 10 || cleaned.length === 9) {
    // Phone number: convert 0812345678 to 0066812345678
    let phone = cleaned;
    if (phone.startsWith('0')) {
      phone = phone.substring(1);
    }
    const formatted = '0066' + phone;
    tag29Subtag = '01' + pad2(formatted.length) + formatted;
  } else if (cleaned.length === 13) {
    // National ID
    tag29Subtag = '02' + pad2(cleaned.length) + cleaned;
  } else if (cleaned.length === 15) {
    // e-Wallet
    tag29Subtag = '03' + pad2(cleaned.length) + cleaned;
  } else {
    // Fallback: If not recognized format, return raw target for regular QR text
    return target;
  }

  // Tag 29 Merchant Info
  const aid = '0016A000000677010111';
  const tag29Content = aid + tag29Subtag;
  const tag29 = '29' + pad2(tag29Content.length) + tag29Content;

  const pointOfInitiation = amount && amount > 0 ? '010212' : '010211';
  let payload = '000201' + pointOfInitiation + tag29 + '5303764';

  if (amount && amount > 0) {
    const amountStr = amount.toFixed(2);
    payload += '54' + pad2(amountStr.length) + amountStr;
  }

  payload += '5802TH';
  payload += '6304';

  const checksum = crc16(payload);
  return payload + checksum;
}

/**
 * Generate QR Data URL from payload or link
 */
export async function generateQrDataUrl(
  text: string, 
  options: { width?: number; margin?: number; color?: { dark?: string; light?: string } } = {}
): Promise<string> {
  const { width = 300, margin = 2, color = { dark: '#000000', light: '#FFFFFF' } } = options;
  return QRCode.toDataURL(text, {
    width,
    margin,
    color,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Format account / promptpay number with clean dashes for human reading
 */
export function formatPaymentTarget(target: string): string {
  const digits = target.replace(/\D/g, '');
  if (digits.length === 10) {
    // 081-234-5678 or Bank Account 123-4-56789-0
    if (digits.startsWith('0')) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 13) {
    // National ID 1-2345-67890-12-3
    return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`;
  }
  return target;
}
