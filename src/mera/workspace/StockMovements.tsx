import { useEffect, useState } from "react";
import { workspaceApi } from "./api";
export default function StockMovements({
  base,
  products,
  disabled,
  save,
}: {
  base: string;
  products: any[];
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [productId, setProduct] = useState(""),
    [variantId, setVariant] = useState(""),
    [type, setType] = useState("restock"),
    [quantity, setQuantity] = useState(""),
    [reason, setReason] = useState(""),
    [pending, setPending] = useState<any>(null),
    [rows, setRows] = useState<any[]>([]),
    [older, setOlder] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const product = products.find((p) => p.id === productId),
    target = variantId
      ? product?.variants?.find((v: any) => v.id === variantId)
      : product;
  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    setError("");
    workspaceApi(
      base +
        "/stock/movements?take=100" +
        (productId ? "&productId=" + encodeURIComponent(productId) : ""),
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!Array.isArray(result.movements))
          throw new Error("Stock history is unavailable.");
        setRows(result.movements);
        setOlder(result.hasOlder);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [base, productId, revision]);
  const send = async (body: any) => {
    setError("");
    try {
      await save(
        base + "/stock/movements",
        "POST",
        body,
        "Stock movement recorded.",
      );
      setPending(null);
      setRevision((v) => v + 1);
    } catch (e: any) {
      setError(e.message);
      if (!e.status || e.status >= 500) setPending(body);
    }
  };
  return (
    <section className="mw-card">
      <h2>Restock, waste & loss</h2>
      <p>
        Counted stock only. These movements change inventory; refunds never
        automatically restock it.
      </p>
      {error && <p role="alert">{error}</p>}
      {pending ? (
        <div className="mw-note">
          <p>
            Movement outcome unconfirmed. The original quantity and stock
            expectation are retained.
          </p>
          <button disabled={disabled} onClick={() => void send(pending)}>
            Retry original stock movement
          </button>
        </div>
      ) : (
        <form
          className="mw-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send({
              requestKey: crypto.randomUUID(),
              productId,
              ...(variantId ? { variantId } : {}),
              type,
              quantity: Number(quantity),
              expectedStock: target.stock,
              reason,
            });
          }}
        >
          <label>
            Stock product
            <select
              required
              value={productId}
              onChange={(e) => {
                setProduct(e.target.value);
                setVariant("");
              }}
            >
              <option value="">Choose product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stock size
            <select
              value={variantId}
              onChange={(e) => setVariant(e.target.value)}
            >
              <option value="">Product balance</option>
              {product?.variants?.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name || v.size}
                </option>
              ))}
            </select>
          </label>
          <label>
            Movement type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="restock">Restock</option>
              <option value="waste">Waste</option>
              <option value="loss">Loss</option>
            </select>
          </label>
          <label>
            Units
            <input
              required
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label>
            Movement reason
            <input
              required
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p>
            Current balance:{" "}
            {target?.stockMode === "counted"
              ? target.stock
              : "Unlimited; choose a counted balance"}
          </p>
          <button disabled={disabled || target?.stockMode !== "counted"}>
            Record stock movement
          </button>
        </form>
      )}
      <h3>Latest movement history</h3>
      {rows.map((row) => (
        <p key={row.id}>
          {row.createdAt} · {row.type || "Adjustment"} ·{" "}
          {row.delta > 0 ? "+" : ""}
          {row.delta} · {row.before} → {row.after}
          <br />
          {row.reason}
        </p>
      ))}
      {!rows.length && <p>No movements loaded.</p>}
      {older && (
        <p>
          Showing latest 100 movements; older records remain in the audit
          history.
        </p>
      )}
    </section>
  );
}
