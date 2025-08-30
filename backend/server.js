require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const SessionStore = require('./sessionStore');

const app = express();
const PORT = process.env.PORT || 8080;
const APP_ID = process.env.DERIV_APP_ID;
const SESSION_SECRET = process.env.SESSION_SECRET;

const store = new SessionStore(APP_ID);

// --- Middlewares
app.use(express.json());
app.use(cookieParser(SESSION_SECRET));
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);

function getOrCreateSession(req, res) {
  let sid = req.signedCookies.sid;
  if (!sid) {
    sid = crypto.randomBytes(24).toString('hex');
    res.cookie('sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // set true behind HTTPS/proxy in production
      signed: true,
      maxAge: 1000 * 60 * 60 * 8,
    });
  }
  return sid;
}

function requireClient(req, res, next) {
  const sid = req.signedCookies.sid;
  const client = sid ? store.get(sid) : null;
  if (!client) return res.status(401).json({ error: 'Not authenticated' });
  req.deriv = client;
  next();
}

// --- Auth endpoints
app.post('/api/login', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  const sid = getOrCreateSession(req, res);
  store.set(sid, token);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const sid = req.signedCookies.sid;
  if (sid) store.delete(sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

// --- Generic Deriv call proxy
app.post('/api/deriv', requireClient, async (req, res) => {
  try {
    const out = await req.deriv.call(req.body);
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err });
  }
});

// --- Ticks SSE stream
app.get('/api/stream/ticks', requireClient, async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sub = req.deriv.subscribe({ ticks: symbol, subscribe: 1 }, (msg) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  });

  req.on('close', () => {
    sub.unsubscribe();
  });
});

app.listen(PORT, () => {
  console.log('Backend listening on', PORT);
});
