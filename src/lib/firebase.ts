import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

let anonymousAuthPromise: Promise<void> | null = null;
export let isAnonymousAuthSupported = true;

export function ensureFirebaseAnonymousAuth(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (auth.currentUser) return Promise.resolve();
  if (anonymousAuthPromise) return anonymousAuthPromise;

  anonymousAuthPromise = new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      unsub();
      if (firebaseUser) {
        resolve();
        return;
      }
      try {
        await signInAnonymously(auth);
        isAnonymousAuthSupported = true;
      } catch (err: any) {
        // If Anonymous Auth is not enabled in Firebase Console, fall back gracefully without breaking PIN login
        isAnonymousAuthSupported = false;
        console.warn('[Firebase Auth] Anonymous sign-in not enabled or restricted, continuing with PIN session:', err?.code || err?.message);
      }
      resolve();
    });
  });

  return anonymousAuthPromise;
}

// Messaging is optional and not supported in sandboxed iframes or certain mobile browsers.
// We safely guard with isSupported() so it never throws "messaging/unsupported-browser".
export let messaging: any = null;
if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator) {
  import('firebase/messaging')
    .then(({ isSupported, getMessaging }) => {
      isSupported()
        .then((supported) => {
          if (supported) {
            try {
              messaging = getMessaging(app);
            } catch {
              messaging = null;
            }
          }
        })
        .catch(() => {
          messaging = null;
        });
    })
    .catch(() => {
      messaging = null;
    });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
  return (
    msg.includes('Quota exceeded') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Free daily read units') ||
    msg.includes('free tier database') ||
    msg.includes('quota metric') ||
    (msg.includes('firestore.googleapis.com') && msg.toLowerCase().includes('quota'))
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errString = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
  const isQuota = isQuotaExceededError(error) || isQuotaExceededError(errString);

  const errInfo: FirestoreErrorInfo = {
    error: errString,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  if (isQuota) {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('firestore_quota_exceeded', 'true');
        localStorage.setItem('firestore_quota_exceeded', 'true');
        window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: errInfo }));
      } catch {
        // ignore
      }
    }
    console.warn(`[Firestore Quota Exceeded] ${operationType} on ${path || 'database'}`);
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
