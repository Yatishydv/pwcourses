import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import prisma from './prisma';
import { hashToken } from './utils/security';
const cookie = require('cookie');

let io: SocketServer;

export const initSocket = (httpServer: HttpServer) => {
  io = new SocketServer(httpServer, {
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

      const hashedToken = hashToken(token);
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashedToken },
        include: { user: true }
      });

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        return next(new Error('Authentication error'));
      }

      // @ts-ignore
      socket.userId = session.userId;
      next();
    } catch (error) {
      console.error('Socket Auth Error (Catch):', error);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    // @ts-ignore
    const userId = socket.userId;
    console.log(`User connected: ${userId}`);

    // Join a personal room for direct user notifications
    socket.join(userId);

    socket.on('join_chat', async ({ conversationId, chatAuthToken }) => {
      // Validate chat authorization before allowing them to join the real-time room
      try {
        const hashedToken = hashToken(chatAuthToken);
        const chatSession = await prisma.chatSession.findFirst({
          where: {
            tokenHash: hashedToken,
            conversationId,
            userId,
            expiresAt: { gt: new Date() }
          }
        });

        if (chatSession) {
          socket.join(`chat_${conversationId}`);
        } else {
          socket.emit('error', { message: 'Invalid chat authorization' });
        }
      } catch (e) {
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
        const existing = await prisma.reaction.findUnique({
          where: { messageId_userId_emoji: { messageId, userId, emoji } }
        });
        if (existing) {
          await prisma.reaction.delete({ where: { id: existing.id } });
          io.to(`chat_${conversationId}`).emit('reaction_removed', { messageId, reactionId: existing.id, userId, emoji });
        } else {
          const reaction = await prisma.reaction.create({
            data: { messageId, userId, emoji },
            include: { user: true }
          });
          io.to(`chat_${conversationId}`).emit('reaction_added', { messageId, reaction });
        }
      } catch (error) {
        console.error('Failed to toggle reaction:', error);
      }
    });

    socket.on('mark_read', async ({ conversationId, messageIds }) => {
      try {
        const readAt = new Date();
        await prisma.message.updateMany({
          where: { id: { in: messageIds }, conversationId, senderId: { not: userId } },
          data: { read: true, readAt }
        });
        socket.to(`chat_${conversationId}`).emit('messages_read', { conversationId, messageIds, readBy: userId, readAt: readAt.toISOString() });
      } catch (e) {
        console.error('Mark read error:', e);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId}`);
    });
  });

  return io;
};

export const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};
