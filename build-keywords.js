// ObjeMatch — Home Organization Keyword Builder
// Çıktı: keywords.csv

const fs = require('fs');

// ── KATEGORİLER ──────────────────────────────────────────
const rooms = [
  'pantry', 'kitchen', 'bathroom', 'closet', 'bedroom',
  'living room', 'home office', 'laundry room', 'garage', 'entryway'
];

const problems = [
  'organization', 'storage', 'storage ideas', 'organizer',
  'declutter', 'storage solutions', 'organization ideas',
  'storage hacks', 'organization tips', 'organization system'
];

const modifiers = [
  'small', 'cheap', 'best', 'diy', 'aesthetic',
  'under 30', 'under 50', 'apartment', '2025',
  'rental', 'on a budget', 'maximalist', 'minimalist'
];

const specific = [
  // Mutfak
  'pantry bins', 'lazy susan', 'spice rack', 'pot rack',
  'kitchen drawer organizer', 'under sink kitchen organizer',
  'refrigerator organizer', 'cabinet organizer', 'pantry labels',
  'food storage containers', 'kitchen counter organizer',

  // Banyo
  'under sink bathroom organizer', 'shower organizer',
  'bathroom counter organizer', 'medicine cabinet organizer',
  'bathroom cabinet organizer', 'toilet paper holder',
  'bathroom shelf', 'makeup organizer', 'hair tool organizer',

  // Gardırop / Giysi
  'closet organizer system', 'closet shelf organizer',
  'hanging closet organizer', 'shoe organizer', 'shoe rack',
  'closet rod doubler', 'velvet hangers', 'closet dividers',
  'sweater storage', 'purse organizer', 'belt organizer',

  // Yatak odası
  'under bed storage', 'bedside organizer', 'dresser organizer',
  'nightstand organizer', 'bedroom storage bins',

  // Salon
  'tv console organizer', 'bookshelf organizer', 'coffee table storage',
  'entryway organizer', 'coat rack', 'key holder wall',

  // Ofis
  'desk organizer', 'cable management', 'drawer organizer office',
  'file organizer', 'monitor stand with storage', 'wall organizer office',

  // Çamaşırhane / Garaj
  'laundry room organization', 'laundry detergent organizer',
  'garage wall organizer', 'garage storage bins', 'tool organizer',

  // Genel
  'label maker', 'storage baskets', 'acrylic organizer',
  'stackable bins', 'drawer dividers', 'clear storage boxes',
  'storage ottoman', 'wall mounted organizer', 'pegboard organizer'
];

// ── KEYWORD ÜRETİMİ ─────────────────────────────────────
const keywords = new Set();

// Room + Problem kombinasyonu
rooms.forEach(room => {
  problems.forEach(problem => {
    keywords.add(`${room} ${problem}`);
  });
});

// Room + Problem + Modifier
rooms.forEach(room => {
  problems.slice(0, 4).forEach(problem => {
    modifiers.forEach(mod => {
      keywords.add(`${mod} ${room} ${problem}`);
    });
  });
});

// Best + specific
specific.forEach(item => {
  keywords.add(`best ${item}`);
  keywords.add(`${item} ideas`);
  keywords.add(`cheap ${item}`);
  keywords.add(`small space ${item}`);
});

// ── CSV ÇIKTI ────────────────────────────────────────────
const rows = [['id', 'keyword', 'category', 'intent']];

let id = 1;
keywords.forEach(kw => {
  // Kategori belirle
  let category = 'home';
  if (/kitchen|pantry|spice|refrigerator|cabinet|counter/.test(kw)) category = 'kitchen';
  else if (/bathroom|shower|makeup|medicine|toilet|hair tool/.test(kw)) category = 'bathroom';
  else if (/closet|shoe|hanger|sweater|purse|belt|wardrobe/.test(kw)) category = 'closet';
  else if (/bedroom|bed|dresser|nightstand/.test(kw)) category = 'bedroom';
  else if (/office|desk|cable|file|monitor/.test(kw)) category = 'office';
  else if (/garage|tool|laundry/.test(kw)) category = 'garage';

  // Intent belirle
  let intent = 'browse';
  if (/best|top|review/.test(kw)) intent = 'research';
  if (/cheap|budget|under \d+/.test(kw)) intent = 'budget';
  if (/ideas|hacks|tips|diy/.test(kw)) intent = 'inspiration';

  rows.push([id++, kw, category, intent]);
});

const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
fs.writeFileSync('./keywords.csv', csv);

console.log(`✅ ${keywords.size} keyword üretildi → keywords.csv`);
console.log('\nKategori dağılımı:');

const cats = {};
rows.slice(1).forEach(r => {
  cats[r[2]] = (cats[r[2]] || 0) + 1;
});
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count}`);
});
