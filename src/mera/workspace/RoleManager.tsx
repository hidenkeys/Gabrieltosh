import React, { useEffect, useState } from "react";
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
export default function RoleManager({
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
  useEffect(() => {
    const controller = new AbortController();
    workspaceApi(base + "/roles", "GET", undefined, controller.signal)
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    workspaceApi(base + "/invitations", "GET", undefined, controller.signal)
      .then(setInvitations)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
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
    <section className="mw-card">
      <h2>Roles & branch invitations</h2>
      <p>
        Build reusable roles with explicit permissions. Editing a custom role
        updates its linked memberships and invitations. Invitations created here
        are restricted to the selected branch.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p role="status">Loading organization roles…</p>
      ) : (
        <>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const result = await save(
                  base + "/invitations",
                  "POST",
                  { email, role, branchIds: [branchId] },
                  "Invitation created; check its delivery status.",
                );
                setInvitation(result);
                setInvitations(await workspaceApi(base + "/invitations"));
                setEmail("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
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
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={
                  disabled || busy || !eligible.some((row) => row.id === role)
                }
              >
                Create branch invitation
              </button>
            </div>
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
          <h3>Invitation history</h3>
          {!invitations.length ? (
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
                        setInvitations(
                          await workspaceApi(base + "/invitations"),
                        );
                        setInvitation(null);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Revoke invitation
                  </button>
                )}
              </div>
            ))
          )}
          <h3>{edit.id ? "Edit custom role" : "Create custom role"}</h3>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
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
                onAccessChanged?.();
                setData(await workspaceApi(base + "/roles"));
                setEdit({ name: "", permissions: [], active: true });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset
              disabled={disabled || busy}
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
                        {permission.replaceAll(".", " · ").replaceAll("_", " ")}
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
                  Deactivating a custom role suspends linked members and revokes
                  pending invitations. Restoring the role does not automatically
                  restore those accounts or invitations.
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
          <h3>Custom roles</h3>
          {!data.custom?.length ? (
            <p>No custom roles yet. Template roles remain available.</p>
          ) : (
            data.custom.map((row: any) => (
              <div className="mw-row" key={row.id}>
                <div>
                  <b>{row.name}</b>
                  <p>
                    {row.active ? "Active" : "Inactive"} ·{" "}
                    {row.permissions.join(", ")}
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
                  onClick={() => setEdit({ ...row })}
                >
                  Edit role
                </button>
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}
