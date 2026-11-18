import { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
const access: Record<string, string[]> = {
  service: ["orders.fulfill", "tables.manage"],
  payment: ["payments.record", "refunds.approve"],
  reservation: ["reservations.manage"],
  other: ["organization.manage"],
};
export default function HelpRequests({
  base,
  disabled,
  save,
  permissions,
}: {
  base: string;
  disabled: boolean;
  permissions: string[];
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [requests, setRequests] = useState<any[]>([]),
    [category, setCategory] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const generation = useRef(0);
  const allowed = Object.keys(access).filter((category) =>
      access[category].some((p) => permissions.includes(p)),
    ),
    allowedKey = allowed.join(",");
  async function load() {
    const current = generation.current;
    try {
      const result = await workspaceApi<any>(base + "/help-requests");
      if (current !== generation.current) return;
      setRequests(result.requests);
      setError("");
      setUncertain(false);
    } catch (e) {
      if (current !== generation.current) return;
      setRequests([]);
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setRequests([]);
    setUncertain(false);
    if (allowedKey) void load();
    return () => {
      generation.current++;
    };
  }, [base, allowedKey]);
  if (!allowed.length)
    return <p>Your role cannot view customer help requests.</p>;
  return (
    <section className="mw-card">
      <h2>Customer help requests</h2>
      <p className="mw-note">
        Requests and replies stay inside this workspace and the customer’s
        current guest session. Email, SMS and push delivery are unavailable.
      </p>
      {error && <p role="alert">{error}</p>}
      {uncertain && (
        <p role="status">
          Update outcome is unknown. Refresh the canonical request before making
          another change.
        </p>
      )}
      <button disabled={disabled || busy} onClick={() => void load()}>
        Refresh help requests
      </button>
      <label>
        Help category
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">All permitted categories</option>
          {allowed.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {requests
        .filter(
          (request) =>
            allowed.includes(request.category) &&
            (category === "all" || request.category === category),
        )
        .map((request) => (
          <article key={request.id}>
            <h3>
              {request.reference} · {request.category}
            </h3>
            <p>{request.message}</p>
            <p>Status: {request.status}</p>
            {request.customerReply && (
              <p>Current customer-visible reply: {request.customerReply}</p>
            )}
            {request.internalNotes?.length > 0 && (
              <details>
                <summary>Private staff notes</summary>
                {request.internalNotes.map((note: any, index: number) => (
                  <p key={index}>{note.text}</p>
                ))}
              </details>
            )}
            <form
              key={request.id + request.updatedAt}
              onSubmit={async (event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget),
                  current = generation.current;
                setBusy(true);
                setError("");
                try {
                  await save(
                    base + "/help-requests/" + request.id,
                    "PATCH",
                    {
                      status: String(values.get("status")),
                      customerReply: String(values.get("reply")),
                      internalNote: String(values.get("note")),
                    },
                    "Help request updated inside the application.",
                  );
                  if (current === generation.current) await load();
                } catch (e) {
                  if (current !== generation.current) return;
                  setError((e as Error).message);
                  if (!(e as any).status || (e as any).status >= 500)
                    setUncertain(true);
                } finally {
                  if (current === generation.current) setBusy(false);
                }
              }}
            >
              <fieldset
                disabled={disabled || busy || uncertain}
                style={{ border: 0, padding: 0 }}
              >
                <label>
                  Request status
                  <select
                    name="status"
                    defaultValue={
                      request.status === "resolved"
                        ? "resolved"
                        : "acknowledged"
                    }
                  >
                    <option
                      value="acknowledged"
                      disabled={request.status === "resolved"}
                    >
                      Acknowledged
                    </option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
                <label>
                  Customer-visible reply
                  <textarea
                    name="reply"
                    maxLength={1000}
                    defaultValue={request.customerReply || ""}
                  />
                </label>
                <label>
                  Private staff note
                  <textarea name="note" maxLength={1000} />
                </label>
                <button>Save help response</button>
              </fieldset>
            </form>
          </article>
        ))}
      {!requests.some(
        (request) =>
          allowed.includes(request.category) &&
          (category === "all" || request.category === category),
      ) && <p>No help requests in this view.</p>}
    </section>
  );
}
