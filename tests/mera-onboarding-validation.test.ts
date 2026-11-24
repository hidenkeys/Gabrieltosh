import test from "node:test";
import assert from "node:assert/strict";
import { validPublicContact as clientContact } from "../src/mera/workspace/publicContact";
import { validPublicContact as serverContact } from "../server/mera/public-contact.js";
import { mountMeraReadiness } from "../server/mera/readiness.js";
test("customer contact validation agrees on server and client", () => {
  for (const contact of [
    "0803 123 4567",
    "+44 (20) 1234-5678",
    "hello@venue.com",
  ])
    for (const validate of [clientContact, serverContact])
      assert.equal(validate(contact), true, contact);
  for (const contact of [
    "Contact the venue",
    "12345",
    "hi@",
    "1234567junk",
    "",
  ])
    for (const validate of [clientContact, serverContact])
      assert.equal(validate(contact), false, contact);
});
test("launch-policy accepts payment autosave without acknowledgement and rejects invalid contact before writing", async () => {
  let handler: any;
  let writes = 0;
  mountMeraReadiness(
    {
      get() {},
      post() {},
      patch(path: string, ...handlers: any[]) {
        handler = handlers.at(-1);
      },
    },
    {
      guard: () => () => {},
      scope: () => ({}),
      locked: async () => {
        writes++;
        return { checks: [], canPublish: false };
      },
    },
  );
  let result: any;
  await handler(
    { body: { manualPaymentMethods: ["cash"] } },
    {
      json: (r: any) => {
        result = r;
      },
    },
  );
  assert.equal(writes, 1);
  assert.deepEqual(result.checks, []);
  await assert.rejects(
    handler(
      { body: { manualPaymentMethods: ["cash"], publicContact: "Call us" } },
      { json() {} },
    ),
  );
  assert.equal(writes, 1);
});
