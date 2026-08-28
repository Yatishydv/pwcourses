import { Router } from 'express';
import { sendFriendRequest, acceptFriendRequest, getFriendsList, getPendingRequests } from '../controllers/friendController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// All friend routes require authentication
router.use(requireAuth);

router.post('/request', sendFriendRequest);
router.post('/accept/:requestId', acceptFriendRequest);
router.get('/', getFriendsList);
router.get('/pending', getPendingRequests);

export default router;
