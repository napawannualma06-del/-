import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case } from './Queue';
import { 
  BarChart3, 
  Users, 
  CheckCircle, 
  Clock, 
  Calendar, 
  Ban,
  TrendingUp,
  Smartphone
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

export function AdminDashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'all'>('today');

  useEffect(() => {
    const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData: Case[] = [];
      snapshot.forEach((doc) => {
        casesData.push({ id: doc.id, ...doc.data() } as Case);
      });
      setCases(casesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'cases');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-slate-400">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3"></div>
        <p className="text-sm">กำลังโหลดข้อมูลแดชบอร์ด...</p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter cases based on selected timeframe
  const filteredCases = timeFilter === 'today'
    ? cases.filter(c => c.createdAt >= today.getTime() || (c.completedAt && c.completedAt >= today.getTime()) || (c.cancelledAt && c.cancelledAt >= today.getTime()))
    : cases;

  const closedCases = filteredCases.filter(c => c.status === 'closed');
  const cancelledCases = filteredCases.filter(c => c.status === 'cancelled');
  const activeCases = filteredCases.filter(c => c.status !== 'closed' && c.status !== 'cancelled');

  // Calculate performance per employee
  const employeeStats: Record<string, { name: string, count: number, processingCount: number, cancelledCount: number }> = {};
  
  filteredCases.forEach(c => {
    if (c.assigneeId && c.assigneeName) {
      if (!employeeStats[c.assigneeId]) {
        employeeStats[c.assigneeId] = { name: c.assigneeName, count: 0, processingCount: 0, cancelledCount: 0 };
      }
      if (c.status === 'closed') {
        employeeStats[c.assigneeId].count += 1;
      } else if (c.status === 'cancelled') {
        employeeStats[c.assigneeId].cancelledCount += 1;
      } else {
        employeeStats[c.assigneeId].processingCount += 1;
      }
    }
  });

  const sortedEmployees = Object.values(employeeStats).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center">
            <BarChart3 className="w-6 h-6 mr-2 text-indigo-600 dark:text-indigo-400" />
            แดชบอร์ดและภาพรวมงาน
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            สรุปภาพรวมการรับเคส สถานะงาน และประสิทธิภาพการทำงานของทุกคนในทีม
          </p>
        </div>

        {/* Time Filter Tabs */}
        <div className="flex bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTimeFilter('today')}
            className={clsx(
              "px-3 py-1.5 rounded-lg transition cursor-pointer",
              timeFilter === 'today' 
                ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs" 
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            เฉพาะวันนี้ ({format(new Date(), 'dd MMM', { locale: th })})
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('all')}
            className={clsx(
              "px-3 py-1.5 rounded-lg transition cursor-pointer",
              timeFilter === 'all' 
                ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-white shadow-xs" 
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            ทั้งหมด ({cases.length} เคส)
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">เคสทั้งหมด</span>
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{filteredCases.length}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">ในระบบช่วงเวลาที่เลือก</p>
          </div>
        </div>
        
        {/* Closed Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">จบเคสแล้ว (สำเร็จ)</span>
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{closedCases.length}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {filteredCases.length > 0 ? Math.round((closedCases.length / filteredCases.length) * 100) : 0}% สำเร็จ
            </p>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">กำลังดำเนินการ</span>
            <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{activeCases.length}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">รอรับ / เช็คเครดิต / กำลังทำ</p>
          </div>
        </div>

        {/* Cancelled Cases */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ยกเลิกเคส</span>
            <span className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Ban className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{cancelledCases.length}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">เคสที่ถูกยกเลิก</p>
          </div>
        </div>

        {/* Team Members */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 transition-colors col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ทีมงานที่ทำเคส</span>
            <span className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-sky-600 dark:text-sky-400">{sortedEmployees.length}</div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">มีงานในความดูแล</p>
          </div>
        </div>
      </div>

      {/* Main Sections: Performance Table & Recent Completed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Employee Leaderboard */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center">
                <Users className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                ตารางผลงานพนักงาน (Performance)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">เรียงตามจำนวนเคสที่ปิดได้สำเร็จ</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">
              {sortedEmployees.length} คน
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedEmployees.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                ยังไม่มีข้อมูลผลงานพนักงานในช่วงเวลานี้
              </div>
            ) : (
              sortedEmployees.map((emp, idx) => (
                <div key={idx} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <div className="flex items-center min-w-0">
                    <div className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mr-3 shrink-0",
                      idx === 0 ? "bg-amber-100 text-amber-800 ring-2 ring-amber-300 dark:bg-amber-950 dark:text-amber-200" :
                      idx === 1 ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" :
                      idx === 2 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{emp.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>กำลังทำ: <strong className="text-slate-700 dark:text-slate-300 font-medium">{emp.processingCount} เคส</strong></span>
                        {emp.cancelledCount > 0 && (
                          <span className="text-rose-500 dark:text-rose-400">ยกเลิก: {emp.cancelledCount}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1 text-xs font-bold rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      ปิดแล้ว {emp.count} เคส
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Today's Completed Cases Feed */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400" />
              เคสที่จบแล้วล่าสุด
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">รายการเคสที่ปิดสมบูรณ์แล้ว</p>
          </div>

          <div className="p-4 flex-1 overflow-y-auto max-h-[420px] space-y-2.5">
            {closedCases.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                ยังไม่มีเคสที่จบในรอบนี้
              </div>
            ) : (
              closedCases.slice(0, 10).map((c) => (
                <div key={c.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">{c.iphoneModel}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {c.completedAt ? format(c.completedAt, 'HH:mm น.', { locale: th }) : ''}
                    </span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] flex justify-between">
                    <span>ตัวแทน: {c.agentName} ({c.province})</span>
                  </div>
                  <div className="pt-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                    ผู้จบเคส: {c.assigneeName || 'ไม่ระบุ'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
