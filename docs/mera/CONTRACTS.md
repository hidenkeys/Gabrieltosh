# Shared contract checkpoint

Executable source: shared/mera-contracts.js v1.0.0, owned by backend. API /api/mera/v1. Context exposes user and explicit organization memberships/branches/permissions. Branch operations live under /organizations/:orgId/branches/:branchId. Customer routes are coordinated with backend and use secure guest sessions; public QR does not authorize bill history.

Organization and branch UUIDs are primary identity; slug only routes. Prices integer minor NGN units. Server prices/snapshots all orders. Idempotency keys are scoped to principal/context. Independent order/payment/print states; print failure cannot recreate sales. Stock reservation/consumption and booking overlap protected transactionally. Poll canonical API state after reconnect; no speculative success during network loss.

Consumers must use producer's concrete field schemas and messages. Missing endpoints remain explicit errors, not mocked success. No incompatible consumer-local data models.

Additive contracts now include actor-bound five-minute canonical quotes (mandatory only when branch pricing is enabled), integer discount/service/tax lines, approved commercial policy snapshots, scoped image bytes/publication references, versioned preparation quantities and table combinations, original-actor financial-request lookup and subscription entitlement projections. Cash/externally recorded funds remain distinct from integrated provider collection. Mutations after an uncertain response must preserve the original request key and intent; a not_found lookup is not proof that an in-flight write was rejected.

Nested categories are currently an explicitly prepared module: versioned branch-scoped parent graph, cycle/depth/sibling validation and protected retirement. Product binding and customer navigation integration remain next-stage consumer work. Shared contracts remain v1 until the coordinated Zidi/quote/category consumer update increments the advertised minor version.
