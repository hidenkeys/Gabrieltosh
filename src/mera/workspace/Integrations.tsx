import React, { useEffect, useState } from "react";
import { workspaceApi } from "./api";
const scopes = [
  "published_menu.read",
  "orders.create",
  "orders.read",
  "reservations.create",
];
export default function Integrations({
  base,
  demo,
}: {
  base: string;
  demo: boolean;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(["published_menu.read"]);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(
      base + "/integration-credentials",
      "GET",
      undefined,
      controller.signal,
    )
      .then(setRows)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base]);
  return (
    <section className="mw-card">
      <h2>Integration access</h2>
      <p>
        Grant only the capabilities your integration needs. Every credential is
        limited to this organization and branch.
      </p>
      <div className="mw-note">
        <strong>
          {demo ? "Development simulator" : "Live access blocked"}
        </strong>
        <p>
          The Zidi adapter is a local, contract-tested simulator. Live access
          needs a verified provider contract and credentials. These keys cannot
          initiate real payments.
        </p>
      </div>
      <details>
        <summary>Zidi adapter capabilities & quote flow</summary>
        <p>
          Internal test adapter v1.1.0. The orders.create capability authorizes
          credential-bound pricing quotes and orders. Request a quote at POST
          /api/mera/v1/integrations/zidi/v1/quote with the current menu version
          and selected items, then submit its quoteId with the order before
          expiry. Quotes from staff sessions or another credential cannot be
          reused.
        </p>
        <p>
          Published menu responses include category snapshots, branch-local
          schedules, live size stock and pricing-policy requirements. Outbound
          event delivery remains blocked until the external signed-event
          contract is verified. This adapter does not confirm payments or move
          funds.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
      {token && (
        <div className="mw-note">
          <strong>Copy this credential now</strong>
          <p>
            It is shown once. Store it securely; never place it in a public menu
            or QR code.
          </p>
          <label>
            New development credential
            <input
              readOnly
              value={token}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <button type="button" onClick={() => setToken("")}>
            Hide credential
          </button>
        </div>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setToken("");
          try {
            const created = await workspaceApi(
              base + "/integration-credentials",
              "POST",
              { name, scopes: selected },
            );
            setToken(created.token);
            setRows(await workspaceApi(base + "/integration-credentials"));
            setName("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset
          disabled={busy || loading || !demo}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label>
            Credential name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>Allowed capabilities</legend>
            {scopes.map((scope) => (
              <label key={scope} className="mw-row">
                <span>{scope.replaceAll("_", " ")}</span>
                <input
                  type="checkbox"
                  checked={selected.includes(scope)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, scope]
                        : current.filter((value) => value !== scope),
                    )
                  }
                />
              </label>
            ))}
          </fieldset>
          <button className="primary" disabled={!selected.length}>
            Create simulator credential
          </button>
        </fieldset>
      </form>
      {loading ? (
        <p role="status">Loading scoped credentials…</p>
      ) : !rows.length ? (
        <p>No integration credentials for this branch.</p>
      ) : (
        rows.map((row) => (
          <article className="mw-card" key={row.id}>
            <h3>{row.name}</h3>
            <p>
              {row.active ? "Active simulator credential" : "Revoked"} ·{" "}
              {row.scopes.join(", ")}
            </p>
            {row.active && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await workspaceApi(
                      base +
                        "/integration-credentials/" +
                        encodeURIComponent(row.id),
                      "DELETE",
                    );
                    setRows((current) =>
                      current.map((value) =>
                        value.id === row.id
                          ? { ...value, active: false }
                          : value,
                      ),
                    );
                    setToken("");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Revoke access
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
