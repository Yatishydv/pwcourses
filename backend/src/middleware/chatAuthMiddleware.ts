import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { hashToken } from '../utils/security';

export const requireChatAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const conversationId = req.params.conversationId || req.params.id;
    // @ts-ignore
    const userId = req.userId;
    const token = req.headers['x-chat-auth'] as string;

    if (!token) {
      res.status(401).json({ error: 'Chat authorization token required' });
      return;
    }

    const hashedToken = hashToken(token);
    const chatSession = await prisma.chatSession.findFirst({
      where: {
        tokenHash: hashedToken,
        conversationId: conversationId as string,
        userId,
        expiresAt: { gt: new Date() }
      }
    });

    if (!chatSession) {
      res.status(401).json({ error: 'Invalid or expired chat session. Please unlock the chat again.' });
      return;
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Chat authentication failed' });
  }
};
