import { Request, Response } from 'express';
import prisma from '../prisma';
import { hashPin, verifyPin, generateSecureToken, hashToken } from '../utils/security';

const SESSION_EXPIRY_DAYS = 30;

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, pin } = req.body;
    
    if (!username || !pin) {
      res.status(400).json({ error: 'Username and PIN are required' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    const pinHash = await hashPin(pin);
    const user = await prisma.user.create({
      data: {
        username,
        pin_hash: pinHash
      }
    });

    const token = generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        deviceInfo: req.headers['user-agent']
      }
    });

    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt
    });

    res.status(201).json({ user: { id: user.id, username: user.username }, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, pin } = req.body;

    if (!username || !pin) {
      res.status(400).json({ error: 'Username and PIN are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValid = await verifyPin(user.pin_hash, pin);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        deviceInfo: req.headers['user-agent']
      }
    });

    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt
    });

    res.status(200).json({ user: { id: user.id, username: user.username }, token }); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
    
    if (token) {
      await prisma.session.updateMany({
        where: { tokenHash: hashToken(token) },
        data: { revokedAt: new Date() }
      });
    }

    res.clearCookie('session_token');
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;
  
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, createdAt: true } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json({ user, token: req.cookies.session_token || req.headers.authorization?.split(' ')[1] });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePushToken = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;
  const { pushToken } = req.body;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: pushToken }
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update push token' });
  }
};
