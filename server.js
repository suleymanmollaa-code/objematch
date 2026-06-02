const express    = require('express');
const path       = require('path');
const multer     = require('multer');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const nodemailer = require('nodemailer');

const app = express();

// ── STRIPE WEBHOOK — raw body, must come before express.json() ──────────────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const Stripe = require('stripe');
  const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: 'Webhook signature failed' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta    = session.metadata || {};
    if (meta.type === 'watch' && meta.userId && meta.itemTitle) {
      const monitors = readJSON(MONITORS_FILE);
      monitors.push({
        id:                   Date.now().toString(),
        userId:               meta.userId,
        itemTitle:            meta.itemTitle,
        itemDesc:             meta.itemDesc || '',
        frequency:            meta.frequency,
        active:               true,
        expiresAt:            null,
        lastCheckedAt:        null,
        nextCheckAt:          new Date().toISOString(),
        stripeSessionId:      session.id,
        stripeSubscriptionId: session.subscription || null,
        createdAt:            new Date().toISOString()
      });
      writeJSON(MONITORS_FILE, monitors);
      console.log(`Watch created: "${meta.itemTitle}" (${meta.frequency}) for user ${meta.userId}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub      = event.data.object;
    const monitors = readJSON(MONITORS_FILE);
    const idx      = monitors.findIndex(m => m.stripeSubscriptionId === sub.id);
    if (idx !== -1) {
      monitors[idx].active      = false;
      monitors[idx].cancelledAt = new Date().toISOString();
      writeJSON(MONITORS_FILE, monitors);
    }
  }

  res.json({ received: true });
});

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const upload        = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const API_KEY       = process.env.ANTHROPIC_API_KEY?.replace(/\s/g, '');
const JWT_SECRET    = process.env.JWT_SECRET || 'objematch-secret-2026';
const AFFILIATE     = 'objematch-20';
const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const ANALYSES_FILE = path.join(DATA_DIR, 'analyses.json');
const MONITORS_FILE = path.join(DATA_DIR, 'monitors.json');
const ALERTS_FILE   = path.join(DATA_DIR, 'alerts.json');
const FREE_LIMIT    = 100;
const BASE_URL      = process.env.BASE_URL || 'https://www.objematch.com';
const WATCH_PRICES  = { daily: 299, weekly: 99, monthly: 49 };

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── EMAIL ─────────────────────────────────────────────────────────────────────
let mailer = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  mailer.verify().then(() => console.log('Email ready')).catch(e => console.error('Email error:', e.message));
}

async function sendDealEmail(to, itemTitle, deals) {
  if (!mailer) return;
  const rows = deals.map(d => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:10px;background:#fff;">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#111827;">${esc(d.title)}</div>
      <div style="color:#059669;font-weight:600;font-size:14px;margin-bottom:10px;">${esc(d.price||'')}</div>
      <a href="${d.amazonUrl}" style="background:#ff9900;color:#000;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;margin-right:8px;">Amazon</a>
      <a href="${d.ebayUrl}"   style="background:#e53238;color:#fff;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">eBay</a>
    </div>`).join('');

  await mailer.sendMail({
    from:    `"ObjeMatch" <${process.env.SMTP_USER}>`,
    to,
    subject: `New deals found for "${itemTitle}"`,
    html: `<div style="max-width:520px;margin:0 auto;font-family:Inter,Arial,sans-serif;background:#f9fafb;padding:32px 16px;">
      <div style="background:#fff;border-radius:20px;padding:28px;">
        <div style="font-size:22px;font-weight:800;color:#111827;margin-bottom:6px;">📡 New deals found</div>
        <div style="color:#6b7280;font-size:14px;margin-bottom:24px;">ObjeMatch searched for <strong>${esc(itemTitle)}</strong> and found these options:</div>
        ${rows}
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #f3f4f6;">
          <a href="${BASE_URL}/dashboard.html" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;">View Dashboard</a>
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-top:16px;">You're receiving this because you set a Watch on this item. <a href="${BASE_URL}/dashboard.html" style="color:#6b7280;">Manage watches</a></div>
      </div>
    </div>`
  });
}

// ── DATA HELPERS ──────────────────────────────────────────────────────────────
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── USAGE HELPERS ─────────────────────────────────────────────────────────────
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}
function getUserUsage(user) {
  const month = currentMonth();
  if (user.analysisMonth !== month) return { count: 0, month };
  return { count: user.analysisCount || 0, month };
}
function canAnalyze(user) {
  if (!user) return true;
  return getUserUsage(user).count < FREE_LIMIT;
}
function incrementUsage(userId) {
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    const usage = getUserUsage(users[idx]);
    users[idx].analysisCount = usage.count + 1;
    users[idx].analysisMonth = usage.month;
    writeJSON(USERS_FILE, users);
  }
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token expired' }); }
}
function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); } catch {}
  }
  next();
}

