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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const EMOJIS = ['😀','😂','😍','😭','😎','👍','❤️','🔥','🎉','💯'];

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
    setError('');
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
      socketRef.current.on('new_message', (msg) => {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
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

      // Fetch existing messages
      fetchMessages(chatToken, token!);

    } catch (err: any) {
      setError(err.message);
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
    if (!messageInput.trim()) return;
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
          replyToId: replyId 
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

          <TouchableOpacity style={styles.button} onPress={handleUnlock}>
            <Text style={styles.buttonText}>Unlock Chat</Text>
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
        contentContainerStyle={{ padding: 16, gap: 8 }}
      />

      <View style={styles.inputAreaWrapper}>
        {replyToMessage && (
          <View style={styles.replyPreview}>
            <Text style={styles.replyPreviewText} numberOfLines={1}>Replying to: {replyToMessage.content}</Text>
            <TouchableOpacity onPress={() => setReplyToMessage(null)}>
              <Text style={{color: '#e32b2b', fontWeight: 'bold'}}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor="#94a3b8"
            value={messageInput}
            onChangeText={setMessageInput}
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
            <Text style={{ color: 'white' }}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showEmojiPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowEmojiPicker(false)}>
          <View style={styles.emojiCard}>
            <Text style={styles.modalTitle}>Reaction & Reply</Text>
            <TouchableOpacity style={styles.replyActionBtn} onPress={() => {
              const msg = messages.find(m => m.id === selectedMessageId);
              setReplyToMessage(msg);
              setShowEmojiPicker(false);
            }}>
              <Text style={styles.replyActionText}>↩️ Reply to this message</Text>
            </TouchableOpacity>
            
            <View style={styles.emojiGrid}>
              {EMOJIS.map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)} style={styles.emojiBtn}>
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', padding: 16 },
  chatContainer: { flex: 1, backgroundColor: '#ffffff' },
  lockCard: { backgroundColor: '#f1f5f9', padding: 32, borderRadius: 24, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#000000' },
  subtitle: { color: '#666666', marginBottom: 24, textAlign: 'center', marginTop: 8 },
  input: { width: '100%', backgroundColor: '#ffffff', color: '#000000', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#cccccc' },
  button: { width: '100%', backgroundColor: '#e32b2b', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  error: { color: '#ef4444', marginBottom: 12 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  messageWrapper: { maxWidth: '75%' },
  sent: { alignSelf: 'flex-end' },
  received: { alignSelf: 'flex-start' },
  messageBubble: { padding: 12, borderRadius: 16 },
  sentBubble: { backgroundColor: '#e32b2b', borderBottomRightRadius: 4 },
  receivedBubble: { backgroundColor: '#f1f5f9', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#cccccc' },
  sentText: { color: 'white' },
  receivedText: { color: '#000000' },
  inputAreaWrapper: { backgroundColor: '#ffffff' },
  inputArea: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 12 },
  messageInput: { flex: 1, backgroundColor: '#f1f5f9', color: '#000000', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24 },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#e32b2b', justifyContent: 'center', alignItems: 'center' },
  
  reactionsRow: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, marginTop: -8, elevation: 1, shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.1, shadowRadius: 2, zIndex: 10 },
  reactionEmoji: { fontSize: 14, marginHorizontal: 2 },
  
  repliedMessage: { backgroundColor: '#f1f5f9', padding: 8, borderRadius: 8, marginBottom: 4, opacity: 0.8 },
  repliedText: { fontSize: 12, color: '#666666', fontStyle: 'italic' },
  
  replyPreview: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  replyPreviewText: { color: '#666666', flex: 1, marginRight: 8, fontSize: 14 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  emojiCard: { backgroundColor: '#ffffff', padding: 24, borderRadius: 24, width: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  replyActionBtn: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 12, marginBottom: 16, alignItems: 'center' },
  replyActionText: { fontWeight: 'bold', color: '#333333' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  emojiBtn: { padding: 8, backgroundColor: '#f8fafc', borderRadius: 16 },
  readReceipt: { fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  readColor: { color: '#ffffff' },
  unreadColor: { color: 'rgba(255,255,255,0.6)' }
});
