import { useRef, useState } from "react";
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
    [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
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
  const current = Number(target?.stock || 0),
    delta =
      type === "restock"
        ? Math.abs(change)
        : type === "correction"
          ? change
          : -Math.abs(change),
    next = current + delta;
  async function send(original?: any) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const correction = type === "correction";
    const body = original || {
      ...(correction
        ? {}
        : { requestKey: crypto.randomUUID(), type, expectedStock: current }),
      productId: product.id,
      ...(variantId ? { variantId } : {}),
      quantity: correction ? next : Math.abs(change),
      reason,
    };
    try {
      await save(
        base + (correction ? "/stock" : "/stock/movements"),
        "POST",
        body,
        "Stock updated.",
      );
      setPending(null);
      setOpen(false);
      setReason("");
      setChange(1);
    } catch (e: any) {
      setError(e.message || "Stock could not be saved. Review and try again.");
      if (!e.status || e.status >= 500) {
        if (correction) setUncertain(true);
        else setPending(body);
      }
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  if (!balances.length) return null;
  const frozen = busy || disabled || !!pending || uncertain;
  return (
    <>
      <button
        type="button"
        aria-label={`Adjust stock for ${product.name}`}
        className="secondary"
        disabled={disabled}
        onClick={() => {
          if (target.stockMode !== "counted") setVariant(balances[0].id);
          setOpen(true);
        }}
      >
        Adjust stock<span className="mi-sr-only"> for {product.name}</span>
      </button>
      <BottomSheet
        open={open}
        title={`Adjust stock · ${product.name}`}
        onClose={() => setOpen(false)}
        busy={busy || !!pending || uncertain}
      >
        <form
          className="mw-stock-sheet"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !frozen &&
              next >= 0 &&
              next <= 1000000 &&
              change !== 0 &&
              reason.trim().length >= (type === "correction" ? 3 : 10)
            )
              void send();
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
            Current balance <strong>{current}</strong>
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
            min={type === "correction" ? -current : 1}
            max={
              type === "restock"
                ? 1000000 - current
                : type === "correction"
                  ? 1000000 - current
                  : current
            }
            disabled={frozen}
            required
          />
          <Chips
            label="Quick stock change"
            value={String(delta)}
            onChange={(v) => {
              const n = Number(v);
              if (n < 0 && type === "restock") setType("correction");
              setChange(type === "correction" || n < 0 ? n : Math.abs(n));
            }}
            disabled={frozen}
            options={[1, 5, 10, -1, -5].map((n) => ({
              value: String(n),
              label: n > 0 ? `+${n}` : String(n),
              disabled: current + n < 0,
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
            Resulting balance <strong>{next}</strong>
          </p>
          {error && <p role="alert">{error}</p>}
          {pending ? (
            <div role="status">
              <p>
                We could not confirm the movement. Retry this same change to
                avoid counting it twice.
              </p>
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => void send(pending)}
              >
                Retry original stock movement
              </button>
            </div>
          ) : uncertain ? (
            <p role="alert">
              We could not confirm this count correction. Refresh the workspace
              and review the balance before making another change.
            </p>
          ) : (
            <button
              disabled={
                busy || disabled || next < 0 || next > 1000000 || change === 0
              }
            >
              Save stock change
            </button>
          )}
        </form>
      </BottomSheet>
    </>
  );
}
