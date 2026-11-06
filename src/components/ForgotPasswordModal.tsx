import React, { useState } from 'react';
import {
  X,
  KeyRound,
  User,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Send,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessReset?: (username: string, newPin: string) => void;
}

export function ForgotPasswordModal({
  isOpen,
  onClose,
}: ForgotPasswordModalProps) {
  const { requestAdminPasswordReset } = useStore();

  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setUsername('');
    setMessage(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleRequestAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!username.trim()) {
      setMessage({ text: 'กรุณากรอกรหัสพนักงาน / Username ของคุณ', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const res = await requestAdminPasswordReset(username);
      if (res.success) {
        setMessage({
          text: res.message || 'ส่งคำขอรีเซ็ตรหัสผ่านไปยังแอดมินเรียบร้อยแล้ว',
          type: 'success',
        });
      } else {
        setMessage({
          text: res.message || 'ไม่สามารถส่งคำขอได้',
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
      onClick={handleClose}
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
                ลืมรหัสผ่าน / PIN พนักงาน
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ส่งคำขอให้แอดมินช่วยรีเซ็ตรหัสผ่านใหม่
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {message && (
            <div
              className={clsx(
                'mb-4 p-3 rounded-xl border text-xs font-semibold flex items-start gap-2',
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

          <form onSubmit={handleRequestAdmin} className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                เพื่อความปลอดภัยของบัญชีพนักงาน กรุณาระบุ <strong>Username</strong> ของคุณเพื่อส่งแจ้งเตือนไปยังหน้าจัดการพนักงานของแอดมินให้ช่วยตั้งหรือล้างรหัส PIN ให้ใหม่
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                รหัสพนักงาน / Username ของคุณ *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="เช่น emp01, somchai"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            <div className="pt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{loading ? 'กำลังส่งคำขอ...' : 'ส่งคำขอให้แอดมินรีเซ็ต'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
