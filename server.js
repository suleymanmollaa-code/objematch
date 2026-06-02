const express    = require('express');
const path       = require('path');
const multer     = require('multer');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');

const app = express();

// ── LEMONSQUEEZY WEBHOOK — raw body, must come before express.json() ─────────
app.post('/api/lemonsqueezy/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (secret) {
    const sig  = req.headers['x-signature'];
    const hmac = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (sig !== hmac) {
      console.error('LS webhook signature mismatch');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  let payload;
  try { payload = JSON.parse(req.body.toString()); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const event  = payload?.meta?.event_name;
  const custom = payload?.meta?.custom_data || {};
  const data   = payload?.data?.attributes || {};
  const lsId   = payload?.data?.id;

  if (event === 'subscription_created' && custom.userId && custom.itemTitle) {
    const monitors = readJSON(MONITORS_FILE);
    monitors.push({
      id:           Date.now().toString(),
      userId:       custom.userId,
      itemTitle:    custom.itemTitle,
      itemDesc:     custom.itemDesc || '',
      frequency:    custom.frequency,
      active:       true,
      expiresAt:    null,
      lastCheckedAt: null,
      nextCheckAt:  new Date().toISOString(),
      lsSubscriptionId: lsId || null,
      createdAt:    new Date().toISOString()
    });
    writeJSON(MONITORS_FILE, monitors);
    console.log(`Watch created: "${custom.itemTitle}" (${custom.frequency}) for user ${custom.userId}`);
  }

  if (event === 'subscription_cancelled' || event === 'subscription_expired') {
    const monitors = readJSON(MONITORS_FILE);
    const idx      = monitors.findIndex(m => m.lsSubscriptionId === lsId);
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
const DATA_DIR           = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE         = path.join(DATA_DIR, 'users.json');
const ANALYSES_FILE      = path.join(DATA_DIR, 'analyses.json');
const MONITORS_FILE      = path.join(DATA_DIR, 'monitors.json');
const ALERTS_FILE        = path.join(DATA_DIR, 'alerts.json');
const LINK_WATCHES_FILE  = path.join(DATA_DIR, 'link-watches.json');
const SERPAPI_KEY        = process.env.SERPAPI_KEY;
const FREE_LIMIT    = 100;
const BASE_URL      = process.env.BASE_URL || 'https://www.objematch.com';
const LS_API_KEY    = process.env.LEMONSQUEEZY_API_KEY;
const LS_STORE_ID   = process.env.LEMONSQUEEZY_STORE_ID;
const LS_VARIANTS   = {
  monthly: process.env.LEMONSQUEEZY_VARIANT_MONTHLY,
  weekly:  process.env.LEMONSQUEEZY_VARIANT_WEEKLY,
  daily:   process.env.LEMONSQUEEZY_VARIANT_DAILY,
};

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

// ── LINK TRACKER HELPERS ──────────────────────────────────────────────────────
async function fetchPageText(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(12000)
  });
  const html = await r.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

async function identifyProduct(pageText, url) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: `Identify the main product on this webpage.
URL: ${url}
Content: ${pageText}

Respond ONLY with JSON:
{"name":"product name with brand and model","searchQuery":"best Google Shopping search query","category":"product category","estimatedPrice":"$XX-$XX or null"}` }]
    })
  });
  const data = await r.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(match ? match[0] : '{}'); } catch { return {}; }
}

async function searchShopping(query) {
  if (SERPAPI_KEY) {
    try {
      const r = await fetch(`https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&num=10`);
      const data = await r.json();
      if (data.shopping_results?.length) {
        return data.shopping_results.slice(0, 8).map(item => ({
          title: item.title, price: item.price, source: item.source,
          link: item.link, thumbnail: item.thumbnail,
          rating: item.rating, reviews: item.reviews
        }));
      }
    } catch (e) { console.error('SerpAPI error:', e.message); }
  }
  // Fallback: Claude-generated seller list
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 600,
      messages: [{ role: 'user', content: `For this product: "${query}"
List 6 places where it can be purchased online with realistic prices.
Respond ONLY with JSON array:
[{"title":"product name","price":"$XX","source":"Store name","link":"https://...","thumbnail":null}]
Use real stores: Amazon, eBay, Walmart, Target, Best Buy, Newegg, etc.` }]
    })
  });
  const data = await r.json();
  const text = data.content?.[0]?.text || '[]';
  const match = text.match(/\[[\s\S]*\]/);
  try { return JSON.parse(match ? match[0] : '[]'); } catch { return []; }
}

