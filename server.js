require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

const app = express();

const allowedOrigins = [
  'http://localhost:3001',
  'https://czatsportowy.pl',
  'https://www.czatsportowy.pl',
];

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS: ' + origin));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  })
);

app.get('/health', (_req, res) => res.status(200).send('ok'));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e6,
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'], // Support both transports
  allowEIO3: true, // Allow Engine.IO v3 clients
});

function readCookie(cookieHeader, name) {
  const cookie = cookieHeader || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

const RATE_LIMIT_WINDOW = 3000;
const RATE_LIMIT_COUNT = 10;
const rateMap = new Map();
function allowRate(socket) {
  const now = Date.now();
  const v = rateMap.get(socket.id) || { ts: now, count: 0 };
  if (now - v.ts > RATE_LIMIT_WINDOW) {
    v.ts = now;
    v.count = 0;
  }
  v.count += 1;
  rateMap.set(socket.id, v);
  return v.count <= RATE_LIMIT_COUNT;
}

const ROOM_RE = /^[\p{L}\p{N}_\s:-]{1,64}$/u;
const MAX_MSG_LEN = 1000;

io.use((socket, next) => {
  try {
    const cookie = socket.handshake.headers.cookie || '';
    const access = readCookie(cookie, 'accessToken');
    if (access) {
      const payload = jwt.verify(access, process.env.JWT_SECRET);
      socket.user = { id: payload.userId, tv: payload.tv };
    } else {
      socket.user = null;
    }
  } catch (_) {
    socket.user = null;
  }
  next();
});

io.on('connection', (socket) => {
  if (process.env.NODE_ENV === 'development') {
    const who = socket.user?.id ? `user:${socket.user.id}` : 'anon';
    console.log(`Socket connected: ${socket.id} (${who})`);
  }

  socket.on('join_chat', (chatId) => {
    if (typeof chatId !== 'string' || !ROOM_RE.test(chatId)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[join_chat] invalid chatId:', chatId);
      }
      return;
    }
    socket.join(chatId);
  });

  socket.on('send_message', (payload) => {
    if (!allowRate(socket)) return;
    if (!payload || typeof payload !== 'object') return;

    const { chatId, content, username } = payload;

    if (typeof chatId !== 'string' || !ROOM_RE.test(chatId)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[send_message] invalid chatId:', chatId);
      }
      return;
    }
    if (typeof content !== 'string') return;

    const safeContent = content.slice(0, MAX_MSG_LEN).trim();
    if (!safeContent) return;

    const safeUsername =
      typeof username === 'string' ? username.slice(0, 64).trim() : 'Anonim';

    const message = {
      chatId,
      username: safeUsername || 'Anonim',
      content: safeContent,
      timestamp: new Date(),
      userId: socket.user?.id || null,
    };

    io.to(chatId).emit('receive_message', message);
  });

  socket.on('send_private_message', (payload) => {
    if (!allowRate(socket)) return;
    if (!payload || typeof payload !== 'object') return;

    const { chatId, content, username } = payload;

    if (typeof chatId !== 'string' || !ROOM_RE.test(chatId)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[send_private_message] invalid chatId:', chatId);
      }
      return;
    }
    if (typeof content !== 'string') return;

    const safeContent = content.slice(0, MAX_MSG_LEN).trim();
    if (!safeContent) return;

    const safeUsername =
      typeof username === 'string' ? username.slice(0, 64).trim() : 'Anonim';

    const message = {
      chatId,
      username: safeUsername || 'Anonim',
      content: safeContent,
      timestamp: new Date(),
      userId: socket.user?.id || null,
    };

    io.to(chatId).emit('receive_private_message', message);
  });

  socket.on('disconnect', () => {
    rateMap.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`Socket server listening on :${PORT}`);
  }
});
