import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  LOCATION_COUNTS,
  MENU_MODES,
  INVENTORY_MODES,
  VENUE_TYPES,
  defaultLocationCode,
} from "../../shared/mera-venues.js";
import {
  beginAccessOperation,
  recordAccessOperation,
} from "./access-attempts.js";
import { fail } from "./domain.js";
const schema = z
  .object({
    requestKey: z.string().uuid(),
    version: z.number().int().positive(),
    locationCount: z.enum(LOCATION_COUNTS).optional(),
    menuMode: z.enum(MENU_MODES).optional(),
    inventoryMode: z.enum(INVENTORY_MODES).optional(),
    defaultVenueType: z.enum(VENUE_TYPES).optional(),
    confirmCount: z.boolean().optional(),
  })
  .strict();
export function mountMeraOperating(router, { db, guard, event }) {
  router.patch(
    "/organizations/:organizationId/operating",
    guard("organization.manage"),
    async (req, res) => {
      const input = schema.parse(req.body),
        orgId = req.params.organizationId;
      res.json(
        await db.transaction(async (c) => {
          const org = (
            await c.query(
              "SELECT * FROM mera_organizations WHERE id=$1 FOR UPDATE",
              [orgId],
            )
          ).rows[0];
          if (!org) throw fail("Organization not found.", 404);
          const attempt = {
            requestKey: input.requestKey,
            operation: "organization_operating",
            targetId: orgId,
            intent: input,
          };
          const prior = await beginAccessOperation(c, req, attempt);
          if (prior) return prior;
          const old = {
            centralStockBranchId: null,
            menuMode: "per_location",
            inventoryMode: "per_location",
            version: 1,
            ...org.operating,
          };
          if (old.version !== input.version)
            throw fail(
              "Operating settings changed. Refresh before editing.",
              409,
              "STALE_VERSION",
            );
          const branches = (
            await c.query(
              "SELECT * FROM mera_branches WHERE organization_id=$1 ORDER BY id",
              [orgId],
            )
          ).rows;
          if (
            input.inventoryMode &&
            input.inventoryMode !== old.inventoryMode &&
            !input.confirmCount
          ) {
            const products = (
              await c.query(
                "SELECT data FROM mera_records WHERE organization_id=$1 AND kind='product'",
                [orgId],
              )
            ).rows;
            if (
              products.some(
                ({ data: p }) =>
                  p.stockMode === "counted" ||
                  p.variants?.some((v) => v.stockMode === "counted"),
              )
            )
              throw fail(
                "Confirm a stock count before changing the inventory mode.",
                409,
                "INVENTORY_MODE_LOCKED",
              );
          }
          const { requestKey, confirmCount, version, ...changes } = input;
          const operating = { ...old, ...changes, version: old.version + 1 };
          let anchor = branches[0]?.id;
          if (operating.inventoryMode === "central") {
            let central =
              branches.find(
                (b) =>
                  b.id === old.centralStockBranchId &&
                  b.settings?.role === "stock_room",
              ) || branches.find((b) => b.settings?.role === "stock_room");
            if (!central) {
              central = { id: randomUUID() };
              const settings = {
                role: "stock_room",
                code: defaultLocationCode(
                  "CST",
                  branches.map((b) => b.settings?.code),
                ),
                capabilities: [],
                serviceModes: [],
                orderingPaused: true,
                version: 1,
              };
              await c.query(
                "INSERT INTO mera_branches(id,organization_id,name,settings) VALUES($1,$2,$3,$4)",
                [central.id, orgId, "Central store", JSON.stringify(settings)],
              );
            }
            operating.centralStockBranchId = central.id;
            anchor ||= central.id;
          }
          await c.query(
            "UPDATE mera_organizations SET operating=$1 WHERE id=$2",
            [JSON.stringify(operating), orgId],
          );
          await event(
            c,
            { organizationId: orgId, branchId: anchor },
            "organization_operating_updated",
            req.user,
            { from: old, to: operating, confirmCount: !!confirmCount },
          );
          await recordAccessOperation(c, req, attempt, operating);
          return operating;
        }),
      );
    },
  );
}
