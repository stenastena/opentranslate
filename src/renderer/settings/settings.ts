import { LANGUAGES } from '../shared/languages.js';

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

async function loadSettings(): Promise<void> {
  const settings = await window.electronAPI.settings.get();
  hotkeyInput.value = settings.hotkeys.captureAndTranslate;
  langFirstSelect.value = settings.languages.autoDetectFirst;
  langSecondSelect.value = settings.languages.autoDetectSecond;
  serviceCheckboxes.deepl.checked = settings.services.deepl;
  serviceCheckboxes.yandex.checked = settings.services.yandex;
  serviceCheckboxes.google.checked = settings.services.google;
}

async function handleSave(): Promise<void> {
  statusText.textContent = '';
  try {
    await window.electronAPI.settings.update({
      hotkeys: { captureAndTranslate: hotkeyInput.value.trim() },
      languages: { autoDetectFirst: langFirstSelect.value, autoDetectSecond: langSecondSelect.value },
      services: {
        deepl: serviceCheckboxes.deepl.checked,
        yandex: serviceCheckboxes.yandex.checked,
        google: serviceCheckboxes.google.checked,
      },
    });
    statusText.textContent = 'Saved.';
  } catch (error) {
    statusText.textContent = `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function init(): Promise<void> {
  populateLanguageSelects();
  setupTabs();
  await loadSettings();
  saveButton.addEventListener('click', () => void handleSave());
}

void init();
