import { LANGUAGES } from '../shared/languages.js';

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
  yandex: document.getElementById('service-yandex') as HTMLInputElement,
  google: document.getElementById('service-google') as HTMLInputElement,
};
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const statusText = document.getElementById('status-text')!;
const voiceRowsEl = document.getElementById('voice-rows')!;

interface VoiceRow {
  lang: string;
  select: HTMLSelectElement;
  hint: HTMLElement;
}

let voiceRows: VoiceRow[] = [];
let installedVoices: TTSVoice[] = [];
let loadedVoiceByLang: Record<string, string> = {};

function populateLanguageSelects(): void {
  for (const lang of LANGUAGES) {
    langFirstSelect.appendChild(new Option(lang.label, lang.code));
    langSecondSelect.appendChild(new Option(lang.label, lang.code));
  }
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

function voiceOptionLabel(voice: TTSVoice): string {
  return voice.locale ? `${voice.name} (${voice.locale})` : voice.name;
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
    await window.electronAPI.tts.speak(phrase, row.lang, row.select.value || undefined);
  } catch (error) {
    console.error(`[settings] failed to test voice for ${row.lang}`, error);
  } finally {
    button.disabled = false;
    button.textContent = 'Test';
  }
}

async function loadSettings(): Promise<void> {
  const settings = await window.electronAPI.settings.get();
  hotkeyInput.value = settings.hotkeys.captureAndTranslate;
  langFirstSelect.value = settings.languages.autoDetectFirst;
  langSecondSelect.value = settings.languages.autoDetectSecond;
  serviceCheckboxes.deepl.checked = settings.services.deepl;
  serviceCheckboxes.yandex.checked = settings.services.yandex;
  serviceCheckboxes.google.checked = settings.services.google;
  loadedVoiceByLang = settings.tts.voiceByLang;
  applySavedVoiceSelections(loadedVoiceByLang);
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
      languages: { autoDetectFirst: langFirstSelect.value, autoDetectSecond: langSecondSelect.value },
      services: {
        deepl: serviceCheckboxes.deepl.checked,
        yandex: serviceCheckboxes.yandex.checked,
        google: serviceCheckboxes.google.checked,
      },
      tts: { voiceByLang },
    });
    statusText.textContent = 'Saved.';
  } catch (error) {
    statusText.textContent = `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function init(): Promise<void> {
  populateLanguageSelects();
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
}

void init();
