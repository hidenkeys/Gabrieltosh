# Assessment and migration architecture

Existing React 19/TypeScript/Vite, Express 5, PostgreSQL and zod are retained. Existing cream surfaces, blue branding, product imagery, typography hierarchy, touch controls, receipts and explicit loading/recovery states are reuse inputs. The actual Chrome login page was inspected; cream login composition and blue Bing Chun mascot confirmed. Browser-client native dependency failed; native browser fallback works.

Current users use three global roles; products/orders/settings/prints/audits have no tenant keys. Existing admin policy checks loopback, printing gates preparation, and Windows services own local storage. These assumptions cannot be exposed as a multi-tenant hosted system. Legacy routes remain local-only; MERA uses versioned /api/mera/v1 and separate mera_* tables, enabled explicitly. No production or legacy financial migration is authorized or performed.

New branch records require organization and branch scope; memberships never inherit global legacy administrator access. SQL transactions and branch locking protect stock, bookings and money allocations. Integer kobo and versioned commercial policies are mandatory. Unknown provider support is blocked; integrated collection cannot be enabled by browser claims.

Migration sequence: isolated schema/demo -> tenant isolation and shared customer/staff rules -> reconciliation rehearsal -> explicit mapping of legacy records and financial comparisons -> approved hosted cutover. Existing Windows tests are not hosted readiness evidence. Source pushes must not publish; existing public-menu Site and production data stay untouched.
