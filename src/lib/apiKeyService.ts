import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export const DEFAULT_API_KEY = 'sk_live_qcase_2026';

export interface ApiConfig {
  apiKey: string;
  updatedAt: number;
  updatedBy: string;
}

/**
 * Generate a secure, readable API key with prefix sk_live_qcase_
 */
export function generateRandomApiKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let randomPart = '';
  for (let i = 0; i < 24; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `sk_live_qcase_${randomPart}`;
}

/**
 * Fetch the active API config from Firestore.
 * If not yet created, initializes with DEFAULT_API_KEY.
 */
export async function getActiveApiConfig(): Promise<ApiConfig> {
  try {
    const docRef = doc(db, 'system_settings', 'api_config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.apiKey) {
        return {
          apiKey: data.apiKey,
          updatedAt: data.updatedAt || Date.now(),
          updatedBy: data.updatedBy || 'System',
        };
      }
    }

    // Initialize with default API key
    const initialConfig: ApiConfig = {
      apiKey: DEFAULT_API_KEY,
      updatedAt: Date.now(),
      updatedBy: 'System Init',
    };
    await setDoc(docRef, initialConfig, { merge: true });
    return initialConfig;
  } catch (err) {
    console.warn('Could not read api_config from Firestore, using default:', err);
    return {
      apiKey: DEFAULT_API_KEY,
      updatedAt: Date.now(),
      updatedBy: 'Fallback',
    };
  }
}

/**
 * Update / Rotate the API Key in Firestore.
 */
export async function saveApiConfig(newApiKey: string, adminName: string): Promise<ApiConfig> {
  const docRef = doc(db, 'system_settings', 'api_config');
  const updatedConfig: ApiConfig = {
    apiKey: newApiKey.trim(),
    updatedAt: Date.now(),
    updatedBy: adminName || 'Admin',
  };
  await setDoc(docRef, updatedConfig, { merge: true });
  return updatedConfig;
}
