import { useEffect, useState, useRef, useCallback } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStore, isUserAdmin } from '../store/useStore';
import {
  autoClockOutInactiveEmployee,
  updateEmployeeHeartbeat,
} from '../lib/shiftService';
import {
  getExpiredCases,
  autoCancelExpiredCases,
} from '../lib/autoCancelService';

// Configuration for Auto-Clock-Out on Inactivity (Strictly 3 Hours)
export const INACTIVITY_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours without any activity before auto clock-out
export const WARNING_BEFORE_MS = 5 * 60 * 1000;          // Show warning 5 minutes before timeout (at 2 hours 55 mins)
const HEARTBEAT_WRITE_INTERVAL_MS = 30 * 60 * 1000;      // Sync lastActiveAt to Firestore at most every 30 minutes
const CHECK_INTERVAL_MS = 10 * 1000;                     // Check local idle timer every 10 seconds
const MAINTENANCE_LOCK_INTERVAL_MS = 10 * 60 * 1000;     // Distributed maintenance lock interval: 10 minutes

export interface InactivityState {
  isWarning: boolean;
  remainingMs: number;
  isAutoClockedOut: boolean;
  returnedCasesCount: number;
  resetActivity: () => void;
  dismissAutoClockOut: () => void;
}

/**
 * Item 4: Distributed browser-based maintenance task running every 10 minutes.
 * Uses Firestore transaction on `system_duties/maintenance_lock` so only ONE client across all open tabs/machines
 * executes per 10-minute window. Uses data already in `useStore` (`cases` and `registeredUsers`) without extra queries.
 */
async function tryRunDistributedBrowserMaintenance(currentUserUid: string, currentUserName: string) {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }

  const now = Date.now();
  const lockRef = doc(db, 'system_duties', 'maintenance_lock');

  let lockAcquired = false;
  try {
    lockAcquired = await runTransaction(db, async (transaction) => {
      const lockSnap = await transaction.get(lockRef);
      if (lockSnap.exists()) {
        const data = lockSnap.data();
        const lastRunAt = Number(data?.lastRunAt || 0);
        if (now - lastRunAt < MAINTENANCE_LOCK_INTERVAL_MS) {
          return false; // Another client already ran maintenance within the last 10 minutes
        }
      }
      transaction.set(
        lockRef,
        {
          lastRunAt: now,
          runBy: currentUserUid,
          runByName: currentUserName,
        },
        { merge: true }
      );
      return true;
    });
  } catch (err) {
    // Transaction contention or offline; skip quietly
    return;
  }

  if (!lockAcquired) return;

  // We won the 10-minute lock! Execute both tasks using already-loaded store data (no new queries):
  const { cases: storeCases, registeredUsers: storeUsers } = useStore.getState();

  // Task (ก): Auto-cancel pending/stuck cases older than 3 days (never cancels closed cases)
  try {
    const expiredCases = getExpiredCases(storeCases, now, storeUsers);
    if (expiredCases.length > 0) {
      await autoCancelExpiredCases(expiredCases, 'auto', storeUsers);
    }
  } catch (err) {
    console.warn('[Maintenance] Auto-cancel expired cases error:', err);
  }

  // Task (ข): Auto clock-out working employees with no activity > 3 hours + return their active cases (excluding admins)
  try {
    for (const emp of storeUsers) {
      if (!emp.uid || emp.workStatus !== 'working') continue;
      if (isUserAdmin(emp)) continue;

      const lastActive = Math.max(
        emp.lastActiveAt || 0,
        emp.lastActionAt || 0,
        emp.clockedInAt || 0,
        emp.createdAt || 0
      );

      if (lastActive > 0 && now - lastActive >= INACTIVITY_TIMEOUT_MS) {
        await autoClockOutInactiveEmployee(
          emp.uid,
          emp.name || emp.username,
          'ไม่มีการเคลื่อนไหวในระบบเกิน 3 ชั่วโมง',
          storeCases
        );
      }
    }
  } catch (err) {
    console.warn('[Maintenance] Inactive employee sweep error:', err);
  }
}

