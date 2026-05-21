export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Parse this receipt description into structured data. Return ONLY valid JSON array where each item has: vendor (string), amount (number), currency (string, default TZS), date (string YYYY-MM-DD or null), category (one of: Food, Transport, Utilities, Supplies, Services, Accommodation, Other), payment_method (string or null), notes (string or null). If multiple items mentioned, return multiple objects in the array. No explanation, just the JSON array.\n\nReceipt: ${text}`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'Anthropic API error', detail: err });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text ?? '[]';

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(200).json({ error: 'Could not parse response', raw });
    }

    return res.status(200).json(Array.isArray(parsed) ? parsed : [parsed]);
  } catch (err: any) {
    console.error('parse-receipt-text error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
