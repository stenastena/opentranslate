import { FONT_FAMILIES, fontStackFor } from '../shared/fonts.js';
import { LANGUAGES } from '../shared/languages.js';
import { applyTheme } from '../shared/theme.js';

// Short, fixed phrases so "Test" never needs a real translation call —
// just something to actually exercise the selected voice with.
const TEST_PHRASES: Record<string, string> = {
  en: 'This is a test of the selected voice.',
  de: 'Dies ist ein Test der ausgewählten Stimme.',
  ru: 'Это проверка выбранного голоса.',
  fr: 'Ceci est un test de la voix sélectionnée.',
  es: 'Esta es una prueba de la voz seleccionada.',
  it: 'Questo è un test della voce selezionata.',
  pt: 'Este é um teste da voz selecionada.',
  pl: 'To jest test wybranego głosu.',
  uk: 'Це перевірка вибраного голосу.',
  nl: 'Dit is een test van de geselecteerde stem.',
  zh: '这是所选语音的测试。',
  ja: 'これは選択した音声のテストです。',
  ko: '선택한 음성의 테스트입니다.',
  tr: 'Bu, seçilen sesin bir testidir.',
  ar: 'هذا اختبار للصوت المحدد.',
};

const tabsEl = document.getElementById('settings-tabs')!;
const hotkeyInput = document.getElementById('hotkey-input') as HTMLInputElement;
const langFirstSelect = document.getElementById('lang-first') as HTMLSelectElement;
const langSecondSelect = document.getElementById('lang-second') as HTMLSelectElement;
const serviceCheckboxes = {
  deepl: document.getElementById('service-deepl') as HTMLInputElement,
  google: document.getElementById('service-google') as HTMLInputElement,
  bing: document.getElementById('service-bing') as HTMLInputElement,
  mymemory: document.getElementById('service-mymemory') as HTMLInputElement,
};
const defaultProviderSelect = document.getElementById('default-provider-select') as HTMLSelectElement;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const statusText = document.getElementById('status-text')!;
const voiceRowsEl = document.getElementById('voice-rows')!;
const naturalVoiceLink = document.getElementById('natural-voice-link') as HTMLButtonElement;
const refreshVoicesButton = document.getElementById('refresh-voices-button') as HTMLButtonElement;
const ttsProviderSelect = document.getElementById('tts-provider-select') as HTMLSelectElement;
const ttsProviderTestButton = document.getElementById('tts-provider-test-button') as HTMLButtonElement;
const fontSizeRange = document.getElementById('font-size-range') as HTMLInputElement;
const fontSizeValue = document.getElementById('font-size-value')!;
const fontFamilySelect = document.getElementById('font-family-select') as HTMLSelectElement;
const fontPreview = document.getElementById('font-preview')!;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
const customColorsRow = document.getElementById('custom-colors-row') as HTMLElement;
const customColorInputs = {
  background: document.getElementById('custom-color-background') as HTMLInputElement,
  text: document.getElementById('custom-color-text') as HTMLInputElement,
  accent: document.getElementById('custom-color-accent') as HTMLInputElement,
};
const themePreview = document.getElementById('theme-preview') as HTMLElement;
const copyActionSelect = document.getElementById('copy-action-select') as HTMLSelectElement;
const startWithWindowsCheckbox = document.getElementById('start-with-windows-checkbox') as HTMLInputElement;

interface VoiceRow {
  lang: string;
  select: HTMLSelectElement;
  hint: HTMLElement;
}

let voiceRows: VoiceRow[] = [];
let installedVoices: TTSVoice[] = [];
let loadedVoiceByLang: Record<string, string> = {};
// The popup's own remembered source/target language pair (not editable
// here — set from the popup itself) — round-tripped unchanged on save so
// saving anything else in this window doesn't reset it back to Auto/Auto.
let loadedLastSourceLang = 'auto';
let loadedLastTargetLang = 'auto';

function populateLanguageSelects(): void {
  for (const lang of LANGUAGES) {
    langFirstSelect.appendChild(new Option(lang.label, lang.code));
    langSecondSelect.appendChild(new Option(lang.label, lang.code));
  }
}

