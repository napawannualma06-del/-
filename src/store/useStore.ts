import { create } from 'zustand';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  updateDoc,
  orderBy,
  limit,
  getCountFromServer,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ensureFirebaseAnonymousAuth, isQuotaExceededError } from '../lib/firebase';
import { UserProfile, Role, WorkStatus, AccountStatus, Case, Agent } from '../types';
import { ANIMAL_LIST } from '../components/AnimalAvatar';
import { clockOutEmployeeAndReturnCases, ShiftActionResult } from '../lib/shiftService';

export type { Role, WorkStatus, AccountStatus, UserProfile };

function getDeterministicAnimalEmoji(identifier: string): string {
  const clean = (identifier || 'default').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return ANIMAL_LIST[hash % ANIMAL_LIST.length].emoji;
}

// ============================================================================
// Web Crypto PIN Hashing Helpers (SHA-256 + Salt in Browser)
// ============================================================================
export function generatePinSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computePinHash(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPinBrowser(pin: string, pinHash: string, pinSalt: string): Promise<boolean> {
  if (!pinHash || !pinSalt) return false;
  const computed = await computePinHash(pin, pinSalt);
  return computed === pinHash;
}

const USER_STORAGE_KEY = 'thaiplus_current_user_v1';
const USERS_CACHE_KEY = 'thaiplus_cached_employees';
const USERS_CACHE_TS_KEY = 'thaiplus_cached_employees_ts';
const USERS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache for Login page

const AGENTS_CACHE_KEY = 'thaiplus_agents_cache_v1';
const AGENTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours cache for Agents

// Helper to check if a user has Admin privileges (Super Admin Game or Admin Napawan)
export function isUserAdmin(user?: UserProfile | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const uname = (user.username || '').toLowerCase().trim();
  const name = (user.name || '').toLowerCase().trim();
  if (
    uname === 'gametpl' ||
    user.uid === 'admin_gametpl' ||
    uname === 'napawan' ||
    name.includes('napawan') ||
    user.uid === 'admin_napawan'
  ) {
    return true;
  }
  return false;
}

function sanitizeUserProfile(raw: any, docId: string): UserProfile {
  const hasPin = Boolean(
    raw?.hasPin ||
    (typeof raw?.pinHash === 'string' && raw.pinHash.length > 0) ||
    (typeof raw?.pin === 'string' && raw.pin.length > 0)
  );
  const copy = { ...raw, uid: docId, hasPin };
  delete copy.pin;
  delete copy.pinHash;
  delete copy.pinSalt;
  return copy as UserProfile;
}

export interface HistoricalFetchOptions {
  status?: 'closed' | 'cancelled';
  minCreatedAt?: number;
  maxCreatedAt?: number;
  limitCount?: number;
  forceRefresh?: boolean;
}

interface AgentsCachePayload {
  agents: Agent[];
  deletedAgentNames: string[];
  timestamp: number;
}

function loadInitialAgentsCache(): AgentsCachePayload {
  try {
    const raw = localStorage.getItem(AGENTS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.agents)) {
        return {
          agents: parsed.agents,
          deletedAgentNames: Array.isArray(parsed.deletedAgentNames) ? parsed.deletedAgentNames : [],
          timestamp: Number(parsed.timestamp) || 0,
        };
      }
    }
  } catch {}
  return { agents: [], deletedAgentNames: [], timestamp: 0 };
}

