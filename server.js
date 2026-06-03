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
app.use(express.json({ limit: '20mb' }));
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
const POSTS_FILE         = path.join(DATA_DIR, 'posts.json');
const UPLOADS_DIR        = path.join(__dirname, 'uploads');
const FREE_LIMIT      = 100;
const LINK_FREE_LIMIT = 9999; // unlimited for now
const BASE_URL        = process.env.BASE_URL || 'https://www.objematch.com';
const LS_API_KEY    = process.env.LEMONSQUEEZY_API_KEY;
const LS_STORE_ID   = process.env.LEMONSQUEEZY_STORE_ID;
const LS_VARIANTS   = {
  monthly: process.env.LEMONSQUEEZY_VARIANT_MONTHLY,
  weekly:  process.env.LEMONSQUEEZY_VARIANT_WEEKLY,
  daily:   process.env.LEMONSQUEEZY_VARIANT_DAILY,
};

if (!fs.existsSync(DATA_DIR))   fs.mkdirSync(DATA_DIR,   { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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
function getLinkUsage(user) {
  const month = currentMonth();
  if (user.linkAnalysisMonth !== month) return { count: 0, month };
  return { count: user.linkAnalysisCount || 0, month };
}
function canAnalyzeLink(user) {
  if (!user) return { allowed: false, reason: 'login' };
  const usage = getLinkUsage(user);
  if (usage.count >= LINK_FREE_LIMIT) return { allowed: false, reason: 'limit', used: usage.count, limit: LINK_FREE_LIMIT };
  return { allowed: true, used: usage.count, limit: LINK_FREE_LIMIT };
}
function incrementLinkUsage(userId) {
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === userId);
  if (idx !== -1) {
    const usage = getLinkUsage(users[idx]);
    users[idx].linkAnalysisCount = usage.count + 1;
    users[idx].linkAnalysisMonth = usage.month;
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
  // Use Jina AI Reader — bypasses bot protection, works on JS-rendered pages
  const jinaUrl = `https://r.jina.ai/${url}`;
  const r = await fetch(jinaUrl, {
    headers: { 'Accept': 'text/plain', 'X-Timeout': '15' },
    signal: AbortSignal.timeout(20000)
  });
  const text = await r.text();
  return text.slice(0, 5000);
}

async function identifyProduct(pageText, url) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: `You are a price monitoring assistant. Extract info from this listing or product page.

URL: ${url}
Page content: ${pageText}

RULES:
- Extract info if this page is a SINGLE listing or item detail page — this includes: physical products, real estate listings, vehicle listings, classified ads, rental listings, second-hand items, any single item being sold or rented.
- If it is a video, article, blog, social feed, search/results page, or general homepage → {"name":null}
- Extract the exact price or rent amount shown on the page (as-is, e.g. "₺12.500", "$49.99", "€250/ay").
- For real estate/vehicles: include key detail in the name (e.g. "1+1 Daire - Empire Istanbul, Kiralik" or "2020 Toyota Corolla 1.6").
- Do NOT invent or guess. Only return what is clearly on the page.

Return ONLY valid JSON:
{"name":"listing title or item name, or null","currentPrice":"exact price shown or null","available":true}` }]
    })
  });
  const data = await r.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  try { return JSON.parse(match ? match[0] : '{}'); } catch { return {}; }
}

function buildStoreLinks(query) {
  const q = encodeURIComponent(query);
  return [
    { source: 'Amazon',          link: `https://www.amazon.com/s?k=${q}&tag=${AFFILIATE}`,          icon: '🛒' },
    { source: 'eBay',            link: `https://www.ebay.com/sch/i.html?_nkw=${q}`,                 icon: '🔵' },
    { source: 'Walmart',         link: `https://www.walmart.com/search?q=${q}`,                      icon: '🔷' },
    { source: 'Best Buy',        link: `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`,        icon: '💙' },
    { source: 'Target',          link: `https://www.target.com/s?searchTerm=${q}`,                   icon: '🎯' },
    { source: 'Newegg',          link: `https://www.newegg.com/p/pl?d=${q}`,                         icon: '🖥️' },
    { source: 'Google Shopping', link: `https://www.google.com/search?tbm=shop&q=${q}`,              icon: '🛍️' },
    { source: 'Etsy',            link: `https://www.etsy.com/search?q=${q}`,                         icon: '🎨' },
  ].map(s => ({ ...s, title: query, price: null, thumbnail: null }));
}

