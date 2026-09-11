"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const security_1 = require("../utils/security");
const requireAuth = async (req, res, next) => {
    try {
        const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
        if (!token) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const hashedToken = (0, security_1.hashToken)(token);
        const session = await prisma_1.default.session.findUnique({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};
exports.requireAuth = requireAuth;
