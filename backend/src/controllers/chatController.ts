import { Request, Response } from 'express';
import prisma from '../prisma';
import { hashPin, verifyPin, generateSecureToken, hashToken } from '../utils/security';

export const createConversation = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;
  const { friendId, chatPin } = req.body;

  try {
    if (!friendId || !chatPin) {
      res.status(400).json({ error: 'friendId and chatPin are required' });
      return;
    }

    // Verify friendship
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: friendId },
          { requesterId: friendId, receiverId: userId }
        ],
        status: 'ACCEPTED'
      }
    });

    if (!friendship) {
      res.status(403).json({ error: 'Must be friends to start a conversation' });
      return;
    }

    // Check if conversation already exists
    // Find a conversation where both users are members
    const existingConvos = await prisma.conversation.findMany({
      where: {
        members: {
          every: { userId: { in: [userId, friendId] } }
        }
      },
      include: { members: true }
    });
    
    // Filter to ensure exact match of 2 members
    const existing = existingConvos.find(c => c.members.length === 2);

    if (existing) {
      res.status(400).json({ error: 'Conversation already exists', conversationId: existing.id });
      return;
    }

    const pinHash = await hashPin(chatPin);
    const conversation = await prisma.conversation.create({
      data: {
        chatPinHash: pinHash,
        members: {
          create: [
            { userId },
            { userId: friendId }
          ]
        }
      }
    });

    res.status(201).json({ conversationId: conversation.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getConversations = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        members: { some: { userId } }
      },
      include: {
        members: {
          where: { userId: { not: userId } },
          include: { user: { select: { id: true, username: true } } }
        },
        // Only return basic conversation info, NOT messages. Messages require unlock.
      }
    });

    res.status(200).json({ conversations });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const unlockConversation = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;
  const { id: conversationId } = req.params;
  const { chatPin } = req.body;

  try {
    console.time('unlock-total');
    console.time('unlock-db-fetch');
    if (!chatPin) {
      res.status(400).json({ error: 'Chat PIN is required' });
      return;
    }

    const conversation: any = await prisma.conversation.findUnique({
      where: { id: conversationId as string },
      include: { members: true }
    });
    console.timeEnd('unlock-db-fetch');

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const isMember = conversation.members.some((m: any) => m.userId === userId);
    if (!isMember) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    console.time('unlock-verifyPin');
    const isValid = await verifyPin(conversation.chatPinHash!, chatPin);
    console.timeEnd('unlock-verifyPin');
    
    if (!isValid) {
      res.status(401).json({ error: 'Invalid Chat PIN' });
      return;
    }

    console.time('unlock-session-create');

    const token = generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 60); // 1 hour temp authorization

    await prisma.chatSession.create({
      data: {
        userId,
        conversationId: conversationId as string,
        tokenHash: hashToken(token),
        expiresAt
      }
    });
    console.timeEnd('unlock-session-create');

    // We do NOT set a cookie for chat tokens. They must be stored in memory by the client.
    res.status(200).json({ chatAuthToken: token, expiresAt });
    console.timeEnd('unlock-total');
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const lockConversation = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;
  const { id: conversationId } = req.params;
  
  // Extract token from header
  const token = req.headers['x-chat-auth'] as string;

  try {
    if (token) {
      await prisma.chatSession.deleteMany({
        where: {
          tokenHash: hashToken(token),
          userId,
          conversationId: conversationId as string
        }
      });
    }

    res.status(200).json({ message: 'Chat locked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const clearChatHistory = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;
  const { id: conversationId } = req.params;
  
  // Need to ensure the user is part of the conversation
  try {
    const conversation: any = await prisma.conversation.findUnique({
      where: { id: conversationId as string },
      include: { members: true }
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const isMember = conversation.members.some((m: any) => m.userId === userId);
    if (!isMember) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Delete all reactions associated with the messages in this conversation
    const messages = await prisma.message.findMany({
      where: { conversationId: conversationId as string },
      select: { id: true }
    });
    
    const messageIds = messages.map(m => m.id);
    
    if (messageIds.length > 0) {
      await prisma.reaction.deleteMany({
        where: { messageId: { in: messageIds } }
      });

      // Delete all messages in the conversation
      await prisma.message.deleteMany({
        where: { conversationId: conversationId as string }
      });
    }

    res.status(200).json({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
