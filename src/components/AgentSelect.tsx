import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
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
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Agent, Case, UserProfile } from '../types';
import { THAI_BANKS, getBankInfo } from '../lib/promptpay';
import { 
  Send, 
  Plus, 
  X, 
  Trash2, 
  Check, 
  Building2, 
  Search, 
  AlertCircle, 
  AlertTriangle,
  Edit3,
  Copy,
  CreditCard,
  ChevronDown,
  ExternalLink,
  Phone,
  MapPin,
  Sparkles
} from 'lucide-react';
import { clsx } from 'clsx';

export interface AgentSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  currentUser?: UserProfile | null;
  cases?: Case[];
  disabled?: boolean;
}

export interface AgentManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent?: (name: string) => void;
  currentSelectedAgent?: string;
  currentUser?: UserProfile | null;
  cases?: Case[];
  initialManageView?: boolean;
  initialEditingAgent?: Agent | null;
}

const DEFAULT_SEEDED_AGENTS = [
  'Agent Pream',
  'Agent Pream (สาขาใหญ่)',
  'Agent สมบัติ สาขาบางนา',
];

/**
 * MODAL COMPONENT: Add / View / Edit / Delete Agents
 * Uses createPortal to mount on document.body, eliminating any parent <form> nesting or styling collisions.
 */
