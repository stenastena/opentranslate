import { LANGUAGES, languageLabel } from '../shared/languages.js';

const PROVIDER_LABELS: Record<string, string> = {
  deepl: 'DeepL',
  yandex: 'Yandex',
  google: 'Google',
};
const PROVIDER_ORDER = ['deepl', 'yandex', 'google'];

interface TabResult {
  status: 'idle' | 'loading' | 'ok' | 'error';
  translatedText?: string;
  backTranslatedText?: string;
  detectedLang?: string;
  targetLang?: string;
  error?: string;
  dictionary?: GoogleDictionary;
  genderArticle?: string;
}

interface State {
  originalText: string;
  sourceLang: string; // 'auto' or a language code
  targetLang: string; // 'auto' or a language code
  lastDetectedLang?: string;
  lastResolvedTargetLang?: string;
  // The Languages settings pair used to resolve targetLang when it's
  // 'auto': whichever of the two ISN'T the (detected or selected) source
  // becomes the target. E.g. with first=en/second=ru: source ru -> target
  // en; source anything else (including a third language) -> target ru.
  autoDetectFirst: string;
  autoDetectSecond: string;
  // Per-language SAPI voice override from Settings → Voice (issue #89).
  // A language with no entry here falls back to systemTtsProvider's
  // automatic locale matching — same as before this setting existed.
  voiceByLang: Record<string, string>;
  providerIds: string[];
  activeProviderId: string | null;
  resultsByProvider: Map<string, TabResult>;
}

const state: State = {
  originalText: '',
  sourceLang: 'auto',
  targetLang: 'auto',
  autoDetectFirst: 'en',
  autoDetectSecond: 'de',
  voiceByLang: {},
  providerIds: [],
  activeProviderId: null,
  resultsByProvider: new Map(),
};

function resolveAutoTargetLang(effectiveSourceLang: string): string {
  return effectiveSourceLang === state.autoDetectSecond ? state.autoDetectFirst : state.autoDetectSecond;
}

const originalTextEl = document.getElementById('original-text') as HTMLTextAreaElement;
const translationTextEl = document.getElementById('translation-text') as HTMLTextAreaElement;
const backTranslationTextEl = document.getElementById('back-translation-text')!;
const tabsEl = document.getElementById('provider-tabs')!;
const sourceLangSelect = document.getElementById('source-lang') as HTMLSelectElement;
const targetLangSelect = document.getElementById('target-lang') as HTMLSelectElement;
const detectedLangBadge = document.getElementById('detected-lang-badge')!;
const swapButton = document.getElementById('swap-langs') as HTMLButtonElement;
const translateButton = document.getElementById('translate-btn') as HTMLButtonElement;
const dictionarySection = document.getElementById('dictionary-section') as HTMLDetailsElement;
const dictionaryContentEl = document.getElementById('dictionary-content')!;
const translationGenderEl = document.getElementById('translation-gender')!;
const speakOriginalButton = document.getElementById('speak-original-btn') as HTMLButtonElement;
const speakTranslationButton = document.getElementById('speak-translation-btn') as HTMLButtonElement;

// Only one utterance should ever play at a time; this tracks which of the
// two speak buttons (if any) is the one currently driving playback, so a
// click on it stops playback instead of restarting it, and so its icon can
// be reset back once playback ends (naturally or via stop()).
let activeSpeakButton: HTMLButtonElement | null = null;

function populateLanguageSelects(): void {
  targetLangSelect.appendChild(new Option('Auto', 'auto'));
  for (const lang of LANGUAGES) {
    sourceLangSelect.appendChild(new Option(lang.label, lang.code));
    targetLangSelect.appendChild(new Option(lang.label, lang.code));
  }
  sourceLangSelect.value = state.sourceLang;
  targetLangSelect.value = state.targetLang;
}

