"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIo = exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
const prisma_1 = __importDefault(require("./prisma"));
const security_1 = require("./utils/security");
const cookie = require('cookie');
let io;
const initSocket = (httpServer) => {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: true,
            credentials: true
        }
    });
    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const cookies = cookie.parseCookie(socket.request.headers.cookie || '');
            console.log('Socket connection attempt:', {
                hasCookie: !!cookies.session_token,
                hasAuthToken: !!socket.handshake.auth.token
            });
            const token = cookies.session_token || socket.handshake.auth.token;
            if (!token) {
                console.error('Socket Auth Error: No token provided');
                return next(new Error('Authentication error'));
            }
            const hashedToken = (0, security_1.hashToken)(token);
            const session = await prisma_1.default.session.findUnique({
                where: { tokenHash: hashedToken },
                include: { user: true }
            });
            if (!session || session.revokedAt || session.expiresAt < new Date()) {
                return next(new Error('Authentication error'));
            }
            // @ts-ignore
            socket.userId = session.userId;
            next();
        }
        catch (error) {
            console.error('Socket Auth Error (Catch):', error);
            next(new Error('Authentication error'));
        }
    });
    io.on('connection', (socket) => {
        // @ts-ignore
        const userId = socket.userId;
        console.log(`User connected: ${userId}`);
        // Join a personal room for direct user notifications
        socket.join(userId);
        socket.on('join_chat', async ({ conversationId, chatAuthToken }) => {
            // Validate chat authorization before allowing them to join the real-time room
            try {
                const hashedToken = (0, security_1.hashToken)(chatAuthToken);
                const chatSession = await prisma_1.default.chatSession.findFirst({
                    where: {
                        tokenHash: hashedToken,
                        conversationId,
                        userId,
                        expiresAt: { gt: new Date() }
                    }
                });
                if (chatSession) {
                    socket.join(`chat_${conversationId}`);
                }
                else {
                    socket.emit('error', { message: 'Invalid chat authorization' });
                }
            }
            catch (e) {
                socket.emit('error', { message: 'Error joining chat' });
            }
        });
        socket.on('leave_chat', ({ conversationId }) => {
            socket.leave(`chat_${conversationId}`);
        });
        socket.on('typing_start', ({ conversationId }) => {
            socket.to(`chat_${conversationId}`).emit('typing_start', { userId, conversationId });
        });
        socket.on('typing_stop', ({ conversationId }) => {
            socket.to(`chat_${conversationId}`).emit('typing_stop', { userId, conversationId });
        });
        socket.on('react_message', async ({ conversationId, messageId, emoji }) => {
            try {
                const existing = await prisma_1.default.reaction.findUnique({
                    where: { messageId_userId_emoji: { messageId, userId, emoji } }
                });
                if (existing) {
                    await prisma_1.default.reaction.delete({ where: { id: existing.id } });
                    io.to(`chat_${conversationId}`).emit('reaction_removed', { messageId, reactionId: existing.id, userId, emoji });
                }
                else {
                    const reaction = await prisma_1.default.reaction.create({
                        data: { messageId, userId, emoji },
                        include: { user: true }
                    });
                    io.to(`chat_${conversationId}`).emit('reaction_added', { messageId, reaction });
                }
            }
            catch (error) {
                console.error('Failed to toggle reaction:', error);
            }
        });
        // Updated mark_read with per-user tracking for 48h auto-deletion
        socket.on('mark_read', async ({ conversationId, messageIds }) => {
            try {
                const readAt = new Date();
                // Validate: user must be a member of this conversation
                const membership = await prisma_1.default.conversationMember.findFirst({
                    where: { conversationId, userId }
                });
                if (!membership) {
                    console.error(`[mark_read] User ${userId} is not a member of conversation ${conversationId}`);
                    return;
                }
                // Fetch the messages to check ownership and current state
                const messages = await prisma_1.default.message.findMany({
                    where: {
                        id: { in: messageIds },
                        conversationId,
                        senderId: { not: userId } // Only mark messages sent by the OTHER user
                    }
                });
                if (messages.length === 0)
                    return;
                const idsToUpdate = messages
                    .filter(m => !m.receiverReadAt) // Only update if receiverReadAt not already set (idempotent)
                    .map(m => m.id);
                if (idsToUpdate.length > 0) {
                    // Set receiverReadAt and bothSeenAt (since senderReadAt is always set at creation)
                    await prisma_1.default.message.updateMany({
                        where: { id: { in: idsToUpdate } },
                        data: {
                            read: true,
                            readAt: readAt,
                            receiverReadAt: readAt,
                            bothSeenAt: readAt // Both have now seen it — 48h timer starts
                        }
                    });
                }
                // Also update messages that already had receiverReadAt but just need the read flag
                const alreadyTrackedIds = messages
                    .filter(m => m.receiverReadAt && !m.read)
                    .map(m => m.id);
                if (alreadyTrackedIds.length > 0) {
                    await prisma_1.default.message.updateMany({
                        where: { id: { in: alreadyTrackedIds } },
                        data: { read: true, readAt: readAt }
                    });
                }
                const allAffectedIds = [...new Set([...idsToUpdate, ...alreadyTrackedIds])];
                if (allAffectedIds.length > 0) {
                    socket.to(`chat_${conversationId}`).emit('messages_read', {
                        conversationId,
                        messageIds: allAffectedIds,
                        readBy: userId,
                        readAt: readAt.toISOString()
                    });
                }
            }
            catch (e) {
                console.error('Mark read error:', e);
            }
        });
        // ===== WebRTC Call Signaling =====
        const emitToPeer = async (conversationId, event, payload) => {
            // Always emit to the chat room for active chat listeners
            socket.to(`chat_${conversationId}`).emit(event, payload);
            // Look up the peer to emit to their personal room (for global notifications)
            try {
                const conversation = await prisma_1.default.conversation.findUnique({
                    where: { id: conversationId },
                    include: { members: true }
                });
                if (conversation) {
                    const peer = conversation.members.find((m) => m.userId !== userId);
                    if (peer) {
                        socket.to(peer.userId).emit(event, payload);
                    }
                }
            }
            catch (err) {
                console.error('Error emitting to peer room:', err);
            }
        };
        socket.on('call_offer', async ({ conversationId, offer, callType }) => {
            await emitToPeer(conversationId, 'call_offer', {
                conversationId,
                offer,
                callType,
                callerId: userId
            });
        });
        socket.on('call_answer', async ({ conversationId, answer }) => {
            await emitToPeer(conversationId, 'call_answer', {
                conversationId,
                answer,
                answererId: userId
            });
        });
        socket.on('ice_candidate', async ({ conversationId, candidate }) => {
            await emitToPeer(conversationId, 'ice_candidate', {
                conversationId,
                candidate,
                senderId: userId
            });
        });
        socket.on('call_end', async ({ conversationId }) => {
            await emitToPeer(conversationId, 'call_end', {
                conversationId,
                endedBy: userId
            });
        });
        socket.on('call_reject', async ({ conversationId }) => {
            await emitToPeer(conversationId, 'call_reject', {
                conversationId,
                rejectedBy: userId
            });
        });
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${userId}`);
        });
    });
    return io;
};
exports.initSocket = initSocket;
const getIo = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};
exports.getIo = getIo;
