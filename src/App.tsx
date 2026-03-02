import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toPng } from 'html-to-image';
import {
  ArrowLeft,
  MessageSquare,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Mic,
  Headphones,
  ArrowRight,
  ArrowDown,
  Quote,
  Sparkles,
  Zap,
  Play,
  Pause,
  RotateCcw,
  Repeat,
  Settings2,
  Wand2,
  Volume2,
  Edit3,
  X,
  Target,
  Save,
  List,
  Home,
  User,
  Plus,
  Trash2,
  Filter,
  Library,
  Loader2,
  Clock,
  Calendar,
  Tag,
  Languages,
  Globe,
  Check,
  SkipBack,
  SkipForward,
  Download,
  Upload,
  Gauge,
  Menu,
  Share,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ==========================================
// API URL HELPER
// ==========================================

// Get the correct API base URL based on current location
const getApiBaseUrl = () => {
  const { protocol, hostname, port } = window.location;
  // If we're on port 3000 (Vite), the backend is likely on 3001
  // On mobile, we need to explicitly point to 3001 if not using a proxy
  let baseUrl = '';
  if (port === '3000') {
    baseUrl = `${protocol}//${hostname}:3001`;
  } else {
    const portStr = port ? `:${port}` : '';
    baseUrl = `${protocol}//${hostname}${portStr}`;
  }
  console.log('API Base URL:', baseUrl);
  return baseUrl;
};

// ==========================================
// INDEXEDDB UTILITIES (For large audio files)
// ==========================================

const DB_NAME = 'shadow-reader-db';
const STORE_NAME = 'persistent-data';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getIDBItem = async <T,>(key: string, defaultValue: T): Promise<T> => {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || defaultValue);
      request.onerror = () => resolve(defaultValue);
    });
  } catch {
    return defaultValue;
  }
};

const setIDBItem = async <T,>(key: string, value: T): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => {
        console.log(`[IDB] Successfully saved ${key}`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to save to IndexedDB:', e);
  }
};

// ==========================================
// LOCAL STORAGE UTILITIES
// ==========================================

const STORAGE_KEYS = {
  NOTES: 'shadow-reader-notes',
  SAVED_VOICES: 'shadow-reader-voices',
  SHADOW_SETTINGS: 'shadow-reader-settings',
  SENTENCE_VOICE_ASSOCIATIONS: 'shadow-reader-sentence-voice-associations',
  EDITED_TIMESTAMPS: 'shadow-reader-edited-timestamps',
  WORDS: 'shadow-reader-words',
  TRANSLATION_CACHE: 'shadow-reader-translation-cache-v5'
} as const;

// Generic get/set for localStorage
const getStorageItem = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setStorageItem = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
};

const handleWordClickGlobal = async (
  word: string, 
  setWordModal: (val: any) => void
) => {
  // 1. Check Cache first
  const cacheKey = `tr-${word.toLowerCase()}`;
  const cached = getStorageItem<any>(STORAGE_KEYS.TRANSLATION_CACHE, {})[cacheKey];
  if (cached) {
    setWordModal({ 
      word, 
      translation: cached.translation, 
      loading: false,
      structuredData: cached.structuredData
    });
    return;
  }

  setWordModal({ word, translation: undefined, loading: true });
  try {
    const data = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: word, targetLang: 'zh' })
    }).then(r => r.json());
    
    if (data && data.translatedText) {
      let structuredData = null;
      try {
        const parsed = JSON.parse(data.translatedText);
        // Map short keys to full keys for compatibility
        structuredData = {
          type: parsed.t || parsed.type,
          meaningDesc: parsed.m || parsed.meaningDesc,
          partOfSpeech: parsed.p || parsed.partOfSpeech,
          phonetic: parsed.ph || parsed.phonetic,
          fullTranslation: parsed.f || parsed.fullTranslation
        };
      } catch (e) {
        console.log('Not a JSON translation');
      }

      const translation = structuredData ? (structuredData.fullTranslation || "") : data.translatedText;

      // 2. Save to Cache
      const currentCache = getStorageItem<any>(STORAGE_KEYS.TRANSLATION_CACHE, {});
      currentCache[cacheKey] = { translation, structuredData };
      // Limit cache size to 200 items to avoid LocalStorage overflow
      const keys = Object.keys(currentCache);
      if (keys.length > 200) {
        delete currentCache[keys[0]];
      }
      setStorageItem(STORAGE_KEYS.TRANSLATION_CACHE, currentCache);

      setWordModal({ 
        word, 
        translation, 
        loading: false,
        structuredData
      });
    } else {
      setWordModal({ word, translation: undefined, loading: false });
    }
  } catch {
    setWordModal({ word, translation: undefined, loading: false });
  }
};

