import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { 
  updateEmployeeHeartbeat, 
  autoClockOutInactiveEmployee, 
  AUTO_CLOCKOUT_INACTIVITY_MS 
} from '../lib/shiftService';

// 2 hours in ms = 7,200,000 ms
export const INACTIVITY_TIMEOUT_MS = AUTO_CLOCKOUT_INACTIVITY_MS;
// Warning triggers 10 minutes before auto clock-out (at 1 hour 50 minutes)
export const INACTIVITY_WARNING_MS = (2 * 60 - 10) * 60 * 1000;
// Throttle Firestore heartbeat writes (at most once every 2 minutes while user is active)
export const HEARTBEAT_THROTTLE_MS = 2 * 60 * 1000;

export interface InactivityState {
  isWarning: boolean;
  remainingMs: number;
  isAutoClockedOut: boolean;
  returnedCasesCount: number;
  resetActivity: () => void;
  dismissAutoClockOut: () => void;
}

export function useInactivityTracker(): InactivityState {
  const { user, clockOut, registeredUsers, fetchRegisteredUsers } = useStore();
  const [isWarning, setIsWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [isAutoClockedOut, setIsAutoClockedOut] = useState(false);
  const [returnedCasesCount, setReturnedCasesCount] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const lastHeartbeatRef = useRef<number>(0);
  const isClockingOutRef = useRef<boolean>(false);
  const sweepLockRef = useRef<boolean>(false);

  // Storage key specific to this logged in user
  const storageKey = user?.uid ? `qmanage_last_active_${user.uid}` : 'qmanage_last_active_guest';

  // Helper to record activity
  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      localStorage.setItem(storageKey, String(now));
    } catch (_) {}

    // Dismiss warning if user just interacted
    setIsWarning(false);

    // Throttle Firestore heartbeat if user is working
    if (user && user.workStatus === 'working' && now - lastHeartbeatRef.current > HEARTBEAT_THROTTLE_MS) {
      lastHeartbeatRef.current = now;
      updateEmployeeHeartbeat(user.uid);
    }
  }, [user, storageKey]);

  // Read latest timestamp from localStorage (synced across tabs)
  const getLatestActivityTime = useCallback((): number => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > lastActivityRef.current) {
          lastActivityRef.current = parsed;
        }
      }
    } catch (_) {}
    return lastActivityRef.current;
  }, [storageKey]);

  // Bind interaction event listeners
  useEffect(() => {
    if (!user || user.workStatus !== 'working') {
      setIsWarning(false);
      return;
    }

    // Initialize activity timestamp
    recordActivity();

    let throttleTimer: NodeJS.Timeout | null = null;
    const handleUserInteraction = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        recordActivity();
      }, 1000);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'focus'];
    events.forEach((evt) => {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    });

    const handleCustomActivity = () => {
      recordActivity();
    };
    window.addEventListener('user-activity', handleCustomActivity);

    return () => {
      if (throttleTimer) clearTimeout(throttleTimer);
      events.forEach((evt) => {
        window.removeEventListener(evt, handleUserInteraction);
      });
      window.removeEventListener('user-activity', handleCustomActivity);
    };
  }, [user?.uid, user?.workStatus, recordActivity]);

  // Main inactivity timer check (runs every 5 seconds)
  useEffect(() => {
    if (!user || user.workStatus !== 'working') {
      setIsWarning(false);
      return;
    }

    const interval = setInterval(async () => {
      if (isClockingOutRef.current) return;

      const latestTime = getLatestActivityTime();
      const now = Date.now();
      const idleMs = now - latestTime;

      // 1. Check if idle for >= 2 hours (120 minutes)
      if (idleMs >= INACTIVITY_TIMEOUT_MS) {
        isClockingOutRef.current = true;
        setIsWarning(false);
        try {
          const res = await clockOut('ไม่มีการเคลื่อนไหวเกิน 2 ชั่วโมง', true);
          setReturnedCasesCount(res.returnedCasesCount || 0);
          setIsAutoClockedOut(true);
        } catch (err) {
          console.error('Auto clock-out error:', err);
        } finally {
          isClockingOutRef.current = false;
        }
        return;
      }

      // 2. Check if idle for >= 1 hour 50 minutes (Warning Phase)
      if (idleMs >= INACTIVITY_WARNING_MS) {
        const timeLeft = Math.max(0, INACTIVITY_TIMEOUT_MS - idleMs);
        setRemainingMs(timeLeft);
        setIsWarning(true);
      } else {
        setIsWarning(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user, clockOut, getLatestActivityTime]);

  // Background sweeper for OTHER employees who closed browser or left without clocking out
  useEffect(() => {
    if (!user) return;

    // Run sweep every 2 minutes
    const sweepInterval = setInterval(async () => {
      if (sweepLockRef.current) return;
      sweepLockRef.current = true;

      try {
        const now = Date.now();
        // Check registered users for stale workers (> 2 hours inactive)
        const staleWorkers = registeredUsers.filter((u) => {
          if (u.uid === user.uid) return false; // Handled by client-side tracker
          if (u.workStatus !== 'working') return false;
          const lastActive = u.lastActiveAt || u.clockedInAt || u.createdAt;
          return lastActive && (now - lastActive > INACTIVITY_TIMEOUT_MS);
        });

        if (staleWorkers.length > 0) {
          for (const worker of staleWorkers) {
            try {
              await autoClockOutInactiveEmployee(worker.uid, worker.name);
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
    }, 120000);

    return () => clearInterval(sweepInterval);
  }, [user, registeredUsers, fetchRegisteredUsers]);

  const resetActivity = useCallback(() => {
    recordActivity();
  }, [recordActivity]);

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