// ── URL HELPERS ───────────────────────────────────────────────────────────────
function amazonUrl(s) { return `https://www.amazon.com/s?k=${encodeURIComponent(s)}&tag=${AFFILIATE}`; }
function ebayUrl(s)   { return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(s)}`; }
function thumbtackUrl(s) { return `https://www.thumbtack.com/search/?q=${encodeURIComponent(s)}`; }

// ── WATCH CRON ────────────────────────────────────────────────────────────────
function getNextCheckAt(frequency) {
  const ms = { daily: 86400000, weekly: 604800000, monthly: 2592000000 };
  return new Date(Date.now() + (ms[frequency] || ms.weekly)).toISOString();
}

async function searchDealsForItem(title, desc) {
  const prompt = `Find the best current Amazon and eBay deals for this item.
Item: ${title}
Context: ${desc || ''}

Return 3-4 specific product recommendations. Respond ONLY with a valid JSON array:
[
  {
    "title": "Specific product name",
    "price": "$XX-$XX",
    "amazonSearch": "exact amazon search keywords",
    "ebaySearch": "exact ebay search keywords",
    "why": "One sentence why this is a good deal"
  }
]`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
  });
  const data  = await r.json();
  const text  = data.content?.[0]?.text || '[]';
  const match = text.match(/\[[\s\S]*\]/);
  const deals = JSON.parse(match ? match[0] : '[]');
  return deals.map(d => ({
    ...d,
    amazonUrl: amazonUrl(d.amazonSearch || title),
    ebayUrl:   ebayUrl(d.ebaySearch || title)
  }));
}

async function runWatchCron() {
  if (!API_KEY) return;
  const monitors = readJSON(MONITORS_FILE);
  const now      = new Date();
  const due      = monitors.filter(m => m.active && (!m.nextCheckAt || new Date(m.nextCheckAt) <= now));

  if (due.length > 0) console.log(`Watch cron: ${due.length} due`);

  for (const monitor of due) {
    try {
      const users = readJSON(USERS_FILE);
      const user  = users.find(u => u.id === monitor.userId);
      if (!user) continue;

      const deals = await searchDealsForItem(monitor.itemTitle, monitor.itemDesc);

      // Save alert
      const alerts = readJSON(ALERTS_FILE);
      alerts.push({
        id:        Date.now().toString(),
        monitorId: monitor.id,
        userId:    monitor.userId,
        itemTitle: monitor.itemTitle,
        deals,
        emailSent: false,
        createdAt: new Date().toISOString()
      });
      writeJSON(ALERTS_FILE, alerts);

      // Send email
      if (user.email && mailer) {
        await sendDealEmail(user.email, monitor.itemTitle, deals);
        const alertIdx = alerts.length - 1;
        alerts[alertIdx].emailSent = true;
        writeJSON(ALERTS_FILE, alerts);
      }

      // Update nextCheckAt
      const idx = monitors.findIndex(m => m.id === monitor.id);
      if (idx !== -1) {
        monitors[idx].lastCheckedAt = new Date().toISOString();
        monitors[idx].nextCheckAt   = getNextCheckAt(monitor.frequency);
        writeJSON(MONITORS_FILE, monitors);
      }

      console.log(`Watch processed: "${monitor.itemTitle}"`);
    } catch (e) {
      console.error(`Watch cron error (${monitor.itemTitle}):`, e.message);
    }
  }
}

// Run every hour, and once 1 minute after startup
setInterval(runWatchCron, 60 * 60 * 1000);
setTimeout(runWatchCron, 60 * 1000);

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || password.length < 6)
    return res.status(400).json({ error: 'Email and password (min 6 chars) required' });

  const users = readJSON(USERS_FILE);
  if (users.find(u => u.email === email.toLowerCase()))
    return res.status(400).json({ error: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now().toString(), email: email.toLowerCase(), name: name || '',
    password: hashed, analysisCount: 0, analysisMonth: currentMonth(),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeJSON(USERS_FILE, users);

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, used: 0, limit: FREE_LIMIT } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.email === email?.toLowerCase());
  if (!user || !await bcrypt.compare(password, user.password))
    return res.status(400).json({ error: 'Invalid email or password' });

  const usage = getUserUsage(user);
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, used: usage.count, limit: FREE_LIMIT } });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const usage = getUserUsage(user);
  res.json({ user: { id: user.id, email: user.email, name: user.name, used: usage.count, limit: FREE_LIMIT } });
});

