// All three providers below are unofficial, no-API-key endpoints scraped
// from their respective web clients. Node's built-in fetch sends no
// meaningful User-Agent by default, which these endpoints' bot detection
// treats as an obvious non-browser client and rejects (429/403) — even on
// the very first request, regardless of rate. A realistic browser
// User-Agent (plus each provider's own Referer/Origin, set at the
// call site) is required to get past that.
export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
