import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIMEOUT_SECONDS = 15;
const STATUS_DELIMITER = '\nHTTPSTATUS:';

// 429 (rate limited) and 503 (temporarily overloaded) are the two statuses
// unofficial endpoints use for "back off and try again shortly" — worth a
// couple of quick retries, unlike a real parse/shape failure which retrying
// can't fix. See issue #94: Google's 429s were confirmed to sometimes clear
// within seconds even under real usage, not just as a long-lived IP ban.
const RETRYABLE_STATUSES = new Set([429, 503]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 800;

export interface CurlResponse {
  status: number;
  body: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function curlGetOnce(url: string, headers: Record<string, string>): Promise<CurlResponse> {
  const headerArgs = Object.entries(headers).flatMap(([name, value]) => ['-H', `${name}: ${value}`]);
  const { stdout } = await execFileAsync(
    'curl',
    ['-s', '--max-time', String(TIMEOUT_SECONDS), '-w', `${STATUS_DELIMITER}%{http_code}`, url, ...headerArgs],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  const delimiterIndex = stdout.lastIndexOf(STATUS_DELIMITER);
  if (delimiterIndex === -1) {
    throw new Error('curl output did not contain the expected status delimiter');
  }
  return {
    body: stdout.slice(0, delimiterIndex),
    status: Number(stdout.slice(delimiterIndex + STATUS_DELIMITER.length)),
  };
}

// Some unofficial-endpoint providers (Google Translate's gtx client, at
// least) fingerprint the TLS/HTTP2 handshake itself, not just headers:
// the exact same request with the exact same headers gets a 429 "your
// computer or network may be sending automated queries" from Node's
// built-in fetch (undici) but a clean 200 from curl — confirmed side by
// side on the real dev machine (see issue #70). Shelling out to curl
// (bundled with Windows since 10 1803 / this app is Windows-only) uses
// its TLS stack instead of Node's, sidestepping that specific fingerprint
// check. Only use this for endpoints that actually need it — plain
// `fetch` works fine for endpoints that don't fingerprint the handshake.
//
// Retries a 429/503 a couple of times with jittered backoff before giving
// up (see issue #94) — maxAttempts/baseDelayMs are only exposed as
// parameters so tests can pass baseDelayMs=0 and avoid real waiting.
export async function curlGet(
  url: string,
  headers: Record<string, string>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Promise<CurlResponse> {
  let response: CurlResponse;
  for (let attempt = 0; ; attempt++) {
    response = await curlGetOnce(url, headers);
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= maxAttempts - 1) break;

    const backoff = baseDelayMs * 2 ** attempt;
    const jitter = backoff * (0.8 + Math.random() * 0.4); // +/-20%, avoids every retry landing in lockstep
    await delay(jitter);
  }
  return response;
}