app.get('/api/user/usage', requireAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const usage = getUserUsage(user);
  res.json({ used: usage.count, limit: FREE_LIMIT });
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, (req, res) => {
  const uid      = req.user.id;
  const now      = new Date();
  const users    = readJSON(USERS_FILE);
  const user     = users.find(u => u.id === uid);
  const usage    = user ? getUserUsage(user) : { count: 0 };

  const monitors = readJSON(MONITORS_FILE)
    .filter(m => m.userId === uid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const alerts   = readJSON(ALERTS_FILE)
    .filter(a => a.userId === uid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);

  const analyses = readJSON(ANALYSES_FILE)
    .filter(a => a.userId === uid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map(a => ({ id: a.id, room: a.room, summary: a.summary, createdAt: a.createdAt, thumbnail: a.thumbnail }));

  res.json({
    user: { id: user?.id, email: user?.email, name: user?.name, used: usage.count, limit: FREE_LIMIT },
    watches: monitors,
    alerts,
    analyses
  });
});

// ── HISTORY ROUTES ────────────────────────────────────────────────────────────
app.get('/api/history', requireAuth, (req, res) => {
  const analyses = readJSON(ANALYSES_FILE)
    .filter(a => a.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ analyses });
});

app.delete('/api/history/:id', requireAuth, (req, res) => {
  let analyses = readJSON(ANALYSES_FILE);
  analyses = analyses.filter(a => !(a.id === req.params.id && a.userId === req.user.id));
  writeJSON(ANALYSES_FILE, analyses);
  res.json({ ok: true });
});

// ── WATCH ROUTES ──────────────────────────────────────────────────────────────
app.get('/api/watches', requireAuth, (req, res) => {
  const monitors = readJSON(MONITORS_FILE)
    .filter(m => m.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ watches: monitors });
});

app.delete('/api/watches/:id', requireAuth, async (req, res) => {
  const monitors = readJSON(MONITORS_FILE);
  const idx = monitors.findIndex(m => m.id === req.params.id && m.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const subId = monitors[idx].stripeSubscriptionId;
  if (subId && process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = require('stripe');
      await Stripe(process.env.STRIPE_SECRET_KEY).subscriptions.cancel(subId);
    } catch (e) { console.error('Stripe cancel:', e.message); }
  }

  monitors[idx].active      = false;
  monitors[idx].cancelledAt = new Date().toISOString();
  writeJSON(MONITORS_FILE, monitors);
  res.json({ ok: true });
});