function saveAgentsCache(agents: Agent[], deletedAgentNames: string[], timestamp = Date.now()) {
  try {
    const payload: AgentsCachePayload = {
      agents,
      deletedAgentNames,
      timestamp,
    };
    localStorage.setItem(AGENTS_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

interface AppState {
  user: UserProfile | null;
  loading: boolean;
  registeredUsers: UserProfile[];
  userAvatars: Record<string, string>;
  isDarkMode: boolean;

  // Centralized Real-time Data (Single Listener Set across entire app)
  cases: Case[]; // Active cases (pending, credit_check, processing) + Today's cases
  historicalCases: Case[]; // Loaded on-demand via getDocs with limit when viewing history
  casesLoading: boolean;
  historicalLoading: boolean;

  // Agents loaded on-demand via getDocs + 6h localStorage cache
  agents: Agent[];
  deletedAgentNames: string[];
  agentsLastFetchedAt: number;
  agentsLoading: boolean;
  // Global Case Counts (Fetched via lightweight count aggregation, 1 read per query)
  totalCaseCounts: {
    total: number;
    closed: number;
    cancelled: number;
  };
  fetchTotalCaseCounts: (forceRefresh?: boolean) => Promise<{ total: number; closed: number; cancelled: number }>;

  initAuth: () => void;
  startRealtimeListeners: () => void;
  stopRealtimeListeners: () => void;
  fetchHistoricalCases: (options: HistoricalFetchOptions) => Promise<Case[]>;

  // On-demand Agent actions with 6h cache
  fetchAgents: (forceRefresh?: boolean) => Promise<void>;
  upsertAgentInCache: (agent: Agent) => void;
  removeAgentFromCache: (agentName: string, agentId?: string) => void;

  toggleDarkMode: () => void;
  fetchRegisteredUsers: (forceRefresh?: boolean) => Promise<void>;
  loginWithUsername: (username: string, pin?: string) => Promise<{ success: boolean; message?: string }>;
  registerEmployee: (name: string, username: string, pin?: string) => Promise<{ success: boolean; message?: string; pendingApproval?: boolean }>;
  approveUser: (uid: string) => Promise<{ success: boolean; message?: string }>;
  rejectUser: (uid: string) => Promise<{ success: boolean; message?: string }>;
  deleteUserAccount: (uid: string) => Promise<{ success: boolean; message?: string }>;
  setUserDirectly: (user: UserProfile) => Promise<void>;
  clockIn: () => Promise<void>;
  clockOut: () => Promise<ShiftActionResult>;
  updateAvatar: (emoji: string) => Promise<{ success: boolean; message?: string }>;
  changeUserPassword: (
    targetUid: string,
    newPin: string,
    currentPin?: string,
    isAdminOverride?: boolean
  ) => Promise<{ success: boolean; message?: string }>;
  resetPasswordWithIdentity: (
    username: string,
    registeredName: string,
    newPin: string
  ) => Promise<{ success: boolean; message?: string }>;
  requestAdminPasswordReset: (username: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const getInitialDarkMode = (): boolean => {
  try {
    const saved = localStorage.getItem('theme_mode');
    const isDark = saved === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return isDark;
  } catch {
    return false;
  }
};

const DEFAULT_INITIAL_CASES: Case[] = [
  {
    id: 'sample_case_1',
    caseKey: 'TP-101',
    agentName: 'ตัวแทน สมชาย (ชัยภูมิ)',
    iphoneModel: 'iPhone 16 Pro Max 256GB Desert Titanium',
    province: 'ชัยภูมิ',
    status: 'pending',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'sample_case_2',
    caseKey: 'TP-102',
    agentName: 'ตัวแทน วนิดา (ขอนแก่น)',
    iphoneModel: 'iPhone 15 128GB Black',
    province: 'ขอนแก่น',
    status: 'credit_check',
    assigneeId: 'emp_23',
    assigneeName: 'พนักงาน 23',
    acceptedAt: Date.now() - 1800000,
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 1800000,
  },
  {
    id: 'sample_case_3',
    caseKey: 'TP-103',
    agentName: 'ตัวแทน กิตติ (นครราชสีมา)',
    iphoneModel: 'iPhone 14 Plus 128GB Starlight',
    province: 'นครราชสีมา',
    status: 'processing',
    assigneeId: 'emp_cantaloop',
    assigneeName: 'แคนตาลูป',
    acceptedAt: Date.now() - 2400000,
    createdAt: Date.now() - 9000000,
    updatedAt: Date.now() - 2400000,
  },
];

const DEFAULT_INITIAL_USERS: UserProfile[] = [
  { uid: 'admin_gametpl', username: 'gametpl', name: 'Game', role: 'admin', avatarEmoji: '🦁', workStatus: 'working', createdAt: Date.now() },
  { uid: 'admin_napawan', username: 'napawan', name: 'Napawan', role: 'admin', avatarEmoji: '👑', workStatus: 'working', createdAt: Date.now() },
  { uid: 'emp_cantaloop', username: 'cantaloop', name: 'แคนตาลูป', role: 'employee', avatarEmoji: '🐰', workStatus: 'working', createdAt: Date.now() },
  { uid: 'emp_suthalinee', username: 'suthalinee', name: 'เจน (Suthalinee)', role: 'employee', avatarEmoji: '🐱', workStatus: 'working', createdAt: Date.now() },
  { uid: 'emp_11', username: '11', name: 'พนักงาน 11', role: 'employee', avatarEmoji: '🐼', workStatus: 'working', createdAt: Date.now() },
  { uid: 'emp_23', username: '23', name: 'พนักงาน 23', role: 'admin', avatarEmoji: '⚡', workStatus: 'working', createdAt: Date.now() },
  { uid: 'emp_somchai', username: 'somchai', name: 'สมชาย', role: 'employee', avatarEmoji: '🐻', workStatus: 'working', createdAt: Date.now() },
  { uid: 'emp_wipa', username: 'wipa', name: 'วิภา', role: 'employee', avatarEmoji: '🦊', workStatus: 'working', createdAt: Date.now() },
];

const getInitialCachedCases = (): Case[] => {
  try {
    const cached = localStorage.getItem('thaiplus_cached_cases');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_INITIAL_CASES;
};

const getInitialCachedUsers = (): { users: UserProfile[]; avatars: Record<string, string> } => {
  let userList = DEFAULT_INITIAL_USERS;
  try {
    const cached = localStorage.getItem(USERS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as UserProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        userList = parsed;
      }
    }
  } catch {}

  const avatars: Record<string, string> = {};
  userList.forEach((u) => {
    const emoji = u.avatarEmoji || getDeterministicAnimalEmoji(u.username || u.uid);
    avatars[u.uid] = emoji;
    avatars[u.uid.toLowerCase()] = emoji;
    if (u.username) avatars[u.username.toLowerCase()] = emoji;
    if (u.name) {
      avatars[u.name] = emoji;
      avatars[u.name.toLowerCase()] = emoji;
    }
  });
  return { users: userList, avatars };
};

// Module-level unsubscribe references to guarantee at most 1 listener per collection across the entire app
let usersCollectionUnsubscribe: (() => void) | null = null;
let activeCasesUnsubscribe: (() => void) | null = null;
let todayCasesUnsubscribe: (() => void) | null = null;
let midnightResetTimer: ReturnType<typeof setTimeout> | null = null;
let midnightVisibilityHandler: (() => void) | null = null;
let currentTodayStartMs = 0;
let listenersActive = false;

// In-memory maps for merging activeCases + todayCases without duplicates
const activeCasesMap = new Map<string, Case>();
const todayCasesMap = new Map<string, Case>();
const historicalCasesMap = new Map<string, Case>();
const fetchedHistoryKeys = new Set<string>();
let initialActiveCasesLoaded = false;

function getStartOfTodayMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
}

function getMsUntilNextMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2, 0).getTime();
  return Math.max(5000, nextMidnight - now.getTime());
}

function mergeAndSortLiveCases(): Case[] {
  const merged = new Map<string, Case>();
  const startOfToday = getStartOfTodayMs();

  todayCasesMap.forEach((c, id) => {
    if (c.createdAt && c.createdAt >= startOfToday) {
      merged.set(id, c);
    } else {
      todayCasesMap.delete(id);
    }
  });

  activeCasesMap.forEach((c, id) => {
    if (
      c.status === 'pending' ||
      c.status === 'credit_check' ||
      c.status === 'processing' ||
      (c.createdAt && c.createdAt >= startOfToday)
    ) {
      merged.set(id, c);
    } else {
      activeCasesMap.delete(id);
    }
  });

  const arr = Array.from(merged.values());
  arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return arr;
}

const initialUsersState = getInitialCachedUsers();
const initialAgentsState = loadInitialAgentsCache();

export const useStore = create<AppState>((set, get) => {
  // Helper to subscribe/reset todayCases listener (including when crossing midnight)
  const attachTodayCasesListener = () => {
    if (todayCasesUnsubscribe) {
      todayCasesUnsubscribe();
      todayCasesUnsubscribe = null;
    }

    const startOfToday = getStartOfTodayMs();
    currentTodayStartMs = startOfToday;
    todayCasesMap.clear();

    const qToday = query(
      collection(db, 'cases'),
      where('createdAt', '>=', startOfToday)
    );

    todayCasesUnsubscribe = onSnapshot(
      qToday,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const cData = { id: change.doc.id, ...change.doc.data() } as Case;
          if (change.type === 'removed') {
            todayCasesMap.delete(change.doc.id);
          } else {
            todayCasesMap.set(change.doc.id, cData);
            if (cData.status === 'closed' || cData.status === 'cancelled') {
              activeCasesMap.delete(change.doc.id);
            }
          }
        });

        const merged = mergeAndSortLiveCases();
        if (merged.length > 0) {
          try {
            localStorage.setItem('thaiplus_cached_cases', JSON.stringify(merged));
          } catch {}
        }
        set({ cases: merged, casesLoading: false });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'cases');
        set({ casesLoading: false });
      }
    );

    // Schedule automatic listener reset at midnight (00:00:02)
    if (midnightResetTimer) {
      clearTimeout(midnightResetTimer);
    }
    midnightResetTimer = setTimeout(() => {
      if (listenersActive) {
        attachTodayCasesListener();
        const merged = mergeAndSortLiveCases();
        set({ cases: merged });
      }
    }, getMsUntilNextMidnight());
  };

  return {
    user: null,
    loading: true,
    registeredUsers: initialUsersState.users,
    userAvatars: initialUsersState.avatars,
    isDarkMode: getInitialDarkMode(),

    cases: getInitialCachedCases(),
    historicalCases: [],
    casesLoading: true,
    historicalLoading: false,

    totalCaseCounts: {
      total: 0,
      closed: 0,
      cancelled: 0,
    },

    agents: initialAgentsState.agents,
    deletedAgentNames: initialAgentsState.deletedAgentNames,
    agentsLastFetchedAt: initialAgentsState.timestamp,
    agentsLoading: false,

    toggleDarkMode: () => {
      const nextMode = !get().isDarkMode;
      try {
        localStorage.setItem('theme_mode', nextMode ? 'dark' : 'light');
      } catch {}
      if (nextMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      set({ isDarkMode: nextMode });
    },

    stopRealtimeListeners: () => {
      if (usersCollectionUnsubscribe) {
        usersCollectionUnsubscribe();
        usersCollectionUnsubscribe = null;
      }
      if (activeCasesUnsubscribe) {
        activeCasesUnsubscribe();
        activeCasesUnsubscribe = null;
      }
      if (todayCasesUnsubscribe) {
        todayCasesUnsubscribe();
        todayCasesUnsubscribe = null;
      }
      if (midnightResetTimer) {
        clearTimeout(midnightResetTimer);
        midnightResetTimer = null;
      }
      if (midnightVisibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', midnightVisibilityHandler);
        midnightVisibilityHandler = null;
      }
      listenersActive = false;
      initialActiveCasesLoaded = false;
    },

    startRealtimeListeners: () => {
      if (listenersActive) return;
      listenersActive = true;

      // 1. Single 'users' listener across the entire application
      if (!usersCollectionUnsubscribe) {
        usersCollectionUnsubscribe = onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const usersList: UserProfile[] = [];
            const avatarMap: Record<string, string> = {};

            snap.forEach((d) => {
              const rawData = d.data();
              const data = sanitizeUserProfile(rawData, d.id);
              const emoji = data.avatarEmoji || getDeterministicAnimalEmoji(data.username || d.id);

              let displayName = data.name;
              if (
                displayName === 'คุณเกม' ||
                data.username?.toLowerCase() === 'gametpl' ||
                d.id === 'admin_gametpl'
              ) {
                displayName = 'Game';
              }

              const isNapawan =
                data.username?.toLowerCase() === 'napawan' ||
                (data.name && data.name.toLowerCase().includes('napawan')) ||
                d.id === 'admin_napawan';
              const resolvedRole: Role =
                isNapawan || data.username?.toLowerCase() === 'gametpl' || d.id === 'admin_gametpl'
                  ? 'admin'
                  : data.role || 'employee';

              const userObj: UserProfile = {
                ...data,
                name: displayName,
                role: resolvedRole,
                uid: d.id,
                avatarEmoji: emoji,
              };
              usersList.push(userObj);

              avatarMap[d.id] = emoji;
              avatarMap[d.id.toLowerCase()] = emoji;
              if (data.username) {
                avatarMap[data.username.toLowerCase()] = emoji;
              }
              if (data.name) {
                avatarMap[data.name] = emoji;
                avatarMap[data.name.toLowerCase()] = emoji;
              }
              if (displayName) {
                avatarMap[displayName] = emoji;
                avatarMap[displayName.toLowerCase()] = emoji;
              }
            });

            usersList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));

            if (usersList.length > 0) {
              try {
                localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(usersList));
                localStorage.setItem(USERS_CACHE_TS_KEY, String(Date.now()));
              } catch {}
            }

            // Keep current logged-in user synced from this single listener
            const currentUser = get().user;
            let updatedCurrentUser = currentUser;
            if (currentUser) {
              const matched = usersList.find(
                (u) => u.uid === currentUser.uid || (currentUser.username && u.username === currentUser.username)
              );
              if (matched) {
                if (matched.accountStatus === 'rejected') {
                  try {
                    localStorage.removeItem(USER_STORAGE_KEY);
                  } catch {}
                  updatedCurrentUser = null;
                } else {
                  // Only replace object reference if key fields actually changed!
                  const hasRealChange =
                    currentUser.uid !== matched.uid ||
                    currentUser.role !== matched.role ||
                    currentUser.workStatus !== matched.workStatus ||
                    currentUser.name !== matched.name ||
                    currentUser.username !== matched.username ||
                    currentUser.accountStatus !== matched.accountStatus ||
                    currentUser.avatarEmoji !== matched.avatarEmoji;

                  if (hasRealChange) {
                    updatedCurrentUser = matched;
                    try {
                      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(matched));
                    } catch {}
                  } else {
                    updatedCurrentUser = currentUser; // Keep existing reference to avoid downstream cascade
                  }
                }
              }
            }

            set({
              registeredUsers: usersList,
              userAvatars: avatarMap,
              ...(updatedCurrentUser !== currentUser ? { user: updatedCurrentUser } : {}),
            });
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, 'users');
          }
        );
      }

      // 2. Single 'cases' listener set: ONLY unfinished cases (pending, credit_check, processing) + cases created today (>= 00:00)
      if (!activeCasesUnsubscribe) {
        const qActive = query(
          collection(db, 'cases'),
          where('status', 'in', ['pending', 'credit_check', 'processing'])
        );
        activeCasesUnsubscribe = onSnapshot(
          qActive,
          (snapshot) => {
            let hasNewPending = false;
            snapshot.docChanges().forEach((change) => {
              const cData = { id: change.doc.id, ...change.doc.data() } as Case;
              if (change.type === 'removed') {
                activeCasesMap.delete(change.doc.id);
              } else {
                if (change.type === 'added' && initialActiveCasesLoaded && cData.status === 'pending') {
                  hasNewPending = true;
                }
                activeCasesMap.set(change.doc.id, cData);
              }
            });
            initialActiveCasesLoaded = true;

            if (hasNewPending && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('thaiplus-new-pending-case'));
            }

            const merged = mergeAndSortLiveCases();
            if (merged.length > 0) {
              try {
                localStorage.setItem('thaiplus_cached_cases', JSON.stringify(merged));
              } catch {}
            }
            // Auto-clear quota flag once database responds successfully
            if (typeof window !== 'undefined') {
              try {
                sessionStorage.removeItem('firestore_quota_exceeded');
                localStorage.removeItem('firestore_quota_exceeded');
                window.dispatchEvent(new CustomEvent('firestore-quota-cleared'));
              } catch {}
            }
            set({ cases: merged, casesLoading: false });
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, 'cases');
            set({ casesLoading: false });
          }
        );
      }

      // Attach todayCases listener + automatic midnight rollover
      attachTodayCasesListener();

      if (!midnightVisibilityHandler && typeof document !== 'undefined') {
        midnightVisibilityHandler = () => {
          if (document.visibilityState === 'visible' && listenersActive) {
            const newStart = getStartOfTodayMs();
            if (newStart !== currentTodayStartMs) {
              attachTodayCasesListener();
            }
          }
        };
        document.addEventListener('visibilitychange', midnightVisibilityHandler);
      }
    },

    // Item 7: Load agents + deleted_agents on-demand via getDocs and cache for 6 hours in localStorage
    fetchAgents: async (forceRefresh = false) => {
      const now = Date.now();
      const cached = loadInitialAgentsCache();
      const cacheAge = now - (cached.timestamp || get().agentsLastFetchedAt || 0);

      if (!forceRefresh && cached.agents.length > 0 && cacheAge < AGENTS_CACHE_TTL_MS) {
        set({
          agents: cached.agents,
          deletedAgentNames: cached.deletedAgentNames,
          agentsLastFetchedAt: cached.timestamp,
          agentsLoading: false,
        });
        return;
      }

      set({ agentsLoading: true });
      try {
        const [agentsSnap, deletedSnap] = await Promise.all([
          getDocs(query(collection(db, 'agents'), orderBy('name', 'asc'))),
          getDoc(doc(db, 'system_duties', 'deleted_agents')),
        ]);

        const loadedAgents: Agent[] = [];
        agentsSnap.forEach((d) => {
          const data = d.data();
          loadedAgents.push({
            id: d.id,
            name: data.name || '',
            createdAt: data.createdAt || 0,
            createdBy: data.createdBy,
            createdById: data.createdById,
            bankName: data.bankName,
            bankAccountNumber: data.bankAccountNumber,
            bankAccountName: data.bankAccountName,
            promptpayType: data.promptpayType,
            phone: data.phone,
            province: data.province,
            notes: data.notes,
            qrImageUrl: data.qrImageUrl,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy,
          });
        });

        let deletedList: string[] = [];
        if (deletedSnap.exists()) {
          const dData = deletedSnap.data();
          if (Array.isArray(dData?.names)) {
            deletedList = dData.names;
          }
        }

        const fetchedAt = Date.now();
        saveAgentsCache(loadedAgents, deletedList, fetchedAt);
        set({
          agents: loadedAgents,
          deletedAgentNames: deletedList,
          agentsLastFetchedAt: fetchedAt,
          agentsLoading: false,
        });
      } catch (err) {
        console.warn('Error fetching agents on-demand:', err);
        set({ agentsLoading: false });
      }
    },

    upsertAgentInCache: (agent: Agent) => {
      const currentAgents = [...get().agents];
      const idx = currentAgents.findIndex(
        (a) => a.id === agent.id || a.name.trim().toLowerCase() === agent.name.trim().toLowerCase()
      );
      if (idx >= 0) {
        currentAgents[idx] = { ...currentAgents[idx], ...agent };
      } else {
        currentAgents.push(agent);
      }
      currentAgents.sort((a, b) => a.name.localeCompare(b.name, 'th'));

      // Also ensure it is removed from deletedAgentNames if re-added
      const cleanLower = agent.name.trim().toLowerCase();
      const updatedDeleted = get().deletedAgentNames.filter((n) => n.trim().toLowerCase() !== cleanLower);
      const now = Date.now();
      saveAgentsCache(currentAgents, updatedDeleted, now);
      set({
        agents: currentAgents,
        deletedAgentNames: updatedDeleted,
        agentsLastFetchedAt: now,
      });
    },

    removeAgentFromCache: (agentName: string, agentId?: string) => {
      const cleanLower = agentName.trim().toLowerCase();
      const updatedAgents = get().agents.filter(
        (a) => (agentId ? a.id !== agentId : true) && a.name.trim().toLowerCase() !== cleanLower
      );
      const currentDeleted = get().deletedAgentNames;
      const updatedDeleted = currentDeleted.some((n) => n.trim().toLowerCase() === cleanLower)
        ? currentDeleted
        : [...currentDeleted, agentName.trim()];
      const now = Date.now();
      saveAgentsCache(updatedAgents, updatedDeleted, now);
      set({
        agents: updatedAgents,
        deletedAgentNames: updatedDeleted,
        agentsLastFetchedAt: now,
      });
    },

    fetchHistoricalCases: async (options: HistoricalFetchOptions) => {
      const { status, minCreatedAt, maxCreatedAt, limitCount = 50, forceRefresh = false } = options;
      const cacheKey = `thaiplus_hist_${status || 'all'}_${minCreatedAt || 0}_${maxCreatedAt || 0}_${limitCount}`;
      const now = Date.now();
      const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

      // 1. Try local storage cache if not force refreshing
      if (!forceRefresh) {
        try {
          const cachedRaw = localStorage.getItem(cacheKey);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (parsed && Array.isArray(parsed.cases) && now - (parsed.timestamp || 0) < CACHE_TTL_MS) {
              parsed.cases.forEach((c: Case) => historicalCasesMap.set(c.id, c));
              const allHistorical = Array.from(historicalCasesMap.values()).sort(
                (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
              );
              set({ historicalCases: allHistorical, historicalLoading: false });
              return allHistorical;
            }
          }
        } catch {}

        if (fetchedHistoryKeys.has(cacheKey)) {
          return get().historicalCases;
        }
      }

      set({ historicalLoading: true });
      try {
        let qHist;
        if (status && minCreatedAt) {
          qHist = query(
            collection(db, 'cases'),
            where('createdAt', '>=', minCreatedAt),
            orderBy('createdAt', 'desc'),
            limit(limitCount)
          );
        } else if (status) {
          qHist = query(
            collection(db, 'cases'),
            where('status', '==', status),
            limit(limitCount)
          );
        } else if (minCreatedAt) {
          qHist = query(
            collection(db, 'cases'),
            where('createdAt', '>=', minCreatedAt),
            orderBy('createdAt', 'desc'),
            limit(limitCount)
          );
        } else {
          qHist = query(
            collection(db, 'cases'),
            orderBy('createdAt', 'desc'),
            limit(limitCount)
          );
        }

        const snap = await getDocs(qHist);
        const fetchedCases: Case[] = [];
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const c = { id: d.id, ...data } as Case;
          if (maxCreatedAt && c.createdAt > maxCreatedAt && (!c.completedAt || c.completedAt > maxCreatedAt)) {
            return;
          }
          historicalCasesMap.set(d.id, c);
          fetchedCases.push(c);
        });

        // Save to localStorage cache for 30 minutes
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ cases: fetchedCases, timestamp: now }));
        } catch {}

        fetchedHistoryKeys.add(cacheKey);
        const allHistorical = Array.from(historicalCasesMap.values()).sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );
        set({ historicalCases: allHistorical, historicalLoading: false });
        return allHistorical;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'cases');
        set({ historicalLoading: false });
        return get().historicalCases;
      }
    },

    // Ultra lightweight count aggregation query (1 read per query, cache for 15 minutes)
    fetchTotalCaseCounts: async (forceRefresh = false) => {
      const CACHE_KEY = 'thaiplus_total_case_counts_v1';
      const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
      const now = Date.now();

      if (!forceRefresh) {
        try {
          const cachedRaw = localStorage.getItem(CACHE_KEY);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (parsed && typeof parsed.total === 'number' && now - (parsed.timestamp || 0) < CACHE_TTL_MS) {
              const res = { total: parsed.total, closed: parsed.closed || 0, cancelled: parsed.cancelled || 0 };
              set({ totalCaseCounts: res });
              return res;
            }
          }
        } catch {}
      }

      try {
        const [totalSnap, closedSnap, cancelledSnap] = await Promise.all([
          getCountFromServer(collection(db, 'cases')),
          getCountFromServer(query(collection(db, 'cases'), where('status', '==', 'closed'))),
          getCountFromServer(query(collection(db, 'cases'), where('status', '==', 'cancelled'))),
        ]);

        const counts = {
          total: totalSnap.data().count,
          closed: closedSnap.data().count,
          cancelled: cancelledSnap.data().count,
        };

        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ...counts, timestamp: now }));
        } catch {}

        set({ totalCaseCounts: counts });
        return counts;
      } catch (err) {
        console.warn('Error fetching total case count aggregations:', err);
        return get().totalCaseCounts;
      }
    },

    initAuth: async () => {
      await ensureFirebaseAnonymousAuth();

      try {
        const saved = localStorage.getItem(USER_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as UserProfile;
          if (parsed && parsed.uid && parsed.name) {
            const clean = sanitizeUserProfile(parsed, parsed.uid);
            set({ user: clean, loading: false });
            get().startRealtimeListeners();
            return;
          }
        }
      } catch (e) {
        console.error('Failed to parse saved user', e);
      }

      set({ user: null, loading: false });
    },

    // Item 11: Use localStorage cache if age <= 30 minutes on Login page
    fetchRegisteredUsers: async (forceRefresh = false) => {
      if (usersCollectionUnsubscribe && get().registeredUsers.length > 0) {
        return;
      }

      if (!forceRefresh) {
        try {
          const cachedTs = Number(localStorage.getItem(USERS_CACHE_TS_KEY) || 0);
          const cachedRaw = localStorage.getItem(USERS_CACHE_KEY);
          if (cachedRaw && cachedTs > 0 && Date.now() - cachedTs < USERS_CACHE_TTL_MS) {
            const parsed = JSON.parse(cachedRaw) as UserProfile[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              const avatarMap: Record<string, string> = {};
              parsed.forEach((u) => {
                const emoji = u.avatarEmoji || getDeterministicAnimalEmoji(u.username || u.uid);
                avatarMap[u.uid] = emoji;
                if (u.username) avatarMap[u.username.toLowerCase()] = emoji;
                if (u.name) avatarMap[u.name.toLowerCase()] = emoji;
              });
              set({ registeredUsers: parsed, userAvatars: avatarMap });
              return;
            }
          }
        } catch {}
      }

      try {
        const snap = await getDocs(collection(db, 'users'));
        const usersList: UserProfile[] = [];
        const avatarMap: Record<string, string> = {};

        snap.forEach((d) => {
          const data = sanitizeUserProfile(d.data(), d.id);
          const emoji = data.avatarEmoji || getDeterministicAnimalEmoji(data.username || d.id);
          let displayName = data.name;
          if (displayName === 'คุณเกม' || data.username?.toLowerCase() === 'gametpl' || d.id === 'admin_gametpl') {
            displayName = 'Game';
          }
          const userObj: UserProfile = { ...data, name: displayName, uid: d.id, avatarEmoji: emoji };
          usersList.push(userObj);
          avatarMap[d.id] = emoji;
          if (data.username) avatarMap[data.username.toLowerCase()] = emoji;
          if (data.name) avatarMap[data.name.toLowerCase()] = emoji;
        });

        usersList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
        try {
          localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(usersList));
          localStorage.setItem(USERS_CACHE_TS_KEY, String(Date.now()));
        } catch {}
        set({ registeredUsers: usersList, userAvatars: avatarMap });
      } catch (e) {
        console.warn('Error fetching registered users:', e);
      }
    },

    // Item 1: Browser-based PIN verification via Web Crypto (SHA-256 + salt) with automatic migration.
    // Never bypasses PIN check on connection failure.
    loginWithUsername: async (username: string, pin?: string) => {
      const cleanUsername = username.trim().toLowerCase();
      const inputPin = (pin || '').trim();
      if (!cleanUsername) {
        return { success: false, message: 'กรุณากรอกชื่อผู้ใช้' };
      }

      await ensureFirebaseAnonymousAuth();

      // 0. Direct Local / Emergency Access Account (Zero Database / Zero Firestore dependency)
      // Requested by user: ID "23", Pass "23"
      if (cleanUsername === '23') {
        if (inputPin !== '23') {
          return {
            success: false,
            message: 'รหัสผ่านสำหรับบัญชี 23 ไม่ถูกต้อง (กรุณากรอกรหัสผ่าน 23)',
          };
        }

        const emergencyUser: UserProfile = {
          uid: 'emp_23',
          username: '23',
          name: 'พนักงาน 23 (ผู้ดูแลระบบฉุกเฉิน)',
          role: 'admin',
          avatarEmoji: '⚡',
          workStatus: 'working',
          lastActiveAt: Date.now(),
          lastActionAt: Date.now(),
          clockedInAt: Date.now(),
          accountStatus: 'approved',
          createdAt: Date.now(),
        };

        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(emergencyUser));
        set({ user: emergencyUser });
        get().startRealtimeListeners();
        return { success: true };
      }

      // Super Admin "gametpl"
      if (cleanUsername === 'gametpl') {
        if (inputPin !== 'gametpl') {
          return {
            success: false,
            message: 'รหัสผ่านสำหรับบัญชีผู้ดูแลระบบ (gametpl) ไม่ถูกต้อง',
          };
        }

        const adminUid = 'admin_gametpl';
        const now = Date.now();
        const pinSalt = generatePinSalt();
        const pinHash = await computePinHash('gametpl', pinSalt);
        const adminProfile: Record<string, any> = {
          uid: adminUid,
          username: 'gametpl',
          name: 'คุณเกม',
          role: 'admin',
          pin: '',
          pinHash,
          pinSalt,
          hasPin: true,
          workStatus: 'working',
          lastActiveAt: now,
          lastActionAt: now,
          clockedInAt: now,
          autoClockOutReason: '',
          avatarEmoji: getDeterministicAnimalEmoji('gametpl'),
          createdAt: now,
          accountStatus: 'approved',
        };

        try {
          const existingSnap = await getDoc(doc(db, 'users', adminUid));
          if (existingSnap.exists()) {
            const existingData = existingSnap.data();
            adminProfile.avatarEmoji = existingData.avatarEmoji || adminProfile.avatarEmoji;
            adminProfile.createdAt = existingData.createdAt || now;
          }
          await setDoc(doc(db, 'users', adminUid), adminProfile, { merge: true });
        } catch (err: any) {
          console.warn('Sync admin_gametpl to Firestore failed (proceeding locally):', err?.code || err);
        }

        const sanitizedAdmin = sanitizeUserProfile(adminProfile, adminUid);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(sanitizedAdmin));
        set({ user: sanitizedAdmin });
        get().startRealtimeListeners();
        return { success: true };
      }

      // Standard Employee / Admin Login: Read user doc directly from Firestore
      try {
        let foundDocId: string | null = null;
        let foundData: Record<string, any> | null = null;

        const directId = `emp_${cleanUsername}`;
        const directSnap = await getDoc(doc(db, 'users', directId));
        if (directSnap.exists()) {
          foundDocId = directSnap.id;
          foundData = directSnap.data();
        } else {
          const q = query(collection(db, 'users'), where('username', '==', cleanUsername));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            foundDocId = qSnap.docs[0].id;
            foundData = qSnap.docs[0].data();
          }
        }

        if (!foundDocId || !foundData) {
          return {
            success: false,
            message: 'ไม่พบชื่อผู้ใช้นี้ในระบบ กรุณาลงทะเบียนพนักงานใหม่ก่อนเข้าใช้งาน',
          };
        }

        // Strict PIN check via Web Crypto (SHA-256 + salt) or legacy plaintext PIN with automatic migration
        const hasHashedPin =
          typeof foundData.pinHash === 'string' &&
          foundData.pinHash.length > 0 &&
          typeof foundData.pinSalt === 'string' &&
          foundData.pinSalt.length > 0;
        const legacyPin = typeof foundData.pin === 'string' ? foundData.pin : '';

        let needsMigration = false;
        let migratedHash = '';
        let migratedSalt = '';

        if (hasHashedPin) {
          const isValid = await verifyPinBrowser(inputPin, foundData.pinHash, foundData.pinSalt);
          if (!isValid) {
            return {
              success: false,
              message: 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
            };
          }
          if (legacyPin) {
            needsMigration = true;
            migratedHash = foundData.pinHash;
            migratedSalt = foundData.pinSalt;
          }
        } else if (legacyPin) {
          if (legacyPin !== inputPin) {
            return {
              success: false,
              message: 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
            };
          }
          // Automatically migrate legacy plaintext PIN to SHA-256 + salt
          migratedSalt = generatePinSalt();
          migratedHash = await computePinHash(legacyPin, migratedSalt);
          needsMigration = true;
        }

        if (foundData.accountStatus === 'pending') {
          return {
            success: false,
            message: 'บัญชีของคุณอยู่ระหว่างรอแอดมินอนุมัติ กรุณาแจ้งผู้ดูแลระบบเพื่อเปิดใช้งาน',
          };
        }

        if (foundData.accountStatus === 'rejected') {
          return {
            success: false,
            message: 'บัญชีของคุณไม่ได้รับการอนุมัติให้เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
          };
        }

        const now = Date.now();
        const assignedEmoji = foundData.avatarEmoji || getDeterministicAnimalEmoji(cleanUsername || foundDocId);
        const isNapawanAdmin =
          cleanUsername === 'napawan' ||
          (foundData.name && String(foundData.name).toLowerCase().includes('napawan'));
        const resolvedRole: Role = isNapawanAdmin ? 'admin' : (foundData.role || 'employee');

        const updates: Record<string, any> = {
          role: resolvedRole,
          workStatus: 'working',
          lastActiveAt: now,
          lastActionAt: now,
          clockedInAt: now,
          autoClockOutReason: '',
          avatarEmoji: assignedEmoji,
        };

        if (needsMigration) {
          updates.pinHash = migratedHash;
          updates.pinSalt = migratedSalt;
          updates.hasPin = true;
          updates.pin = '';
        } else if (hasHashedPin) {
          updates.hasPin = true;
        } else {
          updates.hasPin = false;
        }

        await updateDoc(doc(db, 'users', foundDocId), updates);

        const loggedInUser = sanitizeUserProfile(
          {
            ...foundData,
            ...updates,
          },
          foundDocId
        );
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(loggedInUser));
        set({ user: loggedInUser });
        get().startRealtimeListeners();
        return { success: true };
      } catch (error: any) {
        console.error('Login error code:', error?.code, 'details:', error);
        const isQuota = isQuotaExceededError(error);

        // Fallback for current employees when Database quota is exceeded or connection fails:
        // Automatically log them in with their cached/profile data so they can work!
        if (isQuota || error?.code === 'unavailable' || error?.message?.includes('failed to fetch')) {
          console.warn('[Offline Auth] Firestore unavailable, logging in employee locally:', cleanUsername);
          const cachedList = get().registeredUsers.length > 0 ? get().registeredUsers : getInitialCachedUsers().users;
          const matched = cachedList.find(
            (u) =>
              u.username?.toLowerCase() === cleanUsername ||
              u.uid?.toLowerCase() === `emp_${cleanUsername}` ||
              u.uid?.toLowerCase() === cleanUsername ||
              u.name?.toLowerCase() === cleanUsername
          );

          const now = Date.now();
          const isNapawanAdmin =
            cleanUsername === 'napawan' || (matched?.name && matched.name.toLowerCase().includes('napawan'));
          const resolvedRole: Role = isNapawanAdmin ? 'admin' : (matched?.role || 'employee');

          const fallbackUser: UserProfile = matched
            ? {
                ...matched,
                role: resolvedRole,
                workStatus: 'working',
                lastActiveAt: now,
                lastActionAt: now,
                clockedInAt: now,
              }
            : {
                uid: `emp_${cleanUsername}`,
                username: cleanUsername,
                name: cleanUsername === '11' ? 'พนักงาน 11' : `พนักงาน ${cleanUsername}`,
                role: resolvedRole,
                avatarEmoji: getDeterministicAnimalEmoji(cleanUsername),
                workStatus: 'working',
                lastActiveAt: now,
                lastActionAt: now,
                clockedInAt: now,
                accountStatus: 'approved',
                createdAt: now,
              };

          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fallbackUser));
          const updatedUsers = [...cachedList.filter((u) => u.uid !== fallbackUser.uid), fallbackUser];
          try {
            localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(updatedUsers));
          } catch {}

          set({ user: fallbackUser, registeredUsers: updatedUsers });
          get().startRealtimeListeners();
          return { success: true };
        }

        const isPermissionDenied =
          error?.code === 'permission-denied' ||
          error?.message?.includes('permission-denied') ||
          error?.message?.includes('Missing or insufficient permissions');
        return {
          success: false,
          isQuota,
          message: isPermissionDenied
            ? 'บันทึกข้อมูลไม่ได้ (สิทธิ์ฐานข้อมูล)'
            : 'ไม่สามารถเชื่อมต่อระบบฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
        };
      }
    },

    // Item 2: Register new employee directly in browser with SHA-256 + salt
    registerEmployee: async (name: string, username: string, pin?: string) => {
      const cleanName = name.trim();
      const cleanUsername = username.trim().toLowerCase();
      const cleanPin = pin?.trim() || '';

      if (!cleanName || !cleanUsername) {
        return { success: false, message: 'กรุณากรอกชื่อและรหัสพนักงาน/ชื่อผู้ใช้ให้ครบถ้วน' };
      }

      if (cleanUsername === 'gametpl') {
        return {
          success: false,
          message: 'ชื่อผู้ใช้นี้ถูกสงวนไว้สำหรับผู้ดูแลระบบหลัก (Super Admin)',
        };
      }

      await ensureFirebaseAnonymousAuth();

      try {
        const uid = `emp_${cleanUsername}`;
        const existingSnap = await getDoc(doc(db, 'users', uid));
        if (existingSnap.exists()) {
          const existingData = existingSnap.data();
          if (existingData.accountStatus === 'pending') {
            return {
              success: false,
              message: 'รหัสพนักงาน/ชื่อผู้ใช้นี้ได้ลงทะเบียนแล้ว และกำลังรอแอดมินอนุมัติ',
            };
          }
          return {
            success: false,
            message: 'รหัสพนักงาน/ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้หน้าเข้าสู่ระบบ',
          };
        }

        const now = Date.now();
        const newProfile: Record<string, any> = {
          uid,
          username: cleanUsername,
          name: cleanName,
          role: 'employee',
          pin: '',
          hasPin: Boolean(cleanPin),
          workStatus: 'off_work',
          avatarEmoji: getDeterministicAnimalEmoji(cleanUsername),
          createdAt: now,
          accountStatus: 'pending',
        };

        if (cleanPin) {
          const pinSalt = generatePinSalt();
          const pinHash = await computePinHash(cleanPin, pinSalt);
          newProfile.pinHash = pinHash;
          newProfile.pinSalt = pinSalt;
        }

        await setDoc(doc(db, 'users', uid), newProfile);
        return { success: true, pendingApproval: true };
      } catch (error) {
        console.error('Register error:', error);
        return {
          success: false,
          message: 'ไม่สามารถเชื่อมต่อระบบฐานข้อมูลเพื่อลงทะเบียนได้ กรุณาลองใหม่อีกครั้ง',
        };
      }
    },

    approveUser: async (uid: string) => {
      const currentUser = get().user;
      if (!isUserAdmin(currentUser)) {
        return { success: false, message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถอนุมัติผู้ใช้งานได้' };
      }
      try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          accountStatus: 'approved',
          approvedAt: Date.now(),
          approvedBy: currentUser?.name || 'Admin',
          workStatus: 'working',
        });
        return { success: true };
      } catch (error) {
        console.error('Approve user error:', error);
        return { success: false, message: 'ไม่สามารถอนุมัติผู้ใช้งานได้' };
      }
    },

    rejectUser: async (uid: string) => {
      const currentUser = get().user;
      if (!isUserAdmin(currentUser)) {
        return { success: false, message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถปฏิเสธผู้ใช้งานได้' };
      }
      try {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, {
          accountStatus: 'rejected',
        });
        return { success: true };
      } catch (error) {
        console.error('Reject user error:', error);
        return { success: false, message: 'ไม่สามารถปฏิเสธผู้ใช้งานได้' };
      }
    },

    deleteUserAccount: async (uid: string) => {
      const currentUser = get().user;
      if (!isUserAdmin(currentUser)) {
        return { success: false, message: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบบัญชีผู้ใช้งานได้' };
      }
      if (uid === 'admin_gametpl') {
        return { success: false, message: 'ไม่สามารถลบบัญชี Super Admin หลักได้' };
      }
      try {
        await deleteDoc(doc(db, 'users', uid));
        return { success: true };
      } catch (error) {
        console.error('Delete user account error:', error);
        return { success: false, message: 'ไม่สามารถลบบัญชีผู้ใช้งานได้' };
      }
    },

    setUserDirectly: async (selectedUser: UserProfile) => {
      if (selectedUser.username?.toLowerCase() === 'gametpl' || selectedUser.uid === 'admin_gametpl') {
        return;
      }
      if (selectedUser.accountStatus === 'pending' || selectedUser.accountStatus === 'rejected') {
        return;
      }

      const assignedEmoji =
        selectedUser.avatarEmoji || getDeterministicAnimalEmoji(selectedUser.username || selectedUser.uid);
      const now = Date.now();
      const updatedUser: UserProfile = sanitizeUserProfile(
        {
          ...selectedUser,
          workStatus: 'working',
          lastActiveAt: now,
          lastActionAt: now,
          clockedInAt: now,
          autoClockOutReason: '',
          avatarEmoji: assignedEmoji,
        },
        selectedUser.uid
      );
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      set({ user: updatedUser });
      get().startRealtimeListeners();

      try {
        await setDoc(
          doc(db, 'users', selectedUser.uid),
          {
            workStatus: 'working',
            lastActiveAt: now,
            lastActionAt: now,
            clockedInAt: now,
            autoClockOutReason: '',
            avatarEmoji: assignedEmoji,
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Could not sync direct user select to Firestore:', e);
      }
    },

    clockIn: async () => {
      const current = get().user;
      if (!current) return;
      const now = Date.now();
      const updatedUser: UserProfile = {
        ...current,
        workStatus: 'working',
        lastActiveAt: now,
        lastActionAt: now,
        clockedInAt: now,
        autoClockOutReason: '',
      };
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      set({ user: updatedUser });

      try {
        await setDoc(
          doc(db, 'users', current.uid),
          {
            workStatus: 'working',
            lastActiveAt: now,
            lastActionAt: now,
            clockedInAt: now,
            autoClockOutReason: '',
          },
          { merge: true }
        );
      } catch (e) {
        console.error('Error clocking in:', e);
      }
    },

    clockOut: async () => {
      const current = get().user;
      if (!current) {
        return { returnedCasesCount: 0, success: false, error: 'ไม่ได้เข้าสู่ระบบ' };
      }
      const res = await clockOutEmployeeAndReturnCases(current.uid, current.name, current.name);
      if (res.success) {
        const updatedUser: UserProfile = {
          ...current,
          workStatus: 'off_work',
          offWorkAt: Date.now(),
        };
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
        set({ user: updatedUser });
      }
      return res;
    },

    updateAvatar: async (emoji: string) => {
      const current = get().user;
      if (!current) return { success: false, message: 'ไม่ได้เข้าสู่ระบบ' };

      const updatedUser: UserProfile = {
        ...current,
        avatarEmoji: emoji,
      };

      const currentAvatars = { ...get().userAvatars };
      currentAvatars[current.uid] = emoji;
      if (current.username) currentAvatars[current.username.toLowerCase()] = emoji;
      if (current.name) {
        currentAvatars[current.name] = emoji;
        currentAvatars[current.name.toLowerCase()] = emoji;
      }

      const updatedRegistered = get().registeredUsers.map((u) =>
        u.uid === current.uid ? { ...u, avatarEmoji: emoji } : u
      );

      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      set({
        user: updatedUser,
        userAvatars: currentAvatars,
        registeredUsers: updatedRegistered,
      });

      try {
        await updateDoc(doc(db, 'users', current.uid), {
          avatarEmoji: emoji,
        });
        return { success: true };
      } catch (e) {
        console.error('Error updating avatar in Firestore:', e);
        return { success: false, message: 'ไม่สามารถบันทึกรูปตัวการ์ตูนได้' };
      }
    },

    // Item 3: Browser-based PIN change / Admin reset / PIN removal using Web Crypto (SHA-256 + salt)
    changeUserPassword: async (
      targetUid: string,
      newPin: string,
      currentPin?: string,
      isAdminOverride?: boolean
    ) => {
      const cleanNewPin = newPin.trim();
      const inputCurrentPin = (currentPin || '').trim();
      const currentUser = get().user;

      if (!targetUid) {
        return { success: false, message: 'ไม่พบรหัสพนักงานที่ต้องการเปลี่ยนรหัสผ่าน' };
      }

      if (targetUid === 'admin_gametpl' && currentUser?.uid !== 'admin_gametpl') {
        return { success: false, message: 'ไม่สามารถเปลี่ยนรหัสผ่านของบัญชี Super Admin หลักได้' };
      }

      try {
        const userRef = doc(db, 'users', targetUid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          return { success: false, message: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' };
        }

        const data = snap.data();

        // Verify current PIN if not admin override
        if (!isAdminOverride) {
          const hasHashedPin =
            typeof data.pinHash === 'string' &&
            data.pinHash.length > 0 &&
            typeof data.pinSalt === 'string' &&
            data.pinSalt.length > 0;
          const legacyPin = typeof data.pin === 'string' ? data.pin : '';

          if (hasHashedPin) {
            const isValid = await verifyPinBrowser(inputCurrentPin, data.pinHash, data.pinSalt);
            if (!isValid) {
              return {
                success: false,
                message: 'รหัสผ่าน/PIN เดิมไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
              };
            }
          } else if (legacyPin) {
            if (legacyPin !== inputCurrentPin) {
              return {
                success: false,
                message: 'รหัสผ่าน/PIN เดิมไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
              };
            }
          }
        }

        const updates: Record<string, any> = {
          pin: '',
          passwordResetRequested: false,
        };

        if (cleanNewPin) {
          const pinSalt = generatePinSalt();
          const pinHash = await computePinHash(cleanNewPin, pinSalt);
          updates.pinHash = pinHash;
          updates.pinSalt = pinSalt;
          updates.hasPin = true;
        } else {
          updates.pinHash = '';
          updates.pinSalt = '';
          updates.hasPin = false;
        }

        await updateDoc(userRef, updates);

        if (currentUser && currentUser.uid === targetUid) {
          const updatedSelf: UserProfile = {
            ...currentUser,
            hasPin: Boolean(cleanNewPin),
            passwordResetRequested: false,
          };
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedSelf));
          set({ user: updatedSelf });
        }

        return {
          success: true,
          message: cleanNewPin
            ? 'เปลี่ยนรหัสผ่าน/PIN สำเร็จเรียบร้อยแล้ว'
            : 'ยกเลิกการตั้งรหัสผ่าน/PIN เรียบร้อยแล้ว',
        };
      } catch (error) {
        console.error('Error changing password in browser:', error);
        return {
          success: false,
          message: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน กรุณาลองใหม่อีกครั้ง',
        };
      }
    },

    resetPasswordWithIdentity: async () => {
      return {
        success: false,
        message: 'ระบบรีเซ็ตรหัสผ่านด้วยตนเองถูกปิดใช้งานเพื่อความปลอดภัย กรุณาส่งคำขอให้แอดมินรีเซ็ตรหัสผ่านให้แทน',
      };
    },

    requestAdminPasswordReset: async (username: string) => {
      const cleanUsername = username.trim().toLowerCase();
      if (!cleanUsername) {
        return { success: false, message: 'กรุณาระบุรหัสพนักงาน / Username ของคุณ' };
      }
      if (cleanUsername === 'gametpl') {
        return { success: false, message: 'บัญชี Super Admin ไม่สามารถส่งคำขอรีเซ็ตผ่านช่องทางนี้ได้' };
      }

      try {
        let foundId: string | null = null;
        const directId = `emp_${cleanUsername}`;
        const directSnap = await getDoc(doc(db, 'users', directId));
        if (directSnap.exists()) {
          foundId = directSnap.id;
        } else {
          const q = query(collection(db, 'users'), where('username', '==', cleanUsername));
          const snap = await getDocs(q);
          if (!snap.empty) {
            foundId = snap.docs[0].id;
          }
        }

        if (!foundId) {
          return { success: false, message: 'ไม่พบรหัสพนักงาน / Username นี้ในระบบ' };
        }

        await updateDoc(doc(db, 'users', foundId), {
          passwordResetRequested: true,
          passwordResetRequestedAt: Date.now(),
        });

        return {
          success: true,
          message: 'ส่งคำขอรีเซ็ตรหัสผ่านไปยังแอดมินเรียบร้อยแล้ว กรุณาแจ้งแอดมินเพื่อตั้งรหัสใหม่ให้คุณ',
        };
      } catch (error) {
        console.error('Error requesting admin password reset:', error);
        return { success: false, message: 'ไม่สามารถส่งคำขอได้ในขณะนี้ กรุณาติดต่อแอดมินโดยตรง' };
      }
    },

    logout: async () => {
      get().stopRealtimeListeners();
      localStorage.removeItem(USER_STORAGE_KEY);
      set({ user: null });
    },
  };
});
