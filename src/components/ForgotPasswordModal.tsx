import React, { useState } from 'react';
import { 
  X, 
  KeyRound, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Lock, 
  Send, 
  ArrowRight,
  Eye,
  EyeOff,
  UserCheck,
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessReset?: (username: string, newPin: string) => void;
}

export function ForgotPasswordModal({ isOpen, onClose, onSuccessReset }: ForgotPasswordModalProps) {
  const { verifyAndResetForgottenPin, requestAdminPasswordReset } = useStore();
  const [method, setMethod] = useState<'self' | 'admin'>('self');

  // Self-service verification fields
  const [step, setStep] = useState<'verify' | 'set_new'>('verify');
  const [username, setUsername] = useState('');
  const [registeredName, setRegisteredName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Admin request fields
  const [adminReqInput, setAdminReqInput] = useState('');

  // States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleResetSelfVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      // Step 1: Verify identity
      if (step === 'verify') {
        const cleanU = username.trim().toLowerCase();
        const cleanN = registeredName.trim().toLowerCase();

        if (!cleanU || !cleanN) {
          setErrorMsg('กรุณากรอกทั้งชื่อผู้ใช้และชื่อที่ลงทะเบียนไว้');
          return;
        }

        // Test verification first with dry run
        const res = await verifyAndResetForgottenPin(cleanU, cleanN, '__CHECK_ONLY__');
        if (!res.success) {
          setErrorMsg(res.message);
          return;
        }

        // Passed verification! Move to step 2
        setStep('set_new');
        return;
      }

      // Step 2: Set new PIN
      if (!removePin) {
        if (!newPin.trim()) {
          setErrorMsg('กรุณากรอกรหัสผ่านใหม่ หรือติ๊ก "ไม่ต้องการใช้ PIN"');
          return;
        }
        if (newPin.trim() !== confirmPin.trim()) {
          setErrorMsg('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน');
          return;
        }
      }

      const pinToSet = removePin ? '' : newPin.trim();
      const res = await verifyAndResetForgottenPin(username.trim().toLowerCase(), registeredName.trim().toLowerCase(), pinToSet);
      if (!res.success) {
        setErrorMsg(res.message);
        return;
      }

      setSuccessMsg(removePin 
        ? 'ล้างรหัสผ่านเรียบร้อยแล้ว คุณสามารถเข้าสู่ระบบโดยไม่ต้องกรอก PIN ได้ทันที' 
        : 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว! สามารถใช้รหัสผ่านใหม่เข้าสู่ระบบได้ทันที'
      );

      if (onSuccessReset) {
        onSuccessReset(username.trim(), pinToSet);
      }

      setTimeout(() => {
        handleClose();
      }, 2500);

    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const cleanInput = adminReqInput.trim();
      if (!cleanInput) {
        setErrorMsg('กรุณาระบุชื่อผู้ใช้ หรือชื่อเล่นของคุณ');
        return;
      }

      const res = await requestAdminPasswordReset(cleanInput);
      if (!res.success) {
        setErrorMsg(res.message);
        return;
      }

      setSuccessMsg(res.message);
      setTimeout(() => {
        handleClose();
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการส่งคำขอ');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUsername('');
    setRegisteredName('');
    setNewPin('');
    setConfirmPin('');
    setRemovePin(false);
    setAdminReqInput('');
    setStep('verify');
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
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                กู้คืนรหัสผ่าน / ลืม PIN
              </h3>
              <p className="text-[11px] text-indigo-100 mt-0.5">
                รีเซ็ตรหัสผ่านพนักงานเพื่อเข้าใช้งานระบบ
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

        {/* Method Tabs */}
        <div className="p-4 sm:p-5">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
            <button
              type="button"
              onClick={() => { setMethod('self'); setErrorMsg(null); }}
              className={clsx(
                "flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                method === 'self' 
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs" 
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>รีเซ็ตด้วยตนเอง</span>
            </button>
            <button
              type="button"
              onClick={() => { setMethod('admin'); setErrorMsg(null); }}
              className={clsx(
                "flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                method === 'admin' 
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs" 
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
              )}
            >
              <Send className="w-3.5 h-3.5" />
              <span>แจ้งให้แอดมินช่วย</span>
            </button>
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="leading-relaxed font-medium">{successMsg}</div>
            </div>
          )}

          {/* METHOD 1: SELF-SERVICE RESET */}
          {method === 'self' && (
            <form onSubmit={handleResetSelfVerify} className="space-y-4">
              {step === 'verify' ? (
                <>
                  <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/60 text-[11px] text-indigo-900 dark:text-indigo-200 leading-relaxed">
                    ระบบจะตรวจสอบความถูกต้องจาก <strong>ชื่อผู้ใช้</strong> ร่วมกับ <strong>ชื่อที่ลงทะเบียนไว้</strong> เพื่อยืนยันว่าคุณเป็นเจ้าของบัญชีตัวจริง
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      1. ชื่อผู้ใช้ / รหัสพนักงาน (Username) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="เช่น emp01, somchai"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      2. ชื่อ-นามสกุล หรือชื่อเล่นที่ลงทะเบียนไว้ <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="เช่น สมชาย สดใส หรือ น้องแนน"
                        value={registeredName}
                        onChange={(e) => setRegisteredName(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                  >
                    <span>{loading ? 'กำลังตรวจสอบ...' : 'ตรวจสอบข้อมูลและตั้งรหัสผ่านใหม่'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>ยืนยันตัวตนสำเร็จ! กรุณากำหนดรหัสผ่านใหม่สำหรับ <strong>@{username}</strong></span>
                  </div>

                  <div className="flex items-center gap-2 pt-1 pb-1">
                    <input
                      type="checkbox"
                      id="removePinCheckbox"
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
                    <label htmlFor="removePinCheckbox" className="text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                      ล้างรหัสผ่าน (เข้าสู่ระบบโดยไม่ต้องกรอก PIN)
                    </label>
                  </div>

                  {!removePin && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          รหัสผ่าน หรือ PIN ใหม่ (4-6 หลัก หรือรหัสผ่าน) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPin ? 'text' : 'password'}
                            required={!removePin}
                            placeholder="ระบุรหัสผ่านใหม่ เช่น 1234"
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                            className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                          />
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <button
                            type="button"
                            onClick={() => setShowPin(!showPin)}
                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          ยืนยันรหัสผ่านใหม่ <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showPin ? 'text' : 'password'}
                            required={!removePin}
                            placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                            value={confirmPin}
                            onChange={(e) => setConfirmPin(e.target.value)}
                            className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                          />
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep('verify')}
                      className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{loading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* METHOD 2: ASK ADMIN TO RESET */}
          {method === 'admin' && (
            <form onSubmit={handleAdminRequest} className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/80 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                กรณีจำข้อมูลชื่อไม่ได้ สามารถส่งคำขอแจ้งให้ผู้ดูแลระบบ (แอดมิน) ช่วยรีเซ็ตรหัสผ่านให้เป็นรหัสชั่วคราวได้ แอดมินจะเห็นการแจ้งเตือนทันทีในหน้าจัดการ
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  ระบุชื่อผู้ใช้, รหัสพนักงาน หรือชื่อเล่นของคุณ <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="เช่น emp01 หรือ น้องแนน"
                    value={adminReqInput}
                    onChange={(e) => setAdminReqInput(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{loading ? 'กำลังส่งคำขอ...' : 'ส่งคำขอรีเซ็ตรหัสผ่านไปยังแอดมิน'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
