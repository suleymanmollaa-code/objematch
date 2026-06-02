const express  = require('express');
const path     = require('path');
const multer   = require('multer');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');

const app = express();

// ── STRIPE WEBHOOK — raw body, must come before express.json() ──────────────
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const Stripe = require('stripe');
  const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: 'Webhook signature failed' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta    = session.metadata || {};

    if (meta.type === 'watch' && meta.userId && meta.itemTitle) {
      // Calculate expiry based on frequency
      const days = { daily: 30, weekly: 30, monthly: 90 };
      const d    = days[meta.frequency] || 30;
      const expiresAt = new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();

      const monitors = readJSON(MONITORS_FILE);
      monitors.push({
        id:           Date.now().toString(),
        userId:       meta.userId,
        itemTitle:    meta.itemTitle,
        itemDesc:     meta.itemDesc || '',
        frequency:    meta.frequency,
        active:       true,
        expiresAt,
        lastCheckedAt: null,
        nextCheckAt:  new Date().toISOString(),
        stripeSessionId: session.id,
        createdAt:    new Date().toISOString()
      });
      writeJSON(MONITORS_FILE, monitors);
      console.log(`Watch created: "${meta.itemTitle}" (${meta.frequency}) for user ${meta.userId}`);
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
const DATA_DIR      = path.join(__dirname, 'data');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const ANALYSES_FILE = path.join(DATA_DIR, 'analyses.json');
const MONITORS_FILE = path.join(DATA_DIR, 'monitors.json');
const FREE_LIMIT    = 100;
const BASE_URL      = process.env.BASE_URL || 'https://www.objematch.com';

// Watch pricing (cents)
const WATCH_PRICES = { daily: 299, weekly: 99, monthly: 49 };
// Watch durations (days)
const WATCH_DAYS   = { daily: 30, weekly: 30, monthly: 90 };

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── DATA HELPERS ──────────────────────────────────────────────────────────────
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── USAGE HELPERS ─────────────────────────────────────────────────────────────
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token expired' });
  }
}
function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); } catch {}
  }
  next();
}

// ── URL HELPERS ───────────────────────────────────────────────────────────────
function amazonUrl(search) { return `https://www.amazon.com/s?k=${encodeURIComponent(search)}&tag=${AFFILIATE}`; }
function ebayUrl(search)   { return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(search)}`; }
function thumbtackUrl(s)   { return `https://www.thumbtack.com/search/?q=${encodeURIComponent(s)}`; }

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

// ── HISTORY ROUTES ────────────────────────────────────────────────────────────
app.get('/api/history', requireAuth, (req, res) => {
  const analyses = readJSON(ANALYSES_FILE);
  const mine = analyses.filter(a => a.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ analyses: mine });
});

app.delete('/api/history/:id', requireAuth, (req, res) => {
  let analyses = readJSON(ANALYSES_FILE);
  analyses = analyses.filter(a => !(a.id === req.params.id && a.userId === req.user.id));
  writeJSON(ANALYSES_FILE, analyses);
  res.json({ ok: true });
});

// ── WATCH ROUTES ──────────────────────────────────────────────────────────────
app.get('/api/watches', requireAuth, (req, res) => {
  const monitors = readJSON(MONITORS_FILE);
  const now      = new Date();
  const mine     = monitors
    .filter(m => m.userId === req.user.id)
    .map(m => ({ ...m, expired: new Date(m.expiresAt) < now }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ watches: mine });
});

