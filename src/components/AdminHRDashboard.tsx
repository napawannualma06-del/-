import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AlertCircle,
  Banknote,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  UserCheck,
  UserMinus,
  X,
} from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { clsx } from 'clsx';
import { auth, db } from '../lib/firebase';
import { useStore, isUserAdmin } from '../store/useStore';
import {
  AdvanceRequest,
  HRPrivateData,
  HRProbationStatus,
  HRProfile,
  HRSSOStatus,
} from '../types';
import {
  DEFAULT_PROBATION_DAYS,
  DEFAULT_SSO_CAP_AMOUNT,
  DEFAULT_SSO_RATE_PERCENT,
  HR_PRIVATE_IDLE_TIMEOUT_MS,
  calculateMonthlySSODeduction,
  calculateProbationEndDate,
  calculateTenureText,
  exportHRProfilesToCsv,
  fetchHRPrivateEmployee,
  fetchHRProfiles,
  getDefaultHRPrivateData,
  getDefaultHRProfile,
  getProbationBadgeInfo,
  lockHrAdminEmailSession,
  maskSensitiveNumber,
  saveHRPrivateEmployee,
  saveHRProfiles,
  signInHrAdminEmail,
} from '../lib/hrService';
import { getOTCycleFromDate, getOTCycleInfo } from '../lib/otUtils';
import { AnimalAvatar } from './AnimalAvatar';

