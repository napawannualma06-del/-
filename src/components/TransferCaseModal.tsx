import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case, UserProfile } from '../types';
import { ArrowRightLeft, X, Smartphone, User, MapPin, AlertTriangle, Check, Info } from 'lucide-react';
import { AnimalAvatar } from './AnimalAvatar';

interface TransferCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: Case | null;
  currentUser: UserProfile | null;
  registeredUsers: UserProfile[];
  onSuccess?: () => void;
}

export const TransferCaseModal: React.FC<TransferCaseModalProps> = ({
  isOpen,
  onClose,
  caseData,
  currentUser,
  registeredUsers,
  onSuccess,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [transferNote, setTransferNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto-select the first eligible employee (preferring someone who is working and not current assignee)
  useEffect(() => {
    if (!isOpen || !caseData) return;

    const otherUsers = registeredUsers.filter(
      (u) => u.uid !== caseData.assigneeId && u.username !== caseData.assigneeName
    );

    // Prefer users currently working
    const workingUser = otherUsers.find((u) => u.workStatus !== 'off_work');
    if (workingUser) {
      setSelectedUserId(workingUser.uid);
    } else if (otherUsers.length > 0) {
      setSelectedUserId(otherUsers[0].uid);
    } else if (registeredUsers.length > 0) {
      setSelectedUserId(registeredUsers[0].uid);
    }
    setTransferNote('');
  }, [isOpen, caseData, registeredUsers]);

  if (!isOpen || !caseData) return null;

  const targetUser = registeredUsers.find((u) => u.uid === selectedUserId || u.username === selectedUserId);
  const isTargetOffWork = targetUser?.workStatus === 'off_work';

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseData || !targetUser || !currentUser) return;

    setIsSubmitting(true);
    try {
      const caseRef = doc(db, 'cases', caseData.id);
      const now = Date.now();
      const trimmedNote = transferNote.trim();
      const existingRemarks = caseData.remarks ? `${caseData.remarks} | ` : '';
      const noteSuffix = trimmedNote ? ` ข้อความ: ${trimmedNote}` : '';
      const newRemarks = `${existingRemarks}[โยกเคสให้ ${targetUser.name} โดย ${currentUser.name}${noteSuffix}]`;

      const updates: Record<string, unknown> = {
        assigneeId: targetUser.uid,
        assigneeName: targetUser.name,
        status: 'processing', // Keeps in progress for the new assignee
        updatedAt: now,
        remarks: newRemarks,
        remarksUpdatedAt: now,
        remarksUpdatedBy: currentUser.name,
      };

      await updateDoc(caseRef, updates);
      setTransferNote('');
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
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-indigo-50/80 dark:bg-indigo-950/30">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                โยกเคสให้พนักงานคนอื่นดูแลต่อ
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                เลือกพนักงานที่ต้องการส่งต่องานเคสนี้ให้รับผิดชอบ
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
        <form onSubmit={handleTransfer} className="p-5 space-y-4 overflow-y-auto">
          {/* Case Preview Card */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center text-xs font-bold text-slate-900 dark:text-white">
                <Smartphone className="w-4 h-4 mr-1.5 text-indigo-500" />
                {caseData.iphoneModel}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {caseData.province}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <span className="truncate">ตัวแทน: <span className="font-semibold text-slate-800 dark:text-slate-200">{caseData.agentName}</span></span>
              <span className="truncate text-slate-500">
                ผู้รับเดิม: <span className="font-semibold text-slate-700 dark:text-slate-300">{caseData.assigneeName || 'ไม่มี'}</span>
              </span>
            </div>
          </div>

          {/* Target Employee Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              เลือกพนักงานที่จะให้ดูแลต่อ:
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition cursor-pointer"
            >
              {registeredUsers.map((u) => {
                const isCurrent = u.uid === caseData.assigneeId || u.username === caseData.assigneeName;
                const isOffWork = u.workStatus === 'off_work';
                return (
                  <option key={u.uid} value={u.uid}>
                    {u.name} (@{u.username})
                    {u.role === 'admin' ? ' 👑 [แอดมิน]' : ''}
                    {isOffWork ? ' • 🔴 [เลิกงานแล้ว]' : ' • 🟢 [เข้างานอยู่]'}
                    {isCurrent ? ' (ผู้รับผิดชอบปัจจุบัน)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Off-work Warning */}
          {isTargetOffWork && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50 flex items-start gap-2 text-xs text-rose-800 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">พนักงานท่านนี้อยู่ในสถานะ "เลิกงานแล้ว":</span>
                <p className="mt-0.5 text-[11px] text-rose-700 dark:text-rose-300/90">
                  อาจไม่สะดวกรับเคสต่อในขณะนี้ หากต้องการให้ผู้อื่นทำ แนะนำเลือกพนักงานที่กำลังเข้างานอยู่
                </p>
              </div>
            </div>
          )}

          {/* Optional Transfer Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              หมายเหตุส่งต่องาน / ข้อความถึงเพื่อนร่วมงาน (ไม่บังคับ):
            </label>
            <textarea
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              placeholder="เช่น ลูกค้าส่งเอกสารครบแล้ว ฝากต่อได้เลยครับ, มีคุยติดไว้ตรง..."
              rows={2}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition placeholder:text-slate-400"
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
              disabled={isSubmitting || !targetUser}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              {isSubmitting ? 'กำลังโยกเคส...' : 'ยืนยันการโยกเคส'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
