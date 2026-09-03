import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Platform, Modal, ScrollView, Keyboard, Animated } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getSession } from '../utils/auth';
import { API_URL } from '../utils/constants';
import io, { Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ChatScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  // @ts-ignore
  const { conversationId, friendName } = route.params;
  const [isDark, setIsDark] = useState(false);
  const styles = getStyles(isDark);

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
  const keyboardHeight = useRef(new Animated.Value(0)).current;

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
    // Load saved theme
    AsyncStorage.getItem('chatTheme').then(val => {
      if (val === 'dark') setIsDark(true);
      else if (val === 'light') setIsDark(false);
    });
    return () => {
      handleLock();
    };
  }, []);

  // Keyboard listener for Android
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: false,
        }).start();
        // Auto scroll to bottom when keyboard opens
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: false,
        }).start();
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const toggleTheme = async () => {
    const newVal = !isDark;
    setIsDark(newVal);
    await AsyncStorage.setItem('chatTheme', newVal ? 'dark' : 'light');
  };

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
    <View style={styles.chatContainer}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Text style={{ color: isDark ? '#f3f4f6' : '#1e293b', fontSize: 16 }}>◀ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{friendName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={toggleTheme} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLock} style={{ padding: 8 }}>
            <Text style={{ fontSize: 16 }}>🔒</Text>
          </TouchableOpacity>
        </View>
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
        renderItem={({ item, index }) => {
          const isMe = item.senderId === meId;
          const rx = item.reactions || [];
          
          // Date separator logic
          const prevItem = index > 0 ? messages[index - 1] : null;
          const currentDate = new Date(item.createdAt).toDateString();
          const prevDate = prevItem ? new Date(prevItem.createdAt).toDateString() : null;
          const showDateSep = !prevDate || currentDate !== prevDate;
          
          let dateLabel = '';
          if (showDateSep) {
            const msgDate = new Date(item.createdAt);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            if (msgDate.toDateString() === today.toDateString()) dateLabel = 'TODAY';
            else if (msgDate.toDateString() === yesterday.toDateString()) dateLabel = 'YESTERDAY';
            else dateLabel = msgDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
          }
          
          return (
            <View>
              {showDateSep && (
                <View style={styles.dateSeparator}>
                  <Text style={styles.dateSeparatorText}>{dateLabel}</Text>
                </View>
              )}
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
                
                <View style={styles.messageMeta}>
                  <Text style={[styles.messageTime, isMe ? styles.messageTimeSent : null]}>
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {isMe && (
                    <Text style={[styles.readReceipt, item.read ? styles.readColor : styles.unreadColor]}>
                      {item.read ? '✓✓' : '✓'}
                    </Text>
                  )}
                </View>
              </View>
              {rx.length > 0 && (
                <View style={[styles.reactionsRow, isMe ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                  {Array.from(new Set(rx.map((r:any) => r.emoji))).map((emoji: any) => (
                    <Text key={emoji} style={styles.reactionEmoji}>{emoji}</Text>
                  ))}
                </View>
              )}
              </TouchableOpacity>
            </View>
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

      <Animated.View style={{ height: keyboardHeight }} />

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

    </View>
  );
}

const getStyles = (isDark: boolean) => {
  const bgMain = isDark ? '#0b141a' : '#f8fafc';
  const bgChat = isDark ? '#0b141a' : '#ffffff';
  const bgCard = isDark ? '#1f2c34' : '#ffffff';
  const textPrimary = isDark ? '#f3f4f6' : '#1e293b';
  const textSecondary = isDark ? '#9ca3af' : '#64748b';
  const borderCol = isDark ? '#374151' : '#e2e8f0';
  const inputBg = isDark ? '#2a3942' : '#f1f5f9';
  const bubbleRecv = isDark ? '#1f2c34' : '#f1f5f9';
  const textRecv = isDark ? '#f3f4f6' : '#0f172a';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bgMain, justifyContent: 'center', padding: 16 },
    chatContainer: { flex: 1, backgroundColor: bgChat },
    lockCard: { backgroundColor: bgCard, padding: 32, borderRadius: 24, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20 },
    title: { fontSize: 20, fontWeight: '700', color: textPrimary },
    subtitle: { color: textSecondary, marginBottom: 24, textAlign: 'center', marginTop: 8 },
    input: { width: '100%', backgroundColor: inputBg, color: textPrimary, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: borderCol, fontSize: 24, fontWeight: 'bold' },
    button: { width: '100%', backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', elevation: 2, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    error: { color: '#ef4444', marginBottom: 12, fontWeight: '500' },
    
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: borderCol, backgroundColor: bgCard, paddingTop: Platform.OS === 'ios' ? 48 : 16 },
    messageWrapper: { maxWidth: '75%' },
    sent: { alignSelf: 'flex-end' },
    received: { alignSelf: 'flex-start' },
    messageBubble: { padding: 12, borderRadius: 20, paddingHorizontal: 16 },
    sentBubble: { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 },
    receivedBubble: { backgroundColor: bubbleRecv, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: borderCol },
    sentText: { color: '#ffffff', fontSize: 15, lineHeight: 22 },
    receivedText: { color: textRecv, fontSize: 15, lineHeight: 22 },
    
    inputAreaWrapper: { backgroundColor: bgCard, borderTopWidth: 1, borderTopColor: borderCol },
    inputArea: { flexDirection: 'row', padding: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12, alignItems: 'flex-end', gap: 12 },
    messageInput: { flex: 1, backgroundColor: inputBg, color: textPrimary, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderRadius: 24, fontSize: 15, maxHeight: 120 },
    sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    
    reactionsRow: { flexDirection: 'row', backgroundColor: bgCard, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, marginTop: -12, elevation: 2, shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity: 0.1, shadowRadius: 4, zIndex: 10, borderWidth: 1, borderColor: borderCol },
    reactionEmoji: { fontSize: 14, marginHorizontal: 2 },
    
    repliedMessage: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', padding: 10, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
    repliedText: { fontSize: 13, color: textSecondary, fontStyle: 'italic' },
    
    replyPreview: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: inputBg, borderTopWidth: 1, borderTopColor: borderCol, borderLeftWidth: 4, borderLeftColor: '#3b82f6', alignItems: 'center' },
    replyPreviewText: { color: textSecondary, flex: 1, marginRight: 8, fontSize: 14, fontStyle: 'italic' },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    emojiCard: { backgroundColor: bgCard, padding: 24, borderRadius: 24, width: '85%', maxHeight: '80%', elevation: 10, shadowColor: '#000', shadowOffset: {width:0,height:10}, shadowOpacity: 0.2, shadowRadius: 20 },
    modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center', color: textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
    replyActionBtn: { backgroundColor: inputBg, padding: 16, borderRadius: 16, marginBottom: 12, alignItems: 'center' },
    replyActionText: { fontWeight: '600', color: textPrimary, fontSize: 16 },
    emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
    emojiBtn: { padding: 10, backgroundColor: inputBg, borderRadius: 20 },
    
    typingIndicatorWrapper: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, backgroundColor: bgChat },
    typingText: { fontSize: 13, color: textSecondary, marginRight: 8, fontStyle: 'italic' },
    bouncingDots: { flexDirection: 'row', gap: 2, paddingTop: 4 },
    dot: { color: textSecondary, fontSize: 10 },
    
    newMessageBadge: { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, elevation: 4, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, zIndex: 100 },
    newMessageText: { color: 'white', fontWeight: 'bold', fontSize: 13 },

    messageMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
    messageTime: { fontSize: 11, color: isDark ? '#9ca3af' : 'rgba(0,0,0,0.45)' },
    messageTimeSent: { color: 'rgba(255,255,255,0.7)' },
    readReceipt: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
    readColor: { color: '#ffffff' },
    unreadColor: { color: 'rgba(255,255,255,0.6)' },

    dateSeparator: { alignSelf: 'center', marginVertical: 16, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', borderRadius: 20 },
    dateSeparatorText: { fontSize: 11, fontWeight: '600', color: textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }
  });
};
