import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import * as XLSX from 'xlsx';
import { auth, db } from '../lib/firebase';
import { useStore, isUserAdmin } from '../store/useStore';
import {
  HRPrivateData,
  HRProfile,
  PayrollItemDefinition,
  PayrollItemType,
  PayrollSettingsDoc,
  PayrollSlip,
  PayrollSlipItem,
} from '../types';
import {
  HR_PRIVATE_IDLE_TIMEOUT_MS,
  fetchHRPrivateEmployee,
  fetchHRProfiles,
  getDefaultHRProfile,
  lockHrAdminEmailSession,
  maskSensitiveNumber,
  signInHrAdminEmail,
} from '../lib/hrService';
import {
  ApprovedOTHoursByType,
  areOTMultipliersComplete,
  calculatePayrollSlipValues,
  calculateYTDTotals,
  checkPayItemUsedInConfirmedSlips,
  fetchEmployeeCycleApprovedAdvance,
  fetchEmployeeCycleApprovedOT,
  fetchEmployeeYearConfirmedSlips,
  fetchPayrollSettings,
  fetchPayrollSlip,
  getDefaultPayrollSettings,
  getYearFromCycleKey,
  round2,
  savePayrollSettings,
  savePayrollSlip,
  unconfirmPayrollSlip,
} from '../lib/payrollService';
import { getAvailableOTCycles, getOTCycleFromDate } from '../lib/otUtils';
import { AnimalAvatar } from './AnimalAvatar';
import {
  PayslipDocument,
  PayslipYTDInfo,
  downloadBatchPayslipsPdf,
  downloadSinglePayslipPdf,
} from './PayslipDocument';

interface EmployeeRowComputedData {
  privateData: HRPrivateData;
  otHours: ApprovedOTHoursByType;
  approvedAdvance: number;
  slip: PayrollSlip | null;
}

