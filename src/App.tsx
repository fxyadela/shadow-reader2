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
  Gauge,
  Menu,
  Share
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ==========================================
// API URL HELPER
// ==========================================

// Get the correct API base URL based on current location
const getApiBaseUrl = () => {
  const { protocol, hostname, port } = window.location;
  // Use current host + port for API calls
  const portStr = port ? `:${port}` : '';
  return `${protocol}//${hostname}${portStr}`;
};

// ==========================================
// LOCAL STORAGE UTILITIES
// ==========================================

const STORAGE_KEYS = {
  NOTES: 'shadow-reader-notes',
  SAVED_VOICES: 'shadow-reader-voices',
  SHADOW_SETTINGS: 'shadow-reader-settings',
  SENTENCE_VOICE_ASSOCIATIONS: 'shadow-reader-sentence-voice-associations',
  EDITED_TIMESTAMPS: 'shadow-reader-edited-timestamps'
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

// ==========================================
// HOOK: TOUCH DEVICE DETECTION
// ==========================================

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

// ==========================================
// SHARED TYPES & CONSTANTS
// ==========================================

type MainTab = 'notes' | 'shadow' | 'voice';
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
// COMPONENT: HIGHLIGHTED TEXT
// ==========================================

const HighlightedText: React.FC<{ text: string, stress: string, linking: string }> = ({ text, stress, linking }) => {
  const stressWords = stress.split(/[,，]/).map(w => w.trim()).filter(Boolean);
  const linkingPhrases = linking.split(/[,，]/).map(p => {
    const match = p.match(/(.*?)(?:→|->)/);
    return match ? match[1].trim() : p.trim();
  }).filter(Boolean);

  let htmlText = text;
  
  const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const allHighlights = [
    ...linkingPhrases.map(p => ({ word: p, type: 'linking' })),
    ...stressWords.map(w => ({ word: w, type: 'stress' }))
  ].sort((a, b) => b.word.length - a.word.length);

  let counter = 0;
  const placeholders: Record<string, string> = {};

  allHighlights.forEach(({ word, type }) => {
    if (!word) return;
    const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, 'gi');
    const colorClass = type === 'stress' ? 'text-rose-400 font-semibold' : 'text-teal-400 font-semibold underline decoration-teal-500/30 underline-offset-4';
    
    htmlText = htmlText.replace(regex, (match) => {
      const id = `__HL_${counter++}__`;
      placeholders[id] = `<span class="${colorClass}">${match}</span>`;
      return id;
    });
  });

  Object.keys(placeholders).forEach(id => {
    htmlText = htmlText.replace(id, placeholders[id]);
  });

  return <div className="text-lg md:text-xl leading-relaxed font-medium text-neutral-300" dangerouslySetInnerHTML={{ __html: htmlText }} />;
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
  onEditTimestamps?: () => void
}> = ({ initialText, onBack, isStandalone, onSaveNote, onSaveVoice, playbackMode = false, initialAudioUrl, isTouch = false, initialSegments, onEditTimestamps }) => {
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
  const [showAdvanced, setShowAdvanced] = useState(savedSettings.showAdvanced ?? false); // Default collapsed ("不下拉")
  const [isLoading, setIsLoading] = useState(false);

  // Translation Language
  const [translationLang, setTranslationLang] = useState<'zh' | 'ja' | 'ko'>(savedSettings.translationLang || 'zh');

  // Save settings to localStorage when they change
  useEffect(() => {
    const settings = {
      model, selectedVoice, speed, vol,
      pitch, emotion, modPitch, intensity, timbre, soundEffect,
      showAdvanced, translationLang
    };
    setStorageItem(STORAGE_KEYS.SHADOW_SETTINGS, settings);
  }, [model, selectedVoice, speed, vol, pitch, emotion, modPitch, intensity, timbre, soundEffect, showAdvanced, translationLang]);

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
  const [isTextTranslated, setIsTextTranslated] = useState(false);
  const [originalTextBeforeTranslation, setOriginalTextBeforeTranslation] = useState('');

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
            text: seg,
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
      const apiUrl = `${getApiBaseUrl()}/api/tts`;
      console.log('[TTS] Calling API:', apiUrl);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API request failed: ${response.status}`);
      }

      const data = await response.json();

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
          const response = await fetch(`${getApiBaseUrl()}/api/translate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: segment.text,
              targetLang: langToUse
            })
          });

          const data = await response.json();
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
        const response = await fetch(`${getApiBaseUrl()}/api/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: text,
            targetLang: langToUse
          })
        });

        const data = await response.json();
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

        {mode === 'edit' && text.trim() && (
          <button
            onClick={handleToSettings}
            disabled={!text.trim()}
            className="px-4 py-2 rounded-full bg-teal-500 font-semibold text-black hover:bg-teal-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        )}

        {mode === 'settings' && (
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="px-4 py-2 rounded-full bg-teal-500 font-semibold text-black hover:bg-teal-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Generating...' : 'Generate'}
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
                    setEditedSegments(segments.map(s => ({ text: s.text, start: s.start, end: s.end })));
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
              <div className="relative flex-1 min-h-0 mt-6 pb-20">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full h-full bg-transparent text-neutral-200 py-2 px-6 pr-20 outline-none resize-none text-xl font-semibold leading-relaxed placeholder:text-neutral-600 placeholder:font-semibold placeholder:text-left text-left overflow-y-auto"
                  placeholder="Paste your learning material here..."
                />
                <div className="absolute top-0 right-0 p-2 bg-gradient-to-l from-black/60 to-transparent backdrop-blur-sm flex gap-2">
                  {text.trim() && (
                    <div className="relative group">
                      <button
                        onClick={() => setShowLangPopup(!showLangPopup)}
                        className={`p-1.5 rounded-full transition-colors ${isTextTranslated ? 'text-teal-400 bg-teal-900/30' : 'text-neutral-400 hover:text-white bg-neutral-700/50 hover:bg-neutral-600'}`}
                        title={isTextTranslated ? "Restore original text" : "Translate"}
                      >
                        {isTranslating ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
                      </button>
                      <div className={`absolute bottom-full right-0 mb-2 bg-neutral-800 rounded-xl border border-white/10 p-2 shadow-xl flex flex-col gap-1 z-50 origin-bottom-right transition-opacity ${isTouch ? (showLangPopup ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none') : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                        <button onClick={() => { handleTranslate('zh'); setShowLangPopup(false); }} className={`text-lg p-2 rounded-lg hover:bg-white/10 ${translationLang === 'zh' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇨🇳</button>
                        <button onClick={() => { handleTranslate('ja'); setShowLangPopup(false); }} className={`text-lg p-2 rounded-lg hover:bg-white/10 ${translationLang === 'ja' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇯🇵</button>
                        <button onClick={() => { handleTranslate('ko'); setShowLangPopup(false); }} className={`text-lg p-2 rounded-lg hover:bg-white/10 ${translationLang === 'ko' && isTextTranslated ? 'bg-teal-600/30' : ''}`}>🇰🇷</button>
                      </div>
                    </div>
                  )}
                  {text && (
                    <button
                      onClick={() => setText('')}
                      className="p-1.5 rounded-full bg-neutral-700/50 hover:bg-neutral-600 text-neutral-400 hover:text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
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
              <div className="flex-1 overflow-y-auto space-y-8 pb-4">
              {/* Controls */}
              <div className="space-y-6">
                
                {/* --- Basic Settings --- */}
                <div className="space-y-6">
                  {/* Model */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-400 ml-1">Model</label>
                    <div className="relative">
                      <button
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
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
                        onClick={() => setIsAddingVoice(!isAddingVoice)}
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
                          onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
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
                                  onClick={() => setShowEmotionDropdown(!showEmotionDropdown)}
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
                                  onClick={() => setShowSoundEffectDropdown(!showSoundEffectDropdown)}
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
              </motion.div>

          {mode === 'shadowing' && (
            <motion.div
              key="shadowing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-x-0 top-[72px] bottom-16 overflow-y-auto no-scrollbar pb-48 px-2 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] scroll-smooth"
              ref={containerRef}
              style={{ scrollBehavior: 'smooth' }}
            >
              {segments.length > 0 ? (
                <div className="space-y-8 py-[40vh]">
                  {segments.map((seg, idx) => (
                    <div
                      key={idx}
                      ref={el => itemRefs.current[idx] = el}
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
                      onClick={() => setShowLangPopup(!showLangPopup)}
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
                  <button
                    onClick={() => {
                      const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
                      const currentIndex = speeds.indexOf(speed);
                      const nextIndex = (currentIndex + 1) % speeds.length;
                      setSpeed(speeds[nextIndex]);
                    }}
                    className="px-3 py-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors text-sm font-medium"
                    title="Playback speed"
                  >
                    {speed}x
                  </button>
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
                  <span className="bg-teal-950/30 text-teal-500/80 text-[10px] font-mono px-2 py-1 rounded-full border border-teal-900/30">
                    Daily Review
                  </span>
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
  isTouch?: boolean
}> = ({ note, onNavigateToShadow, onBack, onSave, onDelete, savedVoices, onPlayVoice, isTouch = false }) => {
  const [activeAccordion, setActiveAccordion] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(note.rawContent === "");
  const [rawText, setRawText] = useState(note.rawContent);
  const [showToast, setShowToast] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const detailContentRef = useRef<HTMLDivElement>(null);

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
          setShowToast(true);
          setTimeout(() => setShowToast(false), 2000);
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
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Parse content for view mode
  const parsedContent = useMemo(() => parseNoteContent(rawText), [rawText]);

  // Voice Association State
  const [sentenceVoiceAssociations, setSentenceVoiceAssociations] = useState<Record<string, string[]>>(() =>
    getStorageItem<Record<string, string[]>>(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, {})
  );
  const [openVoiceDropdown, setOpenVoiceDropdown] = useState<string | null>(null);
  const [openPlayDropdown, setOpenPlayDropdown] = useState<string | null>(null);

  // Detail Page Player State
  const [detailPlayingVoice, setDetailPlayingVoice] = useState<VoiceItem | null>(null);
  const [detailIsPlaying, setDetailIsPlaying] = useState(false);
  const [detailPlaybackSpeed, setDetailPlaybackSpeed] = useState(1);
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

  // Persist associations to localStorage
  useEffect(() => {
    setStorageItem(STORAGE_KEYS.SENTENCE_VOICE_ASSOCIATIONS, sentenceVoiceAssociations);
  }, [sentenceVoiceAssociations]);

  // Get unique key for a sentence (combines note id + section + index)
  const getSentenceKey = (section: string, index: number, text: string) => {
    return `${note.id}-${section}-${index}-${text.slice(0, 20)}`;
  };

  // Get associated voices for a sentence
  const getAssociatedVoices = (sentenceKey: string): VoiceItem[] => {
    const voiceIds = sentenceVoiceAssociations[sentenceKey] || [];
    return voiceIds.map(id => savedVoices.find(v => v.id === id)).filter(Boolean) as VoiceItem[];
  };

  // Associate a voice with a sentence
  const associateVoice = (sentenceKey: string, voiceId: string) => {
    setSentenceVoiceAssociations(prev => {
      const current = prev[sentenceKey] || [];
      if (current.includes(voiceId)) return prev; // Already associated
      return {
        ...prev,
        [sentenceKey]: [...current, voiceId]
      };
    });
    setOpenVoiceDropdown(null);
  };

  // Remove voice association
  const removeVoiceAssociation = (sentenceKey: string, voiceId: string) => {
    setSentenceVoiceAssociations(prev => {
      const current = prev[sentenceKey] || [];
      return {
        ...prev,
        [sentenceKey]: current.filter(id => id !== voiceId)
      };
    });
  };

  const toggleAccordion = (id: string) => {
    setActiveAccordion(activeAccordion === id ? null : id);
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

  return (
    <motion.div
      className="min-h-screen bg-[#09090b] text-[#e4e4e7] font-sans pb-24"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      onClick={() => {
        setOpenVoiceDropdown(null);
        setOpenPlayDropdown(null);
      }}
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
                                    isOpen={openVoiceDropdown === getSentenceKey('chat-correction', index, msg.correction)}
                                    onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('chat-correction', index, msg.correction) ? null : getSentenceKey('chat-correction', index, msg.correction))}
                                    isPlayDropdownOpen={openPlayDropdown === getSentenceKey('chat-correction', index, msg.correction)}
                                    onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('chat-correction', index, msg.correction) ? null : getSentenceKey('chat-correction', index, msg.correction))}
                                    onAssociate={(voiceId) => associateVoice(getSentenceKey('chat-correction', index, msg.correction), voiceId)}
                                    onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('chat-correction', index, msg.correction), voiceId)}
                                    onPlay={handlePlayVoiceInDetail}
                                    isTouch={isTouch}
                                    closeOtherDropdown={() => setOpenPlayDropdown(null)}
                                    closeMainDropdown={() => setOpenVoiceDropdown(null)}
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
                              <p className="text-teal-100/90 font-medium">{msg.correction}</p>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <p>{msg.text}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                <VoiceDropdown
                                  sentenceKey={getSentenceKey('chat', index, msg.text)}
                                  associatedVoices={getAssociatedVoices(getSentenceKey('chat', index, msg.text))}
                                  savedVoices={savedVoices}
                                  isOpen={openVoiceDropdown === getSentenceKey('chat', index, msg.text)}
                                  onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('chat', index, msg.text) ? null : getSentenceKey('chat', index, msg.text))}
                                  isPlayDropdownOpen={openPlayDropdown === getSentenceKey('chat', index, msg.text)}
                                  onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('chat', index, msg.text) ? null : getSentenceKey('chat', index, msg.text))}
                                  onAssociate={(voiceId) => associateVoice(getSentenceKey('chat', index, msg.text), voiceId)}
                                  onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('chat', index, msg.text), voiceId)}
                                  onPlay={handlePlayVoiceInDetail}
                                  isTouch={isTouch}
                                  closeOtherDropdown={() => setOpenPlayDropdown(null)}
                                  closeMainDropdown={() => setOpenVoiceDropdown(null)}
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
                          <p className="text-sm text-neutral-200 font-medium">{item.improved}</p>
                          <p className="text-xs text-neutral-500 mt-1">{item.nuance}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <VoiceDropdown
                          sentenceKey={getSentenceKey('upgrade', idx, item.improved)}
                          associatedVoices={getAssociatedVoices(getSentenceKey('upgrade', idx, item.improved))}
                          savedVoices={savedVoices}
                          isOpen={openVoiceDropdown === getSentenceKey('upgrade', idx, item.improved)}
                          onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('upgrade', idx, item.improved) ? null : getSentenceKey('upgrade', idx, item.improved))}
                          isPlayDropdownOpen={openPlayDropdown === getSentenceKey('upgrade', idx, item.improved)}
                          onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('upgrade', idx, item.improved) ? null : getSentenceKey('upgrade', idx, item.improved))}
                          onAssociate={(voiceId) => associateVoice(getSentenceKey('upgrade', idx, item.improved), voiceId)}
                          onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('upgrade', idx, item.improved), voiceId)}
                          onPlay={handlePlayVoiceInDetail}
                          isTouch={isTouch}
                          closeOtherDropdown={() => setOpenPlayDropdown(null)}
                          closeMainDropdown={() => setOpenVoiceDropdown(null)}
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
                                  <p className="text-sm text-neutral-300 font-mono pl-3 border-l-2 border-teal-900/50 italic">
                                    "{ex}"
                                  </p>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <VoiceDropdown
                                      sentenceKey={getSentenceKey(`pattern-${item.id}`, i, ex)}
                                      associatedVoices={getAssociatedVoices(getSentenceKey(`pattern-${item.id}`, i, ex))}
                                      savedVoices={savedVoices}
                                      isOpen={openVoiceDropdown === getSentenceKey(`pattern-${item.id}`, i, ex)}
                                      onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey(`pattern-${item.id}`, i, ex) ? null : getSentenceKey(`pattern-${item.id}`, i, ex))}
                                      isPlayDropdownOpen={openPlayDropdown === getSentenceKey(`pattern-${item.id}`, i, ex)}
                                      onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey(`pattern-${item.id}`, i, ex) ? null : getSentenceKey(`pattern-${item.id}`, i, ex))}
                                      onAssociate={(voiceId) => associateVoice(getSentenceKey(`pattern-${item.id}`, i, ex), voiceId)}
                                      onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey(`pattern-${item.id}`, i, ex), voiceId)}
                                      onPlay={handlePlayVoiceInDetail}
                                      isTouch={isTouch}
                                      closeOtherDropdown={() => setOpenPlayDropdown(null)}
                                      closeMainDropdown={() => setOpenVoiceDropdown(null)}
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
                      <HighlightedText text={item.text} stress={item.stress} linking={item.linking} />

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
                          isOpen={openVoiceDropdown === getSentenceKey('shadowing', idx, item.text)}
                          onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('shadowing', idx, item.text) ? null : getSentenceKey('shadowing', idx, item.text))}
                          isPlayDropdownOpen={openPlayDropdown === getSentenceKey('shadowing', idx, item.text)}
                          onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('shadowing', idx, item.text) ? null : getSentenceKey('shadowing', idx, item.text))}
                          onAssociate={(voiceId) => associateVoice(getSentenceKey('shadowing', idx, item.text), voiceId)}
                          onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('shadowing', idx, item.text), voiceId)}
                          onPlay={handlePlayVoiceInDetail}
                          isTouch={isTouch}
                          closeOtherDropdown={() => setOpenPlayDropdown(null)}
                          closeMainDropdown={() => setOpenVoiceDropdown(null)}
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
                                isOpen={openVoiceDropdown === getSentenceKey('scenario', i, s.text)}
                                onToggle={() => setOpenVoiceDropdown(openVoiceDropdown === getSentenceKey('scenario', i, s.text) ? null : getSentenceKey('scenario', i, s.text))}
                                isPlayDropdownOpen={openPlayDropdown === getSentenceKey('scenario', i, s.text)}
                                onTogglePlayDropdown={() => setOpenPlayDropdown(openPlayDropdown === getSentenceKey('scenario', i, s.text) ? null : getSentenceKey('scenario', i, s.text))}
                                onAssociate={(voiceId) => associateVoice(getSentenceKey('scenario', i, s.text), voiceId)}
                                onRemove={(voiceId) => removeVoiceAssociation(getSentenceKey('scenario', i, s.text), voiceId)}
                                onPlay={handlePlayVoiceInDetail}
                                isTouch={isTouch}
                                closeOtherDropdown={() => setOpenPlayDropdown(null)}
                                closeMainDropdown={() => setOpenVoiceDropdown(null)}
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
                          <p>{s.text}</p>
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
      </div>

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
                      onClick={() => setShowVoiceListPopup(!showVoiceListPopup)}
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
                <button
                  onClick={() => {
                    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
                    const currentIndex = speeds.indexOf(detailPlaybackSpeed);
                    const nextIndex = (currentIndex + 1) % speeds.length;
                    setDetailPlaybackSpeed(speeds[nextIndex]);
                  }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors text-xs font-medium min-w-[28px] flex-shrink-0"
                  title="Playback speed"
                >
                  {detailPlaybackSpeed}x
                </button>

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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-teal-500 text-black px-4 py-2 rounded-full font-medium text-sm shadow-lg z-50"
        >
          Saved to Photos
        </motion.div>
      )}
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
  isOpen: boolean;
  onToggle: () => void;
  onTogglePlayDropdown: () => void;
  isPlayDropdownOpen: boolean;
  onAssociate: (voiceId: string) => void;
  onRemove: (voiceId: string) => void;
  onPlay: (voice: VoiceItem) => void;
  onAddVoice?: () => void;
  isTouch?: boolean;
  closeOtherDropdown?: () => void;
  closeMainDropdown?: () => void;
}

const VoiceDropdown: React.FC<VoiceDropdownProps> = ({
  sentenceKey,
  associatedVoices,
  savedVoices,
  isOpen,
  onToggle,
  onTogglePlayDropdown,
  isPlayDropdownOpen,
  onAssociate,
  onRemove,
  onPlay,
  onAddVoice,
  isTouch = false,
  closeOtherDropdown,
  closeMainDropdown
}) => {
  const hasAssociated = associatedVoices.length > 0;
  const hasMultiple = associatedVoices.length > 1;

  return (
    <div className="relative flex items-center gap-1 overflow-visible" onClick={(e) => e.stopPropagation()}>
      {/* Always show Plus to add association */}
      <button
        onClick={(e) => {
          e.stopPropagation();
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
                onPlay(associatedVoices[0], associatedVoices);
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
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:-translate-x-0 top-full mt-1 bg-neutral-800 rounded-xl border border-white/10 p-1 shadow-xl z-[60] w-[120px] sm:w-[150px] max-w-[calc(100vw-20px)]">
              {associatedVoices.map(voice => (
                <button
                  key={voice.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlay(voice, associatedVoices);
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
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:-translate-x-0 top-full mt-1 bg-neutral-800 rounded-xl border border-white/10 p-2 shadow-xl z-50 w-[180px] sm:w-[200px] max-w-[calc(100vw-20px)]">
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
                      onPlay(voice, associatedVoices);
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
                    className={`p-1 rounded-full text-neutral-500 hover:text-red-400 hover:bg-red-400/10 ${isTouch ? 'opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100'} transition-opacity`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="border-t border-white/10 my-1" />
            </>
          ) : null}

          {/* Show saved voices to associate */}
          {savedVoices.length > 0 ? (
            savedVoices.filter(v => !hasAssociated || !associatedVoices.some(av => av.id === v.id)).map(voice => (
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
            ))
          ) : (
            <p className="text-xs text-neutral-500 px-2 py-1">No saved voices</p>
          )}
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
  isTouch?: boolean
}> = ({ voices, onDeleteVoice, onPlayVoice, onUpdateVoiceName, onEditTimestamps, isTouch = false }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    setShowDeleteConfirm(id);
  };

  const confirmDelete = () => {
    if (showDeleteConfirm) {
      onDeleteVoice(showDeleteConfirm);
      setShowDeleteConfirm(null);
    }
  };

  return (
    <motion.div 
      className="min-h-screen bg-[#09090b] text-[#e4e4e7] p-4 pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <header className="mb-6 mt-4 px-2">
        <h1 className="text-2xl font-bold text-white mb-1">Voice Collection</h1>
        <p className="text-neutral-500 text-sm">Your saved shadowing sessions</p>
      </header>

      <div className="space-y-4">
        {voices.length === 0 ? (
          <div className="text-center py-20 text-neutral-600">
            <Library size={48} className="mx-auto mb-4 opacity-20" />
            <p>No saved voices yet.</p>
          </div>
        ) : (
          voices.map(voice => {
            return (
              <div
                key={voice.id}
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
                        handleDeleteClick(voice.id);
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteClick(voice.id);
                      }}
                      onContextMenu={(e) => {
                        if (isTouch) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteClick(voice.id);
                        }
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
            ref={el => itemRefs.current[idx] = el}
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
  const [activeTab, setActiveTab] = useState<MainTab>('notes');
  const [notesView, setNotesView] = useState<NotesView>('list');
  const [shadowText, setShadowText] = useState<string | undefined>(undefined);
  const [shadowKey, setShadowKey] = useState(0); // Key to force remount/reset

  // Touch device detection
  const isTouch = useIsTouchDevice();

  // Global State
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [savedVoices, setSavedVoices] = useState<VoiceItem[]>(() =>
    getStorageItem<VoiceItem[]>(STORAGE_KEYS.SAVED_VOICES, [])
  );
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const [activeVoice, setActiveVoice] = useState<VoiceItem | null>(null);
  const [editingVoice, setEditingVoice] = useState<VoiceItem | null>(null);
  const [editingFromPlayback, setEditingFromPlayback] = useState(false);
  const [editedTimestamps, setEditedTimestamps] = useState<Record<string, LyricSegment[]>>(() =>
    getStorageItem<Record<string, LyricSegment[]>>(STORAGE_KEYS.EDITED_TIMESTAMPS, {})
  );

  // Persistence: Save to localStorage when state changes
  useEffect(() => {
    setStorageItem(STORAGE_KEYS.NOTES, notes);
  }, [notes]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.SAVED_VOICES, savedVoices);
  }, [savedVoices]);

  useEffect(() => {
    setStorageItem(STORAGE_KEYS.EDITED_TIMESTAMPS, editedTimestamps);
  }, [editedTimestamps]);

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

  const handleDeleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
    if (selectedNote?.id === id) {
      setNotesView('list');
      setSelectedNote(null);
    }
  };

  const handleUpdateNote = (updatedNote: Note) => {
    if (isNewNote) {
      // Add new note to the list
      setNotes([updatedNote, ...notes]);
      setIsNewNote(false);
    } else {
      // Update existing note
      setNotes(notes.map(n => n.id === updatedNote.id ? updatedNote : n));
    }
    setSelectedNote(updatedNote);
  };

  const handleSelectNote = (note: Note) => {
    setSelectedNote(note);
    setNotesView('detail');
  };

  const handleSaveShadowNote = (content: string) => {
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
    setNotes([newNote, ...notes]);
  };

  const handleSaveVoice = (audioUrl: string, duration: number, text: string, customName?: string) => {
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
    setSavedVoices([newVoice, ...savedVoices]);
  };

  const handleUpdateVoiceName = (id: string, newName: string) => {
    setSavedVoices(savedVoices.map(v => v.id === id ? { ...v, title: newName } : v));
  };

  const handleDeleteVoice = (id: string) => {
    setSavedVoices(savedVoices.filter(v => v.id !== id));
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
                key="detail"
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
            isTouch={isTouch}
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
