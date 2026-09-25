import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case, UserProfile } from '../types';
import { PauseCircle, X, AlertCircle, Smartphone, MapPin, Tag } from 'lucide-react';
import { AnimalAvatar } from './AnimalAvatar';
import { logActivity } from '../lib/activityService';

interface HoldCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: Case | null;
  currentUser: UserProfile | null;
  onSuccess?: () => void;
}

const COMMON_HOLD_REASONS = [
  'รอเอกสารเพิ่มเติมจากลูกค้า',
  'ลูกค้ายังไม่สะดวกโอนชำระ',
  'ติดต่อลูกค้าไม่ได้ / ไม่รับสาย',
  'รอผลอนุมัติสัญญาพิเศษ',
  'ลูกค้าขอเลื่อนเวลารับเครื่อง',
  'ติดปัญหาข้อมูลเครดิต / รอตรวจสอบ',
];

export const HoldCaseModal: React.FC<HoldCaseModalProps> = ({
  isOpen,
  onClose,
  caseData,
  currentUser,
  onSuccess,
}) => {
  const [remark, setRemark] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !caseData) return null;

  const isCustomTask = Boolean(caseData.isCustomTask || caseData.caseType === 'custom_task');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseData || !currentUser) return;

    const trimmed = remark.trim();
    if (!trimmed) {
      setErrorMsg(isCustomTask ? 'กรุณาระบุหมายเหตุหรือเหตุผลที่งานค้าง (บังคับระบุ)' : 'กรุณาระบุหมายเหตุหรือเหตุผลที่เคสค้าง (บังคับระบุ)');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const caseRef = doc(db, 'cases', caseData.id);
      const now = Date.now();
      const existingRemarks = caseData.remarks ? `${caseData.remarks} | ` : '';
      const tag = isCustomTask ? 'งานค้าง' : 'เคสค้าง';
      const newRemarks = `${existingRemarks}[${tag} โดย ${currentUser.name}: ${trimmed}]`;

      const previousWorkerName = caseData.assigneeName || currentUser.name;
      const previousWorkerId = caseData.assigneeId || currentUser.uid;

      const updates: Record<string, unknown> = {
        status: 'pending',
        isStuck: true,
        stuckAt: now,
        stuckBy: currentUser.name,
        stuckReason: trimmed,
        assigneeId: '',
        assigneeName: '',
        previousAssigneeName: previousWorkerName,
        previousAssigneeId: previousWorkerId,
        remarks: newRemarks,
        remarksUpdatedAt: now,
        remarksUpdatedBy: currentUser.name,
        updatedAt: now,
      };

      await updateDoc(caseRef, updates);

      // Log activity
      const taskName = caseData.taskTitle || caseData.iphoneModel.replace('[งานพิเศษ] ', '');
      await logActivity({
        type: 'stuck_case',
        actorId: currentUser.uid,
        actorName: currentUser.name,
        actorAvatarEmoji: currentUser.avatarEmoji,
        description: isCustomTask
          ? `บันทึกเป็นงานค้าง: ${taskName} (เหตุผล: ${trimmed})`
          : `บันทึกเป็นเคสค้าง: ${caseData.iphoneModel} (เหตุผล: ${trimmed})`,
        caseId: caseData.id,
        iphoneModel: caseData.iphoneModel,
      });

      setRemark('');
      onClose();
      onSuccess?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${caseData.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      id="hold-case-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-amber-200 dark:border-amber-900/50 w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-amber-100 dark:border-amber-900/40 flex items-center justify-between bg-amber-50/90 dark:bg-amber-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-xs">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                {isCustomTask ? 'บันทึกเป็นงานค้าง' : 'บันทึกเป็นเคสค้าง'}
                <span className="px-1.5 py-0.2 text-[10px] rounded bg-amber-200 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200 font-semibold">
                  บังคับใส่หมายเหตุ
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isCustomTask ? 'งานนี้จะถูกย้ายไปที่หมวดหมู่ "งานค้าง" เพื่อรอติดตามต่อ' : 'เคสนี้จะถูกย้ายไปที่หมวดหมู่ "เคสค้าง" เพื่อรอติดตามต่อ'}
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Case Info Preview */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center text-xs font-bold text-slate-900 dark:text-white">
                <Smartphone className="w-4 h-4 mr-1.5 text-indigo-500" />
                {isCustomTask ? (caseData.taskTitle || caseData.iphoneModel.replace('[งานพิเศษ] ', '')) : caseData.iphoneModel}
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                isCustomTask
                  ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
                  : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
              }`}>
                สถานะ: {caseData.status === 'pending' ? (isCustomTask ? 'รอรับงาน' : 'รอรับเคส') : (isCustomTask ? 'กำลังทำงาน' : 'กำลังทำเคส')}
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
                  {isCustomTask ? 'งานพิเศษ' : (
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
                <span className="text-[10px] text-slate-400">{isCustomTask ? 'ผู้รับงานก่อนนี้:' : 'ผู้รับเคสก่อนนี้:'}</span>
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
          <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
              <span className="font-bold">{isCustomTask ? 'งานใหม่ vs งานค้าง:' : 'เคสใหม่ vs เคสค้าง:'}</span>
              <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300/90">
                • <strong>{isCustomTask ? 'งานใหม่' : 'เคสใหม่'}</strong> = {isCustomTask ? 'งานที่ยังไม่เคยมีใครรับเลย' : 'เคสที่ยังไม่เคยมีใครรับเลย'}<br />
                • <strong>{isCustomTask ? 'งานค้าง' : 'เคสค้าง'}</strong> = {isCustomTask ? 'งานที่เคยมีคนรับแล้ว แต่ต้องพัก/รอข้อมูล/ติดปัญหา พร้อมระบุหมายเหตุ' : 'เคสที่เคยมีคนรับแล้ว แต่ต้องพัก/รอเอกสาร/ติดปัญหา พร้อมระบุหมายเหตุ'}
              </p>
            </div>
          </div>

          {/* Quick Reason Suggestions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Tag className="w-3 h-3 text-amber-500" />
                <span>เลือกเหตุผลด่วน:</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_HOLD_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRemark(r);
                    setErrorMsg('');
                  }}
                  className="px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-300 transition cursor-pointer"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Required Note Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              หมายเหตุเหตุผลที่ค้าง <span className="text-rose-500 font-bold">* (บังคับกรอก)</span>
            </label>
            <textarea
              value={remark}
              onChange={(e) => {
                setRemark(e.target.value);
                if (e.target.value.trim()) setErrorMsg('');
              }}
              placeholder={isCustomTask ? "กรุณาระบุรายละเอียดเหตุผล เช่น รอข้อมูลเพิ่มเติม, รอติดต่อกลับ..." : "กรุณาระบุรายละเอียดเหตุผล เช่น รอเอกสารสลิปเงินเดือนเพิ่มเติม, ลูกค้าขอเปลี่ยนรุ่น..."}
              rows={3}
              required
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
            />
            {errorMsg && (
              <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                {errorMsg}
              </p>
            )}
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
              disabled={isSubmitting || !remark.trim()}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              {isSubmitting 
                ? 'กำลังบันทึก...' 
                : (isCustomTask ? 'ยืนยันบันทึกเป็นงานค้าง' : 'ยืนยันบันทึกเป็นเคสค้าง')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
