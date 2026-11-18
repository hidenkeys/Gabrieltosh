# Shared contract checkpoint

Executable source: shared/mera-contracts.js v1.0.0, owned by backend. API /api/mera/v1. Context exposes user and explicit organization memberships/branches/permissions. Branch operations live under /organizations/:orgId/branches/:branchId. Customer routes are coordinated with backend and use secure guest sessions; public QR does not authorize bill history.

Organization and branch UUIDs are primary identity; slug only routes. Prices integer minor NGN units. Server prices/snapshots all orders. Idempotency keys are scoped to principal/context. Independent order/payment/print states; print failure cannot recreate sales. Stock reservation/consumption and booking overlap protected transactionally. Poll canonical API state after reconnect; no speculative success during network loss.

Consumers must use producer's concrete field schemas and messages. Missing endpoints remain explicit errors, not mocked success. No incompatible consumer-local data models.
