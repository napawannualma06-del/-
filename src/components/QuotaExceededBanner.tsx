import React, { useState } from 'react';
import { Wrench, RefreshCw, ExternalLink, Settings } from 'lucide-react';

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
  const [showAdminDetails, setShowAdminDetails] = useState(false);
  const upgradeUrl = `https://console.firebase.google.com/project/${projectId}/firestore/databases/${databaseId}/data?openUpgradeDialog=true`;
  const pricingUrl = 'https://firebase.google.com/pricing#cloud-firestore';

  return (
    <div className={`p-4 sm:p-5 rounded-2xl bg-indigo-50/90 dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-900/80 text-slate-800 dark:text-slate-100 shadow-sm ${className || ''}`}>
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
          <Wrench className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 uppercase tracking-wider border border-indigo-200/60 dark:border-indigo-800/60">
              ประกาศปรับปรุงระบบ
            </span>
          </div>

          <h4 className="text-sm sm:text-base font-bold mt-1 text-slate-900 dark:text-white">
            ระบบปิดปรับปรุงชั่วคราว จะเปิดให้บริการเร็วที่สุด
          </h4>

          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
            ขณะนี้ระบบอยู่ระหว่างการปิดปรับปรุงและดูแลรักษาฐานข้อมูลชั่วคราว เพื่อเพิ่มประสิทธิภาพและความเสถียรในการทำงาน 
            ทางทีมงานกำลังดำเนินการและจะเปิดให้บริการเร็วที่สุด ขออภัยในความไม่สะดวกค่ะ
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>ลองโหลดหน้าเว็บใหม่</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAdminDetails(!showAdminDetails)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>สำหรับแอดมิน</span>
            </button>
          </div>

          {showAdminDetails && (
            <div className="mt-3.5 p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-xs space-y-2">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                ข้อมูลสถานะโควต้าฐานข้อมูล (Admin Console):
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                โควต้าอ่านฟรีรายวันของ Firebase Spark ถึงกำหนดแล้ว และจะรีเซ็ตอัตโนมัติในวันถัดไป 
                หรือสามารถกดเปิดหน้าต่างอัปเกรดเพื่อเปิดให้บริการต่อได้ทันที
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/60 dark:hover:bg-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium text-[11px] transition"
                >
                  <span>เปิด Firebase Console อัปเกรด</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={pricingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium text-[11px] transition"
                >
                  <span>ดูตารางราคา (Pricing)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
