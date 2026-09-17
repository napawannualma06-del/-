import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case, UserProfile } from '../types';
import { RotateCcw, X, AlertCircle, Check, Smartphone, User, MapPin } from 'lucide-react';
import { AnimalAvatar } from './AnimalAvatar';

interface ReturnCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: Case | null;
  currentUser: UserProfile | null;
  onSuccess?: () => void;
}

export const ReturnCaseModal: React.FC<ReturnCaseModalProps> = ({
  isOpen,
  onClose,
  caseData,
  currentUser,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !caseData) return null;

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseData || !currentUser) return;

    setIsSubmitting(true);
    try {
      const caseRef = doc(db, 'cases', caseData.id);
      const now = Date.now();
      const trimmedReason = reason.trim();
      const existingRemarks = caseData.remarks ? `${caseData.remarks} | ` : '';
      const reasonSuffix = trimmedReason ? ` เหตุผล: ${trimmedReason}` : '';
      const newRemarks = `${existingRemarks}[คืนสถานะไปรอรับเคส โดย ${currentUser.name}${reasonSuffix}]`;

      const previousWorkerName = caseData.assigneeName || currentUser.name;
      const previousWorkerId = caseData.assigneeId || currentUser.uid;

      const updates: Record<string, unknown> = {
        status: 'pending',
        assigneeId: '',
        assigneeName: '',
        previousAssigneeName: previousWorkerName,
        previousAssigneeId: previousWorkerId,
        returnedBy: currentUser.name,
        returnedById: currentUser.uid,
        returnedAt: now,
        returnedReason: trimmedReason || '',
        updatedAt: now,
        remarks: newRemarks,
        remarksUpdatedAt: now,
        remarksUpdatedBy: currentUser.name,
      };

      await updateDoc(caseRef, updates);
      setReason('');
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
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-amber-50/80 dark:bg-amber-950/30">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                คืนสถานะไปรอรับเคส
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ส่งเคสกลับไปกระดานกลางเพื่อให้เพื่อนร่วมงานรับต่อ
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

        {/* Content */}
        <form onSubmit={handleReturn} className="p-5 space-y-4 overflow-y-auto">
          {/* Case Preview Card */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center text-xs font-bold text-slate-900 dark:text-white">
                <Smartphone className="w-4 h-4 mr-1.5 text-indigo-500" />
                {caseData.iphoneModel}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 rounded-md">
                กำลังทำเคส
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="truncate">
                <span className="text-[10px] text-slate-400 block">ตัวแทน (ผู้ส่ง)</span>
                <span className="font-medium truncate block">{caseData.agentName}</span>
              </div>
              <div className="truncate">
                <span className="text-[10px] text-slate-400 block">จังหวัด</span>
                <span className="font-medium truncate flex items-center">
                  <MapPin className="w-3 h-3 mr-1 text-slate-400" />
                  {caseData.province}
                </span>
              </div>
            </div>

            {caseData.assigneeName && (
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                <span className="text-[10px] text-slate-400">ผู้รับผิดชอบปัจจุบัน:</span>
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

          {/* Explanation Alert */}
          <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900/50 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-900 dark:text-indigo-300 leading-relaxed">
              <span className="font-bold">เคสนี้จะกลับไปที่กระดาน "เครดิตผ่าน (รอรับเคส)":</span>
              <p className="mt-0.5 text-[11px] text-indigo-800 dark:text-indigo-300/90">
                หากรับมาแล้วติดธุระหรือไม่ได้ทำต่อ สามารถคืนเคสเพื่อให้พนักงานท่านอื่นกดรับไปทำต่อได้ทันที
              </p>
            </div>
          </div>

          {/* Red Warning Note */}
          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>หมายเหตุ: คนเช็คเครดิต รับเคส คนสุดท้าย</span>
          </div>

          {/* Optional Return Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              ระบุเหตุผลที่คืนเคส (ไม่บังคับ):
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ติดลูกค้าหน้าร้าน, ลูกค้ายังไม่พร้อม, ฝากส่งกลับไปรอรับเคส..."
              rows={2}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
            />
          </div>

          {/* Actions */}
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
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isSubmitting ? 'กำลังคืนเคส...' : 'ยืนยันคืนเคสไปรอรับ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
