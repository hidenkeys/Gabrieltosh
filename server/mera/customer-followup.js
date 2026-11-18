import { z } from "zod";
import { cancellationNeedsReview } from "./reservation-policy.js";
import { publicMinimumSpend } from "./minimum-spend.js";
import { createHash } from "node:crypto";
const unavailable = () =>
  Object.assign(
    new Error("That reservation is not available in this guest session."),
    { status: 404 },
  );
const reservationView = (r) => ({
  id: r.id,
  displayName: r.displayName,
  partySize: r.partySize,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  status: r.status,
  depositAmount: r.depositAmount || 0,
  depositGrossCollected: r.depositGrossCollected ?? r.depositAmount ?? 0,
  depositReturned: r.depositReturned || 0,
  depositForfeited: r.depositForfeited || 0,
  depositDisposition: r.depositDisposition || null,
  depositRequired: r.depositRequired || 0,
  cancellationRequestedAt: r.cancellationRequestedAt || null,
  createdAt: r.createdAt,
  minimumSpendPolicy: publicMinimumSpend(r.minimumSpendPolicy),
});
export function mountMeraCustomerFollowup(
  router,
  {
    db,
    publicContext,
    guest,
    locked,
    readRecords,
    find,
    update,
    event,
    publicOrder,
  },
) {
  const P = "/public/:slug/:branchId";
  router.get(P + "/guest-orders", async (req, res) => {
    const input = z
      .object({
        take: z.coerce.number().int().min(1).max(30).default(20),
        cursor: z.string().max(1000).optional(),
      })
      .strict()
      .parse(req.query);
    const { organization, s } = await publicContext(req),
      g = await guest(req, organization.id);
    let after = null;
    if (input.cursor) {
      try {
        after = z
          .object({
            org: z.string(),
            branch: z.string(),
            guest: z.string(),
            createdAt: z.string().datetime(),
            id: z.string().uuid(),
          })
          .strict()
          .parse(
            JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
          );
      } catch {
        throw Object.assign(new Error("Invalid order history cursor."), {
          status: 400,
        });
      }
      if (
        after.org !== organization.id ||
        after.branch !== s.branchId ||
        after.guest !== g.id
      )
        throw Object.assign(
          new Error("This cursor belongs to another guest context."),
          { status: 400 },
        );
    }
    const rows = (
      await db.query(
        "SELECT data FROM mera_records WHERE organization_id=$1 AND branch_id=$2 AND kind='order' AND data->>'guestId'=$3 AND ($4::text IS NULL OR (data->>'createdAt',id)<($4::text,$5::text)) ORDER BY data->>'createdAt' DESC,id DESC LIMIT $6",
        [
          organization.id,
          s.branchId,
          g.id,
          after?.createdAt || null,
          after?.id || null,
          input.take + 1,
        ],
      )
    ).rows;
    const page = rows.slice(0, input.take),
      last = page.at(-1)?.data;
    res
      .set("Cache-Control", "no-store")
      .json({
        orders: page.map((r) => publicOrder(r.data)),
        nextCursor:
          rows.length > input.take
            ? Buffer.from(
                JSON.stringify({
                  org: organization.id,
                  branch: s.branchId,
                  guest: g.id,
                  createdAt: last.createdAt,
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
        identityScope: "current_organization_guest_session",
      });
  });
  router.post(P + "/guest/end", async (req, res) => {
    z.object({}).strict().parse(req.body);
    const { organization } = await publicContext(req),
      g = await guest(req, organization.id);
    await db.query(
      "UPDATE mera_guests SET expires_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2",
      [g.id, organization.id],
    );
    const options = {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };
    res.clearCookie("mera_guest_" + organization.id, options);
    if (
      req.cookies?.mera_guest &&
      createHash("sha256").update(req.cookies.mera_guest).digest("hex") ===
        g.token_hash
    )
      res.clearCookie("mera_guest", options);
    res
      .set("Cache-Control", "no-store")
      .json({ ended: true, ordersCancelled: false, refundConfirmed: false });
  });
  router.get(P + "/activity", async (req, res) => {
    const { organization, s } = await publicContext(req),
      g = await guest(req, organization.id);
    const [reservations, feedback] = await Promise.all([
      readRecords(db, s.organizationId, s.branchId, "reservation"),
      readRecords(db, s.organizationId, s.branchId, "complaint"),
    ]);
    res.set("Cache-Control", "no-store").json({
      reservations: reservations
        .filter((r) => r.data.guestId === g.id)
        .map((r) => reservationView(r.data)),
      feedback: feedback
        .filter((r) => r.data.guestId === g.id)
        .map(({ data: r }) => ({
          id: r.id,
          orderId: r.orderId,
          rating: r.rating,
          text: r.text,
          category: r.category,
          status: r.status,
          createdAt: r.createdAt,
        })),
      identityScope: "current_organization_guest_session",
    });
  });
  router.post(P + "/reservations/:id/cancellation", async (req, res) => {
    const input = z
      .object({
        requestKey: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(req.body);
    const { organization, s } = await publicContext(req),
      g = await guest(req, organization.id);
    const result = await locked(s, async (c) => {
      let r;
      try {
        r = await find(
          c,
          s,
          "reservation",
          z.string().uuid().parse(req.params.id),
        );
      } catch (e) {
        if (e.status === 404) throw unavailable();
        throw e;
      }
      if (r.guestId !== g.id) throw unavailable();
      if (r.cancellationRequest?.requestKey === input.requestKey) {
        if (r.cancellationRequest.reason !== input.reason)
          throw Object.assign(
            new Error("This key records a different cancellation request."),
            { status: 409 },
          );
        return r;
      }
      if (!["requested", "confirmed"].includes(r.status))
        throw Object.assign(
          new Error(
            "Contact the venue to change a reservation that has already started or ended.",
          ),
          { status: 409 },
        );
      if (r.cancellationRequestedAt)
        throw Object.assign(
          new Error("Your cancellation request is already awaiting the venue."),
          { status: 409 },
        );
      r.cancellationRequest = input;
      r.cancellationRequestedAt = new Date().toISOString();
      // Deposits require staff policy review. Never imply a refund or move funds.
      const currentBranch = (
        await c.query(
          "SELECT settings FROM mera_branches WHERE id=$1 AND organization_id=$2",
          [s.branchId, s.organizationId],
        )
      ).rows[0];
      if (!cancellationNeedsReview(r, currentBranch)) r.status = "cancelled";
      await update(c, s, "reservation", r.id, r);
      await event(
        c,
        s,
        r.status === "cancelled"
          ? "guest_reservation_cancelled"
          : "guest_reservation_cancellation_requested",
        { id: g.id, displayName: g.display_name },
        {
          reservationId: r.id,
          reason: input.reason,
          depositReviewRequired: r.depositAmount > 0,
        },
      );
      return r;
    });
    res.json({
      ...reservationView(result),
      depositReviewRequired: result.depositAmount > 0,
      venueReviewRequired: result.status !== "cancelled",
      refundConfirmed: false,
    });
  });
}
