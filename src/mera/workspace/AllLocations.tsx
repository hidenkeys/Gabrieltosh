import { useVenueWrite } from "./StockTransfers";
import { useEffect, useRef, useState } from "react";
import DateRangePresets from "../ui/DateRangePresets";
import { formatMoney, workspaceApi } from "./api";
import { uuid } from "../../api";
import { LocationTag } from "./LocationSwitcher";
export default function AllLocations({
  organizationId,
  actorId = "current-session",
  branchBase,
  branches = [],
  onLocation,
  canExport = false,
}: {
  organizationId: string;
  actorId?: string;
  branchBase: string;
  branches?: any[];
  onLocation: (id: string) => void;
  canExport?: boolean;
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [range, setRange] = useState({ from: today, to: today }),
    [preset, setPreset] = useState("today"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [sort, setSort] = useState("revenue"),
    [descending, setDescending] = useState(true),
    [exportMessage, setExportMessage] = useState(""),
    [exporting, setExporting] = useState(false);
  const exportWrite = useVenueWrite(actorId, branchBase + "/exports");
  const exportRequest = useRef<any>(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    workspaceApi(
      `/organizations/${encodeURIComponent(organizationId)}/overview?from=${range.from}&to=${range.to}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [organizationId, range.from, range.to, revision]);
  const location = (id: string) =>
    branches.find((b) => b.id === id)?.name ||
    data?.branches.find((b: any) => b.id === id)?.name ||
    "Location";
  return (
    <section className="mw-card mw-all-locations">
      <DateRangePresets
        value={preset}
        onPresetChange={setPreset}
        onChange={setRange}
      />
      {preset === "custom" && (
        <div className="mw-form">
          <label>
            From
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </label>
        </div>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRevision(revision + 1)}>
            Retry overview
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Loading all locations…</p>}
      {data && (
        <>
          <dl className="mw-location-totals">
            {[
              ["Revenue", "revenue"],
              ["Orders", "orders"],
              ["Average order", "averageOrder"],
              ["Refunds", "refunds"],
              ["Charged to rooms", "roomCharges"],
              ["Covers", "covers"],
            ].map(([label, key]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {["orders", "covers"].includes(key)
                    ? data.totals[key]
                    : formatMoney(data.totals[key])}
                </dd>
              </div>
            ))}
          </dl>
          <h3>Payment mix</h3>
          {data.paymentMix.length ? (
            <ul>
              {data.paymentMix.map((p: any) => (
                <li key={p.method}>
                  {p.method === "room_charge"
                    ? "Charged to rooms (settled by the hotel)"
                    : p.method.replaceAll("_", " ")}
                  : {formatMoney(p.amount)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No payments in this range.</p>
          )}
          <div
            className="mw-location-table"
            role="region"
            aria-label="Location comparison"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {[
                    ["name", "Location"],
                    ["revenue", "Revenue"],
                    ["orders", "Orders"],
                    ["averageOrder", "Average order"],
                    ["refunds", "Refunds"],
                    ["openVisits", "Open visits"],
                    ["onShift", "On shift"],
                  ].map(([key, label]) => (
                    <th
                      key={key}
                      aria-sort={
                        sort === key
                          ? descending
                            ? "descending"
                            : "ascending"
                          : "none"
                      }
                    >
                      <button
                        onClick={() => {
                          setSort(key);
                          setDescending(sort === key ? !descending : true);
                        }}
                      >
                        {label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.branches]
                  .sort(
                    (a: any, b: any) =>
                      (typeof a[sort] === "string"
                        ? a[sort].localeCompare(b[sort])
                        : a[sort] - b[sort]) * (descending ? -1 : 1),
                  )
                  .map((b: any) => (
                    <tr key={b.id}>
                      <th scope="row">
                        <button onClick={() => onLocation(b.id)}>
                          <LocationTag location={b} /> {b.name}
                        </button>
                      </th>
                      {[
                        "revenue",
                        "orders",
                        "averageOrder",
                        "refunds",
                        "openVisits",
                        "onShift",
                      ].map((key) => (
                        <td key={key}>
                          {["revenue", "averageOrder", "refunds"].includes(key)
                            ? formatMoney(b[key])
                            : b[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h3>Stock across locations</h3>
          <h4>Low stock</h4>
          {data.stock.lowStock.length ? (
            <ul>
              {data.stock.lowStock.map((p: any) => (
                <li key={p.branchId + p.productId}>
                  {location(p.branchId)} · {p.name}: {p.stock} remaining
                </li>
              ))}
            </ul>
          ) : (
            <p>No low stock items.</p>
          )}
          <h4>Stock value by location</h4>
          <ul>
            {data.stock.valueByBranch.map((b: any) => (
              <li key={b.branchId}>
                {location(b.branchId)}:{" "}
                {b.value === null
                  ? "Add item costs to see stock value"
                  : formatMoney(b.value)}
              </li>
            ))}
          </ul>
          <h4>Transfers in transit</h4>
          {data.stock.inTransit.length ? (
            <ul>
              {data.stock.inTransit.map((t: any) => (
                <li key={t.id}>
                  {location(t.fromBranchId)} → {location(t.toBranchId)} ·{" "}
                  {t.lines?.length || 0} items
                </li>
              ))}
            </ul>
          ) : (
            <p>No transfers in transit.</p>
          )}
        </>
      )}
      {canExport && (
        <button
          className="secondary"
          disabled={
            exporting || exportWrite.busy || exportWrite.pending?.blocked
          }
          onClick={async () => {
            if (exporting) return;
            setExporting(true);
            exportRequest.current ||= {
              date: range.to,
              requestKey: uuid(),
              scope: "organization",
            };
            try {
              await exportWrite.write(
                branchBase + "/exports",
                "POST",
                exportRequest.current,
              );
              exportRequest.current = null;
              setExportMessage(
                "Organization CSV queued. Open Report exports to download it.",
              );
            } catch (e: any) {
              setExportMessage(
                e.message + " Retry to check the same export request.",
              );
            } finally {
              setExporting(false);
            }
          }}
        >
          Export organization CSV
        </button>
      )}
      <p role="status">
        {exportMessage ||
          (exportWrite.pending
            ? "An export needs checking. Export organization CSV retries the original request."
            : "")}
      </p>
    </section>
  );
}
