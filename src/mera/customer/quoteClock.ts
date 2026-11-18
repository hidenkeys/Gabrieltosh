// HTTP Date has one-second precision. Charge the entire request duration as
// additional uncertainty; a slow response must never extend a price review.
export function quoteDeadline(
  expiresAt: unknown,
  serverDate: string | null,
  startedAt: number,
  receivedAt: number,
): number | null {
  if (!expiresAt) return null;
  const expiry = Date.parse(String(expiresAt));
  const server = serverDate ? Date.parse(serverDate) : NaN;
  if (!Number.isFinite(expiry) || !Number.isFinite(server)) return receivedAt;
  return (
    receivedAt +
    Math.max(0, expiry - server - 1000 - Math.max(0, receivedAt - startedAt))
  );
}
export function quoteReviewExpired(
  quote: any,
  now = performance.now(),
): boolean {
  if (!quote?.expiresAt) return false;
  return !Number.isFinite(quote.reviewDeadline) || now >= quote.reviewDeadline;
}
