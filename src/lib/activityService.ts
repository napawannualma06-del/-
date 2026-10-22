import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ActivityLog } from '../types';

/**
 * บันทึก System Action (การกระทำใดๆ ในระบบ เช่น สร้างเคส, รับเคส, ใส่หมายเหตุ, แชท, OT ฯลฯ)
 * อัปเดต timestamp ความเคลื่อนไหวทางธุรกิจของพนักงาน
 */
export async function recordSystemAction(actorId: string, _actionName?: string): Promise<void> {
  if (!actorId) return;
  const now = Date.now();

  // 1. บันทึกลง localStorage เพื่อ sync ระหว่างแท็บ
  try {
    localStorage.setItem(`qmanage_last_action_${actorId}`, String(now));
  } catch (_) {}

  // 2. ส่ง custom event ภายใน window
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('system-action', { detail: { actorId, timestamp: now } }));
  }

  // 3. บันทึก lastActionAt ลง Firestore document ของพนักงาน
  try {
    const userDocRef = doc(db, 'users', actorId);
    await updateDoc(userDocRef, {
      lastActionAt: now,
      updatedAt: now,
    });
  } catch (err) {
    // Silently ignore if user is demo/transient or temporary network
  }
}

/**
 * บันทึก Activity Log สำหรับประวัติการกระทำเคส
 * พร้อมอัปเดต lastActionAt ให้พนักงานโดยอัตโนมัติ
 */
export async function logActivity(activity: Omit<ActivityLog, 'id' | 'timestamp'>) {
  try {
    const now = Date.now();
    const activitiesRef = collection(db, 'activities');
    await addDoc(activitiesRef, {
      ...activity,
      timestamp: now,
    });

    if (activity.actorId) {
      recordSystemAction(activity.actorId, activity.type);
    }
  } catch (error) {
    console.warn('Failed to log activity:', error);
  }
}
