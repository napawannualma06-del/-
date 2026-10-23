import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore, isUserAdmin } from '../store/useStore';
import { 
  autoClockOutInactiveEmployee, 
} from '../lib/shiftService';
import { recordSystemAction } from '../lib/activityService';
import { playNotificationChime } from '../lib/sound';

// 1. ครบ 2 ชั่วโมง (7,200,000 ms): เด้งแจ้งเตือนให้พนักงาน
export const ACTION_ALERT_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// 2. รออีก 1 ชั่วโมง (3,600,000 ms) สำหรับให้พนักงานกดยืนยันว่ากำลังทำงานอยู่
export const GRACE_PERIOD_MS = 1 * 60 * 60 * 1000;

// 3. รวมทั้งสิ้น 3 ชั่วโมง (10,800,000 ms): หากไม่มีการยืนยัน ให้เด้งออก / เปลี่ยนเป็นว่างงานทันที
export const TOTAL_INACTIVITY_TIMEOUT_MS = ACTION_ALERT_THRESHOLD_MS + GRACE_PERIOD_MS;

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
 * 
 * Flow:
 * 1. ถ้าไม่มีการสร้างเคส รับเคส ใส่หมายเหตุ หรือแอคชั่นในระบบครบ 2 ชั่วโมง:
 *    - เด้ง Modal แจ้งเตือนพนักงานทันที พร้อมส่งเสียง chime และ Notification
 * 2. รออีก 1 ชั่วโมง (นับถอยหลัง 60 นาที):
 *    - ถ้าพนักงานกด "ฉันกำลังทำงานอยู่": รีเซ็ตเวลาและทำงานต่อตามปกติ
 * 3. ถ้าครบ 1 ชั่วโมงแล้วยังไม่ได้ยืนยันว่าทำงานอยู่:
 *    - เปลี่ยนสถานะเป็น "ว่างงาน" อัตโนมัติ และดึงเคสค้างคืนกองกลาง
 * 
 * * ยกเว้น Admin: ไม่มีการแจ้งเตือนและไม่มีการเปลี่ยนเป็นว่างงานอัตโนมัติ
 */
