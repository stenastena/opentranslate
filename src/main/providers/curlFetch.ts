import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIMEOUT_SECONDS = 15;
const STATUS_DELIMITER = '\nHTTPSTATUS:';
const STATUS_DELIMITER_BYTES = Buffer.from(STATUS_DELIMITER, 'utf-8');

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

export interface CurlBinaryResponse {
  status: number;
  body: Buffer;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Shared by every curl* retry wrapper below: a 429/503 is worth a couple of
// jittered-backoff retries (issue #94), anything else (a real parse/shape
// failure, a 4xx that retrying can't fix) is returned as-is on the first try.
async function withRetries<T extends { status: number }>(attemptOnce: () => Promise<T>, maxAttempts: number, baseDelayMs: number): Promise<T> {
  let response: T;
  for (let attempt = 0; ; attempt++) {
    response = await attemptOnce();
    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= maxAttempts - 1) break;

    const backoff = baseDelayMs * 2 ** attempt;
    const jitter = backoff * (0.8 + Math.random() * 0.4); // +/-20%, avoids every retry landing in lockstep
    await delay(jitter);
  }
  return response;
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
export function curlGet(
  url: string,
  headers: Record<string, string>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Promise<CurlResponse> {
  return withRetries(() => curlGetOnce(url, headers), maxAttempts, baseDelayMs);
}

// Text counterpart of curlPostFormBytesOnce below — for POST endpoints that
// return text/JSON (issue #97's Bing translation provider) rather than
// binary bytes. Bing's translate endpoint needs the same query-param +
// form-body + cookie shape as its TTS endpoint (tfettts), just with a text
// response to parse instead of audio to play.
async function curlPostFormOnce(
  url: string,
  queryParams: Record<string, string>,
  formData: Record<string, string>,
  headers: Record<string, string>,
  cookieHeader: string,
): Promise<CurlResponse> {
  const fullUrl = `${url}?${new URLSearchParams(queryParams).toString()}`;
  const headerArgs = Object.entries(headers).flatMap(([name, value]) => ['-H', `${name}: ${value}`]);
  const cookieArgs = cookieHeader ? ['-H', `Cookie: ${cookieHeader}`] : [];
  const dataArgs = Object.entries(formData).flatMap(([name, value]) => ['--data-urlencode', `${name}=${value}`]);
  const { stdout } = await execFileAsync(
    'curl',
    ['-s', '--max-time', String(TIMEOUT_SECONDS), '-w', `${STATUS_DELIMITER}%{http_code}`, fullUrl, ...headerArgs, ...cookieArgs, ...dataArgs],
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

export function curlPostForm(
  url: string,
  queryParams: Record<string, string>,
  formData: Record<string, string>,
  headers: Record<string, string>,
  cookieHeader: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Promise<CurlResponse> {
  return withRetries(() => curlPostFormOnce(url, queryParams, formData, headers, cookieHeader), maxAttempts, baseDelayMs);
}

// Binary counterpart of curlGetOnce, for endpoints that return audio/image
// bytes rather than text (issue #107's cloud TTS providers). Node's stdout
// is captured as a Buffer (encoding: 'buffer') rather than auto-decoded as
// UTF-8 text — decoding arbitrary binary audio as UTF-8 first would corrupt
// it (invalid byte sequences get replaced/mangled) before the status
// delimiter could even be split back out. Buffer#lastIndexOf on the raw
// bytes is still safe against the delimiter text coincidentally appearing
// inside the audio payload itself: curl appends the real one last, and
// lastIndexOf always finds that final occurrence regardless of what came
// before it in the body.
async function curlGetBytesOnce(url: string, headers: Record<string, string>): Promise<CurlBinaryResponse> {
  const headerArgs = Object.entries(headers).flatMap(([name, value]) => ['-H', `${name}: ${value}`]);
  const stdout = await execFileBuffer('curl', ['-s', '--max-time', String(TIMEOUT_SECONDS), '-w', `${STATUS_DELIMITER}%{http_code}`, url, ...headerArgs]);

  const delimiterIndex = stdout.lastIndexOf(STATUS_DELIMITER_BYTES);
  if (delimiterIndex === -1) {
    throw new Error('curl output did not contain the expected status delimiter');
  }
  return {
    body: stdout.subarray(0, delimiterIndex),
    status: Number(stdout.subarray(delimiterIndex + STATUS_DELIMITER_BYTES.length).toString('utf-8')),
  };
}

export function curlGetBytes(
  url: string,
  headers: Record<string, string>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Promise<CurlBinaryResponse> {
  return withRetries(() => curlGetBytesOnce(url, headers), maxAttempts, baseDelayMs);
}

// POST with a form-urlencoded body, returning raw bytes — Bing's tfettts
// endpoint (issue #107) needs both a POST body (the SSML text can be well
// over a URL's practical length limit) and query-string auth params at once.
// --data-urlencode is passed as its own argv entries (never interpolated
// into a shell string), so arbitrary captured-clipboard text in the SSML
// body can't break out as shell syntax — same reasoning as curlGetOnce's
// header args.
async function curlPostFormBytesOnce(
  url: string,
  queryParams: Record<string, string>,
  formData: Record<string, string>,
  headers: Record<string, string>,
  cookieHeader: string,
): Promise<CurlBinaryResponse> {
  const fullUrl = `${url}?${new URLSearchParams(queryParams).toString()}`;
  const headerArgs = Object.entries(headers).flatMap(([name, value]) => ['-H', `${name}: ${value}`]);
  const cookieArgs = cookieHeader ? ['-H', `Cookie: ${cookieHeader}`] : [];
  const dataArgs = Object.entries(formData).flatMap(([name, value]) => ['--data-urlencode', `${name}=${value}`]);
  const stdout = await execFileBuffer('curl', [
    '-s',
    '--max-time',
    String(TIMEOUT_SECONDS),
    '-w',
    `${STATUS_DELIMITER}%{http_code}`,
    fullUrl,
    ...headerArgs,
    ...cookieArgs,
    ...dataArgs,
  ]);

  const delimiterIndex = stdout.lastIndexOf(STATUS_DELIMITER_BYTES);
  if (delimiterIndex === -1) {
    throw new Error('curl output did not contain the expected status delimiter');
  }
  return {
    body: stdout.subarray(0, delimiterIndex),
    status: Number(stdout.subarray(delimiterIndex + STATUS_DELIMITER_BYTES.length).toString('utf-8')),
  };
}

export function curlPostFormBytes(
  url: string,
  queryParams: Record<string, string>,
  formData: Record<string, string>,
  headers: Record<string, string>,
  cookieHeader: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Promise<CurlBinaryResponse> {
  return withRetries(() => curlPostFormBytesOnce(url, queryParams, formData, headers, cookieHeader), maxAttempts, baseDelayMs);
}

// Hand-rolled rather than execFileAsync (promisify(execFile)): promisify
// loses execFile's overload resolution, so there's no clean typed way to
// tell it "this call's encoding option means stdout comes back as a Buffer,
// not a string" — wrapping it directly keeps that typing explicit instead
// of fighting @types/node's overloads.
function execFileBuffer(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 10 * 1024 * 1024, encoding: 'buffer' }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}
