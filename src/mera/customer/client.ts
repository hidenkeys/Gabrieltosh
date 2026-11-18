export function customerOrganizationSlug(pathname: string): string | undefined {
  const match = /^\/mera\/(?:menu|store)\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match) return undefined;
  try {
    const slug = decodeURIComponent(match[1]);
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) ? slug : undefined;
  } catch {
    return undefined;
  }
}
export async function customerRequest<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const organizationSlug = customerOrganizationSlug(window.location.pathname);
  let response: Response;
  let data: any;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch("/api/mera/v1" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-POS-Request": "1",
        ...(organizationSlug
          ? { "X-Mera-Organization-Slug": organizationSlug }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    data = await response.json();
  } catch {
    throw new Error(
      "Connection interrupted. Your basket is still here. Check your connection before trying again; an order may already have reached the venue.",
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        data.error?.message ||
          data.error ||
          "The venue could not complete this request.",
      ),
      { status: response.status },
    );
  return data;
}

export function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
