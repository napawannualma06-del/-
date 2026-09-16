import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Case } from './Queue';
import { BarChart3, Users, CheckCircle, Clock, Calendar, ShieldAlert } from 'lucide-react';
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
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3"></div>
        <p className="text-sm">กำลังโหลดข้อมูลแดชบอร์ด...</p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter cases based on selected timeframe
  const filteredCases = timeFilter === 'today'
    ? cases.filter(c => c.createdAt >= today.getTime() || (c.completedAt && c.completedAt >= today.getTime()))
    : cases;

  const closedCases = filteredCases.filter(c => c.status === 'closed');
  const activeCases = filteredCases.filter(c => c.status !== 'closed');

  // Calculate performance per employee
  const employeeStats: Record<string, { name: string, count: number, processingCount: number }> = {};
  
  filteredCases.forEach(c => {
    if (c.assigneeId && c.assigneeName) {
      if (!employeeStats[c.assigneeId]) {
        employeeStats[c.assigneeId] = { name: c.assigneeName, count: 0, processingCount: 0 };
      }
      if (c.status === 'closed') {
        employeeStats[c.assigneeId].count += 1;
      } else {
        employeeStats[c.assigneeId].processingCount += 1;
      }
    }
  });

  const sortedEmployees = Object.values(employeeStats).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center">
            <BarChart3 className="w-6 h-6 mr-2 text-indigo-600" />
            แดชบอร์ดผู้ดูแลระบบ
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            สรุปภาพรวมการรับเคสและประสิทธิภาพการทำงานของพนักงาน
          </p>
        </div>

        {/* Time Filter Tabs */}
        <div className="flex bg-slate-200/80 p-1 rounded-xl self-start sm:self-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTimeFilter('today')}
            className={clsx(
              "px-3 py-1.5 rounded-lg transition",
              timeFilter === 'today' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            เฉพาะวันนี้ ({format(new Date(), 'dd MMM', { locale: th })})
          </button>
          <button
            type="button"
            onClick={() => setTimeFilter('all')}
            className={clsx(
              "px-3 py-1.5 rounded-lg transition",
              timeFilter === 'all' ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            ทั้งหมด ({cases.length} เคส)
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">เคสทั้งหมด</span>
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">{filteredCases.length}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">ในระบบช่วงเวลาที่เลือก</p>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">จบเคสแล้ว (สำเร็จ)</span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{closedCases.length}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {filteredCases.length > 0 ? Math.round((closedCases.length / filteredCases.length) * 100) : 0}% สำเร็จ
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">กำลังดำเนินการ</span>
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-amber-600">{activeCases.length}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">รอรับ / เช็คเครดิต / กำลังทำ</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">พนักงานที่ทำงาน</span>
            <span className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-sky-600">{sortedEmployees.length}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">มีเคสในความดูแล</p>
          </div>
        </div>
      </div>

      {/* Main Sections: Performance Table & Recent Completed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Employee Leaderboard */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center">
                <Users className="w-4 h-4 mr-2 text-indigo-600" />
                ตารางผลงานพนักงาน (Performance)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">เรียงตามจำนวนเคสที่ปิดได้สำเร็จ</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              {sortedEmployees.length} คน
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {sortedEmployees.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                ยังไม่มีข้อมูลผลงานพนักงานในช่วงเวลานี้
              </div>
            ) : (
              sortedEmployees.map((emp, idx) => (
                <div key={idx} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/80 transition">
                  <div className="flex items-center min-w-0">
                    <div className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mr-3 shrink-0",
                      idx === 0 ? "bg-amber-100 text-amber-800 ring-2 ring-amber-300" :
                      idx === 1 ? "bg-slate-200 text-slate-700" :
                      idx === 2 ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-slate-900 truncate">{emp.name}</p>
                      <p className="text-xs text-slate-400">
                        กำลังทำอยู่: <span className="text-slate-600 font-medium">{emp.processingCount} เคส</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ปิดแล้ว {emp.count} เคส
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Today's Completed Cases Feed */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" />
              เคสที่จบแล้วล่าสุด
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">รายการเคสที่ปิดสมบูรณ์แล้ว</p>
          </div>

          <div className="p-4 flex-1 overflow-y-auto max-h-[420px] space-y-2.5">
            {closedCases.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                ยังไม่มีเคสที่จบในรอบนี้
              </div>
            ) : (
              closedCases.slice(0, 10).map((c) => (
                <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 truncate">{c.iphoneModel}</span>
                    <span className="text-[10px] text-slate-400">
                      {c.completedAt ? format(c.completedAt, 'HH:mm น.', { locale: th }) : ''}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[11px] flex justify-between">
                    <span>ตัวแทน: {c.agentName} ({c.province})</span>
                  </div>
                  <div className="pt-1 text-[11px] text-emerald-700 font-medium">
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
