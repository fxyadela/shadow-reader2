import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const GLM_API_KEY = process.env.GLM_API_KEY || '';

  // Check if API key is configured
  if (!GLM_API_KEY) {
    return response.status(500).json({ error: 'GLM_API_KEY not configured. Please add it in Vercel settings.' });
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, targetLang } = request.body;

    const langMap: Record<string, string> = {
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean'
    };

    const targetLanguage = langMap[targetLang] || 'Chinese';

    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GLM_API_KEY}`
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [
          {
            role: 'user',
            content: `Translate the following text to ${targetLanguage}. Return ONLY the translation, nothing else.\n\n${text}`
          }
        ],
        max_tokens: 1024
      })
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error('GLM API error:', errorData);
      return response.status(res.status).json({ error: errorData.error?.message || 'Translation failed' });
    }

    const data = await res.json();
    const translatedText = data.choices?.[0]?.message?.content || text;

    response.json({ translatedText });
  } catch (error) {
    console.error('Translation error:', error);
    response.status(500).json({ error: error instanceof Error ? error.message : 'Translation failed' });
  }
}
