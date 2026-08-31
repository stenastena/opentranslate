import { ChildProcess, execFile } from 'node:child_process';
import { TTSProvider, TTSVoice } from './types';

const ENV_TEXT = 'OPENTRANSLATE_TTS_TEXT';
const ENV_LANG = 'OPENTRANSLATE_TTS_LANG';
const ENV_VOICE = 'OPENTRANSLATE_TTS_VOICE';

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
//
// An explicit voice name (issue #89's per-language override) takes
// priority when it names a currently installed voice; SelectVoice throws
// on an unknown name, in which case this falls through to the existing
// locale-matching behavior rather than failing the whole speak() call —
// this is what keeps today's automatic behavior working unchanged for
// anyone who hasn't set an override.
const SPEAK_SCRIPT = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voiceName = $env:${ENV_VOICE}
$lang = $env:${ENV_LANG}
$selected = $false
if ($voiceName) {
  try { $synth.SelectVoice($voiceName); $selected = $true } catch {}
}
if (-not $selected -and $lang) {
  $voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -ieq $lang } | Select-Object -First 1
  if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }
}
$synth.Speak($env:${ENV_TEXT})
`;

const HEALTH_SCRIPT = `
Add-Type -AssemblyName System.Speech
if ((New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count -eq 0) { exit 1 }
`;

// Enabled-only, and only the fields the app actually uses — Culture is a
// .NET CultureInfo object that doesn't serialize usefully via ConvertTo-Json
// as-is, so it's flattened to plain strings here instead. Wrapped in @(...)
// so ConvertTo-Json always emits a JSON array, even for exactly one
// installed voice (which Windows PowerShell otherwise emits as a bare
// object, not a single-element array).
const LIST_VOICES_SCRIPT = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
  [PSCustomObject]@{
    Name = $_.VoiceInfo.Name
    Locale = $_.VoiceInfo.Culture.Name
    LangCode = $_.VoiceInfo.Culture.TwoLetterISOLanguageName
    Description = $_.VoiceInfo.Description
  }
})
$voices | ConvertTo-Json -Compress
`;

interface RawVoiceEntry {
  Name: string;
  Locale: string;
  LangCode: string;
  Description: string;
}

// Issue #103: Windows PowerShell 5.1 (powershell.exe)'s System.Speech only
// sees voices registered in the classic SAPI5 registry location — it
// silently misses anything registered under the newer "OneCore" location
// (HKLM\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens), which is where
// modern Windows voices *and* NaturalVoiceSAPIAdapter-bridged voices can
// end up. Confirmed live: the exact same script run via pwsh.exe
// (PowerShell 7, an optional install) sees all of them, and can actually
// select/speak through a voice powershell.exe couldn't even list. Prefer
// pwsh.exe when it's installed; fall back to powershell.exe (today's
// behavior, unchanged) when it isn't — checked once and cached for the
// process's lifetime rather than on every call.
let resolvedShellPromise: Promise<string> | null = null;

function resolveShell(): Promise<string> {
  if (!resolvedShellPromise) {
    resolvedShellPromise = new Promise((resolve) => {
      execFile('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], (error) => {
        resolve(error ? 'powershell.exe' : 'pwsh.exe');
      });
    });
  }
  return resolvedShellPromise;
}

// Test-only escape hatch — without this, a test overriding the pwsh.exe
// availability mock after an earlier test already resolved it would
// silently keep using the earlier (now-stale) cached shell choice.
export function __resetShellResolutionForTests(): void {
  resolvedShellPromise = null;
}

let current: ChildProcess | null = null;
let stoppedIntentionally = false;

async function runPowerShell(script: string, env: NodeJS.ProcessEnv): Promise<string> {
  const shell = await resolveShell();
  return new Promise((resolve, reject) => {
    current = execFile(
      shell,
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { env, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        const wasStopped = stoppedIntentionally;
        stoppedIntentionally = false;
        current = null;
        if (error && !wasStopped) reject(error);
        else resolve(stdout ?? '');
      },
    );
  });
}

function parseVoices(stdout: string): TTSVoice[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed: RawVoiceEntry | RawVoiceEntry[] = JSON.parse(trimmed);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries.map((entry) => ({
    name: entry.Name,
    locale: entry.Locale ?? '',
    langCode: (entry.LangCode ?? '').toLowerCase(),
    description: entry.Description ?? '',
  }));
}

export const systemTtsProvider: TTSProvider = {
  id: 'system',

  async speak(text, lang, voiceName) {
    if (!text.trim()) return { kind: 'played' };
    await runPowerShell(SPEAK_SCRIPT, {
      ...process.env,
      [ENV_TEXT]: text,
      [ENV_LANG]: lang ?? '',
      [ENV_VOICE]: voiceName ?? '',
    });
    return { kind: 'played' };
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

  async listVoices() {
    const stdout = await runPowerShell(LIST_VOICES_SCRIPT, process.env);
    return parseVoices(stdout);
  },
};
