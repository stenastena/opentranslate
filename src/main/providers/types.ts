import { GoogleDictionary } from './googleDictionary';

export interface TranslationResult {
  translatedText: string;
  detectedSourceLang?: string;
  // Only ever populated by the Google provider (issue #76) — its unofficial
  // endpoint can return a dictionary breakdown (parts of speech, synonyms,
  // definitions, examples) that DeepL/Yandex have no equivalent for.
  dictionary?: GoogleDictionary;
  // The definite article for translatedText specifically (e.g. "das" for
  // "Geschäft") when the target language uses grammatical articles — see
  // google.ts's findTranslationGender. Undefined when the target language
  // has no articles, translatedText isn't a single word, or no article
  // could be found for that exact word.
  genderArticle?: string;
}

/**
 * Every translation service is called through an unofficial, reverse-engineered
 * endpoint (see CONTRIBUTING.md). Implementations MUST NOT let a network or
 * parsing failure escape as an unhandled rejection from anywhere other than
 * their own public methods — the registry is what turns that failure into an
 * isolated per-provider result instead of an app-wide crash.
 */
export interface TranslationProvider {
  readonly id: string; // 'deepl' | 'yandex' | 'google'
  translate(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<string>;
  isHealthy(): Promise<boolean>;
}

export class ProviderError extends Error {
  constructor(
    public readonly providerId: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type ProviderCallResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
