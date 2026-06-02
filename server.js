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
function ebayUrl(search) {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(search)}`;
}
function thumbtackUrl(search) {
  return `https://www.thumbtack.com/search/?q=${encodeURIComponent(search)}`;
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

// ── YOLO DETECTION HELPER ──────────────────────────────────
let _detector = null;
async function runYolo(imageBuffer) {
  try {
    const { pipeline, RawImage } = await import('@huggingface/transformers');
    if (!_detector) {
      process.env.HF_HOME = process.env.HF_HOME || '/tmp/hf-cache';
      _detector = await pipeline('object-detection', 'Xenova/yolov8n', { device: 'cpu' });
    }
    // Convert buffer to base64 data URL for RawImage
    const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    const img = await RawImage.fromURL(dataUrl);
    const results = await _detector(img, { threshold: 0.35 });
    // Normalize boxes to 0-100 percentage coords (center x,y)
    return results.map(r => ({
      label: r.label,
      score: Math.round(r.score * 100),
      x: Math.round(((r.box.xmin + r.box.xmax) / 2) / img.width  * 100),
      y: Math.round(((r.box.ymin + r.box.ymax) / 2) / img.height * 100),
    }));
  } catch (e) {
    console.error('YOLO error:', e.message);
    return [];
  }
}

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
  }

  // Run YOLO detection for precise object coordinates (8s timeout, non-blocking)
  const yoloObjects = await Promise.race([
    runYolo(imageBuffer),
    new Promise(resolve => setTimeout(() => resolve([]), 8000))
  ]);
  const yoloContext = yoloObjects.length > 0
    ? `\n\nPrecise object detections from YOLO (use these x,y coordinates for pins):\n${yoloObjects.map(o => `- ${o.label} at x=${o.x}%, y=${o.y}% (confidence ${o.score}%)`).join('\n')}\n`
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

Find between 5 and 8 items. Do NOT stop at 3. Scan every part of the image systematically: top-left, top-right, center, bottom-left, bottom-right.

For each item, set x and y as percentage coordinates (0-100) indicating where on the image that object is located:
- x=0 is far left, x=100 is far right
- y=0 is top, y=100 is bottom
- If YOLO detected this object above, use THOSE exact coordinates for the pin
- Place the coordinate ON the object itself, not near it

Respond ONLY with valid JSON:
{
  "room": "Space type",
  "summary": "One sentence describing the space",
  "problems": [
    {
      "title": "Exact object name (e.g. White Wardrobe, Desk Chair, Empty Wall Above Desk)",
      "type": "present",
      "description": "What you see and what to do with it",
      "x": 15,
      "y": 45,
      "options": {
        "new": { "search": "specific amazon search keywords", "price": "$XX-$XX" },
        "used": { "search": "specific ebay search keywords", "price": "$XX-$XX" },
        "repair": { "search": "thumbtack service", "note": "assembly, painting, etc or null" }
      }
    }
  ]
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
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
      options: {
        new:    { ...p.options?.new,    url: amazonUrl(p.options?.new?.search || p.title) },
        used:   { ...p.options?.used,   url: ebayUrl(p.options?.used?.search || p.title) },
        repair: { ...p.options?.repair, url: thumbtackUrl(p.options?.repair?.search || p.title) }
      }
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

// ── SELL LISTING GENERATOR ─────────────────────────────────
app.post('/api/generate-listing', async (req, res) => {
  const { title, description } = req.body;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  if (!title)   return res.status(400).json({ error: 'title required' });

  const prompt = `You are a professional eBay seller who writes high-converting listings.
Generate a compelling eBay listing for this item.
Item name: ${title}
Context: ${description || ''}

Respond ONLY with valid JSON:
{
  "listingTitle": "Concise eBay listing title under 80 characters, include brand/condition if known",
  "condition": "Very Good",
  "suggestedPrice": "$XX-$XX",
  "avgSold": "$XX-$XX",
  "description": "2-3 paragraph eBay listing description. Start with a hook, describe condition, list features, end with shipping note.",
  "keywords": "best search keywords to find similar sold listings on eBay"
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await r.json();
    const text = data.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    parsed.ebaySearchUrl = ebayUrl(parsed.keywords || title);
    parsed.ebaySellUrl = `https://www.ebay.com/sell/listing?title=${encodeURIComponent(parsed.listingTitle || title)}`;
    res.json(parsed);
  } catch (err) {
    console.error('Listing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ObjeMatch running on http://localhost:${PORT}`));
