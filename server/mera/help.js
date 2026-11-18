import { z } from "zod";
import { randomUUID } from "node:crypto";
const P = "/public/:slug/:branchId",
  B = "/organizations/:organizationId/branches/:branchId";
const categoryPermissions = {
  service: ["orders.fulfill", "tables.manage"],
  payment: ["payments.record", "refunds.approve"],
  reservation: ["reservations.manage"],
  other: ["organization.manage"],
};
const allPermissions = [...new Set(Object.values(categoryPermissions).flat())];
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });
const inputSchema = z
  .object({
    requestKey: z.string().uuid(),
    category: z.enum(["service", "payment", "reservation", "other"]),
    message: z.string().trim().min(1).max(500),
    orderId: z.string().uuid().optional(),
    visitId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (value) => !(value.orderId && value.visitId),
    "Choose at most one private context.",
  );
const ownView = ({
  id,
  reference,
  category,
  message,
  orderId,
  visitId,
  status,
  customerReply,
  createdAt,
  updatedAt,
}) => ({
  id,
  reference,
  category,
  message,
  orderId,
  visitId,
  status,
  customerReply: customerReply || "",
  createdAt,
  updatedAt,
  externalDelivery: false,
});
const permitted = (req, category) =>
  categoryPermissions[category]?.some((permission) =>
    req.meraMembership?.permissions?.includes(permission),
  );
export function mountMeraHelp(
  router,
  {
    db,
    guard,
    scope,
    locked,
    record,
    readRecords,
    find,
    update,
    event,
    publicContext,
    guest,
  },
) {
  const read = async (c, s) =>
    (await readRecords(c, s.organizationId, s.branchId, "help_request")).map(
      (row) => row.data,
    );
  router.get(P + "/help-requests", async (req, res) => {
    const { organization, s } = await publicContext(req),
      g = await guest(req, organization.id);
    res.set("Cache-Control", "no-store").json({
      requests: (await read(db, s))
        .filter((row) => row.guestId === g.id)
        .map(ownView),
      externalDelivery: false,
    });
  });
  router.post(P + "/help-requests", async (req, res) => {
    const input = inputSchema.parse(req.body),
      { organization, s } = await publicContext(req),
      g = await guest(req, organization.id);
    const result = await locked(s, async (c) => {
      const rows = await read(c, s);
      const prior = rows.find(
        (row) => row.guestId === g.id && row.requestKey === input.requestKey,
      );
      const intent = {
        category: input.category,
        message: input.message,
        orderId: input.orderId || null,
        visitId: input.visitId || null,
      };
      if (prior) {
        if (
          ["category", "message", "orderId", "visitId"].some(
            (key) => (prior.intent?.[key] ?? null) !== (intent[key] ?? null),
          )
        )
          throw fail("This request key was used for a different help request.");
        return prior;
      }
      if (
        rows.filter((row) => row.guestId === g.id && row.status !== "resolved")
          .length >= 3
      )
        throw fail(
          "You already have three open help requests. Please wait for staff to respond.",
          429,
        );
      if (input.orderId) {
        const order = await find(c, s, "order", input.orderId);
        if (order.guestId !== g.id) throw fail("Private order not found.", 404);
      }
      if (input.visitId) {
        const visit = await find(c, s, "visit", input.visitId);
        if (visit.status !== "open" || !visit.guestIds?.includes(g.id))
          throw fail("Joined visit not found.", 404);
      }
      const row = await record(c, s, "help_request", {
        ...input,
        intent,
        guestId: g.id,
        reference: "H-" + randomUUID().slice(0, 8).toUpperCase(),
        status: "open",
        customerReply: "",
        internalNotes: [],
        createdAt: new Date().toISOString(),
      });
      await event(c, s, "customer_help_requested", g, {
        helpRequestId: row.id,
        category: row.category,
      });
      return row;
    });
    res.status(201).json(ownView(result));
  });
  router.get(B + "/help-requests", guard(allPermissions), async (req, res) => {
    res.json({
      requests: (await read(db, scope(req)))
        .filter((row) => permitted(req, row.category))
        .map((row) => ({
          ...ownView(row),
          internalNotes: row.internalNotes || [],
        })),
      externalDelivery: false,
    });
  });
  router.patch(
    B + "/help-requests/:id",
    guard(allPermissions),
    async (req, res) => {
      const input = z
        .object({
          status: z.enum(["acknowledged", "resolved"]),
          customerReply: z.string().trim().max(1000).optional(),
          internalNote: z.string().trim().max(1000).optional(),
        })
        .strict()
        .parse(req.body);
      res.json(
        await locked(scope(req), async (c) => {
          const row = await find(
            c,
            scope(req),
            "help_request",
            z.string().uuid().parse(req.params.id),
          );
          if (!permitted(req, row.category))
            throw fail("Help request not found.", 404);
          if (row.status === "resolved" && input.status !== "resolved")
            throw fail("A resolved help request cannot be reopened.");
          const next = {
            ...row,
            status: input.status,
            customerReply: input.customerReply ?? row.customerReply,
            updatedAt: new Date().toISOString(),
            internalNotes: [
              ...(row.internalNotes || []),
              ...(input.internalNote
                ? [
                    {
                      text: input.internalNote,
                      actorId: req.user.id,
                      at: new Date().toISOString(),
                    },
                  ]
                : []),
            ],
          };
          await update(c, scope(req), "help_request", row.id, next);
          await event(c, scope(req), "customer_help_updated", req.user, {
            helpRequestId: row.id,
            status: next.status,
          });
          return { ...ownView(next), internalNotes: next.internalNotes };
        }),
      );
    },
  );
}
