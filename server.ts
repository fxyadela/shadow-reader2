import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://rcasajpyjhwxyqvldrwk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjYXNhanB5amh3eHlxdmxkcndrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDcyOTAsImV4cCI6MjA4ODAyMzI5MH0.5FuCOELkv_i8Kyf3LH8ymqvhp5mVod21B63cgJNky-Q';
const supabase = createClient(supabaseUrl, supabaseKey);
const TABLE_NAME = 'app_data';

console.log('[DB] Using Supabase database:', supabaseUrl);

// Supabase-based database
async function getDB() {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .limit(1)
      .single();

    if (error || !data) {
      console.log('[DB] No existing data, creating initial record...');
      const initialData = { notes: [], voices: [], associations: {}, settings: {}, words: [] };
      await supabase.from(TABLE_NAME).insert([{ key: 'main', ...initialData }]);
      return initialData;
    }

    return {
      notes: data.notes || [],
      voices: data.voices || [],
      associations: data.associations || {},
      settings: data.settings || {},
      words: data.words || []
    };
  } catch (error) {
    console.error('[DB] Failed to get from Supabase:', error);
    return { notes: [], voices: [], associations: {}, settings: {}, words: [] };
  }
}

async function saveDB(data: any) {
  try {
    // Check if record exists
    const { data: existing } = await supabase
      .from(TABLE_NAME)
      .select('id')
      .limit(1)
      .single();

    if (existing) {
      // Update
      await supabase
        .from(TABLE_NAME)
        .update({
          notes: data.notes,
          voices: data.voices,
          associations: data.associations,
          settings: data.settings,
          words: data.words,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      console.log('[DB] Successfully updated Supabase');
    } else {
      // Insert
      await supabase.from(TABLE_NAME).insert([{
        key: 'main',
        notes: data.notes || [],
        voices: data.voices || [],
        associations: data.associations || {},
        settings: data.settings || {},
        words: data.words || []
      }]);
      console.log('[DB] Successfully created new record in Supabase');
    }
  } catch (error) {
    console.error('[DB] Failed to save to Supabase:', error);
    throw error;
  }
}

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const GLM_API_KEY = process.env.GLM_API_KEY || '';

// Create Express app
const app = express();
const PORT = 3001;

// CORS headers for mobile access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
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
app.get("/", (req, res) => {
  res.sendFile('dist/index.html', { root: '.' });
});

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
    console.log(`[API] Saving note: ${note.id} (${note.title})`);
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
    console.log(`[API] Saving voice: ${voice.id} (${voice.title})`);
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
    const { notes, voices, associations, settings, words } = req.body;
    
    if (notes) db.notes = notes;
    if (voices) db.voices = voices;
    if (associations) db.associations = associations;
    if (settings) db.settings = settings;
    if (words) db.words = words;
    
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

// Words APIs
app.get("/api/words", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    res.json(db.words || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch words' });
  }
});

app.post("/api/words", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    const item = req.body;
    if (!db.words) db.words = [];
    db.words.unshift(item);
    await saveDB(db);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save word' });
  }
});

app.delete("/api/words/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    if (!db.words) db.words = [];
    db.words = db.words.filter((w: any) => w.id !== req.params.id);
    await saveDB(db);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete word' });
  }
});

app.post("/api/associations", async (req: Request, res: Response) => {
  try {
    const db = await getDB();
    const { sentenceKey, voiceIds } = req.body;
    console.log(`[API] Saving association: ${sentenceKey} -> [${voiceIds.join(', ')}]`);
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
            content: `Translate "${text}" to ${targetLanguage}. 
            Return JSON:
            {
              "type": "word" | "sentence",
              "meaningDesc": "最常见的意思是...",
              "partOfSpeech": "词性名称 (缩写)",
              "phonetic": "英 /.../，美 /.../",
              "fullTranslation": "natural translation for sentences"
            }`
          }
        ],
        response_format: { type: "json_object" },
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

// Audio upload API (for Supabase Storage)
app.post("/api/upload-audio", async (req: Request, res: Response) => {
  try {
    const { audioData, voiceId, contentType } = req.body;

    if (!audioData || !voiceId) {
      return res.status(400).json({ error: 'Missing audioData or voiceId' });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(audioData, 'base64');
    const fileName = `${voiceId}.webm`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('audio')
      .upload(fileName, buffer, {
        contentType: contentType || 'audio/webm',
        upsert: true
      });

    if (error) {
      console.error('Storage upload error:', error);
      return res.status(500).json({ error: 'Failed to upload audio' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('audio')
      .getPublicUrl(fileName);

    res.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error('Audio upload error:', error);
    res.status(500).json({ error: 'Failed to upload audio' });
  }
});

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
