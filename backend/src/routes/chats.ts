import { Router } from 'express';
import { createConversation, getConversations, unlockConversation, lockConversation } from '../controllers/chatController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);

router.post('/', createConversation);
router.get('/', getConversations);
router.post('/:id/unlock', unlockConversation);
router.post('/:id/lock', lockConversation);

export default router;
