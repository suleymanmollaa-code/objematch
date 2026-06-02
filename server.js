const express  = require('express');
const path     = require('path');
const multer   = require('multer');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const upload       = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const API_KEY      = process.env.ANTHROPIC_API_KEY?.replace(/\s/g, '');
const JWT_SECRET   = process.env.JWT_SECRET || 'objematch-secret-2026';
const AFFILIATE    = 'objematch-20';
const DATA_DIR     = path.join(__dirname, 'data');
const USERS_FILE   = path.join(DATA_DIR, 'users.json');
const ANALYSES_FILE= path.join(DATA_DIR, 'analyses.json');

// ── DATA HELPERS ───────────────────────────────────────────
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── AUTH MIDDLEWARE ────────────────────────────────────────
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

function amazonUrl(search) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(search)}&tag=${AFFILIATE}`;
}

// ── AUTH ROUTES ────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || password.length < 6)
    return res.status(400).json({ error: 'Email and password (min 6 chars) required' });

  const users = readJSON(USERS_FILE);
  if (users.find(u => u.email === email.toLowerCase()))
    return res.status(400).json({ error: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), email: email.toLowerCase(), name: name || '', password: hashed, createdAt: new Date().toISOString() };
  users.push(user);
  writeJSON(USERS_FILE, users);

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.email === email?.toLowerCase());
  if (!user || !await bcrypt.compare(password, user.password))
    return res.status(400).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── HISTORY ROUTES ─────────────────────────────────────────
app.get('/api/history', requireAuth, (req, res) => {
  const analyses = readJSON(ANALYSES_FILE);
  const mine = analyses.filter(a => a.userId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ analyses: mine });
});

app.delete('/api/history/:id', requireAuth, (req, res) => {
  let analyses = readJSON(ANALYSES_FILE);
  analyses = analyses.filter(a => !(a.id === req.params.id && a.userId === req.user.id));
  writeJSON(ANALYSES_FILE, analyses);
  res.json({ ok: true });
});

// ── AI QUIZ RECOMMENDER ────────────────────────────────────
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
    const data = await r.json();
    const text = data.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    res.json(JSON.parse(match ? match[0] : text));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── AI ROOM ANALYZER (Vision) ──────────────────────────────
app.post('/api/analyze-room', upload.single('photo'), optionalAuth, async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  // Resize large images to stay within API limits
  let imageBuffer = req.file.buffer;
  let mediaType = req.file.mimetype || 'image/jpeg';

  try {
    const sharp = require('sharp');
    imageBuffer = await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    mediaType = 'image/jpeg';
  } catch(e) {
    console.error('Sharp error:', e.message);
    // sharp failed, use original
  }

  const base64 = imageBuffer.toString('base64');

  const prompt = `You are an expert interior designer and home stylist analyzing a room photo. Look very carefully at the image.

Identify exactly 3 specific opportunities to IMPROVE this space. These can be:
- Empty walls that need art, mirrors, shelves, or wall decor
- Furniture gaps (missing chair, side table, rug, lamp, nightstand, etc.)
- Clutter or storage problems that need organizers
- Style upgrades (plain area needs decor, lighting is poor, etc.)
- Better use of existing space (closet system, drawer organizers, etc.)

For each opportunity, recommend 1-2 specific products — NOT just organizers:
- Empty wall → wall art, floating shelf, mirror, wall clock
- Missing seating → chair, ottoman, bench
- Poor lighting → floor lamp, table lamp, LED strips
- No rug → area rug
- Desk area → ergonomic chair, monitor stand, desk lamp
- Bare corner → plant, floor lamp, accent chair

Respond ONLY with valid JSON:
{
  "room": "Room type",
  "summary": "One sentence describing the room and main improvement opportunity",
  "problems": [
    {
      "title": "Short title (e.g. Empty Wall, Missing Rug)",
      "description": "What you see and why this product improves the space",
      "x": 45,
      "y": 60,
      "products": [
        { "name": "Specific real product name", "search": "amazon keywords", "price": "$XX-$XX", "why": "Why it fits this space" }
      ]
    }
  ]
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
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
    const data  = await r.json();
    const text  = data.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);

    parsed.problems = parsed.problems.map(p => ({
      ...p,
      products: p.products.map(prod => ({ ...prod, url: amazonUrl(prod.search) }))
    }));

    // Save to history if user logged in
    if (req.user) {
      const analyses = readJSON(ANALYSES_FILE);
      const photoB64 = `data:${mediaType};base64,${base64.slice(0, 20000)}`; // thumbnail
      analyses.push({
        id: Date.now().toString(),
        userId: req.user.id,
        room: parsed.room,
        summary: parsed.summary,
        problems: parsed.problems,
        thumbnail: photoB64,
        createdAt: new Date().toISOString()
      });
      writeJSON(ANALYSES_FILE, analyses);
    }

    res.json(parsed);
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ObjeMatch running on http://localhost:${PORT}`));
