import { fontStackFor } from '../shared/fonts.js';
import { LANGUAGES, languageLabel } from '../shared/languages.js';
import { applyTheme } from '../shared/theme.js';

const PROVIDER_LABELS: Record<string, string> = {
  deepl: 'DeepL',
  google: 'Google',
  bing: 'Bing',
  mymemory: 'MyMemory',
};
// Issue #132: Yandex removed — its unofficial endpoint has been
// permanently CAPTCHA-blocked since #70, confirmed still blocked with no
// working free route as of #75. providers/yandex.ts is left in the
// codebase (harmless, easy to revive) but no longer registered — see
// providers/index.ts — so it's absent here too.
const PROVIDER_ORDER = ['deepl', 'google', 'bing', 'mymemory'];

interface TabResult {
  status: 'idle' | 'loading' | 'ok' | 'error';
  translatedText?: string;
  backTranslatedText?: string;
  detectedLang?: string;
  targetLang?: string;
  // The language back-translation was actually done into for this result —
  // defaults to detectedLang, but can be overridden independently (see
  // handleBackLangOverrideChange).
  backLang?: string;
  error?: string;
  dictionary?: GoogleDictionary;
  genderArticle?: string;
  sourceGenderArticle?: string;
  // Google's dictionary/gender data (issue #76) is opt-in via the "Show
  // Dictionary" button (issue #99) rather than fetched automatically with
  // every lookup — this tracks whether that's been requested yet for this
  // result. Absent/undefined means 'idle' (not yet requested); irrelevant
  // for providers other than Google, which never populate dictionary/
  // gender regardless.
  dictionaryStatus?: 'idle' | 'loading' | 'loaded';
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
  // Issue #27: what to put on the clipboard once a translation completes
  // for the active tab. 'none' (default) is a no-op — see textCapture.ts,
  // which already restores the clipboard's pre-capture contents on its own.
  copyAction: CopyAction;
  // A manual correction of Auto-Detect's source-language pick for the
  // *current* captured text — set via the detected-language select.
  // Deliberately scoped to this capture, not a persistent setting: cleared
  // on a new capture or an explicit manual language-selector change, so
  // Auto-Detect still detects fresh next time rather than getting "stuck".
  sourceLangOverride?: string;
  // Same idea as sourceLangOverride, for the *target* language — only
  // meaningful when the top Target dropdown is on "Auto" (a manually
  // picked target isn't "resolved", so there's nothing to correct). Also
  // cleared on a new capture or a manual language-selector change.
  targetLangOverride?: string;
  // Per-provider override of which language back-translation targets,
  // independent of the source language — a user may want to sanity-check
  // the translation in a language other than the detected/chosen source.
  backLangOverrideByProvider: Map<string, string>;
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
  copyAction: 'none',
  backLangOverrideByProvider: new Map(),
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
const detectedLangSelect = document.getElementById('detected-lang-select') as HTMLSelectElement;
const targetLangOverrideSelect = document.getElementById('target-lang-select') as HTMLSelectElement;
const backLangSelect = document.getElementById('back-lang-select') as HTMLSelectElement;
const swapButton = document.getElementById('swap-langs') as HTMLButtonElement;
const translateButton = document.getElementById('translate-btn') as HTMLButtonElement;
const forceRefreshButton = document.getElementById('force-refresh-btn') as HTMLButtonElement;
const dictionarySection = document.getElementById('dictionary-section') as HTMLDetailsElement;
const dictionaryContentEl = document.getElementById('dictionary-content')!;
const loadDictionaryButton = document.getElementById('load-dictionary-btn') as HTMLButtonElement;
const translationGenderEl = document.getElementById('translation-gender')!;
const originalGenderEl = document.getElementById('original-gender')!;
const speakOriginalButton = document.getElementById('speak-original-btn') as HTMLButtonElement;
const speakTranslationButton = document.getElementById('speak-translation-btn') as HTMLButtonElement;
const copyOriginalButton = document.getElementById('copy-original-btn') as HTMLButtonElement;
const copyTranslationButton = document.getElementById('copy-translation-btn') as HTMLButtonElement;
const copyBackButton = document.getElementById('copy-back-btn') as HTMLButtonElement;

// Only one utterance should ever play at a time; this tracks which of the
// two speak buttons (if any) is the one currently driving playback, so a
// click on it stops playback instead of restarting it, and so its icon can
// be reset back once playback ends (naturally or via stop()).
let activeSpeakButton: HTMLButtonElement | null = null;

// Set only while a cloud-provider (issue #107) audio clip is actually
// playing — calling it is how a Stop click (a *second*, concurrent
// handleSpeakClick call for the same button) unblocks the *first* call's
// still-pending `await playAudioAndWait(...)`, mirroring how the pre-#107
// system-voice path unblocks its pending speak() by killing the PowerShell
// process that call is awaiting. Pausing the <audio> element alone
// wouldn't do this: pause() doesn't fire 'ended', so the awaited promise
// would otherwise just hang.
let activeAudioStop: (() => void) | null = null;

// Plays one cloud-provider audio clip and resolves once it's done —
// naturally (ended), on error, or via activeAudioStop(). data: URIs need
// popup/index.html's CSP to allow media-src data: (added for this).
function playAudioAndWait(base64: string, mimeType: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:${mimeType};base64,${base64}`);
    const finish = () => {
      if (activeAudioStop === stopThis) activeAudioStop = null;
      resolve();
    };
    const stopThis = () => {
      audio.pause();
      finish();
    };
    activeAudioStop = stopThis;
    audio.addEventListener('ended', finish);
    audio.addEventListener('error', finish);
    audio.play().catch(finish);
  });
}

const BASE_LANG_CODES = new Set(LANGUAGES.map((lang) => lang.code));

function populateLanguageSelects(): void {
  targetLangSelect.appendChild(new Option('Auto', 'auto'));
  for (const lang of LANGUAGES) {
    sourceLangSelect.appendChild(new Option(lang.label, lang.code));
    targetLangSelect.appendChild(new Option(lang.label, lang.code));
    detectedLangSelect.appendChild(new Option(lang.label, lang.code));
    targetLangOverrideSelect.appendChild(new Option(lang.label, lang.code));
    backLangSelect.appendChild(new Option(lang.label, lang.code));
  }
  sourceLangSelect.value = state.sourceLang;
  targetLangSelect.value = state.targetLang;
}

// Keeps `select` able to display/select `code` even when it's outside the
// app's own LANGUAGES list (e.g. a provider detecting "ro" for a word this
// app doesn't otherwise offer as a language choice) — appends a fallback
// option labelled with the bare code, and removes whichever fallback
// option this select previously had (if any and if different), so
// switching between several out-of-list detections across captures/tabs
// doesn't leave a pile of stale one-off options behind.
function syncSelectWithFallback(select: HTMLSelectElement, code: string, previousExtra: string | undefined): string | undefined {
  if (previousExtra !== undefined && previousExtra !== code && !BASE_LANG_CODES.has(previousExtra)) {
    select.querySelector(`option[value="${CSS.escape(previousExtra)}"]`)?.remove();
  }
  let nextExtra = previousExtra;
  if (BASE_LANG_CODES.has(code)) {
    nextExtra = undefined;
  } else {
    if (!Array.from(select.options).some((option) => option.value === code)) {
      select.appendChild(new Option(languageLabel(code), code));
    }
    nextExtra = code;
  }
  select.value = code;
  return nextExtra;
}

let detectedSelectExtra: string | undefined;
let targetSelectExtra: string | undefined;
let backSelectExtra: string | undefined;

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
  copyOriginalButton.disabled = !originalTextEl.value.trim();

  const providerId = state.activeProviderId;
  const result = providerId ? state.resultsByProvider.get(providerId) : undefined;
  // Issue #130: only meaningful once there's something to actually
  // re-fetch, and disabled mid-flight so a slow click can't fire twice.
  forceRefreshButton.disabled = !providerId || !state.originalText || result?.status === 'loading';

  translationTextEl.classList.remove('loading', 'error');
  backTranslationTextEl.classList.remove('loading', 'error');

  if (!result || result.status === 'idle' || result.status === 'loading') {
    // Idle with no text means nothing will ever load (ensureActiveResultLoaded
    // bails out early on empty originalText) — e.g. the main window opened via
    // the tray or a hotkey press with nothing selected. "Translating…" would
    // be actively misleading there, so only show it once a load is genuinely
    // in flight.
    const isLoading = result?.status === 'loading';
    translationTextEl.value = isLoading ? 'Translating…' : '';
    translationTextEl.readOnly = true;
    translationTextEl.classList.toggle('loading', isLoading);
    backTranslationTextEl.textContent = '';
    renderDictionaryArea(undefined);
    renderDetectedLangSelect(undefined);
    renderTargetLangSelect(undefined);
    renderBackLangSelect(undefined);
  } else if (result.status === 'error') {
    translationTextEl.value = result.error ?? 'Translation failed.';
    translationTextEl.readOnly = true;
    translationTextEl.classList.add('error');
    backTranslationTextEl.textContent = '';
    renderDictionaryArea(undefined);
    renderDetectedLangSelect(undefined);
    renderTargetLangSelect(undefined);
    renderBackLangSelect(undefined);
  } else {
    translationTextEl.readOnly = false;
    if (document.activeElement !== translationTextEl) {
      translationTextEl.value = result.translatedText ?? '';
    }
    backTranslationTextEl.textContent = result.backTranslatedText ?? '(back-translation unavailable)';
    renderDictionaryArea(result);
    renderDetectedLangSelect(result.detectedLang);
    renderTargetLangSelect(result.targetLang);
    renderBackLangSelect(result.backLang);
  }

  speakTranslationButton.disabled = !result || result.status !== 'ok' || !translationTextEl.value.trim();
  copyTranslationButton.disabled = !result || result.status !== 'ok' || !translationTextEl.value.trim();
  copyBackButton.disabled = !result || result.status !== 'ok' || !result.backTranslatedText;
}

// Dictionary/gender data (Google: issue #76, Bing: issue #119) is only
// ever fetched when the user explicitly clicks "Show Dictionary" (issue
// #99) rather than with every lookup, to cut the extra per-lookup request
// cost — this renders whichever of {button, loading, content} matches
// dictionaryStatus. Only Google and Bing ever return this data, so the
// button stays hidden for every other provider tab regardless of status.
const DICTIONARY_CAPABLE_PROVIDERS = new Set(['google', 'bing']);

function renderDictionaryArea(result: TabResult | undefined): void {
  const supportsDictionary = state.activeProviderId !== null && DICTIONARY_CAPABLE_PROVIDERS.has(state.activeProviderId);
  const status = result?.dictionaryStatus ?? 'idle';

  loadDictionaryButton.hidden = !(supportsDictionary && result && status !== 'loaded');
  loadDictionaryButton.disabled = status === 'loading';
  loadDictionaryButton.textContent = status === 'loading' ? 'Loading…' : 'Show Dictionary';

  if (status === 'loaded') {
    renderDictionary(result?.dictionary, true);
    renderGenderBadge(translationGenderEl, result?.genderArticle);
    renderGenderBadge(originalGenderEl, result?.sourceGenderArticle);
  } else {
    renderDictionary(undefined, false);
    renderGenderBadge(translationGenderEl, undefined);
    renderGenderBadge(originalGenderEl, undefined);
  }
  requestPopupGrowToFitContent();
}

// Issue #134: called after the dictionary area's visibility/content
// changes — schedules the measurement for the next frame so
// document.body.scrollHeight reflects the DOM updates just made above
// rather than a stale pre-update layout. Safe to call unconditionally:
// growPopupHeightToFit/computeGrownContentHeight (popupWindow.ts) already
// no-op when nothing actually grew, e.g. the dictionary area collapsing
// back to just the button, or reporting "no data" for a short word.
function requestPopupGrowToFitContent(): void {
  requestAnimationFrame(() => {
    void window.electronAPI.popup.growToFitContent(document.body.scrollHeight);
  });
}

// Shows the definite article for a specific word (source or translated)
// right next to its section's heading — the Dictionary section's own
// entries can list a different word/article than what the translator
// actually produced (Google's sentence translator and its dictionary
// lookup are separate subsystems that don't always agree on the top
// candidate), so this is specifically the article for that exact word,
// not necessarily whichever candidate the Dictionary section shows.
function renderGenderBadge(el: HTMLElement, genderArticle: string | undefined): void {
  el.hidden = !genderArticle;
  el.textContent = genderArticle ?? '';
}

// Auto-Detect's source language is a fully open call to the provider's own
// language identifier (any language it recognizes), completely independent
// of the Languages-settings first/second pair — that pair only picks the
// *target* once a source is known (see resolveAutoTargetLang). Without
// this, a detection landing outside the configured pair (e.g. a real word
// in a third language) was invisible, and looked like the app was
// ignoring the configured languages entirely. Editable (not just a label)
// so a wrong pick can be corrected without leaving Auto-Detect mode — see
// handleSourceOverrideChange. Only shown when the source selector is
// actually on Auto-Detect — a manually-picked source isn't "detected", so
// offering to "correct" it would be misleading.
function renderDetectedLangSelect(detectedLang: string | undefined): void {
  const show = state.sourceLang === 'auto' && Boolean(detectedLang);
  detectedLangSelect.hidden = !show;
  if (show && detectedLang) {
    detectedSelectExtra = syncSelectWithFallback(detectedLangSelect, detectedLang, detectedSelectExtra);
  }
}

// Same idea for the *resolved* target language (see resolveAutoTargetLang)
// — only shown when the top Target dropdown is on "Auto", for the same
// reason: a manually-picked target isn't "resolved", so there's nothing to
// offer correcting. Editable via handleTargetOverrideChange.
function renderTargetLangSelect(targetLang: string | undefined): void {
  const show = state.targetLang === 'auto' && Boolean(targetLang);
  targetLangOverrideSelect.hidden = !show;
  if (show && targetLang) {
    targetSelectExtra = syncSelectWithFallback(targetLangOverrideSelect, targetLang, targetSelectExtra);
  }
}

// Which language back-translation targets — independent of the source
// language, since a user may want to sanity-check against a language other
// than the one actually used/detected as the source. Shown whenever a
// result has resolved, regardless of Auto-Detect vs. manual source mode.
function renderBackLangSelect(backLang: string | undefined): void {
  const show = Boolean(backLang);
  backLangSelect.hidden = !show;
  if (show && backLang) {
    backSelectExtra = syncSelectWithFallback(backLangSelect, backLang, backSelectExtra);
  }
}

interface SpeakData {
  text: string;
  lang?: string;
  voiceName?: string;
  providerOverride?: TTSProviderId;
}

function voiceOverrideFor(lang: string | undefined): string | undefined {
  return lang ? state.voiceByLang[lang] : undefined;
}

// Issue #112: whichever tab is active, Google and Bing get spoken with
// that same provider's own cloud TTS voice, everywhere — both Original and
// Translation — regardless of what's picked in Settings. DeepL/MyMemory
// have no TTS of their own, so those tabs (and no active tab at all) leave
// both buttons on the Settings-selected provider, same as before this issue.
const NATIVE_TTS_PROVIDER_BY_TRANSLATION_PROVIDER: Partial<Record<string, TTSProviderId>> = {
  google: 'google-cloud',
  bing: 'bing-cloud',
};

function activeTabNativeTtsProvider(): TTSProviderId | undefined {
  return state.activeProviderId ? NATIVE_TTS_PROVIDER_BY_TRANSLATION_PROVIDER[state.activeProviderId] : undefined;
}

function getOriginalSpeakData(): SpeakData | null {
  const text = originalTextEl.value.trim();
  if (!text) return null;
  const lang = state.sourceLang !== 'auto' ? state.sourceLang : state.lastDetectedLang;
  return { text, lang, voiceName: voiceOverrideFor(lang), providerOverride: activeTabNativeTtsProvider() };
}

function getTranslationSpeakData(): SpeakData | null {
  const providerId = state.activeProviderId;
  const result = providerId ? state.resultsByProvider.get(providerId) : undefined;
  if (!result || result.status !== 'ok') return null;
  const text = translationTextEl.value.trim();
  if (!text) return null;
  const lang = result.targetLang ?? (state.targetLang !== 'auto' ? state.targetLang : state.lastResolvedTargetLang);
  const providerOverride = activeTabNativeTtsProvider();
  return { text, lang, voiceName: voiceOverrideFor(lang), providerOverride };
}

function setSpeakButtonActive(button: HTMLButtonElement, active: boolean): void {
  button.classList.toggle('speaking', active);
  button.textContent = active ? '⏹' : '\u{1F50A}';
}

async function stopActivePlayback(): Promise<void> {
  activeAudioStop?.(); // unblocks a pending cloud-audio playAudioAndWait(), if any
  await window.electronAPI.tts.stop(); // kills a pending system-voice PowerShell process, if any
}

async function handleSpeakClick(button: HTMLButtonElement, getData: () => SpeakData | null): Promise<void> {
  if (activeSpeakButton === button) {
    await stopActivePlayback();
    return;
  }

  const data = getData();
  if (!data) return;

  if (activeSpeakButton) {
    await stopActivePlayback();
  }

  activeSpeakButton = button;
  setSpeakButtonActive(button, true);
  try {
    // A populated result means the selected provider only fetched audio
    // bytes (issue #107's cloud providers) rather than playing them
    // itself — null means the provider already produced sound server-side
    // (systemProvider.ts via PowerShell), same as before this issue.
    const result = await window.electronAPI.tts.speak(data.text, data.lang, data.voiceName, data.providerOverride);
    if (result) {
      await playAudioAndWait(result.audioBase64, result.mimeType);
    }
  } catch (error) {
    console.error('[popup] failed to speak text', error);
  } finally {
    if (activeSpeakButton === button) activeSpeakButton = null;
    setSpeakButtonActive(button, false);
  }
}

// `attempted` distinguishes "no lookup has happened yet" (idle/loading —
// section stays hidden, nothing to say) from "a lookup just ran and came
// back with nothing" (loaded but empty — worth telling the user, rather
// than the button silently vanishing with no explanation). The latter is
// a real, expected outcome, not a bug: Bing's dictionary endpoint (issue
// #119) only covers a subset of language pairs — confirmed live that
// German -> Russian, for example, returns no data at all even though
// German -> English does for the exact same word.
function renderDictionary(dictionary: GoogleDictionary | undefined, attempted: boolean): void {
  dictionaryContentEl.innerHTML = '';

  const hasContent = Boolean(
    dictionary && (dictionary.entries.length > 0 || dictionary.examples.length > 0 || dictionary.alternativeTranslations.length > 0),
  );

  if (!hasContent) {
    dictionarySection.hidden = !attempted;
    if (attempted) {
      const empty = document.createElement('p');
      empty.className = 'dict-empty';
      empty.textContent = 'No dictionary data available for this word or language pair.';
      dictionaryContentEl.appendChild(empty);
    }
    return;
  }

  if (!dictionary) return; // unreachable — hasContent already implies this, just narrowing for TS
  dictionarySection.hidden = false;

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

// Issue #27: fires once a translation actually completes for the active
// tab — not on every re-render — so it doesn't fight the user by silently
// overwriting their clipboard more often than a translation genuinely
// changed. 'none' (the default) never calls the IPC at all.
async function copyAfterTranslateIfEnabled(originalText: string, translatedText: string): Promise<void> {
  if (state.copyAction === 'none') return;
  const text = state.copyAction === 'translation' ? translatedText : originalText;
  try {
    await window.electronAPI.clipboard.writeText(text);
  } catch (error) {
    console.error('[popup] failed to copy to clipboard', error);
  }
}

// Issue #128: a manual, always-available per-field copy — independent of
// the #27 auto-copy-after-translating setting above, which only ever
// fires once per completed translation and only copies whichever single
// field that setting names. Brief checkmark swap so a silent clipboard
// write doesn't look like the click did nothing.
async function handleCopyClick(button: HTMLButtonElement, getText: () => string): Promise<void> {
  const text = getText();
  if (!text) return;
  try {
    await window.electronAPI.clipboard.writeText(text);
    button.textContent = '\u{2705}';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = '\u{1F4CB}';
      button.classList.remove('copied');
    }, 1200);
  } catch (error) {
    console.error('[popup] failed to copy to clipboard', error);
  }
}

// Issue #130: forces the active tab's translation to be re-fetched with
// skipCache — unlike retranslateFromOriginal (triggered by editing
// Original), this needs no edit at all, just "the last answer was bad,
// try again for real". Resets only the *active* provider's result, not
// every tab (retranslateFromOriginal's invalidateAllResults does that,
// which would be needlessly disruptive here for tabs the user isn't even
// looking at).
async function handleForceRefresh(): Promise<void> {
  const providerId = state.activeProviderId;
  if (!providerId || !state.originalText) return;
  state.resultsByProvider.set(providerId, { status: 'idle' });
  renderTabs();
  renderActiveResult();
  await ensureActiveResultLoaded(true);
}

// forceFresh bypasses Google's request cache (google.ts, #94) for this
// specific run — set true when the caller is acting on an explicit user
// correction (a manual language-selector change, or overriding a wrong
// Auto-Detect pick) where a guaranteed-live answer matters more than the
// dedup savings. Left false for routine flows (a fresh capture, switching
// tabs) where the cache is exactly the intended optimization.
async function ensureActiveResultLoaded(forceFresh = false): Promise<void> {
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
      if (state.sourceLangOverride) {
        // A manual correction of a previous (wrong) Auto-Detect pick for
        // this same captured text — use it directly instead of asking the
        // provider to detect again (see handleSourceOverrideChange).
        effectiveSourceLang = state.sourceLangOverride;
      } else {
        const detectResult = await window.electronAPI.providers.detectLanguage(providerId, state.originalText);
        if (!detectResult.ok) throw new Error(detectResult.error);
        effectiveSourceLang = detectResult.value;
      }
      state.lastDetectedLang = effectiveSourceLang;
    }

    if (effectiveTargetLang === 'auto') {
      // A manual correction of a previous target-resolution result for
      // this same captured text (see handleTargetOverrideChange) takes
      // priority over recomputing it from the Languages-settings pair.
      effectiveTargetLang = state.targetLangOverride ?? resolveAutoTargetLang(effectiveSourceLang);
      state.lastResolvedTargetLang = effectiveTargetLang;
    }

    // Issue #99: the dictionary/gender-pivot cost is opt-in via "Show
    // Dictionary" now, not automatic — this initial call stays lightweight
    // regardless of provider (a no-op option for DeepL/MyMemory, which
    // never had dictionary data anyway).
    const translateResult = await window.electronAPI.providers.translate(providerId, state.originalText, effectiveSourceLang, effectiveTargetLang, {
      lightweight: true,
      skipCache: forceFresh,
    });
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

    const backLang = state.backLangOverrideByProvider.get(providerId) ?? effectiveSourceLang;
    const backResult = await window.electronAPI.providers.translate(providerId, translateResult.value.translatedText, effectiveTargetLang, backLang, {
      lightweight: true,
      skipCache: forceFresh,
    });

    state.resultsByProvider.set(providerId, {
      status: 'ok',
      translatedText: translateResult.value.translatedText,
      backTranslatedText: backResult.ok ? backResult.value.translatedText : undefined,
      detectedLang: effectiveSourceLang,
      targetLang: effectiveTargetLang,
      backLang,
      dictionaryStatus: 'idle',
    });

    if (providerId === state.activeProviderId) {
      void copyAfterTranslateIfEnabled(state.originalText, translateResult.value.translatedText);
    }
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

// Issue #99: fetches Google's dictionary/gender data on demand — the
// initial lookup above deliberately never requests it, to keep the
// default per-lookup cost at 1 request instead of up to 3. A cached
// answer for the same word (google.ts's 5-minute TTL) is fine to reuse
// here, unlike the forced-language-correction flows, so this doesn't set
// skipCache.
async function handleLoadDictionary(): Promise<void> {
  const providerId = state.activeProviderId;
  const result = providerId ? state.resultsByProvider.get(providerId) : undefined;
  if (!providerId || !result || result.status !== 'ok' || result.dictionaryStatus === 'loading' || result.dictionaryStatus === 'loaded') return;
  if (!result.detectedLang || !result.targetLang) return;

  state.resultsByProvider.set(providerId, { ...result, dictionaryStatus: 'loading' });
  renderActiveResult();

  const fullResult = await window.electronAPI.providers.translate(providerId, state.originalText, result.detectedLang, result.targetLang);
  const current = state.resultsByProvider.get(providerId);
  if (!current) return;
  state.resultsByProvider.set(providerId, {
    ...current,
    dictionary: fullResult.ok ? fullResult.value.dictionary : undefined,
    genderArticle: fullResult.ok ? fullResult.value.genderArticle : undefined,
    sourceGenderArticle: fullResult.ok ? fullResult.value.sourceGenderArticle : undefined,
    dictionaryStatus: 'loaded',
  });
  if (providerId === state.activeProviderId) renderActiveResult();
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

  const backLang = state.backLangOverrideByProvider.get(providerId) ?? result.detectedLang ?? (state.sourceLang !== 'auto' ? state.sourceLang : undefined);

  // Dictionary/gender data describes the *original* translatedText — once
  // the user has overwritten it, that data no longer applies to what's
  // actually in the field, so drop it (and reset dictionaryStatus so "Show
  // Dictionary" is offered again for the new text) rather than show it as
  // if it still did.
  state.resultsByProvider.set(providerId, {
    ...result,
    translatedText: editedTranslation,
    backTranslatedText: undefined,
    dictionary: undefined,
    genderArticle: undefined,
    dictionaryStatus: 'idle',
  });
  if (providerId === state.activeProviderId) {
    backTranslationTextEl.textContent = 'Translating…';
    backTranslationTextEl.classList.add('loading');
    renderDictionaryArea(state.resultsByProvider.get(providerId));
  }

  if (!backLang) return;

  try {
    const backResult = await window.electronAPI.providers.translate(providerId, editedTranslation, result.targetLang ?? state.targetLang, backLang, { lightweight: true });
    const current = state.resultsByProvider.get(providerId);
    if (!current) return;
    state.resultsByProvider.set(providerId, {
      ...current,
      backLang,
      backTranslatedText: backResult.ok ? backResult.value.translatedText : undefined,
    });
  } finally {
    if (providerId === state.activeProviderId) renderActiveResult();
  }
}

// Issue #98: forces a re-check with an explicit backLang, bypassing the
// Google cache (skipCache) since this is a deliberate user correction
// where a guaranteed-live answer matters more than dedup savings.
async function retranslateBackWithLang(providerId: string, newBackLang: string): Promise<void> {
  const result = state.resultsByProvider.get(providerId);
  if (!result || result.status !== 'ok' || !result.targetLang || result.translatedText === undefined) return;

  if (providerId === state.activeProviderId) {
    backTranslationTextEl.textContent = 'Translating…';
    backTranslationTextEl.classList.add('loading');
  }

  try {
    const backResult = await window.electronAPI.providers.translate(providerId, result.translatedText, result.targetLang, newBackLang, { lightweight: true, skipCache: true });
    const current = state.resultsByProvider.get(providerId);
    if (!current) return;
    state.resultsByProvider.set(providerId, {
      ...current,
      backLang: newBackLang,
      backTranslatedText: backResult.ok ? backResult.value.translatedText : undefined,
    });
  } finally {
    if (providerId === state.activeProviderId) renderActiveResult();
  }
}

// Issue #98: corrects a wrong Auto-Detect pick for the *current* captured
// text without leaving Auto-Detect mode — the Source dropdown keeps
// showing "Auto-Detect" so the next capture still detects fresh. Applies
// to every provider tab (invalidateAllResults), since they all detected
// from the same text and could share the same mistake. Forces a live
// re-check (forceFresh) rather than risking a cached response from before
// the correction.
async function handleSourceOverrideChange(newLang: string): Promise<void> {
  state.sourceLangOverride = newLang;
  // A corrected source likely resolves to a different target too (in Auto
  // target mode) — starting the target override fresh avoids carrying
  // forward a choice made for the old (wrong) source.
  state.targetLangOverride = undefined;
  state.backLangOverrideByProvider.clear();
  invalidateAllResults();
  renderTabs();
  renderActiveResult();
  await ensureActiveResultLoaded(true);
}

// Issue #102: corrects the resolved target language for the current
// captured text without leaving Auto target mode — parallel to
// handleSourceOverrideChange. Doesn't touch sourceLangOverride or the
// back-translation override, since those are independent axes.
async function handleTargetOverrideChange(newLang: string): Promise<void> {
  state.targetLangOverride = newLang;
  invalidateAllResults();
  renderTabs();
  renderActiveResult();
  await ensureActiveResultLoaded(true);
}

async function handleBackLangOverrideChange(newLang: string): Promise<void> {
  const providerId = state.activeProviderId;
  if (!providerId) return;
  state.backLangOverrideByProvider.set(providerId, newLang);
  await retranslateBackWithLang(providerId, newLang);
}

function invalidateAllResults(): void {
  for (const providerId of state.providerIds) {
    state.resultsByProvider.set(providerId, { status: 'idle' });
  }
}

async function handleLanguageChange(): Promise<void> {
  state.sourceLang = sourceLangSelect.value;
  state.targetLang = targetLangSelect.value;
  // An explicit manual language pick supersedes any per-capture correction
  // that was scoped to the *previous* language mode — stale overrides here
  // would otherwise resurface unexpectedly if the user later switches back
  // to Auto-Detect.
  state.sourceLangOverride = undefined;
  state.targetLangOverride = undefined;
  state.backLangOverrideByProvider.clear();
  invalidateAllResults();
  renderTabs();
  renderActiveResult();
  await ensureActiveResultLoaded(true);
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

// Issue #116: applied once at popup init, not live-pushed to an
// already-open popup if Settings changes elsewhere — matches how every
// other setting here already behaves (e.g. voiceByLang), and the popup is
// normally closed/reopened per capture anyway.
function applyAppearance(appearance: { fontSize: number; fontFamily: string; theme: ThemeMode; customColors: CustomThemeColors }): void {
  document.documentElement.style.setProperty('--content-font-size', `${appearance.fontSize}px`);
  document.documentElement.style.setProperty('--content-font-family', fontStackFor(appearance.fontFamily));
  applyTheme(document.documentElement, appearance.theme, appearance.customColors);
}

async function init(): Promise<void> {
  populateLanguageSelects();

  const [settings, providerIds] = await Promise.all([window.electronAPI.settings.get(), window.electronAPI.providers.listIds()]);

  state.autoDetectFirst = settings.languages.autoDetectFirst;
  state.autoDetectSecond = settings.languages.autoDetectSecond;
  state.voiceByLang = settings.tts.voiceByLang;
  state.copyAction = settings.advanced.copyAction;
  applyAppearance(settings.appearance);

  state.providerIds = PROVIDER_ORDER.filter((id) => providerIds.includes(id) && settings.services[id as keyof typeof settings.services]);
  state.activeProviderId = state.providerIds[0] ?? null;
  invalidateAllResults();

  sourceLangSelect.addEventListener('change', () => void handleLanguageChange());
  targetLangSelect.addEventListener('change', () => void handleLanguageChange());
  detectedLangSelect.addEventListener('change', () => void handleSourceOverrideChange(detectedLangSelect.value));
  targetLangOverrideSelect.addEventListener('change', () => void handleTargetOverrideChange(targetLangOverrideSelect.value));
  backLangSelect.addEventListener('change', () => void handleBackLangOverrideChange(backLangSelect.value));
  swapButton.addEventListener('click', () => void handleSwap());
  translateButton.addEventListener('click', () => void handleTranslateClick());
  forceRefreshButton.addEventListener('click', () => void handleForceRefresh());
  speakOriginalButton.addEventListener('click', () => void handleSpeakClick(speakOriginalButton, getOriginalSpeakData));
  speakTranslationButton.addEventListener('click', () => void handleSpeakClick(speakTranslationButton, getTranslationSpeakData));
  copyOriginalButton.addEventListener('click', () => void handleCopyClick(copyOriginalButton, () => originalTextEl.value.trim()));
  copyTranslationButton.addEventListener('click', () => void handleCopyClick(copyTranslationButton, () => translationTextEl.value.trim()));
  copyBackButton.addEventListener('click', () => void handleCopyClick(copyBackButton, () => backTranslationTextEl.textContent?.trim() ?? ''));
  loadDictionaryButton.addEventListener('click', () => void handleLoadDictionary());
  originalTextEl.addEventListener('input', () => {
    speakOriginalButton.disabled = !originalTextEl.value.trim();
    copyOriginalButton.disabled = !originalTextEl.value.trim();
  });

  window.electronAPI.popup.onCapturedText((text) => {
    if (activeSpeakButton) void window.electronAPI.tts.stop();
    state.originalText = text;
    // A fresh capture starts clean — any per-capture correction from the
    // previous text no longer applies.
    state.sourceLangOverride = undefined;
    state.targetLangOverride = undefined;
    state.backLangOverrideByProvider.clear();
    invalidateAllResults();
    renderTabs();
    renderActiveResult();
    void ensureActiveResultLoaded();
  });

  renderTabs();
  renderActiveResult();
}

void init();
