// Issue #16: applies a theme to any element (the popup's own <html>, or a
// small preview box in Settings) by setting the --om-* CSS custom
// properties popup.css's rules are all written against (see its top-of-
// file comment). Shared between popup.ts (applies the saved choice) and
// settings.ts (offers it, with a live preview), the same pattern
// fonts.ts/languages.ts already use.

export const CUSTOM_THEME_TOKENS = [
  '--om-bg',
  '--om-bg-alt',
  '--om-bg-control',
  '--om-bg-control-hover',
  '--om-border',
  '--om-text',
  '--om-text-secondary',
  '--om-text-muted',
  '--om-accent',
  '--om-accent-bg',
  '--om-accent-hover',
  '--om-error',
] as const;

// 'light'/'dark' select one of popup.css's two hand-tuned [data-theme]
// blocks wholesale. 'custom' sets only the three base tokens directly
// from the user's picks and derives every other token from them via
// color-mix() — a few color-mix ratios standing in for a full palette
// designer, so a 3-color pick still looks like one coherent theme instead
// of clashing with untouched light-mode chrome.
export function applyTheme(root: HTMLElement, theme: ThemeMode, customColors: CustomThemeColors): void {
  if (theme !== 'custom') {
    for (const token of CUSTOM_THEME_TOKENS) root.style.removeProperty(token);
    root.setAttribute('data-theme', theme);
    return;
  }

  // No stylesheet block applies once these are set inline — data-theme is
  // irrelevant here, but 'light' is left in place as a harmless structural
  // fallback for the split second before this function's own overrides
  // below take effect.
  root.setAttribute('data-theme', 'light');
  root.style.setProperty('--om-bg', customColors.background);
  root.style.setProperty('--om-text', customColors.text);
  root.style.setProperty('--om-accent', customColors.accent);
  root.style.setProperty('--om-bg-alt', 'color-mix(in srgb, var(--om-text) 4%, var(--om-bg))');
  root.style.setProperty('--om-bg-control', 'color-mix(in srgb, var(--om-text) 6%, var(--om-bg))');
  root.style.setProperty('--om-bg-control-hover', 'color-mix(in srgb, var(--om-text) 10%, var(--om-bg))');
  root.style.setProperty('--om-border', 'color-mix(in srgb, var(--om-text) 16%, var(--om-bg))');
  root.style.setProperty('--om-text-secondary', 'color-mix(in srgb, var(--om-text) 70%, var(--om-bg))');
  root.style.setProperty('--om-text-muted', 'color-mix(in srgb, var(--om-text) 50%, var(--om-bg))');
  root.style.setProperty('--om-accent-bg', 'color-mix(in srgb, var(--om-accent) 12%, var(--om-bg))');
  root.style.setProperty('--om-accent-hover', 'color-mix(in srgb, black 15%, var(--om-accent))');
  root.style.setProperty('--om-error', 'color-mix(in srgb, #e53e3e 80%, var(--om-text))');
}
