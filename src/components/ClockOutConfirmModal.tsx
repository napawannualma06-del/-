import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { clockOutEmployee, ShiftActionResult } from '../lib/shiftService';
import { Case } from '../types';
import { LogOut, AlertTriangle, CheckCircle2, Clock, X } from 'lucide-react';

interface ClockOutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  isSelf?: boolean;
  onSuccess?: (result: ShiftActionResult) => void;
}

export const ClockOutConfirmModal: React.FC<ClockOutConfirmModalProps> = ({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  isSelf = true,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [activeCases, setActiveCases] = useState<Case[]>([]);
  const [fetchingCases, setFetchingCases] = useState(true);

  // ดึงเคสที่กำลังดำเนินการของพนักงานท่านนี้
  useEffect(() => {
    if (!isOpen || !employeeId) return;

    let isMounted = true;
    setFetchingCases(true);

    async function loadActiveCases() {
      try {
        const casesRef = collection(db, 'cases');
        const q = query(casesRef, where('assigneeId', '==', employeeId));
        const snap = await getDocs(q);
        const list: Case[] = [];
        snap.forEach((d) => {
          const data = d.data() as Case;
          if (data.status === 'processing' || data.status === 'credit_check') {
            list.push({ ...data, id: d.id });
          }
        });

        // ตรวจสอบกรณีผูกด้วยชื่อ
        if (employeeName) {
          const qName = query(casesRef, where('assigneeName', '==', employeeName));
          const snapName = await getDocs(qName);
          snapName.forEach((d) => {
            const data = d.data() as Case;
            if (
              (data.status === 'processing' || data.status === 'credit_check') &&
              !list.some((c) => c.id === d.id)
            ) {
              list.push({ ...data, id: d.id });
            }
          });
        }

        if (isMounted) {
          setActiveCases(list);
          setFetchingCases(false);
        }
      } catch (e) {
        console.error('Failed to load active cases for clock out modal', e);
        if (isMounted) setFetchingCases(false);
      }
    }

    loadActiveCases();

    return () => {
      isMounted = false;
    };
  }, [isOpen, employeeId, employeeName]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await clockOutEmployee(employeeId, employeeName);
      if (onSuccess) {
        onSuccess(res);
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการบันทึกเลิกงาน');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 transition-all text-slate-900 dark:text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                บันทึกเลิกงาน
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSelf ? 'ลงเวลาเลิกงานของคุณ' : `ลงเวลาเลิกงานให้ ${employeeName}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-3">
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>ระบบจะส่งคืนเคสกลับไป "รอรับเคส" อัตโนมัติ</span>
            </div>
            <p className="leading-relaxed">
              เมื่อบันทึกเลิกงาน เคสที่กำลังทำอยู่ทั้งหมดจะถูกเปลี่ยนสถานะกลับเป็น 
              <strong className="mx-1 text-indigo-600 dark:text-indigo-400 font-semibold">"รอรับเคส"</strong>
              ทันที เพื่อให้เพื่อนร่วมงานท่านอื่นสามารถรับเคสไปดำเนินการต่อได้
            </p>
          </div>

          {/* List of active cases affected */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
              <span>เคสที่กำลังทำอยู่ขณะนี้:</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {fetchingCases ? 'กำลังตรวจสอบ...' : `${activeCases.length} เคส`}
              </span>
            </div>

            {fetchingCases ? (
              <div className="py-3 text-center text-xs text-slate-400 animate-pulse">
                กำลังตรวจสอบรายการเคส...
              </div>
            ) : activeCases.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                ไม่มีเคสค้างที่กำลังทำอยู่ สามารถเลิกงานได้ทันที
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {activeCases.map((c) => (
                  <div
                    key={c.id}
                    className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold block truncate text-slate-800 dark:text-slate-200">
                        {c.iphoneModel}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ผู้ส่ง: {c.agentName} ({c.province})
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shrink-0">
                      กำลังทำเคส
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Clock className="w-3.5 h-3.5 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <LogOut className="w-3.5 h-3.5" />
                ยืนยันเลิกงาน {activeCases.length > 0 ? `(ส่งคืน ${activeCases.length} เคส)` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
