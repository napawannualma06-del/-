import { Case } from '../types';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';

export interface PreviousAssigneeInfo {
  name: string;
  id?: string;
  returnedAt?: number;
  reason?: string;
}

/**
 * Returns previous assignee info if the case was returned or held.
 * Supports both explicit fields and historical remark parsing.
 */
export function getPreviousAssignee(caseData: Case): PreviousAssigneeInfo | null {
  if (caseData.previousAssigneeName?.trim()) {
    return {
      name: caseData.previousAssigneeName.trim(),
      id: caseData.previousAssigneeId,
      returnedAt: caseData.returnedAt,
      reason: caseData.returnedReason,
    };
  }

  // Fallback: parse from remarks for historical cases
  if (caseData.remarks) {
    const returnMatch = caseData.remarks.match(/\[คืนสถานะไปรอรับเคส โดย ([^\]|:]+?)(?: เหตุผล:\s*([^\]]+?))?\]/);
    if (returnMatch && returnMatch[1]) {
      return {
        name: returnMatch[1].trim(),
        returnedAt: caseData.remarksUpdatedAt || caseData.updatedAt,
        reason: returnMatch[2]?.trim(),
      };
    }
    const holdMatch = caseData.remarks.match(/\[เคสค้าง โดย ([^\]|:]+?)(?::\s*([^\]]+?))?\]/);
    if (holdMatch && holdMatch[1]) {
      return {
        name: holdMatch[1].trim(),
        returnedAt: caseData.remarksUpdatedAt || caseData.updatedAt,
        reason: holdMatch[2]?.trim(),
      };
    }
    const offWorkMatch = caseData.remarks.match(/\[พนักงานเลิกงาน.*?\]/);
    if (offWorkMatch) {
      return {
        name: caseData.previousAssigneeName || 'พนักงานเลิกงาน',
        returnedAt: caseData.remarksUpdatedAt || caseData.updatedAt,
        reason: 'พนักงานออกงาน/เลิกงาน',
      };
    }
  }

  return null;
}

export interface MinimalUserForStatus {
  uid?: string;
  name?: string;
  username?: string;
  workStatus?: string;
}

/**
 * A case is considered "stuck" (เคสค้าง) ONLY if:
 * 1. It is currently being worked on (status === 'processing' || status === 'credit_check')
 *    BUT the assigned worker has CLOCKED OUT / OFF WORK (workStatus === 'off_work').
 * 2. It is pending in queue (status === 'pending') and was explicitly marked as stuck (isStuck),
 *    returned by someone, or the previous worker clocked out / held the case.
 * 
 * CRITICAL RULE:
 * If someone is currently working on the case (c.status === 'processing' || c.status === 'credit_check')
 * and has NOT clocked out (not off_work), it is strictly "กำลังทำ" (In Progress) and MUST NOT
 * show in "เคสค้าง" until they clock out or press hold!
 */
export function isStuckCase(c: Case, users?: MinimalUserForStatus[]): boolean {
  if (c.status === 'closed' || c.status === 'cancelled') {
    return false;
  }

  // Active cases (someone is currently assigned and working on it)
  if (c.status === 'processing' || c.status === 'credit_check') {
    // Check if the assigned worker has clocked out (ออกงาน)
    if (users && (c.assigneeId || c.assigneeName)) {
      const assigneeUser = users.find(
        (u) => (c.assigneeId && u.uid === c.assigneeId) ||
               (c.assigneeName && (u.name === c.assigneeName || u.username === c.assigneeName))
      );
      if (assigneeUser && assigneeUser.workStatus === 'off_work') {
        return true;
      }
    }
    // As long as the worker is on duty / working, it is NOT stuck
    return false;
  }

  // Cases waiting in queue (pending)
  if (c.status === 'pending') {
    return Boolean(
      c.isStuck ||
      c.previousAssigneeName?.trim() ||
      c.previousAssigneeId?.trim() ||
      c.returnedBy?.trim() ||
      c.returnedById?.trim() ||
      c.stuckBy?.trim() ||
      getPreviousAssignee(c) !== null
    );
  }

  return Boolean(c.isStuck);
}

/**
 * A case is "new" (เคสใหม่) if it is waiting to be claimed (pending)
 * and no one has ever claimed or worked on it yet, regardless of whether it has remarks.
 */
export function isNewCase(c: Case, users?: MinimalUserForStatus[]): boolean {
  return c.status === 'pending' && !isStuckCase(c, users);
}

/**
 * A case is "in progress" (กำลังทำ) if someone has claimed it and is actively working on it,
 * and they have NOT clocked out.
 */
export function isInProgressCase(c: Case, users?: MinimalUserForStatus[]): boolean {
  if (c.status === 'closed' || c.status === 'cancelled') return false;
  if (c.status !== 'processing' && c.status !== 'credit_check') return false;
  return !isStuckCase(c, users);
}

/**
 * คำนวณระยะเวลาของเคส (มิลลิวินาที)
 * - ถ้าเคสปิดแล้ว: คืนค่า durationMs ที่บันทึกไว้ หรือคำนวณจาก completedAt - (acceptedAt || createdAt)
 * - ถ้ากำลังดำเนินการ (processing / credit_check): คืนค่าระยะเวลาตั้งแต่รับเคสจนถึงปัจจุบัน
 */
