import { useRef, useState } from "react";
import NonReplayForm, { type NonReplayState } from "./NonReplayForm";

export default function FloorMap(props: Parameters<typeof ScopedFloorMap>[0]) {
  return <ScopedFloorMap key={props.base} {...props} />;
}
function ScopedFloorMap({
  tables,
  base,
  disabled,
  save,
}: {
  tables: any[];
  base: string;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
}) {
  const [zone, setZone] = useState(""),
    [selected, setSelected] = useState(""),
    [point, setPoint] = useState({ x: 0, y: 0 });
  const [formState, setFormState] = useState<NonReplayState>({
    busy: false,
    unknown: false,
    denied: false,
  });
  const stateRef = useRef(formState);
  const blocked =
    disabled || formState.busy || formState.unknown || formState.denied;
  function stateChanged(next: NonReplayState) {
    stateRef.current = next;
    setFormState((current) =>
      current.busy === next.busy &&
      current.unknown === next.unknown &&
      current.denied === next.denied
        ? current
        : next,
    );
  }
  const zones = [...new Set<string>(tables.map((t) => t.zone || "Main floor"))],
    current = tables.find((t) => t.id === selected);
  const shown = tables.filter(
    (t) => !zone || (t.zone || "Main floor") === zone,
  );
  const select = (t: any) => {
    if (
      disabled ||
      stateRef.current.busy ||
      stateRef.current.unknown ||
      stateRef.current.denied
    )
      return;
    setSelected(t.id);
    setPoint({ x: t.x || 0, y: t.y || 0 });
  };
  if (formState.denied)
    return (
      <section className="mera-panel">
        <p role="alert">
          Access to this floor is no longer available. Its previous update has
          not been retried.
        </p>
      </section>
    );
  return (
    <section
      className="mera-panel"
      style={{ padding: 20, marginBottom: 24 }}
      aria-label="Live floor map"
    >
      <h2>Your floor at a glance</h2>
      {shown.some((table, index) =>
        shown
          .slice(index + 1)
          .some(
            (other) =>
              (table.x ?? 0) === (other.x ?? 0) &&
              (table.y ?? 0) === (other.y ?? 0),
          ),
      ) && (
        <p>
          Tables with identical saved coordinates overlap. Use the table
          selector to choose one, then explicitly save its new position.
        </p>
      )}
      <p>
        Choose a table to adjust its position. Service status comes from the
        current visit; moving a table on this map does not move its guests.
      </p>
      <label>
        Map zone
        <select
          value={zone}
          disabled={blocked}
          onChange={(e) => {
            setZone(e.target.value);
            setSelected("");
          }}
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      <label>
        Map table
        <select
          value={selected}
          disabled={blocked}
          onChange={(event) => {
            const table = shown.find((row) => row.id === event.target.value);
            if (table) select(table);
            else setSelected("");
          }}
        >
          <option value="">Choose table</option>
          {shown.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name} · {table.zone || "Main floor"}
            </option>
          ))}
        </select>
      </label>
      {!shown.length ? (
        <p>No tables in this zone.</p>
      ) : (
        <div
          style={{ overflowX: "auto", marginTop: 16 }}
          tabIndex={0}
          aria-label="Floor plan, scroll horizontally on small screens"
        >
          <div
            style={{
              position: "relative",
              height: 440,
              minWidth: 420,
              border: "1px solid #d7d7d1",
              borderRadius: 16,
              backgroundColor: "#f5f4ef",
              backgroundImage: "radial-gradient(#c5c9c7 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
            {shown.map((t, i) => {
              const x = selected === t.id ? point.x : (t.x ?? (i % 4) * 25),
                y =
                  selected === t.id ? point.y : (t.y ?? Math.floor(i / 4) * 25);
              const colors: Record<string, string> = {
                available: "#edf5ee",
                occupied: "#dcecff",
                cleaning: "#fff0d3",
                unavailable: "#eee6e5",
                reserved: "#ede5fa",
              };
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={blocked}
                  aria-pressed={selected === t.id}
                  aria-label={`${t.name}, ${t.status}, ${t.capacity} seats`}
                  onClick={() => select(t)}
                  onKeyDown={(e) => {
                    if (
                      disabled ||
                      stateRef.current.busy ||
                      stateRef.current.unknown ||
                      stateRef.current.denied ||
                      selected !== t.id ||
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(e.key)
                    )
                      return;
                    e.preventDefault();
                    const step = e.shiftKey ? 10 : 1;
                    setPoint((p) => ({
                      x: Math.max(
                        0,
                        Math.min(
                          100,
                          p.x +
                            (e.key === "ArrowLeft"
                              ? -step
                              : e.key === "ArrowRight"
                                ? step
                                : 0),
                        ),
                      ),
                      y: Math.max(
                        0,
                        Math.min(
                          100,
                          p.y +
                            (e.key === "ArrowUp"
                              ? -step
                              : e.key === "ArrowDown"
                                ? step
                                : 0),
                        ),
                      ),
                    }));
                  }}
                  style={{
                    position: "absolute",
                    left: `calc(${x * 0.75}% + 8px)`,
                    zIndex: selected === t.id ? 2 : 1,
                    top: `calc(${y * 0.8}% + 8px)`,
                    maxWidth: "19%",
                    minWidth: 76,
                    minHeight: 66,
                    padding: 8,
                    border:
                      selected === t.id
                        ? "2px solid #183f69"
                        : "1px solid #aeb8ba",
                    borderRadius: 12,
                    color: "#172c3b",
                    background: colors[t.status] || "#fff",
                    fontSize: 12,
                    overflowWrap: "anywhere",
                    boxShadow: "0 3px 8px #1222330c",
                  }}
                >
                  <strong style={{ display: "block" }}>{t.name}</strong>
                  <span>
                    {t.capacity} seats · {t.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div hidden={!current}>
        <NonReplayForm
          disabled={disabled || !current}
          label="Save floor position"
          onStateChange={stateChanged}
          onSubmit={async () => {
            if (!current || stateRef.current.unknown || stateRef.current.denied)
              return;
            await save(
              base + "/tables/" + current.id,
              "PATCH",
              { ...point },
              "Floor position saved.",
            );
          }}
        >
          <fieldset disabled={disabled} style={{ marginTop: 16 }}>
            <legend>Position · {current?.name || "Choose a table"}</legend>
            <p>
              Use the sliders or the arrow keys on the selected table. Hold
              Shift for larger steps. Save to share the layout with other staff.
            </p>
            {(["x", "y"] as const).map((key) => (
              <label key={key}>
                {key === "x" ? "Horizontal position" : "Vertical position"} (
                {point[key]}%)
                <input
                  aria-label={
                    key === "x" ? "Horizontal position" : "Vertical position"
                  }
                  type="range"
                  min={0}
                  max={100}
                  value={point[key]}
                  onChange={(e) =>
                    setPoint({ ...point, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <button>Save floor position</button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (current) select(current);
              }}
            >
              Reset position draft
            </button>
          </fieldset>
        </NonReplayForm>
      </div>
    </section>
  );
}
