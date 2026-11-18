import { z } from "zod";
const B = "/organizations/:organizationId/branches/:branchId";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });
const fields = {
  name: z.string().trim().min(1).max(100),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(-100000).max(100000),
  active: z.boolean(),
};
const createSchema = z
  .object({
    ...fields,
    parentId: fields.parentId.default(null),
    sortOrder: fields.sortOrder.default(0),
    active: fields.active.default(true),
  })
  .strict();
const patchSchema = z
  .object({
    name: fields.name.optional(),
    parentId: fields.parentId.optional(),
    sortOrder: fields.sortOrder.optional(),
    active: fields.active.optional(),
    version: z.number().int().positive(),
  })
  .strict();
export function validateCategoryGraph(categories, products = []) {
  const map = new Map(categories.map((category) => [category.id, category]));
  for (const category of categories) {
    if (category.parentId) {
      const parent = map.get(category.parentId);
      if (!parent) throw fail("Parent category is not in this branch.", 404);
      if (category.active && !parent.active)
        throw fail("An active category requires an active parent.");
    }
    const seen = new Set();
    let current = category,
      depth = 0;
    while (current) {
      if (seen.has(current.id))
        throw fail("Category hierarchy cannot contain a cycle.");
      seen.add(current.id);
      depth++;
      if (depth > 6) throw fail("Category hierarchy cannot exceed six levels.");
      current = current.parentId ? map.get(current.parentId) : null;
    }
    if (
      !category.active &&
      categories.some((child) => child.parentId === category.id && child.active)
    )
      throw fail("Reassign active child categories before deactivation.");
    if (
      !category.active &&
      products.some((product) => product.categoryId === category.id)
    )
      throw fail("Reassign referenced products before deactivation.");
  }
  const names = new Set();
  for (const category of categories.filter((c) => c.active)) {
    const key = JSON.stringify([
      category.parentId,
      category.name.normalize("NFKC").toLocaleLowerCase("en"),
    ]);
    if (names.has(key))
      throw fail("Active category names must be unique within their parent.");
    names.add(key);
  }
}
export function mountMeraCategories(
  router,
  { db, guard, scope, locked, record, readRecords, find, update, event },
) {
  const read = async (c, s, kind) =>
    (await readRecords(c, s.organizationId, s.branchId, kind)).map(
      (row) => row.data,
    );
  router.get(B + "/categories", guard("menu.edit"), async (req, res) => {
    const categories = await read(db, scope(req), "category");
    res.json({
      categories: categories.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    });
  });
  router.post(B + "/categories", guard("menu.edit"), async (req, res) => {
    const input = createSchema.parse(req.body);
    const result = await locked(scope(req), async (c) => {
      const categories = await read(c, scope(req), "category");
      validateCategoryGraph(
        [...categories, { ...input, id: "candidate" }],
        await read(c, scope(req), "product"),
      );
      const category = await record(c, scope(req), "category", {
        ...input,
        version: 1,
        createdAt: new Date().toISOString(),
      });
      await event(c, scope(req), "category_created", req.user, {
        categoryId: category.id,
      });
      return category;
    });
    res.status(201).json(result);
  });
  router.patch(B + "/categories/:id", guard("menu.edit"), async (req, res) => {
    const input = patchSchema.parse(req.body);
    res.json(
      await locked(scope(req), async (c) => {
        const existing = await find(c, scope(req), "category", req.params.id);
        if (existing.version !== input.version)
          throw fail("Category changed. Refresh before saving.");
        const category = {
          ...existing,
          ...input,
          version: existing.version + 1,
          updatedAt: new Date().toISOString(),
        };
        const categories = await read(c, scope(req), "category");
        validateCategoryGraph(
          categories.map((row) => (row.id === category.id ? category : row)),
          await read(c, scope(req), "product"),
        );
        await update(c, scope(req), "category", category.id, category);
        await event(c, scope(req), "category_updated", req.user, {
          categoryId: category.id,
          version: category.version,
        });
        return category;
      }),
    );
  });
}