export function AdminPayrollDashboard() {
  const { user, registeredUsers } = useStore();
  const isAdmin = isUserAdmin(user);

  // Cycle & Pay Date
  const availableCycles = useMemo(() => getAvailableOTCycles(), []);
  const [selectedCycleKey, setSelectedCycleKey] = useState<string>(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return getOTCycleFromDate(todayStr).cycleKey;
  });

  const selectedCycleInfo = useMemo(() => {
    return (
      availableCycles.find((c) => c.cycleKey === selectedCycleKey) ||
      availableCycles[1] ||
      availableCycles[0]
    );
  }, [availableCycles, selectedCycleKey]);

  const [payDate, setPayDate] = useState<string>(() => `${selectedCycleKey}-25`);

  // Basic HR Profiles & Payroll Settings (system_settings)
  const [profiles, setProfiles] = useState<Record<string, HRProfile>>({});
  const [settings, setSettings] = useState<PayrollSettingsDoc>(() => getDefaultPayrollSettings());
  const [baseLoading, setBaseLoading] = useState<boolean>(true);
  const [baseLoadError, setBaseLoadError] = useState<boolean>(false);
  const [baseReloadCount, setBaseReloadCount] = useState<number>(0);

  // HR Confidential Unlock State (Firebase Email/Password Auth)
  const [isHrUnlocked, setIsHrUnlocked] = useState<boolean>(false);
  const [hrUnlockedEmail, setHrUnlockedEmail] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const lastHrActivityRef = useRef<number>(Date.now());

  // Employee Confidential & Cycle Payroll Data (loaded per employee when unlocked)
  const [rowDataMap, setRowDataMap] = useState<Record<string, EmployeeRowComputedData>>({});
  const [rowsLoading, setRowsLoading] = useState<boolean>(false);
  const [rowsLoadError, setRowsLoadError] = useState<string | null>(null);
  const [rowsReloadCount, setRowsReloadCount] = useState<number>(0);

  // UI State
  const [activeSubTab, setActiveSubTab] = useState<'slips' | 'summary_report'>('slips');
  const [summaryReloadTrigger, setSummaryReloadTrigger] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_created' | 'draft' | 'confirmed'>(
    'all'
  );
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // PDF Preview & Download States
  const [previewSlipData, setPreviewSlipData] = useState<{
    slip: PayrollSlip;
    employeeUsername?: string;
    ytdTotals: PayslipYTDInfo;
  } | null>(null);
  const [loadingPreviewEmpId, setLoadingPreviewEmpId] = useState<string | null>(null);
  const [downloadingSingleEmpId, setDownloadingSingleEmpId] = useState<string | null>(null);
  const [downloadingBatchPdf, setDownloadingBatchPdf] = useState<boolean>(false);

  const [singlePrintJob, setSinglePrintJob] = useState<{
    slip: PayrollSlip;
    employeeUsername?: string;
    fullName: string;
    ytdTotals: PayslipYTDInfo;
  } | null>(null);
  const singlePrintRef = useRef<HTMLDivElement | null>(null);

  const [batchPrintJobs, setBatchPrintJobs] = useState<
    Array<{
      slip: PayrollSlip;
      employeeUsername?: string;
      ytdTotals: PayslipYTDInfo;
    }>
  >([]);
  const batchPrintContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync Firebase Auth state for email/password provider
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      const isPasswordProvider = fbUser?.providerData?.some((p) => p.providerId === 'password');
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
    setActiveEmployeeId(null);
    setPreviewSlipData(null);
    setSinglePrintJob(null);
    setBatchPrintJobs([]);
    setRowDataMap({});
    if (isAutoTimeout) {
      setStatusNotice({
        type: 'error',
        message: 'ล็อกข้อมูลสลิปเงินเดือนอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน 15 นาที',
      });
    } else {
      setStatusNotice({
        type: 'success',
        message: 'ล็อกข้อมูลลับสลิปเงินเดือนและออกจากระบบยืนยันตัวตนอีเมลเรียบร้อยแล้ว',
      });
      setTimeout(() => setStatusNotice(null), 4000);
    }
  }, []);

  // Auto-lock after 15 minutes of inactivity
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

  // Load basic HR profiles & payroll_settings once on mount
  useEffect(() => {
    let isCancelled = false;

    async function loadBaseSettings() {
      setBaseLoading(true);
      setBaseLoadError(false);
      try {
        const [hrDoc, payrollCfg] = await Promise.all([
          fetchHRProfiles(),
          fetchPayrollSettings(),
        ]);
        if (isCancelled) return;
        setProfiles(hrDoc.profiles || {});
        setSettings(payrollCfg);
        const savedPayDate = payrollCfg.defaultPayDates?.[selectedCycleKey];
        if (savedPayDate) {
          setPayDate(savedPayDate);
        } else {
          setPayDate(`${selectedCycleKey}-25`);
        }
      } catch (err) {
        console.error('Error loading payroll base settings:', err);
        if (!isCancelled) {
          setBaseLoadError(true);
        }
      } finally {
        if (!isCancelled) {
          setBaseLoading(false);
        }
      }
    }

    loadBaseSettings();
    return () => {
      isCancelled = true;
    };
  }, [baseReloadCount]);

  // Update payDate default when cycle changes
  useEffect(() => {
    const saved = settings.defaultPayDates?.[selectedCycleKey];
    setPayDate(saved || `${selectedCycleKey}-25`);
  }, [selectedCycleKey, settings.defaultPayDates]);

  // Active employees excluding rejected and notEmployee
  const visibleEmployees = useMemo(() => {
    return (registeredUsers || [])
      .filter((u) => u.accountStatus !== 'rejected')
      .filter((u) => !profiles[u.uid]?.notEmployee)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [registeredUsers, profiles]);

  // Load per-employee confidential salary, slip, approved OT, and approved advance for selectedCycleKey when unlocked
  useEffect(() => {
    if (!isHrUnlocked || baseLoading || baseLoadError) {
      setRowDataMap({});
      setRowsLoadError(null);
      setRowsLoading(false);
      return;
    }

    if (visibleEmployees.length === 0) {
      setRowDataMap({});
      setRowsLoadError(null);
      setRowsLoading(false);
      return;
    }

    let isCancelled = false;

    async function loadCycleEmployeeData() {
      setRowsLoading(true);
      setRowsLoadError(null);
      try {
        const entries = await Promise.all(
          visibleEmployees.map(async (emp) => {
            const p = profiles[emp.uid] || getDefaultHRProfile(emp.name);
            const fallbackName = p.fullName || emp.name;
            const [priv, slip, otHours, advTotal] = await Promise.all([
              fetchHRPrivateEmployee(emp.uid, fallbackName),
              fetchPayrollSlip(selectedCycleKey, emp.uid),
              fetchEmployeeCycleApprovedOT(emp.uid, selectedCycleKey),
              fetchEmployeeCycleApprovedAdvance(emp.uid, selectedCycleKey),
            ]);
            return [
              emp.uid,
              {
                privateData: priv,
                otHours,
                approvedAdvance: advTotal,
                slip,
              } as EmployeeRowComputedData,
            ] as const;
          })
        );

        if (isCancelled) return;
        const nextMap: Record<string, EmployeeRowComputedData> = {};
        entries.forEach(([uid, data]) => {
          nextMap[uid] = data;
        });
        setRowDataMap(nextMap);

        // If any existing slip in this cycle has a payDate, sync if not set
        const firstSlipWithDate = entries.find(([, d]) => d.slip?.payDate)?.[1].slip?.payDate;
        if (firstSlipWithDate && !settings.defaultPayDates?.[selectedCycleKey]) {
          setPayDate(firstSlipWithDate);
        }
      } catch (err: any) {
        console.error('Error loading payroll rows:', err);
        if (!isCancelled) {
          const code = err?.code || '';
          if (code === 'permission-denied' || String(err?.message || '').includes('permission')) {
            setRowsLoadError(
              'ไม่มีสิทธิ์เข้าถึงข้อมูลสลิปเงินเดือนและข้อมูลลับ HR (เฉพาะอีเมลแอดมินที่ได้รับอนุญาตเท่านั้น) ระบบปิดปุ่มบันทึกและยืนยัน'
            );
          } else {
            setRowsLoadError(
              'โหลดข้อมูลสลิปเงินเดือนไม่สำเร็จ กรุณากดโหลดใหม่ (ระบบปิดปุ่มบันทึกและยืนยันเพื่อป้องกันข้อมูลผิดพลาด)'
            );
          }
        }
      } finally {
        if (!isCancelled) {
          setRowsLoading(false);
        }
      }
    }

    loadCycleEmployeeData();
    return () => {
      isCancelled = true;
    };
  }, [
    isHrUnlocked,
    baseLoading,
    baseLoadError,
    visibleEmployees,
    profiles,
    selectedCycleKey,
    rowsReloadCount,
  ]);

  const multipliersReady = useMemo(() => areOTMultipliersComplete(settings), [settings]);

  // Compute display row values for each employee
  const computedRows = useMemo(() => {
    return visibleEmployees.map((emp) => {
      const p = profiles[emp.uid] || getDefaultHRProfile(emp.name);
      const rowData = rowDataMap[emp.uid];
      const slip = rowData?.slip || null;
      const priv = rowData?.privateData;
      const hasSalary = Boolean(priv && Number(priv.salary) > 0);
      const status: 'not_created' | 'draft' | 'confirmed' = slip ? slip.status : 'not_created';

      // If slip is already confirmed or saved as draft, we can show its stored values or live preview
      let salary = 0;
      let otTotal = 0;
      let totalEarnings = 0;
      let totalDeductions = 0;
      let netPay = 0;
      let canDisplayNumbers = false;

      if (slip && slip.status === 'confirmed') {
        salary = slip.salary;
        otTotal = slip.otTotal;
        totalEarnings = slip.totalEarnings;
        totalDeductions = slip.totalDeductions;
        netPay = slip.netPay;
        canDisplayNumbers = true;
      } else if (rowData && multipliersReady) {
        // Build default items from existing draft slip or 0
        const existingItemMap = new Map<string, number>();
        slip?.items?.forEach((it) => existingItemMap.set(it.id, Number(it.amount) || 0));

        const activeItems: PayrollSlipItem[] = settings.payItems
          .filter((def) => def.enabled || existingItemMap.has(def.id))
          .map((def) => ({
            id: def.id,
            name: def.name,
            nameEn: def.nameEn,
            type: def.type,
            amount: existingItemMap.get(def.id) || 0,
          }));

        const calc = calculatePayrollSlipValues({
          privateData: rowData.privateData,
          otHours: rowData.otHours,
          settings,
          approvedAdvanceAmount: rowData.approvedAdvance,
          withholdingTax: slip?.withholdingTax || 0,
          items: activeItems,
        });

        salary = calc.salary;
        otTotal = calc.otTotal;
        totalEarnings = calc.totalEarnings;
        totalDeductions = calc.totalDeductions;
        netPay = calc.netPay;
        canDisplayNumbers = true;
      } else if (priv) {
        salary = round2(Number(priv.salary) || 0);
      }

      return {
        emp,
        profile: p,
        rowData,
        slip,
        status,
        hasSalary,
        salary,
        otTotal,
        totalEarnings,
        totalDeductions,
        netPay,
        canDisplayNumbers,
      };
    });
  }, [visibleEmployees, profiles, rowDataMap, multipliersReady, settings]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return computedRows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.emp.name || '').toLowerCase().includes(q) ||
        (r.emp.username || '').toLowerCase().includes(q) ||
        (r.profile.fullName || '').toLowerCase().includes(q) ||
        (r.profile.nickname || '').toLowerCase().includes(q) ||
        (r.profile.position || '').toLowerCase().includes(q)
      );
    });
  }, [computedRows, searchQuery, statusFilter]);

  const cycleSummary = useMemo(() => {
    let totalEmps = computedRows.length;
    let notCreatedCount = 0;
    let draftCount = 0;
    let confirmedCount = 0;
    let sumNetPay = 0;

    computedRows.forEach((r) => {
      if (r.status === 'confirmed') confirmedCount++;
      else if (r.status === 'draft') draftCount++;
      else notCreatedCount++;

      if (r.canDisplayNumbers) {
        sumNetPay = round2(sumNetPay + r.netPay);
      }
    });

    return {
      totalEmps,
      notCreatedCount,
      draftCount,
      confirmedCount,
      sumNetPay,
    };
  }, [computedRows]);

  // Save Payroll Settings Handler
  const handleSaveSettings = async (nextSettings: PayrollSettingsDoc) => {
    if (!user || baseLoadError) return;
    const actorName = hrUnlockedEmail || user.name || user.username || 'Admin';
    const saved = await savePayrollSettings(nextSettings, actorName);
    setSettings(saved);
    setShowSettingsModal(false);
    setStatusNotice({
      type: 'success',
      message: 'บันทึกการตั้งค่าสลิปเงินเดือนและตัวคูณ OT เรียบร้อยแล้ว',
    });
    setTimeout(() => setStatusNotice(null), 4000);
  };

  const loadedSlipsMap = useMemo(() => {
    const m: Record<string, PayrollSlip | null> = {};
    Object.entries(rowDataMap).forEach(([uid, d]) => {
      m[uid] = d.slip;
    });
    return m;
  }, [rowDataMap]);

  // Execute offscreen single PDF generation when singlePrintJob mounts
  useEffect(() => {
    if (!singlePrintJob) return;
    let isCancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        if (singlePrintRef.current && !isCancelled) {
          await downloadSinglePayslipPdf(
            singlePrintRef.current,
            singlePrintJob.fullName,
            singlePrintJob.slip.cycleKey
          );
        }
      } catch (err) {
        console.error('Error generating single payslip PDF:', err);
        if (!isCancelled) {
          setStatusNotice({
            type: 'error',
            message: 'เกิดข้อผิดพลาดในการสร้างไฟล์ PDF กรุณาลองใหม่อีกครั้ง',
          });
        }
      } finally {
        if (!isCancelled) {
          setSinglePrintJob(null);
          setDownloadingSingleEmpId(null);
        }
      }
    }, 120);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [singlePrintJob]);

  // Execute offscreen batch PDF generation when batchPrintJobs mount
  useEffect(() => {
    if (batchPrintJobs.length === 0) return;
    let isCancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        if (batchPrintContainerRef.current && !isCancelled) {
          const pageNodes = Array.from(
            batchPrintContainerRef.current.querySelectorAll<HTMLElement>('[data-payslip-page="true"]')
          );
          if (pageNodes.length > 0) {
            await downloadBatchPayslipsPdf(pageNodes, selectedCycleKey);
            setStatusNotice({
              type: 'success',
              message: `ดาวน์โหลดสลิปเงินเดือนทั้งรอบ (${pageNodes.length} คน) เรียบร้อยแล้ว`,
            });
            setTimeout(() => setStatusNotice(null), 4000);
          }
        }
      } catch (err) {
        console.error('Error generating batch payslip PDF:', err);
        if (!isCancelled) {
          setStatusNotice({
            type: 'error',
            message: 'เกิดข้อผิดพลาดในการสร้างไฟล์ PDF รวมทั้งรอบ กรุณาลองใหม่อีกครั้ง',
          });
        }
      } finally {
        if (!isCancelled) {
          setBatchPrintJobs([]);
          setDownloadingBatchPdf(false);
        }
      }
    }, 180);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [batchPrintJobs, selectedCycleKey]);

  const handleOpenSlipPreview = async (
    slip: PayrollSlip,
    employeeUsername?: string
  ) => {
    if (!isHrUnlocked) return;
    setLoadingPreviewEmpId(slip.employeeId);
    try {
      const year = getYearFromCycleKey(slip.cycleKey);
      const ytdSlips = await fetchEmployeeYearConfirmedSlips(slip.employeeId, year);
      const ytd = calculateYTDTotals(ytdSlips, slip.cycleKey, {
        totalEarnings: slip.totalEarnings,
        withholdingTax: slip.withholdingTax,
        ssoAmount: slip.ssoAmount,
      });
      setPreviewSlipData({
        slip,
        employeeUsername,
        ytdTotals: {
          ytdEarnings: ytd.ytdEarnings,
          ytdTax: ytd.ytdTax,
          ytdSso: ytd.ytdSso,
        },
      });
    } catch (err) {
      console.error('Error loading YTD for slip preview:', err);
      setStatusNotice({
        type: 'error',
        message: 'ไม่สามารถโหลดข้อมูลยอดสะสมเพื่อแสดงตัวอย่างสลิปได้ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setLoadingPreviewEmpId(null);
    }
  };

  const handleDownloadRowPdf = async (
    slip: PayrollSlip,
    employeeUsername: string | undefined,
    fallbackFullName: string
  ) => {
    if (!isHrUnlocked || slip.status !== 'confirmed' || downloadingSingleEmpId) return;
    setDownloadingSingleEmpId(slip.employeeId);
    try {
      const year = getYearFromCycleKey(slip.cycleKey);
      const ytdSlips = await fetchEmployeeYearConfirmedSlips(slip.employeeId, year);
      const ytd = calculateYTDTotals(ytdSlips, slip.cycleKey, {
        totalEarnings: slip.totalEarnings,
        withholdingTax: slip.withholdingTax,
        ssoAmount: slip.ssoAmount,
      });
      const fullName =
        slip.snapshot?.fullName || slip.employeeName || fallbackFullName || slip.employeeId;
      setSinglePrintJob({
        slip,
        employeeUsername,
        fullName,
        ytdTotals: {
          ytdEarnings: ytd.ytdEarnings,
          ytdTax: ytd.ytdTax,
          ytdSso: ytd.ytdSso,
        },
      });
    } catch (err) {
      console.error('Error preparing single PDF download:', err);
      setDownloadingSingleEmpId(null);
      setStatusNotice({
        type: 'error',
        message: 'โหลดข้อมูลสำหรับสร้าง PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      });
    }
  };

  const handleDownloadAllConfirmedInCycle = async () => {
    if (!isHrUnlocked || downloadingBatchPdf) return;
    const confirmedRows = computedRows.filter(
      (r) => r.slip && r.slip.status === 'confirmed'
    );
    if (confirmedRows.length === 0) return;

    setDownloadingBatchPdf(true);
    try {
      const year = getYearFromCycleKey(selectedCycleKey);
      const jobs = await Promise.all(
        confirmedRows.map(async (r) => {
          const slip = r.slip!;
          const ytdSlips = await fetchEmployeeYearConfirmedSlips(slip.employeeId, year);
          const ytd = calculateYTDTotals(ytdSlips, slip.cycleKey, {
            totalEarnings: slip.totalEarnings,
            withholdingTax: slip.withholdingTax,
            ssoAmount: slip.ssoAmount,
          });
          return {
            slip,
            employeeUsername: r.emp.username || r.emp.uid,
            ytdTotals: {
              ytdEarnings: ytd.ytdEarnings,
              ytdTax: ytd.ytdTax,
              ytdSso: ytd.ytdSso,
            },
          };
        })
      );
      setBatchPrintJobs(jobs);
    } catch (err) {
      console.error('Error preparing batch cycle PDF:', err);
      setDownloadingBatchPdf(false);
      setStatusNotice({
        type: 'error',
        message: 'ไม่สามารถโหลดข้อมูลเพื่อสร้าง PDF ทั้งรอบได้ กรุณาลองใหม่อีกครั้ง',
      });
    }
  };

  if (!isAdmin) return null;

  const activeRow = activeEmployeeId
    ? computedRows.find((r) => r.emp.uid === activeEmployeeId) || null
    : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Card: Header, Auth Lock/Unlock, Settings Button, Cycle & Pay Date Selector */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>ระบบสลิปเงินเดือน ({settings.companyName || 'Thunder Cloud'})</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ตั้งค่าตัวคูณ OT รายการเงินได้/รายการหัก และคำนวณสลิปเงินเดือนรายบุคคลตามรอบ 26 ถึง 25
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
              disabled={baseLoading || baseLoadError}
              onClick={() => setShowSettingsModal(true)}
              className={clsx(
                'px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50',
                !multipliersReady
                  ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
              )}
            >
              <Settings className="w-3.5 h-3.5 text-indigo-500" />
              <span>ตั้งค่าสลิป / ตัวคูณ OT / รายการเงินได้-หัก</span>
            </button>
          </div>
        </div>

        {/* Settings Summary Strip */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>บริษัท: {settings.companyName || 'Thunder Cloud'}</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-semibold">ตัวคูณ OT:</span>
              <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 font-bold">
                แดง (วันหยุดในเวลา):{' '}
                {settings.otMultiplierHolidayInHours !== null
                  ? `×${settings.otMultiplierHolidayInHours}`
                  : 'ยังไม่ระบุ'}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-bold">
                เขียว (วันหยุดหลังเวลา):{' '}
                {settings.otMultiplierHolidayAfterHours !== null
                  ? `×${settings.otMultiplierHolidayAfterHours}`
                  : 'ยังไม่ระบุ'}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 font-bold">
                ฟ้า (วันทำงานปกติ):{' '}
                {settings.otMultiplierWorkday !== null
                  ? `×${settings.otMultiplierWorkday}`
                  : 'ยังไม่ระบุ'}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-bold">
                ไม่ระบุ:{' '}
                {settings.otMultiplierUnspecified !== null
                  ? `×${settings.otMultiplierUnspecified}`
                  : 'ยังไม่ระบุ'}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={baseLoading || baseLoadError}
            onClick={() => setShowSettingsModal(true)}
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>แก้ไขการตั้งค่า ({settings.payItems.filter((i) => i.enabled).length} รายการเปิดใช้)</span>
          </button>
        </div>

        {/* Warning if OT Multipliers are not complete */}
        {!baseLoading && !baseLoadError && !multipliersReady && (
          <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <div className="font-bold">
                  ยังไม่ได้กรอกตัวคูณ OT ครบทั้ง 4 ประเภท — ระบบจะยังไม่คำนวณสลิปเงินเดือน
                </div>
                <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                  กรุณากดปุ่มตั้งค่าเพื่อระบุตัวคูณ OT (สีแดง, สีเขียว, สีฟ้า และไม่ระบุ) ให้ครบทั้ง 4 ค่าก่อนคำนวณและสร้างสลิป
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
            >
              กรอกตัวคูณ OT ตอนนี้
            </button>
          </div>
        )}

        {/* Sub-Tabs: จัดการสลิปเงินเดือน vs รายงานสรุปรอบ */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('slips')}
            className={clsx(
              'px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer',
              activeSubTab === 'slips'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>จัดการสลิปเงินเดือน</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('summary_report')}
            className={clsx(
              'px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer',
              activeSubTab === 'summary_report'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            )}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>รายงานสรุปรอบ</span>
          </button>
        </div>

        {/* Cycle Selector & Pay Date Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
              เลือกรอบเงินเดือน (26 ถึง 25)
            </label>
            <select
              value={selectedCycleKey}
              onChange={(e) => setSelectedCycleKey(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
            >
              {availableCycles.map((c) => (
                <option key={c.cycleKey} value={c.cycleKey}>
                  {c.cycleLabel} ({c.periodLabel})
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
              วันที่จ่ายเงินเดือน (Pay Date)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white cursor-pointer"
              />
            </div>
          </div>

          {/* Search & Status Filter */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between gap-2">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
              ค้นหาพนักงาน / กรองสถานะสลิป
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ชื่อ, ชื่อเล่น, ตำแหน่ง..."
                  className="w-full pl-8 pr-6 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="all">ทั้งหมด ({cycleSummary.totalEmps})</option>
                <option value="not_created">ยังไม่สร้าง ({cycleSummary.notCreatedCount})</option>
                <option value="draft">ร่าง ({cycleSummary.draftCount})</option>
                <option value="confirmed">ยืนยันแล้ว ({cycleSummary.confirmedCount})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Base Load Error */}
        {baseLoadError && (
          <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                โหลดการตั้งค่าสลิปเงินเดือนไม่สำเร็จ กรุณากดโหลดใหม่ (ระบบปิดปุ่มบันทึกและยืนยันชั่วคราว)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setBaseReloadCount((c) => c + 1)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>โหลดใหม่</span>
            </button>
          </div>
        )}

        {/* Rows Load Error */}
        {rowsLoadError && (
          <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{rowsLoadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setRowsReloadCount((c) => c + 1)}
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

      {/* Main Content: Locked State vs Unlocked Payroll Table / Cycle Summary Report */}
      {!isHrUnlocked ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-300 dark:border-amber-800 p-8 sm:p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              ข้อมูลสลิปเงินเดือนและฐานเงินเดือนถูกล็อกไว้
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              สลิปเงินเดือน (`payroll_slips`) และข้อมูลเงินเดือน (`hr_private`) เป็นความลับเฉพาะแอดมิน HR
              กรุณายืนยันตัวตนด้วยอีเมลแอดมินเพื่อดูตารางคำนวณ จัดการสลิปเงินเดือน และดูรายงานสรุปรอบ (ล็อกอัตโนมัติเมื่อไม่ใช้งาน 15 นาที)
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowUnlockModal(true)}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-md transition cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>ยืนยันตัวตนแอดมินเพื่อดูข้อมูลลับ</span>
            </button>
          </div>
        </div>
      ) : activeSubTab === 'summary_report' ? (
        <PayrollCycleSummaryReportSection
          selectedCycleKey={selectedCycleKey}
          onChangeCycleKey={setSelectedCycleKey}
          availableCycles={availableCycles}
          settings={settings}
          profiles={profiles}
          visibleEmployees={visibleEmployees}
          isHrUnlocked={isHrUnlocked}
          reloadTrigger={summaryReloadTrigger}
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          {/* Summary Bar above table */}
          <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3 font-semibold text-slate-600 dark:text-slate-300">
              <span>
                รอบ: <strong className="text-slate-900 dark:text-white">{selectedCycleInfo.cycleLabel}</strong>
              </span>
              <span>•</span>
              <span>
                พนักงานทั้งหมด: <strong className="text-slate-900 dark:text-white">{cycleSummary.totalEmps} คน</strong>
              </span>
              <span>•</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                ยืนยันแล้ว: <strong>{cycleSummary.confirmedCount}</strong>
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                ร่าง: <strong>{cycleSummary.draftCount}</strong>
              </span>
              <span className="text-slate-500">
                ยังไม่สร้าง: <strong>{cycleSummary.notCreatedCount}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {multipliersReady && (
                <div className="font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                  รวมยอดจ่ายสุทธิรอบนี้:{' '}
                  <span className="text-sm font-black">
                    {cycleSummary.sumNetPay.toLocaleString('th-TH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    บาท
                  </span>
                </div>
              )}

              <button
                type="button"
                disabled={
                  !isHrUnlocked ||
                  baseLoading ||
                  rowsLoading ||
                  Boolean(baseLoadError) ||
                  Boolean(rowsLoadError) ||
                  cycleSummary.confirmedCount === 0 ||
                  downloadingBatchPdf
                }
                onClick={handleDownloadAllConfirmedInCycle}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                title={
                  cycleSummary.confirmedCount === 0
                    ? 'ยังไม่มีสลิปที่ยืนยันแล้วในรอบนี้'
                    : `ดาวน์โหลดสลิปที่ยืนยันแล้วทั้งหมดในรอบนี้ (${cycleSummary.confirmedCount} คน)`
                }
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {downloadingBatchPdf
                    ? 'กำลังสร้างไฟล์ PDF ทั้งรอบ...'
                    : `ดาวน์โหลดทั้งรอบ (PDF ไฟล์เดียว 1 หน้าต่อคน)`}
                </span>
              </button>
            </div>
          </div>

          {baseLoading || rowsLoading ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
              กำลังโหลดข้อมูลสลิปเงินเดือนและคำนวณยอดรายบุคคล...
            </div>
          ) : baseLoadError || rowsLoadError ? (
            <div className="p-12 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <div className="text-sm font-bold text-rose-700 dark:text-rose-400">
                {rowsLoadError || 'โหลดข้อมูลไม่สำเร็จ กรุณากดโหลดใหม่'}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (baseLoadError) setBaseReloadCount((c) => c + 1);
                  setRowsReloadCount((c) => c + 1);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>โหลดใหม่</span>
              </button>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
              ไม่พบรายชื่อพนักงานตามเงื่อนไขที่ค้นหา
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                    <th className="px-4 py-3 text-left min-w-[210px]">ชื่อพนักงาน</th>
                    <th className="px-3 py-3 text-right min-w-[115px]">เงินเดือน</th>
                    <th className="px-3 py-3 text-right min-w-[115px]">OT</th>
                    <th className="px-3 py-3 text-right min-w-[115px]">รวมเงินได้</th>
                    <th className="px-3 py-3 text-right min-w-[115px]">รวมหัก</th>
                    <th className="px-3 py-3 text-right min-w-[125px]">สุทธิ</th>
                    <th className="px-3 py-3 text-center min-w-[120px]">สถานะ</th>
                    <th className="px-4 py-3 text-right min-w-[140px]">จัดการ / PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {filteredRows.map((row) => {
                    const {
                      emp,
                      profile,
                      rowData,
                      status,
                      hasSalary,
                      salary,
                      otTotal,
                      totalEarnings,
                      totalDeductions,
                      netPay,
                      canDisplayNumbers,
                    } = row;

                    const fmtMoney = (n: number) =>
                      n.toLocaleString('th-TH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      });

                    return (
                      <tr
                        key={emp.uid}
                        onClick={() => setActiveEmployeeId(emp.uid)}
                        className="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition cursor-pointer group"
                      >
                        {/* ชื่อพนักงาน */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <AnimalAvatar
                              avatarEmoji={emp.avatarEmoji}
                              identifier={emp.username || emp.uid}
                              name={emp.name}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition truncate flex items-center gap-1.5">
                                <span>{profile.fullName || emp.name}</span>
                                {profile.nickname && (
                                  <span className="text-[11px] font-normal text-slate-400">
                                    ({profile.nickname})
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {profile.position ? `${profile.position} • ` : ''}@{emp.username || emp.uid}
                              </div>
                              {!hasSalary && (
                                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>ยังไม่มีเงินเดือนในข้อมูลลับ (ห้ามยืนยัน)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* เงินเดือน */}
                        <td className="px-3 py-3 text-right font-mono">
                          {hasSalary ? (
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {fmtMoney(salary)}
                            </span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-bold text-[11px]">
                              ยังไม่ระบุเงินเดือน
                            </span>
                          )}
                        </td>

                        {/* OT */}
                        <td className="px-3 py-3 text-right font-mono">
                          {canDisplayNumbers ? (
                            <div>
                              <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                                {fmtMoney(otTotal)}
                              </div>
                              {rowData && rowData.otHours.totalHours > 0 && (
                                <div className="text-[10px] text-slate-400">
                                  {rowData.otHours.totalHours} ชม.
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 text-[11px]">
                              รอตัวคูณ OT
                            </span>
                          )}
                        </td>

                        {/* รวมเงินได้ */}
                        <td className="px-3 py-3 text-right font-mono">
                          {canDisplayNumbers ? (
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              {fmtMoney(totalEarnings)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* รวมหัก */}
                        <td className="px-3 py-3 text-right font-mono">
                          {canDisplayNumbers ? (
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {fmtMoney(totalDeductions)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* สุทธิ */}
                        <td className="px-3 py-3 text-right font-mono">
                          {canDisplayNumbers ? (
                            <span className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">
                              {fmtMoney(netPay)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* สถานะ */}
                        <td className="px-3 py-3 text-center">
                          {status === 'confirmed' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>ยืนยันแล้ว</span>
                            </span>
                          ) : status === 'draft' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800">
                              <Clock className="w-3 h-3" />
                              <span>ร่าง</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                              <span>ยังไม่สร้าง</span>
                            </span>
                          )}
                        </td>

                        {/* ปุ่มดาวน์โหลด PDF ท้ายแถว */}
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {row.slip && (
                              <button
                                type="button"
                                disabled={!isHrUnlocked || loadingPreviewEmpId === emp.uid}
                                onClick={() =>
                                  handleOpenSlipPreview(row.slip!, emp.username || emp.uid)
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                                title="ดูตัวอย่างสลิป"
                              >
                                <Eye className="w-3 h-3" />
                                <span>ดูตัวอย่าง</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={
                                !isHrUnlocked ||
                                status !== 'confirmed' ||
                                !row.slip ||
                                downloadingSingleEmpId !== null
                              }
                              onClick={() =>
                                row.slip &&
                                handleDownloadRowPdf(
                                  row.slip,
                                  emp.username || emp.uid,
                                  profile.fullName || emp.name
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              title={
                                status === 'confirmed'
                                  ? 'ดาวน์โหลดสลิปเงินเดือนเป็นไฟล์ PDF'
                                  : status === 'draft'
                                  ? 'สลิปสถานะร่างยังไม่สามารถดาวน์โหลด PDF ได้ กรุณายืนยันสลิปก่อน'
                                  : 'ยังไม่ได้สร้างและยืนยันสลิป'
                              }
                            >
                              <Download className="w-3 h-3" />
                              <span>
                                {downloadingSingleEmpId === emp.uid
                                  ? 'กำลังโหลด...'
                                  : 'ดาวน์โหลด PDF'}
                              </span>
                            </button>
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
      )}

      {/* MODAL 1: Payroll Settings Modal (Company Name, 4 OT Multipliers, PayItems CRUD & Reorder) */}
      {showSettingsModal && (
        <PayrollSettingsModal
          initialSettings={settings}
          loadedSlipsMap={loadedSlipsMap}
          disabledSave={baseLoadError || baseLoading}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSaveSettings}
        />
      )}

      {/* MODAL 2: Employee Payroll Slip Detail & Live Calculator Modal */}
      {activeRow && isHrUnlocked && (
        <EmployeePayrollSlipModal
          employee={activeRow.emp}
          profile={activeRow.profile}
          cycleKey={selectedCycleKey}
          cycleLabel={selectedCycleInfo.cycleLabel}
          periodLabel={selectedCycleInfo.periodLabel}
          defaultPayDate={payDate}
          settings={settings}
          multipliersReady={multipliersReady}
          initialRowData={activeRow.rowData}
          actorName={hrUnlockedEmail || user?.name || user?.username || 'Admin'}
          isHrUnlocked={isHrUnlocked}
          downloadingPdf={downloadingSingleEmpId === activeRow.emp.uid}
          onPreviewSlip={(slip, ytd) => {
            if (!isHrUnlocked) return;
            setPreviewSlipData({
              slip,
              employeeUsername: activeRow.emp.username || activeRow.emp.uid,
              ytdTotals: ytd,
            });
          }}
          onDownloadSlipPdf={(slip, ytd) => {
            if (!isHrUnlocked || slip.status !== 'confirmed' || downloadingSingleEmpId) return;
            const fullName =
              slip.snapshot?.fullName ||
              slip.employeeName ||
              activeRow.profile.fullName ||
              activeRow.emp.name ||
              slip.employeeId;
            setDownloadingSingleEmpId(slip.employeeId);
            setSinglePrintJob({
              slip,
              employeeUsername: activeRow.emp.username || activeRow.emp.uid,
              fullName,
              ytdTotals: ytd,
            });
          }}
          onOpenSettings={() => {
            setActiveEmployeeId(null);
            setShowSettingsModal(true);
          }}
          onClose={() => setActiveEmployeeId(null)}
          onSavedSlip={async (savedSlip, newlyUsedItemIds) => {
            // Update local rowDataMap immediately
            setRowDataMap((prev) => {
              const cur = prev[activeRow.emp.uid];
              if (!cur) return prev;
              return {
                ...prev,
                [activeRow.emp.uid]: {
                  ...cur,
                  slip: savedSlip,
                },
              };
            });

            // If confirmed and has used payItems, persist usedPayItemIds in payroll_settings
            if (savedSlip.status === 'confirmed' && newlyUsedItemIds.length > 0) {
              const mergedUsed = Array.from(
                new Set([...(settings.usedPayItemIds || []), ...newlyUsedItemIds])
              );
              if (mergedUsed.length !== (settings.usedPayItemIds || []).length) {
                try {
                  const nextSettings = await savePayrollSettings(
                    {
                      ...settings,
                      usedPayItemIds: mergedUsed,
                    },
                    hrUnlockedEmail || user?.name || 'Admin'
                  );
                  setSettings(nextSettings);
                } catch (e) {
                  console.warn('Could not update usedPayItemIds in payroll_settings:', e);
                }
              }
            }

            setSummaryReloadTrigger((c) => c + 1);
            setStatusNotice({
              type: 'success',
              message:
                savedSlip.status === 'confirmed'
                  ? `ยืนยันสลิปเงินเดือนของ "${activeRow.profile.fullName || activeRow.emp.name}" เรียบร้อยแล้ว`
                  : `บันทึกร่างสลิปเงินเดือนของ "${activeRow.profile.fullName || activeRow.emp.name}" เรียบร้อยแล้ว`,
            });
            setTimeout(() => setStatusNotice(null), 4000);
          }}
        />
      )}

      {/* MODAL 3: HR Admin Email & Password Verification Modal */}
      {showUnlockModal && (
        <PayrollAdminUnlockModal
          onClose={() => setShowUnlockModal(false)}
          onSuccess={(email) => {
            setIsHrUnlocked(true);
            setHrUnlockedEmail(email);
            lastHrActivityRef.current = Date.now();
            setShowUnlockModal(false);
            setStatusNotice({
              type: 'success',
              message: `ยืนยันตัวตนสำเร็จ (${email}) สามารถดูและจัดการสลิปเงินเดือนได้แล้ว`,
            });
            setTimeout(() => setStatusNotice(null), 4000);
          }}
        />
      )}

      {/* MODAL 4: Full Bilingual Payslip Preview Modal */}
      {previewSlipData && isHrUnlocked && (
        <PayslipPreviewModal
          companyName={settings.companyName || 'Thunder Cloud'}
          logoDataUrl={settings.logoDataUrl || ''}
          slip={previewSlipData.slip}
          employeeUsername={previewSlipData.employeeUsername}
          ytdTotals={previewSlipData.ytdTotals}
          isHrUnlocked={isHrUnlocked}
          onClose={() => setPreviewSlipData(null)}
        />
      )}

      {/* Offscreen Render Container for Single PDF Download */}
      {singlePrintJob && isHrUnlocked && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '0px',
            zIndex: -100,
            pointerEvents: 'none',
          }}
        >
          <PayslipDocument
            ref={singlePrintRef}
            companyName={settings.companyName || 'Thunder Cloud'}
            logoDataUrl={settings.logoDataUrl || ''}
            slip={singlePrintJob.slip}
            employeeUsername={singlePrintJob.employeeUsername}
            ytdTotals={singlePrintJob.ytdTotals}
          />
        </div>
      )}

      {/* Offscreen Render Container for Batch Cycle PDF Download (1 Page Per Confirmed Employee) */}
      {batchPrintJobs.length > 0 && isHrUnlocked && (
        <div
          ref={batchPrintContainerRef}
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '0px',
            zIndex: -100,
            pointerEvents: 'none',
          }}
        >
          {batchPrintJobs.map((job) => (
            <div key={job.slip.id} data-payslip-page="true">
              <PayslipDocument
                companyName={settings.companyName || 'Thunder Cloud'}
                logoDataUrl={settings.logoDataUrl || ''}
                slip={job.slip}
                employeeUsername={job.employeeUsername}
                ytdTotals={job.ytdTotals}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===============================================================
// Sub-Modal 1: Payroll Settings Modal
// ===============================================================

function PayrollSettingsModal({
  initialSettings,
  loadedSlipsMap,
  disabledSave,
  onClose,
  onSave,
}: {
  initialSettings: PayrollSettingsDoc;
  loadedSlipsMap: Record<string, PayrollSlip | null>;
  disabledSave: boolean;
  onClose: () => void;
  onSave: (settings: PayrollSettingsDoc) => Promise<void>;
}) {
  const [companyName, setCompanyName] = useState(initialSettings.companyName || 'Thunder Cloud');
  const [logoDataUrl, setLogoDataUrl] = useState<string>(initialSettings.logoDataUrl || '');
  const [logoSizeBytes, setLogoSizeBytes] = useState<number>(0);
  const [logoWarning, setLogoWarning] = useState<string | null>(null);
  const [processingLogo, setProcessingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [multRed, setMultRed] = useState<string>(
    initialSettings.otMultiplierHolidayInHours !== null &&
      initialSettings.otMultiplierHolidayInHours !== undefined
      ? String(initialSettings.otMultiplierHolidayInHours)
      : ''
  );
  const [multGreen, setMultGreen] = useState<string>(
    initialSettings.otMultiplierHolidayAfterHours !== null &&
      initialSettings.otMultiplierHolidayAfterHours !== undefined
      ? String(initialSettings.otMultiplierHolidayAfterHours)
      : ''
  );
  const [multBlue, setMultBlue] = useState<string>(
    initialSettings.otMultiplierWorkday !== null &&
      initialSettings.otMultiplierWorkday !== undefined
      ? String(initialSettings.otMultiplierWorkday)
      : ''
  );
  const [multGray, setMultGray] = useState<string>(
    initialSettings.otMultiplierUnspecified !== null &&
      initialSettings.otMultiplierUnspecified !== undefined
      ? String(initialSettings.otMultiplierUnspecified)
      : ''
  );

  const [payItems, setPayItems] = useState<PayrollItemDefinition[]>(() =>
    initialSettings.payItems.map((it) => ({ ...it }))
  );
  const [usedPayItemIds, setUsedPayItemIds] = useState<string[]>(
    () => initialSettings.usedPayItemIds || []
  );

  // Add new item state
  const [newNameTh, setNewNameTh] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newType, setNewType] = useState<PayrollItemType>('earning');

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const computeDataUrlByteSize = (dataUrl: string): number => {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return new Blob([dataUrl]).size;
    const base64 = dataUrl.slice(commaIdx + 1);
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoWarning(null);
    setErrorMsg(null);

    const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
    const isJpg =
      file.type === 'image/jpeg' ||
      file.type === 'image/jpg' ||
      /\.(jpe?g)$/i.test(file.name);

    if (!isPng && !isJpg) {
      setLogoWarning('รองรับเฉพาะไฟล์รูปภาพ PNG หรือ JPG เท่านั้น');
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    setProcessingLogo(true);
    try {
      const resizedDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
        reader.onload = () => {
          const srcDataUrl = typeof reader.result === 'string' ? reader.result : '';
          if (!srcDataUrl) {
            reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
            return;
          }
          const img = new Image();
          img.onerror = () => reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'));
          img.onload = () => {
            const origW = img.naturalWidth || img.width;
            const origH = img.naturalHeight || img.height;
            if (!origW || !origH) {
              reject(new Error('ขนาดรูปภาพไม่ถูกต้อง'));
              return;
            }

            // ย่อรูปในเครื่องให้ด้านยาวไม่เกิน 400 พิกเซล โดยรักษาสัดส่วนเดิม
            const maxSide = 400;
            const longest = Math.max(origW, origH);
            const scale = longest > maxSide ? maxSide / longest : 1;
            const targetW = Math.max(1, Math.round(origW * scale));
            const targetH = Math.max(1, Math.round(origH * scale));

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('ไม่สามารถสร้าง Canvas สำหรับย่อรูปได้'));
              return;
            }

            // เก็บความโปร่งใสของ PNG ไว้ (clearRect โปร่งใสก่อนวาด)
            ctx.clearRect(0, 0, targetW, targetH);
            ctx.drawImage(img, 0, 0, targetW, targetH);

            if (isPng) {
              resolve(canvas.toDataURL('image/png'));
            } else {
              resolve(canvas.toDataURL('image/jpeg', 0.9));
            }
          };
          img.src = srcDataUrl;
        };
        reader.readAsDataURL(file);
      });

      const byteSize = computeDataUrlByteSize(resizedDataUrl);
      const maxBytes = 300 * 1024; // 300 KB
      setLogoDataUrl(resizedDataUrl);
      setLogoSizeBytes(byteSize);

      if (byteSize > maxBytes) {
        const sizeKb = (byteSize / 1024).toFixed(1);
        setLogoWarning(
          `ไฟล์โลโก้หลังย่อมีขนาด ${sizeKb} KB ซึ่งเกินกำหนด 300 KB กรุณาเลือกไฟล์ใหม่ที่มีขนาดเล็กลง หรือกดลบโลโก้ก่อนบันทึก`
        );
      } else {
        setLogoWarning(null);
      }
    } catch (err: any) {
      console.error('Error resizing company logo:', err);
      setLogoWarning(err?.message || 'เกิดข้อผิดพลาดในการย่อรูปโลโก้');
    } finally {
      setProcessingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoDataUrl('');
    setLogoSizeBytes(0);
    setLogoWarning(null);
    setErrorMsg(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleAddItem = () => {
    const trimmed = newNameTh.trim();
    if (!trimmed) {
      setErrorMsg('กรุณาระบุชื่อรายการ (ภาษาไทย)');
      return;
    }
    setErrorMsg(null);
    const id = `${newType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setPayItems((prev) => [
      ...prev,
      {
        id,
        name: trimmed,
        nameEn: newNameEn.trim(),
        type: newType,
        enabled: true,
      },
    ]);
    setNewNameTh('');
    setNewNameEn('');
  };

  const handleMoveItem = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= payItems.length) return;
    setPayItems((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const handleDeleteOrDisableItem = async (item: PayrollItemDefinition) => {
    setNotice(null);
    setErrorMsg(null);
    const isUsed = await checkPayItemUsedInConfirmedSlips(
      item.id,
      { ...initialSettings, usedPayItemIds },
      loadedSlipsMap
    );

    if (isUsed) {
      // ห้ามลบจริง ให้เปลี่ยนเป็นปิดใช้งานแทน เพื่อให้สลิปเก่ายังแสดงถูก
      setPayItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, enabled: false } : it))
      );
      setUsedPayItemIds((prev) => Array.from(new Set([...prev, item.id])));
      setNotice(
        `รายการ "${item.name}" เคยถูกใช้ในสลิปที่ยืนยันแล้ว ระบบจึงเปลี่ยนเป็น "ปิดใช้งาน" แทนการลบจริง เพื่อให้สลิปเก่ายังแสดงผลได้ถูกต้อง`
      );
    } else {
      setPayItems((prev) => prev.filter((it) => it.id !== item.id));
    }
  };

  const parseMultiplierInput = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? round2(n) : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabledSave || saving || processingLogo) return;

    // ตรวจสอบขนาดไฟล์โลโก้หลังย่อ ถ้าเกิน 300 KB ให้ขึ้นเตือนและไม่บันทึก
    if (logoDataUrl) {
      const currentBytes = computeDataUrlByteSize(logoDataUrl);
      if (currentBytes > 300 * 1024) {
        const sizeKb = (currentBytes / 1024).toFixed(1);
        const msg = `ไม่สามารถบันทึกได้: โลโก้บริษัทหลังย่อมีขนาด ${sizeKb} KB เกินกำหนด 300 KB กรุณาเปลี่ยนรูปใหม่หรือลบโลโก้ออก`;
        setLogoWarning(msg);
        setErrorMsg(msg);
        return;
      }
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const nextDoc: PayrollSettingsDoc = {
        ...initialSettings,
        companyName: companyName.trim() || 'Thunder Cloud',
        logoDataUrl: logoDataUrl || '',
        otMultiplierHolidayInHours: parseMultiplierInput(multRed),
        otMultiplierHolidayAfterHours: parseMultiplierInput(multGreen),
        otMultiplierWorkday: parseMultiplierInput(multBlue),
        otMultiplierUnspecified: parseMultiplierInput(multGray),
        payItems: payItems.filter((it) => it.name.trim() !== ''),
        usedPayItemIds,
      };
      await onSave(nextDoc);
    } catch (err) {
      console.error('Error saving payroll settings:', err);
      setErrorMsg('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <Settings className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                ตั้งค่าระบบสลิปเงินเดือน (`system_settings/payroll_settings`)
              </h3>
              <p className="text-[11px] text-slate-400">
                กำหนดชื่อบริษัท โลโก้บริษัท ตัวคูณ OT ทั้ง 4 ประเภท และจัดการรายการเงินได้ / รายการหัก
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* 1. Company Name & Company Logo */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="space-y-2">
              <label className="block font-bold text-slate-800 dark:text-slate-200">
                1. ชื่อบริษัท (แสดงบนสลิปเงินเดือน)
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Thunder Cloud"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
              />
            </div>

            {/* ช่องโลโก้บริษัท */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-200">
                    โลโก้บริษัท (แสดงมุมบนซ้ายของสลิปเงินเดือน)
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    รองรับไฟล์ PNG หรือ JPG (ย่ออัตโนมัติให้ด้านยาวไม่เกิน 400px รักษาความโปร่งใสของ PNG และขนาดหลังย่อต้องไม่เกิน 300 KB)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={processingLogo}
                    onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    {processingLogo ? 'กำลังย่อรูป...' : logoDataUrl ? 'เปลี่ยนโลโก้' : 'อัปโหลดโลโก้ (PNG / JPG)'}
                  </button>

                  {logoDataUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ลบโลโก้</span>
                    </button>
                  )}
                </div>
              </div>

              {logoDataUrl ? (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <div className="px-3 py-2 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center">
                    <img
                      src={logoDataUrl}
                      alt="ตัวอย่างโลโก้บริษัท"
                      style={{
                        height: '56px',
                        width: 'auto',
                        maxWidth: '180px',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                    <div className="font-bold text-slate-800 dark:text-slate-100">
                      ตัวอย่างโลโก้ที่จะแสดงบนสลิปเงินเดือน (ความสูงประมาณ 56px)
                    </div>
                    <div className="text-slate-400">
                      ขนาดข้อมูลหลังย่อ:{' '}
                      {((logoSizeBytes || computeDataUrlByteSize(logoDataUrl)) / 1024).toFixed(1)} KB / สูงสุด 300 KB
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 italic">
                  ยังไม่ได้ตั้งค่าโลโก้บริษัท (สลิปเงินเดือนจะแสดงตามรูปแบบเดิม)
                </div>
              )}

              {logoWarning && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{logoWarning}</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. OT Multipliers (4 values) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-200">
                2. ตัวคูณ OT ทั้ง 4 ประเภท (แอดมินต้องกรอกให้ครบทั้ง 4 ค่าจึงจะคำนวณสลิปได้)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                สูตรค่า OT แต่ละประเภท = ชั่วโมง OT ที่อนุมัติแล้ว × ค่าแรงต่อชั่วโมง (salary ÷ 30 ÷ 8) × ตัวคูณ
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* แดง: holiday_in_hours */}
              <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/50 dark:bg-rose-950/30">
                <label className="block font-bold text-rose-800 dark:text-rose-300 mb-1">
                  OT วันหยุด ในเวลางาน (สีแดง)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-rose-600 dark:text-rose-400 font-bold">×</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={multRed}
                    onChange={(e) => setMultRed(e.target.value)}
                    placeholder="ระบุตัวคูณ เช่น 1 หรือ 2"
                    className="w-full px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* เขียว: holiday_after_hours */}
              <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/50 dark:bg-emerald-950/30">
                <label className="block font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                  OT วันหยุด หลังเวลางาน (สีเขียว)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">×</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={multGreen}
                    onChange={(e) => setMultGreen(e.target.value)}
                    placeholder="ระบุตัวคูณ เช่น 3"
                    className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* ฟ้า: workday */}
              <div className="p-3 rounded-xl border border-sky-200 dark:border-sky-900/70 bg-sky-50/50 dark:bg-sky-950/30">
                <label className="block font-bold text-sky-800 dark:text-sky-300 mb-1">
                  OT วันทำงานปกติ (สีฟ้า)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sky-600 dark:text-sky-400 font-bold">×</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={multBlue}
                    onChange={(e) => setMultBlue(e.target.value)}
                    placeholder="ระบุตัวคูณ เช่น 1.5"
                    className="w-full px-3 py-1.5 rounded-lg border border-sky-300 dark:border-sky-800 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* เทา: unspecified */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  OT ไม่ระบุประเภท (สีเทา)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-bold">×</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={multGray}
                    onChange={(e) => setMultGray(e.target.value)}
                    placeholder="ระบุตัวคูณ เช่น 1.5"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Pay Items Management */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-200">
                3. รายการเงินได้ (Earnings) และ รายการหัก (Deductions)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                เพิ่ม แก้ไข ลบ เปิด/ปิดใช้งาน และจัดเรียงลำดับได้ (รายการที่เคยใช้ในสลิปที่ยืนยันแล้วจะเปลี่ยนเป็นปิดใช้งานแทนการลบจริง)
              </p>
            </div>

            {notice && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>{notice}</span>
              </div>
            )}

            {/* Add new pay item bar */}
            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-4">
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  ชื่อรายการ (ไทย) *
                </label>
                <input
                  type="text"
                  value={newNameTh}
                  onChange={(e) => setNewNameTh(e.target.value)}
                  placeholder="เช่น ค่าตำแหน่ง, ค่าเดินทาง"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  ชื่อภาษาอังกฤษ (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={newNameEn}
                  onChange={(e) => setNewNameEn(e.target.value)}
                  placeholder="e.g. Position Allowance"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  ประเภท
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as PayrollItemType)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold cursor-pointer"
                >
                  <option value="earning">เงินได้ (+)</option>
                  <option value="deduction">รายการหัก (-)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่มรายการ</span>
                </button>
              </div>
            </div>

            {/* Pay items list */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {payItems.map((item, idx) => (
                <div
                  key={item.id}
                  className={clsx(
                    'p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition',
                    item.enabled
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      : 'bg-slate-100/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 opacity-70'
                  )}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap sm:flex-nowrap">
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0',
                        item.type === 'earning'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                      )}
                    >
                      {item.type === 'earning' ? 'เงินได้' : 'รายการหัก'}
                    </span>

                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) =>
                        setPayItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it))
                        )
                      }
                      placeholder="ชื่อภาษาไทย"
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent font-bold text-slate-900 dark:text-white min-w-[140px] flex-1"
                    />

                    <input
                      type="text"
                      value={item.nameEn || ''}
                      onChange={(e) =>
                        setPayItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, nameEn: e.target.value } : it))
                        )
                      }
                      placeholder="ชื่ออังกฤษ (ไม่บังคับ)"
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-300 min-w-[120px] flex-1"
                    />

                    <select
                      value={item.type}
                      onChange={(e) =>
                        setPayItems((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, type: e.target.value as PayrollItemType } : it
                          )
                        )
                      }
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold cursor-pointer"
                    >
                      <option value="earning">เงินได้</option>
                      <option value="deduction">รายการหัก</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 justify-end">
                    <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer text-[11px] font-semibold">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) =>
                          setPayItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, enabled: e.target.checked } : it
                            )
                          )
                        }
                        className="rounded text-indigo-600 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>{item.enabled ? 'เปิดใช้' : 'ปิดใช้'}</span>
                    </label>

                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveItem(idx, -1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      title="เลื่อนขึ้น"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={idx === payItems.length - 1}
                      onClick={() => handleMoveItem(idx, 1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      title="เลื่อนลง"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteOrDisableItem(item)}
                      className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                      title="ลบรายการ (หากเคยใช้ในสลิปที่ยืนยันแล้วจะเปลี่ยนเป็นปิดใช้งานแทน)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

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
              disabled={disabledSave || saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===============================================================
// Sub-Modal 2: Employee Payroll Slip Detail & Live Calculator Modal
// ===============================================================

function EmployeePayrollSlipModal({
  employee,
  profile,
  cycleKey,
  cycleLabel,
  periodLabel,
  defaultPayDate,
  settings,
  multipliersReady,
  initialRowData,
  actorName,
  isHrUnlocked,
  downloadingPdf,
  onPreviewSlip,
  onDownloadSlipPdf,
  onOpenSettings,
  onClose,
  onSavedSlip,
}: {
  employee: { uid: string; name: string; username?: string; avatarEmoji?: string };
  profile: HRProfile;
  cycleKey: string;
  cycleLabel: string;
  periodLabel: string;
  defaultPayDate: string;
  settings: PayrollSettingsDoc;
  multipliersReady: boolean;
  initialRowData?: EmployeeRowComputedData;
  actorName: string;
  isHrUnlocked: boolean;
  downloadingPdf: boolean;
  onPreviewSlip: (slip: PayrollSlip, ytd: PayslipYTDInfo) => void;
  onDownloadSlipPdf: (slip: PayrollSlip, ytd: PayslipYTDInfo) => void;
  onOpenSettings: () => void;
  onClose: () => void;
  onSavedSlip: (savedSlip: PayrollSlip, usedItemIds: string[]) => Promise<void>;
}) {
  const year = useMemo(() => getYearFromCycleKey(cycleKey), [cycleKey]);

  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState<number>(0);

  const [privateData, setPrivateData] = useState<HRPrivateData | null>(
    initialRowData?.privateData || null
  );
  const [otHours, setOtHours] = useState<ApprovedOTHoursByType>(
    initialRowData?.otHours || {
      holiday_in_hours: 0,
      holiday_after_hours: 0,
      workday: 0,
      unspecified: 0,
      totalHours: 0,
    }
  );
  const [approvedAdvance, setApprovedAdvance] = useState<number>(
    initialRowData?.approvedAdvance || 0
  );
  const [existingSlip, setExistingSlip] = useState<PayrollSlip | null>(
    initialRowData?.slip || null
  );
  const [yearConfirmedSlips, setYearConfirmedSlips] = useState<PayrollSlip[]>([]);

  // Form inputs (live calculation while typing)
  const [payDate, setPayDate] = useState<string>(
    initialRowData?.slip?.payDate || defaultPayDate || `${cycleKey}-25`
  );
  const [withholdingTaxStr, setWithholdingTaxStr] = useState<string>(
    initialRowData?.slip?.withholdingTax ? String(initialRowData.slip.withholdingTax) : '0'
  );
  const [itemAmounts, setItemAmounts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialRowData?.slip?.items?.forEach((it) => {
      map[it.id] = String(it.amount ?? 0);
    });
    return map;
  });
  const [remark, setRemark] = useState<string>(initialRowData?.slip?.remark || '');

  // Bank account masking toggle
  const [showFullBankAccount, setShowFullBankAccount] = useState<boolean>(false);

  // Unconfirm state
  const [showUnconfirmBox, setShowUnconfirmBox] = useState<boolean>(false);
  const [unconfirmReason, setUnconfirmReason] = useState<string>('');
  const [savingAction, setSavingAction] = useState<'draft' | 'confirmed' | 'unconfirm' | null>(
    null
  );
  const [actionError, setActionError] = useState<string | null>(null);

  // Load fresh employee slip data & YTD confirmed slips on modal open
  useEffect(() => {
    let isCancelled = false;

    async function loadDetail() {
      setLoading(true);
      setLoadError(null);
      try {
        const fallbackName = profile.fullName || employee.name;
        const [priv, slip, ot, adv, ytdSlips] = await Promise.all([
          fetchHRPrivateEmployee(employee.uid, fallbackName),
          fetchPayrollSlip(cycleKey, employee.uid),
          fetchEmployeeCycleApprovedOT(employee.uid, cycleKey),
          fetchEmployeeCycleApprovedAdvance(employee.uid, cycleKey),
          fetchEmployeeYearConfirmedSlips(employee.uid, year),
        ]);

        if (isCancelled) return;
        setPrivateData(priv);
        setExistingSlip(slip);
        setOtHours(ot);
        setApprovedAdvance(adv);
        setYearConfirmedSlips(ytdSlips);

        if (slip) {
          setPayDate(slip.payDate || defaultPayDate || `${cycleKey}-25`);
          setWithholdingTaxStr(String(slip.withholdingTax ?? 0));
          const map: Record<string, string> = {};
          slip.items?.forEach((it) => {
            map[it.id] = String(it.amount ?? 0);
          });
          setItemAmounts(map);
          setRemark(slip.remark || '');
        }
      } catch (err) {
        console.error('Error loading employee slip modal data:', err);
        if (!isCancelled) {
          setLoadError(
            'โหลดข้อมูลสลิปของพนักงานไม่สำเร็จ กรุณากดโหลดใหม่ (ระบบปิดปุ่มบันทึกและยืนยันเพื่อป้องกันข้อมูลทับหาย)'
          );
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      isCancelled = true;
    };
  }, [employee.uid, employee.name, profile.fullName, cycleKey, year, defaultPayDate, reloadCount]);

  const isConfirmed = existingSlip?.status === 'confirmed';
  const hasSalary = Boolean(privateData && Number(privateData.salary) > 0);

  // Merge active payItems with any historical items stored on this slip
  const effectivePayItems = useMemo(() => {
    const list: PayrollItemDefinition[] = [];
    const seen = new Set<string>();

    settings.payItems.forEach((def) => {
      if (def.enabled || (existingSlip?.items?.some((i) => i.id === def.id && i.amount > 0))) {
        list.push(def);
        seen.add(def.id);
      }
    });

    existingSlip?.items?.forEach((oldItem) => {
      if (!seen.has(oldItem.id)) {
        list.push({
          id: oldItem.id,
          name: oldItem.name,
          nameEn: oldItem.nameEn,
          type: oldItem.type,
          enabled: false,
        });
        seen.add(oldItem.id);
      }
    });

    return list;
  }, [settings.payItems, existingSlip]);

  // Live calculation while typing
  const liveCalc = useMemo(() => {
    if (!privateData) return null;

    const slipItems: PayrollSlipItem[] = effectivePayItems.map((def) => ({
      id: def.id,
      name: def.name,
      nameEn: def.nameEn,
      type: def.type,
      amount: round2(Math.max(0, parseFloat(itemAmounts[def.id] || '0') || 0)),
    }));

    return calculatePayrollSlipValues({
      privateData,
      otHours,
      settings,
      approvedAdvanceAmount: approvedAdvance,
      withholdingTax: round2(Math.max(0, parseFloat(withholdingTaxStr || '0') || 0)),
      items: slipItems,
    });
  }, [privateData, otHours, settings, approvedAdvance, withholdingTaxStr, effectivePayItems, itemAmounts]);

  // Displayed values: if confirmed, show the locked confirmed values; otherwise show liveCalc
  const displayedValues = useMemo(() => {
    if (isConfirmed && existingSlip) {
      return {
        salary: existingSlip.salary,
        hourlyRate: existingSlip.hourlyRate,
        otLines: existingSlip.otLines,
        otTotal: existingSlip.otTotal,
        ssoAmount: existingSlip.ssoAmount,
        advanceAmount: existingSlip.advanceAmount,
        withholdingTax: existingSlip.withholdingTax,
        items: existingSlip.items || [],
        totalEarnings: existingSlip.totalEarnings,
        totalDeductions: existingSlip.totalDeductions,
        netPay: existingSlip.netPay,
      };
    }
    return liveCalc;
  }, [isConfirmed, existingSlip, liveCalc]);

  // YTD Totals (including this cycle's slip!)
  const ytdTotals = useMemo(() => {
    if (!displayedValues) {
      return { ytdEarnings: 0, ytdTax: 0, ytdSso: 0, previousConfirmedCount: 0 };
    }
    return calculateYTDTotals(yearConfirmedSlips, cycleKey, {
      totalEarnings: displayedValues.totalEarnings,
      withholdingTax: displayedValues.withholdingTax,
      ssoAmount: displayedValues.ssoAmount,
    });
  }, [yearConfirmedSlips, cycleKey, displayedValues]);

  // YTD Totals computed strictly from stored existingSlip in payroll_slips (no recalculation when printing/previewing)
  const storedSlipYtdTotals = useMemo<PayslipYTDInfo>(() => {
    if (!existingSlip) {
      return { ytdEarnings: 0, ytdTax: 0, ytdSso: 0 };
    }
    const ytd = calculateYTDTotals(yearConfirmedSlips, existingSlip.cycleKey, {
      totalEarnings: existingSlip.totalEarnings,
      withholdingTax: existingSlip.withholdingTax,
      ssoAmount: existingSlip.ssoAmount,
    });
    return {
      ytdEarnings: ytd.ytdEarnings,
      ytdTax: ytd.ytdTax,
      ytdSso: ytd.ytdSso,
    };
  }, [yearConfirmedSlips, existingSlip]);

  const handleSave = async (targetStatus: 'draft' | 'confirmed') => {
    if (loading || loadError || !liveCalc || !privateData || !multipliersReady) return;
    if (targetStatus === 'confirmed' && !hasSalary) {
      setActionError('ไม่สามารถยืนยันสลิปได้ เนื่องจากพนักงานยังไม่มีข้อมูลเงินเดือนในข้อมูลลับ HR');
      return;
    }

    setSavingAction(targetStatus);
    setActionError(null);
    try {
      const snapshot = {
        fullName: profile.fullName || employee.name,
        nickname: profile.nickname || '',
        position: profile.position || '',
        bankName: privateData.bankName || '',
        accountNumber: privateData.accountNumber || '',
        accountName: privateData.accountName || profile.fullName || employee.name,
      };

      const saved = await savePayrollSlip({
        employeeId: employee.uid,
        cycleKey,
        payDate: payDate || `${cycleKey}-25`,
        status: targetStatus,
        calc: liveCalc,
        remark,
        snapshot,
        actorName,
        existingSlip,
      });

      const usedItemIds = liveCalc.items
        .filter((it) => it.amount > 0)
        .map((it) => it.id);

      setExistingSlip(saved);
      await onSavedSlip(saved, usedItemIds);
    } catch (err) {
      console.error('Error saving payroll slip:', err);
      setActionError('บันทึกสลิปเงินเดือนไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือลองใหม่อีกครั้ง');
    } finally {
      setSavingAction(null);
    }
  };

  const handleUnconfirm = async () => {
    if (!existingSlip || !unconfirmReason.trim()) {
      setActionError('กรุณาระบุเหตุผลในการยกเลิกการยืนยันสลิป');
      return;
    }

    setSavingAction('unconfirm');
    setActionError(null);
    try {
      const updated = await unconfirmPayrollSlip({
        slip: existingSlip,
        reason: unconfirmReason.trim(),
        actorName,
      });
      setExistingSlip(updated);
      setShowUnconfirmBox(false);
      setUnconfirmReason('');
      await onSavedSlip(updated, []);
    } catch (err) {
      console.error('Error unconfirming payroll slip:', err);
      setActionError('ไม่สามารถยกเลิกการยืนยันสลิปได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSavingAction(null);
    }
  };

  const fmtMoney = (n: number) =>
    (Number(n) || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const displaySnapshot = isConfirmed && existingSlip?.snapshot
    ? existingSlip.snapshot
    : {
        fullName: profile.fullName || employee.name,
        nickname: profile.nickname || '',
        position: profile.position || '-',
        bankName: privateData?.bankName || '-',
        accountNumber: privateData?.accountNumber || '',
        accountName: privateData?.accountName || profile.fullName || employee.name,
      };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl p-5 space-y-4 max-h-[93vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <AnimalAvatar
              avatarEmoji={employee.avatarEmoji}
              identifier={employee.username || employee.uid}
              name={employee.name}
              size="md"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  สลิปเงินเดือน: {displaySnapshot.fullName}
                </h3>
                {isConfirmed ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>ยืนยันแล้ว (ล็อกการแก้ไข)</span>
                  </span>
                ) : existingSlip?.status === 'draft' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800">
                    ฉบับร่าง (Draft)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    ยังไม่สร้างสลิป
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {settings.companyName || 'Thunder Cloud'} • {cycleLabel} ({periodLabel})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            <button
              type="button"
              disabled={!isHrUnlocked || !existingSlip || loading || Boolean(loadError)}
              onClick={() => existingSlip && onPreviewSlip(existingSlip, storedSlipYtdTotals)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                existingSlip
                  ? existingSlip.status === 'draft'
                    ? 'ดูตัวอย่างสลิปฉบับร่าง (แสดงลายน้ำ ร่าง - ยังไม่ยืนยัน)'
                    : 'ดูตัวอย่างสลิปเงินเดือนหน้าตาจริง'
                  : 'กรุณากดบันทึกร่างหรือยืนยันสลิปก่อนดูตัวอย่างสลิป'
              }
            >
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
              <span>ดูตัวอย่างสลิป</span>
            </button>

            <button
              type="button"
              disabled={
                !isHrUnlocked ||
                !isConfirmed ||
                !existingSlip ||
                downloadingPdf ||
                loading ||
                Boolean(loadError)
              }
              onClick={() => existingSlip && onDownloadSlipPdf(existingSlip, storedSlipYtdTotals)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                isConfirmed
                  ? 'ดาวน์โหลดสลิปเงินเดือนเป็นไฟล์ PDF'
                  : existingSlip?.status === 'draft'
                  ? 'สลิปที่ยังเป็นร่างไม่สามารถดาวน์โหลด PDF ได้ กรุณายืนยันสลิปก่อน'
                  : 'ยังไม่ได้สร้างและยืนยันสลิป'
              }
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลด PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Load Error Banner */}
        {loadError && (
          <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setReloadCount((c) => c + 1)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>โหลดใหม่</span>
            </button>
          </div>
        )}

        {/* Missing OT Multipliers Warning */}
        {!multipliersReady && (
          <div className="p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                ยังไม่ได้ตั้งค่าตัวคูณ OT ครบทั้ง 4 ประเภท กรุณาตั้งค่าตัวคูณ OT ก่อนคำนวณและบันทึกสลิป
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 cursor-pointer"
            >
              ไปที่ตั้งค่าตัวคูณ OT
            </button>
          </div>
        )}

        {/* Missing Salary Warning */}
        {!loading && !loadError && !hasSalary && (
          <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              คำเตือน: พนักงานคนนี้ยังไม่มีข้อมูลเงินเดือนในข้อมูลลับ HR (salary = 0) กรุณาระบุเงินเดือนในหน้า HR ก่อน ระบบไม่อนุญาตให้กดยืนยันสลิป
            </span>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
            กำลังโหลดข้อมูลเงินเดือน OT และยอดสะสมทั้งปี...
          </div>
        ) : displayedValues ? (
          <div className="space-y-4 text-xs">
            {/* Employee & Bank Snapshot Info + Pay Date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <div>
                <div className="text-[10px] font-semibold text-slate-400">ชื่อ-นามสกุล / ตำแหน่ง</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {displaySnapshot.fullName}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  ตำแหน่ง: {displaySnapshot.position || '-'}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold text-slate-400 flex items-center justify-between">
                  <span>บัญชีธนาคารรับเงินเดือน</span>
                  {displaySnapshot.accountNumber && (
                    <button
                      type="button"
                      onClick={() => setShowFullBankAccount((v) => !v)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      {showFullBankAccount ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span>ซ่อนเลข</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>ดูเลขเต็ม</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {displaySnapshot.bankName || '-'}
                </div>
                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  เลขบัญชี:{' '}
                  {displaySnapshot.accountNumber
                    ? showFullBankAccount
                      ? displaySnapshot.accountNumber
                      : maskSensitiveNumber(displaySnapshot.accountNumber)
                    : '-'}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                  วันที่จ่ายเงิน (Pay Date)
                </label>
                <input
                  type="date"
                  disabled={isConfirmed}
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-white disabled:opacity-60"
                />
              </div>
            </div>

            {/* Two-Column Breakdown: Earnings (Left) vs Deductions (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* LEFT: EARNINGS */}
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/15 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-200/70 dark:border-emerald-900/50">
                  <span className="font-extrabold text-emerald-800 dark:text-emerald-300 text-sm">
                    รายการเงินได้ (Earnings)
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    ค่าแรง/ชม.: {fmtMoney(displayedValues.hourlyRate)} บาท (เงินเดือน ÷ 30 ÷ 8)
                  </span>
                </div>

                {/* Base Salary (Read-only calculated from hr_private) */}
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      เงินเดือนพื้นฐาน (Salary)
                    </div>
                    <div className="text-[10px] text-slate-400">ดึงจากข้อมูลลับ HR (แก้ไขไม่ได้ในหน้านี้)</div>
                  </div>
                  <div className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {fmtMoney(displayedValues.salary)}
                  </div>
                </div>

                {/* OT 4 Types Breakdown (Read-only calculated) */}
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                    <span>ค่าล่วงเวลา (OT อนุมัติแล้วในรอบนี้)</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">
                      รวม {fmtMoney(displayedValues.otTotal)} บาท
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px] tabular-nums">
                    {/* แดง */}
                    <div className="flex items-center justify-between text-rose-700 dark:text-rose-300">
                      <span>
                        • OT วันหยุด ในเวลางาน (แดง): {displayedValues.otLines.holiday_in_hours.hours} ชม. ×{' '}
                        {fmtMoney(displayedValues.hourlyRate)} ×{' '}
                        {displayedValues.otLines.holiday_in_hours.multiplier}
                      </span>
                      <span className="font-mono font-bold">
                        {fmtMoney(displayedValues.otLines.holiday_in_hours.amount)}
                      </span>
                    </div>

                    {/* เขียว */}
                    <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
                      <span>
                        • OT วันหยุด หลังเวลางาน (เขียว): {displayedValues.otLines.holiday_after_hours.hours} ชม. ×{' '}
                        {fmtMoney(displayedValues.hourlyRate)} ×{' '}
                        {displayedValues.otLines.holiday_after_hours.multiplier}
                      </span>
                      <span className="font-mono font-bold">
                        {fmtMoney(displayedValues.otLines.holiday_after_hours.amount)}
                      </span>
                    </div>

                    {/* ฟ้า */}
                    <div className="flex items-center justify-between text-sky-700 dark:text-sky-300">
                      <span>
                        • OT วันทำงานปกติ (ฟ้า): {displayedValues.otLines.workday.hours} ชม. ×{' '}
                        {fmtMoney(displayedValues.hourlyRate)} ×{' '}
                        {displayedValues.otLines.workday.multiplier}
                      </span>
                      <span className="font-mono font-bold">
                        {fmtMoney(displayedValues.otLines.workday.amount)}
                      </span>
                    </div>

                    {/* เทา */}
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>
                        • OT ไม่ระบุประเภท (เทา): {displayedValues.otLines.unspecified.hours} ชม. ×{' '}
                        {fmtMoney(displayedValues.hourlyRate)} ×{' '}
                        {displayedValues.otLines.unspecified.multiplier}
                      </span>
                      <span className="font-mono font-bold">
                        {fmtMoney(displayedValues.otLines.unspecified.amount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Editable Earning PayItems */}
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    รายการเงินได้เพิ่มเติม (กรอกจำนวนเงิน)
                  </div>
                  {effectivePayItems
                    .filter((it) => it.type === 'earning')
                    .map((item) => {
                      const confirmedVal =
                        existingSlip?.items?.find((i) => i.id === item.id)?.amount ?? 0;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 py-1"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.name}
                            </span>
                            {item.nameEn && (
                              <span className="ml-1.5 text-[10px] text-slate-400">
                                ({item.nameEn})
                              </span>
                            )}
                          </div>
                          {isConfirmed ? (
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {fmtMoney(confirmedVal)}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={itemAmounts[item.id] ?? ''}
                              onChange={(e) =>
                                setItemAmounts((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              placeholder="0.00"
                              className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-right font-mono font-bold text-slate-900 dark:text-white"
                            />
                          )}
                        </div>
                      );
                    })}
                </div>

                {/* Total Earnings Footer */}
                <div className="pt-2 border-t border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between font-extrabold text-emerald-800 dark:text-emerald-300 text-sm">
                  <span>รวมเงินได้ทั้งหมด (Total Earnings)</span>
                  <span className="font-mono">{fmtMoney(displayedValues.totalEarnings)} บาท</span>
                </div>
              </div>

              {/* RIGHT: DEDUCTIONS */}
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/15 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-rose-200/70 dark:border-rose-900/50">
                    <span className="font-extrabold text-rose-800 dark:text-rose-300 text-sm">
                      รายการหัก (Deductions)
                    </span>
                    <span className="text-[11px] text-slate-500">คำนวณอัตโนมัติ + กรอกเพิ่มเติม</span>
                  </div>

                  {/* SSO Deduction (Read-only calculated from hr_private) */}
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        ประกันสังคม (SSO)
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {privateData?.ssoStatus === 'not_enrolled'
                          ? 'สถานะ: ไม่เข้าประกันสังคม (0 บาท)'
                          : `คำนวณจาก min(salary × ${privateData?.ssoRatePercent ?? 5}% ÷ 100, ${privateData?.ssoCapAmount ?? 875})`}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {fmtMoney(displayedValues.ssoAmount)}
                    </div>
                  </div>

                  {/* Approved Advance in this Cycle (Read-only calculated) */}
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/70">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        เบิกเงินล่วงหน้า (Advance อนุมัติแล้วในรอบนี้)
                      </div>
                      <div className="text-[10px] text-slate-400">
                        ดึงยอดที่อนุมัติแล้วในรอบ {cycleKey} อัตโนมัติ
                      </div>
                    </div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {fmtMoney(displayedValues.advanceAmount)}
                    </div>
                  </div>

                  {/* Withholding Tax (Admin input) */}
                  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800/70">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        ภาษีหัก ณ ที่จ่าย (Withholding Tax)
                      </div>
                      <div className="text-[10px] text-slate-400">แอดมินกรอกเอง</div>
                    </div>
                    {isConfirmed ? (
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                        {fmtMoney(displayedValues.withholdingTax)}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={withholdingTaxStr}
                        onChange={(e) => setWithholdingTaxStr(e.target.value)}
                        placeholder="0.00"
                        className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-right font-mono font-bold text-slate-900 dark:text-white"
                      />
                    )}
                  </div>

                  {/* Editable Deduction PayItems */}
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      รายการหักอื่นๆ (กรอกจำนวนเงิน)
                    </div>
                    {effectivePayItems
                      .filter((it) => it.type === 'deduction')
                      .map((item) => {
                        const confirmedVal =
                          existingSlip?.items?.find((i) => i.id === item.id)?.amount ?? 0;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 py-1"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {item.name}
                              </span>
                              {item.nameEn && (
                                <span className="ml-1.5 text-[10px] text-slate-400">
                                  ({item.nameEn})
                                </span>
                              )}
                            </div>
                            {isConfirmed ? (
                              <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {fmtMoney(confirmedVal)}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={itemAmounts[item.id] ?? ''}
                                onChange={(e) =>
                                  setItemAmounts((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder="0.00"
                                className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-right font-mono font-bold text-slate-900 dark:text-white"
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Total Deductions Footer */}
                <div className="pt-2 border-t border-rose-200 dark:border-rose-900/60 flex items-center justify-between font-extrabold text-rose-800 dark:text-rose-300 text-sm">
                  <span>รวมรายการหักทั้งหมด (Total Deductions)</span>
                  <span className="font-mono">{fmtMoney(displayedValues.totalDeductions)} บาท</span>
                </div>
              </div>
            </div>

            {/* Net Pay & YTD Totals Summary Banner */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
              {/* Net Pay Card */}
              <div className="lg:col-span-5 p-4 rounded-xl bg-indigo-600 text-white flex flex-col justify-between shadow-sm">
                <div className="text-xs font-semibold text-indigo-100">
                  เงินได้สุทธิ (Net Pay = รวมเงินได้ − รวมรายการหัก)
                </div>
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight mt-1">
                  {fmtMoney(displayedValues.netPay)} <span className="text-sm font-bold">บาท</span>
                </div>
                <div className="text-[11px] text-indigo-200 mt-1">
                  {fmtMoney(displayedValues.totalEarnings)} − {fmtMoney(displayedValues.totalDeductions)} บาท
                </div>
              </div>

              {/* YTD Accumulated Totals Card */}
              <div className="lg:col-span-7 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    ยอดสะสมทั้งปี ค.ศ. {year} (รวมสลิปที่ยืนยันแล้วในปี {year} + สลิปรอบนี้)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    สลิปยืนยันก่อนหน้า {ytdTotals.previousConfirmedCount} งวด + งวดนี้
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 mt-2 tabular-nums">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">เงินได้สะสมทั้งปี</div>
                    <div className="font-mono font-extrabold text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm mt-0.5">
                      {fmtMoney(ytdTotals.ytdEarnings)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">ภาษีหัก ณ ที่จ่ายสะสม</div>
                    <div className="font-mono font-extrabold text-rose-600 dark:text-rose-400 text-xs sm:text-sm mt-0.5">
                      {fmtMoney(ytdTotals.ytdTax)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400">ประกันสังคมสะสม</div>
                    <div className="font-mono font-extrabold text-amber-700 dark:text-amber-400 text-xs sm:text-sm mt-0.5">
                      {fmtMoney(ytdTotals.ytdSso)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Remark Field */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                หมายเหตุสลิปเงินเดือน (Remark)
              </label>
              <textarea
                rows={2}
                disabled={isConfirmed}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="ระบุหมายเหตุเพิ่มเติมในสลิป (ถ้ามี)..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white disabled:opacity-60"
              />
            </div>

            {/* Previous Unconfirm Info if any */}
            {existingSlip?.unconfirmReason && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                <strong>ประวัติการยกเลิกยืนยันล่าสุด:</strong> เหตุผล "{existingSlip.unconfirmReason}" โดย{' '}
                {existingSlip.unconfirmedBy || '-'}
              </div>
            )}

            {/* Unconfirm Box when slip is confirmed */}
            {isConfirmed && showUnconfirmBox && (
              <div className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 space-y-2.5">
                <div className="font-bold text-rose-800 dark:text-rose-200">
                  ระบุเหตุผลที่ต้องการยกเลิกการยืนยันสลิป (จำเป็นต้องกรอก)
                </div>
                <input
                  type="text"
                  value={unconfirmReason}
                  onChange={(e) => setUnconfirmReason(e.target.value)}
                  placeholder="เช่น แก้ไขยอดค่าคอมมิชชั่น หรือปรับปรุงตัวเลขภาษี..."
                  className="w-full px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUnconfirmBox(false);
                      setUnconfirmReason('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/60"
                  >
                    ปิด
                  </button>
                  <button
                    type="button"
                    disabled={savingAction !== null || !unconfirmReason.trim()}
                    onClick={handleUnconfirm}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>ยืนยันการปลดล็อกสลิป</span>
                  </button>
                </div>
              </div>
            )}

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Footer Action Buttons */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-slate-400">
                {isConfirmed && existingSlip?.confirmedAt
                  ? `ยืนยันเมื่อ ${format(new Date(existingSlip.confirmedAt), 'dd/MM/yyyy HH:mm')} โดย ${existingSlip.confirmedBy || '-'}`
                  : existingSlip?.updatedAt
                  ? `อัปเดตล่าสุดเมื่อ ${format(new Date(existingSlip.updatedAt), 'dd/MM/yyyy HH:mm')} โดย ${existingSlip.updatedBy || '-'}`
                  : 'ยังไม่ได้บันทึกสลิปงวดนี้'}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>

                <button
                  type="button"
                  disabled={!isHrUnlocked || !existingSlip || loading || Boolean(loadError)}
                  onClick={() => existingSlip && onPreviewSlip(existingSlip, storedSlipYtdTotals)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    existingSlip
                      ? existingSlip.status === 'draft'
                        ? 'ดูตัวอย่างสลิปฉบับร่าง (แสดงลายน้ำ ร่าง - ยังไม่ยืนยัน)'
                        : 'ดูตัวอย่างสลิปเงินเดือนหน้าตาจริง'
                      : 'กรุณากดบันทึกร่างหรือยืนยันสลิปก่อนดูตัวอย่างสลิป'
                  }
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-500" />
                  <span>ดูตัวอย่างสลิป</span>
                </button>

                <button
                  type="button"
                  disabled={
                    !isHrUnlocked ||
                    !isConfirmed ||
                    !existingSlip ||
                    downloadingPdf ||
                    loading ||
                    Boolean(loadError)
                  }
                  onClick={() => existingSlip && onDownloadSlipPdf(existingSlip, storedSlipYtdTotals)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    isConfirmed
                      ? 'ดาวน์โหลดสลิปเงินเดือนเป็นไฟล์ PDF'
                      : existingSlip?.status === 'draft'
                      ? 'สลิปที่ยังเป็นร่างไม่สามารถดาวน์โหลด PDF ได้ กรุณายืนยันสลิปก่อน'
                      : 'ยังไม่ได้สร้างและยืนยันสลิป'
                  }
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingPdf ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลด PDF'}</span>
                </button>

                {isConfirmed ? (
                  !showUnconfirmBox && (
                    <button
                      type="button"
                      disabled={Boolean(loadError) || loading}
                      onClick={() => setShowUnconfirmBox(true)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>ยกเลิกการยืนยัน (เพื่อแก้ไข)</span>
                    </button>
                  )
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={
                        Boolean(loadError) ||
                        loading ||
                        !multipliersReady ||
                        savingAction !== null
                      }
                      onClick={() => handleSave('draft')}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        {savingAction === 'draft' ? 'กำลังบันทึกร่าง...' : 'บันทึกร่าง'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        Boolean(loadError) ||
                        loading ||
                        !multipliersReady ||
                        !hasSalary ||
                        savingAction !== null
                      }
                      onClick={() => handleSave('confirmed')}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      title={
                        !hasSalary
                          ? 'ไม่สามารถยืนยันได้เนื่องจากพนักงานยังไม่มีเงินเดือนในข้อมูลลับ HR'
                          : 'ยืนยันสลิปเงินเดือน'
                      }
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>
                        {savingAction === 'confirmed' ? 'กำลังยืนยันสลิป...' : 'ยืนยันสลิป'}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ===============================================================
// Sub-Modal 3: Admin Email & Password Verification Modal
// ===============================================================

function PayrollAdminUnlockModal({
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
      setPassword('');
      onSuccess(fbUser.email || email.trim());
    } catch (err: any) {
      console.error('Payroll Admin email verification failed:', err);
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
                ยืนยันตัวตนแอดมินเพื่อดูข้อมูลลับสลิปเงินเดือน
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

// ===============================================================
// Sub-Modal 4: Full Bilingual Payslip Preview & PDF Download Modal
// ===============================================================

function PayslipPreviewModal({
  companyName,
  logoDataUrl,
  slip,
  employeeUsername,
  ytdTotals,
  isHrUnlocked,
  onClose,
}: {
  companyName: string;
  logoDataUrl?: string;
  slip: PayrollSlip;
  employeeUsername?: string;
  ytdTotals: PayslipYTDInfo;
  isHrUnlocked: boolean;
  onClose: () => void;
}) {
  const docRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const isConfirmed = slip.status === 'confirmed';
  const fullName = slip.snapshot?.fullName || slip.employeeName || slip.employeeId;

  const handleDownloadPdf = async () => {
    if (!isHrUnlocked || !isConfirmed || downloading || !docRef.current) return;
    setDownloading(true);
    setPdfError(null);
    try {
      await downloadSinglePayslipPdf(docRef.current, fullName, slip.cycleKey);
    } catch (err) {
      console.error('Error downloading PDF from preview modal:', err);
      setPdfError('ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 w-full max-w-[1190px] max-h-[95vh] flex flex-col overflow-hidden">
        {/* Top Control Bar */}
        <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
              ตัวอย่างสลิปเงินเดือน: {fullName} ({slip.cycleKey})
            </span>
            {isConfirmed ? (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>ยืนยันแล้ว</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800">
                ฉบับร่าง (แสดงลายน้ำ — ยังดาวน์โหลด PDF ไม่ได้)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isHrUnlocked || !isConfirmed || downloading}
              onClick={handleDownloadPdf}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                isConfirmed
                  ? `ดาวน์โหลดไฟล์ สลิปเงินเดือน_${fullName}_${slip.cycleKey}.pdf`
                  : 'สลิปสถานะร่างยังไม่สามารถดาวน์โหลดเป็น PDF ได้ กรุณายืนยันสลิปก่อน'
              }
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'กำลังสร้างไฟล์ PDF...' : 'ดาวน์โหลด PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>ปิด</span>
            </button>
          </div>
        </div>

        {pdfError && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{pdfError}</span>
          </div>
        )}

        {/* Payslip Document Canvas Area */}
        <div className="p-4 sm:p-6 overflow-auto flex-1 flex justify-center items-start bg-slate-200/70 dark:bg-slate-950/70">
          <div className="shadow-xl border border-slate-300 bg-white shrink-0">
            <PayslipDocument
              ref={docRef}
              companyName={companyName}
              logoDataUrl={logoDataUrl}
              slip={slip}
              employeeUsername={employeeUsername}
              ytdTotals={ytdTotals}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// Sub-Tab 2: Payroll Cycle Summary Report (รายงานสรุปเงินเดือนรายรอบ)
// ===============================================================

const THAI_FULL_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

function getCycleThaiMonthYearText(cycleKey: string): string {
  const parts = (cycleKey || '').split('-').map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    return cycleKey;
  }
  const [yearAD, month] = parts;
  const monthIdx = Math.min(11, Math.max(0, month - 1));
  const yearBE = yearAD + 543;
  return `${THAI_FULL_MONTHS[monthIdx]} ${yearBE}`;
}

function getCycleThaiPeriodRangeText(cycleKey: string): string {
  const parts = (cycleKey || '').split('-').map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    return cycleKey;
  }
  const [targetYearAD, targetMonth] = parts;
  let prevYearAD = targetYearAD;
  let prevMonth = targetMonth - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYearAD = targetYearAD - 1;
  }

  const prevMonthName = THAI_FULL_MONTHS[Math.min(11, Math.max(0, prevMonth - 1))];
  const targetMonthName = THAI_FULL_MONTHS[Math.min(11, Math.max(0, targetMonth - 1))];
  const prevYearBE = prevYearAD + 543;
  const targetYearBE = targetYearAD + 543;

  return `26 ${prevMonthName} ${prevYearBE} - 25 ${targetMonthName} ${targetYearBE}`;
}

function formatReportMoney(val: number): string {
  const num = Number(val);
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface SummaryReportRow {
  seq: number;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  salary: number;
  otRegular: number; // เขียว + ฟ้า + ไม่ระบุ
  otHolidayRed: number; // แดง
  otTotalInSlip: number;
  earningAmounts: Record<string, number>;
  totalEarnings: number;
  ssoAmount: number;
  deductionAmounts: Record<string, number>;
  withholdingTax: number;
  advanceAmount: number;
  netPay: number;
  accountNumber: string;
  bankName: string;
  validationErrors: string[];
  isValid: boolean;
}

function PayrollCycleSummaryReportSection({
  selectedCycleKey,
  onChangeCycleKey,
  availableCycles,
  settings,
  profiles,
  visibleEmployees,
  isHrUnlocked,
  reloadTrigger,
}: {
  selectedCycleKey: string;
  onChangeCycleKey: (cycleKey: string) => void;
  availableCycles: Array<{ cycleKey: string; cycleLabel: string; periodLabel: string }>;
  settings: PayrollSettingsDoc;
  profiles: Record<string, HRProfile>;
  visibleEmployees: Array<{ uid: string; name: string; username?: string }>;
  isHrUnlocked: boolean;
  reloadTrigger: number;
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localReloadCount, setLocalReloadCount] = useState<number>(0);
  const [cycleSlips, setCycleSlips] = useState<PayrollSlip[]>([]);
  const [showDownloadWarningModal, setShowDownloadWarningModal] = useState<boolean>(false);

  // ดึง payroll_slips ด้วย where('cycleKey', '==', selectedCycleKey) ครั้งเดียว ห้ามดึงทั้ง collection
  // และต้องยืนยันตัวตนด้วยอีเมลแอดมินแล้วเท่านั้น (isHrUnlocked === true)
  useEffect(() => {
    if (!isHrUnlocked) {
      setCycleSlips([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let isCancelled = false;

    async function loadCycleSlipsOnce() {
      setLoading(true);
      setLoadError(null);
      try {
        const q = query(
          collection(db, 'payroll_slips'),
          where('cycleKey', '==', selectedCycleKey)
        );
        const snap = await getDocs(q);
        if (isCancelled) return;

        const list: PayrollSlip[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as PayrollSlip;
          list.push({
            ...data,
            id: docSnap.id,
          });
        });

        setCycleSlips(list);
      } catch (err: any) {
        console.error(`Error fetching payroll_slips for cycle ${selectedCycleKey}:`, err);
        if (!isCancelled) {
          setLoadError('ไม่สามารถดึงข้อมูลสลิปเงินเดือนของรอบที่เลือกได้ กรุณากดโหลดใหม่');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadCycleSlipsOnce();
    return () => {
      isCancelled = true;
    };
  }, [isHrUnlocked, selectedCycleKey, reloadTrigger, localReloadCount]);

  // นับเฉพาะสลิปที่มี status === 'confirmed'
  const confirmedSlips = useMemo(() => {
    return cycleSlips
      .filter((s) => s.status === 'confirmed')
      .sort((a, b) => {
        const nameA = (a.snapshot?.fullName || a.employeeName || a.employeeId || '').trim();
        const nameB = (b.snapshot?.fullName || b.employeeName || b.employeeId || '').trim();
        return nameA.localeCompare(nameB, 'th');
      });
  }, [cycleSlips]);

  // ตรวจสอบรายชื่อพนักงานที่ยังไม่มีสลิปยืนยันในรอบนั้น (เทียบกับรายชื่อใน hr_profiles และพนักงานปัจจุบัน)
  const missingEmployeesList = useMemo(() => {
    const confirmedEmpIds = new Set(confirmedSlips.map((s) => s.employeeId));
    const draftEmpIds = new Set(
      cycleSlips.filter((s) => s.status === 'draft').map((s) => s.employeeId)
    );

    const activeEmpMap = new Map<string, string>();

    // 1. จาก hr_profiles ที่ไม่ได้ทำเครื่องหมาย notEmployee
    Object.entries(profiles).forEach(([empId, prof]) => {
      if (prof && !prof.notEmployee) {
        const displayName = (prof.fullName || prof.nickname || empId).trim();
        if (displayName) {
          activeEmpMap.set(empId, displayName);
        }
      }
    });

    // 2. จากรายชื่อพนักงานในระบบที่ไม่ได้ถูกปฏิเสธและไม่ได้เป็น notEmployee
    visibleEmployees.forEach((emp) => {
      if (!profiles[emp.uid]?.notEmployee) {
        const p = profiles[emp.uid];
        const displayName = (p?.fullName || emp.name || emp.username || emp.uid).trim();
        activeEmpMap.set(emp.uid, displayName);
      }
    });

    const missing: Array<{ employeeId: string; name: string; isDraft: boolean }> = [];
    activeEmpMap.forEach((name, empId) => {
      if (!confirmedEmpIds.has(empId)) {
        missing.push({
          employeeId: empId,
          name,
          isDraft: draftEmpIds.has(empId),
        });
      }
    });

    return missing.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [confirmedSlips, cycleSlips, profiles, visibleEmployees]);

  // สร้างคอลัมน์รายการเงินได้ (earning) และรายการหัก (deduction) เรียงตามลำดับในตั้งค่า
  // รายการที่ปิดใช้งานแล้วแต่ยังมีในสลิปของรอบนั้น ต้องยังแสดงคอลัมน์
  const { earningColumns, deductionColumns } = useMemo(() => {
    const usedInCycleIds = new Set<string>();
    const cycleItemMetaMap = new Map<string, { id: string; name: string; type: PayrollItemType }>();

    confirmedSlips.forEach((slip) => {
      (slip.items || []).forEach((it) => {
        if (!it || !it.id) return;
        // หากมีอยู่ในสลิปของรอบนั้น
        usedInCycleIds.add(it.id);
        if (!cycleItemMetaMap.has(it.id)) {
          cycleItemMetaMap.set(it.id, {
            id: it.id,
            name: it.name || it.id,
            type: it.type === 'deduction' ? 'deduction' : 'earning',
          });
        }
      });
    });

    const earnCols: Array<{ id: string; name: string }> = [];
    const deductCols: Array<{ id: string; name: string }> = [];
    const seenIds = new Set<string>();

    // 1. เรียงตามลำดับใน settings.payItems
    (settings.payItems || []).forEach((def) => {
      if (def.enabled || usedInCycleIds.has(def.id)) {
        seenIds.add(def.id);
        if (def.type === 'earning') {
          earnCols.push({ id: def.id, name: def.name });
        } else {
          deductCols.push({ id: def.id, name: def.name });
        }
      }
    });

    // 2. กรณีมีรายการที่อยู่ในสลิปของรอบนั้นแต่ไม่อยู่ใน settings.payItems แล้ว
    cycleItemMetaMap.forEach((meta) => {
      if (!seenIds.has(meta.id)) {
        seenIds.add(meta.id);
        if (meta.type === 'earning') {
          earnCols.push({ id: meta.id, name: meta.name });
        } else {
          deductCols.push({ id: meta.id, name: meta.name });
        }
      }
    });

    return {
      earningColumns: earnCols,
      deductionColumns: deductCols,
    };
  }, [settings.payItems, confirmedSlips]);

  // สร้างข้อมูลแต่ละแถวจากตัวเลขที่บันทึกไว้ในสลิปเท่านั้น (ห้ามคำนวณใหม่) + ตรวจความถูกต้อง 3 ข้อ
  const reportRows = useMemo<SummaryReportRow[]>(() => {
    return confirmedSlips.map((slip, idx) => {
      const hrProf = profiles[slip.employeeId] as (HRProfile & { employeeCode?: string }) | undefined;
      // รหัสพนักงาน: ถ้าใน hr_profiles มีช่องรหัสพนักงานให้ใช้ ถ้าไม่มีให้เว้นว่าง
      const employeeCode =
        hrProf && typeof hrProf.employeeCode === 'string' && hrProf.employeeCode.trim()
          ? hrProf.employeeCode.trim()
          : '';

      // ชื่อ ธนาคาร เลขบัญชี ใช้ snapshot ในสลิป
      const fullName = (
        slip.snapshot?.fullName ||
        slip.employeeName ||
        hrProf?.fullName ||
        slip.employeeId ||
        ''
      ).trim();
      const accountNumber = (slip.snapshot?.accountNumber ?? slip.accountNumber ?? '').trim();
      const bankName = (slip.snapshot?.bankName ?? slip.bankName ?? '').trim();

      const salary = round2(Number(slip.salary) || 0);

      // ค่าล่วงเวลา OT = ยอด OT ใน otLines ประเภทเขียว + ฟ้า + ไม่ระบุ
      const amtGreen = Number(slip.otLines?.holiday_after_hours?.amount) || 0;
      const amtBlue = Number(slip.otLines?.workday?.amount) || 0;
      const amtUnspecified = Number(slip.otLines?.unspecified?.amount) || 0;
      const otRegular = round2(amtGreen + amtBlue + amtUnspecified);

      // เงินได้อื่นๆ ทำงานวันหยุด = ยอด OT ใน otLines ประเภทแดง
      const otHolidayRed = round2(Number(slip.otLines?.holiday_in_hours?.amount) || 0);

      const otTotalInSlip = round2(Number(slip.otTotal) || 0);

      // รายการเงินได้แต่ละคอลัมน์ (รายการที่คนนั้นไม่มี = 0)
      const earningAmounts: Record<string, number> = {};
      earningColumns.forEach((col) => {
        earningAmounts[col.id] = 0;
      });
      // รายการหักแต่ละคอลัมน์ (รายการที่คนนั้นไม่มี = 0)
      const deductionAmounts: Record<string, number> = {};
      deductionColumns.forEach((col) => {
        deductionAmounts[col.id] = 0;
      });

      (slip.items || []).forEach((it) => {
        if (!it || !it.id) return;
        const amt = round2(Number(it.amount) || 0);
        if (it.type === 'earning') {
          earningAmounts[it.id] = round2((earningAmounts[it.id] || 0) + amt);
        } else if (it.type === 'deduction') {
          deductionAmounts[it.id] = round2((deductionAmounts[it.id] || 0) + amt);
        }
      });

      const totalEarnings = round2(Number(slip.totalEarnings) || 0);
      const ssoAmount = round2(Number(slip.ssoAmount) || 0);
      const withholdingTax = round2(Number(slip.withholdingTax) || 0);
      const advanceAmount = round2(Number(slip.advanceAmount) || 0);
      const netPay = round2(Number(slip.netPay) || 0);

      // ตรวจความถูกต้อง 3 ข้อ (ยอมให้ต่างกันไม่เกิน 0.01)
      const validationErrors: string[] = [];

      // ข้อ 4.1: ช่อง OT + ช่องทำงานวันหยุด ต้องเท่ากับ otTotal ในสลิป
      const sumOtCols = round2(otRegular + otHolidayRed);
      if (Math.abs(sumOtCols - otTotalInSlip) > 0.01) {
        validationErrors.push(
          `ค่าล่วงเวลา OT + ทำงานวันหยุด (${formatReportMoney(sumOtCols)}) ไม่ตรงกับ otTotal ในสลิป (${formatReportMoney(otTotalInSlip)})`
        );
      }

      // ข้อ 4.2: เงินเดือน + OT + ทำงานวันหยุด + รายการเงินได้ทั้งหมด ต้องเท่ากับ totalEarnings
      const sumAllEarningItems = round2(
        earningColumns.reduce((acc, col) => acc + (earningAmounts[col.id] || 0), 0)
      );
      const expectedTotalEarnings = round2(salary + otRegular + otHolidayRed + sumAllEarningItems);
      if (Math.abs(expectedTotalEarnings - totalEarnings) > 0.01) {
        validationErrors.push(
          `เงินเดือน + OT + ทำงานวันหยุด + รายการเงินได้ (${formatReportMoney(expectedTotalEarnings)}) ไม่ตรงกับ รวมเงินได้ ยื่น ภงด.1 (${formatReportMoney(totalEarnings)})`
        );
      }

      // ข้อ 4.3: รวมเงินได้ − (ประกันสังคม + รายการหักทั้งหมด + หัก ณ ที่จ่าย + เบิกล่วงหน้า) ต้องเท่ากับ netPay
      const sumAllDeductionItems = round2(
        deductionColumns.reduce((acc, col) => acc + (deductionAmounts[col.id] || 0), 0)
      );
      const expectedDeductions = round2(
        ssoAmount + sumAllDeductionItems + withholdingTax + advanceAmount
      );
      const expectedNetPay = round2(totalEarnings - expectedDeductions);
      if (Math.abs(expectedNetPay - netPay) > 0.01) {
        validationErrors.push(
          `รวมเงินได้ − (ประกันสังคม + รายการหัก + หัก ณ ที่จ่าย + เบิกล่วงหน้า) (${formatReportMoney(expectedNetPay)}) ไม่ตรงกับ ยอดจ่ายพนักงาน (${formatReportMoney(netPay)})`
        );
      }

      return {
        seq: idx + 1,
        employeeId: slip.employeeId,
        employeeCode,
        fullName,
        salary,
        otRegular,
        otHolidayRed,
        otTotalInSlip,
        earningAmounts,
        totalEarnings,
        ssoAmount,
        deductionAmounts,
        withholdingTax,
        advanceAmount,
        netPay,
        accountNumber,
        bankName,
        validationErrors,
        isValid: validationErrors.length === 0,
      };
    });
  }, [confirmedSlips, profiles, earningColumns, deductionColumns]);

  // คำนวณแถวสุดท้าย "รวม" รวมทุกคอลัมน์ตัวเลข
  const totalsRow = useMemo(() => {
    let salary = 0;
    let otRegular = 0;
    let otHolidayRed = 0;
    const earningTotals: Record<string, number> = {};
    earningColumns.forEach((c) => {
      earningTotals[c.id] = 0;
    });
    let totalEarnings = 0;
    let ssoAmount = 0;
    const deductionTotals: Record<string, number> = {};
    deductionColumns.forEach((c) => {
      deductionTotals[c.id] = 0;
    });
    let withholdingTax = 0;
    let advanceAmount = 0;
    let netPay = 0;

    reportRows.forEach((r) => {
      salary = round2(salary + r.salary);
      otRegular = round2(otRegular + r.otRegular);
      otHolidayRed = round2(otHolidayRed + r.otHolidayRed);
      earningColumns.forEach((c) => {
        earningTotals[c.id] = round2(earningTotals[c.id] + (r.earningAmounts[c.id] || 0));
      });
      totalEarnings = round2(totalEarnings + r.totalEarnings);
      ssoAmount = round2(ssoAmount + r.ssoAmount);
      deductionColumns.forEach((c) => {
        deductionTotals[c.id] = round2(deductionTotals[c.id] + (r.deductionAmounts[c.id] || 0));
      });
      withholdingTax = round2(withholdingTax + r.withholdingTax);
      advanceAmount = round2(advanceAmount + r.advanceAmount);
      netPay = round2(netPay + r.netPay);
    });

    return {
      salary,
      otRegular,
      otHolidayRed,
      earningTotals,
      totalEarnings,
      ssoAmount,
      deductionTotals,
      withholdingTax,
      advanceAmount,
      netPay,
    };
  }, [reportRows, earningColumns, deductionColumns]);

  const invalidRows = useMemo(() => reportRows.filter((r) => !r.isValid), [reportRows]);

  // สร้างและดาวน์โหลดไฟล์ Excel (.xlsx จริง ด้วย SheetJS)
  const executeExportExcel = () => {
    const companyName = (settings.companyName || 'Thunder Cloud').trim();
    const monthYearThai = getCycleThaiMonthYearText(selectedCycleKey);
    const periodRangeThai = getCycleThaiPeriodRangeText(selectedCycleKey);

    const headers: string[] = [
      'ลำดับที่',
      'รหัสพนักงาน',
      'ชื่อ-สกุล',
      'เงินเดือน/ค่าจ้าง',
      'ค่าล่วงเวลา OT',
      'เงินได้อื่นๆ ทำงานวันหยุด',
      ...earningColumns.map((c) => c.name),
      'รวมเงินได้ ยื่น ภงด.1',
      'ประกันสังคม',
      ...deductionColumns.map((c) => c.name),
      'หัก ณ ที่จ่าย',
      'เงินเบิกล่วงหน้า',
      'ยอดจ่ายพนักงาน',
      'เลขบัญชี',
      'ธนาคาร',
    ];

    // แถว 1 ถึง แถว 6 ตามรูปแบบที่กำหนด
    const aoa: any[][] = [
      [`รายงานเงินเดือนรวมเงินได้/ค่าจ้างรายพนักงาน รอบเดือน ${monthYearThai}`], // แถว 1
      [], // แถว 2
      ['ชื่อบริษัท', companyName], // แถว 3
      ['ช่วงเวลา :', periodRangeThai], // แถว 4
      [], // แถว 5
      headers, // แถว 6: หัวตาราง
    ];

    // แถว 7 เป็นต้นไป: ข้อมูลพนักงานแต่ละแถว
    reportRows.forEach((r) => {
      aoa.push([
        r.seq,
        r.employeeCode,
        r.fullName,
        r.salary,
        r.otRegular,
        r.otHolidayRed,
        ...earningColumns.map((c) => r.earningAmounts[c.id] || 0),
        r.totalEarnings,
        r.ssoAmount,
        ...deductionColumns.map((c) => r.deductionAmounts[c.id] || 0),
        r.withholdingTax,
        r.advanceAmount,
        r.netPay,
        r.accountNumber, // ไฟล์ Excel แสดงเลขบัญชีเต็ม
        r.bankName,
      ]);
    });

    // ต่อด้วยแถวรวม
    aoa.push([
      'รวม',
      '',
      '',
      totalsRow.salary,
      totalsRow.otRegular,
      totalsRow.otHolidayRed,
      ...earningColumns.map((c) => totalsRow.earningTotals[c.id] || 0),
      totalsRow.totalEarnings,
      totalsRow.ssoAmount,
      ...deductionColumns.map((c) => totalsRow.deductionTotals[c.id] || 0),
      totalsRow.withholdingTax,
      totalsRow.advanceAmount,
      totalsRow.netPay,
      '',
      '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // กำหนดชนิดข้อมูลในเซลล์ให้ถูกต้อง:
    // - ตัวเลขเก็บเป็นตัวเลขจริง (type 'n', format '#,##0.00')
    // - รหัสพนักงาน (col 1) และ เลขบัญชี (col headers.length - 2) เก็บเป็นข้อความ (type 's', format '@') ไม่ให้เลข 0 หน้าหาย
    const firstDataRowIdx = 6; // แถวที่ 7 (0-indexed = 6)
    const totalRowIdx = 6 + reportRows.length;
    const numericStartCol = 3; // 'เงินเดือน/ค่าจ้าง'
    const numericEndCol = headers.length - 3; // 'ยอดจ่ายพนักงาน'
    const accountColIdx = headers.length - 2; // 'เลขบัญชี'
    const bankColIdx = headers.length - 1; // 'ธนาคาร'

    for (let rIdx = firstDataRowIdx; rIdx <= totalRowIdx; rIdx++) {
      const isTotalRow = rIdx === totalRowIdx;

      if (!isTotalRow) {
        // ลำดับที่ (จำนวนเต็ม)
        const seqRef = XLSX.utils.encode_cell({ r: rIdx, c: 0 });
        if (ws[seqRef]) {
          ws[seqRef].t = 'n';
        }

        // รหัสพนักงาน (ข้อความเสมอ เพื่อไม่ให้เลข 0 นำหน้าหาย)
        const codeRef = XLSX.utils.encode_cell({ r: rIdx, c: 1 });
        const rawCode = String(reportRows[rIdx - firstDataRowIdx]?.employeeCode ?? '');
        ws[codeRef] = { t: 's', v: rawCode, z: '@' };

        // เลขบัญชี (ข้อความเสมอ แสดงเลขเต็ม ไม่ให้เลข 0 นำหน้าหาย)
        const accRef = XLSX.utils.encode_cell({ r: rIdx, c: accountColIdx });
        const rawAcc = String(reportRows[rIdx - firstDataRowIdx]?.accountNumber ?? '');
        ws[accRef] = { t: 's', v: rawAcc, z: '@' };

        // ธนาคาร (ข้อความ)
        const bankRef = XLSX.utils.encode_cell({ r: rIdx, c: bankColIdx });
        const rawBank = String(reportRows[rIdx - firstDataRowIdx]?.bankName ?? '');
        ws[bankRef] = { t: 's', v: rawBank, z: '@' };
      }

      // คอลัมน์ตัวเลขทั้งหมด ตั้งค่าเป็นตัวเลขจริงพร้อมทศนิยม 2 ตำแหน่ง
      for (let cIdx = numericStartCol; cIdx <= numericEndCol; cIdx++) {
        const cellRef = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
        const cell = ws[cellRef];
        const numVal = cell ? Number(cell.v) || 0 : 0;
        ws[cellRef] = {
          t: 'n',
          v: round2(numVal),
          z: '#,##0.00',
        };
      }
    }

    // กำหนดความกว้างคอลัมน์ให้อ่านง่ายใน Excel
    ws['!cols'] = headers.map((h, i) => {
      if (i === 0) return { wch: 10 };
      if (i === 1) return { wch: 16 };
      if (i === 2) return { wch: 26 };
      if (i === accountColIdx) return { wch: 20 };
      if (i === bankColIdx) return { wch: 20 };
      return { wch: Math.max(16, h.length + 4) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'สรุปเงินเดือน');

    const safeCompany = companyName.replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `รายงานเงินเดือน_${safeCompany}_${selectedCycleKey}.xlsx`;
    XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
    setShowDownloadWarningModal(false);
  };

  const handleClickDownloadExcel = () => {
    if (reportRows.length === 0) return;
    if (invalidRows.length > 0) {
      setShowDownloadWarningModal(true);
      return;
    }
    executeExportExcel();
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden space-y-4 p-4 sm:p-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              รายงานเงินเดือนรวมเงินได้/ค่าจ้างรายพนักงาน รอบเดือน{' '}
              {getCycleThaiMonthYearText(selectedCycleKey)}
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            บริษัท: <strong>{settings.companyName || 'Thunder Cloud'}</strong> • ช่วงเวลา:{' '}
            <strong>{getCycleThaiPeriodRangeText(selectedCycleKey)}</strong> (แสดงเฉพาะสลิปที่ยืนยันแล้ว)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCycleKey}
            onChange={(e) => onChangeCycleKey(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
          >
            {availableCycles.map((c) => (
              <option key={c.cycleKey} value={c.cycleKey}>
                {c.cycleLabel} ({c.periodLabel})
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={loading}
            onClick={() => setLocalReloadCount((c) => c + 1)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span>รีเฟรช</span>
          </button>

          <button
            type="button"
            disabled={loading || Boolean(loadError) || reportRows.length === 0}
            onClick={handleClickDownloadExcel}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ดาวน์โหลด Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Yellow Warning Box: Missing Employees without Confirmed Slip */}
      {!loading && !loadError && missingEmployeesList.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1.5">
          <div className="font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              แจ้งเตือน: มีพนักงานที่ยังไม่มีสลิปยืนยัน (confirmed) ในรอบนี้ จำนวน{' '}
              {missingEmployeesList.length} คน (ยังไม่รวมในตารางสรุปด้านล่าง)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-6">
            {missingEmployeesList.map((m) => (
              <span
                key={m.employeeId}
                className="px-2.5 py-0.5 rounded-lg bg-amber-100/90 dark:bg-amber-900/70 border border-amber-300 dark:border-amber-700 font-semibold text-[11px]"
              >
                {m.name} {m.isDraft ? '(สถานะร่าง)' : '(ยังไม่ได้สร้างสลิป)'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Red Validation Alert Box if any row has mismatched totals */}
      {!loading && !loadError && invalidRows.length > 0 && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs space-y-1.5">
          <div className="font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>
              พบข้อมูลยอดเงินในสลิปไม่ตรงตามสูตรตรวจสอบ จำนวน {invalidRows.length} แถว (แถวที่ไฮไลต์สีแดง):
            </span>
          </div>
          <ul className="list-disc pl-8 space-y-1 text-[11px] font-semibold">
            {invalidRows.map((r) => (
              <li key={r.employeeId}>
                <strong>{r.fullName}:</strong> {r.validationErrors.join(' | ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Report Content */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
          กำลังโหลดรายงานสรุปเงินเดือนประจำรอบ...
        </div>
      ) : loadError ? (
        <div className="p-10 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
          <div className="text-sm font-bold text-rose-700 dark:text-rose-400">{loadError}</div>
          <button
            type="button"
            onClick={() => setLocalReloadCount((c) => c + 1)}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>โหลดใหม่</span>
          </button>
        </div>
      ) : reportRows.length === 0 ? (
        <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
          ยังไม่มีสลิปเงินเดือนที่ยืนยันแล้ว (confirmed) ในรอบ {selectedCycleKey}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-3 text-center border-r border-slate-200 dark:border-slate-700">
                  ลำดับที่
                </th>
                <th className="px-3 py-3 text-left border-r border-slate-200 dark:border-slate-700">
                  รหัสพนักงาน
                </th>
                <th className="px-3 py-3 text-left border-r border-slate-200 dark:border-slate-700 min-w-[180px]">
                  ชื่อ-สกุล
                </th>
                <th className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700">
                  เงินเดือน/ค่าจ้าง
                </th>
                <th className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700">
                  ค่าล่วงเวลา OT
                </th>
                <th className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700">
                  เงินได้อื่นๆ ทำงานวันหยุด
                </th>
                {earningColumns.map((col) => (
                  <th
                    key={col.id}
                    className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700 text-emerald-800 dark:text-emerald-300"
                  >
                    {col.name}
                  </th>
                ))}
                <th className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200">
                  รวมเงินได้ ยื่น ภงด.1
                </th>
                <th className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700">
                  ประกันสังคม
                </th>
                {deductionColumns.map((col) => (
                  <th
                    key={col.id}
                    className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700 text-rose-800 dark:text-rose-300"
                  >
                    {col.name}
                  </th>
                ))}
                <th className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700">
                  หัก ณ ที่จ่าย
                </th>
                <th className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700">
                  เงินเบิกล่วงหน้า
                </th>
                <th className="px-3 py-3 text-right border-r border-slate-200 dark:border-slate-700 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200">
                  ยอดจ่ายพนักงาน
                </th>
                <th className="px-3 py-3 text-left border-r border-slate-200 dark:border-slate-700">
                  เลขบัญชี
                </th>
                <th className="px-3 py-3 text-left">ธนาคาร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
              {reportRows.map((row) => (
                <tr
                  key={row.employeeId}
                  className={clsx(
                    'transition',
                    !row.isValid
                      ? 'bg-rose-100/90 dark:bg-rose-950/60 text-rose-950 dark:text-rose-100 hover:bg-rose-200/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  )}
                >
                  <td className="px-3 py-2.5 text-center font-mono border-r border-slate-100 dark:border-slate-800">
                    {row.seq}
                  </td>
                  <td className="px-3 py-2.5 text-left font-mono border-r border-slate-100 dark:border-slate-800">
                    {row.employeeCode}
                  </td>
                  <td className="px-3 py-2.5 text-left font-bold border-r border-slate-100 dark:border-slate-800">
                    <div>{row.fullName}</div>
                    {!row.isValid && (
                      <div className="mt-1 text-[10px] font-semibold text-rose-700 dark:text-rose-300 whitespace-normal max-w-xs">
                        {row.validationErrors.map((errText, i) => (
                          <div key={i}>• {errText}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono border-r border-slate-100 dark:border-slate-800">
                    {formatReportMoney(row.salary)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono border-r border-slate-100 dark:border-slate-800">
                    {formatReportMoney(row.otRegular)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono border-r border-slate-100 dark:border-slate-800">
                    {formatReportMoney(row.otHolidayRed)}
                  </td>
                  {earningColumns.map((col) => (
                    <td
                      key={col.id}
                      className="px-3 py-2.5 text-right font-mono border-r border-slate-100 dark:border-slate-800"
                    >
                      {formatReportMoney(row.earningAmounts[col.id] || 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono font-bold border-r border-slate-100 dark:border-slate-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">
                    {formatReportMoney(row.totalEarnings)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono border-r border-slate-100 dark:border-slate-800">
                    {formatReportMoney(row.ssoAmount)}
                  </td>
                  {deductionColumns.map((col) => (
                    <td
                      key={col.id}
                      className="px-3 py-2.5 text-right font-mono border-r border-slate-100 dark:border-slate-800"
                    >
                      {formatReportMoney(row.deductionAmounts[col.id] || 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono border-r border-slate-100 dark:border-slate-800">
                    {formatReportMoney(row.withholdingTax)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono border-r border-slate-100 dark:border-slate-800">
                    {formatReportMoney(row.advanceAmount)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-extrabold border-r border-slate-100 dark:border-slate-800 bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200">
                    {formatReportMoney(row.netPay)}
                  </td>
                  <td className="px-3 py-2.5 text-left font-mono border-r border-slate-100 dark:border-slate-800">
                    {row.accountNumber ? maskSensitiveNumber(row.accountNumber) : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-left">{row.bankName || '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700 tabular-nums">
                <td
                  colSpan={3}
                  className="px-3 py-3 text-center border-r border-slate-200 dark:border-slate-700"
                >
                  รวม
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700">
                  {formatReportMoney(totalsRow.salary)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700">
                  {formatReportMoney(totalsRow.otRegular)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700">
                  {formatReportMoney(totalsRow.otHolidayRed)}
                </td>
                {earningColumns.map((col) => (
                  <td
                    key={col.id}
                    className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700"
                  >
                    {formatReportMoney(totalsRow.earningTotals[col.id] || 0)}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700 bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200">
                  {formatReportMoney(totalsRow.totalEarnings)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700">
                  {formatReportMoney(totalsRow.ssoAmount)}
                </td>
                {deductionColumns.map((col) => (
                  <td
                    key={col.id}
                    className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700"
                  >
                    {formatReportMoney(totalsRow.deductionTotals[col.id] || 0)}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700">
                  {formatReportMoney(totalsRow.withholdingTax)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700">
                  {formatReportMoney(totalsRow.advanceAmount)}
                </td>
                <td className="px-3 py-3 text-right font-mono border-r border-slate-200 dark:border-slate-700 bg-indigo-100/70 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200">
                  {formatReportMoney(totalsRow.netPay)}
                </td>
                <td className="px-3 py-3 border-r border-slate-200 dark:border-slate-700" />
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Warning Modal before downloading Excel when validation errors exist */}
      {showDownloadWarningModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-rose-300 dark:border-rose-800 w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400">
                  <ShieldAlert className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    คำเตือน: พบแถวที่ยอดเงินตรวจสอบไม่ผ่าน ({invalidRows.length} แถว)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    คุณยังสามารถกดยืนยันเพื่อดาวน์โหลดไฟล์ Excel ต่อได้
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadWarningModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 max-h-60 overflow-y-auto space-y-1.5">
              {invalidRows.map((r) => (
                <div key={r.employeeId} className="leading-relaxed">
                  <span className="font-bold">{r.fullName}:</span> {r.validationErrors.join(' | ')}
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowDownloadWarningModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={executeExportExcel}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ดาวน์โหลด Excel ต่อไป</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

