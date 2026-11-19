import { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { workspaceApi, formatMoney } from "./api";
import { Action, Disclosure, ReadState } from "../ui/OperationalPrimitives";
type Props = {
  base: string;
  visitId: string;
  updatedKey: string;
  disabled: boolean;
  canWaive: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function VisitMinimumSpend(props: Props) {
  return (
    <ScopedMinimumSpend key={props.base + "|" + props.visitId} {...props} />
  );
}
function ScopedMinimumSpend({
  base,
  visitId,
  updatedKey,
  disabled,
  canWaive,
  save,
}: Props) {
  const path = base + "/visits/" + visitId + "/minimum-spend";
  const [data, setData] = useState<any>(null),
    [reason, setReason] = useState(""),
    [approved, setApproved] = useState(false),
    [readError, setReadError] = useState(""),
    [writeError, setWriteError] = useState(""),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [pending, setPending] = useState<any>(null),
    [denied, setDenied] = useState(false);
  const active = useRef(true),
    readId = useRef(0),
    inFlight = useRef(false),
    pendingRef = useRef<any>(null),
    deniedRef = useRef(false);
  function deny() {
    deniedRef.current = true;
    readId.current++;
    setDenied(true);
    setData(null);
    setReason("");
    setApproved(false);
    setLoading(false);
  }
  async function read(signal?: AbortSignal) {
    if (deniedRef.current) return;
    const id = ++readId.current;
    setLoading(true);
    setReadError("");
    try {
      const result = await workspaceApi(path, "GET", undefined, signal);
      if (
        !active.current ||
        signal?.aborted ||
        id !== readId.current ||
        deniedRef.current
      )
        return;
      if (
        typeof result?.summary?.enabled !== "boolean" ||
        !Number.isSafeInteger(result.version) ||
        result.version < 1
      )
        throw Error(
          "Visit terms could not be confirmed. Refresh before continuing.",
        );
      setData(result);
    } catch (failure: any) {
      if (
        !active.current ||
        signal?.aborted ||
        id !== readId.current ||
        failure.name === "AbortError"
      )
        return;
      if ([401, 403, 404].includes(failure.status)) deny();
      setReadError("The original visit terms could not be loaded. Try again.");
    } finally {
      if (active.current && !signal?.aborted && id === readId.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      readId.current++;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal);
    return () => controller.abort();
  }, [path, updatedKey]);
  const validAmounts =
    data?.summary &&
    ["target", "netPaid", "waived", "shortfall"].every(
      (key) =>
        Number.isSafeInteger(data.summary[key]) && data.summary[key] >= 0,
    );
  async function perform() {
    if (
      disabled ||
      inFlight.current ||
      deniedRef.current ||
      !canWaive ||
      (!pendingRef.current &&
        (!approved ||
          !data ||
          !validAmounts ||
          loading ||
          readError ||
          data.summary.shortfall <= 0))
    )
      return;
    const old = !!pendingRef.current,
      body = pendingRef.current || {
        requestKey: uuid(),
        version: data.version,
        expectedShortfall: data.summary.shortfall,
        reason,
      };
    inFlight.current = true;
    setWorking(true);
    setWriteError("");
    try {
      await save(
        path + "/waive",
        "POST",
        body,
        "Minimum-spend shortfall review recorded. No payment, fee or ledger entry was created.",
      );
      if (!active.current || deniedRef.current) return;
      pendingRef.current = null;
      setPending(null);
      setReason("");
      setApproved(false);
      await read();
    } catch (failure: any) {
      if (!active.current) return;
      if (old || !failure.status || failure.status >= 500) {
        pendingRef.current = body;
        setPending(body);
      }
      if ([401, 403, 404].includes(failure.status)) deny();
      setWriteError(failure.message);
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  const amount = (key: string) =>
    Number.isSafeInteger(data?.summary?.[key]) && data.summary[key] >= 0
      ? formatMoney(data.summary[key])
      : "Unavailable";
  return (
    <Disclosure className="mw-visit-tool" summary="Minimum-spend commitment">
      {denied ? (
        <ReadState
          kind="unavailable"
          title="Access to this party’s commitment needs checking. Refresh the workspace or sign in again before continuing."
        />
      ) : (
        <>
          <div className="mw-visit-tool-toolbar">
            <Action
              pending={loading}
              disabled={working}
              onClick={() => void read()}
            >
              Refresh visit commitment
            </Action>
          </div>
          {writeError && (
            <p role="alert" className="mw-visit-tool-error">
              {writeError}
            </p>
          )}
          {loading ? (
            <ReadState kind="loading" title="Loading original visit terms…" />
          ) : readError ? (
            <ReadState
              kind="error"
              title={readError}
              retry={() => void read()}
              retryLabel="Retry loading visit terms"
            />
          ) : data && !data.summary.enabled ? (
            <p>No minimum-spend terms are attached to this visit.</p>
          ) : (
            data && (
              <>
                <p className="mw-visit-tool-copy">
                  {data.summary.disclosure ||
                    "Original disclosure unavailable. Ask a manager to review the recorded terms."}
                </p>
                <dl className="mw-visit-tool-facts">
                  <div>
                    <dt>Original target</dt>
                    <dd>{amount("target")}</dd>
                  </div>
                  <div>
                    <dt>Net paid bill</dt>
                    <dd>{amount("netPaid")}</dd>
                  </div>
                  <div>
                    <dt>Manager waivers</dt>
                    <dd>{amount("waived")}</dd>
                  </div>
                </dl>
                <p className="mw-visit-tool-total">
                  <strong>Commitment shortfall: {amount("shortfall")}</strong>
                </p>
                <p className="mw-visit-tool-copy">
                  This commitment is separate from unpaid order debt; it does
                  not create a fee. Ordinary qualifying paid orders or an
                  authorized waiver reduce the shortfall. Later refunds may
                  reopen it.
                </p>
                {!validAmounts && (
                  <ReadState
                    kind="unavailable"
                    title="Commitment amounts are incomplete. Refresh the terms before reviewing a waiver."
                  />
                )}
                {data.summary.shortfall > 0 &&
                  (canWaive ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void perform();
                      }}
                    >
                      <fieldset
                        className="mw-visit-tool-fieldset"
                        disabled={
                          disabled || working || !!pending || !validAmounts
                        }
                      >
                        <label>
                          Minimum-spend waiver reason
                          <input
                            required
                            minLength={10}
                            maxLength={500}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                          />
                        </label>
                        <label className="mw-visit-tool-confirm">
                          <input
                            type="checkbox"
                            required
                            checked={approved}
                            onChange={(event) =>
                              setApproved(event.target.checked)
                            }
                          />
                          <span>
                            I approve waiving the current disclosed commitment
                            shortfall.
                          </span>
                        </label>
                        <Action type="submit" disabled={!approved}>
                          Waive current commitment shortfall
                        </Action>
                      </fieldset>
                    </form>
                  ) : (
                    <p>An authorized manager must review a waiver.</p>
                  ))}
              </>
            )
          )}
          {pending && (
            <div className="mw-visit-tool-pending" role="status">
              <p>
                The original minimum-spend review is unconfirmed. Its amount,
                visit version and reason remain unchanged. Reading current terms
                does not prove the request failed. Keep this view open until it
                is checked.
              </p>
              <Action
                pending={working}
                disabled={disabled || !canWaive}
                onClick={() => void perform()}
              >
                Retry original minimum-spend review
              </Action>
            </div>
          )}
        </>
      )}
    </Disclosure>
  );
}