export function AdminHRDashboard() {
  const { user, registeredUsers } = useStore();
  const isAdmin = isUserAdmin(user);

  const [profiles, setProfiles] = useState<Record<string, HRProfile>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [probationFilter, setProbationFilter] = useState<
    'all' | 'probation' | 'near_or_due' | 'passed'
  >('all');

  // Modals
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [showNotEmployeeModal, setShowNotEmployeeModal] = useState(false);

  // HR Confidential Unlock State (Firebase Email/Password Auth)
  const [isHrUnlocked, setIsHrUnlocked] = useState<boolean>(false);
  const [hrUnlockedEmail, setHrUnlockedEmail] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const lastHrActivityRef = useRef<number>(Date.now());

  // Sync Firebase Auth state for email/password provider
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      const isPasswordProvider = fbUser?.providerData?.some(
        (p) => p.providerId === 'password'
      );
      if (fbUser && !fbUser.isAnonymous && isPasswordProvider && fbUser.email) {
        setIsHrUnlocked(true);
        setHrUnlockedEmail(fbUser.email);
        lastHrActivityRef.current = Date.now();
      } else {
        setIsHrUnlocked(false);
        setHrUnlockedEmail(null);
      }
    });
    return () => unsub();
  }, []);

  const handleLockHrPrivate = useCallback(async (isAutoTimeout = false) => {
    await lockHrAdminEmailSession();
    setIsHrUnlocked(false);
    setHrUnlockedEmail(null);
    if (isAutoTimeout) {
      setStatusNotice({
        type: 'error',
        message: 'ล็อกข้อมูลลับอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน 15 นาที',
      });
    } else {
      setStatusNotice({
        type: 'success',
        message: 'ล็อกข้อมูลลับ HR และออกจากระบบยืนยันตัวตนอีเมลเรียบร้อยแล้ว',
      });
      setTimeout(() => setStatusNotice(null), 4000);
    }
  }, []);

  // Auto-lock after 15 minutes of inactivity when HR confidential mode is unlocked
  useEffect(() => {
    if (!isHrUnlocked) return;

    lastHrActivityRef.current = Date.now();

    const updateActivity = () => {
      lastHrActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'click', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, updateActivity, { passive: true }));

    const timer = window.setInterval(() => {
      if (Date.now() - lastHrActivityRef.current >= HR_PRIVATE_IDLE_TIMEOUT_MS) {
        handleLockHrPrivate(true);
      }
    }, 15000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, updateActivity));
      window.clearInterval(timer);
    };
  }, [isHrUnlocked, handleLockHrPrivate]);

  // Load HR profiles once on mount (or reload trigger)
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoading(true);
      setLoadError(false);
      try {
        const docData = await fetchHRProfiles();
        if (!isCancelled) {
          setProfiles(docData.profiles || {});
        }
      } catch (err) {
        console.error('Failed to load HR profiles:', err);
        if (!isCancelled) {
          setLoadError(true);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [reloadTrigger]);

  // All non-rejected registered users
  const allActiveUsers = useMemo(() => {
    return (registeredUsers || [])
      .filter((u) => u.accountStatus !== 'rejected')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [registeredUsers]);

  // Employees shown in HR table (exclude those marked notEmployee)
  const visibleEmployees = useMemo(() => {
    return allActiveUsers.filter((u) => !profiles[u.uid]?.notEmployee);
  }, [allActiveUsers, profiles]);

  // Filtered employees by search and status filter
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleEmployees.filter((emp) => {
      const p = profiles[emp.uid] || getDefaultHRProfile(emp.name);
      const badge = getProbationBadgeInfo(p);

      if (probationFilter === 'probation' && p.probationStatus === 'passed') {
        return false;
      }
      if (
        probationFilter === 'near_or_due' &&
        badge.key !== 'near' &&
        badge.key !== 'completed_pending'
      ) {
        return false;
      }
      if (probationFilter === 'passed' && p.probationStatus !== 'passed') {
        return false;
      }

      if (!q) return true;
      return (
        (emp.name || '').toLowerCase().includes(q) ||
        (emp.username || '').toLowerCase().includes(q) ||
        (p.fullName || '').toLowerCase().includes(q) ||
        (p.nickname || '').toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q)
      );
    });
  }, [visibleEmployees, profiles, searchQuery, probationFilter]);

  // Quick stats
  const summaryStats = useMemo(() => {
    let total = visibleEmployees.length;
    let passed = 0;
    let nearOrDue = 0;
    let inProbation = 0;

    visibleEmployees.forEach((emp) => {
      const p = profiles[emp.uid] || getDefaultHRProfile(emp.name);
      const badge = getProbationBadgeInfo(p);
      if (badge.key === 'passed') {
        passed++;
      } else {
        inProbation++;
        if (badge.key === 'near' || badge.key === 'completed_pending') {
          nearOrDue++;
        }
      }
    });

    return { total, passed, inProbation, nearOrDue };
  }, [visibleEmployees, profiles]);

  // Quick Confirm Probation Passed directly from row or modal
  const handleConfirmPassProbation = async (empId: string, empFallbackName: string) => {
    if (!user || loadError || loading || isSaving) return;

    setIsSaving(true);
    try {
      const existing = profiles[empId] || getDefaultHRProfile(empFallbackName);
      const updatedProfile: HRProfile = {
        ...existing,
        fullName: existing.fullName || empFallbackName,
        probationDays: existing.probationDays ?? DEFAULT_PROBATION_DAYS,
        probationStatus: 'passed',
      };

      const nextProfiles = {
        ...profiles,
        [empId]: updatedProfile,
      };

      await saveHRProfiles(nextProfiles, user.name || user.username || 'Admin');
      setProfiles(nextProfiles);
      setStatusNotice({
        type: 'success',
        message: `ยืนยันผ่านโปรให้ "${updatedProfile.fullName || empFallbackName}" เรียบร้อยแล้ว`,
      });
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (err) {
      console.error('Error confirming probation pass:', err);
      setStatusNotice({
        type: 'error',
        message: 'ไม่สามารถบันทึกสถานะผ่านโปรได้ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Save single employee HR profile (+ private HR data if unlocked) from modal
  const handleSaveEmployeeProfile = async (
    empId: string,
    updatedProfile: HRProfile,
    updatedPrivateData?: HRPrivateData
  ) => {
    if (!user || loadError || loading || isSaving) return;

    setIsSaving(true);
    try {
      const actorName = user.name || user.username || 'Admin';
      const nextProfiles = {
        ...profiles,
        [empId]: updatedProfile,
      };
      await saveHRProfiles(nextProfiles, actorName);

      if (isHrUnlocked && updatedPrivateData) {
        await saveHRPrivateEmployee(empId, updatedPrivateData, hrUnlockedEmail || actorName);
      }

      setProfiles(nextProfiles);
      setEditingEmployeeId(null);
      setStatusNotice({
        type: 'success',
        message: isHrUnlocked && updatedPrivateData
          ? `บันทึกข้อมูลพื้นฐานและข้อมูลลับ HR ของ "${updatedProfile.fullName || 'พนักงาน'}" เรียบร้อยแล้ว`
          : `บันทึกข้อมูลพนักงาน "${updatedProfile.fullName || 'พนักงาน'}" เรียบร้อยแล้ว`,
      });
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (err) {
      console.error('Error saving employee HR profile:', err);
      setStatusNotice({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Save notEmployee flags from settings modal
  const handleSaveNotEmployeeSettings = async (notEmployeeMap: Record<string, boolean>) => {
    if (!user || loadError || loading || isSaving) return;

    setIsSaving(true);
    try {
      const nextProfiles: Record<string, HRProfile> = { ...profiles };
      allActiveUsers.forEach((u) => {
        const cur = nextProfiles[u.uid] || getDefaultHRProfile(u.name);
        nextProfiles[u.uid] = {
          ...cur,
          notEmployee: Boolean(notEmployeeMap[u.uid]),
        };
      });

      await saveHRProfiles(nextProfiles, user.name || user.username || 'Admin');
      setProfiles(nextProfiles);
      setShowNotEmployeeModal(false);
      setStatusNotice({
        type: 'success',
        message: 'บันทึกการตั้งค่ารายชื่อที่ไม่ใช่พนักงานเรียบร้อยแล้ว',
      });
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (err) {
      console.error('Error saving notEmployee settings:', err);
      setStatusNotice({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAdmin) return null;

  const editingEmployee = editingEmployeeId
    ? allActiveUsers.find((u) => u.uid === editingEmployeeId) || null
    : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Toolbar Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                ข้อมูลพื้นฐานพนักงาน (HR)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                คลิกที่แถวรายชื่อเพื่อแก้ไขข้อมูล วันเริ่มงาน วันผ่านโปร และดูข้อมูลลับ HR รายบุคคล
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Confidential HR Unlock / Lock Controls */}
            {!isHrUnlocked ? (
              <button
                type="button"
                onClick={() => setShowUnlockModal(true)}
                className="px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>ยืนยันตัวตนแอดมินเพื่อดูข้อมูลลับ</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-2.5 py-1.5 rounded-xl">
                <Unlock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                  ปลดล็อกข้อมูลลับ: {hrUnlockedEmail}
                </span>
                <button
                  type="button"
                  onClick={() => handleLockHrPrivate(false)}
                  className="ml-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                  title="ล็อกข้อมูลลับทันที (ล็อกอัตโนมัติเมื่อไม่มีการใช้งาน 15 นาที)"
                >
                  <Lock className="w-3 h-3" />
                  <span>ล็อกข้อมูลลับ</span>
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={loadError || loading}
              onClick={() => setShowNotEmployeeModal(true)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-500" />
              <span>ตั้งค่าบัญชีที่ไม่ใช่พนักงาน</span>
            </button>

            <button
              type="button"
              disabled={loadError || loading || visibleEmployees.length === 0}
              onClick={() => exportHRProfilesToCsv(visibleEmployees, profiles)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="ดาวน์โหลดเฉพาะข้อมูลพื้นฐาน (ไม่มีข้อมูลลับ)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>ดาวน์โหลด Excel</span>
            </button>
          </div>
        </div>

        {/* Summary Stat Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => setProbationFilter('all')}
            className={clsx(
              'p-3 rounded-xl border text-left transition cursor-pointer',
              probationFilter === 'all'
                ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300'
            )}
          >
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              พนักงานทั้งหมด
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
              {summaryStats.total}{' '}
              <span className="text-xs font-normal text-slate-400">คน</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setProbationFilter(probationFilter === 'probation' ? 'all' : 'probation')
            }
            className={clsx(
              'p-3 rounded-xl border text-left transition cursor-pointer',
              probationFilter === 'probation'
                ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/50 ring-2 ring-sky-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300'
            )}
          >
            <div className="text-[11px] font-semibold text-sky-700 dark:text-sky-400">
              อยู่ระหว่างทดลองงาน
            </div>
            <div className="text-xl font-black text-sky-900 dark:text-sky-200 mt-0.5 tabular-nums">
              {summaryStats.inProbation}{' '}
              <span className="text-xs font-normal text-slate-400">คน</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setProbationFilter(probationFilter === 'near_or_due' ? 'all' : 'near_or_due')
            }
            className={clsx(
              'p-3 rounded-xl border text-left transition cursor-pointer',
              probationFilter === 'near_or_due'
                ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/50 ring-2 ring-amber-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300'
            )}
          >
            <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              ใกล้ครบโปร / รอยืนยัน
            </div>
            <div className="text-xl font-black text-amber-900 dark:text-amber-200 mt-0.5 tabular-nums">
              {summaryStats.nearOrDue}{' '}
              <span className="text-xs font-normal text-slate-400">คน</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setProbationFilter(probationFilter === 'passed' ? 'all' : 'passed')}
            className={clsx(
              'p-3 rounded-xl border text-left transition cursor-pointer',
              probationFilter === 'passed'
                ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300'
            )}
          >
            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              ผ่านโปรแล้ว
            </div>
            <div className="text-xl font-black text-emerald-900 dark:text-emerald-200 mt-0.5 tabular-nums">
              {summaryStats.passed}{' '}
              <span className="text-xs font-normal text-slate-400">คน</span>
            </div>
          </button>
        </div>

        {/* Search Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อ-นามสกุลจริง, ชื่อเล่น, ตำแหน่ง หรือ @username..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Load Error Banner */}
        {loadError && (
          <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                โหลดข้อมูล HR ไม่สำเร็จ กรุณากดโหลดใหม่ (ระบบปิดปุ่มบันทึกชั่วคราวเพื่อป้องกันข้อมูลทับหาย)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReloadTrigger((c) => c + 1)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>โหลดใหม่</span>
            </button>
          </div>
        )}

        {/* Status Notice */}
        {statusNotice && (
          <div
            className={clsx(
              'p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2',
              statusNotice.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
            )}
          >
            <div className="flex items-center gap-2">
              {statusNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main HR Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
            กำลังโหลดข้อมูลพื้นฐานพนักงาน...
          </div>
        ) : loadError ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <div className="text-sm font-bold text-rose-700 dark:text-rose-400">
              โหลดข้อมูลไม่สำเร็จ กรุณากดโหลดใหม่
            </div>
            <button
              type="button"
              onClick={() => setReloadTrigger((c) => c + 1)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>โหลดใหม่</span>
            </button>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
            ไม่พบรายชื่อพนักงานตามเงื่อนไขที่ค้นหา
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                  <th className="px-4 py-3 text-left min-w-[200px]">ชื่อ-นามสกุลจริง</th>
                  <th className="px-3 py-3 text-left min-w-[100px]">ชื่อเล่น</th>
                  <th className="px-3 py-3 text-left min-w-[130px]">ตำแหน่ง</th>
                  <th className="px-3 py-3 text-center min-w-[110px]">วันเริ่มงาน</th>
                  <th className="px-3 py-3 text-center min-w-[150px]">อายุงาน (ปี เดือน วัน)</th>
                  <th className="px-3 py-3 text-center min-w-[110px]">วันผ่านโปร</th>
                  <th className="px-4 py-3 text-left min-w-[230px]">สถานะโปร</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEmployees.map((emp) => {
                  const p = profiles[emp.uid] || getDefaultHRProfile(emp.name);
                  const tenureText = calculateTenureText(p.startDate);
                  const badge = getProbationBadgeInfo(p);

                  return (
                    <tr
                      key={emp.uid}
                      onClick={() => setEditingEmployeeId(emp.uid)}
                      className="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition cursor-pointer group"
                    >
                      {/* ชื่อ-นามสกุลจริง */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <AnimalAvatar
                            avatarEmoji={emp.avatarEmoji}
                            identifier={emp.username || emp.uid}
                            name={emp.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition truncate">
                              {p.fullName || emp.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              บัญชี: {emp.name} {emp.username ? `(@${emp.username})` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* ชื่อเล่น */}
                      <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">
                        {p.nickname || <span className="text-slate-300 dark:text-slate-600">-</span>}
                      </td>

                      {/* ตำแหน่ง */}
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                        {p.position ? (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium">
                            {p.position}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>

                      {/* วันเริ่มงาน */}
                      <td className="px-3 py-3 text-center font-mono text-slate-700 dark:text-slate-300">
                        {p.startDate || <span className="text-slate-300 dark:text-slate-600">-</span>}
                      </td>

                      {/* อายุงาน */}
                      <td className="px-3 py-3 text-center font-semibold text-indigo-700 dark:text-indigo-400">
                        {tenureText}
                      </td>

                      {/* วันผ่านโปร */}
                      <td className="px-3 py-3 text-center font-mono text-slate-700 dark:text-slate-300">
                        {p.probationEndDate || (
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                        )}
                      </td>

                      {/* สถานะโปร + ปุ่มยืนยันผ่านโปร */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span
                            className={clsx(
                              'px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap',
                              badge.badgeClass
                            )}
                          >
                            {badge.label}
                          </span>

                          {p.probationStatus !== 'passed' && (
                            <button
                              type="button"
                              disabled={loadError || loading || isSaving}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConfirmPassProbation(emp.uid, emp.name);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              title="เปลี่ยนสถานะเป็น ผ่านโปรแล้ว"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>ยืนยันผ่านโปร</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Edit Employee HR Profile + Advance Summary + Confidential HR Data */}
      {editingEmployee && (
        <EmployeeHRProfileModal
          employee={editingEmployee}
          initialProfile={profiles[editingEmployee.uid] || getDefaultHRProfile(editingEmployee.name)}
          disabledSave={loadError || loading || isSaving}
          isHrUnlocked={isHrUnlocked}
          hrUnlockedEmail={hrUnlockedEmail}
          onRequestUnlock={() => setShowUnlockModal(true)}
          onLockHr={() => handleLockHrPrivate(false)}
          onClose={() => setEditingEmployeeId(null)}
          onSave={(updatedProfile, updatedPrivate) =>
            handleSaveEmployeeProfile(editingEmployee.uid, updatedProfile, updatedPrivate)
          }
        />
      )}

      {/* MODAL 2: Settings for Not-Employee Accounts */}
      {showNotEmployeeModal && (
        <NotEmployeeSettingsModal
          users={allActiveUsers}
          profiles={profiles}
          disabledSave={loadError || loading || isSaving}
          onClose={() => setShowNotEmployeeModal(false)}
          onSave={handleSaveNotEmployeeSettings}
        />
      )}

      {/* MODAL 3: Admin Email + Password Verification for HR Confidential Data */}
      {showUnlockModal && (
        <HrAdminUnlockModal
          onClose={() => setShowUnlockModal(false)}
          onSuccess={(email) => {
            setIsHrUnlocked(true);
            setHrUnlockedEmail(email);
            lastHrActivityRef.current = Date.now();
            setShowUnlockModal(false);
            setStatusNotice({
              type: 'success',
              message: `ยืนยันตัวตนสำเร็จ (${email}) สามารถเปิดดูและแก้ไขข้อมูลลับ HR รายบุคคลได้แล้ว`,
            });
            setTimeout(() => setStatusNotice(null), 4000);
          }}
        />
      )}
    </div>
  );
}

// ===============================================================
// Sub-Modal 1: Employee HR Profile Editor, Advance Summary & Confidential HR Data
// ===============================================================

function EmployeeHRProfileModal({
  employee,
  initialProfile,
  disabledSave,
  isHrUnlocked,
  hrUnlockedEmail,
  onRequestUnlock,
  onLockHr,
  onClose,
  onSave,
}: {
  employee: { uid: string; name: string; username?: string; avatarEmoji?: string };
  initialProfile: HRProfile;
  disabledSave: boolean;
  isHrUnlocked: boolean;
  hrUnlockedEmail: string | null;
  onRequestUnlock: () => void;
  onLockHr: () => void;
  onClose: () => void;
  onSave: (profile: HRProfile, privateData?: HRPrivateData) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(initialProfile.fullName || employee.name || '');
  const [nickname, setNickname] = useState(initialProfile.nickname || '');
  const [position, setPosition] = useState(initialProfile.position || '');
  const [startDate, setStartDate] = useState(initialProfile.startDate || '');
  const [probationDays, setProbationDays] = useState<number>(
    initialProfile.probationDays ?? DEFAULT_PROBATION_DAYS
  );
  const [probationEndDate, setProbationEndDate] = useState(initialProfile.probationEndDate || '');
  const [probationStatus, setProbationStatus] = useState<HRProbationStatus>(
    initialProfile.probationStatus || 'probation'
  );

  // Confidential HR Data state (loaded ONLY when isHrUnlocked is true via single getDoc)
  const [privateData, setPrivateData] = useState<HRPrivateData>(() =>
    getDefaultHRPrivateData(initialProfile.fullName || employee.name || '')
  );
  const [loadingPrivate, setLoadingPrivate] = useState<boolean>(false);
  const [privateLoadError, setPrivateLoadError] = useState<string | null>(null);
  const [privateReloadCount, setPrivateReloadCount] = useState<number>(0);

  // Masked view toggles for Account Number and SSO Number
  const [showFullAccountNum, setShowFullAccountNum] = useState<boolean>(false);
  const [showFullSsoNum, setShowFullSsoNum] = useState<boolean>(false);

  // Load hr_private/{employee.uid} ONLY when unlocked
  useEffect(() => {
    if (!isHrUnlocked) {
      setPrivateData(getDefaultHRPrivateData(initialProfile.fullName || employee.name || ''));
      setPrivateLoadError(null);
      setLoadingPrivate(false);
      setShowFullAccountNum(false);
      setShowFullSsoNum(false);
      return;
    }

    let isCancelled = false;

    async function loadPrivateDoc() {
      setLoadingPrivate(true);
      setPrivateLoadError(null);
      try {
        const loaded = await fetchHRPrivateEmployee(
          employee.uid,
          initialProfile.fullName || employee.name || ''
        );
        if (!isCancelled) {
          setPrivateData(loaded);
        }
      } catch (err: any) {
        console.error('Error loading HR private doc:', err);
        if (!isCancelled) {
          const code = err?.code || '';
          if (code === 'permission-denied' || String(err?.message || '').includes('permission')) {
            setPrivateLoadError(
              'ไม่มีสิทธิ์เข้าถึงข้อมูลลับ HR (เฉพาะอีเมลแอดมินที่ได้รับอนุญาตเท่านั้น) ระบบปิดปุ่มบันทึกข้อมูล'
            );
          } else {
            setPrivateLoadError(
              'โหลดข้อมูลลับ HR ไม่สำเร็จ กรุณากดโหลดใหม่ (ระบบปิดปุ่มบันทึกเพื่อป้องกันข้อมูลทับหาย)'
            );
          }
        }
      } finally {
        if (!isCancelled) {
          setLoadingPrivate(false);
        }
      }
    }

    loadPrivateDoc();
    return () => {
      isCancelled = true;
    };
  }, [isHrUnlocked, employee.uid, employee.name, initialProfile.fullName, privateReloadCount]);

  // When startDate or probationDays changes by user interaction, auto-recalculate probationEndDate
  const handleStartDateChange = (newStart: string) => {
    setStartDate(newStart);
    if (newStart) {
      setProbationEndDate(calculateProbationEndDate(newStart, probationDays));
    } else {
      setProbationEndDate('');
    }
  };

  const handleProbationDaysChange = (newDays: number) => {
    const validDays = Number.isFinite(newDays) && newDays >= 0 ? newDays : DEFAULT_PROBATION_DAYS;
    setProbationDays(validDays);
    if (startDate) {
      setProbationEndDate(calculateProbationEndDate(startDate, validDays));
    }
  };

  // Current & Previous Cycle Info (26 to 25)
  const { currentCycle, prevCycle } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const cur = getOTCycleFromDate(todayStr);

    const [y, m] = cur.cycleKey.split('-').map(Number);
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const prev = getOTCycleInfo(prevY, prevM);

    return { currentCycle: cur, prevCycle: prev };
  }, []);

  // Load approved advance requests for this employee only (with where employeeId & limit)
  const [loadingAdvances, setLoadingAdvances] = useState(true);
  const [currentCycleAdvanceTotal, setCurrentCycleAdvanceTotal] = useState(0);
  const [currentCycleAdvanceCount, setCurrentCycleAdvanceCount] = useState(0);
  const [prevCycleAdvanceTotal, setPrevCycleAdvanceTotal] = useState(0);
  const [prevCycleAdvanceCount, setPrevCycleAdvanceCount] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    async function loadEmployeeAdvances() {
      setLoadingAdvances(true);
      try {
        const q = query(
          collection(db, 'advance_requests'),
          where('employeeId', '==', employee.uid),
          limit(50)
        );
        const snap = await getDocs(q);
        if (isCancelled) return;

        let curTotal = 0;
        let curCount = 0;
        let prvTotal = 0;
        let prvCount = 0;

        snap.forEach((docSnap) => {
          const data = docSnap.data() as Omit<AdvanceRequest, 'id'>;
          if (data.status !== 'approved') return;

          const reqCycle =
            data.cyclePeriod ||
            (data.requestDate ? getOTCycleFromDate(data.requestDate).cycleKey : '');
          const amt = Number(data.amount) || 0;

          if (reqCycle === currentCycle.cycleKey) {
            curTotal += amt;
            curCount += 1;
          } else if (reqCycle === prevCycle.cycleKey) {
            prvTotal += amt;
            prvCount += 1;
          }
        });

        setCurrentCycleAdvanceTotal(curTotal);
        setCurrentCycleAdvanceCount(curCount);
        setPrevCycleAdvanceTotal(prvTotal);
        setPrevCycleAdvanceCount(prvCount);
      } catch (err) {
        console.error('Error loading employee advance summary:', err);
      } finally {
        if (!isCancelled) {
          setLoadingAdvances(false);
        }
      }
    }

    loadEmployeeAdvances();
    return () => {
      isCancelled = true;
    };
  }, [employee.uid, currentCycle.cycleKey, prevCycle.cycleKey]);

  const previewProfile: HRProfile = {
    fullName: fullName.trim() || employee.name,
    nickname: nickname.trim(),
    position: position.trim(),
    startDate,
    probationDays,
    probationEndDate,
    probationStatus,
    notEmployee: Boolean(initialProfile.notEmployee),
  };

  const badge = getProbationBadgeInfo(previewProfile);
  const tenureText = calculateTenureText(startDate);

  // Calculated monthly SSO deduction = min(salary × % ÷ 100, เพดาน)
  const calculatedSsoFormulaAmount = useMemo(() => {
    return calculateMonthlySSODeduction(
      privateData.salary,
      privateData.ssoRatePercent,
      privateData.ssoCapAmount
    );
  }, [privateData.salary, privateData.ssoRatePercent, privateData.ssoCapAmount]);

  const isSaveBlocked =
    disabledSave || (isHrUnlocked && (loadingPrivate || Boolean(privateLoadError)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaveBlocked) return;
    await onSave(previewProfile, isHrUnlocked ? privateData : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <AnimalAvatar
              avatarEmoji={employee.avatarEmoji}
              identifier={employee.username || employee.uid}
              name={employee.name}
              size="md"
            />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                ข้อมูลพนักงาน: {employee.name}
              </h3>
              <p className="text-[11px] text-slate-400">
                @{employee.username || 'member'} • รหัสผู้ใช้: {employee.uid.slice(0, 8)}...
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Basic Name & Position */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ชื่อ-นามสกุลจริง
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="เช่น สมชาย ใจดี"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ชื่อเล่น
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="เช่น ชาย"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ตำแหน่ง
              </label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="เช่น พนักงานตรวจสอบเคส, แอดมิน"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Start Date, Probation Days, Probation End Date */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                วันเริ่มงานและการทดลองงาน
              </span>
              <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                อายุงาน: {tenureText}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  วันเริ่มงาน
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  จำนวนวันโปร (ค่าเริ่ม 119)
                </label>
                <input
                  type="number"
                  min={0}
                  max={3650}
                  value={probationDays}
                  onChange={(e) => handleProbationDaysChange(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  วันผ่านโปร (แก้เองได้)
                </label>
                <input
                  type="date"
                  value={probationEndDate}
                  onChange={(e) => setProbationEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                />
              </div>
            </div>

            {/* Probation Status & Quick Pass Button */}
            <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  สถานะโปรปัจจุบัน:
                </span>
                <span
                  className={clsx(
                    'px-2.5 py-0.5 rounded-full text-[11px] font-bold border',
                    badge.badgeClass
                  )}
                >
                  {badge.label}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {probationStatus !== 'passed' ? (
                  <button
                    type="button"
                    onClick={() => setProbationStatus('passed')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>ยืนยันผ่านโปร</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setProbationStatus('probation')}
                    className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition cursor-pointer"
                  >
                    เปลี่ยนกลับเป็นทดลองงาน
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Read-only Approved Advance Requests Summary (Current & Previous Cycle) */}
          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ยอดเบิกเงินล่วงหน้า (แอดวานซ์) ที่อนุมัติแล้ว
              </span>
              <span className="text-[10px] text-slate-400">ข้อมูลอ่านอย่างเดียว (ตัดรอบ 26 - 25)</span>
            </div>

            {loadingAdvances ? (
              <div className="py-3 text-center text-slate-400 text-[11px]">
                กำลังโหลดข้อมูลยอดเบิกล่วงหน้า...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-emerald-900/50">
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    รอบปัจจุบัน ({currentCycle.cycleLabel.replace('รอบตัดยอด ', '')})
                  </div>
                  <div className="text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                    {currentCycleAdvanceTotal.toLocaleString()} บาท
                  </div>
                  <div className="text-[10px] text-slate-400">
                    อนุมัติแล้ว {currentCycleAdvanceCount} รายการ ({currentCycle.periodLabel})
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    รอบก่อนหน้า ({prevCycle.cycleLabel.replace('รอบตัดยอด ', '')})
                  </div>
                  <div className="text-base font-black text-slate-800 dark:text-slate-200 mt-0.5 tabular-nums">
                    {prevCycleAdvanceTotal.toLocaleString()} บาท
                  </div>
                  <div className="text-[10px] text-slate-400">
                    อนุมัติแล้ว {prevCycleAdvanceCount} รายการ ({prevCycle.periodLabel})
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION: HR CONFIDENTIAL DATA (hr_private/{employeeId}) */}
          <div className="p-4 rounded-xl border-2 border-amber-300/80 dark:border-amber-800/80 bg-amber-50/30 dark:bg-amber-950/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-amber-200/70 dark:border-amber-800/60">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    ข้อมูลลับ HR (เงินเดือน บัญชีธนาคาร และประกันสังคม)
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    เก็บแยกใน hr_private เฉพาะแอดมินที่ยืนยันตัวตนด้วยอีเมลเท่านั้น
                  </p>
                </div>
              </div>

              {isHrUnlocked ? (
                <button
                  type="button"
                  onClick={onLockHr}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                >
                  <Lock className="w-3 h-3" />
                  <span>ล็อกข้อมูลลับ</span>
                </button>
              ) : null}
            </div>

            {!isHrUnlocked ? (
              <div className="py-5 px-3 text-center space-y-2.5">
                <Lock className="w-7 h-7 text-amber-500 mx-auto" />
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  ข้อมูลส่วนนี้ถูกล็อกไว้ กรุณายืนยันตัวตนด้วยอีเมลแอดมินเพื่อเปิดดูหรือแก้ไข
                </p>
                <button
                  type="button"
                  onClick={onRequestUnlock}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>ยืนยันตัวตนแอดมินเพื่อดูข้อมูลลับ</span>
                </button>
              </div>
            ) : loadingPrivate ? (
              <div className="py-6 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                <span>กำลังโหลดข้อมูลลับเฉพาะบุคคล...</span>
              </div>
            ) : privateLoadError ? (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-semibold text-xs">{privateLoadError}</span>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPrivateReloadCount((c) => c + 1)}
                    className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>ลองโหลดใหม่</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Bank Info & Salary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      ธนาคาร
                    </label>
                    <input
                      type="text"
                      value={privateData.bankName}
                      onChange={(e) =>
                        setPrivateData((prev) => ({ ...prev, bankName: e.target.value }))
                      }
                      placeholder="เช่น กสิกรไทย, ไทยพาณิชย์, กรุงเทพ"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      ชื่อบัญชี
                    </label>
                    <input
                      type="text"
                      value={privateData.accountName}
                      onChange={(e) =>
                        setPrivateData((prev) => ({ ...prev, accountName: e.target.value }))
                      }
                      placeholder="ชื่อ-นามสกุล หน้าสมุดบัญชี"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>

                  {/* Account Number with Masked Display + Toggle */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        เลขบัญชี
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowFullAccountNum((v) => !v)}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {showFullAccountNum ? (
                          <>
                            <EyeOff className="w-3 h-3" />
                            <span>ซ่อนบางส่วน</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" />
                            <span>กดดูเต็ม / แก้ไข</span>
                          </>
                        )}
                      </button>
                    </div>
                    {showFullAccountNum ? (
                      <input
                        type="text"
                        value={privateData.accountNumber}
                        onChange={(e) =>
                          setPrivateData((prev) => ({ ...prev, accountNumber: e.target.value }))
                        }
                        placeholder="กรอกเลขที่บัญชีธนาคาร"
                        className="w-full px-3 py-1.5 rounded-lg border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-slate-900 font-mono text-xs"
                      />
                    ) : (
                      <div
                        onClick={() => setShowFullAccountNum(true)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 font-mono text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                        title="คลิกเพื่อดูเลขเต็มหรือแก้ไข"
                      >
                        <span>{maskSensitiveNumber(privateData.accountNumber)}</span>
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-sans font-bold">
                          ดูเต็ม
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Salary */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      อัตราเงินเดือน (บาท)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={privateData.salary}
                      onChange={(e) =>
                        setPrivateData((prev) => ({
                          ...prev,
                          salary: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder="0"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Social Security (SSO) Info */}
                <div className="pt-2.5 border-t border-amber-200/60 dark:border-amber-800/50 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* SSO Number with Masked Display + Toggle */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          เลขประกันสังคม
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowFullSsoNum((v) => !v)}
                          className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          {showFullSsoNum ? (
                            <>
                              <EyeOff className="w-3 h-3" />
                              <span>ซ่อนบางส่วน</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>กดดูเต็ม / แก้ไข</span>
                            </>
                          )}
                        </button>
                      </div>
                      {showFullSsoNum ? (
                        <input
                          type="text"
                          value={privateData.ssoNumber}
                          onChange={(e) =>
                            setPrivateData((prev) => ({ ...prev, ssoNumber: e.target.value }))
                          }
                          placeholder="กรอกเลขประกันสังคม 13 หลัก"
                          className="w-full px-3 py-1.5 rounded-lg border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-slate-900 font-mono text-xs"
                        />
                      ) : (
                        <div
                          onClick={() => setShowFullSsoNum(true)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 font-mono text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between cursor-pointer"
                          title="คลิกเพื่อดูเลขเต็มหรือแก้ไข"
                        >
                          <span>{maskSensitiveNumber(privateData.ssoNumber)}</span>
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-sans font-bold">
                            ดูเต็ม
                          </span>
                        </div>
                      )}
                    </div>

                    {/* SSO Status */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        สถานะประกันสังคม
                      </label>
                      <select
                        value={privateData.ssoStatus}
                        onChange={(e) =>
                          setPrivateData((prev) => ({
                            ...prev,
                            ssoStatus: e.target.value as HRSSOStatus,
                          }))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer"
                      >
                        <option value="enrolled">เข้าประกันสังคม (enrolled)</option>
                        <option value="not_enrolled">ยังไม่เข้าประกันสังคม (not_enrolled)</option>
                      </select>
                    </div>
                  </div>

                  {/* Rate %, Cap Amount & Calculated Monthly SSO Deduction */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        อัตราหักประกันสังคม (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        value={privateData.ssoRatePercent}
                        onChange={(e) =>
                          setPrivateData((prev) => ({
                            ...prev,
                            ssoRatePercent:
                              e.target.value === ''
                                ? 0
                                : parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        เพดานหักสูงสุด (บาท)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={privateData.ssoCapAmount}
                        onChange={(e) =>
                          setPrivateData((prev) => ({
                            ...prev,
                            ssoCapAmount:
                              e.target.value === ''
                                ? 0
                                : parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                      />
                    </div>

                    <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800">
                      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        ยอดหักประกันสังคม/เดือน
                      </div>
                      <div className="text-sm font-black text-amber-700 dark:text-amber-400 tabular-nums">
                        {calculatedSsoFormulaAmount.toLocaleString()} บาท
                        {privateData.ssoStatus === 'not_enrolled' && (
                          <span className="ml-1 text-[10px] font-normal text-slate-400">
                            (ยังไม่เข้า สปส.)
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-slate-400">
                        สูตร: min({(privateData.salary || 0).toLocaleString()} ×{' '}
                        {privateData.ssoRatePercent}% ÷ 100,{' '}
                        {(privateData.ssoCapAmount || 0).toLocaleString()})
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSaveBlocked}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isHrUnlocked ? 'บันทึกข้อมูลพื้นฐานและข้อมูลลับ' : 'บันทึกข้อมูลพื้นฐาน'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===============================================================
// Sub-Modal 2: Not-Employee Account Settings
// ===============================================================

function NotEmployeeSettingsModal({
  users,
  profiles,
  disabledSave,
  onClose,
  onSave,
}: {
  users: Array<{ uid: string; name: string; username?: string; avatarEmoji?: string; role?: string }>;
  profiles: Record<string, HRProfile>;
  disabledSave: boolean;
  onClose: () => void;
  onSave: (notEmployeeMap: Record<string, boolean>) => Promise<void>;
}) {
  const [notEmpMap, setNotEmpMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    users.forEach((u) => {
      map[u.uid] = Boolean(profiles[u.uid]?.notEmployee);
    });
    return map;
  });

  const handleToggle = (uid: string) => {
    setNotEmpMap((prev) => ({
      ...prev,
      [uid]: !prev[uid],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-5 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <UserMinus className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                ตั้งค่าบัญชีที่ไม่ใช่พนักงาน (ซ่อนจากตาราง HR)
              </h4>
              <p className="text-[11px] text-slate-400">
                ติ๊กเลือกบัญชีที่ไม่ใช่พนักงาน (เช่น บัญชีระบบ หรือผู้บริหาร) เพื่อไม่แสดงในตาราง HR
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pr-1 space-y-2">
          {users.map((u) => {
            const isNotEmp = Boolean(notEmpMap[u.uid]);
            return (
              <label
                key={u.uid}
                className={clsx(
                  'p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition',
                  isNotEmp
                    ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <AnimalAvatar
                    avatarEmoji={u.avatarEmoji}
                    identifier={u.username || u.uid}
                    name={u.name}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {u.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      @{u.username || 'member'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="checkbox"
                    checked={isNotEmp}
                    onChange={() => handleToggle(u.uid)}
                    className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                  />
                  <span
                    className={clsx(
                      'text-xs font-semibold',
                      isNotEmp
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    ไม่ใช่พนักงาน
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={disabledSave}
            onClick={() => onSave(notEmpMap)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md active:scale-98 disabled:opacity-50 cursor-pointer"
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// Sub-Modal 3: HR Admin Email & Password Verification Modal
// ===============================================================

function HrAdminUnlockModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const fbUser = await signInHrAdminEmail(email.trim(), password);
      // Clear password from memory immediately
      setPassword('');
      onSuccess(fbUser.email || email.trim());
    } catch (err: any) {
      console.error('HR Admin email verification failed:', err);
      setPassword('');
      const code = err?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-email'
      ) {
        setErrorMsg('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('มีการลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่');
      } else {
        setErrorMsg('ไม่สามารถยืนยันตัวตนได้ กรุณาตรวจสอบอีเมลและรหัสผ่าน');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-amber-300 dark:border-amber-800 w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400">
              <KeyRound className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                ยืนยันตัวตนแอดมินเพื่อดูข้อมูลลับ HR
              </h4>
              <p className="text-[11px] text-slate-400">
                เข้าสู่ระบบด้วยอีเมลแอดมินที่ได้รับสิทธิ์ (ไม่จำรหัสผ่านในเครื่อง)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPassword('');
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleUnlock} className="space-y-3.5 text-xs" autoComplete="off">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              อีเมลแอดมิน HR
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ระบุอีเมลแอดมิน"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              รหัสผ่าน
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ระบุรหัสผ่าน"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="text-[11px] text-slate-400 leading-relaxed">
            ระบบจะล็อกข้อมูลลับอัตโนมัติเมื่อไม่มีการใช้งานเกิน 15 นาที หรือเมื่อกดปุ่ม "ล็อกข้อมูลลับ"
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setPassword('');
                onClose();
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>{submitting ? 'กำลังยืนยันตัวตน...' : 'ยืนยันตัวตน'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
