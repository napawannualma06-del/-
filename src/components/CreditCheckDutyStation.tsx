import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { DutyWorker, CreditCheckDuty } from '../types';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  ShieldCheck, 
  UserPlus, 
  LogOut, 
  Users, 
  Clock, 
  CheckCircle2, 
  Lock,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

interface CreditCheckDutyStationProps {
  onStatusChange?: (isCurrentWorker: boolean, workers: DutyWorker[]) => void;
  compact?: boolean;
}

export function CreditCheckDutyStation({ onStatusChange, compact = false }: CreditCheckDutyStationProps) {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin' && (user?.username?.toLowerCase() === 'gametpl' || user?.uid === 'admin_gametpl');
  const [workers, setWorkers] = useState<DutyWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const dutyDocRef = doc(db, 'system_duties', 'credit_check');
    const unsub = onSnapshot(dutyDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CreditCheckDuty;
        const currentWorkers = Array.isArray(data.workers) ? data.workers : [];
        setWorkers(currentWorkers);
        if (onStatusChange && user) {
          const isCurrentWorker = currentWorkers.some(w => w.uid === user.uid || w.username === user.username);
          onStatusChange(isCurrentWorker, currentWorkers);
        }
      } else {
        setWorkers([]);
        if (onStatusChange) {
          onStatusChange(false, []);
        }
      }
      setLoading(false);
    }, (err) => {
      console.warn('Error fetching credit check duty status:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user, onStatusChange]);

  const isCurrentWorker = workers.some(w => w.uid === user?.uid || w.username === user?.username);
  const isFull = workers.length >= 2;

  const handleJoinDuty = async () => {
    if (!user || isProcessing) return;
    if (isCurrentWorker) return;
    if (workers.length >= 2) {
      alert('เจ้าหน้าที่งานเช็คเครดิตเต็มแล้ว (จำกัด 2 คนพร้อมกันเท่านั้น)');
      return;
    }

    setIsProcessing(true);
    try {
      const newWorker: DutyWorker = {
        uid: user.uid,
        name: user.name,
        username: user.username,
        joinedAt: Date.now(),
      };
      const updatedWorkers = [...workers, newWorker];
      await setDoc(doc(db, 'system_duties', 'credit_check'), {
        workers: updatedWorkers,
        updatedAt: Date.now(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'system_duties/credit_check');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLeaveDuty = async (targetUid?: string) => {
    if (!user || isProcessing) return;
    const uidToRemove = targetUid || user.uid;

    // Only worker themself or admin can remove
    if (uidToRemove !== user.uid && !isAdmin) {
      alert('คุณไม่มีสิทธิ์ปลดเจ้าหน้าที่ท่านนี้ (เฉพาะเจ้าตัวเองหรือแอดมินเท่านั้น)');
      return;
    }

    setIsProcessing(true);
    try {
      const updatedWorkers = workers.filter(w => w.uid !== uidToRemove && w.username !== uidToRemove);
      await setDoc(doc(db, 'system_duties', 'credit_check'), {
        workers: updatedWorkers,
        updatedAt: Date.now(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'system_duties/credit_check');
    } finally {
      setIsProcessing(false);
    }
  };

  const slot1 = workers[0] || null;
  const slot2 = workers[1] || null;

  return (
    <div className={clsx(
      "bg-white dark:bg-slate-900 rounded-2xl border shadow-xs transition-all overflow-hidden",
      isCurrentWorker 
        ? "border-emerald-300 dark:border-emerald-800/80 ring-2 ring-emerald-500/20" 
        : "border-indigo-100 dark:border-slate-800"
    )}>
      {/* Header Banner */}
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/50 to-white dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 border-b border-indigo-100/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center space-x-3">
          <div className={clsx(
            "w-9 h-9 rounded-xl flex items-center justify-center shadow-xs shrink-0",
            isCurrentWorker 
              ? "bg-emerald-600 text-white" 
              : "bg-indigo-600 text-white"
          )}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center">
                งานเช็คเครดิต
                <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  จำกัด 2 คน ({workers.length}/2)
                </span>
              </h2>
              {isCurrentWorker && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  <Sparkles className="w-2.5 h-2.5 mr-1 text-emerald-600 dark:text-emerald-400" />
                  คุณเข้าเวรนี้อยู่
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ผู้ที่ทำหน้าที่นี้เท่านั้นที่จะสามารถ <span className="font-semibold text-indigo-600 dark:text-indigo-400">สร้างเคสใหม่</span> ได้ (สร้างเคส = เครดิตผ่านทันที)
            </p>
          </div>
        </div>

        {/* Action Button for Current User */}
        <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
          {isCurrentWorker ? (
            <button
              type="button"
              onClick={() => handleLeaveDuty()}
              disabled={isProcessing}
              className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-semibold transition flex items-center cursor-pointer disabled:opacity-50"
              title="สละหน้าที่เช็คเครดิต เพื่อให้เพื่อนร่วมงานท่านอื่นเข้าทำแทน"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
              {isProcessing ? 'กำลังออก...' : 'ออกจากเวรเช็คเครดิต'}
            </button>
          ) : !isFull ? (
            <button
              type="button"
              onClick={handleJoinDuty}
              disabled={isProcessing}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold shadow-xs transition flex items-center cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              {isProcessing ? 'กำลังเข้าเวร...' : 'เข้าประจำเวรเช็คเครดิต (รับหน้าที่)'}
            </button>
          ) : (
            <div className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium flex items-center">
              <Lock className="w-3 h-3 mr-1 text-slate-400" />
              เวรเต็มแล้ว (2/2 คน)
            </div>
          )}
        </div>
      </div>

      {/* 2 Worker Slots */}
      <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
        {/* SLOT 1 */}
        <div className={clsx(
          "p-3 rounded-xl border transition flex items-center justify-between",
          slot1 
            ? "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700" 
            : "bg-slate-50/50 dark:bg-slate-800/20 border-dashed border-slate-200 dark:border-slate-700"
        )}>
          {slot1 ? (
            <div className="flex items-center space-x-3 min-w-0">
              <AnimalAvatar identifier={slot1.username || slot1.uid} name={slot1.name} size="md" />
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {slot1.name}
                  </span>
                  {slot1.uid === user?.uid && (
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">(คุณ)</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center space-x-1">
                  <span>@{slot1.username}</span>
                  <span>•</span>
                  <span>เข้าเวร {format(slot1.joinedAt, 'HH:mm น.', { locale: th })}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-3 text-slate-400 dark:text-slate-500">
              <div className="w-8 h-8 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs">
                1
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ตำแหน่งที่ 1: ว่าง</span>
                <p className="text-[10px] text-slate-400">รอพนักงานกดรับหน้าที่</p>
              </div>
            </div>
          )}

          {/* Slot 1 Actions */}
          <div>
            {slot1 ? (
              (slot1.uid === user?.uid || isAdmin) && (
                <button
                  type="button"
                  onClick={() => handleLeaveDuty(slot1.uid)}
                  className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-medium cursor-pointer"
                  title={isAdmin && slot1.uid !== user?.uid ? "ปลดพนักงานออกจากเวร (สิทธิ์แอดมิน)" : "ออกจากหน้าที่"}
                >
                  {slot1.uid === user?.uid ? 'สละหน้าที่' : 'ปลด (แอดมิน)'}
                </button>
              )
            ) : !isCurrentWorker && (
              <button
                type="button"
                onClick={handleJoinDuty}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                + ประจำตำแหน่งนี้
              </button>
            )}
          </div>
        </div>

        {/* SLOT 2 */}
        <div className={clsx(
          "p-3 rounded-xl border transition flex items-center justify-between",
          slot2 
            ? "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700" 
            : "bg-slate-50/50 dark:bg-slate-800/20 border-dashed border-slate-200 dark:border-slate-700"
        )}>
          {slot2 ? (
            <div className="flex items-center space-x-3 min-w-0">
              <AnimalAvatar identifier={slot2.username || slot2.uid} name={slot2.name} size="md" />
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {slot2.name}
                  </span>
                  {slot2.uid === user?.uid && (
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">(คุณ)</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center space-x-1">
                  <span>@{slot2.username}</span>
                  <span>•</span>
                  <span>เข้าเวร {format(slot2.joinedAt, 'HH:mm น.', { locale: th })}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-3 text-slate-400 dark:text-slate-500">
              <div className="w-8 h-8 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs">
                2
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ตำแหน่งที่ 2: ว่าง</span>
                <p className="text-[10px] text-slate-400">รอพนักงานกดรับหน้าที่</p>
              </div>
            </div>
          )}

          {/* Slot 2 Actions */}
          <div>
            {slot2 ? (
              (slot2.uid === user?.uid || isAdmin) && (
                <button
                  type="button"
                  onClick={() => handleLeaveDuty(slot2.uid)}
                  className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-medium cursor-pointer"
                  title={isAdmin && slot2.uid !== user?.uid ? "ปลดพนักงานออกจากเวร (สิทธิ์แอดมิน)" : "ออกจากหน้าที่"}
                >
                  {slot2.uid === user?.uid ? 'สละหน้าที่' : 'ปลด (แอดมิน)'}
                </button>
              )
            ) : !isCurrentWorker && (
              <button
                type="button"
                onClick={handleJoinDuty}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                + ประจำตำแหน่งนี้
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