app.post('/api/watch/checkout', requireAuth, async (req, res) => {
  // Watch payments are not yet enabled — return coming-soon flag
  if (process.env.WATCHES_ENABLED !== 'true') {
    return res.status(503).json({ comingSoon: true, message: 'Watch subscriptions launching soon!' });
  }

  const { itemTitle, itemDesc, frequency } = req.body;
  if (!itemTitle)              return res.status(400).json({ error: 'itemTitle required' });
  if (!WATCH_PRICES[frequency]) return res.status(400).json({ error: 'Invalid frequency' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  const Stripe = require('stripe');
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const users  = readJSON(USERS_FILE);
  const user   = users.find(u => u.id === req.user.id);
  const freq_labels = { daily: 'Daily checks', weekly: 'Weekly checks', monthly: 'Monthly checks' };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Watch: "${itemTitle}"`, description: `${freq_labels[frequency]} — AI finds deals automatically` },
          unit_amount: WATCH_PRICES[frequency],
          recurring: { interval: 'month' }
        },
        quantity: 1
      }],
      customer_email: user?.email,
      success_url: `${BASE_URL}/watch-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE_URL}/room-analyzer.html`,
      metadata: { type: 'watch', userId: req.user.id, itemTitle: itemTitle.slice(0,200), itemDesc: (itemDesc||'').slice(0,400), frequency },
      subscription_data: { metadata: { userId: req.user.id, itemTitle: itemTitle.slice(0,200), frequency } }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Watch checkout error:', err);
    res.status(500).json({ error: err.message || 'Payment setup failed' });
  }
});

// ── AI RECOMMEND ──────────────────────────────────────────────────────────────
app.post('/api/recommend', async (req, res) => {
  const { room, size, problem, budget, style } = req.body;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  const prompt = `You are a home organization expert. Recommend 5 Amazon products.
Room: ${room}, Space: ${size}, Problem: ${problem}, Budget: ${budget}, Style: ${style}
Respond ONLY with JSON: { "intro": "...", "products": [{ "name": "...", "reason": "...", "price": "$XX-$XX", "search": "...", "category": "..." }] }`;
  try {
    const r    = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    const data  = await r.json();
    const text  = data.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    res.json(JSON.parse(match ? match[0] : text));
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── YOLO ─────────────────────────────────────────────────────────────────────
let _detector = null;
async function runYolo(imageBuffer) {
  try {
    const { pipeline, RawImage } = await import('@huggingface/transformers');
    if (!_detector) {
      process.env.HF_HOME = process.env.HF_HOME || '/tmp/hf-cache';
      _detector = await pipeline('object-detection', 'Xenova/yolov8n', { device: 'cpu' });
    }
    const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    const img     = await RawImage.fromURL(dataUrl);
    const results = await _detector(img, { threshold: 0.35 });
    return results.map(r => ({
      label: r.label, score: Math.round(r.score * 100),
      x: Math.round(((r.box.xmin + r.box.xmax) / 2) / img.width  * 100),
      y: Math.round(((r.box.ymin + r.box.ymax) / 2) / img.height * 100),
    }));
  } catch (e) { console.error('YOLO error:', e.message); return []; }
}

// ── AI ANALYZER ───────────────────────────────────────────────────────────────
app.post('/api/analyze-room', upload.single('photo'), optionalAuth, async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  if (req.user) {
    const users  = readJSON(USERS_FILE);
    const dbUser = users.find(u => u.id === req.user.id);
    if (dbUser && !canAnalyze(dbUser)) {
      const usage = getUserUsage(dbUser);
      return res.status(402).json({ error: 'limit_reached', used: usage.count, limit: FREE_LIMIT });
    }
  }

  let imageBuffer = req.file.buffer;
  let mediaType   = req.file.mimetype || 'image/jpeg';
  try {
    const sharp = require('sharp');
    imageBuffer = await sharp(req.file.buffer).resize(1200,1200,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
    mediaType = 'image/jpeg';
  } catch(e) { console.error('Sharp error:', e.message); }

  const yoloObjects = await Promise.race([runYolo(imageBuffer), new Promise(r => setTimeout(() => r([]), 8000))]);
  const yoloContext = yoloObjects.length > 0
    ? `\n\nYOLO detections:\n${yoloObjects.map(o => `- ${o.label} at x=${o.x}%, y=${o.y}% (${o.score}%)`).join('\n')}\n`
    : '';

  const base64 = imageBuffer.toString('base64');
  const prompt = `You are a visual shopping assistant. The user uploaded a photo — it could be anything: a room, a car interior, a desk setup, a garage, an outdoor space, a wardrobe, a kitchen counter, anything.
${yoloContext}
Identify EVERY significant object. Find 5-8 items. Scan top-left, top-right, center, bottom-left, bottom-right.
Coordinates: x=0 far left, x=100 far right, y=0 top, y=100 bottom. Use YOLO coordinates when available.

Respond ONLY with valid JSON:
{
  "room": "Space type",
  "summary": "One sentence",
  "problems": [{
    "title": "Exact object name",
    "type": "present",
    "description": "What to do with it",
    "x": 50, "y": 50,
    "options": {
      "new":    { "search": "amazon keywords", "price": "$XX-$XX" },
      "used":   { "search": "ebay keywords",   "price": "$XX-$XX" },
      "repair": { "search": "thumbtack service", "note": "service type" }
    }
  }]
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt }
        ]}]
      }),
    });

    if (!r.ok) {
      const errData = await r.json();
      return res.status(500).json({ error: 'AI service error', detail: errData });
    }

    const data   = await r.json();
    const text   = data.content[0].text;
    const match  = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);

    parsed.problems = parsed.problems.map(p => ({
      ...p,
      options: {
        new:    { ...p.options?.new,    url: amazonUrl(p.options?.new?.search    || p.title) },
        used:   { ...p.options?.used,   url: ebayUrl(p.options?.used?.search     || p.title) },
        repair: { ...p.options?.repair, url: thumbtackUrl(p.options?.repair?.search || p.title) }
      }
    }));

    if (req.user) {
      const analyses = readJSON(ANALYSES_FILE);
      analyses.push({
        id: Date.now().toString(), userId: req.user.id,
        room: parsed.room, summary: parsed.summary, problems: parsed.problems,
        thumbnail: `data:${mediaType};base64,${base64.slice(0, 20000)}`,
        createdAt: new Date().toISOString()
      });
      writeJSON(ANALYSES_FILE, analyses);
      incrementUsage(req.user.id);

      const users  = readJSON(USERS_FILE);
      const dbUser = users.find(u => u.id === req.user.id);
      if (dbUser) {
        const usage = getUserUsage(dbUser);
        res.setHeader('X-Usage-Used',  String(usage.count));
        res.setHeader('X-Usage-Limit', String(FREE_LIMIT));
      }
    }

    res.json(parsed);
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ── SELL LISTING ──────────────────────────────────────────────────────────────

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ObjeMatch running on http://localhost:${PORT}`));
