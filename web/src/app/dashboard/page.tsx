"use client";

import { useEffect, useState, useRef, FormEvent } from 'react';
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
  replyToId?: string;
  replyTo?: Message;
  reactions?: Reaction[];
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

export default function Dashboard() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatAuthTokens, setChatAuthTokens] = useState<Record<string, string>>({});
  
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
  
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [friendReqMsg, setFriendReqMsg] = useState('');
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [newChatFriendId, setNewChatFriendId] = useState<string | null>(null);
  const [newChatPin, setNewChatPin] = useState('');
  
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

    socketRef.current.on('new_message', (msg: Message) => {
      setMessages((prev) => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Mark as read if active
      if (activeChatId && msg.conversationId === activeChatId && msg.senderId !== me?.id) {
        socketRef.current?.emit('mark_read', { conversationId: activeChatId, messageIds: [msg.id] });
      }
    });

    socketRef.current.on('typing_start', ({ userId, conversationId }) => {
      if (conversationId === activeChatId) {
        setTypingUsers(prev => new Set(prev).add(userId));
      }
    });

    socketRef.current.on('typing_stop', ({ userId, conversationId }) => {
      if (conversationId === activeChatId) {
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    });

    socketRef.current.on('reaction_added', ({ messageId, reaction }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const reactions = m.reactions || [];
          return { ...m, reactions: [...reactions.filter(r => r.userId !== reaction.userId || r.emoji !== reaction.emoji), reaction] };
        }
        return m;
      }));
    });

    socketRef.current.on('reaction_removed', ({ messageId, userId, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const reactions = m.reactions || [];
          return { ...m, reactions: reactions.filter(r => r.userId !== userId || r.emoji !== emoji) };
        }
        return m;
      }));
    });

    socketRef.current.on('messages_read', ({ messageIds }) => {
      setMessages(prev => prev.map(m => {
        if (messageIds.includes(m.id)) {
          return { ...m, read: true };
        }
        return m;
      }));
    });

    socketRef.current.on('message_edited', ({ messageId, content }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content } : m));
    });

    socketRef.current.on('message_deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [sessionToken, activeChatId, me?.id]);

  useEffect(() => {
    if (!activeChatId || !chatAuthTokens[activeChatId]) return;
    const interval = setInterval(() => {
      fetchMessages(activeChatId, chatAuthTokens[activeChatId]);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeChatId, chatAuthTokens]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        // Auto-select the new chat
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
    
    if (chatAuthTokens[convId]) {
      fetchMessages(convId, chatAuthTokens[convId]);
      socketRef.current?.emit('join_chat', { conversationId: convId, chatAuthToken: chatAuthTokens[convId] });
    }
  };

  const handleUnlockChat = async (e: FormEvent) => {
    e.preventDefault();
    setChatError('');
    if (!activeChatId) return;

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
      await fetchMessages(activeChatId, token);
    } catch (err: any) {
      setChatError(err.message);
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

  const fetchMessages = async (convId: string, token: string) => {
    const res = await fetch(`/api/chats/${convId}/messages`, {
      headers: { 'x-chat-auth': token },
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      
      // Mark unread messages as read
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
    if (!activeChatId || !messageInput.trim()) return;

    const token = chatAuthTokens[activeChatId];
    if (!token) return;

    if (editingMessage) {
      // Edit message logic
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
      }
      return;
    }

    const content = messageInput;
    const replyId = replyToMessage?.id;
    
    // Optimistic UI update
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
        body: JSON.stringify({ content, replyToId: replyId })
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

    // Optimistic delete
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

    // Optimistic UI update for instant feedback
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

  const activeConv = conversations.find(c => c.id === activeChatId);
  const activeFriend = activeConv?.members[0]?.user;
  const isChatUnlocked = activeChatId && chatAuthTokens[activeChatId];

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
          <input type="text" className={styles.searchInput} placeholder="Search" />
        </div>
        
        <div className={styles.chatList}>
          {conversations.map(conv => {
            const friend = conv.members[0]?.user;
            
            // Calculate unread
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
              
              <button type="submit" className={styles.unlockButton}>Unlock</button>
            </form>
          </div>
        ) : (
          <div className={styles.chatView}>
            <div className={styles.chatHeader}>
              <div className={styles.headerProfile}>
                <div className={styles.headerAvatar}>{activeFriend?.username?.[0]?.toUpperCase()}</div>
                <div>
                  <div className={styles.headerName}>{activeFriend?.username}</div>
                  {typingUsers.size > 0 && <div className={styles.typingIndicator}>typing...</div>}
                </div>
              </div>
              
              <div className={styles.headerTabs}>
                <div className={`${styles.headerTab} ${styles.active}`}>Conversation</div>
                <div className={styles.headerTab} onClick={() => alert("Files coming soon!")}>Files</div>
              </div>
              
              <div className={styles.headerActions}>
                <button title="Audio Call" onClick={() => alert("Audio call coming soon!")}>📞</button>
                <button title="Video Call" onClick={() => alert("Video call coming soon!")}>📹</button>
                <button title="Lock Chat" onClick={handleLockChat}>🔒</button>
              </div>
            </div>
            
            <div className={styles.messagesArea}>
              {messages.map((msg, i) => {
                const prevMsg = messages[i - 1];
                const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    {showDate && renderDateSeparator(msg.createdAt)}
                    
                    <div className={`${styles.messageWrapper} ${msg.senderId === me?.id ? styles.sent : styles.received}`}>
                      <div className={styles.messageBubble}>
                        {msg.replyTo && (
                          <div className={styles.messageReplyBox} onClick={() => {
                            // scroll to reply... left as a simple visual element
                          }}>
                            <strong>{msg.replyTo.senderId === me?.id ? 'You' : activeFriend?.username}</strong>
                            <div>{msg.replyTo.content.substring(0, 50)}...</div>
                          </div>
                        )}
                        
                        <div className={styles.messageContent}>{msg.content}</div>
                        
                        <div className={styles.messageMeta}>
                          <span className={styles.messageTime}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.senderId === me?.id && (
                            <span className={`${styles.readReceipt} ${msg.read ? styles.read : ''}`}>
                              {msg.read ? '✓✓' : '✓'}
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
              <div ref={messagesEndRef} />
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
                <button type="button" className={styles.attachmentBtn} onClick={() => alert("Attachments coming soon!")} title="Attach File">📎</button>
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
