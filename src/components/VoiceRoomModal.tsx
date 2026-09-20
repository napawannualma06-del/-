import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Plus,
  Radio,
  Sparkles,
  Layers,
  Wrench,
  AlertTriangle,
  MessageSquare,
  Trash2,
  Users,
  ExternalLink,
  CheckCircle2,
  Shield,
  HelpCircle,
} from 'lucide-react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { useVoiceChat } from '../context/VoiceChatContext';
import { VoiceRoom, VoiceRoomCategory } from '../types/voice';
import { Case } from '../types';
import clsx from 'clsx';

interface VoiceRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillCaseId?: string;
  prefillCaseName?: string;
}

const CATEGORY_MAP: Record<VoiceRoomCategory, { label: string; icon: typeof Radio; color: string; badgeClass: string }> = {
  case: {
    label: 'คุยเคสลูกค้า',
    icon: Layers,
    color: 'text-indigo-600 dark:text-indigo-400',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
  },
  urgent: {
    label: 'เคสเร่งด่วน',
    icon: AlertTriangle,
    color: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  },
  tech: {
    label: 'ปัญหาเทคนิค/ช่าง',
    icon: Wrench,
    color: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  general: {
    label: 'คุยงานทั่วไป',
    icon: MessageSquare,
    color: 'text-emerald-600 dark:text-emerald-400',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  },
};

export const VoiceRoomModal: React.FC<VoiceRoomModalProps> = ({
  isOpen,
  onClose,
  prefillCaseId,
  prefillCaseName,
}) => {
  const { user } = useStore();
  const [cases, setCases] = useState<Case[]>([]);
  const {
    activeRoom,
    isConnecting,
    isConnected,
    isMuted,
    isDeafened,
    isSpeaking,
    audioLevel,
    peers,
    speakingPeers,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleDeafen,
    hasMicPermission,
    requestMicAccess,
    connectionError,
  } = useVoiceChat();

  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [category, setCategory] = useState<VoiceRoomCategory>('case');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(prefillCaseId || '');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Subscribe to real-time cases for dropdown selection
  useEffect(() => {
    const qCases = query(collection(db, 'cases'), limit(60));
    const unsub = onSnapshot(qCases, (snapshot) => {
      const list: Case[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Case);
      });
      setCases(list);
    });
    return () => unsub();
  }, []);

  // Prefill case if provided
  useEffect(() => {
    if (prefillCaseId) {
      setSelectedCaseId(prefillCaseId);
      if (prefillCaseName) {
        setRoomName(`คุยเคส ${prefillCaseName}`);
      }
      setShowCreateForm(true);
    }
  }, [prefillCaseId, prefillCaseName]);

  // Subscribe to real-time voice rooms
  useEffect(() => {
    const q = query(
      collection(db, 'voice_rooms'),
      where('isClosed', '!=', true),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: VoiceRoom[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as VoiceRoom);
        });
        setRooms(list);
      },
      (err) => {
        console.warn('Error fetching voice rooms:', err);
      }
    );

    return () => unsub();
  }, []);

  if (!isOpen) return null;

  // Handle create new voice room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || !user) return;

    setIsSubmitting(true);
    try {
      const selectedCase = cases.find((c) => c.id === selectedCaseId);
      const caseLabel = selectedCase ? `${selectedCase.agentName} (${selectedCase.iphoneModel})` : undefined;

      const newRoomData = {
        name: roomName.trim(),
        category,
        caseId: selectedCaseId || null,
        description: description.trim() || (caseLabel ? `เคส: ${caseLabel}` : null),
        createdById: user.uid,
        createdByName: user.name || 'พนักงาน',
        createdAt: Date.now(),
        participantCount: 0,
        isClosed: false,
      };

      const docRef = await addDoc(collection(db, 'voice_rooms'), newRoomData);

      // Auto-join newly created room
      const createdRoom: VoiceRoom = {
        id: docRef.id,
        ...newRoomData,
        description: newRoomData.description || undefined,
        caseId: newRoomData.caseId || undefined,
      };

      setRoomName('');
      setDescription('');
      setSelectedCaseId('');
      setShowCreateForm(false);

      await joinRoom(createdRoom);
    } catch (error) {
      console.error('Error creating voice room:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete room (creator or admin)
  const handleDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('ยืนยันปิดห้องเสียงนี้ใช่หรือไม่?')) return;

    try {
      if (activeRoom?.id === roomId) {
        await leaveRoom();
      }
      await deleteDoc(doc(db, 'voice_rooms', roomId));
    } catch (err) {
      console.error('Error deleting voice room:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Volume2 className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {activeRoom ? activeRoom.name : 'ห้องคุยเสียง (Voice Channels)'}
                </h2>
                {activeRoom && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    เชื่อมต่อแล้ว ({peers.length} คน)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeRoom
                  ? 'ระบบเสียงแบบ Discord คุยสอบถามหรือปรึกษาเคสแบบเรียลไทม์'
                  : 'เลือกห้องคุยหรือสร้างห้องใหม่เพื่อคุยเคสกับเพื่อนร่วมงาน'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!activeRoom && !showCreateForm && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                สร้างห้องคุยเคส
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Warning if mic permission not granted */}
          {!hasMicPermission && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-amber-800 dark:text-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">ยังไม่ได้รับอนุญาตการใช้ไมโครโฟน</p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                  กรุณากดอนุญาตการใช้ไมโครโฟนบนเบราว์เซอร์เพื่อให้เพื่อนร่วมทีมได้ยินเสียงของคุณ
                </p>
                <button
                  type="button"
                  onClick={requestMicAccess}
                  className="mt-2 px-2.5 py-1 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 transition"
                >
                  เปิดไมโครโฟน
                </button>
              </div>
            </div>
          )}

          {connectionError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{connectionError}</span>
            </div>
          )}

          {/* ACTIVE IN A ROOM: DISCORD-LIKE STAGE */}
          {activeRoom ? (
            <div className="space-y-6">
              {/* Linked Case Notice if applicable */}
              {activeRoom.caseId && (
                <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>
                      ห้องนี้กำลังคุยเกี่ยวกับเคส:{' '}
                      <strong className="font-semibold">
                        {cases.find((c) => c.id === activeRoom.caseId)?.agentName || activeRoom.description || activeRoom.caseId}
                      </strong>
                    </span>
                  </div>
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                    เคสในคิว
                  </span>
                </div>
              )}

              {/* Participants Grid (Discord Style) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    ผู้ใช้งานในห้อง ({peers.length} คน)
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>WebRTC Real-time Audio</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {peers.map((peer) => {
                    const isSelf = peer.id === user?.uid;
                    const peerSpeaking = isSelf ? isSpeaking : !!speakingPeers[peer.id];
                    const peerMuted = isSelf ? isMuted : peer.isMuted;
                    const peerDeafened = isSelf ? isDeafened : peer.isDeafened;

                    return (
                      <div
                        key={peer.id}
                        className={clsx(
                          'relative rounded-2xl p-4 flex flex-col items-center text-center transition-all duration-200',
                          'bg-slate-50 dark:bg-slate-800/60 border',
                          peerSpeaking
                            ? 'border-emerald-500 ring-2 ring-emerald-500/50 shadow-md shadow-emerald-500/10'
                            : 'border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                        )}
                      >
                        {/* Avatar with Speaking Ring */}
                        <div className="relative mb-2.5">
                          <div
                            className={clsx(
                              'w-16 h-16 rounded-full flex items-center justify-center text-2xl select-none transition-all duration-150',
                              'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md',
                              peerSpeaking
                                ? 'ring-4 ring-emerald-500 shadow-lg shadow-emerald-500/30 scale-105'
                                : 'ring-2 ring-transparent'
                            )}
                          >
                            {peer.avatarEmoji || '🎧'}
                          </div>

                          {/* Speaking / Mute / Deafen Badges */}
                          <div className="absolute -bottom-1 -right-1 flex items-center gap-1 bg-white dark:bg-slate-900 rounded-full p-1 shadow border border-slate-200 dark:border-slate-700">
                            {peerDeafened ? (
                              <Headphones className="w-3.5 h-3.5 text-rose-500" />
                            ) : peerMuted ? (
                              <MicOff className="w-3.5 h-3.5 text-rose-500" />
                            ) : peerSpeaking ? (
                              <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                            ) : (
                              <Mic className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {/* Name & Role */}
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[130px]">
                          {peer.name} {isSelf && '(คุณ)'}
                        </span>

                        <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wide">
                          {peer.role === 'admin' ? 'ผู้ดูแล' : 'พนักงาน'}
                        </span>

                        {/* Audio Meter for Self */}
                        {isSelf && !peerMuted && (
                          <div className="w-full mt-2 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-75"
                              style={{ width: `${Math.min(100, audioLevel * 1.8)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Voice Control Bar in Stage */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {/* Mute Button */}
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer',
                      isMuted
                        ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    )}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isMuted ? 'ไมค์ปิดอยู่ (กดเพื่อเปิด)' : 'ปิดไมโครโฟน'}
                  </button>

                  {/* Deafen Button */}
                  <button
                    type="button"
                    onClick={toggleDeafen}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer',
                      isDeafened
                        ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    )}
                  >
                    <Headphones className="w-4 h-4" />
                    {isDeafened ? 'ปิดเสียงลำโพงอยู่' : 'ปิดเสียงเพื่อน'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Leave Call Button */}
                  <button
                    type="button"
                    onClick={leaveRoom}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" />
                    ออกจากห้องเสียง
                  </button>
                </div>
              </div>
            </div>
          ) : showCreateForm ? (
            /* CREATE ROOM FORM */
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  สร้างห้องคุยเสียงใหม่
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  ยกเลิก
                </button>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  เลือกหมวดหมู่ห้อง
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(Object.keys(CATEGORY_MAP) as VoiceRoomCategory[]).map((cat) => {
                    const info = CATEGORY_MAP[cat];
                    const Icon = info.icon;
                    const isSelected = category === cat;

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCategory(cat);
                          if (!roomName || roomName.startsWith('ห้อง')) {
                            if (cat === 'case') setRoomName('ห้องคุยเคสลูกค้า');
                            if (cat === 'urgent') setRoomName('🚨 คุยเคสด่วน');
                            if (cat === 'tech') setRoomName('🛠️ ปรึกษาปัญหาเทคนิค');
                            if (cat === 'general') setRoomName('💬 ห้องคุยงานทั่วไป');
                          }
                        }}
                        className={clsx(
                          'p-2.5 rounded-xl border text-left flex flex-col gap-1 transition cursor-pointer',
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className={clsx('w-3.5 h-3.5', info.color)} />
                          <span className="text-xs font-semibold">{info.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Room Name */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ชื่อห้องคุย <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="เช่น คุยเคสคุณสมชาย, เคสด่วน SN-1234, ห้องปรึกษาเรื่องสัญญา"
                  required
                  maxLength={100}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Optional Link to a Case */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ผูกกับเคสในระบบ (ไม่บังคับ)
                </label>
                <select
                  value={selectedCaseId}
                  onChange={(e) => {
                    setSelectedCaseId(e.target.value);
                    const c = cases.find((item) => item.id === e.target.value);
                    if (c && !roomName) {
                      setRoomName(`คุยเคส ${c.agentName} (${c.iphoneModel})`);
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- ไม่ผูกกับเคสใดเป็นพิเศษ --</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.agentName} - {c.iphoneModel} ({c.province}) [{c.status}]
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  การผูกเคสจะช่วยให้พนักงานคนอื่นรู้ทันทีว่าห้องนี้เปิดมาคุยเกี่ยวกับเคสไหน
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  รายละเอียด / ประเด็นที่จะปรึกษา (ไม่บังคับ)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="เช่น ปรึกษาเรื่องเช็คเครดิตไม่ผ่าน, สอบถามอาการหน้าจอแตก ฯลฯ"
                  rows={2}
                  maxLength={300}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !roomName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  {isSubmitting ? 'กำลังสร้าง...' : 'สร้างและเข้าห้องทันที'}
                </button>
              </div>
            </form>
          ) : (
            /* ROOM LIST */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                  ห้องคุยเสียงที่กำลังเปิดอยู่ ({rooms.length})
                </h3>
              </div>

              {rooms.length === 0 ? (
                <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
                    <Volume2 className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    ยังไม่มีห้องคุยเสียงในขณะนี้
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    กดปุ่มสร้างห้องด้านล่างเพื่อเปิดห้องคุยเสียง ปรึกษาเคส หรือพูดคุยงานแบบเรียลไทม์ได้เลย
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <Plus className="w-4 h-4" />
                    สร้างห้องคุยเคสใหม่
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {rooms.map((room) => {
                    const catInfo = CATEGORY_MAP[room.category || 'general'] || CATEGORY_MAP.general;
                    const CatIcon = catInfo.icon;
                    const isMyRoom = room.createdById === user?.uid || user?.role === 'admin';

                    return (
                      <div
                        key={room.id}
                        onClick={() => joinRoom(room)}
                        className="group relative p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700/70 bg-white dark:bg-slate-800/80 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span
                              className={clsx(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border',
                                catInfo.badgeClass
                              )}
                            >
                              <CatIcon className="w-3 h-3" />
                              {catInfo.label}
                            </span>

                            {isMyRoom && (
                              <button
                                type="button"
                                title="ปิดห้องนี้"
                                onClick={(e) => handleDeleteRoom(room.id, e)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                            {room.name}
                          </h4>

                          {room.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                              {room.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>ผู้สร้าง: {room.createdByName}</span>
                          </div>

                          <button
                            type="button"
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 group-hover:bg-indigo-600 text-indigo-600 dark:text-indigo-400 group-hover:text-white font-semibold transition text-xs"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            เข้าร่วมห้อง
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info note */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-emerald-500" />
            <span>เชื่อมต่อเสียงตรง Peer-to-Peer เข้ารหัสปลอดภัย ไม่มีการบันทึกเสียง</span>
          </div>
          <span>รองรับการพูดคุยหลายคนพร้อมกัน</span>
        </div>
      </div>
    </div>
  );
};
