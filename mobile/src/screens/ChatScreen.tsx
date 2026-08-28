import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Modal, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getSession } from '../utils/auth';
import { API_URL } from '../utils/constants';
import io, { Socket } from 'socket.io-client';

export default function ChatScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  // @ts-ignore
  const { conversationId, friendName } = route.params;

  const [unlocked, setUnlocked] = useState(false);
  const [chatPin, setChatPin] = useState('');
  const [chatAuthToken, setChatAuthToken] = useState('');
  const [error, setError] = useState('');
  
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [meId, setMeId] = useState('');
  
  const [replyToMessage, setReplyToMessage] = useState<any>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const EMOJIS = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
    '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎',
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','❤️‍🔥','💯',
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒',
    '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🌶️'
  ];

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetchMe();
    return () => {
      handleLock();
    };
  }, []);

  const fetchMe = async () => {
    const token = await getSession();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setMeId(data.user.id);
    }
  };

  const handleUnlock = async () => {
    if (isUnlocking) return;
    setError('');
    setIsUnlocking(true);
    try {
      const token = await getSession();
      const res = await fetch(`${API_URL}/api/chats/${conversationId}/unlock`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ chatPin })
      });

      if (!res.ok) throw new Error('Invalid Chat PIN');
      const data = await res.json();
      const chatToken = data.chatAuthToken;
      
      setChatAuthToken(chatToken);
      setUnlocked(true);
      
      // Init socket
      socketRef.current = io(API_URL, {
        auth: { token }
      });

      socketRef.current.emit('join_chat', { conversationId, chatAuthToken: chatToken });
      socketRef.current.on('new_message', (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.id)) return prev;
          if (payload.clientMsgId) {
            const tempIdx = prev.findIndex(m => m.id === payload.clientMsgId);
            if (tempIdx !== -1) {
              const next = [...prev];
              next[tempIdx] = payload;
              return next;
            }
          }
          // If we receive a message and aren't near the bottom, show the new message badge
          if (payload.senderId !== meId && !isNearBottom) {
            setHasNewMessages(true);
          }
          return [...prev, payload];
        });
        
        // Mark as read if we receive it while in chat
        if (payload.senderId !== meId) {
          socketRef.current?.emit('mark_read', { conversationId, messageIds: [payload.id] });
        }
      });

      socketRef.current.on('typing_start', ({ userId, conversationId: cid }) => {
        if (cid === conversationId) {
          setTypingUsers(prev => new Set(prev).add(userId));
        }
      });

      socketRef.current.on('typing_stop', ({ userId, conversationId: cid }) => {
        if (cid === conversationId) {
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
            const rx = m.reactions || [];
            if (!rx.find((r:any) => r.id === reaction.id)) {
              return { ...m, reactions: [...rx.filter((r:any) => r.userId !== reaction.userId || r.emoji !== reaction.emoji), reaction] };
            }
          }
          return m;
        }));
      });

      socketRef.current.on('reaction_removed', ({ messageId, userId, emoji }) => {
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            return { ...m, reactions: (m.reactions || []).filter((r:any) => r.userId !== userId || r.emoji !== emoji) };
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

      // Fetch existing messages
      fetchMessages(chatToken, token!);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUnlocking(false);
    }
  };

  const fetchMessages = async (cToken: string, sToken: string) => {
    const res = await fetch(`${API_URL}/api/chats/${conversationId}/messages`, {
      headers: { 
        'Authorization': `Bearer ${sToken}`,
        'x-chat-auth': cToken 
      }
    });
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      
      const unreadIds = data.messages
        .filter((m: any) => !m.read && m.senderId !== meId)
        .map((m: any) => m.id);
        
      if (unreadIds.length > 0) {
        socketRef.current?.emit('mark_read', { conversationId, messageIds: unreadIds });
      }
    }
  };

  const handleLock = async () => {
    if (chatAuthToken) {
      const token = await getSession();
      await fetch(`${API_URL}/api/chats/${conversationId}/lock`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-chat-auth': chatAuthToken 
        }
      });
      socketRef.current?.emit('leave_chat', { conversationId });
      socketRef.current?.disconnect();
    }
    setUnlocked(false);
    setChatAuthToken('');
    setMessages([]);
    setChatPin('');
  };

  const handleSend = async () => {
    if (isSending) return;
    if (!messageInput.trim()) return;

    if (editingMessageId) {
      const content = messageInput;
      const msgId = editingMessageId;
      
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content } : m));
      setMessageInput('');
      setEditingMessageId(null);
      
      try {
        const token = await getSession();
        await fetch(`${API_URL}/api/chats/${conversationId}/messages/${msgId}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-chat-auth': chatAuthToken 
          },
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
    
    // Optimistic UI update
    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      id: tempId,
      content,
      senderId: meId,
      conversationId,
      createdAt: new Date().toISOString(),
      read: false,
      replyTo: replyToMessage,
      reactions: []
    };
    
    setMessages(prev => [...prev, tempMessage]);
    setMessageInput('');
    setReplyToMessage(null);

    try {
      const token = await getSession();
      const res = await fetch(`${API_URL}/api/chats/${conversationId}/messages`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-chat-auth': chatAuthToken 
        },
        body: JSON.stringify({ 
          content,
          replyToId: replyId,
          clientMsgId: tempId
        })
      });
      
      if (res.ok) {
        const data = await res.json();
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

  const handleReact = async (emoji: string) => {
    if (!selectedMessageId || !meId) return;
    
    // Optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id === selectedMessageId) {
        const reactions = m.reactions || [];
        const existing = reactions.find((r:any) => r.userId === meId && r.emoji === emoji);
        
        if (existing) {
          return { ...m, reactions: reactions.filter((r:any) => r.id !== existing.id) };
        } else {
          const newReaction = { id: `temp-${Date.now()}`, messageId: selectedMessageId, userId: meId, emoji };
          return { ...m, reactions: [...reactions, newReaction] };
        }
      }
      return m;
    }));

    socketRef.current?.emit('react_message', { conversationId, messageId: selectedMessageId, emoji });
    
    setShowEmojiPicker(false);
    setSelectedMessageId(null);
  };

  const handleDelete = async (msgId: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    try {
      const token = await getSession();
      await fetch(`${API_URL}/api/chats/${conversationId}/messages/${msgId}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'x-chat-auth': chatAuthToken 
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleTextChange = (text: string) => {
    setMessageInput(text);
    if (!isTyping) {
      setIsTyping(true);
      socketRef.current?.emit('typing_start', { conversationId });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit('typing_stop', { conversationId });
    }, 1500);
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 50;
    const isNear = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    setIsNearBottom(isNear);
    if (isNear) {
      setHasNewMessages(false);
    }
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setHasNewMessages(false);
  };

  if (!unlocked) {
    return (
      <View style={styles.container}>
        <View style={styles.lockCard}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔐</Text>
          <Text style={styles.title}>CHAT LOCKED</Text>
          <Text style={styles.subtitle}>Course Chat with {friendName}</Text>

          <TextInput
            style={[styles.input, { textAlign: 'center', letterSpacing: 8 }]}
            placeholder="••••••"
            value={chatPin}
            onChangeText={setChatPin}
            secureTextEntry
            maxLength={6}
            keyboardType="numeric"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.button} onPress={handleUnlock} disabled={isUnlocking}>
            <Text style={styles.buttonText}>{isUnlocking ? 'Unlocking...' : 'Unlock Chat'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.chatContainer} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Text style={{ color: '#000000' }}>◀ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{friendName}</Text>
        <TouchableOpacity onPress={handleLock} style={{ padding: 8 }}>
          <Text style={{ color: '#666666' }}>🔒 Lock</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (isNearBottom) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isMe = item.senderId === meId;
          const rx = item.reactions || [];
          return (
            <TouchableOpacity 
              onLongPress={() => {
                setSelectedMessageId(item.id);
                setShowEmojiPicker(true);
              }}
              delayLongPress={300}
              style={[styles.messageWrapper, isMe ? styles.sent : styles.received]}
            >
              {item.replyTo && (
                <View style={styles.repliedMessage}>
                  <Text style={styles.repliedText} numberOfLines={1}>{item.replyTo.content}</Text>
                </View>
              )}
              <View style={[styles.messageBubble, isMe ? styles.sentBubble : styles.receivedBubble]}>
                <Text style={isMe ? styles.sentText : styles.receivedText}>{item.content}</Text>
                {isMe && (
                  <Text style={[styles.readReceipt, item.read ? styles.readColor : styles.unreadColor]}>
                    {item.read ? '✓✓' : '✓'}
                  </Text>
                )}
              </View>
              {rx.length > 0 && (
                <View style={[styles.reactionsRow, isMe ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                  {Array.from(new Set(rx.map((r:any) => r.emoji))).map((emoji: any) => (
                    <Text key={emoji} style={styles.reactionEmoji}>{emoji}</Text>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      />

      {typingUsers.size > 0 && (
        <View style={styles.typingIndicatorWrapper}>
          <Text style={styles.typingText}>
            {Array.from(typingUsers).length === 1 ? 'Someone is typing' : 'Multiple people are typing'}
          </Text>
          <View style={styles.bouncingDots}>
            <Text style={styles.dot}>●</Text>
            <Text style={styles.dot}>●</Text>
            <Text style={styles.dot}>●</Text>
          </View>
        </View>
      )}

      {hasNewMessages && (
        <TouchableOpacity style={styles.newMessageBadge} onPress={scrollToBottom}>
          <Text style={styles.newMessageText}>New Message ↓</Text>
        </TouchableOpacity>
      )}

      <View style={styles.inputAreaWrapper}>
        {replyToMessage && (
          <View style={styles.replyPreview}>
            <Text style={styles.replyPreviewText} numberOfLines={1}>Replying to: {replyToMessage.content}</Text>
            <TouchableOpacity onPress={() => setReplyToMessage(null)}>
              <Text style={{color: '#e32b2b', fontWeight: 'bold'}}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {editingMessageId && (
          <View style={styles.replyPreview}>
            <Text style={styles.replyPreviewText} numberOfLines={1}>Editing Message</Text>
            <TouchableOpacity onPress={() => { setEditingMessageId(null); setMessageInput(''); }}>
              <Text style={{color: '#e32b2b', fontWeight: 'bold'}}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputArea}>
          <TouchableOpacity style={{ padding: 8 }} onPress={() => alert("Attachments coming soon!")}>
            <Text style={{ fontSize: 20 }}>📎</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.messageInput}
            placeholder={editingMessageId ? "Edit your message..." : "Type a message..."}
            placeholderTextColor="#94a3b8"
            value={messageInput}
            onChangeText={handleTextChange}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
            <Text style={{ color: 'white' }}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showEmojiPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowEmojiPicker(false)}>
          <View style={styles.emojiCard}>
            <Text style={styles.modalTitle}>Message Actions</Text>
            <TouchableOpacity style={styles.replyActionBtn} onPress={() => {
              const msg = messages.find(m => m.id === selectedMessageId);
              setReplyToMessage(msg);
              setShowEmojiPicker(false);
            }}>
              <Text style={styles.replyActionText}>↩️ Reply to this message</Text>
            </TouchableOpacity>

            {messages.find(m => m.id === selectedMessageId)?.senderId === meId && (
              <>
                <TouchableOpacity style={styles.replyActionBtn} onPress={() => {
                  const msg = messages.find(m => m.id === selectedMessageId);
                  setEditingMessageId(msg.id);
                  setMessageInput(msg.content);
                  setShowEmojiPicker(false);
                }}>
                  <Text style={styles.replyActionText}>✏️ Edit message</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.replyActionBtn, { backgroundColor: '#fee2e2' }]} onPress={() => {
                  if (selectedMessageId) handleDelete(selectedMessageId);
                  setShowEmojiPicker(false);
                }}>
                  <Text style={[styles.replyActionText, { color: '#ef4444' }]}>🗑️ Delete message</Text>
                </TouchableOpacity>
              </>
            )}
            
            <Text style={[styles.modalTitle, { marginTop: 16 }]}>React</Text>
            <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
              <View style={styles.emojiGrid}>
                {EMOJIS.map(emoji => (
                  <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)} style={styles.emojiBtn}>
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', padding: 16 },
  chatContainer: { flex: 1, backgroundColor: '#ffffff' },
  lockCard: { backgroundColor: '#ffffff', padding: 32, borderRadius: 24, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20 },
  title: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  subtitle: { color: '#64748b', marginBottom: 24, textAlign: 'center', marginTop: 8 },
  input: { width: '100%', backgroundColor: '#f8fafc', color: '#0f172a', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 24, fontWeight: 'bold' },
  button: { width: '100%', backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', elevation: 2, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  error: { color: '#ef4444', marginBottom: 12, fontWeight: '500' },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#ffffff', paddingTop: Platform.OS === 'ios' ? 48 : 16 },
  messageWrapper: { maxWidth: '75%' },
  sent: { alignSelf: 'flex-end' },
  received: { alignSelf: 'flex-start' },
  messageBubble: { padding: 14, borderRadius: 20 },
  sentBubble: { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 },
  receivedBubble: { backgroundColor: '#f1f5f9', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  sentText: { color: '#ffffff', fontSize: 15, lineHeight: 22 },
  receivedText: { color: '#0f172a', fontSize: 15, lineHeight: 22 },
  
  inputAreaWrapper: { backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  inputArea: { flexDirection: 'row', padding: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12, alignItems: 'flex-end', gap: 12 },
  messageInput: { flex: 1, backgroundColor: '#f1f5f9', color: '#0f172a', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderRadius: 24, fontSize: 15, maxHeight: 120 },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  
  reactionsRow: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, marginTop: -12, elevation: 2, shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.1, shadowRadius: 4, zIndex: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  reactionEmoji: { fontSize: 14, marginHorizontal: 2 },
  
  repliedMessage: { backgroundColor: 'rgba(0,0,0,0.05)', padding: 10, borderRadius: 12, marginBottom: 6 },
  repliedText: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  
  replyPreview: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#e2e8f0', alignItems: 'center' },
  replyPreviewText: { color: '#64748b', flex: 1, marginRight: 8, fontSize: 14, fontStyle: 'italic' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  emojiCard: { backgroundColor: '#ffffff', padding: 24, borderRadius: 24, width: '85%', maxHeight: '80%', elevation: 10, shadowColor: '#000', shadowOffset: {width:0,height:10}, shadowOpacity: 0.2, shadowRadius: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  replyActionBtn: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 12, alignItems: 'center' },
  replyActionText: { fontWeight: '600', color: '#334155', fontSize: 16 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  emojiBtn: { padding: 10, backgroundColor: '#f8fafc', borderRadius: 20 },
  readReceipt: { fontSize: 10, alignSelf: 'flex-end', marginTop: 4, letterSpacing: -1 },
  readColor: { color: '#93c5fd' },
  unreadColor: { color: 'rgba(255,255,255,0.6)' },

  typingIndicatorWrapper: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, backgroundColor: '#ffffff' },
  typingText: { fontSize: 13, color: '#94a3b8', marginRight: 8, fontStyle: 'italic' },
  bouncingDots: { flexDirection: 'row', gap: 2, paddingTop: 4 },
  dot: { color: '#cbd5e1', fontSize: 10 },
  
  newMessageBadge: { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, elevation: 4, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, zIndex: 100 },
  newMessageText: { color: 'white', fontWeight: 'bold', fontSize: 13 }
});
