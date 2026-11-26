import QrLinkPreview from "./QrLinkPreview";
import ChoiceField from "../ui/ChoiceField";
import React, { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
// Counter and takeout venues have no tables, so they only get menu codes.
type Props = { base: string; tables: any[]; demo: boolean; allowTables?: boolean };
const validCode = (value: any) => {
  if (
    !value ||
    typeof value.id !== "string" ||
    !["organization", "branch", "table"].includes(value.kind) ||
    typeof value.url !== "string"
  )
    return false;
  try {
    return ["https:", "http:"].includes(new URL(value.url).protocol);
  } catch {
    return false;
  }
};
export default function QrCodes(props: Props) {
  return <ScopedQrCodes key={props.base} {...props} />;
}
function ScopedQrCodes({ base, tables, demo, allowTables = true }: Props) {
  const [codes, setCodes] = useState<any[]>([]),
    [kind, setKind] = useState("branch"),
    [tableId, setTableId] = useState(""),
    [loadError, setLoadError] = useState(""),
    [writeError, setWriteError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<any>(null),
    [addressBlocked, setAddressBlocked] = useState(false);
  const active = useRef(true),
    generation = useRef(0);
  const read = async (signal?: AbortSignal) => {
    const version = ++generation.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await workspaceApi(
        base + "/qr-codes",
        "GET",
        undefined,
        signal,
      );
      if (!active.current || signal?.aborted || version !== generation.current)
        return;
      if (
        !Array.isArray(result?.codes) ||
        result.codes.some((code: any) => !validCode(code))
      )
        throw new Error("Invalid QR response");
      setCodes(result.codes);
      setAddressBlocked(false);
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === generation.current &&
        failure.name !== "AbortError"
      ) {
        setLoadError(
          failure.status === 503
            ? "The public menu address is not ready. Ask an administrator to verify it before sharing codes."
            : "Menu codes could not be loaded. Try again.",
        );
        setAddressBlocked(failure.status === 503);
      }
    } finally {
      if (active.current && !signal?.aborted && version === generation.current)
        setLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void read(controller.signal);
    return () => {
      active.current = false;
      generation.current++;
      controller.abort();
    };
  }, [base]);
  const create = async (body: any) => {
    if (busy || loading || addressBlocked) return;
    setBusy(true);
    setWriteError("");
    try {
      const created = await workspaceApi(base + "/qr-codes", "POST", body);
      if (!active.current) return;
      if (!validCode(created))
        throw new Error(
          "The new code could not be verified. Check the code list before retrying.",
        );
      setCodes((current) => [
        ...current.filter((code) => code.id !== created.id),
        created,
      ]);
      setPending(null);
    } catch (failure: any) {
      if (active.current) {
        setWriteError(
          failure.status === 503
            ? "The public menu address needs review before this code can be created."
            : failure.message,
        );
        if (failure.status === 503) setAddressBlocked(true);
        if (pending || !failure.status || failure.status >= 500)
          setPending(body);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const visible = codes.filter((code) => code.active !== false),
    knownTables = Array.isArray(tables) ? tables : [];
  return (
    <section className="mw-card mw-printing-qr" aria-label="Menu QR codes">
      <header className="mw-print-heading">
        <div>
          <h2>Menu QR codes</h2>
          <p>
            Preview, download or scan a code for the organization, this branch
            or a table.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy || loading}
          onClick={() => void read()}
        >
          Refresh menu codes
        </button>
      </header>
      <QrLinkPreview base={base} tables={knownTables} />
      <div className="mw-qr-address" role="note">
        <strong>{demo ? "Preview address" : "Public menu address"}</strong>
        <p>
          {demo
            ? "These preview links are not guaranteed to be publicly reachable. Verify a public HTTPS address before distributing them."
            : addressBlocked
              ? "Address verification is required before codes can be shared."
              : loading
                ? "Checking the configured menu address…"
                : loadError
                  ? "Address status is unavailable. Retry before sharing codes."
                  : "Codes use the configured menu address. Test the destination on a customer’s device before sharing."}
        </p>
        <p>
          Table codes identify a table, not a private party. Staff joining codes
          stay separate.
        </p>
      </div>
      {writeError && <p role="alert">{writeError}</p>}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() => void read()}
          >
            Retry loading menu codes
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading menu codes…</p>
      ) : loadError ? null : !visible.length ? (
        <div className="mw-qr-empty">
          <h3>
            {codes.length
              ? "No active menu codes"
              : "No menu codes have been created for this branch."}
          </h3>
          <p>Create a code below when its destination is ready.</p>
        </div>
      ) : (
        <div className="mw-qr-code-grid">
          {visible.map((code) => {
            const title =
                code.kind === "organization"
                  ? "Organization menu"
                  : code.kind === "table"
                    ? knownTables.find((table) => table.id === code.tableId)
                        ?.name || "Table menu"
                    : "Branch menu",
              image = `/api/mera/v1${base}/qr-codes/${encodeURIComponent(code.id)}/image`;
            return (
              <article className="mw-qr-code" key={code.id}>
                <h3>{title}</h3>
                <img
                  width="180"
                  height="180"
                  alt={`${code.kind} menu QR code`}
                  src={image + ".png"}
                />
                <a href={code.url} target="_blank" rel="noreferrer">
                  Open menu destination
                </a>
                <p className="mw-qr-destination">{code.url}</p>
                <div className="mw-actions">
                  <a download href={image + ".png"}>
                    Export PNG
                  </a>
                  <a download href={image + ".svg"}>
                    Export SVG
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <section className="mw-qr-create" aria-label="Create a menu code">
        <h3>Create a menu code</h3>
        <p>
          Codes are reusable. Creating the same destination returns its existing
          code.
        </p>
        {pending && (
          <div className="mw-note" role="status">
            <strong>Code creation unconfirmed</strong>
            <p>
              The original destination is retained. Retry it without changing
              the branch or table.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy || loading || addressBlocked}
              onClick={() => void create(pending)}
            >
              Retry original menu code
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending && !loadError)
              void create({ kind, ...(kind === "table" ? { tableId } : {}) });
          }}
        >
          <fieldset
            disabled={
              busy || loading || !!loadError || !!pending || addressBlocked
            }
            className="mw-qr-create-fields"
          >
            <div className="mw-form">
              <ChoiceField
                label={<>Menu destination</>}
                value={kind}
                onChange={(nextValue) => setKind(nextValue)}
              >
                <option value="organization">
                  Organization · choose a branch
                </option>
                <option value="branch">This branch</option>
                {allowTables && (
                  <option value="table">A specific table</option>
                )}
              </ChoiceField>
              {kind === "table" && (
                <ChoiceField
                  label={<>Table</>}
                  searchable
                  required
                  value={tableId}
                  onChange={(nextValue) => setTableId(nextValue)}
                >
                  <option value="">Choose a table</option>
                  {knownTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
                </ChoiceField>
              )}
              <button className="primary">
                {busy ? "Creating…" : "Create menu code"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
    </section>
  );
}
