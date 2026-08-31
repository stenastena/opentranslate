export interface HotkeySettings {
  captureAndTranslate: string; // Electron accelerator string, e.g. "Control+`"
}

export interface LanguageSettings {
  autoDetectFirst: string;
  autoDetectSecond: string;
}

export interface ServiceSettings {
  deepl: boolean;
  yandex: boolean;
  google: boolean;
  // Issue #97: Microsoft Translator via the unofficial bing.com/translator
  // endpoint — see providers/bingTranslate.ts.
  bing: boolean;
  // Issue #96: MyMemory Translation — see providers/mymemory.ts. Defaults
  // off, unlike the other four: its translation-memory-based answers are
  // "generally strong for common EU language pairs, more inconsistent for
  // others" per the issue's own framing (confirmed live: even a common
  // phrase can hit a low-quality stored match), so it's opt-in rather than
  // assumed-good like the MT-only providers.
  mymemory: boolean;
}

// Issue #107: which TTS backend actually produces the audio. 'system' is
// the pre-#107 behavior (local SAPI voices via systemProvider.ts); the two
// cloud options are unofficial-endpoint providers with no local voice
// dependency (googleCloudProvider.ts / bingCloudProvider.ts).
export type TTSProviderId = 'system' | 'google-cloud' | 'bing-cloud';

export interface TTSSettings {
  provider: TTSProviderId;
  // Language code (e.g. "de") -> chosen SAPI voice name. Only consulted
  // when provider is 'system' (or as the fallback target when a cloud
  // provider's request fails — see ipc/handlers.ts). A language with no
  // entry here falls back to systemTtsProvider's automatic locale matching
  // — this is what keeps existing behavior unchanged for anyone who hasn't
  // opened the Voice settings section (issue #89).
  voiceByLang: Record<string, string>;
}

// Issue #116: font size/family for the popup's Original/Translation/
// Back-translation text specifically — not the surrounding UI chrome
// (tabs, buttons, labels), which stays at its own fixed sizes regardless.
// fontFamily is a loose string here (not a union) the same way
// voiceByLang's values are — it's an opaque id the renderer's own
// FONT_FAMILIES table (src/renderer/shared/fonts.ts) resolves to an actual
// CSS font stack; the main process persists it without validating it.
export interface AppearanceSettings {
  fontSize: number; // px
  fontFamily: string;
  // Issue #17: the popup *window's* opacity (Electron's native
  // BrowserWindow.opacity, applied at creation — not a CSS effect on
  // content). 0.3-1.0; clamped defensively wherever it's read, since a
  // hand-edited settings.json with an out-of-range or 0 value would
  // otherwise make the popup invisible/unusable with no obvious way back
  // in from the UI alone.
  opacity: number;
  // Issue #16: 'light'/'dark' pick one of popup.css's two hand-tuned
  // palettes ([data-theme="..."] blocks); 'custom' has popup.ts set
  // customColors' three values directly as CSS variables, with every
  // other token in the palette derived from just those three via
  // color-mix() (see popup.css's top-of-file comment) — so a 3-color
  // pick still produces a coherent full palette without a picker for
  // every individual token.
  theme: ThemeMode;
  customColors: CustomThemeColors;
}

export type ThemeMode = 'light' | 'dark' | 'custom';

export interface CustomThemeColors {
  background: string; // any valid CSS color, but the picker only ever writes #rrggbb
  text: string;
  accent: string;
}

// Issue #27: what happens to the clipboard after a translation completes
// for the active tab. 'none' (default) leaves it exactly as
// textCapture.ts already does — restored to whatever it held before the
// capture — so this is purely opt-in, never a surprise for anyone who
// hasn't opened Advanced settings.
export type CopyAction = 'none' | 'original' | 'translation';

export interface AdvancedSettings {
  copyAction: CopyAction;
}

export interface AppSettings {
  hotkeys: HotkeySettings;
  languages: LanguageSettings;
  services: ServiceSettings;
  tts: TTSSettings;
  appearance: AppearanceSettings;
  advanced: AdvancedSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  hotkeys: { captureAndTranslate: "Control+`" },
  languages: { autoDetectFirst: 'en', autoDetectSecond: 'de' },
  services: { deepl: true, yandex: true, google: true, bing: true, mymemory: false },
  // 'bing-cloud' by default: real Azure neural voices, the actual fix for
  // the recurring voice-quality complaint (#93) this issue exists to
  // address — 'google-cloud' and 'system' remain one Settings dropdown
  // away, and any cloud request that fails falls back to 'system'
  // automatically (see ipc/handlers.ts), so this default never leaves
  // someone stuck with total TTS silence just because a network call
  // failed.
  tts: { provider: 'bing-cloud', voiceByLang: {} },
  // Matches popup.css's pre-#116 hardcoded values exactly, so anyone who
  // never opens Appearance settings sees the popup completely unchanged.
  // opacity: 1 (fully opaque) is today's implicit behavior — Electron's
  // own default when no `opacity` constructor option is given at all.
  // theme: 'light' + customColors matching popup.css's :root (light)
  // block exactly, so switching to 'custom' without touching the
  // pickers starts from today's actual colors, not arbitrary ones.
  appearance: {
    fontSize: 13,
    fontFamily: 'default',
    opacity: 1,
    theme: 'light',
    customColors: { background: '#ffffff', text: '#1a1a1a', accent: '#2b6cb0' },
  },
  advanced: { copyAction: 'none' },
};

export const MIN_OPACITY = 0.3;
export const MAX_OPACITY = 1;

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return MAX_OPACITY;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
}
