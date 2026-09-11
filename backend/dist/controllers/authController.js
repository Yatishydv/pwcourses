"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePushToken = exports.getMe = exports.logout = exports.login = exports.register = void 0;
const prisma_1 = __importDefault(require("../prisma"));
const security_1 = require("../utils/security");
const SESSION_EXPIRY_DAYS = 30;
const register = async (req, res) => {
    try {
        const { username, pin } = req.body;
        if (!username || !pin) {
            res.status(400).json({ error: 'Username and PIN are required' });
            return;
        }
        const existingUser = await prisma_1.default.user.findUnique({ where: { username } });
        if (existingUser) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        const pinHash = await (0, security_1.hashPin)(pin);
        const user = await prisma_1.default.user.create({
            data: {
                username,
                pin_hash: pinHash
            }
        });
        const token = (0, security_1.generateSecureToken)();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);
        await prisma_1.default.session.create({
            data: {
                userId: user.id,
                tokenHash: (0, security_1.hashToken)(token),
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { username, pin } = req.body;
        if (!username || !pin) {
            res.status(400).json({ error: 'Username and PIN are required' });
            return;
        }
        const user = await prisma_1.default.user.findUnique({ where: { username } });
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const isValid = await (0, security_1.verifyPin)(user.pin_hash, pin);
        if (!isValid) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = (0, security_1.generateSecureToken)();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);
        await prisma_1.default.session.create({
            data: {
                userId: user.id,
                tokenHash: (0, security_1.hashToken)(token),
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.login = login;
const logout = async (req, res) => {
    try {
        const token = req.cookies.session_token || req.headers.authorization?.split(' ')[1];
        if (token) {
            await prisma_1.default.session.updateMany({
                where: { tokenHash: (0, security_1.hashToken)(token) },
                data: { revokedAt: new Date() }
            });
        }
        res.clearCookie('session_token');
        res.status(200).json({ message: 'Logged out successfully' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.logout = logout;
const getMe = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    try {
        const user = await prisma_1.default.user.findUnique({ where: { id: userId }, select: { id: true, username: true, createdAt: true } });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.status(200).json({ user, token: req.cookies.session_token || req.headers.authorization?.split(' ')[1] });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getMe = getMe;
const updatePushToken = async (req, res) => {
    // @ts-ignore
    const userId = req.userId;
    const { pushToken } = req.body;
    try {
        await prisma_1.default.user.update({
            where: { id: userId },
            data: { expoPushToken: pushToken }
        });
        res.status(200).json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update push token' });
    }
};
exports.updatePushToken = updatePushToken;
