import { Router } from 'express';
import { register, login, logout, getMe, updatePushToken } from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, getMe);
router.post('/push-token', requireAuth, updatePushToken);

export default router;
