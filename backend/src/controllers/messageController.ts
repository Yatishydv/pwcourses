import { Request, Response } from 'express';
import prisma from '../prisma';
import { getIo } from '../socket';
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

export const getMessages = async (req: Request, res: Response): Promise<void> => {
  const conversationId = req.params.conversationId as string;
  
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: conversationId as string },
      orderBy: { createdAt: 'desc' },
      take: 500, // Fetch the latest 500 messages
      include: {
        reactions: true,
        replyTo: true
      }
    });

    messages.reverse();

    res.status(200).json({ messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const conversationId = req.params.conversationId as string;
  const { content, replyToId, clientMsgId } = req.body;
  // @ts-ignore
  const userId = req.userId;

  try {
    if (!content || content.trim() === '') {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversationId as string,
        senderId: userId,
        content,
        replyToId: replyToId || null
      },
      include: {
        reactions: true,
        replyTo: true
      }
    });

    getIo().to(`chat_${conversationId}`).emit('new_message', { ...message, clientMsgId });
    
    // Emit notification to receiver's personal room and via Expo Push
    const conv: any = await prisma.conversation.findUnique({
      where: { id: conversationId as string },
      include: { members: { include: { user: true } } }
    });
    
    if (conv) {
      const receiverMember = conv.members.find((m: any) => m.userId !== userId);
      if (receiverMember) {
        const receiver = receiverMember.user;
        getIo().to(receiver.id).emit('notification', {
          type: 'new_message',
          conversationId,
          messageId: message.id
        });

        // Send Expo Push Notification (Fire and forget, do not await so it doesn't block the API response)
        if (receiver.expoPushToken) {
          if (Expo.isExpoPushToken(receiver.expoPushToken)) {
            const sender = conv.members.find((m: any) => m.userId === userId)?.user;
            const senderName = sender ? sender.username : 'Someone';
            
            // Run in background
            Promise.resolve().then(async () => {
              try {
                await expo.sendPushNotificationsAsync([{
                  to: receiver.expoPushToken,
                  sound: 'default',
                  title: `New message from ${senderName}`,
                  body: message.content,
                  data: { conversationId, messageId: message.id },
                }]);
                console.log(`Sent push notification to ${receiver.expoPushToken}`);
              } catch (err) {
                console.error('Push notification failed:', err);
              }
            });
          }
        }
      }
    }

    res.status(201).json({ message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const editMessage = async (req: Request, res: Response): Promise<void> => {
  const conversationId = req.params.conversationId as string;
  const messageId = req.params.messageId as string;
  const { content } = req.body;
  // @ts-ignore
  const userId = req.userId;

  try {
    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (existing.senderId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: { content },
      include: {
        replyTo: true,
        reactions: true
      }
    });

    getIo().to(`chat_${conversationId}`).emit('message_edited', { messageId, content: message.content, conversationId });
    res.json({ message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  const conversationId = req.params.conversationId as string;
  const messageId = req.params.messageId as string;
  // @ts-ignore
  const userId = req.userId;

  try {
    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (existing.senderId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Delete reactions first (if any cascading issues, but schema usually handles it)
    await prisma.reaction.deleteMany({ where: { messageId } });
    await prisma.message.delete({ where: { id: messageId } });

    getIo().to(`chat_${conversationId}`).emit('message_deleted', { messageId, conversationId });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
