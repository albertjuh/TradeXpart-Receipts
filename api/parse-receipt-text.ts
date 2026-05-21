import Anthropic from '@anthropic-ai/sdk';

const PROMPT =
  'Parse this receipt description into structured data. ' +
  'Return ONLY valid JSON array where each item has: ' +
  'vendor (string), amount (number), currency (string, default TZS), ' +
  'date (string YYYY-MM-DD or null), category (one of: Food, Transport, ' +
  'Utilities, Supplies, Services, Accommodation, Other), ' +
  'payment_method (string or null), notes (string or null). ' +
  'If multiple items mentioned, return multiple objects in the array. ' +
  'No explanation, just the JSON array.';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const body: { text?: string } =
      typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const { text } = body;

    if (!text) { res.status(400).json({ error: 'Missing text' }); return; }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: `${PROMPT}\n\nReceipt: ${text}` },
      ],
    });

    const textBlock = message.content.find((c: any) => c.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;
    const raw = textBlock?.text ?? '[]';
    const cleaned = raw.replace(/```[a-z]*\n?/gi, '').trim();
    const parsed: unknown = JSON.parse(cleaned);

    res.status(200).json(Array.isArray(parsed) ? parsed : [parsed]);
  } catch (err) {
    console.error('[parse-receipt-text] error:', err);
    res.status(500).json({ error: 'Could not parse receipt text' });
  }
}
