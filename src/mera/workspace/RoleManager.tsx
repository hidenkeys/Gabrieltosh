import React, { useEffect, useRef, useState } from "react";
import Switch from "../ui/Switch";
import { workspaceApi } from "./api";
import { permissionLabel } from "./accessPresentation";
import { hasAccessWrite } from "./accessWriteJournal";
import {
  AccessOperationBoundary,
  useAccessOperations,
} from "./AccessOperationRecovery";
type Props = {
  organizationId: string;
  userId?: string;
  branchId: string;
  permissions: string[];
  disabled: boolean;
  onAccessChanged?: () => void;
  canGrantOwner?: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const templateLabels: Record<string, string> = {
  owner: "Owner",
  organization_admin: "Organization administrator",
  branch_manager: "Branch manager",
  cashier: "Cashier",
  waiter: "Waiter",
  kitchen: "Kitchen",
  bar: "Bar",
  front_desk: "Front desk",
  stock_controller: "Stock controller",
  reports_only: "Reports only",
};
const roleDescriptions: Record<string, string> = {
  owner: "Owns the business and approves organization access.",
  organization_admin: "Manages organization settings and staff.",
  branch_manager: "Runs branch service and daily operations.",
  cashier: "Records orders and counter payments.",
  waiter: "Takes guest orders and manages table service.",
  kitchen: "Prepares kitchen items and updates tickets.",
  bar: "Prepares drinks and updates bar tickets.",
  front_desk: "Welcomes guests and manages arrivals.",
  stock_controller: "Maintains menu availability and stock.",
  reports_only: "Reviews operational reports.",
};
const permissionGroup = (permission: string) => {
  const area = permission.split(".")[0];
  return [
    "orders",
    "tickets",
    "preparation",
    "tables",
    "reservations",
    "visits",
    "waitlist",
  ].includes(area)
    ? "Service"
    : ["payments", "refunds", "shifts", "cash", "reports", "billing"].includes(
          area,
        )
      ? "Money & reports"
      : ["menu", "stock"].includes(area)
        ? "Menu & stock"
        : "Business & access";
};
export default function RoleManager(props: Props) {
  return (
    <AccessOperationBoundary
      actorId={props.userId || "current-session"}
      organizationId={props.organizationId}
      canManage={props.permissions.includes("members.manage")}
      authorityKey={JSON.stringify([
        props.permissions.slice().sort(),
        props.canGrantOwner === true,
      ])}
      disabled={props.disabled}
      save={props.save}
    >
      <ScopedRoleManager
        key={JSON.stringify([
          props.userId || "current-session",
          props.organizationId,
          props.branchId,
        ])}
        {...props}
      />
    </AccessOperationBoundary>
  );
}
function ScopedRoleManager({
  organizationId,
  userId = "current-session",
  branchId,
  permissions,
  disabled,
  onAccessChanged,
  canGrantOwner = false,
  save,
}: Props) {
  const access = useAccessOperations();
  const base = "/organizations/" + encodeURIComponent(organizationId);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<any>({
    name: "",
    permissions: [],
    active: true,
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("cashier");
  const [invitation, setInvitation] = useState<any>(null);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true),
    [rolesError, setRolesError] = useState("");
  const [invitationsLoading, setInvitationsLoading] = useState(true),
    [invitationsError, setInvitationsError] = useState("");
  const [invitationUnknown, setInvitationUnknown] = useState(false);
  const [denied, setDenied] = useState(false),
    [roleUnknown, setRoleUnknown] = useState(false),
    [revokeUnknown, setRevokeUnknown] = useState<Record<string, boolean>>({}),
    [tokenRevealed, setTokenRevealed] = useState(false),
    [dirty, setDirty] = useState(false),
    [journalPaused, setJournalPaused] = useState(() =>
      hasAccessWrite(userId, organizationId),
    );
  const authorityKey = JSON.stringify([
    permissions.slice().sort(),
    canGrantOwner,
  ]);
  const authority = useRef({ permissions, canGrantOwner, key: authorityKey });
  authority.current = { permissions, canGrantOwner, key: authorityKey };
  const deniedRef = useRef(false),
    writeLock = useRef(false),
    inviteFrozen = useRef(false),
    roleFrozen = useRef(false),
    revokeFrozen = useRef<Record<string, boolean>>({}),
    dirtyRef = useRef(false),
    tokenAuthority = useRef(authorityKey);
  const managementLost = !permissions.includes("members.manage");
  function deny() {
    access.deny();
    deniedRef.current = true;
    rolesGeneration.current++;
    invitesGeneration.current++;
    setDenied(true);
    setData(null);
    setInvitations([]);
    setInvitation(null);
    setTokenRevealed(false);
    setEmail("");
    setError("");
    setEdit({ name: "", permissions: [], active: true });
    dirtyRef.current = false;
    setDirty(false);
    setRolesError("");
    setInvitationsError("");
    setRolesLoading(false);
    setInvitationsLoading(false);
  }
  function changedEdit(value: any) {
    dirtyRef.current = true;
    setDirty(true);
    setEdit(value);
  }
  const journalBegin = (kind: string) => {
    const ok = access.canStart();
    if (!ok) setJournalPaused(true);
    return ok;
  };
  const allowedNow = () =>
    !deniedRef.current &&
    authority.current.permissions.includes("members.manage") &&
    !access.denied;
  const deliveryLabel = (value: unknown) =>
    (
      ({
        not_sent: "Not sent",
        sent: "Sent",
        delivered: "Delivered",
        failed: "Delivery failed",
        pending: "Awaiting delivery",
      }) as Record<string, string>
    )[String(value)] || "Delivery not confirmed";
  useEffect(() => {
    setInvitation(null);
    setTokenRevealed(false);
    tokenAuthority.current = authorityKey;
    if (managementLost) deny();
  }, [authorityKey]);
  const active = useRef(true),
    rolesGeneration = useRef(0),
    invitesGeneration = useRef(0),
    editor = useRef<HTMLDetailsElement>(null);
  const readRoles = async (signal?: AbortSignal) => {
    if (!allowedNow()) return false;
    const version = ++rolesGeneration.current;
    setRolesLoading(true);
    setRolesError("");
    try {
      const result = await workspaceApi(
        base + "/roles",
        "GET",
        undefined,
        signal,
      );
      if (
        !active.current ||
        !allowedNow() ||
        signal?.aborted ||
        version !== rolesGeneration.current
      )
        return false;
      if (
        !Array.isArray(result?.templates) ||
        !Array.isArray(result?.custom) ||
        [...result.templates, ...result.custom].some(
          (row: any) =>
            !row ||
            typeof row.id !== "string" ||
            typeof row.name !== "string" ||
            !Array.isArray(row.permissions),
        )
      )
        throw new Error("Invalid role response");
      setData(result);
      return true;
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === rolesGeneration.current &&
        failure.name !== "AbortError"
      ) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else setRolesError("Roles could not be loaded. Try again.");
      }
      return false;
    } finally {
      if (
        active.current &&
        !signal?.aborted &&
        version === rolesGeneration.current
      )
        setRolesLoading(false);
    }
  };
  const readInvitations = async (signal?: AbortSignal) => {
    if (!allowedNow()) return false;
    const version = ++invitesGeneration.current;
    setInvitationsLoading(true);
    setInvitationsError("");
    try {
      const result = await workspaceApi(
        base + "/invitations",
        "GET",
        undefined,
        signal,
      );
      if (
        !active.current ||
        !allowedNow() ||
        signal?.aborted ||
        version !== invitesGeneration.current
      )
        return false;
      if (
        !Array.isArray(result) ||
        result.some(
          (row: any) =>
            !row || typeof row.id !== "string" || typeof row.email !== "string",
        )
      )
        throw new Error("Invalid invitation response");
      setInvitations(result);
      return true;
    } catch (failure: any) {
      if (
        active.current &&
        !signal?.aborted &&
        version === invitesGeneration.current &&
        failure.name !== "AbortError"
      ) {
        if ([401, 403, 404].includes(failure.status)) deny();
        else setInvitationsError("Invitations could not be loaded. Try again.");
      }
      return false;
    } finally {
      if (
        active.current &&
        !signal?.aborted &&
        version === invitesGeneration.current
      )
        setInvitationsLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void readRoles(controller.signal);
    void readInvitations(controller.signal);
    return () => {
      active.current = false;
      rolesGeneration.current++;
      invitesGeneration.current++;
      controller.abort();
    };
  }, [base]);
  useEffect(() => {
    if (access.denied) deny();
  }, [access.denied]);
  useEffect(() => {
    if (!access.revision || !allowedNow()) return;
    inviteFrozen.current = false;
    roleFrozen.current = false;
    revokeFrozen.current = {};
    setInvitationUnknown(false);
    setRoleUnknown(false);
    setRevokeUnknown({});
    setJournalPaused(false);
    setError("");
    const outcome = access.resolution;
    if (
      outcome?.operation === "role_create" ||
      outcome?.operation === "role_update"
    ) {
      if (outcome.status === "recorded") {
        dirtyRef.current = false;
        setDirty(false);
        setEdit({ name: "", permissions: [], active: true });
        onAccessChanged?.();
      }
      void readRoles();
    }
    if (
      outcome?.operation === "invitation_create" ||
      outcome?.operation === "invitation_revoke"
    ) {
      setTokenRevealed(false);
      tokenAuthority.current = authority.current.key;
      if (
        outcome.operation === "invitation_create" &&
        outcome.status === "recorded"
      ) {
        setInvitation(outcome.result);
        setEmail("");
      } else setInvitation(null);
      void readInvitations();
    }
  }, [access.revision]);
  const eligible = [...(data?.templates || []), ...(data?.custom || [])].filter(
    (row) =>
      row.active !== false &&
      (row.id !== "owner" || canGrantOwner) &&
      row.permissions.every((permission: string) =>
        permissions.includes(permission),
      ),
  );
  if (denied || managementLost)
    return (
      <section className="mw-card mw-staff-management">
        <h2>Invite staff & manage roles</h2>
        <p role="alert">
          People access needs checking. Refresh the workspace or sign in again.
        </p>
      </section>
    );
  return (
    <section className="mw-card mw-staff-management">
      <h2>Invite staff & manage roles</h2>
      <p>
        Invite someone to this branch, or review reusable roles and their
        access. Invitations created here apply only to the selected branch.
      </p>
      {error && <p role="alert">{error}</p>}
      {rolesError && (
        <div role="alert">
          <p>{rolesError}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy || rolesLoading}
            onClick={() => void readRoles()}
          >
            Retry loading roles
          </button>
        </div>
      )}
      {rolesLoading && data && (
        <p role="status">Refreshing organization roles…</p>
      )}
      {rolesError && data && (
        <p>Showing previously loaded roles. Refresh before making changes.</p>
      )}
      {rolesLoading && !data ? (
        <p role="status">Loading organization roles…</p>
      ) : !data ? null : (
        <>
          <section className="mw-staff-invite">
            <h3>Invite to this branch</h3>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  inviteFrozen.current ||
                  !allowedNow() ||
                  writeLock.current ||
                  disabled ||
                  rolesLoading ||
                  rolesError ||
                  !eligible.some((row) => row.id === role)
                )
                  return;
                if (!journalBegin("invitation_create")) return;
                writeLock.current = true;
                const startedAuthority = authority.current.key;
                setBusy(true);
                setError("");
                try {
                  const result = await access.execute(
                    base + "/invitations",
                    "POST",
                    { email, role, branchIds: [branchId] },
                    "Invitation created; check its delivery status.",
                  );
                  if (!active.current || !allowedNow()) return;
                  if (startedAuthority !== authority.current.key) return;
                  tokenAuthority.current = startedAuthority;
                  setTokenRevealed(false);
                  setInvitation(result);
                  setEmail("");
                  await readInvitations();
                } catch (e) {
                  if (active.current && allowedNow()) {
                    if ([401, 403, 404].includes((e as any).status)) deny();
                    else {
                      setError((e as Error).message);
                      if (!(e as any).status || (e as any).status >= 500) {
                        inviteFrozen.current = true;
                        setInvitationUnknown(true);
                      }
                    }
                  }
                } finally {
                  writeLock.current = false;
                  if (active.current) setBusy(false);
                }
              }}
            >
              <fieldset
                disabled={
                  disabled ||
                  busy ||
                  invitationUnknown ||
                  access.blocked ||
                  journalPaused ||
                  (!busy && hasAccessWrite(userId, organizationId)) ||
                  rolesLoading ||
                  !!rolesError
                }
                className="mw-staff-invite-fields"
              >
                <div className="mw-form">
                  <label>
                    Staff email
                    <input
                      required
                      type="email"
                      maxLength={200}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <fieldset className="mw-wide mi-role-cards">
                    <legend>Invitation role</legend>
                    {eligible.map((row) => (
                      <label key={row.id} className="mi-role-card">
                        <input
                          type="radio"
                          name="invitationRole"
                          aria-label={templateLabels[row.id] || row.name}
                          required
                          value={row.id}
                          checked={role === row.id}
                          onChange={() => setRole(row.id)}
                        />
                        <span>
                          <strong>{templateLabels[row.id] || row.name}</strong>
                          <small>
                            {roleDescriptions[row.id] ||
                              "Uses the permissions saved in this custom role."}
                          </small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <button
                    className="primary"
                    disabled={
                      disabled ||
                      busy ||
                      invitationUnknown ||
                      !!rolesError ||
                      !eligible.some((row) => row.id === role)
                    }
                  >
                    Create branch invitation
                  </button>
                </div>
              </fieldset>
            </form>
            {eligible.some((row) => row.id === role) && (
              <details>
                <summary>Review selected role access</summary>
                <p>This invitation grants the selected role for this branch.</p>
                <ul>
                  {eligible
                    .find((row) => row.id === role)
                    .permissions.map((permission: string) => (
                      <li key={permission}>{permissionLabel(permission)}</li>
                    ))}
                </ul>
              </details>
            )}
            {invitation && tokenAuthority.current === authorityKey && (
              <div className="mw-note">
                <strong>Delivery: {deliveryLabel(invitation.delivery)}</strong>
                <p>
                  {invitation.reason ||
                    "Creating an invitation is not evidence that an email was sent."}
                </p>
                {invitation.developmentTokenUnavailable && (
                  <p>
                    The one-time development invitation token is unavailable.
                    This invitation was not emailed. If a new token is needed,
                    explicitly revoke this invitation in history, then review
                    and create a new one.
                  </p>
                )}
                {invitation.developmentToken && (
                  <>
                    <p>
                      Development-only invitation access. Share privately with
                      the intended recipient.
                    </p>
                    {tokenRevealed && (
                      <label>
                        Development invitation token
                        <input
                          readOnly
                          value={invitation.developmentToken}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => setTokenRevealed((value) => !value)}
                    >
                      {tokenRevealed
                        ? "Hide invitation token"
                        : "Show development invitation token"}
                    </button>
                  </>
                )}
              </div>
            )}
            {invitationUnknown && (
              <div className="mw-note" role="status">
                <strong>Invitation outcome unconfirmed</strong>
                <p>
                  Refresh invitation history and ask an administrator to
                  reconcile this request before creating another. Refreshing an
                  empty list does not prove it failed. No invitation is sent
                  again automatically.
                </p>
                <button
                  type="button"
                  disabled={busy || invitationsLoading}
                  onClick={() => void readInvitations()}
                >
                  Refresh invitation history
                </button>
              </div>
            )}
          </section>
          <h3 className="mw-staff-section-title">Invitation history</h3>
          {Object.values(revokeUnknown).some(Boolean) && (
            <div className="mw-note" role="status">
              <p>
                An invitation revocation is unconfirmed. Review the current
                invitations with an administrator before any further action on
                that invitation. Reading the list does not retry or unlock the
                request.
              </p>
              <button
                type="button"
                disabled={busy || invitationsLoading}
                onClick={() => void readInvitations()}
              >
                Read current invitations
              </button>
            </div>
          )}
          {invitationsLoading ? (
            <p role="status">Loading invitations…</p>
          ) : invitationsError ? (
            <div role="alert">
              <p>{invitationsError}</p>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void readInvitations()}
              >
                Retry loading invitations
              </button>
            </div>
          ) : !invitations.length ? (
            <p>No invitations recorded.</p>
          ) : (
            invitations.map((invite) => (
              <div className="mw-row" key={invite.id}>
                <div>
                  <b>{invite.email}</b>
                  <p>
                    {invite.accepted
                      ? "Accepted"
                      : invite.revoked
                        ? "Revoked"
                        : typeof invite.expiresAt !== "string" ||
                            !Number.isFinite(Date.parse(invite.expiresAt))
                          ? "Expiry unavailable"
                          : new Date(invite.expiresAt).getTime() < Date.now()
                            ? "Expired"
                            : "Pending acceptance"}{" "}
                    · Delivery: {deliveryLabel(invite.delivery)}
                  </p>
                </div>
                {!invite.accepted && !invite.revoked && (
                  <button
                    disabled={
                      disabled ||
                      busy ||
                      access.blocked ||
                      journalPaused ||
                      (!busy && hasAccessWrite(userId, organizationId)) ||
                      !!revokeUnknown[invite.id]
                    }
                    type="button"
                    onClick={async () => {
                      if (
                        disabled ||
                        writeLock.current ||
                        !allowedNow() ||
                        revokeFrozen.current[invite.id]
                      )
                        return;
                      if (!journalBegin("invitation_revoke")) return;
                      writeLock.current = true;
                      setBusy(true);
                      setError("");
                      try {
                        await access.execute(
                          base + "/invitations/" + invite.id,
                          "DELETE",
                          undefined,
                          "Invitation revoked.",
                        );
                        if (!active.current || !allowedNow()) return;
                        await readInvitations();
                        if (active.current) setInvitation(null);
                      } catch (e) {
                        if (active.current && allowedNow()) {
                          if ([401, 403, 404].includes((e as any).status))
                            deny();
                          else {
                            setError((e as Error).message);
                            if (
                              !(e as any).status ||
                              (e as any).status >= 500
                            ) {
                              revokeFrozen.current = {
                                ...revokeFrozen.current,
                                [invite.id]: true,
                              };
                              setRevokeUnknown(revokeFrozen.current);
                            }
                          }
                        }
                      } finally {
                        writeLock.current = false;
                        if (active.current) setBusy(false);
                      }
                    }}
                  >
                    {revokeUnknown[invite.id]
                      ? "Revocation unconfirmed"
                      : "Revoke invitation"}
                  </button>
                )}
              </div>
            ))
          )}
          <h3 className="mw-staff-section-title">Custom roles</h3>
          {!data.custom?.length ? (
            <p>No custom roles yet. Template roles remain available.</p>
          ) : (
            data.custom.map((row: any) => (
              <div className="mw-row" key={row.id}>
                <div>
                  <b>{row.name}</b>
                  <p>
                    {row.active ? "Active" : "Inactive"} ·{" "}
                    {row.permissions.length}{" "}
                    {row.permissions.length === 1
                      ? "permission"
                      : "permissions"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    disabled ||
                    busy ||
                    row.permissions.some(
                      (permission: string) => !permissions.includes(permission),
                    )
                  }
                  onClick={() => {
                    if (roleFrozen.current || writeLock.current) return;
                    if (dirtyRef.current) {
                      setError(
                        "Keep or explicitly discard the current role draft before editing another role.",
                      );
                      return;
                    }
                    setEdit({ ...row });
                    if (editor.current) editor.current.open = true;
                  }}
                >
                  Edit role
                </button>
              </div>
            ))
          )}
          <details className="mw-staff-role-editor" ref={editor}>
            <summary>
              {edit.id ? "Edit custom role" : "Create custom role"}
            </summary>{" "}
            <h3>{edit.id ? "Edit custom role" : "Create custom role"}</h3>
            {roleUnknown && (
              <div className="mw-note" role="status">
                <strong>Role save unconfirmed</strong>
                <p>
                  The original role draft is retained. Further role changes are
                  paused; ask an administrator to reconcile the saved roles.
                  Refreshing does not retry or unlock this request.
                </p>
                <button
                  type="button"
                  disabled={busy || rolesLoading}
                  onClick={() => void readRoles()}
                >
                  Read current roles
                </button>
              </div>
            )}
            {dirty && !roleUnknown && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  dirtyRef.current = false;
                  setDirty(false);
                  setEdit({ name: "", permissions: [], active: true });
                  setError("");
                }}
              >
                Discard role draft
              </button>
            )}
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  disabled ||
                  writeLock.current ||
                  !allowedNow() ||
                  roleFrozen.current ||
                  rolesLoading ||
                  rolesError ||
                  edit.permissions.some(
                    (permission: string) =>
                      !authority.current.permissions.includes(permission),
                  )
                )
                  return;
                if (!journalBegin(edit.id ? "role_update" : "role_create"))
                  return;
                writeLock.current = true;
                setBusy(true);
                setError("");
                try {
                  await access.execute(
                    base + "/roles" + (edit.id ? "/" + edit.id : ""),
                    edit.id ? "PATCH" : "POST",
                    {
                      name: edit.name,
                      permissions: edit.permissions,
                      ...(edit.id
                        ? { version: edit.version, active: edit.active }
                        : {}),
                    },
                    "Custom role saved.",
                  );
                  if (!active.current || !allowedNow()) return;
                  onAccessChanged?.();
                  dirtyRef.current = false;
                  setDirty(false);
                  setEdit({ name: "", permissions: [], active: true });
                  await readRoles();
                } catch (e) {
                  if (active.current && allowedNow()) {
                    if ([401, 403, 404].includes((e as any).status)) deny();
                    else {
                      setError((e as Error).message);
                      if (!(e as any).status || (e as any).status >= 500) {
                        roleFrozen.current = true;
                        setRoleUnknown(true);
                      }
                    }
                  }
                } finally {
                  writeLock.current = false;
                  if (active.current) setBusy(false);
                }
              }}
            >
              <fieldset
                disabled={
                  disabled ||
                  busy ||
                  roleUnknown ||
                  access.blocked ||
                  journalPaused ||
                  (!busy && hasAccessWrite(userId, organizationId)) ||
                  rolesLoading ||
                  !!rolesError ||
                  edit.permissions.some(
                    (permission: string) => !permissions.includes(permission),
                  )
                }
                style={{ border: 0, padding: 0 }}
              >
                <label>
                  Role name
                  <input
                    required
                    minLength={2}
                    maxLength={70}
                    value={edit.name}
                    onChange={(e) =>
                      changedEdit({ ...edit, name: e.target.value })
                    }
                  />
                </label>
                <fieldset>
                  <legend>Allowed permissions</legend>
                  {!edit.id && (
                    <div className="mw-actions" aria-label="Permission presets">
                      {eligible
                        .filter((row) =>
                          data.templates.some(
                            (template: any) => template.id === row.id,
                          ),
                        )
                        .map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() =>
                              changedEdit({
                                ...edit,
                                permissions: [...row.permissions],
                              })
                            }
                          >
                            Use {templateLabels[row.id] || row.name} permissions
                          </button>
                        ))}
                    </div>
                  )}
                  <p>
                    {eligible.some(
                      (row) =>
                        row.permissions.length === edit.permissions.length &&
                        row.permissions.every((permission: string) =>
                          edit.permissions.includes(permission),
                        ),
                    )
                      ? "Matches a role’s saved permissions."
                      : edit.permissions.length
                        ? "Customized permissions"
                        : "Choose a role preset or add the permissions this person needs."}
                  </p>
                  {[
                    "Service",
                    "Money & reports",
                    "Menu & stock",
                    "Business & access",
                  ].map((group) => {
                    const values = permissions.filter(
                      (permission) => permissionGroup(permission) === group,
                    );
                    return values.length ? (
                      <fieldset className="mi-permission-group" key={group}>
                        <legend>{group}</legend>
                        <div>
                          {values.map((permission) => (
                            <Switch
                              key={permission}
                              label={permissionLabel(permission)}
                              checked={edit.permissions.includes(permission)}
                              onChange={(checked) =>
                                changedEdit({
                                  ...edit,
                                  permissions: checked
                                    ? [...edit.permissions, permission]
                                    : edit.permissions.filter(
                                        (value: string) => value !== permission,
                                      ),
                                })
                              }
                            />
                          ))}
                        </div>
                      </fieldset>
                    ) : null;
                  })}
                </fieldset>
                {edit.id && (
                  <p>
                    Deactivating a custom role suspends linked members and
                    revokes pending invitations. Restoring the role does not
                    automatically restore those accounts or invitations.
                  </p>
                )}
                {edit.id && (
                  <Switch
                    label="Role active"
                    checked={edit.active}
                    onChange={(active) => changedEdit({ ...edit, active })}
                  />
                )}
                <div className="mw-actions">
                  <button
                    className="secondary"
                    disabled={!edit.permissions.length}
                  >
                    Save custom role
                  </button>
                  {edit.id && (
                    <button
                      type="button"
                      onClick={() => {
                        dirtyRef.current = false;
                        setDirty(false);
                        setEdit({ name: "", permissions: [], active: true });
                      }}
                    >
                      Cancel editing
                    </button>
                  )}
                </div>
              </fieldset>
            </form>
          </details>{" "}
        </>
      )}
    </section>
  );
}
