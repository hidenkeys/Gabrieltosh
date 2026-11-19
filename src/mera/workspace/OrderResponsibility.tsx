import { useEffect, useRef, useState } from "react";
import { Action, Disclosure, ReadState } from "../ui/OperationalPrimitives";
import { workspaceApi } from "./api";
type Staff = { id: string; name: string };
type Props = {
  base: string;
  order: any;
  disabled: boolean;
  canAssign: boolean;
  timeZone?: string;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
  onRefresh: () => Promise<void>;
};
export default function OrderResponsibility(props: Props) {
  return (
    <ScopedResponsibility
      key={props.base + "|" + props.order.id + "|" + props.canAssign}
      {...props}
    />
  );
}
function ScopedResponsibility({
  base,
  order,
  disabled,
  canAssign,
  timeZone,
  save,
  onRefresh,
}: Props) {
  const [staff, setStaff] = useState<Staff[] | null>(null),
    [truncated, setTruncated] = useState(false),
    [loading, setLoading] = useState(canAssign),
    [readError, setReadError] = useState(""),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false),
    [selected, setSelected] = useState(""),
    [version, setVersion] = useState(order.version),
    [working, setWorking] = useState(false),
    [unknown, setUnknown] = useState(false),
    [notice, setNotice] = useState("");
  const active = useRef(true),
    generation = useRef(0),
    flight = useRef(false),
    deniedRef = useRef(false),
    frozen = useRef(false);
  const stale = version !== order.version;
  function deny() {
    deniedRef.current = true;
    generation.current++;
    setDenied(true);
    setStaff(null);
    setSelected("");
    setLoading(false);
  }
  async function read(signal?: AbortSignal) {
    if (!canAssign || deniedRef.current) return;
    const id = ++generation.current;
    setLoading(true);
    setReadError("");
    setStaff(null);
    try {
      const result = await workspaceApi(
        base + "/service-staff",
        "GET",
        undefined,
        signal,
      );
      if (
        !active.current ||
        signal?.aborted ||
        id !== generation.current ||
        deniedRef.current
      )
        return;
      if (
        !Array.isArray(result?.staff) ||
        typeof result.truncated !== "boolean" ||
        result.staff.some(
          (person: any) =>
            typeof person?.id !== "string" ||
            typeof person.name !== "string" ||
            !person.name.trim(),
        )
      )
        throw Error("Staff list could not be confirmed.");
      setStaff(result.staff);
      setTruncated(result.truncated);
    } catch (failure: any) {
      if (!active.current || signal?.aborted || id !== generation.current)
        return;
      if ([401, 403, 404].includes(failure.status)) deny();
      else setReadError("Branch staff could not be loaded. Try again.");
    } finally {
      if (active.current && !signal?.aborted && id === generation.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal);
    return () => controller.abort();
  }, [base, canAssign]);
  async function refresh() {
    if (flight.current || disabled || deniedRef.current) return;
    flight.current = true;
    setWorking(true);
    setError("");
    try {
      await onRefresh();
      if (active.current && !deniedRef.current) await read();
    } catch (failure: any) {
      if (active.current) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else setError("The current order could not be refreshed. Try again.");
      }
    } finally {
      flight.current = false;
      if (active.current) setWorking(false);
    }
  }
  async function assign() {
    if (
      !canAssign ||
      disabled ||
      flight.current ||
      frozen.current ||
      deniedRef.current ||
      stale ||
      loading ||
      readError ||
      order.historicalReadOnly ||
      !Number.isInteger(version) ||
      version < 1 ||
      !staff?.some((person) => person.id === selected) ||
      selected === order.handlerId
    )
      return;
    flight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    const body = { userId: selected, version };
    try {
      const result = await save(
        base + `/orders/${order.id}/assign`,
        "POST",
        body,
        "Order responsibility updated.",
      );
      if (!active.current || deniedRef.current) return;
      if (
        result?.handlerId !== selected ||
        !Number.isInteger(result.version) ||
        result.version <= version
      )
        throw Error("Assignment response could not be confirmed.");
      setSelected("");
      setVersion(result.version);
      setNotice(
        "Order responsibility updated. Preparation and collection remain separate actions.",
      );
    } catch (failure: any) {
      if (!active.current) return;
      if (!failure.status || failure.status >= 500) {
        frozen.current = true;
        setUnknown(true);
      }
      if ([401, 403, 404].includes(failure.status)) deny();
      setError(failure.message || "Order responsibility could not be updated.");
    } finally {
      flight.current = false;
      if (active.current) setWorking(false);
    }
  }
  const name = (id: unknown) =>
    !id
      ? "Unassigned"
      : staff?.find((person) => person.id === id)?.name ||
        "Staff name unavailable";
  const currentName =
    staff?.find((person) => person.id === order.handlerId)?.name ||
    (order.handlerId &&
    typeof order.handlerName === "string" &&
    order.handlerName.trim()
      ? order.handlerName
      : name(order.handlerId));
  const historyTime = (at: string) => {
    if (timeZone) {
      try {
        return (
          new Intl.DateTimeFormat("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone,
          }).format(new Date(at)) +
          " · " +
          timeZone
        );
      } catch {
        /* Invalid configuration uses an explicitly labelled device clock. */
      }
    }
    return (
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(at)) + " · Device time"
    );
  };
  return (
    <Disclosure
      summary="Order responsibility"
      className="mw-order-responsibility"
    >
      {denied ? (
        <ReadState
          kind="unavailable"
          title="Order responsibility access needs checking. Refresh the workspace or sign in again."
        />
      ) : (
        <>
          <p>
            Current handler: <strong>{currentName}</strong>
          </p>
          <p className="mw-note">
            This records responsibility for this order. Preparation and service
            actions may update the current handler.
          </p>
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {unknown && (
            <ReadState
              kind="unavailable"
              title="Assignment is unconfirmed. Further assignments are paused in this panel. Refresh to inspect the current order, then ask a manager to verify the assignment; refreshing does not retry or unlock it."
            />
          )}
          {canAssign && (
            <>
              <Action
                pending={working}
                disabled={disabled || loading}
                onClick={() => void refresh()}
              >
                Refresh order responsibility
              </Action>
              {loading ? (
                <ReadState kind="loading" title="Loading branch staff…" />
              ) : readError ? (
                <ReadState
                  kind="error"
                  title={readError}
                  retry={() => void read()}
                  retryLabel="Retry loading branch staff"
                />
              ) : staff?.length === 0 ? (
                <ReadState
                  kind="empty"
                  title="No eligible branch staff are available."
                />
              ) : (
                staff && (
                  <>
                    {truncated && (
                      <p className="mw-note">
                        Only the first 500 eligible staff are listed. Ask an
                        administrator if the person you need is missing.
                      </p>
                    )}
                    {stale && !unknown && (
                      <ReadState
                        kind="unavailable"
                        title="This order changed. Review its current handler before assigning."
                        retry={() => {
                          if (!flight.current && !frozen.current) {
                            setVersion(order.version);
                            setSelected("");
                            setError("");
                          }
                        }}
                        retryLabel="Review current responsibility"
                      />
                    )}
                    {!order.historicalReadOnly && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void assign();
                        }}
                      >
                        <fieldset
                          disabled={disabled || working || unknown || stale}
                        >
                          <label>
                            Assign order to
                            <select
                              required
                              value={selected}
                              onChange={(event) =>
                                setSelected(event.target.value)
                              }
                            >
                              <option value="">Choose branch staff</option>
                              {staff.map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.name}
                                  {person.id === order.handlerId
                                    ? " · Current handler"
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Action
                            type="submit"
                            disabled={!selected || selected === order.handlerId}
                          >
                            Update order responsibility
                          </Action>
                        </fieldset>
                      </form>
                    )}
                  </>
                )
              )}
            </>
          )}
          <Disclosure summary="Assignment history">
            <ol>
              {(Array.isArray(order.history) ? order.history : [])
                .filter((entry: any) => entry.action === "assigned")
                .map((entry: any, index: number) => (
                  <li key={index}>
                    <strong>
                      {name(entry.from)} → {name(entry.to)}
                    </strong>
                    <span>
                      Recorded by {entry.actorName || "Staff name unavailable"}
                      {typeof entry.at === "string" &&
                      Number.isFinite(Date.parse(entry.at)) ? (
                        <>
                          {" "}
                          ·{" "}
                          <time dateTime={entry.at}>
                            {historyTime(entry.at)}
                          </time>
                        </>
                      ) : (
                        " · Time unavailable"
                      )}
                    </span>
                  </li>
                ))}
            </ol>
            {!(
              Array.isArray(order.history) &&
              order.history.some((entry: any) => entry.action === "assigned")
            ) && <p>No assignment changes recorded.</p>}
          </Disclosure>
        </>
      )}
    </Disclosure>
  );
}
