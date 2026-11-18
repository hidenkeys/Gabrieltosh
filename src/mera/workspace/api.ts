export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
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
  const startedAt = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  const externalAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) externalAbort();
  else signal?.addEventListener("abort", externalAbort, { once: true });
  let rejectInterrupted: (error: Error) => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectInterrupted = reject;
  });
  const abortError = () =>
    new DOMException("The request was cancelled.", "AbortError");
  const onAbort = () =>
    rejectInterrupted(
      timedOut
        ? new WorkspaceError(
            "Connection timed out. No submission has been confirmed. Check the canonical record before retrying the original request.",
          )
        : abortError(),
    );
  controller.signal.addEventListener("abort", onAbort, { once: true });
  if (controller.signal.aborted) onAbort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15000);
  try {
    return await Promise.race([
      interrupted,
      (async () => {
        const response = await fetch("/api/mera/v1" + path, {
          method,
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "X-POS-Request": "1" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const content = await response.json().catch((error) => {
          if (controller.signal.aborted || error?.name === "AbortError")
            throw error;
          return null;
        });
        if (controller.signal.aborted) throw abortError();
        if (!response.ok) {
          if (
            [401, 403].includes(response.status) &&
            typeof window !== "undefined"
          )
            window.dispatchEvent(
              new window.CustomEvent("mera:access-denied", {
                detail: { path, startedAt },
              }),
            );
          throw new WorkspaceError(
            content?.error?.message ||
              content?.error ||
              "This action could not be completed.",
            response.status,
            content?.code || content?.error?.code,
          );
        }
        return content;
      })(),
    ]);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut)
      throw new WorkspaceError(
        "Connection timed out. No submission has been confirmed. Check the canonical record before retrying the original request.",
      );
    if (
      error instanceof WorkspaceError ||
      (error as Error).name === "AbortError"
    )
      throw error;
    throw new WorkspaceError(
      "Connection lost. No submission has been confirmed. Refresh the canonical record before retrying.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", externalAbort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
export const formatMoney = (minor: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format((minor || 0) / 100);
