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

    const isSingleWord = /^[a-zA-Z]+$/.test(text);
    const typeHint = isSingleWord ? '单词类型用t:w，短语或句子类型用t:s' : '句子类型用t:s';

    // Force Chinese output for all fields
    const promptText = isSingleWord
      ? `翻译单词"${text}"为中文。${typeHint}。注意：m是中文释义，p是中文词性，ph必须是"英 /.../，美 /.../"格式，f必须是中文翻译。JSON格式:{"t":"w"|"s","m":"中文释义","p":"中文词性","ph":"英 /.../，美 /.../","f":"中文翻译"}`
      : `翻译句子"${text}"为中文。${typeHint}。JSON格式:{"t":"w"|"s","m":"中文释义","p":"中文词性","ph":"英 /.../，美 /.../","f":"中文翻译"}`;

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
