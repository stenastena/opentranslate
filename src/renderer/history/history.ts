import { languageLabel } from '../shared/languages.js';

const PROVIDER_LABELS: Record<string, string> = {
  deepl: 'DeepL',
  yandex: 'Yandex',
  google: 'Google',
};

const listEl = document.getElementById('history-list')!;
const emptyStateEl = document.getElementById('empty-state')!;
const clearAllButton = document.getElementById('clear-all-button') as HTMLButtonElement;

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function renderEntry(entry: HistoryEntry): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'history-entry';
  li.dataset.id = entry.id;

  const meta = document.createElement('div');
  meta.className = 'history-entry-meta';

  const provider = document.createElement('span');
  provider.className = 'history-entry-provider';
  provider.textContent = PROVIDER_LABELS[entry.providerId] ?? entry.providerId;
  meta.appendChild(provider);

  const details = document.createElement('span');
  details.className = 'history-entry-details';
  details.textContent = `${languageLabel(entry.sourceLang)} → ${languageLabel(entry.targetLang)} · ${formatTimestamp(entry.timestamp)}`;
  meta.appendChild(details);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'history-entry-delete';
  deleteButton.title = 'Delete this entry';
  deleteButton.textContent = '✕';
  deleteButton.addEventListener('click', () => void handleDelete(entry.id));
  meta.appendChild(deleteButton);

  li.appendChild(meta);

  const original = document.createElement('div');
  original.className = 'history-entry-original';
  original.textContent = entry.originalText;
  li.appendChild(original);

  const arrow = document.createElement('div');
  arrow.className = 'history-entry-arrow';
  arrow.textContent = '↓';
  li.appendChild(arrow);

  const translation = document.createElement('div');
  translation.className = 'history-entry-translation';
  translation.textContent = entry.translatedText;
  li.appendChild(translation);

  return li;
}

async function loadHistory(): Promise<void> {
  const entries = await window.electronAPI.history.list();

  listEl.innerHTML = '';
  emptyStateEl.hidden = entries.length > 0;
  clearAllButton.hidden = entries.length === 0;

  for (const entry of entries) {
    listEl.appendChild(renderEntry(entry));
  }
}

async function handleDelete(id: string): Promise<void> {
  await window.electronAPI.history.remove(id);
  await loadHistory();
}

async function handleClearAll(): Promise<void> {
  await window.electronAPI.history.clear();
  await loadHistory();
}

clearAllButton.addEventListener('click', () => void handleClearAll());

void loadHistory();