function populateFontFamilySelect(): void {
  for (const font of FONT_FAMILIES) {
    fontFamilySelect.appendChild(new Option(font.label, font.id));
  }
}

// Live-updates as the user drags the slider / changes the dropdown —
// before Save, so a choice can be judged without leaving Settings (there's
// no separate Test button here the way Voice has, since there's nothing
// to actually fetch/play; this is instant).
function updateFontPreview(): void {
  const size = Number(fontSizeRange.value);
  fontSizeValue.textContent = `${size}px`;
  fontPreview.style.fontSize = `${size}px`;
  fontPreview.style.fontFamily = fontStackFor(fontFamilySelect.value);
}

function currentCustomColors(): CustomThemeColors {
  return { background: customColorInputs.background.value, text: customColorInputs.text.value, accent: customColorInputs.accent.value };
}

// Live-updates the mockup preview as the theme/colors change, and shows
// the three color pickers only in Custom mode — a Light/Dark pick has no
// per-color controls to show.
function updateThemePreview(): void {
  const theme = themeSelect.value as ThemeMode;
  customColorsRow.hidden = theme !== 'custom';
  applyTheme(themePreview, theme, currentCustomColors());
}

function setupTabs(): void {
  tabsEl.querySelectorAll<HTMLButtonElement>('.tab').forEach((tabButton) => {
    tabButton.addEventListener('click', () => {
      tabsEl.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((el) => el.classList.remove('active'));
      tabButton.classList.add('active');
      document.getElementById(`panel-${tabButton.dataset.panel}`)?.classList.add('active');
    });
  });
}

// Best-effort only: SAPI has no reliable "voice quality" field, so this is
// just a substring match against markers vendors commonly put in a
// higher-quality voice's own name/description (e.g. NaturalVoiceSAPIAdapter
// voices are literally named "... (Natural) - ..."). A voice that doesn't
// match isn't necessarily low quality — it's just not flagged either way,
// which is the point: no guessing at a classification this can't verify.
const QUALITY_HINT_PATTERN = /natural|neural|online/i;

function isLikelyHighQualityVoice(voice: TTSVoice): boolean {
  return QUALITY_HINT_PATTERN.test(voice.name) || QUALITY_HINT_PATTERN.test(voice.description);
}

function voiceOptionLabel(voice: TTSVoice): string {
  const base = voice.locale ? `${voice.name} (${voice.locale})` : voice.name;
  return isLikelyHighQualityVoice(voice) ? `${base} ★ Natural` : base;
}

// Every row gets: "Automatic" (today's locale-matching fallback, the
// default), then voices whose locale matches this row's language (if any),
// then every installed voice regardless of locale — the explicit manual
// override for when the OS mislabels a voice's locale, or the user just
// wants a deliberate mismatch.
function buildVoiceRows(): void {
  voiceRowsEl.innerHTML = '';
  voiceRows = [];
  for (const lang of LANGUAGES) {
    const row = document.createElement('div');
    row.className = 'voice-row';

    const label = document.createElement('label');
    label.textContent = lang.label;
    row.appendChild(label);

    const select = document.createElement('select');
    row.appendChild(select);

    const testButton = document.createElement('button');
    testButton.type = 'button';
    testButton.className = 'test-voice-btn';
    testButton.textContent = 'Test';
    row.appendChild(testButton);

    const hint = document.createElement('span');
    hint.className = 'voice-empty-hint';
    hint.textContent = 'No voice installed for this language.';
    hint.hidden = true;
    row.appendChild(hint);

    voiceRowsEl.appendChild(row);
    const voiceRow: VoiceRow = { lang: lang.code, select, hint };
    voiceRows.push(voiceRow);

    testButton.addEventListener('click', () => void handleTestVoice(voiceRow, testButton));
  }
}

