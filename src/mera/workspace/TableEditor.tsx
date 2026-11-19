import { useEffect, useRef, useState } from "react";
import { Disclosure } from "../ui/OperationalPrimitives";
import NonReplayForm, { type NonReplayState } from "./NonReplayForm";
export default function TableEditor(
  props: Parameters<typeof ScopedTableEditor>[0],
) {
  return <ScopedTableEditor key={props.base + props.table.id} {...props} />;
}
function ScopedTableEditor({
  table,
  base,
  disabled,
  held = false,
  save,
}: {
  held?: boolean;
  table: any;
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [draft, setDraft] = useState({
    name: table.name,
    capacity: table.capacity,
    zone: table.zone || "Main floor",
    x: table.x || 0,
    y: table.y || 0,
  });
  const emptyState: NonReplayState = {
    busy: false,
    unknown: false,
    denied: false,
  };
  const [states, setStates] = useState({
    metadata: emptyState,
    status: emptyState,
  });
  const stateRef = useRef(states),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function stateChanged(key: "metadata" | "status", next: NonReplayState) {
    if (!mounted.current) return;
    const old = stateRef.current[key];
    if (
      old.busy === next.busy &&
      old.unknown === next.unknown &&
      old.denied === next.denied
    )
      return;
    stateRef.current = { ...stateRef.current, [key]: next };
    setStates(stateRef.current);
  }
  const denied = states.metadata.denied || states.status.denied;
  const blocked =
    disabled ||
    Object.values(states).some(
      (state) => state.busy || state.unknown || state.denied,
    );
  function maySubmit(other: "metadata" | "status") {
    return (
      !stateRef.current[other].busy &&
      !Object.values(stateRef.current).some(
        (state) => state.unknown || state.denied,
      )
    );
  }

  const [status, setStatus] = useState(
    ["available", "cleaning", "unavailable"].includes(table.status)
      ? table.status
      : "cleaning",
  );
  const [reason, setReason] = useState("");
  if (denied)
    return (
      <p role="alert">
        Table editing is no longer available for this branch. Its previous
        update has not been retried.
      </p>
    );
  return (
    <Disclosure summary="Edit table & service status">
      <NonReplayForm
        className="mw-form"
        label="Edit table"
        disabled={blocked}
        onStateChange={(next) => stateChanged("metadata", next)}
        onSubmit={async () => {
          if (!maySubmit("status")) return;
          await save(
            base + `/tables/${table.id}`,
            "PATCH",
            { ...draft },
            "Table updated.",
          );
        }}
      >
        {(["name", "zone"] as const).map((key) => (
          <label key={key}>
            {key === "name" ? "Table label" : "Floor zone"}
            <input
              required
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        {(["capacity", "x", "y"] as const).map((key) => (
          <label key={key}>
            {key === "capacity" ? "Seats" : key.toUpperCase() + " position"}
            <input
              type="number"
              required
              min={key === "capacity" ? 1 : 0}
              max={100}
              value={draft[key]}
              onChange={(e) =>
                setDraft({ ...draft, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        <div className="mw-wide">
          <button className="secondary" disabled={disabled}>
            Save table
          </button>
        </div>
      </NonReplayForm>
      <NonReplayForm
        label="Update table service status"
        disabled={blocked || held || table.status === "occupied"}
        onStateChange={(next) => stateChanged("status", next)}
        onSubmit={async () => {
          if (!maySubmit("metadata") || held || table.status === "occupied")
            return;
          await save(
            base + "/tables/" + table.id + "/status",
            "POST",
            { status, reason },
            "Table service status updated.",
          );
          if (mounted.current) setReason("");
        }}
      >
        <fieldset
          disabled={disabled || held || table.status === "occupied"}
          style={{ border: 0, padding: 0 }}
        >
          <legend>Return table to service</legend>
          <p>
            Confirm cleaning is complete before making a table available. Active
            visits must close or release the table first.
          </p>
          <div className="mw-form">
            <label>
              Table service status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="available">Available</option>
                <option value="cleaning">Cleaning</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label>
              Table status reason
              <input
                required
                minLength={3}
                maxLength={300}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <button className="secondary">Update service status</button>
        </fieldset>
      </NonReplayForm>
    </Disclosure>
  );
}
