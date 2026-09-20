import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Case } from '../types';
import { isStuckCase, isNewCase, MinimalUserForStatus } from './caseUtils';

export const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds (259,200,000 ms)

export const AUTO_CANCEL_REMARK = 'เคสไม่คืบหน้าเกิน 3 วัน';
export const AUTO_CANCEL_ACTOR = 'ระบบอัตโนมัติ (เกิน 3 วัน)';

/**
 * Checks if a case is older than 3 days and qualifies for auto-cancellation.
 * 
 * RULES (strictly per user request):
 * 1. อย่ายกเลิกเคสที่ จบเคสแล้ว (status === 'closed' หรือมี completedAt)
 * 2. อย่ายกเลิกเคสที่ถูกยกเลิกแล้ว (status === 'cancelled')
 * 3. ให้ยกเลิกเฉพาะ "เคสค้าง" (isStuckCase) และ "เคสใหม่" (isNewCase) ที่เกิน 3 วันเท่านั้น
 *    (ไม่อนุญาตให้ยกเลิกเคสที่กำลังดำเนินการอยู่หรือเคสที่ปิดแล้ว)
 */
export function isCaseOlderThan3Days(
  c: Case,
  now = Date.now(),
  users?: MinimalUserForStatus[]
): boolean {
  // CRITICAL: NEVER cancel closed or already cancelled cases
  if (c.status === 'closed' || c.status === 'cancelled' || Boolean(c.completedAt)) {
    return false;
  }

  // Only cancel if it is "เคสค้าง" OR "เคสใหม่"
  const isStuck = isStuckCase(c, users);
  const isNew = isNewCase(c, users);

  if (!isStuck && !isNew) {
    return false;
  }

  const createdAt = c.createdAt || 0;
  if (createdAt <= 0) return false;
  return (now - createdAt) > THREE_DAYS_MS;
}

/**
 * Filters all eligible expired cases (stuck or new only, older than 3 days, never closed).
 */
export function getExpiredCases(
  cases: Case[],
  now = Date.now(),
  users?: MinimalUserForStatus[]
): Case[] {
  return cases.filter((c) => isCaseOlderThan3Days(c, now, users));
}

// In-memory set to prevent duplicate parallel cancellation attempts for the same case
const inFlightCancellation = new Set<string>();

/**
 * Automatically cancels cases that have exceeded 3 days without completion,
 * moves their status to 'cancelled', and sets remarks to 'เคสไม่คืบหน้าเกิน 3 วัน'.
 * Strictly affects only "เคสค้าง" and "เคสใหม่" (NEVER closed cases).
 */
export async function autoCancelExpiredCases(
  cases: Case[],
  triggerSource: 'auto' | 'manual' = 'auto',
  users?: MinimalUserForStatus[]
): Promise<{ count: number; cancelledCases: Case[] }> {
  const expiredCases = getExpiredCases(cases, Date.now(), users).filter((c) => !inFlightCancellation.has(c.id));

  if (expiredCases.length === 0) {
    return { count: 0, cancelledCases: [] };
  }

  // Mark all as in-flight
  expiredCases.forEach((c) => inFlightCancellation.add(c.id));

  const cancelledCases: Case[] = [];
  const now = Date.now();

  try {
    // Process in parallel with safe error handling
    await Promise.all(
      expiredCases.map(async (c) => {
        try {
          // Extra safeguard: NEVER cancel if closed or already cancelled
          if (c.status === 'closed' || c.status === 'cancelled' || Boolean(c.completedAt)) {
            return;
          }

          const caseRef = doc(db, 'cases', c.id);
          
          // Preserve existing remark if any, appending the standard auto-cancel note
          const existingRemark = (c.remarks || '').trim();
          const finalRemarks = existingRemark && !existingRemark.includes(AUTO_CANCEL_REMARK)
            ? `${existingRemark} | ${AUTO_CANCEL_REMARK}`
            : AUTO_CANCEL_REMARK;

          await updateDoc(caseRef, {
            status: 'cancelled',
            cancelledAt: now,
            cancelledBy: AUTO_CANCEL_ACTOR,
            remarks: finalRemarks,
            remarksUpdatedAt: now,
            remarksUpdatedBy: AUTO_CANCEL_ACTOR,
            updatedAt: now,
          });

          // Log activity for audit trail
          try {
            await addDoc(collection(db, 'activities'), {
              type: 'cancel_case',
              actorId: 'system_auto_cancel',
              actorName: 'ระบบอัตโนมัติ',
              actorAvatarEmoji: '🤖',
              description: `ยกเลิกเคสอัตโนมัติ (เกิน 3 วัน) ${c.iphoneModel || 'เคส'} (${c.agentName || 'ทั่วไป'}) - ${AUTO_CANCEL_REMARK}`,
              caseId: c.id,
              iphoneModel: c.iphoneModel,
              timestamp: now,
            });
          } catch (logErr) {
            console.warn('Failed to log activity for auto-cancelled case:', logErr);
          }

          cancelledCases.push(c);
        } catch (err) {
          console.error(`Error auto-cancelling case ${c.id}:`, err);
        } finally {
          inFlightCancellation.delete(c.id);
        }
      })
    );

    return { count: cancelledCases.length, cancelledCases };
  } catch (error) {
    console.error('Fatal error during autoCancelExpiredCases:', error);
    return { count: cancelledCases.length, cancelledCases };
  }
}
