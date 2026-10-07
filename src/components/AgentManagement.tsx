import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  setDoc,
  getDocs,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { Agent, Case } from '../types';
import { THAI_BANKS, getBankInfo } from '../lib/promptpay';
import {
  Building2,
  Plus,
  Search,
  Trash2,
  Edit3,
  Copy,
  Check,
  ArrowLeft,
  Phone,
  MapPin,
  CreditCard,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Briefcase,
  User,
  X,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Wallet,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { clsx } from 'clsx';

export function AgentManagement() {
  const navigate = useNavigate();
  const { user } = useStore();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [deletedNames, setDeletedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>('all');

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formBankName, setFormBankName] = useState('ธนาคารกสิกรไทย (KBANK)');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formAccountName, setFormAccountName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Agent | { name: string; id?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Copy Feedback State
  const [copiedAccountKey, setCopiedAccountKey] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Subscribe to deleted agents blacklist
  useEffect(() => {
    const unsubDeleted = onSnapshot(
      doc(db, 'system_duties', 'deleted_agents'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDeletedNames(Array.isArray(data?.names) ? data.names : []);
        } else {
          setDeletedNames([]);
        }
      },
      (err) => {
        console.warn('deleted_agents listen notice:', err);
      }
    );

    return () => unsubDeleted();
  }, []);

  // 2. Subscribe to agents collection
  useEffect(() => {
    const q = query(collection(db, 'agents'), orderBy('name', 'asc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const loaded: Agent[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          loaded.push({
            id: d.id,
            name: data.name || '',
            createdAt: data.createdAt || 0,
            createdBy: data.createdBy,
            createdById: data.createdById,
            bankName: data.bankName,
            bankAccountNumber: data.bankAccountNumber,
            bankAccountName: data.bankAccountName,
            promptpayType: data.promptpayType,
            phone: data.phone,
            province: data.province,
            notes: data.notes,
            qrImageUrl: data.qrImageUrl,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy,
          });
        });
        setAgents(loaded);
        setLoading(false);
      },
      (err) => {
        console.warn('agents listen notice:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // 3. Subscribe to cases to compute linked cases count and legacy agents
  useEffect(() => {
    const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const loadedCases: Case[] = [];
        snapshot.forEach((d) => {
          loadedCases.push({ id: d.id, ...d.data() } as Case);
        });
        setCases(loadedCases);
      },
      (err) => {
        console.warn('cases listen notice:', err);
      }
    );

    return () => unsub();
  }, []);

  // Combine Firestore agents and historical agents from cases (excluding deleted blacklist)
  const allAgents = useMemo(() => {
    const map = new Map<string, Agent>();
    const deletedSet = new Set(deletedNames.map((n) => n.trim().toLowerCase()));

    // 1. Agents from Firestore
    agents.forEach((a) => {
      const trimmed = a.name.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        map.set(trimmed.toLowerCase(), a);
      }
    });

    // 2. Fallback agents found in cases that aren't yet in Firestore agents collection
    cases.forEach((c) => {
      const name = c.agentName?.trim();
      if (name && !deletedSet.has(name.toLowerCase()) && !map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), {
          id: `legacy-${name}`,
          name,
          createdAt: c.createdAt || Date.now(),
          createdBy: 'ประวัติเคส',
          province: c.province,
        });
      }
    });

    // Keep only agents that have a bank account added (as requested by user)
    const withBankAgents = Array.from(map.values()).filter(
      (a) => a.bankAccountNumber && a.bankAccountNumber.trim()
    );

    return withBankAgents.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [agents, cases, deletedNames]);

  // Count cases per agent name
  const agentCaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cases.forEach((c) => {
      const name = c.agentName?.trim().toLowerCase();
      if (name) {
        counts[name] = (counts[name] || 0) + 1;
      }
    });
    return counts;
  }, [cases]);

  // Statistics (only counting agents with bank account)
  const stats = useMemo(() => {
    const total = allAgents.length;
    return { total };
  }, [allAgents]);

  // Filtered Agents (all have bank accounts already)
  const filteredAgents = useMemo(() => {
    return allAgents.filter((agent) => {
      const search = searchTerm.trim().toLowerCase();

      // Filter by bank
      if (selectedBankFilter !== 'all') {
        const info = getBankInfo(agent.bankName);
        if (info.id !== selectedBankFilter) return false;
      }

      // Search match
      if (search) {
        const matchName = agent.name.toLowerCase().includes(search);
        const matchBank = (agent.bankName || '').toLowerCase().includes(search);
        const matchAcc = (agent.bankAccountNumber || '').toLowerCase().includes(search);
        const matchAccName = (agent.bankAccountName || '').toLowerCase().includes(search);
        const matchPhone = (agent.phone || '').toLowerCase().includes(search);
        const matchProvince = (agent.province || '').toLowerCase().includes(search);
        const matchNotes = (agent.notes || '').toLowerCase().includes(search);
        if (
          !matchName &&
          !matchBank &&
          !matchAcc &&
          !matchAccName &&
          !matchPhone &&
          !matchProvince &&
          !matchNotes
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allAgents, searchTerm, selectedBankFilter]);

  // Handle open Add Modal
  const handleOpenAdd = () => {
    setEditingAgent(null);
    setFormName('');
    setFormBankName('ธนาคารกสิกรไทย (KBANK)');
    setFormAccountNumber('');
    setFormAccountName('');
    setFormPhone('');
    setFormProvince('');
    setFormNotes('');
    setFormError('');
    setIsModalOpen(true);
  };

  // Handle open Edit Modal
  const handleOpenEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setFormName(agent.name || '');
    setFormBankName(agent.bankName || 'ธนาคารกสิกรไทย (KBANK)');
    setFormAccountNumber(agent.bankAccountNumber || '');
    setFormAccountName(agent.bankAccountName || '');
    setFormPhone(agent.phone || '');
    setFormProvince(agent.province || '');
    setFormNotes(agent.notes || '');
    setFormError('');
    setIsModalOpen(true);
  };

  // Handle Save (Add or Edit)
  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('กรุณาระบุชื่อ Agent / ตัวแทน');
      return;
    }

    // Check duplicate if adding or changing name
    const lowerName = trimmedName.toLowerCase();
    const isDuplicate = allAgents.some(
      (a) =>
        a.name.toLowerCase() === lowerName &&
        (!editingAgent || a.name.toLowerCase() !== editingAgent.name.toLowerCase())
    );

    if (isDuplicate) {
      setFormError(`มี Agent ชื่อ "${trimmedName}" ในระบบอยู่แล้ว`);
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      const bankInfo = getBankInfo(formBankName);

      // Clean deleted names blacklist if this name was previously deleted
      if (deletedNames.some((n) => n.toLowerCase() === lowerName)) {
        const nextDeleted = deletedNames.filter((n) => n.toLowerCase() !== lowerName);
        await setDoc(
          doc(db, 'system_duties', 'deleted_agents'),
          { names: nextDeleted },
          { merge: true }
        );
      }

      const agentData = {
        name: trimmedName,
        bankName: formBankName.trim() || 'ธนาคารกสิกรไทย (KBANK)',
        bankAccountNumber: formAccountNumber.trim(),
        bankAccountName: formAccountName.trim(),
        promptpayType: bankInfo.id === 'promptpay' ? 'promptpay' : 'bank_account',
        phone: formPhone.trim(),
        province: formProvince.trim(),
        notes: formNotes.trim(),
        updatedAt: Date.now(),
        updatedBy: user?.name || user?.username || 'พนักงาน',
      };

      if (editingAgent && !editingAgent.id.startsWith('legacy-')) {
        // Update existing Firestore agent doc
        await updateDoc(doc(db, 'agents', editingAgent.id), agentData);
      } else {
        // Add new doc in agents collection (or upgrade legacy agent)
        await addDoc(collection(db, 'agents'), {
          ...agentData,
          createdAt: editingAgent ? editingAgent.createdAt : Date.now(),
          createdBy: editingAgent?.createdBy || user?.name || user?.username || 'พนักงาน',
          createdById: user?.uid || '',
        });
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving agent:', err);
      setFormError(err?.message ? `บันทึกไม่สำเร็จ: ${err.message}` : 'เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const targetName = deleteTarget.name.trim();

    try {
      // 1. Delete matching documents from 'agents' collection
      if ('id' in deleteTarget && deleteTarget.id && !deleteTarget.id.startsWith('legacy-')) {
        await deleteDoc(doc(db, 'agents', deleteTarget.id));
      } else {
        const qDocs = await getDocs(
          query(collection(db, 'agents'), where('name', '==', targetName))
        );
        for (const d of qDocs.docs) {
          await deleteDoc(doc(db, 'agents', d.id));
        }
      }

      // 2. Add to deleted blacklist so cases don't resurrect it
      const nextDeleted = Array.from(new Set([...deletedNames, targetName]));
      await setDoc(
        doc(db, 'system_duties', 'deleted_agents'),
        { names: nextDeleted },
        { merge: true }
      );

      setDeleteTarget(null);
    } catch (err) {
      console.error('Error deleting agent:', err);
      alert('เกิดข้อผิดพลาดในการลบ Agent กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy account number helper
  const handleCopyAccount = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text.replace(/\s+/g, ''));
    setCopiedAccountKey(key);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => {
      setCopiedAccountKey(null);
    }, 2000);
  };

  // Quick Action: Create Job with this Agent
  const handleCreateJobWithAgent = (agentName: string) => {
    navigate('/', {
      state: {
        autoOpenAddForm: true,
        selectedAgent: agentName,
      },
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <Link
            to="/"
            className="p-2 sm:p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition shrink-0 cursor-pointer shadow-2xs"
            title="กลับไปหน้ากระดานคิวงาน"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                ระบบจัดการตัวแทน
              </span>
              <span className="text-xs text-slate-400">• เชื่อมโยงการเปิดเคสและการเงิน</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              รายชื่อ Agent & ข้อมูลบัญชีธนาคาร
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              พนักงานสามารถเพิ่ม แก้ไขเลขบัญชี และลบ Agent ได้ เวลาเพิ่มเคสระบบจะแสดงข้อมูลบัญชีให้อัตโนมัติ
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            + เพิ่ม Agent ใหม่
          </button>

          <Link
            to="/"
            className="inline-flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm transition shadow-2xs cursor-pointer"
          >
            <Briefcase className="w-4 h-4 mr-1.5 text-indigo-500" />
            ไปที่คิวงาน
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Total Agents with Bank */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
              Agent ที่เพิ่มธนาคารแล้วในระบบ
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {stats.total}{' '}
              <span className="text-xs font-medium text-slate-400">รายชื่อ</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6" />
          </div>
        </div>

        {/* Info card */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 block">
              พร้อมใช้งานเปิดเคส & โอนเงิน
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              แสดงเฉพาะตัวแทนที่มีข้อมูลบัญชีธนาคารแล้ว เพื่อความถูกต้องในการทำธุรกรรม
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อ Agent, ชื่อธนาคาร, เลขบัญชี, ชื่อเจ้าของบัญชี หรือจังหวัด..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Bank Dropdown Filter */}
          <div className="sm:w-56 shrink-0">
            <select
              value={selectedBankFilter}
              onChange={(e) => setSelectedBankFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">ทุกธนาคาร</option>
              {THAI_BANKS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Counter & Search Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>แสดง Agent ที่ระบุเลขบัญชีธนาคารแล้วทั้งหมด {stats.total} รายชื่อ</span>
          </div>

          {searchTerm && (
            <span className="text-[11px] text-slate-400 shrink-0">
              พบ {filteredAgents.length} รายการ
            </span>
          )}
        </div>
      </div>

      {/* Main Agent List Grid */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3" />
          <p className="text-xs text-slate-500">กำลังโหลดรายชื่อ Agent และข้อมูลบัญชี...</p>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center max-w-md mx-auto shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {searchTerm ? 'ไม่พบข้อมูล Agent ที่ค้นหา' : 'ยังไม่มีรายชื่อ Agent ในระบบ'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
            {searchTerm
              ? 'ลองค้นหาด้วยคำอื่น หรือกดล้างการค้นหาเพื่อดูรายชื่อทั้งหมด'
              : 'เริ่มต้นเพิ่ม Agent พร้อมเลขบัญชีธนาคารเพื่อความสะดวกในการเปิดงาน'}
          </p>
          {searchTerm ? (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedBankFilter('all');
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer transition"
            >
              ล้างการค้นหา
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 cursor-pointer transition inline-flex items-center"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              + เพิ่ม Agent คนแรก
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => {
            const caseCount = agentCaseCounts[agent.name.toLowerCase()] || 0;
            const hasBank = Boolean(agent.bankAccountNumber && agent.bankAccountNumber.trim());
            const bankInfo = getBankInfo(agent.bankName);
            const copyKey = `agent-${agent.id}`;
            const isCopied = copiedAccountKey === copyKey;

            return (
              <div
                key={agent.id}
                className={clsx(
                  'rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden group shadow-xs hover:shadow-md bg-white dark:bg-slate-900',
                  hasBank
                    ? 'border-slate-200/90 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                    : 'border-amber-200/70 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10'
                )}
              >
                {/* Card Header */}
                <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate block">
                          {agent.name}
                        </span>
                        {agent.province && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                            <MapPin className="w-2.5 h-2.5 mr-0.5 text-slate-400" />
                            {agent.province}
                          </span>
                        )}
                      </div>

                      {/* Status / Case count */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center text-indigo-600 dark:text-indigo-400 font-semibold">
                          <Briefcase className="w-3 h-3 mr-1" />
                          มีงานในระบบ {caseCount} เคส
                        </span>
                      </div>
                    </div>

                    {/* Quick Edit/Delete Icons for employees */}
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(agent)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="แก้ไขข้อมูล Agent & บัญชีธนาคาร"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(agent)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        title="ลบ Agent ออกจากระบบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bank Account Info Card Body */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
                  {hasBank ? (
                    <div
                      className={clsx(
                        'p-3.5 rounded-xl border relative overflow-hidden transition',
                        bankInfo.bgLight,
                        bankInfo.borderLight
                      )}
                    >
                      {/* Bank Brand Strip & Name */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: bankInfo.color }}
                          />
                          <span
                            className={clsx(
                              'text-xs font-bold truncate',
                              bankInfo.textColor
                            )}
                          >
                            {agent.bankName || bankInfo.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          บัญชีธนาคาร
                        </span>
                      </div>

                      {/* Account Number with Copy Button */}
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase">
                            เลขที่บัญชี:
                          </span>
                          <span className="text-sm sm:text-base font-black tracking-wider text-slate-900 dark:text-white font-mono block">
                            {agent.bankAccountNumber}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyAccount(copyKey, agent.bankAccountNumber || '')}
                          className={clsx(
                            'px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center transition cursor-pointer shrink-0 shadow-2xs active:scale-95',
                            isCopied
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          )}
                          title="คัดลอกเลขบัญชี"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 mr-1" />
                              คัดลอกแล้ว
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1 text-slate-400" />
                              คัดลอก
                            </>
                          )}
                        </button>
                      </div>

                      {/* Account Holder Name */}
                      {agent.bankAccountName && (
                        <div className="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-xs">
                          <span className="text-slate-400 text-[11px]">ชื่อบัญชี:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate ml-2">
                            {agent.bankAccountName}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Missing Bank Info Placeholder */
                    <div className="p-3.5 rounded-xl border border-dashed border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 text-center space-y-2">
                      <div className="flex items-center justify-center space-x-1.5 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>ยังไม่ระบุข้อมูลบัญชีธนาคาร</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        กดปุ่มด้านล่างเพื่อเพิ่มเลขที่บัญชีและธนาคารของ Agent นี้
                      </p>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(agent)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs inline-flex items-center"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        + เพิ่มเลขบัญชีธนาคาร
                      </button>
                    </div>
                  )}

                  {/* Additional Meta info (Phone, Notes) */}
                  {(agent.phone || agent.notes) && (
                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 pt-1">
                      {agent.phone && (
                        <div className="flex items-center space-x-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono">{agent.phone}</span>
                        </div>
                      )}
                      {agent.notes && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                          "{agent.notes}"
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Action Footer */}
                <div className="p-3 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(agent)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-lg transition cursor-pointer inline-flex items-center"
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1" />
                    แก้ไขข้อมูล
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCreateJobWithAgent(agent.name)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-2xs inline-flex items-center"
                    title={`เปิดหน้าเพิ่มงานพร้อมเลือก Agent "${agent.name}" ทันที`}
                  >
                    <Briefcase className="w-3.5 h-3.5 mr-1" />
                    สร้างงานด้วย Agent นี้
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* ADD / EDIT AGENT MODAL                                    */}
      {/* ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  {editingAgent ? <Edit3 className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    {editingAgent ? `แก้ไขข้อมูล Agent: ${editingAgent.name}` : 'เพิ่ม Agent ใหม่เข้าระบบ'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    ข้อมูลบัญชีและธนาคารจะเชื่อมโยงไปแสดงเวลาเลือกเพิ่มงานทันที
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveAgent} className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Agent Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ชื่อ Agent / ตัวแทน *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (formError) setFormError('');
                    }}
                    placeholder="เช่น Agent Pream, Agent สมบัติ สาขาบางนา"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Bank Name Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ธนาคารที่รับเงินโอน *
                </label>
                <div className="relative">
                  <select
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                  >
                    {THAI_BANKS.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Account Number & Account Name Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Account Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    เลขที่บัญชีธนาคาร
                  </label>
                  <input
                    type="text"
                    value={formAccountNumber}
                    onChange={(e) => setFormAccountNumber(e.target.value)}
                    placeholder="เช่น 123-4-56789-0"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Account Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ชื่อเจ้าของบัญชี
                  </label>
                  <input
                    type="text"
                    value={formAccountName}
                    onChange={(e) => setFormAccountName(e.target.value)}
                    placeholder="เช่น นาย สมบัติ ใจดี"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Phone & Province */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    เบอร์โทรศัพท์ / LINE
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="เช่น 081-234-5678"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    จังหวัด / สาขา
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formProvince}
                      onChange={(e) => setFormProvince(e.target.value)}
                      placeholder="เช่น กรุงเทพฯ, นนทบุรี, สาขา 2"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  หมายเหตุเพิ่มเติม (ถ้ามี)
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="เช่น โอนเงินก่อน 17:00 น., ให้แนบสลิปทางไลน์เสมอ"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Live Preview Card */}
              {formAccountNumber && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    ตัวอย่างบัตรบัญชีที่จะแสดงเวลาเพิ่มงาน:
                  </span>
                  {(() => {
                    const previewInfo = getBankInfo(formBankName);
                    return (
                      <div
                        className={clsx(
                          'p-3 rounded-xl border flex items-center justify-between',
                          previewInfo.bgLight,
                          previewInfo.borderLight
                        )}
                      >
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: previewInfo.color }}
                            />
                            <span className={clsx('font-bold', previewInfo.textColor)}>
                              {previewInfo.shortName}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-sm block mt-0.5">
                            {formAccountNumber}
                          </span>
                          {formAccountName && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                              ชื่อ: {formAccountName}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] px-2 py-1 bg-white/80 dark:bg-slate-800 rounded-md text-slate-500 font-semibold border border-slate-200/50">
                          พรีวิว
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Error Message */}
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-600 dark:text-rose-400 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !formName.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition shadow-xs flex items-center cursor-pointer"
                >
                  {isSaving ? (
                    'กำลังบันทึก...'
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-1.5" />
                      {editingAgent ? 'บันทึกการแก้ไข' : 'บันทึก Agent ใหม่'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DELETE CONFIRMATION MODAL                                 */}
      {/* ========================================================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/80 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  ยืนยันการลบ Agent
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ลบออกจากระบบและตัวเลือกดรอปดาวน์
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                ต้องการลบตัวแทน:
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                "{deleteTarget.name}"
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              เมื่อลบแล้ว Agent นี้จะไม่ปรากฏในดรอปดาวน์สำหรับพนักงานทุกคนอีกต่อไป
            </p>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition shadow-xs flex items-center cursor-pointer"
              >
                {isDeleting ? (
                  'กำลังลบ...'
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    ยืนยันลบ
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
