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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const prompt = 'Extract receipt data from this image. Return ONLY valid JSON with these exact fields: vendor (string or null), amount (number), currency (string, default TZS if unclear), date (string YYYY-MM-DD or null), category (one of: Food, Transport, Utilities, Supplies, Services, Accommodation, Other), payment_method (string or null), notes (string or null), account_type (string: "Business", "Personal", or "unclear"). IMPORTANT: vendor means the business where money was spent (restaurant, shop, supplier, service provider). Payment facilitators like M-Pesa, Airtel Money, Mixx by Yas, TigoPesa, Halopesa, NMB, CRDB are NOT vendors — they are payment methods. If the receipt shows a payment app sending money TO a business, the vendor is the DESTINATION business, and the payment_method is the app. If the actual vendor is unclear, use null for vendor. For account_type: use "Business" if fuel/petrol, office supplies, shipping/freight, customs/port fees, raw materials, equipment, wholesale purchases, amount over 100000 TZS, or vendor is clearly a company/institution. Use "Personal" if restaurant/cafe/food (amount under 50000 TZS), supermarket groceries, personal transport (taxi/uber/bolt), entertainment, or clothing. Use "unclear" if genuinely ambiguous. Return ONLY the JSON object, no explanation, no markdown, no code blocks.';

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: image } },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini error:', err);
      return res.status(500).json({ error: 'Gemini API error', detail: err });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      console.error('ocr-receipt: model returned non-JSON:', text);
      return res.status(502).json({ error: 'Could not parse receipt data', raw: text.slice(0, 300) });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('OCR error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

module.exports = handler;
