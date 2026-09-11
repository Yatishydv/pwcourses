"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMessageCleanup = runMessageCleanup;
exports.startCleanupJob = startCleanupJob;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../prisma"));
const socket_1 = require("../socket");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DELETION_THRESHOLD_HOURS = 48;
const BATCH_SIZE = 500;
/**
 * Finds and permanently deletes messages where:
 * 1. Both users have seen the message (bothSeenAt is not null)
 * 2. 48 hours have elapsed since bothSeenAt
 *
 * Also cleans up: reactions, uploaded files, and notifies connected clients.
 *
 * This function is idempotent and safe to retry.
 */
async function runMessageCleanup() {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - DELETION_THRESHOLD_HOURS);
    console.log(`[Cleanup] Running message cleanup. Cutoff: ${cutoff.toISOString()}`);
    try {
        // Find messages eligible for deletion
        const eligibleMessages = await prisma_1.default.message.findMany({
            where: {
                bothSeenAt: {
                    not: null,
                    lt: cutoff
                }
            },
            select: {
                id: true,
                conversationId: true,
                fileUrl: true,
                fileName: true
            },
            take: BATCH_SIZE
        });
        if (eligibleMessages.length === 0) {
            console.log('[Cleanup] No messages eligible for deletion.');
            return;
        }
        console.log(`[Cleanup] Found ${eligibleMessages.length} messages eligible for deletion.`);
        // Group by conversation for socket notifications
        const messagesByConversation = {};
        const messageIds = [];
        const filesToDelete = [];
        for (const msg of eligibleMessages) {
            messageIds.push(msg.id);
            if (!messagesByConversation[msg.conversationId]) {
                messagesByConversation[msg.conversationId] = [];
            }
            messagesByConversation[msg.conversationId].push(msg.id);
            // Track files to delete
            if (msg.fileUrl) {
                // fileUrl is like /uploads/filename.ext — resolve to absolute path
                const filePath = path_1.default.join(__dirname, '..', '..', msg.fileUrl);
                filesToDelete.push(filePath);
            }
        }
        // Delete reactions first
        try {
            const deletedReactions = await prisma_1.default.reaction.deleteMany({
                where: { messageId: { in: messageIds } }
            });
            console.log(`[Cleanup] Deleted ${deletedReactions.count} reactions.`);
        }
        catch (err) {
            console.error('[Cleanup] Failed to delete reactions:', err);
            // Continue — reactions have cascade delete in schema too
        }
        // Delete messages
        try {
            const deletedMessages = await prisma_1.default.message.deleteMany({
                where: { id: { in: messageIds } }
            });
            console.log(`[Cleanup] Deleted ${deletedMessages.count} messages from database.`);
        }
        catch (err) {
            console.error('[Cleanup] Failed to delete messages:', err);
            return; // Don't notify clients if DB delete failed
        }
        // Delete uploaded files from disk
        for (const filePath of filesToDelete) {
            try {
                if (fs_1.default.existsSync(filePath)) {
                    fs_1.default.unlinkSync(filePath);
                    console.log(`[Cleanup] Deleted file: ${filePath}`);
                }
            }
            catch (err) {
                console.error(`[Cleanup] Failed to delete file ${filePath}:`, err);
                // Non-fatal — the DB record is already gone
            }
        }
        // Notify connected clients via Socket.io
        try {
            const io = (0, socket_1.getIo)();
            for (const [conversationId, msgIds] of Object.entries(messagesByConversation)) {
                io.to(`chat_${conversationId}`).emit('messages_auto_deleted', {
                    conversationId,
                    messageIds: msgIds
                });
            }
            console.log(`[Cleanup] Notified ${Object.keys(messagesByConversation).length} conversations.`);
        }
        catch (err) {
            console.error('[Cleanup] Failed to notify clients:', err);
            // Non-fatal — messages are already deleted
        }
        console.log(`[Cleanup] Cleanup complete. Deleted ${messageIds.length} messages total.`);
    }
    catch (err) {
        console.error('[Cleanup] Cleanup job failed:', err);
    }
}
/**
 * Starts the cleanup cron job. Runs every 15 minutes.
 */
function startCleanupJob() {
    // Run every 15 minutes
    node_cron_1.default.schedule('*/15 * * * *', () => {
        console.log(`[Cleanup] Cron triggered at ${new Date().toISOString()}`);
        runMessageCleanup().catch(err => {
            console.error('[Cleanup] Unhandled error in cleanup:', err);
        });
    });
    console.log('[Cleanup] Message cleanup cron job scheduled (every 15 minutes).');
    // Also run once on startup after a short delay
    setTimeout(() => {
        console.log('[Cleanup] Running initial cleanup on startup...');
        runMessageCleanup().catch(err => {
            console.error('[Cleanup] Initial cleanup failed:', err);
        });
    }, 10000); // 10 second delay to let everything initialize
}
