import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Banknote,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  FileCheck2,
  HeartHandshake,
  Lock,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { clsx } from 'clsx';
import { db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import {
  AdvanceRequest,
  EmployeeSelfSubmittedFields,
  HRProfile,
  OvertimeRequest,
  ProfileMaskedSummary,
  ProfileStatusDoc,
  ShiftTemplate,
} from '../types';
import {
  calculateTenureText,
  fetchEmployeeProfileStatus,
  fetchHRProfiles,
  getDefaultHRProfile,
  getProbationBadgeInfo,
  submitEmployeeProfileRequest,
  validateThaiIdCard13Digits,
} from '../lib/hrService';
import { getOTCycleFromDate } from '../lib/otUtils';
import {
  DEFAULT_SHIFT_TEMPLATES,
  SPECIAL_DAYS_CONFIG,
  fetchCycleSchedule,
  fetchShiftTemplates,
  getDaysInCycle,
} from '../lib/shiftScheduleService';
import { AnimalAvatar } from './AnimalAvatar';

export function MyProfilePage() {
  const { user } = useStore();

  const [hrProfile, setHrProfile] = useState<HRProfile>(() =>
    getDefaultHRProfile(user?.name || '')
  );
  const [profileStatus, setProfileStatus] = useState<ProfileStatusDoc | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  // Current cycle info (26 - 25)
  const currentCycle = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return getOTCycleFromDate(todayStr);
  }, []);

  const cycleDays = useMemo(() => getDaysInCycle(currentCycle), [currentCycle]);

  // "งานของฉันรอบนี้" states
  const [loadingWorkCycle, setLoadingWorkCycle] = useState(true);
  const [myShiftsMap, setMyShiftsMap] = useState<Record<string, string>>({});
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>(DEFAULT_SHIFT_TEMPLATES);
  const [approvedOtHours, setApprovedOtHours] = useState(0);
  const [approvedOtCount, setApprovedOtCount] = useState(0);
  const [approvedAdvanceTotal, setApprovedAdvanceTotal] = useState(0);
  const [approvedAdvanceCount, setApprovedAdvanceCount] = useState(0);

  // Form Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [initialFocusSection, setInitialFocusSection] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Load HR profile (non-confidential) & profile_status/{employeeId} (masked only)
  useEffect(() => {
    if (!user?.uid) return;
    let isCancelled = false;

    async function loadMyProfile() {
      setLoadingProfile(true);
      setProfileError(null);
      try {
        const [hrDoc, statusDoc] = await Promise.all([
          fetchHRProfiles(),
          fetchEmployeeProfileStatus(user!.uid),
        ]);
        if (isCancelled) return;

        const myHr = hrDoc.profiles?.[user!.uid] || getDefaultHRProfile(user!.name || '');
        setHrProfile(myHr);
        setProfileStatus(statusDoc);
      } catch (err) {
        console.error('Error loading MyProfilePage data:', err);
        if (!isCancelled) {
          setProfileError('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง');
        }
      } finally {
        if (!isCancelled) {
          setLoadingProfile(false);
        }
      }
    }

    loadMyProfile();
    return () => {
      isCancelled = true;
    };
  }, [user?.uid, user?.name, reloadCount]);

  // Load "งานของฉันรอบนี้" (Shift schedule, Approved OT in cycle, Approved Advance in cycle)
  useEffect(() => {
    if (!user?.uid) return;
    let isCancelled = false;

    async function loadMyCycleWork() {
      setLoadingWorkCycle(true);
      try {
        const otQ = query(
          collection(db, 'overtime_requests'),
          where('employeeId', '==', user!.uid),
          where('cyclePeriod', '==', currentCycle.cycleKey)
        );
        const advQ = query(
          collection(db, 'advance_requests'),
          where('employeeId', '==', user!.uid),
          where('cyclePeriod', '==', currentCycle.cycleKey)
        );

        const [templates, scheduleDoc, otSnap, advSnap] = await Promise.all([
          fetchShiftTemplates().catch(() => DEFAULT_SHIFT_TEMPLATES),
          fetchCycleSchedule(currentCycle.cycleKey).catch(() => ({ days: {} })),
          getDocs(otQ),
          getDocs(advQ),
        ]);

        if (isCancelled) return;

        setShiftTemplates(templates);
        const empShifts = scheduleDoc.days?.[user!.uid] || {};
        setMyShiftsMap(empShifts);

        let otHrs = 0;
        let otCnt = 0;
        otSnap.forEach((d) => {
          const data = d.data() as Omit<OvertimeRequest, 'id'>;
          if (data.status === 'approved') {
            otHrs += Number(data.hours) || 0;
            otCnt += 1;
          }
        });
        setApprovedOtHours(Math.round(otHrs * 100) / 100);
        setApprovedOtCount(otCnt);

        let advAmt = 0;
        let advCnt = 0;
        advSnap.forEach((d) => {
          const data = d.data() as Omit<AdvanceRequest, 'id'>;
          if (data.status === 'approved') {
            advAmt += Number(data.amount) || 0;
            advCnt += 1;
          }
        });
        setApprovedAdvanceTotal(Math.round(advAmt * 100) / 100);
        setApprovedAdvanceCount(advCnt);
      } catch (err) {
        console.error('Error loading cycle work summary:', err);
      } finally {
        if (!isCancelled) {
          setLoadingWorkCycle(false);
        }
      }
    }

    loadMyCycleWork();
    return () => {
      isCancelled = true;
    };
  }, [user?.uid, currentCycle.cycleKey]);

  const shiftStats = useMemo(() => {
    const templateMap = new Map<string, ShiftTemplate>();
    shiftTemplates.forEach((t) => templateMap.set(t.id, t));

    let workDays = 0;
    let offDays = 0;
    let leaveDays = 0;
    let holidayDays = 0;

    cycleDays.forEach((d) => {
      const code = myShiftsMap[d.dateStr] || '';
      if (!code) return;
      if (code === 'off') offDays++;
      else if (code === 'leave') leaveDays++;
      else if (code === 'holiday') holidayDays++;
      else workDays++;
    });

    return { workDays, offDays, leaveDays, holidayDays, templateMap };
  }, [cycleDays, myShiftsMap, shiftTemplates]);

  if (!user) return null;

  const hasSubmittedFirstTime = Boolean(profileStatus?.hasSubmittedFirstTime);
  const isPendingApproval = profileStatus?.lastStatus === 'pending';

  const masked: ProfileMaskedSummary = profileStatus?.maskedSummary || {
    title: '',
    firstNameTh: '',
    lastNameTh: '',
    firstNameEn: '',
    lastNameEn: '',
    nickname: hrProfile.nickname || '',
    maritalStatus: '',
    birthDateStatus: 'ยังไม่กรอก',
    ssoNumberMasked: '-',
    idCardExpiryStatus: 'ยังไม่กรอก',
    addressStatus: 'ยังไม่กรอก',
    currentAddressStatus: 'ยังไม่กรอก',
    phoneMasked: '-',
    emailStatus: 'ยังไม่กรอก',
    lineIdStatus: 'ยังไม่กรอก',
    emergencyStatus: 'ยังไม่กรอก',
    bankName: '',
    accountName: '',
    accountNumberMasked: '-',
    ssoSectionStatus: 'ยังไม่กรอก',
    taxDeductionStatus: 'ยังไม่กรอก',
    educationStatus: 'ยังไม่กรอก',
  };

  const displayFullName =
    masked.firstNameTh || masked.lastNameTh
      ? `${masked.title ? masked.title : ''}${masked.firstNameTh} ${masked.lastNameTh}`.trim()
      : hrProfile.fullName || user.name;
  const displayNickname = masked.nickname || hrProfile.nickname || '-';
  const tenureText = calculateTenureText(hrProfile.startDate);
  const probationBadge = getProbationBadgeInfo(hrProfile);

  const handleOpenForm = (sectionKey?: string) => {
    if (isPendingApproval) return;
    setInitialFocusSection(sectionKey || null);
    setShowFormModal(true);
  };

  const renderFillStatusBadge = (statusVal?: 'กรอกแล้ว' | 'ยังไม่กรอก') =>
    statusVal === 'กรอกแล้ว' ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 text-[11px] font-bold">
        <CheckCircle2 className="w-3 h-3" />
        กรอกแล้ว
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
        ยังไม่กรอก
      </span>
    );

  const renderActionButton = (sectionKey: string) => {
    if (isPendingApproval) {
      return (
        <button
          type="button"
          disabled
          className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px] font-bold flex items-center gap-1.5 opacity-80 cursor-not-allowed"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>มีคำขอรออนุมัติอยู่</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => handleOpenForm(sectionKey)}
        className={clsx(
          'px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs',
          hasSubmittedFirstTime
            ? 'bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
        )}
      >
        <Edit3 className="w-3.5 h-3.5" />
        <span>{hasSubmittedFirstTime ? 'ขอแก้ไข' : 'กรอกข้อมูล'}</span>
      </button>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Status Banner (รออนุมัติ / อนุมัติแล้ว / บันทึกแล้ว / ไม่อนุมัติ) */}
      {profileStatus?.lastStatus === 'pending' && (
        <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 flex items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3">
            <span className="p-2 rounded-xl bg-amber-500 text-white shrink-0">
              <Clock className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs sm:text-sm font-extrabold">
                สถานะคำขอ: รออนุมัติ
              </div>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                คุณได้ส่งคำขอแก้ไขข้อมูลแล้ว ขณะนี้อยู่ระหว่างรอแอดมิน HR ตรวจสอบและอนุมัติ
              </p>
            </div>
          </div>
          {profileStatus.submittedAt && (
            <span className="text-[11px] font-mono text-amber-700 dark:text-amber-300 shrink-0">
              ส่งเมื่อ {new Date(profileStatus.submittedAt).toLocaleString('th-TH')}
            </span>
          )}
        </div>
      )}

      {profileStatus?.lastStatus === 'approved' && (
        <div className="p-4 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 flex items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3">
            <span className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs sm:text-sm font-extrabold">
                สถานะคำขอ: อนุมัติแล้ว
              </div>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-0.5">
                คำขอแก้ไขข้อมูลล่าสุดของคุณได้รับการอนุมัติและอัปเดตเข้าระบบ HR เรียบร้อยแล้ว
              </p>
            </div>
          </div>
          {profileStatus.decidedAt && (
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 shrink-0">
              อนุมัติเมื่อ {new Date(profileStatus.decidedAt).toLocaleString('th-TH')}
            </span>
          )}
        </div>
      )}

      {profileStatus?.lastStatus === 'applied' && (
        <div className="p-4 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 flex items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3">
            <span className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs sm:text-sm font-extrabold">
                สถานะข้อมูล: บันทึกแล้ว
              </div>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-0.5">
                บันทึกข้อมูลพนักงานเรียบร้อยแล้ว หากต้องการเปลี่ยนแปลงข้อมูลในอนาคตสามารถกดปุ่ม "ขอแก้ไข" ได้
              </p>
            </div>
          </div>
        </div>
      )}

      {profileStatus?.lastStatus === 'rejected' && (
        <div className="p-4 rounded-2xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 flex items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3">
            <span className="p-2 rounded-xl bg-rose-600 text-white shrink-0">
              <AlertCircle className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs sm:text-sm font-extrabold">
                ไม่อนุมัติ: {profileStatus.rejectReason || 'แอดมินไม่อนุมัติคำขอแก้ไข'}
              </div>
              <p className="text-xs text-rose-800/90 dark:text-rose-300/90 mt-0.5">
                คุณสามารถตรวจสอบข้อมูลและกด "ขอแก้ไข" เพื่อส่งคำขอใหม่ได้
              </p>
            </div>
          </div>
          {profileStatus.decidedAt && (
            <span className="text-[11px] font-mono text-rose-700 dark:text-rose-300 shrink-0">
              แจ้งเมื่อ {new Date(profileStatus.decidedAt).toLocaleString('th-TH')}
            </span>
          )}
        </div>
      )}

      {submitNotice && (
        <div
          className={clsx(
            'p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2',
            submitNotice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          )}
        >
          <div className="flex items-center gap-2">
            {submitNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{submitNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmitNotice(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Card: รูปโปรไฟล์ ชื่อ ชื่อเล่น ตำแหน่ง อายุงาน สถานะโปร */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <AnimalAvatar
              avatarEmoji={user.avatarEmoji}
              identifier={user.username || user.uid}
              name={user.name}
              size="lg"
            />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {displayFullName}
                </h1>
                {displayNickname && displayNickname !== '-' && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                    ({displayNickname})
                  </span>
                )}
                <span
                  className={clsx(
                    'px-2.5 py-0.5 rounded-full text-[11px] font-bold border',
                    probationBadge.badgeClass
                  )}
                >
                  {probationBadge.label}
                </span>
              </div>

              <div className="flex items-center gap-3 flex-wrap text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                  ตำแหน่ง: {hrProfile.position || 'ยังไม่ระบุ'}
                </span>
                <span>•</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  อายุงาน: {tenureText}
                </span>
                <span>•</span>
                <span className="font-mono text-slate-400">
                  @{user.username || 'member'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setReloadCount((c) => c + 1)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', loadingProfile && 'animate-spin')} />
              <span>รีเฟรช</span>
            </button>

            {renderActionButton('personal')}
          </div>
        </div>

        {profileError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between">
            <span>{profileError}</span>
            <button
              type="button"
              onClick={() => setReloadCount((c) => c + 1)}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px]"
            >
              ลองใหม่
            </button>
          </div>
        )}
      </div>

      {/* Section 1 & 2 Grid: ข้อมูลจาก HR (ดูอย่างเดียว) + งานของฉันรอบนี้ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ข้อมูลจาก HR (ดูอย่างเดียว) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <Briefcase className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  ข้อมูลจาก HR (ดูอย่างเดียว)
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ข้อมูลการจ้างงานที่ตั้งค่าโดยฝ่ายบุคคล
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500">
              อ่านอย่างเดียว
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">ตำแหน่งงาน</div>
              <div className="font-bold text-slate-900 dark:text-white mt-1">
                {hrProfile.position || '-'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">อายุงานปัจจุบัน</div>
              <div className="font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                {tenureText}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">วันเริ่มงาน</div>
              <div className="font-mono font-bold text-slate-900 dark:text-white mt-1">
                {hrProfile.startDate || '-'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">วันผ่านโปร</div>
              <div className="font-mono font-bold text-slate-900 dark:text-white mt-1">
                {hrProfile.probationEndDate || '-'}
              </div>
            </div>
          </div>
        </div>

        {/* งานของฉันรอบนี้ */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
                <CalendarCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  งานของฉันรอบนี้ ({currentCycle.cycleLabel.replace('รอบตัดยอด ', '')})
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ช่วงเวลา {currentCycle.periodLabel} (ดึงเฉพาะข้อมูลของคุณในรอบปัจจุบัน)
                </p>
              </div>
            </div>
          </div>

          {loadingWorkCycle ? (
            <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              <span>กำลังโหลดข้อมูลกะงาน OT และยอดเบิกล่วงหน้ารอบนี้...</span>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Shift summary */}
                <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-900/50">
                  <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                    <CalendarCheck className="w-3.5 h-3.5" />
                    กะของฉันในรอบปัจจุบัน
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                    ทำงาน {shiftStats.workDays} วัน
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    หยุด {shiftStats.offDays} • ลา {shiftStats.leaveDays} • นักขัตฯ{' '}
                    {shiftStats.holidayDays} วัน
                  </div>
                </div>

                {/* Approved OT hours */}
                <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
                  <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    ชั่วโมง OT ที่อนุมัติแล้ว
                  </div>
                  <div className="text-base font-black text-amber-700 dark:text-amber-300 mt-1 tabular-nums">
                    {approvedOtHours.toLocaleString()} ชม.
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    อนุมัติแล้ว {approvedOtCount} รายการในรอบนี้
                  </div>
                </div>

                {/* Approved Advance */}
                <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
                  <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5" />
                    ยอดเบิกล่วงหน้าที่อนุมัติ
                  </div>
                  <div className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                    {approvedAdvanceTotal.toLocaleString()} บาท
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    อนุมัติแล้ว {approvedAdvanceCount} รายการในรอบนี้
                  </div>
                </div>
              </div>

              {/* Compact horizontal shift strip for current cycle */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2">
                  ตารางกะรายวันของฉันในรอบนี้ (วันที่ 26 – 25)
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {cycleDays.map((d) => {
                    const val = myShiftsMap[d.dateStr] || '';
                    const special = SPECIAL_DAYS_CONFIG[val];
                    const tmpl = shiftStats.templateMap.get(val);
                    const label = special
                      ? special.shortCode
                      : tmpl
                      ? tmpl.shortCode
                      : val || '-';
                    const color = special
                      ? special.color
                      : tmpl
                      ? tmpl.color
                      : '#94a3b8';

                    return (
                      <div
                        key={d.dateStr}
                        className="min-w-[44px] p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-center shrink-0"
                        title={`${d.dateStr}: ${
                          special
                            ? special.label
                            : tmpl
                            ? `${tmpl.name} (${tmpl.startTime}-${tmpl.endTime})`
                            : 'ยังไม่จัดกะ'
                        }`}
                      >
                        <div className="text-[9px] text-slate-400">
                          {d.dayNumber} {d.thaiDayShort}
                        </div>
                        <div
                          className="text-[10px] font-extrabold mt-0.5 truncate"
                          style={{ color: val ? color : undefined }}
                        >
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Notice Banner */}
      <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-slate-700 dark:text-slate-300 font-medium">
            เพื่อความปลอดภัยสูงสุด ข้อมูลลับส่วนบุคคลจะถูกซ่อนและไม่ถูกดึงกลับมาแสดงแบบเต็มบนหน้าจอนี้
            {!hasSubmittedFirstTime
              ? ' (กรอกข้อมูลครั้งแรกบันทึกได้ทันทีไม่ต้องรออนุมัติ)'
              : ' (การขอแก้ไขข้อมูลครั้งถัดไปจะต้องรอแอดมิน HR อนุมัติ)'}
          </span>
        </div>
      </div>

      {/* Category Cards (ก - ซ) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ก. ข้อมูลส่วนตัว */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
                <User className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  ก. ข้อมูลส่วนตัว
                </h3>
                <p className="text-[11px] text-slate-400">ชื่อ-นามสกุล ไทย/อังกฤษ วันเกิด สถานภาพ</p>
              </div>
            </div>
            {renderActionButton('personal')}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">คำนำหน้า</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {masked.title || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">ชื่อเล่น</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {masked.nickname || hrProfile.nickname || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">ชื่อ-นามสกุล (ไทย)</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {masked.firstNameTh || masked.lastNameTh
                  ? `${masked.firstNameTh} ${masked.lastNameTh}`.trim()
                  : '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">ชื่อ-นามสกุล (อังกฤษ)</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {masked.firstNameEn || masked.lastNameEn
                  ? `${masked.firstNameEn} ${masked.lastNameEn}`.trim()
                  : '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">วันเกิด</span>
              <div className="mt-0.5">{renderFillStatusBadge(masked.birthDateStatus)}</div>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">สถานภาพสมรส</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {masked.maritalStatus || '-'}
              </span>
            </div>
          </div>
        </div>

        {/* ข. บัตรประชาชน */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400">
                <CreditCard className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  ข. บัตรประชาชน
                </h3>
                <p className="text-[11px] text-slate-400">เลขบัตร 13 หลัก วันหมดอายุ และที่อยู่ตามบัตร</p>
              </div>
            </div>
            {renderActionButton('idcard')}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="col-span-2">
              <span className="text-slate-400 block text-[11px]">เลขบัตรประชาชน 13 หลัก</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {masked.ssoNumberMasked || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">วันหมดอายุบัตร</span>
              <div className="mt-0.5">{renderFillStatusBadge(masked.idCardExpiryStatus)}</div>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">ที่อยู่ตามบัตรประชาชน</span>
              <div className="mt-0.5">{renderFillStatusBadge(masked.addressStatus)}</div>
            </div>
          </div>
        </div>

        {/* ค. ติดต่อ */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400">
                <Phone className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  ค. ข้อมูลการติดต่อ
                </h3>
                <p className="text-[11px] text-slate-400">ที่อยู่ปัจจุบัน เบอร์มือถือ อีเมล LINE ID</p>
              </div>
            </div>
            {renderActionButton('contact')}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">เบอร์มือถือ</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {masked.phoneMasked || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">ที่อยู่ปัจจุบัน</span>
              <div className="mt-0.5">{renderFillStatusBadge(masked.currentAddressStatus)}</div>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">อีเมลส่วนตัว</span>
              <div className="mt-0.5">{renderFillStatusBadge(masked.emailStatus)}</div>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">LINE ID</span>
              <div className="mt-0.5">{renderFillStatusBadge(masked.lineIdStatus)}</div>
            </div>
          </div>
        </div>

        {/* ง. ผู้ติดต่อฉุกเฉิน */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400">
                <HeartHandshake className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  ง. ผู้ติดต่อฉุกเฉิน
                </h3>
                <p className="text-[11px] text-slate-400">ชื่อผู้ติดต่อ ความสัมพันธ์ และเบอร์โทรศัพท์</p>
              </div>
            </div>
            {renderActionButton('emergency')}
          </div>

          <div className="text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">ข้อมูลผู้ติดต่อฉุกเฉิน</span>
              {renderFillStatusBadge(masked.emergencyStatus)}
            </div>
            <p className="text-[11px] text-slate-400">
              ข้อมูลชื่อ ความสัมพันธ์ และเบอร์ติดต่อฉุกเฉินถูกเก็บรักษาเป็นความลับเฉพาะฝ่ายบุคคล
            </p>
          </div>
        </div>

        {/* จ. บัญชีรับเงินเดือน */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400">
                <Building2 className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  จ. บัญชีรับเงินเดือน
                </h3>
                <p className="text-[11px] text-slate-400">ธนาคาร ชื่อบัญชี และเลขที่บัญชีรับเงินเดือน</p>
              </div>
            </div>
            {renderActionButton('bank')}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">ธนาคาร</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {masked.bankName || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">ชื่อบัญชี</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {masked.accountName || '-'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 block text-[11px]">เลขที่บัญชี</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                {masked.accountNumberMasked || '-'}
              </span>
            </div>
          </div>
        </div>

        {/* ฉ. ประกันสังคม (ไม่บังคับ) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  ฉ. ประกันสังคม <span className="text-[11px] font-normal text-slate-400">(ไม่บังคับ)</span>
                </h3>
                <p className="text-[11px] text-slate-400">สถานพยาบาลที่ต้องการ และประวัติประกันสังคม</p>
              </div>
            </div>
            {renderActionButton('sso')}
          </div>

          <div className="text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">ข้อมูลสถานพยาบาลและประวัติ สปส.</span>
              {renderFillStatusBadge(masked.ssoSectionStatus)}
            </div>
          </div>
        </div>

        {/* ช. ลดหย่อนภาษี (ไม่บังคับ) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-600 dark:text-teal-400">
                <FileCheck2 className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  ช. ลดหย่อนภาษี <span className="text-[11px] font-normal text-slate-400">(ไม่บังคับ)</span>
                </h3>
                <p className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
                  ใช้คำนวณภาษีหัก ณ ที่จ่ายในอนาคต
                </p>
              </div>
            </div>
            {renderActionButton('tax')}
          </div>

          <div className="text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">ข้อมูลคู่สมรส บุตร บิดามารดา และเบี้ยประกัน</span>
              {renderFillStatusBadge(masked.taxDeductionStatus)}
            </div>
          </div>
        </div>

        {/* ซ. การศึกษา (ไม่บังคับ) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400">
                <BookOpen className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  ซ. การศึกษา <span className="text-[11px] font-normal text-slate-400">(ไม่บังคับ)</span>
                </h3>
                <p className="text-[11px] text-slate-400">วุฒิการศึกษาสูงสุด และชื่อสถานศึกษา</p>
              </div>
            </div>
            {renderActionButton('education')}
          </div>

          <div className="text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">ข้อมูลวุฒิการศึกษาและสถานศึกษา</span>
              {renderFillStatusBadge(masked.educationStatus)}
            </div>
          </div>
        </div>
      </div>

      {/* Self-Service Form Modal */}
      {showFormModal && (
        <EmployeeSelfProfileFormModal
          employeeId={user.uid}
          employeeName={hrProfile.fullName || user.name}
          hasSubmittedFirstTime={hasSubmittedFirstTime}
          existingStatus={profileStatus}
          fallbackNickname={hrProfile.nickname || ''}
          initialFocusSection={initialFocusSection}
          onClose={() => setShowFormModal(false)}
          onSuccess={(newStatus, isFirstTime) => {
            setProfileStatus(newStatus);
            setShowFormModal(false);
            setSubmitNotice({
              type: 'success',
              message: isFirstTime
                ? 'บันทึกข้อมูลพนักงานครั้งแรกเรียบร้อยแล้ว'
                : 'ส่งคำขอแก้ไขข้อมูลเรียบร้อยแล้ว กรุณารอแอดมิน HR อนุมัติ',
            });
          }}
        />
      )}
    </div>
  );
}

// ===============================================================
// Modal: Employee Self-Service Form (First-Time & Edit Request)
// ===============================================================

function EmployeeSelfProfileFormModal({
  employeeId,
  employeeName,
  hasSubmittedFirstTime,
  existingStatus,
  fallbackNickname,
  onClose,
  onSuccess,
}: {
  employeeId: string;
  employeeName: string;
  hasSubmittedFirstTime: boolean;
  existingStatus: ProfileStatusDoc | null;
  fallbackNickname: string;
  initialFocusSection: string | null;
  onClose: () => void;
  onSuccess: (updatedStatus: ProfileStatusDoc, isFirstTime: boolean) => void;
}) {
  const isEditMode = hasSubmittedFirstTime;
  const prevMasked = existingStatus?.maskedSummary;

  // Non-confidential fields can show current public values in edit mode;
  // ALL confidential fields start empty with placeholder "กรอกใหม่ถ้าต้องการเปลี่ยน"
  const [title, setTitle] = useState(isEditMode ? prevMasked?.title || '' : 'นาย');
  const [firstNameTh, setFirstNameTh] = useState(isEditMode ? prevMasked?.firstNameTh || '' : '');
  const [lastNameTh, setLastNameTh] = useState(isEditMode ? prevMasked?.lastNameTh || '' : '');
  const [firstNameEn, setFirstNameEn] = useState(isEditMode ? prevMasked?.firstNameEn || '' : '');
  const [lastNameEn, setLastNameEn] = useState(isEditMode ? prevMasked?.lastNameEn || '' : '');
  const [nickname, setNickname] = useState(
    isEditMode ? prevMasked?.nickname || fallbackNickname : fallbackNickname
  );
  const [birthDate, setBirthDate] = useState('');
  const [maritalStatus, setMaritalStatus] = useState(
    isEditMode ? prevMasked?.maritalStatus || '' : 'โสด'
  );

  // ข. บัตรประชาชน (Confidential -> always blank in edit mode)
  const [ssoNumber, setSsoNumber] = useState('');
  const [idCardExpiry, setIdCardExpiry] = useState('');
  const [address, setAddress] = useState('');

  // ค. ติดต่อ (Confidential -> always blank in edit mode)
  const [sameAsIdCardAddress, setSameAsIdCardAddress] = useState(false);
  const [currentAddress, setCurrentAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lineId, setLineId] = useState('');

  // ง. ผู้ติดต่อฉุกเฉิน (Confidential -> always blank in edit mode)
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // จ. บัญชีรับเงินเดือน (bankName & accountName are non-masked; accountNumber is confidential)
  const [bankName, setBankName] = useState(isEditMode ? prevMasked?.bankName || '' : '');
  const [accountName, setAccountName] = useState(isEditMode ? prevMasked?.accountName || '' : '');
  const [accountNumber, setAccountNumber] = useState('');

  // ฉ. ประกันสังคม (ไม่บังคับ)
  const [ssoHospital, setSsoHospital] = useState('');
  const [hadSsoBefore, setHadSsoBefore] = useState('');

  // ช. ลดหย่อนภาษี (ไม่บังคับ)
  const [spouseHasIncome, setSpouseHasIncome] = useState('');
  const [childrenCount, setChildrenCount] = useState<string>('');
  const [parentsSupportedCount, setParentsSupportedCount] = useState<string>('');
  const [lifeInsurancePerYear, setLifeInsurancePerYear] = useState<string>('');
  const [healthInsurancePerYear, setHealthInsurancePerYear] = useState<string>('');

  // ซ. การศึกษา (ไม่บังคับ)
  const [educationLevel, setEducationLevel] = useState('');
  const [educationInstitute, setEducationInstitute] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync currentAddress when sameAsIdCardAddress is checked
  useEffect(() => {
    if (sameAsIdCardAddress) {
      setCurrentAddress(address);
    }
  }, [sameAsIdCardAddress, address]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

  const secretPlaceholder = (defaultPlaceholder: string) =>
    isEditMode ? 'กรอกใหม่ถ้าต้องการเปลี่ยน' : defaultPlaceholder;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanSso = ssoNumber.replace(/[\s-]/g, '');
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const cleanEmergPhone = emergencyPhone.replace(/[\s-]/g, '');
    const cleanAccNum = accountNumber.replace(/[\s-]/g, '');
    const finalCurrentAddress = sameAsIdCardAddress ? address.trim() : currentAddress.trim();

    // 1. First-time mandatory check: ก, ข, ค, ง, จ must be filled completely
    if (!isEditMode) {
      if (
        !title.trim() ||
        !firstNameTh.trim() ||
        !lastNameTh.trim() ||
        !firstNameEn.trim() ||
        !lastNameEn.trim() ||
        !nickname.trim() ||
        !birthDate.trim() ||
        !maritalStatus.trim()
      ) {
        setErrorMsg('กรุณากรอกข้อมูลหมวด ก. ข้อมูลส่วนตัว ให้ครบทุกช่อง');
        return;
      }

      if (!cleanSso || !idCardExpiry.trim() || !address.trim()) {
        setErrorMsg('กรุณากรอกข้อมูลหมวด ข. บัตรประชาชน ให้ครบทุกช่อง');
        return;
      }

      if (!finalCurrentAddress || !cleanPhone || !email.trim() || !lineId.trim()) {
        setErrorMsg('กรุณากรอกข้อมูลหมวด ค. ข้อมูลการติดต่อ ให้ครบทุกช่อง');
        return;
      }

      if (!emergencyName.trim() || !emergencyRelation.trim() || !cleanEmergPhone) {
        setErrorMsg('กรุณากรอกข้อมูลหมวด ง. ผู้ติดต่อฉุกเฉิน ให้ครบทุกช่อง');
        return;
      }

      if (!bankName.trim() || !accountName.trim() || !cleanAccNum) {
        setErrorMsg('กรุณากรอกข้อมูลหมวด จ. บัญชีรับเงินเดือน ให้ครบทุกช่อง');
        return;
      }
    }

    // 2. Validation rules on filled fields
    if (cleanSso) {
      if (!validateThaiIdCard13Digits(cleanSso)) {
        setErrorMsg('เลขบัตรประชาชน 13 หลักไม่ถูกต้องตามสูตรตรวจสอบหลักที่ 13');
        return;
      }
    }

    if (cleanPhone) {
      if (!/^0\d{9}$/.test(cleanPhone)) {
        setErrorMsg('เบอร์มือถือต้องเป็นตัวเลข 10 หลัก และขึ้นต้นด้วยเลข 0');
        return;
      }
    }

    if (cleanEmergPhone) {
      if (!/^0\d{9}$/.test(cleanEmergPhone)) {
        setErrorMsg('เบอร์โทรผู้ติดต่อฉุกเฉินต้องเป็นตัวเลข 10 หลัก และขึ้นต้นด้วยเลข 0');
        return;
      }
    }

    if (cleanAccNum) {
      if (!/^\d{10,12}$/.test(cleanAccNum)) {
        setErrorMsg('เลขที่บัญชีธนาคารต้องเป็นตัวเลข 10 ถึง 12 หลัก');
        return;
      }
    }

    if (birthDate.trim()) {
      if (birthDate.trim() > todayStr) {
        setErrorMsg('วันเกิดต้องไม่เป็นวันในอนาคต');
        return;
      }
    }

    if (parentsSupportedCount.trim() !== '') {
      const pCount = Number(parentsSupportedCount);
      if (!Number.isFinite(pCount) || pCount < 0 || pCount > 4) {
        setErrorMsg('จำนวนบิดามารดาที่อุปการะต้องอยู่ระหว่าง 0 ถึง 4 คน');
        return;
      }
    }

    // Build payload
    const payload: EmployeeSelfSubmittedFields = {};

    if (!isEditMode) {
      payload.title = title.trim();
      payload.firstNameTh = firstNameTh.trim();
      payload.lastNameTh = lastNameTh.trim();
      payload.firstNameEn = firstNameEn.trim();
      payload.lastNameEn = lastNameEn.trim();
      payload.nickname = nickname.trim();
      payload.birthDate = birthDate.trim();
      payload.maritalStatus = maritalStatus.trim();

      payload.ssoNumber = cleanSso;
      payload.idCardExpiry = idCardExpiry.trim();
      payload.address = address.trim();

      payload.currentAddress = finalCurrentAddress;
      payload.phone = cleanPhone;
      payload.email = email.trim();
      payload.lineId = lineId.trim();

      payload.emergencyName = emergencyName.trim();
      payload.emergencyRelation = emergencyRelation.trim();
      payload.emergencyPhone = cleanEmergPhone;

      payload.bankName = bankName.trim();
      payload.accountName = accountName.trim();
      payload.accountNumber = cleanAccNum;

      if (ssoHospital.trim()) payload.ssoHospital = ssoHospital.trim();
      if (hadSsoBefore.trim()) payload.hadSsoBefore = hadSsoBefore.trim();

      if (spouseHasIncome.trim()) payload.spouseHasIncome = spouseHasIncome.trim();
      if (childrenCount.trim() !== '') payload.childrenCount = Math.max(0, parseInt(childrenCount, 10) || 0);
      if (parentsSupportedCount.trim() !== '') {
        payload.parentsSupportedCount = Math.min(4, Math.max(0, parseInt(parentsSupportedCount, 10) || 0));
      }
      if (lifeInsurancePerYear.trim() !== '') {
        payload.lifeInsurancePerYear = Math.max(0, parseFloat(lifeInsurancePerYear) || 0);
      }
      if (healthInsurancePerYear.trim() !== '') {
        payload.healthInsurancePerYear = Math.max(0, parseFloat(healthInsurancePerYear) || 0);
      }

      if (educationLevel.trim()) payload.educationLevel = educationLevel.trim();
      if (educationInstitute.trim()) payload.educationInstitute = educationInstitute.trim();
    } else {
      // Edit mode: include only fields that were changed or newly filled
      if (title.trim() && title.trim() !== (prevMasked?.title || '')) payload.title = title.trim();
      if (firstNameTh.trim() && firstNameTh.trim() !== (prevMasked?.firstNameTh || '')) {
        payload.firstNameTh = firstNameTh.trim();
      }
      if (lastNameTh.trim() && lastNameTh.trim() !== (prevMasked?.lastNameTh || '')) {
        payload.lastNameTh = lastNameTh.trim();
      }
      if (firstNameEn.trim() && firstNameEn.trim() !== (prevMasked?.firstNameEn || '')) {
        payload.firstNameEn = firstNameEn.trim();
      }
      if (lastNameEn.trim() && lastNameEn.trim() !== (prevMasked?.lastNameEn || '')) {
        payload.lastNameEn = lastNameEn.trim();
      }
      if (nickname.trim() && nickname.trim() !== (prevMasked?.nickname || fallbackNickname)) {
        payload.nickname = nickname.trim();
      }
      if (birthDate.trim()) payload.birthDate = birthDate.trim();
      if (maritalStatus.trim() && maritalStatus.trim() !== (prevMasked?.maritalStatus || '')) {
        payload.maritalStatus = maritalStatus.trim();
      }

      if (cleanSso) payload.ssoNumber = cleanSso;
      if (idCardExpiry.trim()) payload.idCardExpiry = idCardExpiry.trim();
      if (address.trim()) payload.address = address.trim();

      if (finalCurrentAddress) payload.currentAddress = finalCurrentAddress;
      if (cleanPhone) payload.phone = cleanPhone;
      if (email.trim()) payload.email = email.trim();
      if (lineId.trim()) payload.lineId = lineId.trim();

      if (emergencyName.trim()) payload.emergencyName = emergencyName.trim();
      if (emergencyRelation.trim()) payload.emergencyRelation = emergencyRelation.trim();
      if (cleanEmergPhone) payload.emergencyPhone = cleanEmergPhone;

      if (bankName.trim() && bankName.trim() !== (prevMasked?.bankName || '')) {
        payload.bankName = bankName.trim();
      }
      if (accountName.trim() && accountName.trim() !== (prevMasked?.accountName || '')) {
        payload.accountName = accountName.trim();
      }
      if (cleanAccNum) payload.accountNumber = cleanAccNum;

      if (ssoHospital.trim()) payload.ssoHospital = ssoHospital.trim();
      if (hadSsoBefore.trim()) payload.hadSsoBefore = hadSsoBefore.trim();

      if (spouseHasIncome.trim()) payload.spouseHasIncome = spouseHasIncome.trim();
      if (childrenCount.trim() !== '') payload.childrenCount = Math.max(0, parseInt(childrenCount, 10) || 0);
      if (parentsSupportedCount.trim() !== '') {
        payload.parentsSupportedCount = Math.min(4, Math.max(0, parseInt(parentsSupportedCount, 10) || 0));
      }
      if (lifeInsurancePerYear.trim() !== '') {
        payload.lifeInsurancePerYear = Math.max(0, parseFloat(lifeInsurancePerYear) || 0);
      }
      if (healthInsurancePerYear.trim() !== '') {
        payload.healthInsurancePerYear = Math.max(0, parseFloat(healthInsurancePerYear) || 0);
      }

      if (educationLevel.trim()) payload.educationLevel = educationLevel.trim();
      if (educationInstitute.trim()) payload.educationInstitute = educationInstitute.trim();

      if (Object.keys(payload).length === 0) {
        setErrorMsg('กรุณากรอกหรือแก้ไขข้อมูลอย่างน้อย 1 ช่องก่อนกดส่งคำขอแก้ไข');
        return;
      }
    }

    setSubmitting(true);
    try {
      const updatedStatus = await submitEmployeeProfileRequest({
        employeeId,
        employeeName,
        isFirstTime: !isEditMode,
        data: payload,
        existingStatus,
      });
      window.dispatchEvent(new CustomEvent('hr-profile-requests-updated'));
      onSuccess(updatedStatus, !isEditMode);
    } catch (err) {
      console.error('Error submitting profile request:', err);
      setErrorMsg('ไม่สามารถส่งข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl p-5 space-y-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <Edit3 className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {isEditMode
                  ? 'ขอแก้ไขข้อมูลส่วนบุคคล (รออนุมัติจากแอดมิน HR)'
                  : 'กรอกข้อมูลพนักงานครั้งแรก (บันทึกได้ทันที)'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isEditMode
                  ? 'ช่องข้อมูลลับจะเว้นว่างไว้เพื่อความปลอดภัย กรอกเฉพาะช่องที่คุณต้องการเปลี่ยน'
                  : 'กรุณากรอกหมวด ก, ข, ค, ง และ จ ให้ครบทุกช่อง (หมวด ฉ, ช, ซ ไม่บังคับ)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 pr-1 space-y-5 text-xs">
          {/* ก. ข้อมูลส่วนตัว */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span>ก. ข้อมูลส่วนตัว {!isEditMode && <span className="text-rose-500">*</span>}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  คำนำหน้า
                </label>
                <select
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">-- เลือก --</option>
                  <option value="นาย">นาย</option>
                  <option value="นาง">นาง</option>
                  <option value="นางสาว">นางสาว</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ชื่อจริง (ไทย)
                </label>
                <input
                  type="text"
                  value={firstNameTh}
                  onChange={(e) => setFirstNameTh(e.target.value)}
                  placeholder="เช่น สมชาย"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  นามสกุล (ไทย)
                </label>
                <input
                  type="text"
                  value={lastNameTh}
                  onChange={(e) => setLastNameTh(e.target.value)}
                  placeholder="เช่น ใจดี"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ชื่อจริง (อังกฤษ)
                </label>
                <input
                  type="text"
                  value={firstNameEn}
                  onChange={(e) => setFirstNameEn(e.target.value)}
                  placeholder="Somchai"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  นามสกุล (อังกฤษ)
                </label>
                <input
                  type="text"
                  value={lastNameEn}
                  onChange={(e) => setLastNameEn(e.target.value)}
                  placeholder="Jaidee"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ชื่อเล่น
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="เช่น ชาย"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  วันเกิด {isEditMode && '(กรอกใหม่ถ้าต้องการเปลี่ยน)'}
                </label>
                <input
                  type="date"
                  max={todayStr}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  สถานภาพสมรส
                </label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">-- เลือก --</option>
                  <option value="โสด">โสด</option>
                  <option value="สมรส">สมรส</option>
                  <option value="หย่า">หย่า</option>
                  <option value="หม้าย">หม้าย</option>
                </select>
              </div>
            </div>
          </div>

          {/* ข. บัตรประชาชน */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white">
              ข. บัตรประชาชน {!isEditMode && <span className="text-rose-500">*</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  เลขบัตรประชาชน 13 หลัก
                </label>
                <input
                  type="text"
                  maxLength={13}
                  value={ssoNumber}
                  onChange={(e) => setSsoNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder={secretPlaceholder('กรอกเลขบัตรประชาชน 13 หลัก')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  วันหมดอายุบัตร {isEditMode && '(กรอกใหม่ถ้าต้องการเปลี่ยน)'}
                </label>
                <input
                  type="date"
                  value={idCardExpiry}
                  onChange={(e) => setIdCardExpiry(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ที่อยู่ตามบัตรประชาชน
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={secretPlaceholder('บ้านเลขที่ หมู่ ซอย ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {/* ค. ติดต่อ */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white">
              ค. ข้อมูลการติดต่อ {!isEditMode && <span className="text-rose-500">*</span>}
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    ที่อยู่ปัจจุบัน
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sameAsIdCardAddress}
                      onChange={(e) => setSameAsIdCardAddress(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>เหมือนที่อยู่ตามบัตร</span>
                  </label>
                </div>
                <textarea
                  rows={2}
                  disabled={sameAsIdCardAddress}
                  value={sameAsIdCardAddress ? address : currentAddress}
                  onChange={(e) => setCurrentAddress(e.target.value)}
                  placeholder={secretPlaceholder('กรอกที่อยู่ปัจจุบันที่ติดต่อได้')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    เบอร์มือถือ (10 หลัก ขึ้นต้นด้วย 0)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder={secretPlaceholder('เช่น 0812345678')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    อีเมลส่วนตัว
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={secretPlaceholder('example@email.com')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    LINE ID
                  </label>
                  <input
                    type="text"
                    value={lineId}
                    onChange={(e) => setLineId(e.target.value)}
                    placeholder={secretPlaceholder('ระบุ LINE ID')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ง. ผู้ติดต่อฉุกเฉิน */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white">
              ง. ผู้ติดต่อฉุกเฉิน {!isEditMode && <span className="text-rose-500">*</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ชื่อ-นามสกุล ผู้ติดต่อฉุกเฉิน
                </label>
                <input
                  type="text"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder={secretPlaceholder('ระบุชื่อผู้ติดต่อฉุกเฉิน')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ความสัมพันธ์
                </label>
                <input
                  type="text"
                  value={emergencyRelation}
                  onChange={(e) => setEmergencyRelation(e.target.value)}
                  placeholder={secretPlaceholder('เช่น บิดา, มารดา, คู่สมรส, พี่น้อง')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  เบอร์โทรฉุกเฉิน (10 หลัก)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder={secretPlaceholder('เช่น 0891234567')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
            </div>
          </div>

          {/* จ. บัญชีรับเงินเดือน */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white">
              จ. บัญชีรับเงินเดือน {!isEditMode && <span className="text-rose-500">*</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ธนาคาร
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="เช่น กสิกรไทย, ไทยพาณิชย์"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ชื่อบัญชี
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="ชื่อ-นามสกุล หน้าสมุดบัญชี"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  เลขที่บัญชี (10–12 หลัก)
                </label>
                <input
                  type="text"
                  maxLength={12}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder={secretPlaceholder('กรอกเลขบัญชี 10-12 หลัก')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
            </div>
          </div>

          {/* ฉ. ประกันสังคม (ไม่บังคับ) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white">
              ฉ. ประกันสังคม <span className="text-[11px] font-normal text-slate-400">(ไม่บังคับ)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  โรงพยาบาลประกันสังคมที่ต้องการ
                </label>
                <input
                  type="text"
                  value={ssoHospital}
                  onChange={(e) => setSsoHospital(e.target.value)}
                  placeholder={secretPlaceholder('ระบุชื่อโรงพยาบาลตามสิทธิ์ สปส.')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  เคยมีประกันสังคมมาก่อนหรือไม่
                </label>
                <select
                  value={hadSsoBefore}
                  onChange={(e) => setHadSsoBefore(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">-- เลือก --</option>
                  <option value="เคยมี">เคยมี</option>
                  <option value="ไม่เคย">ไม่เคย</option>
                </select>
              </div>
            </div>
          </div>

          {/* ช. ลดหย่อนภาษี (ไม่บังคับ) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">
                ช. ลดหย่อนภาษี <span className="text-[11px] font-normal text-slate-400">(ไม่บังคับ)</span>
              </div>
              <div className="text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                ใช้คำนวณภาษีหัก ณ ที่จ่ายในอนาคต
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  คู่สมรสมีรายได้หรือไม่
                </label>
                <select
                  value={spouseHasIncome}
                  onChange={(e) => setSpouseHasIncome(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">-- เลือก --</option>
                  <option value="ไม่มีคู่สมรส">ไม่มีคู่สมรส</option>
                  <option value="มีรายได้">มีรายได้</option>
                  <option value="ไม่มีรายได้">ไม่มีรายได้</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  จำนวนบุตร (คน)
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={childrenCount}
                  onChange={(e) => setChildrenCount(e.target.value)}
                  placeholder={secretPlaceholder('0')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  จำนวนบิดามารดาที่อุปการะ (0–4 คน)
                </label>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={parentsSupportedCount}
                  onChange={(e) => setParentsSupportedCount(e.target.value)}
                  placeholder={secretPlaceholder('0 - 4')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  เบี้ยประกันชีวิต/ปี (บาท)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={lifeInsurancePerYear}
                  onChange={(e) => setLifeInsurancePerYear(e.target.value)}
                  placeholder={secretPlaceholder('0')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  เบี้ยประกันสุขภาพ/ปี (บาท)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={healthInsurancePerYear}
                  onChange={(e) => setHealthInsurancePerYear(e.target.value)}
                  placeholder={secretPlaceholder('0')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
            </div>
          </div>

          {/* ซ. การศึกษา (ไม่บังคับ) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white">
              ซ. การศึกษา <span className="text-[11px] font-normal text-slate-400">(ไม่บังคับ)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  วุฒิการศึกษาสูงสุด
                </label>
                <input
                  type="text"
                  value={educationLevel}
                  onChange={(e) => setEducationLevel(e.target.value)}
                  placeholder={secretPlaceholder('เช่น ปริญญาตรี, ปวส., ม.6')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  ชื่อสถานศึกษา
                </label>
                <input
                  type="text"
                  value={educationInstitute}
                  onChange={(e) => setEducationInstitute(e.target.value)}
                  placeholder={secretPlaceholder('ระบุชื่อมหาวิทยาลัย / สถาบัน')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {submitting
                  ? 'กำลังส่งข้อมูล...'
                  : isEditMode
                  ? 'ส่งคำขอแก้ไขข้อมูล'
                  : 'บันทึกข้อมูลครั้งแรก'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