async function sendLinkAlertEmail(to, productName, sourceUrl, sellers) {
  if (!mailer || !sellers.length) return;
  const rows = sellers.slice(0, 5).map(s => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:8px;background:#fff;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;font-weight:700;color:#111827">${esc(s.source || '')}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(s.title || '')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:800;color:#059669">${esc(s.price || '')}</div>
        ${s.link ? `<a href="${s.link}" style="font-size:11px;color:#f97316;font-weight:600">View →</a>` : ''}
      </div>
    </div>`).join('');

  await mailer.sendMail({
    from:    `"ObjeMatch" <${process.env.SMTP_USER}>`,
    to,
    subject: `Price update: "${productName}"`,
    html: `<div style="max-width:520px;margin:0 auto;font-family:Inter,Arial,sans-serif;background:#f9fafb;padding:32px 16px;">
      <div style="background:#fff;border-radius:20px;padding:28px;">
        <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:4px;">🔔 Price update</div>
        <div style="color:#6b7280;font-size:13px;margin-bottom:20px;">Here's where <strong>${esc(productName)}</strong> is selling right now:</div>
        ${rows}
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #f3f4f6;">
          <a href="${BASE_URL}/link-tracker.html" style="background:#f97316;color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;">Open Link Tracker</a>
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-top:14px">You're watching this product. <a href="${BASE_URL}/dashboard.html" style="color:#6b7280">Manage watches</a></div>
      </div>
    </div>`
  });
}


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

async function runLinkWatchCron() {
  if (!API_KEY) return;
  const watches = readJSON(LINK_WATCHES_FILE);
  const now = new Date();
  const due = watches.filter(w => w.active && (!w.nextCheckAt || new Date(w.nextCheckAt) <= now));
  if (due.length > 0) console.log(`Link watch cron: ${due.length} due`);

  for (const watch of due) {
    try {
      const sellers = await searchShopping(watch.searchQuery || watch.productName);
      const alerts  = readJSON(ALERTS_FILE);
      alerts.push({
        id: Date.now().toString(), type: 'link',
        watchId: watch.id, userId: watch.userId,
        productName: watch.productName, sourceUrl: watch.url,
        sellers, createdAt: new Date().toISOString()
      });
      writeJSON(ALERTS_FILE, alerts);

      const users = readJSON(USERS_FILE);
      const user  = users.find(u => u.id === watch.userId);
      if (user?.email && mailer) {
        await sendLinkAlertEmail(user.email, watch.productName, watch.url, sellers);
      }

      const idx = watches.findIndex(w => w.id === watch.id);
      if (idx !== -1) {
        watches[idx].lastCheckedAt = new Date().toISOString();
        watches[idx].nextCheckAt   = getNextCheckAt(watch.frequency);
        writeJSON(LINK_WATCHES_FILE, watches);
      }
      console.log(`Link watch processed: "${watch.productName}"`);
    } catch (e) { console.error('Link watch cron error:', e.message); }
  }
}

// Run every hour, and once 1 minute after startup
setInterval(() => { runWatchCron(); runLinkWatchCron(); }, 60 * 60 * 1000);
setTimeout(() => { runWatchCron(); runLinkWatchCron(); }, 60 * 1000);

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

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  const { email, name, notifPrefs } = req.body;
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  if (email) {
    const normalized = email.toLowerCase().trim();
    if (users.find(u => u.email === normalized && u.id !== req.user.id))
      return res.status(400).json({ error: 'Email already in use' });
    users[idx].email = normalized;
  }
  if (name !== undefined) users[idx].name = name;
  if (notifPrefs !== undefined) users[idx].notifPrefs = notifPrefs;
  writeJSON(USERS_FILE, users);

  const newToken = jwt.sign(
    { id: users[idx].id, email: users[idx].email, name: users[idx].name },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token: newToken, user: { id: users[idx].id, email: users[idx].email, name: users[idx].name } });
});

app.put('/api/auth/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Invalid request' });

  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const valid = await bcrypt.compare(currentPassword, users[idx].password);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

  users[idx].password = await bcrypt.hash(newPassword, 10);
  writeJSON(USERS_FILE, users);
  res.json({ ok: true });
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
    .map(a => ({
      id: a.id, room: a.room, summary: a.summary, createdAt: a.createdAt, thumbnail: a.thumbnail,
      problems: (a.problems||[]).map(p => ({
        title: p.title,
        options: {
          new:  { url: p.options?.new?.url,  price: p.options?.new?.price },
          used: { url: p.options?.used?.url }
        }
      }))
    }));

  res.json({
    user: { id: user?.id, email: user?.email, name: user?.name, used: usage.count, limit: FREE_LIMIT, notifPrefs: user?.notifPrefs || {} },
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

  const subId = monitors[idx].lsSubscriptionId;
  if (subId && LS_API_KEY) {
    try {
      await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${LS_API_KEY}`, Accept: 'application/vnd.api+json' }
      });
    } catch (e) { console.error('LS cancel error:', e.message); }
  }

  monitors[idx].active      = false;
  monitors[idx].cancelledAt = new Date().toISOString();
  writeJSON(MONITORS_FILE, monitors);
  res.json({ ok: true });
});

