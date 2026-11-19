import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
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
  approveAccessRequestWithRole,
  countTotalSuperAdmins,
  fetchAllEmployeeLoginLinks,
  fetchAllUserRoles,
  fetchHRProfiles,
  fetchPendingAccessRequests,
  fetchRoleAuditLogs,
  isHrAdminAuthUser,
  isHrAdminEmail,
  maskEmailForDisplay,
  rejectAccessRequest,
  revokeUserRoleWithAudit,
  saveUserRoleWithAudit,
  SYSTEM_ROLE_LABELS,
  VALID_SYSTEM_ROLES,
} from '../lib/hrService';
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
  const [activeTab, setActiveTab] = useState<'manage' | 'audit'>('manage');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const [authEmail, setAuthEmail] = useState<string>('');
  const [isHrAdminUnlocked, setIsHrAdminUnlocked] = useState<boolean>(false);

  const [userRolesMap, setUserRolesMap] = useState<Record<string, UserRoleDoc>>({});
  const [employeeLinksMap, setEmployeeLinksMap] = useState<Record<string, string>>({});
  const [hrProfilesMap, setHrProfilesMap] = useState<Record<string, HRProfile>>({});
  const [pendingRequests, setPendingRequests] = useState<AccessRequestDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<RoleAuditDoc[]>([]);

  // Draft role selections per email in the main table
  const [draftRoles, setDraftRoles] = useState<Record<string, SystemRole>>({});
  // Draft role selections per email in the pending requests box
  const [requestRoles, setRequestRoles] = useState<Record<string, SystemRole>>({});
  // Saving indicator per email
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setIsHrAdminUnlocked(isHrAdminAuthUser(fbUser));
      setAuthEmail((fbUser?.email || user?.email || '').trim().toLowerCase());
    });
    return () => unsub();
  }, [user?.email]);

  const isSuperAdminAccess = useMemo(() => {
    if (isHrAdminUnlocked) return true;
    if (user?.authMethod === 'google' && user?.systemRole === 'super') return true;
    return false;
  }, [isHrAdminUnlocked, user?.authMethod, user?.systemRole]);

  const loadAllData = useCallback(async () => {
    if (!isSuperAdminAccess) {
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

      // Initialize draft role selections for pending requests
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
  }, [isSuperAdminAccess]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

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

  const handleApproveRequest = async (req: AccessRequestDoc) => {
    const selectedRole = requestRoles[req.email] || 'employee';
    setErrorMsg('');
    setSuccessMsg('');
    setSavingEmail(req.email);
    try {
      const currentActorEmail = (auth.currentUser?.email || authEmail || '').trim().toLowerCase();
      await approveAccessRequestWithRole({
        email: req.email,
        role: selectedRole,
        displayName: req.displayName,
        actorEmail: currentActorEmail || 'super_admin',
      });
      setSuccessMsg(
        `อนุมัติคำขอของ ${req.displayName} (${maskEmailForDisplay(req.email)}) ด้วยสิทธิ์ "${SYSTEM_ROLE_LABELS[selectedRole]}" เรียบร้อยแล้ว`
      );
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
                  const selectedRole = requestRoles[req.email] || 'employee';

                  return (
                    <div
                      key={req.email}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-50/30 dark:bg-amber-950/10"
                    >
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

                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={selectedRole}
                          disabled={isBusy || isSelf}
                          onChange={(e) =>
                            setRequestRoles((prev) => ({
                              ...prev,
                              [req.email]: e.target.value as SystemRole,
                            }))
                          }
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          {VALID_SYSTEM_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {SYSTEM_ROLE_LABELS[r]} ({r})
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={isBusy || isSelf}
                          onClick={() => handleApproveRequest(req)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>อนุมัติ</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRejectRequest(req)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>ปฏิเสธ</span>
                        </button>
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
