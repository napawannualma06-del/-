import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import {
  AccessRequestApproveMode,
  approveAccessRequestBatch,
  countTotalSuperAdmins,
  fetchAllEmployeeLoginLinks,
  fetchAllUserRoles,
  fetchHRProfiles,
  fetchPendingAccessRequests,
  fetchRoleAuditLogs,
  HR_PRIVATE_IDLE_TIMEOUT_MS,
  isHrAdminEmail,
  lockHrAdminEmailSession,
  maskEmailForDisplay,
  rejectAccessRequest,
  reverifyGoogleSessionForUnlock,
  revokeUserRoleWithAudit,
  saveUserRoleWithAudit,
  signInHrAdminEmail,
  SYSTEM_ROLE_LABELS,
  VALID_SYSTEM_ROLES,
} from '../lib/hrService';
import { usePermissions } from '../lib/permissions';
import { useStore } from '../store/useStore';
import {
  AccessRequestDoc,
  HRProfile,
  RoleAuditDoc,
  SystemRole,
  UserRoleDoc,
} from '../types';

interface UnifiedRoleRow {
  email: string;
  displayName: string;
  position?: string;
  employeeId?: string;
  isLinkedEmployee: boolean;
  hasUserRoleDoc: boolean;
  currentRole: SystemRole;
  updatedAt: number;
  updatedBy: string;
}

export function getRoleBadgeStyle(role: SystemRole | string): string {
  switch (role) {
    case 'super':
      return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
    case 'executive':
      return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
    case 'hr':
      return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
    case 'supervisor':
      return 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800';
    case 'employee':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
    case 'rejected':
    case 'revoked':
      return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  }
}

export function formatRoleLabel(role: string): string {
  if (role in SYSTEM_ROLE_LABELS) {
    return SYSTEM_ROLE_LABELS[role as SystemRole];
  }
  if (role === 'pending_request') return 'คำขอสิทธิ์ใหม่';
  if (role === 'rejected') return 'ปฏิเสธคำขอ';
  if (role === 'revoked') return 'ถอนสิทธิ์';
  if (role === 'none') return 'ยังไม่มีสิทธิ์';
  return role || '-';
}

