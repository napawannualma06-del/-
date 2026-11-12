export type Role = 'employee' | 'admin';
export type WorkStatus = 'working' | 'off_work';
export type AccountStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  uid: string;
  username: string;
  name: string;
  role: Role;
  pin?: string;
  hasPin?: boolean;
  email?: string;
  fcmToken?: string;
  workStatus?: WorkStatus;
  offWorkAt?: number;
  lastActiveAt?: number;
  lastActionAt?: number;
  clockedInAt?: number;
  autoClockOutReason?: string;
  avatarEmoji?: string;
  createdAt: number;
  accountStatus?: AccountStatus;
  approvedAt?: number;
  approvedBy?: string;
  passwordResetRequested?: boolean;
  passwordResetRequestedAt?: number;
}

export interface DutyWorker {
  uid: string;
  name: string;
  username: string;
  joinedAt: number;
}

export interface CreditCheckDuty {
  workers: DutyWorker[];
  updatedAt: number;
}

export interface Agent {
  id: string;
  name: string;
  createdAt: number;
  createdBy?: string;
  createdById?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  promptpayType?: string;
  phone?: string;
  province?: string;
  notes?: string;
  qrImageUrl?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export interface Case {
  id: string;
  caseKey?: string; // Key สุ่ม 6 หลักสำหรับระบุเคส เช่น 'A9B2K7'
  agentName: string;
  iphoneModel: string;
  province: string;
  status: 'pending' | 'credit_check' | 'processing' | 'closed' | 'cancelled';
  contractNumber?: string;
  contractUpdatedAt?: number;
  contractUpdatedBy?: string;
  remarks?: string;
  remarksUpdatedAt?: number;
  remarksUpdatedBy?: string;
  assigneeId?: string;
  assigneeName?: string;
  previousAssigneeName?: string;
  previousAssigneeId?: string;
  returnedBy?: string;
  returnedById?: string;
  returnedAt?: number;
  returnedReason?: string;
  isStuck?: boolean;
  stuckAt?: number;
  stuckBy?: string;
  stuckReason?: string;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  durationMs?: number; // ระยะเวลาตั้งแต่เริ่มรับเคสจนจบเคส (มิลลิวินาที)
  completedAt?: number;
  cancelledAt?: number;
  cancelledBy?: string;
  taskTitle?: string;
  isCustomTask?: boolean;
  caseType?: string;
}

export interface ActivityLog {
  id: string;
  type: 'create_case' | 'accept_case' | 'stuck_case' | 'return_case' | 'transfer_case' | 'close_case' | 'contract_case' | 'remark_case' | 'cancel_case' | 'auto_clock_out' | 'clock_in' | 'clock_out';
  actorId: string;
  actorName: string;
  actorAvatarEmoji?: string;
  description: string;
  caseId?: string;
  caseKey?: string; // Key สุ่ม 6 หลักของเคส
  iphoneModel?: string;
  contractNumber?: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderRole: string;
  senderAvatarEmoji?: string;
  text: string;
  mentions?: string[];
  createdAt: number;
}

export type TechnicalIssueStatus = 'pending' | 'in_progress' | 'resolved';

export interface TechnicalIssue {
  id: string;
  title: string;              // หัวข้อ
  serialNumber: string;       // เลข SN
  description: string;        // กล่อง Text รายละเอียด
  status: TechnicalIssueStatus; // รอแก้ ('pending') | รับเรื่อง ('in_progress') | เสร็จสิ้น ('resolved')
  reporterId: string;         // รหัสผู้ส่งแจ้ง
  reporterName: string;       // ชื่อผู้ส่งแจ้ง
  reporterUsername?: string;  // @username ผู้ส่งแจ้ง
  reporterAvatarEmoji?: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
  adminNote?: string;         // บันทึก/หมายเหตุตอบกลับจากแอดมิน
  statusChangedBy?: string;   // ผู้เปลี่ยนสถานะล่าสุด (เช่น แอดมิน)
}

export type OvertimeStatus = 'pending' | 'approved' | 'rejected';

export type OvertimeType = 'holiday_in_hours' | 'holiday_after_hours' | 'workday';

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeUsername?: string;
  employeeAvatarEmoji?: string;
  date: string;               // YYYY-MM-DD
  startTime: string;          // HH:mm
  endTime: string;            // HH:mm
  hours: number;              // Total hours e.g. 2.5
  reason: string;             // Reason
  status: OvertimeStatus;     // 'pending' | 'approved' | 'rejected'
  otType?: OvertimeType;      // holiday_in_hours (แดง) | holiday_after_hours (เขียว) | workday (ฟ้า)
  otTypeSuggested?: OvertimeType | null;
  otTypeChangedByEmployee?: boolean;
  otTypeModifiedBy?: string;
  otTypeModifiedAt?: number;
  previousOtType?: OvertimeType;
  dateModifiedBy?: string;
  dateModifiedById?: string;
  dateModifiedAt?: number;
  previousDate?: string;
  approvedBy?: string;
  approvedById?: string;
  reviewedAt?: number;
  adminComment?: string;
  cyclePeriod: string;        // e.g. "2026-09" (26 Aug - 25 Sep)
  createdAt: number;
  updatedAt: number;
}

