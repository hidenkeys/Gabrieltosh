export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function workspaceApi<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/mera/v1" + path, {
      method,
      signal,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-POS-Request": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new WorkspaceError(
      "Connection lost. No submission has been confirmed. Refresh the canonical record before retrying.",
    );
  }
  const content = await response.json().catch(() => null);
  if (!response.ok)
    throw new WorkspaceError(
      content?.error?.message ||
        content?.error ||
        "This action could not be completed.",
      response.status,
    );
  return content;
}
export const formatMoney = (minor: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format((minor || 0) / 100);