function renderTabs(): void {
  tabsEl.innerHTML = '';
  for (const providerId of state.providerIds) {
    const result = state.resultsByProvider.get(providerId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab' + (providerId === state.activeProviderId ? ' active' : '') + (result?.status === 'error' ? ' error' : '');
    button.textContent = PROVIDER_LABELS[providerId] ?? providerId;
    button.addEventListener('click', () => {
      state.activeProviderId = providerId;
      renderTabs();
      renderActiveResult();
      void ensureActiveResultLoaded();
    });
    tabsEl.appendChild(button);
  }
}

function renderActiveResult(): void {
  // Don't clobber the field the user is actively typing in — a translation
  // for another tab finishing in the background shouldn't yank their cursor.
  if (document.activeElement !== originalTextEl) {
    originalTextEl.value = state.originalText;
  }
  speakOriginalButton.disabled = !originalTextEl.value.trim();

  const providerId = state.activeProviderId;
  const result = providerId ? state.resultsByProvider.get(providerId) : undefined;

  translationTextEl.classList.remove('loading', 'error');
  backTranslationTextEl.classList.remove('loading', 'error');

  if (!result || result.status === 'idle' || result.status === 'loading') {
    translationTextEl.value = 'Translating…';
    translationTextEl.readOnly = true;
    translationTextEl.classList.add('loading');
    backTranslationTextEl.textContent = '';
    renderDictionary(undefined);
    renderGenderBadge(undefined);
    renderDetectedLangBadge(undefined);
  } else if (result.status === 'error') {
    translationTextEl.value = result.error ?? 'Translation failed.';
    translationTextEl.readOnly = true;
    translationTextEl.classList.add('error');
    backTranslationTextEl.textContent = '';
    renderDictionary(undefined);
    renderGenderBadge(undefined);
    renderDetectedLangBadge(undefined);
  } else {
    translationTextEl.readOnly = false;
    if (document.activeElement !== translationTextEl) {
      translationTextEl.value = result.translatedText ?? '';
    }
    backTranslationTextEl.textContent = result.backTranslatedText ?? '(back-translation unavailable)';
    renderDictionary(result.dictionary);
    renderGenderBadge(result.genderArticle);
    renderDetectedLangBadge(result.detectedLang);
  }

  speakTranslationButton.disabled = !result || result.status !== 'ok' || !translationTextEl.value.trim();
}

// Shows the definite article for the current translation right next to
// the "Translation" heading — the Dictionary section's own entries can
// list a different word/article than what the translator actually
// produced (Google's sentence translator and its dictionary lookup are
// separate subsystems that don't always agree on the top candidate), so
// this is specifically the article for translatedText itself.
function renderGenderBadge(genderArticle: string | undefined): void {
  translationGenderEl.hidden = !genderArticle;
  translationGenderEl.textContent = genderArticle ?? '';
}

// Auto-Detect's source language is a fully open call to the provider's own
// language identifier (any language it recognizes), completely independent
// of the Languages-settings first/second pair — that pair only picks the
// *target* once a source is known (see resolveAutoTargetLang). Without
// this, a detection landing outside the configured pair (e.g. a real word
// in a third language) was invisible, and looked like the app was
// ignoring the configured languages entirely. Only shown when the source
// selector is actually on Auto-Detect — a manually-picked source isn't
// "detected", so labelling it as such would be misleading.
function renderDetectedLangBadge(detectedLang: string | undefined): void {
  const show = state.sourceLang === 'auto' && Boolean(detectedLang);
  detectedLangBadge.hidden = !show;
  detectedLangBadge.textContent = show ? `Detected: ${languageLabel(detectedLang!)}` : '';
}

interface SpeakData {
  text: string;
  lang?: string;
  voiceName?: string;
}

function voiceOverrideFor(lang: string | undefined): string | undefined {
  return lang ? state.voiceByLang[lang] : undefined;
}

function getOriginalSpeakData(): SpeakData | null {
  const text = originalTextEl.value.trim();
  if (!text) return null;
  const lang = state.sourceLang !== 'auto' ? state.sourceLang : state.lastDetectedLang;
  return { text, lang, voiceName: voiceOverrideFor(lang) };
}

function getTranslationSpeakData(): SpeakData | null {
  const providerId = state.activeProviderId;
  const result = providerId ? state.resultsByProvider.get(providerId) : undefined;
  if (!result || result.status !== 'ok') return null;
  const text = translationTextEl.value.trim();
  if (!text) return null;
  const lang = result.targetLang ?? (state.targetLang !== 'auto' ? state.targetLang : state.lastResolvedTargetLang);
  return { text, lang, voiceName: voiceOverrideFor(lang) };
}

function setSpeakButtonActive(button: HTMLButtonElement, active: boolean): void {
  button.classList.toggle('speaking', active);
  button.textContent = active ? '⏹' : '\u{1F50A}';
}

async function handleSpeakClick(button: HTMLButtonElement, getData: () => SpeakData | null): Promise<void> {
  if (activeSpeakButton === button) {
    await window.electronAPI.tts.stop();
    return;
  }

  const data = getData();
  if (!data) return;

  if (activeSpeakButton) {
    await window.electronAPI.tts.stop();
  }

  activeSpeakButton = button;
  setSpeakButtonActive(button, true);
  try {
    await window.electronAPI.tts.speak(data.text, data.lang, data.voiceName);
  } catch (error) {
    console.error('[popup] failed to speak text', error);
  } finally {
    if (activeSpeakButton === button) activeSpeakButton = null;
    setSpeakButtonActive(button, false);
  }
}

// Only Google ever returns dictionary data (issue #76); every other
// provider/tab simply has no dictionary field, and a translated phrase has
// no part-of-speech entries even from Google — in both cases the section
// stays hidden rather than showing an empty shell.
function renderDictionary(dictionary: GoogleDictionary | undefined): void {
  dictionaryContentEl.innerHTML = '';

  const hasContent = Boolean(
    dictionary && (dictionary.entries.length > 0 || dictionary.examples.length > 0 || dictionary.alternativeTranslations.length > 0),
  );
  dictionarySection.hidden = !hasContent;
  if (!dictionary || !hasContent) return;

  for (const entry of dictionary.entries) {
    const entryEl = document.createElement('div');
    entryEl.className = 'dict-entry';

    const posEl = document.createElement('div');
    posEl.className = 'dict-pos';
    posEl.textContent = entry.partOfSpeech;
    entryEl.appendChild(posEl);

    if (entry.translations.length > 0) entryEl.appendChild(dictRow('Translations', entry.translations));
    if (entry.synonyms.length > 0) entryEl.appendChild(dictRow('Synonyms', entry.synonyms));
    if (entry.definitions.length > 0) entryEl.appendChild(dictRow('Definitions', entry.definitions));

    dictionaryContentEl.appendChild(entryEl);
  }

  if (dictionary.alternativeTranslations.length > 0) {
    dictionaryContentEl.appendChild(dictRow('Alternatives', dictionary.alternativeTranslations));
  }

  if (dictionary.examples.length > 0) {
    const list = document.createElement('ul');
    list.className = 'dict-examples';
    for (const example of dictionary.examples) {
      const item = document.createElement('li');
      item.textContent = example;
      list.appendChild(item);
    }
    dictionaryContentEl.appendChild(list);
  }
}

function dictRow(label: string, values: string[]): HTMLParagraphElement {
  const row = document.createElement('p');
  row.className = 'dict-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'dict-row-label';
  labelEl.textContent = `${label}: `;
  row.appendChild(labelEl);
  row.appendChild(document.createTextNode(values.join(', ')));
  return row;
}

async function ensureActiveResultLoaded(): Promise<void> {
  const providerId = state.activeProviderId;
  if (!providerId || !state.originalText) return;

  const existing = state.resultsByProvider.get(providerId);
  if (existing && existing.status !== 'idle') return;

  state.resultsByProvider.set(providerId, { status: 'loading' });
  renderTabs();
  renderActiveResult();

  try {
    let effectiveSourceLang = state.sourceLang;
    let effectiveTargetLang = state.targetLang;

    if (effectiveSourceLang === 'auto') {
      const detectResult = await window.electronAPI.providers.detectLanguage(providerId, state.originalText);
      if (!detectResult.ok) throw new Error(detectResult.error);
      effectiveSourceLang = detectResult.value;
      state.lastDetectedLang = effectiveSourceLang;
    }

    if (effectiveTargetLang === 'auto') {
      effectiveTargetLang = resolveAutoTargetLang(effectiveSourceLang);
      state.lastResolvedTargetLang = effectiveTargetLang;
    }

    const translateResult = await window.electronAPI.providers.translate(providerId, state.originalText, effectiveSourceLang, effectiveTargetLang);
    if (!translateResult.ok) throw new Error(translateResult.error);

    // Fire-and-forget: a history-write failure shouldn't block showing the
    // translation that's already in hand.
    void window.electronAPI.history
      .add({
        originalText: state.originalText,
        sourceLang: effectiveSourceLang,
        targetLang: effectiveTargetLang,
        providerId,
        translatedText: translateResult.value.translatedText,
      })
      .catch((error) => console.error('[popup] failed to record history entry', error));

    const backResult = await window.electronAPI.providers.translate(providerId, translateResult.value.translatedText, effectiveTargetLang, effectiveSourceLang, { lightweight: true });

    state.resultsByProvider.set(providerId, {
      status: 'ok',
      translatedText: translateResult.value.translatedText,
      backTranslatedText: backResult.ok ? backResult.value.translatedText : undefined,
      detectedLang: effectiveSourceLang,
      targetLang: effectiveTargetLang,
      dictionary: translateResult.value.dictionary,
      genderArticle: translateResult.value.genderArticle,
    });
  } catch (error) {
    state.resultsByProvider.set(providerId, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (providerId === state.activeProviderId) {
    renderTabs();
    renderActiveResult();
  }
}

// The first translation for a captured selection happens automatically;
// after that, re-translating (following an edit to Original or Translation)
// is explicit via the Translate button rather than firing on every blur —
// auto-retriggering mid-edit was surprising in practice.
async function handleTranslateClick(): Promise<void> {
  if (originalTextEl.value !== state.originalText) {
    await retranslateFromOriginal();
    return;
  }
  await retranslateFromEditedTranslation();
}

async function retranslateFromOriginal(): Promise<void> {
  state.originalText = originalTextEl.value;
  invalidateAllResults();
  renderTabs();
  renderActiveResult();
  await ensureActiveResultLoaded();
}

// Re-runs only the back-translation, using the user's edited translation —
// this is exactly how translators sanity-check a manual correction ("does
// my edit still round-trip to what I meant?").
async function retranslateFromEditedTranslation(): Promise<void> {
  const providerId = state.activeProviderId;
  if (!providerId) return;

  const result = state.resultsByProvider.get(providerId);
  if (!result || result.status !== 'ok') return;

  const editedTranslation = translationTextEl.value;
  if (editedTranslation === result.translatedText) return;

  const effectiveSourceLang = result.detectedLang ?? (state.sourceLang !== 'auto' ? state.sourceLang : undefined);

  // Dictionary/gender data describes the *original* translatedText — once
  // the user has overwritten it, that data no longer applies to what's
  // actually in the field, so drop it rather than show it as if it still did.
  state.resultsByProvider.set(providerId, {
    ...result,
    translatedText: editedTranslation,
    backTranslatedText: undefined,
    dictionary: undefined,
    genderArticle: undefined,
  });
  if (providerId === state.activeProviderId) {
    backTranslationTextEl.textContent = 'Translating…';
    backTranslationTextEl.classList.add('loading');
    renderDictionary(undefined);
    renderGenderBadge(undefined);
  }

  if (!effectiveSourceLang) return;

  try {
    const backResult = await window.electronAPI.providers.translate(providerId, editedTranslation, result.targetLang ?? state.targetLang, effectiveSourceLang, { lightweight: true });
    const current = state.resultsByProvider.get(providerId);
    if (!current) return;
    state.resultsByProvider.set(providerId, {
      ...current,
      backTranslatedText: backResult.ok ? backResult.value.translatedText : undefined,
    });
  } finally {
    if (providerId === state.activeProviderId) renderActiveResult();
  }
}

function invalidateAllResults(): void {
  for (const providerId of state.providerIds) {
    state.resultsByProvider.set(providerId, { status: 'idle' });
  }
}

async function handleLanguageChange(): Promise<void> {
  state.sourceLang = sourceLangSelect.value;
  state.targetLang = targetLangSelect.value;
  invalidateAllResults();
  renderTabs();
  renderActiveResult();
  await ensureActiveResultLoaded();
}

async function handleSwap(): Promise<void> {
  const effectiveSource = state.sourceLang === 'auto' ? state.lastDetectedLang : state.sourceLang;
  if (!effectiveSource) return;

  const newSource = state.targetLang === 'auto' ? state.lastResolvedTargetLang : state.targetLang;
  if (!newSource) return;
  const newTarget = effectiveSource;

  state.sourceLang = newSource;
  state.targetLang = newTarget;
  sourceLangSelect.value = newSource;
  targetLangSelect.value = newTarget;

  await handleLanguageChange();
}

async function init(): Promise<void> {
  populateLanguageSelects();

  const [settings, providerIds] = await Promise.all([window.electronAPI.settings.get(), window.electronAPI.providers.listIds()]);

  state.autoDetectFirst = settings.languages.autoDetectFirst;
  state.autoDetectSecond = settings.languages.autoDetectSecond;
  state.voiceByLang = settings.tts.voiceByLang;

  state.providerIds = PROVIDER_ORDER.filter((id) => providerIds.includes(id) && settings.services[id as keyof typeof settings.services]);
  state.activeProviderId = state.providerIds[0] ?? null;
  invalidateAllResults();

  sourceLangSelect.addEventListener('change', () => void handleLanguageChange());
  targetLangSelect.addEventListener('change', () => void handleLanguageChange());
  swapButton.addEventListener('click', () => void handleSwap());
  translateButton.addEventListener('click', () => void handleTranslateClick());
  speakOriginalButton.addEventListener('click', () => void handleSpeakClick(speakOriginalButton, getOriginalSpeakData));
  speakTranslationButton.addEventListener('click', () => void handleSpeakClick(speakTranslationButton, getTranslationSpeakData));
  originalTextEl.addEventListener('input', () => {
    speakOriginalButton.disabled = !originalTextEl.value.trim();
  });

  window.electronAPI.popup.onCapturedText((text) => {
    if (activeSpeakButton) void window.electronAPI.tts.stop();
    state.originalText = text;
    invalidateAllResults();
    renderTabs();
    renderActiveResult();
    void ensureActiveResultLoaded();
  });

  renderTabs();
  renderActiveResult();
}

void init();