app.post('/api/watch/checkout', requireAuth, async (req, res) => {
  if (process.env.WATCHES_ENABLED !== 'true') {
    return res.status(503).json({ comingSoon: true, message: 'Watch subscriptions launching soon!' });
  }

  const { itemTitle, itemDesc, frequency } = req.body;
  if (!itemTitle)             return res.status(400).json({ error: 'itemTitle required' });
  if (!LS_VARIANTS[frequency]) return res.status(400).json({ error: 'Invalid frequency' });
  if (!LS_API_KEY || !LS_STORE_ID) return res.status(500).json({ error: 'Payment not configured' });

  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.id === req.user.id);

  try {
    const r = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${LS_API_KEY}`,
        Accept:         'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email:  user?.email || undefined,
              custom: {
                userId:    req.user.id,
                itemTitle: itemTitle.slice(0, 200),
                itemDesc:  (itemDesc || '').slice(0, 400),
                frequency,
              }
            },
            product_options: {
              redirect_url: `${BASE_URL}/watch-success.html`,
            }
          },
          relationships: {
            store:   { data: { type: 'stores',   id: String(LS_STORE_ID) } },
            variant: { data: { type: 'variants',  id: String(LS_VARIANTS[frequency]) } },
          }
        }
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('LS checkout error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Payment setup failed' });
    }

    res.json({ url: data.data?.attributes?.url });
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
  const prompt = `You are an expert visual shopping assistant. Analyze this photo carefully.
${yoloContext}
TASK: Identify 5-8 distinct, shoppable objects. For each object:
- Read any visible brand names, logos, or model numbers
- Give the most specific name possible (e.g. "Herman Miller Aeron Chair" not just "chair")
- Estimate realistic current market price ranges
- Write Amazon search keywords that would find that exact item (include brand + model if visible)
- Write eBay search keywords optimized for used/second-hand results

Scan all areas: top-left, top-right, center, bottom-left, bottom-right. Do not miss large furniture, electronics, or appliances.
Coordinates: x=0 far left, x=100 far right, y=0 top, y=100 bottom. Use YOLO coordinates when available.

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "room": "Specific space type (e.g. Modern Home Office, Car Interior, Kitchen)",
  "summary": "One engaging sentence about what you see",
  "problems": [{
    "title": "Brand + specific product name if visible, otherwise descriptive name",
    "type": "present",
    "description": "Brief buying tip or what to look for",
    "x": 50, "y": 50,
    "options": {
      "new":  { "search": "brand model specific amazon search terms", "price": "$XX-$XX" },
      "used": { "search": "brand model specific ebay used search terms", "price": "$XX-$XX" }
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
        new:  { ...p.options?.new,  url: amazonUrl(p.options?.new?.search  || p.title) },
        used: { ...p.options?.used, url: ebayUrl(p.options?.used?.search   || p.title) }
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

// ── LINK TRACKER ROUTES ───────────────────────────────────────────────────────
app.post('/api/link-analyze', optionalAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  if (!API_KEY) return res.status(500).json({ error: 'API not configured' });

  try {
    new URL(url); // validate URL
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const pageText = await fetchPageText(url);
    const product  = await identifyProduct(pageText, url);
    if (!product.name) return res.status(400).json({ error: 'Could not identify a product on this page' });

    const sellers = await searchShopping(product.searchQuery || product.name);
    res.json({ product, sellers });
  } catch (e) {
    console.error('Link analyze error:', e.message);
    res.status(500).json({ error: 'Failed to analyze link' });
  }
});

app.post('/api/link-watches', requireAuth, (req, res) => {
  const { url, productName, searchQuery, frequency } = req.body;
  if (!url || !productName) return res.status(400).json({ error: 'url and productName required' });

  const watches = readJSON(LINK_WATCHES_FILE);
  const watch = {
    id: Date.now().toString(), userId: req.user.id,
    url, productName, searchQuery: searchQuery || productName,
    frequency: ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'daily',
    active: true, lastCheckedAt: null,
    nextCheckAt: getNextCheckAt(frequency || 'daily'),
    createdAt: new Date().toISOString()
  };
  watches.push(watch);
  writeJSON(LINK_WATCHES_FILE, watches);
  res.json({ watch });
});

app.get('/api/link-watches', requireAuth, (req, res) => {
  const watches = readJSON(LINK_WATCHES_FILE)
    .filter(w => w.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ watches });
});

app.delete('/api/link-watches/:id', requireAuth, (req, res) => {
  const watches = readJSON(LINK_WATCHES_FILE);
  const idx = watches.findIndex(w => w.id === req.params.id && w.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  watches[idx].active = false;
  writeJSON(LINK_WATCHES_FILE, watches);
  res.json({ ok: true });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ObjeMatch running on http://localhost:${PORT}`));
