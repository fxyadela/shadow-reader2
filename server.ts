import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const GLM_API_KEY = process.env.GLM_API_KEY || '';

// Create Express app
const app = express();
const PORT = 3001;

// CORS headers for mobile access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.post("/api/tts", async (req: Request, res: Response) => {
  console.log('[MiniMax TTS] Received request');
  try {
    const response = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`
      },
      body: JSON.stringify(req.body)
    });

    console.log('[MiniMax TTS] Response status:', response.status);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[MiniMax TTS] Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from MiniMax API' });
  }
});

app.post("/api/minimax/t2a", async (req: Request, res: Response) => {
  console.log('[MiniMax TTS] Received request');
  try {
    const response = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`
      },
      body: JSON.stringify(req.body)
    });

    console.log('[MiniMax TTS] Response status:', response.status);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[MiniMax TTS] Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from MiniMax API' });
  }
});

// Translation API (using GLM)
app.post("/api/translate", async (req: Request, res: Response) => {
  try {
    const { text, targetLang } = req.body;

    // Map app language codes to full names
    const langMap: Record<string, string> = {
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean'
    };

    const targetLanguage = langMap[targetLang] || 'Chinese';

    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
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

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Translation failed');
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content || text;

    res.json({ translatedText });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
});

// Serve static files in production
app.use(express.static('dist'));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req: Request, res: Response) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile('dist/index.html', { root: '.' });
  }
});

// Export handler for Vercel
export default app;

// Start server for local development
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
