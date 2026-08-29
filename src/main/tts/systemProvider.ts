import { ChildProcess, execFile } from 'node:child_process';
import { TTSProvider } from './types';

const ENV_TEXT = 'OPENTRANSLATE_TTS_TEXT';
const ENV_LANG = 'OPENTRANSLATE_TTS_LANG';

// Speaks via Windows' built-in SAPI voices (System.Speech), shelled out to
// PowerShell. No network call and no unofficial endpoint — unlike the
// translation providers, there's nothing here that can 429 or change shape.
//
// The text is captured clipboard content, so it's arbitrary and untrusted.
// It must never be interpolated into the PowerShell *script string* (that
// would be a PowerShell injection vector — e.g. text containing `'; rm ...`
// could break out of a quoted literal and run as code). Passing it through
// an environment variable instead sidesteps that entirely: PowerShell only
// ever reads $env:* as a plain string value, never parses it as code.
const SPEAK_SCRIPT = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$lang = $env:${ENV_LANG}
if ($lang) {
  $voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -ieq $lang } | Select-Object -First 1
  if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }
}
$synth.Speak($env:${ENV_TEXT})
`;

const HEALTH_SCRIPT = `
Add-Type -AssemblyName System.Speech
if ((New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count -eq 0) { exit 1 }
`;

let current: ChildProcess | null = null;
let stoppedIntentionally = false;

function runPowerShell(script: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    current = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { env, maxBuffer: 10 * 1024 * 1024 },
      (error) => {
        const wasStopped = stoppedIntentionally;
        stoppedIntentionally = false;
        current = null;
        if (error && !wasStopped) reject(error);
        else resolve();
      },
    );
  });
}

export const systemTtsProvider: TTSProvider = {
  id: 'system',

  async speak(text, lang) {
    if (!text.trim()) return;
    await runPowerShell(SPEAK_SCRIPT, { ...process.env, [ENV_TEXT]: text, [ENV_LANG]: lang ?? '' });
  },

  async stop() {
    if (current) {
      stoppedIntentionally = true;
      current.kill();
    }
  },

  async isHealthy() {
    try {
      await runPowerShell(HEALTH_SCRIPT, process.env);
      return true;
    } catch {
      return false;
    }
  },
};
