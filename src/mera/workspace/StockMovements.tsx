import { useEffect, useState } from "react";
import { workspaceApi } from "./api";
import StockAdjustment from "./StockAdjustment";
import Combobox from "../ui/Combobox";
export default function StockMovements({
  base,
  onTransfers,
  products,
  disabled,
  save,
}: {
  base: string;
  onTransfers?: () => void;
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
    [rows, setRows] = useState<any[]>([]),
    [older, setOlder] = useState(false),
    [loadError, setLoadError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const product = products.find((p) => p.id === productId);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    setLoadError("");
    setOlder(false);
    if (!productId) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    workspaceApi(
      base +
        "/stock/movements?take=100" +
        (productId ? "&productId=" + encodeURIComponent(productId) : ""),
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.movements))
          throw new Error("Stock history is unavailable.");
        setRows(result.movements);
        setOlder(result.hasOlder);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError")
          setLoadError("Stock movements could not be loaded. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, productId, revision]);
  return (
    <section className="mw-card">
      <h2>Restock, waste & loss</h2>
      {onTransfers && (
        <button className="secondary" onClick={onTransfers}>
          Stock transfers
        </button>
      )}
      <p>
        Counted stock only. These movements change inventory; refunds never
        automatically restock it.
      </p>
      <Combobox
        label="Stock product"
        value={productId}
        onChange={setProduct}
        options={products.map((p) => ({
          value: p.id,
          label: p.name,
          description:
            p.stockMode === "counted"
              ? `${p.stock} in stock`
              : "Unlimited stock",
          searchText: `${p.name} ${p.code || ""} ${p.category || ""}`,
        }))}
      />
      {product && (
        <StockAdjustment
          key={product.id}
          product={product}
          base={base}
          disabled={disabled}
          save={async (...args) => {
            const result = await save(...args);
            setRevision((v) => v + 1);
            return result;
          }}
        />
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
      {!productId && <p>Choose a product to see its stock movements.</p>}
      {loading && <p role="status">Loading stock movements…</p>}
      {loadError && (
        <div role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            Retry loading movements
          </button>
        </div>
      )}
      {productId && !loading && !loadError && !rows.length && (
        <p>No stock movements for this product.</p>
      )}
      {older && (
        <p>
          Showing latest 100 movements; older records remain in the audit
          history.
        </p>
      )}
    </section>
  );
}
