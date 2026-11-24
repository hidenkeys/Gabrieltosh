import { useEffect, useRef, useState } from "react";
import Combobox from "../ui/Combobox";
import Stepper from "../ui/Stepper";
import { workspaceApi } from "./api";
import { uuid } from "../../api";
export function TransferReceipt({
  transfer,
  disabled,
  onReceive,
}: {
  transfer: any;
  disabled?: boolean;
  onReceive: (lines: any[]) => void;
}) {
  const [quantities, setQuantities] = useState<number[]>(
    transfer.lines.map((l: any) => l.quantity),
  );
  const loss = transfer.lines.reduce(
    (n: number, l: any, i: number) => n + l.quantity - quantities[i],
    0,
  );
  return (
    <div>
      {transfer.lines.map((l: any, i: number) => (
        <Stepper
          key={i}
          label={`Received ${l.name}`}
          value={quantities[i]}
          max={l.quantity}
          disabled={disabled}
          onChange={(q) =>
            setQuantities(quantities.map((v, index) => (index === i ? q : v)))
          }
        />
      ))}
      <p role="status">
        Loss: {loss} units
        {loss > 0
          ? " · These missing units will be recorded as transfer loss at the sending location."
          : " · All sent units accounted for."}
      </p>
      <button
        disabled={disabled}
        onClick={() =>
          onReceive(
            transfer.lines.map((l: any, i: number) => ({
              code: l.code,
              variantName: l.variantName ?? null,
              receivedQuantity: quantities[i],
            })),
          )
        }
      >
        Receive transfer
      </button>
    </div>
  );
}
export default function StockTransfers({
  organizationId,
  actorId = "current-session",
  branches,
  branchId,
  central = false,
  membershipPermissions = [],
}: {
  organizationId: string;
  actorId?: string;
  branches: any[];
  branchId: string;
  central?: boolean;
  membershipPermissions?: string[];
}) {
  const base = `/organizations/${encodeURIComponent(organizationId)}/stock-transfers`;
  const [from, setFrom] = useState(branchId),
    [to, setTo] = useState(""),
    [items, setItems] = useState<any[]>([]),
    [lines, setLines] = useState<any[]>([{ item: "", quantity: 1 }]),
    [note, setNote] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState<any>(null);
  const durable = useVenueWrite(
    actorId,
    `/organizations/${encodeURIComponent(organizationId)}/`,
  );
  const lock = useRef(false);
  const can = (id: string, permission: string) =>
    (
      branches.find((b) => b.id === id)?.permissions ?? membershipPermissions
    ).includes(permission);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    workspaceApi(base, "GET", undefined, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setRows(r.transfers);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [base, revision]);
  useEffect(() => {
    const c = new AbortController();
    setItems([]);
    const sourcePermissions =
      branches.find((b) => b.id === from)?.permissions ?? membershipPermissions;
    if (!sourcePermissions.includes("stock.transfer")) return () => c.abort();
    if (
      !sourcePermissions.some((p: string) =>
        [
          "menu.edit",
          "menu.publish",
          "stock.adjust",
          "orders.create",
          "orders.view",
        ].includes(p),
      )
    ) {
      setError(
        "Stock sending needs stock or menu access to choose items at this location.",
      );
      return () => c.abort();
    }
    if (from)
      workspaceApi(
        `/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(from)}/workspace`,
        "GET",
        undefined,
        c.signal,
      )
        .then((r) => {
          if (!c.signal.aborted)
            setItems(
              (r.products || [])
                .flatMap((p: any) => [
                  ...(p.stockMode === "counted"
                    ? [{ ...p, variantName: null }]
                    : []),
                  ...(p.variants || [])
                    .filter((v: any) => v.stockMode === "counted")
                    .map((v: any) => ({
                      ...v,
                      id: p.id + ":" + v.id,
                      code: p.code,
                      name: p.name + " · " + v.name,
                      variantName: v.name,
                    })),
                ])
                .filter((p: any) => p.code),
            );
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        });
    return () => c.abort();
  }, [from, organizationId]);
  async function write(path: string, body: any) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const request = durable.pending ||
      pending || { path, body: { ...body, requestKey: uuid() } };
    setPending(request);
    try {
      await durable.write(request.path, "POST", request.body);
      setPending(null);
      setRevision((r) => r + 1);
      if (request.path === base) {
        setLines([{ item: "", quantity: 1 }]);
        setNote("");
      }
    } catch (e: any) {
      setError(e.message);
      if (e.status && e.status < 500) setPending(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const savedRequest = durable.pending || pending;
  const frozen = !!savedRequest || busy || durable.busy;
  const options = branches.map((b) => ({
    value: b.id,
    label: `${b.settings?.code || ""} ${b.name}`,
    description:
      b.settings?.role === "stock_room" ? "Central store" : "Location",
  }));
  return (
    <section className="mw-card mw-stock-transfers">
      <h2>Stock transfers</h2>
      {(error || durable.error) && <p role="alert">{error || durable.error}</p>}
      {savedRequest?.blocked && (
        <p role="alert">
          A saved transfer request needs review before another change can be
          sent.
        </p>
      )}
      {savedRequest && !busy && (
        <button
          disabled={savedRequest.blocked}
          onClick={() => void write(savedRequest.path, savedRequest.body)}
        >
          Retry original transfer request
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            !can(from, "stock.transfer") ||
            from === to ||
            lines.some((l) => !items.some((p) => p.id === l.item))
          )
            return;
          void write(base, {
            fromBranchId: from,
            toBranchId: to,
            note,
            lines: lines.map((l) => {
              const p = items.find((p) => p.id === l.item);
              return {
                code: p.code,
                variantName: p.variantName,
                quantity: l.quantity,
              };
            }),
          });
        }}
      >
        <h3>{central ? "Send to locations" : "Send stock"}</h3>
        <fieldset disabled={frozen}>
          <Combobox
            label="From location"
            value={from}
            onChange={(v) => {
              setFrom(v);
              setLines([{ item: "", quantity: 1 }]);
            }}
            required
            options={options.filter((b) => can(b.value, "stock.transfer"))}
          />
          <Combobox
            label="To location"
            value={to}
            onChange={setTo}
            required
            options={options.filter((b) => b.value !== from)}
          />
          {lines.map((line, i) => (
            <div key={i} className="mw-form">
              <Combobox
                label={`Item ${i + 1}`}
                value={line.item}
                onChange={(v) =>
                  setLines(
                    lines.map((l, index) =>
                      index === i ? { ...l, item: v } : l,
                    ),
                  )
                }
                required
                options={items
                  .filter(
                    (p) =>
                      !lines.some((l, index) => index !== i && l.item === p.id),
                  )
                  .map((p) => ({
                    value: p.id,
                    label: p.name,
                    description: `${p.code} · ${p.stock} available`,
                  }))}
              />
              <Stepper
                label={`Quantity ${i + 1}`}
                value={line.quantity}
                min={1}
                max={1000000}
                onChange={(q) =>
                  setLines(
                    lines.map((l, index) =>
                      index === i ? { ...l, quantity: q } : l,
                    ),
                  )
                }
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLines(lines.filter((_, index) => index !== i))
                  }
                >
                  Remove item {i + 1}
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines([...lines, { item: "", quantity: 1 }])}
          >
            Add item
          </button>
          <label>
            Note (optional)
            <textarea
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={!to || !can(from, "stock.transfer")}
          >
            Send transfer
          </button>
        </fieldset>
      </form>
      <h3>Transfer history</h3>
      {loading && <p role="status">Loading transfers…</p>}
      {!loading && !rows.length && <p>No transfers yet.</p>}
      <button onClick={() => setRevision((r) => r + 1)} disabled={busy}>
        Refresh transfers
      </button>
      {rows.map((t) => (
        <article key={t.id}>
          <h4>
            {branches.find((b) => b.id === t.fromBranchId)?.name} →{" "}
            {branches.find((b) => b.id === t.toBranchId)?.name}
          </h4>
          <span className="mw-status-chip">{t.status}</span>
          <ul>
            {t.lines.map((l: any, i: number) => (
              <li key={i}>
                {l.name} · {l.quantity} sent
                {l.receivedQuantity !== null
                  ? ` · ${l.receivedQuantity} received`
                  : ""}
              </li>
            ))}
          </ul>
          {t.status === "sent" && (
            <>
              {can(t.toBranchId, "stock.receive") && (
                <TransferReceipt
                  key={t.id + t.version}
                  transfer={t}
                  disabled={frozen}
                  onReceive={(received) =>
                    void write(`${base}/${t.id}/receive`, {
                      version: t.version,
                      lines: received,
                    })
                  }
                />
              )}
              {can(t.fromBranchId, "stock.transfer") && (
                <button
                  disabled={frozen}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancel this transfer and restore stock to the sending location?",
                      )
                    )
                      void write(`${base}/${t.id}/cancel`, {
                        version: t.version,
                      });
                  }}
                >
                  Cancel transfer
                </button>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}

// New writes retain their exact body across navigation and reload. Storage refusal
// blocks dispatch; only an explicit retry sends a saved request again.
export function useVenueWrite(actorId: string, scope: string) {
  const key = `mera:venue-write:${encodeURIComponent(actorId)}:${encodeURIComponent(scope)}`;
  const read = () => {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return null;
      const request = JSON.parse(raw);
      if (
        request.actorId !== actorId ||
        typeof request.path !== "string" ||
        !request.path.startsWith(scope) ||
        !["POST", "PATCH", "DELETE"].includes(request.method) ||
        typeof request.body?.requestKey !== "string"
      )
        return { blocked: true };
      return request;
    } catch {
      return { blocked: true };
    }
  };
  const [pending, setPending] = useState<any>(read),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const currentKey = useRef(key),
    lock = useRef(false),
    original = useRef<any>(pending);
  // Consumers key their page by scope; this also prevents dispatch during a scope transition.
  useEffect(() => {
    currentKey.current = key;
    original.current = read();
    setPending(original.current);
    setError("");
  }, [key]);
  async function write(path: string, method: string, body: any) {
    if (lock.current || currentKey.current !== key)
      throw Error(
        "The original request is still running. Check it before continuing.",
      );
    if (original.current?.blocked)
      throw Error("The saved request needs review. No new change was sent.");
    const saved = original.current || {
      actorId,
      path,
      method,
      body: structuredClone({ ...body, requestKey: body.requestKey || uuid() }),
    };
    if (original.current && (path !== saved.path || method !== saved.method))
      throw Error("Retry the original request before starting another change.");
    if (!path.startsWith(scope))
      throw Error("Choose a location in this workspace.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const encoded = JSON.stringify(saved);
      window.sessionStorage.setItem(key, encoded);
      if (window.sessionStorage.getItem(key) !== encoded)
        throw Error("The request could not be saved. No change was sent.");
      original.current = saved;
      setPending(saved);
      const result = await workspaceApi(
        saved.path,
        saved.method,
        saved.body,
        undefined,
        { expectedActorId: actorId },
      );
      window.sessionStorage.removeItem(key);
      original.current = null;
      if (currentKey.current === key) setPending(null);
      return result;
    } catch (e: any) {
      if (e.status && e.status < 500 && ![408, 429].includes(e.status)) {
        window.sessionStorage.removeItem(key);
        original.current = null;
        if (currentKey.current === key) setPending(null);
      }
      if (currentKey.current === key)
        setError(
          e.message ||
            "The change could not be confirmed. Retry the original request.",
        );
      throw e;
    } finally {
      lock.current = false;
      if (currentKey.current === key) setBusy(false);
    }
  }
  return { pending, busy, error, write };
}
