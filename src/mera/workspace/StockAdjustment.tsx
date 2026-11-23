import { useEffect, useRef, useState } from "react";
import BottomSheet from "../ui/BottomSheet";
import Segmented from "../ui/Segmented";
import Chips from "../ui/Chips";
import Stepper from "../ui/Stepper";
import ReasonInput from "../ui/ReasonInput";
import Combobox from "../ui/Combobox";

type Props = {
  product: any;
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function StockAdjustment({
  product,
  base,
  disabled,
  save,
}: Props) {
  const [open, setOpen] = useState(false),
    [variantId, setVariant] = useState(""),
    [type, setType] = useState("restock"),
    [change, setChange] = useState(1),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<any>(null),
    [denied, setDenied] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    deniedRef = useRef(false),
    pendingRef = useRef<any>(null);
  const scope = base + "|" + product.id,
    bornScope = useRef(scope),
    renderedScope = useRef(scope);
  renderedScope.current = scope;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const currentScope = () =>
    alive.current &&
    renderedScope.current === bornScope.current &&
    !deniedRef.current;
  const balances = [
    { ...product, label: "Product balance" },
    ...(product.variants || []).map((v: any) => ({
      ...v,
      label: v.name || v.size,
    })),
  ].filter((b) => b.stockMode === "counted");
  const target = variantId
    ? product.variants?.find((v: any) => v.id === variantId)
    : product;
  const validTarget =
    target?.stockMode === "counted" &&
    Number.isSafeInteger(target?.stock) &&
    target.stock >= 0 &&
    target.stock <= 1000000;
  const current = pending ? pending.before : validTarget ? target.stock : null;
  const delta = pending
    ? pending.delta
    : type === "restock"
      ? Math.abs(change)
      : type === "correction"
        ? change
        : -Math.abs(change);
  const next = current === null ? null : current + delta;
  const validChange =
    validTarget &&
    Number.isSafeInteger(change) &&
    change !== 0 &&
    (type === "correction" || change > 0) &&
    next !== null &&
    next >= 0 &&
    next <= 1000000;
  async function send(original?: any) {
    if (lock.current || disabled || !currentScope()) return;
    const prior = !!pendingRef.current;
    if (
      !original &&
      !pendingRef.current &&
      (!validChange ||
        reason.trim().length < (type === "correction" ? 3 : 10) ||
        reason.length > (type === "correction" ? 300 : 500))
    )
      return;
    const correction = type === "correction";
    const attempt = original ||
      pendingRef.current || {
        correction,
        before: current,
        delta,
        path: base + (correction ? "/stock" : "/stock/movements"),
        body: {
          ...(correction
            ? {}
            : {
                requestKey: crypto.randomUUID(),
                type,
                expectedStock: current,
              }),
          productId: product.id,
          ...(variantId ? { variantId } : {}),
          quantity: correction ? next : Math.abs(change),
          reason,
        },
      };
    if (attempt.correction && prior) return;
    const requestedScope = scope;
    lock.current = true;
    pendingRef.current = attempt;
    setBusy(true);
    setError("");
    try {
      await save(attempt.path, "POST", attempt.body, "Stock updated.");
      if (!currentScope() || renderedScope.current !== requestedScope) return;
      pendingRef.current = null;
      setPending(null);
      setOpen(false);
      setReason("");
      setChange(1);
    } catch (e: any) {
      if (!currentScope() || renderedScope.current !== requestedScope) return;
      if ([401, 403, 404].includes(e.status)) {
        deniedRef.current = true;
        setDenied(true);
        setReason("");
        setError(
          "Stock access needs checking. Refresh the workspace or sign in again before changing stock.",
        );
      } else {
        setError(
          e.message || "Stock could not be saved. Review and try again.",
        );
        if (!prior && [400, 409, 422].includes(e.status)) {
          pendingRef.current = null;
          setPending(null);
        } else setPending(attempt);
      }
    } finally {
      lock.current = false;
      if (alive.current && renderedScope.current === requestedScope)
        setBusy(false);
    }
  }
  if (denied || scope !== bornScope.current)
    return (
      <p role="alert">
        {scope !== bornScope.current
          ? "The stock view changed. Refresh the workspace before making another change."
          : error}
      </p>
    );
  if (!balances.length && !pendingRef.current) return null;
  const frozen = busy || disabled || !!pending;
  return (
    <>
      <button
        type="button"
        aria-label={`Adjust stock for ${product.name}`}
        className="secondary"
        disabled={disabled}
        onClick={() => {
          if (!currentScope()) return;
          if (pendingRef.current) {
            setOpen(true);
            return;
          }
          if (target?.stockMode !== "counted")
            setVariant(balances[0].id === product.id ? "" : balances[0].id);
          setOpen(true);
        }}
      >
        Adjust stock<span className="mi-sr-only"> for {product.name}</span>
      </button>
      <BottomSheet
        open={open}
        title={`Adjust stock · ${product.name}`}
        onClose={() => setOpen(false)}
        busy={busy || !!pending}
      >
        <form
          className="mw-stock-sheet"
          onSubmit={(e) => {
            e.preventDefault();
            if (!frozen && validChange) void send();
          }}
        >
          {balances.length > 1 && (
            <Combobox
              label={`Stock target for ${product.name}`}
              value={variantId}
              onChange={(v) => {
                setVariant(v);
                setChange(1);
              }}
              options={balances.map((b) => ({
                value: b.id === product.id ? "" : b.id,
                label: b.label,
                description: `${b.stock} in stock`,
              }))}
              disabled={frozen}
            />
          )}
          <p>
            {pending ? "Balance before this request" : "Current balance"}{" "}
            <strong>{current === null ? "Unavailable" : current}</strong>
          </p>
          <Segmented
            label="Movement type"
            value={type}
            onChange={(v) => {
              setType(v);
              setChange(1);
              setReason("");
            }}
            disabled={frozen}
            options={[
              { value: "restock", label: "Restock" },
              { value: "waste", label: "Waste" },
              { value: "loss", label: "Loss" },
              { value: "correction", label: "Count correction" },
            ]}
          />
          <Stepper
            label={`Stock change for ${product.name}`}
            value={change}
            onChange={setChange}
            min={type === "correction" ? -(current ?? 0) : 1}
            max={
              type === "restock"
                ? 1000000 - (current ?? 0)
                : type === "correction"
                  ? 1000000 - (current ?? 0)
                  : (current ?? 0)
            }
            disabled={
              frozen ||
              !validTarget ||
              (type !== "restock" && type !== "correction" && current === 0)
            }
            required
          />
          <Chips
            label="Quick stock change"
            value={String(delta)}
            onChange={(v) => {
              const n = Number(v);
              setChange(type === "correction" ? n : Math.abs(n));
            }}
            disabled={frozen}
            options={(type === "correction"
              ? [1, 5, 10, -1, -5]
              : type === "restock"
                ? [1, 5, 10]
                : [-1, -5, -10]
            ).map((n) => ({
              value: String(n),
              label: n > 0 ? `+${n}` : String(n),
              disabled:
                current === null || current + n < 0 || current + n > 1000000,
            }))}
          />
          <ReasonInput
            label={`Stock reason for ${product.name}`}
            value={reason}
            onChange={setReason}
            presets={[
              "Delivery received",
              "Spilled stock",
              "Expired stock",
              "Staff meal",
              "Stock recount",
            ]}
            minLength={type === "correction" ? 3 : 10}
            maxLength={type === "correction" ? 300 : 500}
            required
            disabled={frozen}
          />
          <p aria-live="polite">
            Resulting balance{" "}
            <strong>{Number.isSafeInteger(next) ? next : "Unavailable"}</strong>
          </p>
          {error && <p role="alert">{error}</p>}
          {pending && !pending.correction ? (
            <div role="status">
              <p>
                We could not confirm the movement. Retry this same change to
                avoid counting it twice.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={busy || disabled}
                onClick={() => void send(pending)}
              >
                Retry original stock movement
              </button>
            </div>
          ) : pending?.correction ? (
            <p role="alert">
              We could not confirm this count correction. Refresh the workspace
              and review the balance before making another change.
            </p>
          ) : (
            <button
              className="primary"
              disabled={busy || disabled || !validChange}
            >
              Save stock change
            </button>
          )}
        </form>
      </BottomSheet>
    </>
  );
}