function populateVoiceOptions(): void {
  for (const row of voiceRows) {
    const previousValue = row.select.value;
    const matching = installedVoices.filter((voice) => voice.langCode === row.lang);
    row.hint.hidden = matching.length > 0;

    row.select.innerHTML = '';
    row.select.appendChild(new Option('Automatic (best match)', ''));

    if (matching.length > 0) {
      const group = document.createElement('optgroup');
      group.label = 'Matching voices';
      for (const voice of matching) group.appendChild(new Option(voiceOptionLabel(voice), voice.name));
      row.select.appendChild(group);
    }

    if (installedVoices.length > 0) {
      const allGroup = document.createElement('optgroup');
      allGroup.label = 'All installed voices';
      for (const voice of installedVoices) allGroup.appendChild(new Option(voiceOptionLabel(voice), voice.name));
      row.select.appendChild(allGroup);
    }

    row.select.value = previousValue;
  }
}

async function loadVoices(): Promise<void> {
  try {
    installedVoices = await window.electronAPI.tts.listVoices();
  } catch (error) {
    console.error('[settings] failed to list installed voices', error);
    installedVoices = [];
  }
  populateVoiceOptions();
}

// Re-queries installed voices without needing to close/reopen Settings or
// restart the app — the point being right after installing something like
// NaturalVoiceSAPIAdapter, its new voices should show up immediately.
// populateVoiceOptions() preserves whatever's currently selected in each
// row across the rebuild, so this doesn't discard an unsaved choice.
async function handleRefreshVoices(): Promise<void> {
  refreshVoicesButton.disabled = true;
  refreshVoicesButton.textContent = 'Refreshing…';
  try {
    await loadVoices();
  } finally {
    refreshVoicesButton.disabled = false;
    refreshVoicesButton.textContent = 'Refresh voice list';
  }
}

function applySavedVoiceSelections(voiceByLang: Record<string, string>): void {
  for (const row of voiceRows) {
    row.select.value = voiceByLang[row.lang] ?? '';
  }
}

async function handleTestVoice(row: VoiceRow, button: HTMLButtonElement): Promise<void> {
  const phrase = TEST_PHRASES[row.lang] ?? TEST_PHRASES.en;
  button.disabled = true;
  button.textContent = 'Testing…';
  try {
    // Forced to 'system' regardless of the Voice source setting above:
    // this button is testing one specific installed SAPI voice, which only
    // systemProvider.ts understands — a cloud provider would just ignore
    // voiceName and speak with its own fixed per-language voice instead.
    await window.electronAPI.tts.speak(phrase, row.lang, row.select.value || undefined, 'system');
  } catch (error) {
    console.error(`[settings] failed to test voice for ${row.lang}`, error);
  } finally {
    button.disabled = false;
    button.textContent = 'Test';
  }
}

