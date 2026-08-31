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
  // Same idea as genderArticle, but for the *source* word instead of the
  // translated one — e.g. translating German "Einschränkung" to Russian
  // (which has no articles of its own, so genderArticle above is never
  // set) still surfaces "die" here, since German is the source language.
  // Independent of genderArticle: either, both, or neither can be set
  // depending on which of source/target actually use articles.
  sourceGenderArticle?: string;
}

/**
 * Every translation service is called through an unofficial, reverse-engineered
 * endpoint (see CONTRIBUTING.md). Implementations MUST NOT let a network or
 * parsing failure escape as an unhandled rejection from anywhere other than
 * their own public methods — the registry is what turns that failure into an
 * isolated per-provider result instead of an app-wide crash.
 */
export interface TranslateOptions {
  // Skips anything beyond the bare translation — for Google specifically,
  // this means skipping the dictionary/synonyms/examples request fields
  // and the gender-article pivot lookup (issue #76 follow-up). Set by
  // callers that only need translatedText and would otherwise triple or
  // more the request count for no UI benefit — e.g. the popup's
  // back-translation call, which never displays dictionary/gender data.
  lightweight?: boolean;
  // Bypasses the Google provider's request cache (google.ts) for this call
  // — the fresh response still gets written back to the cache afterward,
  // so it's "don't read a possibly-stale entry", not "disable caching
  // entirely". Set by callers acting on an explicit user correction (e.g.
  // overriding a wrong Auto-Detect pick) where a guaranteed-live answer
  // matters more than the dedup savings — see popup.ts's
  // ensureActiveResultLoaded(forceFresh) and retranslateBackWithLang().
  // A no-op for providers with no cache (DeepL/Yandex).
  skipCache?: boolean;
}

export interface TranslationProvider {
  readonly id: string; // 'deepl' | 'yandex' | 'google'
  translate(text: string, sourceLang: string, targetLang: string, options?: TranslateOptions): Promise<TranslationResult>;
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
