import React, { useEffect, useRef, useState } from "react";
import { workspaceApi } from "./api";
import { permissionLabel } from "./accessPresentation";
import {
  beginAccessWrite,
  finishAccessWrite,
  hasAccessWrite,
} from "./accessWriteJournal";
import { DataRegion, Disclosure, ReadState } from "../ui/OperationalPrimitives";

type Props = {
  organizationId: string;
  branchId: string;
  branches: { id: string; name: string }[];
  userId: string;
  canManage: boolean;
  disabled: boolean;
  save: (
    path: string,
    method: string,
    body: any,
    message: string,
  ) => Promise<any>;
};
const roleNames: Record<string, string> = {
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
export default function MemberAccess(props: Props) {
  return (
    <ScopedMembers
      key={JSON.stringify([props.organizationId, props.branchId, props.userId])}
      {...props}
    />
  );
}
function ScopedMembers({
  organizationId,
  branchId,
  branches,
  userId,
  canManage,
  disabled,
  save,
}: Props) {
  const base = `/organizations/${encodeURIComponent(organizationId)}/members`;
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [denied, setDenied] = useState(false),
    [unknown, setUnknown] = useState(() =>
      hasAccessWrite(userId, organizationId),
    );
  const [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const [review, setReview] = useState<string | null>(null);
  const alive = useRef(false),
    generation = useRef(0),
    write = useRef(false);
  const authority = useRef(canManage);
  authority.current = canManage;
  const deniedRef = useRef(false),
    unknownRef = useRef(false);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const clearAccess = () => {
    deniedRef.current = true;
    generation.current++;
    setDenied(true);
    setMembers([]);
    setReview(null);
    setSearch("");
    setError("");
    setLoading(false);
  };
  const read = async (signal?: AbortSignal) => {
    if (!authority.current || deniedRef.current) return;
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await workspaceApi(base, "GET", undefined, signal);
      if (
        !alive.current ||
        signal?.aborted ||
        generation.current !== version ||
        !authority.current ||
        deniedRef.current
      )
        return;
      const rows = Array.isArray(result) ? result : result?.members;
      if (
        !Array.isArray(rows) ||
        rows.some(
          (row: any) =>
            !row ||
            typeof row.id !== "string" ||
            typeof row.userId !== "string" ||
            typeof row.active !== "boolean" ||
            !Array.isArray(row.branchIds),
        )
      )
        throw Error("Invalid member response");
      setMembers(rows);
    } catch (failure: any) {
      if (!alive.current || signal?.aborted || generation.current !== version)
        return;
      if ([401, 403, 404].includes(failure.status)) clearAccess();
      else
        setError(
          "Staff access records could not be loaded. Try again before making changes.",
        );
    } finally {
      if (alive.current && !signal?.aborted && generation.current === version)
        setLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void read(controller.signal);
    return () => {
      alive.current = false;
      generation.current++;
      controller.abort();
    };
  }, [base]);
  useEffect(() => {
    if (!canManage) clearAccess();
  }, [canManage]);
  const change = async (member: any) => {
    if (
      write.current ||
      unknownRef.current ||
      deniedRef.current ||
      !authority.current ||
      disabled ||
      loading ||
      error ||
      member.userId === userId
    )
      return;
    if (!beginAccessWrite(userId, organizationId, "membership")) {
      unknownRef.current = true;
      setUnknown(true);
      return;
    }
    write.current = true;
    setBusy(true);
    setError("");
    try {
      await save(
        `${base}/${encodeURIComponent(member.id)}`,
        "PATCH",
        { active: !member.active },
        member.active ? "Membership suspended." : "Membership restored.",
      );
      finishAccessWrite(userId, organizationId);
      if (!alive.current || !authority.current || deniedRef.current) return;
      setReview(null);
      await read();
    } catch (failure: any) {
      if (failure.status >= 400 && failure.status < 500)
        finishAccessWrite(userId, organizationId);
      if (!alive.current) return;
      if ([401, 403, 404].includes(failure.status)) clearAccess();
      else {
        if (!failure.status || failure.status >= 500) {
          unknownRef.current = true;
          setUnknown(true);
        }
        setError(
          failure.status === 409
            ? "This access change is not allowed. The organization must retain an active owner."
            : "Access change could not be confirmed. Review the current staff record before continuing.",
        );
      }
    } finally {
      write.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const paused = unknown || hasAccessWrite(userId, organizationId);
  if (!canManage || denied)
    return (
      <section className="mw-card">
        <h2>Staff access</h2>
        <p role="alert">
          Staff access needs checking. Refresh the workspace or sign in again
          before continuing.
        </p>
      </section>
    );
  const query = search.trim().toLocaleLowerCase();
  const rows = members.filter(
    (member) =>
      !query ||
      `${member.name || "Staff member"} ${roleNames[member.role] || "Custom role"}`
        .toLocaleLowerCase()
        .includes(query),
  );
  const scope = (member: any) =>
    member.organizationWide === true
      ? "All organization branches"
      : member.branchIds.length
        ? member.branchIds
            .map(
              (id: string) =>
                branches.find((branch) => branch.id === id)?.name ||
                "Other branch",
            )
            .join(", ")
        : "No branch access";
  return (
    <section className="mw-card mw-member-access">
      <header className="mw-member-heading">
        <div>
          <h2>Staff access</h2>
          <p>
            Organization members and the branches they can access. Invitations
            below apply to the selected branch.
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          disabled={busy || loading}
          onClick={() => void read()}
        >
          Refresh staff
        </button>
      </header>
      {paused && (
        <div className="mw-note" role="status">
          <strong>Access change outcome unconfirmed</strong>
          <p>
            Do not repeat this change. Refresh staff records and ask an
            administrator to reconcile the original request. Reading the list
            does not unlock another attempt.
          </p>
        </div>
      )}
      {loading && <ReadState kind="loading" title="Loading staff access…" />}
      {error && (
        <ReadState
          kind="error"
          title={error}
          retry={() => void read()}
          retryLabel="Retry loading staff"
          pending={loading || busy}
        />
      )}
      {!loading && !error && !members.length && (
        <ReadState kind="empty" title="No staff records returned." />
      )}
      {!!members.length && (
        <>
          <label className="mw-member-search">
            Find a staff member
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or role"
            />
          </label>
          <p className="mw-member-count">
            {rows.length} of {members.length} staff records
            {loading || error ? " · Previously loaded records" : ""}
          </p>
          <p className="mw-member-scroll-hint">
            Swipe or scroll the staff table to see access details.
          </p>
          {!rows.length ? (
            <p>No staff match this search.</p>
          ) : (
            <DataRegion label="Organization staff access">
              <table>
                <thead>
                  <tr>
                    <th>Staff member</th>
                    <th>Role</th>
                    <th>Branch access</th>
                    <th>Status</th>
                    <th>Access details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((member) => (
                    <tr key={member.id}>
                      <th scope="row">
                        {member.name?.trim() || "Staff member"}
                        {member.userId === userId && (
                          <small> Your account</small>
                        )}
                      </th>
                      <td>{roleNames[member.role] || "Custom role"}</td>
                      <td>{scope(member)}</td>
                      <td>{member.active ? "Active" : "Suspended"}</td>
                      <td>
                        <button
                          className="secondary"
                          type="button"
                          aria-expanded={review === member.id}
                          disabled={busy}
                          onClick={(event) => {
                            reviewTrigger.current = event.currentTarget;
                            setReview(review === member.id ? null : member.id);
                          }}
                        >
                          Review {member.name?.trim() || "staff member"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataRegion>
          )}
        </>
      )}
      {members
        .filter((member) => member.id === review)
        .map((member) => (
          <section
            className="mw-member-review"
            key={member.id}
            aria-label="Reviewed staff access"
          >
            <h3>{member.name?.trim() || "Staff member"}</h3>
            <p>
              {roleNames[member.role] || "Custom role"} · {scope(member)} ·{" "}
              {member.active ? "Active" : "Suspended"}
            </p>
            <Disclosure summary="View granted permissions">
              <ul>
                {(Array.isArray(member.permissions)
                  ? member.permissions
                  : []
                ).map((permission: string) => (
                  <li key={permission}>{permissionLabel(permission)}</li>
                ))}
              </ul>
            </Disclosure>
            <p>
              {member.active
                ? "Suspending access prevents this person from using the organization workspace. It does not delete their historical orders or activity."
                : "Restoring access reactivates this membership with its existing role and branch access."}
            </p>
            {member.userId === userId ? (
              <p>You cannot change your own access here.</p>
            ) : (
              <button
                type="button"
                className="secondary"
                disabled={disabled || busy || loading || !!error || paused}
                onClick={() => void change(member)}
              >
                {busy
                  ? "Updating access…"
                  : member.active
                    ? "Confirm suspend access"
                    : "Confirm restore access"}
              </button>
            )}
            <p>Role and branch reassignment are not available here.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReview(null);
                reviewTrigger.current?.focus();
              }}
            >
              Close review
            </button>
          </section>
        ))}
    </section>
  );
}