export type AdvanceStatus = 'pending' | 'approved' | 'rejected';

export interface AdvanceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeUsername?: string;
  employeeAvatarEmoji?: string;
  amount: number;             // จำนวนเงินที่ขอเบิกแอดวานซ์ (บาท)
  requestDate: string;        // วันที่ขอเบิก YYYY-MM-DD
  reason: string;             // เหตุผลหรือวัตถุประสงค์ในการขอเบิก
  bankName?: string;          // ธนาคารที่ให้โอนเข้า (ตัวเลือก)
  accountNumber?: string;     // เลขที่บัญชี (ตัวเลือก)
  accountName?: string;       // ชื่อบัญชี (ตัวเลือก)
  status: AdvanceStatus;      // 'pending' | 'approved' | 'rejected'
  cyclePeriod: string;        // รอบบิลตัดยอด 25 (e.g. "2026-09" คือ 26 ส.ค. - 25 ก.ย.)
  slipUrl?: string;           // รูปภาพสลิปการโอนเงิน (base64 data url)
  slipFileName?: string;      // ชื่อไฟล์สลิป
  slipUploadedAt?: number;    // วันเวลาที่แนบสลิป
  slipUploadedBy?: string;    // ผู้แนบสลิป (เช่น แอดมิน หรือ พนักงาน)
  approvedBy?: string;        // ชื่อแอดมินที่พิจารณา
  approvedById?: string;      // ID แอดมิน
  reviewedAt?: number;        // วันเวลาที่พิจารณา
  adminComment?: string;      // หมายเหตุจากแอดมิน
  createdAt: number;
  updatedAt: number;
}

export type PromptPayTargetType = 'phone' | 'id_card' | 'bank_account' | 'other';

export interface EmployeePaymentMethod {
  id: string;                 // unique id (often employee's user uid or doc id)
  employeeId: string;         // User UID
  employeeName: string;       // ชื่อพนักงาน
  employeeUsername?: string;  // @username
  avatarEmoji?: string;       // อิโมจิประจำตัว
  bankName: string;           // ธนาคาร หรือ 'พร้อมเพย์'
  accountNumber: string;      // เลขบัญชี หรือ เบอร์พร้อมเพย์
  accountName: string;        // ชื่อ-นามสกุล บัญชีผู้รับ
  promptpayType?: PromptPayTargetType; // ประเภท เช่น เบอร์โทร, บัตรประชาชน, บัญชีธนาคาร
  qrImageUrl?: string;        // รูป QR Code ที่พนักงานอัปโหลดเอง (Base64)
  note?: string;              // หมายเหตุ เช่น "ฝากซื้อของโอนคืนเบอร์นี้นะครับ", "พร้อมเพย์เบอร์นี้เลย"
  createdAt: number;
  updatedAt: number;
  updatedBy?: string;
}

export type RepaymentCategory = 'buy_for_me' | 'excess_refund' | 'shared_expense' | 'other';

export interface PeerRepayment {
  id: string;
  fromEmployeeId: string;     // ผู้โอนคืน
  fromEmployeeName: string;
  fromEmployeeUsername?: string;
  fromAvatarEmoji?: string;
  toEmployeeId: string;       // ผู้รับเงิน
  toEmployeeName: string;
  toEmployeeUsername?: string;
  toAvatarEmoji?: string;
  amount: number;             // ยอดเงิน (บาท)
  category: RepaymentCategory; // 'buy_for_me' (ฝากซื้อของ) | 'excess_refund' (จ่ายเงินเกิน) | 'shared_expense' (หารกัน) | 'other'
  description?: string;       // รายละเอียด เช่น "ค่าข้าวมันไก่", "เงินทอนค่าของ"
  slipUrl?: string;           // แนบรูปสลิปการโอนคืน (Base64)
  status: 'completed' | 'pending';
  createdAt: number;
}

// ===============================================================
// Shift & Work Schedule Types
// ===============================================================

export interface ShiftTemplate {
  id: string;
  name: string;        // ชื่อกะ เช่น "กะเช้า", "กะบ่าย", "กะดึก"
  startTime: string;   // เวลาเริ่ม "HH:mm" เช่น "08:00"
  endTime: string;     // เวลาเลิก "HH:mm" เช่น "17:00"
  color: string;       // รหัสสี เช่น "#10b981", "emerald"
  shortCode?: string;  // ตัวย่อในช่อง เช่น "เช้า", "บ่าย", "ดึก"
}

