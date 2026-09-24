import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Calculator, 
  Table, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  Check, 
  Smartphone, 
  Zap, 
  ShieldCheck, 
  Clock, 
  BatteryCharging,
  Globe,
  RefreshCw,
  Info,
  SlidersHorizontal,
  ArrowRight,
  Wrench,
  Ban,
  MessageSquare,
  Gift,
  HelpCircle,
  CalendarCheck
} from 'lucide-react';
import { 
  REFINANCE_RATES, 
  FOOTER_NOTES, 
  RefinanceModelRate,
  MachineOrigin,
  RepairConditions,
  calculateAdjustedRefinance,
  calculateEarlyPayoffDiscount
} from '../data/refinanceRates';
import { clsx } from 'clsx';

interface RefinanceGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialModel?: string;
}

export const RefinanceGuideModal: React.FC<RefinanceGuideModalProps> = ({
  isOpen,
  onClose,
  initialModel
}) => {
  const [activeTab, setActiveTab] = useState<'table' | 'calculator'>('table');
  const [selectedSeries, setSelectedSeries] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Table View modifiers
  const [tableOrigin, setTableOrigin] = useState<MachineOrigin>('thai');
  const [tableIsRefurbished, setTableIsRefurbished] = useState<boolean>(false);
  const [tableRepairOption, setTableRepairOption] = useState<'none' | 'screen' | 'camera'>('none');

  // Calculator state
  const [calcModelId, setCalcModelId] = useState<string>(() => {
    if (initialModel) {
      const match = REFINANCE_RATES.find(r => r.model.toLowerCase() === initialModel.toLowerCase());
      if (match) return match.id;
    }
    return 'ip-16e';
  });
  const [calcBattery, setCalcBattery] = useState<number>(85);
  const [calcOrigin, setCalcOrigin] = useState<MachineOrigin>('thai');
  const [calcIsRefurbished, setCalcIsRefurbished] = useState<boolean>(false);

  // Repair conditions in calculator
  const [screenReplaced, setScreenReplaced] = useState<boolean>(false);
  const [cameraReplaced, setCameraReplaced] = useState<boolean>(false);
  const [motherboardRepaired, setMotherboardRepaired] = useState<boolean>(false);
  const [batteryReplaced, setBatteryReplaced] = useState<boolean>(false);

  // Term selection & Early payoff simulation state
  const [selectedTerm, setSelectedTerm] = useState<3 | 6 | 9 | 12 | 15>(6);
  const [earlyClosingAt, setEarlyClosingAt] = useState<number>(1); // ปิดในงวดที่ 1, 2, 3...
  const [lateDays, setLateDays] = useState<number>(0); // วันล่าช้า

  const [copiedGeneral, setCopiedGeneral] = useState<boolean>(false);
  const [copiedPitch, setCopiedPitch] = useState<boolean>(false);

  // Filtered rates for table
  const filteredRates = useMemo(() => {
    return REFINANCE_RATES.filter(item => {
      const matchSeries = selectedSeries === 'all' || item.series === selectedSeries;
      const matchSearch = searchQuery.trim() === '' || 
        item.model.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.loanAmount.toString().includes(searchQuery.trim());
      return matchSeries && matchSearch;
    });
  }, [selectedSeries, searchQuery]);

  // Selected rate for calculator
  const selectedRate = useMemo(() => {
    return REFINANCE_RATES.find(r => r.id === calcModelId) || REFINANCE_RATES[0];
  }, [calcModelId]);

  const repairConditions: RepairConditions = useMemo(() => ({
    screenReplaced,
    cameraReplaced,
    motherboardRepaired,
    batteryReplaced,
  }), [screenReplaced, cameraReplaced, motherboardRepaired, batteryReplaced]);

  const calcResult = useMemo(() => {
    return calculateAdjustedRefinance(selectedRate, {
      batteryHealth: calcBattery,
      machineOrigin: calcOrigin,
      isRefurbished: calcIsRefurbished,
      repairConditions,
    });
  }, [selectedRate, calcBattery, calcOrigin, calcIsRefurbished, repairConditions]);

  // Available terms for the matched rate
  const availableTerms = useMemo(() => {
    const list: (3 | 6 | 9 | 12 | 15)[] = [];
    if (calcResult.plans.term3) list.push(3);
    if (calcResult.plans.term6) list.push(6);
    if (calcResult.plans.term9) list.push(9);
    if (calcResult.plans.term12) list.push(12);
    if (calcResult.plans.term15) list.push(15);
    return list;
  }, [calcResult.plans]);

  // Ensure selectedTerm is valid
  const currentMonthlyAmount = useMemo(() => {
    if (selectedTerm === 3) return calcResult.plans.term3;
    if (selectedTerm === 6) return calcResult.plans.term6;
    if (selectedTerm === 9) return calcResult.plans.term9;
    if (selectedTerm === 12) return calcResult.plans.term12;
    if (selectedTerm === 15) return calcResult.plans.term15;
    return undefined;
  }, [selectedTerm, calcResult.plans]);

  // Early payoff computation
  const earlyPayoffData = useMemo(() => {
    const monthly = currentMonthlyAmount || 0;
    return calculateEarlyPayoffDiscount(selectedTerm, monthly, earlyClosingAt, lateDays);
  }, [selectedTerm, currentMonthlyAmount, earlyClosingAt, lateDays]);

  // คำอธิบายคำพูดสำหรับคุยกับลูกค้า (Customer Pitch Script)
  const customerPitchScript = useMemo(() => {
    if (!selectedRate || calcResult.isRejected || !currentMonthlyAmount) return '';

    const term = selectedTerm;
    const monthly = currentMonthlyAmount.toLocaleString();
    const finalLoan = calcResult.finalLoan.toLocaleString();
    const model = selectedRate.model;

    // คำนวณตัวอย่างปิดงวด 1, 2, 3
    const payoff1 = calculateEarlyPayoffDiscount(term, currentMonthlyAmount, 1, 0);
    const payoff2 = calculateEarlyPayoffDiscount(term, currentMonthlyAmount, 2, 0);
    const payoff3 = calculateEarlyPayoffDiscount(term, currentMonthlyAmount, 3, 0);

    // รวมเหตุผลการประเมินยอดแบบเข้าใจง่าย
    const adjustmentReasons: string[] = [];
    if (screenReplaced && cameraReplaced) {
      adjustmentReasons.push(`• ตัวเครื่องมีประวัติเปลี่ยนหน้าจอและเปลี่ยนกล้อง ➡️ ระบบจึงปรับลดระดับยอดจัดไฟแนนซ์ลงมาตามเกณฑ์มาตรฐาน`);
    } else if (screenReplaced) {
      adjustmentReasons.push(`• ตัวเครื่องมีประวัติเปลี่ยนหน้าจอ ➡️ ระบบจึงปรับลดระดับยอดจัดไฟแนนซ์ลงมาตามเกณฑ์มาตรฐาน`);
    } else if (cameraReplaced) {
      adjustmentReasons.push(`• ตัวเครื่องมีประวัติเปลี่ยนกล้อง ➡️ ระบบจึงปรับลดระดับยอดจัดไฟแนนซ์ลงมาตามเกณฑ์มาตรฐาน`);
    }

    if (calcOrigin === 'foreign') {
      adjustmentReasons.push(`• เป็นเครื่องนอก/เครื่องหิ้ว ➡️ ปรับลดระดับยอดจัดตามโมเดลเครื่อง`);
    }
    if (calcIsRefurbished) {
      adjustmentReasons.push(`• เป็นเครื่องรีเฟอร์บิช (Refurbished) ➡️ จัดยอด 50% ของเรทมาตรฐาน`);
    }
    if (batteryReplaced || (calcBattery >= 70 && calcBattery < 75)) {
      adjustmentReasons.push(`• มีการเปลี่ยนแบตเตอรี่ หรือ สุขภาพแบตเตอรี่ 70-74% (หักค่าธรรมเนียมแบตเตอรี่ 500 บ.)`);
    }

    const lines = [
      `📱 สรุปรายละเอียดสินเชื่อรีไฟแนนซ์ iPhone (THAIPLUS)`,
      `──────────────────────────────`,
      `รุ่น: ${model}`,
      `ยอดจัดไฟแนนซ์: ${finalLoan} บาท`,
      `ระยะเวลาสัญญา: ${term} เดือน`,
      `ค่างวดชำระ: ${monthly} บาท / เดือน`,
      `──────────────────────────────`,
      ...(adjustmentReasons.length > 0 ? [
        `📌 หมายเหตุการประเมินยอดจัด:`,
        ...adjustmentReasons,
        `──────────────────────────────`,
      ] : []),
      `🎁 สิทธิพิเศษ "ส่วนลดปิดยอดก่อนกำหนด":`,
      `• ปิดในงวดที่ 1 ➡️ ลดทันที 20% (ประหยัด ${payoff1.discountAmount.toLocaleString()} บ. จ่ายปิดเพียง ${payoff1.netPayoffAmount.toLocaleString()} บ.)`,
      ...(term > 1 ? [`• ปิดในงวดที่ 2 ➡️ ลดทันที 15% (ประหยัด ${payoff2.discountAmount.toLocaleString()} บ. จ่ายปิดเพียง ${payoff2.netPayoffAmount.toLocaleString()} บ.)`] : []),
      ...(term > 2 ? [`• ปิดในงวดที่ 3 ขึ้นไป ➡️ ลดทันที 10% (ประหยัด ${payoff3.discountAmount.toLocaleString()} บ. จ่ายปิดเพียง ${payoff3.netPayoffAmount.toLocaleString()} บ.)`] : []),
      `──────────────────────────────`,
      `⚠️ เงื่อนไขการชำระเงิน:`,
      `• ชำระตรงเวลา ไม่มีค่าบริการใดๆ เพิ่มเติมค่ะ`,
      `• กรณีชำระล่าช้า คิดวันละ 50 บาท (นับจากวันแรกที่เกินกำหนด)`,
      `• หากล่าช้าเกิน 16 วัน มีค่าบริการปลดล็อกระบบเพิ่ม 500 บาท`,
      `──────────────────────────────`,
      `✅ เครื่องอยู่กับคุณลูกค้าตลอด ไม่ต้องฝากเครื่องค่ะ`,
      `✅ ปิดยอดก่อนกำหนดได้ตลอดสัญญาตามสัดส่วนลดด้านบนค่ะ`,
      `ยินดีดำเนินการทำสัญญาให้ทันทีนะคะ 🙏`
    ];

    return lines.join('\n');
  }, [selectedRate, calcResult, currentMonthlyAmount, selectedTerm, screenReplaced, cameraReplaced, calcOrigin, calcIsRefurbished, batteryReplaced, calcBattery]);

  const handleCopyCustomerPitch = () => {
    if (!customerPitchScript) return;
    navigator.clipboard.writeText(customerPitchScript);
    setCopiedPitch(true);
    setTimeout(() => setCopiedPitch(false), 2500);
  };

  const handleCopyGeneralSummary = () => {
    if (!selectedRate) return;
    const isSpecial = calcOrigin === 'foreign' || calcIsRefurbished || screenReplaced || cameraReplaced;

    const repairList: string[] = [];
    if (screenReplaced) repairList.push('เปลี่ยนจอ');
    if (cameraReplaced) repairList.push('เปลี่ยนกล้อง');
    if (motherboardRepaired) repairList.push('เปลี่ยนบอร์ด/บอร์ดจิก (ไม่รับ ❌)');
    if (batteryReplaced) repairList.push('เปลี่ยนแบต (เตือนหัก 500 บ.)');

    const lines = [
      `⚡ THAIPLUS | ตารางรีไฟแนนซ์ iPhone`,
      `📱 รุ่น: ${selectedRate.model}`,
      `🏷 ประเภทเครื่อง: ${calcOrigin === 'foreign' ? 'เครื่องนอก' : 'เครื่องศูนย์ไทย'} ${calcIsRefurbished ? '• รีเฟอร์บิช (50%)' : ''}`,
      repairList.length > 0 ? `🔧 ประวัติซ่อม: ${repairList.join(', ')}` : null,
      isSpecial && !calcResult.isRejected ? `📌 เทียบยึดเรทในตารางของรุ่น: ${calcResult.matchedModelRate.model}` : null,
      calcResult.isRejected ? `❌ สถานะ: ไม่รับทำรายการ (${calcResult.rejectReason})` : `💰 ยอดจัดสุทธิ: ${calcResult.finalLoan.toLocaleString()} บาท`,
      `🗓 งวดที่เลือก: ${selectedTerm} เดือน (งวดละ ${currentMonthlyAmount?.toLocaleString() || '-'} บ./ด.)`,
      `🔋 สุขภาพแบตเตอรี่: ${calcBattery}%`,
      calcResult.batteryNotice ? `${calcResult.batteryNotice}` : null,
      ``,
      `🎁 ส่วนลดปิดยอดก่อนกำหนด: งวด 1 ลด 20% | งวด 2 ลด 15% | งวด 3+ ลด 10%`,
      `⚠️ ค่าล่าช้า: วันละ 50 บ. (เกิน 16 วัน มีค่าปลดล็อก +500 บ.)`,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines);
    setCopiedGeneral(true);
    setTimeout(() => setCopiedGeneral(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs border border-white/20 shadow-xs">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/20">
                  Thaiplus
                </span>
                <span className="text-xs text-blue-100 hidden sm:inline">
                  รับซื้อ • ปล่อยเช่า • รีไฟแนนซ์ iPhone
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5 mt-0.5">
                รีไฟแนนซ์ iPhone ผ่อนรายเดือน
                <span className="text-xs font-normal text-blue-200">(คู่มือ, เครื่องคำนวณ & ส่วนลดปิดยอด)</span>
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation & Search */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer",
                activeTab === 'table'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Table className="w-3.5 h-3.5" />
              ตารางเรทผ่อน
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calculator')}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer",
                activeTab === 'calculator'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Calculator className="w-3.5 h-3.5" />
              คำนวณงวด & ปิดยอดก่อนกำหนด
            </button>
          </div>

          {activeTab === 'table' && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="ค้นหารุ่น iPhone หรือยอดเงิน..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* TAB 1: TABLE VIEW */}
          {activeTab === 'table' && (
            <div className="space-y-4">
              {/* Table Mode Switches */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-slate-100 via-blue-50/40 to-indigo-50/40 dark:from-slate-800 dark:via-blue-950/20 dark:to-indigo-950/20 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      แสดงยอดจัดภายในตาราง (ยึดราคาในตารางเท่านั้น):
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="inline-flex rounded-lg bg-white dark:bg-slate-900 p-0.5 border border-slate-300 dark:border-slate-700 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setTableOrigin('thai')}
                        className={clsx(
                          "px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1",
                          tableOrigin === 'thai'
                            ? "bg-blue-600 text-white shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        )}
                      >
                        ศูนย์ไทย (ปกติ)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableOrigin('foreign')}
                        className={clsx(
                          "px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1",
                          tableOrigin === 'foreign'
                            ? "bg-amber-600 text-white shadow-2xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        )}
                      >
                        <Globe className="w-3 h-3" />
                        เครื่องนอก
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTableIsRefurbished(!tableIsRefurbished)}
                      className={clsx(
                        "px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 shadow-2xs",
                        tableIsRefurbished
                          ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-300 dark:ring-purple-900"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <RefreshCw className={clsx("w-3 h-3", tableIsRefurbished && "animate-spin-once")} />
                      <span>รีเฟอร์บิช (ลด 50%)</span>
                      {tableIsRefurbished && <Check className="w-3 h-3 ml-0.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/60 text-xs">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                    <Wrench className="w-3 h-3 text-orange-500" />
                    จำลองงานซ่อม:
                  </span>
                  <div className="inline-flex rounded-lg bg-white dark:bg-slate-900 p-0.5 border border-slate-300 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setTableRepairOption('none')}
                      className={clsx(
                        "px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer",
                        tableRepairOption === 'none'
                          ? "bg-slate-700 text-white font-semibold"
                          : "text-slate-600 dark:text-slate-400"
                      )}
                    >
                      ไม่ซ่อม
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableRepairOption('screen')}
                      className={clsx(
                        "px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer",
                        tableRepairOption === 'screen'
                          ? "bg-orange-600 text-white font-semibold"
                          : "text-slate-600 dark:text-slate-400"
                      )}
                    >
                      หักเปลี่ยนจอ
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableRepairOption('camera')}
                      className={clsx(
                        "px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer",
                        tableRepairOption === 'camera'
                          ? "bg-orange-600 text-white font-semibold"
                          : "text-slate-600 dark:text-slate-400"
                      )}
                    >
                      หักเปลี่ยนกล้อง
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    (เปลี่ยนจอ/กล้อง: ลดยอดจัดลงมาที่ใกล้เดิมที่สุดในตาราง | เปลี่ยนบอร์ด ❌ ไม่รับ)
                  </span>
                </div>
              </div>

              {/* Status Alert if viewing adjusted table */}
              {(tableOrigin === 'foreign' || tableIsRefurbished || tableRepairOption !== 'none') && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      ตารางกำลังแสดงยอดจัดที่ยึดยอดใกล้เคียงในตาราง: 
                      {tableOrigin === 'foreign' && <strong className="ml-1 text-amber-800 dark:text-amber-100">เครื่องนอก</strong>}
                      {tableIsRefurbished && <strong className="ml-1 text-purple-700 dark:text-purple-300">• เครื่องรีเฟอร์บิช (50%)</strong>}
                      {tableRepairOption !== 'none' && (
                        <strong className="ml-1 text-orange-700 dark:text-orange-300">
                          • {tableRepairOption === 'screen' ? 'หักเปลี่ยนจอ' : 'หักเปลี่ยนกล้อง'} (ลดยอดลงมาที่ใกล้เดิมที่สุด)
                        </strong>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTableOrigin('thai');
                      setTableIsRefurbished(false);
                      setTableRepairOption('none');
                    }}
                    className="text-[11px] underline font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 cursor-pointer"
                  >
                    รีเซ็ตเป็นเครื่องศูนย์ปกติ
                  </button>
                </div>
              )}

              {/* Series Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0 mr-1">
                  ซีรีส์:
                </span>
                {[
                  { id: 'all', label: 'ทั้งหมด (ทุกรุ่น)' },
                  { id: 'iPhone 17', label: 'iPhone 17 Series' },
                  { id: 'iPhone 16', label: 'iPhone 16 Series' },
                  { id: 'iPhone 15', label: 'iPhone 15 Series' },
                  { id: 'iPhone 14', label: 'iPhone 14 Series' },
                  { id: 'iPhone 12-13', label: 'iPhone 12-13 Series' },
                ].map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSeries(s.id)}
                    className={clsx(
                      "px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer",
                      selectedSeries === s.id
                        ? "bg-indigo-600 text-white shadow-2xs font-semibold"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Installment Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">รุ่น iPhone</th>
                      <th className="py-2.5 px-3 text-right bg-blue-50/70 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
                        {tableOrigin === 'foreign' || tableIsRefurbished || tableRepairOption !== 'none' ? 'ยอดจัด (ยึดตามตาราง)' : 'ยอดที่ได้ (บาท)'}
                      </th>
                      <th className="py-2.5 px-3 text-right">3 เดือน</th>
                      <th className="py-2.5 px-3 text-right">6 เดือน</th>
                      <th className="py-2.5 px-3 text-right">9 เดือน</th>
                      <th className="py-2.5 px-3 text-right">12 เดือน</th>
                      <th className="py-2.5 px-3 text-right bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300">15 เดือน</th>
                      <th className="py-2.5 px-2 text-center">คำนวณ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                    {filteredRates.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          ไม่พบข้อมูลรุ่น iPhone ที่ค้นหา
                        </td>
                      </tr>
                    ) : (
                      filteredRates.map((rate) => {
                        const tableCalc = calculateAdjustedRefinance(rate, {
                          batteryHealth: 100,
                          machineOrigin: tableOrigin,
                          isRefurbished: tableIsRefurbished,
                          repairConditions: {
                            screenReplaced: tableRepairOption === 'screen',
                            cameraReplaced: tableRepairOption === 'camera',
                          }
                        });

                        const isModified = tableOrigin === 'foreign' || tableIsRefurbished || tableRepairOption !== 'none';

                        return (
                          <tr 
                            key={rate.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{rate.model}</span>
                                {rate.isNew && (
                                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white uppercase tracking-wider">
                                    NEW
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-normal">{rate.series}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/10 whitespace-nowrap">
                              <div>{tableCalc.finalLoan.toLocaleString()} บ.</div>
                              {isModified && (
                                <div className="text-[10px] font-normal text-slate-400">
                                  <span className="line-through mr-1">{rate.loanAmount.toLocaleString()}</span>
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">ยึด {tableCalc.matchedModelRate.model}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {tableCalc.plans.term3 ? `${tableCalc.plans.term3.toLocaleString()} บ.` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {tableCalc.plans.term6 ? `${tableCalc.plans.term6.toLocaleString()} บ.` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {tableCalc.plans.term9 ? `${tableCalc.plans.term9.toLocaleString()} บ.` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {tableCalc.plans.term12 ? `${tableCalc.plans.term12.toLocaleString()} บ.` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10 whitespace-nowrap">
                              {tableCalc.plans.term15 ? `${tableCalc.plans.term15.toLocaleString()} บ.` : '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setCalcModelId(rate.id);
                                  setCalcOrigin(tableOrigin);
                                  setCalcIsRefurbished(tableIsRefurbished);
                                  setScreenReplaced(tableRepairOption === 'screen');
                                  setCameraReplaced(tableRepairOption === 'camera');
                                  setActiveTab('calculator');
                                }}
                                className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/60 text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-300 transition cursor-pointer"
                                title="เปิดเครื่องคำนวณ"
                              >
                                คำนวณ
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Rules & Notes Summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-500" />
                  เกณฑ์การจัดยอด & เงื่อนไขสำคัญ (THAIPLUS):
                </div>
                {FOOTER_NOTES.map((note, idx) => (
                  <p key={idx} className="text-[11px] leading-relaxed">• {note}</p>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE CALCULATOR */}
          {activeTab === 'calculator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Form Controls (Left Column) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    เลือกรุ่น & สภาพตัวเครื่อง
                  </h3>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      รุ่นเครื่อง
                    </label>
                    <select
                      value={calcModelId}
                      onChange={(e) => setCalcModelId(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      {REFINANCE_RATES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.model} {r.isNew ? '(NEW 2TB)' : ''} — ยอดจัดปกติ {r.loanAmount.toLocaleString()} บ.
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* เครื่องนอก / เครื่องศูนย์ไทย Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        ที่มาของเครื่อง (โมเดล):
                      </label>
                      {calcOrigin === 'foreign' && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          {selectedRate.loanAmount < 10000 ? 'ยอด <10k ลด ~1,000' : selectedRate.loanAmount <= 20000 ? 'ยอด 10-20k ลด ~2,000' : 'ยอด 20k+ ลด ~3,000'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCalcOrigin('thai')}
                        className={clsx(
                          "py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition cursor-pointer flex items-center justify-center gap-1.5",
                          calcOrigin === 'thai'
                            ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                            : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                        )}
                      >
                        <span>ศูนย์ไทย (TH)</span>
                        {calcOrigin === 'thai' && <Check className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setCalcOrigin('foreign')}
                        className={clsx(
                          "py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition cursor-pointer flex items-center justify-center gap-1.5",
                          calcOrigin === 'foreign'
                            ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                            : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                        )}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>เครื่องนอก / หิ้ว</span>
                        {calcOrigin === 'foreign' && <Check className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* เครื่องรีเฟอร์บิช */}
                  <div>
                    <label className={clsx(
                      "flex items-center gap-2.5 p-2 rounded-xl border text-xs font-medium cursor-pointer transition",
                      calcIsRefurbished
                        ? "bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}>
                      <input
                        type="checkbox"
                        checked={calcIsRefurbished}
                        onChange={(e) => setCalcIsRefurbished(e.target.checked)}
                        className="rounded-sm text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1">
                        <span className="font-bold block">เครื่องรีเฟอร์บิช (Refurbished)</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">จัดยอดลดลง 50% แล้วยึดยอดรุ่นใกล้เคียงในตาราง</span>
                      </div>
                    </label>
                  </div>

                  {/* ประวัติการซ่อม */}
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-orange-500" />
                      ประวัติการซ่อมของตัวเครื่อง:
                    </label>

                    {/* หักเปลี่ยนจอ */}
                    <label className={clsx(
                      "flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition",
                      screenReplaced
                        ? "bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}>
                      <input
                        type="checkbox"
                        checked={screenReplaced}
                        onChange={(e) => setScreenReplaced(e.target.checked)}
                        className="rounded-sm text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1">
                        <span className="font-bold">หักเปลี่ยนจอ</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          ลดไปจัดยอดรุ่นที่ต่ำลงมาและใกล้เคียงยอดเดิมที่สุดในตาราง
                        </span>
                      </div>
                    </label>

                    {/* หักเปลี่ยนกล้อง */}
                    <label className={clsx(
                      "flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition",
                      cameraReplaced
                        ? "bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}>
                      <input
                        type="checkbox"
                        checked={cameraReplaced}
                        onChange={(e) => setCameraReplaced(e.target.checked)}
                        className="rounded-sm text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1">
                        <span className="font-bold">หักเปลี่ยนกล้อง</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          ลดไปจัดยอดรุ่นที่ต่ำลงมาและใกล้เคียงยอดเดิมที่สุดในตาราง
                        </span>
                      </div>
                    </label>

                    {/* เปลี่ยนบอร์ด / บอร์ดจิก ❌ */}
                    <label className={clsx(
                      "flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition",
                      motherboardRepaired
                        ? "bg-rose-100 dark:bg-rose-950/60 border-rose-400 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}>
                      <input
                        type="checkbox"
                        checked={motherboardRepaired}
                        onChange={(e) => setMotherboardRepaired(e.target.checked)}
                        className="rounded-sm text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1">
                        <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <Ban className="w-3.5 h-3.5" />
                          เปลี่ยนบอร์ด / บอร์ดจิก (ไม่รับเด็ดขาด)
                        </span>
                        <span className="text-[10px] text-rose-500 dark:text-rose-400 block">
                          ไม่อนุมัติและไม่รับทำรายการทุกกรณี
                        </span>
                      </div>
                    </label>

                    {/* เปลี่ยนแบต */}
                    <label className={clsx(
                      "flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition",
                      batteryReplaced
                        ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    )}>
                      <input
                        type="checkbox"
                        checked={batteryReplaced}
                        onChange={(e) => setBatteryReplaced(e.target.checked)}
                        className="rounded-sm text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1">
                        <span className="font-bold">เปลี่ยนแบตเตอรี่</span>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 block">
                          แจ้งเตือนเฉยๆ ว่าต้องหัก 500 บาท แต่ไม่ลดยอดจัด
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* แบตเตอรี่ Slider */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />
                        สุขภาพแบตเตอรี่ (Battery Health):
                      </label>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {calcBattery}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={calcBattery}
                      onChange={(e) => setCalcBattery(Number(e.target.value))}
                      className="w-full accent-indigo-600 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                    />

                    <div className="flex items-center gap-1.5 mt-2">
                      {[100, 85, 78, 73, 68].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setCalcBattery(pct)}
                          className={clsx(
                            "px-2 py-0.5 rounded-md text-[11px] font-medium transition cursor-pointer",
                            calcBattery === pct
                              ? "bg-indigo-600 text-white font-semibold"
                              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-400"
                          )}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Battery Health & Repair Warning Card */}
                  {calcResult.hasBatteryWarning && !calcResult.isRejected && (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">แจ้งเตือนหักค่าแบตเตอรี่ 500 บาท</div>
                        <p className="text-[11px] mt-0.5">{calcResult.batteryNotice}</p>
                      </div>
                    </div>
                  )}

                  {calcResult.isRejected && (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">❌ ไม่รับทำรายการเคสนี้</div>
                        <p className="text-[11px] mt-0.5">{calcResult.rejectReason}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Primary Action Button: คัดลอกคำพูดอธิบายลูกค้า */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleCopyCustomerPitch}
                    disabled={calcResult.isRejected}
                    className={clsx(
                      "w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md active:scale-98",
                      copiedPitch
                        ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                        : calcResult.isRejected
                        ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20"
                    )}
                  >
                    {copiedPitch ? (
                      <>
                        <Check className="w-4 h-4" />
                        คัดลอกคำพูดอธิบายลูกค้าเรียบร้อยแล้ว!
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4" />
                        คัดลอกคำพูดอธิบายลูกค้า (ยอดจัด + ค่างวด + ส่วนลดปิดยอด)
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyGeneralSummary}
                    disabled={calcResult.isRejected}
                    className={clsx(
                      "w-full py-2 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer border",
                      copiedGeneral
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : calcResult.isRejected
                        ? "bg-slate-100 dark:bg-slate-800/40 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    {copiedGeneral ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        คัดลอกสรุปย่อแล้ว
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        คัดลอกสรุปข้อมูลย่อ (ส่งทีมงาน)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Output Display & Term Selector & Early Payoff (Right Column) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-slate-50 dark:to-slate-800/60 border border-indigo-200 dark:border-indigo-900/60">
                  
                  {/* Top Stats */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/80 px-2 py-0.5 rounded-full">
                          {selectedRate.series}
                        </span>
                        {calcOrigin === 'foreign' && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-full">
                            เครื่องนอก
                          </span>
                        )}
                        {calcIsRefurbished && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 rounded-full">
                            รีเฟอร์บิช (50%)
                          </span>
                        )}
                        {(screenReplaced || cameraReplaced) && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-950/80 px-2 py-0.5 rounded-full">
                            {screenReplaced && cameraReplaced ? 'หักเปลี่ยนจอ+กล้อง' : screenReplaced ? 'หักเปลี่ยนจอ' : 'หักเปลี่ยนกล้อง'}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                        {selectedRate.model}
                      </h4>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-500 dark:text-slate-400 block">ยอดจัดสุทธิ</span>
                      <div className={clsx(
                        "text-2xl sm:text-3xl font-extrabold",
                        calcResult.isRejected
                          ? "text-rose-600 dark:text-rose-400 line-through"
                          : "text-blue-600 dark:text-blue-400"
                      )}>
                        {calcResult.isRejected ? '0' : calcResult.finalLoan.toLocaleString()}
                        <span className="text-sm font-semibold ml-1">บาท</span>
                      </div>
                      {calcResult.totalDeduction > 0 && !calcResult.isRejected && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          (เดิม {calcResult.originalLoan.toLocaleString()} บ. | ปรับลดรวม -{calcResult.totalDeduction.toLocaleString()} บ.)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Matching Info Card */}
                  {(calcOrigin === 'foreign' || calcIsRefurbished || screenReplaced || cameraReplaced) && !calcResult.isRejected && (
                    <div className="mt-3 p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-xs space-y-1">
                      <div className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1">
                        <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                        <span>ยึดยอดและค่างวดในตารางของ: <strong>{calcResult.matchedModelRate.model}</strong></span>
                      </div>
                      <div className="text-[11px] text-blue-700 dark:text-blue-300 space-y-0.5">
                        {calcOrigin === 'foreign' && (
                          <p>• {calcResult.originMatchNote}</p>
                        )}
                        {calcIsRefurbished && (
                          <p>• {calcResult.refurbishedMatchNote}</p>
                        )}
                        {(screenReplaced || cameraReplaced) && (
                          <p>• {calcResult.repairMatchNote}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {calcResult.isRejected ? (
                    <div className="mt-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-center">
                      <XCircle className="w-10 h-10 mx-auto mb-2 text-rose-500" />
                      <p className="font-bold text-base">ไม่รับทำรายการเคสนี้</p>
                      <p className="text-xs mt-1 font-medium">{calcResult.rejectReason}</p>
                    </div>
                  ) : (
                    <>
                      {/* Interactive Term Selector Buttons (ปุ่มเลือกจำนวนงวดที่ลูกค้าเลือกได้เลย) */}
                      <div className="mt-5">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            เลือกล็อกงวดผ่อนที่ลูกค้าต้องการ:
                          </label>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            (คลิกเลือกงวดที่ลูกค้าตกลง)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {[
                            { term: 3 as const, val: calcResult.plans.term3, label: '3 เดือน' },
                            { term: 6 as const, val: calcResult.plans.term6, label: '6 เดือน' },
                            { term: 9 as const, val: calcResult.plans.term9, label: '9 เดือน' },
                            { term: 12 as const, val: calcResult.plans.term12, label: '12 เดือน' },
                            { term: 15 as const, val: calcResult.plans.term15, label: '15 เดือน' },
                          ].map((t) => {
                            const isSelected = selectedTerm === t.term;
                            const isAvailable = !!t.val;

                            return (
                              <button
                                key={t.term}
                                type="button"
                                disabled={!isAvailable}
                                onClick={() => {
                                  setSelectedTerm(t.term);
                                  if (earlyClosingAt > t.term) {
                                    setEarlyClosingAt(1);
                                  }
                                }}
                                className={clsx(
                                  "p-2.5 rounded-xl border text-center transition-all cursor-pointer relative",
                                  !isAvailable && "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800/40 border-slate-200",
                                  isAvailable && isSelected && "bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-300 dark:ring-indigo-900 scale-102",
                                  isAvailable && !isSelected && "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-slate-800 dark:text-slate-200"
                                )}
                              >
                                {isSelected && (
                                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                                    ✓
                                  </div>
                                )}
                                <span className={clsx(
                                  "text-[10px] font-bold block",
                                  isSelected ? "text-indigo-100" : "text-slate-500 dark:text-slate-400"
                                )}>
                                  {t.label}
                                </span>
                                {t.val ? (
                                  <div className={clsx(
                                    "text-sm font-extrabold mt-0.5",
                                    isSelected ? "text-white" : "text-slate-900 dark:text-white"
                                  )}>
                                    {t.val.toLocaleString()}
                                    <span className={clsx(
                                      "text-[9px] font-normal ml-0.5",
                                      isSelected ? "text-indigo-200" : "text-slate-400"
                                    )}>บ./ด.</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400 mt-1 block">-</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Selected Term Detail Banner */}
                      <div className="mt-4 p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {selectedTerm}ด.
                          </div>
                          <div>
                            <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 block">
                              ค่างวดที่เลือกล็อกไว้: {currentMonthlyAmount ? `${currentMonthlyAmount.toLocaleString()} บาท/เดือน` : '-'}
                            </span>
                            <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                              (สัญญา {selectedTerm} งวด • รวมยอดผ่อนตลอดสัญญา {currentMonthlyAmount ? (currentMonthlyAmount * selectedTerm).toLocaleString() : '-'} บ.)
                            </span>
                          </div>
                        </div>

                        <div className="text-[11px] text-indigo-800 dark:text-indigo-300 font-medium">
                          ยึดเรทของ {calcResult.matchedModelRate.model}
                        </div>
                      </div>

                      {/* Early Payoff & Late Fee Calculator Section */}
                      <div className="mt-5 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <h5 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Gift className="w-4 h-4 text-emerald-500" />
                            จำลองส่วนลดปิดยอดก่อนกำหนด & ค่าปรับล่าช้า
                          </h5>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                            ปิดงวด 1 ลด 20% | งวด 2 ลด 15% | งวด 3+ ลด 10%
                          </span>
                        </div>

                        {/* Controls for closing installment & late days */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {/* งวดที่ต้องการปิด */}
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              ลูกค้าต้องการปิดยอดในงวดที่:
                            </label>
                            <div className="flex items-center gap-1.5">
                              {Array.from({ length: selectedTerm }, (_, i) => i + 1).map((inst) => (
                                <button
                                  key={inst}
                                  type="button"
                                  onClick={() => setEarlyClosingAt(inst)}
                                  className={clsx(
                                    "flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-center",
                                    earlyClosingAt === inst
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                                  )}
                                >
                                  งวด {inst}
                                </button>
                              ))}
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              {earlyClosingAt === 1 && '✨ ปิดในงวดที่ 1 รับส่วนลดสูงสุด 20% ของยอดคงเหลือ'}
                              {earlyClosingAt === 2 && '✨ ปิดในงวดที่ 2 รับส่วนลด 15% ของยอดคงเหลือ'}
                              {earlyClosingAt >= 3 && '✨ ปิดในงวดที่ 3 เป็นต้นไป รับส่วนลด 10% ของยอดคงเหลือ'}
                            </span>
                          </div>

                          {/* วันที่ล่าช้า (ถ้ามี) */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                วันที่ล่าช้าเกินกำหนด (ถ้ามี):
                              </label>
                              <span className="text-xs font-bold text-amber-600">
                                {lateDays} วัน {lateDays > 0 ? `(+${earlyPayoffData.totalLateCharges.toLocaleString()} บ.)` : '(ไม่มีค่าปรับ)'}
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="30"
                              value={lateDays}
                              onChange={(e) => setLateDays(Number(e.target.value))}
                              className="w-full accent-amber-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                            />
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                              <span>0 วัน (ตรงเวลา)</span>
                              <span>16 วัน (+50 บ./วัน)</span>
                              <span className={lateDays > 16 ? "text-rose-500 font-bold" : ""}>&gt;16 วัน (+ปลดล็อก 500 บ.)</span>
                            </div>
                          </div>
                        </div>

                        {/* Payoff Result Breakdown Card */}
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600 dark:text-slate-400">
                              ยอดคงเหลือที่ต้องชำระ ({earlyPayoffData.remainingInstallments} งวด x {earlyPayoffData.monthlyAmount.toLocaleString()} บ.):
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {earlyPayoffData.remainingBalance.toLocaleString()} บาท
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                            <span className="flex items-center gap-1">
                              <span>🎉 ส่วนลดปิดยอดก่อนกำหนด ({earlyPayoffData.discountRatePercent}%):</span>
                            </span>
                            <span>-{earlyPayoffData.discountAmount.toLocaleString()} บาท</span>
                          </div>

                          {earlyPayoffData.lateDays > 0 && (
                            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                              <span>⚠️ ค่าล่าช้า ({earlyPayoffData.lateDays} วัน x 50 บ./วัน):</span>
                              <span>+{earlyPayoffData.lateFee.toLocaleString()} บาท</span>
                            </div>
                          )}

                          {earlyPayoffData.unlockFee > 0 && (
                            <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 font-semibold">
                              <span>🔒 ค่าปลดล็อกระบบ (ล่าช้าเกิน 16 วัน):</span>
                              <span>+{earlyPayoffData.unlockFee.toLocaleString()} บาท</span>
                            </div>
                          )}

                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                                ยอดชำระปิดบัญชีสุทธิ
                              </span>
                              <span className="text-[10px] text-slate-400">
                                (ประหยัดส่วนลดไปได้ {earlyPayoffData.discountAmount.toLocaleString()} บ.)
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                                {earlyPayoffData.netPayoffAmount.toLocaleString()}
                              </span>
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 ml-1">บาท</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Script Preview Box */}
                      <div className="mt-4 p-3.5 rounded-xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-900/60">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            ตัวอย่างข้อความที่คัดลอก (จัดระเบียบเรียบร้อย):
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyCustomerPitch}
                            className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            {copiedPitch ? (
                              <>
                                <Check className="w-3 h-3" />
                                คัดลอกแล้ว
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                คัดลอกข้อความนี้
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="text-[11px] text-slate-700 dark:text-slate-300 font-sans leading-relaxed whitespace-pre-wrap bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50 max-h-48 overflow-y-auto">
                          {customerPitchScript}
                        </pre>
                      </div>
                    </>
                  )}

                  {/* Highlights */}
                  <div className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>ยึดเรทราคาและค่างวดในตารางเท่านั้น</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>ลูกค้ามีเครื่องใช้งานต่อ ไม่ต้องฝากเครื่อง</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>ปิดก่อนกำหนดลดสูงสุด 20% ของยอดคงเหลือ</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>ค่าล่าช้า 50 บ./วัน (เกิน 16 วัน ค่าปลดล็อก 500 บ.)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
            <span>THAIPLUS: ส่วนลดปิดยอด (งวด 1: 20% • งวด 2: 15% • งวด 3+: 10%) • ล่าช้า 50 บ./วัน • ปลดล็อก 500 บ.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-semibold transition cursor-pointer"
          >
            ปิด
          </button>
        </div>

      </div>
    </div>
  );
};
