import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ActivityLog } from '../types';

const ACTION_HEARTBEAT_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes
const lastActionWriteByUser: Record<string, number> = {};

function shouldWriteUserActivityTimestamp(userId: string, force = false): boolean {
  if (!userId || userId === 'unknown' || userId === 'system' || userId === 'admin') {
    return false;
  }
  if (!force && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return false;
  }
  const now = Date.now();
  const lastWrite = lastActionWriteByUser[userId] || 0;
  if (!force && now - lastWrite < ACTION_HEARTBEAT_THROTTLE_MS) {
    return false;
  }
  lastActionWriteByUser[userId] = now;
  return true;
}

/**
 * Records an active system action timestamp (`lastActionAt` & `lastActiveAt`) on the employee's user document.
 * Throttled to at most once every 30 minutes unless `force = true`.
 */
export async function recordSystemAction(userId?: string, _actionName?: string, force = false) {
  if (!userId || !shouldWriteUserActivityTimestamp(userId, force)) return;
  const now = Date.now();
  try {
    await updateDoc(doc(db, 'users', userId), {
      lastActionAt: now,
      lastActiveAt: now,
    });
  } catch {
    // Ignore transient update errors
  }
}

export async function logActivity(params: Omit<ActivityLog, 'id' | 'timestamp'>) {
  const now = Date.now();
  try {
    // Remove undefined values to prevent Firestore errors
    const cleanData: Record<string, unknown> = {
      type: params.type,
      actorId: params.actorId,
      actorName: params.actorName,
      description: params.description,
      timestamp: now,
    };

    if (params.actorAvatarEmoji) cleanData.actorAvatarEmoji = params.actorAvatarEmoji;
    if (params.caseId) cleanData.caseId = params.caseId;
    if (params.caseKey) cleanData.caseKey = params.caseKey;
    if (params.iphoneModel) cleanData.iphoneModel = params.iphoneModel;
    if (params.contractNumber) cleanData.contractNumber = params.contractNumber;

    await addDoc(collection(db, 'activities'), cleanData);

    // Item 9: Immediately update lastActionAt & lastActiveAt when creating, accepting, or closing a case;
    // otherwise throttle to at most once every 30 minutes.
    const isImmediateCaseAction =
      params.type === 'create_case' ||
      params.type === 'accept_case' ||
      params.type === 'close_case';

    if (params.actorId && shouldWriteUserActivityTimestamp(params.actorId, isImmediateCaseAction)) {
      updateDoc(doc(db, 'users', params.actorId), {
        lastActionAt: now,
        lastActiveAt: now,
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
