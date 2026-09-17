import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  writeBatch, 
  updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { CreditCheckDuty, UserProfile, Case } from '../types';

export interface ShiftActionResult {
  success: boolean;
  returnedCasesCount: number;
  returnedCaseIds: string[];
  message: string;
}

/**
 * บันทึก "เลิกงาน" สำหรับพนักงาน:
 * 1. ดึงเคสทั้งหมดที่พนักงานกำลังทำอยู่ (status = 'processing' หรือ 'credit_check')
 * 2. ปรับสถานะเคสเหล่านั้นทั้งหมดกลับเป็น "รอรับเคส" (status = 'pending') พร้อมเคลียร์ผู้รับผิดชอบ
 * 3. ปลดพนักงานออกจากเวรเช็คเครดิต (ถ้ามี)
 * 4. ปรับสถานะพนักงานเป็น 'off_work' ใน users/{uid}
 */
export async function clockOutEmployee(
  employeeId: string, 
  employeeName?: string
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
    const batch = writeBatch(db);
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
    activeDocs.forEach((caseData, caseId) => {
      const caseDocRef = doc(db, 'cases', caseId);
      returnedCaseIds.push(caseId);
      
      const currentRemarks = caseData.remarks ? `${caseData.remarks} | ` : '';
      const updatePayload: Record<string, unknown> = {
        status: 'pending',
        assigneeId: '',
        assigneeName: '',
        updatedAt: now,
        remarks: `${currentRemarks}[พนักงานเลิกงาน: ส่งกลับไปรอรับเคส]`,
        remarksUpdatedAt: now,
        remarksUpdatedBy: 'ระบบจัดการกะ',
      };
      
      batch.update(caseDocRef, updatePayload);
    });

    // 3. ปรับสถานะพนักงานในคอลเลกชัน users เป็น 'off_work'
    const userDocRef = doc(db, 'users', employeeId);
    batch.update(userDocRef, {
      workStatus: 'off_work',
      offWorkAt: now,
      updatedAt: now,
    });

    // 4. บันทึก Batch ทันที
    await batch.commit();

    // 5. ปลดออกจากเวรเช็คเครดิต (ถ้ามี)
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
export async function clockInEmployee(employeeId: string): Promise<{ success: boolean; message: string }> {
  if (!employeeId) {
    return { success: false, message: 'ไม่พบรหัสพนักงาน' };
  }

  try {
    const userDocRef = doc(db, 'users', employeeId);
    await updateDoc(userDocRef, {
      workStatus: 'working',
      offWorkAt: null,
      updatedAt: Date.now(),
    });

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
