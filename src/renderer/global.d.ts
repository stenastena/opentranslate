// Ambient type for the API src/preload/index.ts exposes via contextBridge.
// Kept as a hand-written mirror rather than importing from src/main: main
// and renderer compile as separate TS projects (commonjs vs. ES modules),
// and importing across that boundary would make tsc try to emit main's
// commonjs output a second time as ES modules into the same dist path.
export {};

type TTSProviderId = 'system' | 'google-cloud' | 'bing-cloud';
type ThemeMode = 'light' | 'dark' | 'custom';

interface CustomThemeColors {
  background: string;
  text: string;
  accent: string;
}

interface AppSettings {
  hotkeys: { captureAndTranslate: string };
  languages: { autoDetectFirst: string; autoDetectSecond: string };
  services: { deepl: boolean; google: boolean; bing: boolean; mymemory: boolean };
  tts: { provider: TTSProviderId; voiceByLang: Record<string, string> };
  appearance: { fontSize: number; fontFamily: string; theme: ThemeMode; customColors: CustomThemeColors };
  advanced: { copyAction: CopyAction; startWithWindows: boolean };
}

// null means the selected provider already played the audio itself
// (systemProvider.ts) — a populated object means the caller must play
// these bytes itself (the cloud providers; see popup.ts's <audio> use).
interface TTSSpeakResponse {
  audioBase64: string;
  mimeType: string;
}

type ProviderCallResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface HistoryEntry {
  id: string;
  timestamp: number;
  originalText: string;
  sourceLang: string;
  targetLang: string;
  providerId: string;
  translatedText: string;
}

type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'timestamp'>;

interface TranslationResult {
  translatedText: string;
  detectedSourceLang?: string;
  dictionary?: GoogleDictionary;
  genderArticle?: string;
  sourceGenderArticle?: string;
}

interface ElectronAPI {
  settings: {
    get(): Promise<AppSettings>;
    update(partial: Partial<AppSettings>): Promise<AppSettings>;
  };
  providers: {
    translate(providerId: string, text: string, sourceLang: string, targetLang: string, options?: { lightweight?: boolean; skipCache?: boolean }): Promise<ProviderCallResult<TranslationResult>>;
    detectLanguage(providerId: string, text: string): Promise<ProviderCallResult<string>>;
    getLastSuccessAt(providerId: string): Promise<number | null>;
    listIds(): Promise<string[]>;
  };
  popup: {
    onCapturedText(callback: (text: string) => void): void;
  };
  history: {
    list(): Promise<HistoryEntry[]>;
    add(entry: NewHistoryEntry): Promise<HistoryEntry>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
  };
  tts: {
    // providerOverride pins a specific provider for this call, bypassing
    // the saved settings.tts.provider — used by Settings' per-language
    // system-voice "Test" button (always 'system') and its provider-
    // selector "Test" button (an in-progress, not-yet-saved choice).
    speak(text: string, lang?: string, voiceName?: string, providerOverride?: TTSProviderId): Promise<TTSSpeakResponse | null>;
    stop(): Promise<void>;
    listVoices(): Promise<TTSVoice[]>;
    openNaturalVoiceAdapterPage(): Promise<void>;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }

  interface GoogleDictionaryEntry {
    partOfSpeech: string;
    translations: string[];
    synonyms: string[];
    definitions: string[];
  }

  interface GoogleDictionary {
    entries: GoogleDictionaryEntry[];
    examples: string[];
    alternativeTranslations: string[];
  }

  interface HistoryEntry {
    id: string;
    timestamp: number;
    originalText: string;
    sourceLang: string;
    targetLang: string;
    providerId: string;
    translatedText: string;
  }

  type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'timestamp'>;

  interface TTSVoice {
    name: string;
    locale: string;
    langCode: string;
    description: string;
  }

  type TTSProviderId = 'system' | 'google-cloud' | 'bing-cloud';

  interface TTSSpeakResponse {
    audioBase64: string;
    mimeType: string;
  }

  type ThemeMode = 'light' | 'dark' | 'custom';

  interface CustomThemeColors {
    background: string;
    text: string;
    accent: string;
  }

  type CopyAction = 'none' | 'original' | 'translation';
}