export function useInactivityTracker(): InactivityState {
  const { user } = useStore();
  const [isWarning, setIsWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(INACTIVITY_TIMEOUT_MS);
  const [isAutoClockedOut, setIsAutoClockedOut] = useState(false);
  const [returnedCasesCount, setReturnedCasesCount] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const lastFirestoreWriteRef = useRef<number>(Date.now());
  const isClockingOutRef = useRef<boolean>(false);

  const getActivityStorageKey = (uid: string) => `thaiplus_last_activity_${uid}`;

  // Item 9: When employee clicks "ยืนยันว่ายังทำงานอยู่" (resetActivity), immediately update Firestore (force = true)
  const resetActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    if (isWarning) {
      setIsWarning(false);
    }

    if (user && user.workStatus === 'working') {
      try {
        localStorage.setItem(getActivityStorageKey(user.uid), String(now));
      } catch {
        // Ignore storage error
      }
      lastFirestoreWriteRef.current = now;
      updateEmployeeHeartbeat(user.uid, true);
    }
  }, [user, isWarning]);

  const dismissAutoClockOut = useCallback(() => {
    setIsAutoClockedOut(false);
    setReturnedCasesCount(0);
  }, []);

  // Track user DOM events (mouse, keyboard, touch, click, scroll) — throttled to write to Firestore at most every 30 mins
  useEffect(() => {
    if (!user || user.workStatus === 'off_work') {
      setIsWarning(false);
      return;
    }

    const storageKey = `thaiplus_last_activity_${user.uid}`;
    const now = Date.now();
    let baseline = now;
    try {
      const savedLocal = Number(localStorage.getItem(storageKey) || 0);
      const savedRemote = Math.max(
        user.lastActiveAt || 0,
        user.lastActionAt || 0,
        user.clockedInAt || 0
      );
      const latestKnown = Math.max(savedLocal, savedRemote);
      if (latestKnown > 0 && now - latestKnown < INACTIVITY_TIMEOUT_MS) {
        baseline = latestKnown;
      } else {
        localStorage.setItem(storageKey, String(now));
      }
    } catch {
      baseline = now;
    }

    lastActivityRef.current = baseline;
    lastFirestoreWriteRef.current = now;

    let throttleTimer: number | null = null;
    const handleUserActivity = () => {
      if (throttleTimer) return;
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null;
        const currentTime = Date.now();
        lastActivityRef.current = currentTime;
        try {
          localStorage.setItem(storageKey, String(currentTime));
        } catch {
          // Ignore storage error
        }

        // Write heartbeat to Firestore no more than once every 30 minutes and only when tab is visible
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible' &&
          currentTime - lastFirestoreWriteRef.current >= HEARTBEAT_WRITE_INTERVAL_MS
        ) {
          lastFirestoreWriteRef.current = currentTime;
          updateEmployeeHeartbeat(user.uid, false);
        }
      }, 1500);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [user?.uid, user?.workStatus]);

  // Check local idle timer for current logged-in employee (3 hours)
  useEffect(() => {
    if (!user || user.workStatus === 'off_work') return;
    if (isUserAdmin(user)) return;

    const timer = setInterval(async () => {
      if (isClockingOutRef.current) return;

      const now = Date.now();
      const idleDuration = now - lastActivityRef.current;
      const timeLeft = Math.max(0, INACTIVITY_TIMEOUT_MS - idleDuration);
      setRemainingMs(timeLeft);

      if (idleDuration >= INACTIVITY_TIMEOUT_MS) {
        isClockingOutRef.current = true;
        setIsWarning(false);

        const storeCases = useStore.getState().cases;
        const res = await autoClockOutInactiveEmployee(
          user.uid,
          user.name,
          'ไม่มีการเคลื่อนไหวในระบบเกิน 3 ชั่วโมง',
          storeCases
        );

        if (res.success && !res.alreadyOffWork) {
          setReturnedCasesCount(res.returnedCasesCount);
          setIsAutoClockedOut(true);

          const updatedUser = {
            ...user,
            workStatus: 'off_work' as const,
            offWorkAt: Date.now(),
            autoClockOutReason: 'ไม่มีการเคลื่อนไหวในระบบเกิน 3 ชั่วโมง',
          };
          localStorage.setItem('thaiplus_current_user_v1', JSON.stringify(updatedUser));
          useStore.setState({ user: updatedUser });
        }
        isClockingOutRef.current = false;
      } else if (idleDuration >= INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS) {
        setIsWarning(true);
      } else {
        if (isWarning) setIsWarning(false);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [user, isWarning]);

  // Item 4: Run distributed maintenance sweep every 10 minutes across any active browser client
  useEffect(() => {
    if (!user?.uid) return;

    const uid = user.uid;
    const uname = user.name || user.username || uid;

    // Initial check 20s after mount (once store listeners have populated cases & registeredUsers)
    const initialTimeout = setTimeout(() => {
      tryRunDistributedBrowserMaintenance(uid, uname);
    }, 20 * 1000);

    // Every 10 minutes
    const sweepInterval = setInterval(() => {
      tryRunDistributedBrowserMaintenance(uid, uname);
    }, MAINTENANCE_LOCK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(sweepInterval);
    };
  }, [user?.uid, user?.name, user?.username]);

  return {
    isWarning,
    remainingMs,
    isAutoClockedOut,
    returnedCasesCount,
    resetActivity,
    dismissAutoClockOut,
  };
}
