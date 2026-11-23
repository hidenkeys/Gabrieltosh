import ChoiceField from "../ui/ChoiceField";
import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { Action, Disclosure, ReadState } from "../ui/OperationalPrimitives";
type Props = {
  base: string;
  visit: any;
  tables: any[];
  visits: any[];
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const statusName = (value: string) =>
  (
    ({
      available: "Available",
      occupied: "Occupied",
      cleaning: "Cleaning",
      reserved: "Reserved",
      unavailable: "Unavailable",
    }) as Record<string, string>
  )[value] || "Status unavailable";
export default function VisitTables(props: Props) {
  return (
    <ScopedVisitTables key={props.base + "|" + props.visit.id} {...props} />
  );
}
function ScopedVisitTables({
  base,
  visit,
  tables,
  visits,
  disabled,
  save,
}: Props) {
  const current: string[] = visit.tableIds || [visit.tableId];
  const [selected, setSelected] = useState<string[]>(current),
    [primary, setPrimary] = useState(visit.tableId || current[0]),
    [reason, setReason] = useState(""),
    [version, setVersion] = useState(visit.version || 1),
    [pending, setPending] = useState<any>(null),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [denied, setDenied] = useState(false);
  const active = useRef(true),
    inFlight = useRef(false),
    pendingRef = useRef<any>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const heldElsewhere = new Set(
    visits
      .filter((row) => row.id !== visit.id && row.status === "open")
      .flatMap((row) => row.tableIds || [row.tableId]),
  );
  const stale = !pending && version !== (visit.version || 1);
  function reviewCurrent() {
    if (inFlight.current || pendingRef.current) return;
    setSelected(current);
    setPrimary(visit.tableId || current[0] || "");
    setVersion(visit.version || 1);
    setReason("");
    setError("");
  }
  async function perform() {
    if (
      disabled ||
      inFlight.current ||
      denied ||
      (!pendingRef.current && (stale || visit.status !== "open"))
    )
      return;
    const old = !!pendingRef.current,
      body = pendingRef.current || {
        requestKey: uuid(),
        version,
        primaryTableId: primary,
        tableIds: [...selected],
        reason,
      };
    inFlight.current = true;
    setWorking(true);
    setError("");
    try {
      const result = await save(
        base + "/visits/" + visit.id + "/tables",
        "POST",
        body,
        "Visit tables changed. Guest access and bills were retained.",
      );
      if (!active.current) return;
      if (
        !Array.isArray(result?.tableIds) ||
        typeof result?.tableId !== "string"
      )
        throw Error(
          "The table change could not be confirmed. Keep this view open and retry the original request.",
        );
      pendingRef.current = null;
      setPending(null);
      setSelected(result.tableIds);
      setPrimary(result.tableId);
      setVersion(result.version || visit.version || 1);
      setReason("");
    } catch (failure: any) {
      if (!active.current) return;
      if (old || !failure.status || failure.status >= 500) {
        pendingRef.current = body;
        setPending(body);
      }
      if ([401, 403, 404].includes(failure.status)) setDenied(true);
      setError(failure.message);
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  return (
    <Disclosure
      className="mw-visit-tool"
      summary="Move or combine this party’s tables"
    >
      {denied ? (
        <ReadState
          kind="unavailable"
          title="This party’s table access needs checking. Refresh the workspace or sign in again before continuing."
        />
      ) : (
        <>
          <p className="mw-visit-tool-copy">
            Choose available tables for this existing party. Another party
            cannot be merged here. Released tables move to cleaning; bills and
            private guest access stay with this party.
          </p>
          {error && (
            <p role="alert" className="mw-visit-tool-error">
              {error}
            </p>
          )}
          {stale && (
            <ReadState
              kind="unavailable"
              title="This party changed while you were reviewing its tables."
              retry={reviewCurrent}
              retryLabel="Review current tables"
            />
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform();
            }}
          >
            <fieldset
              className="mw-visit-tool-fieldset"
              disabled={
                disabled ||
                working ||
                !!pending ||
                stale ||
                visit.status !== "open"
              }
            >
              <legend>Tables for this party</legend>
              <div className="mw-visit-table-choices">
                {tables.map((table) => {
                  const selectedHere = selected.includes(table.id),
                    unavailable =
                      heldElsewhere.has(table.id) ||
                      (!current.includes(table.id) &&
                        table.status !== "available");
                  return (
                    <label key={table.id}>
                      <input
                        type="checkbox"
                        checked={selectedHere}
                        disabled={
                          unavailable ||
                          (!selectedHere && selected.length >= 12)
                        }
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...selected, table.id]
                            : selected.filter((id) => id !== table.id);
                          setSelected(next);
                          if (!next.includes(primary))
                            setPrimary(next[0] || "");
                        }}
                      />
                      <span>
                        <strong>
                          {table.name || "Table name unavailable"}
                        </strong>
                        <small>
                          {Number.isInteger(table.capacity)
                            ? `${table.capacity} seats`
                            : "Capacity unavailable"}{" "}
                          ·{" "}
                          {current.includes(table.id)
                            ? "This party"
                            : heldElsewhere.has(table.id)
                              ? "Another party"
                              : statusName(table.status)}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mw-visit-tool-form">
                <ChoiceField
                  label={<>Primary table</>}
                  searchable
                  required
                  value={primary}
                  onChange={(nextValue) => setPrimary(nextValue)}
                >
                  <option value="">Choose primary table</option>
                  {tables
                    .filter((table) => selected.includes(table.id))
                    .map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.name || "Table name unavailable"}
                      </option>
                    ))}
                </ChoiceField>
                <label>
                  Table change reason
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              </div>
              <Action
                type="submit"
                disabled={!selected.length || !selected.includes(primary)}
              >
                Save this party’s tables
              </Action>
            </fieldset>
          </form>
          {pending && (
            <div className="mw-visit-tool-pending" role="status">
              <p>
                Table change not confirmed. The original selection, reason and
                request are kept. A refreshed list does not resolve this
                request. Keep this view open until it is checked.
              </p>
              <Action
                pending={working}
                disabled={disabled}
                onClick={() => void perform()}
              >
                Retry original table change
              </Action>
            </div>
          )}
        </>
      )}
    </Disclosure>
  );
}
