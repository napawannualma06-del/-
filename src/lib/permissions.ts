import { useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseAuthUser } from 'firebase/auth';
import { auth } from './firebase';
import {
  fetchUserRoleByEmail,
  isEmployeeGoogleAuthUser,
  isHrAdminAuthUser,
  isHrAdminEmail,
  signOutEmployeeGoogleSession,
} from './hrService';
import { isUserAdmin, useStore } from '../store/useStore';
import { SystemRole, UserProfile } from '../types';

export interface LiveAuthRoleState {
  loading: boolean;
  fbUser: FirebaseAuthUser | null;
  isHrAdminUnlocked: boolean;
  isGoogleAuthActive: boolean;
  authEmail: string;
  liveGoogleRole: SystemRole;
}

let currentState: LiveAuthRoleState = {
  loading: true,
  fbUser: auth.currentUser,
  isHrAdminUnlocked: isHrAdminAuthUser(auth.currentUser),
  isGoogleAuthActive: isEmployeeGoogleAuthUser(auth.currentUser),
  authEmail: (auth.currentUser?.email || '').trim().toLowerCase(),
  liveGoogleRole: 'employee',
};

const listeners = new Set<(state: LiveAuthRoleState) => void>();
let isInitialized = false;
let fetchSeq = 0;
let isSigningOutMismatchedGoogle = false;

function signOutMismatchedGoogleSessionOnce() {
  if (isSigningOutMismatchedGoogle) return;
  isSigningOutMismatchedGoogle = true;
  signOutEmployeeGoogleSession().finally(() => {
    isSigningOutMismatchedGoogle = false;
  });
}

function notifyListeners() {
  listeners.forEach((fn) => fn(currentState));
}

async function refreshLiveAuthRole(fbUser: FirebaseAuthUser | null) {
  const seq = ++fetchSeq;
  const hrUnlocked = isHrAdminAuthUser(fbUser);
  const googleActive = isEmployeeGoogleAuthUser(fbUser);
  const email = (fbUser?.email || '').trim().toLowerCase();

  if (googleActive && email) {
    if (isHrAdminEmail(email)) {
      if (seq !== fetchSeq) return;
      currentState = {
        loading: false,
        fbUser,
        isHrAdminUnlocked: hrUnlocked,
        isGoogleAuthActive: true,
        authEmail: email,
        liveGoogleRole: 'super',
      };
    } else {
      try {
        const roleDoc = await fetchUserRoleByEmail(email);
        if (seq !== fetchSeq) return;
        currentState = {
          loading: false,
          fbUser,
          isHrAdminUnlocked: hrUnlocked,
          isGoogleAuthActive: true,
          authEmail: email,
          liveGoogleRole: roleDoc?.role || 'employee',
        };
      } catch {
        if (seq !== fetchSeq) return;
        currentState = {
          loading: false,
          fbUser,
          isHrAdminUnlocked: hrUnlocked,
          isGoogleAuthActive: true,
          authEmail: email,
          liveGoogleRole: 'employee',
        };
      }
    }
  } else {
    if (seq !== fetchSeq) return;
    currentState = {
      loading: false,
      fbUser,
      isHrAdminUnlocked: hrUnlocked,
      isGoogleAuthActive: false,
      authEmail: email,
      liveGoogleRole: 'employee',
    };
  }
  notifyListeners();
}