export function useInactivityTracker(): InactivityState {
  const { user, clockOut, registeredUsers, fetchRegisteredUsers } = useStore();
  const isAdmin = isUserAdmin(user);
  const [isWarning, setIsWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [isAutoClockedOut, setIsAutoClockedOut] = useState(false);
  const [returnedCasesCount, setReturnedCasesCount] = useState(0);

  const isClockingOutRef = useRef<boolean>(false);
  const sweepLockRef = useRef<boolean>(false);
  const hasAlertedRef = useRef<boolean>(false);
  const sessionMountedAtRef = useRef<number>(Date.now());
  const lastLocalActionTimeRef = useRef<number>(Date.now());
  const hasAnnouncedArrivalRef = useRef<boolean>(false);

  const storageKey = user?.uid ? `qmanage_last_action_${user.uid}` : 'qmanage_last_action_guest';

  // เมื่อผู้ใช้เข้าสู่ระบบหรือเปิดหน้านี้ ให้รีเซ็ตเวลาเรื่มต้นของเซสชันนี้ทันที
  useEffect(() => {
    if (!user?.uid || isAdmin || user.workStatus !== 'working') return;
    if (!hasAnnouncedArrivalRef.current) {
      hasAnnouncedArrivalRef.current = true;
      const now = Date.now();
      sessionMountedAtRef.current = now;
      lastLocalActionTimeRef.current = now;
      try {
        localStorage.setItem(storageKey, String(now));
      } catch (_) {}
      recordSystemAction(user.uid, 'session_enter');
    }
  }, [user?.uid, user?.workStatus, isAdmin, storageKey]);

  // อ่านเวลา action ล่าสุด (sync ข้ามแท็บ)
  const getLatestActionTime = useCallback((): number => {
    // สำคัญ: ห้ามนำ timestamp เก่าจากวันก่อนหน้าหรือก่อนเปิดเซสชันมาคิด
    // ผู้ใช้ที่เพิ่งเปิดหน้าเว็บ/เพิ่งเข้าสู่ระบบ จะต้องมีเวลาแอคชั่นเริ่มต้นอย่างน้อยเท่ากับเวลาที่เปิดหน้าเว็บนี้ (sessionMountedAtRef.current)
    let latest = Math.max(
      user?.lastActionAt || 0,
      user?.clockedInAt || 0,
      sessionMountedAtRef.current,
      lastLocalActionTimeRef.current
    );
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
  }, [user?.lastActionAt, user?.clockedInAt, storageKey]);

  // ฟัง Custom Event เมื่อมีการทำแอคชั่นในระบบ (สร้างเคส, รับเคส, หมายเหตุ, แชท ฯลฯ)
  useEffect(() => {
    // ยกเว้น Admin: ไม่ต้องจับเวลา idle
    if (!user || user.workStatus !== 'working' || isAdmin) {
      setIsWarning(false);
      return;
    }

    const handleSystemAction = () => {
      const now = Date.now();
      lastLocalActionTimeRef.current = now;
      hasAlertedRef.current = false;
      try {
        localStorage.setItem(storageKey, String(now));
      } catch (_) {}
      setIsWarning(false);
    };

    window.addEventListener('system-action', handleSystemAction);
    return () => {
      window.removeEventListener('system-action', handleSystemAction);
    };
  }, [user?.uid, user?.workStatus, isAdmin, storageKey]);

  // ตรวจสอบระยะเวลาที่ไม่มีแอคชั่นในระบบ (รันทุก 5 วินาที)
  useEffect(() => {
    // ยกเว้น Admin: ไม่มีการแจ้งเตือนหรือเปลี่ยนเป็นว่างงานอัตโนมัติ
    if (!user || user.workStatus !== 'working' || isAdmin) {
      setIsWarning(false);
      return;
    }

    const interval = setInterval(async () => {
      if (isClockingOutRef.current) return;

      const latestActionTime = getLatestActionTime();
      const now = Date.now();
      const idleMs = now - latestActionTime;

      // กรณีที่ 1: เกิน 3 ชั่วโมง (ครบ 2 ชม. + รออีก 1 ชม. แล้วไม่ได้ยืนยันว่าทำงานอยู่) -> เด้งออก / เปลี่ยนเป็นว่างงาน
      if (idleMs >= TOTAL_INACTIVITY_TIMEOUT_MS) {
        isClockingOutRef.current = true;
        setIsWarning(false);
        try {
          const res = await clockOut(
            'ไม่มีการสร้างเคส รับเคส ใส่หมายเหตุ เกิน 2 ชม. และไม่มีการยืนยันภายใน 1 ชม. (ระบบเปลี่ยนเป็นว่างงาน)',
            true
          );
          setReturnedCasesCount(res.returnedCasesCount || 0);
          setIsAutoClockedOut(true);
        } catch (err) {
          console.error('Auto clock-out error:', err);
        } finally {
          isClockingOutRef.current = false;
        }
        return;
      }

      // กรณีที่ 2: ครบ 2 ชั่วโมงแล้ว -> เด้งหน้าต่างแจ้งเตือนทันที และเริ่มนับถอยหลัง 1 ชั่วโมง
      if (idleMs >= ACTION_ALERT_THRESHOLD_MS) {
        const timeLeft = Math.max(0, TOTAL_INACTIVITY_TIMEOUT_MS - idleMs);
        setRemainingMs(timeLeft);
        setIsWarning(true);

        // ส่งเสียงเตือนและ notification ในครั้งแรกที่เด้งเตือน
        if (!hasAlertedRef.current) {
          hasAlertedRef.current = true;
          playNotificationChime();

          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('⚠️ เตือนความเคลื่อนไหว: ไม่มีการทำเคสเกิน 2 ชั่วโมง', {
                body: 'กรุณากดยืนยันว่ากำลังทำงานอยู่ ระบบจะรออีก 1 ชั่วโมงก่อนเปลี่ยนสถานะเป็นว่างงานอัตโนมัติ',
              });
            } catch (_) {}
          }
        }
      } else {
        // หากยังไม่ถึง 2 ชม. ให้ปิดการแจ้งเตือน
        setIsWarning(false);
        hasAlertedRef.current = false;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user, isAdmin, clockOut, getLatestActionTime]);

  // ระบบตรวจสอบพนักงานคนอื่นที่ปิดเครื่องหรือทิ้งไว้โดยไม่มีแอคชั่นเกิน 3 ชม. (รันทุก 1 นาที)
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
          // ยกเว้น Admin จากการถูกสวีป
          if (isUserAdmin(u)) return false;
          const lastAction = Math.max(
            u.lastActionAt || 0,
            u.lastActiveAt || 0,
            u.clockedInAt || 0,
            u.createdAt || 0
          );
          return lastAction > 0 && (now - lastAction > TOTAL_INACTIVITY_TIMEOUT_MS);
        });

        if (staleWorkers.length > 0) {
          for (const worker of staleWorkers) {
            try {
              await autoClockOutInactiveEmployee(
                worker.uid, 
                worker.name, 
                'ไม่มีการสร้างเคส รับเคส ใส่หมายเหตุ เกิน 2 ชม. และไม่มีการยืนยันภายใน 1 ชม.'
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

  // พนักงานกดยืนยันว่า "ฉันกำลังทำงานอยู่"
  const resetActivity = useCallback(() => {
    if (user?.uid) {
      recordSystemAction(user.uid, 'confirm_working');
    }
    const now = Date.now();
    lastLocalActionTimeRef.current = now;
    hasAlertedRef.current = false;
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
