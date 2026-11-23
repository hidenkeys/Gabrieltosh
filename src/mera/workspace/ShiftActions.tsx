import Combobox from "../ui/Combobox";
import ReasonInput from "../ui/ReasonInput";
import React, { useEffect, useRef, useState } from "react";
import { uuid } from "../../api";
import { formatMoney, workspaceApi, WorkspaceError } from "./api";
import { Action, Disclosure, ReadState } from "../ui/OperationalPrimitives";
type Props = {
  base: string;
  shift: any;
  canApprove: boolean;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
export default function ShiftActions(props: Props) {
  return (
    <ScopedShiftActions key={props.base + "|" + props.shift.id} {...props} />
  );
}
function ScopedShiftActions({
  base,
  shift,
  canApprove,
  disabled,
  save,
}: Props) {
  const [staff, setStaff] = useState<any[]>([]),
    [staffLoading, setStaffLoading] = useState(shift.status === "open"),
    [staffError, setStaffError] = useState("");
  const [toUserId, setToUserId] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState<any>(null),
    [working, setWorking] = useState(false),
    [denied, setDenied] = useState(false),
    [approvalUnknown, setApprovalUnknown] = useState(false);
  const active = useRef(true),
    inFlight = useRef(false),
    pendingRef = useRef<any>(null),
    readId = useRef(0);
  async function loadStaff(signal?: AbortSignal) {
    const id = ++readId.current;
    setStaffLoading(true);
    try {
      const result = await workspaceApi(
        base + "/shift-staff",
        "GET",
        undefined,
        signal,
      );
      if (!active.current || signal?.aborted || id !== readId.current) return;
      if (
        !Array.isArray(result) ||
        result.some(
          (person) =>
            typeof person.userId !== "string" ||
            typeof person.name !== "string",
        )
      )
        throw Error(
          "Receiving staff could not be confirmed. Refresh the list.",
        );
      setStaff(result);
      setStaffError("");
    } catch (e) {
      if (
        active.current &&
        id === readId.current &&
        (e as Error).name !== "AbortError"
      ) {
        setStaffError((e as Error).message);
        if ([401, 403, 404].includes((e as any).status)) {
          setDenied(true);
          setStaff([]);
        }
      }
    } finally {
      if (active.current && !signal?.aborted && id === readId.current)
        setStaffLoading(false);
    }
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    if (shift.status === "open") void loadStaff(controller.signal);
    return () => {
      active.current = false;
      readId.current++;
      controller.abort();
    };
  }, [base, shift.status]);
  async function handover() {
    if (disabled || inFlight.current || denied) return;
    const wasUnconfirmed = !!pendingRef.current,
      body = pendingRef.current || { requestKey: uuid(), toUserId, reason };
    inFlight.current = true;
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/shifts/" + shift.id + "/handover",
        "POST",
        body,
        "Shift responsibility handed over.",
      );
      if (!active.current) return;
      pendingRef.current = null;
      setPending(null);
      setReason("");
      setToUserId("");
    } catch (e) {
      if (!active.current) return;
      if (
        wasUnconfirmed ||
        !(e instanceof WorkspaceError) ||
        !e.status ||
        e.status >= 500
      ) {
        pendingRef.current = body;
        setPending(body);
      }
      if ([401, 403, 404].includes((e as any).status)) {
        setDenied(true);
        setStaff([]);
      }
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  async function approve() {
    if (
      disabled ||
      inFlight.current ||
      denied ||
      !canApprove ||
      approvalUnknown
    )
      return;
    inFlight.current = true;
    setWorking(true);
    setError("");
    try {
      await save(
        base + "/shifts/" + shift.id + "/approve",
        "POST",
        { reason },
        "Shift variance reviewed and approved.",
      );
      if (active.current) setReason("");
    } catch (e) {
      if (!active.current) return;
      if (!(e instanceof WorkspaceError) || !e.status || e.status >= 500)
        setApprovalUnknown(true);
      if ([401, 403, 404].includes((e as any).status)) setDenied(true);
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (active.current) setWorking(false);
    }
  }
  if (shift.status === "closed")
    return shift.approvalReason ? (
      <p className="fo-muted">Variance approved: {shift.approvalReason}</p>
    ) : null;
  return (
    <section
      className="fo-shift-actions"
      aria-label="Shift review and handover"
    >
      {error && (
        <p className="fo-error" role="alert">
          {error}
        </p>
      )}
      {denied ? (
        <ReadState
          kind="unavailable"
          title="Shift access needs checking. Refresh your workspace or sign in again before continuing."
        />
      ) : shift.status === "pending_approval" ? (
        <>
          <div className="fo-pending">
            <strong>Variance awaiting review</strong>
            <p>
              Cash variance{" "}
              {Number.isSafeInteger(shift.variance)
                ? formatMoney(shift.variance)
                : "not recorded"}{" "}
              awaits an organization administrator’s review.
            </p>
          </div>
          {approvalUnknown && (
            <ReadState
              kind="unavailable"
              title="Approval was not confirmed. Refresh this shift in the Shifts view before attempting another approval."
            />
          )}
          {canApprove && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void approve();
              }}
            >
              <fieldset
                className="fo-fieldset"
                disabled={disabled || working || approvalUnknown}
              >
                <ReasonInput
                  label="Variance approval reason"
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={setReason}
                  presets={[
                    "Till recount verified",
                    "Recorded cash movements checked",
                    "Variance reviewed with staff",
                  ]}
                />
                <Action type="submit" pending={working}>
                  Approve reconciled variance
                </Action>
              </fieldset>
            </form>
          )}
        </>
      ) : (
        <Disclosure summary="Hand over this open shift" className="fo-handover">
          <p className="fo-muted">
            Responsibility changes are recorded. This does not transfer funds or
            close the till.
          </p>
          {staffLoading && (
            <ReadState kind="loading" title="Loading receiving staff…" />
          )}
          {staffError && (
            <ReadState
              kind="error"
              title={staffError}
              retry={() => void loadStaff()}
              retryLabel="Retry receiving staff"
              pending={staffLoading}
            />
          )}
          {!staffLoading && !staffError && !staff.length && (
            <ReadState
              kind="empty"
              title="No eligible receiving staff are available for this branch."
            />
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handover();
            }}
          >
            <fieldset
              className="fo-fieldset"
              disabled={
                disabled || working || !!pending || staffLoading || !!staffError
              }
            >
              <div className="fo-form-grid">
                <Combobox
                  label="Receiving staff"
                  required
                  value={toUserId}
                  onChange={setToUserId}
                  placeholder="Choose an authorized staff member"
                  options={staff.map((person) => ({
                    value: person.userId,
                    label: person.name,
                  }))}
                />
                <ReasonInput
                  label="Handover reason"
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={setReason}
                  presets={[
                    "Shift change",
                    "Break cover",
                    "Manager taking over",
                  ]}
                />
              </div>
              <Action type="submit" disabled={!staff.length} pending={working}>
                Record shift handover
              </Action>
            </fieldset>
          </form>
          {pending && (
            <div className="fo-pending">
              <p role="status">
                Handover not confirmed. Keep this page open and retry the
                original request. Refreshing loses this direct retry; check the
                shift owner before starting again.
              </p>
              <Action
                disabled={disabled}
                pending={working}
                onClick={() => void handover()}
              >
                Retry original handover
              </Action>
            </div>
          )}
        </Disclosure>
      )}
    </section>
  );
}
