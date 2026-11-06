import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { Case } from '../types';
import { logActivity } from './activityService';

const HEARTBEAT_MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const lastHeartbeatWriteByUser: Record<string, number> = {};

export interface ShiftActionResult {
  returnedCasesCount: number;
  success: boolean;
  error?: string;
}

/**
 * Clocks out an employee ("เลิกงาน") and returns all of their active cases
 * ('credit_check' or 'processing') back to 'pending' (รอรับเคส) while preserving
 * the previous assignee information ("เคยทำโดย: [Name]") and adding a clear return note.
 * Uses preloaded active cases if provided to avoid extra Firestore reads.
 */
export async function clockOutEmployeeAndReturnCases(
  employeeId: string,
  employeeName: string,
  triggeredByName?: string,
  knownCases?: Case[]
): Promise<ShiftActionResult> {
  if (!employeeId) {
    return { returnedCasesCount: 0, success: false, error: 'ไม่พบรหัสพนักงาน' };
  }

  try {
    let activeCases: Case[] = [];

    if (Array.isArray(knownCases) && knownCases.length > 0) {
      activeCases = knownCases.filter(
        (c) =>
          (c.status === 'credit_check' || c.status === 'processing') &&
          (c.assigneeId === employeeId || (employeeName && c.assigneeName === employeeName))
      );
    } else {
      const qById = query(
        collection(db, 'cases'),
        where('status', 'in', ['credit_check', 'processing'])
      );
      const snapById = await getDocs(qById);
      const activeCasesMap = new Map<string, Case>();
      snapById.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() } as Case;
        if (data.assigneeId === employeeId || (employeeName && data.assigneeName === employeeName)) {
          activeCasesMap.set(docSnap.id, data);
        }
      });
      activeCases = Array.from(activeCasesMap.values());
    }

    const batch = writeBatch(db);
    const now = Date.now();

    // Update user's workStatus to 'off_work'
    const userRef = doc(db, 'users', employeeId);
    batch.update(userRef, {
      workStatus: 'off_work',
      offWorkAt: now,
    });

    const actorDisplay =
      triggeredByName && triggeredByName !== employeeName
        ? `${employeeName} (บันทึกเลิกงานโดย ${triggeredByName})`
        : `${employeeName} (เลิกงาน)`;

    activeCases.forEach((c) => {
      const caseRef = doc(db, 'cases', c.id);
      const returnReason = 'พนักงานเลิกงาน — คืนเคสกลับคิวเพื่อให้ทีมทำต่อ';

      batch.update(caseRef, {
        status: 'pending',
        assigneeId: null,
        assigneeName: null,
        previousAssigneeId: c.assigneeId || employeeId,
        previousAssigneeName: c.assigneeName || employeeName,
        returnedBy: actorDisplay,
        returnedById: employeeId,
        returnedAt: now,
        returnedReason: returnReason,
        updatedAt: now,
      });
    });

    await batch.commit();

    logActivity({
      type: 'clock_out',
      actorId: employeeId,
      actorName: employeeName,
      description:
        activeCases.length > 0
          ? `ออกกะ/เลิกงาน และคืนเคสกลับเข้าคิว ${activeCases.length} เคส`
          : `ออกกะ/เลิกงานเรียบร้อยแล้ว`,
    }).catch(() => {});

    return {
      returnedCasesCount: activeCases.length,
      success: true,
    };
  } catch (error: any) {
    console.error('Error clocking out and returning cases:', error);
    return {
      returnedCasesCount: 0,
      success: false,
      error: error?.message || 'เกิดข้อผิดพลาดในการบันทึกเลิกงาน',
    };
  }
}

/**
 * Clocks in an employee ("เข้างาน" / "พร้อมรับเคส")
 */
export async function clockInEmployee(employeeId: string): Promise<boolean> {
  if (!employeeId) return false;
  try {
    const now = Date.now();
    const userRef = doc(db, 'users', employeeId);
    await updateDoc(userRef, {
      workStatus: 'working',
      lastActiveAt: now,
      lastActionAt: now,
      clockedInAt: now,
      autoClockOutReason: '',
    });
    lastHeartbeatWriteByUser[employeeId] = now;
    return true;
  } catch (error) {
    console.error('Error clocking in employee:', error);
    return false;
  }
}

