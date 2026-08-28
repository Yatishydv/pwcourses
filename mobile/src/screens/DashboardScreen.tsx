import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getSession, clearSession } from '../utils/auth';
import { API_URL } from '../utils/constants';
import * as Notifications from 'expo-notifications';
import io, { Socket } from 'socket.io-client';
import { useRef } from 'react';

export default function DashboardScreen() {
  const [conversations, setConversations] = useState([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  // Batchmates Modal state
  const [showBatchmatesModal, setShowBatchmatesModal] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [friendReqMsg, setFriendReqMsg] = useState('');
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [friends, setBatchmates] = useState<any[]>([]);
  
  // Create Chat state
  const [newChatFriendId, setNewChatFriendId] = useState<string | null>(null);
  const [newChatPin, setNewChatPin] = useState('');

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    requestPermissions();
    loadData();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const requestPermissions = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Notification permissions not granted');
    }
  };

  const loadData = async () => {
    try {
      const token = await getSession();
      if (!token) {
        // @ts-ignore
        navigation.replace('Login');
        return;
      }

      const meRes = await fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!meRes.ok) throw new Error('Not logged in');
      const meData = await meRes.json();
      setMe(meData.user);

      if (!socketRef.current) {
        socketRef.current = io(API_URL, {
          auth: { token }
        });

        socketRef.current.on('new_message', (msg: any) => {
          Notifications.scheduleNotificationAsync({
            content: {
              title: `New message from ${msg.sender?.username || 'someone'}`,
              body: msg.content,
            },
            trigger: null,
          });
          // Also fetch conversations to update unread status / last message
          fetchConversations(token);
        });

        socketRef.current.on('new_friend_request', (req: any) => {
          Notifications.scheduleNotificationAsync({
            content: {
              title: `New friend request`,
              body: `${req.requester?.username} sent you a friend request!`,
            },
            trigger: null,
          });
          fetchPendingRequests();
        });
      }

      await fetchConversations(token);
    } catch (e) {
      console.error(e);
      // @ts-ignore
      navigation.replace('Login');
    } finally {
      setLoading(false);
    }
  };

  const fetchConversations = async (token: string) => {
    try {
      const convRes = await fetch(`${API_URL}/api/chats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const convData = await convRes.json();
      setConversations(convData.conversations || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const token = await getSession();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/friends/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(data.requests || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBatchmates = async () => {
    try {
      const token = await getSession();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/friends`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBatchmates(data.friends || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendFriendRequest = async () => {
    setFriendReqMsg('');
    try {
      const token = await getSession();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
      const token = await getSession();
      if (!token) return;
      await fetch(`${API_URL}/api/friends/accept/${requestId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchPendingRequests();
      loadData(); // reload conversations
    } catch (err) {
      console.error(err);
    }
  };

  const openBatchmatesModal = () => {
    fetchPendingRequests();
    fetchBatchmates();
    setShowBatchmatesModal(true);
    setFriendReqMsg('');
  };

  const handleStartChat = async (friendId: string) => {
    try {
      const token = await getSession();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ friendId, chatPin: newChatPin })
      });
      if (res.ok) {
        setNewChatFriendId(null);
        setNewChatPin('');
        loadData(); // refresh conversations
        setShowBatchmatesModal(false);
      } else {
        const data = await res.json();
        setFriendReqMsg(data.error || 'Failed to start chat');
      }
    } catch (err: any) {
      setFriendReqMsg(err.message);
    }
  };

  const handleLogout = async () => {
    const token = await getSession();
    if (token) {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
    await clearSession();
    // @ts-ignore
    navigation.replace('Login');
  };

  const openChat = (conversation: any) => {
    // @ts-ignore
    navigation.navigate('Chat', { 
      conversationId: conversation.id,
      friendName: conversation.members[0]?.user?.username 
    });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#3b82f6" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{me?.username?.[0]?.toUpperCase()}</Text></View>
          <Text style={styles.username}>{me?.username}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={openBatchmatesModal} style={styles.lockBtn}>
            <Text style={styles.lockText}>👥 Batchmates</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.lockBtn}>
            <Text style={styles.lockText}>🔒 Lock</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }) => {
          const friend = item.members[0]?.user;
          return (
            <TouchableOpacity style={styles.chatItem} onPress={() => openChat(item)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{friend?.username?.[0]?.toUpperCase()}</Text></View>
              <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{friend?.username}</Text>
                <Text style={styles.chatPreview}>Course Chat</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.emptyText}>No courses yet.</Text>}
      />

      <Modal visible={showBatchmatesModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Find Batchmates</Text>
              <TouchableOpacity onPress={() => setShowBatchmatesModal(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Search username to add..."
              placeholderTextColor="#94a3b8"
              value={searchUsername}
              onChangeText={setSearchUsername}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.actionBtn} onPress={handleSendFriendRequest}>
              <Text style={styles.actionBtnText}>Send Request</Text>
            </TouchableOpacity>
            {friendReqMsg ? <Text style={styles.msgText}>{friendReqMsg}</Text> : null}

            {pendingRequests.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={styles.modalTitle}>Pending Requests</Text>
                {pendingRequests.map(req => (
                  <View key={req.id} style={styles.reqItem}>
                    <Text style={{ color: '#000000', fontWeight: 'bold' }}>{req.requester.username}</Text>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAcceptRequest(req.id)}>
                      <Text style={{ color: 'white', fontWeight: 'bold' }}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {friends.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={styles.modalTitle}>Your Batchmates</Text>
                {friends.map(friend => (
                  <View key={friend.id} style={styles.reqItem}>
                    <Text style={{ color: '#000000', fontWeight: 'bold' }}>{friend.username}</Text>
                    {newChatFriendId === friend.id ? (
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TextInput
                          style={[styles.input, { padding: 8, marginBottom: 0, width: 100 }]}
                          placeholder="Chat PIN"
                          placeholderTextColor="#94a3b8"
                          value={newChatPin}
                          onChangeText={setNewChatPin}
                          secureTextEntry
                          maxLength={6}
                          keyboardType="numeric"
                        />
                        <TouchableOpacity style={styles.acceptBtn} onPress={() => handleStartChat(friend.id)}>
                          <Text style={{ color: 'white', fontWeight: 'bold' }}>Create</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: '#e32b2b' }]} onPress={() => setNewChatFriendId(friend.id)}>
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Start Chat</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9' 
  },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e32b2b', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  username: { color: '#000000', fontSize: 16, fontWeight: 'bold' },
  lockBtn: { padding: 8, backgroundColor: '#f1f5f9', borderRadius: 8 },
  lockText: { color: '#666666' },
  chatItem: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  chatInfo: { flex: 1 },
  chatName: { color: '#000000', fontSize: 16, fontWeight: 'bold' },
  chatPreview: { color: '#666666', fontSize: 14, marginTop: 4 },
  emptyText: { color: '#666666', textAlign: 'center', marginTop: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#f1f5f9', borderRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#000000', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { color: '#666666', fontSize: 24 },
  input: { backgroundColor: '#ffffff', color: '#000000', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#cccccc' },
  actionBtn: { backgroundColor: '#e32b2b', padding: 16, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: 'white', fontWeight: 'bold' },
  msgText: { color: '#e32b2b', marginTop: 8, textAlign: 'center' },
  reqItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: 12, borderRadius: 12, marginTop: 8 },
  acceptBtn: { backgroundColor: '#10b981', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 }
});
