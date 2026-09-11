"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = __importDefault(require("./routes/auth"));
const friends_1 = __importDefault(require("./routes/friends"));
const chats_1 = __importDefault(require("./routes/chats"));
const messages_1 = __importDefault(require("./routes/messages"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 5000;
app.use((0, cors_1.default)({
    origin: true,
    credentials: true
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Ensure uploads directory exists
const uploadsDir = path_1.default.join(__dirname, '..', 'uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// Serve uploaded files statically
app.use('/uploads', express_1.default.static(uploadsDir));
// Routes
const http_1 = __importDefault(require("http"));
const socket_1 = require("./socket");
const cleanup_1 = require("./jobs/cleanup");
app.use('/api/auth', auth_1.default);
app.use('/api/friends', friends_1.default);
app.use('/api/chats', chats_1.default);
app.use('/api/chats/:conversationId/messages', messages_1.default);
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
const server = http_1.default.createServer(app);
(0, socket_1.initSocket)(server);
// Start the background cleanup job for auto-deleting messages
(0, cleanup_1.startCleanupJob)();
server.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});
