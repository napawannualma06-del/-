import { Case } from '../types';

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
