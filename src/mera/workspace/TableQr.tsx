import { useRef, useState } from "react";
import { workspaceApi } from "./api";
export default function TableQr({
  base,
  table,
  disabled,
}: {
  base: string;
  table: any;
  disabled: boolean;
}) {
  const [code, setCode] = useState<any>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const flight = useRef(false);
  const preview = useRef<HTMLElement>(null);
  return (
    <div className="mw-table-qr">
      <button
        className="secondary"
        type="button"
        disabled={disabled || busy}
        onClick={async () => {
          if (flight.current) return;
          if (code) {
            setOpen(!open);
            return;
          }
          flight.current = true;
          setBusy(true);
          setError("");
          try {
            const result = await workspaceApi(base + "/qr-codes", "POST", {
              kind: "table",
              tableId: table.id,
            });
            if (
              !result?.id ||
              result.kind !== "table" ||
              result.tableId !== table.id
            )
              throw Error("The table code could not be verified. Try again.");
            setCode(result);
            setOpen(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            flight.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Loading QR…" : "Show QR"}
      </button>
      {error && <p role="alert">{error}</p>}
      {open && code && (
        <section ref={preview}
          aria-label={`QR for ${table.name}`}
          className="mw-table-qr-preview"
        >
          <h3>{table.name}</h3>
          <img
            width="180"
            height="180"
            alt={`QR for ${table.name}`}
            src={`/api/mera/v1${base}/qr-codes/${encodeURIComponent(code.id)}/image.png`}
          />
          <div className="mw-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => {
                preview.current?.setAttribute("data-printing", "true");
                try { window.print(); } finally { preview.current?.removeAttribute("data-printing"); }
              }}
            >
              Print QR
            </button>
            <a
              download={`${table.name}-qr.png`}
              href={`/api/mera/v1${base}/qr-codes/${encodeURIComponent(code.id)}/image.png`}
            >
              Download
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
