"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingRequests = exports.getFriendsList = exports.acceptFriendRequest = exports.sendFriendRequest = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const sendFriendRequest = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const { username } = req.body;
    try {
        const receiver = await prisma_1.default.user.findUnique({ where: { username } });
        if (!receiver) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (receiver.id === userId) {
            res.status(400).json({ error: 'Cannot send request to yourself' });
            return;
        }
        // Check if any request exists in either direction
        const existing = await prisma_1.default.friendship.findFirst({
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
        const request = await prisma_1.default.friendship.create({
            data: {
                requesterId: userId,
                receiverId: receiver.id,
                status: 'PENDING'
            }
        });
        res.status(201).json({ request });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.sendFriendRequest = sendFriendRequest;
const acceptFriendRequest = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const { requestId } = req.params;
    try {
        const request = await prisma_1.default.friendship.findUnique({ where: { id: requestId } });
        if (!request || request.receiverId !== userId || request.status !== 'PENDING') {
            res.status(404).json({ error: 'Valid pending request not found' });
            return;
        }
        const updated = await prisma_1.default.friendship.update({
            where: { id: requestId },
            data: { status: 'ACCEPTED' }
        });
        res.status(200).json({ friendship: updated });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.acceptFriendRequest = acceptFriendRequest;
const getFriendsList = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    try {
        const friendships = await prisma_1.default.friendship.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getFriendsList = getFriendsList;
const getPendingRequests = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    try {
        const requests = await prisma_1.default.friendship.findMany({
            where: { receiverId: userId, status: 'PENDING' },
            include: { requester: { select: { id: true, username: true } } }
        });
        res.status(200).json({ requests });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getPendingRequests = getPendingRequests;