export function AgentManagerModal({
  isOpen,
  onClose,
  onSelectAgent,
  currentSelectedAgent,
  currentUser,
  cases = [],
  initialManageView = false,
  initialEditingAgent = null,
}: AgentManagerModalProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deletedNames, setDeletedNames] = useState<string[]>([]);
  
  // Add / Edit form state
  const [editingAgent, setEditingAgent] = useState<Agent | null>(initialEditingAgent);
  const [formName, setFormName] = useState('');
  const [formBankName, setFormBankName] = useState('ธนาคารกสิกรไทย (KBANK)');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formAccountName, setFormAccountName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [manageView, setManageView] = useState(initialManageView);
  const [searchTerm, setSearchTerm] = useState('');

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; id?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Copy Account Number
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset or fill form on open or switch
  useEffect(() => {
    if (isOpen) {
      if (initialEditingAgent) {
        setEditingAgent(initialEditingAgent);
        setFormName(initialEditingAgent.name || '');
        setFormBankName(initialEditingAgent.bankName || 'ธนาคารกสิกรไทย (KBANK)');
        setFormAccountNumber(initialEditingAgent.bankAccountNumber || '');
        setFormAccountName(initialEditingAgent.bankAccountName || '');
        setFormPhone(initialEditingAgent.phone || '');
        setFormProvince(initialEditingAgent.province || '');
        setFormNotes(initialEditingAgent.notes || '');
        setManageView(false);
      } else {
        setEditingAgent(null);
        setFormName('');
        setFormBankName('ธนาคารกสิกรไทย (KBANK)');
        setFormAccountNumber('');
        setFormAccountName('');
        setFormPhone('');
        setFormProvince('');
        setFormNotes('');
        setManageView(initialManageView);
      }
      setErrorMessage('');
      setSearchTerm('');
      setDeleteTarget(null);
    }
  }, [isOpen, initialManageView, initialEditingAgent]);

  // Subscribe to deleted agents blacklist
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

  // Real-time subscribe to agents collection
  useEffect(() => {
    const q = query(collection(db, 'agents'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedAgents: Agent[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          loadedAgents.push({
            id: docSnap.id,
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
        setAgents(loadedAgents);

        // Auto-seed if collection is completely empty
        if (loadedAgents.length === 0) {
          seedInitialAgents();
        }
      },
      (error) => {
        console.warn('agents listen notice:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Seed default agents once if collection is empty
  const seedInitialAgents = async () => {
    try {
      const historicalAgentNames = Array.from(
        new Set(cases.map((c) => c.agentName?.trim()).filter(Boolean))
      );
      const combined = Array.from(
        new Set([...DEFAULT_SEEDED_AGENTS, ...historicalAgentNames])
      );

      for (const name of combined) {
        if (!name) continue;
        await addDoc(collection(db, 'agents'), {
          name,
          createdAt: Date.now(),
          createdBy: 'ระบบเริ่มต้น',
          createdById: 'system',
          bankName: 'ธนาคารกสิกรไทย (KBANK)',
        });
      }
    } catch (err) {
      console.warn('Initial agent seeding note:', err);
    }
  };

  // Combine loaded agents and historical cases, filtered by deletedNames
  const allAvailableAgents = useMemo(() => {
    const agentMap = new Map<string, Agent>();
    const deletedSet = new Set(deletedNames.map((n) => n.trim().toLowerCase()));

    // First add from Firestore collection
    agents.forEach((a) => {
      const trimmed = a.name.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        agentMap.set(trimmed.toLowerCase(), a);
      }
    });

    // Merge any distinct agents in cases that are not deleted
    cases.forEach((c) => {
      const name = c.agentName?.trim();
      if (name && !deletedSet.has(name.toLowerCase()) && !agentMap.has(name.toLowerCase())) {
        agentMap.set(name.toLowerCase(), {
          id: `legacy-${name}`,
          name,
          createdAt: c.createdAt || Date.now(),
          createdBy: 'ประวัติเคส',
          province: c.province,
        });
      }
    });

    // Return sorted array
    return Array.from(agentMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'th')
    );
  }, [agents, cases, deletedNames]);

  // Handle Switch to Editing an agent
  const handleStartEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setFormName(agent.name || '');
    setFormBankName(agent.bankName || 'ธนาคารกสิกรไทย (KBANK)');
    setFormAccountNumber(agent.bankAccountNumber || '');
    setFormAccountName(agent.bankAccountName || '');
    setFormPhone(agent.phone || '');
    setFormProvince(agent.province || '');
    setFormNotes(agent.notes || '');
    setErrorMessage('');
    setManageView(false);
  };

  // Handle save (Add or Update)
  const handleSaveAgent = async () => {
    const trimmed = formName.trim();
    if (!trimmed) {
      setErrorMessage('กรุณาระบุชื่อตัวแทน');
      return;
    }

    // Check duplicate in available agents
    const isDuplicate = allAvailableAgents.some(
      (a) =>
        a.name.toLowerCase() === trimmed.toLowerCase() &&
        (!editingAgent || a.name.toLowerCase() !== editingAgent.name.toLowerCase())
    );

    if (isDuplicate) {
      setErrorMessage(`มีตัวแทนชื่อ "${trimmed}" ในระบบอยู่แล้ว`);
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      // If was previously in deletedNames blacklist, remove it
      if (deletedNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
        const nextDeleted = deletedNames.filter(
          (n) => n.toLowerCase() !== trimmed.toLowerCase()
        );
        await setDoc(doc(db, 'system_duties', 'deleted_agents'), { names: nextDeleted }, { merge: true });
      }

      const agentData = {
        name: trimmed,
        bankName: formBankName.trim() || 'ธนาคารกสิกรไทย (KBANK)',
        bankAccountNumber: formAccountNumber.trim(),
        bankAccountName: formAccountName.trim(),
        phone: formPhone.trim(),
        province: formProvince.trim(),
        notes: formNotes.trim(),
        updatedAt: Date.now(),
        updatedBy: currentUser?.name || currentUser?.username || 'พนักงาน',
      };

      if (editingAgent && !editingAgent.id.startsWith('legacy-')) {
        await updateDoc(doc(db, 'agents', editingAgent.id), agentData);
      } else {
        await addDoc(collection(db, 'agents'), {
          ...agentData,
          createdAt: editingAgent ? editingAgent.createdAt : Date.now(),
          createdBy: currentUser?.name || currentUser?.username || 'พนักงาน',
          createdById: currentUser?.uid || '',
        });
      }

      // Automatically select this newly created or edited agent
      if (onSelectAgent) {
        onSelectAgent(trimmed);
      }
      onClose();
    } catch (error: any) {
      console.error('Error saving agent to Firestore:', error);
      setErrorMessage(error?.message ? `ไม่สามารถบันทึกได้: ${error.message}` : 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setIsSaving(false);
    }
  };

  // Perform actual deletion from Firestore
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const targetName = deleteTarget.name.trim();

    try {
      if (deleteTarget.id && !deleteTarget.id.startsWith('legacy-')) {
        await deleteDoc(doc(db, 'agents', deleteTarget.id));
      } else {
        const qDocs = await getDocs(
          query(collection(db, 'agents'), where('name', '==', targetName))
        );
        for (const d of qDocs.docs) {
          await deleteDoc(doc(db, 'agents', d.id));
        }
      }

      // Add to deleted blacklist so historical cases don't revive it
      const nextDeleted = Array.from(
        new Set([...deletedNames, targetName])
      );
      await setDoc(
        doc(db, 'system_duties', 'deleted_agents'),
        { names: nextDeleted },
        { merge: true }
      );

      // Clear current selection if it was this agent
      if (currentSelectedAgent === targetName && onSelectAgent) {
        onSelectAgent('');
      }

      setDeleteTarget(null);
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('เกิดข้อผิดพลาดในการลบตัวแทน');
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy helper
  const handleCopyAccount = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text.replace(/\s+/g, ''));
    setCopiedKey(key);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredAgentsList = useMemo(() => {
    if (!searchTerm.trim()) return allAvailableAgents;
    const term = searchTerm.toLowerCase();
    return allAvailableAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        (a.bankName || '').toLowerCase().includes(term) ||
        (a.bankAccountNumber || '').toLowerCase().includes(term) ||
        (a.bankAccountName || '').toLowerCase().includes(term)
    );
  }, [allAvailableAgents, searchTerm]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center space-x-2.5">
            <div className={clsx(
              "w-8 h-8 rounded-xl flex items-center justify-center",
              manageView 
                ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                : "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400"
            )}>
              {manageView ? <Trash2 className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {manageView
                  ? 'จัดการ แก้ไข และลบตัวแทนในระบบ'
                  : editingAgent
                  ? `แก้ไขข้อมูล Agent: ${editingAgent.name}`
                  : 'เพิ่ม Agent และเลขบัญชีธนาคาร'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {manageView
                  ? `มีตัวแทนทั้งหมด ${allAvailableAgents.length} รายชื่อในระบบ`
                  : 'ข้อมูลบัญชีธนาคารจะแสดงให้พนักงานเวลาเลือกทำงาน'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Tab selector between Add New / Edit and View/Manage List */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setManageView(false);
              }}
              className={clsx(
                "flex-1 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center justify-center",
                !manageView
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              {editingAgent ? (
                <>
                  <Edit3 className="w-3.5 h-3.5 mr-1 text-indigo-500" />
                  แก้ไขข้อมูล
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  เพิ่มตัวแทนใหม่
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setManageView(true)}
              className={clsx(
                "flex-1 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center justify-center",
                manageView
                  ? "bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-500" />
              แก้ไข / ลบ / ดูรายชื่อ ({allAvailableAgents.length})
            </button>
          </div>

          {!manageView ? (
            /* ADD / EDIT AGENT SECTION */
            <div className="space-y-3.5">
              {editingAgent && (
                <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 flex items-center justify-between text-xs">
                  <span className="text-indigo-700 dark:text-indigo-300 font-medium">
                    กำลังแก้ไข Agent: <b>{editingAgent.name}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAgent(null);
                      setFormName('');
                      setFormAccountNumber('');
                      setFormAccountName('');
                      setFormPhone('');
                      setFormProvince('');
                      setFormNotes('');
                    }}
                    className="text-[11px] text-indigo-600 hover:underline cursor-pointer font-bold"
                  >
                    + เปลี่ยนเป็นเพิ่มคนใหม่
                  </button>
                </div>
              )}

              {/* Agent Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ชื่อตัวแทน / สาขา *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    placeholder="เช่น Agent สมบัติ สาขาบางนา"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition"
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Bank Name Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ธนาคาร *
                </label>
                <div className="relative">
                  <select
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                  >
                    {THAI_BANKS.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Account Number & Account Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    เลขที่บัญชีธนาคาร
                  </label>
                  <input
                    type="text"
                    value={formAccountNumber}
                    onChange={(e) => setFormAccountNumber(e.target.value)}
                    placeholder="เช่น 123-4-56789-0"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ชื่อเจ้าของบัญชี
                  </label>
                  <input
                    type="text"
                    value={formAccountName}
                    onChange={(e) => setFormAccountName(e.target.value)}
                    placeholder="เช่น นาย สมบัติ ใจดี"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Phone & Province */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    เบอร์โทรศัพท์
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="เช่น 081-234-5678"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    จังหวัด / สาขา
                  </label>
                  <input
                    type="text"
                    value={formProvince}
                    onChange={(e) => setFormProvince(e.target.value)}
                    placeholder="เช่น กรุงเทพฯ, เชียงใหม่"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  หมายเหตุเพิ่มเติม (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="เช่น โอนเงินก่อน 17:00 น."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {errorMessage && (
                <div className="text-xs text-rose-600 dark:text-rose-400 flex items-center bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60">
                  <AlertCircle className="w-4 h-4 mr-1.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={isSaving || !formName.trim()}
                  onClick={handleSaveAgent}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition shadow-xs flex items-center cursor-pointer"
                >
                  {isSaving ? (
                    'กำลังบันทึก...'
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      {editingAgent ? 'บันทึกการแก้ไข' : 'บันทึกและเลือกทันที'}
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* MANAGE & DELETE LIST VIEW */
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="ค้นหาชื่อตัวแทน, ธนาคาร, หรือเลขบัญชี..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  💡 กดปุ่ม <span className="text-indigo-600 font-semibold">"แก้ไข"</span> เพื่อเพิ่มเลขบัญชี หรือ <span className="text-rose-600 font-semibold">"ลบ"</span> ออกจากระบบ
                </span>
                <Link
                  to="/agents"
                  onClick={onClose}
                  className="text-indigo-600 hover:underline font-bold inline-flex items-center"
                >
                  เปิดหน้าเต็ม
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </Link>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                {filteredAgentsList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    ไม่พบรายชื่อตัวแทน
                  </div>
                ) : (
                  filteredAgentsList.map((agent) => {
                    const bankInfo = getBankInfo(agent.bankName);
                    const copyKey = `modal-agent-${agent.id}`;
                    const isCopied = copiedKey === copyKey;

                    return (
                      <div
                        key={agent.id}
                        className="px-3 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-xs gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                              {agent.name}
                            </span>
                            {currentSelectedAgent === agent.name && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0">
                                กำลังเลือก
                              </span>
                            )}
                          </div>

                          {/* Bank details preview */}
                          {agent.bankAccountNumber ? (
                            <div className="flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: bankInfo.color }}
                              />
                              <span className="truncate">{bankInfo.shortName}</span>
                              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                {agent.bankAccountNumber}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyAccount(copyKey, agent.bankAccountNumber || '')}
                                className="text-slate-400 hover:text-indigo-600 transition cursor-pointer p-0.5"
                                title="คัดลอกเลขบัญชี"
                              >
                                {isCopied ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5">
                              ⚠️ ยังไม่ระบุเลขบัญชี
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {onSelectAgent && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectAgent(agent.name);
                                onClose();
                              }}
                              className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded-lg text-[11px] font-semibold cursor-pointer transition"
                            >
                              เลือก
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(agent)}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="แก้ไขข้อมูล Agent"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ name: agent.name, id: agent.id })}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition cursor-pointer"
                            title={`ลบ "${agent.name}" ออกจากระบบ`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CONFIRM DELETE SUB-MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/80 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  ยืนยันการลบตัวแทน
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ลบออกจากระบบและดรอปดาวน์
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
              เมื่อลบแล้ว ชื่อตัวแทนนี้จะไม่ปรากฏในตัวเลือกดรอปดาวน์สำหรับผู้เช็คเครดิตทุกคนอีกต่อไป
            </p>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
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
                    ยืนยันลบตัวแทน
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}

/**
 * PRIMARY COMPONENT: AgentSelect Dropdown + Linked Bank Details Card
 */
export function AgentSelect({
  value,
  onChange,
  required = true,
  currentUser,
  cases = [],
  disabled = false,
}: AgentSelectProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deletedNames, setDeletedNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manageView, setManageView] = useState(false);
  const [editingAgentTarget, setEditingAgentTarget] = useState<Agent | null>(null);

  // Quick delete
  const [quickDeleteTarget, setQuickDeleteTarget] = useState<string | null>(null);
  const [isDeletingQuick, setIsDeletingQuick] = useState(false);

  // Copy state
  const [copiedBankKey, setCopiedBankKey] = useState<string | null>(null);
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

  // 2. Real-time subscribe to agents collection
  useEffect(() => {
    const q = query(collection(db, 'agents'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedAgents: Agent[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          loadedAgents.push({
            id: docSnap.id,
            name: data.name || '',
            createdAt: data.createdAt || 0,
            createdBy: data.createdBy,
            createdById: data.createdById,
            bankName: data.bankName,
            bankAccountNumber: data.bankAccountNumber,
            bankAccountName: data.bankAccountName,
            phone: data.phone,
            province: data.province,
            notes: data.notes,
          });
        });
        setAgents(loadedAgents);
        setIsLoading(false);
      },
      (error) => {
        console.warn('agents collection listen notice:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Combine loaded agents and historical cases, filtered by deletedNames
  const allAvailableAgents = useMemo(() => {
    const agentMap = new Map<string, Agent>();
    const deletedSet = new Set(deletedNames.map((n) => n.trim().toLowerCase()));

    // First add from collection
    agents.forEach((a) => {
      const trimmed = a.name.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        agentMap.set(trimmed.toLowerCase(), a);
      }
    });

    // Merge any distinct agents in cases that are not deleted
    cases.forEach((c) => {
      const name = c.agentName?.trim();
      if (name && !deletedSet.has(name.toLowerCase()) && !agentMap.has(name.toLowerCase())) {
        agentMap.set(name.toLowerCase(), {
          id: `legacy-${name}`,
          name,
          createdAt: c.createdAt || Date.now(),
          createdBy: 'ประวัติเคส',
          province: c.province,
        });
      }
    });

    // Return sorted array
    return Array.from(agentMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'th')
    );
  }, [agents, cases, deletedNames]);

  // Find currently selected Agent object
  const currentAgent = useMemo(() => {
    if (!value) return null;
    const lower = value.trim().toLowerCase();
    return allAvailableAgents.find((a) => a.name.toLowerCase() === lower) || null;
  }, [value, allAvailableAgents]);

  // Quick delete current selected agent
  const handleConfirmQuickDelete = async () => {
    if (!quickDeleteTarget) return;
    setIsDeletingQuick(true);
    const targetName = quickDeleteTarget.trim();

    try {
      const qDocs = await getDocs(
        query(collection(db, 'agents'), where('name', '==', targetName))
      );
      for (const d of qDocs.docs) {
        await deleteDoc(doc(db, 'agents', d.id));
      }

      const nextDeleted = Array.from(new Set([...deletedNames, targetName]));
      await setDoc(doc(db, 'system_duties', 'deleted_agents'), { names: nextDeleted }, { merge: true });

      if (value === targetName) {
        onChange('');
      }
      setQuickDeleteTarget(null);
    } catch (err) {
      console.error('Error quick deleting agent:', err);
      alert('เกิดข้อผิดพลาดในการลบตัวแทน');
    } finally {
      setIsDeletingQuick(false);
    }
  };

  // Copy bank account number
  const handleCopy = (acc: string) => {
    if (!acc) return;
    navigator.clipboard.writeText(acc.replace(/\s+/g, ''));
    setCopiedBankKey('current');
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopiedBankKey(null), 2000);
  };

  return (
    <div className="space-y-2">
      {/* Label Row with Add & Delete/Manage Actions & Link to full page */}
      <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          ชื่อตัวแทน (ผู้ส่งเคส) *
        </label>
        
        <div className="flex items-center space-x-2 text-[11px]">
          {/* Link to full Agent Page */}
          <Link
            to="/agents"
            className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer hover:underline inline-flex items-center"
            title="เปิดหน้าจัดการ Agent และบัญชีธนาคารทั้งหมด"
          >
            <Building2 className="w-3.5 h-3.5 mr-0.5 text-indigo-500" />
            หน้า Agent
          </Link>

          <span className="text-slate-300 dark:text-slate-600">•</span>

          {/* Manage / Delete button */}
          <button
            type="button"
            onClick={() => {
              setEditingAgentTarget(null);
              setManageView(true);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition cursor-pointer hover:underline"
            title="ลบหรือจัดการตัวแทนออกจากดรอปดาวน์"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            จัดการ ({allAvailableAgents.length})
          </button>

          <span className="text-slate-300 dark:text-slate-600">•</span>

          {/* Add Agent button */}
          <button
            type="button"
            onClick={() => {
              setEditingAgentTarget(null);
              setManageView(false);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition cursor-pointer hover:underline"
            title="เพิ่มตัวแทนใหม่พร้อมข้อมูลธนาคาร"
          >
            <Plus className="w-3.5 h-3.5 mr-0.5" />
            + เพิ่ม Agent
          </button>
        </div>
      </div>

      {/* Dropdown Select Field + Inline Quick Delete Button */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <select
            value={value}
            required={required}
            disabled={disabled}
            onChange={(e) => {
              const selected = e.target.value;
              if (selected === '__ADD_NEW__') {
                setEditingAgentTarget(null);
                setManageView(false);
                setIsModalOpen(true);
              } else if (selected === '__MANAGE_DELETE__') {
                setEditingAgentTarget(null);
                setManageView(true);
                setIsModalOpen(true);
              } else {
                onChange(selected);
              }
            }}
            className={clsx(
              "w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition appearance-none cursor-pointer",
              !value
                ? "border-slate-200 dark:border-slate-700 text-slate-400"
                : "border-indigo-300 dark:border-indigo-700 text-slate-900 dark:text-white font-medium"
            )}
          >
            <option value="">
              {isLoading
                ? 'กำลังโหลดรายชื่อตัวแทน...'
                : `-- เลือกชื่อตัวแทน (${allAvailableAgents.length} รายชื่อ) --`}
            </option>

            <option value="__ADD_NEW__" className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/60">
              ➕ + เพิ่มชื่อตัวแทนใหม่ (พร้อมเลขบัญชี)...
            </option>

            <option value="__MANAGE_DELETE__" className="font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/60">
              ⚙️ จัดการ แก้ไข และลบตัวแทน...
            </option>

            <optgroup label="รายชื่อตัวแทนในระบบ (แสดงธนาคาร & เลขบัญชี)">
              {allAvailableAgents.map((agent) => {
                const bInfo = getBankInfo(agent.bankName);
                const bankLabel = agent.bankAccountNumber
                  ? ` [${bInfo.shortName} • ${agent.bankAccountNumber}]`
                  : '';
                return (
                  <option key={agent.name} value={agent.name}>
                    {agent.name}{bankLabel}
                  </option>
                );
              })}
            </optgroup>
          </select>

          <Send className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />

          {/* Selected checkmark indicator */}
          {value && (
            <span className="absolute right-2.5 top-2.5 pointer-events-none text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4" />
            </span>
          )}
        </div>

        {/* Dedicated Delete Button when an agent is currently selected in dropdown */}
        {value && (
          <button
            type="button"
            onClick={() => setQuickDeleteTarget(value)}
            className="px-2.5 py-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/80 rounded-xl text-xs font-semibold flex items-center shrink-0 transition cursor-pointer active:scale-95 shadow-2xs group"
            title={`ลบตัวแทน "${value}" ออกจากดรอปดาวน์`}
          >
            <Trash2 className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>

      {/* ========================================================= */}
      {/* LINKED BANK DETAILS CARD (Auto displays for selected Agent) */}
      {/* ========================================================= */}
      {currentAgent && (
        <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 text-xs transition animate-fadeIn">
          {currentAgent.bankAccountNumber ? (
            /* HAS BANK ACCOUNT DETAILS */
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2 min-w-0">
                  {(() => {
                    const info = getBankInfo(currentAgent.bankName);
                    return (
                      <>
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: info.color }}
                        />
                        <span className={clsx('font-bold truncate', info.textColor)}>
                          {currentAgent.bankName || info.name}
                        </span>
                      </>
                    );
                  })()}
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAgentTarget(currentAgent);
                      setManageView(false);
                      setIsModalOpen(true);
                    }}
                    className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/50 transition cursor-pointer inline-flex items-center text-[11px] font-semibold"
                    title="แก้ไขเลขบัญชีของ Agent นี้"
                  >
                    <Edit3 className="w-3 h-3 mr-0.5" />
                    แก้ไข
                  </button>
                </div>
              </div>

              {/* Account Number & Copy */}
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block">เลขที่บัญชี:</span>
                  <span className="font-mono font-black text-sm text-slate-900 dark:text-white tracking-wider block">
                    {currentAgent.bankAccountNumber}
                  </span>
                  {currentAgent.bankAccountName && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                      ชื่อบัญชี: {currentAgent.bankAccountName}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(currentAgent.bankAccountNumber || '')}
                  className={clsx(
                    'px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center transition cursor-pointer shrink-0 shadow-2xs active:scale-95',
                    copiedBankKey === 'current'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800'
                  )}
                  title="คัดลอกเลขที่บัญชีเพื่อโอนเงิน"
                >
                  {copiedBankKey === 'current' ? (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      คัดลอกแล้ว
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" />
                      คัดลอกเลขบัญชี
                    </>
                  )}
                </button>
              </div>

              {/* Extra details (Phone or Notes) */}
              {(currentAgent.phone || currentAgent.notes) && (
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5 px-1">
                  {currentAgent.phone && (
                    <span className="inline-flex items-center">
                      <Phone className="w-3 h-3 mr-1 text-slate-400" />
                      {currentAgent.phone}
                    </span>
                  )}
                  {currentAgent.notes && (
                    <span className="italic truncate ml-2">
                      หมายเหตุ: {currentAgent.notes}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* MISSING BANK DETAILS PROMPT */
            <div className="flex items-center justify-between gap-2 py-0.5">
              <div className="flex items-center space-x-1.5 text-amber-700 dark:text-amber-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Agent นี้ยังไม่ได้ระบุเลขบัญชีธนาคาร</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingAgentTarget(currentAgent);
                  setManageView(false);
                  setIsModalOpen(true);
                }}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold rounded-lg text-[11px] transition cursor-pointer inline-flex items-center shadow-2xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                + เพิ่มเลขบัญชี
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD / MANAGE & DELETE AGENTS (Portal) */}
      <AgentManagerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingAgentTarget(null);
        }}
        onSelectAgent={(name) => onChange(name)}
        currentSelectedAgent={value}
        currentUser={currentUser}
        cases={cases}
        initialManageView={manageView}
        initialEditingAgent={editingAgentTarget}
      />

      {/* QUICK DELETE CONFIRMATION MODAL (Portal) */}
      {quickDeleteTarget && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/80 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  ยืนยันการลบตัวแทน
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ลบออกจากตัวเลือกดรอปดาวน์
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                ต้องการลบตัวแทน:
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                "{quickDeleteTarget}"
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              เมื่อลบแล้ว ชื่อตัวแทนนี้จะไม่ปรากฏในตัวเลือกดรอปดาวน์สำหรับผู้เช็คเครดิตทุกคนอีกต่อไป
            </p>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                disabled={isDeletingQuick}
                onClick={() => setQuickDeleteTarget(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeletingQuick}
                onClick={handleConfirmQuickDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition shadow-xs flex items-center cursor-pointer"
              >
                {isDeletingQuick ? (
                  'กำลังลบ...'
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    ยืนยันลบตัวแทน
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
