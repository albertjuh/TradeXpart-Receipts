'use strict';

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { extractedData, conversationHistory, userMessage } = req.body;
    if (!userMessage) return res.status(400).json({ error: 'Missing userMessage' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const messages = [
      ...(conversationHistory ?? []),
      { role: 'user', content: userMessage },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: 'You are a receipt logging assistant for a trade business in Tanzania. Your job is to ask short, focused follow-up questions to complete missing receipt details. Ask one question at a time. Be brief and friendly. When all details are complete respond with exactly: COMPLETE',
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'Anthropic API error', detail: err });
    }

    const data = await response.json();
    const message = data.content?.[0]?.text ?? '';
    const isComplete = message.trim() === 'COMPLETE';

    return res.status(200).json({ message, isComplete, updatedData: extractedData ?? {} });
  } catch (err) {
    console.error('receipt-chat error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
};

module.exports = handler;
