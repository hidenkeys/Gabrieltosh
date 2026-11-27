import { useRef, useState } from "react";
import MenuStockStep from "./setup/MenuStockStep";
export default function PostLaunchSettings({
  organization,
  branches,
  save,
  disabled,
}: {
  organization: any;
  branches: any[];
  save: any;
  disabled: boolean;
}) {
  const [operating, setOperating] = useState({
    menuMode: "per_location",
    inventoryMode: "per_location",
    version: 1,
    ...organization.operating,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const key = `mera:operating-setup:v1:${organization.id}`;
  const flight = useRef(false);
  if (branches.filter((b) => b.settings?.role !== "stock_room").length < 2)
    return null;
  return (
    <details className="mw-card">
      <summary>Shared menus and central stock</summary>
      <MenuStockStep
        {...operating}
        onChange={(patch) => {
          if (!busy) setOperating({ ...operating, ...patch });
        }}
      />
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={async () => {
          if (flight.current) return;
          flight.current = true;
          setBusy(true);
          setError("");
          try {
            const body = JSON.parse(
              window.sessionStorage.getItem(key) || "null",
            ) || {
              requestKey: crypto.randomUUID(),
              version: operating.version,
              menuMode: operating.menuMode,
              inventoryMode: operating.inventoryMode,
            };
            window.sessionStorage.setItem(key, JSON.stringify(body));
            const result = await save(
              `/organizations/${organization.id}/operating`,
              "PATCH",
              body,
              "Menu and stock settings saved.",
            );
            if (!Number.isInteger(result?.version))
              throw Error(
                "Settings could not be confirmed. Retry the saved choices.",
              );
            window.sessionStorage.removeItem(key);
            setOperating({ ...operating, ...body, version: result.version });
            setNotice("Saved");
          } catch (e) {
            if ([400, 409, 422].includes((e as any).status))
              window.sessionStorage.removeItem(key);
            setError((e as Error).message);
          } finally {
            setBusy(false);
            flight.current = false;
          }
        }}
      >
        Save menu and stock settings
      </button>
    </details>
  );
}
