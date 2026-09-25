import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case, UserProfile } from '../types';
import { CheckCircle2, X, AlertCircle, Smartphone, FileSignature, MapPin, Sparkles } from 'lucide-react';
import { AnimalAvatar } from './AnimalAvatar';
import { logActivity } from '../lib/activityService';

interface CloseCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: Case | null;
  currentUser: UserProfile | null;
  onSuccess?: () => void;
}

export const CloseCaseModal: React.FC<CloseCaseModalProps> = ({
  isOpen,
  onClose,
  caseData,
  currentUser,
  onSuccess,
}) => {
  const [contractNumber, setContractNumber] = useState('');
  const [completionRemark, setCompletionRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  useEffect(() => {
    if (isOpen && caseData) {
      setContractNumber(caseData.contractNumber || '');
      setCompletionRemark('');
      setHasAttemptedSubmit(false);
    }
  }, [isOpen, caseData]);

  if (!isOpen || !caseData) return null;

  const isCustomTask = Boolean(caseData.isCustomTask || caseData.caseType === 'custom_task');
  const trimmedContract = contractNumber.trim();
  const isContractEmpty = trimmedContract.length === 0;
  // สำหรับงานพิเศษ ไม่บังคับใส่เลขที่สัญญา
  const isSubmitDisabled = isCustomTask ? false : isContractEmpty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    if (!isCustomTask && isContractEmpty) {
      return;
    }

    setIsSubmitting(true);
    try {
      const now = Date.now();
      const caseRef = doc(db, 'cases', caseData.id);

      const updates: Record<string, unknown> = {
        status: 'closed',
        completedAt: now,
        updatedAt: now,
      };

      if (trimmedContract) {
        updates.contractNumber = trimmedContract;
        updates.contractUpdatedAt = now;
        updates.contractUpdatedBy = currentUser?.name || caseData.assigneeName || 'พนักงาน';
      }

      const trimmedRemark = completionRemark.trim();
      if (trimmedRemark) {
        const existingRemarks = caseData.remarks ? `${caseData.remarks} | ` : '';
        const tag = isCustomTask ? 'จบงาน' : 'จบเคส';
        updates.remarks = `${existingRemarks}[${tag}: ${trimmedRemark}]`;
        updates.remarksUpdatedAt = now;
        updates.remarksUpdatedBy = currentUser?.name || caseData.assigneeName || 'พนักงาน';
      }

      await updateDoc(caseRef, updates);

      // Log activity
      const taskName = caseData.taskTitle || caseData.iphoneModel.replace('[งานพิเศษ] ', '');
      await logActivity({
        type: 'close_case',
        actorId: currentUser?.uid || caseData.assigneeId || 'system',
        actorName: currentUser?.name || caseData.assigneeName || 'พนักงาน',
        actorAvatarEmoji: currentUser?.avatarEmoji,
        description: isCustomTask
          ? `จบงานสำเร็จ: ${taskName}`
          : `จบเคสสำเร็จ: ${caseData.iphoneModel} (สัญญา #${trimmedContract})`,
        caseId: caseData.id,
        iphoneModel: caseData.iphoneModel,
        contractNumber: trimmedContract || undefined,
      });

      onClose();
      onSuccess?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseData.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/80 dark:bg-emerald-950/30">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>{isCustomTask ? 'บันทึกจบงาน' : 'บันทึกจบเคส'}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  isCustomTask 
                    ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300' 
                    : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                }`}>
                  {isCustomTask ? 'งานพิเศษ' : 'บังคับใส่สัญญา'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isCustomTask ? 'ยืนยันการจบงานพิเศษ/งานมอบหมายนี้' : 'กรุณาระบุเลขที่สัญญาเพื่อยืนยันการจบเคสนี้'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Case Preview Card */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center text-xs font-bold text-slate-900 dark:text-white">
                <Smartphone className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                {isCustomTask ? (caseData.taskTitle || caseData.iphoneModel.replace('[งานพิเศษ] ', '')) : caseData.iphoneModel}
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                isCustomTask
                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
                  : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
              }`}>
                {isCustomTask ? 'กำลังทำงาน' : 'กำลังทำเคส'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="truncate">
                <span className="text-[10px] text-slate-400 block">{isCustomTask ? 'ประเภทงาน' : 'ตัวแทน (ผู้ส่ง)'}</span>
                <span className="font-medium truncate block">{isCustomTask ? 'งานมอบหมายโดยแอดมิน' : caseData.agentName}</span>
              </div>
              <div className="truncate">
                <span className="text-[10px] text-slate-400 block">{isCustomTask ? 'สถานะงาน' : 'จังหวัด'}</span>
                <span className="font-medium truncate flex items-center">
                  {isCustomTask ? (
                    'งานพิเศษ'
                  ) : (
                    <>
                      <MapPin className="w-3 h-3 mr-1 text-slate-400" />
                      {caseData.province}
                    </>
                  )}
                </span>
              </div>
            </div>

            {caseData.assigneeName && (
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                <span className="text-[10px] text-slate-400">{isCustomTask ? 'ผู้รับผิดชอบงาน:' : 'ผู้รับผิดชอบเคส:'}</span>
                <AnimalAvatar
                  identifier={caseData.assigneeId || caseData.assigneeName}
                  name={caseData.assigneeName}
                  size="xs"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {caseData.assigneeName}
                </span>
              </div>
            )}
          </div>

          {/* Contract Number Field (MANDATORY ONLY FOR NORMAL CASES, HIDDEN/OPTIONAL FOR CUSTOM TASKS) */}
          {!isCustomTask ? (
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <FileSignature className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>เลขที่สัญญา (Contract Number)</span>
                  <span className="text-rose-500 text-xs font-bold">* บังคับกรอก</span>
                </span>
                {trimmedContract && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    <Sparkles className="w-3 h-3" />
                    ระบุแล้ว
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  required
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder="กรุณากรอกเลขที่สัญญา เช่น CNT-2025-0105 หรือ 6800123"
                  className={`w-full pl-9 pr-3.5 py-2.5 text-sm font-semibold rounded-xl bg-white dark:bg-slate-800 border transition ${
                    hasAttemptedSubmit && isContractEmpty
                      ? 'border-rose-500 focus:ring-2 focus:ring-rose-500 text-slate-900 dark:text-white ring-2 ring-rose-200 dark:ring-rose-950'
                      : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500'
                  }`}
                />
                <FileSignature className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>

              {/* Warning if empty */}
              {hasAttemptedSubmit && isContractEmpty ? (
                <p className="text-[11px] text-rose-500 dark:text-rose-400 mt-1.5 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  จำเป็นต้องระบุเลขที่สัญญาก่อนจบเคส ไม่สามารถเว้นว่างได้
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  ระบบบังคับใส่เลขที่สัญญาเพื่อความถูกต้องในการติดตามงานและการคิดค่าคอมมิชชั่น
                </p>
              )}
            </div>
          ) : null}

          {/* Optional Completion Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {isCustomTask ? 'หมายเหตุเพิ่มเติมตอนจบงาน (ไม่บังคับ):' : 'หมายเหตุเพิ่มเติมตอนจบเคส (ไม่บังคับ):'}
            </label>
            <textarea
              value={completionRemark}
              onChange={(e) => setCompletionRemark(e.target.value)}
              placeholder="ระบุข้อความหรือรายละเอียดเพิ่มเติม (ถ้ามี)"
              rows={2}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
            />
          </div>

          {/* Notice Banner */}
          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/80 dark:border-emerald-900/40 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-emerald-900 dark:text-emerald-300 leading-relaxed">
              {isCustomTask ? (
                <>เมื่อกดยืนยันจบงาน งานนี้จะย้ายไปยังแท็บ <span className="font-bold">"จบแล้ว"</span> พร้อมบันทึกเวลาที่ปิดงานโดยอัตโนมัติ</>
              ) : (
                <>เมื่อกดยืนยันจบเคส เคสนี้จะย้ายไปยังแท็บ <span className="font-bold">"จบเคสแล้ว"</span> พร้อมบันทึกเลขที่สัญญาและเวลาที่ปิดงานโดยอัตโนมัติ</>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSubmitDisabled}
              className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5 ${
                isSubmitDisabled
                  ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'
              }`}
              title={isSubmitDisabled ? 'กรุณากรอกเลขที่สัญญาก่อนจบเคส' : isCustomTask ? 'บันทึกและจบงาน' : 'บันทึกและจบเคส'}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isSubmitting 
                ? (isCustomTask ? 'กำลังบันทึกจบงาน...' : 'กำลังบันทึกจบเคส...') 
                : (isCustomTask ? 'ยืนยันจบงาน' : 'ยืนยันจบเคส')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
