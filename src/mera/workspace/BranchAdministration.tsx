import React, { useEffect, useRef, useState } from "react";
type Branch = {
  id: string;
  name: string;
  timezone?: string;
  currency?: string;
};
type Draft = {
  name: string;
  timezone: string;
  currency: "NGN";
  serviceModes: string[];
  cutoff: number;
};
type Props = {
  /** Confirmed authenticated context actor only. */
  actorId?: string;
  organizationId: string;
  branches?: Branch[] | null;
  activeBranchId?: string;
  loading?: boolean;
  listError?: string;
  canManage: boolean;
  organizationWide: boolean;
  creationIdempotencyReady?: boolean;
  disabled?: boolean;
  onChoose: (id: string) => void;
  onRefresh: () => Promise<any>;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const initial: Draft = {
  name: "",
  timezone: "Africa/Lagos",
  currency: "NGN",
  serviceModes: ["counter_takeaway"],
  cutoff: 0,
};
const modes = {
  counter_takeaway: "Counter & takeaway",
  table_service: "Table service",
  reservations: "Reservations",
  lounge_club: "Lounge & club",
};
type Intent = Draft & { requestKey: string };
const prefix = "mera:branch-create:v1:";
function validIntent(value: any): value is Intent {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "requestKey",
          "name",
          "timezone",
          "currency",
          "serviceModes",
          "cutoff",
        ].includes(key),
    )
  )
    return false;
  if (
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
      value.requestKey,
    ) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 100 ||
    typeof value.timezone !== "string" ||
    value.timezone.length > 100 ||
    value.currency !== "NGN" ||
    !Number.isInteger(value.cutoff) ||
    value.cutoff < 0 ||
    value.cutoff > 1439 ||
    !Array.isArray(value.serviceModes) ||
    value.serviceModes.length < 1 ||
    value.serviceModes.length > 4 ||
    new Set(value.serviceModes).size !== value.serviceModes.length ||
    value.serviceModes.some(
      (mode: any) => !Object.prototype.hasOwnProperty.call(modes, mode),
    )
  )
    return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timezone });
    return true;
  } catch {
    return false;
  }
}
function restore(key: string | null): {
  intent: Intent | null;
  blocked: boolean;
} {
  if (!key) return { intent: null, blocked: true };
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return { intent: null, blocked: false };
    if (raw.length > 4096) return { intent: null, blocked: true };
    const value = JSON.parse(raw);
    return validIntent(value)
      ? { intent: value, blocked: false }
      : { intent: null, blocked: true };
  } catch {
    return { intent: null, blocked: true };
  }
}
function persist(key: string | null, body: Intent) {
  if (!key || !validIntent(body)) return false;
  try {
    const raw = JSON.stringify(body);
    sessionStorage.setItem(key, raw);
    return sessionStorage.getItem(key) === raw;
  } catch {
    return false;
  }
}
export default function BranchAdministration(props: Props) {
  return (
    <ScopedBranchAdministration
      key={JSON.stringify([props.actorId, props.organizationId])}
      {...props}
    />
  );
}
function ScopedBranchAdministration({
  organizationId,
  actorId,
  branches,
  activeBranchId,
  loading = false,
  listError = "",
  canManage,
  organizationWide,
  creationIdempotencyReady = false,
  disabled = false,
  onChoose,
  onRefresh,
  save,
}: Props) {
  const storageKey =
    actorId && organizationId
      ? prefix + JSON.stringify([actorId, organizationId])
      : null;
  const [restored] = useState(() => restore(storageKey));
  const [blocked, setBlocked] = useState(restored.blocked);
  const [draft, setDraft] = useState<Draft>(restored.intent || initial),
    [pending, setPending] = useState<(Draft & { requestKey: string }) | null>(
      restored.intent,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState<Branch | null>(null);
  const submitting = useRef(false);
  const allowed = canManage && organizationWide;
  useEffect(() => {
    const logout = () => {
      try {
        for (let index = sessionStorage.length - 1; index >= 0; index--) {
          const key = sessionStorage.key(index);
          if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
        }
      } catch {}
      setPending(null);
      setDraft(initial);
      setCreated(null);
      setBlocked(true);
    };
    window.addEventListener("mera:logout", logout);
    return () => window.removeEventListener("mera:logout", logout);
  }, []);
  const refresh = async () => {
    setError("");
    setBusy(true);
    try {
      await onRefresh();
    } catch {
      setError("The branch list could not be refreshed. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const submit = async (body: Draft & { requestKey: string }) => {
    if (
      !allowed ||
      !actorId ||
      blocked ||
      !creationIdempotencyReady ||
      disabled ||
      submitting.current
    )
      return;
    if (!validIntent(body)) {
      setError(
        "Check the branch name, timezone, service modes and trading-day start before submitting.",
      );
      return;
    }
    if (!persist(storageKey, body)) {
      setBlocked(true);
      setError(
        "This browser cannot safely retain the branch submission. No request was sent. Keep the draft and contact support before trying again.",
      );
      return;
    }
    const wasUncertain = !!pending;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await save(
        `/organizations/${encodeURIComponent(organizationId)}/branches`,
        "POST",
        body,
        "Draft branch created. Complete its setup before publishing.",
      );
      if (
        !result ||
        typeof result.id !== "string" ||
        typeof result.name !== "string" ||
        result.organizationId !== organizationId ||
        result.requestKey !== body.requestKey
      )
        throw new Error("The creation response could not be verified.");
      try {
        if (storageKey) sessionStorage.removeItem(storageKey);
      } catch {}
      setPending(null);
      setCreated(result);
      try {
        await onRefresh();
      } catch {
        setError(
          "The draft branch was created, but the branch list could not be refreshed. Refresh the list before opening it.",
        );
      }
    } catch (failure: any) {
      setError(failure.message || "The branch could not be created.");
      if (
        wasUncertain ||
        ![400, 422].includes(failure.status) ||
        failure.code === "IDEMPOTENCY_CONFLICT"
      )
        setPending(body);
      else {
        try {
          if (storageKey) sessionStorage.removeItem(storageKey);
        } catch {
          setBlocked(true);
        }
      }
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };
  const rows = Array.isArray(branches) ? branches : null;
  return (
    <section
      className="mw-branch-admin mw-card"
      aria-label="Organization branches"
    >
      <header className="mw-branch-admin-heading">
        <div>
          <h2>Your branches</h2>
          <p>Choose a branch to work on its menu and settings.</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy || loading}
          onClick={() => void refresh()}
        >
          Refresh branches
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading branches…</p>
      ) : listError ? (
        <p role="alert">{listError}</p>
      ) : rows === null ? (
        <p>Branch information is unavailable. Refresh the list to try again.</p>
      ) : !rows.length ? (
        <p>No branches are available to this account.</p>
      ) : (
        <ul className="mw-branch-admin-list">
          {rows.map((branch) => (
            <li key={branch.id}>
              <div>
                <strong>{branch.name}</strong>
                <span>
                  {[branch.timezone, branch.currency]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {branch.id === activeBranchId ? (
                <span className="mw-branch-admin-current">Current branch</span>
              ) : (
                <button
                  className="secondary"
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => onChoose(branch.id)}
                >
                  Open {branch.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {allowed && (
        <details className="mw-branch-admin-create">
          <summary>Create a draft branch</summary>
          <p>
            A new branch starts with ordering paused and its menu unpublished.
            It still needs its own setup and review.
          </p>
          {blocked || !actorId ? (
            <p role="alert">
              Branch creation is paused because saved submission details cannot
              be safely restored. Contact a manager before creating another
              branch.
            </p>
          ) : !creationIdempotencyReady ? (
            <p>
              Branch creation is temporarily unavailable. You can continue
              working with existing branches.
            </p>
          ) : created ? (
            <div role="status">
              <p>Draft branch “{created.name}” was created.</p>
              {rows?.some((branch) => branch.id === created.id) ? (
                <button
                  type="button"
                  className="primary"
                  disabled={disabled || busy}
                  onClick={() => onChoose(created.id)}
                >
                  Set up {created.name}
                </button>
              ) : (
                <p>Refresh branches before opening its setup.</p>
              )}
              <button
                type="button"
                className="secondary"
                disabled={disabled || busy}
                onClick={() => {
                  setCreated(null);
                  setDraft(initial);
                }}
              >
                Create another draft
              </button>
            </div>
          ) : (
            <>
              {pending && (
                <div className="mw-branch-admin-warning" role="status">
                  <strong>Branch creation is unconfirmed</strong>
                  <p>
                    Keep this original draft. Refresh the branch list to check
                    the result. Retry only the original submission; a new
                    submission could create another branch.
                  </p>
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => void submit(pending)}
                  >
                    Retry original branch creation
                  </button>
                </div>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!pending)
                    void submit({ ...draft, requestKey: crypto.randomUUID() });
                }}
              >
                <fieldset disabled={disabled || busy || !!pending}>
                  <label>
                    Branch name
                    <input
                      required
                      maxLength={100}
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Timezone
                    <input
                      required
                      value={draft.timezone}
                      onChange={(event) =>
                        setDraft({ ...draft, timezone: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Currency
                    <select value={draft.currency} onChange={() => {}}>
                      <option value="NGN">Nigerian naira (NGN)</option>
                    </select>
                  </label>
                  <label>
                    Trading day starts
                    <input
                      required
                      type="time"
                      value={
                        String(Math.floor(draft.cutoff / 60)).padStart(2, "0") +
                        ":" +
                        String(draft.cutoff % 60).padStart(2, "0")
                      }
                      onChange={(event) => {
                        const [hours, minutes] = event.target.value
                          .split(":")
                          .map(Number);
                        setDraft({ ...draft, cutoff: hours * 60 + minutes });
                      }}
                    />
                  </label>
                  <fieldset>
                    <legend>Service modes</legend>
                    {Object.entries(modes).map(([mode, label]) => (
                      <label className="mw-branch-admin-choice" key={mode}>
                        <input
                          type="checkbox"
                          checked={draft.serviceModes.includes(mode)}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              serviceModes: event.target.checked
                                ? [...draft.serviceModes, mode]
                                : draft.serviceModes.filter(
                                    (value) => value !== mode,
                                  ),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <button
                    type="submit"
                    className="primary"
                    disabled={!draft.serviceModes.length}
                  >
                    Create draft branch
                  </button>
                </fieldset>
              </form>
            </>
          )}
        </details>
      )}
    </section>
  );
}
