// Also duplicated (not imported) in src/preload/index.ts — see the comment
// there for why. Keep both lists in sync when adding/renaming a channel.
export const CHANNELS = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  providerTranslate: 'provider:translate',
  providerDetectLanguage: 'provider:detect-language',
  providerLastSuccessAt: 'provider:last-success-at',
  providerListIds: 'provider:list-ids',
  popupCapturedText: 'popup:captured-text',
  popupResize: 'popup:resize',
} as const;
