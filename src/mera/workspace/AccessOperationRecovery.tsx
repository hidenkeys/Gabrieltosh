import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { uuid } from "../../api";
import { workspaceApi, WorkspaceError } from "./api";
import { hasLegacyAccessWrite } from "./accessWriteJournal";
import {
  readAccessOperationMarker,
  saveAccessOperationMarker,
  clearAccessOperationMarker,
  type AccessOperationMarker,
} from "./accessOperationJournal";
type Save = (
  path: string,
  method: string,
  body: any,
  message: string,
) => Promise<any>;
type Props = {
  actorId: string;
  organizationId: string;
  canManage: boolean;
  disabled: boolean;
  authorityKey?: string;
  save: Save;
  children: React.ReactNode;
};
type Resolution = {
  operation: AccessOperationMarker["operation"];
  targetId: string | null;
  status: string;
  result?: any;
};
type Context = {
  actorId: string;
  organizationId: string;
  execute: Save;
  canStart: () => boolean;
  blocked: boolean;
  busy: boolean;
  denied: boolean;
  deny: () => void;
  revision: number;
  resolution: Resolution | null;
};
const AccessContext = createContext<Context | null>(null);
export function useAccessOperations() {
  const value = useContext(AccessContext);
  if (!value) throw Error("Access recovery context is missing.");
  return value;
}
export function AccessOperationBoundary(props: Props) {
  const context = useContext(AccessContext);
  return context &&
    context.actorId === props.actorId &&
    context.organizationId === props.organizationId ? (
    <>{props.children}</>
  ) : (
    <AccessOperationProvider {...props} />
  );
}
export function AccessOperationProvider(props: Props) {
  return (
    <ScopedAccessProvider
      key={props.actorId + "|" + props.organizationId}
      {...props}
    />
  );
}
function ScopedAccessProvider({
  actorId,
  organizationId,
  canManage,
  disabled,
  authorityKey = "",
  save,
  children,
}: Props) {
  const base = `/organizations/${encodeURIComponent(organizationId)}`;
  const [marker, setMarker] = useState<AccessOperationMarker | null>(null),
    [ready, setReady] = useState(false),
    [legacy, setLegacy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [denied, setDenied] = useState(false),
    [revision, setRevision] = useState(0),
    [resolution, setResolution] = useState<Resolution | null>(null);
  const markerRef = useRef<AccessOperationMarker | null>(null),
    original = useRef<{ path: string; method: string; body: any } | null>(null),
    flight = useRef(false),
    alive = useRef(true),
    denyRef = useRef(false),
    allowed = useRef(canManage),
    signature = useRef(authorityKey);
  const authorityEpoch = useRef(0);
  if (allowed.current !== canManage || signature.current !== authorityKey) {
    authorityEpoch.current += 1;
    original.current = null;
  }
  allowed.current = canManage;
  signature.current = authorityKey;
  const requireAuthority = (epoch: number) => {
    if (
      !alive.current ||
      !allowed.current ||
      denyRef.current ||
      authorityEpoch.current !== epoch
    )
      throw new WorkspaceError(
        "Access changed before the outcome could be reviewed. Check the original request again.",
        409,
      );
  };
  const hydrate = () => {
    try {
      const m = readAccessOperationMarker(actorId, organizationId);
      markerRef.current = m;
      setMarker(m);
      setLegacy(hasLegacyAccessWrite(actorId, organizationId));
      setReady(true);
    } catch {
      setReady(false);
      setError(
        "Saved access references could not be read. Keep this tab open and ask an administrator to review them.",
      );
    }
  };
  useEffect(() => {
    alive.current = true;
    hydrate();
    window.addEventListener("mera:access-operation", hydrate);
    return () => {
      alive.current = false;
      original.current = null;
      window.removeEventListener("mera:access-operation", hydrate);
    };
  }, []);
  useEffect(() => {
    original.current = null;
    setResolution(null);
  }, [canManage, authorityKey]);
  const deny = () => {
    if (denyRef.current) return;
    denyRef.current = true;
    original.current = null;
    setDenied(true);
    setResolution(null);
    setError(
      "Access needs checking. Refresh the workspace or sign in again before reviewing this request.",
    );
  };
  const classify = (path: string, method: string) => {
    if (path === base + "/roles" && method === "POST")
      return { operation: "role_create" as const, targetId: null };
    if (path === base + "/invitations" && method === "POST")
      return { operation: "invitation_create" as const, targetId: null };
    const m = path.match(
      /^\/organizations\/[^/]+\/(members|roles|invitations)\/([^/]+)$/,
    );
    if (!m || !path.startsWith(base + "/"))
      throw Error("This access action is unavailable.");
    if (m[1] === "members" && method === "PATCH")
      return {
        operation: "membership_update" as const,
        targetId: decodeURIComponent(m[2]),
      };
    if (m[1] === "roles" && method === "PATCH")
      return {
        operation: "role_update" as const,
        targetId: decodeURIComponent(m[2]),
      };
    if (m[1] === "invitations" && method === "DELETE")
      return {
        operation: "invitation_revoke" as const,
        targetId: decodeURIComponent(m[2]),
      };
    throw Error("This access action is unavailable.");
  };
  const normalize = (op: string, b: any) =>
    op === "membership_update"
      ? { active: b?.active }
      : op === "role_create" || op === "role_update"
        ? {
            name: b?.name?.trim(),
            permissions: [...new Set(b?.permissions || [])].sort(),
            ...(op === "role_update"
              ? { active: b?.active, version: b?.version }
              : {}),
          }
        : op === "invitation_create"
          ? {
              email: b?.email,
              role: b?.role,
              branchIds: [...new Set(b?.branchIds || [])].sort(),
            }
          : {};
  const pathFor = (m: AccessOperationMarker) =>
    base +
    (m.operation === "membership_update"
      ? `/members/${encodeURIComponent(m.targetId!)}/access-attempts/`
      : m.operation === "role_create"
        ? "/roles/create-attempts/"
        : m.operation === "role_update"
          ? `/roles/${encodeURIComponent(m.targetId!)}/update-attempts/`
          : m.operation === "invitation_create"
            ? "/invitations/create-attempts/"
            : `/invitations/${encodeURIComponent(m.targetId!)}/revoke-attempts/`) +
    m.requestKey;
  const forbidden = (value: any): boolean =>
    !!value &&
    typeof value === "object" &&
    Object.entries(value).some(
      ([key, v]) =>
        [
          "developmentToken",
          "token",
          "token_hash",
          "tokenHash",
          "password",
          "password_hash",
        ].includes(key) || forbidden(v),
    );
  function validate(value: any, m: AccessOperationMarker) {
    if (
      !value ||
      forbidden(value) ||
      value.requestKey !== m.requestKey ||
      value.actorId !== actorId ||
      value.organizationId !== organizationId ||
      value.operation !== m.operation ||
      value.targetId !== m.targetId ||
      !["recorded", "not_found", "abandoned"].includes(value.status)
    )
      throw Error(
        "The access-change outcome could not be verified. Keep the original reference and check again.",
      );
    if (value.status === "recorded") {
      const op = value.operationRecord,
        r = value.result;
      if (
        value.resultBasis !== "recorded_operation_snapshot" ||
        typeof op?.id !== "string" ||
        !op.id ||
        op.requestKey !== m.requestKey ||
        op.actorId !== actorId ||
        op.operation !== m.operation ||
        op.targetId !== m.targetId ||
        !r
      )
        throw Error("The recorded access change could not be verified.");
      if (
        original.current &&
        JSON.stringify(normalize(m.operation, original.current.body)) !==
          JSON.stringify(normalize(m.operation, op.intent))
      )
        throw Error(
          "The recorded access change differs from the original request. Ask an administrator to review it.",
        );
      if (
        m.operation === "membership_update" &&
        (typeof r.active !== "boolean" || r.active !== op.intent?.active)
      )
        throw Error("The staff access result could not be verified.");
      if (
        (m.operation === "role_create" || m.operation === "role_update") &&
        (typeof r.id !== "string" ||
          !r.id ||
          (m.targetId !== null && r.id !== m.targetId) ||
          typeof r.name !== "string" ||
          r.name !== op.intent?.name?.trim() ||
          !Array.isArray(r.permissions) ||
          JSON.stringify([...r.permissions].sort()) !==
            JSON.stringify([...new Set(op.intent?.permissions || [])].sort()) ||
          (m.operation === "role_create"
            ? r.active !== true || r.version !== 1
            : r.active !== op.intent?.active ||
              r.version !== op.intent?.version + 1) ||
          typeof r.active !== "boolean" ||
          !Number.isSafeInteger(r.version) ||
          r.version < 1)
      )
        throw Error("The role result could not be verified.");
      if (
        m.operation === "invitation_create" &&
        (typeof r.id !== "string" ||
          !r.id ||
          r.email !== op.intent?.email ||
          r.role !== op.intent?.role ||
          !Array.isArray(r.branchIds) ||
          JSON.stringify([...r.branchIds].sort()) !==
            JSON.stringify([...(op.intent?.branchIds || [])].sort()) ||
          r.delivery !== "not_sent" ||
          r.developmentTokenRecoverable !== false)
      )
        throw Error("The invitation result could not be verified.");
      if (m.operation === "invitation_revoke" && r.revoked !== true)
        throw Error("The invitation revocation could not be verified.");
    }
    if (
      value.status === "abandoned" &&
      (typeof value.resolutionId !== "string" || !value.resolutionId)
    )
      throw Error("The stopped access change could not be verified.");
    return value;
  }
  async function inspect(m: AccessOperationMarker, publish: boolean) {
    const epoch = authorityEpoch.current;
    const response = await workspaceApi(
      pathFor(m),
      "GET",
      undefined,
      undefined,
      {
        expectedActorId: actorId,
      },
    );
    requireAuthority(epoch);
    const value = validate(response, m);
    if (!alive.current || !allowed.current || denyRef.current)
      throw new WorkspaceError(
        "Access changed before the outcome could be reviewed.",
        403,
      );
    if (value.status === "not_found") {
      setNotice(
        "No completed access change was found. This does not confirm that an in-flight request has stopped. Retry the original change or stop it before making another.",
      );
      return value;
    }
    clearAccessOperationMarker(m);
    markerRef.current = null;
    original.current = null;
    setMarker(null);
    setError("");
    setNotice(
      value.status === "recorded"
        ? "The original access change was recorded. Review the latest staff, role or invitation records before continuing."
        : "The original access change is stopped. It cannot be applied later. Review a new change before submitting.",
    );
    if (publish) {
      setResolution({
        operation: m.operation,
        targetId: m.targetId,
        status: value.status,
        result: value.result,
      });
      setRevision((v) => v + 1);
    }
    return value;
  }
  const canStart = () => {
    try {
      return (
        ready &&
        allowed.current &&
        !denyRef.current &&
        !flight.current &&
        !markerRef.current &&
        !readAccessOperationMarker(actorId, organizationId) &&
        !hasLegacyAccessWrite(actorId, organizationId)
      );
    } catch {
      return false;
    }
  };
  async function execute(
    path: string,
    method: string,
    body: any,
    message: string,
  ) {
    if (disabled || !canStart())
      throw new WorkspaceError(
        "Review the original access change before making another.",
        409,
      );
    const identity = classify(path, method),
      started = signature.current,
      epoch = authorityEpoch.current;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let m: AccessOperationMarker;
    try {
      const payload = { ...structuredClone(body || {}), requestKey: uuid() };
      try {
        m = saveAccessOperationMarker({
          version: 1,
          actorId,
          organizationId,
          ...identity,
          requestKey: payload.requestKey,
        });
      } catch {
        setReady(false);
        throw Error(
          "This tab could not save a recovery reference. No access change was sent. Reload and review saved references before continuing.",
        );
      }
      markerRef.current = m;
      setMarker(m);
      original.current = { path, method, body: payload };
      const immediate = await save(path, method, payload, message);
      requireAuthority(epoch);
      const value = await inspect(m, false);
      requireAuthority(epoch);
      if (value.status !== "recorded")
        throw new WorkspaceError(
          "This access change is not yet confirmed. Use the recovery controls to check it.",
        );
      if (
        identity.operation === "invitation_create" &&
        immediate?.id === value.result.id &&
        typeof immediate.developmentToken === "string" &&
        /^[a-f0-9]{64}$/i.test(immediate.developmentToken) &&
        signature.current === started &&
        allowed.current
      )
        return {
          ...value.result,
          developmentToken: immediate.developmentToken,
          developmentTokenUnavailable: false,
          needsExplicitRevokeAndReinvite: false,
        };
      return value.result;
    } catch (e: any) {
      if (alive.current) {
        if ([401, 403, 404].includes(e?.status)) deny();
        else if (allowed.current)
          setError(e.message || "The access change could not be confirmed.");
      }
      throw e;
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function recover(mode: "check" | "retry" | "stop") {
    const m = markerRef.current;
    if (
      !m ||
      disabled ||
      !ready ||
      !allowed.current ||
      denyRef.current ||
      flight.current
    )
      return;
    const epoch = authorityEpoch.current;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "retry") {
        const request = original.current;
        if (!request) return;
        await save(
          request.path,
          request.method,
          request.body,
          "Checking the original access change.",
        );
      }
      requireAuthority(epoch);
      if (mode === "stop") {
        const stopped = await workspaceApi(
          pathFor(m) + "/abandon",
          "POST",
          {
            reason:
              "Administrator explicitly stopped the unresolved access change.",
          },
          undefined,
          { expectedActorId: actorId },
        );
        requireAuthority(epoch);
        validate(stopped, m);
      }
      if (alive.current && allowed.current && !denyRef.current)
        await inspect(m, true);
    } catch (e: any) {
      if (alive.current) {
        if ([401, 403, 404].includes(e?.status)) deny();
        else if (allowed.current)
          setError(e.message || "The access change could not be reviewed.");
      }
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const blocked = !ready || legacy || !!marker || busy || denied;
  return (
    <AccessContext.Provider
      value={{
        actorId,
        organizationId,
        execute,
        canStart,
        blocked,
        busy,
        denied,
        deny,
        revision,
        resolution,
      }}
    >
      {(legacy || marker || !ready || denied) && (
        <section className="mw-card" aria-label="Access change recovery">
          <h2>Access change outcome unconfirmed</h2>
          {legacy ? (
            <p>
              This tab has an older access-change reference without a request
              key. Changes remain paused across pages and branches. Ask an
              administrator to reconcile it; this view cannot safely retry, stop
              or clear that older reference.
            </p>
          ) : (
            <p>
              Access changes are paused across this organization’s pages and
              branches until the original outcome is checked. This tab stores
              only a recovery reference, without email addresses, permission
              choices or invitation tokens. No request is sent automatically.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {marker && !legacy && (
            <div className="mw-actions">
              <button
                type="button"
                className="secondary"
                disabled={disabled || busy || !canManage || denied}
                onClick={() => void recover("check")}
              >
                Check access change outcome
              </button>
              {original.current && (
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled || busy || !canManage || denied}
                  onClick={() => void recover("retry")}
                >
                  Retry original access change
                </button>
              )}
              <button
                type="button"
                className="secondary"
                disabled={disabled || busy || !canManage || denied}
                onClick={() => void recover("stop")}
              >
                Stop original access change
              </button>
            </div>
          )}
        </section>
      )}
      {notice && (
        <p role="status" className="mw-note">
          {notice}
        </p>
      )}
      {children}
    </AccessContext.Provider>
  );
}
