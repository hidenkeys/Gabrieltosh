import Chips from "../ui/Chips";
import { useState, type ReactNode } from "react";

type Queue = "all" | "attention" | "open" | "pending_approval" | "closed";
const labels: Record<Queue, string> = {
  all: "All shifts",
  attention: "Needs attention",
  open: "Open shifts",
  pending_approval: "Awaiting approval",
  closed: "Closed shifts",
};
export default function ShiftWorkspace({
  shifts,
  initialQueue = "all",
  initialShiftId,
  renderRecord,
}: {
  shifts?: unknown;
  initialQueue?: "all" | "attention";
  initialShiftId?: string;
  renderRecord: (shift: any) => ReactNode;
}) {
  const [queue, setQueue] = useState<Queue>(initialQueue);
  const [selected, setSelected] = useState(initialShiftId || "");
  const seen = new Set<string>();
  let malformed = !Array.isArray(shifts);
  const records = Array.isArray(shifts)
    ? shifts.filter((row) => {
        if (
          !row ||
          typeof row !== "object" ||
          Array.isArray(row) ||
          typeof row.id !== "string" ||
          !row.id.trim() ||
          seen.has(row.id)
        ) {
          malformed = true;
          return false;
        }
        seen.add(row.id);
        return true;
      })
    : [];
  const matches = (row: any) =>
    (!selected || row.id === selected) &&
    (queue === "all" ||
      (queue === "attention" &&
        ["open", "pending_approval"].includes(row.status)) ||
      (queue === "closed" && ["closed", "approved"].includes(row.status)) ||
      row.status === queue);
  const visible = records.filter(matches).length;
  const missingSelection = !!selected && !seen.has(selected);
  return (
    <section className="mw-shift-workspace" aria-label="Shift records">
      <header className="mw-shift-workspace-heading">
        <div>
          <h2>Shift records</h2>
          <p>Review open shifts and closing counts awaiting approval.</p>
        </div>
      </header>
      <div className="mw-shift-workspace-toolbar">
        <Chips
          label="Show shifts"
          value={queue}
          onChange={(v) => setQueue(v as Queue)}
          options={(Object.keys(labels) as Queue[]).map((key) => ({
            value: key,
            label: labels[key],
          }))}
        />
        {selected && (
          <button
            type="button"
            className="secondary"
            onClick={() => setSelected("")}
          >
            Clear selected shift
          </button>
        )}
      </div>
      {malformed && (
        <p role="status" className="mw-note">
          Shift records are unavailable or incomplete. Refresh the workspace to
          check the latest records.
        </p>
      )}
      {missingSelection && (
        <p role="status" className="mw-note">
          The selected shift is unavailable in these loaded records. Clear the
          selected shift to review the others.
        </p>
      )}
      {Array.isArray(shifts) && (
        <p className="mw-shift-workspace-count" role="status">
          Showing {visible} of {records.length} loaded shifts
          {malformed ? " · some records unavailable" : ""}.
        </p>
      )}
      {!malformed && records.length === 0 && (
        <p>No shifts have been loaded for this branch.</p>
      )}
      {!missingSelection && records.length > 0 && visible === 0 && (
        <p>
          No loaded shifts match this view. Choose another queue
          {selected ? " or clear the selected shift" : ""}.
        </p>
      )}
      <div className="mw-shift-workspace-records">
        {records.map((shift) => (
          <div
            key={shift.id}
            hidden={!matches(shift)}
            className="mw-shift-workspace-record"
          >
            {renderRecord(shift)}
          </div>
        ))}
      </div>
    </section>
  );
}
