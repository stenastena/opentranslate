// Parses the extra "dictionary" sections Google's unofficial translate_a/single
// endpoint returns when the request includes dt=bd/ss/md/ex/at (in addition to
// the plain dt=t translation) and dj=1 (object response format instead of the
// legacy nested-array shape). None of this is documented by Google — the shapes
// below were reverse-engineered from real responses (see
// src/main/providers/__fixtures__/google/*.json, captured 2026-08-29 for a
// handful of single words and phrases across en/ru/de). Re-capture fresh
// fixtures with `curl` if this ever stops matching what the endpoint returns.
//
// Noun translations are prefixed with their definite article when Google's
// data provides one (`dict[].entry[].previous_word`) — this is how German
// noun gender (der/die/das) shows up, and the same field carries French's
// le/la, so the prefixing isn't German-specific even though that's the
// motivating case.
//
// This is only ever as accurate as Google's own (undocumented, unofficial)
// data — confirmed on the real machine that it can be flat wrong: querying
// "Мост" (ru) -> German returns the noun candidate "Brücke" tagged with
// `previous_word: "der"`, but "Brücke" is grammatically feminine ("die
// Brücke") in real German. There's no local correction for this; a wrong
// article shown to the user is Google's dictionary data being wrong, not a
// parsing bug here.
//
// Per issue #76: the dict/synsets/definitions fields are only populated when
// the source text is a single word (no spaces) — for phrases/sentences they're
// absent, which is expected API behavior, not a parsing bug. `synsets` (English
// thesaurus synonyms) additionally only appears when the source language is
// English. `alternative_translations` (dt=at) is populated for both words and
// phrases.

export interface RawGoogleDictEntry {
  word: string;
  // The definite article Google's data prepends to this specific
  // translation — "der"/"die"/"das" for German, "le"/"la" for French, and
  // presumably similarly for other article-using target languages (see
  // issue #76 follow-up: this is what shows German noun gender). Absent
  // for languages without articles (e.g. Russian) and often for
  // non-noun parts of speech.
  previous_word?: string;
}

export interface RawGoogleDictSection {
  pos: string;
  terms?: string[];
  entry?: RawGoogleDictEntry[];
}

export interface RawGoogleSynsetEntry {
  synonym: string[];
}

export interface RawGoogleSynsetSection {
  pos: string;
  entry: RawGoogleSynsetEntry[];
}

export interface RawGoogleDefinitionEntry {
  gloss: string;
}

export interface RawGoogleDefinitionSection {
  pos: string;
  entry: RawGoogleDefinitionEntry[];
}

export interface RawGoogleExamples {
  example?: Array<{ text: string }>;
}

export interface RawGoogleAlternativeTranslation {
  // Absent (not just empty) for a segment Google had no alternative for —
  // observed for a whitespace-only "segment" between sentences in a
  // multi-sentence translation (e.g. the "\r\n\r\n" between two
  // paragraphs) — confirmed via a real crash on exactly that input.
  alternative?: Array<{ word_postproc: string }>;
}

export interface RawGoogleFullResponse {
  sentences?: Array<{ trans?: string }>;
  src?: string;
  dict?: RawGoogleDictSection[];
  synsets?: RawGoogleSynsetSection[];
  definitions?: RawGoogleDefinitionSection[];
  examples?: RawGoogleExamples;
  alternative_translations?: RawGoogleAlternativeTranslation[];
}

export interface GoogleDictionaryEntry {
  partOfSpeech: string;
  translations: string[];
  synonyms: string[];
  definitions: string[];
}

export interface GoogleDictionary {
  entries: GoogleDictionaryEntry[];
  examples: string[];
  alternativeTranslations: string[];
}

const MAX_SYNONYMS_PER_ENTRY = 12;
const MAX_DEFINITIONS_PER_ENTRY = 5;
const MAX_EXAMPLES = 8;
const MAX_ALTERNATIVES = 8;

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

// Google's example text comes with the looked-up word wrapped in <b> tags
// (e.g. "a production <b>run</b> of only 150 cars"). Strip all tags rather
// than just <b> — this is untrusted third-party content and the renderer
// only ever sets it via textContent, so keeping it as plain text is both
// simpler and safer than any HTML-preserving approach.
function stripHtmlTags(text: string): string {
  return text.replace(/<\/?[a-z][^>]*>/gi, '');
}

export function parseGoogleDictionary(data: RawGoogleFullResponse): GoogleDictionary | undefined {
  const posOrder: string[] = [];
  const byPos = new Map<string, GoogleDictionaryEntry>();

  function entryFor(pos: string): GoogleDictionaryEntry {
    let entry = byPos.get(pos);
    if (!entry) {
      entry = { partOfSpeech: pos, translations: [], synonyms: [], definitions: [] };
      byPos.set(pos, entry);
      posOrder.push(pos);
    }
    return entry;
  }

  for (const section of data.dict ?? []) {
    const translations = section.entry
      ? section.entry.map((e) => (e.previous_word ? `${e.previous_word} ${e.word}` : e.word))
      : (section.terms ?? []);
    entryFor(section.pos).translations = dedupe(translations);
  }

  for (const section of data.synsets ?? []) {
    const synonyms = section.entry.flatMap((e) => e.synonym);
    entryFor(section.pos).synonyms = dedupe(synonyms).slice(0, MAX_SYNONYMS_PER_ENTRY);
  }

  for (const section of data.definitions ?? []) {
    const definitions = section.entry.map((e) => e.gloss).filter(Boolean);
    entryFor(section.pos).definitions = dedupe(definitions).slice(0, MAX_DEFINITIONS_PER_ENTRY);
  }

  const examples = dedupe((data.examples?.example ?? []).map((e) => stripHtmlTags(e.text))).slice(0, MAX_EXAMPLES);

  const alternativeTranslations = dedupe(
    (data.alternative_translations ?? []).flatMap((group) => (group.alternative ?? []).map((a) => a.word_postproc)),
  ).slice(0, MAX_ALTERNATIVES);

  const entries = posOrder.map((pos) => byPos.get(pos)!);

  if (entries.length === 0 && examples.length === 0 && alternativeTranslations.length === 0) {
    return undefined;
  }
  return { entries, examples, alternativeTranslations };
}

// Looks for `word` among a dict response's entries and returns its article,
// if Google's data attached one. Used to find the gender of the *specific*
// word a translation produced — the sentence-level translator and the
// dictionary lookup are different Google subsystems that don't always pick
// the same top candidate (e.g. translating "Бизнес" gives "Geschäft" but
// the dictionary's top noun candidate for the same query is "Business");
// see google.ts's findTranslationGender for the fallback that queries a
// pivot word to find entries like this one when the direct response
// doesn't already contain a match.
export function findArticleForWord(data: RawGoogleFullResponse, word: string): string | undefined {
  const needle = word.trim().toLowerCase();
  for (const section of data.dict ?? []) {
    for (const entry of section.entry ?? []) {
      if (entry.previous_word && entry.word.trim().toLowerCase() === needle) {
        return entry.previous_word;
      }
    }
  }
  return undefined;
}
