import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  addDoc,
  query,
  where,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { VoiceRoom, VoicePeer, WebRTCSignal } from '../types/voice';
import { 
  playJoinRoomSound, 
  playLeaveRoomSound, 
  playMuteSound, 
  playUnmuteSound 
} from '../lib/sound';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
};

interface VoiceChatContextType {
  activeRoom: VoiceRoom | null;
  isConnecting: boolean;
  isConnected: boolean;
  connectionError: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  peers: VoicePeer[];
  speakingPeers: Record<string, boolean>;
  joinRoom: (room: VoiceRoom) => Promise<void>;
  leaveRoom: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  openRoomModal: boolean;
  setOpenRoomModal: (open: boolean) => void;
  hasMicPermission: boolean;
  requestMicAccess: () => Promise<boolean>;
}

const VoiceChatContext = createContext<VoiceChatContextType | null>(null);

export function VoiceChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useStore();

  const [activeRoom, setActiveRoom] = useState<VoiceRoom | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [speakingPeers, setSpeakingPeers] = useState<Record<string, boolean>>({});
  const [openRoomModal, setOpenRoomModal] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(true);

  // References
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const remoteAnalysersRef = useRef<Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>>(new Map());
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const checkSpeakingIntervalRef = useRef<number | null>(null);
  const activeRoomRef = useRef<VoiceRoom | null>(null);
  activeRoomRef.current = activeRoom;

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const isDeafenedRef = useRef(isDeafened);
  isDeafenedRef.current = isDeafened;

  // Initialize or get Web Audio Context safely
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
      }
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    return audioContextRef.current;
  }, []);

  // Request Microphone Stream
  const requestMicAccess = useCallback(async (): Promise<boolean> => {
    try {
      if (localStreamRef.current) return true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setHasMicPermission(true);

      // Setup audio analysis for local microphone speaking detection
      const ctx = getAudioContext();
      if (ctx) {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        localAnalyserRef.current = analyser;
      }

      return true;
    } catch (err: unknown) {
      console.warn('Microphone access denied or unavailable:', err);
      setHasMicPermission(false);
      setConnectionError('ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณากดอนุญาตการใช้ไมค์บนเบราว์เซอร์');
      return false;
    }
  }, [getAudioContext]);

  // Speaking indicator loop (Runs client-side 15 times/sec for instant Discord-like responsiveness)
  useEffect(() => {
    if (!isConnected) {
      if (checkSpeakingIntervalRef.current) {
        window.clearInterval(checkSpeakingIntervalRef.current);
        checkSpeakingIntervalRef.current = null;
      }
      setIsSpeaking(false);
      setAudioLevel(0);
      setSpeakingPeers({});
      return;
    }

    const dataArray = new Uint8Array(128);

    checkSpeakingIntervalRef.current = window.setInterval(() => {
      // 1. Check local microphone
      if (localAnalyserRef.current && !isMutedRef.current) {
        localAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);

        const speakingNow = normalized > 12; // threshold for speaking
        setIsSpeaking(speakingNow);
      } else {
        setIsSpeaking(false);
        setAudioLevel(0);
      }

      // 2. Check remote peers' real-time audio streams
      const newSpeakingMap: Record<string, boolean> = {};
      remoteAnalysersRef.current.forEach(({ analyser }, peerId) => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        newSpeakingMap[peerId] = normalized > 12;
      });

      setSpeakingPeers(newSpeakingMap);
    }, 70);

    return () => {
      if (checkSpeakingIntervalRef.current) {
        window.clearInterval(checkSpeakingIntervalRef.current);
        checkSpeakingIntervalRef.current = null;
      }
    };
  }, [isConnected]);

  // Clean up WebRTC peer connection for a specific peer
  const closePeerConnection = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }

    const audio = remoteAudiosRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      remoteAudiosRef.current.delete(peerId);
    }

    const analyserObj = remoteAnalysersRef.current.get(peerId);
    if (analyserObj) {
      analyserObj.source.disconnect();
      remoteAnalysersRef.current.delete(peerId);
    }
  }, []);

  // Create or retrieve Peer Connection to a remote peer
  const getOrCreatePeerConnection = useCallback(
    (remotePeerId: string, roomId: string): RTCPeerConnection => {
      let pc = peerConnectionsRef.current.get(remotePeerId);
      if (pc) return pc;

      pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current.set(remotePeerId, pc);

      // Add local audio tracks to peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          if (localStreamRef.current) {
            pc?.addTrack(track, localStreamRef.current);
          }
        });
      }

      // Handle ICE Candidates generated locally
      pc.onicecandidate = (event) => {
        if (event.candidate && user) {
          const signal: WebRTCSignal = {
            from: user.uid,
            to: remotePeerId,
            type: 'candidate',
            payload: JSON.stringify(event.candidate),
            createdAt: Date.now(),
          };
          addDoc(collection(db, 'voice_rooms', roomId, 'signals'), signal).catch(console.warn);
        }
      };

      // Handle Remote Audio Track
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;

        // Create or attach to HTMLAudioElement
        let audio = remoteAudiosRef.current.get(remotePeerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audio.muted = isDeafenedRef.current;
          remoteAudiosRef.current.set(remotePeerId, audio);
        }
        audio.srcObject = remoteStream;
        audio.play().catch(() => {});

        // Attach to AudioContext Analyser for real-time speaking detection of remote peer
        const ctx = getAudioContext();
        if (ctx) {
          try {
            const source = ctx.createMediaStreamSource(remoteStream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.4;
            source.connect(analyser);
            remoteAnalysersRef.current.set(remotePeerId, { analyser, source });
          } catch (e) {
            console.warn('Could not attach analyser to remote audio:', e);
          }
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc?.connectionState === 'disconnected' || pc?.connectionState === 'failed' || pc?.connectionState === 'closed') {
          closePeerConnection(remotePeerId);
        }
      };

      return pc;
    },
    [closePeerConnection, getAudioContext, user]
  );

  // Leave active voice room
  const leaveRoom = useCallback(async () => {
    const room = activeRoomRef.current;
    if (!room || !user) {
      setIsConnected(false);
      setIsConnecting(false);
      setActiveRoom(null);
      return;
    }

    try {
      playLeaveRoomSound();

      // Remove peer doc in Firestore
      await deleteDoc(doc(db, 'voice_rooms', room.id, 'peers', user.uid)).catch(console.warn);

      // Decrement participant count
      await updateDoc(doc(db, 'voice_rooms', room.id), {
        participantCount: Math.max(0, peers.length - 1),
        updatedAt: Date.now(),
      }).catch(() => {});
    } catch (e) {
      console.warn('Error during leaveRoom cleanup:', e);
    } finally {
      // Close all WebRTC connections and stop audio
      peerConnectionsRef.current.forEach((_, peerId) => closePeerConnection(peerId));
      peerConnectionsRef.current.clear();
      remoteAudiosRef.current.clear();
      remoteAnalysersRef.current.clear();
      processedSignalsRef.current.clear();

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      localAnalyserRef.current = null;

      setActiveRoom(null);
      setIsConnected(false);
      setIsConnecting(false);
      setPeers([]);
      setIsSpeaking(false);
      setAudioLevel(0);
      setSpeakingPeers({});
    }
  }, [closePeerConnection, peers.length, user]);

  // Join a voice room
  const joinRoom = useCallback(
    async (room: VoiceRoom) => {
      if (!user) return;

      // If already in this room, simply open modal
      if (activeRoom && activeRoom.id === room.id) {
        setOpenRoomModal(true);
        return;
      }

      // If currently in another room, leave first
      if (activeRoom) {
        await leaveRoom();
      }

      setIsConnecting(true);
      setConnectionError(null);

      // 1. Request microphone permission and get stream
      const micOk = await requestMicAccess();
      if (!micOk) {
        setIsConnecting(false);
        return;
      }

      try {
        playJoinRoomSound();
        setActiveRoom(room);

        // 2. Register this user as a peer in the room
        const peerData: VoicePeer = {
          id: user.uid,
          userId: user.uid,
          name: user.name || 'พนักงาน',
          avatarEmoji: user.avatarEmoji || '🎧',
          role: user.role || 'employee',
          isMuted: isMutedRef.current,
          isDeafened: isDeafenedRef.current,
          joinedAt: Date.now(),
          lastPing: Date.now(),
        };

        await setDoc(doc(db, 'voice_rooms', room.id, 'peers', user.uid), peerData);

        // Update room participant count
        await updateDoc(doc(db, 'voice_rooms', room.id), {
          participantCount: (room.participantCount || 0) + 1,
          updatedAt: Date.now(),
        }).catch(() => {});

        setIsConnected(true);
        setIsConnecting(false);
      } catch (err: unknown) {
        console.error('Failed to join voice room:', err);
        setConnectionError('ไม่สามารถเข้าร่วมห้องเสียงได้ กรุณาลองใหม่อีกครั้ง');
        setIsConnecting(false);
      }
    },
    [activeRoom, leaveRoom, requestMicAccess, user]
  );

  // Listen to Peers in the active room
  useEffect(() => {
    if (!activeRoom || !user || !isConnected) return;

    const peersCol = collection(db, 'voice_rooms', activeRoom.id, 'peers');
    const unsubPeers = onSnapshot(peersCol, (snapshot) => {
      const currentPeers: VoicePeer[] = [];
      const currentPeerIds = new Set<string>();

      snapshot.forEach((d) => {
        const peer = d.data() as VoicePeer;
        currentPeers.push({ ...peer, id: d.id });
        currentPeerIds.add(d.id);
      });

      setPeers(currentPeers);

      // Clean up connections for peers who left
      peerConnectionsRef.current.forEach((_, peerId) => {
        if (!currentPeerIds.has(peerId)) {
          closePeerConnection(peerId);
        }
      });

      // Initiate WebRTC connection to remote peers
      currentPeers.forEach(async (remotePeer) => {
        if (remotePeer.id === user.uid) return;

        // Deterministic offer initiator: smaller user.uid initiates the call
        if (user.uid < remotePeer.id && !peerConnectionsRef.current.has(remotePeer.id)) {
          const pc = getOrCreatePeerConnection(remotePeer.id, activeRoom.id);
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false,
            });
            await pc.setLocalDescription(offer);

            const signal: WebRTCSignal = {
              from: user.uid,
              to: remotePeer.id,
              type: 'offer',
              payload: JSON.stringify(offer),
              createdAt: Date.now(),
            };
            await addDoc(collection(db, 'voice_rooms', activeRoom.id, 'signals'), signal);
          } catch (e) {
            console.warn('Error creating WebRTC offer:', e);
          }
        }
      });
    });

    return () => {
      unsubPeers();
    };
  }, [activeRoom, isConnected, user, closePeerConnection, getOrCreatePeerConnection]);

  // Listen to incoming WebRTC Signals targeted at this user
  useEffect(() => {
    if (!activeRoom || !user || !isConnected) return;

    const signalsCol = collection(db, 'voice_rooms', activeRoom.id, 'signals');
    const signalsQuery = query(signalsCol, where('to', '==', user.uid));

    const unsubSignals = onSnapshot(signalsQuery, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const signalDoc = change.doc;
          const signalId = signalDoc.id;

          if (processedSignalsRef.current.has(signalId)) return;
          processedSignalsRef.current.add(signalId);

          const signal = signalDoc.data() as WebRTCSignal;
          const remotePeerId = signal.from;

          const pc = getOrCreatePeerConnection(remotePeerId, activeRoom.id);

          try {
            if (signal.type === 'offer') {
              const offerDesc: RTCSessionDescriptionInit = JSON.parse(signal.payload);
              await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              const answerSignal: WebRTCSignal = {
                from: user.uid,
                to: remotePeerId,
                type: 'answer',
                payload: JSON.stringify(answer),
                createdAt: Date.now(),
              };
              await addDoc(collection(db, 'voice_rooms', activeRoom.id, 'signals'), answerSignal);
            } else if (signal.type === 'answer') {
              const answerDesc: RTCSessionDescriptionInit = JSON.parse(signal.payload);
              if (pc.signalingState !== 'stable') {
                await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
              }
            } else if (signal.type === 'candidate') {
              const candidateInit: RTCIceCandidateInit = JSON.parse(signal.payload);
              await pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch(console.warn);
            }

            // Delete processed signal to prevent collection growth
            deleteDoc(signalDoc.ref).catch(() => {});
          } catch (err) {
            console.warn('Error processing WebRTC signal:', err);
          }
        }
      });
    });

    return () => {
      unsubSignals();
    };
  }, [activeRoom, isConnected, user, getOrCreatePeerConnection]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    if (nextMuted) {
      playMuteSound();
    } else {
      playUnmuteSound();
    }

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (activeRoom && user) {
      updateDoc(doc(db, 'voice_rooms', activeRoom.id, 'peers', user.uid), {
        isMuted: nextMuted,
      }).catch(console.warn);
    }
  }, [activeRoom, isMuted, user]);

  // Toggle Deafen (Mutes all incoming audio & mic)
  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    isDeafenedRef.current = nextDeafened;

    // When deafened, mute all remote audios
    remoteAudiosRef.current.forEach((audio) => {
      audio.muted = nextDeafened;
    });

    // If deafened, automatically mute local mic as well
    if (nextDeafened && !isMutedRef.current) {
      toggleMute();
    }

    if (nextDeafened) {
      playMuteSound();
    } else {
      playUnmuteSound();
    }

    if (activeRoom && user) {
      updateDoc(doc(db, 'voice_rooms', activeRoom.id, 'peers', user.uid), {
        isDeafened: nextDeafened,
      }).catch(console.warn);
    }
  }, [activeRoom, isDeafened, toggleMute, user]);

  // Handle page unload / close tab
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeRoomRef.current && user) {
        deleteDoc(doc(db, 'voice_rooms', activeRoomRef.current.id, 'peers', user.uid)).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user]);

  return (
    <VoiceChatContext.Provider
      value={{
        activeRoom,
        isConnecting,
        isConnected,
        connectionError,
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
        openRoomModal,
        setOpenRoomModal,
        hasMicPermission,
        requestMicAccess,
      }}
    >
      {children}
    </VoiceChatContext.Provider>
  );
}

export function useVoiceChat() {
  const context = useContext(VoiceChatContext);
  if (!context) {
    throw new Error('useVoiceChat must be used within a VoiceChatProvider');
  }
  return context;
}
