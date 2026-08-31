import { GoogleDictionary, GoogleDictionaryEntry } from './googleDictionary';

// Parses www.bing.com/tlookupv3's response — the endpoint behind Bing
// Translator's own dictionary panel, found live (issue #119, 2026-09-01)
// by watching the real page's network traffic while looking up a single
// word. No prior art to port: unlike Google/Reverso/AI/CSV, ahatem/
// QTranslate has no BingDictionaryService.kt at all.
//
// Reuses the GoogleDictionary shape (googleDictionary.ts) rather than
// defining a parallel one — the type predates this provider but the shape
// (partOfSpeech/translations/synonyms/definitions) already fits both, and
// the popup's rendering code is provider-agnostic, so nothing there needs
// to change.
//
// Confirmed EMPTY across every word tested (house, restriction, bridge,
// run, all en->de): `prefixWord`, Bing's equivalent of Google's
// `previous_word` (the field the der/die/das gender display is built on —
// see googleDictionary.ts), never comes back populated. Read defensively
// below in case some word/language pair does carry one, but this is a
// real, confirmed gap in Bing's own data, not a parsing bug — the Bing tab
// is not expected to ever show a gender badge.

export interface RawBingBackTranslation {
  normalizedText: string;
  displayText: string;
}

export interface RawBingLookupTranslation {
  normalizedTarget: string;
  displayTarget: string;
  posTag: string;
  confidence: number;
  prefixWord?: string;
  backTranslations?: RawBingBackTranslation[];
}

export interface RawBingLookupEntry {
  normalizedSource: string;
  displaySource: string;
  translations: RawBingLookupTranslation[];
}

const MAX_TRANSLATIONS_PER_POS = 8;
const MAX_SYNONYMS_PER_ENTRY = 12;

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

// Bing returns one flat list of candidate translations, each individually
// tagged with its own part of speech and a confidence score (already
// ranked highest-first by Bing itself — preserved, not re-sorted here) —
// unlike Google's response, which is already grouped by part of speech.
// Bucketed here the same way so the shared rendering code sees one shape
// regardless of provider. backTranslations (reverse translations back to
// the source language) double as this entry's synonyms — the closest
// analog Bing's data has to Google's synsets; there's no prose-definition
// equivalent, so `definitions` stays empty.
export function parseBingDictionary(raw: RawBingLookupEntry[] | undefined): GoogleDictionary | undefined {
  const entry = raw?.[0];
  if (!entry?.translations?.length) return undefined;

  const byPos = new Map<string, GoogleDictionaryEntry>();
  const posOrder: string[] = [];
  function entryFor(pos: string): GoogleDictionaryEntry {
    let bucket = byPos.get(pos);
    if (!bucket) {
      bucket = { partOfSpeech: pos, translations: [], synonyms: [], definitions: [] };
      byPos.set(pos, bucket);
      posOrder.push(pos);
    }
    return bucket;
  }

  for (const t of entry.translations) {
    const bucket = entryFor(t.posTag.toLowerCase());
    bucket.translations.push(t.prefixWord ? `${t.prefixWord} ${t.displayTarget}` : t.displayTarget);
    for (const back of t.backTranslations ?? []) {
      bucket.synonyms.push(back.displayText);
    }
  }

  const entries = posOrder.map((pos) => {
    const bucket = byPos.get(pos)!;
    return {
      ...bucket,
      translations: dedupe(bucket.translations).slice(0, MAX_TRANSLATIONS_PER_POS),
      synonyms: dedupe(bucket.synonyms).slice(0, MAX_SYNONYMS_PER_ENTRY),
    };
  });

  return { entries, examples: [], alternativeTranslations: [] };
}

// The article for whichever candidate matches the actual translation
// (falling back to the top-ranked candidate if none match exactly) —
// mirrors google.ts's genderArticle, but per the doc comment above this is
// expected to stay undefined in practice; Bing's data just doesn't carry it.
export function findBingGenderArticle(raw: RawBingLookupEntry[] | undefined, translatedText: string): string | undefined {
  const entry = raw?.[0];
  if (!entry?.translations?.length) return undefined;
  const needle = translatedText.trim().toLowerCase();
  const match = entry.translations.find((t) => t.normalizedTarget.toLowerCase() === needle) ?? entry.translations[0];
  return match.prefixWord || undefined;
}