export interface EmployeeShiftPref {
  employeeId: string;
  regularOffDays: number[]; // วันหยุดประจำสัปดาห์ (0 = อาทิตย์, 1 = จันทร์, ..., 6 = เสาร์)
  defaultShiftId?: string;  // กะประจำ
  hiddenFromSchedule?: boolean; // ซ่อนจากตารางหรือไม่
}

export type SpecialDayType = 'off' | 'leave' | 'holiday';

export interface CycleScheduleDoc {
  // days[employeeId][dateStr YYYY-MM-DD] = shiftId | 'off' | 'leave' | 'holiday'
  days: Record<string, Record<string, string>>;
  updatedAt?: number;
  updatedBy?: string;
}

// ===============================================================
// HR Basic Employee Profile Types (system_settings/hr_profiles)
// ===============================================================

export type HRProbationStatus = 'probation' | 'passed';

export interface HRProfile {
  fullName: string;
  nickname: string;
  position: string;
  startDate: string; // YYYY-MM-DD
  probationDays: number; // ค่าเริ่ม 119
  probationEndDate: string; // YYYY-MM-DD
  probationStatus: HRProbationStatus; // 'probation' | 'passed'
  notEmployee: boolean;
}

export interface HRProfilesDoc {
  profiles: Record<string, HRProfile>;
  updatedAt?: number;
  updatedBy?: string;
}

// ===============================================================
// HR Confidential Private Data (hr_private/{employeeId})
// ===============================================================

export type HRSSOStatus = 'enrolled' | 'not_enrolled';

export interface HRPrivateData {
  bankName: string;
  accountNumber: string;
  accountName: string;
  salary: number;
  ssoNumber: string;
  ssoStatus: HRSSOStatus; // 'enrolled' | 'not_enrolled'
  ssoRatePercent: number; // ค่าเริ่ม 5
  ssoCapAmount: number;   // ค่าเริ่ม 875
  updatedAt?: number;
  updatedBy?: string;
}

// ===============================================================
// Payroll Settings (system_settings/payroll_settings) & Slips (payroll_slips/{cycleKey}_{employeeId})
// ===============================================================

export type PayrollItemType = 'earning' | 'deduction';

export interface PayrollItemDefinition {
  id: string;
  name: string;        // ชื่อ (ไทย)
  nameEn?: string;     // ชื่ออังกฤษ (ไม่บังคับ)
  type: PayrollItemType; // 'earning' = เงินได้ | 'deduction' = รายการหัก
  enabled: boolean;    // เปิด/ปิดใช้งาน
}

export interface PayrollSettingsDoc {
  companyName: string; // ค่าเริ่ม "Thunder Cloud"
  otMultiplierHolidayInHours: number | null;     // แดง
  otMultiplierHolidayAfterHours: number | null;  // เขียว
  otMultiplierWorkday: number | null;            // ฟ้า
  otMultiplierUnspecified: number | null;        // ไม่ระบุ
  payItems: PayrollItemDefinition[];
  usedPayItemIds?: string[]; // รายการที่เคยใช้ในสลิปที่ยืนยันแล้ว (ห้ามลบจริง ให้ปิดใช้งานแทน)
  defaultPayDates?: Record<string, string>; // วันที่จ่ายของแต่ละรอบ (ถ้าบันทึกไว้)
  updatedAt?: number;
  updatedBy?: string;
}

export type PayrollSlipStatus = 'draft' | 'confirmed';

export interface PayrollOTLine {
  hours: number;
  multiplier: number;
  amount: number;
}

export interface PayrollOTLines {
  holiday_in_hours: PayrollOTLine;
  holiday_after_hours: PayrollOTLine;
  workday: PayrollOTLine;
  unspecified: PayrollOTLine;
}

export interface PayrollSlipItem {
  id: string;
  name: string;
  nameEn?: string;
  type: PayrollItemType;
  amount: number;
}

export interface PayrollEmployeeSnapshot {
  fullName: string;
  nickname?: string;
  position: string;
  bankName: string;
  accountNumber: string;
  accountName?: string;
}

export interface PayrollSlip {
  id?: string; // <cycleKey>_<employeeId>
  employeeId: string;
  cycleKey: string;
  year: number; // ปี ค.ศ. ของ cycleKey
  payDate: string; // YYYY-MM-DD แอดมินเลือก
  status: PayrollSlipStatus; // 'draft' | 'confirmed'
  salary: number;
  hourlyRate: number;
  otLines: PayrollOTLines;
  otTotal: number;
  ssoAmount: number;
  advanceAmount: number;
  withholdingTax: number;
  items: PayrollSlipItem[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  remark: string;
  snapshot?: PayrollEmployeeSnapshot;
  employeeName?: string;
  position?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  confirmedAt?: number | null;
  confirmedBy?: string | null;
  unconfirmedAt?: number;
  unconfirmedBy?: string;
  unconfirmReason?: string;
  updatedAt: number;
  updatedBy: string;
}



