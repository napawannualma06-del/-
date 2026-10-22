import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  writeBatch, 
  updateDoc,
  addDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { CreditCheckDuty, UserProfile, Case } from '../types';

export interface ShiftActionResult {
  success: boolean;
  returnedCasesCount: number;
  returnedCaseIds: string[];
  message: string;
}

export const AUTO_CLOCKOUT_INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 hours in ms

/**
 * บันทึก "เลิกงาน" สำหรับพนักงาน (ทั้งแบบปกติและระบบออกงานอัตโนมัติ):
 * 1. ดึงเคสทั้งหมดที่พนักงานกำลังทำอยู่ (status = 'processing' หรือ 'credit_check')
 * 2. ปรับสถานะเคสเหล่านั้นทั้งหมดกลับเป็น "รอรับเคส" (status = 'pending') พร้อมเคลียร์ผู้รับผิดชอบ
 * 3. ปลดพนักงานออกจากเวรเช็คเครดิต (ถ้ามี)
 * 4. ปรับสถานะพนักงานเป็น 'off_work' ใน users/{uid}
 * 5. บันทึกประวัติ Activity Log แจ้งเตือนทีมงาน
 */
export async function clockOutEmployee(
  employeeId: string, 
  employeeName?: string,
  reason: string = 'พนักงานออกงาน/เลิกงาน',
  isAuto: boolean = false
): Promise<ShiftActionResult> {
  if (!employeeId) {
    return {
      success: false,
      returnedCasesCount: 0,
      returnedCaseIds: [],
      message: 'ไม่พบรหัสพนักงาน',
    };
  }

  try {
    const now = Date.now();
    const returnedCaseIds: string[] = [];

    // 1. ค้นหาเคสที่พนักงานกำลังถือครองอยู่ (ทั้งด้วย uid และ name)
    const casesRef = collection(db, 'cases');
    const qByUid = query(
      casesRef,
      where('assigneeId', '==', employeeId)
    );
    const snapByUid = await getDocs(qByUid);

    const activeDocs = new Map<string, Case>();

    snapByUid.forEach((d) => {
      const data = d.data() as Case;
      if (data.status === 'processing' || data.status === 'credit_check') {
        activeDocs.set(d.id, data);
      }
    });

    // หากมีการระบุ employeeName ให้เช็คเผื่อเคสเก่าที่บันทึกด้วยชื่อ
    if (employeeName && employeeName.trim()) {
      const qByName = query(
        casesRef,
        where('assigneeName', '==', employeeName.trim())
      );
      const snapByName = await getDocs(qByName);
      snapByName.forEach((d) => {
        const data = d.data() as Case;
        if (data.status === 'processing' || data.status === 'credit_check') {
          activeDocs.set(d.id, data);
        }
      });
    }

    // 2. คืนเคสทั้งหมดกลับไปเป็น "รอรับเคส" (status: 'pending')
    const caseEntries = Array.from(activeDocs.entries());
    const CHUNK_SIZE = 400;
    const actorLabel = isAuto 
      ? 'ระบบออกงานอัตโนมัติ (ไม่มีการเคลื่อนไหวเกิน 2 ชม.)'
      : (employeeName || 'พนักงานเลิกงาน');

    for (let i = 0; i < caseEntries.length; i += CHUNK_SIZE) {
      const chunk = caseEntries.slice(i, i + CHUNK_SIZE);
      const chunkBatch = writeBatch(db);

      chunk.forEach(([caseId, caseData]) => {
        const caseDocRef = doc(db, 'cases', caseId);
        returnedCaseIds.push(caseId);
        
        const currentRemarks = caseData.remarks ? `${caseData.remarks} | ` : '';
        const remarkTag = isAuto
          ? '[ระบบออกงานอัตโนมัติ (ไม่มีการเคลื่อนไหวเกิน 2 ชม.): ส่งกลับไปรอรับเคส]'
          : '[พนักงานเลิกงาน: ส่งกลับไปรอรับเคส]';
        const rawRemarks = `${currentRemarks}${remarkTag}`;
        const safeRemarks = rawRemarks.length > 4500 ? rawRemarks.slice(-4500) : rawRemarks;
        
        const updatePayload: Record<string, unknown> = {
          status: 'pending',
          isStuck: true,
          assigneeId: '',
          assigneeName: '',
          acceptedAt: null,
          previousAssigneeName: caseData.assigneeName || employeeName || '',
          previousAssigneeId: caseData.assigneeId || employeeId || '',
          stuckAt: now,
          stuckBy: actorLabel,
          stuckReason: isAuto ? 'ไม่มีการเคลื่อนไหวเกิน 2 ชั่วโมง' : reason,
          returnedAt: now,
          returnedBy: actorLabel,
          returnedReason: isAuto ? 'ระบบออกงานอัตโนมัติ (ไม่มีการเคลื่อนไหวเกิน 2 ชม.)' : reason,
          updatedAt: now,
          remarks: safeRemarks,
          remarksUpdatedAt: now,
          remarksUpdatedBy: isAuto ? 'ระบบออกงานอัตโนมัติ' : 'ระบบจัดการกะ',
        };
        
        chunkBatch.update(caseDocRef, updatePayload);
      });

      await chunkBatch.commit();
    }

    // 3. ปรับสถานะพนักงานในคอลเลกชัน users เป็น 'off_work'
    let userDocRef = doc(db, 'users', employeeId);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists() && employeeName) {
      const qUser = query(collection(db, 'users'), where('username', '==', employeeName.toLowerCase()));
      const snapUser = await getDocs(qUser);
      if (!snapUser.empty) {
        userDocRef = doc(db, 'users', snapUser.docs[0].id);
      }
    }
    
    await updateDoc(userDocRef, {
      workStatus: 'off_work',
      offWorkAt: now,
      autoClockOutReason: isAuto ? (reason || 'ไม่มีการเคลื่อนไหวเกิน 2 ชั่วโมง') : null,
      updatedAt: now,
    });

    // 4. ปลดออกจากเวรเช็คเครดิต (ถ้ามี)
    try {
      const dutyDocRef = doc(db, 'system_duties', 'credit_check');
      const dutySnap = await getDoc(dutyDocRef);
      if (dutySnap.exists()) {
        const dutyData = dutySnap.data() as CreditCheckDuty;
        const currentWorkers = dutyData.workers || [];
        const isWorkerInDuty = currentWorkers.some(
          (w) => w.uid === employeeId || (employeeName && w.name === employeeName)
        );
        if (isWorkerInDuty) {
          const updatedWorkers = currentWorkers.filter(
            (w) => w.uid !== employeeId && (!employeeName || w.name !== employeeName)
          );
          await updateDoc(dutyDocRef, {
            workers: updatedWorkers,
            updatedAt: now,
          });
        }
      }
    } catch (e) {
      console.warn('Could not remove worker from credit check duty on clock out', e);
    }

    // 5. บันทึกกิจกรรมลง Activity Log
    try {
      await addDoc(collection(db, 'activities'), {
        type: isAuto ? 'auto_clock_out' : 'clock_out',
        actorId: employeeId,
        actorName: employeeName || 'พนักงาน',
        description: isAuto
          ? `ระบบออกงานอัตโนมัติให้ ${employeeName || 'พนักงาน'} (ไม่มีการเคลื่อนไหวเกิน 2 ชม.)${returnedCaseIds.length > 0 ? ` ส่งคืนเคส ${returnedCaseIds.length} เคส` : ''}`
          : `ลงเวลาเลิกงาน${returnedCaseIds.length > 0 ? ` ส่งคืนเคสกลับไปรอรับใหม่ ${returnedCaseIds.length} เคส` : ''}`,
        timestamp: now,
      });
    } catch (e) {
      console.warn('Could not record activity log for shift action', e);
    }

    return {
      success: true,
      returnedCasesCount: returnedCaseIds.length,
      returnedCaseIds,
      message: returnedCaseIds.length > 0
        ? `บันทึกเลิกงานสำเร็จ ส่งเคสคืนกลับไปรอรับใหม่จำนวน ${returnedCaseIds.length} เคส`
        : 'บันทึกเลิกงานสำเร็จ ไม่มีเคสค้างที่ต้องส่งคืน',
    };
  } catch (error) {
    console.error('Clock out error:', error);
    handleFirestoreError(error, OperationType.UPDATE, `users/${employeeId}`);
    return {
      success: false,
      returnedCasesCount: 0,
      returnedCaseIds: [],
      message: 'เกิดข้อผิดพลาดในการบันทึกเลิกงาน: ' + (error as Error).message,
    };
  }
}

