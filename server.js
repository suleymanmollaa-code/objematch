const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.post('/api/recommend', async (req, res) => {
  const { room, size, problem, budget, style } = req.body;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `You are a home organization expert. A user needs product recommendations.

User's situation:
- Room: ${room}
- Space size: ${size}
- Main problem: ${problem}
- Budget: ${budget}
- Style preference: ${style}

Recommend exactly 5 specific Amazon products that would solve their problem. For each product provide:
1. A specific product name (real, searchable on Amazon)
2. Why it's perfect for their situation (1 sentence)
3. Price range
4. Amazon search term (exact keywords to find it)

Respond ONLY with valid JSON in this exact format:
{
  "intro": "One sentence intro based on their specific situation",
  "products": [
    {
      "name": "Exact Product Name",
      "reason": "Why this is perfect for their situation",
      "price": "$XX-$XX",
      "search": "amazon search keywords",
      "category": "organizer type"
    }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const text = data.content[0].text;

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    res.json(parsed);
  } catch (err) {
    console.error('Recommend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ObjeMatch server running on http://localhost:${PORT}`);
  console.log(`AI Finder: http://localhost:${PORT}/ai-finder.html`);
});
