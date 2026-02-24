import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const res = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`
      },
      body: JSON.stringify(request.body)
    });

    const data = await res.json();
    response.status(res.status).json(data);
  } catch (error) {
    console.error('[MiniMax TTS] Proxy error:', error);
    response.status(500).json({ error: 'Failed to fetch from MiniMax API' });
  }
}
