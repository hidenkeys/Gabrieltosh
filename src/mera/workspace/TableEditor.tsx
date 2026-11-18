import { useState } from "react";
export default function TableEditor({
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
  const [error, setError] = useState("");
  const [status, setStatus] = useState(
    ["available", "cleaning", "unavailable"].includes(table.status)
      ? table.status
      : "cleaning",
  );
  const [reason, setReason] = useState("");
  return (
    <details>
      <summary>Edit table & service status</summary>
      <form
        className="mw-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          void save(
            base + `/tables/${table.id}`,
            "PATCH",
            draft,
            "Table updated.",
          ).catch((e) => setError(e.message));
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
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          void save(
            base + "/tables/" + table.id + "/status",
            "POST",
            { status, reason },
            "Table service status updated.",
          )
            .then(() => setReason(""))
            .catch((e) => setError(e.message));
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
      </form>
      {error && (
        <p role="alert" className="mw-note mw-error">
          {error}
        </p>
      )}
    </details>
  );
}
