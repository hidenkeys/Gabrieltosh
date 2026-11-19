import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Action, Disclosure, ReadState } from "../ui/OperationalPrimitives";
type Props = {
  visit: any;
  code?: string | null;
  uncertain?: boolean;
  disabled: boolean;
  canRotate: boolean;
  onClear: () => void;
  onRotate: (reason: string) => Promise<void>;
  onRefresh: () => Promise<void>;
};
export default function PrivateVisitAccess(props: Props) {
  return <ScopedPrivateAccess key={props.visit.id} {...props} />;
}
function ScopedPrivateAccess({
  visit,
  code,
  uncertain,
  disabled,
  canRotate,
  onClear,
  onRotate,
  onRefresh,
}: Props) {
  const [revealed, setRevealed] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [denied, setDenied] = useState(false),
    [rotationUnknown, setRotationUnknown] = useState(false);
  const active = useRef(true),
    inFlight = useRef(false),
    deniedRef = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    setRevealed(false);
  }, [visit.id, visit.version, code, uncertain]);
  function fail(failure: any) {
    if (!active.current) return;
    setRevealed(false);
    if ([401, 403, 404].includes(failure.status)) {
      deniedRef.current = true;
      setDenied(true);
      setReason("");
    }
    setError(failure.message);
  }
  async function rotate() {
    if (
      disabled ||
      inFlight.current ||
      !canRotate ||
      deniedRef.current ||
      rotationUnknown ||
      visit.status === "closed"
    )
      return;
    inFlight.current = true;
    setWorking(true);
    setRevealed(false);
    setError("");
    try {
      await onRotate(reason);
      if (active.current) setReason("");
    } catch (failure: any) {
      if (active.current && (!failure.status || failure.status >= 500))
        setRotationUnknown(true);
      fail(failure);
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  async function refresh() {
    if (disabled || inFlight.current || deniedRef.current) return;
    inFlight.current = true;
    setWorking(true);
    setRevealed(false);
    setError("");
    try {
      await onRefresh();
      if (active.current) setRotationUnknown(false);
    } catch (failure: any) {
      fail(failure);
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  const confirmed = !!code && !uncertain && visit.status !== "closed";
  return (
    <section className="mw-card mw-private-access mw-visit-private-panel">
      <header>
        <div>
          <h2>Private access · {visit.displayName || "Current party"}</h2>
          <p>
            {visit.tableName || "Selected visit"} · Share only with this party.
            Joining codes stay out of permanent menu QR codes and exports.
          </p>
        </div>
        <Action disabled={disabled || working} onClick={onClear}>
          Clear private access panel
        </Action>
      </header>
      {denied ? (
        <ReadState
          kind="unavailable"
          title="Private party access is no longer available. Clear this panel and check your workspace access before continuing."
        />
      ) : (
        <>
          {error && (
            <p role="alert" className="mw-visit-tool-error">
              {error}
            </p>
          )}
          {confirmed ? (
            <div className="mw-visit-private-code">
              <div>
                <span>Current party joining code</span>
                <strong aria-label="Current party joining code">
                  {revealed ? code : "••••••"}
                </strong>
              </div>
              <Action
                disabled={disabled || working}
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed
                  ? "Hide private joining code"
                  : "Show private joining code"}
              </Action>
            </div>
          ) : (
            <ReadState
              kind="unavailable"
              title="No current joining code is confirmed. Refresh the visit, then explicitly generate a replacement. An uncertain request does not establish which code is current."
            />
          )}
          {rotationUnknown && (
            <p className="mw-visit-tool-pending" role="status">
              Replacement was not confirmed. The code stays hidden. Refresh the
              current visit before choosing to generate a new replacement; the
              earlier request has not been retried.
            </p>
          )}
          <div className="mw-visit-tool-toolbar">
            <Action
              disabled={disabled}
              pending={working}
              onClick={() => void refresh()}
            >
              Refresh current visit
            </Action>
          </div>
          {canRotate && visit.status !== "closed" && (
            <Disclosure
              className="mw-visit-tool"
              summary="Generate a new code for this party"
            >
              <p className="mw-visit-tool-copy">
                The previous joining code becomes invalid. Existing guest
                sessions, bills and this visit stay active. This is a new
                replacement, not a retry of an unconfirmed request.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void rotate();
                }}
              >
                <fieldset
                  className="mw-visit-tool-fieldset"
                  disabled={disabled || working || rotationUnknown}
                >
                  <label>
                    Joining-code replacement reason
                    <input
                      required
                      minLength={3}
                      maxLength={300}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <Action type="submit">
                    Generate replacement private code
                  </Action>
                </fieldset>
              </form>
            </Disclosure>
          )}
        </>
      )}
    </section>
  );
}
