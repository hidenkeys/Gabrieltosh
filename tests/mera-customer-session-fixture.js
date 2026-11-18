// Explicit HTTP fixture for the additive own-session GET/POST guest contract.
// Dedicated recovery tests use raw handlers for missing/mismatched refs.
export const customerOrganizationId = "10000000-0000-4000-8000-000000000001";
export const customerBranchId = "20000000-0000-4000-8000-000000000001";
export const customerProductId = "30000000-0000-4000-8000-000000000001";
export const customerSessionRef = "40000000-0000-4000-8000-000000000001";
export function mockGuestSessionFetch(t, handler) {
  const sessions = new Set();
  return t.mock.method(globalThis, "fetch", async (input, init) => {
    const path = String(input),
      scope = path.replace(/\/guests?$/, "");
    if (path.endsWith("/guest") && sessions.has(scope))
      return Response.json(
        {
          displayName: "Ada",
          sessionRef: customerSessionRef,
          orders: [],
          reservations: [],
          openVisits: [],
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    const response = await handler(input, init);
    if (path.endsWith("/guests") && response?.ok) {
      sessions.add(scope);
      const payload = await response.clone().json();
      return Response.json(
        { ...payload, sessionRef: customerSessionRef },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return response;
  });
}
