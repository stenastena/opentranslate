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
  historyList: 'history:list',
  historyAdd: 'history:add',
  historyRemove: 'history:remove',
  historyClear: 'history:clear',
  ttsSpeak: 'tts:speak',
  ttsStop: 'tts:stop',
  ttsListVoices: 'tts:list-voices',
  ttsOpenNaturalVoiceAdapterPage: 'tts:open-natural-voice-adapter-page',
  clipboardWriteText: 'clipboard:write-text',
} as const;
