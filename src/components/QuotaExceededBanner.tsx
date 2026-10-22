import React from 'react';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

interface QuotaExceededBannerProps {
  className?: string;
  projectId?: string;
  databaseId?: string;
}

export const QuotaExceededBanner: React.FC<QuotaExceededBannerProps> = ({
  className,
  projectId = 'boreal-phantasmata-5thv3',
  databaseId = 'ai-studio-remix-908bc4ff-dfd6-489a-81dc-d04498181529',
}) => {
  const upgradeUrl = `https://console.firebase.google.com/project/${projectId}/firestore/databases/${databaseId}/data?openUpgradeDialog=true`;
  const pricingUrl = 'https://firebase.google.com/pricing#cloud-firestore';

  return (
    <div className={`p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-100 shadow-lg ${className || ''}`}>
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-amber-200/80 dark:bg-amber-900/80 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-xs">
          <AlertTriangle className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 uppercase tracking-wider">
              โควต้า Firestore ฟรีรายวันเต็ม (Quota Limit Exceeded)
            </span>
          </div>
          <h4 className="text-sm font-bold mt-1 text-amber-900 dark:text-amber-100">
            โควต้าการอ่านข้อมูลฟรีของ Firebase ครบกำหนดแล้ววันนี้
          </h4>
          <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-1 leading-relaxed">
            ระบบ Firebase มีขีดจำกัดการอ่านข้อมูลรายวันสำหรับแพ็กเกจฟรี (Free daily read units) 
            โควต้าจะ<strong>รีเซ็ตให้อัตโนมัติในวันถัดไป</strong> หรือหากต้องการใช้งานต่อได้ทันทีโดยไม่มีสะดุด 
            สามารถเปิดใช้งานหรืออัปเกรดโครงการได้ที่ Firebase Console
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <a
              href={upgradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <span>เปิด Firebase Console เพื่ออัปเกรด</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <a
              href={pricingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <span>ดูข้อมูลค่าบริการ (Pricing)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>ลองโหลดใหม่</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
