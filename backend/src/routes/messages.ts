import { Router } from 'express';
import { getMessages, sendMessage, editMessage, deleteMessage } from '../controllers/messageController';
import { requireAuth } from '../middleware/authMiddleware';
import { requireChatAuth } from '../middleware/chatAuthMiddleware';

const router = Router({ mergeParams: true });

// First level of security: User must be logged in
router.use(requireAuth);

// Second level of security: Chat must be unlocked
router.use(requireChatAuth);

router.get('/', getMessages);
router.post('/', sendMessage);
router.put('/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);

export default router;
