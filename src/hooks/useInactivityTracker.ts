import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { 
  autoClockOutInactiveEmployee, 
  AUTO_CLOCKOUT_INACTIVITY_MS 
} from '../lib/shiftService';
import { recordSystemAction } from '../lib/activityService';

// 2 ชั่วโมง (7,200,000 มิลลิวินาที)
export const INACTIVITY_TIMEOUT_MS = AUTO_CLOCKOUT_INACTIVITY_MS;
// แจ้งเตือนล่วงหน้า 10 นาที (ที่ 1 ชั่วโมง 50 นาที)
export const INACTIVITY_WARNING_MS = (2 * 60 - 10) * 60 * 1000;

export interface InactivityState {
  isWarning: boolean;
  remainingMs: number;
  isAutoClockedOut: boolean;
  returnedCasesCount: number;
  resetActivity: () => void;
  dismissAutoClockOut: () => void;
}

/**
 * Hook ตรวจสอบความเคลื่อนไหวจาก "แอคชั่นทางธุรกิจในระบบเท่านั้น"
 * (สร้างเคส, รับเคส, ใส่หมายเหตุ, เลขสัญญา, จบเคส, ส่งแชท ฯลฯ)
 * ไม่ใช้การตรวจจับเมาส์/คีย์บอร์ด/การเลื่อนหน้าจอ
 * หากไม่มีการกระทำใดๆ ในระบบเกิน 2 ชั่วโมง จะเปลี่ยนสถานะเป็น "ว่างงาน" อัตโนมัติ
 */
export function useInactivityTracker(): InactivityState {
  const { user, clockOut, registeredUsers, fetchRegisteredUsers } = useStore();
  const [isWarning, setIsWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [isAutoClockedOut, setIsAutoClockedOut] = useState(false);
  const [returnedCasesCount, setReturnedCasesCount] = useState(0);

  const isClockingOutRef = useRef<boolean>(false);
  const sweepLockRef = useRef<boolean>(false);
  const lastLocalActionTimeRef = useRef<number>(Date.now());

  const storageKey = user?.uid ? `qmanage_last_action_${user.uid}` : 'qmanage_last_action_guest';

  // อ่านเวลา action ล่าสุด (sync ข้ามแท็บ)
  const getLatestActionTime = useCallback((): number => {
    let latest = user?.lastActionAt || user?.clockedInAt || user?.createdAt || lastLocalActionTimeRef.current;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > latest) {
          latest = parsed;
        }
      }
    } catch (_) {}
    return latest;
  }, [user?.lastActionAt, user?.clockedInAt, user?.createdAt, storageKey]);

  // ฟัง Custom Event เมื่อมีการทำแอคชั่นในระบบ (สร้างเคส, รับเคส, หมายเหตุ, แชท ฯลฯ)
  useEffect(() => {
    if (!user || user.workStatus !== 'working') {
      setIsWarning(false);
      return;
    }

    const handleSystemAction = () => {
      const now = Date.now();
      lastLocalActionTimeRef.current = now;
      try {
        localStorage.setItem(storageKey, String(now));
      } catch (_) {}
      setIsWarning(false);
    };

    window.addEventListener('system-action', handleSystemAction);
    return () => {
      window.removeEventListener('system-action', handleSystemAction);
    };
  }, [user?.uid, user?.workStatus, storageKey]);

  // ตรวจสอบระยะเวลาที่ไม่มีแอคชั่นในระบบ (รันทุก 5 วินาที)
  useEffect(() => {
    if (!user || user.workStatus !== 'working') {
      setIsWarning(false);
      return;
    }

    const interval = setInterval(async () => {
      if (isClockingOutRef.current) return;

      const latestActionTime = getLatestActionTime();
      const now = Date.now();
      const idleMs = now - latestActionTime;

      // 1. เกิน 2 ชั่วโมงโดยไม่มีการสร้างเคส รับเคส ใส่หมายเหตุ หรือทำแอคชั่นใดๆ -> เปลี่ยนเป็นว่างงาน
      if (idleMs >= INACTIVITY_TIMEOUT_MS) {
        isClockingOutRef.current = true;
        setIsWarning(false);
        try {
          const res = await clockOut('ไม่มีการสร้างเคส รับเคส ใส่หมายเหตุ หรือแอคชั่นในระบบเกิน 2 ชั่วโมง', true);
          setReturnedCasesCount(res.returnedCasesCount || 0);
          setIsAutoClockedOut(true);
        } catch (err) {
          console.error('Auto clock-out error:', err);
        } finally {
          isClockingOutRef.current = false;
        }
        return;
      }

      // 2. ช่วงเตือน 10 นาทีก่อนครบ 2 ชม. (ไม่มีแอคชั่นมา 1 ชม. 50 นาที)
      if (idleMs >= INACTIVITY_WARNING_MS) {
        const timeLeft = Math.max(0, INACTIVITY_TIMEOUT_MS - idleMs);
        setRemainingMs(timeLeft);
        setIsWarning(true);
      } else {
        setIsWarning(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user, clockOut, getLatestActionTime]);

  // ระบบตรวจสอบพนักงานคนอื่นที่เข้างานทิ้งไว้แต่ไม่มีแอคชั่นเกิน 2 ชั่วโมง (รันทุก 1 นาที)
  useEffect(() => {
    if (!user) return;

    const sweepInterval = setInterval(async () => {
      if (sweepLockRef.current) return;
      sweepLockRef.current = true;

      try {
        const now = Date.now();
        const staleWorkers = registeredUsers.filter((u) => {
          if (u.uid === user.uid) return false;
          if (u.workStatus !== 'working') return false;
          const lastAction = Math.max(
            u.lastActionAt || 0,
            u.lastActiveAt || 0,
            u.clockedInAt || 0,
            u.createdAt || 0
          );
          return lastAction > 0 && (now - lastAction > INACTIVITY_TIMEOUT_MS);
        });

        if (staleWorkers.length > 0) {
          for (const worker of staleWorkers) {
            try {
              await autoClockOutInactiveEmployee(
                worker.uid, 
                worker.name, 
                'ไม่มีการสร้างเคส รับเคส ใส่หมายเหตุ หรือแอคชั่นในระบบเกิน 2 ชั่วโมง'
              );
            } catch (err) {
              console.warn('Failed to sweep stale worker', worker.name, err);
            }
          }
          await fetchRegisteredUsers();
        }
      } catch (e) {
        console.warn('Inactivity sweeper error:', e);
      } finally {
        sweepLockRef.current = false;
      }
    }, 60000);

    return () => clearInterval(sweepInterval);
  }, [user, registeredUsers, fetchRegisteredUsers]);

  // กดปุ่มยืนยันว่ายังปฏิบัติงานอยู่ (บันทึกแอคชั่นเพื่อรีเซ็ตเวลา)
  const resetActivity = useCallback(() => {
    if (user?.uid) {
      recordSystemAction(user.uid, 'manual_keep_alive');
    }
    const now = Date.now();
    lastLocalActionTimeRef.current = now;
    try {
      localStorage.setItem(storageKey, String(now));
    } catch (_) {}
    setIsWarning(false);
  }, [user?.uid, storageKey]);

  const dismissAutoClockOut = useCallback(() => {
    setIsAutoClockedOut(false);
  }, []);

  return {
    isWarning,
    remainingMs,
    isAutoClockedOut,
    returnedCasesCount,
    resetActivity,
    dismissAutoClockOut,
  };
}
