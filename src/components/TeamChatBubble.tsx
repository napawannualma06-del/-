import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ChatMessage, UserProfile } from '../types';
import { useStore } from '../store/useStore';
import { AnimalAvatar } from './AnimalAvatar';
import { 
  MessageSquare, 
  X, 
  Send, 
  AtSign, 
  Smile, 
  ChevronDown, 
  Sparkles, 
  Users, 
  Minimize2,
  Bell
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { clsx } from 'clsx';

const QUICK_EMOJIS = ['👍', '👌', '🙏', '🎉', '❤️', '🔥', 'รับทราบครับ', 'รับทราบค่ะ'];

export const TeamChatBubble: React.FC = () => {
  const { user, registeredUsers } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSeenTimeRef = useRef<number>(Date.now());

  // Subscribe to real-time chat messages
  useEffect(() => {
    const q = query(
      collection(db, 'team_chats'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs: ChatMessage[] = [];
        snapshot.forEach((doc) => {
          msgs.push({ id: doc.id, ...doc.data() } as ChatMessage);
        });
        setMessages(msgs);

        // Calculate unread count if chat is closed
        if (!isOpen && msgs.length > 0) {
          const newMsgs = msgs.filter((m) => m.createdAt > lastSeenTimeRef.current && m.senderId !== user?.uid);
          setUnreadCount(newMsgs.length);
        }
      },
      (error) => {
        console.warn('Realtime team chat listener error:', error);
      }
    );

    return () => unsubscribe();
  }, [isOpen, user?.uid]);

  // Scroll to bottom when new message arrives and chat is open
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
      lastSeenTimeRef.current = Date.now();
    }
  }, [messages, isOpen]);

  // Filter teammates for mention autocomplete
  const mentionCandidates = registeredUsers.filter((u) => {
    if (!mentionFilter) return true;
    const q = mentionFilter.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    // Detect if cursor is after @
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const charAfterAt = textBeforeCursor.slice(lastAtPos + 1);
      // Check if there is no space between @ and cursor
      if (!charAfterAt.includes(' ') && !charAfterAt.includes('\n')) {
        setShowMentionList(true);
        setMentionFilter(charAfterAt);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentionList(false);
  };

  const handleSelectMention = (candidate: UserProfile) => {
    if (!inputRef.current) return;
    const cursor = inputRef.current.selectionStart;
    const textBeforeCursor = inputText.slice(0, cursor);
    const textAfterCursor = inputText.slice(cursor);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const newTextBefore = textBeforeCursor.slice(0, lastAtPos) + `@${candidate.name} `;
      setInputText(newTextBefore + textAfterCursor);
      setShowMentionList(false);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const nextCursor = newTextBefore.length;
          inputRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      }, 50);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Detect mentions in text: @Name or @username
    const mentions: string[] = [];
    registeredUsers.forEach((u) => {
      if (trimmed.includes(`@${u.name}`) || trimmed.includes(`@${u.username}`)) {
        mentions.push(u.username);
      }
    });

    const payload: Omit<ChatMessage, 'id'> = {
      senderId: user.uid,
      senderName: user.name,
      senderUsername: user.username,
      senderRole: user.role,
      senderAvatarEmoji: user.avatarEmoji,
      text: trimmed,
      mentions,
      createdAt: Date.now(),
    };

    setInputText('');
    setShowMentionList(false);
    setShowEmojiPicker(false);

    try {
      await addDoc(collection(db, 'team_chats'), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'team_chats');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionList && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionList(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Render message text with highlighted @mentions
  const renderMessageContent = (text: string) => {
    const parts = text.split(/(@[\wก-๙_]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const mentionTarget = part.slice(1);
        const isMe =
          user &&
          (mentionTarget.toLowerCase() === user.name.toLowerCase() ||
            mentionTarget.toLowerCase() === user.username.toLowerCase());
        return (
          <span
            key={i}
            className={clsx(
              "px-1 py-0.2 rounded font-bold inline-block mx-0.5",
              isMe
                ? "bg-amber-300 text-amber-950 ring-1 ring-amber-400 dark:bg-amber-400 dark:text-amber-950"
                : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300"
            )}
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <>
      {/* Floating Chat Bubble Toggle Button */}
      <div className="fixed bottom-5 right-5 z-40 select-none">
        {!isOpen && (
          <button
            id="open-team-chat-btn"
            type="button"
            onClick={() => {
              setIsOpen(true);
              setUnreadCount(0);
              lastSeenTimeRef.current = Date.now();
            }}
            className="relative flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-full shadow-lg shadow-indigo-600/30 active:scale-95 transition-all duration-200 cursor-pointer group"
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full animate-bounce shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-xs font-bold tracking-wide pr-1">แชททีมงาน</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>
        )}
      </div>

      {/* Floating Chat Box Window */}
      {isOpen && (
        <div 
          id="team-chat-box"
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 w-[calc(100vw-32px)] sm:w-[380px] h-[520px] max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        >
          {/* Chat Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-indigo-600"></span>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate flex items-center gap-1.5">
                  แชททีมงาน Thai Plus+
                </h3>
                <p className="text-[11px] text-indigo-100 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>{registeredUsers.length} สมาชิก • สามารถพิมพ์ @แท็กหาเพื่อนได้</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/15 rounded-lg transition text-indigo-100 hover:text-white cursor-pointer"
                title="ย่อขนาด"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/15 rounded-lg transition text-indigo-100 hover:text-white cursor-pointer"
                title="ปิดแชท"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-2 p-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  ยังไม่มีข้อความแชท
                </p>
                <p className="text-[11px]">
                  เริ่มพิมพ์ทักทายทีมงาน หรือใช้ <strong className="text-indigo-600 dark:text-indigo-400">@แท็กชื่อเพื่อน</strong> ได้เลย!
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderId === user?.uid;
                const isMentioned =
                  user &&
                  msg.mentions &&
                  msg.mentions.includes(user.username);

                return (
                  <div
                    key={msg.id}
                    className={clsx(
                      "flex items-start gap-2 text-xs",
                      isMe ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {!isMe && (
                      <div className="shrink-0 mt-0.5">
                        <AnimalAvatar
                          identifier={msg.senderId || msg.senderUsername}
                          name={msg.senderName}
                          avatarEmoji={msg.senderAvatarEmoji}
                          isAdmin={false}
                          size="xs"
                        />
                      </div>
                    )}

                    <div className={clsx("max-w-[78%] space-y-1", isMe ? "items-end" : "items-start")}>
                      {!isMe && (
                        <div className="flex items-center gap-1.5 px-0.5">
                          <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300">
                            {msg.senderName}
                          </span>
                        </div>
                      )}

                      <div
                        className={clsx(
                          "px-3 py-2 rounded-2xl break-words leading-relaxed text-xs shadow-2xs",
                          isMe
                            ? "bg-indigo-600 text-white rounded-tr-xs"
                            : isMentioned
                            ? "bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-slate-900 dark:text-white rounded-tl-xs"
                            : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200/80 dark:border-slate-700/80 rounded-tl-xs"
                        )}
                      >
                        {isMentioned && !isMe && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 mb-1 border-b border-amber-200 dark:border-amber-800 pb-0.5">
                            <Bell className="w-3 h-3" />
                            <span>แท็กถึงคุณ</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{renderMessageContent(msg.text)}</p>
                      </div>

                      <div
                        className={clsx(
                          "text-[9px] text-slate-400 px-1 font-mono flex items-center gap-1",
                          isMe ? "justify-end" : "justify-start"
                        )}
                      >
                        <span>{format(msg.createdAt, 'HH:mm น.', { locale: th })}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Autocomplete Mention Dropdown */}
          {showMentionList && mentionCandidates.length > 0 && (
            <div className="px-2 py-1.5 bg-white dark:bg-slate-850 border-t border-slate-200 dark:border-slate-700 max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 shadow-lg">
              <div className="text-[10px] text-slate-400 font-semibold px-2 py-0.5">
                เลือกสมาชิกที่ต้องการแท็ก:
              </div>
              {mentionCandidates.map((c, idx) => (
                <button
                  key={c.uid}
                  type="button"
                  onClick={() => handleSelectMention(c)}
                  className={clsx(
                    "w-full px-2 py-1.5 flex items-center space-x-2 rounded-lg text-xs text-left cursor-pointer transition",
                    idx === mentionIndex
                      ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  )}
                >
                  <AnimalAvatar
                    identifier={c.uid}
                    name={c.name}
                    avatarEmoji={c.avatarEmoji}
                    isAdmin={false}
                    size="xs"
                  />
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">@{c.username}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Quick Emoji / Preset Bar */}
          {showEmojiPicker && (
            <div className="p-2 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setInputText((prev) => prev + (prev.endsWith(' ') || !prev ? '' : ' ') + emoji);
                    setShowEmojiPicker(false);
                    inputRef.current?.focus();
                  }}
                  className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 rounded-lg shadow-2xs transition cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Input Form */}
          <div className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <button
                type="button"
                onClick={() => {
                  setInputText((prev) => prev + '@');
                  setShowMentionList(true);
                  setMentionFilter('');
                  inputRef.current?.focus();
                }}
                className="px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition flex items-center gap-0.5 cursor-pointer"
                title="แท็กเพื่อน"
              >
                <AtSign className="w-3 h-3 text-indigo-500" />
                <span>แท็ก</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition flex items-center gap-0.5 cursor-pointer"
              >
                <Smile className="w-3 h-3 text-amber-500" />
                <span>อีโมจิ</span>
              </button>

              <span className="text-[10px] text-slate-400 ml-auto">
                กด Enter เพื่อส่ง
              </span>
            </div>

            <form onSubmit={handleSendMessage} className="flex items-end gap-1.5">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์ข้อความ... หรือพิมพ์ @ เพื่อแท็กเพื่อน"
                rows={1}
                className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 resize-none max-h-20"
              />

              <button
                type="submit"
                disabled={!inputText.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl shadow-xs transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
                title="ส่งข้อความ"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
