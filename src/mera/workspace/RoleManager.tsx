import React, { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
type Props = {
  organizationId: string;
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
export default function RoleManager(props: Props) {
  return (
    <ScopedRoleManager
      key={JSON.stringify([props.organizationId, props.branchId])}
      {...props}
    />
  );
}
function ScopedRoleManager({
  organizationId,
  branchId,
  permissions,
  disabled,
  onAccessChanged,
  canGrantOwner = false,
  save,
}: Props) {
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
  const active = useRef(true),
    rolesGeneration = useRef(0),
    invitesGeneration = useRef(0),
    editor = useRef<HTMLDetailsElement>(null);
  const readRoles = async (signal?: AbortSignal) => {
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
      )
        setRolesError("Roles could not be loaded. Try again.");
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
      )
        setInvitationsError("Invitations could not be loaded. Try again.");
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
  const eligible = [...(data?.templates || []), ...(data?.custom || [])].filter(
    (row) =>
      row.active !== false &&
      (row.id !== "owner" || canGrantOwner) &&
      row.permissions.every((permission: string) =>
        permissions.includes(permission),
      ),
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
                  invitationUnknown ||
                  disabled ||
                  busy ||
                  rolesLoading ||
                  rolesError ||
                  !eligible.some((row) => row.id === role)
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  const result = await save(
                    base + "/invitations",
                    "POST",
                    { email, role, branchIds: [branchId] },
                    "Invitation created; check its delivery status.",
                  );
                  if (!active.current) return;
                  setInvitation(result);
                  setEmail("");
                  await readInvitations();
                } catch (e) {
                  if (active.current) {
                    setError((e as Error).message);
                    if (!(e as any).status || (e as any).status >= 500)
                      setInvitationUnknown(true);
                  }
                } finally {
                  if (active.current) setBusy(false);
                }
              }}
            >
              <fieldset
                disabled={
                  disabled ||
                  busy ||
                  invitationUnknown ||
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
                  <label>
                    Invitation role
                    <select
                      required
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="">Choose a role</option>
                      {eligible.map((row) => (
                        <option key={row.id} value={row.id}>
                          {data.templates.some(
                            (template: any) => template.id === row.id,
                          ) &&
                          Object.prototype.hasOwnProperty.call(
                            templateLabels,
                            row.id,
                          )
                            ? templateLabels[row.id]
                            : row.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
            {invitation && (
              <div className="mw-note">
                <strong>
                  Delivery: {invitation.delivery || "not confirmed"}
                </strong>
                <p>
                  {invitation.reason ||
                    "Creating an invitation is not evidence that an email was sent."}
                </p>
                {invitation.developmentToken && (
                  <>
                    <label>
                      Development invitation token
                      <input
                        readOnly
                        value={invitation.developmentToken}
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                    <button type="button" onClick={() => setInvitation(null)}>
                      Hide invitation token
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
                        : new Date(invite.expiresAt).getTime() < Date.now()
                          ? "Expired"
                          : "Pending acceptance"}{" "}
                    · Delivery: {invite.delivery || "not confirmed"}
                  </p>
                </div>
                {!invite.accepted && !invite.revoked && (
                  <button
                    disabled={disabled || busy}
                    type="button"
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await save(
                          base + "/invitations/" + invite.id,
                          "DELETE",
                          undefined,
                          "Invitation revoked.",
                        );
                        if (!active.current) return;
                        await readInvitations();
                        if (active.current) setInvitation(null);
                      } catch (e) {
                        if (active.current) setError((e as Error).message);
                      } finally {
                        if (active.current) setBusy(false);
                      }
                    }}
                  >
                    Revoke invitation
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
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (disabled || busy || rolesLoading || rolesError) return;
                setBusy(true);
                setError("");
                try {
                  await save(
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
                  if (!active.current) return;
                  onAccessChanged?.();
                  if (await readRoles())
                    setEdit({ name: "", permissions: [], active: true });
                } catch (e) {
                  if (active.current) setError((e as Error).message);
                } finally {
                  if (active.current) setBusy(false);
                }
              }}
            >
              <fieldset
                disabled={disabled || busy || rolesLoading || !!rolesError}
                style={{ border: 0, padding: 0 }}
              >
                <label>
                  Role name
                  <input
                    required
                    minLength={2}
                    maxLength={70}
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </label>
                <fieldset>
                  <legend>Allowed permissions</legend>
                  <div className="mw-form">
                    {permissions.map((permission) => (
                      <label className="mw-row" key={permission}>
                        <span>
                          {permission
                            .replaceAll(".", " · ")
                            .replaceAll("_", " ")}
                        </span>
                        <input
                          type="checkbox"
                          checked={edit.permissions.includes(permission)}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              permissions: e.target.checked
                                ? [...edit.permissions, permission]
                                : edit.permissions.filter(
                                    (value: string) => value !== permission,
                                  ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
                {edit.id && (
                  <p>
                    Deactivating a custom role suspends linked members and
                    revokes pending invitations. Restoring the role does not
                    automatically restore those accounts or invitations.
                  </p>
                )}
                {edit.id && (
                  <label className="mw-row">
                    <span>Role active</span>
                    <input
                      type="checkbox"
                      checked={edit.active}
                      onChange={(e) =>
                        setEdit({ ...edit, active: e.target.checked })
                      }
                    />
                  </label>
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
                      onClick={() =>
                        setEdit({ name: "", permissions: [], active: true })
                      }
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
