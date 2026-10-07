import React, { useState } from 'react';
import { 
  X, 
  Users, 
  UserCheck, 
  UserX, 
  Trash2, 
  ShieldCheck, 
  Clock, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert,
  Calendar,
  KeyRound,
  QrCode
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';
import { useStore, UserProfile } from '../store/useStore';
import { AnimalAvatar } from './AnimalAvatar';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserManagementModal({ isOpen, onClose }: UserManagementModalProps) {
  const { user: currentUser, registeredUsers, approveUser, rejectUser, deleteUserAccount } = useStore();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  if (!isOpen) return null;

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg(null);
    }, 3500);
  };

  const pendingUsers = registeredUsers.filter(u => u.accountStatus === 'pending');
  const approvedUsers = registeredUsers.filter(u => u.accountStatus !== 'pending' && u.accountStatus !== 'rejected');

  const filteredApprovedUsers = approvedUsers.filter(u => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q))
    );
  });

  const handleApprove = async (u: UserProfile) => {
    setLoadingActionId(u.uid);
    try {
      const res = await approveUser(u.uid);
      if (res.success) {
        showToast(`อนุมัติบัญชี "${u.name}" (@${u.username}) เรียบร้อยแล้ว`);
      } else {
        showToast(res.message || 'เกิดข้อผิดพลาดในการอนุมัติ', 'error');
      }
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleRejectOrDeletePending = async (u: UserProfile) => {
    setLoadingActionId(u.uid);
    try {
      const res = await deleteUserAccount(u.uid);
      if (res.success) {
        showToast(`ปฏิเสธและลบบัญชีคำขอ "${u.name}" เรียบร้อยแล้ว`);
      } else {
        showToast(res.message || 'เกิดข้อผิดพลาดในการลบคำขอ', 'error');
      }
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    const target = userToDelete;
    setLoadingActionId(target.uid);
    try {
      const res = await deleteUserAccount(target.uid);
      if (res.success) {
        showToast(`ลบบัญชี "${target.name}" (@${target.username}) ออกจากระบบสำเร็จ`);
        setUserToDelete(null);
      } else {
        showToast(res.message || 'ไม่สามารถลบบัญชีได้', 'error');
      }
    } finally {
      setLoadingActionId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>จัดการพนักงาน & อนุมัติการเข้าใช้งาน</span>
                {pendingUsers.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white animate-pulse">
                    รออนุมัติ {pendingUsers.length}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ตรวจสอบคำขอสมัครใหม่ อนุมัติสิทธิ์ และจัดการลบบัญชีในระบบ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Notification */}
        {toastMsg && (
          <div className={clsx(
            "mx-5 mt-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-top-2 duration-150",
            toastMsg.type === 'success' 
              ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300"
          )}>
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="px-5 pt-4">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={clsx(
                "flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer",
                activeTab === 'pending'
                  ? "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>คำขอรออนุมัติ</span>
              {pendingUsers.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-extrabold">
                  {pendingUsers.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('approved')}
              className={clsx(
                "flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer",
                activeTab === 'approved'
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>พนักงานในระบบทั้งหมด ({approvedUsers.length})</span>
            </button>
          </div>
        </div>

        {/* Tab 1: PENDING APPROVALS */}
        {activeTab === 'pending' && (
          <div className="p-5 flex-1 overflow-y-auto space-y-3">
            {pendingUsers.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mx-auto mb-3 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  ไม่มีคำขอสมัครใหม่ที่รอการอนุมัติ
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  เมื่อมีผู้ใช้ใหม่กดลงทะเบียนผ่านหน้าระบบ รายชื่อจะปรากฏที่นี่เพื่อให้แอดมินกดอนุมัติก่อนเข้าใช้งาน
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    กรุณาตรวจสอบรายชื่อและรหัสพนักงาน หากเป็นพนักงานในทีมให้กด <strong>"อนุมัติเข้าใช้งาน"</strong>
                  </span>
                </div>

                {pendingUsers.map((u) => {
                  const isProcessing = loadingActionId === u.uid;
                  return (
                    <div 
                      key={u.uid}
                      className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-amber-200 dark:border-amber-900/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:border-amber-400"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AnimalAvatar identifier={u.username || u.uid} name={u.name} size="md" />
                        <div className="min-w-0 truncate">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                            <span>{u.name}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              รออนุมัติ
                            </span>
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>Username: <strong>@{u.username}</strong></span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {u.createdAt ? format(u.createdAt, 'dd MMM yyyy HH:mm น.', { locale: th }) : 'ไม่ระบุเวลา'}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleRejectOrDeletePending(u)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>ปฏิเสธ / ลบ</span>
                        </button>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleApprove(u)}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{isProcessing ? 'กำลังบันทึก...' : 'อนุมัติเข้าใช้งาน'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: ALL APPROVED STAFF */}
        {activeTab === 'approved' && (
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="ค้นหาชื่อพนักงาน หรือ Username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
              />
            </div>

            {/* List */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {filteredApprovedUsers.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  ไม่พบข้อมูลพนักงานที่ตรงกับคำค้นหา
                </div>
              ) : (
                filteredApprovedUsers.map((emp) => {
                  const isSuperAdmin = emp.username === 'gametpl' || emp.uid === 'admin_gametpl';
                  const isCurrent = currentUser && (currentUser.uid === emp.uid || currentUser.username === emp.username);

                  return (
                    <div 
                      key={emp.uid}
                      className="p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AnimalAvatar identifier={emp.username || emp.uid} name={emp.name} size="md" />
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                            <span>{emp.name}</span>
                            {isSuperAdmin && (
                              <span className="px-1.5 py-0.2 rounded-md bg-amber-500 text-white text-[9px] font-extrabold">
                                SUPER ADMIN
                              </span>
                            )}
                            {isCurrent && !isSuperAdmin && (
                              <span className="px-1.5 py-0.2 rounded-md bg-indigo-600 text-white text-[9px] font-bold">
                                บัญชีคุณ
                              </span>
                            )}
                            {emp.workStatus === 'working' ? (
                              <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">
                                ออนไลน์
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px]">
                                ออกกะ
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>@{emp.username}</span>
                            {emp.approvedBy && (
                              <span>• อนุมัติโดย: {emp.approvedBy}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(
                              new CustomEvent('open-employee-qr-modal', {
                                detail: { tab: 'directory', employeeId: emp.uid },
                              })
                            );
                          }}
                          className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                          title={`ดู QR Code รับเงินของ ${emp.name}`}
                        >
                          <QrCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span className="hidden sm:inline">QR รับเงิน</span>
                        </button>

                        {isSuperAdmin ? (
                          <span className="text-[11px] text-slate-400 italic">ผู้ดูแลหลัก</span>
                        ) : isCurrent ? (
                          <span className="text-[11px] text-slate-400 italic">กำลังใช้งาน</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setUserToDelete(emp)}
                            className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                            title={`ลบบัญชี ${emp.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span className="hidden sm:inline">ลบบัญชี</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs text-slate-500">
          <span>พนักงานที่อนุมัติแล้ว: {approvedUsers.length} คน</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 font-semibold cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>

      {/* CONFIRM DELETE MODAL */}
      {userToDelete && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div 
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  ยืนยันการลบบัญชีพนักงาน
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  การลบจะมีผลทันทีและไม่สามารถกู้คืนได้
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <p className="text-slate-900 dark:text-white font-semibold">
                ชื่อพนักงาน: <span className="font-bold text-rose-600 dark:text-rose-400">{userToDelete.name}</span>
              </p>
              <p className="text-slate-500">
                Username: @{userToDelete.username}
              </p>
              <p className="text-slate-500">
                เมื่อลบแล้ว พนักงานจะไม่สามารถเข้าสู่ระบบและจะไม่ปรากฏในตารางคิวงานอีกต่อไป
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={loadingActionId === userToDelete.uid}
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={loadingActionId === userToDelete.uid}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{loadingActionId === userToDelete.uid ? 'กำลังลบ...' : 'ยืนยันลบบัญชี'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
