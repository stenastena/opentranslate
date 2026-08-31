import { CHROME_USER_AGENT } from './browserHeaders';
import { curlGet } from './curlFetch';

// Shared by every unofficial Bing endpoint this app calls (TTS —
// tts/bingCloudProvider.ts, issue #107 — and translation — bingTranslate.ts,
// issue #97): both need the same short-lived IG/IID/key/token auth set,
// scraped from www.bing.com/translator's own HTML (the same page Bing's
// site itself loads before any "translate" or "listen" click), ported from
// ahatem/QTranslate's BingAuthManager.kt. One shared cache means a TTS call
// and a translate call made close together reuse the same token instead of
// each independently scraping the page — also just matches how a real
// browser session actually works (one page load, many API calls against
// it).
const TRANSLATOR_PAGE_URL = 'https://www.bing.com/translator';
// Bing's own token lifetime is ~1 hour (BingAuthManager.kt); refreshing a
// little early avoids a request landing right on the expiry boundary.
const AUTH_TTL_MS = 55 * 60 * 1000;

export interface BingAuth {
  ig: string;
  iid: string;
  key: string;
  token: string;
  muid: string;
}

let cachedAuth: { auth: BingAuth; fetchedAt: number } | null = null;

// Test-only escape hatch, matching systemProvider.ts's
// __resetShellResolutionForTests — without this, a test that runs after an
// earlier one that already populated the module-level cache would silently
// reuse stale auth instead of exercising the fetch path it means to test.
export function __resetBingAuthCacheForTests(): void {
  cachedAuth = null;
}

function extractPattern(html: string, pattern: RegExp): string | undefined {
  return pattern.exec(html)?.[1];
}

async function fetchAuth(): Promise<BingAuth> {
  const response = await curlGet(TRANSLATOR_PAGE_URL, { 'User-Agent': CHROME_USER_AGENT });
  if (response.status !== 200) {
    throw new Error(`Failed to load Bing translator page for auth: status ${response.status}`);
  }
  const html = response.body;
  const ig = extractPattern(html, /IG:"(.*?)"/);
  const iid = extractPattern(html, /data-iid="(.*?)"/);
  const helperRaw = extractPattern(html, /params_AbusePreventionHelper\s*=\s*(\[.*?\]);/);
  const muid = extractPattern(html, /"muid":\s*"(.*?)"/) ?? '';
  if (!ig || !iid || !helperRaw) {
    throw new Error('Failed to extract Bing auth tokens from translator page (page layout may have changed)');
  }

  let helper: [number, string, number];
  try {
    helper = JSON.parse(helperRaw);
  } catch (error) {
    throw new Error(`Failed to parse Bing abuse-prevention helper data: ${(error as Error).message}`);
  }

  return { ig, iid, key: String(helper[0]), token: helper[1], muid };
}

export async function getBingAuth(forceRefresh: boolean): Promise<BingAuth> {
  if (!forceRefresh && cachedAuth && Date.now() - cachedAuth.fetchedAt < AUTH_TTL_MS) {
    return cachedAuth.auth;
  }
  const auth = await fetchAuth();
  cachedAuth = { auth, fetchedAt: Date.now() };
  return auth;
}
