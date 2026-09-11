import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { View, Text, Modal, TouchableOpacity, Dimensions } from 'react-native';
import io, { Socket } from 'socket.io-client';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, MediaStream, RTCView } from 'react-native-webrtc';
import { getSession } from '../utils/auth';
import { API_URL } from '../utils/constants';

interface CallContextProps {
  initiateCall: (conversationId: string, friendName: string, type: 'audio' | 'video', chatAuthToken: string) => void;
  endCall: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callState: 'idle' | 'calling' | 'incoming' | 'active';
  callType: 'audio' | 'video';
  activeConversationId: string | null;
}

const CallContext = createContext<CallContextProps | undefined>(undefined);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within CallProvider');
  return context;
};

export const CallProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'active'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [callerName, setCallerName] = useState('Incoming Call');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeChatAuthRef = useRef<string>('');

  // 1. Initialize global socket for calls
  useEffect(() => {
    const initSocket = async () => {
      const token = await getSession();
      if (!token) return;

      const newSocket = io(API_URL, {
        auth: { token }
      });
      socketRef.current = newSocket;
      setSocket(newSocket);

      // Listen for incoming calls globally!
      newSocket.on('call_offer', async ({ conversationId, offer, callType, callerId }) => {
        if (callState !== 'idle') {
          // Busy
          newSocket.emit('call_reject', { conversationId });
          return;
        }

        setCallType(callType);
        setActiveConversationId(conversationId);
        setCallerName('User'); // Need real name ideally
        setCallState('incoming');
        
        await initPeerConnection(conversationId);
        await peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(offer));
      });

      newSocket.on('call_answer', async ({ answer }) => {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setCallState('active');
          startTimer();
        }
      });

      newSocket.on('ice_candidate', async ({ candidate }) => {
        if (peerConnectionRef.current && candidate) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
        }
      });

      newSocket.on('call_end', () => cleanupCall());
      newSocket.on('call_reject', () => cleanupCall());

      return () => {
        newSocket.disconnect();
      };
    };

    initSocket();
  }, []);

  const startTimer = () => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
  };

  const getMedia = async (type: 'audio' | 'video') => {
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { facingMode: 'user' } : false
      });
      setLocalStream(stream);
      return stream;
    } catch (e) {
      console.error('Error getting media:', e);
      return null;
    }
  };

  const initPeerConnection = async (conversationId: string) => {
    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    const pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (event: any) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice_candidate', { conversationId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const initiateCall = async (conversationId: string, friendName: string, type: 'audio' | 'video', chatAuthToken: string) => {
    if (!socketRef.current) return;
    setCallType(type);
    setCallerName(friendName);
    setActiveConversationId(conversationId);
    setCallState('calling');
    activeChatAuthRef.current = chatAuthToken;

    const stream = await getMedia(type);
    const pc = await initPeerConnection(conversationId);
    
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      
      socketRef.current.emit('call_offer', { conversationId, offer, callType: type });
    } catch (e) {
      console.error('Create offer error', e);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!socketRef.current || !activeConversationId || !peerConnectionRef.current) return;
    
    const stream = await getMedia(callType);
    if (stream) {
      stream.getTracks().forEach((track) => {
        peerConnectionRef.current?.addTrack(track, stream);
      });
    }

    try {
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current.emit('call_answer', { conversationId: activeConversationId, answer });
      setCallState('active');
      startTimer();
    } catch (e) {
      console.error('Create answer error', e);
      cleanupCall();
    }
  };

  const endCall = (emit = false) => {
    if (emit && socketRef.current && activeConversationId) {
      socketRef.current.emit(callState === 'incoming' ? 'call_reject' : 'call_end', { conversationId: activeConversationId });
    }
    cleanupCall();
  };

  const cleanupCall = () => {
    setCallState('idle');
    setActiveConversationId(null);
    setLocalStream(null);
    setRemoteStream(null);
    if (timerRef.current) clearInterval(timerRef.current);
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
  };

  const formatCallDuration = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <CallContext.Provider value={{ initiateCall, endCall, localStream, remoteStream, callState, callType, activeConversationId }}>
      {children}
      
      {/* Global Incoming Call UI */}
      <Modal visible={callState !== 'idle' && callState !== 'active'} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'space-between', paddingVertical: 80, paddingHorizontal: 32 }}>
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' }}>
              <Text style={{ fontSize: 48 }}>{callType === 'video' ? '📹' : '📞'}</Text>
            </View>
            <Text style={{ color: 'white', fontSize: 32, fontWeight: '800', letterSpacing: 1 }}>{callerName}</Text>
            
            {callState === 'calling' && (
              <Text style={{ color: '#94a3b8', fontSize: 18, marginTop: 12 }}>Calling...</Text>
            )}
            {callState === 'incoming' && (
              <Text style={{ color: '#94a3b8', fontSize: 18, marginTop: 12 }}>Incoming {callType} call...</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 40 }}>
            {callState === 'incoming' && (
              <TouchableOpacity 
                onPress={acceptCall} 
                style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', shadowColor: '#10b981', shadowOpacity: 0.5, shadowRadius: 15, elevation: 10 }}
              >
                <Text style={{ color: 'white', fontSize: 32 }}>📞</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              onPress={() => endCall(true)} 
              style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', shadowColor: '#ef4444', shadowOpacity: 0.5, shadowRadius: 15, elevation: 10 }}
            >
              <Text style={{ color: 'white', fontSize: 32, transform: [{ rotate: '135deg' }] }}>📞</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {callState === 'active' && callType === 'audio' && (
         <View style={{ position: 'absolute', top: 50, right: 20, backgroundColor: '#10b981', padding: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', elevation: 5, zIndex: 9999 }}>
           <Text style={{ color: 'white', fontWeight: 'bold', marginRight: 8 }}>{formatCallDuration(callDuration)}</Text>
           <TouchableOpacity onPress={() => endCall(true)}>
             <Text style={{ color: 'white', fontSize: 20, transform: [{rotate:'135deg'}]}}>📞</Text>
           </TouchableOpacity>
         </View>
      )}

      {/* Active Video Call UI */}
      <Modal visible={callState === 'active' && callType === 'video'} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {remoteStream ? (
            <RTCView streamURL={remoteStream.toURL()} style={{ flex: 1 }} objectFit="cover" />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: 'white', fontSize: 18 }}>Connecting video...</Text>
            </View>
          )}

          {localStream && (
            <View style={{ position: 'absolute', top: 60, right: 20, width: 100, height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: '#333', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }}>
              <RTCView streamURL={localStream.toURL()} style={{ flex: 1 }} objectFit="cover" />
            </View>
          )}

          <View style={{ position: 'absolute', bottom: 40, width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }}>
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>{formatCallDuration(callDuration)}</Text>
            </View>
            <TouchableOpacity onPress={() => endCall(true)} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontSize: 24, transform: [{rotate:'135deg'}]}}>📞</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </CallContext.Provider>
  );
};
