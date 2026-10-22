import React from 'react';
import { useStore } from '../store/useStore';
import { AlertTriangle, Clock, LogOut, CheckCircle2, RotateCcw } from 'lucide-react';

interface InactivityWarningModalProps {
  isWarning: boolean;
  remainingMs: number;
  isAutoClockedOut: boolean;
  returnedCasesCount: number;
  onResetActivity: () => void;
  onDismissAutoClockOut: () => void;
}

export const InactivityWarningModal: React.FC<InactivityWarningModalProps> = ({
  isWarning,
  remainingMs,
  isAutoClockedOut,
  returnedCasesCount,
  onResetActivity,
  onDismissAutoClockOut,
}) => {
  const { clockIn } = useStore();

  // Format remaining time into MM:SS
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // 1. Auto Changed to "ว่างงาน" (Off Work) Modal
  if (isAutoClockedOut) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
        <div 
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-amber-300 dark:border-amber-800/80 text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 mb-1">
                ระบบจัดการกะอัตโนมัติ
              </span>
              <h3 className="font-bold text-base text-slate-900 dark:text-white leading-tight">
                สถานะของคุณเปลี่ยนเป็น "ว่างงาน" แล้ว
              </h3>
            </div>
          </div>

          <div className="py-4 space-y-3.5">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              เนื่องจากไม่มีการ
              <strong className="mx-1 text-amber-700 dark:text-amber-300 font-semibold">สร้างเคส, รับเคส, ใส่หมายเหตุ หรือแอคชั่นใดๆ ในระบบ</strong>
              ต่อเนื่องนานเกิน <strong className="text-rose-600 dark:text-rose-400 font-bold">2 ชั่วโมง</strong>
              ระบบจึงได้ปรับสถานะเป็น <strong>"ว่างงาน"</strong> ให้อัตโนมัติ เพื่อป้องกันเคสค้าง
            </p>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 text-xs text-slate-800 dark:text-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>การคืนเคสสู่กองกลาง</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                {returnedCasesCount > 0 ? (
                  <>เคสที่คุณกำลังดำเนินการอยู่ทั้งหมด <strong className="font-bold underline text-indigo-600 dark:text-indigo-400">จำนวน {returnedCasesCount} เคส</strong> ได้ถูกส่งคืนกลับไปที่ <strong>"รอรับเคส"</strong> เรียบร้อยแล้ว เพื่อให้เพื่อนร่วมทีมรับไปดำเนินการต่อได้ทันที</>
                ) : (
                  <>ไม่มีเคสค้างที่กำลังทำอยู่ สถานะถูกเปลี่ยนเป็น <strong>"ว่างงาน"</strong> เรียบร้อยแล้ว</>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onDismissAutoClockOut}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              รับทราบ
            </button>
            <button
              type="button"
              onClick={async () => {
                onDismissAutoClockOut();
                await clockIn();
              }}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>เข้างานใหม่ทันที</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Inactivity Warning Modal (10 minutes before reaching 2 hours)
  if (isWarning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div 
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-400/80 dark:border-amber-500/80 text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200 ring-4 ring-amber-500/20"
          role="alertdialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 animate-bounce" />
              </div>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 rounded-full animate-ping" />
            </div>
            <div>
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 mb-1">
                เตือนความเคลื่อนไหวเคส (2 ชม.)
              </span>
              <h3 className="font-bold text-base text-slate-900 dark:text-white leading-tight">
                ไม่มีการทำเคสหรือแอคชั่นในระบบ
              </h3>
            </div>
          </div>

          {/* Countdown & Info */}
          <div className="py-4 space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              ไม่มีการสร้างเคส รับเคส หรือใส่หมายเหตุในระบบมานานเกือบ 2 ชั่วโมง ระบบจะทำการ
              <strong className="mx-1 text-amber-700 dark:text-amber-300 font-semibold">เปลี่ยนสถานะเป็น "ว่างงาน" และส่งคืนเคสอัตโนมัติ</strong>
              ในอีก:
            </p>

            {/* Countdown Badge */}
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800/80 text-center space-y-1">
              <div className="flex items-center justify-center gap-2 text-amber-800 dark:text-amber-200">
                <Clock className="w-4 h-4 animate-spin text-amber-600" />
                <span className="text-xs font-semibold">เวลานับถอยหลังก่อนเปลี่ยนเป็นว่างงาน:</span>
              </div>
              <div className="font-mono text-3xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums tracking-wider">
                {timeFormatted} <span className="text-xs font-normal">นาที</span>
              </div>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                หากคุณยังปฏิบัติงานอยู่ ให้กดปุ่มด้านล่างเพื่ออัปเดตสถานะและต่อเวลา
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onResetActivity}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 active:scale-95 transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ฉันยังปฏิบัติงานอยู่ (คลิกเพื่อต่อเวลา)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