export function getCaseDurationMs(c: Case): number {
  if (typeof c.durationMs === 'number' && c.durationMs >= 0) {
    return c.durationMs;
  }
  if (c.status === 'closed' && c.completedAt) {
    const startTime = c.acceptedAt || c.createdAt || 0;
    return startTime > 0 ? Math.max(0, c.completedAt - startTime) : 0;
  }
  if (c.status === 'processing' || c.status === 'credit_check') {
    const startTime = c.acceptedAt || c.updatedAt || c.createdAt || Date.now();
    return Math.max(0, Date.now() - startTime);
  }
  return 0;
}

/**
 * แปลงมิลลิวินาทีเป็นข้อความภาษาไทยที่อ่านง่าย เช่น "15 นาที", "1 ชม. 20 นาที"
 */
export function formatDurationThai(
  ms: number,
  options?: { showSeconds?: boolean; compact?: boolean }
): string {
  if (!ms || ms <= 0) {
    if (options?.showSeconds) return '0 วินาที';
    return options?.compact ? '0 น.' : 'น้อยกว่า 1 นาที';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    if (options?.compact) return `${days} วัน ${hours} ชม.`;
    return hours > 0 ? `${days} วัน ${hours} ชม.` : `${days} วัน`;
  }

  if (hours > 0) {
    if (options?.compact) return `${hours} ชม. ${minutes} น.`;
    return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชั่วโมง`;
  }

  if (minutes > 0) {
    if (options?.showSeconds && seconds > 0) {
      if (options?.compact) return `${minutes} น. ${seconds} วิ`;
      return `${minutes} นาที ${seconds} วินาที`;
    }
    if (options?.compact) return `${minutes} น.`;
    return `${minutes} นาที`;
  }

  // < 1 minute
  if (options?.showSeconds && seconds > 0) {
    return `${seconds} วินาที`;
  }
  return options?.compact ? '<1 นาที' : 'น้อยกว่า 1 นาที';
}

export interface CaseTimeStats {
  count: number;
  totalMs: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  averageFormatted: string;
  minFormatted: string;
  maxFormatted: string;
}

/**
 * คำนวณสถิติเวลาของรายการเคสที่จบแล้ว
 */
export function calculateCaseTimeStats(casesList: Case[]): CaseTimeStats {
  const closed = casesList.filter((c) => c.status === 'closed');
  const validDurations: number[] = [];

  for (const c of closed) {
    const dur = getCaseDurationMs(c);
    // Ignore unreasonable outliers like 0 or > 30 days if corrupt
    if (dur > 0 && dur < 30 * 86400 * 1000) {
      validDurations.push(dur);
    }
  }

  if (validDurations.length === 0) {
    return {
      count: 0,
      totalMs: 0,
      averageMs: 0,
      minMs: 0,
      maxMs: 0,
      averageFormatted: '-',
      minFormatted: '-',
      maxFormatted: '-',
    };
  }

  const totalMs = validDurations.reduce((sum, d) => sum + d, 0);
  const averageMs = Math.round(totalMs / validDurations.length);
  const minMs = Math.min(...validDurations);
  const maxMs = Math.max(...validDurations);

  return {
    count: validDurations.length,
    totalMs,
    averageMs,
    minMs,
    maxMs,
    averageFormatted: formatDurationThai(averageMs),
    minFormatted: formatDurationThai(minMs),
    maxFormatted: formatDurationThai(maxMs),
  };
}

/**
 * สุ่ม Key ประจำเคส 6 หลัก (ตัวอักษรและตัวเลขพิมพ์ใหญ่ที่อ่านง่าย)
 * เพื่อระบุว่าเป็นเคสไหนได้อย่างกระชับ ชัดเจน
 */
export function generateCaseKey(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * ดึง Key สุ่ม 6 หลักสำหรับแสดงผล
 * - ถ้ามี caseKey ในข้อมูลเคส จะใช้ค่านั้น
 * - หากเป็นเคสเก่าที่สร้างก่อนหน้านี้และยังไม่มี caseKey จะใช้ 6 ตัวท้ายของ id เป็น fallback
 */
export function getDisplayCaseKey(caseData?: Partial<Case> | null): string {
  if (!caseData) return '';
  if (caseData.caseKey && caseData.caseKey.trim()) {
    return caseData.caseKey.trim().toUpperCase();
  }
  if (caseData.id) {
    const cleanId = caseData.id.replace(/[^a-zA-Z0-9]/g, '');
    return cleanId.slice(-6).toUpperCase();
  }
  return '';
}

/**
 * สุ่ม Key ประจำเคส 6 หลัก พร้อมระบบตรวจสอบฐานข้อมูลว่าไม่ซ้ำกับเคสใดๆ ในระบบ 100%
 * หากตรวจพบว่ารหัสที่สุ่มได้เคยถูกใช้งานแล้ว ระบบจะสุ่มใหม่ทันทีจนกว่าจะได้รหัสที่ไม่ซ้ำ
 */
export async function generateUniqueCaseKey(existingCases?: { caseKey?: string }[]): Promise<string> {
  const inMemoryKeys = new Set(
    (existingCases || [])
      .map(c => c.caseKey?.trim().toUpperCase())
      .filter(Boolean)
  );

  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = generateCaseKey();
    if (inMemoryKeys.has(candidate)) {
      continue;
    }

    try {
      const q = query(
        collection(db, 'cases'),
        where('caseKey', '==', candidate),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        return candidate;
      }
      inMemoryKeys.add(candidate);
    } catch {
      // If offline or network glitch, guarantee in-memory uniqueness
      if (!inMemoryKeys.has(candidate)) {
        return candidate;
      }
    }
  }

  return generateCaseKey();
}
