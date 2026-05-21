'use strict';

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, mimeType = 'image/jpeg' } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const isDocument = mimeType === 'application/pdf';

    const contentBlock = isDocument
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } };

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
          content: [
            contentBlock,
            {
              type: 'text',
              text: 'Extract receipt data from this image. Return ONLY valid JSON with these exact fields: vendor (string), amount (number), currency (string, default TZS if unclear), date (string YYYY-MM-DD or null), category (one of: Food, Transport, Utilities, Supplies, Services, Accommodation, Other), payment_method (string or null), notes (string or null). IMPORTANT: vendor means the business where money was spent (restaurant, shop, supplier, service provider). Payment facilitators like M-Pesa, Airtel Money, Mixx by Yas, TigoPesa, Halopesa, NMB, CRDB are NOT vendors — they are payment methods. If the receipt shows a payment app sending money TO a business, the vendor is the DESTINATION business, and the payment_method is the app (e.g. M-Pesa). If the actual vendor is unclear, use null for vendor. If a field is not visible use null. Return ONLY the JSON object, no explanation, no markdown, no code blocks.',
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'Anthropic API error', detail: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(200).json({ error: 'Could not parse receipt data', raw: text });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('OCR error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

module.exports = handler;
