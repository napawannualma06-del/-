import React, { useState, useEffect } from 'react';
import {
  X,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useStore, UserProfile, isUserAdmin } from '../store/useStore';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional target user when Admin is resetting another employee's password */
  targetUser?: UserProfile | null;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  targetUser,
}: ChangePasswordModalProps) {
  const { user: currentUser, changeUserPassword } = useStore();

  const activeTarget = targetUser || currentUser;
  const isAdmin = isUserAdmin(currentUser);
  const isEditingOther = Boolean(
    targetUser && currentUser && targetUser.uid !== currentUser.uid
  );
  const isAdminOverride = isAdmin && isEditingOther;

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Does the target user currently have a PIN set? (Supports hashed PIN via hasPin flag or legacy pin)
  const hasExistingPin = Boolean(
    activeTarget?.hasPin || (activeTarget?.pin && activeTarget.pin.trim() !== '')
  );

  useEffect(() => {
    if (isOpen) {
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setShowPassword(false);
      setMessage(null);
    }
  }, [isOpen, activeTarget?.uid]);

  if (!isOpen || !activeTarget) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!isAdminOverride && hasExistingPin && !currentPin.trim()) {
      setMessage({ text: 'กรุณากรอกรหัสผ่าน/PIN เดิมของคุณ', type: 'error' });
      return;
    }

    if (newPin !== confirmPin) {
      setMessage({ text: 'รหัสผ่าน/PIN ใหม่และการยืนยันรหัสไม่ตรงกัน', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const res = await changeUserPassword(
        activeTarget.uid,
        newPin,
        currentPin,
        isAdminOverride
      );
      if (res.success) {
        setMessage({
          text: res.message || 'บันทึกรหัสผ่าน/PIN ใหม่เรียบร้อยแล้ว',
          type: 'success',
        });
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        setMessage({
          text: res.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้',
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClearPin = async () => {
    if (!isAdminOverride && hasExistingPin && !currentPin.trim()) {
      setMessage({
        text: 'กรุณากรอกรหัสผ่าน/PIN เดิมก่อนกดยกเลิกการตั้งรหัสผ่าน',
        type: 'error',
      });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const res = await changeUserPassword(
        activeTarget.uid,
        '',
        currentPin,
        isAdminOverride
      );
      if (res.success) {
        setMessage({
          text: 'ยกเลิกการตั้งรหัสผ่าน/PIN เรียบร้อยแล้ว (เข้าสู่ระบบได้โดยไม่ต้องกรอกรหัส)',
          type: 'success',
        });
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        setMessage({
          text: res.message || 'ไม่สามารถยกเลิกรหัสผ่านได้',
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isAdminOverride
                  ? `รีเซ็ตรหัสผ่าน: ${activeTarget.name}`
                  : 'เปลี่ยนรหัสผ่าน / PIN'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                บัญชี: <span className="font-semibold text-slate-700 dark:text-slate-300">@{activeTarget.username}</span>
                {hasExistingPin ? ' (ตั้งรหัสไว้แล้ว)' : ' (ยังไม่ได้ตั้งรหัสผ่าน)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {isAdminOverride && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>
                คุณกำลังตั้งรหัสผ่านใหม่ให้พนักงานในฐานะ <strong>แอดมิน</strong> (ไม่ต้องใช้รหัสผ่านเดิม)
              </span>
            </div>
          )}

          {message && (
            <div
              className={clsx(
                'p-3 rounded-xl border text-xs font-semibold flex items-start gap-2',
                message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              )}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Current PIN (Only required when user is changing their own existing PIN) */}
          {!isAdminOverride && hasExistingPin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                รหัสผ่าน / PIN เดิม *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="กรอกรหัสผ่าน/PIN ปัจจุบัน"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* New PIN */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              รหัสผ่าน / PIN ใหม่ *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="ตั้งรหัสผ่านหรือ PIN ใหม่ (เช่น 1234)"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New PIN */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              ยืนยันรหัสผ่าน / PIN ใหม่อีกครั้ง *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="กรอกรหัสผ่าน/PIN ใหม่อีกครั้ง"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
            {hasExistingPin && activeTarget.uid !== 'admin_gametpl' ? (
              <button
                type="button"
                disabled={loading}
                onClick={handleClearPin}
                className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                ลบรหัสผ่าน (เข้าได้ไม่ใช้ PIN)
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {loading ? 'กำลังบันทึก...' : 'บันทึกรหัสใหม่'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