const WordTextGlobal: React.FC<{ 
  text: string; 
  className?: string; 
  onWordClick: (word: string) => void;
}> = ({ text, className, onWordClick }) => {
  const parts = text.split(/([A-Za-z][A-Za-z']*)/g);
  return (
    <p className={className}>
      {parts.map((part, idx) =>
        /[A-Za-z][A-Za-z']*/.test(part) ? (
          <span
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              onWordClick(part);
            }}
            className="cursor-pointer hover:text-teal-300"
          >
            {part}
          </span>
        ) : (
          <span key={idx}>{part}</span>
        )
      )}
    </p>
  );
};

const WordModalUI: React.FC<{
  wordModal: any;
  setWordModal: (val: any) => void;
  onAddWord: (word: string, translation?: string) => void;
  onShowToast: (msg: string) => void;
}> = ({ wordModal, setWordModal, onAddWord, onShowToast }) => {
  if (!wordModal) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setWordModal(null)}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-[#18181b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Top Right Icons */}
        <div className="absolute top-4 right-4 flex items-center gap-3">
          <button
            onClick={() => {
              onAddWord(wordModal.word, wordModal.translation);
              setWordModal(null);
              onShowToast('已收藏到 Words');
            }}
            className="p-1.5 rounded-full hover:bg-white/5 text-teal-400 transition-colors"
            title="收藏单词"
          >
            <Star size={20} />
          </button>
          <button
            onClick={() => setWordModal(null)}
            className="p-1.5 rounded-full hover:bg-white/5 text-neutral-400 hover:text-white transition-colors"
            title="关闭"
          >
            <X size={20} />
          </button>
        </div>

        <div className="pr-0"> {/* Remove global padding to maximize width */}
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
            {wordModal.loading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 size={18} className="animate-spin text-teal-500" />
                <span className="text-neutral-400 text-sm">正在获取翻译...</span>
              </div>
            ) : (
              <div className="space-y-4 py-1">
                {/* User style (Word/Phrase) */}
                {wordModal.structuredData?.type === 'word' ? (
                  <div className="space-y-4 text-sm sm:text-base leading-relaxed">
                    <p className="text-neutral-200 pr-20"> {/* Only padding for the first paragraph to avoid icons */}
                      “<span className="text-teal-400 font-bold">{wordModal.word}</span>” {wordModal.structuredData.meaningDesc || wordModal.translation}
                    </p>
                    {(wordModal.structuredData.partOfSpeech || wordModal.structuredData.phonetic) && (
                      <div className="space-y-2 pt-3 border-t border-white/5">
                        {wordModal.structuredData.partOfSpeech && (
                          <div className="flex gap-3">
                            <span className="text-neutral-500 font-medium min-w-[48px] shrink-0">词性 ：</span>
                            <span className="text-neutral-300">{wordModal.structuredData.partOfSpeech}</span>
                          </div>
                        )}
                        {wordModal.structuredData.phonetic && (
                          <div className="flex gap-3 items-start">
                            <span className="text-neutral-500 font-medium min-w-[48px] shrink-0">音标 ：</span>
                            <span className="text-neutral-300 font-mono break-all leading-tight">
                              {wordModal.structuredData.phonetic}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Sentence/Simple Style */
                  <div className="text-neutral-200 text-sm leading-relaxed whitespace-pre-wrap">
                    {wordModal.structuredData?.fullTranslation || wordModal.translation || '无翻译'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SelectionTranslator: React.FC<{
  selection: any;
  setSelection: (val: any) => void;
  onTranslate: (text: string) => void;
}> = ({ selection, setSelection, onTranslate }) => {
  if (!selection) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        style={{
          position: 'fixed',
          left: selection.x,
          top: selection.y - 40,
          transform: 'translateX(-50%)',
          zIndex: 100,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onTranslate(selection.text);
          setSelection(null);
          // Clear selection visually
          window.getSelection()?.removeAllRanges();
        }}
      >
        <button className="bg-teal-500 text-black px-3 py-1.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-1.5 hover:bg-teal-400 transition-colors">
          <Languages size={14} />
          <span>翻译词组</span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

const useIsTouchDevice = () => {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  return isTouch;
};

// ==========================================
// HOOK: SWIPE TO DELETE
// ==========================================

interface SwipeState {
  isSwiping: boolean;
  startX: number;
  currentX: number;
}

const useSwipeToDelete = (onSwipeComplete: () => void) => {
  const swipeRef = React.useRef<SwipeState & { hasSwiped: boolean; pendingDelete: boolean }>({
    isSwiping: false,
    startX: 0,
    currentX: 0,
    hasSwiped: false,
    pendingDelete: false
  });

  const [, forceUpdate] = React.useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (swipeRef.current.pendingDelete) return;
    swipeRef.current = {
      isSwiping: true,
      startX: e.touches[0].clientX,
      currentX: e.touches[0].clientX,
      hasSwiped: false,
      pendingDelete: false
    };
    forceUpdate(n => n + 1);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipeRef.current.isSwiping || swipeRef.current.pendingDelete) return;
    const diff = Math.abs(e.touches[0].clientX - swipeRef.current.startX);
    if (diff > 10) {
      swipeRef.current.hasSwiped = true;
    }
    swipeRef.current = {
      ...swipeRef.current,
      currentX: e.touches[0].clientX
    };
    forceUpdate(n => n + 1);
  };

  const handleTouchEnd = () => {
    if (!swipeRef.current.isSwiping || swipeRef.current.pendingDelete) return;
    const diff = swipeRef.current.startX - swipeRef.current.currentX;
    // Swipe left more than 80px to delete
    if (diff > 80) {
      // Mark as pending delete to prevent multiple triggers
      swipeRef.current.pendingDelete = true;
      // Delay the actual delete to allow touch event to complete
      setTimeout(() => {
        onSwipeComplete();
        swipeRef.current = {
          isSwiping: false,
          startX: 0,
          currentX: 0,
          hasSwiped: false,
          pendingDelete: false
        };
        forceUpdate(n => n + 1);
      }, 50);
      return;
    }
    swipeRef.current = {
      isSwiping: false,
      startX: 0,
      currentX: 0,
      hasSwiped: false,
      pendingDelete: false
    };
    forceUpdate(n => n + 1);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Prevent click if user swiped
    if (swipeRef.current.hasSwiped) {
      e.preventDefault();
      e.stopPropagation();
      swipeRef.current.hasSwiped = false;
      return false;
    }
    return true;
  };

  return {
    swipeOffset: swipeRef.current.isSwiping ? Math.min(0, swipeRef.current.currentX - swipeRef.current.startX) : 0,
    handleClick,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    }
  };
};

const useSwipeToBack = (onBack: () => void, enabled: boolean = true) => {
  const swipeRef = React.useRef({
    startX: 0,
    currentX: 0,
    startY: 0,
    isSwiping: false
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enabled) return;
    swipeRef.current = {
      startX: e.touches[0].clientX,
      currentX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      isSwiping: true
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!enabled || !swipeRef.current.isSwiping) return;
    swipeRef.current.currentX = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!enabled || !swipeRef.current.isSwiping) return;
    
    const diffX = swipeRef.current.currentX - swipeRef.current.startX;
    const diffY = Math.abs(e.changedTouches[0].clientY - swipeRef.current.startY);
    
    // Horizontal swipe must be significantly larger than vertical movement
    // and must be from left to right (diffX > 0)
    if (diffX > 100 && diffX > diffY * 2) {
      onBack();
    }
    
    swipeRef.current.isSwiping = false;
  };

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    }
  };
};

// ==========================================
// SHARED TYPES & CONSTANTS
// ==========================================

 type MainTab = 'notes' | 'shadow' | 'voice' | 'words';
type NotesView = 'list' | 'detail';

interface Note {
  id: string;
  title: string;
  date: string; // Display date
  timestamp: number; // For sorting
  tags: string[];
  rawContent: string;
}

interface VoiceItem {
  id: string;
  title: string;
  date: string;
  timestamp: number;
  audioUrl: string;
  duration: number;
  text: string;
}

const VOICES = [
  { id: 'moss_audio_fa3d32d5-0772-11f1-9674-4676ef969ef9', name: 'Giselle', accent: 'Default' },
  { id: 'moss_audio_e13b8230-0ff2-11f1-a2d4-8609e701aa01', name: 'Giselle2x', accent: 'Fast' },
  { id: 'moss_audio_6ef2ac17-fe04-11f0-a059-b236627c0572', name: 'Giselle Jap', accent: 'Japanese' },
  { id: 'moss_audio_d0c0ad38-1100-11f1-841b-1e2fac512910', name: 'Giselle Korean', accent: 'Korean' },
];

const DEFAULT_RAW_TEXT = `## ✍️ 标题
家具购买相关英语表达提升对话复盘

## 💬 对话内容
### 第一轮
- **你**：I want to buy some furniture for my house.
- **纠正后**：I'm looking to pick up some new pieces for my place.
- **我**：That's great! Are you looking for anything specific, like a sofa or a dining table?

## 🔄 表达升级（你说的 → 更地道的说法）
1. **I want to buy...** → **I'm looking to pick up...**：More casual & native.
2. **It is very expensive.** → **It's a bit out of my price range.**：Polite refusal.

## 🧩 实用句型
1. **I'm looking to [verb]...**
    - **句型框架**：Used when stating a goal or intention politely.
    - **替换例句1**：I'm looking to change my career path soon.

## 🗣️ 跟读材料
1. **“I'm looking to pick up some new pieces for my place.”**
    - **重读**：looking, pick up, new pieces, place

## 🎭 情景重练
### 迷你场景：买新手机
**你**：I'm looking to pick up a new phone today.
**朋友**：Oh nice! What kind are you looking for?`;

const DEFAULT_NOTE: Note = {
  id: 'note-1',
  title: "家具购买相关英语表达提升对话复盘",
  date: "2023.10.24",
  timestamp: 1698105600000,
  tags: ["Shopping", "Daily Life"],
  rawContent: DEFAULT_RAW_TEXT
};

const INITIAL_NOTES: Note[] = getStorageItem<Note[]>(STORAGE_KEYS.NOTES, []);

// ==========================================
// HELPER: PARSER
// ==========================================

const parseNoteContent = (raw: string) => {
  const sections = {
    title: "",
    tags: [] as string[],
    chat: [] as any[],
    upgrades: [] as any[],
    patterns: [] as any[],
    shadowing: [] as any[],
    scenario: [] as any[]
  };

  const lines = raw.split('\n');
  let currentSection = '';
  let currentRound = '';
  let currentPattern: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Support both ## format and emoji-only format
    // Check for section headers at the START of line (not anywhere in the line)
    // Also support emoji + Chinese keyword combinations
    const startsWithEmoji = trimmed.startsWith('✍️') || trimmed.startsWith('🏷️') ||
                           trimmed.startsWith('💬') || trimmed.startsWith('🔄') ||
                           trimmed.startsWith('🧩') || trimmed.startsWith('🗣️') ||
                           trimmed.startsWith('🎭');

    if (trimmed.startsWith('## 标题') || trimmed.startsWith('##✍️') || (trimmed.startsWith('✍️') && trimmed.includes('标题'))) { currentSection = 'title'; continue; }
    else if (trimmed.startsWith('## 标签') || trimmed.startsWith('##🏷️') || (trimmed.startsWith('🏷️') && trimmed.includes('标签'))) { currentSection = 'tags'; continue; }
    else if (trimmed.startsWith('## 对话') || trimmed.startsWith('##💬') || (trimmed.startsWith('💬') && trimmed.includes('对话'))) { currentSection = 'chat'; continue; }
    else if (trimmed.startsWith('## 表达升级') || trimmed.startsWith('##🔄') || (trimmed.startsWith('🔄') && trimmed.includes('升级'))) { currentSection = 'upgrades'; continue; }
    else if (trimmed.startsWith('## 实用句型') || trimmed.startsWith('##🧩') || (trimmed.startsWith('🧩') && trimmed.includes('句型'))) { currentSection = 'patterns'; continue; }
    else if (trimmed.startsWith('## 跟读材料') || trimmed.startsWith('##🗣️') || (trimmed.startsWith('🗣️') && trimmed.includes('跟读'))) { currentSection = 'shadowing'; continue; }
    else if (trimmed.startsWith('## 情景重练') || trimmed.startsWith('##🎭') || (trimmed.startsWith('🎭') && trimmed.includes('情景'))) { currentSection = 'scenario'; continue; }

    // Also check for just the section keywords at start (for format like "标题 xxx" without emoji)
    else if (/^标题[：:\s]/.test(trimmed)) { currentSection = 'title'; continue; }
    else if (/^标签[：:\s]/.test(trimmed)) { currentSection = 'tags'; continue; }
    else if (/^对话内容/.test(trimmed)) { currentSection = 'chat'; continue; }
    else if (/^表达升级/.test(trimmed)) { currentSection = 'upgrades'; continue; }
    else if (/^实用句型/.test(trimmed)) { currentSection = 'patterns'; continue; }
    else if (/^跟读材料/.test(trimmed)) { currentSection = 'shadowing'; continue; }
    else if (/^情景重练/.test(trimmed)) { currentSection = 'scenario'; continue; }

    if (currentSection === 'title') {
      if (!sections.title) sections.title = trimmed;
    } else if (currentSection === 'tags') {
      // Parse tags like #宠物日常 #英语表达提升 (may include tags on same line as header)
      // Remove header prefix first, then find tags
      const tagLine = trimmed.replace(/^#{0,2}\s*🏷️\s*标签\s*/, '');
      const tagMatches = tagLine.match(/#[^\s#]+/g) || [];
      // Also check if tags are on same line as header (handled by removal above)
      if (tagMatches.length > 0) {
        sections.tags.push(...tagMatches.map(t => t.replace('#', '')));
      } else if (trimmed.startsWith('#')) {
        // Handle tags on separate lines after header
        const tagMatches2 = trimmed.match(/#[^\s#]+/g);
        if (tagMatches2) {
          sections.tags.push(...tagMatches2.map(t => t.replace('#', '')));
        }
      }
    } else if (currentSection === 'chat') {
      // Support both markdown format (###) and emoji format (第一轮)
      if (trimmed.startsWith('###')) {
        currentRound = trimmed.replace('###', '').trim();
      } else if (trimmed.match(/^[一二三四五六七八九十]+轮/)) {
        currentRound = trimmed;
      } else if (trimmed.startsWith('- **你**：') || trimmed.startsWith('• 你：') || trimmed.startsWith('你：')) {
        // Handle both formats - remove prefix and get text
        const text = trimmed.replace(/^(- \*\*你\*\*：|• 你：|你：)\s*/, '');
        sections.chat.push({ id: `chat-${i}`, role: 'user_original', text: text, round: currentRound });
      } else if (trimmed.startsWith('- **纠正后**：') || trimmed.startsWith('• 纠正后：')) {
        const lastMsg = sections.chat[sections.chat.length - 1];
        if (lastMsg && lastMsg.role === 'user_original') {
          lastMsg.correction = trimmed.replace(/^(- \*\*纠正后\*\*：|• 纠正后：)\s*/, '');
        }
      } else if (trimmed.startsWith('- **我**：') || trimmed.startsWith('• 我：') || trimmed.startsWith('我：')) {
        const text = trimmed.replace(/^(- \*\*我\*\*：|• 我：|我：)\s*/, '');
        sections.chat.push({ id: `chat-${i}`, role: 'ai', text: text, round: currentRound });
      }
    } else if (currentSection === 'upgrades') {
      // Support BOTH markdown format and mobile format
      // Markdown: 1. **xxx** → **yyy**：zzz
      // Mobile: 1. xxx → yyy：zzz
      let match = trimmed.match(/^\d+\.\s*\*\*(.*?)\*\*\s*→\s*\*\*(.*?)\*\*[：:](.*)$/);
      if (!match) {
        match = trimmed.match(/^\d+\.\s*(.+)\s*→\s*(.+)[：:]\s*(.+)$/);
      }
      if (match) {
        sections.upgrades.push({
          original: match[1].trim(),
          improved: match[2].trim(),
          nuance: match[3].trim()
        });
      }
    } else if (currentSection === 'patterns') {
      // Check for examples FIRST (so they don't get matched as patterns)
      if (currentPattern && trimmed.includes('替换例句')) {
        // Mobile format: ◦ 替换例句1：xxx
        const exMatch = trimmed.match(/^◦\s*替换例句\d*[：:]\s*(.+)$/);
        if (exMatch) {
          currentPattern.examples.push(exMatch[1].trim());
        }
      } else if (currentPattern && trimmed.includes('句型解释')) {
        // Mobile format: ◦ 句型解释：xxx
        currentPattern.framework = trimmed.replace(/^◦\s*句型解释[：:]\s*/, '').trim();
      } else if (trimmed.match(/^\d+\.\s*(.+)$/)) {
        // Pattern title: 1. xxx
        const patternText = trimmed.replace(/^\d+\.\s*/, '').trim();
        currentPattern = {
          id: `p-${i}`,
          pattern: patternText,
          framework: '',
          examples: []
        };
        sections.patterns.push(currentPattern);
      }
    } else if (currentSection === 'shadowing') {
      // Check for stress/linking FIRST (so they don't get matched as new items)
      if (sections.shadowing.length > 0 && trimmed.includes('重读')) {
        const lastShadow = sections.shadowing[sections.shadowing.length - 1];
        lastShadow.stress = trimmed.replace(/^◦\s*重读[：:]\s*/, '').trim();
      } else if (sections.shadowing.length > 0 && trimmed.includes('连读')) {
        const lastShadow = sections.shadowing[sections.shadowing.length - 1];
        lastShadow.linking = trimmed.replace(/^◦\s*连读[：:]\s*/, '').trim();
      } else if (trimmed.match(/^\d+\.\s*"?(.+)"?$/)) {
        // Mobile format: 1. "xxx" (content may have special chars like —)
        const match = trimmed.match(/^\d+\.\s*"?(.+)"?$/);
        if (match && match[1]) {
          sections.shadowing.push({ text: match[1].trim(), stress: '', linking: '' });
        }
      }
    } else if (currentSection === 'scenario') {
      // Support both markdown format (### xxx) and emoji format (迷你场景：xxx)
      if (trimmed.startsWith('###')) {
        sections.scenario.push({ type: 'title', text: trimmed.replace('###', '').trim() });
      } else if (trimmed.includes('迷你场景') || trimmed.includes('场景')) {
        sections.scenario.push({ type: 'title', text: trimmed.replace(/.*场景[：:]\s*/, '').trim() });
      } else if (trimmed.startsWith('• 你：') || trimmed.startsWith('你：') || trimmed.match(/^你[：:]/)) {
        // Support emoji format: • 你： or 你：
        sections.scenario.push({ type: 'user', text: trimmed.replace(/^[-•]\s*你[：:]\s*/, '').trim() });
      } else if (trimmed.startsWith('• 朋友：') || trimmed.startsWith('• 网友：') || trimmed.startsWith('朋友：') || trimmed.startsWith('网友：')) {
        // Support emoji format
        const nameMatch = trimmed.match(/^[-•]\s*([网友朋友]+)[：:]\s*/);
        const name = nameMatch ? nameMatch[1] : 'Friend';
        sections.scenario.push({ type: 'friend', text: trimmed.replace(/^[-•]\s*[网友朋友]+[：:]\s*/, '').trim(), name: name });
      } else if (trimmed.match(/^\*\*(你|我)\*\*[：:]/)) {
        sections.scenario.push({ type: 'user', text: trimmed.replace(/^\*\*(你|我)\*\*[：:]/, '').trim() });
      } else if (trimmed.match(/^\*\*(.*?)\*\*[：:]/)) {
        const match = trimmed.match(/^\*\*(.*?)\*\*[：:]/);
        sections.scenario.push({ type: 'friend', text: trimmed.replace(/^\*\*(.*?)\*\*[：:]/, '').trim(), name: match ? match[1] : 'Friend' });
      }
    }
  }

 interface WordItem {
   id: string;
   word: string;
   translation?: string;
   createdAt: number;
   noteId: string;
   noteTitle: string;
 }

  return sections;
};

// ==========================================
// HELPER: LYRICS PARSER & ALIGNMENT
// ==========================================

interface LyricSegment {
  text: string;
  startTime: number;
  endTime: number;
}

const parseLyrics = (text: string): LyricSegment[] => {
  const cleanText = text.trim();
  
  // Step 1: Split by sentence endings
  let sentences = cleanText
    .replace(/([。！？.!?])\s*/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Step 2: Split long sentences by commas/semicolons
  let lines: string[] = [];
  sentences.forEach(sentence => {
    if (sentence.length <= 50) {
      lines.push(sentence);
    } else {
      const clauses = sentence
        .replace(/([，；,;])\s*/g, '$1\n')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      lines.push(...clauses);
    }
  });

  // Step 3: Force split very long lines
  if (lines.length === 0 || lines.some(line => line.length > 80)) {
    const finalLines: string[] = [];
    lines.forEach(line => {
      if (line.length <= 80) {
        finalLines.push(line);
      } else {
        const chunks = line.match(/.{1,40}/g) || [line];
        finalLines.push(...chunks);
      }
    });
    lines = finalLines;
  }

  return lines.filter(line => line.length > 0).map(text => ({ text, startTime: 0, endTime: 0 }));
};

const calculateLyricsTimestamps = (segments: LyricSegment[], totalDuration: number) => {
  if (totalDuration <= 0 || segments.length === 0) return segments;

  const totalChars = segments.reduce((sum, line) => sum + line.text.length, 0);
  let currentTime = 0;

  return segments.map(line => {
    const lineDuration = (line.text.length / totalChars) * totalDuration;
    const segment = {
      ...line,
      startTime: currentTime,
      endTime: currentTime + lineDuration
    };
    currentTime += lineDuration;
    return segment;
  });
};

// ==========================================
// COMPONENT: HIGHLIGHTED TEXT WITH CLICK
// ==========================================

const HighlightedTextWithClick: React.FC<{
  text: string;
  stress: string;
  linking: string;
  onWordClick: (word: string) => void;
}> = ({ text, stress, linking, onWordClick }) => {
  const stressWords = stress.split(/[,，]/).map(w => w.trim()).filter(Boolean);
  const linkingPhrases = linking.split(/[,，]/).map(p => {
    const match = p.match(/(.*?)(?:→|->)/);
    return match ? match[1].trim() : p.trim();
  }).filter(Boolean);

  // Process text to find highlighted words
  const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build a list of all highlights with their positions
  const allHighlights = [
    ...linkingPhrases.map(p => ({ word: p, type: 'linking' as const })),
    ...stressWords.map(w => ({ word: w, type: 'stress' as const }))
  ];

  // Find all matches and their positions
  const matches: Array<{
    start: number;
    end: number;
    word: string;
    type: 'stress' | 'linking';
  }> = [];

  allHighlights.forEach(({ word, type }) => {
    if (!word) return;
    const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        word: match[0],
        type
      });
    }
  });

  // Sort by position and remove overlaps (prioritize longer matches)
  matches.sort((a, b) => a.start - b.start);
  const filteredMatches: typeof matches = [];
  let lastEnd = 0;
  matches.forEach(m => {
    if (m.start >= lastEnd) {
      filteredMatches.push(m);
      lastEnd = m.end;
    }
  });

  // Build the render array
  const renderParts: Array<{
    text: string;
    isHighlight?: boolean;
    highlightType?: 'stress' | 'linking';
    isWord?: boolean;
  }> = [];

  let currentIndex = 0;
  filteredMatches.forEach(({ start, end, word, type }) => {
    // Add non-highlighted text before this match
    if (start > currentIndex) {
      const beforeText = text.slice(currentIndex, start);
      // Split into words
      const wordParts = beforeText.split(/([A-Za-z][A-Za-z']*)/g);
      wordParts.forEach(part => {
        if (/[A-Za-z][A-Za-z']*/.test(part)) {
          renderParts.push({ text: part, isWord: true });
        } else if (part) {
          renderParts.push({ text: part });
        }
      });
    }

    // Add highlighted word (not split, but marked as highlight + word)
    const highlightWord = text.slice(start, end);
    const wordPartsInHighlight = highlightWord.split(/([A-Za-z][A-Za-z']*)/g);
    wordPartsInHighlight.forEach(part => {
      if (/[A-Za-z][A-Za-z']*/.test(part)) {
        renderParts.push({ text: part, isHighlight: true, highlightType: type, isWord: true });
      } else if (part) {
        renderParts.push({ text: part, isHighlight: true, highlightType: type });
      }
    });

    currentIndex = end;
  });

  // Add remaining text after last match
  if (currentIndex < text.length) {
    const afterText = text.slice(currentIndex);
    const wordParts = afterText.split(/([A-Za-z][A-Za-z']*)/g);
    wordParts.forEach(part => {
      if (/[A-Za-z][A-Za-z']*/.test(part)) {
        renderParts.push({ text: part, isWord: true });
      } else if (part) {
        renderParts.push({ text: part });
      }
    });
  }

  return (
    <div className="text-lg md:text-xl leading-relaxed font-medium text-neutral-300">
      {renderParts.map((part, idx) => {
        let className = '';
        if (part.isHighlight) {
          if (part.highlightType === 'stress') {
            className = 'text-rose-400 font-semibold';
          } else {
            className = 'text-teal-400 font-semibold underline decoration-teal-500/30 underline-offset-4';
          }
        }

        if (part.isWord) {
          return (
            <span
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                onWordClick(part.text);
              }}
              className={`cursor-pointer hover:text-teal-300 ${className}`}
            >
              {part.text}
            </span>
          );
        }

        return <span key={idx} className={className}>{part.text}</span>;
      })}
    </div>
  );
};

// ==========================================
// COMPONENT: SHADOW READER
// ==========================================

const MODELS = [
  'speech-01-turbo',
  'speech-01-hd',
  'speech-02-turbo',
  'speech-02-hd',
  'speech-2.6-turbo',
  'speech-2.6-hd',
  'speech-2.8-turbo',
  'speech-2.8-hd',
];

const EMOTIONS = [
  'auto', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'fluent', 'whisper'
];

const SOUND_EFFECTS = [
  { id: 'none', name: 'None' },
  { id: 'spacious_echo', name: 'Spacious Echo' },
  { id: 'auditorium_echo', name: 'Auditorium Echo' },
  { id: 'lofi_telephone', name: 'Lo-Fi Telephone' },
  { id: 'robotic', name: 'Robotic' },
];

// ==========================================
// COMPONENT: SHADOW READER
// ==========================================

// ... (previous imports and constants)

const AUDIO_CACHE = new Map<string, string>();

// API calling helper
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = endpoint;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      const errorMsg = `API Error ${response.status}: ${errorText || 'No detail'}`;
      alert(`URL: ${url}\nError: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    return await response.json();
  } catch (error) {
    const errorMsg = `Failed ${url}: ${error instanceof Error ? error.message : String(error)}`;
    alert(`URL: ${url}\nError: ${errorMsg}`);
    throw error;
  }
};

const ShadowReader: React.FC<{
  initialText?: string,
  onBack?: () => void,
  isStandalone?: boolean,
  onSaveNote?: (content: string) => void,
  onSaveVoice?: (audioUrl: string, duration: number, text: string, customName?: string) => void,
  playbackMode?: boolean,
  initialAudioUrl?: string,
  isTouch?: boolean,
  initialSegments?: LyricSegment[],
  onEditTimestamps?: () => void,
  apiFetch?: (endpoint: string, options?: RequestInit) => Promise<any>
}> = ({ initialText, onBack, isStandalone, onSaveNote, onSaveVoice, playbackMode = false, initialAudioUrl, isTouch = false, initialSegments, onEditTimestamps, apiFetch = async (url, options) => {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
} }) => {
  // Load settings from localStorage
  const savedSettings = getStorageItem<Record<string, any>>(STORAGE_KEYS.SHADOW_SETTINGS, {});

  const [mode, setMode] = useState<'edit' | 'settings' | 'shadowing'>('edit');
  const [showSegmentEditor, setShowSegmentEditor] = useState(false);
  const [editedSegments, setEditedSegments] = useState<{text: string, start: number, end: number}[]>([]);
  const [text, setText] = useState(initialText || "The only way to do great work is to love what you do...");
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingVoiceData, setPendingVoiceData] = useState<{audioUrl: string, duration: number, text: string} | null>(null);
  const [voiceNameInput, setVoiceNameInput] = useState('');

  // Refs for scrolling
  const containerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  // --- API Parameters State ---

  // Basic
  const [model, setModel] = useState(savedSettings.model || 'speech-2.6-hd');
  const [voices, setVoices] = useState(VOICES);
  const [selectedVoice, setSelectedVoice] = useState(savedSettings.selectedVoice || 'moss_audio_e13b8230-0ff2-11f1-a2d4-8609e701aa01');
  const [speed, setSpeed] = useState(savedSettings.speed ?? 1.0);
  const [vol, setVol] = useState(savedSettings.vol ?? 3.0);

  // Add Voice State
  const [isAddingVoice, setIsAddingVoice] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceId, setNewVoiceId] = useState('');

  // Advanced - Voice Setting
  const [pitch, setPitch] = useState(savedSettings.pitch ?? 0); // [-12, 12]
  const [emotion, setEmotion] = useState<string>(savedSettings.emotion || 'auto'); // Default to first or auto

  // Advanced - Voice Modify
  const [modPitch, setModPitch] = useState(savedSettings.modPitch ?? 0); // [-100, 100]
  const [intensity, setIntensity] = useState(savedSettings.intensity ?? 0); // [-100, 100]
  const [timbre, setTimbre] = useState(savedSettings.timbre ?? 0); // [-100, 100]
  const [soundEffect, setSoundEffect] = useState(savedSettings.soundEffect || 'none');

  // UI State
  const [showAdvanced, setShowAdvanced] = useState(false); // Default collapsed ("不下拉")
  const [isLoading, setIsLoading] = useState(false);

  // Translation Language
  const [translationLang, setTranslationLang] = useState<'zh' | 'ja' | 'ko'>(savedSettings.translationLang || 'zh');

  // Save settings to localStorage when they change
  useEffect(() => {
    const settings = {
      model, selectedVoice, speed, vol,
      pitch, emotion, modPitch, intensity, timbre, soundEffect,
      translationLang
    };
    setStorageItem(STORAGE_KEYS.SHADOW_SETTINGS, settings);
  }, [model, selectedVoice, speed, vol, pitch, emotion, modPitch, intensity, timbre, soundEffect, translationLang]);

  // Shadowing State
  const [audioState, setAudioState] = useState<HTMLAudioElement | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const setAudio = (newAudio: HTMLAudioElement | null) => {
    if (audioRef.current && audioRef.current !== newAudio) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    audioRef.current = newAudio;
    setAudioState(newAudio);
  };

  const audio = audioState;

  const [segments, setSegments] = useState<LyricSegment[]>(initialSegments || []);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  
  // Translation State
  const [showTranslation, setShowTranslation] = useState(false);
  const [translatedSegments, setTranslatedSegments] = useState<string[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showLangPopup, setShowLangPopup] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [showEmotionDropdown, setShowEmotionDropdown] = useState(false);
  const [showSoundEffectDropdown, setShowSoundEffectDropdown] = useState(false);
  const [showSpeedPopup, setShowSpeedPopup] = useState(false);
  const [isTextTranslated, setIsTextTranslated] = useState(false);
  const [originalTextBeforeTranslation, setOriginalTextBeforeTranslation] = useState('');

  // Swipe back gesture
  const { handlers: swipeHandlers } = useSwipeToBack(() => {
    if (mode === 'shadowing') {
      if (!pendingVoiceData) handleBackToEdit();
    } else if (mode === 'settings') {
      setMode('edit');
    } else if (onBack) {
      onBack();
    }
  }, isTouch);

  // Audio Cleanup on Unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Apply speed to audio when it changes
  useEffect(() => {
    if (audioState) {
      audioState.playbackRate = speed;
    }
  }, [speed, audioState]);

  // Auto-scroll to center the active segment (lyric-style)
  useEffect(() => {
    if (mode === 'shadowing' && itemRefs.current[currentSegmentIndex] && containerRef.current) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!containerRef.current || !itemRefs.current[currentSegmentIndex]) return;
          const container = containerRef.current;
          const element = itemRefs.current[currentSegmentIndex];

          // Get container dimensions
          const containerHeight = container.clientHeight;
          const elementHeight = element.clientHeight;
          const elementTop = element.offsetTop;

          // Calculate target scroll position to center the element
          const targetScrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);

          // Always use 'auto' for immediate centering
          container.scrollTo({
            top: targetScrollTop,
            behavior: 'auto'
          });
        });
      });
    }
  }, [currentSegmentIndex, mode]);

  // Initial scroll when entering shadowing mode
  useEffect(() => {
    if (mode === 'shadowing' && segments.length > 0 && containerRef.current) {
      // Scroll to first segment immediately when entering shadowing mode
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!containerRef.current || !itemRefs.current[0]) return;
          const container = containerRef.current;
          const element = itemRefs.current[0];
          const containerHeight = container.clientHeight;
          const elementHeight = element.clientHeight;
          const elementTop = element.offsetTop;
          const targetScrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
          container.scrollTo({
            top: targetScrollTop,
            behavior: 'auto'
          });
        });
      });
    }
  }, [mode, segments.length]);

  // Reset itemRefs when segments change (e.g., after editing)
  useEffect(() => {
    // Reset refs when segments change to ensure scroll works properly
    itemRefs.current = Array(segments.length).fill(null);
  }, [segments]);

  // Auto-start if text is passed
  useEffect(() => {
    if (initialText) {
      setText(initialText);
      if (playbackMode && initialAudioUrl) {
        setMode('shadowing');
        // Initialize playback
        setAudio(null); // Stop any existing audio

        const newAudio = new Audio(initialAudioUrl);
        newAudio.preload = 'auto'; // Preload audio for faster startup
        setAudio(newAudio); // Assign immediately

        // Use edited timestamps if available, otherwise recalculate
        if (initialSegments && initialSegments.length > 0) {
          // Set segments immediately for instant display
          setSegments(initialSegments);
          // Set initial segment index to 0 immediately
          setCurrentSegmentIndex(0);

          newAudio.onloadedmetadata = () => {
            newAudio.currentTime = 0;
            newAudio.play().catch(e => console.error("Playback failed:", e));
            setIsPlaying(true);
          };
        } else {
          // Recalculate timestamps from text
          const rawSegments = parseLyrics(initialText);
          // Set initial segments (will be recalculated when duration is available)
          setSegments(rawSegments.map((seg, idx) => ({
            ...seg,
            startTime: idx,
            endTime: idx + 1
          })));

          newAudio.onloadedmetadata = () => {
            const duration = newAudio.duration;
            const timedSegments = calculateLyricsTimestamps(rawSegments, duration);
            setSegments(timedSegments);
            newAudio.currentTime = 0;
            newAudio.play().catch(e => console.error("Playback failed:", e));
            setIsPlaying(true);
          };
        }
      } else {
        // Show edit mode so user can edit the text
        setMode('edit');
      }
    }
  }, [initialText, playbackMode, initialAudioUrl, initialSegments]);

  // Audio Time Update Listener
  useEffect(() => {
    if (!audio) return;

    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime;

      // Find current segment (use <= on endTime to catch boundary cases)
      const activeIndex = segments.findIndex(
        seg => currentTime >= seg.startTime && currentTime <= seg.endTime
      );

      if (activeIndex !== -1 && activeIndex !== currentSegmentIndex) {
        setCurrentSegmentIndex(activeIndex);
      }
    };

    const handlePlay = () => {
      // Immediately update segment when playback starts
      const currentTime = audio.currentTime;
      const activeIndex = segments.findIndex(
        seg => currentTime >= seg.startTime && currentTime <= seg.endTime
      );
      if (activeIndex !== -1) {
        setCurrentSegmentIndex(activeIndex);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentSegmentIndex(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audio, segments, currentSegmentIndex]);

  const handleAddVoice = () => {
    if (newVoiceName && newVoiceId) {
      const newVoice = { id: newVoiceId, name: newVoiceName, accent: 'Custom' };
      setVoices([...voices, newVoice]);
      setSelectedVoice(newVoiceId);
      setIsAddingVoice(false);
      setNewVoiceName('');
      setNewVoiceId('');
    }
  };

  const handleToSettings = () => {
    if (!text.trim()) return;
    setMode('settings');
  };
  
  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    setIsLoading(true);
    setMode('shadowing');
    
    // Reset state
    setAudio(null);
    setSegments([]);
    setCurrentSegmentIndex(0);
    setTranslatedSegments([]);
    setShowTranslation(false);
    setIsPlaying(false);

    // Check Cache
    const cacheKey = JSON.stringify({
      model,
      text,
      voice_id: selectedVoice,
      speed,
      vol,
      pitch,
      emotion,
      modPitch,
      intensity,
      timbre,
      soundEffect
    });

    if (AUDIO_CACHE.has(cacheKey)) {
      const url = AUDIO_CACHE.get(cacheKey)!;
      const newAudio = new Audio(url);
      setAudio(newAudio); // Assign immediately
      const rawSegments = parseLyrics(text);
      
      newAudio.onloadedmetadata = () => {
        const duration = newAudio.duration;
        const timedSegments = calculateLyricsTimestamps(rawSegments, duration);
        setSegments(timedSegments);
        // Set initial segment index when starting playback
        if (timedSegments.length > 0) {
          setCurrentSegmentIndex(0);
        }
        newAudio.currentTime = 0;
        newAudio.play().catch(e => console.error("Playback failed:", e));
        setIsPlaying(true);
      };
      setIsLoading(false);
      return;
    }
    
    try {
      const data = await apiFetch('/api/tts', {
        method: 'POST',
        body: JSON.stringify({
          model: model,
          text: text,
          stream: false,
          language_boost: 'auto',
          voice_setting: {
            voice_id: selectedVoice,
            speed: speed,
            vol: vol,
            pitch: pitch,
            ...(emotion !== 'auto' && { emotion: emotion })
          },
          voice_modify: {
            pitch: modPitch,
            intensity: intensity,
            timbre: timbre,
            sound_effects: soundEffect === 'none' ? undefined : soundEffect
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            channel: 1
          }
        })
      });

      if (data.base_resp?.status_code !== 0) {
        throw new Error(data.base_resp?.status_msg || 'Generation failed');
      }

      if (data.data?.audio) {
        // Convert hex to audio blob
        const hex = data.data.audio;
        const bytes = new Uint8Array(hex.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16)));
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);

        // Create audio object
        const newAudio = new Audio(url);
        setAudio(newAudio); // Assign immediately

        // Cache the result
        AUDIO_CACHE.set(cacheKey, url);

        // Parse lyrics and wait for metadata to calculate timestamps
        const rawSegments = parseLyrics(text);

        newAudio.onloadedmetadata = () => {
          const duration = newAudio.duration;
          const timedSegments = calculateLyricsTimestamps(rawSegments, duration);
          setSegments(timedSegments);
          // Set initial segment index when starting playback
          if (timedSegments.length > 0) {
            setCurrentSegmentIndex(0);
          }
          newAudio.currentTime = 0; // Ensure start at 0
          newAudio.play().catch(e => console.error("Playback failed:", e));
          setIsPlaying(true);
        };
      } else {
        throw new Error('No audio data returned from API');
      }

    } catch (error) {
      console.error('Generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Provide more helpful error message
      let detailedMessage = errorMessage;
      if (errorMessage.includes('404') || errorMessage.includes('Failed to fetch')) {
        detailedMessage = `${errorMessage}. Please make sure the server is running and you're on the same network.`;
      }
      alert(`Failed to generate speech: ${detailedMessage}`);
      setMode('settings'); // Go back to settings on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranslate = async (targetLang?: 'zh' | 'ja' | 'ko') => {
    const langToUse = targetLang || translationLang;

    // Toggle: if already translated with this language, restore original text
    if (targetLang && isTextTranslated && translationLang === targetLang) {
      setText(originalTextBeforeTranslation);
      setIsTextTranslated(false);
      setShowTranslation(false);
      return;
    }

    // If we are switching languages, we need to re-translate
    // If we are just toggling visibility (targetLang undefined), check if we have segments
    if (!targetLang && translatedSegments.length > 0) {
      setShowTranslation(!showTranslation);
      return;
    }

    if (targetLang) {
      setTranslationLang(targetLang);
      setShowTranslation(true); // Ensure visible when switching

      // Save original text before translating
      if (!isTextTranslated) {
        setOriginalTextBeforeTranslation(text);
      }
    }

    setIsTranslating(true);
    try {
      let translations: string[] = [];

      if (segments.length > 0) {
        // Translate each segment individually
        for (const segment of segments) {
          const data = await apiFetch('/api/translate', {
            method: 'POST',
            body: JSON.stringify({
              text: segment.text,
              targetLang: langToUse
            })
          });

          if (data.translatedText) {
            translations.push(data.translatedText);
          } else if (data.error) {
            console.error('Translation API error:', data.error);
            alert(`Translation failed: ${data.error}`);
            translations.push(segment.text); // Fallback to original
          } else {
            translations.push(segment.text); // Fallback to original
          }
        }
        setTranslatedSegments(translations);
      } else {
        // In edit mode - translate the whole text
        const data = await apiFetch('/api/translate', {
          method: 'POST',
          body: JSON.stringify({
            text: text,
            targetLang: langToUse
          })
        });

        if (data.translatedText) {
          setText(data.translatedText);
          setIsTextTranslated(true);
          setIsTranslating(false);
          return;
        } else if (data.error) {
          console.error('Translation API error:', data.error);
          alert(`Translation failed: ${data.error}`);
          setIsTranslating(false);
          return;
        }
      }

      // Replace text with translation
      const translatedText = translations.join('\n');
      setText(translatedText);
      setIsTextTranslated(true);
    } catch (error) {
      console.error("Translation failed", error);
      alert("Translation failed. Please try again.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleBackToEdit = () => {
    setAudio(null);
    setIsPlaying(false);
    if (onBack) {
      onBack();
    } else {
      setMode('edit');
    }
  };

  const togglePlay = () => {
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const playSegment = (index: number) => {
    if (!audioState || !segments[index]) return;
    
    audioState.pause();
    setCurrentSegmentIndex(index);
    audioState.currentTime = segments[index].startTime;
    audioState.play().catch(e => console.error("Playback failed:", e));
    setIsPlaying(true);
  };

  const handlePrevSegment = () => {
    const newIndex = Math.max(0, currentSegmentIndex - 1);
    playSegment(newIndex);
  };

  const handleNextSegment = () => {
    const newIndex = Math.min(segments.length - 1, currentSegmentIndex + 1);
    playSegment(newIndex);
  };

  const handleReplay = () => {
    if (audio) {
      audio.currentTime = 0;
      setCurrentSegmentIndex(0);
      audio.play();
      setIsPlaying(true);
    }
  };

  // Save functionality
  const handleSaveSegment = (segment: LyricSegment) => {
    if (onSaveNote) {
      onSaveNote(segment.text);
      // Immersive feedback: no alert, maybe a small toast or icon change could be added here
      // For now, we rely on the main save button for the "breathing" feedback
    }
  };

  const handleConfirmSaveVoice = () => {
    if (pendingVoiceData && onSaveVoice) {
      onSaveVoice(pendingVoiceData.audioUrl, pendingVoiceData.duration, pendingVoiceData.text, voiceNameInput || undefined);
      setShowSaveModal(false);
      setPendingVoiceData(null);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleSaveAll = async () => {
    setSaveStatus('saving');
    
    try {
      let audioDataUrl = audio?.src;
      
      if (audio && audio.src && audio.src.startsWith('blob:')) {
        const response = await fetch(audio.src);
        const blob = await response.blob();
        audioDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      if (onSaveVoice && audio && audioDataUrl) {
        // Show modal to get name
        const text = segments.map(s => s.text).join('\n');
        const words = text.trim().split(/\s+/);
        const defaultName = words.slice(0, 3).join(' ') + (words.length > 3 ? '...' : '');
        setPendingVoiceData({ audioUrl: audioDataUrl, duration: audio.duration, text });
        setVoiceNameInput(defaultName);
        setShowSaveModal(true);
        return;
      } else if (onSaveNote) {
        // Fallback to notes if only onSaveNote is provided
        const fullText = segments.map(s => s.text).join('\n');
        onSaveNote(fullText);
        
        // Also trigger download of audio if available
        if (audio) {
           const a = document.createElement('a');
           a.href = audio.src;
           a.download = `shadowing-${Date.now()}.mp3`;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
        }
      }
      
      setSaveStatus('success');
      
      // Reset status after animation
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("Failed to save audio:", error);
      setSaveStatus('idle');
    }
  };


  return (
    <motion.div
      className="text-neutral-200 font-sans selection:bg-teal-500/30"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      {...swipeHandlers}
    >
      {/* Save Voice Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-800 rounded-2xl border border-white/10 p-6 w-[90%] max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Save Voice</h3>
            <input
              type="text"
              value={voiceNameInput}
              onChange={(e) => setVoiceNameInput(e.target.value)}
              placeholder="Voice name"
              className="w-full px-4 py-3 bg-neutral-900 border border-white/10 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500/50 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setPendingVoiceData(null);
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-neutral-700 text-neutral-300 hover:bg-neutral-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSaveVoice}
                className="flex-1 px-4 py-3 rounded-xl bg-teal-600 text-white hover:bg-teal-500 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Segment Editor Modal */}
      {showSegmentEditor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 rounded-2xl border border-white/10 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Edit Segments</h3>
              <button
                onClick={() => setShowSegmentEditor(false)}
                className="p-2 rounded-full hover:bg-white/10 text-neutral-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {editedSegments.map((seg, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1">
                    <textarea
                      value={seg.text}
                      onChange={(e) => {
                        const newSegments = [...editedSegments];
                        newSegments[idx].text = e.target.value;
                        setEditedSegments(newSegments);
                      }}
                      className="w-full bg-neutral-800 text-white p-3 rounded-xl border border-white/10 focus:border-teal-500/50 outline-none resize-none text-sm"
                      rows={2}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    {idx > 0 && (
                      <button
                        onClick={() => {
                          // Merge with previous
                          const prevSeg = editedSegments[idx - 1];
                          const currSeg = seg;
                          const prevEndsWithLetter = /[a-zA-Z]$/.test(prevSeg.text);
                          const currStartsWithLetter = /^[a-zA-Z]/.test(currSeg.text);
                          // If hard split (word cut), merge without space; otherwise add space
                          const separator = (prevEndsWithLetter && currStartsWithLetter) ? '' : ' ';
                          const newSegments = [...editedSegments];
                          newSegments[idx - 1].text += separator + currSeg.text;
                          newSegments.splice(idx, 1);
                          setEditedSegments(newSegments);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-teal-400"
                        title="Merge with previous"
                      >
                        <ChevronUp size={16} />
                      </button>
                    )}
                    {idx < editedSegments.length - 1 && (
                      <button
                        onClick={() => {
                          // Merge with next
                          const currSeg = editedSegments[idx];
                          const nextSeg = editedSegments[idx + 1];
                          const currEndsWithLetter = /[a-zA-Z]$/.test(currSeg.text);
                          const nextStartsWithLetter = /^[a-zA-Z]/.test(nextSeg.text);
                          // If hard split (word cut), merge without space; otherwise add space
                          const separator = (currEndsWithLetter && nextStartsWithLetter) ? '' : ' ';
                          const newSegments = [...editedSegments];
                          newSegments[idx].text += separator + nextSeg.text;
                          newSegments.splice(idx + 1, 1);
                          setEditedSegments(newSegments);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-teal-400"
                        title="Merge with next"
                      >
                        <ChevronDown size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 p-4 border-t border-white/10">
              <button
                onClick={() => setShowSegmentEditor(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Update segments with new text
                  const newSegments = editedSegments.map((seg, idx) => {
                    // Keep original timing (use startTime/endTime, not start/end)
                    const original = segments[idx];
                    return {
                      ...seg,
                      startTime: original?.startTime ?? idx * 2,
                      endTime: original?.endTime ?? (idx + 1) * 2
                    };
                  });
                  // Recalculate timing proportionally based on text length to match audio
                  const totalTextLength = editedSegments.reduce((sum, s) => sum + s.text.length, 0);
                  const audioDuration = audio?.duration || (segments[segments.length - 1]?.endTime || 60);
                  let accumulatedTime = 0;
                  const recalculatedSegments = newSegments.map((seg, idx) => {
                    const proportion = totalTextLength > 0 ? seg.text.length / totalTextLength : 1 / newSegments.length;
                    const duration = proportion * audioDuration;
                    const newStartTime = accumulatedTime;
                    const newEndTime = accumulatedTime + duration;
                    accumulatedTime = newEndTime;
                    return {
                      ...seg,
                      startTime: newStartTime,
                      endTime: newEndTime
                    };
                  });
                  // Force re-render with recalculated segments
                  setSegments(recalculatedSegments);
                  // Also update text state so edits persist when going back to edit mode
                  setText(editedSegments.map(s => s.text).join('\n'));
                  // Reset itemRefs to ensure scroll works after editing
                  itemRefs.current = [];
                  // Reset segment index if out of bounds
                  if (currentSegmentIndex >= recalculatedSegments.length) {
                    setCurrentSegmentIndex(Math.max(0, recalculatedSegments.length - 1));
                  }
                  // Trigger scroll after a small delay to let DOM update
                  setTimeout(() => {
                    setCurrentSegmentIndex(0);
                  }, 100);
                  setShowSegmentEditor(false);
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-teal-600 text-white hover:bg-teal-500 transition-colors"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#09090b]/95 backdrop-blur-sm px-2 flex justify-between items-end" style={{ paddingTop: '1rem', paddingBottom: '1.5rem' }}>
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Shadow Reader</h1>
          <p className="text-neutral-500 text-sm">Practice speaking every day</p>
        </div>

        {(mode === 'edit' || mode === 'settings') && (
          <button
            onClick={mode === 'settings' ? handleGenerate : handleToSettings}
            disabled={!text.trim() || isLoading}
            className="px-4 py-2 rounded-full bg-teal-500 font-semibold text-black hover:bg-teal-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && mode === 'settings' && <Loader2 size={16} className="animate-spin" />}
            {mode === 'settings' ? (isLoading ? 'Generating...' : 'Next') : 'Next'}
          </button>
        )}

        {mode === 'shadowing' && (
          <div className="flex items-center gap-2">
            {playbackMode && onEditTimestamps && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Pause audio before entering timestamp editor
                  if (audio) {
                    audio.pause();
                    setIsPlaying(false);
                  }
                  onEditTimestamps();
                }}
                className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors z-50 relative"
                title="Edit Timestamps"
              >
                <Clock size={20} />
              </button>
            )}
            {!playbackMode && (
              <>
                {!pendingVoiceData && (
                  <button onClick={handleBackToEdit} className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditedSegments(segments.map(s => ({ text: s.text, start: s.startTime, end: s.endTime })));
                    setShowSegmentEditor(true);
                  }}
                  className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  title="Edit Segments"
                >
                  <Edit3 size={20} />
                </button>
                <button
                  onClick={handleSaveAll}
                  className={`p-2 rounded-full transition-all duration-500 ${
                    saveStatus === 'success'
                      ? 'bg-teal-500 text-white scale-110 shadow-[0_0_15px_rgba(20,184,166,0.5)]'
                      : 'hover:bg-white/10 text-teal-400 hover:text-teal-300'
                  }`}
                  title="Save All"
                >
                  {saveStatus === 'success' ? (
                    <Check size={20} className="animate-in zoom-in duration-300" />
                  ) : saveStatus === 'saving' ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Save size={20} />
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </header>

      <main className="p-4 h-[calc(100dvh-72px-64px)] overflow-hidden">
        <AnimatePresence mode="wait">
          {mode === 'edit' && (
            <motion.div
              key="edit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-xl mx-auto flex flex-col h-full"
            >
              <div className="flex justify-end items-center gap-2 px-2 mt-6 h-10">
                {text.trim() && (
                  <div className="relative group">
                    <button
                      onClick={() => setShowLangPopup(!showLangPopup)}
                      className={`p-1.5 rounded-full transition-colors ${isTextTranslated ? 'text-teal-400 bg-teal-900/30' : 'text-neutral-400 hover:text-white bg-neutral-700/50 hover:bg-neutral-600'}`}
                      title={isTextTranslated ? "Restore original text" : "Translate"}
                    >
                      {isTranslating ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
                    </button>
                    <div className={`absolute top-full right-0 mt-2 bg-neutral-800 rounded-xl border border-white/10 p-2 shadow-xl flex flex-col gap-1 z-50 origin-top-right transition-opacity ${isTouch ? (showLangPopup ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none') : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                      <button onClick={() => { handleTranslate('zh'); setShowLangPopup(false); }} className={`text-lg p-2 rounded-lg hover:bg-white/10 ${translationLang === 'zh' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇨🇳</button>
                      <button onClick={() => { handleTranslate('ja'); setShowLangPopup(false); }} className={`text-lg p-2 rounded-lg hover:bg-white/10 ${translationLang === 'ja' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇯🇵</button>
                      <button onClick={() => { handleTranslate('ko'); setShowLangPopup(false); }} className={`text-lg p-2 rounded-lg hover:bg-white/10 ${translationLang === 'ko' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇰🇷</button>
                    </div>
                  </div>
                )}
                {text && (
                  <button
                    onClick={() => {
                      setText('');
                      setIsTextTranslated(false);
                      setOriginalTextBeforeTranslation('');
                    }}
                    className="p-1.5 rounded-full bg-neutral-700/50 hover:bg-neutral-600 text-neutral-400 hover:text-red-400 transition-colors"
                    title="Clear all"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="relative flex-1 min-h-0 pb-20">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full h-full bg-transparent text-neutral-200 py-2 px-6 outline-none resize-none text-xl font-semibold leading-relaxed placeholder:text-neutral-600 placeholder:font-semibold placeholder:text-left text-left overflow-y-auto"
                  placeholder="Paste your learning material here..."
                />
              </div>
            </motion.div>
          )}

          {mode === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-xl mx-auto flex flex-col h-full overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto space-y-8 pb-32">
              {/* Controls */}
              <div className="space-y-6">
                
                {/* --- Basic Settings --- */}
                <div className="space-y-6">
                  {/* Model */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400 ml-1">Model</label>
                    <div className="relative">
                      <button
                        onClick={() => {
                          setShowModelDropdown(!showModelDropdown);
                          setShowVoiceDropdown(false);
                          setShowEmotionDropdown(false);
                          setShowSoundEffectDropdown(false);
                        }}
                        className="w-full flex items-center justify-between bg-neutral-800/50 text-white p-3 pr-10 rounded-xl border border-white/10 focus:border-teal-500/30"
                      >
                        <span>{model}</span>
                        <ChevronDown className="text-neutral-500" size={16} />
                      </button>
                      {showModelDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-neutral-800 rounded-xl border border-white/10 overflow-hidden z-50"
                        >
                          {MODELS.map(m => (
                            <button
                              key={m}
                              onClick={() => { setModel(m); setShowModelDropdown(false); }}
                              className={`w-full text-left px-4 py-3 hover:bg-white/10 transition-colors ${model === m ? 'text-teal-400 bg-teal-900/20' : 'text-white'}`}
                            >
                              {m}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </div>

                  {/* Voice */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-sm font-medium text-neutral-400">Voice</label>
                      <button 
                        onClick={() => {
                          setIsAddingVoice(!isAddingVoice);
                          setShowModelDropdown(false);
                          setShowVoiceDropdown(false);
                          setShowEmotionDropdown(false);
                          setShowSoundEffectDropdown(false);
                        }}
                        className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
                      >
                        <Plus size={12} /> Add New
                      </button>
                    </div>
                    
                    {isAddingVoice ? (
                      <div className="bg-neutral-800/50 p-3 rounded-xl border border-white/10 space-y-3">
                        <input
                          type="text"
                          placeholder="Voice Name (e.g. My Custom Voice)"
                          value={newVoiceName}
                          onChange={(e) => setNewVoiceName(e.target.value)}
                          className="w-full bg-neutral-900 text-white text-sm p-2 rounded-lg border border-white/10 focus:border-teal-500/30 outline-none"
                        />
                        <input
                          type="text"
                          placeholder="Voice ID (moss_audio_...)"
                          value={newVoiceId}
                          onChange={(e) => setNewVoiceId(e.target.value)}
                          className="w-full bg-neutral-900 text-white text-sm p-2 rounded-lg border border-white/10 focus:border-teal-500/30 outline-none font-mono"
                        />
                        <div className="flex gap-2">
                          <button 
                            onClick={handleAddVoice}
                            disabled={!newVoiceName || !newVoiceId}
                            className="flex-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium py-2 rounded-lg transition-colors"
                          >
                            Save Voice
                          </button>
                          <button 
                            onClick={() => setIsAddingVoice(false)}
                            className="px-3 bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-medium py-2 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowVoiceDropdown(!showVoiceDropdown);
                            setShowModelDropdown(false);
                            setShowEmotionDropdown(false);
                            setShowSoundEffectDropdown(false);
                          }}
                          className="w-full flex items-center justify-between bg-neutral-800/50 text-white p-3 pr-10 rounded-xl border border-white/10 focus:border-teal-500/30"
                        >
                          <span>{voices.find(v => v.id === selectedVoice)?.name} • {voices.find(v => v.id === selectedVoice)?.accent}</span>
                          <ChevronDown className="text-neutral-500" size={16} />
                        </button>
                        {showVoiceDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full left-0 right-0 mt-2 bg-neutral-800 rounded-xl border border-white/10 overflow-hidden z-50 max-h-60 overflow-y-auto"
                          >
                            {voices.map(v => (
                              <button
                                key={v.id}
                                onClick={() => { setSelectedVoice(v.id); setShowVoiceDropdown(false); }}
                                className={`w-full text-left px-4 py-3 hover:bg-white/10 transition-colors ${selectedVoice === v.id ? 'text-teal-400 bg-teal-900/20' : 'text-white'}`}
                              >
                                {v.name} • {v.accent}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Speed & Volume Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center ml-1">
                        <label className="text-sm font-medium text-neutral-400">Speed</label>
                        <span className="text-xs font-mono text-teal-400">{speed}x</span>
                      </div>
                      <input 
                        type="range" min="0.5" max="2.0" step="0.1"
                        value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center ml-1">
                        <label className="text-sm font-medium text-neutral-400">Volume</label>
                        <span className="text-xs font-mono text-teal-400">{vol}</span>
                      </div>
                      <input 
                        type="range" min="0" max="10" step="0.5"
                        value={vol} onChange={(e) => setVol(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                    </div>
                  </div>
                </div>

                {/* --- Advanced Settings (Collapsible) --- */}
                <div className="border border-white/10 rounded-2xl overflow-hidden bg-neutral-900/30">
                  <button 
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Settings2 size={18} />
                      <span className="text-sm font-medium">Advanced Parameters</span>
                    </div>
                    {showAdvanced ? <ChevronUp size={18} className="text-neutral-500" /> : <ChevronDown size={18} className="text-neutral-500" />}
                  </button>
                  
                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 pt-0 space-y-6 border-t border-white/10">
                          
                          {/* Voice Setting: Pitch & Emotion */}
                          <div className="grid grid-cols-1 gap-4 pt-4">
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-neutral-500">
                                <span>Pitch (Tune)</span>
                                <span>{pitch}</span>
                              </div>
                              <input 
                                type="range" min="-12" max="12" step="1"
                                value={pitch} onChange={(e) => setPitch(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-neutral-400"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <label className="text-xs text-neutral-500">Emotion</label>
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    setShowEmotionDropdown(!showEmotionDropdown);
                                    setShowModelDropdown(false);
                                    setShowVoiceDropdown(false);
                                    setShowSoundEffectDropdown(false);
                                  }}
                                  className="w-full flex items-center justify-between bg-neutral-800/50 text-neutral-300 text-sm p-2.5 pr-8 rounded-lg border border-white/10"
                                >
                                  <span>{emotion}</span>
                                  <ChevronDown className="text-neutral-500" size={14} />
                                </button>
                                {showEmotionDropdown && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute top-full left-0 right-0 mt-2 bg-neutral-800 rounded-lg border border-white/10 overflow-y-auto z-50 max-h-[140px] no-scrollbar"
                                  >
                                    {EMOTIONS.map(e => (
                                      <button
                                        key={e}
                                        onClick={() => { setEmotion(e); setShowEmotionDropdown(false); }}
                                        className={`w-full text-left px-3 py-2.5 hover:bg-white/10 transition-colors ${emotion === e ? 'text-teal-400 bg-teal-900/20' : 'text-neutral-300'}`}
                                      >
                                        {e}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="h-px bg-white/5" />

                          {/* Voice Modify: Pitch, Intensity, Timbre */}
                          <div className="space-y-4">
                            <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Voice Effects</p>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-neutral-500">
                                <span>Pitch (Effect)</span>
                                <span>{modPitch}</span>
                              </div>
                              <input 
                                type="range" min="-100" max="100" step="1"
                                value={modPitch} onChange={(e) => setModPitch(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-neutral-500">
                                <span>Intensity</span>
                                <span>{intensity}</span>
                              </div>
                              <input 
                                type="range" min="-100" max="100" step="1"
                                value={intensity} onChange={(e) => setIntensity(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-neutral-500">
                                <span>Timbre</span>
                                <span>{timbre}</span>
                              </div>
                              <input 
                                type="range" min="-100" max="100" step="1"
                                value={timbre} onChange={(e) => setTimbre(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs text-neutral-500">Sound Effect</label>
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    setShowSoundEffectDropdown(!showSoundEffectDropdown);
                                    setShowModelDropdown(false);
                                    setShowVoiceDropdown(false);
                                    setShowEmotionDropdown(false);
                                  }}
                                  className="w-full flex items-center justify-between bg-neutral-800/50 text-neutral-300 text-sm p-2.5 pr-8 rounded-lg border border-white/10"
                                >
                                  <span>{SOUND_EFFECTS.find(s => s.id === soundEffect)?.name || 'None'}</span>
                                  <ChevronDown className="text-neutral-500" size={14} />
                                </button>
                                {showSoundEffectDropdown && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute bottom-full left-0 right-0 mb-2 bg-neutral-800 rounded-lg border border-white/10 overflow-hidden z-50 max-h-48 overflow-y-auto"
                                  >
                                    {SOUND_EFFECTS.map(s => (
                                      <button
                                        key={s.id}
                                        onClick={() => { setSoundEffect(s.id); setShowSoundEffectDropdown(false); }}
                                        className={`w-full text-left px-3 py-2.5 hover:bg-white/10 transition-colors ${soundEffect === s.id ? 'text-teal-400 bg-teal-900/20' : 'text-neutral-300'}`}
                                      >
                                        {s.name}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </div>
                            </div>
                          </div>

                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              </div>
            </motion.div>
          )}

          {mode === 'shadowing' && (
            <motion.div
              key="shadowing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-x-0 top-[72px] bottom-16 overflow-y-auto no-scrollbar pb-48 px-8 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] scroll-smooth"
              ref={containerRef}
              style={{ scrollBehavior: 'smooth' }}
            >
              {segments.length > 0 ? (
                <div className="space-y-8 py-[40vh]">
                  {segments.map((seg, idx) => (
                    <div
                      key={idx}
                      ref={el => { itemRefs.current[idx] = el; }}
                      className={`transition-all duration-500 cursor-pointer group ${
                        idx === currentSegmentIndex
                          ? 'scale-100 opacity-100 blur-0'
                          : 'scale-95 opacity-40 blur-[1px] hover:opacity-70 hover:blur-0'
                      }`}
                      onClick={() => playSegment(idx)}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 text-center">
                          <p className={`text-2xl md:text-3xl font-bold leading-relaxed transition-colors duration-500 whitespace-pre-wrap break-normal ${
                            idx === currentSegmentIndex ? 'text-white' : 'text-neutral-400'
                          }`}>
                            {seg.text}
                          </p>
                          {showTranslation && translatedSegments[idx] && (
                            <motion.p 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-lg text-teal-300 mt-3 font-medium whitespace-pre-wrap break-normal"
                            >
                              {translatedSegments[idx]}
                            </motion.p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="fixed inset-0 flex items-center justify-center bg-[#09090b]/80 z-40">
                  <div className="text-center">
                    <Loader2 className="animate-spin mx-auto text-teal-400 mb-4" size={48} />
                    <p className="text-neutral-400 text-lg">Analyzing audio...</p>
                  </div>
                </div>
              )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
  
        {/* Sticky Player */}
        {mode === 'shadowing' && (
          <div className="fixed bottom-24 left-0 right-0 z-50 px-4">
            <div className="max-w-3xl mx-auto bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-2xl">
              {/* Progress Bar */}
              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-4 cursor-pointer" onClick={(e) => {
                if (!audio) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                audio.currentTime = percent * audio.duration;
              }}>
                <div 
                  className="h-full bg-teal-500 transition-all duration-100" 
                  style={{ width: `${audio ? (audio.currentTime / audio.duration) * 100 : 0}%` }}
                />
              </div>
              
              <div className="flex items-center justify-between px-2 pb-4 max-w-2xl mx-auto w-full">
                {/* Left: Loop (auxiliary) */}
                <button
                  onClick={handleReplay}
                  className="p-3 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  title="Replay"
                >
                  <RotateCcw size={22} />
                </button>

                {/* Center: Core controls - grouped tightly */}
                <div className="flex items-center gap-2">
                  {/* Prev */}
                  <button
                    onClick={handlePrevSegment}
                    className="p-3 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                    title="Previous"
                  >
                    <SkipBack size={24} />
                  </button>

                  {/* Play/Pause - Teal color to match brand */}
                  <button
                    onClick={togglePlay}
                    className="w-14 h-14 bg-teal-500 text-black rounded-full flex items-center justify-center shadow-lg hover:bg-teal-400 hover:scale-105 transition-all active:scale-95"
                  >
                    {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-0.5" />}
                  </button>

                  {/* Next */}
                  <button
                    onClick={handleNextSegment}
                    className="p-3 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                    title="Next"
                  >
                    <SkipForward size={24} />
                  </button>
                </div>

                {/* Right: Translate + Speed (auxiliary group) */}
                <div className="flex items-center gap-1">
                  {/* Translate */}
                  <div className="relative group">
                    <button
                      onClick={() => {
                        setShowLangPopup(!showLangPopup);
                        setShowSpeedPopup(false);
                      }}
                      className={`p-3 rounded-full transition-colors ${isTextTranslated ? 'text-teal-400 bg-teal-900/30' : 'text-neutral-400 hover:text-white'}`}
                      title={isTextTranslated ? "Restore original text" : "Translate"}
                    >
                      {isTranslating ? <Loader2 size={22} className="animate-spin" /> : <Languages size={22} />}
                    </button>

                    {/* Language Selector Popup - toggle on click for touch devices, hover on desktop */}
                    <div className={`absolute bottom-full right-0 mb-2 bg-neutral-800 rounded-xl border border-white/10 p-2 shadow-xl flex flex-col gap-1 z-50 origin-bottom-right transition-opacity ${isTouch ? (showLangPopup ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none') : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                       <button onClick={() => { handleTranslate('zh'); setShowLangPopup(false); }} className={`text-xl p-2 rounded-lg hover:bg-white/10 ${translationLang === 'zh' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇨🇳</button>
                       <button onClick={() => { handleTranslate('ja'); setShowLangPopup(false); }} className={`text-xl p-2 rounded-lg hover:bg-white/10 ${translationLang === 'ja' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇯🇵</button>
                       <button onClick={() => { handleTranslate('ko'); setShowLangPopup(false); }} className={`text-xl p-2 rounded-lg hover:bg-white/10 ${translationLang === 'ko' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇰🇷</button>
                    </div>
                  </div>

                  {/* Speed */}
                  <div className="relative group">
                    <button
                      onClick={() => {
                        setShowSpeedPopup(!showSpeedPopup);
                        setShowLangPopup(false);
                      }}
                      className="px-3 py-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors text-sm font-medium"
                      title="Playback speed"
                    >
                      {speed}x
                    </button>
                    <div className={`absolute bottom-full right-0 mb-2 bg-neutral-800 rounded-xl border border-white/10 p-2 shadow-xl flex flex-col gap-1 z-50 origin-bottom-right transition-opacity ${isTouch ? (showSpeedPopup ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none') : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                        <button
                          key={s}
                          onClick={() => { setSpeed(s); setShowSpeedPopup(false); }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${speed === s ? 'bg-teal-600/30 text-teal-400' : 'text-neutral-400 hover:bg-white/10 hover:text-white'}`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </motion.div>
  );
};

// ==========================================
// COMPONENT: NOTES LIST
// ==========================================

const NotesList: React.FC<{
  notes: Note[],
  onSelectNote: (note: Note) => void,
  onAddNote: () => void,
  onDeleteNote: (id: string) => void,
  filterTag: string | null,
  onSetFilterTag: (tag: string | null) => void,
  isTouch?: boolean
}> = ({ notes, onSelectNote, onAddNote, onDeleteNote, filterTag, onSetFilterTag, isTouch = false }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showMoreTags, setShowMoreTags] = useState(false);
  const moreTagsRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreTagsRef.current && !moreTagsRef.current.contains(e.target as Node)) {
        setShowMoreTags(false);
      }
    };
    if (showMoreTags) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMoreTags]);

  const handleDeleteClick = (id: string) => {
    setShowDeleteConfirm(id);
  };

  const confirmDelete = () => {
    if (showDeleteConfirm) {
      onDeleteNote(showDeleteConfirm);
      setShowDeleteConfirm(null);
    }
  };

  const sequenceMap = useMemo(() => {
    const sorted = [...notes].sort((a, b) => a.timestamp - b.timestamp);
    const map = new Map<string, number>();
    sorted.forEach((n, i) => map.set(n.id, i + 1));
    return map;
  }, [notes]);

  // Extract all unique tags sorted by most recent use
  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    notes.forEach(note => {
      note.tags.forEach(t => {
        // Keep the most recent timestamp for each tag
        if (!tagMap.has(t) || tagMap.get(t)! < note.timestamp) {
          tagMap.set(t, note.timestamp);
        }
      });
    });
    // Sort by timestamp descending (most recent first)
    return Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let res = [...notes];
    if (filterTag) {
      res = res.filter(n => n.tags.includes(filterTag));
    }
    return res.sort((a, b) => b.timestamp - a.timestamp);
  }, [notes, filterTag]);

  return (
    <motion.div 
      className="min-h-screen bg-[#09090b] text-[#e4e4e7] p-4 pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <header className="mb-6 mt-4 px-2 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">My Notes</h1>
          <p className="text-neutral-500 text-sm">Review your daily progress</p>
        </div>
        <button 
          onClick={onAddNote}
          className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-lg hover:bg-teal-500 transition-colors"
        >
          <Plus size={24} />
        </button>
      </header>

      {/* Tags Filter */}
      <div className="relative mb-6">
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar pr-10 pl-2">
            <button
              onClick={() => onSetFilterTag(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${!filterTag ? 'bg-white text-black' : 'bg-[#18181b] text-neutral-400 border border-white/10'}`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => onSetFilterTag(tag === filterTag ? null : tag)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${tag === filterTag ? 'bg-teal-900/50 text-teal-200 border border-teal-500/30' : 'bg-[#18181b] text-neutral-400 border border-white/10'}`}
              >
                #{tag}
              </button>
            ))}
          </div>
          {/* Fade gradient on right edge */}
          <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-[#09090b] to-transparent pointer-events-none" />
        </div>
        {allTags.length > 0 && (
          <button
            onClick={() => setShowMoreTags(true)}
            className="absolute right-0 top-0 p-1.5 text-neutral-400 hover:text-white"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>

      {/* Full Page Tags Modal */}
      {showMoreTags && (
        <motion.div
          initial={{ y: '-100%' }}
          animate={{ y: 0 }}
          exit={{ y: '-100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-x-0 top-0 bg-[#09090b] z-[100] p-4 pb-8 overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Select Tag</h3>
            <button
              onClick={() => setShowMoreTags(false)}
              className="p-2 rounded-full hover:bg-white/10 text-neutral-400"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => {
                  onSetFilterTag(tag === filterTag ? null : tag);
                  setShowMoreTags(false);
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${tag === filterTag ? 'bg-teal-900/50 text-teal-200 border border-teal-500/30' : 'bg-[#18181b] text-neutral-400 border border-white/10 hover:bg-white/5'}`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      <div className="space-y-4">
        {filteredNotes.length === 0 ? (
          <div className="text-center py-20 text-neutral-600">
            <p>No notes found.</p>
          </div>
        ) : (
          filteredNotes.map(note => {
            return (
              <div
                key={note.id}
                onClick={() => onSelectNote(note)}
                className="bg-[#18181b] border border-white/10 rounded-2xl p-5 active:scale-[0.98] transition-transform group cursor-pointer hover:bg-white/[0.02]"
              >
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-white/10 text-white text-[10px] font-mono px-2 py-1 rounded-full border border-white/10">
                      #{sequenceMap.get(note.id) || 0}
                    </span>
                    <span className="bg-teal-950/30 text-teal-500/80 text-[10px] font-mono px-2 py-1 rounded-full border border-teal-900/30">
                      Daily Review
                    </span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-neutral-500 text-xs font-mono">{note.date}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(note.id);
                      }}
                      className="p-1.5 text-neutral-600 hover:text-red-400 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-medium text-neutral-200 mb-2 line-clamp-2">{note.title}</h3>
                <div className="flex gap-2">
                  {note.tags.map(tag => (
                    <span key={tag} className="text-xs text-neutral-500">#{tag}</span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              className="bg-[#18181b] border border-white/10 rounded-2xl p-6 w-full max-w-sm"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-2">Delete Note</h3>
              <p className="text-neutral-400 text-sm mb-6">Are you sure you want to delete this note? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-neutral-300 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ==========================================
// COMPONENT: NOTES DETAIL
// ==========================================

const NotesDetail: React.FC<{
  note: Note,
  onNavigateToShadow: (text: string) => void,
  onBack: () => void,
  onSave: (updatedNote: Note) => void,
  onDelete: (id: string) => void,
  savedVoices: VoiceItem[],
  onPlayVoice: (voice: VoiceItem) => void,
  isTouch?: boolean,
  sentenceVoiceAssociations: Record<string, string[]>,
  onUpdateAssociations: (sentenceKey: string, voiceIds: string[]) => void,
  onAddWord: (word: string, translation?: string) => void
}> = ({ note, onNavigateToShadow, onBack, onSave, onDelete, savedVoices, onPlayVoice, isTouch = false, sentenceVoiceAssociations, onUpdateAssociations, onAddWord }) => {
  const [activeAccordion, setActiveAccordion] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(note.rawContent === "");
  const [rawText, setRawText] = useState(note.rawContent);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const detailContentRef = useRef<HTMLDivElement>(null);
  const [wordModal, setWordModal] = useState<{ word: string; translation?: string; loading: boolean; structuredData?: any } | null>(null);
  const [selection, setSelection] = useState<{ text: string, x: number, y: number } | null>(null);

  // Selection listener
  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null);
        return;
      }

      const text = sel.toString().trim();
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Ensure the selection is within our detail content
      if (detailContentRef.current && !detailContentRef.current.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }

      setSelection({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top
      });
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  // Swipe back gesture
  const { handlers: swipeHandlers } = useSwipeToBack(() => {
    if (isEditing) {
      setIsEditing(false);
    } else {
      onBack();
    }
  }, isTouch);

  // Delete note with confirmation
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete(note.id);
  };

  // Export note detail as image - opens system share sheet
  const handleShareNote = async () => {
    if (!detailContentRef.current) return;

    try {
      const dataUrl = await toPng(detailContentRef.current, {
        backgroundColor: '#09090b',
        pixelRatio: 2,
        cacheBust: true,
      });

      // Convert data URL to blob for sharing
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], `note-${note.date.replace(/\//g, '-')}.png`, { type: 'image/png' });

      // Check if Web Share API is available (mobile)
      if (navigator.share && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Save to Photos',
            text: 'Shadow Reader Note'
          });
          // Show success toast
          setShowToast("Saved to Photos");
          setTimeout(() => setShowToast(null), 2000);
          return;
        } catch (shareError: any) {
          // User cancelled - do nothing
          if (shareError.name === 'AbortError') {
            return;
          }
          // Other error, fall back to download
          console.log('Share failed, falling back to download');
        }
      }

      // Fallback for desktop or when share fails
      const link = document.createElement('a');
      link.download = `note-${note.date.replace(/\//g, '-')}.png`;
      link.href = dataUrl;
      link.click();

      // Show success toast
      setShowToast("Saved to Photos");
      setTimeout(() => setShowToast(null), 2000);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Parse content for view mode
  const parsedContent = useMemo(() => parseNoteContent(rawText), [rawText]);

  // Voice Association State
  const [openVoiceDropdown, setOpenVoiceDropdown] = useState<string | null>(null);
  const [openPlayDropdown, setOpenPlayDropdown] = useState<string | null>(null);

  // Detail Page Player State
  const [detailPlayingVoice, setDetailPlayingVoice] = useState<VoiceItem | null>(null);
  const [detailIsPlaying, setDetailIsPlaying] = useState(false);
  const [detailPlaybackSpeed, setDetailPlaybackSpeed] = useState(1);
  const [showDetailSpeedPopup, setShowDetailSpeedPopup] = useState(false);
  const [detailCurrentTime, setDetailCurrentTime] = useState(0);
  const [detailDuration, setDetailDuration] = useState(0);
  const [detailVoiceList, setDetailVoiceList] = useState<VoiceItem[]>([]);
  const [detailVoiceIndex, setDetailVoiceIndex] = useState(0);
  const [showVoiceListPopup, setShowVoiceListPopup] = useState(false);
  const detailAudioRef = React.useRef<HTMLAudioElement | null>(null);

  // Handle playing voice in detail page
  const handlePlayVoiceInDetail = (voice: VoiceItem, voiceList?: VoiceItem[]) => {
    if (detailPlayingVoice?.id === voice.id) {
      // Toggle play/pause
      if (detailIsPlaying) {
        detailAudioRef.current?.pause();
        setDetailIsPlaying(false);
      } else {
        detailAudioRef.current?.play();
        setDetailIsPlaying(true);
      }
    } else {
      // New voice
      if (detailAudioRef.current) {
        detailAudioRef.current.src = voice.audioUrl;
        detailAudioRef.current.play();
        setDetailPlayingVoice(voice);
        setDetailIsPlaying(true);
        if (voiceList && voiceList.length > 0) {
          setDetailVoiceList(voiceList);
          const idx = voiceList.findIndex(v => v.id === voice.id);
          setDetailVoiceIndex(idx >= 0 ? idx : 0);
        }
      }
    }
  };

  // Handle audio events
  React.useEffect(() => {
    const audio = detailAudioRef.current;
    if (!audio) return;
    const handleEnded = () => {
      setDetailIsPlaying(false);
      setDetailPlayingVoice(null);
      setDetailCurrentTime(0);
    };
    const handleTimeUpdate = () => {
      setDetailCurrentTime(audio.currentTime);
    };
    const handleLoadedMetadata = () => {
      setDetailDuration(audio.duration);
    };
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);

  // Update playback speed when changed
  React.useEffect(() => {
    if (detailAudioRef.current) {
      detailAudioRef.current.playbackRate = detailPlaybackSpeed;
    }
  }, [detailPlaybackSpeed]);

  // Get unique key for a sentence (combines note id + section + index)
  const getSentenceKey = (section: string, index: number, text: string) => {
    return `${note.id}-${section}-${index}-${text.slice(0, 20)}`;
  };

  // Get associated voices for a sentence
  const getAssociatedVoices = (sentenceKey: string): VoiceItem[] => {
    const voiceIds = sentenceVoiceAssociations[sentenceKey] || [];
    return voiceIds.map(id => savedVoices.find(v => v.id === id)).filter(Boolean) as VoiceItem[];
  };

  const globallyUsedVoiceIds = useMemo(() => {
    const set = new Set<string>();
    Object.values(sentenceVoiceAssociations).forEach(arr => {
      arr.forEach(id => set.add(id));
    });
    return Array.from(set);
  }, [sentenceVoiceAssociations]);

  // Associate a voice with a sentence
  const associateVoice = (sentenceKey: string, voiceId: string) => {
    const current = sentenceVoiceAssociations[sentenceKey] || [];
    if (current.includes(voiceId)) return; // Already associated
    onUpdateAssociations(sentenceKey, [...current, voiceId]);
    setOpenVoiceDropdown(null);
  };

  // Remove voice association
  const removeVoiceAssociation = (sentenceKey: string, voiceId: string) => {
    const current = sentenceVoiceAssociations[sentenceKey] || [];
    onUpdateAssociations(sentenceKey, current.filter(id => id !== voiceId));
  };

  const toggleAccordion = (id: string) => {
    setActiveAccordion(activeAccordion === id ? null : id);
  };

  const handleShowToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 2000);
  };

  const handleBack = () => {
    if (note.rawContent === "" && rawText === "") {
      onDelete(note.id);
    }
    onBack();
  };

  const handleSave = () => {
    // Extract title from content: ## ✍️ 标题 or ✍️ 标题 (next line) - flexible matching
    const titleMatch = rawText.match(/(?:#{0,2}\s*✍️\s*标题)\s*\n(.+)/i);
    let extractedTitle = note.title;

    if (titleMatch) {
      extractedTitle = titleMatch[1].trim();
    } else if (rawText.trim()) {
      // Fallback: use first non-empty line as title
      const firstLine = rawText.split('\n').find(line => line.trim());
      if (firstLine) {
        extractedTitle = firstLine.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim().slice(0, 50);
      }
    }

    // Extract tags from #tag format OR 🏷️ 标签 section
    let newTags = [...note.tags];
    const tagsMatch = rawText.match(/(?:^|\s)(#[^\s#.,!?;:]+)/g);
    if (tagsMatch) {
      newTags = [...new Set(tagsMatch.map(t => t.trim().replace(/^#/, '')))];
    }
    // Also check for 🏷️ 标签 section (flexible matching)
    const tagSectionMatch = rawText.match(/(?:🏷️\s*标签)\s*\n?([\s\S]*?)(?=\n#{0,2}\s*\S|$)/i);
    if (tagSectionMatch) {
      const tagLine = tagSectionMatch[1].trim();
      const sectionTags = tagLine.match(/#[^\s#.,!?;:]+/g);
      if (sectionTags) {
        newTags = [...new Set([...newTags, ...sectionTags.map(t => t.replace(/^#/, ''))])];
      }
    }

    onSave({
      ...note,
      title: extractedTitle || 'Untitled',
      tags: newTags,
      rawContent: rawText
    });
    setIsEditing(false);
  };

  const handleGlobalClick = (e: React.MouseEvent) => {
    // Only close if not clicking inside a dropdown or the trigger
    const target = e.target as HTMLElement;
    if (!target.closest('.voice-dropdown-container')) {
      setOpenVoiceDropdown(null);
      setOpenPlayDropdown(null);
    }
  };

  const handleWordClick = async (word: string) => {
    // 1. Check Cache first
    const cacheKey = `tr-${word.toLowerCase()}`;
    const cached = getStorageItem<any>(STORAGE_KEYS.TRANSLATION_CACHE, {})[cacheKey];
    if (cached) {
      setWordModal({ 
        word, 
        translation: cached.translation, 
        loading: false,
        structuredData: cached.structuredData
      });
      return;
    }

    setWordModal({ word, translation: undefined, loading: true });
    try {
      const data = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: word, targetLang: 'zh' })
      }).then(r => r.json());

      if (data && data.translatedText) {
        let structuredData = null;
        try {
          const parsed = JSON.parse(data.translatedText);
          // Map short keys to full keys for compatibility
          structuredData = {
            type: parsed.t || parsed.type,
            meaningDesc: parsed.m || parsed.meaningDesc,
            partOfSpeech: parsed.p || parsed.partOfSpeech,
            phonetic: parsed.ph || parsed.phonetic,
            fullTranslation: parsed.f || parsed.fullTranslation
          };
        } catch (e) {
          console.log('Not a JSON translation');
        }

        const translation = structuredData ? (structuredData.fullTranslation || "") : data.translatedText;

        // 2. Save to Cache
        const currentCache = getStorageItem<any>(STORAGE_KEYS.TRANSLATION_CACHE, {});
        currentCache[cacheKey] = { translation, structuredData };
        // Limit cache size to 200 items to avoid LocalStorage overflow
        const keys = Object.keys(currentCache);
        if (keys.length > 200) {
          delete currentCache[keys[0]];
        }
        setStorageItem(STORAGE_KEYS.TRANSLATION_CACHE, currentCache);

        setWordModal({ 
          word, 
          translation, 
          loading: false,
          structuredData
        });
      } else {
        setWordModal({ word, translation: undefined, loading: false });
      }
    } catch {
      setWordModal({ word, translation: undefined, loading: false });
    }
  };

  const WordText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
    const parts = text.split(/([A-Za-z][A-Za-z']*)/g);
    return (
      <p className={className}>
        {parts.map((part, idx) =>
          /[A-Za-z][A-Za-z']*/.test(part) ? (
            <span
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                handleWordClick(part);
              }}
              className="cursor-pointer hover:text-teal-300"
            >
              {part}
            </span>
          ) : (
            <span key={idx}>{part}</span>
          )
        )}
      </p>
    );
  };

  return (
    <motion.div
      className="min-h-screen bg-[#09090b] text-[#e4e4e7] font-sans pb-24"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      {...swipeHandlers}
      onClick={handleGlobalClick}
    >
      {/* 1. Header */}
      <header className="sticky top-0 z-20 bg-[#09090b]/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 rounded-full text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate text-neutral-200">{note.title}</h1>
          <p className="text-[10px] text-neutral-500 font-mono uppercase tracking-wider mt-0.5">{note.date} • Daily Review</p>
        </div>
        {isEditing && rawText && (
          <button
            onClick={() => setRawText('')}
            className="p-2 rounded-full text-neutral-400 hover:bg-white/5 hover:text-red-400 transition-colors"
            title="Clear all"
          >
            <Trash2 size={18} />
          </button>
        )}
        <button
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          className={`p-2 rounded-full transition-colors ${isEditing ? 'text-teal-400 bg-teal-950/30' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}
        >
          {isEditing ? <Save size={18} /> : <Edit3 size={18} />}
        </button>
        <button
          onClick={handleShareNote}
          className="p-2 rounded-full text-neutral-400 hover:bg-white/5 hover:text-teal-400 transition-colors"
          title="Export as image"
        >
          <Share size={18} />
        </button>
      </header>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeleteConfirm(false)} />
            <motion.div className="relative bg-[#18181b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-lg font-semibold text-white mb-2">Delete Note</h3>
              <p className="text-neutral-400 text-sm mb-6">Are you sure you want to delete this note? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 rounded-full bg-neutral-800 text-neutral-300 font-medium hover:bg-neutral-700">Cancel</button>
                <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-full bg-red-600 text-white font-medium hover:bg-red-500">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={detailContentRef} className="bg-[#09090b]">
        {isEditing ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 h-[calc(100vh-80px)] flex flex-col gap-4"
        >
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onPaste={(e) => {
              // Handle paste for better mobile support
              e.preventDefault();
              // Try to get plain text, fallback to HTML if needed
              let pastedText = e.clipboardData.getData('text/plain');
              if (!pastedText) {
                // Try HTML as fallback
                pastedText = e.clipboardData.getData('text/html');
                if (pastedText) {
                  // Strip HTML tags to get plain text with markdown preserved
                  pastedText = pastedText.replace(/<[^>]*>/g, '');
                }
              }
              if (!pastedText) return;

              const textarea = e.target as HTMLTextAreaElement;
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              const newText = rawText.substring(0, start) + pastedText + rawText.substring(end);
              setRawText(newText);
              // Set cursor position after pasted text
              setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;
              }, 0);
            }}
            className="w-full flex-1 min-h-[200px] bg-[#18181b] text-neutral-300 p-4 rounded-2xl border border-white/10 focus:border-teal-500/50 outline-none resize-none font-mono text-sm leading-relaxed overflow-y-auto"
            placeholder="Paste your raw notes here..."
          />
        </motion.div>
      ) : (
        <main className="p-4 space-y-8 max-w-2xl mx-auto">
          
          {/* Module A: Scene Reconstruction */}
          {parsedContent.chat.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={14} className="text-teal-500/70" />
                <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Scene Reconstruction</h2>
              </div>
              
              <div className="space-y-6">
                {parsedContent.chat.map((msg: any, index: number) => {
                  const showRound = index === 0 || msg.round !== parsedContent.chat[index - 1].round;
                  return (
                    <React.Fragment key={msg.id}>
                      {showRound && msg.round && (
                        <div className="text-center my-4">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-600 bg-neutral-900 px-3 py-1 rounded-full border border-white/10">
                            {msg.round}
                          </span>
                        </div>
                      )}
                      <div className={`flex flex-col ${msg.role === 'ai' ? 'items-start' : 'items-end'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed relative group ${
                          msg.role === 'ai' 
                            ? 'bg-[#18181b] text-neutral-300 rounded-tl-none border border-white/10' 
                            : 'bg-[#18181b] text-neutral-300 rounded-tr-none border border-white/10'
                        }`}>
                          {msg.role === 'user_original' && (
                            <div className="mb-3 pb-3 border-b border-white/10 opacity-60">
                              <p className="font-mono text-xs text-neutral-500 mb-1 uppercase tracking-wider">Original</p>
                              <p className="line-through decoration-neutral-600 decoration-1">{msg.text}</p>
                            </div>
                          )}
                          
                          {msg.role === 'user_original' && msg.correction ? (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-mono text-xs text-teal-500/80 uppercase tracking-wider flex items-center gap-1">
                                  <Sparkles size={10} /> Better
                                </p>
                                <div className="flex items-center gap-1">
                                  <VoiceDropdown
                                    sentenceKey={getSentenceKey('chat-correction', index, msg.correction)}
                                    associatedVoices={getAssociatedVoices(getSentenceKey('chat-correction', index, msg.correction))}
                                    savedVoices={savedVoices}
                                    globallyUsedVoiceIds={globallyUsedVoiceIds}
                                    isOpen={openVoiceDropdown === getSentenceKey('chat-correction', index, msg.correction)}
                                    onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('chat-correction', index, msg.correction) ? null : getSentenceKey('chat-correction', index, msg.correction))}
                                    isPlayDropdownOpen={openPlayDropdown === getSentenceKey('chat-correction', index, msg.correction)}
                                    onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('chat-correction', index, msg.correction) ? null : getSentenceKey('chat-correction', index, msg.correction))}
                                    onAssociate={(voiceId) => associateVoice(getSentenceKey('chat-correction', index, msg.correction), voiceId)}
                                    onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('chat-correction', index, msg.correction), voiceId)}
                                    onPlay={handlePlayVoiceInDetail}
                                    onShowToast={handleShowToast}
                                    isTouch={isTouch}
                                    closeOtherDropdown={() => setOpenPlayDropdown(null)}
                                    closeMainDropdown={() => setOpenVoiceDropdown(null)}
                                    align="right"
                                  />
                                  <button
                                    onClick={() => onNavigateToShadow(msg.correction!)}
                                    className="opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-teal-400"
                                    title="Shadow this sentence"
                                  >
                                    <Headphones size={14} />
                                  </button>
                                </div>
                              </div>
                              <WordText className="text-teal-100/90 font-medium" text={msg.correction} />
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <WordText text={msg.text} />
                              <div className="flex items-center gap-1 shrink-0">
                                <VoiceDropdown
                                  sentenceKey={getSentenceKey('chat', index, msg.text)}
                                  associatedVoices={getAssociatedVoices(getSentenceKey('chat', index, msg.text))}
                                  savedVoices={savedVoices}
                                  globallyUsedVoiceIds={globallyUsedVoiceIds}
                                  isOpen={openVoiceDropdown === getSentenceKey('chat', index, msg.text)}
                                  onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('chat', index, msg.text) ? null : getSentenceKey('chat', index, msg.text))}
                                  isPlayDropdownOpen={openPlayDropdown === getSentenceKey('chat', index, msg.text)}
                                  onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('chat', index, msg.text) ? null : getSentenceKey('chat', index, msg.text))}
                                  onAssociate={(voiceId) => associateVoice(getSentenceKey('chat', index, msg.text), voiceId)}
                                  onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('chat', index, msg.text), voiceId)}
                                  onPlay={handlePlayVoiceInDetail}
                                  onShowToast={handleShowToast}
                                  isTouch={isTouch}
                                  closeOtherDropdown={() => setOpenPlayDropdown(null)}
                                  closeMainDropdown={() => setOpenVoiceDropdown(null)}
                                  align="right"
                                />
                                <button
                                  onClick={() => onNavigateToShadow(msg.text)}
                                  className="opacity-100 transition-opacity p-1 -mr-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-teal-400 shrink-0"
                                  title="Shadow this sentence"
                                >
                                  <Headphones size={14} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
          </section>
          )}

          {/* Module B: Expression Upgrade */}
          {parsedContent.upgrades.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw size={14} className="text-teal-500/70" />
                <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Expression Upgrade</h2>
              </div>

              <div className="grid gap-3">
                {parsedContent.upgrades.map((item: any, idx: number) => (
                <div key={idx} className="bg-[#18181b] border border-white/10 rounded-xl p-4 relative overflow-visible group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-neutral-800 group-hover:bg-teal-900/50 transition-colors" />
                  <div className="space-y-3 pl-2">
                    <div className="flex items-start gap-3 opacity-60">
                      <span className="bg-neutral-800 text-neutral-500 text-[10px] font-mono px-1.5 py-0.5 rounded uppercase">Before</span>
                      <p className="text-sm line-through decoration-neutral-600 text-neutral-400 font-mono">{item.original}</p>
                    </div>
                    <ArrowDown size={14} className="text-neutral-600 ml-10" />
                    <div className="flex items-start gap-3 justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <span className="bg-teal-950/30 text-teal-500/80 text-[10px] font-mono px-1.5 py-0.5 rounded uppercase border border-teal-900/30 shrink-0">After</span>
                        <div className="w-full">
                          <WordText className="text-sm text-neutral-200 font-medium" text={item.improved} />
                          <p className="text-xs text-neutral-500 mt-1">{item.nuance}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <VoiceDropdown
                          sentenceKey={getSentenceKey('upgrade', idx, item.improved)}
                          associatedVoices={getAssociatedVoices(getSentenceKey('upgrade', idx, item.improved))}
                          savedVoices={savedVoices}
                          globallyUsedVoiceIds={globallyUsedVoiceIds}
                          isOpen={openVoiceDropdown === getSentenceKey('upgrade', idx, item.improved)}
                          onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('upgrade', idx, item.improved) ? null : getSentenceKey('upgrade', idx, item.improved))}
                          isPlayDropdownOpen={openPlayDropdown === getSentenceKey('upgrade', idx, item.improved)}
                          onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('upgrade', idx, item.improved) ? null : getSentenceKey('upgrade', idx, item.improved))}
                          onAssociate={(voiceId) => associateVoice(getSentenceKey('upgrade', idx, item.improved), voiceId)}
                          onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('upgrade', idx, item.improved), voiceId)}
                          onPlay={handlePlayVoiceInDetail}
                          onShowToast={handleShowToast}
                          isTouch={isTouch}
                          closeOtherDropdown={() => setOpenPlayDropdown(null)}
                          closeMainDropdown={() => setOpenVoiceDropdown(null)}
                          align="right"
                        />
                        <button
                          onClick={() => onNavigateToShadow(item.improved)}
                          className={`${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity p-1.5 hover:bg-white/10 rounded-full text-neutral-400 hover:text-teal-400`}
                          title="Shadow this sentence"
                        >
                          <Headphones size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Module C: Practical Patterns */}
          {parsedContent.patterns.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-teal-500/70" />
                <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Patterns</h2>
              </div>

              <div className="space-y-2">
                {parsedContent.patterns.map((item: any) => (
                <div key={item.id} className="bg-[#18181b] border border-white/10 rounded-xl overflow-visible relative">
                  <button 
                    onClick={() => toggleAccordion(item.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="font-mono text-sm text-teal-200/90 font-medium">{item.pattern}</span>
                    {activeAccordion === item.id ? <ChevronUp size={16} className="text-neutral-500" /> : <ChevronDown size={16} className="text-neutral-500" />}
                  </button>
                  <AnimatePresence>
                    {activeAccordion === item.id && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-black/20"
                      >
                        <div className="p-4 pt-0 border-t border-white/10 space-y-3">
                          <div className="pt-3">
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Framework</p>
                            <p className="text-xs text-neutral-400">{item.framework}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Examples</p>
                            <div className="space-y-2">
                              {item.examples.map((ex: string, i: number) => (
                                <div key={i} className="flex justify-between items-center gap-2">
                                  <div className="text-sm text-neutral-300 font-mono pl-3 border-l-2 border-teal-900/50 italic">
                                    <WordText text={`"${ex}"`} />
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <VoiceDropdown
                                      sentenceKey={getSentenceKey(`pattern-${item.id}`, i, ex)}
                                      associatedVoices={getAssociatedVoices(getSentenceKey(`pattern-${item.id}`, i, ex))}
                                      savedVoices={savedVoices}
                                    globallyUsedVoiceIds={globallyUsedVoiceIds}
                                      isOpen={openVoiceDropdown === getSentenceKey(`pattern-${item.id}`, i, ex)}
                                      onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey(`pattern-${item.id}`, i, ex) ? null : getSentenceKey(`pattern-${item.id}`, i, ex))}
                                      isPlayDropdownOpen={openPlayDropdown === getSentenceKey(`pattern-${item.id}`, i, ex)}
                                      onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey(`pattern-${item.id}`, i, ex) ? null : getSentenceKey(`pattern-${item.id}`, i, ex))}
                                      onAssociate={(voiceId) => associateVoice(getSentenceKey(`pattern-${item.id}`, i, ex), voiceId)}
                                      onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey(`pattern-${item.id}`, i, ex), voiceId)}
                                      onPlay={handlePlayVoiceInDetail}
                                      onShowToast={handleShowToast}
                                      isTouch={isTouch}
                                      closeOtherDropdown={() => setOpenPlayDropdown(null)}
                                      closeMainDropdown={() => setOpenVoiceDropdown(null)}
                                      align="right"
                                    />
                                    <button
                                      onClick={() => onNavigateToShadow(ex)}
                                      className="p-1.5 hover:bg-white/10 rounded-full text-neutral-500 hover:text-teal-400 shrink-0"
                                      title="Shadow this sentence"
                                    >
                                      <Headphones size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Module D: Shadowing Material */}
          {parsedContent.shadowing.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Mic size={14} className="text-teal-500/70" />
                <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Shadowing</h2>
              </div>

              <div className="space-y-4">
                {parsedContent.shadowing.map((item: any, idx: number) => (
                  <div key={idx} className="bg-gradient-to-b from-[#18181b] to-[#131315] border border-white/10 rounded-2xl p-5 relative overflow-visible">
                    {/* Decorative background noise/texture could go here */}
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                      <Quote size={40} />
                    </div>

                    <div className="relative z-10 space-y-6">
                      <HighlightedTextWithClick
                        text={item.text}
                        stress={item.stress}
                        linking={item.linking}
                        onWordClick={handleWordClick}
                      />

                      <div className="flex gap-4 text-[10px] text-neutral-500 font-mono uppercase pt-2 border-t border-white/10">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-teal-500/50"></span> Linking
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500/50"></span> Stress
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <VoiceDropdown
                          sentenceKey={getSentenceKey('shadowing', idx, item.text)}
                          associatedVoices={getAssociatedVoices(getSentenceKey('shadowing', idx, item.text))}
                          savedVoices={savedVoices}
                          globallyUsedVoiceIds={globallyUsedVoiceIds}
                          isOpen={openVoiceDropdown === getSentenceKey('shadowing', idx, item.text)}
                          onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('shadowing', idx, item.text) ? null : getSentenceKey('shadowing', idx, item.text))}
                          isPlayDropdownOpen={openPlayDropdown === getSentenceKey('shadowing', idx, item.text)}
                          onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('shadowing', idx, item.text) ? null : getSentenceKey('shadowing', idx, item.text))}
                          onAssociate={(voiceId) => associateVoice(getSentenceKey('shadowing', idx, item.text), voiceId)}
                          onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('shadowing', idx, item.text), voiceId)}
                          onPlay={handlePlayVoiceInDetail}
                          onShowToast={handleShowToast}
                          isTouch={isTouch}
                          closeOtherDropdown={() => setOpenPlayDropdown(null)}
                          closeMainDropdown={() => setOpenVoiceDropdown(null)}
                          direction="up"
                        />
                        <button
                          onClick={() => onNavigateToShadow(item.text)}
                          className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10 rounded-xl py-3 px-4 flex items-center justify-center gap-2 transition-all active:scale-[0.98] group"
                        >
                          <Headphones size={18} className="text-teal-500/80 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-medium">Send to Shadow Reader</span>
                          <ArrowRight size={14} className="opacity-50 group-hover:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Module E: Next Challenge / Scenario */}
          {parsedContent.scenario.length > 0 && (
            <section className="pt-4">
              <div className="bg-gradient-to-r from-neutral-900 via-[#1a1a1a] to-neutral-900 border border-white/10 rounded-2xl p-1">
                <div className="bg-[#09090b] rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                    <div className="w-10 h-10 rounded-full bg-teal-900/20 flex items-center justify-center text-teal-500 border border-teal-500/20">
                      <Target size={20} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium text-neutral-200">Scenario Practice</h3>
                      {parsedContent.scenario.filter((s: any) => s.type === 'title').map((s: any, i: number) => (
                        <p key={i} className="text-xs text-neutral-500">{s.text}</p>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 pt-2">
                    {parsedContent.scenario.filter((s: any) => s.type !== 'title').map((s: any, i: number) => (
                      <div key={i} className={`flex flex-col ${s.type === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
                          s.type === 'user'
                            ? 'bg-teal-900/20 text-teal-100 rounded-tr-none border border-teal-500/20'
                            : 'bg-[#18181b] text-neutral-300 rounded-tl-none border border-white/10'
                        }`}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-[10px] opacity-50 uppercase tracking-wider">{s.name || (s.type === 'user' ? 'You' : 'Friend/AI')}</p>
                            <div className="flex items-center gap-1">
                              <VoiceDropdown
                                sentenceKey={getSentenceKey('scenario', i, s.text)}
                                associatedVoices={getAssociatedVoices(getSentenceKey('scenario', i, s.text))}
                                savedVoices={savedVoices}
                                globallyUsedVoiceIds={globallyUsedVoiceIds}
                                isOpen={openVoiceDropdown === getSentenceKey('scenario', i, s.text)}
                                onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('scenario', i, s.text) ? null : getSentenceKey('scenario', i, s.text))}
                                isPlayDropdownOpen={openPlayDropdown === getSentenceKey('scenario', i, s.text)}
                                onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('scenario', i, s.text) ? null : getSentenceKey('scenario', i, s.text))}
                                onAssociate={(voiceId) => associateVoice(getSentenceKey('scenario', i, s.text), voiceId)}
                                onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('scenario', i, s.text), voiceId)}
                                onPlay={handlePlayVoiceInDetail}
                                onShowToast={handleShowToast}
                                isTouch={isTouch}
                                closeOtherDropdown={() => setOpenPlayDropdown(null)}
                                closeMainDropdown={() => setOpenVoiceDropdown(null)}
                                align="right"
                                direction="up"
                              />
                              <button
                                onClick={() => onNavigateToShadow(s.text)}
                                className="p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-teal-400 transition-colors"
                                title="Play voice"
                              >
                                <Headphones size={12} />
                              </button>
                            </div>
                          </div>
                          <WordText text={s.text} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

        </main>
      )}

      {/* Hidden Audio Element */}
      <audio ref={detailAudioRef} />

      {/* Detail Page Mini Player */}
      {detailPlayingVoice && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-24 left-0 right-0 z-50 px-4"
        >
          {/* Slide down to close handle */}
          <div className="max-w-3xl mx-auto mb-2 flex justify-center">
            <button
              onClick={() => {
                detailAudioRef.current?.pause();
                setDetailPlayingVoice(null);
              }}
              className="p-2 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              title="Close player"
            >
              <ChevronDown size={20} />
            </button>
          </div>
          <div className="max-w-3xl mx-auto bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-3 shadow-2xl">
            {/* Progress Bar */}
            <div className="mb-2">
              <input
                type="range"
                min={0}
                max={detailDuration || 100}
                value={detailCurrentTime}
                onChange={(e) => {
                  const time = parseFloat(e.target.value);
                  detailAudioRef.current!.currentTime = time;
                  setDetailCurrentTime(time);
                  detailAudioRef.current!.play();
                  setDetailIsPlaying(true);
                }}
                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
              />
              <div className="flex justify-between text-xs text-neutral-500 mt-1">
                <span>{Math.floor(detailCurrentTime)}s</span>
                <span>{Math.floor(detailDuration)}s</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <p className="text-sm font-medium text-white truncate">{detailPlayingVoice.title}</p>
                {/* Hamburger menu for voice list */}
                {detailVoiceList.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowVoiceListPopup(!showVoiceListPopup);
                        setShowDetailSpeedPopup(false);
                      }}
                      className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                      title="Voice list"
                    >
                      <Menu size={14} />
                    </button>
                    {showVoiceListPopup && (
                      <div className="absolute bottom-full left-0 mb-2 bg-neutral-800 rounded-xl border border-white/10 p-1 shadow-xl z-[60] min-w-[160px] max-w-[200px] max-w-[calc(100vw-40px)]">
                        {detailVoiceList.map((voice, idx) => (
                          <button
                            key={voice.id}
                            onClick={() => {
                              handlePlayVoiceInDetail(voice, detailVoiceList);
                              setDetailVoiceIndex(idx);
                              setShowVoiceListPopup(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg truncate block max-w-full ${idx === detailVoiceIndex ? 'bg-teal-500/20 text-teal-400' : 'text-neutral-200 hover:bg-white/5'}`}
                          >
                            {voice.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {/* Seek backward */}
                <button
                  onClick={() => {
                    const newTime = Math.max(0, detailAudioRef.current!.currentTime - 5);
                    detailAudioRef.current!.currentTime = newTime;
                    setDetailCurrentTime(newTime);
                  }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  title="Back 5s"
                >
                  <SkipBack size={14} />
                </button>

                {/* Restart */}
                <button
                  onClick={() => {
                    detailAudioRef.current!.currentTime = 0;
                    setDetailCurrentTime(0);
                  }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  title="Restart"
                >
                  <RotateCcw size={14} />
                </button>

                {/* Play/Pause - Circular */}
                <button
                  onClick={() => handlePlayVoiceInDetail(detailPlayingVoice, detailVoiceList)}
                  className="w-9 h-9 rounded-full bg-teal-500 hover:bg-teal-400 text-neutral-900 transition-colors flex items-center justify-center flex-shrink-0"
                >
                  {detailIsPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>

                {/* Speed */}
                <div className="relative group flex-shrink-0">
                  <button
                    onClick={() => {
                      setShowDetailSpeedPopup(!showDetailSpeedPopup);
                      setShowVoiceListPopup(false);
                    }}
                    className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors text-xs font-medium min-w-[28px]"
                    title="Playback speed"
                  >
                    {detailPlaybackSpeed}x
                  </button>
                  <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-neutral-800 rounded-xl border border-white/10 p-1 shadow-xl flex flex-col gap-1 z-50 transition-opacity ${isTouch ? (showDetailSpeedPopup ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none') : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                      <button
                        key={s}
                        onClick={() => { setDetailPlaybackSpeed(s); setShowDetailSpeedPopup(false); }}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${detailPlaybackSpeed === s ? 'bg-teal-600/30 text-teal-400' : 'text-neutral-400 hover:bg-white/10 hover:text-white'}`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Seek forward */}
                <button
                  onClick={() => {
                    const newTime = Math.min(detailDuration, detailAudioRef.current!.currentTime + 5);
                    detailAudioRef.current!.currentTime = newTime;
                    setDetailCurrentTime(newTime);
                  }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  title="Forward 5s"
                >
                  <SkipForward size={14} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Toast notification */}
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-10 left-1/2 -translate-x-1/2 bg-teal-500 text-black px-5 py-2.5 rounded-full font-bold text-sm shadow-xl z-[100] whitespace-nowrap"
        >
          {showToast}
        </motion.div>
      )}
      {wordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setWordModal(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-[#18181b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Top Right Icons */}
            <div className="absolute top-4 right-4 flex items-center gap-3">
              <button
                onClick={() => {
                  onAddWord(wordModal.word, wordModal.translation);
                  setWordModal(null);
                  setShowToast('已收藏到 Words');
                  setTimeout(() => setShowToast(null), 1500);
                }}
                className="p-1.5 rounded-full hover:bg-white/5 text-teal-400 transition-colors"
                title="收藏单词"
              >
                <Star size={20} />
              </button>
              <button
                onClick={() => setWordModal(null)}
                className="p-1.5 rounded-full hover:bg-white/5 text-neutral-400 hover:text-white transition-colors"
                title="关闭"
              >
                <X size={20} />
              </button>
            </div>

            <div className="pr-0"> {/* Remove global padding to maximize width */}
              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                {wordModal.loading ? (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 size={18} className="animate-spin text-teal-500" />
                    <span className="text-neutral-400 text-sm">正在获取翻译...</span>
                  </div>
                ) : (
                  <div className="space-y-4 py-1">
                    {/* Debug: show structuredData */}
                    {console.log('[弹窗] wordModal:', wordModal) || null}
                    {/* User style (Word/Phrase) */}
                    {wordModal.structuredData?.type === 'word' ? (
                      <div className="space-y-4 text-sm sm:text-base leading-relaxed">
                        <p className="text-neutral-200 pr-20"> {/* Only padding for the first paragraph to avoid icons */}
                          “<span className="text-teal-400 font-bold">{wordModal.word}</span>” {wordModal.structuredData.meaningDesc || wordModal.translation}
                        </p>
                        {(wordModal.structuredData.partOfSpeech || wordModal.structuredData.phonetic) && (
                          <div className="space-y-2 pt-3 border-t border-white/5">
                            {wordModal.structuredData.partOfSpeech && (
                              <div className="flex gap-3">
                                <span className="text-neutral-500 font-medium min-w-[48px] shrink-0">词性 ：</span>
                                <span className="text-neutral-300">{wordModal.structuredData.partOfSpeech}</span>
                              </div>
                            )}
                            {wordModal.structuredData.phonetic && (
                              <div className="flex gap-3 items-start">
                                <span className="text-neutral-500 font-medium min-w-[48px] shrink-0">音标 ：</span>
                                <span className="text-neutral-300 font-mono break-all leading-tight">
                                  {wordModal.structuredData.phonetic}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Sentence/Simple Style */
                      <div className="text-neutral-200 text-sm leading-relaxed whitespace-pre-wrap">
                        {wordModal.structuredData?.fullTranslation || wordModal.translation || '无翻译'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Translate Button for Selections */}
      <AnimatePresence>
        {selection && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'fixed',
              left: selection.x,
              top: selection.y - 40,
              transform: 'translateX(-50%)',
              zIndex: 100,
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleWordClick(selection.text);
              setSelection(null);
              // Clear selection visually
              window.getSelection()?.removeAllRanges();
            }}
          >
            <button className="bg-teal-500 text-black px-3 py-1.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-1.5 hover:bg-teal-400 transition-colors">
              <Languages size={14} />
              <span>翻译词组</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ==========================================
// COMPONENT: VOICE DROPDOWN (for sentence voice association)
// ==========================================

interface VoiceDropdownProps {
  sentenceKey: string;
  associatedVoices: VoiceItem[];
  savedVoices: VoiceItem[];
  globallyUsedVoiceIds: string[];
  isOpen: boolean;
  onToggle: () => void;
  onTogglePlayDropdown: () => void;
  isPlayDropdownOpen: boolean;
  onAssociate: (voiceId: string) => void;
  onRemove: (voiceId: string) => void;
  onPlay: (voice: VoiceItem) => void;
  onAddVoice?: () => void;
  onShowToast?: (msg: string) => void;
  isTouch?: boolean;
  closeOtherDropdown?: () => void;
  closeMainDropdown?: () => void;
  align?: 'left' | 'right' | 'center';
  direction?: 'up' | 'down';
}

const VoiceDropdown: React.FC<VoiceDropdownProps> = ({
  sentenceKey,
  associatedVoices,
  savedVoices,
  globallyUsedVoiceIds,
  isOpen,
  onToggle,
  onTogglePlayDropdown,
  isPlayDropdownOpen,
  onAssociate,
  onRemove,
  onPlay,
  onAddVoice,
  onShowToast,
  isTouch = false,
  closeOtherDropdown,
  closeMainDropdown,
  align = 'left',
  direction = 'down'
}) => {
  const hasAssociated = associatedVoices.length > 0;
  const hasMultiple = associatedVoices.length > 1;

  const alignmentClasses = align === 'center' 
    ? 'left-1/2 -translate-x-1/2' 
    : align === 'right' 
      ? 'right-0' 
      : 'left-0';
  
  const directionClasses = direction === 'up' 
    ? 'bottom-full mb-1' 
    : 'top-full mt-1';

  return (
    <div className="relative flex items-center gap-1 overflow-visible voice-dropdown-container" onClick={(e) => e.stopPropagation()}>
      {/* Always show Plus to add association */}
      <button
        onClick={(e) => {
          e.stopPropagation();

          // Show dropdown anyway - it will show associated voices and/or available voices
          if (closeOtherDropdown) closeOtherDropdown();
          onToggle();
        }}
        className="opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-teal-400"
        title="Associate voice"
      >
        <Plus size={14} />
      </button>

      {/* Show speaker only when has associated voices - click shows play dropdown if multiple */}
      {hasAssociated && (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasMultiple) {
                if (closeMainDropdown) closeMainDropdown();
                onTogglePlayDropdown();
              } else {
                onPlay(associatedVoices[0]);
              }
            }}
            className="opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-teal-400"
            title={hasMultiple ? "Select voice to play" : "Play associated voice"}
          >
            <Volume2 size={14} />
          </button>

          {/* Play dropdown - shows when multiple voices and user clicks speaker */}
          {isPlayDropdownOpen && hasMultiple && (
            <div
              className={`absolute ${alignmentClasses} ${directionClasses} bg-neutral-800 rounded-xl border border-white/10 p-1 shadow-xl z-[60] w-[120px] sm:w-[150px] max-w-[calc(100vw-20px)]`}>
              {associatedVoices.map(voice => (
                <button
                  key={voice.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlay(voice);
                    onTogglePlayDropdown();
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-neutral-200 hover:bg-white/5 rounded truncate block"
                  style={{ width: '100%' }}
                >
                  {voice.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <div
          className={`absolute ${alignmentClasses} ${directionClasses} bg-neutral-800 rounded-xl border border-white/10 p-2 shadow-xl z-50 w-[180px] sm:w-[200px] max-w-[calc(100vw-20px)]`}>
          {hasAssociated ? (
            <>
              {associatedVoices.map(voice => (
                <div
                  key={voice.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-white/5 rounded-lg group"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlay(voice);
                    }}
                    className="flex-1 text-left text-xs text-neutral-200 truncate"
                    style={{ maxWidth: '120px' }}
                  >
                    {voice.title}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(voice.id);
                    }}
                    className="p-1 rounded-full text-neutral-500 hover:text-red-400 hover:bg-red-400/10 opacity-100 transition-opacity"
                    title="解除关联"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="border-t border-white/10 my-1" />
            </>
          ) : null}

          {/* Show saved voices to associate */}
          {(() => {
            const availableVoices = savedVoices.filter(v => !globallyUsedVoiceIds.includes(v.id));
            if (availableVoices.length > 0) {
              return availableVoices.map(voice => (
                <button
                  key={voice.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssociate(voice.id);
                  }}
                  className="w-full text-left px-2 py-1.5 text-sm text-neutral-400 hover:text-teal-400 hover:bg-white/5 rounded-lg flex items-center gap-2"
                >
                  <Plus size={12} />
                  <span className="flex-1 truncate" style={{ maxWidth: '120px' }}>{voice.title}</span>
                </button>
              ));
            }
            if (savedVoices.length > 0) {
              return <p className="text-xs text-neutral-500 px-2 py-1">无可关联音频</p>;
            }
            return <p className="text-xs text-neutral-500 px-2 py-1">请先录制音频</p>;
          })()}
        </div>
      )}
    </div>
  );
};

// ==========================================
// COMPONENT: VOICE CARD
// ==========================================

const VoiceCard: React.FC<{
  voice: VoiceItem;
  isTouch: boolean;
  onDeleteClick: (id: string) => void;
  onEditTimestamps?: (voice: VoiceItem) => void;
  onPlayVoice: (voice: VoiceItem) => void;
  onUpdateVoiceName?: (id: string, newName: string) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editName: string;
  setEditName: (name: string) => void;
}> = ({ voice, isTouch, onDeleteClick, onEditTimestamps, onPlayVoice, onUpdateVoiceName, editingId, setEditingId, editName, setEditName }) => {
  return (
    <div
      className="bg-[#18181b] border border-white/10 rounded-2xl p-5 transition-all group"
    >
      <div className="flex justify-between items-start mb-3">
        <span className="bg-teal-950/30 text-teal-400/80 text-[10px] font-mono px-2 py-1 rounded-full border border-teal-900/30">
          {new Date(voice.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-neutral-500 text-xs font-mono">{voice.date}</span>
          {onEditTimestamps && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEditTimestamps(voice);
              }}
              className={`p-1 text-neutral-600 hover:text-teal-400 transition-opacity ${
                isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              title="Edit timestamps"
            >
              <Clock size={14} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDeleteClick(voice.id);
            }}
            className={`p-1 text-neutral-600 hover:text-red-400 transition-opacity ${
              isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {editingId === voice.id ? (
        <div className="flex items-center gap-2 mb-2" onClick={e => e.stopPropagation()}>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="flex-1 bg-neutral-800 text-white text-sm px-2 py-1 rounded border border-white/10 focus:border-teal-500/50 outline-none"
            autoFocus
          />
          <button
            onClick={() => {
              onUpdateVoiceName?.(voice.id, editName);
              setEditingId(null);
            }}
            className="p-1 text-teal-400 hover:text-teal-300"
          >
            <Check size={14} />
          </button>
          <button
            onClick={() => setEditingId(null)}
            className="p-1 text-neutral-500 hover:text-neutral-300"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between mt-4">
          <h3
            className="text-lg font-medium text-neutral-200 line-clamp-2 cursor-pointer hover:text-teal-400"
            onClick={(e) => {
              e.stopPropagation();
              setEditingId(voice.id);
              setEditName(voice.title);
            }}
          >
            {voice.title}
          </h3>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onPlayVoice(voice)}
              className="p-2 bg-teal-600 rounded-full hover:bg-teal-500 transition-colors"
            >
              <Play size={16} fill="currentColor" className="text-white" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = voice.audioUrl;
                link.download = `${voice.title || 'voice-recording'}.mp3`;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="text-neutral-500 hover:text-teal-400 transition-colors"
              title="Download"
            >
              <Download size={18} fill="currentColor" />
            </button>
            <span className="text-xs text-neutral-500 font-mono">
              {Math.floor(voice.duration / 60)}:{Math.floor(voice.duration % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// COMPONENT: VOICE COLLECTION
// ==========================================

const VoiceCollection: React.FC<{
  voices: VoiceItem[],
  onDeleteVoice: (id: string) => void,
  onPlayVoice: (voice: VoiceItem) => void,
  onUpdateVoiceName?: (id: string, newName: string) => void,
  onEditTimestamps?: (voice: VoiceItem) => void,
  onSync?: () => void,
  isSyncing?: boolean,
  syncProgress?: { current: number; total: number } | null,
  notes?: Note[],
  associations?: Record<string, string[]>,
  onOpenNote?: (note: Note) => void,
  isTouch?: boolean
}> = ({ voices, onDeleteVoice, onPlayVoice, onUpdateVoiceName, onEditTimestamps, onSync, isSyncing = false, syncProgress = null, notes = [], associations = {}, onOpenNote, isTouch = false }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (noteId: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(noteId)) {
      newCollapsed.delete(noteId);
    } else {
      newCollapsed.add(noteId);
    }
    setCollapsedGroups(newCollapsed);
  };

  const handleDeleteClick = (id: string) => {
    setShowDeleteConfirm(id);
  };

  const confirmDelete = () => {
    if (showDeleteConfirm) {
      onDeleteVoice(showDeleteConfirm);
      setShowDeleteConfirm(null);
    }
  };

  const sequenceMap = useMemo(() => {
    const sorted = [...notes].sort((a, b) => a.timestamp - b.timestamp);
    const map = new Map<string, number>();
    sorted.forEach((n, i) => map.set(n.id, i + 1));
    return map;
  }, [notes]);

  const getAssociatedNoteIds = (voiceId: string): string[] => {
    const set = new Set<string>();
    Object.entries(associations).forEach(([sentenceKey, voiceIds]) => {
      if (voiceIds.includes(voiceId)) {
        let noteId = '';
        const m = sentenceKey.match(/^(note-\d+)/);
        if (m) {
          noteId = m[1];
        }
        if (noteId) set.add(noteId);
      }
    });
    return Array.from(set);
  };

  const groups = useMemo(() => {
    const byNote = new Map<string, VoiceItem[]>();
    const standalone: VoiceItem[] = [];

    voices.forEach(v => {
      const noteIds = getAssociatedNoteIds(v.id);
      if (noteIds.length > 0) {
        noteIds.forEach(noteId => {
          if (!byNote.has(noteId)) byNote.set(noteId, []);
          // Avoid duplicates if same voice is used in same note multiple times (though unlikely)
          if (!byNote.get(noteId)!.some(existing => existing.id === v.id)) {
            byNote.get(noteId)!.push(v);
          }
        });
      } else {
        standalone.push(v);
      }
    });

    const entries = Array.from(byNote.entries()).map(([noteId, list]) => {
      const n = notes.find(x => x.id === noteId);
      const title = n?.title || 'Unknown Note';
      const seq = sequenceMap.get(noteId) || 0;
      return { noteId, title, seq, list: [...list].sort((a, b) => b.timestamp - a.timestamp) };
    });

    entries.sort((a, b) => b.seq - a.seq); // Sort by note sequence desc
    return { noteGroups: entries, standalone: standalone.sort((a, b) => b.timestamp - a.timestamp) };
  }, [voices, notes, associations, sequenceMap]);

  // Collapse all groups by default
  useEffect(() => {
    if (groups.noteGroups.length > 0 && collapsedGroups.size === 0) {
      const allGroupIds = new Set(groups.noteGroups.map(g => g.noteId));
      setCollapsedGroups(allGroupIds);
    }
  }, [groups]);

  return (
    <motion.div 
      className="min-h-screen bg-[#09090b] text-[#e4e4e7] p-4 pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <header className="mb-6 mt-4 px-2 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Voice Collection</h1>
          <p className="text-neutral-500 text-sm">Your saved shadowing sessions</p>
        </div>
        {onSync && (
          <button
            onClick={onSync}
            disabled={isSyncing}
            className={`p-2 rounded-full transition-all ${isSyncing ? 'bg-teal-500/20 text-teal-400' : 'hover:bg-white/5 text-neutral-400 hover:text-white'}`}
            title="Sync data"
          >
            <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
          </button>
        )}
        {syncProgress && (
          <div className="absolute top-16 right-4 bg-neutral-800 border border-teal-500/30 rounded-lg p-3 shadow-lg z-50 min-w-[200px]">
            <div className="text-xs text-neutral-400 mb-2">
              Syncing {syncProgress.current}/{syncProgress.total}
            </div>
            <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 transition-all duration-300"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <div className="space-y-6">
        {voices.length === 0 ? (
          <div className="text-center py-20 text-neutral-600">
            <Library size={48} className="mx-auto mb-4 opacity-20" />
            <p>No saved voices yet.</p>
          </div>
        ) : (
          <>
            {/* Note Groups */}
            {groups.noteGroups.map(group => {
              const isCollapsed = collapsedGroups.has(group.noteId);
              return (
                <div key={group.noteId} className="space-y-3">
                  <div 
                    className="flex items-center justify-between px-2 cursor-pointer group"
                    onClick={() => toggleGroup(group.noteId)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <div className="text-[10px] text-teal-500 font-mono">No.{group.seq}</div>
                        <h2 className="text-sm font-semibold text-neutral-300 group-hover:text-white transition-colors">
                          {group.title}
                        </h2>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-600 bg-white/5 px-2 py-0.5 rounded-full">
                        {group.list.length} voices
                      </span>
                      <motion.div
                        animate={{ rotate: isCollapsed ? 0 : 180 }}
                        className="text-neutral-600"
                      >
                        <ChevronDown size={14} />
                      </motion.div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-3"
                      >
                        {group.list.map(voice => (
                          <VoiceCard
                            key={voice.id}
                            voice={voice}
                            isTouch={isTouch}
                            onDeleteClick={handleDeleteClick}
                            onEditTimestamps={onEditTimestamps}
                            onPlayVoice={onPlayVoice}
                            onUpdateVoiceName={onUpdateVoiceName}
                            editingId={editingId}
                            setEditingId={setEditingId}
                            editName={editName}
                            setEditName={setEditName}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Standalone Voices */}
            {groups.standalone.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-white/5">
                <div className="px-2">
                  <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">
                    Standalone Recordings
                  </h2>
                </div>
                {groups.standalone.map(voice => (
                  <VoiceCard
                    key={voice.id}
                    voice={voice}
                    isTouch={isTouch}
                    onDeleteClick={handleDeleteClick}
                    onEditTimestamps={onEditTimestamps}
                    onPlayVoice={onPlayVoice}
                    onUpdateVoiceName={onUpdateVoiceName}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    editName={editName}
                    setEditName={setEditName}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              className="bg-[#18181b] border border-white/10 rounded-2xl p-6 w-full max-w-sm"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-2">Delete Voice</h3>
              <p className="text-neutral-400 text-sm mb-6">Are you sure you want to delete this voice? This action cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-neutral-300 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ==========================================
// COMPONENT: BOTTOM NAVIGATION
// ==========================================

const BottomNav: React.FC<{ activeTab: MainTab, onTabChange: (tab: MainTab) => void }> = ({ activeTab, onTabChange }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#09090b] border-t border-white/10 px-6 py-4 z-50 flex justify-between items-center pb-8">
      <button
        onClick={() => onTabChange('notes')}
        onDoubleClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'notes' ? 'text-teal-400' : 'text-neutral-500 hover:text-neutral-300'}`}
      >
        <Home size={22} strokeWidth={activeTab === 'notes' ? 2.5 : 2} />
        <span className="text-[10px] font-medium">Notes</span>
      </button>

      <button
        onClick={() => onTabChange('shadow')}
        onDoubleClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'shadow' ? 'text-teal-400' : 'text-neutral-500 hover:text-neutral-300'}`}
      >
        <Mic size={22} strokeWidth={activeTab === 'shadow' ? 2.5 : 2} />
        <span className="text-[10px] font-medium">Shadow</span>
      </button>

      <button
        onClick={() => onTabChange('voice')}
        onDoubleClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'voice' ? 'text-teal-400' : 'text-neutral-500 hover:text-neutral-300'}`}
      >
        <Library size={22} strokeWidth={activeTab === 'voice' ? 2.5 : 2} />
        <span className="text-[10px] font-medium">Voices</span>
      </button>

      <button
        onClick={() => onTabChange('words')}
        onDoubleClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'words' ? 'text-teal-400' : 'text-neutral-500 hover:text-neutral-300'}`}
      >
        <List size={22} strokeWidth={activeTab === 'words' ? 2.5 : 2} />
        <span className="text-[10px] font-medium">Words</span>
      </button>
    </div>
  );
};

// ==========================================
// COMPONENT: WORDS PAGE
// ==========================================

const WordsPage: React.FC<{
  words: Array<{ id: string; word: string; translation?: string; createdAt: number; noteId: string; noteTitle: string }>;
  notes: Note[];
  onDeleteWord: (id: string) => void;
}> = ({ words, notes, onDeleteWord }) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (noteId: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(noteId)) {
      newCollapsed.delete(noteId);
    } else {
      newCollapsed.add(noteId);
    }
    setCollapsedGroups(newCollapsed);
  };

  const sequenceMap = useMemo(() => {
    const sorted = [...notes].sort((a, b) => a.timestamp - b.timestamp);
    const map = new Map<string, number>();
    sorted.forEach((n, i) => map.set(n.id, i + 1));
    return map;
  }, [notes]);

  const groups = useMemo(() => {
    const byNote = new Map<string, typeof words>();
    words.forEach(w => {
      if (!byNote.has(w.noteId)) byNote.set(w.noteId, []);
      byNote.get(w.noteId)!.push(w);
    });
    const entries = Array.from(byNote.entries()).map(([noteId, list]) => {
      const title = notes.find(n => n.id === noteId)?.title || '';
      const seq = sequenceMap.get(noteId) || 0;
      const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
      return { noteId, title, seq, list: sorted };
    });
    entries.sort((a, b) => a.seq - b.seq);
    return entries;
  }, [words, notes, sequenceMap]);

  // Collapse all groups by default
  useEffect(() => {
    if (groups.length > 0 && collapsedGroups.size === 0) {
      const allGroupIds = new Set(groups.map(g => g.noteId));
      setCollapsedGroups(allGroupIds);
    }
  }, [groups]);

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e4e4e7] p-4 pb-24">
      <header className="mb-4 mt-4 px-2">
        <h1 className="text-2xl font-bold text-white">Words</h1>
        <p className="text-xs text-neutral-500 mt-1">Tap a word in notes to save</p>
      </header>
      {groups.length === 0 ? (
        <div className="text-center py-20 text-neutral-600">No words yet</div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const isCollapsed = collapsedGroups.has(group.noteId);
            return (
              <div key={group.noteId} className="bg-[#18181b] border border-white/10 rounded-2xl overflow-hidden transition-all">
                <div 
                  className="px-4 py-4 flex items-center justify-between cursor-pointer hover:bg-white/5 active:bg-white/10"
                  onClick={() => toggleGroup(group.noteId)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="text-xs text-teal-500 font-mono mb-0.5">Note No.{group.seq}</div>
                      <div className="text-sm font-semibold text-white truncate max-w-[200px]">{group.title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] text-neutral-500 bg-white/5 px-2 py-0.5 rounded-full">{group.list.length}</div>
                    <motion.div
                      animate={{ rotate: isCollapsed ? 0 : 180 }}
                      transition={{ duration: 0.2 }}
                      className="text-neutral-500"
                    >
                      <ChevronDown size={18} />
                    </motion.div>
                  </div>
                </div>
                
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-white/10 border-t border-white/10">
                        {group.list.map(w => (
                          <div key={w.id} className="px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02]">
                            <div className="min-w-0 pr-4">
                              <div className="text-sm text-white font-medium mb-1">{w.word}</div>
                              {w.translation && (
                                <div className="text-xs text-neutral-400 leading-relaxed">{w.translation}</div>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteWord(w.id);
                              }}
                              className="p-2 rounded-full hover:bg-red-400/10 text-neutral-600 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==========================================
// COMPONENT: TIMESTAMP EDITOR
// ==========================================

const TimestampEditor: React.FC<{
  voice: VoiceItem;
  initialSegments: LyricSegment[];
  audioUrl: string;
  onSave: (segments: LyricSegment[]) => void;
  onClose: () => void;
  onBack?: () => void;
  isTouch?: boolean;
}> = ({ voice, initialSegments, audioUrl, onSave, onClose, onBack, isTouch = false }) => {
  // Use initialSegments if provided, otherwise parse from voice text
  const [segments, setSegments] = useState<LyricSegment[]>(initialSegments);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(voice.duration || 60);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Use ref for editing state to avoid re-render issues
  const isEditingRef = useRef(false);
  const [isEditingDisplay, setIsEditingDisplay] = useState(false); // For UI feedback only

  // Initialize audio
  useEffect(() => {
    const newAudio = new Audio(audioUrl);
    newAudio.addEventListener('ended', () => setIsPlaying(false));
    newAudio.addEventListener('loadedmetadata', () => {
      setAudioDuration(newAudio.duration);
    });
    setAudio(newAudio);
    return () => {
      newAudio.pause();
      newAudio.src = '';
    };
  }, [audioUrl]);

  // Calculate timestamps when audio duration is available
  useEffect(() => {
    if (audioDuration > 0 && segments.length > 0 && segments[0].startTime === 0 && segments[0].endTime === 0) {
      const calculatedSegments = calculateLyricsTimestamps(segments, audioDuration);
      setSegments(calculatedSegments);
    }
  }, [audioDuration]);

  // Handle play/pause
  const togglePlay = () => {
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Time update handler - only update segment when not editing (using ref)
  useEffect(() => {
    if (!audio) return;
    const handleTimeUpdate = () => {
      if (isEditingRef.current) return; // Don't update segment while editing
      const currentTime = audio.currentTime;
      const activeIndex = segments.findIndex(
        seg => currentTime >= seg.startTime && currentTime < seg.endTime
      );
      if (activeIndex !== -1 && activeIndex !== currentSegmentIndex) {
        setCurrentSegmentIndex(activeIndex);
      }
    };
    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [audio, segments, currentSegmentIndex]);

  // Auto-scroll to center active segment - only when playing and not editing (using ref)
  useEffect(() => {
    if (!isPlaying || isEditingRef.current) return;
    if (itemRefs.current[currentSegmentIndex] && containerRef.current) {
      const container = containerRef.current;
      const element = itemRefs.current[currentSegmentIndex];
      if (!element) return;

      const containerHeight = container.clientHeight;
      const elementHeight = element.clientHeight;
      const elementTop = element.offsetTop;
      const targetScrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);

      // Only scroll if significantly different from current position
      if (Math.abs(container.scrollTop - targetScrollTop) > 50) {
        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }
    }
  }, [currentSegmentIndex, isPlaying]);

  // Reset refs when segments change
  useEffect(() => {
    itemRefs.current = Array(segments.length).fill(null);
  }, [segments.length]);

  const handleSegmentClick = (index: number) => {
    if (!audio) return;
    audio.currentTime = segments[index].startTime;
    setCurrentSegmentIndex(index);
    audio.play();
    setIsPlaying(true);
  };

  const handleTextChange = (index: number, newText: string) => {
    setSegments(prevSegments => {
      const newSegments = [...prevSegments];
      newSegments[index] = { ...newSegments[index], text: newText };
      return newSegments;
    });
  };

  const handleMergePrev = (index: number) => {
    if (index === 0) return;
    const newSegments = [...segments];
    const prevSeg = newSegments[index - 1];
    const currSeg = newSegments[index];
    const prevEndsWithLetter = /[a-zA-Z]$/.test(prevSeg.text);
    const currStartsWithLetter = /^[a-zA-Z]/.test(currSeg.text);
    const separator = (prevEndsWithLetter && currStartsWithLetter) ? '' : ' ';
    newSegments[index - 1] = {
      ...prevSeg,
      text: prevSeg.text + separator + currSeg.text,
      endTime: currSeg.endTime
    };
    newSegments.splice(index, 1);
    setSegments(newSegments);
  };

  const handleMergeNext = (index: number) => {
    if (index >= segments.length - 1) return;
    const newSegments = [...segments];
    const currSeg = newSegments[index];
    const nextSeg = newSegments[index + 1];
    const currEndsWithLetter = /[a-zA-Z]$/.test(currSeg.text);
    const nextStartsWithLetter = /^[a-zA-Z]/.test(nextSeg.text);
    const separator = (currEndsWithLetter && nextStartsWithLetter) ? '' : ' ';
    newSegments[index] = {
      ...currSeg,
      text: currSeg.text + separator + nextSeg.text,
      endTime: nextSeg.endTime
    };
    newSegments.splice(index + 1, 1);
    setSegments(newSegments);
  };

  // Add a new empty row after current segment
  const handleAddNew = (index: number) => {
    setSegments(prevSegments => {
      const seg = prevSegments[index];
      const duration = seg.endTime - seg.startTime;
      const newDuration = duration / 2;

      const newSegments = [...prevSegments];
      newSegments[index] = {
        ...seg,
        endTime: seg.startTime + newDuration
      };

      newSegments.splice(index + 1, 0, {
        text: '',
        startTime: seg.startTime + newDuration,
        endTime: seg.endTime
      });

      return newSegments;
    });
  };

  const handleSave = () => {
    // Recalculate timestamps proportionally based on text length to match audio
    const totalTextLength = segments.reduce((sum, s) => sum + s.text.length, 0);
    let accumulatedTime = 0;
    const recalculatedSegments = segments.map((seg) => {
      const proportion = totalTextLength > 0 ? seg.text.length / totalTextLength : 1 / segments.length;
      const duration = proportion * audioDuration;
      const newStartTime = accumulatedTime;
      const newEndTime = accumulatedTime + duration;
      accumulatedTime = newEndTime;
      return {
        ...seg,
        startTime: newStartTime,
        endTime: newEndTime
      };
    });
    onSave(recalculatedSegments);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      className="fixed inset-0 bg-[#09090b] z-50 flex flex-col h-[100dvh] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              onClick={onBack}
              className="p-2 rounded-full hover:bg-white/10 text-neutral-400"
            >
              <ArrowLeft size={24} />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-neutral-400"
            >
              <X size={24} />
            </button>
          )}
        </div>
        <h1 className="text-lg font-semibold text-white">Edit Timestamps</h1>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500"
        >
          Save
        </button>
      </header>

      {/* Audio Player Controls */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="p-3 rounded-full bg-teal-600 text-white hover:bg-teal-500"
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <div className="flex-1">
            <div className="text-sm text-neutral-400 mb-1">{voice.title}</div>
            <div className="text-xs text-neutral-500">
              {formatTime(audio?.currentTime || 0)} / {formatTime(audio?.duration || 0)}
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 transition-all"
            style={{ width: `${((audio?.currentTime || 0) / (audio?.duration || 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Segments List */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 pb-24"
      >
        {segments.map((seg, idx) => (
          <div
            key={idx}
            ref={el => { itemRefs.current[idx] = el; }}
            className={`p-3 rounded-xl border transition-all ${
              idx === currentSegmentIndex
                ? 'bg-teal-950/30 border-teal-500/50'
                : 'bg-neutral-900/50 border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                onClick={() => handleSegmentClick(idx)}
                className="text-xs font-mono text-neutral-500 min-w-[40px] cursor-pointer hover:text-teal-400"
              >
                {formatTime(seg.startTime)}
              </span>
              <textarea
                value={seg.text}
                onChange={(e) => {
                  e.stopPropagation();
                  handleTextChange(idx, e.target.value);
                }}
                onFocus={() => {
                  isEditingRef.current = true;
                  setIsEditingDisplay(true);
                }}
                onBlur={() => {
                  isEditingRef.current = false;
                  setIsEditingDisplay(false);
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent text-white text-sm resize-none outline-none"
                rows={Math.max(1, Math.ceil(seg.text.length / 30))}
              />
              <div className="flex flex-col gap-1">
                {idx > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMergePrev(idx);
                    }}
                    className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-teal-400"
                    title="Merge with previous"
                  >
                    <ChevronUp size={14} />
                  </button>
                )}
                {idx < segments.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMergeNext(idx);
                    }}
                    className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-teal-400"
                    title="Merge with next"
                  >
                    <ChevronDown size={14} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddNew(idx);
                  }}
                  className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-teal-400"
                  title="Add new row"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================

export default function App() {
  type Word = { id: string; word: string; translation?: string; createdAt: number; noteId: string; noteTitle: string };
  const [activeTab, setActiveTab] = useState<MainTab>('notes');
  const [notesView, setNotesView] = useState<NotesView>('list');
  const [shadowText, setShadowText] = useState<string | undefined>(undefined);
  const [shadowKey, setShadowKey] = useState(0); // Key to force remount/reset

  // Touch device detection
  const isTouch = useIsTouchDevice();

  // Global State
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [savedVoices, setSavedVoices] = useState<VoiceItem[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const [isMigrating, setIsMigrating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [sentenceVoiceAssociations, setSentenceVoiceAssociations] = useState<Record<string, string[]>>({});
  const [lastApiStatus, setLastApiStatus] = useState<string | null>(null);

  // Load from LocalStorage/IndexedDB initially
  useEffect(() => {
    const loadLocalData = async () => {
      // Try LocalStorage first (sync)
      const lsVoices = getStorageItem<VoiceItem[]>(STORAGE_KEYS.SAVED_VOICES, []);
      if (lsVoices.length > 0) setSavedVoices(lsVoices);
      
      const lsNotes = getStorageItem<Note[]>(STORAGE_KEYS.NOTES, []);
      if (lsNotes.length > 0) setNotes(lsNotes);
      
      const lsAssoc = getStorageItem<Record<string, string[]>>(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, {});
      if (Object.keys(lsAssoc).length > 0) setSentenceVoiceAssociations(lsAssoc);

      // Then check IndexedDB for potentially larger/more data
      const idbVoices = await getIDBItem<VoiceItem[]>(STORAGE_KEYS.SAVED_VOICES, []);
      if (idbVoices.length > lsVoices.length) setSavedVoices(idbVoices);
      
      const idbNotes = await getIDBItem<Note[]>(STORAGE_KEYS.NOTES, []);
      if (idbNotes.length > lsNotes.length) setNotes(idbNotes);
      
      const idbAssoc = await getIDBItem<Record<string, string[]>>(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, {});
      if (Object.keys(idbAssoc).length > Object.keys(lsAssoc).length) setSentenceVoiceAssociations(idbAssoc);
    };
    loadLocalData();
  }, []);

  // API calling helper
  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    // Determine if we are on Vercel or Local
    const isVercel = window.location.hostname.includes('vercel.app');
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
    
    let url = endpoint;
    
    // In local development, if we are on port 3000 (Vite), we need to proxy to 3001
    // or use relative paths if Vite proxy is configured.
    // On Vercel, relative paths /api/* will be handled by vercel.json rewrites.
    
    setLastApiStatus(`Fetching ${url}...`);
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = `API Error ${response.status}: ${errorText || 'No detail'}`;
        setLastApiStatus(errorMsg);
        // On Vercel, 404 might mean the serverless function isn't routing correctly
        if (isVercel && response.status === 404) {
          console.error('Vercel API Route not found. Check vercel.json.');
        }
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      setLastApiStatus(`Success: ${url}`);
      setTimeout(() => setLastApiStatus(null), 3000);
      return data;
    } catch (error) {
      const errorMsg = `Failed ${url}: ${error instanceof Error ? error.message : String(error)}`;
      setLastApiStatus(errorMsg);
      // alert(errorMsg);
      throw error;
    }
  };

  // Persistence: Fetch from DB on mount
  useEffect(() => {
    const isVercel = window.location.hostname.includes('vercel.app');
    
    const migrateData = async () => {
      // On Vercel, we always want to ensure local storage is the source of truth
      // because the server filesystem is ephemeral (/tmp)
      if (isVercel) {
        // Just fetch what's on the server to see if there's anything new
        // But our "Hybrid" fetch handles this now
        fetchNotes();
        fetchVoices();
        fetchAssociations();
        fetchWords();
        return;
      }

      const isMigrated = localStorage.getItem('shadow-reader-db-migrated');
      if (isMigrated === 'true') {
        // Already migrated, just fetch
        fetchNotes();
        fetchVoices();
        fetchAssociations();
        fetchWords();
        return;
      }

      setIsMigrating(true);
      try {
        const localNotes = getStorageItem<Note[]>(STORAGE_KEYS.NOTES, INITIAL_NOTES);
        const localVoices = getStorageItem<VoiceItem[]>(STORAGE_KEYS.SAVED_VOICES, []);
        const localAssociations = getStorageItem<Record<string, string[]>>(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, {});
        const localSettings = getStorageItem<any>(STORAGE_KEYS.SHADOW_SETTINGS, {});

        await apiFetch('/api/migrate', {
          method: 'POST',
          body: JSON.stringify({
            notes: localNotes,
            voices: localVoices,
            associations: localAssociations,
            settings: localSettings,
            words: getStorageItem<any[]>(STORAGE_KEYS.WORDS, [])
          })
        });

        localStorage.setItem('shadow-reader-db-migrated', 'true');
        console.log('Migration successful');
      } catch (error) {
        console.error('Migration failed:', error);
      } finally {
        setIsMigrating(false);
        fetchNotes();
        fetchVoices();
        fetchAssociations();
        fetchWords();
      }
    };

    migrateData();
  }, []);

  const fetchNotes = async () => {
    try {
      const data = await apiFetch('/api/notes');
      if (data && data.length > 0) {
        setNotes(data);
        setStorageItem(STORAGE_KEYS.NOTES, data);
        await setIDBItem(STORAGE_KEYS.NOTES, data);
      } else {
        // Fallback to IndexedDB if server returns empty
        const localData = await getIDBItem<Note[]>(STORAGE_KEYS.NOTES, []);
        if (localData.length > 0) {
          setNotes(localData);
        }
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error);
      const localData = await getIDBItem<Note[]>(STORAGE_KEYS.NOTES, []);
      if (localData.length > 0) setNotes(localData);
    }
  };

  const fetchVoices = async () => {
    try {
      const data = await apiFetch('/api/voices');
      if (data && data.length > 0) {
        setSavedVoices(data);
        setStorageItem(STORAGE_KEYS.SAVED_VOICES, data);
        await setIDBItem(STORAGE_KEYS.SAVED_VOICES, data);
      } else {
        // Fallback to IndexedDB if server returns empty
        const localData = await getIDBItem<VoiceItem[]>(STORAGE_KEYS.SAVED_VOICES, []);
        if (localData.length > 0) {
          setSavedVoices(localData);
        }
      }
    } catch (error) {
      console.error('Failed to fetch voices:', error);
      const localData = await getIDBItem<VoiceItem[]>(STORAGE_KEYS.SAVED_VOICES, []);
      if (localData.length > 0) setSavedVoices(localData);
    }
  };

  const fetchAssociations = async () => {
    try {
      const data = await apiFetch('/api/associations');
      if (data && Object.keys(data).length > 0) {
        setSentenceVoiceAssociations(data);
        setStorageItem(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, data);
        await setIDBItem(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, data);
      } else {
        // Fallback to IndexedDB if server returns empty
        const localData = await getIDBItem<Record<string, string[]>>(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, {});
        if (Object.keys(localData).length > 0) {
          setSentenceVoiceAssociations(localData);
        }
      }
    } catch (error) {
      console.error('Failed to fetch associations:', error);
      const localData = await getIDBItem<Record<string, string[]>>(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, {});
      if (Object.keys(localData).length > 0) setSentenceVoiceAssociations(localData);
    }
  };

  const handleUpdateAssociations = async (sentenceKey: string, voiceIds: string[]) => {
    if (!sentenceKey) return;
    try {
      await apiFetch('/api/associations', {
        method: 'POST',
        body: JSON.stringify({ sentenceKey, voiceIds })
      });
      const newAssociations = {
        ...sentenceVoiceAssociations,
        [sentenceKey]: voiceIds
      };
      setSentenceVoiceAssociations(newAssociations);
      setStorageItem(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, newAssociations);
      await setIDBItem(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, newAssociations);
    } catch (error) {
      console.error('Failed to update associations:', error);
    }
  };

  const [activeVoice, setActiveVoice] = useState<VoiceItem | null>(null);
  const [editingVoice, setEditingVoice] = useState<VoiceItem | null>(null);
  const [editingFromPlayback, setEditingFromPlayback] = useState(false);
  const [editedTimestamps, setEditedTimestamps] = useState<Record<string, LyricSegment[]>>(() =>
    getStorageItem<Record<string, LyricSegment[]>>(STORAGE_KEYS.EDITED_TIMESTAMPS, {})
  );
  const [words, setWords] = useState<Word[]>(() =>
    getStorageItem<Word[]>(STORAGE_KEYS.WORDS, [])
  );

  // Persistence: Save to DB when state changes
  useEffect(() => {
    // Only save if we have notes and not during initial migration
    if (notes.length > 0 && !isMigrating) {
      // Note: In a real app, we would only save the specific note being edited
      // For now, we keep it simple since handleUpdateNote already exists
    }
  }, [notes]);

  const fetchWords = async () => {
    try {
      const data = await apiFetch('/api/words');
      if (Array.isArray(data) && data.length >= 0) {
        setWords(data);
        setStorageItem(STORAGE_KEYS.WORDS, data);
        await setIDBItem(STORAGE_KEYS.WORDS, data);
      } else {
        const localData = await getIDBItem<Word[]>(STORAGE_KEYS.WORDS, []);
        if (localData.length > 0) setWords(localData);
      }
    } catch (e) {
      const localData = await getIDBItem<Word[]>(STORAGE_KEYS.WORDS, []);
      if (localData.length > 0) setWords(localData);
    }
  };

  const handleAddWord = async (payload: { word: string; translation?: string; noteId: string; noteTitle: string }) => {
    const item: Word = {
      id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      word: payload.word,
      translation: payload.translation,
      createdAt: Date.now(),
      noteId: payload.noteId,
      noteTitle: payload.noteTitle
    };
    try {
      const saved = await apiFetch('/api/words', { method: 'POST', body: JSON.stringify(item) });
      const newWords = [saved, ...words];
      setWords(newWords);
      setStorageItem(STORAGE_KEYS.WORDS, newWords);
      await setIDBItem(STORAGE_KEYS.WORDS, newWords);
    } catch {
      const newWords = [item, ...words];
      setWords(newWords);
      setStorageItem(STORAGE_KEYS.WORDS, newWords);
      await setIDBItem(STORAGE_KEYS.WORDS, newWords);
    }
  };

  const handleDeleteWord = async (id: string) => {
    try {
      await apiFetch(`/api/words/${id}`, { method: 'DELETE' });
    } catch {}
    const newWords = words.filter(w => w.id !== id);
    setWords(newWords);
    setStorageItem(STORAGE_KEYS.WORDS, newWords);
    await setIDBItem(STORAGE_KEYS.WORDS, newWords);
  };

  // Handlers
  const handleNavigateToShadow = (text: string) => {
    setShadowText(text);
    setActiveTab('shadow');
    setShadowKey(prev => prev + 1); // Ensure fresh start
    setActiveVoice(null);
  };

  const handleTabChange = (tab: MainTab) => {
    if (tab === 'shadow' && activeTab === 'shadow') {
      // Reset ShadowReader if clicking Shadow tab while already active
      setShadowText(undefined);
      setShadowKey(prev => prev + 1);
      setActiveVoice(null);
    }
    setActiveTab(tab);
    if (tab !== 'voice') {
      setActiveVoice(null);
    }
  };

  const handleAddNote = () => {
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: "New Note",
      date: new Date().toLocaleDateString(),
      timestamp: Date.now(),
      tags: [],
      rawContent: ""
    };
    setSelectedNote(newNote);
    setIsNewNote(true);
    setNotesView('detail');
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
      const newNotes = notes.filter(n => n.id !== id);
      setNotes(newNotes);
      setStorageItem(STORAGE_KEYS.NOTES, newNotes);
      await setIDBItem(STORAGE_KEYS.NOTES, newNotes);
      if (selectedNote?.id === id) {
        setNotesView('list');
        setSelectedNote(null);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleUpdateNote = async (updatedNote: Note) => {
    try {
      const savedNote = await apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify(updatedNote)
      });
      let newNotes = [...notes];
      const index = newNotes.findIndex(n => n.id === savedNote.id);
      if (index >= 0) {
        newNotes[index] = savedNote;
      } else {
        newNotes.unshift(savedNote);
      }
      setNotes(newNotes);
      setStorageItem(STORAGE_KEYS.NOTES, newNotes);
      await setIDBItem(STORAGE_KEYS.NOTES, newNotes);
      setIsNewNote(false);
      setSelectedNote(savedNote);
    } catch (error) {
      console.error('Failed to update note:', error);
    }
  };

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note);
    setNotesView('detail');
  };

  const handleSaveShadowNote = async (content: string) => {
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: "Shadowing Practice",
      date: new Date().toLocaleDateString(),
      timestamp: Date.now(),
      tags: ["Shadowing"],
      rawContent: `## ✍️ 标题
Shadowing Practice

## 🗣️ 跟读材料
1. **“${content}”**`
    };
    
    try {
      await apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify(newNote)
      });
      const newNotes = [newNote, ...notes];
      setNotes(newNotes);
      setStorageItem(STORAGE_KEYS.NOTES, newNotes);
      await setIDBItem(STORAGE_KEYS.NOTES, newNotes);
    } catch (error) {
      console.error('Failed to save shadow note:', error);
      const newNotes = [newNote, ...notes];
      setNotes(newNotes);
      setStorageItem(STORAGE_KEYS.NOTES, newNotes);
      await setIDBItem(STORAGE_KEYS.NOTES, newNotes);
    }
  };

  const handleSaveVoice = async (audioUrl: string, duration: number, text: string, customName?: string) => {
    // Default name: first 3 words of text
    const words = text.trim().split(/\s+/);
    const defaultName = words.slice(0, 3).join(' ') + (words.length > 3 ? '...' : '');
    const title = customName || defaultName;

    const newVoice: VoiceItem = {
      id: `voice-${Date.now()}`,
      title: title,
      date: new Date().toLocaleDateString(),
      timestamp: Date.now(),
      audioUrl,
      duration,
      text
    };

    try {
      await apiFetch('/api/voices', {
        method: 'POST',
        body: JSON.stringify(newVoice)
      });
      const newVoices = [newVoice, ...savedVoices];
      setSavedVoices(newVoices);
      setStorageItem(STORAGE_KEYS.SAVED_VOICES, newVoices);
      await setIDBItem(STORAGE_KEYS.SAVED_VOICES, newVoices);
    } catch (error) {
      console.error('Failed to save voice:', error);
      const newVoices = [newVoice, ...savedVoices];
      setSavedVoices(newVoices);
      setStorageItem(STORAGE_KEYS.SAVED_VOICES, newVoices);
      await setIDBItem(STORAGE_KEYS.SAVED_VOICES, newVoices);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      // 1. Fetch latest from server
      const notesData = await apiFetch('/api/notes');
      const voicesData = await apiFetch('/api/voices');
      const assocData = await apiFetch('/api/associations');
      const wordsData = await apiFetch('/api/words');

      // 2. Get local data for comparison (Prioritize IndexedDB)
      const localNotes = await getIDBItem<Note[]>(STORAGE_KEYS.NOTES, notes);
      const localVoices = await getIDBItem<VoiceItem[]>(STORAGE_KEYS.SAVED_VOICES, savedVoices);
      const localAssoc = await getIDBItem<Record<string, string[]>>(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, sentenceVoiceAssociations);
      const localWords = await getIDBItem<Word[]>(STORAGE_KEYS.WORDS, words);

      // 3. Smart Merge Logic: Never let server empty data overwrite local non-empty data
      let finalNotes = [...localNotes];
      if (notesData && notesData.length > 0) {
        // Merge: Add server notes that don't exist locally
        notesData.forEach((sn: Note) => {
          if (!finalNotes.some(ln => ln.id === sn.id)) {
            finalNotes.push(sn);
          }
        });
      }

      let finalVoices = [...localVoices];
      if (voicesData && voicesData.length > 0) {
        // Merge: Add server voices that don't exist locally
        voicesData.forEach((sv: VoiceItem) => {
          if (!finalVoices.some(lv => lv.id === sv.id)) {
            finalVoices.push(sv);
          }
        });
      }

      const finalAssoc = { ...localAssoc, ...(assocData || {}) };

      let finalWords = [...localWords];
      if (wordsData && wordsData.length > 0) {
        // Merge: Add server words that don't exist locally
        wordsData.forEach((sw: Word) => {
          if (!finalWords.some(lw => lw.id === sw.id)) {
            finalWords.push(sw);
          }
        });
      }

      // 4. Update Local State
      setNotes(finalNotes);
      setSavedVoices(finalVoices);
      setSentenceVoiceAssociations(finalAssoc);
      setWords(finalWords);

      // 5. Update Local Persistence
      setStorageItem(STORAGE_KEYS.NOTES, finalNotes);
      await setIDBItem(STORAGE_KEYS.NOTES, finalNotes);

      setStorageItem(STORAGE_KEYS.SAVED_VOICES, finalVoices);
      await setIDBItem(STORAGE_KEYS.SAVED_VOICES, finalVoices);

      setStorageItem(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, finalAssoc);
      await setIDBItem(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, finalAssoc);

      setStorageItem(STORAGE_KEYS.WORDS, finalWords);
      await setIDBItem(STORAGE_KEYS.WORDS, finalWords);

      // 6. Push merged data back to server (save individually to avoid payload limit)
      console.log('[Sync] Saving data to cloud...');

      // Calculate total items for progress
      const totalItems =
        finalNotes.length +
        finalVoices.length +
        Object.keys(finalAssoc).length +
        finalWords.length;
      let currentItem = 0;

      // Save notes one by one
      for (const note of finalNotes) {
        currentItem++;
        setSyncProgress({ current: currentItem, total: totalItems });
        setLastApiStatus(`Syncing notes (${currentItem}/${totalItems})...`);
        await apiFetch('/api/notes', {
          method: 'POST',
          body: JSON.stringify(note)
        });
      }

      // Save voices with audio uploaded to Supabase Storage
      for (const voice of finalVoices) {
        currentItem++;
        setSyncProgress({ current: currentItem, total: totalItems });
        setLastApiStatus(`Syncing voices (${currentItem}/${totalItems})...`);
        let voiceToSave = { ...voice };

        // If voice has audio data (base64), upload to Supabase Storage
        if (voice.audioUrl && voice.audioUrl.startsWith('data:')) {
          try {
            // Convert data URL to base64
            const base64Data = voice.audioUrl.split(',')[1];
            const contentType = voice.audioUrl.match(/data:([^;]+)/)?.[1] || 'audio/webm';

            // Upload to Supabase Storage
            const result = await apiFetch('/api/upload-audio', {
              method: 'POST',
              body: JSON.stringify({
                audioData: base64Data,
                voiceId: voice.id,
                contentType
              })
            });

            // Replace local audio with storage URL
            voiceToSave = { ...voice, audioUrl: result.url };
          } catch (error) {
            console.error('Failed to upload audio for voice:', voice.id, error);
            // Continue with other voices even if one fails
          }
        }

        await apiFetch('/api/voices', {
          method: 'POST',
          body: JSON.stringify(voiceToSave)
        });
      }

      // Save associations
      for (const [key, voiceIds] of Object.entries(finalAssoc)) {
        currentItem++;
        setSyncProgress({ current: currentItem, total: totalItems });
        setLastApiStatus(`Syncing associations (${currentItem}/${totalItems})...`);
        await apiFetch('/api/associations', {
          method: 'POST',
          body: JSON.stringify({ sentenceKey: key, voiceIds })
        });
      }

      // Save words one by one
      for (const word of finalWords) {
        currentItem++;
        setSyncProgress({ current: currentItem, total: totalItems });
        setLastApiStatus(`Syncing words (${currentItem}/${totalItems})...`);
        await apiFetch('/api/words', {
          method: 'POST',
          body: JSON.stringify(word)
        });
      }

      setSyncProgress(null);
      setLastApiStatus('All data synced to cloud');
      setTimeout(() => setLastApiStatus(null), 3000);
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncProgress(null);
      setLastApiStatus('Sync failed');
      setTimeout(() => setLastApiStatus(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateVoiceName = async (id: string, newName: string) => {
    const voice = savedVoices.find(v => v.id === id);
    if (!voice) return;

    const updatedVoice = { ...voice, title: newName };
    try {
      await apiFetch('/api/voices', {
        method: 'POST',
        body: JSON.stringify(updatedVoice)
      });
      const newVoices = savedVoices.map(v => v.id === id ? updatedVoice : v);
      setSavedVoices(newVoices);
      setStorageItem(STORAGE_KEYS.SAVED_VOICES, newVoices);
      await setIDBItem(STORAGE_KEYS.SAVED_VOICES, newVoices);
    } catch (error) {
      console.error('Failed to update voice name:', error);
    }
  };

  const handleDeleteVoice = async (id: string) => {
    try {
      await apiFetch(`/api/voices/${id}`, { method: 'DELETE' });
      const newVoices = savedVoices.filter(v => v.id !== id);
      setSavedVoices(newVoices);
      setStorageItem(STORAGE_KEYS.SAVED_VOICES, newVoices);
      await setIDBItem(STORAGE_KEYS.SAVED_VOICES, newVoices);
    } catch (error) {
      console.error('Failed to delete voice:', error);
    }
  };

  const handlePlayVoice = (voice: VoiceItem) => {
    setActiveVoice(voice);
    setActiveTab('shadow');
    setShadowKey(prev => prev + 1);
  };

  const handleEditTimestamps = (voice: VoiceItem, fromPlayback: boolean = false) => {
    setEditingVoice(voice);
    setEditingFromPlayback(fromPlayback);
  };

  const handleSaveTimestamps = (voiceId: string, segments: LyricSegment[]) => {
    setEditedTimestamps(prev => ({ ...prev, [voiceId]: segments }));
    setEditingVoice(null);
  };

  const handleCloseTimestampEditor = () => {
    setEditingVoice(null);
  };

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'notes':
        return (
          <AnimatePresence mode="wait">
            {notesView === 'list' ? (
              <NotesList
                key="list"
                notes={notes}
                onSelectNote={handleSelectNote}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
                filterTag={filterTag}
                onSetFilterTag={setFilterTag}
                isTouch={isTouch}
              />
            ) : selectedNote ? (
              <NotesDetail
                key={selectedNote.id}
                note={selectedNote}
                onNavigateToShadow={handleNavigateToShadow}
                onBack={() => {
                  setNotesView('list');
                  setIsNewNote(false);
                }}
                onSave={handleUpdateNote}
                onDelete={handleDeleteNote}
                savedVoices={savedVoices}
                onPlayVoice={handlePlayVoice}
                isTouch={isTouch}
                sentenceVoiceAssociations={sentenceVoiceAssociations}
                onUpdateAssociations={handleUpdateAssociations}
                onAddWord={(word, translation) => handleAddWord({ word, translation, noteId: selectedNote.id, noteTitle: selectedNote.title })}
              />
            ) : null}
          </AnimatePresence>
        );
      case 'shadow':
        return (
          <ShadowReader
            key={`shadow-${shadowKey}`} // Use key to force reset
            initialText={activeVoice ? activeVoice.text : shadowText}
            isStandalone={true}
            onSaveNote={handleSaveShadowNote}
            onSaveVoice={handleSaveVoice}
            playbackMode={!!activeVoice}
            initialAudioUrl={activeVoice?.audioUrl}
            onBack={activeVoice ? () => setActiveTab('voice') : undefined}
            isTouch={isTouch}
            initialSegments={activeVoice ? editedTimestamps[activeVoice.id] : undefined}
            onEditTimestamps={activeVoice ? () => handleEditTimestamps(activeVoice, true) : undefined}
            apiFetch={apiFetch}
          />
        );
      case 'voice':
        return (
          <VoiceCollection
            voices={savedVoices}
            onDeleteVoice={handleDeleteVoice}
            onPlayVoice={handlePlayVoice}
            onUpdateVoiceName={handleUpdateVoiceName}
            onEditTimestamps={handleEditTimestamps}
            onSync={handleManualSync}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
            notes={notes}
            associations={sentenceVoiceAssociations}
            onOpenNote={(n) => {
              setActiveTab('notes');
              setSelectedNote(n);
              setNotesView('detail');
            }}
            isTouch={isTouch}
          />
        );
      case 'words':
        return (
          <WordsPage
            words={words}
            notes={notes}
            onDeleteWord={handleDeleteWord}
          />
        );
    }
  };

  // Render timestamp editor if a voice is being edited
  const renderTimestampEditor = () => {
    if (!editingVoice) return null;

    const existingSegments = editedTimestamps[editingVoice.id];
    const initialSegments = existingSegments || parseLyrics(editingVoice.text);

    return (
      <TimestampEditor
        key={editingVoice.id}
        voice={editingVoice}
        initialSegments={initialSegments}
        audioUrl={editingVoice.audioUrl}
        onSave={(segments) => handleSaveTimestamps(editingVoice.id, segments)}
        onClose={handleCloseTimestampEditor}
        onBack={editingFromPlayback ? handleCloseTimestampEditor : undefined}
        isTouch={isTouch}
      />
    );
  };

  return (
    <div className="bg-[#09090b] min-h-screen">
      {renderContent()}
      {renderTimestampEditor()}
      {!editingVoice && <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />}
    </div>
  );
}