async function sendLinkAlertEmail(to, productName, sourceUrl, currentPrice, previousPrice) {
  if (!mailer) return;
  const priceBlock = currentPrice
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Current price</div>
        <div style="font-size:28px;font-weight:900;color:#059669">${esc(currentPrice)}</div>
        ${previousPrice && previousPrice !== currentPrice ? `<div style="font-size:12px;color:#9ca3af;margin-top:4px;">Was: ${esc(previousPrice)}</div>` : ''}
      </div>`
    : '';

  await mailer.sendMail({
    from:    `"ObjeMatch" <${process.env.SMTP_USER}>`,
    to,
    subject: `Price update: "${productName}"`,
    html: `<div style="max-width:520px;margin:0 auto;font-family:Inter,Arial,sans-serif;background:#f9fafb;padding:32px 16px;">
      <div style="background:#fff;border-radius:20px;padding:28px;">
        <div style="font-size:20px;font-weight:800;color:#111827;margin-bottom:4px;">🔔 Price update</div>
        <div style="color:#6b7280;font-size:13px;margin-bottom:20px;"><strong>${esc(productName)}</strong> has been checked.</div>
        ${priceBlock}
        <a href="${esc(sourceUrl)}" style="display:block;background:#f97316;color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;text-align:center;margin-bottom:16px;">View product page →</a>
        <div style="font-size:11px;color:#9ca3af">You're watching this link. <a href="${BASE_URL}/dashboard.html" style="color:#6b7280">Manage watches</a></div>
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
      const pageText    = await fetchPageText(watch.url);
      const info        = await identifyProduct(pageText, watch.url);
      const currentPrice = info.currentPrice || null;
      const priceChanged = currentPrice && watch.lastPrice && currentPrice !== watch.lastPrice;
      const firstCheck   = !watch.lastCheckedAt;

      if (priceChanged || firstCheck) {
        const users = readJSON(USERS_FILE);
        const user  = users.find(u => u.id === watch.userId);
        if (user?.email && mailer) {
          await sendLinkAlertEmail(user.email, watch.productName, watch.url, currentPrice, watch.lastPrice);
        }
        const alerts = readJSON(ALERTS_FILE);
        alerts.push({
          id: Date.now().toString(), type: 'link',
          watchId: watch.id, userId: watch.userId,
          productName: watch.productName, sourceUrl: watch.url,
          currentPrice, previousPrice: watch.lastPrice,
          priceChanged, createdAt: new Date().toISOString()
        });
        writeJSON(ALERTS_FILE, alerts);
      }

      const idx = watches.findIndex(w => w.id === watch.id);
      if (idx !== -1) {
        watches[idx].lastCheckedAt = new Date().toISOString();
        watches[idx].nextCheckAt   = getNextCheckAt(watch.frequency);
        if (currentPrice) watches[idx].lastPrice = currentPrice;
        writeJSON(LINK_WATCHES_FILE, watches);
      }
      console.log(`Link watch checked: "${watch.productName}" — ${currentPrice || 'price not found'}${priceChanged ? ' (CHANGED from ' + watch.lastPrice + ')' : ''}`);
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
  const prompt = `You are a world-class product identification expert and visual shopping assistant. Your job is to identify every shoppable item in this photo with maximum specificity.
${yoloContext}
TASK: Identify 5-8 distinct purchasable items. For EACH item follow these rules strictly:

IDENTIFICATION RULES:
- Zoom in mentally on every part of the image — read ALL visible text, logos, labels, model numbers, serial plates
- If you can see a brand → always include it (e.g. "Apple", "Samsung", "IKEA", "Herman Miller")
- If you can see a model → always include it (e.g. "MacBook Pro 16-inch", "Eames Lounge Chair", "KALLAX shelf")
- If no brand visible → describe precisely: material + color + style + category (e.g. "Walnut veneer mid-century 3-drawer dresser")
- NEVER use vague names like "chair", "lamp", "desk". Always add at least 2 descriptors.
- For electronics: include screen size, color, generation if visible
- For furniture: include material, color, approximate size, style era
- For clothing/decor: include color, pattern, material, style

SEARCH QUERY RULES:
- Amazon search: brand + model + key spec (aim to find the exact item on first try)
- eBay search: same but add "used" or "vintage" where appropriate

PRICE RULES:
- Research current realistic market prices — not MSRP, actual sold prices
- Give tight ranges (e.g. "$180-$220" not "$100-$500")

Scan methodically: top-left → top-right → center → bottom-left → bottom-right. Miss nothing.
Coordinates: x=0 far left, x=100 far right, y=0 top, y=100 bottom.

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "room": "Precise space description (e.g. 'Modern Scandinavian Home Office', 'Japanese-style Living Room')",
  "summary": "One specific, vivid sentence describing what you see and its style",
  "problems": [{
    "title": "Brand Model Specific-Name (e.g. Herman Miller Aeron Chair Size B)",
    "type": "present",
    "description": "One-sentence buying tip: what to check for, best place to buy, or what makes this item valuable",
    "x": 50, "y": 50,
    "options": {
      "new":  { "search": "exact amazon search query", "price": "$XX-$XX" },
      "used": { "search": "exact ebay search query", "price": "$XX-$XX" }
    }
  }]
}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 2500,
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

// ── CHAT ROUTE ────────────────────────────────────────────────────────────────
const CHAT_SYSTEM = `You are ObjeMatch, an AI assistant that identifies products from photos and helps users track prices.

When shown a photo:
- Identify EVERY visible shoppable item with maximum specificity (brand + model + key specs if visible)
- For each item give: estimated current market price range
- Format clearly using **bold** for product names and price ranges
- Do NOT include Amazon, eBay or any store links — the user will paste their own preferred store link to track
- End your response by telling the user: "Paste any product link below to set up a price alert — I'll notify you when the price drops."

For follow-up questions: answer helpfully and specifically, referencing what you've already seen.
Keep responses concise and useful. Never be vague about product names or prices.`;

app.post('/api/chat', requireAuth, async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API not configured' });
  const { messages } = req.body;
  if (!messages || !messages.length) return res.status(400).json({ error: 'messages required' });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        stream: true,
        system: CHAT_SYSTEM,
        messages
      })
    });

    if (!upstream.ok) {
      const err = await upstream.json();
      return res.status(500).json({ error: err.error?.message || 'AI error' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); break; }
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.text) {
            res.write(`data: ${JSON.stringify({ delta: { text: json.delta.text } })}\n\n`);
          }
        } catch {}
      }
    }
    res.end();
  } catch (e) {
    console.error('Chat error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Chat failed' });
  }
});

// ── SOCIAL FEED ───────────────────────────────────────────────────────────────
async function extractItemsFromPhoto(base64, mediaType) {
  if (!API_KEY) return [];
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
          { type: 'text', text: 'List the shoppable products in this photo. Return ONLY a JSON array, nothing else. Format: [{"name":"Brand Model","price":"$X-$Y"}]. Max 8 items. If no identifiable products, return [].' }
        ]}]
      })
    });
    const d = await r.json();
    const txt = d.content?.[0]?.text || '[]';
    const items = JSON.parse(txt.match(/\[[\s\S]*\]/)?.[0] || '[]');
    return items.map(item => ({
      ...item,
      amazonUrl: `https://www.amazon.com/s?k=${encodeURIComponent(item.name)}&tag=${AFFILIATE}`,
      clicks: 0
    }));
  } catch { return []; }
}

