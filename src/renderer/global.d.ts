// Ambient type for the API src/preload/index.ts exposes via contextBridge.
// Kept as a hand-written mirror rather than importing from src/main: main
// and renderer compile as separate TS projects (commonjs vs. ES modules),
// and importing across that boundary would make tsc try to emit main's
// commonjs output a second time as ES modules into the same dist path.
export {};

interface AppSettings {
  hotkeys: { captureAndTranslate: string };
  languages: { autoDetectFirst: string; autoDetectSecond: string };
  services: { deepl: boolean; yandex: boolean; google: boolean };
}

type ProviderCallResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface TranslationResult {
  translatedText: string;
  detectedSourceLang?: string;
  dictionary?: GoogleDictionary;
  genderArticle?: string;
}

interface ElectronAPI {
  settings: {
    get(): Promise<AppSettings>;
    update(partial: Partial<AppSettings>): Promise<AppSettings>;
  };
  providers: {
    translate(providerId: string, text: string, sourceLang: string, targetLang: string, options?: { lightweight?: boolean }): Promise<ProviderCallResult<TranslationResult>>;
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
}
