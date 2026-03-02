import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs/promises';
import path from 'path';

// Note: Vercel Serverless Functions have a read-only filesystem except for /tmp
// For persistence on Vercel, you should use a database like Vercel KV or PostgreSQL.
// This implementation uses /tmp/data.json as a temporary store, but it will NOT persist across function restarts.
const DB_FILE = path.join('/tmp', 'data.json');

async function getDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    const initialData = { notes: [], voices: [], associations: {}, settings: {} };
    // In Vercel, we can't easily persist files. This is a fallback.
    return initialData;
  }
}

async function saveDB(data: any) {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Failed to save to /tmp/data.json:', error);
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { method, query } = req;
  const url = req.url || '';

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const db = await getDB();

    // Notes APIs
    if (url.includes('/api/notes')) {
      if (method === 'GET') {
        return res.status(200).json(db.notes || []);
      }
      if (method === 'POST') {
        const note = req.body;
        const index = db.notes.findIndex((n: any) => n.id === note.id);
        if (index >= 0) db.notes[index] = note;
        else db.notes.unshift(note);
        await saveDB(db);
        return res.status(200).json(note);
      }
      if (method === 'DELETE') {
        const id = url.split('/').pop();
        db.notes = db.notes.filter((n: any) => n.id !== id);
        await saveDB(db);
        return res.status(200).json({ success: true });
      }
    }

    // Voices APIs
    if (url.includes('/api/voices')) {
      if (method === 'GET') {
        return res.status(200).json(db.voices || []);
      }
      if (method === 'POST') {
        const voice = req.body;
        const index = db.voices.findIndex((v: any) => v.id === voice.id);
        if (index >= 0) db.voices[index] = voice;
        else db.voices.unshift(voice);
        await saveDB(db);
        return res.status(200).json(voice);
      }
      if (method === 'DELETE') {
        const id = url.split('/').pop();
        db.voices = db.voices.filter((v: any) => v.id !== id);
        await saveDB(db);
        return res.status(200).json({ success: true });
      }
    }

    // Associations APIs
    if (url.includes('/api/associations')) {
      if (method === 'GET') {
        return res.status(200).json(db.associations || {});
      }
      if (method === 'POST') {
        const { sentenceKey, voiceIds } = req.body;
        if (!db.associations) db.associations = {};
        db.associations[sentenceKey] = voiceIds;
        await saveDB(db);
        return res.status(200).json({ success: true });
      }
    }

    // Words APIs
    if (url.includes('/api/words')) {
      if (method === 'GET') {
        return res.status(200).json(db.words || []);
      }
      if (method === 'POST') {
        const item = req.body;
        if (!db.words) db.words = [];
        db.words.unshift(item);
        await saveDB(db);
        return res.status(200).json(item);
      }
      if (method === 'DELETE') {
        const id = url.split('/').pop();
        if (!db.words) db.words = [];
        db.words = db.words.filter((w: any) => w.id !== id);
        await saveDB(db);
        return res.status(200).json({ success: true });
      }
    }

    if (url.includes('/api/translate') && method === 'POST') {
      try {
        const { text, targetLang } = req.body as any;
        const GLM_API_KEY = process.env.GLM_API_KEY;

        if (!GLM_API_KEY) {
          return res.status(200).json({ translatedText: text });
        }

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
          return res.status(200).json({ translatedText: text });
        }

        const data = await response.json();
        const translatedText = data.choices?.[0]?.message?.content || text;
        return res.status(200).json({ translatedText });
      } catch {
        return res.status(200).json({ translatedText: req.body?.text || '' });
      }
    }

    // Migration API
    if (url.includes('/api/migrate') && method === 'POST') {
      const { notes, voices, associations, settings, words } = req.body;
      if (notes) db.notes = notes;
      if (voices) db.voices = voices;
      if (associations) db.associations = associations;
      if (settings) db.settings = settings;
      if (words) db.words = words;
      await saveDB(db);
      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: 'Route not found' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
