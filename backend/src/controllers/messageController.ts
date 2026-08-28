import { Request, Response } from 'express';
import prisma from '../prisma';

export const getMessages = async (req: Request, res: Response): Promise<void> => {
  const { conversationId } = req.params;
  
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId: conversationId as string },
      orderBy: { createdAt: 'asc' },
      take: 100, // pagination could be implemented here
      include: {
        reactions: true,
        replyTo: true
      }
    });

    res.status(200).json({ messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const { conversationId } = req.params;
  const { content, replyToId } = req.body;
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

    const { getIo } = require('../socket');
    getIo().to(`chat_${conversationId}`).emit('new_message', message);
    
    // Emit notification to receiver's personal room
    const conv: any = await prisma.conversation.findUnique({
      where: { id: conversationId as string },
      include: { members: true }
    });
    
    if (conv) {
      const receiver = conv.members.find((m: any) => m.userId !== userId);
      if (receiver) {
        getIo().to(receiver.userId).emit('notification', {
          type: 'new_message',
          conversationId,
          messageId: message.id
        });
      }
    }

    res.status(201).json({ message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