app.post('/api/posts', requireAuth, async (req, res) => {
  const { base64, mediaType, category } = req.body;
  if (!base64) return res.status(400).json({ error: 'photo required' });

  const filename = `${Date.now()}_${req.user.id}.jpg`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(base64, 'base64'));

  const items = await extractItemsFromPhoto(base64, mediaType || 'image/jpeg');

  const posts = readJSON(POSTS_FILE);
  const post = {
    id: Date.now().toString(),
    userId: req.user.id,
    userName: req.user.name || req.user.email.split('@')[0],
    photoUrl: `/uploads/${filename}`,
    items,
    category: category || 'other',
    wantCount: 0,
    trackCount: 0,
    createdAt: new Date().toISOString()
  };
  posts.unshift(post);
  writeJSON(POSTS_FILE, posts.slice(0, 1000));
  res.json({ post });
});

app.get('/api/feed', (req, res) => {
  const page     = parseInt(req.query.page || '0');
  const limit    = 24;
  const category = req.query.category;
  const q        = (req.query.q || '').toLowerCase();
  let posts = readJSON(POSTS_FILE);
  if (category && category !== 'all') posts = posts.filter(p => p.category === category);
  if (q) posts = posts.filter(p =>
    p.items?.some(i => i.name?.toLowerCase().includes(q)) ||
    p.userName?.toLowerCase().includes(q)
  );
  res.json({ posts: posts.slice(page * limit, (page + 1) * limit), total: posts.length });
});

