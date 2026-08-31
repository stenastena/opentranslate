import { describe, expect, it } from 'vitest';
import { findBingGenderArticle, parseBingDictionary, RawBingLookupEntry } from './bingDictionary';

// Real shape captured live (issue #119, 2026-09-01) via www.bing.com/
// tlookupv3 for "run" (en->de) — trimmed to the fields the parser reads.
const RUN_EN_DE: RawBingLookupEntry[] = [
  {
    normalizedSource: 'run',
    displaySource: 'run',
    translations: [
      { normalizedTarget: 'laufen', displayTarget: 'laufen', posTag: 'OTHER', confidence: 0.7051, prefixWord: '', backTranslations: [{ normalizedText: 'run', displayText: 'run' }, { normalizedText: 'walk', displayText: 'walk' }] },
      { normalizedTarget: 'rennen', displayTarget: 'rennen', posTag: 'VERB', confidence: 0.0782, prefixWord: '', backTranslations: [{ normalizedText: 'race', displayText: 'race' }, { normalizedText: 'run', displayText: 'run' }] },
      { normalizedTarget: 'leiten', displayTarget: 'leiten', posTag: 'VERB', confidence: 0.033, prefixWord: '', backTranslations: [{ normalizedText: 'guide', displayText: 'guide' }] },
    ],
  },
];

// Real shape for "house" (en->de) — a single-candidate, single-pos response.
const HOUSE_EN_DE: RawBingLookupEntry[] = [
  {
    normalizedSource: 'house',
    displaySource: 'house',
    translations: [{ normalizedTarget: 'haus', displayTarget: 'haus', posTag: 'OTHER', confidence: 1.0, prefixWord: '', backTranslations: [{ normalizedText: 'house', displayText: 'house' }, { normalizedText: 'home', displayText: 'home' }] }],
  },
];

describe('parseBingDictionary', () => {
  it('buckets multiple candidate translations by their own part-of-speech tag', () => {
    const result = parseBingDictionary(RUN_EN_DE);

    expect(result?.entries.map((e) => e.partOfSpeech)).toEqual(['other', 'verb']);
    expect(result?.entries[0].translations).toEqual(['laufen']);
    expect(result?.entries[1].translations).toEqual(['rennen', 'leiten']);
  });

  it('uses backTranslations as this entry\'s synonyms', () => {
    const result = parseBingDictionary(RUN_EN_DE);

    expect(result?.entries[1].synonyms).toEqual(expect.arrayContaining(['race', 'run', 'guide']));
  });

  it('prefixes a translation with its article when prefixWord is present', () => {
    const withArticle: RawBingLookupEntry[] = [
      { normalizedSource: 'house', displaySource: 'house', translations: [{ normalizedTarget: 'haus', displayTarget: 'Haus', posTag: 'NOUN', confidence: 1, prefixWord: 'das' }] },
    ];

    const result = parseBingDictionary(withArticle);

    expect(result?.entries[0].translations).toEqual(['das Haus']);
  });

  it('leaves definitions and examples empty — Bing has no equivalent data', () => {
    const result = parseBingDictionary(HOUSE_EN_DE);

    expect(result?.entries[0].definitions).toEqual([]);
    expect(result?.examples).toEqual([]);
    expect(result?.alternativeTranslations).toEqual([]);
  });

  it('returns undefined for an empty or missing response', () => {
    expect(parseBingDictionary(undefined)).toBeUndefined();
    expect(parseBingDictionary([])).toBeUndefined();
    expect(parseBingDictionary([{ normalizedSource: 'x', displaySource: 'x', translations: [] }])).toBeUndefined();
  });
});

describe('findBingGenderArticle', () => {
  it('returns undefined when prefixWord is empty — confirmed live for every word tested', () => {
    expect(findBingGenderArticle(HOUSE_EN_DE, 'Haus')).toBeUndefined();
    expect(findBingGenderArticle(RUN_EN_DE, 'laufen')).toBeUndefined();
  });

  it('returns the article for the candidate matching the actual translation, when one is present', () => {
    const withArticle: RawBingLookupEntry[] = [
      {
        normalizedSource: 'restriction',
        displaySource: 'restriction',
        translations: [
          { normalizedTarget: 'restriktion', displayTarget: 'Restriktion', posTag: 'NOUN', confidence: 0.9, prefixWord: 'die' },
          { normalizedTarget: 'einschränkung', displayTarget: 'Einschränkung', posTag: 'NOUN', confidence: 0.5, prefixWord: 'die' },
        ],
      },
    ];

    expect(findBingGenderArticle(withArticle, 'Einschränkung')).toBe('die');
  });

  it('falls back to the top-ranked candidate when nothing matches the translated text exactly', () => {
    const withArticle: RawBingLookupEntry[] = [{ normalizedSource: 'x', displaySource: 'x', translations: [{ normalizedTarget: 'haus', displayTarget: 'Haus', posTag: 'NOUN', confidence: 1, prefixWord: 'das' }] }];

    expect(findBingGenderArticle(withArticle, 'SomethingElseEntirely')).toBe('das');
  });
});
