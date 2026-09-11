"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMessage = exports.editMessage = exports.getFiles = exports.sendFileMessage = exports.sendMessage = exports.getMessages = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const socket_1 = require("../socket");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const { Expo } = require('expo-server-sdk');
const expo = new Expo();
const getMessages = async (req, res) => {
    const conversationId = req.params.conversationId;
    try {
        const messages = await prisma_1.default.message.findMany({
            where: { conversationId: conversationId },
            orderBy: { createdAt: 'desc' },
            take: 500, // Fetch the latest 500 messages
            include: {
                reactions: true,
                replyTo: true
            }
        });
        messages.reverse();
        res.status(200).json({ messages });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMessages = getMessages;
const sendMessage = async (req, res) => {
    const conversationId = req.params.conversationId;
    const { content, replyToId, clientMsgId } = req.body;
    // @ts-ignore
    const userId = req.userId;
    try {
        if (!content || content.trim() === '') {
            res.status(400).json({ error: 'Message content is required' });
            return;
        }
        const now = new Date();
        const message = await prisma_1.default.message.create({
            data: {
                conversationId: conversationId,
                senderId: userId,
                content,
                replyToId: replyToId || null,
                senderReadAt: now // Sender has seen their own message
            },
            include: {
                reactions: true,
                replyTo: true
            }
        });
        (0, socket_1.getIo)().to(`chat_${conversationId}`).emit('new_message', { ...message, clientMsgId });
        // Emit notification to receiver's personal room and via Expo Push
        const conv = await prisma_1.default.conversation.findUnique({
            where: { id: conversationId },
            include: { members: { include: { user: true } } }
        });
        if (conv) {
            const receiverMember = conv.members.find((m) => m.userId !== userId);
            if (receiverMember) {
                const receiver = receiverMember.user;
                (0, socket_1.getIo)().to(receiver.id).emit('notification', {
                    type: 'new_message',
                    conversationId,
                    messageId: message.id
                });
                // Send Expo Push Notification (Fire and forget, do not await so it doesn't block the API response)
                if (receiver.expoPushToken) {
                    if (Expo.isExpoPushToken(receiver.expoPushToken)) {
                        const sender = conv.members.find((m) => m.userId === userId)?.user;
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
                            }
                            catch (err) {
                                console.error('Push notification failed:', err);
                            }
                        });
                    }
                }
            }
        }
        res.status(201).json({ message });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.sendMessage = sendMessage;
const sendFileMessage = async (req, res) => {
    const conversationId = req.params.conversationId;
    // @ts-ignore
    const userId = req.userId;
    // @ts-ignore
    const file = req.file;
    try {
        if (!file) {
            res.status(400).json({ error: 'File is required' });
            return;
        }
        const now = new Date();
        const fileUrl = `/uploads/${file.filename}`;
        const content = req.body.content || '';
        const message = await prisma_1.default.message.create({
            data: {
                conversationId,
                senderId: userId,
                content: content || `📎 ${file.originalname}`,
                fileName: file.originalname,
                fileUrl,
                fileType: file.mimetype,
                fileSize: file.size,
                senderReadAt: now
            },
            include: {
                reactions: true,
                replyTo: true
            }
        });
        (0, socket_1.getIo)().to(`chat_${conversationId}`).emit('new_message', { ...message, clientMsgId: req.body.clientMsgId });
        // Push notification for file
        const conv = await prisma_1.default.conversation.findUnique({
            where: { id: conversationId },
            include: { members: { include: { user: true } } }
        });
        if (conv) {
            const receiverMember = conv.members.find((m) => m.userId !== userId);
            if (receiverMember) {
                const receiver = receiverMember.user;
                (0, socket_1.getIo)().to(receiver.id).emit('notification', {
                    type: 'new_message',
                    conversationId,
                    messageId: message.id
                });
                if (receiver.expoPushToken && Expo.isExpoPushToken(receiver.expoPushToken)) {
                    const sender = conv.members.find((m) => m.userId === userId)?.user;
                    const senderName = sender ? sender.username : 'Someone';
                    Promise.resolve().then(async () => {
                        try {
                            await expo.sendPushNotificationsAsync([{
                                    to: receiver.expoPushToken,
                                    sound: 'default',
                                    title: `${senderName} sent a file`,
                                    body: file.originalname,
                                    data: { conversationId, messageId: message.id },
                                }]);
                        }
                        catch (err) {
                            console.error('Push notification failed:', err);
                        }
                    });
                }
            }
        }
        res.status(201).json({ message });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.sendFileMessage = sendFileMessage;
const getFiles = async (req, res) => {
    const conversationId = req.params.conversationId;
    try {
        const files = await prisma_1.default.message.findMany({
            where: {
                conversationId,
                fileUrl: { not: null }
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                fileName: true,
                fileUrl: true,
                fileType: true,
                fileSize: true,
                senderId: true,
                createdAt: true
            }
        });
        res.status(200).json({ files });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getFiles = getFiles;
const editMessage = async (req, res) => {
    const conversationId = req.params.conversationId;
    const messageId = req.params.messageId;
    const { content } = req.body;
    // @ts-ignore
    const userId = req.userId;
    try {
        const existing = await prisma_1.default.message.findUnique({ where: { id: messageId } });
        if (!existing) {
            res.status(404).json({ error: 'Message not found' });
            return;
        }
        if (existing.senderId !== userId) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const message = await prisma_1.default.message.update({
            where: { id: messageId },
            data: { content },
            include: {
                replyTo: true,
                reactions: true
            }
        });
        (0, socket_1.getIo)().to(`chat_${conversationId}`).emit('message_edited', { messageId, content: message.content, conversationId });
        res.json({ message });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.editMessage = editMessage;
const deleteMessage = async (req, res) => {
    const conversationId = req.params.conversationId;
    const messageId = req.params.messageId;
    // @ts-ignore
    const userId = req.userId;
    try {
        const existing = await prisma_1.default.message.findUnique({ where: { id: messageId } });
        if (!existing) {
            res.status(404).json({ error: 'Message not found' });
            return;
        }
        if (existing.senderId !== userId) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        // Delete file from disk if exists
        if (existing.fileUrl) {
            const filePath = path_1.default.join(__dirname, '..', '..', existing.fileUrl);
            try {
                if (fs_1.default.existsSync(filePath)) {
                    fs_1.default.unlinkSync(filePath);
                }
            }
            catch (err) {
                console.error('Failed to delete file:', err);
            }
        }
        // Delete reactions first (if any cascading issues, but schema usually handles it)
        await prisma_1.default.reaction.deleteMany({ where: { messageId } });
        await prisma_1.default.message.delete({ where: { id: messageId } });
        (0, socket_1.getIo)().to(`chat_${conversationId}`).emit('message_deleted', { messageId, conversationId });
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.deleteMessage = deleteMessage;
