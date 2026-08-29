import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIMEOUT_SECONDS = 15;
const STATUS_DELIMITER = '\nHTTPSTATUS:';

export interface CurlResponse {
  status: number;
  body: string;
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
export async function curlGet(url: string, headers: Record<string, string>): Promise<CurlResponse> {
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
