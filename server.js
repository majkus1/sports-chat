require('dotenv').config();
// Next trzyma konfigurację w .env.local; dotenv domyślnie czyta tylko .env, więc bez tego
// samodzielny serwer socketów nie widział DATABASE_URL ani JWT_SECRET w dev.
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { startPickSettlementSchedule } = require('./lib/picks/scheduler.cjs');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const createMessageSchema = require('./models/messageSchema.cjs');

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

// ---------------------------------------------------------------------------
// MongoDB — socket sam zapisuje wiadomości pokoi publicznych.
//
// Wcześniej klient najpierw robił POST /api/sendMessage (zapis), a potem osobno
// emitował zdarzenie (rozgłoszenie). Gdy jedna z tych dróg zawiodła, wiadomość albo
// istniała tylko w bazie, albo tylko na ekranach innych osób.
// ---------------------------------------------------------------------------

const Message =
  mongoose.models.Message || mongoose.model('Message', createMessageSchema(mongoose));

let dbReady = false;

async function connectToDb() {
  if (dbReady) return;
  await mongoose.connect(process.env.DATABASE_URL);
  dbReady = true;
  if (process.env.NODE_ENV === 'development') {
    console.log('Socket server connected to MongoDB');
  }
}

connectToDb().catch((error) => {
  console.error('[db] initial connection failed:', error.message);
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
const CLIENT_MSG_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// ---------------------------------------------------------------------------
// Asystent wywoływany w czacie przez `@AI`
// ---------------------------------------------------------------------------

/** Wzmianka musi stać osobno — „@aizawa" albo adres e-mail nie mają wywoływać asystenta. */
const AI_MENTION_RE = /(^|[^\p{L}\p{N}_@])@ai\b/iu;

const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://127.0.0.1:3001';
/** Odstęp między wywołaniami asystenta w jednym pokoju. Chroni budżet i czytelność rozmowy. */
const AI_ROOM_COOLDOWN_MS = 20_000;
/** Ile czekamy na odpowiedź modelu, zanim uznamy próbę za nieudaną. */
const AI_REPLY_TIMEOUT_MS = 90_000;

const aiCooldownByRoom = new Map();

/**
 * Woła wewnętrzną trasę Next.js po odpowiedź asystenta.
 *
 * Model żyje po tamtej stronie, bo tam są klucze, Redis i dostęp do danych meczowych.
 * Ten proces obsługuje wyłącznie transport i zapis.
 */
async function requestAiReply({ chatId, question, userId, language }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REPLY_TIMEOUT_MS);

  try {
    const response = await fetch(`${INTERNAL_API_URL}/api/ai/chat-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({ chatId, question, userId, language }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, code: data.error || `http_${response.status}` };
    return { ok: true, text: data.text, meta: data.meta };
  } catch (error) {
    return { ok: false, code: error.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/** Zapisuje odpowiedź asystenta jako zwykłą wiadomość pokoju i rozgłasza ją wszystkim. */
async function handleAiMention({ chatId, content, userId, language, socket }) {
  const now = Date.now();
  const readyAt = aiCooldownByRoom.get(chatId) || 0;

  if (now < readyAt) {
    socket.emit('ai_limit', { chatId, code: 'cooldown', retryInMs: readyAt - now });
    return;
  }
  aiCooldownByRoom.set(chatId, now + AI_ROOM_COOLDOWN_MS);

  io.to(chatId).emit('ai_typing', { chatId });

  const result = await requestAiReply({ chatId, question: content, userId, language });

  if (!result.ok) {
    // Nieudana próba nie powinna blokować pokoju na pełny odstęp.
    aiCooldownByRoom.set(chatId, Date.now() + 3000);
    io.to(chatId).emit('ai_done', { chatId });
    socket.emit('ai_limit', { chatId, code: result.code });
    return;
  }

  try {
    const saved = await Message.create({
      chatId,
      username: 'AI',
      userId: null,
      authorType: 'ai',
      content: result.text.slice(0, MAX_MSG_LEN),
      timestamp: new Date(),
      aiMeta: result.meta
        ? {
            model: result.meta.model,
            promptVersion: result.meta.promptVersion,
            tokensIn: result.meta.tokensIn,
            tokensOut: result.meta.tokensOut,
            costUsd: result.meta.costUsd,
          }
        : undefined,
    });

    io.to(chatId).emit('ai_done', { chatId });
    io.to(chatId).emit('receive_message', {
      _id: String(saved._id),
      chatId: saved.chatId,
      username: saved.username,
      authorType: 'ai',
      content: saved.content,
      timestamp: saved.timestamp,
      aiMeta: saved.aiMeta,
    });
  } catch (error) {
    console.error('[ai] zapis odpowiedzi nie powiódł się:', error.message);
    io.to(chatId).emit('ai_done', { chatId });
  }
}

/**
 * tokenVersion jest globalnym licznikiem unieważnień (zmiana hasła, wylogowanie wszędzie).
 * Handshake go nie sprawdzał, więc odwołana sesja żyła aż do wygaśnięcia JWT.
 * Krótki cache trzyma odczyty z dala od bazy przy każdej wiadomości.
 */
const TOKEN_VERSION_TTL_MS = 60_000;
const tokenVersionCache = new Map();

async function currentTokenVersion(userId) {
  const cached = tokenVersionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  await connectToDb();
  const user = await mongoose.connection
    .collection('users')
    .findOne({ _id: new mongoose.Types.ObjectId(String(userId)) }, { projection: { tokenVersion: 1 } });

  if (!user) return null;

  const value = user.tokenVersion || 0;
  tokenVersionCache.set(userId, { value, expiresAt: Date.now() + TOKEN_VERSION_TTL_MS });
  return value;
}

io.use((socket, next) => {
  try {
    const cookie = socket.handshake.headers.cookie || '';
    const access = readCookie(cookie, 'accessToken');
    if (access) {
      const payload = jwt.verify(access, process.env.JWT_SECRET);
      const username =
        typeof payload.un === 'string' && payload.un.trim()
          ? payload.un.trim().slice(0, 32)
          : null;
      socket.user = { id: payload.userId, tv: payload.tv, username };
      // `exp` jest w sekundach; przechowujemy je, żeby wykryć wygaśnięcie tokenu
      // na już otwartym połączeniu — ciasteczko czyta się wyłącznie przy handshake.
      socket.tokenExpMs = typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } else {
      socket.user = null;
      socket.tokenExpMs = null;
    }
  } catch (_) {
    socket.user = null;
    socket.tokenExpMs = null;
  }
  // Połączenie przechodzi także bez sesji — niezalogowani mogą czytać czat.
  next();
});

/**
 * Zwraca `null` gdy wszystko gra, albo kod błędu do odesłania klientowi.
 * Kluczowe: żadna ścieżka nie kończy się cichym `return` — klient zawsze wie, co się stało.
 */
async function authFailureReason(socket) {
  if (!socket.user || !socket.user.username) return 'unauthenticated';
  if (socket.tokenExpMs && socket.tokenExpMs <= Date.now()) return 'auth_expired';

  try {
    const tv = await currentTokenVersion(socket.user.id);
    if (tv === null) return 'unauthenticated';
    if (tv !== (socket.user.tv ?? 0)) return 'auth_revoked';
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[auth] tokenVersion check failed:', error.message);
    }
    return 'server_error';
  }

  return null;
}

/**
 * Rozgłasza skład pokoju po każdej zmianie.
 *
 * Nicki są odczytywane z sesji socketów, nie przysyłane przez klienta — inaczej dałoby się
 * podszyć pod kogoś na liście obecnych. Niezalogowani liczą się do sumy, ale nie mają nicku.
 */
function broadcastPresence(chatId) {
  const room = io.sockets.adapter.rooms.get(chatId);
  if (!room) return;

  const usernames = new Set();
  for (const socketId of room) {
    const name = io.sockets.sockets.get(socketId)?.user?.username;
    if (name) usernames.add(name);
  }

  io.to(chatId).emit('presence', {
    chatId,
    total: room.size,
    users: [...usernames].slice(0, 50),
  });
}

/** Ack jest opcjonalny (starsi klienci go nie przysyłają), ale błąd zawsze leci też eventem. */
function fail(socket, ack, code) {
  if (code === 'auth_expired' || code === 'auth_revoked' || code === 'unauthenticated') {
    socket.emit('auth_expired', { code });
  }
  if (typeof ack === 'function') ack({ ok: false, code });
}

/** Osobisty pokój użytkownika — trafiają tu powiadomienia niezwiązane z otwartym czatem. */
const personalRoom = (username) => `user:${username}`;

io.on('connection', (socket) => {
  if (process.env.NODE_ENV === 'development') {
    const who = socket.user?.id ? `user:${socket.user.id}` : 'anon';
    console.log(`Socket connected: ${socket.id} (${who})`);
  }

  /*
   * Zalogowany od razu wchodzi do własnego pokoju.
   *
   * Bez tego wiadomość prywatna szła wyłącznie do pokoju rozmowy, więc adresat, który
   * nie miał akurat otwartego tego konkretnego czatu, nie dostawał o niej żadnego sygnału
   * — nie dało się pokazać ani plakietki, ani dźwięku.
   */
  if (socket.user?.username) socket.join(personalRoom(socket.user.username));

  socket.on('join_chat', (chatId) => {
    if (typeof chatId !== 'string' || !ROOM_RE.test(chatId)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[join_chat] invalid chatId:', chatId);
      }
      return;
    }
    socket.join(chatId);
    broadcastPresence(chatId);
  });

  socket.on('leave_chat', (chatId) => {
    if (typeof chatId !== 'string' || !ROOM_RE.test(chatId)) return;
    socket.leave(chatId);
    broadcastPresence(chatId);
  });

  /**
   * „X pisze…". Zdarzenie jest ulotne — nie zapisujemy go i nie potwierdzamy,
   * a limit tempa i tak obowiązuje, żeby klawiatura nie zalała pokoju.
   */
  socket.on('typing', (chatId) => {
    if (!allowRate(socket)) return;
    if (typeof chatId !== 'string' || !ROOM_RE.test(chatId)) return;
    if (!socket.user?.username) return;
    socket.to(chatId).emit('peer_typing', { chatId, username: socket.user.username });
  });

  socket.on('stop_typing', (chatId) => {
    if (typeof chatId !== 'string' || !ROOM_RE.test(chatId)) return;
    if (!socket.user?.username) return;
    socket.to(chatId).emit('peer_stop_typing', { chatId, username: socket.user.username });
  });

  socket.on('send_message', async (payload, ack) => {
    if (!allowRate(socket)) return fail(socket, ack, 'rate_limited');
    if (!payload || typeof payload !== 'object') return fail(socket, ack, 'bad_payload');

    const reason = await authFailureReason(socket);
    if (reason) return fail(socket, ack, reason);

    const { chatId, content, clientMsgId, language } = payload;

    if (typeof chatId !== 'string' || !ROOM_RE.test(chatId)) {
      return fail(socket, ack, 'invalid_chat_id');
    }
    if (typeof content !== 'string') return fail(socket, ack, 'invalid_content');

    const safeContent = content.slice(0, MAX_MSG_LEN).trim();
    if (!safeContent) return fail(socket, ack, 'empty_content');

    const safeClientMsgId =
      typeof clientMsgId === 'string' && CLIENT_MSG_ID_RE.test(clientMsgId) ? clientMsgId : null;

    try {
      await connectToDb();

      const mentionsAi = AI_MENTION_RE.test(safeContent);

      const doc = {
        chatId,
        username: socket.user.username,
        userId: socket.user.id || null,
        authorType: 'user',
        content: safeContent,
        mentions: mentionsAi ? ['AI'] : [],
        timestamp: new Date(),
      };
      // Pole dokładane tylko gdy klient je przysłał — indeks unikalności obejmuje wyłącznie stringi.
      if (safeClientMsgId) doc.clientMsgId = safeClientMsgId;

      let saved;
      try {
        saved = await Message.create(doc);
      } catch (error) {
        // Ta sama wiadomość wysłana ponownie po utracie połączenia — nie duplikujemy jej.
        if (error && error.code === 11000 && safeClientMsgId) {
          saved = await Message.findOne({ clientMsgId: safeClientMsgId });
        } else {
          throw error;
        }
      }

      const message = {
        _id: String(saved._id),
        chatId: saved.chatId,
        username: saved.username,
        userId: saved.userId ? String(saved.userId) : null,
        authorType: saved.authorType,
        content: saved.content,
        clientMsgId: saved.clientMsgId,
        timestamp: saved.timestamp,
      };

      io.to(chatId).emit('receive_message', message);
      if (typeof ack === 'function') ack({ ok: true, message });

      // Odpowiedź asystenta leci osobno i asynchronicznie — wiadomość użytkownika
      // jest już potwierdzona, więc czekanie na model nie blokuje wysyłki.
      if (mentionsAi) {
        handleAiMention({
          chatId,
          content: safeContent,
          userId: socket.user.id || null,
          language: language === 'en' ? 'en' : 'pl',
          socket,
        }).catch((error) => console.error('[ai] nieobsłużony błąd:', error.message));
      }
    } catch (error) {
      console.error('[send_message] persist failed:', error.message);
      fail(socket, ack, 'server_error');
    }
  });

  socket.on('send_private_message', async (payload, ack) => {
    if (!allowRate(socket)) return fail(socket, ack, 'rate_limited');
    if (!payload || typeof payload !== 'object') return fail(socket, ack, 'bad_payload');

    const reason = await authFailureReason(socket);
    if (reason) return fail(socket, ack, reason);

    const { chatId, content, peerUsername } = payload;

    if (typeof peerUsername !== 'string' || !peerUsername.trim()) {
      return fail(socket, ack, 'invalid_peer');
    }
    const peer = peerUsername.trim().slice(0, 32);
    const expectedChatId = [socket.user.username, peer]
      .sort((a, b) => a.localeCompare(b, 'pl'))
      .join('_');

    if (typeof chatId !== 'string' || chatId !== expectedChatId || !ROOM_RE.test(chatId)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[send_private_message] invalid chatId or peer mismatch');
      }
      return fail(socket, ack, 'invalid_chat_id');
    }
    if (typeof content !== 'string') return fail(socket, ack, 'invalid_content');

    const safeContent = content.slice(0, MAX_MSG_LEN).trim();
    if (!safeContent) return fail(socket, ack, 'empty_content');

    // Wiadomości prywatne nadal zapisuje /api/sendPrivateMessage (model PrivateChat
    // trzyma je w tablicy osadzonej); tutaj tylko rozgłaszamy i potwierdzamy.
    const message = {
      chatId,
      username: socket.user.username,
      content: safeContent,
      timestamp: new Date(),
      userId: socket.user.id || null,
    };

    io.to(chatId).emit('receive_private_message', message);

    /*
     * Powiadomienie do adresata niezależnie od tego, czy ma otwartą tę rozmowę.
     * Klient sam decyduje, co z nim zrobić: podbić licznik, zagrać dźwięk albo zignorować,
     * gdy akurat patrzy na ten czat. Podgląd treści przycięty — plakietka nie potrzebuje
     * całej wiadomości.
     */
    io.to(personalRoom(peer)).emit('private_message_notice', {
      chatId,
      from: socket.user.username,
      preview: safeContent.slice(0, 80),
      timestamp: message.timestamp,
    });

    if (typeof ack === 'function') ack({ ok: true, message });
  });

  socket.on('disconnecting', () => {
    // W `disconnect` socket nie jest już w żadnym pokoju, więc licznik obecności
    // trzeba odświeżyć tutaj — stąd `disconnecting`, nie `disconnect`.
    for (const room of socket.rooms) {
      if (room !== socket.id) setImmediate(() => broadcastPresence(room));
    }
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

  /*
   * Dobowe rozliczanie typów.
   *
   * Ten proces chodzi bez przerwy pod PM2, więc harmonogram trzymamy tutaj zamiast
   * w systemowym cronie: wgranie kodu na serwer wystarcza, żeby rozliczanie ruszyło,
   * a konfiguracja została w repozytorium.
   */
  startPickSettlementSchedule();
});
