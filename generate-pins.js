// ObjeMatch — Pinterest Pin İçerik Üreteci
// Kullanım: ANTHROPIC_API_KEY=sk-... node generate-pins.js
// Çıktı: output/pins.csv + output/pins.json

const fs   = require('fs');
const path = require('path');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('HATA: ANTHROPIC_API_KEY ayarlı değil.');
  console.error('Kullanım: ANTHROPIC_API_KEY=sk-... node generate-pins.js');
  process.exit(1);
}

// Kaç keyword işlenecek (test için az tut, tam run için 999999)
const LIMIT  = parseInt(process.env.LIMIT  || '50');
const OFFSET = parseInt(process.env.OFFSET || '0');

// ── CSV OKUMA ────────────────────────────────────────────
function loadKeywords() {
  const lines = fs.readFileSync('./keywords.csv', 'utf8').trim().split('\n');
  return lines.slice(1).map(line => {
    const cols = line.split('","').map(c => c.replace(/"/g, ''));
    return { id: cols[0], keyword: cols[1], category: cols[2], intent: cols[3] };
  }).filter(k => k.keyword);
}

// ── CLAUDE API ───────────────────────────────────────────
async function generatePin(keyword, category, intent) {
  const prompt = `You are a Pinterest content expert specializing in home organization and product recommendations.

Create a Pinterest pin for: "${keyword}"
Category: ${category}
User intent: ${intent}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "title": "Pin title — max 100 chars, compelling, include the keyword naturally. Start with a number or power word.",
  "description": "Pin description — 120-180 words. Start with a hook sentence. Mention new products, second-hand savings, and local service options naturally. End with an engaging question. Include keyword naturally.",
  "hashtags": ["tag1","tag2"],
  "image_prompt": "Detailed Stable Diffusion prompt for a beautiful, bright, Pinterest-style photo of ${keyword}. Describe the scene, lighting, style. Make it aspirational and clean.",
  "cta": "One short sentence driving to objematch.com — e.g. 'Find new, used & local service options at objematch.com'"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.content[0].text.trim();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('JSON parse hatası: ' + text.slice(0, 80));
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── MAIN ─────────────────────────────────────────────────
async function main() {
  const all      = loadKeywords();
  const keywords = all.slice(OFFSET, OFFSET + LIMIT);
  const outDir   = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // Mevcut sonuçları yükle (devam modu)
  const jsonPath = path.join(outDir, 'pins.json');
  const existing = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath,'utf8')) : [];
  const doneIds  = new Set(existing.map(p => p.id));

  const results = [...existing];
  let success = 0, fail = 0, skip = 0;

  console.log(`\nObjeMatch Pin Üretici`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`Toplam keyword: ${all.length} | Bu run: ${keywords.length} (offset: ${OFFSET})`);
  console.log(`Mevcut: ${existing.length} pin | Üretilecek: ${keywords.filter(k=>!doneIds.has(k.id)).length}`);
  console.log(`${'─'.repeat(50)}\n`);

  for (let i = 0; i < keywords.length; i++) {
    const { id, keyword, category, intent } = keywords[i];

    // Zaten üretilmişse atla
    if (doneIds.has(id)) {
      process.stdout.write(`[${i+1}/${keywords.length}] SKIP — ${keyword}\n`);
      skip++;
      continue;
    }

    process.stdout.write(`[${i+1}/${keywords.length}] ${keyword} ... `);

    try {
      const pin = await generatePin(keyword, category, intent);
      const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

      results.push({
        id,
        keyword,
        category,
        intent,
        slug,
        url: `https://objematch.com/${slug}`,
        title: pin.title || '',
        description: pin.description || '',
        hashtags: (pin.hashtags || []).slice(0, 15),
        image_prompt: pin.image_prompt || '',
        cta: pin.cta || `Find the best ${keyword} — new, used & local services at objematch.com`,
      });

      // Her 10 kayıtta ara kaydet
      if (results.length % 10 === 0) {
        fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
      }

      console.log('✓');
      success++;
    } catch (e) {
      console.log(`✗ ${e.message.slice(0,60)}`);
      fail++;
    }

    // Rate limit — her 5 istekte 2sn bekle
    if ((i + 1) % 5 === 0) await sleep(2000);
    else await sleep(350);
  }

  // ── JSON KAYDET ─────────────────────────────────────────
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  // ── CSV KAYDET (Pinterest Bulk Upload formatı) ───────────
  const csvPath = path.join(outDir, 'pins.csv');
  const csvLines = [
    'id,keyword,category,url,title,description,hashtags,image_prompt,cta',
    ...results.map(r => [
      r.id,
      `"${r.keyword}"`,
      `"${r.category}"`,
      `"${r.url}"`,
      `"${(r.title||'').replace(/"/g,'""')}"`,
      `"${(r.description||'').replace(/"/g,'""')}"`,
      `"${(r.hashtags||[]).map(t=>'#'+t).join(' ').replace(/"/g,'""')}"`,
      `"${(r.image_prompt||'').replace(/"/g,'""')}"`,
      `"${(r.cta||'').replace(/"/g,'""')}"`,
    ].join(','))
  ];
  fs.writeFileSync(csvPath, csvLines.join('\n'));

  // ── ÖZET ────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Tamamlandı: ${success} yeni | ${skip} atlandı | ${fail} hata`);
  console.log(`Toplam: ${results.length} pin`);
  console.log(`JSON : ${jsonPath}`);
  console.log(`CSV  : ${csvPath}`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`\nSonraki run: OFFSET=${OFFSET + LIMIT} LIMIT=${LIMIT}`);
  console.log(`ANTHROPIC_API_KEY=sk-... OFFSET=${OFFSET + LIMIT} node generate-pins.js\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
