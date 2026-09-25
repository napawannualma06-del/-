export type Role = 'employee' | 'admin';
export type WorkStatus = 'working' | 'off_work';

export interface UserProfile {
  uid: string;
  username: string;
  name: string;
  role: Role;
  pin?: string;
  email?: string;
  fcmToken?: string;
  workStatus?: WorkStatus;
  offWorkAt?: number;
  avatarEmoji?: string;
  createdAt: number;
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
}

export interface Case {
  id: string;
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
  completedAt?: number;
  cancelledAt?: number;
  cancelledBy?: string;
}

export interface ActivityLog {
  id: string;
  type: 'create_case' | 'accept_case' | 'stuck_case' | 'return_case' | 'transfer_case' | 'close_case' | 'contract_case' | 'remark_case' | 'cancel_case';
  actorId: string;
  actorName: string;
  actorAvatarEmoji?: string;
  description: string;
  caseId?: string;
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


