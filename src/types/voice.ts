export type VoiceRoomCategory = 'case' | 'urgent' | 'tech' | 'general';

export interface VoiceRoom {
  id: string;
  name: string;
  description?: string;
  caseId?: string;
  category?: VoiceRoomCategory;
  createdById: string;
  createdByName: string;
  createdAt: number;
  isClosed?: boolean;
  participantCount?: number;
  updatedAt?: number;
}

export interface VoicePeer {
  id: string;          // user.uid
  userId: string;
  name: string;
  avatarEmoji?: string;
  role?: string;
  isMuted: boolean;
  isDeafened: boolean;
  joinedAt: number;
  lastPing: number;
  isSpeaking?: boolean;
  audioLevel?: number;
}

export interface WebRTCSignal {
  id?: string;
  from: string;        // sender userId
  to: string;          // recipient userId
  type: 'offer' | 'answer' | 'candidate';
  payload: string;     // JSON stringified RTCSessionDescriptionInit or RTCIceCandidateInit
  createdAt: number;
}
