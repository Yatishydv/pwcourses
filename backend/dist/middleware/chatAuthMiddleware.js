"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireChatAuth = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const security_1 = require("../utils/security");
const requireChatAuth = async (req, res, next) => {
    try {
        const conversationId = req.params.conversationId || req.params.id;
        // @ts-ignore
        const userId = req.userId;
        const token = req.headers['x-chat-auth'];
        if (!token) {
            res.status(401).json({ error: 'Chat authorization token required' });
            return;
        }
        const hashedToken = (0, security_1.hashToken)(token);
        const chatSession = await prisma_1.default.chatSession.findFirst({
            where: {
                tokenHash: hashedToken,
                conversationId: conversationId,
                userId,
                expiresAt: { gt: new Date() }
            }
        });
        if (!chatSession) {
            res.status(401).json({ error: 'Invalid or expired chat session. Please unlock the chat again.' });
            return;
        }
        next();
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Chat authentication failed' });
    }
};
exports.requireChatAuth = requireChatAuth;
