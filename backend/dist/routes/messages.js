"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const messageController_1 = require("../controllers/messageController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const chatAuthMiddleware_1 = require("../middleware/chatAuthMiddleware");
const router = (0, express_1.Router)({ mergeParams: true });
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path_1.default.join(__dirname, '..', '..', 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto_1.default.randomBytes(8).toString('hex');
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${Date.now()}-${uniqueSuffix}${ext}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
    fileFilter: (req, file, cb) => {
        // Allow common file types
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
            'video/mp4', 'video/webm', 'video/quicktime',
            'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
            'application/pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain', 'text/csv',
            'application/zip', 'application/x-rar-compressed'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(null, false);
        }
    }
});
// First level of security: User must be logged in
router.use(authMiddleware_1.requireAuth);
// Second level of security: Chat must be unlocked
router.use(chatAuthMiddleware_1.requireChatAuth);
router.get('/', messageController_1.getMessages);
router.post('/', messageController_1.sendMessage);
router.post('/upload', upload.single('file'), messageController_1.sendFileMessage);
router.get('/files', messageController_1.getFiles);
router.put('/:messageId', messageController_1.editMessage);
router.delete('/:messageId', messageController_1.deleteMessage);
exports.default = router;