export function RoleManagementPage() {
  const { user, registeredUsers } = useStore();
  const {
    loading: permissionsLoading,
    manageRoles: isSuperAdminAccess,
    liveRole,
    isHrAdminUnlocked,
    authEmail,
  } = usePermissions();

  const [isGoogleRoleManuallyLocked, setIsGoogleRoleManuallyLocked] = useState<boolean>(false);
  const lastRoleActivityRef = useRef<number>(Date.now());

  const isFirebaseSuperVerified =
    !permissionsLoading &&
    isSuperAdminAccess &&
    liveRole === 'super' &&
    (isHrAdminUnlocked || !isGoogleRoleManuallyLocked);

  const googleLoginEmail =
    user?.authMethod === 'google' && user?.email ? user.email.trim().toLowerCase() : null;

  const [activeTab, setActiveTab] = useState<'manage' | 'audit'>('manage');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Inline HR Admin Unlock form state
  const [unlockEmail, setUnlockEmail] = useState<string>('');
  const [unlockPassword, setUnlockPassword] = useState<string>('');
  const [showUnlockPassword, setShowUnlockPassword] = useState<boolean>(false);
  const [unlockSubmitting, setUnlockSubmitting] = useState<boolean>(false);
  const [googleUnlockSubmitting, setGoogleUnlockSubmitting] = useState<boolean>(false);
  const [unlockErrorMsg, setUnlockErrorMsg] = useState<string | null>(null);

  const [userRolesMap, setUserRolesMap] = useState<Record<string, UserRoleDoc>>({});
  const [employeeLinksMap, setEmployeeLinksMap] = useState<Record<string, string>>({});
  const [hrProfilesMap, setHrProfilesMap] = useState<Record<string, HRProfile>>({});
  const [pendingRequests, setPendingRequests] = useState<AccessRequestDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<RoleAuditDoc[]>([]);

  // Draft role selections per email in the main table
  const [draftRoles, setDraftRoles] = useState<Record<string, SystemRole>>({});
  // Draft approval settings per email in the pending requests box (3 modes)
  const [requestModes, setRequestModes] = useState<Record<string, AccessRequestApproveMode>>({});
  const [requestDisplayNames, setRequestDisplayNames] = useState<Record<string, string>>({});
  const [requestTargetEmployeeIds, setRequestTargetEmployeeIds] = useState<Record<string, string>>({});
  const [requestRoles, setRequestRoles] = useState<Record<string, SystemRole>>({});
  // Saving indicator per email
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadAllData = useCallback(async () => {
    if (!isFirebaseSuperVerified) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const [rolesRes, pendingRes, auditRes, hrDocRes, linksRes] = await Promise.all([
        fetchAllUserRoles(),
        fetchPendingAccessRequests(),
        fetchRoleAuditLogs(),
        fetchHRProfiles().catch(() => ({ profiles: {} })),
        fetchAllEmployeeLoginLinks().catch(() => ({} as Record<string, string>)),
      ]);

      setUserRolesMap(rolesRes);
      setPendingRequests(pendingRes);
      setAuditLogs(auditRes);
      setHrProfilesMap(hrDocRes.profiles || {});
      setEmployeeLinksMap(linksRes);

      // Initialize draft state for pending requests
      setRequestModes((prev) => {
        const next = { ...prev };
        pendingRes.forEach((req) => {
          if (!next[req.email]) next[req.email] = 'new_employee';
        });
        return next;
      });
      setRequestDisplayNames((prev) => {
        const next = { ...prev };
        pendingRes.forEach((req) => {
          if (next[req.email] === undefined) {
            next[req.email] = (req.displayName || req.email.split('@')[0]).trim();
          }
        });
        return next;
      });
      setRequestRoles((prev) => {
        const next: Record<string, SystemRole> = { ...prev };
        pendingRes.forEach((req) => {
          if (!next[req.email]) {
            next[req.email] = 'employee';
          }
        });
        return next;
      });
    } catch (err: any) {
      console.error('Error loading role management data:', err);
      setErrorMsg(err?.message || 'ไม่สามารถโหลดข้อมูลการจัดการสิทธิ์ได้');
    } finally {
      setLoading(false);
    }
  }, [isFirebaseSuperVerified]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleLockAdminSession = useCallback(async (isAutoTimeout = false) => {
    await lockHrAdminEmailSession();
    setIsGoogleRoleManuallyLocked(true);
    setUserRolesMap({});
    setPendingRequests([]);
    setAuditLogs([]);
    setEmployeeLinksMap({});
    if (isAutoTimeout) {
      setUnlockErrorMsg('ล็อกหน้าจัดการสิทธิ์อัตโนมัติเนื่องจากไม่มีการใช้งานเกิน 1 ชั่วโมง');
    }
  }, []);

  // Auto-lock after 1 hour of inactivity when Role Management is unlocked
  useEffect(() => {
    if (!isFirebaseSuperVerified) return;

    lastRoleActivityRef.current = Date.now();
    const updateActivity = () => {
      lastRoleActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach((ev) => window.addEventListener(ev, updateActivity, { passive: true }));

    const timer = window.setInterval(() => {
      if (Date.now() - lastRoleActivityRef.current >= HR_PRIVATE_IDLE_TIMEOUT_MS) {
        handleLockAdminSession(true);
      }
    }, 15000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, updateActivity));
      window.clearInterval(timer);
    };
  }, [isFirebaseSuperVerified, handleLockAdminSession]);

  const handleUnlockWithGoogle = async () => {
    if (!googleLoginEmail) return;
    setGoogleUnlockSubmitting(true);
    setUnlockErrorMsg(null);
    try {
      await reverifyGoogleSessionForUnlock(googleLoginEmail);
      setIsGoogleRoleManuallyLocked(false);
      lastRoleActivityRef.current = Date.now();
    } catch (err: any) {
      const msg = err?.message || 'ไม่สามารถยืนยันตัวตนด้วย Google ได้';
      if (msg !== 'ยกเลิกการยืนยันตัวตนด้วย Google') {
        setUnlockErrorMsg(msg);
      }
    } finally {
      setGoogleUnlockSubmitting(false);
    }
  };

  const handleUnlockAdminSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockEmail.trim() || !unlockPassword) {
      setUnlockErrorMsg('กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน');
      return;
    }
    setUnlockSubmitting(true);
    setUnlockErrorMsg(null);
    try {
      await signInHrAdminEmail(unlockEmail.trim(), unlockPassword);
      setIsGoogleRoleManuallyLocked(false);
      lastRoleActivityRef.current = Date.now();
      setUnlockPassword('');
      setUnlockEmail('');
    } catch (err: any) {
      console.error('Role Management Admin verification failed:', err);
      setUnlockPassword('');
      const code = err?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-email'
      ) {
        setUnlockErrorMsg('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      } else if (code === 'auth/too-many-requests') {
        setUnlockErrorMsg('มีการลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่');
      } else {
        setUnlockErrorMsg('ไม่สามารถยืนยันตัวตนได้ กรุณาตรวจสอบอีเมลและรหัสผ่าน');
      }
    } finally {
      setUnlockSubmitting(false);
    }
  };

  // Build unified rows: linked employees + user_roles documents
  const unifiedRows = useMemo<UnifiedRoleRow[]>(() => {
    const map = new Map<string, UnifiedRoleRow>();

    // 1. Add all employees who have linked their Gmail
    for (const [employeeId, rawEmail] of Object.entries(employeeLinksMap)) {
      const email = (rawEmail || '').trim().toLowerCase();
      if (!email) continue;
      const hrProf = hrProfilesMap[employeeId];
      const regUser = registeredUsers.find((u) => u.uid === employeeId);
      const displayName =
        (hrProf?.fullName || '').trim() ||
        (regUser?.name || '').trim() ||
        employeeId;
      const nickname = (hrProf?.nickname || '').trim();
      const fullLabel = nickname ? `${displayName} (${nickname})` : displayName;
      const roleDoc = userRolesMap[email];

      map.set(email, {
        email,
        displayName: fullLabel,
        position: hrProf?.position || '',
        employeeId,
        isLinkedEmployee: true,
        hasUserRoleDoc: Boolean(roleDoc),
        currentRole: roleDoc ? roleDoc.role : 'employee',
        updatedAt: roleDoc?.updatedAt || 0,
        updatedBy: roleDoc?.updatedBy || '',
      });
    }

    // 2. Add or merge all documents in user_roles
    for (const [rawEmail, roleDoc] of Object.entries(userRolesMap)) {
      const email = rawEmail.trim().toLowerCase();
      if (!email) continue;
      const existing = map.get(email);
      if (existing) {
        map.set(email, {
          ...existing,
          hasUserRoleDoc: true,
          currentRole: roleDoc.role,
          updatedAt: roleDoc.updatedAt,
          updatedBy: roleDoc.updatedBy,
        });
      } else {
        const empId = roleDoc.employeeId;
        const hrProf = empId ? hrProfilesMap[empId] : undefined;
        const regUser = empId ? registeredUsers.find((u) => u.uid === empId) : undefined;
        const displayName =
          (roleDoc.displayName || '').trim() ||
          (hrProf?.fullName || '').trim() ||
          (regUser?.name || '').trim() ||
          email.split('@')[0];

        map.set(email, {
          email,
          displayName,
          position: hrProf?.position || '',
          employeeId: empId,
          isLinkedEmployee: Boolean(empId && employeeLinksMap[empId]?.toLowerCase() === email),
          hasUserRoleDoc: true,
          currentRole: roleDoc.role,
          updatedAt: roleDoc.updatedAt,
          updatedBy: roleDoc.updatedBy,
        });
      }
    }

    const rows = Array.from(map.values());
    rows.sort((a, b) => {
      // Sort super admins first, then by displayName
      if (a.currentRole === 'super' && b.currentRole !== 'super') return -1;
      if (a.currentRole !== 'super' && b.currentRole === 'super') return 1;
      return a.displayName.localeCompare(b.displayName, 'th');
    });
    return rows;
  }, [employeeLinksMap, hrProfilesMap, registeredUsers, userRolesMap]);

  // Synchronize draftRoles whenever unifiedRows updates
  useEffect(() => {
    const next: Record<string, SystemRole> = {};
    unifiedRows.forEach((r) => {
      next[r.email] = r.currentRole;
    });
    setDraftRoles(next);
  }, [unifiedRows]);

  const totalSuperAdmins = useMemo(() => {
    return countTotalSuperAdmins(userRolesMap);
  }, [userRolesMap]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return unifiedRows;
    return unifiedRows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        maskEmailForDisplay(r.email).toLowerCase().includes(q) ||
        SYSTEM_ROLE_LABELS[r.currentRole].toLowerCase().includes(q) ||
        (r.position || '').toLowerCase().includes(q)
    );
  }, [searchQuery, unifiedRows]);

  const handleSaveRole = async (row: UnifiedRoleRow) => {
    const selectedRole = draftRoles[row.email] || row.currentRole;
    setErrorMsg('');
    setSuccessMsg('');

    const currentActorEmail = (auth.currentUser?.email || authEmail || '').trim().toLowerCase();
    if (currentActorEmail && row.email === currentActorEmail) {
      setErrorMsg('ห้ามแก้สิทธิ์ของตัวเอง');
      return;
    }
    if (isHrAdminEmail(row.email)) {
      setErrorMsg('ห้ามแก้ไขหรือลบสิทธิ์ของอีเมลแอดมินหลัก');
      return;
    }
    if (row.currentRole === 'super' && selectedRole !== 'super' && totalSuperAdmins <= 2) {
      setErrorMsg('ห้ามเปลี่ยนหรือลบจนเหลือแอดมินสูงสุดน้อยกว่า 2 คน');
      return;
    }

    setSavingEmail(row.email);
    try {
      await saveUserRoleWithAudit({
        targetEmail: row.email,
        newRole: selectedRole,
        displayName: row.displayName,
        employeeId: row.employeeId,
        actorEmail: currentActorEmail || 'super_admin',
      });
      setSuccessMsg(
        `บันทึกสิทธิ์ "${SYSTEM_ROLE_LABELS[selectedRole]}" ให้ ${row.displayName} (${maskEmailForDisplay(row.email)}) เรียบร้อยแล้ว`
      );
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์');
    } finally {
      setSavingEmail(null);
    }
  };

  const handleRevokeRole = async (row: UnifiedRoleRow) => {
    setErrorMsg('');
    setSuccessMsg('');

    const currentActorEmail = (auth.currentUser?.email || authEmail || '').trim().toLowerCase();
    if (currentActorEmail && row.email === currentActorEmail) {
      setErrorMsg('ห้ามแก้สิทธิ์ของตัวเอง');
      return;
    }
    if (isHrAdminEmail(row.email)) {
      setErrorMsg('ห้ามลบอีเมลแอดมินหลัก');
      return;
    }
    if (row.currentRole === 'super' && totalSuperAdmins <= 2) {
      setErrorMsg('ห้ามเปลี่ยนหรือลบจนเหลือแอดมินสูงสุดน้อยกว่า 2 คน');
      return;
    }

    setSavingEmail(row.email);
    try {
      await revokeUserRoleWithAudit({
        targetEmail: row.email,
        actorEmail: currentActorEmail || 'super_admin',
      });
      setSuccessMsg(
        `ถอนสิทธิ์พิเศษของ ${row.displayName} (${maskEmailForDisplay(row.email)}) เรียบร้อยแล้ว`
      );
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'เกิดข้อผิดพลาดในการถอนสิทธิ์');
    } finally {
      setSavingEmail(null);
    }
  };

  // รายชื่อพนักงานเดิมที่ยังไม่ได้ผูก Gmail (สำหรับตัวเลือก ข. ผูกกับพนักงานเดิม)
  const unlinkedEmployees = useMemo(() => {
    return (registeredUsers || [])
      .filter((u) => {
        if (u.accountStatus === 'rejected') return false;
        if (hrProfilesMap[u.uid]?.notEmployee) return false;
        const hasLinkedGmail = Boolean(
          employeeLinksMap[u.uid] && employeeLinksMap[u.uid].trim()
        );
        return !hasLinkedGmail;
      })
      .map((u) => {
        const hrProf = hrProfilesMap[u.uid];
        const fullName = (hrProf?.fullName || '').trim();
        const nickname = (hrProf?.nickname || '').trim();
        const baseName = fullName || u.name || u.username || u.uid;
        const label = nickname ? `${baseName} (${nickname}) - ${u.username || u.uid}` : `${baseName} (${u.username || u.uid})`;
        return {
          uid: u.uid,
          name: fullName || u.name || u.uid,
          label,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'th'));
  }, [registeredUsers, hrProfilesMap, employeeLinksMap]);

  const handleApproveRequest = async (req: AccessRequestDoc) => {
    if (!isFirebaseSuperVerified) {
      setErrorMsg('กรุณายืนยันตัวตนแอดมินสูงสุดก่อนดำเนินการ');
      return;
    }

    const mode: AccessRequestApproveMode = requestModes[req.email] || 'new_employee';
    const rawRole = requestRoles[req.email];
    const selectedRole: SystemRole =
      mode === 'new_employee'
        ? rawRole === 'supervisor'
          ? 'supervisor'
          : 'employee'
        : mode === 'existing_employee'
        ? rawRole || 'employee'
        : rawRole && rawRole !== 'employee'
        ? rawRole
        : 'hr';

    const customName = (
      requestDisplayNames[req.email] ??
      req.displayName ??
      req.email.split('@')[0]
    ).trim();
    const selectedEmpId = (requestTargetEmployeeIds[req.email] || '').trim();

    if (mode === 'new_employee' && !customName) {
      setErrorMsg('กรุณากรอกชื่อที่แสดงสำหรับพนักงานใหม่');
      return;
    }
    if (mode === 'existing_employee' && !selectedEmpId) {
      setErrorMsg('กรุณาเลือกพนักงานเดิมที่ต้องการผูก Gmail');
      return;
    }

    const matchedEmp =
      mode === 'existing_employee'
        ? unlinkedEmployees.find((e) => e.uid === selectedEmpId)
        : undefined;
    const finalDisplayName =
      mode === 'existing_employee'
        ? matchedEmp?.name || req.displayName || req.email.split('@')[0]
        : customName;

    setErrorMsg('');
    setSuccessMsg('');
    setSavingEmail(req.email);
    try {
      const currentActorEmail = (auth.currentUser?.email || authEmail || '').trim().toLowerCase();
      const res = await approveAccessRequestBatch({
        mode,
        email: req.email,
        role: selectedRole,
        displayName: finalDisplayName,
        employeeId: mode === 'existing_employee' ? selectedEmpId : undefined,
        actorEmail: currentActorEmail || 'super_admin',
      });

      if (mode === 'new_employee') {
        setSuccessMsg(
          `สร้างบัญชีพนักงานใหม่ "${finalDisplayName}" (รหัส: ${res.employeeId || '-'}) ผูกกับ ${maskEmailForDisplay(
            req.email
          )} ด้วยสิทธิ์ "${SYSTEM_ROLE_LABELS[selectedRole]}" เรียบร้อยแล้ว`
        );
      } else if (mode === 'existing_employee') {
        setSuccessMsg(
          `ผูก ${maskEmailForDisplay(req.email)} กับพนักงานเดิม "${finalDisplayName}" (${selectedEmpId}) ด้วยสิทธิ์ "${SYSTEM_ROLE_LABELS[selectedRole]}" เรียบร้อยแล้ว`
        );
      } else {
        setSuccessMsg(
          `อนุมัติสิทธิ์อย่างเดียว "${SYSTEM_ROLE_LABELS[selectedRole]}" ให้ ${finalDisplayName} (${maskEmailForDisplay(
            req.email
          )}) เรียบร้อยแล้ว`
        );
      }
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'เกิดข้อผิดพลาดในการอนุมัติคำขอ');
    } finally {
      setSavingEmail(null);
    }
  };

  const handleRejectRequest = async (req: AccessRequestDoc) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSavingEmail(req.email);
    try {
      const currentActorEmail = (auth.currentUser?.email || authEmail || '').trim().toLowerCase();
      await rejectAccessRequest({
        email: req.email,
        actorEmail: currentActorEmail || 'super_admin',
      });
      setSuccessMsg(
        `ปฏิเสธคำขอสิทธิ์ของ ${req.displayName} (${maskEmailForDisplay(req.email)}) เรียบร้อยแล้ว`
      );
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ');
    } finally {
      setSavingEmail(null);
    }
  };

  if (permissionsLoading) {
    return (
      <div className="py-16 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (!isSuperAdminAccess) {
    return (
      <div className="max-w-3xl mx-auto my-12 p-8 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          เฉพาะแอดมินสูงสุดเท่านั้น
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          หน้านี้เปิดให้เฉพาะแอดมิน HR ที่ปลดล็อกยืนยันตัวตนแล้ว หรือผู้ใช้ที่มีสิทธิ์ &ldquo;แอดมินสูงสุด (super)&rdquo; ที่ล็อกอินด้วย Google เท่านั้น
        </p>
      </div>
    );
  }

  if (!isFirebaseSuperVerified) {
    return (
      <div className="max-w-md mx-auto my-10 p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-amber-300 dark:border-amber-800 shadow-sm space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              ยืนยันตัวตนแอดมินเพื่อจัดการสิทธิ์
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {googleLoginEmail
                ? 'กดยืนยันตัวตนด้วยบัญชี Google ที่ล็อกอินอยู่ หรือใช้อีเมลแอดมิน HR'
                : 'เข้าสู่ระบบด้วยอีเมลแอดมินที่ได้รับสิทธิ์ (ไม่จำรหัสผ่านในเครื่อง)'}
            </p>
          </div>
        </div>

        {googleLoginEmail && (
          <div className="space-y-2.5 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleUnlockWithGoogle}
              disabled={googleUnlockSubmitting || unlockSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="w-5 h-5 rounded-md bg-white flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              </span>
              <span>
                {googleUnlockSubmitting
                  ? 'กำลังยืนยันด้วย Google...'
                  : `ยืนยันด้วย Google (${maskEmailForDisplay(googleLoginEmail)})`}
              </span>
            </button>
            <p className="text-[11px] text-zinc-400 text-center">
              หรือใช้ช่องกรอกอีเมลแอดมิน + รหัสผ่านด้านล่าง (ทางสำรองสำหรับคนที่เข้าด้วย PIN)
            </p>
          </div>
        )}

        <form onSubmit={handleUnlockAdminSession} className="space-y-3.5 text-xs" autoComplete="off">
          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              อีเมลแอดมิน HR
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={unlockEmail}
                onChange={(e) => setUnlockEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              รหัสผ่าน
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showUnlockPassword ? 'text' : 'password'}
                required
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านอีเมลแอดมิน"
                className="w-full pl-9 pr-9 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={() => setShowUnlockPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                tabIndex={-1}
              >
                {showUnlockPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {unlockErrorMsg && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{unlockErrorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={unlockSubmitting || googleUnlockSubmitting}
            className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <KeyRound className="w-4 h-4" />
            <span>{unlockSubmitting ? 'กำลังตรวจสอบ...' : 'ยืนยันตัวตนด้วยอีเมลแอดมิน'}</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  จัดการสิทธิ์ผู้ใช้งาน (Role Management)
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  แอดมินสูงสุดทั้งหมด: {totalSuperAdmins} คน (รวมแอดมินหลัก 1 คน)
                </span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                กำหนดสิทธิ์ให้กับพนักงานที่ผูก Gmail และอนุมัติคำขอสิทธิ์เข้าใช้งานใหม่ (ระบบบังคับมีแอดมินสูงสุดอย่างน้อย 2 คนเสมอ และห้ามแก้สิทธิ์ของตัวเอง)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              type="button"
              onClick={() => handleLockAdminSession(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              ล็อกสิทธิ์แอดมิน
            </button>
            <button
              type="button"
              onClick={loadAllData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรชข้อมูล
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('manage')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'manage'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>จัดการสิทธิ์ & คำขอใหม่</span>
            {pendingRequests.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-md text-xs font-bold ${
                  activeTab === 'manage'
                    ? 'bg-white text-purple-700'
                    : 'bg-rose-500 text-white'
                }`}
              >
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'audit'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            <History className="w-4 h-4" />
            <span>ประวัติการเปลี่ยนสิทธิ์</span>
            <span className="text-xs opacity-75">({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Status Alerts */}
      {errorMsg && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-medium">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'manage' ? (
        <div className="space-y-6">
          {/* Box: คำขอสิทธิ์ใหม่ (access_requests status == 'pending') */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      คำขอสิทธิ์ใหม่
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                        pendingRequests.length > 0
                          ? 'bg-rose-500 text-white'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {pendingRequests.length} รายการ
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    ผู้ใช้ที่ล็อกอินด้วย Google แต่ยังไม่ได้ผูกกับพนักงานและยังไม่มีสิทธิ์ในระบบ
                  </p>
                </div>
              </div>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-500 dark:text-zinc-400">
                ไม่มีคำขอสิทธิ์ใหม่ที่รออนุมัติ
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                {pendingRequests.map((req) => {
                  const isSelf = Boolean(authEmail && req.email === authEmail);
                  const isBusy = savingEmail === req.email;
                  const mode: AccessRequestApproveMode = requestModes[req.email] || 'new_employee';
                  const customName =
                    requestDisplayNames[req.email] !== undefined
                      ? requestDisplayNames[req.email]
                      : req.displayName || req.email.split('@')[0];
                  const selectedEmpId = requestTargetEmployeeIds[req.email] || '';
                  const rawRole = requestRoles[req.email];
                  const selectedRole: SystemRole =
                    mode === 'new_employee'
                      ? rawRole === 'supervisor'
                        ? 'supervisor'
                        : 'employee'
                      : mode === 'existing_employee'
                      ? rawRole || 'employee'
                      : rawRole && rawRole !== 'employee'
                      ? rawRole
                      : 'hr';

                  const localPart = (req.email.split('@')[0] || 'user')
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '') || 'user';

                  return (
                    <div
                      key={req.email}
                      className="p-4 space-y-3.5 bg-amber-50/30 dark:bg-amber-950/10"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {req.photoURL ? (
                            <img
                              src={req.photoURL}
                              alt={req.displayName}
                              className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 flex items-center justify-center font-bold text-sm">
                              {(req.displayName || req.email).slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                              {req.displayName}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                              {maskEmailForDisplay(req.email)}
                            </div>
                            {req.createdAt > 0 && (
                              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                <span>
                                  ขอเมื่อ {new Date(req.createdAt).toLocaleString('th-TH')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ตัวเลือก 3 รูปแบบการอนุมัติ */}
                        <div className="inline-flex flex-wrap gap-1.5 bg-white dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
                          <button
                            type="button"
                            disabled={isBusy || isSelf}
                            onClick={() => {
                              setRequestModes((prev) => ({ ...prev, [req.email]: 'new_employee' }));
                              setRequestRoles((prev) => ({
                                ...prev,
                                [req.email]:
                                  prev[req.email] === 'supervisor' ? 'supervisor' : 'employee',
                              }));
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              mode === 'new_employee'
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                            }`}
                          >
                            ก. พนักงานใหม่
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || isSelf}
                            onClick={() => {
                              setRequestModes((prev) => ({
                                ...prev,
                                [req.email]: 'existing_employee',
                              }));
                              setRequestRoles((prev) => ({
                                ...prev,
                                [req.email]: prev[req.email] || 'employee',
                              }));
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              mode === 'existing_employee'
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                            }`}
                          >
                            ข. ผูกกับพนักงานเดิม
                          </button>
                          <button
                            type="button"
                            disabled={isBusy || isSelf}
                            onClick={() => {
                              setRequestModes((prev) => ({ ...prev, [req.email]: 'role_only' }));
                              setRequestRoles((prev) => ({
                                ...prev,
                                [req.email]:
                                  prev[req.email] && prev[req.email] !== 'employee'
                                    ? prev[req.email]
                                    : 'hr',
                              }));
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              mode === 'role_only'
                                ? 'bg-purple-600 text-white shadow-2xs'
                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                            }`}
                          >
                            ค. สิทธิ์อย่างเดียว (HR/ผู้บริหาร/super)
                          </button>
                        </div>
                      </div>

                      {/* ฟอร์มตามรูปแบบที่เลือก */}
                      <div className="pt-2 border-t border-amber-200/60 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {mode === 'new_employee' && (
                            <>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                  ชื่อพนักงานที่แสดง (รหัสอัตโนมัติ: emp_{localPart})
                                </label>
                                <input
                                  type="text"
                                  value={customName}
                                  disabled={isBusy || isSelf}
                                  onChange={(e) =>
                                    setRequestDisplayNames((prev) => ({
                                      ...prev,
                                      [req.email]: e.target.value,
                                    }))
                                  }
                                  placeholder="กรอกชื่อ-นามสกุล หรือชื่อเล่น"
                                  className="w-full px-3 py-1.5 rounded-xl text-xs border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                  ระดับสิทธิ์เริ่มต้น
                                </label>
                                <select
                                  value={selectedRole}
                                  disabled={isBusy || isSelf}
                                  onChange={(e) =>
                                    setRequestRoles((prev) => ({
                                      ...prev,
                                      [req.email]: e.target.value as SystemRole,
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                  <option value="employee">
                                    {SYSTEM_ROLE_LABELS.employee} (employee)
                                  </option>
                                  <option value="supervisor">
                                    {SYSTEM_ROLE_LABELS.supervisor} (supervisor)
                                  </option>
                                </select>
                              </div>
                            </>
                          )}

                          {mode === 'existing_employee' && (
                            <>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                  เลือกพนักงานเดิมที่ยังไม่ได้ผูก Gmail ({unlinkedEmployees.length} คน)
                                </label>
                                <select
                                  value={selectedEmpId}
                                  disabled={isBusy || isSelf}
                                  onChange={(e) =>
                                    setRequestTargetEmployeeIds((prev) => ({
                                      ...prev,
                                      [req.email]: e.target.value,
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                  <option value="">-- เลือกพนักงานเดิม --</option>
                                  {unlinkedEmployees.map((emp) => (
                                    <option key={emp.uid} value={emp.uid}>
                                      {emp.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                  ระดับสิทธิ์ในระบบ
                                </label>
                                <select
                                  value={selectedRole}
                                  disabled={isBusy || isSelf}
                                  onChange={(e) =>
                                    setRequestRoles((prev) => ({
                                      ...prev,
                                      [req.email]: e.target.value as SystemRole,
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                  {VALID_SYSTEM_ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {SYSTEM_ROLE_LABELS[r]} ({r})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}

                          {mode === 'role_only' && (
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                เลือกสิทธิ์อย่างเดียว (ไม่สร้างและไม่ผูกบัญชีพนักงานคิวงาน)
                              </label>
                              <select
                                value={selectedRole}
                                disabled={isBusy || isSelf}
                                onChange={(e) =>
                                  setRequestRoles((prev) => ({
                                    ...prev,
                                    [req.email]: e.target.value as SystemRole,
                                  }))
                                }
                                className="w-full sm:w-72 px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                              >
                                {(['hr', 'executive', 'super', 'supervisor'] as const).map((r) => (
                                  <option key={r} value={r}>
                                    {SYSTEM_ROLE_LABELS[r]} ({r})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={
                              isBusy ||
                              isSelf ||
                              (mode === 'new_employee' && !customName.trim()) ||
                              (mode === 'existing_employee' && !selectedEmpId)
                            }
                            onClick={() => handleApproveRequest(req)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>อนุมัติ</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRejectRequest(req)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>ปฏิเสธ</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Table: พนักงานที่ผูก Gmail แล้วทั้งหมด + คนที่มี user_roles */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  รายชื่อผู้ใช้งานและสิทธิ์ ({filteredRows.length} คน)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  แสดงพนักงานที่ผูก Gmail แล้วทั้งหมด (ค่าเริ่มต้น = พนักงาน) และผู้ที่มีเอกสารใน user_roles
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อ หรือ Gmail..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/70 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    <th className="py-3 px-4">ชื่อพนักงาน / ผู้ใช้</th>
                    <th className="py-3 px-4">Gmail (ปิดบางส่วน)</th>
                    <th className="py-3 px-4">ประเภทบัญชี</th>
                    <th className="py-3 px-4">สิทธิ์ปัจจุบัน</th>
                    <th className="py-3 px-4">เลือกสิทธิ์</th>
                    <th className="py-3 px-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-zinc-500 text-xs">
                        กำลังโหลดข้อมูลสิทธิ์ผู้ใช้งาน...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-zinc-500 text-xs">
                        ไม่พบรายชื่อผู้ใช้งานที่ผูก Gmail หรือมีสิทธิ์ในระบบ
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const isSelf = Boolean(authEmail && row.email === authEmail);
                      const isPrimaryAdmin = isHrAdminEmail(row.email);
                      const isBusy = savingEmail === row.email;
                      const draftRole = draftRoles[row.email] || row.currentRole;
                      const isDirty = draftRole !== row.currentRole || !row.hasUserRoleDoc;
                      const wouldDropBelowMinSuper =
                        row.currentRole === 'super' &&
                        draftRole !== 'super' &&
                        totalSuperAdmins <= 2;

                      return (
                        <tr
                          key={row.email}
                          className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {row.displayName}
                            </div>
                            {row.position && (
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {row.position}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                            {maskEmailForDisplay(row.email)}
                          </td>

                          <td className="py-3 px-4">
                            {row.isLinkedEmployee ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800">
                                ผูกกับพนักงานแล้ว
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                                บัญชีสิทธิ์เฉพาะ (user_roles)
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${getRoleBadgeStyle(
                                row.currentRole
                              )}`}
                            >
                              {SYSTEM_ROLE_LABELS[row.currentRole]}
                            </span>
                            {!row.hasUserRoleDoc && (
                              <span className="ml-1.5 text-[11px] text-zinc-400">
                                (ค่าเริ่มต้น)
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <select
                              value={draftRole}
                              disabled={isBusy || isSelf || isPrimaryAdmin}
                              onChange={(e) =>
                                setDraftRoles((prev) => ({
                                  ...prev,
                                  [row.email]: e.target.value as SystemRole,
                                }))
                              }
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                            >
                              {VALID_SYSTEM_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {SYSTEM_ROLE_LABELS[r]} ({r})
                                </option>
                              ))}
                            </select>
                            {wouldDropBelowMinSuper && (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                                ต้องมีแอดมินสูงสุดอย่างน้อย 2 คน
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            {isSelf ? (
                              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                บัญชีของคุณ (ห้ามแก้สิทธิ์ตัวเอง)
                              </span>
                            ) : isPrimaryAdmin ? (
                              <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                                แอดมินหลัก (ห้ามแก้ไข/ลบ)
                              </span>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    isBusy ||
                                    !isDirty ||
                                    wouldDropBelowMinSuper
                                  }
                                  onClick={() => handleSaveRole(row)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-colors disabled:opacity-40"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>บันทึก</span>
                                </button>

                                {!row.isLinkedEmployee && row.hasUserRoleDoc && (
                                  <button
                                    type="button"
                                    disabled={
                                      isBusy ||
                                      (row.currentRole === 'super' && totalSuperAdmins <= 2)
                                    }
                                    onClick={() => handleRevokeRole(row)}
                                    title="ถอนสิทธิ์"
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-40"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>ถอนสิทธิ์</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: ประวัติการเปลี่ยนสิทธิ์ (role_audit) */
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              ประวัติการเปลี่ยนสิทธิ์ (Role Audit Log)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              บันทึกทุกครั้งที่มีการให้ เปลี่ยน หรือถอนสิทธิ์ผู้ใช้งาน (อ่านอย่างเดียว แก้ไขหรือลบไม่ได้)
            </p>
          </div>

          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/70 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  <th className="py-3 px-4">วัน-เวลา</th>
                  <th className="py-3 px-4">อีเมลเป้าหมาย</th>
                  <th className="py-3 px-4">จากสิทธิ์เดิม</th>
                  <th className="py-3 px-4">เป็นสิทธิ์ใหม่</th>
                  <th className="py-3 px-4">ดำเนินการโดย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-zinc-500 text-xs">
                      กำลังโหลดประวัติการเปลี่ยนสิทธิ์...
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-zinc-500 text-xs">
                      ยังไม่มีประวัติการเปลี่ยนสิทธิ์
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log, idx) => (
                    <tr
                      key={log.id || `${log.targetEmail}_${log.at}_${idx}`}
                      className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40"
                    >
                      <td className="py-3 px-4 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {log.at ? new Date(log.at).toLocaleString('th-TH') : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                        {maskEmailForDisplay(log.targetEmail)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${getRoleBadgeStyle(
                            log.fromRole
                          )}`}
                        >
                          {formatRoleLabel(log.fromRole)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${getRoleBadgeStyle(
                            log.toRole
                          )}`}
                        >
                          {formatRoleLabel(log.toRole)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {maskEmailForDisplay(log.byEmail)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
