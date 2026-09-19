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
  }

  return null;
}

/**
 * A case is considered "stuck" (เคสค้าง) ONLY if it has been explicitly marked as stuck,
 * returned by someone who worked on it, or previously had an assignee.
 * A newly created case with remarks is NOT stuck as long as no one has ever claimed/accepted it.
 */
export function isStuckCase(c: Case): boolean {
  return Boolean(
    c.isStuck ||
    c.previousAssigneeName?.trim() ||
    c.previousAssigneeId?.trim() ||
    c.returnedBy?.trim() ||
    c.returnedById?.trim() ||
    getPreviousAssignee(c) !== null
  );
}

/**
 * A case is "new" (เคสใหม่) if it is waiting to be claimed (pending)
 * and no one has ever claimed or worked on it yet, regardless of whether it has remarks.
 */
export function isNewCase(c: Case): boolean {
  return c.status === 'pending' && !isStuckCase(c);
}
