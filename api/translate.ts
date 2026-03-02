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

    // Use same prompt format as server.ts for consistent results
    const promptText = `Translate "${text}" to ${targetLanguage}.
Return JSON:
{
  "type": "word" | "sentence",
  "meaningDesc": "最常见的意思是...",
  "partOfSpeech": "词性名称 (缩写)",
  "phonetic": "英 /.../，美 /.../",
  "fullTranslation": "natural translation for sentences"
}`;

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
            content: promptText
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 256
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
