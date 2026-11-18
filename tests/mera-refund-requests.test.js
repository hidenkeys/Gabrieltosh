import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewRefundRequest,
  completeRefundRequest,
} from "../server/mera/refund-requests.js";
test("requested refunds require a different approver and an exact current scope/order/amount", async () => {
  const request = {
    id: "r",
    orderId: "order",
    amount: 100,
    status: "pending",
    requestedBy: "cashier",
    version: 1,
  };
  const scope = { organizationId: "org", branchId: "branch" },
    services = {
      find: async (c, s, kind, id) => {
        assert.equal(c, "tx");
        assert.equal(s, scope);
        assert.equal(kind, "refund_request");
        assert.equal(id, "r");
        return request;
      },
    };
  const input = { refundRequestId: "r", amount: 100 };
  assert.equal(
    await reviewRefundRequest("tx", services, scope, {}, {}, "manager"),
    null,
  );
  assert.equal(
    await reviewRefundRequest(
      "tx",
      services,
      scope,
      input,
      { id: "order" },
      "manager",
    ),
    request,
  );
  await assert.rejects(
    reviewRefundRequest(
      "tx",
      services,
      scope,
      input,
      { id: "order" },
      "cashier",
    ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    reviewRefundRequest(
      "tx",
      services,
      scope,
      { ...input, amount: 101 },
      { id: "order" },
      "manager",
    ),
    (e) => e.status === 409,
  );
  await assert.rejects(
    reviewRefundRequest(
      "tx",
      services,
      scope,
      input,
      { id: "different" },
      "manager",
    ),
    (e) => e.status === 409,
  );
  request.status = "recorded";
  await assert.rejects(
    reviewRefundRequest(
      "tx",
      services,
      scope,
      input,
      { id: "order" },
      "manager",
    ),
    (e) => e.status === 409,
  );
});
test("recording an approved request links the existing refund without creating another money record", async () => {
  const writes = [],
    events = [],
    scope = { organizationId: "org", branchId: "branch" };
  await completeRefundRequest(
    "tx",
    {
      update: async (...args) => writes.push(args),
      event: async (...args) => events.push(args),
    },
    scope,
    { id: "request", version: 2, status: "pending", requestedBy: "cashier" },
    { id: "refund", amount: 100 },
    { id: "manager" },
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0][2], "refund_request");
  assert.equal(writes[0][4].refundId, "refund");
  assert.equal(writes[0][4].version, 3);
  assert.equal(writes[0][4].status, "recorded");
  assert.equal(writes[0][4].approvedBy, "manager");
  assert.equal(events[0][2], "refund_request_recorded");
});
