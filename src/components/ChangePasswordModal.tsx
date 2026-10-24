import React, { useState } from 'react';
import { 
  X, 
  KeyRound, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff,
  ShieldCheck,
  Sparkles,
  Trash2
} from 'lucide-react';
import { useStore, UserProfile, isUserAdmin } from '../store/useStore';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser?: UserProfile | null; // If specified, admin is changing this user's password
}

export function ChangePasswordModal({ isOpen, onClose, targetUser }: ChangePasswordModalProps) {
  const { user: currentUser, updateUserPin } = useStore();
  const effectiveUser = targetUser || currentUser;
  const isAdminOperating = isUserAdmin(currentUser) && targetUser && targetUser.uid !== currentUser?.uid;

  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !effectiveUser) return null;

  const hasExistingPin = Boolean(effectiveUser.pin && effectiveUser.pin.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      // 1. If not admin override and has existing PIN: must verify current PIN
      if (!isAdminOperating && hasExistingPin) {
        if (!currentPinInput.trim()) {
          setErrorMsg('กรุณากรอกรหัสผ่าน / PIN ปัจจุบัน');
          return;
        }
        if (currentPinInput.trim() !== effectiveUser.pin?.trim()) {
          setErrorMsg('รหัสผ่าน / PIN ปัจจุบันไม่ถูกต้อง');
          return;
        }
      }

      // 2. If setting new PIN
      if (!removePin) {
        if (!newPin.trim()) {
          setErrorMsg('กรุณากรอกรหัสผ่าน / PIN ใหม่ หรือเลือก "ไม่ใช้ PIN"');
          return;
        }
        if (newPin.trim().length < 3) {
          setErrorMsg('รหัสผ่านควรมีความยาวอย่างน้อย 3 ตัวอักษรหรือตัวเลข');
          return;
        }
        if (newPin.trim() !== confirmPin.trim()) {
          setErrorMsg('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
          return;
        }
      }

      const finalPin = removePin ? null : newPin.trim();
      const res = await updateUserPin(effectiveUser.uid, finalPin);
      if (!res.success) {
        setErrorMsg(res.message);
        return;
      }

      setSuccessMsg(removePin 
        ? 'ยกเลิกการใช้รหัสผ่านเรียบร้อยแล้ว (เข้าสู่ระบบโดยไม่ต้องกรอก PIN)' 
        : 'เปลี่ยนรหัสผ่าน / PIN ใหม่เรียบร้อยแล้ว!'
      );

      setTimeout(() => {
        handleClose();
      }, 2000);

    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCurrentPinInput('');
    setNewPin('');
    setConfirmPin('');
    setRemovePin(false);
    setShowCurrentPin(false);
    setShowNewPin(false);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                {isAdminOperating ? `ตั้งรหัสผ่านให้ ${effectiveUser.name}` : 'เปลี่ยนรหัสผ่าน / PIN'}
              </h3>
              <p className="text-[11px] text-indigo-100 mt-0.5">
                บัญชีผู้ใช้ @{effectiveUser.username || effectiveUser.uid}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {/* Feedback */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="leading-relaxed font-medium">{successMsg}</div>
            </div>
          )}

          {/* Current PIN field (only if self-service and has pin) */}
          {!isAdminOperating && hasExistingPin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                รหัสผ่าน / PIN ปัจจุบัน <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPin ? 'text' : 'password'}
                  required
                  placeholder="กรอก PIN เดิมของคุณ"
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowCurrentPin(!showCurrentPin)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showCurrentPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Option to clear PIN */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                ไม่ต้องการใช้รหัสผ่าน (ไม่ต้องใส่ PIN ตอนล็อกอิน)
              </span>
              <span className="text-[11px] text-slate-400 block">
                สามารถเข้าใช้งานได้ทันทีเพียงเลือกชื่อหรือพิมพ์ชื่อผู้ใช้
              </span>
            </div>
            <input
              type="checkbox"
              id="clearPinToggle"
              checked={removePin}
              onChange={(e) => {
                setRemovePin(e.target.checked);
                if (e.target.checked) {
                  setNewPin('');
                  setConfirmPin('');
                }
              }}
              className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
            />
          </div>

          {!removePin && (
            <>
              {/* New PIN */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  รหัสผ่าน / PIN ใหม่ (4-6 หลัก หรือรหัสผ่าน) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPin ? 'text' : 'password'}
                    required={!removePin}
                    placeholder="เช่น 1234 หรือ รหัสผ่านใหม่"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowNewPin(!showNewPin)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New PIN */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  ยืนยันรหัสผ่านใหม่ <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPin ? 'text' : 'password'}
                    required={!removePin}
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้งให้ตรงกัน"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>
            </>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
