import { create } from 'zustand';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';

export type Role = 'employee' | 'admin';

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
  registeredUsers: UserProfile[];
  fetchRegisteredUsers: () => Promise<void>;
  loginWithUsername: (username: string, pin: string) => Promise<{ success: boolean; message?: string }>;
  registerEmployee: (name: string, username: string, pin: string, role: Role) => Promise<{ success: boolean; message?: string }>;
  loginWithDemo: (role: Role) => Promise<void>;
  loginWithGoogle: (role?: Role) => Promise<void>;
  setUserDirectly: (profile: UserProfile) => void;
  logout: () => Promise<void>;
  initAuth: () => Promise<void>;
}

const STORAGE_KEY = 'qmanage_current_user_v2';

export const useStore = create<AppState>((set, get) => ({
  user: null,
  loading: true,
  registeredUsers: [],

  fetchRegisteredUsers: async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      snap.forEach((doc) => {
        list.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
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

    try {
      // 1. Try finding in Firestore
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
          const profile = { ...data, uid: directDoc.id };
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

      const profile: UserProfile = {
        ...data,
        uid: userDoc.id,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      set({ user: profile });
      return { success: true };
    } catch (error) {
      console.error('Login error', error);
      return { success: false, message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + (error as Error).message };
    }
  },

  registerEmployee: async (name: string, username: string, pin: string, role: Role) => {
    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (!cleanName || !cleanUsername) {
      return { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
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
        role: role,
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    set({ user: profile });
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
          if (parsed && parsed.uid && parsed.name && parsed.role) {
            set({ user: parsed, loading: false });
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
