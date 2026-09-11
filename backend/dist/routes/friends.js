"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const friendController_1 = require("../controllers/friendController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// All friend routes require authentication
router.use(authMiddleware_1.requireAuth);
router.post('/request', friendController_1.sendFriendRequest);
router.post('/accept/:requestId', friendController_1.acceptFriendRequest);
router.get('/', friendController_1.getFriendsList);
router.get('/pending', friendController_1.getPendingRequests);
exports.default = router;
