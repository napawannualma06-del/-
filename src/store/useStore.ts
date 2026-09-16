import { create } from 'zustand';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';

export type Role = 'employee' | 'admin';

export const SUPER_ADMIN_USERNAME = 'gametpl';
export const SUPER_ADMIN_PIN = 'gametpl';
export const SUPER_ADMIN_NAME = 'คุณเกม (แอดมินสูงสุด)';

export interface UserProfile {
  uid: string;
  username: string;
  name: string;
  role: Role;
  pin?: string;
  email?: string;
  fcmToken?: string;
  createdAt: number;
}

interface AppState {
  user: UserProfile | null;
  loading: boolean;
  isDarkMode: boolean;
  registeredUsers: UserProfile[];
  toggleDarkMode: () => void;
  fetchRegisteredUsers: () => Promise<void>;
  loginWithUsername: (username: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  registerEmployee: (name: string, username: string, pin?: string) => Promise<{ success: boolean; message?: string }>;
  setUserDirectly: (profile: UserProfile) => void;
  logout: () => Promise<void>;
  initAuth: () => Promise<void>;
}

const STORAGE_KEY = 'qmanage_current_user_v2';
const THEME_KEY = 'qmanage_theme_mode';

const initialDark = (() => {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem(THEME_KEY);
  if (saved !== null) {
    return saved === 'dark';
  }
  // Default to Light Mode on first visit as requested by user
  return false;
})();

if (typeof document !== 'undefined') {
  if (initialDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  loading: true,
  isDarkMode: initialDark,
  registeredUsers: [],

  toggleDarkMode: () => {
    const nextDark = !get().isDarkMode;
    if (typeof document !== 'undefined') {
      if (nextDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    localStorage.setItem(THEME_KEY, nextDark ? 'dark' : 'light');
    set({ isDarkMode: nextDark });
  },

  fetchRegisteredUsers: async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      let foundAdmin = false;
      snap.forEach((d) => {
        const data = d.data() as UserProfile;
        const isGametpl = data.username?.toLowerCase() === SUPER_ADMIN_USERNAME || d.id === 'admin_gametpl';
        if (isGametpl) {
          foundAdmin = true;
          list.push({ 
            ...data, 
            uid: d.id, 
            username: SUPER_ADMIN_USERNAME,
            name: data.name || SUPER_ADMIN_NAME,
            role: 'admin', 
            pin: SUPER_ADMIN_PIN 
          });
        } else {
          // Only gametpl is allowed to be admin as requested
          list.push({ ...data, uid: d.id, role: 'employee' });
        }
      });

      // Ensure gametpl is always in the registered list for easy admin access
      if (!foundAdmin) {
        const adminProfile: UserProfile = {
          uid: 'admin_gametpl',
          username: SUPER_ADMIN_USERNAME,
          name: SUPER_ADMIN_NAME,
          pin: SUPER_ADMIN_PIN,
          role: 'admin',
          createdAt: 1710000000000,
        };
        list.unshift(adminProfile);
        try {
          await setDoc(doc(db, 'users', 'admin_gametpl'), adminProfile, { merge: true });
        } catch (_) {}
      }

      set({ registeredUsers: list });
    } catch (e) {
      console.warn('Failed to fetch registered users list', e);
    }
  },

  loginWithUsername: async (username: string, pin: string) => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (!cleanUsername) {
      return { success: false, message: 'กรุณากรอกชื่อผู้ใช้หรือรหัสพนักงาน' };
    }

    // 1. Check for Super Admin gametpl / gametpl
    if (cleanUsername === SUPER_ADMIN_USERNAME) {
      if (cleanPin !== SUPER_ADMIN_PIN) {
        return { success: false, message: 'รหัสผ่านสำหรับแอดมิน gametpl ไม่ถูกต้อง' };
      }

      const adminProfile: UserProfile = {
        uid: 'admin_gametpl',
        username: SUPER_ADMIN_USERNAME,
        name: SUPER_ADMIN_NAME,
        pin: SUPER_ADMIN_PIN,
        role: 'admin',
        createdAt: 1710000000000,
      };

      try {
        const docRef = doc(db, 'users', 'admin_gametpl');
        await setDoc(docRef, adminProfile, { merge: true });
      } catch (e) {
        console.warn('Could not sync admin to firestore', e);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(adminProfile));
      set({ user: adminProfile });
      get().fetchRegisteredUsers();
      return { success: true };
    }

    try {
      // 2. Try finding in Firestore for regular employees
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', cleanUsername));
      const snap = await getDocs(q);

      if (snap.empty) {
        // Check by doc ID
        const docRef = doc(db, 'users', cleanUsername);
        const directDoc = await getDoc(docRef);
        if (directDoc.exists()) {
          const data = directDoc.data() as UserProfile;
          if (data.pin && data.pin !== cleanPin) {
            return { success: false, message: 'รหัสผ่านหรือ PIN ไม่ถูกต้อง' };
          }
          // Only gametpl is admin
          const profile: UserProfile = { 
            ...data, 
            uid: directDoc.id, 
            role: 'employee' 
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
          set({ user: profile });
          return { success: true };
        }
        return { success: false, message: 'ไม่พบบัญชีผู้ใช้นี้ กรุณาลงทะเบียนพนักงานก่อน' };
      }

      const userDoc = snap.docs[0];
      const data = userDoc.data() as UserProfile;
      if (data.pin && data.pin !== cleanPin) {
        return { success: false, message: 'รหัสผ่านหรือ PIN ไม่ถูกต้อง' };
      }

      // Only gametpl is admin
      const profile: UserProfile = {
        ...data,
        uid: userDoc.id,
        role: 'employee',
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      set({ user: profile });
      return { success: true };
    } catch (error) {
      console.error('Login error', error);
      return { success: false, message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + (error as Error).message };
    }
  },

  registerEmployee: async (name: string, username: string, pin?: string) => {
    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPin = (pin || '').trim();

    if (!cleanName || !cleanUsername) {
      return { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
    }

    if (cleanUsername === SUPER_ADMIN_USERNAME) {
      return { success: false, message: 'ชื่อผู้ใช้ gametpl สงวนสิทธิ์สำหรับผู้ดูแลระบบ (แอดมิน) เท่านั้น กรุณาเข้าสู่ระบบ' };
    }

    try {
      const docId = `emp_${cleanUsername.replace(/[^a-z0-9_]/gi, '') || Date.now()}`;
      const docRef = doc(db, 'users', docId);

      // Check if already exists
      const existing = await getDoc(docRef);
      if (existing.exists()) {
        return { success: false, message: 'ชื่อผู้ใช้/รหัสนี้มีอยู่ในระบบแล้ว กรุณาเข้าสู่ระบบ' };
      }

      const profile: UserProfile = {
        uid: docId,
        name: cleanName,
        username: cleanUsername,
        pin: cleanPin,
        role: 'employee',
        createdAt: Date.now(),
      };

      await setDoc(docRef, profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      set({ user: profile });
      await get().fetchRegisteredUsers();

      return { success: true };
    } catch (error) {
      console.error('Registration error', error);
      return { success: false, message: 'ไม่สามารถลงทะเบียนได้: ' + (error as Error).message };
    }
  },

  loginWithDemo: async (role: Role) => {
    const isEmp = role === 'employee';
    const demoProfile: UserProfile = {
      uid: isEmp ? 'demo_employee_1' : 'demo_admin_1',
      name: isEmp ? 'สมชาย ใจบริการ (พนักงาน)' : 'ผู้ดูแลระบบ (แอดมิน)',
      username: isEmp ? 'somchai' : 'admin',
      role: role,
      createdAt: Date.now(),
    };

    try {
      const docRef = doc(db, 'users', demoProfile.uid);
      await setDoc(docRef, demoProfile, { merge: true });
    } catch (e) {
      console.warn('Could not sync demo to firestore, continuing locally', e);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoProfile));
    set({ user: demoProfile });
  },

  setUserDirectly: (profile: UserProfile) => {
    const isSuperAdmin = profile.username?.toLowerCase() === SUPER_ADMIN_USERNAME || profile.uid === 'admin_gametpl';
    const enforcedProfile: UserProfile = {
      ...profile,
      role: isSuperAdmin ? 'admin' : 'employee'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enforcedProfile));
    set({ user: enforcedProfile });
  },

  loginWithGoogle: async (role: Role = 'employee') => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      const userDocRef = doc(db, 'users', googleUser.uid);
      const userDoc = await getDoc(userDocRef);

      let userProfile: UserProfile;

      if (!userDoc.exists()) {
        userProfile = {
          uid: googleUser.uid,
          email: googleUser.email || '',
          username: (googleUser.email || '').split('@')[0] || 'user_' + googleUser.uid.substring(0, 5),
          name: googleUser.displayName || 'พนักงาน Google',
          role: role,
          createdAt: Date.now(),
        };
        await setDoc(userDocRef, userProfile);
      } else {
        userProfile = {
          uid: googleUser.uid,
          ...(userDoc.data() as UserProfile),
        };
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(userProfile));
      set({ user: userProfile });
    } catch (error) {
      console.error('Google login failed', error);
      alert('เข้าสู่ระบบด้วย Google ไม่สำเร็จ: ' + (error as Error).message);
    }
  },

  logout: async () => {
    try {
      await signOut(auth);
    } catch (_) {
      // ignore
    }
    localStorage.removeItem(STORAGE_KEY);
    set({ user: null });
  },

  initAuth: async () => {
    try {
      // 1. Check localStorage first
      const savedUserStr = localStorage.getItem(STORAGE_KEY);
      if (savedUserStr) {
        try {
          const parsed = JSON.parse(savedUserStr);
          if (parsed && parsed.uid && parsed.name) {
            const isSuperAdmin = parsed.username?.toLowerCase() === SUPER_ADMIN_USERNAME || parsed.uid === 'admin_gametpl';
            const enforcedProfile: UserProfile = {
              ...parsed,
              role: isSuperAdmin ? 'admin' : 'employee',
              name: isSuperAdmin ? SUPER_ADMIN_NAME : parsed.name,
            };
            set({ user: enforcedProfile, loading: false });
            get().fetchRegisteredUsers();
            return;
          }
        } catch (_) {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      // 2. Fetch registered users list in background for easy selection
      get().fetchRegisteredUsers();
      set({ user: null, loading: false });
    } catch (e) {
      console.error('Init auth error', e);
      set({ user: null, loading: false });
    }
  },
}));
