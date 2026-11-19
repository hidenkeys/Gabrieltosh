import { useEffect, useRef, useState, type ReactNode } from "react";
export type NonReplayState = {
  busy: boolean;
  unknown: boolean;
  denied: boolean;
};
export type NonReplayFormProps = {
  disabled: boolean;
  onSubmit: () => Promise<any>;
  children: ReactNode;
  className?: string;
  label?: string;
  onStateChange?: (state: NonReplayState) => void;
};
/** Non-versioned writes have no replay/fencing contract. An unknown result
 * therefore freezes this mounted form; prop refreshes cannot unlock it. */
export default function NonReplayForm({
  disabled,
  onSubmit,
  children,
  className,
  label,
  onStateChange,
}: NonReplayFormProps) {
  const [working, setWorking] = useState(false),
    [unknown, setUnknown] = useState(false),
    [denied, setDenied] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true),
    inFlight = useRef(false),
    unknownRef = useRef(false),
    deniedRef = useRef(false);
  const stateCallback = useRef(onStateChange);
  stateCallback.current = onStateChange;
  function emit(busy: boolean) {
    if (mounted.current)
      stateCallback.current?.({
        busy,
        unknown: unknownRef.current,
        denied: deniedRef.current,
      });
  }
  useEffect(() => {
    emit(working);
  }, [working, unknown, denied]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || inFlight.current || unknownRef.current || deniedRef.current)
      return;
    inFlight.current = true;
    setWorking(true);
    setError("");
    emit(true);
    try {
      await onSubmit();
    } catch (failure) {
      if (!mounted.current) return;
      const status = (failure as any)?.status;
      if ([401, 403].includes(status)) {
        deniedRef.current = true;
        setDenied(true);
        setError(
          "Access to this action is no longer available. Its previous result has not been retried.",
        );
      } else {
        setError(
          (failure as Error)?.message || "The change could not be confirmed.",
        );
        if (
          !status ||
          status >= 500 ||
          (failure as Error)?.name === "AbortError"
        ) {
          unknownRef.current = true;
          setUnknown(true);
        }
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setWorking(false);
        emit(false);
      }
    }
  }
  return (
    <form className={className} aria-label={label} onSubmit={submit}>
      {denied ? (
        <p role="alert" className="mw-note mw-error">
          {error}
        </p>
      ) : (
        <>
          {error && (
            <p role="alert" className="mw-note mw-error">
              {error}
            </p>
          )}
          {working && (
            <p role="status" className="mw-note">
              Saving this change…
            </p>
          )}
          {unknown && (
            <div role="status" className="mw-note">
              <strong>This change still needs checking.</strong>
              <p>
                It may already have been saved. Editing is paused because this
                action cannot safely be repeated. Review the latest record with
                an administrator before making another change. Refreshing this
                page does not cancel the earlier request.
              </p>
            </div>
          )}
          <fieldset
            aria-label={label}
            disabled={disabled || working || unknown}
            style={{
              border: 0,
              padding: 0,
              margin: 0,
              minWidth: 0,
              display: "contents",
            }}
          >
            {children}
          </fieldset>
        </>
      )}
    </form>
  );
}
