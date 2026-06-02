// ObjeMatch — Page Generator
// keywords.csv okur → her keyword için HTML sayfa üretir
// products.json'dan gerçek Amazon ürünleri çeker → affiliate linkler oluşturur

const fs   = require('fs');
const path = require('path');

const { tag, categories } = JSON.parse(fs.readFileSync('./products.json', 'utf8'));

const mockComplement = [
  { title: 'DYMO LabelManager 160', price: 19.99, emoji: '🏷️', why: 'Label every bin', search: 'DYMO LabelManager Label Maker' },
  { title: 'Command Strips + S-Hooks Pack', price: 11.49, emoji: '🪝', why: 'No-drill mounting', search: 'Command Strips S Hooks No Drill' },
  { title: 'Velvet Non-Slip Hangers 50pk', price: 16.99, emoji: '👔', why: 'Double hang space', search: 'Velvet Non Slip Hangers 50 Pack' },
  { title: 'Clear Zip Storage Bags 100pk', price: 13.99, emoji: '🗂️', why: 'Small items sorted', search: 'Clear Zip Storage Bags 100 Pack' },
];

function toSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stars(n) {
  const full = Math.floor(n);
  const half = n % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
}

function amazonUrl(search) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(search)}&tag=${tag}`;
}

function getProducts(category) {
  const key = category.toLowerCase().trim();
  return categories[key] || categories['kitchen'];
}

function buildPage(keyword, category, intent) {
  const slug   = toSlug(keyword);
  const title  = keyword.replace(/\b\w/g, c => c.toUpperCase());
  const year   = new Date().getFullYear();
  const prods  = getProducts(category);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Best ${title} ${year} — ObjeMatch</title>
<meta name="description" content="Looking for the best ${keyword}? We've picked the top-rated products available on Amazon. Curated and updated ${year}.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#f8fafc;color:#0f172a;line-height:1.5}
a{color:inherit;text-decoration:none}
nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 clamp(1rem,4vw,2rem);height:56px;display:flex;align-items:center;gap:1rem;position:sticky;top:0;z-index:100}
.logo{font-size:1rem;font-weight:900}.logo span{color:#f97316}
.page{max-width:1100px;margin:0 auto;padding:1.5rem clamp(1rem,4vw,2rem) 4rem}
.bc{font-size:.75rem;color:#94a3b8;margin-bottom:1.25rem;display:flex;gap:.4rem;flex-wrap:wrap}
.bc a{color:#64748b}.bc a:hover{color:#f97316}
h1{font-size:clamp(1.4rem,3vw,2rem);font-weight:900;margin-bottom:.35rem;line-height:1.2}
.page-meta{font-size:.78rem;color:#94a3b8;margin-bottom:1.75rem}
.page-meta strong{color:#64748b}
.sec{margin-bottom:2rem}
.sec-hd{display:flex;align-items:center;gap:.65rem;margin-bottom:.85rem}
.sec-icon{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:.85rem;flex-shrink:0}
.sec-title{font-size:.9rem;font-weight:800}
.sec-sub{font-size:.72rem;color:#94a3b8;margin-top:.1rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.85rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:13px;overflow:hidden;transition:box-shadow .2s}
.card:hover{box-shadow:0 6px 20px rgba(0,0,0,.08)}
.card-img{aspect-ratio:1;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:2.2rem;border-bottom:1px solid #f1f5f9}
.card-body{padding:.8rem}
.src{font-size:.62rem;font-weight:700;padding:.15rem .4rem;border-radius:4px;display:inline-block;margin-bottom:.35rem}
.src-amazon{background:#fff7ed;color:#ea580c}
.src-bundle{background:#fdf4ff;color:#9333ea}
.card-title{font-size:.8rem;font-weight:700;line-height:1.3;margin-bottom:.2rem}
.card-sub{font-size:.7rem;color:#94a3b8;margin-bottom:.45rem}
.card-stars{font-size:.7rem;color:#f59e0b;margin-bottom:.4rem}
.card-price{font-size:.92rem;font-weight:900}
.card-was{font-size:.7rem;color:#94a3b8;text-decoration:line-through;margin-left:.3rem}
.card-save{font-size:.62rem;font-weight:700;color:#16a34a;margin-left:.3rem}
.badge-pill{font-size:.62rem;font-weight:700;padding:.15rem .45rem;border-radius:4px;margin-left:.4rem;vertical-align:middle}
.bp-pick{background:#dcfce7;color:#15803d}
.bp-best{background:#fff7ed;color:#ea580c}
.card-btn{display:block;width:100%;margin-top:.55rem;background:#f97316;border:none;border-radius:6px;padding:.5rem;font-size:.72rem;font-weight:700;color:#fff;cursor:pointer;font-family:inherit;text-align:center;transition:opacity .15s}
.card-btn:hover{opacity:.85}
.aff{font-size:.7rem;color:#94a3b8;margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid #e2e8f0;line-height:1.6}
footer{background:#0f172a;color:#475569;padding:2rem clamp(1rem,4vw,2rem);text-align:center;font-size:.75rem;margin-top:3rem}
footer a{color:#475569;margin:0 .6rem}footer a:hover{color:#fff}
</style>
</head>
<body>
<nav>
  <a href="/index.html" class="logo">Obje<span>Match</span></a>
</nav>
<div class="page">
  <div class="bc">
    <a href="/index.html">Home</a><span>›</span>
    <a href="#">${category.replace(/\b\w/g,c=>c.toUpperCase())}</a><span>›</span>
    <span>${title}</span>
  </div>

  <h1>Best ${title} ${year}</h1>
  <div class="page-meta">Updated ${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})} · <strong>Top-Rated Amazon Picks</strong></div>

  <!-- AMAZON — GERÇEK ÜRÜNLER -->
  <div class="sec">
    <div class="sec-hd">
      <div class="sec-icon" style="background:#fff7ed">🛒</div>
      <div>
        <div class="sec-title">Best ${title} on Amazon</div>
        <div class="sec-sub">Top-rated picks with Prime shipping</div>
      </div>
    </div>
    <div class="grid">
      ${prods.map(p => `
      <a href="${amazonUrl(p.search)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <div class="card">
        <div class="card-img">${p.emoji}</div>
        <div class="card-body">
          <span class="src src-amazon">Amazon</span>
          ${p.badge === "Best Seller" ? `<span class="badge-pill bp-best">Best Seller</span>` : p.badge ? `<span class="badge-pill bp-pick">${p.badge}</span>` : ''}
          <div class="card-title">${p.title}</div>
          <div class="card-sub">by ${p.brand}</div>
          <div class="card-stars">${stars(p.stars)} <span style="color:#94a3b8;font-size:.65rem">${p.reviews.toLocaleString()} reviews</span></div>
          <div>
            <span class="card-price">$${p.price.toFixed(2)}</span>
            ${p.was ? `<span class="card-was">$${p.was.toFixed(2)}</span><span class="card-save">-${Math.round((1-p.price/p.was)*100)}%</span>` : ''}
          </div>
          <div class="card-btn">View on Amazon →</div>
        </div>
      </div>
      </a>`).join('')}
    </div>
  </div>

  <!-- TAMAMLAYICI ÜRÜNLER -->
  <div class="sec">
    <div class="sec-hd">
      <div class="sec-icon" style="background:#fdf4ff">✨</div>
      <div>
        <div class="sec-title">Complete the Setup</div>
        <div class="sec-sub">What people also buy with this</div>
      </div>
    </div>
    <div class="grid">
      ${mockComplement.map(p => `
      <a href="${amazonUrl(p.search)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <div class="card">
        <div class="card-img">${p.emoji}</div>
        <div class="card-body">
          <span class="src src-bundle">Bundle</span>
          <div class="card-title">${p.title}</div>
          <div class="card-sub">${p.why}</div>
          <div><span class="card-price">$${p.price.toFixed(2)}</span></div>
          <div class="card-btn">View on Amazon →</div>
        </div>
      </div>
      </a>`).join('')}
    </div>
  </div>

  <div class="aff">
    <strong>Affiliate Disclosure:</strong> ObjeMatch participates in the Amazon Associates Program. We may earn a commission on qualifying purchases — at no extra cost to you. All recommendations are based on product ratings and reviews.
  </div>
</div>
<footer>
  <p>© ${year} ObjeMatch · <a href="/ai-finder.html">AI Finder</a><a href="/index.html">Home</a><a href="#">Privacy</a><a href="#">Affiliate Disclosure</a></p>
</footer>
</body>
</html>`;
}

// ── SAYFALARI ÜRET ───────────────────────────────────────
const outDir = path.join(__dirname, 'pages');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const csv = fs.readFileSync('./keywords.csv', 'utf8').split('\n').slice(1);
let count = 0;

csv.forEach(line => {
  if (!line.trim()) return;
  const cols = line.split('","').map(c => c.replace(/"/g,''));
  const [id, keyword, category, intent] = cols;
  if (!keyword) return;

  const slug = toSlug(keyword);
  const html = buildPage(keyword, category, intent);
  fs.writeFileSync(path.join(outDir, `${slug}.html`), html);
  count++;
});

console.log(`✅ ${count} sayfa üretildi → /pages/ klasörü`);
console.log(`🔗 Affiliate tag: ${tag}`);
console.log(`📄 Örnek: pages/best-pantry-organizers.html`);
