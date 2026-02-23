import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || 'sk-api-FPyTirGDNVIbxU9DhDyz6umQhww29chTNpyeAFJ9HU9yX9-xI3cTNJqiNKUjxmM5WYAagnJxOTt_cFnFWUvlEoYHXOTuyrWoyCBcKVRInYcQKUPbRU4ICYw';
const GLM_API_KEY = process.env.GLM_API_KEY || '';

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // API Routes
  app.post("/api/minimax/t2a", async (req, res) => {
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
  app.post("/api/translate", async (req, res) => {
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving (if needed later)
    app.use(express.static('dist'));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    console.log(`  - Network: http://<YOUR_IP>:${PORT}`);
  });
}

startServer();
