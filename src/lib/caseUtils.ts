import { Case } from '../types';

export interface PreviousAssigneeInfo {
  name: string;
  id?: string;
  returnedAt?: number;
  reason?: string;
}

/**
 * Returns previous assignee info if the case was returned.
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
    const match = caseData.remarks.match(/\[คืนสถานะไปรอรับเคส โดย ([^\]|:]+?)(?: เหตุผล:\s*([^\]]+?))?\]/);
    if (match && match[1]) {
      return {
        name: match[1].trim(),
        returnedAt: caseData.remarksUpdatedAt || caseData.updatedAt,
        reason: match[2]?.trim(),
      };
    }
  }

  return null;
}
