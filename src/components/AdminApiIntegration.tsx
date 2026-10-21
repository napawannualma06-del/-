import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Copy, 
  Check, 
  RefreshCw, 
  Send, 
  ShieldCheck, 
  Code, 
  Terminal, 
  Globe, 
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  HelpCircle,
  Clock,
  CheckCircle2,
  XCircle,
  BookOpen,
  FileText,
  X,
  ExternalLink
} from 'lucide-react';
import { getActiveApiConfig, saveApiConfig, generateRandomApiKey, ApiConfig } from '../lib/apiKeyService';
import { Case } from './Queue';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

interface AdminApiIntegrationProps {
  currentAdminName: string;
  cases: Case[];
}

export function AdminApiIntegration({ currentAdminName, cases }: AdminApiIntegrationProps) {
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  // Live Tester State
  const [testKeyInput, setTestKeyInput] = useState('');
  const [testMethod, setTestMethod] = useState<'GET' | 'POST'>('GET');
  const [testApiKeyInput, setTestApiKeyInput] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: number;
    timeMs: number;
    data: any;
  } | null>(null);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Code sample tab
  const [codeTab, setCodeTab] = useState<'curl' | 'js' | 'php' | 'python'>('js');

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const endpointUrl = `${originUrl}/api/cases/verify`;

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const cfg = await getActiveApiConfig();
      setApiConfig(cfg);
      setTestApiKeyInput(cfg.apiKey);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Pre-fill a sample key from real cases if available
  useEffect(() => {
    if (!testKeyInput && cases.length > 0) {
      const sample = cases.find(c => c.caseKey) || cases[0];
      if (sample?.caseKey) {
        setTestKeyInput(sample.caseKey);
      }
    }
  }, [cases, testKeyInput]);

  const handleCopyKey = () => {
    if (!apiConfig?.apiKey) return;
    navigator.clipboard.writeText(apiConfig.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRegenerateKey = async () => {
    setRegenerating(true);
    try {
      const newKey = generateRandomApiKey();
      const updated = await saveApiConfig(newKey, currentAdminName);
      setApiConfig(updated);
      setTestApiKeyInput(newKey);
      setShowRegenConfirm(false);
    } catch (err) {
      console.error('Error rotating key:', err);
    } finally {
      setRegenerating(false);
    }
  };

  const handleRunTest = async () => {
    if (!testKeyInput.trim()) return;
    setTestLoading(true);
    setTestResult(null);

    const startTime = performance.now();
    try {
      let res: Response;
      const cleanKey = testKeyInput.trim().replace(/^#/, '');

      if (testMethod === 'GET') {
        res = await fetch(`/api/cases/verify?key=${encodeURIComponent(cleanKey)}`, {
          headers: {
            'x-api-key': testApiKeyInput.trim(),
          },
        });
      } else {
        res = await fetch(`/api/cases/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': testApiKeyInput.trim(),
          },
          body: JSON.stringify({ key: cleanKey }),
        });
      }

      const duration = Math.round(performance.now() - startTime);
      const json = await res.json();
      setTestResult({
        status: res.status,
        timeMs: duration,
        data: json,
      });
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime);
      setTestResult({
        status: 500,
        timeMs: duration,
        data: { error: 'NETWORK_ERROR', message: err.message },
      });
    } finally {
      setTestLoading(false);
    }
  };

  const activeKeyString = apiConfig?.apiKey || 'sk_live_qcase_2026';

  // Sample code snippets
  const curlCode = `# ตรวจสอบเคสด้วย cURL
curl -X GET "${endpointUrl}?key=${testKeyInput || 'A9B2K7'}" \\
  -H "x-api-key: ${activeKeyString}"`;

  const jsCode = `// ตัวอย่างเรียกใช้ในเว็บหลักด้วย JavaScript (Fetch)
async function verifyCase(caseKey) {
  try {
    const response = await fetch("${endpointUrl}?key=" + encodeURIComponent(caseKey), {
      method: "GET",
      headers: {
        "x-api-key": "${activeKeyString}"
      }
    });
    
    const result = await response.json();
    if (result.success && result.exists) {
      console.log("พบเคสในระบบ:", result.case);
      return result.case;
    } else {
      console.warn("ไม่พบเคสนี้:", result.message);
      return null;
    }
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเชื่อมต่อ:", error);
    return null;
  }
}

// เรียกทดสอบ
verifyCase("${testKeyInput || 'A9B2K7'}");`;

  const phpCode = `<?php
// ตัวอย่างเรียกใช้ในเว็บหลักด้วย PHP (cURL)
$caseKey = "${testKeyInput || 'A9B2K7'}";
$apiKey = "${activeKeyString}";
$url = "${endpointUrl}?key=" . urlencode($caseKey);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "x-api-key: " . $apiKey
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = json_decode($response, true);
if ($httpCode === 200 && isset($data['exists']) && $data['exists'] === true) {
    echo "พบเคสจริง: " . $data['case']['statusLabel'];
} else {
    echo "ไม่พบเคส หรือเกิดข้อผิดพลาด";
}
?>`;

  const pythonCode = `import requests

url = "${endpointUrl}"
headers = {
    "x-api-key": "${activeKeyString}"
}
params = {
    "key": "${testKeyInput || 'A9B2K7'}"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()

if response.status_code == 200 and data.get("exists"):
    print("พบเคส:", data["case"]["statusLabel"])
else:
    print("ไม่พบเคส หรือ API Key ไม่ถูกต้อง")`;

  return (
    <div className="space-y-6">
      {/* Intro banner */}
      <div className="bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-purple-500/10 dark:from-sky-950/40 dark:via-indigo-950/30 dark:to-purple-950/30 border border-sky-200/80 dark:border-sky-800/60 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-sky-500 text-white rounded-xl shadow-sm shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                ระบบ API ยืนยันรหัสเคสสำหรับเว็บหลัก
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  พร้อมใช้งาน (Active)
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-3xl leading-relaxed">
                ใช้สำหรับให้เว็บหลักส่งรหัสเคส 6 หลัก (เช่น <code className="bg-white/80 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-sky-600 dark:text-sky-400 font-bold">#A9B2K7</code>) มาตรวจสอบกับระบบนี้ เพื่อยืนยันว่ามีเคสจริง และดึงสถานะงานล่าสุดไปแสดงผลได้แบบเรียลไทม์
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadConfig}
            className="self-start sm:self-auto text-xs px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1.5 font-medium transition cursor-pointer shadow-2xs"
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
            <span>รีเฟรชข้อมูล</span>
          </button>
        </div>
      </div>

      {/* Main Grid: API Key & Endpoint Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: API Key Configuration */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">API Key ประจำระบบ</h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              อัปเดตล่าสุด: {apiConfig?.updatedAt ? format(new Date(apiConfig.updatedAt), 'dd/MM/yyyy HH:mm', { locale: th }) : '-'}
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Secret API Key (สำหรับใส่ใน Header <code className="text-sky-600 dark:text-sky-400 font-mono">x-api-key</code>)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  readOnly
                  value={apiConfig?.apiKey || 'sk_live_qcase_2026'}
                  className="w-full font-mono text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 pr-10 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                  title={showKey ? 'ซ่อน Key' : 'แสดง Key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyKey}
                className={clsx(
                  "px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs",
                  copiedKey
                    ? "bg-emerald-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                )}
              >
                {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey ? 'คัดลอกแล้ว!' : 'คัดลอก Key'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              * เก็บ Key นี้ไว้เป็นความลับ และส่งต่อไปยังทีมพัฒนาเว็บหลักเท่านั้น
            </p>
          </div>

          {/* Regenerate Warning / Action */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ต้องการเปลี่ยน Key ใหม่?
            </span>
            {!showRegenConfirm ? (
              <button
                type="button"
                onClick={() => setShowRegenConfirm(true)}
                className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-semibold px-2.5 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
              >
                สร้าง Key ใหม่ (Rotate)
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">ยืนยันหรือไม่?</span>
                <button
                  type="button"
                  onClick={handleRegenerateKey}
                  disabled={regenerating}
                  className="text-xs px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition cursor-pointer disabled:opacity-50"
                >
                  {regenerating ? 'กำลังสร้าง...' : 'ใช่, เปลี่ยนทันที'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegenConfirm(false)}
                  className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Endpoint Information */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">API Endpoint & ข้อมูลการเชื่อมต่อ</h3>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Endpoint URL
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono text-xs font-bold rounded-md">
                  GET / POST
                </span>
                <code className="text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md flex-1 truncate">
                  {endpointUrl}
                </code>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">Required Headers</span>
                <code className="font-mono text-sky-600 dark:text-sky-400 text-[11px]">x-api-key: [YOUR_KEY]</code>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">Required Param</span>
                <code className="font-mono text-purple-600 dark:text-purple-400 text-[11px]">?key=A9B2K7</code>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 pt-1">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 text-sky-500 mt-0.5" />
              <span>
                รองรับ CORS เต็มรูปแบบ เว็บหลักสามารถเรียกยิง API จากเบราว์เซอร์หรือหลังบ้าน (Node.js/PHP/Python/Go) ได้ทันทีโดยไม่ติดบล็อก
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive API Tester */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              กล่องทดสอบยิง API (Interactive Test Sandbox)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ทดสอบส่งรหัสเคสเพื่อดูผลลัพธ์ JSON ที่เว็บหลักจะได้รับจริง
            </p>
          </div>

          {/* Quick select from real cases */}
          {cases.filter(c => c.caseKey).length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-500">เลือกเคสตัวอย่าง:</span>
              {cases.filter(c => c.caseKey).slice(0, 4).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTestKeyInput(c.caseKey || '')}
                  className="px-2 py-0.5 text-[11px] font-mono font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded cursor-pointer transition"
                >
                  #{c.caseKey}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Method
            </label>
            <select
              value={testMethod}
              onChange={(e) => setTestMethod(e.target.value as 'GET' | 'POST')}
              className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>

          <div className="sm:col-span-4">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              รหัสเคส (Case Key 6 หลัก)
            </label>
            <input
              type="text"
              placeholder="เช่น A9B2K7 หรือ #A9B2K7"
              value={testKeyInput}
              onChange={(e) => setTestKeyInput(e.target.value.toUpperCase())}
              className="w-full font-mono text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              API Key ที่ใช้ทดสอบ
            </label>
            <input
              type="text"
              placeholder="API Key"
              value={testApiKeyInput}
              onChange={(e) => setTestApiKeyInput(e.target.value)}
              className="w-full font-mono text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={handleRunTest}
              disabled={testLoading || !testKeyInput.trim()}
              className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <Send className={clsx("w-3.5 h-3.5", testLoading && "animate-pulse")} />
              <span>{testLoading ? 'กำลังส่ง...' : 'ทดสอบ API'}</span>
            </button>
          </div>
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                {testResult.status === 200 ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" />
                    HTTP {testResult.status} OK
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950 text-rose-400 border border-rose-800">
                    <XCircle className="w-3 h-3" />
                    HTTP {testResult.status} {testResult.status === 401 ? 'Unauthorized' : 'Error'}
                  </span>
                )}
                <span className="text-[11px] text-slate-400">ความเร็ว: {testResult.timeMs} ms</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(testResult.data, null, 2));
                  setCopiedResponse(true);
                  setTimeout(() => setCopiedResponse(false), 2000);
                }}
                className="text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 flex items-center gap-1 cursor-pointer transition"
              >
                {copiedResponse ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedResponse ? 'คัดลอก JSON แล้ว' : 'คัดลอกผลลัพธ์'}</span>
              </button>
            </div>

            <pre className="overflow-x-auto max-h-72 p-2 text-slate-200 text-[11px] leading-relaxed">
              {JSON.stringify(testResult.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Code Snippets for Developers */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Code className="w-4 h-4 text-indigo-500" />
              โค้ดตัวอย่างสำหรับเว็บหลัก (พร้อมคัดลอกไปวางได้ทันที)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              เลือกภาษาโปรแกรมที่เว็บหลักใช้งาน เพื่อดูตัวอย่างโค้ดที่กรอก API Key และ URL ให้เรียบร้อยแล้ว
            </p>
          </div>

          {/* Language tabs */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setCodeTab('js')}
              className={clsx(
                "px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
                codeTab === 'js' ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs" : "text-slate-600 dark:text-slate-400"
              )}
            >
              JavaScript (Fetch)
            </button>
            <button
              type="button"
              onClick={() => setCodeTab('php')}
              className={clsx(
                "px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
                codeTab === 'php' ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs" : "text-slate-600 dark:text-slate-400"
              )}
            >
              PHP (cURL)
            </button>
            <button
              type="button"
              onClick={() => setCodeTab('python')}
              className={clsx(
                "px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
                codeTab === 'python' ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs" : "text-slate-600 dark:text-slate-400"
              )}
            >
              Python
            </button>
            <button
              type="button"
              onClick={() => setCodeTab('curl')}
              className={clsx(
                "px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer",
                codeTab === 'curl' ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs" : "text-slate-600 dark:text-slate-400"
              )}
            >
              cURL (Terminal)
            </button>
          </div>
        </div>

        {/* Code display */}
        <div className="relative">
          <pre className="p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
            {codeTab === 'js' && jsCode}
            {codeTab === 'php' && phpCode}
            {codeTab === 'python' && pythonCode}
            {codeTab === 'curl' && curlCode}
          </pre>

          <button
            type="button"
            onClick={() => {
              const text = codeTab === 'js' ? jsCode : codeTab === 'php' ? phpCode : codeTab === 'python' ? pythonCode : curlCode;
              navigator.clipboard.writeText(text);
              alert('คัดลอกโค้ดเรียบร้อยแล้ว!');
            }}
            className="absolute top-3 right-3 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>คัดลอกโค้ด</span>
          </button>
        </div>
      </div>
    </div>
  );
}
