// Issue #116: font size/family for the popup's Original/Translation/
// Back-translation text. A curated list rather than free text — every
// entry is a font bundled with Windows itself (no risk of picking a name
// nothing on the machine actually has), covering the common sans/serif/
// monospace shapes. Shared between popup.ts (applies the choice) and
// settings.ts (offers it, with a live preview) the same way
// renderer/shared/languages.ts is shared across the popup and settings.

export interface FontFamilyOption {
  id: string;
  label: string;
  stack: string;
}

export const FONT_FAMILIES: FontFamilyOption[] = [
  { id: 'default', label: 'System Default', stack: "'Segoe UI', system-ui, sans-serif" },
  { id: 'arial', label: 'Arial', stack: "'Arial', sans-serif" },
  { id: 'calibri', label: 'Calibri', stack: "'Calibri', sans-serif" },
  { id: 'verdana', label: 'Verdana', stack: "'Verdana', sans-serif" },
  { id: 'tahoma', label: 'Tahoma', stack: "'Tahoma', sans-serif" },
  { id: 'georgia', label: 'Georgia', stack: "'Georgia', serif" },
  { id: 'times', label: 'Times New Roman', stack: "'Times New Roman', serif" },
  { id: 'consolas', label: 'Consolas', stack: "'Consolas', 'Courier New', monospace" },
];

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 13;

// Falls back to the default stack for an unrecognized id — e.g. a
// settings.json hand-edited or written by a future version with an id
// this build doesn't know about — rather than producing an empty/invalid
// font-family value.
export function fontStackFor(id: string): string {
  return FONT_FAMILIES.find((f) => f.id === id)?.stack ?? FONT_FAMILIES[0].stack;
}
