import Anthropic from '@anthropic-ai/sdk';

const PROMPT =
  'Extract receipt data from this image. Return ONLY valid JSON with ' +
  'these exact fields: vendor (string), amount (number), currency (string, ' +
  'default to TZS if unclear), date (string in YYYY-MM-DD format or null), ' +
  'category (one of: Food, Transport, Utilities, Supplies, Services, ' +
  'Accommodation, Other), payment_method (string or null), notes (string or null). ' +
  'If a field is not visible, use null. Return ONLY the JSON object, ' +
  'no explanation, no markdown, no code blocks.';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function toImageMediaType(mime: string): ImageMediaType {
  if (mime === 'image/png')  return 'image/png';
  if (mime === 'image/gif')  return 'image/gif';
  if (mime === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const body: { image?: string; mimeType?: string } =
      typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const { image, mimeType = 'image/jpeg' } = body;

    if (!image) { res.status(400).json({ error: 'Missing image data' }); return; }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

    const fileContent = mimeType === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: image } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: toImageMediaType(mimeType), data: image } };

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [fileContent, { type: 'text', text: PROMPT }],
        },
      ],
    });

    const textBlock = message.content.find((c: any) => c.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;
    const raw = textBlock?.text ?? '{}';
    const cleaned = raw.replace(/```[a-z]*\n?/gi, '').trim();
    const parsed: unknown = JSON.parse(cleaned);

    res.status(200).json(parsed);
  } catch (err) {
    console.error('[ocr-receipt] error:', err);
    res.status(500).json({ error: 'Could not extract receipt data' });
  }
}
