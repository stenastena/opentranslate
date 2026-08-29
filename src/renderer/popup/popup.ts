import { LANGUAGES } from '../shared/languages.js';

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
  error?: string;
}

interface State {
  originalText: string;
  sourceLang: string; // 'auto' or a language code
  targetLang: string;
  lastDetectedLang?: string;
  providerIds: string[];
  activeProviderId: string | null;
  resultsByProvider: Map<string, TabResult>;
}

const state: State = {
  originalText: '',
  sourceLang: 'auto',
  targetLang: 'en',
  providerIds: [],
  activeProviderId: null,
  resultsByProvider: new Map(),
};

const originalTextEl = document.getElementById('original-text') as HTMLTextAreaElement;
const translationTextEl = document.getElementById('translation-text') as HTMLTextAreaElement;
const backTranslationTextEl = document.getElementById('back-translation-text')!;
const tabsEl = document.getElementById('provider-tabs')!;
const sourceLangSelect = document.getElementById('source-lang') as HTMLSelectElement;
const targetLangSelect = document.getElementById('target-lang') as HTMLSelectElement;
const swapButton = document.getElementById('swap-langs') as HTMLButtonElement;
const translateButton = document.getElementById('translate-btn') as HTMLButtonElement;

function populateLanguageSelects(): void {
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

  const providerId = state.activeProviderId;
  const result = providerId ? state.resultsByProvider.get(providerId) : undefined;

  translationTextEl.classList.remove('loading', 'error');
  backTranslationTextEl.classList.remove('loading', 'error');

  if (!result || result.status === 'idle' || result.status === 'loading') {
    translationTextEl.value = 'Translating…';
    translationTextEl.readOnly = true;
    translationTextEl.classList.add('loading');
    backTranslationTextEl.textContent = '';
  } else if (result.status === 'error') {
    translationTextEl.value = result.error ?? 'Translation failed.';
    translationTextEl.readOnly = true;
    translationTextEl.classList.add('error');
    backTranslationTextEl.textContent = '';
  } else {
    translationTextEl.readOnly = false;
    if (document.activeElement !== translationTextEl) {
      translationTextEl.value = result.translatedText ?? '';
    }
    backTranslationTextEl.textContent = result.backTranslatedText ?? '(back-translation unavailable)';
  }
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

    const translateResult = await window.electronAPI.providers.translate(providerId, state.originalText, effectiveSourceLang, effectiveTargetLang);
    if (!translateResult.ok) throw new Error(translateResult.error);

    const backResult = await window.electronAPI.providers.translate(providerId, translateResult.value.translatedText, effectiveTargetLang, effectiveSourceLang);

    state.resultsByProvider.set(providerId, {
      status: 'ok',
      translatedText: translateResult.value.translatedText,
      backTranslatedText: backResult.ok ? backResult.value.translatedText : undefined,
      detectedLang: effectiveSourceLang,
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

  state.resultsByProvider.set(providerId, { ...result, translatedText: editedTranslation, backTranslatedText: undefined });
  if (providerId === state.activeProviderId) {
    backTranslationTextEl.textContent = 'Translating…';
    backTranslationTextEl.classList.add('loading');
  }

  if (!effectiveSourceLang) return;

  try {
    const backResult = await window.electronAPI.providers.translate(providerId, editedTranslation, state.targetLang, effectiveSourceLang);
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

  const newSource = state.targetLang;
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

  state.targetLang = settings.languages.autoDetectSecond;
  targetLangSelect.value = state.targetLang;

  state.providerIds = PROVIDER_ORDER.filter((id) => providerIds.includes(id) && settings.services[id as keyof typeof settings.services]);
  state.activeProviderId = state.providerIds[0] ?? null;
  invalidateAllResults();

  sourceLangSelect.addEventListener('change', () => void handleLanguageChange());
  targetLangSelect.addEventListener('change', () => void handleLanguageChange());
  swapButton.addEventListener('click', () => void handleSwap());
  translateButton.addEventListener('click', () => void handleTranslateClick());

  window.electronAPI.popup.onCapturedText((text) => {
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
