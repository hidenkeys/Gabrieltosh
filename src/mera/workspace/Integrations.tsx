import React, { useEffect, useRef, useState } from "react";
import Switch from "../ui/Switch";
import { workspaceApi } from "./api";
import { DataRegion, Disclosure } from "../ui/OperationalPrimitives";
const scopes = [
  "published_menu.read",
  "orders.create",
  "orders.read",
  "reservations.create",
];
const scopeLabels: Record<string, string> = {
  "published_menu.read": "Read published menu",
  "orders.create": "Create orders and price quotes",
  "orders.read": "Read integration orders",
  "reservations.create": "Create reservations",
};
const scopeLabel = (scope: string) =>
  Object.prototype.hasOwnProperty.call(scopeLabels, scope)
    ? scopeLabels[scope]
    : "Capability not recognized";
type Props = { base: string; demo: boolean; newAccessAllowed?: boolean };
export default function Integrations(props: Props) {
  return <ScopedIntegrations key={props.base} {...props} />;
}
function ScopedIntegrations({ base, demo, newAccessAllowed = true }: Props) {
  const [rows, setRows] = useState<any[]>([]),
    [name, setName] = useState(""),
    [selected, setSelected] = useState<string[]>(["published_menu.read"]),
    [token, setToken] = useState(""),
    [writeError, setWriteError] = useState(""),
    [readError, setReadError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [unknownCreate, setUnknownCreate] = useState(false),
    [unknownRevoke, setUnknownRevoke] = useState<Record<string, boolean>>({});
  const active = useRef(true),
    generation = useRef(0);
  const read = async (signal?: AbortSignal) => {
    const version = ++generation.current;
    setLoading(true);
    try {
      const result = await workspaceApi(
        base + "/integration-credentials",
        "GET",
        undefined,
        signal,
      );
      if (!active.current || signal?.aborted || version !== generation.current)
        return;
      if (
        !Array.isArray(result) ||
        result.some(
          (row) =>
            !row || typeof row.id !== "string" || !Array.isArray(row.scopes),
        )
      )
        throw new Error("Invalid credential response");
      setRows(result);
      setReadError("");
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === generation.current &&
        failure.name !== "AbortError"
      )
        setReadError("Integration access could not be loaded. Try again.");
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
  const create = async () => {
    if (
      busy ||
      loading ||
      !demo ||
      !newAccessAllowed ||
      unknownCreate ||
      !selected.length
    )
      return;
    setBusy(true);
    setWriteError("");
    setToken("");
    try {
      const created = await workspaceApi(
        base + "/integration-credentials",
        "POST",
        { name, scopes: selected },
      );
      if (!active.current) return;
      if (typeof created?.token !== "string")
        throw new Error("Credential response could not be confirmed.");
      setToken(created.token);
      setName("");
      await read();
    } catch (failure: any) {
      if (active.current) {
        setWriteError(failure.message);
        if (!failure.status || failure.status >= 500) setUnknownCreate(true);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const revoke = async (row: any) => {
    if (busy) return;
    setBusy(true);
    setWriteError("");
    try {
      await workspaceApi(
        base + "/integration-credentials/" + encodeURIComponent(row.id),
        "DELETE",
      );
      if (!active.current) return;
      setRows((current) =>
        current.map((value) =>
          value.id === row.id ? { ...value, active: false } : value,
        ),
      );
      setUnknownRevoke((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setToken("");
    } catch (failure: any) {
      if (active.current) {
        setWriteError(failure.message);
        if (!failure.status || failure.status >= 500)
          setUnknownRevoke((current) => ({ ...current, [row.id]: true }));
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return (
    <section
      className="mw-card mw-management-utility"
      aria-label="Branch integration access"
    >
      <header className="mw-utility-heading">
        <div>
          <h2>Integration access</h2>
          <p>Review credentials limited to this organization and branch.</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy || loading}
          onClick={() => void read()}
        >
          Refresh integration access
        </button>
      </header>
      <p>Online payments: Coming soon — Mera wallet</p>
      <p>Zidi — coming soon, connect when credentials are issued</p>
      <div className="mw-utility-readiness">
        <strong>
          {demo ? "Development simulator" : "Live access blocked"}
        </strong>
        <p>
          This test adapter cannot initiate real payments. Live access requires
          verified provider approval and credentials.
        </p>
        {!newAccessAllowed && (
          <p>
            New integration access is paused. Existing access can still be
            reviewed or revoked.
          </p>
        )}
      </div>
      {writeError && <p role="alert">{writeError}</p>}
      {readError && (
        <div role="alert">
          <p>{readError}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() => void read()}
          >
            Retry loading integration access
          </button>
        </div>
      )}
      {token && (
        <div className="mw-note">
          <strong>Copy this credential now</strong>
          <p>
            It is shown once. Store it securely; never put it in a public menu
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
      {loading ? (
        <p role="status">Loading scoped credentials…</p>
      ) : readError ? null : !rows.length ? (
        <p>No integration credentials for this branch.</p>
      ) : (
        <DataRegion
          label="Scoped integration credentials"
          className="mw-utility-records"
        >
          {rows.map((row) => (
            <article className="mw-utility-record" key={row.id}>
              <header>
                <div>
                  <h3>{row.name || "Credential name unavailable"}</h3>
                  <p>
                    {row.active === true
                      ? "Active simulator credential"
                      : row.active === false
                        ? "Revoked"
                        : "Status unavailable"}
                  </p>
                </div>
                {row.active && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void revoke(row)}
                  >
                    {unknownRevoke[row.id]
                      ? "Retry revoking access"
                      : "Revoke access"}
                  </button>
                )}
              </header>
              {Number.isFinite(Date.parse(row.createdAt)) && (
                <p>
                  <time dateTime={row.createdAt}>
                    Created {new Date(row.createdAt).toLocaleString()}
                  </time>
                </p>
              )}
              <ul className="mw-utility-capabilities">
                {row.scopes.map((scope: string) => (
                  <li key={scope}>{scopeLabel(scope)}</li>
                ))}
              </ul>
              {unknownRevoke[row.id] && (
                <p role="status">
                  Revocation is unconfirmed. Refresh access or explicitly retry
                  revoking this same credential.
                </p>
              )}
            </article>
          ))}
        </DataRegion>
      )}
      <section className="mw-utility-create">
        <h3>Create test access</h3>
        <p>Choose only the capabilities this integration needs.</p>
        {unknownCreate && (
          <div className="mw-note" role="status">
            <strong>Credential creation unconfirmed</strong>
            <p>
              Refresh access and reconcile the original request before creating
              another credential. An empty list does not prove it failed, and
              the original secret cannot be retrieved from history.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy || loading}
              onClick={() => void read()}
            >
              Check existing integration access
            </button>
          </div>
        )}{" "}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!unknownCreate && !readError) void create();
          }}
        >
          <fieldset
            disabled={
              busy ||
              loading ||
              !!readError ||
              unknownCreate ||
              !demo ||
              !newAccessAllowed
            }
            className="mw-utility-credential-fields"
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
                <Switch
                  key={scope}
                  label={scopeLabel(scope)}
                  checked={selected.includes(scope)}
                  onChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, scope]
                        : current.filter((value) => value !== scope),
                    )
                  }
                  description={
                    {
                      "published_menu.read":
                        "Let the integration display the published menu and current item availability.",
                      "orders.create":
                        "Let it request prices and submit orders for this branch.",
                      "orders.read":
                        "Let it read only orders created with this integration credential.",
                      "reservations.create":
                        "Let it submit reservation requests for this branch.",
                    }[scope]
                  }
                />
              ))}
            </fieldset>
            <button className="primary" disabled={!selected.length}>
              Create simulator credential
            </button>
          </fieldset>
        </form>
      </section>{" "}
      <Disclosure
        summary="Zidi adapter capabilities & quote flow"
        className="mw-utility-advanced"
      >
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
      </Disclosure>
    </section>
  );
}
