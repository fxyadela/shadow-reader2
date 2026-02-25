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

    // Migration API
    if (url.includes('/api/migrate') && method === 'POST') {
      const { notes, voices, associations, settings } = req.body;
      if (notes) db.notes = notes;
      if (voices) db.voices = voices;
      if (associations) db.associations = associations;
      if (settings) db.settings = settings;
      await saveDB(db);
      return res.status(200).json({ success: true });
    }

    return res.status(404).json({ error: 'Route not found' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
