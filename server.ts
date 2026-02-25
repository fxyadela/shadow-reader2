import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const DB_FILE = path.resolve("data.json");

// Simple JSON-based database
async function getDB() {
  try {
    const data = await fs.readFile(DB_FILE, "utf-8");
    if (!data.trim()) throw new Error("Empty DB file");
    return JSON.parse(data);
  } catch (error) {
    const initialData = { notes: [], voices: [], associations: {}, settings: {} };
    await fs.writeFile(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

async function saveDB(data: any) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST') {
    console.log('Body keys:', Object.keys(req.body));
  }
  next();
});

// API Routes

// Notes APIs
app.get("/api/notes", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    res.json(db.notes || []);
  } catch (error) {
    console.error('Failed to fetch notes:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

app.post("/api/notes", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    const note = req.body;
    const index = db.notes.findIndex((n: any) => n.id === note.id);
    if (index >= 0) {
      db.notes[index] = note;
    } else {
      db.notes.unshift(note);
    }
    await saveDB(db);
    res.json(note);
  } catch (error) {
    console.error('Failed to save note:', error);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

app.delete("/api/notes/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    db.notes = db.notes.filter((n: any) => n.id !== req.params.id);
    await saveDB(db);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// Voices APIs
app.get("/api/voices", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    res.json(db.voices || []);
  } catch (error) {
    console.error('Failed to fetch voices:', error);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

app.post("/api/voices", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    const voice = req.body;
    const index = db.voices.findIndex((v: any) => v.id === voice.id);
    if (index >= 0) {
      db.voices[index] = voice;
    } else {
      db.voices.unshift(voice);
    }
    await saveDB(db);
    res.json(voice);
  } catch (error) {
    console.error('Failed to save voice:', error);
    res.status(500).json({ error: 'Failed to save voice' });
  }
});

app.delete("/api/voices/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    db.voices = db.voices.filter((v: any) => v.id !== req.params.id);
    await saveDB(db);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete voice:', error);
    res.status(500).json({ error: 'Failed to delete voice' });
  }
});

// Settings APIs
app.get("/api/settings/:key", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    res.json(db.settings?.[req.params.key] || null);
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post("/api/settings", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    const { key, value } = req.body;
    if (!db.settings) db.settings = {};
    db.settings[key] = value;
    await saveDB(db);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Migration API
app.post("/api/migrate", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    const { notes, voices, associations, settings } = req.body;
    
    if (notes) db.notes = notes;
    if (voices) db.voices = voices;
    if (associations) db.associations = associations;
    if (settings) db.settings = settings;
    
    await saveDB(db);
    res.json({ success: true });
  } catch (error) {
    console.error('Migration failed:', error);
    res.status(500).json({ error: 'Migration failed' });
  }
});

// Associations APIs
app.get("/api/associations", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    res.json(db.associations || {});
  } catch (error) {
    console.error('Failed to fetch associations:', error);
    res.status(500).json({ error: 'Failed to fetch associations' });
  }
});

app.post("/api/associations", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    const { sentenceKey, voiceIds } = req.body;
    if (!db.associations) db.associations = {};
    db.associations[sentenceKey] = voiceIds;
    await saveDB(db);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to save association:', error);
    res.status(500).json({ error: 'Failed to save association' });
  }
});

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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
