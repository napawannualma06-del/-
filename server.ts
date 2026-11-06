import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  limit,
  orderBy,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Initialize Firebase
let firebaseConfig: any = {};
try {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read firebase-applet-config.json:', e);
}

const app_firebase = initializeApp(firebaseConfig);
const db = getFirestore(app_firebase, firebaseConfig.firestoreDatabaseId);

// ============================================================================
// PIN Hashing Helpers (SHA-256 + Salt)
// ============================================================================
function createPinHash(pin: string, salt?: string): { pinHash: string; pinSalt: string } {
  const pinSalt = salt || crypto.randomBytes(16).toString('hex');
  const pinHash = crypto
    .createHash('sha256')
    .update(`${pinSalt}:${pin}`)
    .digest('hex');
  return { pinHash, pinSalt };
}

function verifyPinHash(pin: string, pinHash: string, pinSalt: string): boolean {
  if (!pinHash || !pinSalt) return false;
  const computed = crypto
    .createHash('sha256')
    .update(`${pinSalt}:${pin}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(pinHash, 'hex'));
  } catch {
    return computed === pinHash;
  }
}

function sanitizeUserForClient(raw: Record<string, any>, uid: string): Record<string, any> {
  const hasPin = Boolean(
    (typeof raw.pinHash === 'string' && raw.pinHash.length > 0) ||
    (typeof raw.pin === 'string' && raw.pin.length > 0)
  );
  const copy: Record<string, any> = { ...raw, uid, hasPin };
  delete copy.pin;
  delete copy.pinHash;
  delete copy.pinSalt;
  return copy;
}

const ANIMAL_EMOJIS = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵',
  '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇',
  '🐺', '🐗', '🐴', '🦄', '🐝', '🦋', '🐌', '🐞',
  '🐢', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠', '🐬',
  '🐳', '🦈', '🦭', '🐊', '🐅', '🐆', '🦓', '🦍',
  '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒',
  '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏',
  '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐈',
  '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊️',
  '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁',
  '🐀', '🐿️', '🦔', '🐉'
];

function getDeterministicAnimalEmoji(identifier: string): string {
  const clean = (identifier || 'default').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return ANIMAL_EMOJIS[hash % ANIMAL_EMOJIS.length];
}

// ============================================================================
// Server-Side Background Maintenance (Runs once every 10 minutes on backend)
// 1. Auto-cancel expired cases (> 3 days old, only pending/stuck, never closed)
// 2. Auto clock-out inactive employees (> 3 hours idle, excluding admins)
// ============================================================================
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const AUTO_CANCEL_REMARK = 'ยกเลิกอัตโนมัติ (เคสค้าง/รอรับเกิน 3 วัน)';

async function runServerMaintenanceSweep() {
  const now = Date.now();
  try {
    const activeCasesQuery = query(
      collection(db, 'cases'),
      where('status', 'in', ['pending', 'credit_check', 'processing'])
    );
    const activeCasesSnap = await getDocs(activeCasesQuery);
    const activeCases: Array<Record<string, any>> = [];
    activeCasesSnap.forEach((d) => {
      activeCases.push({ id: d.id, ...d.data() });
    });

    const usersSnap = await getDocs(collection(db, 'users'));
    const usersList: Array<Record<string, any>> = [];
    usersSnap.forEach((d) => {
      usersList.push({ uid: d.id, ...d.data() });
    });

    // 1. Check 3-day expired cases (only pending or stuck, never closed)
    const expiredCases = activeCases.filter((c) => {
      if (!c.createdAt) return false;
      if (now - c.createdAt < THREE_DAYS_MS) return false;
      const isPending = c.status === 'pending' && !c.assigneeId && !c.isStuck;
      const assigneeUser = usersList.find((u) => u.uid === c.assigneeId || u.name === c.assigneeName);
      const isAssigneeOffWork = assigneeUser?.workStatus === 'off_work';
      const isStuck =
        Boolean(c.isStuck) ||
        Boolean(c.returnedBy) ||
        Boolean(c.previousAssigneeName) ||
        isAssigneeOffWork;
      return isPending || isStuck;
    });

    if (expiredCases.length > 0) {
      const batch = writeBatch(db);
      for (const c of expiredCases) {
        const currentRemarks = c.remarks?.trim() || '';
        const newRemarks = currentRemarks.includes('เกิน 3 วัน')
          ? currentRemarks
          : currentRemarks
          ? `${currentRemarks} | ${AUTO_CANCEL_REMARK}`
          : AUTO_CANCEL_REMARK;
        batch.update(doc(db, 'cases', c.id), {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: 'ระบบอัตโนมัติ (เกิน 3 วัน)',
          updatedAt: now,
          remarks: newRemarks,
          remarksUpdatedAt: now,
          remarksUpdatedBy: 'ระบบอัตโนมัติ',
        });
      }
      await batch.commit();
      console.log(`[Server Maintenance] Auto-cancelled ${expiredCases.length} expired cases (>3 days).`);
    }

    // 2. Check inactive working employees (> 3 hours without activity, excluding admins)
    for (const emp of usersList) {
      if (!emp.uid || emp.workStatus !== 'working') continue;
      if (emp.username === 'gametpl' || emp.uid === 'admin_gametpl' || emp.role === 'admin') continue;
      const lastActive = emp.lastActiveAt || emp.lastActionAt || emp.clockedInAt || emp.createdAt || 0;
      if (lastActive > 0 && now - lastActive >= THREE_HOURS_MS) {
        const empActiveCases = activeCases.filter(
          (c) =>
            (c.assigneeId === emp.uid || c.assigneeName === emp.name) &&
            (c.status === 'credit_check' || c.status === 'processing')
        );
        const batch = writeBatch(db);
        const reason = 'ไม่มีการเคลื่อนไหวในระบบเกิน 3 ชั่วโมง';
        batch.update(doc(db, 'users', emp.uid), {
          workStatus: 'off_work',
          offWorkAt: now,
          autoClockOutReason: reason,
        });
        for (const c of empActiveCases) {
          batch.update(doc(db, 'cases', c.id), {
            status: 'pending',
            assigneeId: null,
            assigneeName: null,
            previousAssigneeId: emp.uid,
            previousAssigneeName: emp.name || emp.username,
            returnedBy: `${emp.name || emp.username} (ระบบพักงานอัตโนมัติ)`,
            returnedById: emp.uid,
            returnedAt: now,
            returnedReason: `คืนเคสอัตโนมัติ: ${reason}`,
            updatedAt: now,
          });
        }
        await batch.commit();
        console.log(`[Server Maintenance] Auto clocked-out inactive employee: ${emp.name || emp.username}`);
      }
    }
  } catch (err: any) {
    console.warn('[Server Maintenance] Sweep skipped or failed:', err?.message || err);
  }
}

const DEFAULT_API_KEY = 'sk_live_qcase_2026';

// Cache API key in memory with TTL to keep responses fast while allowing rotation
let cachedApiKey = DEFAULT_API_KEY;
let cacheExpiry = 0;

async function getActiveApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && now < cacheExpiry) {
    return cachedApiKey;
  }

  try {
    const docRef = doc(db, 'system_settings', 'api_config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.apiKey) {
        cachedApiKey = data.apiKey;
        cacheExpiry = now + 15000; // cache for 15s
        return cachedApiKey;
      }
    }
  } catch (err) {
    console.warn('Error fetching API key from Firestore:', err);
  }

  cachedApiKey = DEFAULT_API_KEY;
  cacheExpiry = now + 15000;
  return cachedApiKey;
}

const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Universal CORS configuration for API calls from the main website
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ============================================================================
// PIN AUTHENTICATION & MIGRATION ENDPOINTS (SHA-256 + SALT)
// ============================================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const rawUsername = String(req.body?.username || '').trim().toLowerCase();
    const inputPin = String(req.body?.pin || '').trim();

    if (!rawUsername) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้' });
    }

    // Super Admin "gametpl"
    if (rawUsername === 'gametpl') {
      if (inputPin !== 'gametpl') {
        return res.status(401).json({
          success: false,
          message: 'รหัสผ่านสำหรับบัญชีผู้ดูแลระบบ (gametpl) ไม่ถูกต้อง',
        });
      }
      const adminUid = 'admin_gametpl';
      const now = Date.now();
      const { pinHash, pinSalt } = createPinHash('gametpl');
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
        console.warn('[Auth Login] Could not write admin_gametpl to Firestore:', err?.message);
      }
      return res.json({
        success: true,
        user: sanitizeUserForClient(adminProfile, adminUid),
      });
    }

    // Look up employee by document ID `emp_${rawUsername}` first (1 document read!), fallback to query if needed
    let foundDocId: string | null = null;
    let foundData: Record<string, any> | null = null;

    const directId = `emp_${rawUsername}`;
    const directSnap = await getDoc(doc(db, 'users', directId));
    if (directSnap.exists()) {
      foundDocId = directSnap.id;
      foundData = directSnap.data();
    } else {
      const q = query(collection(db, 'users'), where('username', '==', rawUsername));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        foundDocId = qSnap.docs[0].id;
        foundData = qSnap.docs[0].data();
      }
    }

    if (!foundDocId || !foundData) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบชื่อผู้ใช้นี้ในระบบ กรุณาลงทะเบียนพนักงานใหม่ก่อนเข้าใช้งาน',
      });
    }

    // Verify PIN (supports both SHA-256 hashed PIN and legacy plaintext PIN with automatic migration)
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
      const isValid = verifyPinHash(inputPin, foundData.pinHash, foundData.pinSalt);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
        });
      }
      if (legacyPin) {
        needsMigration = true;
        migratedHash = foundData.pinHash;
        migratedSalt = foundData.pinSalt;
      }
    } else if (legacyPin) {
      if (legacyPin !== inputPin) {
        return res.status(401).json({
          success: false,
          message: 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
        });
      }
      // Automatically migrate legacy plaintext PIN to SHA-256 + salt!
      const hashed = createPinHash(legacyPin);
      needsMigration = true;
      migratedHash = hashed.pinHash;
      migratedSalt = hashed.pinSalt;
    }

    if (foundData.accountStatus === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'บัญชีของคุณอยู่ระหว่างรอแอดมินอนุมัติ กรุณาแจ้งผู้ดูแลระบบเพื่อเปิดใช้งาน',
      });
    }

    if (foundData.accountStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        message: 'บัญชีของคุณไม่ได้รับการอนุมัติให้เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
      });
    }

    const now = Date.now();
    const assignedEmoji = foundData.avatarEmoji || getDeterministicAnimalEmoji(rawUsername || foundDocId);
    const isNapawanAdmin =
      rawUsername === 'napawan' ||
      (foundData.name && String(foundData.name).toLowerCase().includes('napawan'));
    const resolvedRole = isNapawanAdmin ? 'admin' : (foundData.role || 'employee');

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

    try {
      await updateDoc(doc(db, 'users', foundDocId), updates);
    } catch (err: any) {
      console.warn('[Auth Login] Could not update user login status in Firestore:', err?.message);
    }

    const updatedUser = {
      ...foundData,
      ...updates,
      uid: foundDocId,
    };

    return res.json({
      success: true,
      user: sanitizeUserForClient(updatedUser, foundDocId),
    });
  } catch (error: any) {
    console.error('[Auth Login Error]:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ',
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const cleanName = String(req.body?.name || '').trim();
    const cleanUsername = String(req.body?.username || '').trim().toLowerCase();
    const cleanPin = String(req.body?.pin || '').trim();

    if (!cleanName || !cleanUsername) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกชื่อและรหัสพนักงาน/ชื่อผู้ใช้ให้ครบถ้วน',
      });
    }

    if (cleanUsername === 'gametpl') {
      return res.status(400).json({
        success: false,
        message: 'ชื่อผู้ใช้นี้ถูกสงวนไว้สำหรับผู้ดูแลระบบหลัก (Super Admin)',
      });
    }

    const uid = `emp_${cleanUsername}`;
    const existingSnap = await getDoc(doc(db, 'users', uid));
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      if (existingData.accountStatus === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'รหัสพนักงาน/ชื่อผู้ใช้นี้ได้ลงทะเบียนแล้ว และกำลังรอแอดมินอนุมัติ',
        });
      }
      return res.status(400).json({
        success: false,
        message: 'รหัสพนักงาน/ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้หน้าเข้าสู่ระบบ',
      });
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
      const { pinHash, pinSalt } = createPinHash(cleanPin);
      newProfile.pinHash = pinHash;
      newProfile.pinSalt = pinSalt;
    }

    await setDoc(doc(db, 'users', uid), newProfile);
    return res.json({
      success: true,
      pendingApproval: true,
      user: sanitizeUserForClient(newProfile, uid),
    });
  } catch (error: any) {
    console.error('[Auth Register Error]:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'เกิดข้อผิดพลาดในการลงทะเบียน',
    });
  }
});

app.post('/api/auth/change-pin', async (req, res) => {
  try {
    const targetUid = String(req.body?.targetUid || '').trim();
    const currentPin = String(req.body?.currentPin || '').trim();
    const newPin = String(req.body?.newPin || '').trim();
    const isAdminOverride = Boolean(req.body?.isAdminOverride);

    if (!targetUid) {
      return res.status(400).json({ success: false, message: 'ไม่พบรหัสพนักงานที่ต้องการเปลี่ยนรหัสผ่าน' });
    }

    const userRef = doc(db, 'users', targetUid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' });
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
        if (!verifyPinHash(currentPin, data.pinHash, data.pinSalt)) {
          return res.status(401).json({
            success: false,
            message: 'รหัสผ่าน/PIN เดิมไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
          });
        }
      } else if (legacyPin) {
        if (legacyPin !== currentPin) {
          return res.status(401).json({
            success: false,
            message: 'รหัสผ่าน/PIN เดิมไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
          });
        }
      }
    }

    const updates: Record<string, any> = {
      pin: '',
      passwordResetRequested: false,
    };

    if (newPin) {
      const { pinHash, pinSalt } = createPinHash(newPin);
      updates.pinHash = pinHash;
      updates.pinSalt = pinSalt;
      updates.hasPin = true;
    } else {
      updates.pinHash = '';
      updates.pinSalt = '';
      updates.hasPin = false;
    }

    await updateDoc(userRef, updates);

    return res.json({
      success: true,
      hasPin: Boolean(newPin),
      message: newPin ? 'เปลี่ยนรหัสผ่าน/PIN สำเร็จเรียบร้อยแล้ว' : 'ยกเลิกการตั้งรหัสผ่าน/PIN เรียบร้อยแล้ว',
    });
  } catch (error: any) {
    console.error('[Auth Change PIN Error]:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน',
    });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'Q-Case Verification API',
    timestamp: Date.now(),
  });
});

// Verification endpoint for the main website (Supports both GET and POST)
app.all('/api/cases/verify', async (req, res) => {
  try {
    // 1. Authenticate with API Key
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    const headerApiKey = req.headers['x-api-key'] as string;
    const queryApiKey = req.query.apiKey as string;
    const providedApiKey = (headerApiKey || bearerToken || queryApiKey || '').trim();

    const activeApiKey = await getActiveApiKey();

    if (!providedApiKey || providedApiKey !== activeApiKey) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'API Key ไม่ถูกต้อง หรือไม่ได้ระบุ API Key (กรุณาส่ง Header x-api-key: YOUR_KEY หรือ Bearer token)',
      });
    }

    // 2. Extract requested Case Key
    const rawKey = (req.query.key || (req.body && req.body.key) || '').toString().trim();
    if (!rawKey) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_KEY',
        message: 'กรุณาระบุรหัสเคสที่ต้องการตรวจสอบ เช่น /api/cases/verify?key=A9B2K7 หรือ body { "key": "A9B2K7" }',
      });
    }

    const cleanKey = rawKey.replace(/^#/, '').toUpperCase();

    // 3. Search in Firestore
    const casesRef = collection(db, 'cases');
    const q1 = query(casesRef, where('caseKey', '==', cleanKey));
    const snap1 = await getDocs(q1);

    let matchedDoc: any = null;
    let matchedData: any = null;

    if (!snap1.empty) {
      matchedDoc = snap1.docs[0];
      matchedData = matchedDoc.data();
    } else {
      // Fallback search limited to recent 100 cases instead of scanning entire collection
      const allSnap = await getDocs(query(casesRef, orderBy('createdAt', 'desc'), limit(100)));
      for (const d of allSnap.docs) {
        const data = d.data();
        if (data.caseKey && data.caseKey.toUpperCase().replace(/^#/, '') === cleanKey) {
          matchedDoc = d;
          matchedData = data;
          break;
        }
        if (d.id.slice(-6).toUpperCase() === cleanKey) {
          matchedDoc = d;
          matchedData = data;
          break;
        }
      }
    }

    if (!matchedDoc || !matchedData) {
      return res.status(200).json({
        success: true,
        exists: false,
        key: cleanKey,
        message: `ไม่พบเคสที่ตรงกับรหัส #${cleanKey} ในระบบ`,
      });
    }

    const statusThaiMap: Record<string, string> = {
      pending: 'รอดำเนินการ',
      credit_check: 'ตรวจเครดิต',
      processing: 'กำลังดำเนินการ',
      closed: 'ปิดเคสเรียบร้อย',
      cancelled: 'ยกเลิกเคส',
    };

    return res.status(200).json({
      success: true,
      exists: true,
      case: {
        key: matchedData.caseKey || cleanKey,
        id: matchedDoc.id,
        status: matchedData.status,
        statusLabel: statusThaiMap[matchedData.status] || matchedData.status,
        agentName: matchedData.agentName || null,
        iphoneModel: matchedData.iphoneModel || null,
        province: matchedData.province || null,
        taskTitle: matchedData.taskTitle || null,
        isCustomTask: Boolean(matchedData.isCustomTask),
        assigneeName: matchedData.assigneeName || null,
        contractNumber: matchedData.contractNumber || null,
        remarks: matchedData.remarks || null,
        isStuck: Boolean(matchedData.isStuck),
        createdAt: matchedData.createdAt || null,
        completedAt: matchedData.completedAt || null,
      },
    });
  } catch (err: any) {
    console.error('API Verify Error:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Internal server error',
    });
  }
});

// Admin helper endpoint to read current API config
app.get('/api/admin/api-config', async (_req, res) => {
  try {
    const docRef = doc(db, 'system_settings', 'api_config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return res.json({ success: true, config: snap.data() });
    }
    return res.json({
      success: true,
      config: {
        apiKey: DEFAULT_API_KEY,
        updatedAt: Date.now(),
        updatedBy: 'Default',
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Vite & Static file serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const PORT = Number(process.env.PORT) || 3000;

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Q-Case Server] Listening on http://0.0.0.0:${PORT} (Dev/Prod: ${isProd ? 'Production' : 'Development'})`);
    // Schedule server-side maintenance sweep once every 10 minutes
    setInterval(() => {
      runServerMaintenanceSweep();
    }, 10 * 60 * 1000);
  });
}

startServer().catch((err) => {
  console.error('[Q-Case Server] Startup Error:', err);
  process.exit(1);
});
