import { describe, expect, it } from 'vitest';
import beautifulEnRu from './__fixtures__/google/beautiful-en-ru.json';
import begRuEn from './__fixtures__/google/beg-ru-en.json';
import phraseEnDe from './__fixtures__/google/phrase-en-de.json';
import runEnDe from './__fixtures__/google/run-en-de.json';
import { parseGoogleDictionary } from './googleDictionary';

describe('parseGoogleDictionary', () => {
  it('has no part-of-speech entries or examples for a phrase, but keeps alternative translations', () => {
    const dictionary = parseGoogleDictionary(phraseEnDe);

    expect(dictionary).toBeDefined();
    expect(dictionary!.entries).toEqual([]);
    expect(dictionary!.examples).toEqual([]);
    expect(dictionary!.alternativeTranslations.length).toBeGreaterThan(0);
  });

  it('returns undefined when there is genuinely nothing at all', () => {
    expect(parseGoogleDictionary({ sentences: [{ trans: 'hi' }], src: 'en' })).toBeUndefined();
  });

  it('does not crash when an alternative_translations group has no "alternative" field', () => {
    // Real crash observed translating a multi-sentence paragraph: the
    // whitespace-only segment between two sentences ("\r\n\r\n") comes
    // back with no "alternative" key at all, not an empty array.
    const dictionary = parseGoogleDictionary({
      sentences: [{ trans: 'hi' }],
      src: 'en',
      alternative_translations: [
        { src_phrase: 'hello', alternative: [{ word_postproc: 'hi' }] },
        { src_phrase: '\r\n\r\n' } as never,
      ],
    });

    expect(dictionary!.alternativeTranslations).toEqual(['hi']);
  });

  it('groups translations, synonyms, and definitions by part of speech for a single word', () => {
    const dictionary = parseGoogleDictionary(runEnDe);

    expect(dictionary).toBeDefined();
    const verb = dictionary!.entries.find((e) => e.partOfSpeech === 'verb');
    expect(verb).toBeDefined();
    expect(verb!.translations).toContain('laufen');
    expect(verb!.synonyms.length).toBeGreaterThan(0);
    expect(verb!.definitions.length).toBeGreaterThan(0);

    const noun = dictionary!.entries.find((e) => e.partOfSpeech === 'noun');
    expect(noun).toBeDefined();
    expect(noun!.translations).toContain('der Lauf');
  });

  it('prefixes German noun translations with their article (gender)', () => {
    const dictionary = parseGoogleDictionary(runEnDe);

    const noun = dictionary!.entries.find((e) => e.partOfSpeech === 'noun');
    expect(noun!.translations).toEqual(expect.arrayContaining(['der Run', 'die Auflage']));

    // Verbs have no article — must not get one glued on.
    const verb = dictionary!.entries.find((e) => e.partOfSpeech === 'verb');
    expect(verb!.translations).toContain('laufen');
    expect(verb!.translations.some((t) => t.startsWith('der ') || t.startsWith('die ') || t.startsWith('das '))).toBe(false);
  });

  it('strips HTML tags from example sentences', () => {
    const dictionary = parseGoogleDictionary(runEnDe);

    expect(dictionary!.examples.length).toBeGreaterThan(0);
    for (const example of dictionary!.examples) {
      expect(example).not.toMatch(/<\/?[a-z]/i);
    }
  });

  it('includes alternative translations for a single word', () => {
    const dictionary = parseGoogleDictionary(beautifulEnRu);

    expect(dictionary!.alternativeTranslations).toEqual(expect.arrayContaining(['красивый']));
  });

  it('handles a source word with dict/definitions but no synsets (non-English source)', () => {
    const dictionary = parseGoogleDictionary(begRuEn);

    expect(dictionary).toBeDefined();
    const noun = dictionary!.entries.find((e) => e.partOfSpeech === 'noun');
    expect(noun!.translations).toContain('running');
    expect(noun!.synonyms).toEqual([]);
  });

  it('deduplicates and caps synonym/example/alternative lists', () => {
    const dictionary = parseGoogleDictionary(runEnDe);

    for (const entry of dictionary!.entries) {
      expect(entry.synonyms.length).toBeLessThanOrEqual(12);
      expect(new Set(entry.synonyms).size).toBe(entry.synonyms.length);
    }
    expect(dictionary!.examples.length).toBeLessThanOrEqual(8);
    expect(dictionary!.alternativeTranslations.length).toBeLessThanOrEqual(8);
  });
});