app.get('/api/posts/:id', (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const post  = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'not found' });
  res.json({ post });
});

app.get('/api/users/:id/posts', (req, res) => {
  const posts = readJSON(POSTS_FILE).filter(p => p.userId === req.params.id);
  res.json({ posts });
});

app.post('/api/posts/:id/want', requireAuth, (req, res) => {
  const posts = readJSON(POSTS_FILE);
  const idx   = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  posts[idx].wantCount = (posts[idx].wantCount || 0) + 1;
  writeJSON(POSTS_FILE, posts);
  res.json({ wantCount: posts[idx].wantCount });
});

// Click tracking redirect
app.get('/api/go/:postId/:itemIdx', (req, res) => {
  const posts   = readJSON(POSTS_FILE);
  const idx     = posts.findIndex(p => p.id === req.params.postId);
  const itemIdx = parseInt(req.params.itemIdx);
  if (idx === -1 || !posts[idx].items?.[itemIdx]) {
    return res.redirect(`https://www.amazon.com/?tag=${AFFILIATE}`);
  }
  posts[idx].items[itemIdx].clicks = (posts[idx].items[itemIdx].clicks || 0) + 1;
  writeJSON(POSTS_FILE, posts);
  res.redirect(posts[idx].items[itemIdx].amazonUrl ||
    `https://www.amazon.com/s?k=${encodeURIComponent(posts[idx].items[itemIdx].name)}&tag=${AFFILIATE}`);
});

// Creator stats
app.get('/api/users/:id/stats', (req, res) => {
  const posts        = readJSON(POSTS_FILE).filter(p => p.userId === req.params.id);
  const totalClicks  = posts.reduce((s, p) => s + (p.items||[]).reduce((ss, i) => ss + (i.clicks||0), 0), 0);
  const totalWants   = posts.reduce((s, p) => s + (p.wantCount||0), 0);
  const estEarnings  = (totalClicks * 0.06).toFixed(2); // ~6 cents avg per click
  res.json({ totalClicks, totalWants, estEarnings, postCount: posts.length });
});

// serve uploads
app.use('/uploads', express.static(UPLOADS_DIR));

// ── LINK TRACKER ROUTES ───────────────────────────────────────────────────────
app.post('/api/link-analyze', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  if (!API_KEY) return res.status(500).json({ error: 'API not configured' });

  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  const users  = readJSON(USERS_FILE);
  const dbUser = users.find(u => u.id === req.user.id);
  const check  = canAnalyzeLink(dbUser);
  if (!check.allowed) {
    return res.status(402).json({ error: 'limit_reached', used: check.used, limit: LINK_FREE_LIMIT });
  }

  try {
    const pageText = await fetchPageText(url);
    console.log(`[link-analyze] url=${url} textLen=${pageText.length} preview=${pageText.slice(0,300)}`);

    const product = await identifyProduct(pageText, url);
    console.log(`[link-analyze] product=${JSON.stringify(product)}`);

    if (!product.name) {
      return res.status(400).json({ error: 'Couldn\'t detect a listing on this page. Make sure the link goes directly to a product or listing detail page.' });
    }

    incrementLinkUsage(req.user.id);
    res.json({ product, used: check.used + 1, limit: LINK_FREE_LIMIT });
  } catch (e) {
    console.error('Link analyze error:', e.message);
    res.status(500).json({ error: 'failed', message: 'Failed to reach this page. Try again or enter details manually.' });
  }
});

app.post('/api/link-watches', requireAuth, (req, res) => {
  const { url, productName, currentPrice, frequency } = req.body;
  if (!url || !productName) return res.status(400).json({ error: 'url and productName required' });

  const watches = readJSON(LINK_WATCHES_FILE);
  const watch = {
    id: Date.now().toString(), userId: req.user.id,
    url, productName,
    lastPrice: currentPrice || null,
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
