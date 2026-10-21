import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

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
      // Fallback search: scan for matching caseKey or last 6 characters of document ID
      const allSnap = await getDocs(casesRef);
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
  });
}

startServer().catch((err) => {
  console.error('[Q-Case Server] Startup Error:', err);
  process.exit(1);
});