/**
 * Updates the employee's lastActiveAt heartbeat in Firestore.
 * Throttled to write no more frequently than once every 30 minutes while tab is visible,
 * unless force = true (e.g. when confirming active status or performing core case actions).
 */
export async function updateEmployeeHeartbeat(employeeId: string, force = false): Promise<void> {
  if (!employeeId) return;
  if (!force && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  const now = Date.now();
  const lastWrite = lastHeartbeatWriteByUser[employeeId] || 0;
  if (!force && now - lastWrite < HEARTBEAT_MIN_INTERVAL_MS) {
    return;
  }
  lastHeartbeatWriteByUser[employeeId] = now;
  try {
    await updateDoc(doc(db, 'users', employeeId), {
      lastActiveAt: now,
      ...(force ? { lastActionAt: now } : {}),
    });
  } catch {
    // Ignore transient heartbeat errors
  }
}

/**
 * Automatically clocks out an inactive employee ("ว่างงานอัตโนมัติ") after inactivity timeout (3 hours)
 * and returns all of their active cases ('credit_check' or 'processing') back to 'pending'
 * using in-memory store cases without querying Firestore again.
 */
export async function autoClockOutInactiveEmployee(
  employeeId: string,
  employeeName: string,
  reason = 'ไม่มีการเคลื่อนไหวในระบบเกิน 3 ชั่วโมง',
  knownCases?: Case[]
): Promise<{ returnedCasesCount: number; success: boolean; alreadyOffWork?: boolean }> {
  if (!employeeId) {
    return { returnedCasesCount: 0, success: false };
  }

  try {
    const userRef = doc(db, 'users', employeeId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.workStatus === 'off_work') {
        return { returnedCasesCount: 0, success: true, alreadyOffWork: true };
      }
    }

    let activeCases: Case[] = [];
    if (Array.isArray(knownCases)) {
      activeCases = knownCases.filter(
        (c) =>
          (c.status === 'credit_check' || c.status === 'processing') &&
          (c.assigneeId === employeeId || (employeeName && c.assigneeName === employeeName))
      );
    } else {
      const qActive = query(
        collection(db, 'cases'),
        where('status', 'in', ['credit_check', 'processing'])
      );
      const snapActive = await getDocs(qActive);
      const activeCasesMap = new Map<string, Case>();
      snapActive.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() } as Case;
        if (data.assigneeId === employeeId || (employeeName && data.assigneeName === employeeName)) {
          activeCasesMap.set(docSnap.id, data);
        }
      });
      activeCases = Array.from(activeCasesMap.values());
    }

    const batch = writeBatch(db);
    const now = Date.now();

    batch.update(userRef, {
      workStatus: 'off_work',
      offWorkAt: now,
      autoClockOutReason: reason,
    });

    activeCases.forEach((c) => {
      const caseRef = doc(db, 'cases', c.id);
      batch.update(caseRef, {
        status: 'pending',
        assigneeId: null,
        assigneeName: null,
        previousAssigneeId: c.assigneeId || employeeId,
        previousAssigneeName: c.assigneeName || employeeName,
        returnedBy: `${employeeName} (ระบบพักงานอัตโนมัติ)`,
        returnedById: employeeId,
        returnedAt: now,
        returnedReason: `คืนเคสอัตโนมัติ: ${reason}`,
        updatedAt: now,
      });
    });

    await batch.commit();

    logActivity({
      type: 'auto_clock_out',
      actorId: employeeId,
      actorName: employeeName,
      description:
        activeCases.length > 0
          ? `เปลี่ยนเป็นว่างงานอัตโนมัติ (${reason}) และคืนเคสกลับเข้าคิว ${activeCases.length} เคส`
          : `เปลี่ยนเป็นว่างงานอัตโนมัติ (${reason})`,
    }).catch(() => {});

    return {
      returnedCasesCount: activeCases.length,
      success: true,
    };
  } catch (error) {
    console.error('Error in autoClockOutInactiveEmployee:', error);
    return { returnedCasesCount: 0, success: false };
  }
}

export const clockOutEmployee = clockOutEmployeeAndReturnCases;