function ensureAuthRoleSubscription() {
  if (isInitialized) return;
  isInitialized = true;

  onAuthStateChanged(auth, (fbUser) => {
    refreshLiveAuthRole(fbUser);
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('role-access-requests-updated', () => {
      refreshLiveAuthRole(auth.currentUser);
    });
  }
}

export interface PermissionsResult {
  loading: boolean;
  isLegacyAdmin: boolean;
  isHrAdminUnlocked: boolean;
  isGoogleAuthActive: boolean;
  authEmail: string;
  /**
   * ระดับสิทธิ์สดจาก Firebase Auth + user_roles/{email} (ถ้าหลุด Google session หรืออ่านไม่ได้ = 'employee')
   */
  liveRole: SystemRole;
  /**
   * ป้ายสิทธิ์ที่แสดงมุมขวาบนข้างชื่อ
   */
  effectiveSystemRole: SystemRole;
  /**
   * กฎรวม: can(roles) = isUserAdmin(user) || isHrAdminAuthUser(fbUser) || liveRole อยู่ใน roles
   */
  can: (allowedRoles: readonly SystemRole[]) => boolean;

  // ตารางสิทธิ์ตามข้อ 2
  viewAdminDashboard: boolean;
  manageCases: boolean;
  viewOTAdmin: boolean;
  approveOT: boolean;
  viewShiftsAdmin: boolean;
  manageShifts: boolean;
  viewAdvanceAdmin: boolean;
  approveAdvance: boolean;
  viewHRPrivate: boolean;
  editHRPrivate: boolean;
  manageUsers: boolean;
  manageRoles: boolean;
  manageApiIntegration: boolean;
  viewAllTechnicalIssues: boolean;
  manageTechnicalIssues: boolean;
  canAccessHRPage: boolean;

  // ช่วยเช็คการปลดล็อกหน้า HR / เงินเดือน ด้วย Google ตามข้อ 3
  canAutoUnlockHRByGoogle: boolean;
  isExecutiveReadOnly: boolean;
  refreshPermissions: () => Promise<void>;
}

export function computePermissions(
  user: UserProfile | null | undefined,
  authState: LiveAuthRoleState
): PermissionsResult {
  const isLegacyAdmin = isUserAdmin(user);
  const { isHrAdminUnlocked, isGoogleAuthActive, authEmail, liveGoogleRole, loading } = authState;

  const userStoreEmail = (user?.email || '').trim().toLowerCase();
  const isMatchingGoogleUser = Boolean(
    user &&
      user.authMethod === 'google' &&
      isGoogleAuthActive &&
      userStoreEmail &&
      authEmail &&
      userStoreEmail === authEmail
  );

  // ถ้ามี user ล็อกอินอยู่ใน store (เช่น ล็อกอินด้วย PIN หรือเป็นคนละบัญชี) แต่มี Google session ของคนอื่นค้างอยู่ใน Firebase Auth
  // ให้สั่ง signOut ของ Google session นั้นทิ้ง เพื่อไม่ให้ฐานข้อมูลเห็นเป็นคนนั้น
  if (user && isGoogleAuthActive && !isMatchingGoogleUser) {
    signOutMismatchedGoogleSessionOnce();
  }

  const resolvedGoogleRole: SystemRole =
    isMatchingGoogleUser && isHrAdminEmail(authEmail) ? 'super' : liveGoogleRole;

  // ห้ามเชื่อ user.systemRole ใน localStorage: ใช้ liveGoogleRole ได้เฉพาะเมื่อ user.authMethod === 'google' และอีเมลตรงกับ authEmail เท่านั้น
  const liveRole: SystemRole = isHrAdminUnlocked
    ? 'super'
    : isMatchingGoogleUser
    ? resolvedGoogleRole
    : 'employee';

  const effectiveSystemRole: SystemRole = isHrAdminUnlocked
    ? 'super'
    : isMatchingGoogleUser
    ? resolvedGoogleRole
    : isLegacyAdmin
    ? 'super'
    : 'employee';

  const can = (allowedRoles: readonly SystemRole[]): boolean => {
    if (isLegacyAdmin || isHrAdminUnlocked) return true;
    return allowedRoles.includes(liveRole);
  };

  // 1. viewAdminDashboard (แดชบอร์ดเคส/ปัญหาเทคนิค): supervisor, executive(ดูอย่างเดียว), super
  const viewAdminDashboard = can(['supervisor', 'executive', 'super']);

  // 2. manageCases (ลบ/โอน/แก้เคสใน Queue, CreditCheckDutyStation, AdminDashboard): supervisor, super
  const manageCases = can(['supervisor', 'super']);

  // 3. approveOT + แก้วันที่ OT + ตารางกะ: supervisor, hr, super; executive ดูได้แต่ไม่มีปุ่มอนุมัติ/แก้
  const viewOTAdmin = can(['supervisor', 'hr', 'executive', 'super']);
  const approveOT = can(['supervisor', 'hr', 'super']);
  const viewShiftsAdmin = can(['supervisor', 'hr', 'executive', 'super']);
  const manageShifts = can(['supervisor', 'hr', 'super']);

  // 4. approveAdvance + แนบสลิปโอน: hr, super; executive ดูอย่างเดียว
  const viewAdvanceAdmin = can(['hr', 'executive', 'super']);
  const approveAdvance = can(['hr', 'super']);

  // 5. viewHRPrivate / payroll / 50 ทวิ / สรุปรายปี: hr, super เขียนได้; executive ดูอย่างเดียว ไม่มีปุ่มบันทึก/ยืนยัน/ลบ
  const viewHRPrivate = can(['hr', 'executive', 'super']);
  const editHRPrivate = can(['hr', 'super']);

  // 6. manageUsers (แท็บจัดการพนักงาน, UserManagementModal, อนุมัติผู้สมัคร, รีเซ็ตรหัส, EmployeeQRModal ส่วนแอดมิน, ChangePasswordModal ส่วนแอดมิน): hr, super
  const manageUsers = can(['hr', 'super']);

  // 7. manageRoles (/roles) และ AdminApiIntegration (API key): super เท่านั้น
  const manageRoles = can(['super']);
  const manageApiIntegration = can(['super']);

  // 8. TechnicalIssueModal ส่วนแอดมิน (บันทึกแอดมิน/เปลี่ยนสถานะ): supervisor, super
  const viewAllTechnicalIssues = can(['supervisor', 'executive', 'super']);
  const manageTechnicalIssues = can(['supervisor', 'super']);

  // 9. HRPage: เข้าได้ถ้ามีสิทธิ์อย่างน้อย 1 แท็บ
  const canAccessHRPage =
    viewHRPrivate || viewShiftsAdmin || viewOTAdmin || viewAdvanceAdmin || manageUsers;

  // ข้อ 3: คนที่เข้าด้วย Google (user.authMethod === 'google' และอีเมลตรงกับ authEmail) และมีสิทธิ์ hr, super หรือ executive ให้ปลดล็อกหน้า HR/เงินเดือนได้โดยไม่ต้องใส่รหัสผ่านแอดมิน
  const canAutoUnlockHRByGoogle =
    isMatchingGoogleUser &&
    (resolvedGoogleRole === 'hr' ||
      resolvedGoogleRole === 'super' ||
      resolvedGoogleRole === 'executive');

  const isExecutiveReadOnly =
    !isLegacyAdmin && !isHrAdminUnlocked && liveRole === 'executive';

  return {
    loading,
    isLegacyAdmin,
    isHrAdminUnlocked,
    isGoogleAuthActive,
    authEmail,
    liveRole,
    effectiveSystemRole,
    can,
    viewAdminDashboard,
    manageCases,
    viewOTAdmin,
    approveOT,
    viewShiftsAdmin,
    manageShifts,
    viewAdvanceAdmin,
    approveAdvance,
    viewHRPrivate,
    editHRPrivate,
    manageUsers,
    manageRoles,
    manageApiIntegration,
    viewAllTechnicalIssues,
    manageTechnicalIssues,
    canAccessHRPage,
    canAutoUnlockHRByGoogle,
    isExecutiveReadOnly,
    refreshPermissions: () => refreshLiveAuthRole(auth.currentUser),
  };
}

/**
 * สำหรับเรียกเช็คสิทธิ์นอก React Component (เช่น ใน useStore actions)
 */
export function getCurrentPermissions(user?: UserProfile | null): PermissionsResult {
  ensureAuthRoleSubscription();
  const resolvedUser = user !== undefined ? user : useStore.getState().user;
  return computePermissions(resolvedUser, currentState);
}

/**
 * React Hook สำหรับเช็คสิทธิ์สดจาก Firebase Auth (Google) + user_roles/{email} + แอดมินเดิม
 */
export function usePermissions(): PermissionsResult {
  ensureAuthRoleSubscription();
  const user = useStore((s) => s.user);
  const [authState, setAuthState] = useState<LiveAuthRoleState>(currentState);

  useEffect(() => {
    ensureAuthRoleSubscription();
    setAuthState(currentState);
    const listener = (nextState: LiveAuthRoleState) => {
      setAuthState(nextState);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return computePermissions(user, authState);
}