// A populated result means the selected provider only fetched audio bytes
// (issue #107's cloud providers) rather than playing them itself — this
// window has no persistent <audio> element or stop button like the popup's
// (see popup.ts's playAudioAndWait), just a one-shot "play it and wait".
function playAudioAndWait(base64: string, mimeType: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:${mimeType};base64,${base64}`);
    const finish = () => resolve();
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', finish);
    audio.play().catch(finish);
  });
}

// Unlike the per-language rows' Test button, this exercises whatever's
// currently selected in the dropdown — including a choice not yet saved —
// via providerOverride, so trying a source doesn't require Save first.
async function handleTestTtsProvider(): Promise<void> {
  ttsProviderTestButton.disabled = true;
  ttsProviderTestButton.textContent = 'Testing…';
  try {
    const result = await window.electronAPI.tts.speak(TEST_PHRASES.en, 'en', undefined, ttsProviderSelect.value as TTSProviderId);
    if (result) {
      await playAudioAndWait(result.audioBase64, result.mimeType);
    }
  } catch (error) {
    console.error('[settings] failed to test TTS provider', error);
  } finally {
    ttsProviderTestButton.disabled = false;
    ttsProviderTestButton.textContent = 'Test';
  }
}

async function loadSettings(): Promise<void> {
  const settings = await window.electronAPI.settings.get();
  hotkeyInput.value = settings.hotkeys.captureAndTranslate;
  langFirstSelect.value = settings.languages.autoDetectFirst;
  langSecondSelect.value = settings.languages.autoDetectSecond;
  serviceCheckboxes.deepl.checked = settings.services.deepl;
  serviceCheckboxes.google.checked = settings.services.google;
  serviceCheckboxes.bing.checked = settings.services.bing;
  serviceCheckboxes.mymemory.checked = settings.services.mymemory;
  defaultProviderSelect.value = settings.services.defaultProvider;
  ttsProviderSelect.value = settings.tts.provider;
  loadedVoiceByLang = settings.tts.voiceByLang;
  applySavedVoiceSelections(loadedVoiceByLang);
  fontSizeRange.value = String(settings.appearance.fontSize);
  fontFamilySelect.value = settings.appearance.fontFamily;
  updateFontPreview();
  themeSelect.value = settings.appearance.theme;
  customColorInputs.background.value = settings.appearance.customColors.background;
  customColorInputs.text.value = settings.appearance.customColors.text;
  customColorInputs.accent.value = settings.appearance.customColors.accent;
  updateThemePreview();
  copyActionSelect.value = settings.advanced.copyAction;
  startWithWindowsCheckbox.checked = settings.advanced.startWithWindows;
  loadedLastSourceLang = settings.languages.lastSourceLang;
  loadedLastTargetLang = settings.languages.lastTargetLang;
}

async function handleSave(): Promise<void> {
  statusText.textContent = '';
  try {
    const voiceByLang: Record<string, string> = {};
    for (const row of voiceRows) {
      if (row.select.value) voiceByLang[row.lang] = row.select.value;
    }
    await window.electronAPI.settings.update({
      hotkeys: { captureAndTranslate: hotkeyInput.value.trim() },
      languages: {
        autoDetectFirst: langFirstSelect.value,
        autoDetectSecond: langSecondSelect.value,
        lastSourceLang: loadedLastSourceLang,
        lastTargetLang: loadedLastTargetLang,
      },
      services: {
        deepl: serviceCheckboxes.deepl.checked,
        google: serviceCheckboxes.google.checked,
        bing: serviceCheckboxes.bing.checked,
        mymemory: serviceCheckboxes.mymemory.checked,
        defaultProvider: defaultProviderSelect.value as '' | 'deepl' | 'google' | 'bing' | 'mymemory',
      },
      tts: { provider: ttsProviderSelect.value as TTSProviderId, voiceByLang },
      appearance: {
        fontSize: Number(fontSizeRange.value),
        fontFamily: fontFamilySelect.value,
        theme: themeSelect.value as ThemeMode,
        customColors: currentCustomColors(),
      },
      advanced: { copyAction: copyActionSelect.value as CopyAction, startWithWindows: startWithWindowsCheckbox.checked },
    });
    statusText.textContent = 'Saved.';
  } catch (error) {
    statusText.textContent = `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function init(): Promise<void> {
  populateLanguageSelects();
  populateFontFamilySelect();
  buildVoiceRows();
  setupTabs();
  // Voices are re-read every time Settings opens (this module's whole
  // lifetime is one window instance) rather than cached at app startup, so
  // a voice installed after launch shows up next time Settings is opened.
  // loadSettings() and loadVoices() run concurrently and can finish in
  // either order; whichever finishes second rebuilds each <select>'s
  // options (loadVoices) or just sets .value directly (loadSettings), so
  // re-applying the saved choice once more after both have settled is what
  // actually makes the result independent of which one lands first.
  await Promise.all([loadSettings(), loadVoices()]);
  applySavedVoiceSelections(loadedVoiceByLang);
  saveButton.addEventListener('click', () => void handleSave());
  refreshVoicesButton.addEventListener('click', () => void handleRefreshVoices());
  ttsProviderTestButton.addEventListener('click', () => void handleTestTtsProvider());
  fontSizeRange.addEventListener('input', updateFontPreview);
  fontFamilySelect.addEventListener('change', updateFontPreview);
  themeSelect.addEventListener('change', updateThemePreview);
  customColorInputs.background.addEventListener('input', updateThemePreview);
  customColorInputs.text.addEventListener('input', updateThemePreview);
  customColorInputs.accent.addEventListener('input', updateThemePreview);
  naturalVoiceLink.addEventListener('click', () => {
    window.electronAPI.tts.openNaturalVoiceAdapterPage().catch((error) => console.error('[settings] failed to open NaturalVoiceSAPIAdapter page', error));
  });
}

void init();
