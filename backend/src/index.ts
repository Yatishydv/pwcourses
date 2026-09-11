import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth';
import friendRoutes from './routes/friends';
import chatRoutes from './routes/chats';
import messageRoutes from './routes/messages';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Routes
import http from 'http';
import { initSocket } from './socket';
import { startCleanupJob } from './jobs/cleanup';

app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/chats/:conversationId/messages', messageRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const server = http.createServer(app);
initSocket(server);

// Start the background cleanup job for auto-deleting messages
startCleanupJob();

server.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
