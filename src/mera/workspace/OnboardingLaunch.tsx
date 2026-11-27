import { useEffect, useRef, useState } from "react";
import GuestMenuPreview from "./GuestMenuPreview";
import { workspaceApi } from "./api";
export default function OnboardingLaunch({
  base,
  organization,
  branding,
  items,
  capabilities,
  contact,
  methods,
  save,
  disabled,
  onFix,
  onFinished,
}: {
  base: string;
  organization: any;
  branding: any;
  items: any[];
  capabilities: string[];
  contact: string;
  methods: string[];
  save: any;
  disabled: boolean;
  onFix: (step: number) => void;
  onFinished: () => void;
}) {
  const [readiness, setReadiness] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState<any>(null),
    [count, setCount] = useState("0");
  const flight = useRef(false);
  const key = `mera:onboarding-launch:v1:${base}`;
  async function check() {
    setReadiness(await workspaceApi(base + "/readiness"));
  }
  useEffect(() => {
    check().catch((e) => setError(e.message));
  }, [base]);
  async function launch() {
    if (disabled || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      if (readiness?.launchState !== "published") {
        let pending = JSON.parse(window.sessionStorage.getItem(key) || "null");
        if (!pending) {
          const preview = await workspaceApi(
            base + "/menu/publication-preview",
          );
          if (!preview.products?.length)
            throw Error("Add at least one available menu item.");
          pending = {
            requestKey: crypto.randomUUID(),
            previewHash: preview.previewHash,
            expectedVersion: preview.publishedVersion,
          };
          window.sessionStorage.setItem(key, JSON.stringify(pending));
          if (window.sessionStorage.getItem(key) !== JSON.stringify(pending))
            throw Error("Could not save your launch attempt. Try again.");
        }
        // The original request key and reviewed version survive an uncertain response.
        await save(base + "/menu/publish", "POST", pending, "Menu published.");
        const reviewed = await save(
          base + "/launch-policy",
          "PATCH",
          {
            manualPaymentMethods: methods,
            publicContact: contact,
            launchAcknowledged: true,
          },
          "Payment choices saved.",
        );
        setReadiness(reviewed);
        if (!reviewed?.canPublish)
          throw Error("Finish the remaining checks below, then try again.");
        const launched = await save(
          base + "/launch",
          "POST",
          { confirm: true },
          "You are live.",
        );
        if (launched?.launchState !== "published")
          throw Error("Launch could not be confirmed. Recheck readiness.");
        setReadiness(launched);
      }
      const codes = await workspaceApi(base + "/qr-codes");
      const branchCode =
        codes.codes?.find(
          (c: any) => c.kind === "branch" && c.active !== false,
        ) ||
        (await save(
          base + "/qr-codes",
          "POST",
          { kind: "branch" },
          "QR created.",
        ));
      if (!branchCode?.id || !branchCode?.url)
        throw Error("The menu is live. Retry to finish creating your QR.");
      const completed = await save(
        base.split("/branches/")[0] + "/onboarding",
        "PATCH",
        { step: 5, complete: true, data: {} },
        "Setup complete.",
      );
      if (!completed?.onboarding?.completedAt)
        throw Error(
          "Setup completion could not be confirmed. Retry to finish.",
        );
      setCode(branchCode);
      window.sessionStorage.removeItem(key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      flight.current = false;
    }
  }
  async function tables() {
    if (
      flight.current ||
      disabled ||
      !Number.isInteger(Number(count)) ||
      Number(count) < 1 ||
      Number(count) > 100
    )
      return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await workspaceApi(base + "/workspace");
      const existing = await workspaceApi(base + "/qr-codes");
      // A retry or second click must not print a second QR for the same table.
      const covered = new Set(
        (existing.codes || [])
          .filter((c: any) => c.kind === "table" && c.active !== false)
          .map((c: any) => c.tableId),
      );
      for (let i = 1; i <= Number(count); i++) {
        const name = `Table ${i}`;
        const table =
          data.tables?.find((t: any) => t.name === name) ||
          (await save(
            base + "/tables",
            "POST",
            { name, capacity: 2, zone: "Main floor", x: 0, y: 0 },
            "Table created.",
          ));
        if (!table?.id) throw Error("Table creation could not be confirmed.");
        if (covered.has(table.id)) continue;
        await save(
          base + "/qr-codes",
          "POST",
          { kind: "table", tableId: table.id },
          "Table QR created.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Go live">
      {items.length ? (
        <GuestMenuPreview
          organization={organization}
          branding={branding}
          items={items}
        />
      ) : (
        <p>Add menu items to preview your menu.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {readiness?.checks
        ?.filter((c: any) => c.status !== "ready")
        .map((c: any) => (
          <div key={c.id}>
            <p>
              {c.label}: {c.detail}
            </p>
            <button
              type="button"
              onClick={() =>
                onFix(
                  c.id === "menu" ? 8 : c.id === "manual_branch_policy" ? 5 : 1,
                )
              }
            >
              Fix {c.label}
            </button>
          </div>
        ))}
      {capabilities.includes("table_service") && (
        <details>
          <summary>Add tables (optional)</summary>
          <label>
            Number of tables
            <input
              inputMode="numeric"
              pattern="[0-9]+"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={
              disabled ||
              busy ||
              !Number.isInteger(Number(count)) ||
              Number(count) < 1 ||
              Number(count) > 100
            }
            onClick={tables}
          >
            Create tables and QRs
          </button>
        </details>
      )}
      {code ? (
        <div role="status">
          <h3>Your menu is live</h3>
          <a href={code.url} target="_blank" rel="noreferrer">
            Open menu
          </a>
          <a
            href={`/api/mera/v1${base}/qr-codes/${code.id}/image.png`}
            download
          >
            Download QR
          </a>
          <a href={code.url} target="_blank" rel="noreferrer">
            Place a test order
          </a>
          <button type="button" onClick={onFinished}>
            Continue to overview
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary"
          disabled={disabled || busy}
          onClick={launch}
        >
          {busy ? "Going live…" : "Go live"}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => check().catch((e) => setError(e.message))}
      >
        Recheck readiness
      </button>
    </section>
  );
}
