import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  orderBy,
  setDoc,
  getDocs,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Agent, Case, UserProfile } from '../types';
import { 
  Send, 
  Plus, 
  X, 
  Trash2, 
  Check, 
  Building2, 
  Search,
  Users,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { clsx } from 'clsx';

interface AgentSelectProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  currentUser?: UserProfile | null;
  cases?: Case[];
  disabled?: boolean;
}

const DEFAULT_SEEDED_AGENTS = [
  'Agent Pream',
  'Agent Pream (สาขาใหญ่)',
  'Agent สมบัติ สาขาบางนา',
];

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
  const [newAgentName, setNewAgentName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [manageView, setManageView] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; id?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Subscribe to deleted agents blacklist
  useEffect(() => {
    const unsubDeleted = onSnapshot(
      doc(db, 'system_duties', 'deleted_agents'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDeletedNames(Array.isArray(data.names) ? data.names : []);
        } else {
          setDeletedNames([]);
        }
      },
      (err) => {
        console.warn('deleted_agents listen warning:', err);
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
          });
        });
        setAgents(loadedAgents);
        setIsLoading(false);

        // Auto-seed if collection is completely empty
        if (loadedAgents.length === 0) {
          seedInitialAgents();
        }
      },
      (error) => {
        setIsLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'agents');
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
        });
      }
    } catch (err) {
      console.warn('Initial agent seeding note:', err);
    }
  };

  // Combine loaded agents and historical cases, filtered by deletedNames
  const allAvailableAgents = useMemo(() => {
    const agentMap = new Map<string, { id?: string; name: string }>();
    const deletedSet = new Set(deletedNames.map((n) => n.trim().toLowerCase()));

    // First add from collection
    agents.forEach((a) => {
      const trimmed = a.name.trim();
      if (trimmed && !deletedSet.has(trimmed.toLowerCase())) {
        agentMap.set(trimmed.toLowerCase(), { id: a.id, name: trimmed });
      }
    });

    // Merge any distinct agents in cases that are not deleted
    cases.forEach((c) => {
      const name = c.agentName?.trim();
      if (name && !deletedSet.has(name.toLowerCase()) && !agentMap.has(name.toLowerCase())) {
        agentMap.set(name.toLowerCase(), { name });
      }
    });

    // Return sorted array
    return Array.from(agentMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'th')
    );
  }, [agents, cases, deletedNames]);

  // Handle adding new agent
  const handleSaveNewAgent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newAgentName.trim();
    if (!trimmed) {
      setErrorMessage('กรุณาระบุชื่อตัวแทน');
      return;
    }

    // Check duplicate
    const exists = allAvailableAgents.some(
      (a) => a.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      onChange(trimmed);
      setIsModalOpen(false);
      setNewAgentName('');
      setSuccessMessage(`เลือกตัวแทน "${trimmed}" เรียบร้อยแล้ว`);
      setTimeout(() => setSuccessMessage(''), 3000);
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

      await addDoc(collection(db, 'agents'), {
        name: trimmed,
        createdAt: Date.now(),
        createdBy: currentUser?.name || 'ผู้เช็คเครดิต',
        createdById: currentUser?.uid || '',
      });

      // Automatically select this newly created agent
      onChange(trimmed);
      setIsModalOpen(false);
      setNewAgentName('');
      setSuccessMessage(`เพิ่มตัวแทน "${trimmed}" สำเร็จและเลือกให้อัตโนมัติ`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      setErrorMessage('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง');
      handleFirestoreError(error, OperationType.CREATE, 'agents');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger delete modal for a specific agent
  const handlePromptDelete = (agentName: string, agentId?: string) => {
    if (!agentName) return;
    setDeleteTarget({ name: agentName, id: agentId });
  };

  // Perform actual deletion from Firestore
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const targetName = deleteTarget.name.trim();

    try {
      // 1. Delete matching documents from 'agents' collection
      if (deleteTarget.id) {
        await deleteDoc(doc(db, 'agents', deleteTarget.id));
      } else {
        // Query by name and delete
        const qDocs = await getDocs(
          query(collection(db, 'agents'), where('name', '==', targetName))
        );
        for (const d of qDocs.docs) {
          await deleteDoc(doc(db, 'agents', d.id));
        }
      }

      // 2. Add to deleted blacklist so historical cases don't revive it
      const nextDeleted = Array.from(
        new Set([...deletedNames, targetName])
      );
      await setDoc(
        doc(db, 'system_duties', 'deleted_agents'),
        { names: nextDeleted },
        { merge: true }
      );

      // 3. Clear current selection if it was this agent
      if (value === targetName) {
        onChange('');
      }

      setDeleteTarget(null);
      setSuccessMessage(`ลบตัวแทน "${targetName}" ออกจากดรอปดาวน์เรียบร้อยแล้ว`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('เกิดข้อผิดพลาดในการลบตัวแทน กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredAgentsList = useMemo(() => {
    if (!searchTerm.trim()) return allAvailableAgents;
    const term = searchTerm.toLowerCase();
    return allAvailableAgents.filter((a) => a.name.toLowerCase().includes(term));
  }, [allAvailableAgents, searchTerm]);

  return (
    <div>
      {/* Label Row with Add & Delete/Manage Actions */}
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          ชื่อตัวแทน (ผู้ส่งเคส) *
        </label>
        
        <div className="flex items-center space-x-2">
          {/* Manage / Delete button */}
          <button
            type="button"
            onClick={() => {
              setManageView(true);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition cursor-pointer hover:underline"
            title="ลบหรือจัดการตัวแทนออกจากดรอปดาวน์"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            ลบ/จัดการตัวแทน ({allAvailableAgents.length})
          </button>

          <span className="text-slate-300 dark:text-slate-600 text-xs">•</span>

          {/* Add Agent button */}
          <button
            type="button"
            onClick={() => {
              setErrorMessage('');
              setNewAgentName('');
              setManageView(false);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition cursor-pointer hover:underline"
            title="เพิ่มตัวแทนใหม่ลงในดรอปดาวน์"
          >
            <Plus className="w-3.5 h-3.5 mr-0.5" />
            เพิ่มตัวแทนใหม่
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
                setErrorMessage('');
                setNewAgentName('');
                setManageView(false);
                setIsModalOpen(true);
              } else if (selected === '__MANAGE_DELETE__') {
                setManageView(true);
                setIsModalOpen(true);
              } else {
                onChange(selected);
              }
            }}
            className={clsx(
              "w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition appearance-none cursor-pointer",
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
              ➕ + เพิ่มชื่อตัวแทนใหม่...
            </option>

            <option value="__MANAGE_DELETE__" className="font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/60">
              🗑️ จัดการและลบตัวแทนออกจากดรอปดาวน์...
            </option>

            <optgroup label="รายชื่อตัวแทนในระบบ">
              {allAvailableAgents.map((agent) => (
                <option key={agent.name} value={agent.name}>
                  {agent.name}
                </option>
              ))}
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
            onClick={() => handlePromptDelete(value)}
            className="px-3 py-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/80 rounded-xl text-xs font-semibold flex items-center shrink-0 transition cursor-pointer active:scale-95 shadow-2xs group"
            title={`ลบตัวแทน "${value}" ออกจากดรอปดาวน์`}
          >
            <Trash2 className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
            <span className="ml-1.5 hidden sm:inline">ลบออกจากดรอปดาวน์</span>
          </button>
        )}
      </div>

      {/* Success Notification Alert if just added or deleted */}
      {successMessage && (
        <div className="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center animate-fadeIn font-medium">
          <Check className="w-3 h-3 mr-1 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* MODAL: ADD / MANAGE & DELETE AGENTS */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
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
                    {manageView ? 'จัดการและลบตัวแทนออกจากระบบ' : 'เพิ่มชื่อตัวแทนใหม่'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {manageView
                      ? `มีตัวแทนทั้งหมด ${allAvailableAgents.length} รายชื่อในดรอปดาวน์`
                      : 'ข้อมูลจะเข้ามาอยู่ในดรอปดาวน์ทันที'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Tab selector between Add New and View/Manage List */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setManageView(false)}
                  className={clsx(
                    "flex-1 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center justify-center",
                    !manageView
                      ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  เพิ่มตัวแทนใหม่
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
                  ลบตัวแทน ({allAvailableAgents.length})
                </button>
              </div>

              {!manageView ? (
                /* ADD NEW AGENT FORM */
                <form onSubmit={handleSaveNewAgent} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      ชื่อตัวแทน / สาขา *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        required
                        value={newAgentName}
                        onChange={(e) => {
                          setNewAgentName(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        placeholder="เช่น Agent สมบัติ สาขาบางนา"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition"
                      />
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    </div>
                  </div>

                  {/* Quick Examples */}
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1.5">ตัวอย่างการพิมพ์:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {['Agent Pream (สาขา 2)', 'Agent นนทบุรี', 'Agent ธนวัฒน์'].map((example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => setNewAgentName(example)}
                          className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition"
                        >
                          + {example}
                        </button>
                      ))}
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="text-xs text-rose-600 dark:text-rose-400 flex items-center bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60">
                      <AlertCircle className="w-4 h-4 mr-1.5 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || !newAgentName.trim()}
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition shadow-xs flex items-center cursor-pointer"
                    >
                      {isSaving ? (
                        'กำลังบันทึก...'
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1.5" />
                          บันทึกและเลือกทันที
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* MANAGE & DELETE LIST VIEW */
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อตัวแทนที่ต้องการลบ..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    💡 กดปุ่ม <span className="text-rose-600 dark:text-rose-400 font-semibold">"ลบ"</span> ด้านหลังชื่อตัวแทน เพื่อนำออกจากดรอปดาวน์
                  </p>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                    {filteredAgentsList.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        ไม่พบรายชื่อตัวแทน
                      </div>
                    ) : (
                      filteredAgentsList.map((agent) => (
                        <div
                          key={agent.name}
                          className="px-3 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-xs"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                              {agent.name}
                            </span>
                            {value === agent.name && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold shrink-0">
                                กำลังเลือก
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => {
                                onChange(agent.name);
                                setIsModalOpen(false);
                              }}
                              className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded-lg text-[11px] font-semibold cursor-pointer transition"
                            >
                              เลือก
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePromptDelete(agent.name, agent.id)}
                              className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-lg text-[11px] font-semibold flex items-center cursor-pointer transition"
                              title={`ลบ "${agent.name}" ออกจากดรอปดาวน์`}
                            >
                              <Trash2 className="w-3 h-3 mr-1 text-rose-500" />
                              ลบ
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
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
                  ลบออกจากตัวเลือกดรอปดาวน์
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
}
