import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { hashToken } from '../utils/security';

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hashedToken = hashToken(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashedToken },
      include: { user: true }
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    // @ts-ignore
    req.userId = session.userId;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};
