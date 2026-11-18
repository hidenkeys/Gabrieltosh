import { useState } from "react";
export default function TableEditor({
  table,
  base,
  disabled,
  save,
}: {
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
  return (
    <details>
      <summary>Edit table</summary>
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
      {error && (
        <p role="alert" className="mw-note mw-error">
          {error}
        </p>
      )}
    </details>
  );
}
