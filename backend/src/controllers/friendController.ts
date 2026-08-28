import { Request, Response } from 'express';
import prisma from '../prisma';

export const sendFriendRequest = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;
  const { username } = req.body;

  try {
    const receiver = await prisma.user.findUnique({ where: { username } });
    if (!receiver) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (receiver.id === userId) {
      res.status(400).json({ error: 'Cannot send request to yourself' });
      return;
    }

    // Check if any request exists in either direction
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: receiver.id },
          { requesterId: receiver.id, receiverId: userId }
        ]
      }
    });

    if (existing) {
      res.status(400).json({ error: 'Friendship or request already exists' });
      return;
    }

    const request = await prisma.friendship.create({
      data: {
        requesterId: userId,
        receiverId: receiver.id,
        status: 'PENDING'
      }
    });

    res.status(201).json({ request });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptFriendRequest = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;
  const { requestId } = req.params;

  try {
    const request = await prisma.friendship.findUnique({ where: { id: requestId as string } });
    if (!request || request.receiverId !== userId || request.status !== 'PENDING') {
      res.status(404).json({ error: 'Valid pending request not found' });
      return;
    }

    const updated = await prisma.friendship.update({
      where: { id: requestId as string },
      data: { status: 'ACCEPTED' }
    });

    res.status(200).json({ friendship: updated });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFriendsList = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;

  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { receiverId: userId }],
        status: 'ACCEPTED'
      },
      include: {
        requester: { select: { id: true, username: true } },
        receiver: { select: { id: true, username: true } }
      }
    });

    const friends = friendships.map(f => f.requesterId === userId ? f.receiver : f.requester);
    res.status(200).json({ friends });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPendingRequests = async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const userId = req.userId;

  try {
    const requests = await prisma.friendship.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: { requester: { select: { id: true, username: true } } }
    });
    res.status(200).json({ requests });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
