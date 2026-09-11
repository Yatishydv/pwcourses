import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { getMessages, sendMessage, sendFileMessage, getFiles, editMessage, deleteMessage } from '../controllers/messageController';
import { requireAuth } from '../middleware/authMiddleware';
import { requireChatAuth } from '../middleware/chatAuthMiddleware';

const router = Router({ mergeParams: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
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
    } else {
      cb(null, false);
    }
  }
});

// First level of security: User must be logged in
router.use(requireAuth);

// Second level of security: Chat must be unlocked
router.use(requireChatAuth);

router.get('/', getMessages);
router.post('/', sendMessage);
router.post('/upload', upload.single('file'), sendFileMessage);
router.get('/files', getFiles);
router.put('/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);

export default router;
