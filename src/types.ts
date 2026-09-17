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
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  cancelledAt?: number;
}