app.delete('/api/watches/:id', requireAuth, (req, res) => {
  const monitors = readJSON(MONITORS_FILE);
  const idx = monitors.findIndex(m => m.id === req.params.id && m.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  monitors[idx].active = false;
  writeJSON(MONITORS_FILE, monitors);
  res.json({ ok: true });
});

app.post('/api/watch/checkout', requireAuth, async (req, res) => {
  const { itemTitle, itemDesc, frequency } = req.body;
  if (!itemTitle)    return res.status(400).json({ error: 'itemTitle required' });
  if (!WATCH_PRICES[frequency]) return res.status(400).json({ error: 'Invalid frequency. Use: daily, weekly, monthly' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

  const Stripe = require('stripe');
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const freq_labels = { daily: 'Daily (30 days)', weekly: 'Weekly (30 days)', monthly: 'Monthly (90 days)' };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Watch: "${itemTitle}"`,
            description: `${freq_labels[frequency]} — AI finds new deals automatically`
          },
          unit_amount: WATCH_PRICES[frequency]
        },
        quantity: 1
      }],
      success_url: `${BASE_URL}/watch-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE_URL}/room-analyzer.html`,
      metadata: {
        type:      'watch',
        userId:    req.user.id,
        itemTitle: itemTitle.slice(0, 200),
        itemDesc:  (itemDesc || '').slice(0, 400),
        frequency
      }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Watch checkout error:', err);
    res.status(500).json({ error: err.message || 'Payment setup failed' });
  }
});

// ── AI QUIZ RECOMMENDER ───────────────────────────────────────────────────────
app.post('/api/recommend', async (req, res) => {
  const { room, size, problem, budget, style } = req.body;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const prompt = `You are a home organization expert. A user needs product recommendations.
User's situation: Room: ${room}, Space: ${size}, Problem: ${problem}, Budget: ${budget}, Style: ${style}
Recommend exactly 5 specific Amazon products. Respond ONLY with valid JSON:
{
  "intro": "One sentence intro",
  "products": [{ "name": "Product Name", "reason": "Why perfect", "price": "$XX-$XX", "search": "amazon keywords", "category": "type" }]
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
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

// ── YOLO DETECTION ────────────────────────────────────────────────────────────
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

  // Limit check (100/month for logged-in users)
  if (req.user) {
    const users  = readJSON(USERS_FILE);
    const dbUser = users.find(u => u.id === req.user.id);
    if (dbUser && !canAnalyze(dbUser)) {
      const usage = getUserUsage(dbUser);
      return res.status(402).json({ error: 'limit_reached', used: usage.count, limit: FREE_LIMIT });
    }
  }

  // Image resize
  let imageBuffer = req.file.buffer;
  let mediaType   = req.file.mimetype || 'image/jpeg';
  try {
    const sharp = require('sharp');
    imageBuffer = await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    mediaType = 'image/jpeg';
  } catch(e) { console.error('Sharp error:', e.message); }

  // YOLO
  const yoloObjects = await Promise.race([
    runYolo(imageBuffer),
    new Promise(resolve => setTimeout(() => resolve([]), 8000))
  ]);
  const yoloContext = yoloObjects.length > 0
    ? `\n\nPrecise object detections from YOLO:\n${yoloObjects.map(o => `- ${o.label} at x=${o.x}%, y=${o.y}% (${o.score}%)`).join('\n')}\n`
    : '';

  const base64 = imageBuffer.toString('base64');
  const prompt = `You are a visual shopping assistant. The user uploaded a photo — it could be anything: a room, a car interior, a desk setup, a garage, an outdoor space, a wardrobe, a kitchen counter, anything.
${yoloContext}
Your job: identify EVERY significant object or opportunity in the photo. Be comprehensive — scan the entire image.

Look for:
1. EVERY physical object you can identify (furniture, electronics, tools, clothing, appliances, vehicles, equipment, etc.)
2. EVERY decor or accessory item (lamp, rug, artwork, plants, organizers, etc.)
3. EVERY empty space or missing item that would improve the scene
4. EVERY item that looks worn, outdated, or could be upgraded

Find between 5 and 8 items. Scan every part of the image: top-left, top-right, center, bottom-left, bottom-right.

For each item x and y are percentage coordinates (0-100): x=0 far left, x=100 far right, y=0 top, y=100 bottom.
If YOLO detected this object, use THOSE exact coordinates.

Respond ONLY with valid JSON:
{
  "room": "Space type",
  "summary": "One sentence describing the space",
  "problems": [
    {
      "title": "Exact object name",
      "type": "present",
      "description": "What you see and what to do with it",
      "x": 15, "y": 45,
      "options": {
        "new":    { "search": "amazon keywords", "price": "$XX-$XX" },
        "used":   { "search": "ebay keywords",   "price": "$XX-$XX" },
        "repair": { "search": "thumbtack service", "note": "service type or null" }
      }
    }
  ]
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
      console.error('Anthropic error:', JSON.stringify(errData));
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
      // Save to history
      const analyses = readJSON(ANALYSES_FILE);
      analyses.push({
        id: Date.now().toString(), userId: req.user.id,
        room: parsed.room, summary: parsed.summary, problems: parsed.problems,
        thumbnail: `data:${mediaType};base64,${base64.slice(0, 20000)}`,
        createdAt: new Date().toISOString()
      });
      writeJSON(ANALYSES_FILE, analyses);
      // Increment count
      incrementUsage(req.user.id);
      // Pass usage in response header
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

// ── SELL LISTING GENERATOR ────────────────────────────────────────────────────
app.post('/api/generate-listing', async (req, res) => {
  const { title, description } = req.body;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  if (!title)   return res.status(400).json({ error: 'title required' });

  const prompt = `You are a professional eBay seller who writes high-converting listings.
Item name: ${title}
Context: ${description || ''}

Respond ONLY with valid JSON:
{
  "listingTitle": "Concise eBay title under 80 chars",
  "condition": "Very Good",
  "suggestedPrice": "$XX-$XX",
  "avgSold": "$XX-$XX",
  "description": "2-3 paragraph eBay listing description.",
  "keywords": "ebay search keywords for similar sold listings"
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data?.error?.message || 'AI service error' });
    const text   = data.content[0].text;
    const match  = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    parsed.ebaySearchUrl = ebayUrl(parsed.keywords || title);
    parsed.ebaySellUrl   = `https://www.ebay.com/sell/listing?title=${encodeURIComponent(parsed.listingTitle || title)}`;
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ObjeMatch running on http://localhost:${PORT}`));