/**
 * บันทึก "เข้างาน" (เริ่มกะใหม่) สำหรับพนักงาน
 */
export async function clockInEmployee(employeeId: string, employeeName?: string): Promise<{ success: boolean; message: string }> {
  if (!employeeId) {
    return { success: false, message: 'ไม่พบรหัสพนักงาน' };
  }

  try {
    let userDocRef = doc(db, 'users', employeeId);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      const qUser = query(collection(db, 'users'), where('username', '==', employeeId.toLowerCase()));
      const snapUser = await getDocs(qUser);
      if (!snapUser.empty) {
        userDocRef = doc(db, 'users', snapUser.docs[0].id);
      }
    }

    const now = Date.now();
    await updateDoc(userDocRef, {
      workStatus: 'working',
      offWorkAt: null,
      clockedInAt: now,
      lastActionAt: now,
      lastActiveAt: now,
      autoClockOutReason: null,
      updatedAt: now,
    });

    try {
      await addDoc(collection(db, 'activities'), {
        type: 'clock_in',
        actorId: employeeId,
        actorName: employeeName || (snap.exists() ? (snap.data() as UserProfile).name : 'พนักงาน'),
        description: `ลงเวลาเข้างาน พร้อมรับเคสแล้ว`,
        timestamp: now,
      });
    } catch (_) {}

    return {
      success: true,
      message: 'บันทึกเข้างานสำเร็จ พร้อมรับเคสแล้ว',
    };
  } catch (error) {
    console.error('Clock in error:', error);
    handleFirestoreError(error, OperationType.UPDATE, `users/${employeeId}`);
    return {
      success: false,
      message: 'เกิดข้อผิดพลาดในการบันทึกเข้างาน: ' + (error as Error).message,
    };
  }
}

/**
 * อัปเดต Heartbeat ความเคลื่อนไหวล่าสุดของพนักงานลงใน Firestore
 */
export async function updateEmployeeHeartbeat(employeeId: string): Promise<void> {
  if (!employeeId) return;
  try {
    const userDocRef = doc(db, 'users', employeeId);
    await updateDoc(userDocRef, {
      lastActiveAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (e) {
    // Silently ignore transient errors for heartbeats
  }
}

/**
 * ตรวจสอบและออกงานอัตโนมัติให้พนักงานที่ไม่มีการเคลื่อนไหวเกิน 2 ชั่วโมง
 */
export async function autoClockOutInactiveEmployee(
  employeeId: string, 
  employeeName: string,
  reason: string = 'ไม่มีการสร้างเคส รับเคส ใส่หมายเหตุ หรือแอคชั่นในระบบเกิน 2 ชั่วโมง'
): Promise<ShiftActionResult> {
  return await clockOutEmployee(
    employeeId,
    employeeName,
    reason,
    true
  );
}
