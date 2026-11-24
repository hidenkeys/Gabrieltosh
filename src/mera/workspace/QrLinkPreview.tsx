import { useEffect, useState } from "react";
import Combobox from "../ui/Combobox";
import { workspaceApi } from "./api";
export default function QrLinkPreview({
  base,
  tables,
}: {
  base: string;
  tables: any[];
}) {
  const [target, setTarget] = useState("counter"),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    setCopied(false);
    workspaceApi(
      base + "/qr-preview?target=" + encodeURIComponent(target),
      "GET",
      undefined,
      controller.signal,
    )
      .then((value) => {
        const url = new URL(value.url);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          !url.searchParams.has("preview") ||
          !Array.isArray(value.warnings) ||
          !["table_order", "counter_pickup", "menu_only"].includes(
            value.opensAs,
          )
        )
          throw Error("The preview could not be verified. Try again.");
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e.message || "Preview could not be loaded. Try again.");
      });
    return () => controller.abort();
  }, [base, target, retry]);
  return (
    <section className="mw-qr-preview" aria-label="QR link preview">
      <h3>Preview a QR link</h3>
      <Combobox
        label="Preview destination"
        value={target}
        onChange={(value) => setTarget(value || "counter")}
        options={[
          { value: "counter", label: "Counter" },
          ...tables.map((t) => ({ value: "table:" + t.id, label: t.name })),
        ]}
      />
      {error && (
        <div role="alert">
          {error}
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            Retry preview
          </button>
        </div>
      )}
      {!result && !error && <p role="status">Loading link preview…</p>}
      {result && (
        <>
          <p>
            Opens as:{" "}
            {
              {
                table_order: "Table ordering",
                counter_pickup: "Order and collect at the counter",
                menu_only: "Menu only",
              }[result.opensAs as string]
            }
          </p>
          <p className="mw-qr-destination">{result.url}</p>
          {result.warnings.map((warning: string, i: number) => (
            <p role="status" key={i}>
              {warning}
            </p>
          ))}
          <div className="mw-actions">
            <a href={result.url} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.url);
                  setCopied(true);
                } catch {
                  setError(
                    "Link could not be copied. Select and copy the address above.",
                  );
                }
              }}
            >
              Copy link
            </button>
            {copied && <span role="status">Link copied</span>}
          </div>
          <div className="mw-qr-phone">
            <div>Preview - orders are off</div>
            <iframe title="Guest menu preview" src={result.url} />
          </div>
        </>
      )}
    </section>
  );
}
