import React, { useEffect, useState } from "react";
import { workspaceApi } from "./api";

type Props = {
  base: string;
  complaints: any[];
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export function Complaints({ base, complaints, disabled, save }: Props) {
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  return (
    <section className="mw-card">
      <h2>Customer care</h2>
      <p>
        Private feedback stays within your organization. Record the
        investigation and resolution; complaints are never published
        automatically.
      </p>
      {error && <p role="alert">{error}</p>}
      {!complaints.length ? (
        <p>No customer feedback for this branch.</p>
      ) : (
        complaints.map((row) => {
          const draft = drafts[row.id] || {
            status: row.status,
            resolution: row.resolution || "",
          };
          return (
            <article className="mw-card" key={row.id}>
              <h3>
                {row.category || "Feedback"} · {row.rating}/5
              </h3>
              <p>{row.text}</p>
              <p>
                Order {row.orderId} · {new Date(row.createdAt).toLocaleString()}
              </p>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError("");
                  try {
                    await save(
                      base + "/complaints/" + row.id,
                      "PATCH",
                      draft,
                      "Customer care record updated.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <fieldset disabled={disabled} style={{ border: 0, padding: 0 }}>
                  <div className="mw-form">
                    <label>
                      Case status
                      <select
                        value={draft.status}
                        onChange={(e) =>
                          setDrafts((current) => ({
                            ...current,
                            [row.id]: { ...draft, status: e.target.value },
                          }))
                        }
                      >
                        {["open", "investigating", "resolved"].map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Resolution
                      <textarea
                        maxLength={1000}
                        value={draft.resolution}
                        required={draft.status === "resolved"}
                        onChange={(e) =>
                          setDrafts((current) => ({
                            ...current,
                            [row.id]: { ...draft, resolution: e.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button className="secondary">Update care record</button>
                </fieldset>
              </form>
            </article>
          );
        })
      )}
    </section>
  );
}

export function Waitlist({
  base,
  disabled,
  save,
}: {
  base: string;
  disabled: boolean;
  save: Props["save"];
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState({
    displayName: "",
    partySize: 2,
    contact: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const load = async () => {
    const result = await workspaceApi(base + "/waitlist");
    setRows(Array.isArray(result) ? result : result.waitlist || []);
  };
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(base + "/waitlist", "GET", undefined, controller.signal)
      .then((result) =>
        setRows(Array.isArray(result) ? result : result.waitlist || []),
      )
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base]);
  const change = async (id: string, status: string) => {
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/waitlist/" + id,
        "PATCH",
        { status },
        "Waitlist updated.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="mw-card">
      <h2>Front desk waitlist</h2>
      <p>
        Keep walk-in parties in arrival order. “Notified” records that your team
        contacted the customer manually; no message is sent by this screen.
        Seating a party does not create a table visit automatically.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setWorking(true);
          setError("");
          try {
            await save(
              base + "/waitlist",
              "POST",
              draft,
              "Party added to the waitlist.",
            );
            setDraft({ displayName: "", partySize: 2, contact: "", notes: "" });
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setWorking(false);
          }
        }}
      >
        <fieldset
          disabled={disabled || working || loading}
          style={{ border: 0, padding: 0 }}
        >
          <div className="mw-form">
            <label>
              Party name
              <input
                required
                maxLength={100}
                value={draft.displayName}
                onChange={(e) =>
                  setDraft({ ...draft, displayName: e.target.value })
                }
              />
            </label>
            <label>
              Party size
              <input
                type="number"
                min={1}
                max={100}
                required
                value={draft.partySize}
                onChange={(e) =>
                  setDraft({ ...draft, partySize: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Contact
              <input
                maxLength={120}
                value={draft.contact}
                onChange={(e) =>
                  setDraft({ ...draft, contact: e.target.value })
                }
              />
            </label>
            <label>
              Front desk note
              <textarea
                maxLength={500}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
          </div>
          <button className="primary">Add waiting party</button>
        </fieldset>
      </form>
      {loading ? (
        <p role="status">Loading waitlist…</p>
      ) : !rows.length ? (
        <p>No parties on the waitlist.</p>
      ) : (
        rows.map((row) => (
          <article className="mw-card" key={row.id}>
            <h3>
              {row.displayName} · {row.partySize} guests
            </h3>
            <p>
              {row.status} · {row.contact || "No contact recorded"}
            </p>
            <p>{row.notes}</p>
            {!["seated", "cancelled"].includes(row.status) && (
              <div className="mw-actions">
                {row.status === "waiting" && (
                  <button
                    disabled={disabled || working}
                    onClick={() => void change(row.id, "notified")}
                  >
                    Mark manually notified
                  </button>
                )}
                <button
                  disabled={disabled || working}
                  onClick={() => void change(row.id, "seated")}
                >
                  Mark seated
                </button>
                <button
                  disabled={disabled || working}
                  onClick={() => void change(row.id, "cancelled")}
                >
                  Cancel waiting party
                </button>
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}
