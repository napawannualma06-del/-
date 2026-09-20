import React from 'react';
import {
  Volume2,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Maximize2,
  Radio,
  Users,
} from 'lucide-react';
import { useVoiceChat } from '../context/VoiceChatContext';
import { useStore } from '../store/useStore';
import clsx from 'clsx';

interface VoiceBarProps {
  onOpenModal: () => void;
}

export const VoiceBar: React.FC<VoiceBarProps> = ({ onOpenModal }) => {
  const { user } = useStore();
  const {
    activeRoom,
    isConnected,
    isMuted,
    isDeafened,
    isSpeaking,
    peers,
    speakingPeers,
    toggleMute,
    toggleDeafen,
    leaveRoom,
  } = useVoiceChat();

  if (!isConnected || !activeRoom) return null;

  // Check if anyone in the room is currently speaking
  const anyOtherSpeaking = Object.values(speakingPeers).some(Boolean);
  const someoneSpeaking = isSpeaking || anyOtherSpeaking;

  return (
    <div className="fixed bottom-4 left-4 z-40 animate-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-center gap-2.5 bg-slate-900 text-white p-2 sm:px-3 sm:py-2 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md">
        {/* Connection status indicator with pulse */}
        <button
          type="button"
          onClick={onOpenModal}
          className="flex items-center gap-2 text-left group cursor-pointer hover:opacity-90 transition pr-2 border-r border-slate-700/80"
          title="คลิกเพื่อขยายห้องคุยเสียง"
        >
          <div className="relative">
            <div
              className={clsx(
                'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
                someoneSpeaking
                  ? 'bg-emerald-500 text-white ring-2 ring-emerald-400/80 shadow-md shadow-emerald-500/30 animate-pulse'
                  : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              )}
            >
              <Volume2 className="w-4 h-4" />
            </div>
            {someoneSpeaking && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
            )}
          </div>

          <div className="hidden sm:block max-w-[160px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                RTC Connected
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-100 truncate group-hover:text-emerald-300 transition">
              {activeRoom.name}
            </p>
          </div>
        </button>

        {/* Participant Count & Avatars */}
        <button
          type="button"
          onClick={onOpenModal}
          className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-slate-300 hover:text-white text-xs font-medium cursor-pointer"
          title="ดูสมาชิกในห้อง"
        >
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-semibold">{peers.length}</span>
        </button>

        {/* Controls: Mute, Deafen, Expand, Disconnect */}
        <div className="flex items-center gap-1 pl-1">
          {/* Mute Mic */}
          <button
            type="button"
            onClick={toggleMute}
            className={clsx(
              'p-2 rounded-xl text-xs font-medium transition cursor-pointer',
              isMuted
                ? 'bg-rose-600/90 text-white hover:bg-rose-700 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            )}
            title={isMuted ? 'เปิดไมโครโฟน' : 'ปิดไมโครโฟน'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Deafen */}
          <button
            type="button"
            onClick={toggleDeafen}
            className={clsx(
              'p-2 rounded-xl text-xs font-medium transition cursor-pointer',
              isDeafened
                ? 'bg-rose-600/90 text-white hover:bg-rose-700 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            )}
            title={isDeafened ? 'เปิดเสียงลำโพง' : 'ปิดเสียงลำโพง'}
          >
            <Headphones className="w-4 h-4" />
          </button>

          {/* Open Full Modal */}
          <button
            type="button"
            onClick={onOpenModal}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            title="ขยายห้องคุยเสียง"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Leave Voice Button */}
          <button
            type="button"
            onClick={leaveRoom}
            className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition shadow-md shadow-rose-600/20 cursor-pointer ml-0.5"
            title="ตัดการเชื่อมต่อ (ออกจากห้องเสียง)"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
