/**
 * Providers must call this when they fail to parse a response from their
 * service, so a format change on the provider's end can be diagnosed from
 * the logs alone (see CONTRIBUTING.md "Fixing a broken provider").
 */
export function logProviderParseError(providerId: string, rawResponse: unknown, error: unknown): void {
  console.error(
    `[provider:${providerId}] failed to parse response`,
    '\n  error:',
    error,
    '\n  raw response:',
    typeof rawResponse === 'string' ? rawResponse.slice(0, 4000) : rawResponse,
  );
}
