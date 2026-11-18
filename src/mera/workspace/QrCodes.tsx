import React, { useEffect, useState } from "react";
import { workspaceApi } from "./api";

export default function QrCodes({
  base,
  tables,
  demo,
}: {
  base: string;
  tables: any[];
  demo: boolean;
}) {
  const [codes, setCodes] = useState<any[]>([]);
  const [kind, setKind] = useState("branch");
  const [tableId, setTableId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(base + "/qr-codes", "GET", undefined, controller.signal)
      .then((result) => setCodes(result.codes || []))
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
      <div className="mw-card-heading">
        <div>
          <h2>A menu in every customer’s hand</h2>
          <p>
            Create reusable codes for your organization, this branch or a table.
            These codes never contain a private visit token.
          </p>
        </div>
      </div>
      {demo && (
        <div className="mw-note">
          Development preview: these links use the preview server address. They
          are not guaranteed to be publicly reachable. Configure a public HTTPS
          origin before distributing codes.
        </div>
      )}
      {error && (
        <div role="alert" className="mw-note">
          QR codes unavailable: {error}
        </div>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const created = await workspaceApi(base + "/qr-codes", "POST", {
              kind,
              ...(kind === "table" ? { tableId } : {}),
            });
            setCodes((current) => [
              ...current.filter((code) => code.id !== created.id),
              created,
            ]);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mw-form">
          <label>
            Menu destination
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="organization">
                Organization · choose a branch
              </option>
              <option value="branch">This branch</option>
              <option value="table">A specific table</option>
            </select>
          </label>
          {kind === "table" && (
            <label>
              Table
              <select
                required
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
              >
                <option value="">Choose a table</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button className="primary" disabled={busy || loading}>
          {busy ? "Creating…" : "Create menu code"}
        </button>
      </form>
      {loading ? (
        <p role="status">Loading menu codes…</p>
      ) : !codes.length ? (
        <p>No menu codes have been created for this branch.</p>
      ) : (
        <div className="mw-grid">
          {codes
            .filter((code) => code.active !== false)
            .map((code) => (
              <article className="mw-card" key={code.id}>
                <h3>
                  {code.kind === "organization"
                    ? "Organization menu"
                    : code.kind === "table"
                      ? tables.find((table) => table.id === code.tableId)
                          ?.name || "Table menu"
                      : "Branch menu"}
                </h3>
                <img
                  width="180"
                  height="180"
                  alt={`${code.kind} menu QR code`}
                  src={`/api/mera/v1${base}/qr-codes/${encodeURIComponent(code.id)}/image.png`}
                />
                <p style={{ overflowWrap: "anywhere" }}>
                  <a href={code.url} target="_blank" rel="noreferrer">
                    Open menu destination
                  </a>
                </p>
                <div className="mw-actions">
                  <a
                    download
                    href={`/api/mera/v1${base}/qr-codes/${encodeURIComponent(code.id)}/image.png`}
                  >
                    Export PNG
                  </a>
                  <a
                    download
                    href={`/api/mera/v1${base}/qr-codes/${encodeURIComponent(code.id)}/image.svg`}
                  >
                    Export SVG
                  </a>
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}
