"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearChatHistory = exports.lockConversation = exports.unlockConversation = exports.getConversations = exports.createConversation = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const security_1 = require("../utils/security");
const createConversation = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const { friendId, chatPin } = req.body;
    try {
        if (!friendId || !chatPin) {
            res.status(400).json({ error: 'friendId and chatPin are required' });
            return;
        }
        // Verify friendship
        const friendship = await prisma_1.default.friendship.findFirst({
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
        const existingConvos = await prisma_1.default.conversation.findMany({
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
        const pinHash = await (0, security_1.hashPin)(chatPin);
        const conversation = await prisma_1.default.conversation.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createConversation = createConversation;
const getConversations = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    try {
        const conversations = await prisma_1.default.conversation.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getConversations = getConversations;
const unlockConversation = async (req, res) => {
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
        const conversation = await prisma_1.default.conversation.findUnique({
            where: { id: conversationId },
            include: { members: true }
        });
        console.timeEnd('unlock-db-fetch');
        if (!conversation) {
            res.status(404).json({ error: 'Conversation not found' });
            return;
        }
        const isMember = conversation.members.some((m) => m.userId === userId);
        if (!isMember) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        console.time('unlock-verifyPin');
        const isValid = await (0, security_1.verifyPin)(conversation.chatPinHash, chatPin);
        console.timeEnd('unlock-verifyPin');
        if (!isValid) {
            res.status(401).json({ error: 'Invalid Chat PIN' });
            return;
        }
        console.time('unlock-session-create');
        const token = (0, security_1.generateSecureToken)();
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 60); // 1 hour temp authorization
        await prisma_1.default.chatSession.create({
            data: {
                userId,
                conversationId: conversationId,
                tokenHash: (0, security_1.hashToken)(token),
                expiresAt
            }
        });
        console.timeEnd('unlock-session-create');
        // We do NOT set a cookie for chat tokens. They must be stored in memory by the client.
        res.status(200).json({ chatAuthToken: token, expiresAt });
        console.timeEnd('unlock-total');
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.unlockConversation = unlockConversation;
const lockConversation = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const { id: conversationId } = req.params;
    // Extract token from header
    const token = req.headers['x-chat-auth'];
    try {
        if (token) {
            await prisma_1.default.chatSession.deleteMany({
                where: {
                    tokenHash: (0, security_1.hashToken)(token),
                    userId,
                    conversationId: conversationId
                }
            });
        }
        res.status(200).json({ message: 'Chat locked successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.lockConversation = lockConversation;
const clearChatHistory = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const { id: conversationId } = req.params;
    // Need to ensure the user is part of the conversation
    try {
        const conversation = await prisma_1.default.conversation.findUnique({
            where: { id: conversationId },
            include: { members: true }
        });
        if (!conversation) {
            res.status(404).json({ error: 'Conversation not found' });
            return;
        }
        const isMember = conversation.members.some((m) => m.userId === userId);
        if (!isMember) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Delete all reactions associated with the messages in this conversation
        const messages = await prisma_1.default.message.findMany({
            where: { conversationId: conversationId },
            select: { id: true }
        });
        const messageIds = messages.map(m => m.id);
        if (messageIds.length > 0) {
            await prisma_1.default.reaction.deleteMany({
                where: { messageId: { in: messageIds } }
            });
            // Delete all messages in the conversation
            await prisma_1.default.message.deleteMany({
                where: { conversationId: conversationId }
            });
        }
        res.status(200).json({ success: true, message: 'Chat history cleared' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.clearChatHistory = clearChatHistory;
