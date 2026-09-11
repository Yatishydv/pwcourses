"use client";

import { useEffect, useLayoutEffect, useState, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import styles from './dashboard.module.css';

interface User {
  id: string;
  username: string;
}

interface Conversation {
  id: string;
  members: { user: User }[];
}

interface Reaction {
  id: string;
  userId: string;
  emoji: string;
}

interface Message {
  id: string;
  conversationId: string;
  content: string;
  senderId: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
  replyToId?: string;
  replyTo?: Message;
  reactions?: Reaction[];
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
}

interface SharedFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  senderId: string;
  createdAt: string;
}

interface FriendRequest {
  id: string;
  requester: {
    id: string;
    username: string;
  };
}

const EMOJI_CATEGORIES: Record<string, string[]> = {
  '😀 Smileys': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪','🤤','😴','🥳','🤩','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤬','🤯','😰','😥','😱','🥶','🥵','😈','👿','💀','☠️','💩','🤡','👹','👺'],
  '👋 Hands': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪'],
  '❤️ Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','❤️‍🔥','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','👁️‍🗨️','🗨️','🗯️','💭'],
  '🐱 Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪲'],
  '🍕 Food': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🌶️','🫑','🥒','🥬','🧅','🍄','🌽','🥕','🧄','🥔','🍞','🥐','🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🧈','🍰','🎂','🍩','🍪','🍫','🍬','🍭'],
  '⚽ Sports': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏑','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤸','🤺','🏌️','🏄','🏊','🚣'],
  '🚗 Travel': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛺','🚁','✈️','🛩️','🚀','🛸','🚢','⛵','🛥️','🚂','🚇','🚆','🚊','🚉','🏠','🏡','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕'],
  '💡 Objects': ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','📡','🔋','🔌','💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷'],
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function Dashboard() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatAuthTokens, setChatAuthTokens] = useState<Record<string, string>>({});
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatPinInput, setChatPinInput] = useState('');
  const [chatError, setChatError] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [seenMessageId, setSeenMessageId] = useState<string | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const isNearBottomRef = useRef(true);
  
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [friendReqMsg, setFriendReqMsg] = useState('');
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [newChatFriendId, setNewChatFriendId] = useState<string | null>(null);
  const [newChatPin, setNewChatPin] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  
  // File attachments
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Files tab
  const [activeTab, setActiveTab] = useState<'conversation' | 'files'>('conversation');
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  
  // Call state
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'active'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [callDuration, setCallDuration] = useState(0);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchMe();
    fetchConversations();
    
    // Load theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') setIsDarkMode(true);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!sessionToken) return;

    socketRef.current = io({
      withCredentials: true,
      auth: { token: sessionToken }
    });

    socketRef.current.on('new_message', (payload: any) => {
      setMessages((prev) => {
        if (prev.find(m => m.id === payload.id)) return prev;
        if (payload.clientMsgId) {
          const tempIdx = prev.findIndex(m => m.id === payload.clientMsgId);
          if (tempIdx !== -1) {
            const next = [...prev];
            next[tempIdx] = payload;
            return next;
          }
        }
        return [...prev, payload];
      });
      if (activeChatId && payload.conversationId === activeChatId && payload.senderId !== me?.id) {
        socketRef.current?.emit('mark_read', { conversationId: activeChatId, messageIds: [payload.id] });
      }
    });

    socketRef.current.on('typing_start', ({ userId, conversationId }: any) => {
      if (conversationId === activeChatId) {
        setTypingUsers(prev => new Set(prev).add(userId));
      }
    });

    socketRef.current.on('typing_stop', ({ userId, conversationId }: any) => {
      if (conversationId === activeChatId) {
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    });

    socketRef.current.on('reaction_added', ({ messageId, reaction }: any) => {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const reactions = m.reactions || [];
          return { ...m, reactions: [...reactions.filter(r => r.userId !== reaction.userId || r.emoji !== reaction.emoji), reaction] };
        }
        return m;
      }));
    });

    socketRef.current.on('reaction_removed', ({ messageId, userId, emoji }: any) => {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const reactions = m.reactions || [];
          return { ...m, reactions: reactions.filter(r => r.userId !== userId || r.emoji !== emoji) };
        }
        return m;
      }));
    });

    socketRef.current.on('messages_read', ({ messageIds, readAt }: any) => {
      setMessages(prev => prev.map(m => {
        if (messageIds.includes(m.id)) {
          return { ...m, read: true, readAt: readAt || new Date().toISOString() };
        }
        return m;
      }));
    });

    socketRef.current.on('message_edited', ({ messageId, content }: any) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content } : m));
    });

    socketRef.current.on('message_deleted', ({ messageId }: any) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    });

    // Auto-deletion: server permanently deleted messages after 48h
    socketRef.current.on('messages_auto_deleted', ({ messageIds }: any) => {
      setMessages(prev => prev.filter(m => !messageIds.includes(m.id)));
    });

    // WebRTC Call signaling
    socketRef.current.on('call_offer', async ({ conversationId, offer, callType: ct, callerId }: any) => {
      if (conversationId === activeChatId) {
        setCallState('incoming');
        setCallType(ct);
        // Store the offer for when user accepts
        peerConnectionRef.current = createPeerConnection();
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      }
    });

    socketRef.current.on('call_answer', async ({ answer }: any) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState('active');
        startCallTimer();
      }
    });

    socketRef.current.on('ice_candidate', async ({ candidate }: any) => {
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    });

    socketRef.current.on('call_end', () => {
      endCall(false);
    });

    socketRef.current.on('call_reject', () => {
      endCall(false);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [sessionToken, activeChatId, me?.id]);

  useEffect(() => {
    if (!activeChatId || !chatAuthTokens[activeChatId]) return;
    fetchMessages(activeChatId, chatAuthTokens[activeChatId]);
  }, [activeChatId, chatAuthTokens]);

  useLayoutEffect(() => {
    if (messages.length === 0) return;

    if (isInitialLoad) {
      // First load: Instant jump to unread divider or bottom
      const unreadEl = document.getElementById('unread-divider');
      if (unreadEl) {
        unreadEl.scrollIntoView({ behavior: 'auto', block: 'center' });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      // Use setTimeout to ensure the browser has painted the jump before allowing smooth scrolls
      setTimeout(() => {
        setIsInitialLoad(false);
      }, 50);
      return;
    }

    // Subsequent updates (e.g. new message arrives)
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.senderId === me?.id) {
        // If I sent the message, always scroll to bottom
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        isNearBottomRef.current = true;
      } else if (lastMsg && lastMsg.senderId !== me?.id) {
        // If I received a message while scrolled up, show badge
        setHasNewMessage(true);
      }
    }
  }, [messages, isInitialLoad]);

  // === WebRTC Helpers ===
  const createPeerConnection = (): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && activeChatId) {
        socketRef.current?.emit('ice_candidate', {
          conversationId: activeChatId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    return pc;
  };

  const startCall = async (type: 'audio' | 'video') => {
    if (!activeChatId) return;
    try {
      setCallType(type);
      setCallState('calling');

      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video'
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('call_offer', {
        conversationId: activeChatId,
        offer,
        callType: type
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      setCallState('idle');
    }
  };

  const acceptCall = async () => {
    if (!peerConnectionRef.current || !activeChatId) return;
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: callType === 'video'
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach(track => peerConnectionRef.current!.addTrack(track, stream));

      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      socketRef.current?.emit('call_answer', {
        conversationId: activeChatId,
        answer
      });

      setCallState('active');
      startCallTimer();
    } catch (err) {
      console.error('Failed to accept call:', err);
      rejectCall();
    }
  };

  const rejectCall = () => {
    if (activeChatId) {
      socketRef.current?.emit('call_reject', { conversationId: activeChatId });
    }
    endCall(false);
  };

  const endCall = (notify = true) => {
    if (notify && activeChatId) {
      socketRef.current?.emit('call_end', { conversationId: activeChatId });
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setCallState('idle');
    setCallDuration(0);
  };

  const startCallTimer = () => {
    setCallDuration(0);
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const formatCallDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // === File Upload ===
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChatId) return;

    const token = chatAuthTokens[activeChatId];
    if (!token) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/chats/${activeChatId}/messages/upload`, {
        method: 'POST',
        headers: { 'x-chat-auth': token },
        credentials: 'include',
        body: formData
      });

      if (!res.ok) {
        console.error('File upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // === Fetch Files ===
  const fetchSharedFiles = async () => {
    if (!activeChatId) return;
    const token = chatAuthTokens[activeChatId];
    if (!token) return;

    const res = await fetch(`/api/chats/${activeChatId}/messages/files`, {
      headers: { 'x-chat-auth': token },
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      setSharedFiles(data.files);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    isNearBottomRef.current = nearBottom;
    if (nearBottom && hasNewMessage) setHasNewMessage(false);
  };

  const fetchMe = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error('Not logged in');
      const data = await res.json();
      setMe(data.user);
      setSessionToken(data.token);
    } catch {
      router.push('/lock');
    }
  };

  const fetchConversations = async () => {
    const res = await fetch('/api/chats', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
    }
  };

  const fetchPendingRequests = async () => {
    const res = await fetch('/api/friends/pending', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setPendingRequests(data.requests);
    }
  };

  const fetchFriends = async () => {
    const res = await fetch('/api/friends', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setFriends(data.friends);
    }
  };

  const handleSendFriendRequest = async (e: FormEvent) => {
    e.preventDefault();
    setFriendReqMsg('');
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: searchUsername })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFriendReqMsg('Request sent successfully!');
      setSearchUsername('');
    } catch (err: any) {
      setFriendReqMsg(err.message);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await fetch(`/api/friends/accept/${requestId}`, {
        method: 'POST',
        credentials: 'include'
      });
      fetchPendingRequests();
      fetchConversations();
    } catch (err) {
      console.error(err);
    }
  };

  const openFriendsModal = () => {
    fetchPendingRequests();
    fetchFriends();
    setShowFriendsModal(true);
    setFriendReqMsg('');
  };

  const handleStartChat = async (friendId: string) => {
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ friendId, chatPin: newChatPin })
      });
      if (res.ok) {
        const data = await res.json();
        setNewChatFriendId(null);
        setNewChatPin('');
        setShowFriendsModal(false);
        await fetchConversations();
        if (data.conversationId) {
          setActiveChatId(data.conversationId);
          setChatPinInput('');
          setChatError('');
          setMessages([]);
        }
      } else {
        const data = await res.json();
        setFriendReqMsg(data.error || 'Failed to start chat');
      }
    } catch (err: any) {
      setFriendReqMsg(err.message);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/lock');
  };

  const handleChatSelect = (convId: string) => {
    setActiveChatId(convId);
    setChatPinInput('');
    setChatError('');
    setMessages([]);
    setReplyToMessage(null);
    setTypingUsers(new Set());
    isNearBottomRef.current = true;
    setHasNewMessage(false);
    setIsInitialLoad(true);
    setFirstUnreadMessageId(null);
    setActiveTab('conversation');
    
    if (chatAuthTokens[convId]) {
      fetchMessages(convId, chatAuthTokens[convId]);
      socketRef.current?.emit('join_chat', { conversationId: convId, chatAuthToken: chatAuthTokens[convId] });
    }
  };

  const handleUnlockChat = async (e: FormEvent) => {
    e.preventDefault();
    if (isUnlocking) return;
    setChatError('');
    if (!activeChatId) return;

    setIsUnlocking(true);
    try {
      const res = await fetch(`/api/chats/${activeChatId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chatPin: chatPinInput })
      });

      if (!res.ok) throw new Error('Invalid Chat PIN');
      const data = await res.json();
      
      const token = data.chatAuthToken;
      setChatAuthTokens(prev => ({ ...prev, [activeChatId]: token }));
      
      socketRef.current?.emit('join_chat', { conversationId: activeChatId, chatAuthToken: token });
      fetchMessages(activeChatId, token);
    } catch (err: any) {
      setChatError(err.message);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLockChat = async () => {
    if (!activeChatId) return;
    const token = chatAuthTokens[activeChatId];
    if (token) {
      await fetch(`/api/chats/${activeChatId}/lock`, {
        method: 'POST',
        headers: { 'x-chat-auth': token },
        credentials: 'include'
      });
      socketRef.current?.emit('leave_chat', { conversationId: activeChatId });
    }
    
    setChatAuthTokens(prev => {
      const next = { ...prev };
      delete next[activeChatId];
      return next;
    });
    setActiveChatId(null);
    setMessages([]);
  };

  const handleClearHistory = async () => {
    if (!activeChatId) return;
    const confirm = window.confirm("Are you sure you want to clear this chat history? The contact will remain.");
    if (!confirm) return;

    const token = chatAuthTokens[activeChatId];
    if (!token) return;

    setMessages([]);
    
    try {
      await fetch(`/api/chats/${activeChatId}/history`, {
        method: 'DELETE',
        headers: { 'x-chat-auth': token },
        credentials: 'include'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (convId: string, token: string) => {
    const res = await fetch(`/api/chats/${convId}/messages`, {
      headers: { 'x-chat-auth': token },
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      
      let firstUnreadId = null;
      for (const msg of data.messages) {
        if (!msg.read && msg.senderId !== me?.id) {
          firstUnreadId = msg.id;
          break; // First chronological unread message
        }
      }
      setFirstUnreadMessageId(firstUnreadId);
      setMessages(data.messages);
      
      const unreadIds = data.messages
        .filter((m: Message) => !m.read && m.senderId !== me?.id)
        .map((m: Message) => m.id);
        
      if (unreadIds.length > 0) {
        socketRef.current?.emit('mark_read', { conversationId: convId, messageIds: unreadIds });
      }
    } else {
      setChatAuthTokens(prev => {
        const next = { ...prev };
        delete next[convId];
        return next;
      });
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    if (!activeChatId || !messageInput.trim()) return;

    const token = chatAuthTokens[activeChatId];
    if (!token) return;

    if (editingMessage) {
      const content = messageInput;
      const messageId = editingMessage.id;
      
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content } : m));
      setMessageInput('');
      setEditingMessage(null);
      setIsTyping(false);
      socketRef.current?.emit('typing_stop', { conversationId: activeChatId });

      try {
        await fetch(`/api/chats/${activeChatId}/messages/${messageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-chat-auth': token },
          credentials: 'include',
          body: JSON.stringify({ content })
        });
      } catch (err) {
        console.error(err);
      } finally {
        setIsSending(false);
      }
      return;
    }

    setIsSending(true);
    const content = messageInput;
    const replyId = replyToMessage?.id;
    
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content,
      senderId: me?.id || '',
      conversationId: activeChatId,
      createdAt: new Date().toISOString(),
      read: false,
      replyTo: replyToMessage || undefined,
      reactions: []
    };
    
    setMessages(prev => [...prev, tempMessage]);
    setMessageInput('');
    setReplyToMessage(null);
    setShowEmojiPicker(false);
    socketRef.current?.emit('typing_stop', { conversationId: activeChatId });
    setIsTyping(false);

    try {
      const res = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-chat-auth': token 
        },
        credentials: 'include',
        body: JSON.stringify({ content, replyToId: replyId, clientMsgId: tempId })
      });
      const data = await res.json();
      
      if (res.ok && data.message) {
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    
    if (!isTyping) {
      setIsTyping(true);
      socketRef.current?.emit('typing_start', { conversationId: activeChatId });
    }
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit('typing_stop', { conversationId: activeChatId });
    }, 2000);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeChatId) return;
    const token = chatAuthTokens[activeChatId];
    if (!token) return;

    setMessages(prev => prev.filter(m => m.id !== messageId));
    
    try {
      await fetch(`/api/chats/${activeChatId}/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'x-chat-auth': token },
        credentials: 'include'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const startEditing = (msg: Message) => {
    setEditingMessage(msg);
    setMessageInput(msg.content);
    setReplyToMessage(null);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    if (!activeChatId || !me) return;

    setMessages(prev => prev.map(m => {
      if (m.id === messageId) {
        const reactions = m.reactions || [];
        const existing = reactions.find(r => r.userId === me.id && r.emoji === emoji);
        
        if (existing) {
          return { ...m, reactions: reactions.filter(r => r.id !== existing.id) };
        } else {
          // @ts-ignore
          const newReaction: Reaction = { id: `temp-${Date.now()}`, messageId, userId: me.id, emoji };
          return { ...m, reactions: [...reactions, newReaction] };
        }
      }
      return m;
    }));

    socketRef.current?.emit('react_message', { conversationId: activeChatId, messageId, emoji });
  };

  const renderDateSeparator = (dateStr: string) => {
    const msgDate = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let display = msgDate.toLocaleDateString();
    if (msgDate.toDateString() === today.toDateString()) display = 'Today';
    else if (msgDate.toDateString() === yesterday.toDateString()) display = 'Yesterday';

    return <div className={styles.dateSeparator}>{display}</div>;
  };

  const renderFileContent = (msg: Message) => {
    if (!msg.fileUrl) return null;
    const url = msg.fileUrl;
    const type = msg.fileType || '';
    const name = msg.fileName || 'File';
    const size = msg.fileSize ? formatFileSize(msg.fileSize) : '';

    if (type.startsWith('image/')) {
      return (
        <div style={{ marginBottom: 6 }}>
          <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, cursor: 'pointer' }} onClick={() => window.open(url, '_blank')} />
        </div>
      );
    }
    if (type.startsWith('video/')) {
      return (
        <div style={{ marginBottom: 6 }}>
          <video src={url} controls style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }} />
        </div>
      );
    }
    if (type.startsWith('audio/')) {
      return (
        <div style={{ marginBottom: 6 }}>
          <audio src={url} controls style={{ width: '100%' }} />
        </div>
      );
    }
    // Generic file
    return (
      <a href={url} download={name} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: 8, textDecoration: 'none', color: 'inherit', marginBottom: 6 }}>
        <span style={{ fontSize: '1.5rem' }}>📄</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{name}</div>
          {size && <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{size}</div>}
        </div>
      </a>
    );
  };

  const activeConv = conversations.find(c => c.id === activeChatId);
  const activeFriend = activeConv?.members[0]?.user;
  const isChatUnlocked = activeChatId && chatAuthTokens[activeChatId];

  const filteredConversations = searchFilter
    ? conversations.filter(c => c.members[0]?.user?.username?.toLowerCase().includes(searchFilter.toLowerCase()))
    : conversations;

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.profileSection}>
            <div className={styles.avatar}>{me?.username?.[0]?.toUpperCase()}</div>
            <div className={styles.username}>{me?.username}</div>
          </div>
          <div className={styles.actions}>
            <button className={styles.iconButton} onClick={() => setIsDarkMode(!isDarkMode)} title="Toggle Theme">
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            <button className={styles.iconButton} onClick={openFriendsModal} title="Add Friends">➕</button>
            <button className={styles.iconButton} onClick={handleLogout} title="Lock Account">🔒</button>
          </div>
        </div>
        
        <div className={styles.searchContainer}>
          <input 
            type="text" 
            className={styles.searchInput} 
            placeholder="Search conversations..." 
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
          />
        </div>
        
        <div className={styles.chatList}>
          {filteredConversations.map(conv => {
            const friend = conv.members[0]?.user;
            const isUnlocked = chatAuthTokens[conv.id];
            
            return (
              <div 
                key={conv.id} 
                className={`${styles.chatItem} ${activeChatId === conv.id ? styles.active : ''}`}
                onClick={() => handleChatSelect(conv.id)}
              >
                <div className={styles.avatar}>{friend?.username?.[0]?.toUpperCase()}</div>
                <div className={styles.chatInfo}>
                  <div className={styles.chatName}>{friend?.username}</div>
                  <div className={styles.chatPreview}>
                    {isUnlocked ? "Tap to view conversation" : "🔒 Protected"}
                  </div>
                </div>
                <div className={styles.chatMeta}>
                  <div className={styles.chatTime}>now</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.mainArea}>
        {!activeChatId ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: '4rem', opacity: 0.5 }}>💬</div>
            <h2>PW Chat Web</h2>
            <p>Select a conversation to start messaging seamlessly.</p>
          </div>
        ) : !isChatUnlocked ? (
          <div className={styles.chatLockOverlay}>
            <form onSubmit={handleUnlockChat} className={styles.lockCard}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
              <h2>CHAT LOCKED</h2>
              <p>Enter the Chat PIN for your conversation with {activeFriend?.username}</p>
              
              <input 
                type="password"
                className={styles.lockInput}
                placeholder="••••••"
                maxLength={6}
                value={chatPinInput}
                onChange={(e) => setChatPinInput(e.target.value)}
              />
              {chatError && <div style={{ color: '#e32b2b' }}>{chatError}</div>}
              
              <button type="submit" className={styles.unlockButton} disabled={isUnlocking}>
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.chatView}>
            <div className={styles.chatHeader}>
              <div className={styles.headerProfile}>
                <div className={styles.headerAvatar}>{activeFriend?.username?.[0]?.toUpperCase()}</div>
                <div>
                  <div className={styles.headerName}>{activeFriend?.username}</div>
                </div>
              </div>
              
              <div className={styles.headerTabs}>
                <div 
                  className={`${styles.headerTab} ${activeTab === 'conversation' ? styles.active : ''}`}
                  onClick={() => setActiveTab('conversation')}
                >Conversation</div>
                <div 
                  className={`${styles.headerTab} ${activeTab === 'files' ? styles.active : ''}`}
                  onClick={() => { setActiveTab('files'); fetchSharedFiles(); }}
                >Files</div>
              </div>
              
              <div className={styles.headerActions}>
                <button title="Audio Call" onClick={() => startCall('audio')}>📞</button>
                <button title="Video Call" onClick={() => startCall('video')}>📹</button>
                <button title="Clear Chat History" onClick={handleClearHistory}>🗑️</button>
                <button title="Lock Chat" onClick={handleLockChat}>🔒</button>
              </div>
            </div>

            {/* Call UI Overlay */}
            {callState !== 'idle' && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 50,
                background: 'rgba(0,0,0,0.9)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: 'white', gap: 20
              }}>
                {callType === 'video' && (
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <video ref={localVideoRef} autoPlay playsInline muted style={{ position: 'absolute', bottom: 20, right: 20, width: 150, height: 112, borderRadius: 12, objectFit: 'cover', border: '2px solid white' }} />
                  </div>
                )}
                {callType === 'audio' && (
                  <>
                    <div style={{ fontSize: '4rem' }}>📞</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{activeFriend?.username}</div>
                    <audio ref={remoteVideoRef as any} autoPlay />
                  </>
                )}
                
                {callState === 'calling' && <div style={{ fontSize: '1rem', opacity: 0.7 }}>Calling...</div>}
                {callState === 'incoming' && <div style={{ fontSize: '1rem', opacity: 0.7 }}>Incoming {callType} call...</div>}
                {callState === 'active' && <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatCallDuration(callDuration)}</div>}

                <div style={{ display: 'flex', gap: 16 }}>
                  {callState === 'incoming' && (
                    <button onClick={acceptCall} style={{ background: '#10b981', color: 'white', border: 'none', padding: '16px 32px', borderRadius: 999, fontSize: '1.2rem', cursor: 'pointer' }}>
                      ✓ Accept
                    </button>
                  )}
                  <button onClick={() => endCall(true)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '16px 32px', borderRadius: 999, fontSize: '1.2rem', cursor: 'pointer' }}>
                    ✕ End
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'files' ? (
              <div className={styles.messagesArea}>
                {sharedFiles.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div style={{ fontSize: '3rem', opacity: 0.5 }}>📁</div>
                    <p>No files shared yet</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sharedFiles.map(f => (
                      <a key={f.id} href={f.fileUrl} download={f.fileName} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 12, textDecoration: 'none', color: 'var(--text-primary)' }}>
                        <span style={{ fontSize: '1.5rem' }}>
                          {f.fileType?.startsWith('image/') ? '🖼️' : f.fileType?.startsWith('video/') ? '🎬' : f.fileType?.startsWith('audio/') ? '🎵' : '📄'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.fileName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {formatFileSize(f.fileSize)} · {new Date(f.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className={styles.messagesArea} onScroll={handleScroll} style={{ opacity: isInitialLoad ? 0 : 1, transition: 'opacity 0.2s' }}>
                  {messages.map((msg, i) => {
                    const prevMsg = messages[i - 1];
                    const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
                    const isHovered = hoveredMessageId === msg.id;
                    const isFirstUnread = msg.id === firstUnreadMessageId;

                    return (
                      <div 
                        key={msg.id} 
                        style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
                      >
                        {showDate && renderDateSeparator(msg.createdAt)}
                        
                        {isFirstUnread && (
                          <div id="unread-divider" style={{ display: 'flex', alignItems: 'center', margin: '16px 0' }}>
                            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(59, 130, 246, 0.3)' }}></div>
                            <span style={{ padding: '0 12px', fontSize: '0.75rem', fontWeight: 600, color: '#3b82f6', letterSpacing: 1 }}>UNREAD MESSAGES</span>
                            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(59, 130, 246, 0.3)' }}></div>
                          </div>
                        )}
                        
                        <div 
                          className={`${styles.messageWrapper} ${msg.senderId === me?.id ? styles.sent : styles.received} ${isHovered ? styles.forceHover : ''}`}
                          onMouseEnter={() => setHoveredMessageId(msg.id)}
                          onMouseLeave={() => setHoveredMessageId(null)}
                        >
                          <div className={styles.messageBubble}>
                            {msg.replyTo && (
                              <div className={styles.messageReplyBox} onClick={() => {}}>
                                <strong>{msg.replyTo.senderId === me?.id ? 'You' : activeFriend?.username}</strong>
                                <div>{msg.replyTo.content.substring(0, 50)}...</div>
                              </div>
                            )}

                            {renderFileContent(msg)}
                            
                            {(!msg.fileUrl || msg.content !== `📎 ${msg.fileName}`) && (
                              <div className={styles.messageContent}>{msg.content}</div>
                            )}
                            
                            <div className={styles.messageMeta}>
                              <span className={styles.messageTime}>
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {msg.senderId === me?.id && (
                                <span 
                                  className={`${styles.readReceipt} ${msg.read ? styles.read : ''}`}
                                  onClick={() => msg.read && msg.readAt ? setSeenMessageId(seenMessageId === msg.id ? null : msg.id) : null}
                                  style={{ cursor: msg.read ? 'pointer' : 'default' }}
                                >
                                  {msg.read ? '✓✓' : '✓'}
                                </span>
                              )}
                              {seenMessageId === msg.id && msg.readAt && (
                                <span className={styles.seenAtText}>
                                  Seen {new Date(msg.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(msg.readAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>

                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className={styles.reactionsContainer}>
                              {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => (
                                <span 
                                  key={emoji} 
                                  onClick={() => handleReaction(msg.id, emoji)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {emoji}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className={styles.messageActions}>
                            <button className={styles.actionBtn} onClick={() => setReplyToMessage(msg)}>↩️</button>
                            <button className={styles.actionBtn} onClick={() => handleReaction(msg.id, '👍')}>👍</button>
                            <button className={styles.actionBtn} onClick={() => handleReaction(msg.id, '❤️')}>❤️</button>
                            <button className={styles.actionBtn} onClick={() => handleReaction(msg.id, '❤️‍🔥')}>❤️‍🔥</button>
                            <button className={styles.actionBtn} onClick={() => handleReaction(msg.id, '💖')}>💖</button>
                            <button className={styles.actionBtn} onClick={() => handleReaction(msg.id, '😂')}>😂</button>
                            {msg.senderId === me?.id && (
                              <>
                                <button className={styles.actionBtn} onClick={() => startEditing(msg)}>✏️</button>
                                <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDeleteMessage(msg.id)}>🗑️</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {typingUsers.size > 0 && (
                    <div className={`${styles.messageWrapper} ${styles.received}`}>
                      <div className={styles.messageBubble} style={{ minWidth: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                        <div className={styles.typingIndicator}><span></span><span></span><span></span></div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                  
                  {hasNewMessage && (
                    <div 
                      className={styles.newMessageBadge} 
                      onClick={() => {
                        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                        setHasNewMessage(false);
                      }}
                    >
                      New Message ↓
                    </div>
                  )}
                </div>
                
                <div className={styles.inputContainer}>
                  {replyToMessage && (
                    <div className={styles.replyPreviewBar}>
                      <div>
                        <strong>Replying to {replyToMessage.senderId === me?.id ? 'Yourself' : activeFriend?.username}</strong>
                        <div style={{ fontSize: '0.8rem', color: '#667781' }}>{replyToMessage.content.substring(0, 100)}</div>
                      </div>
                      <button className={styles.closeReply} onClick={() => setReplyToMessage(null)}>✕</button>
                    </div>
                  )}
                  {editingMessage && (
                    <div className={styles.replyPreviewBar}>
                      <div>
                        <strong>Editing Message</strong>
                        <div style={{ fontSize: '0.8rem', color: '#667781' }}>{editingMessage.content.substring(0, 100)}</div>
                      </div>
                      <button className={styles.closeReply} onClick={() => {
                        setEditingMessage(null);
                        setMessageInput('');
                      }}>✕</button>
                    </div>
                  )}
                  
                  <form onSubmit={handleSendMessage} className={styles.inputWrapper}>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }} 
                      onChange={handleFileSelect}
                    />
                    <button 
                      type="button" 
                      className={styles.attachmentBtn} 
                      onClick={() => fileInputRef.current?.click()} 
                      title="Attach File"
                      disabled={isUploading}
                    >
                      {isUploading ? '⏳' : '📎'}
                    </button>
                    <input 
                      type="text" 
                      className={styles.messageInput} 
                      placeholder={editingMessage ? "Edit your message..." : "Type a message..."}
                      value={messageInput}
                      onChange={handleInputChange}
                    />
                    <button type="button" style={{background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', padding: '0 8px'}} onClick={() => setShowEmojiPicker(!showEmojiPicker)}>😀</button>
                    <button type="submit" className={styles.sendButton} title={editingMessage ? "Save Edit" : "Send Message"}>
                      {editingMessage ? "✓" : "➤"}
                    </button>
                  </form>
                  
                  {showEmojiPicker && (
                    <div className={styles.emojiPickerContainer}>
                      <div className={styles.emojiCategories}>
                        {Object.keys(EMOJI_CATEGORIES).map(cat => (
                          <button key={cat} type="button" onClick={() => {
                            const el = document.getElementById(`cat-${cat.replace(/\s/g, '_')}`);
                            el?.scrollIntoView({ behavior: 'smooth' });
                          }}>{cat.split(' ')[0]}</button>
                        ))}
                      </div>
                      <div className={styles.emojiGrid}>
                        {Object.entries(EMOJI_CATEGORIES).map(([cat, emojis]) => (
                          <div key={cat} id={`cat-${cat.replace(/\s/g, '_')}`}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', padding: '8px 0 4px', position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
                              {cat}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                              {emojis.map((e, i) => (
                                <button key={`${cat}-${i}`} type="button" className={styles.emojiBtn} onClick={() => setMessageInput(prev => prev + e)}>
                                  {e}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showFriendsModal && (
        <div className={styles.modalOverlay} onClick={() => setShowFriendsModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Find Friends</h2>
              <button className={styles.closeButton} onClick={() => setShowFriendsModal(false)}>×</button>
            </div>
            
            <form onSubmit={handleSendFriendRequest} style={{ display: 'flex', flexDirection: 'column' }}>
              <input 
                type="text" 
                placeholder="Search username to add..." 
                className={styles.modalInput}
                value={searchUsername}
                onChange={e => setSearchUsername(e.target.value)}
              />
              <button type="submit" className={styles.modalButton}>Send Request</button>
              {friendReqMsg && <div style={{ color: '#e32b2b', fontSize: '0.875rem', marginTop: '5px' }}>{friendReqMsg}</div>}
            </form>

            {pendingRequests.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h3>Pending Requests</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {pendingRequests.map(req => (
                    <div key={req.id} className={styles.requestItem}>
                      <div>{req.requester.username}</div>
                      <button className={styles.acceptButton} onClick={() => handleAcceptRequest(req.id)}>Accept</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {friends.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h3>Your Friends</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {friends.map(friend => (
                    <div key={friend.id} className={styles.requestItem}>
                      <div>{friend.username}</div>
                      {newChatFriendId === friend.id ? (
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <input
                            type="password"
                            placeholder="PIN"
                            className={styles.modalInput}
                            style={{ width: '80px', marginBottom: 0 }}
                            value={newChatPin}
                            onChange={e => setNewChatPin(e.target.value)}
                            maxLength={6}
                          />
                          <button className={styles.acceptButton} onClick={() => handleStartChat(friend.id)}>Create</button>
                        </div>
                      ) : (
                        <button className={styles.acceptButton} onClick={() => setNewChatFriendId(friend.id)}>Start Chat</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
