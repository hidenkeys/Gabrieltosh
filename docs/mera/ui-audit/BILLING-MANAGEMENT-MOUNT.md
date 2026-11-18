# O7 subscription and invoice composition handoff

Source implementation only; root owns main/CSS import, before/after captures and visual acceptance. No live money/provider/policy changes.

## Files and slot contract

`BillingManagement.tsx` default props are optional ReactNode slots: `status`, `services`, `invoices`, `proposedPolicy`, `reconciliation`. Its only responsibilities are order, truthful unavailable placeholders for missing core slots, and native advanced disclosures. The wrapper makes no fetch/mutation, calculates no price and infers no permission. Unprovided advanced slots expose no controls.

Import `src/mera/workspace/billing-management.css` centrally in main.tsx. It also styles the existing invoice leaf's new creation disclosure,44px controls and form alignment.

## Exact main integration outline

Replace the existing scattered `activeSection === 'billing'` Reconciliation, Invoices and subscription/commercial-policy sections, plus the trailing PolicyEditor outside main, with ONE permission-gated mount. Preserve existing element props and scope keys; do not leave duplicates behind.

```tsx
{activeSection === "billing" && allowed("billing.manage") && (
  <BillingManagement
    status={/* existing subscription status subtree: actual data.subscription */}
    services={/* actual data.entitlements service availability, or explicit unavailable */}
    invoices={
      <Invoices
        key={organizationId}
        organizationId={organizationId}
        disabled={busy || offline}
        save={mutate}
      />
    }
    proposedPolicy={
      <>
        {/* Move current PROPOSED monthly-price/commercial-policy disclosures here.
            The current subscription status belongs in status, not here.
            Keep unresolved amounts unresolved and terms configurable. */}
        <PolicyEditor
          key={data.policy?.version || organizationId}
          organizationId={organizationId}
          policy={data.policy || context?.policy || {}}
          disabled={busy || offline}
          save={mutate}
        />
      </>
    }
    reconciliation={
      <Reconciliation
        key={branchBase + "reconciliation"}
        base={branchBase}
        orders={liveOrders}
        demo={!!context?.demo}
        disabled={busy || offline}
        save={mutate}
      />
    }
  />
)}
```

The status subtree can retain the existing status label/current policy metadata, but must not describe an unapproved proposal as an approved active price. Service labels must use actual boolean entitlement fields, with unavailable for missing fields. Do not hardcode included-branch counts or new prices during extraction. Current Invoices also retains its own API-fetched subscription/entitlement information; removing duplication is a separate deliberate data-ownership change, not silently addressed by this wrapper.

Native details keep the exact existing children mounted when closed; do not conditionally render them only while open. In particular, Reconciliation's original unknown intent and PolicyEditor's draft must survive disclosure changes. Initial integration necessarily reparents existing elements once: perform that development transition without a currently unresolved operator submission and preserve child keys thereafter. No navigation/reload durability is claimed by this composition.

## Invoice leaf behavior

Invoices.tsx keeps the same public props. Status and actual service flags precede the invoice list; the proposed-invoice form is a closed native disclosure after records. Unknown service flags are unavailable, not falsely restricted/allowed. Read failure offers explicit retry and never claims a successful empty list or loading forever. Scoped inner state plus active/generation/abort checks prevent old organization reads/write continuations from updating current content.

Actual API remains GET org/billing, POST org/invoices `{periodStart,periodEnd,requestKey}`. `server/mera/operations.js` compares the same original requestKey and period under an organization lock before creating another proposal. The component therefore retains an unknown submission's exact period/key, disables changed-period submission and offers only explicit original retry; later rejection after uncertainty does not silently discard it. Closing the create disclosure retains dates/pending state and indicates an unconfirmed invoice in its summary. Known creation followed by failed read does not retry creation.

This is a proposed invoice only: no debit, recurring activation, policy approval, settlement or payment action. Pending recovery remains component-local, not a durable cross-navigation journal. Successful read does not infer that an absent original invoice failed.

## Evidence and open gates

Six focused tests pass across `mera-billing-management.test.tsx` and `mera-invoices-ui.test.tsx`: section ordering; closed disclosures with child state/mount count preserved; error/missing-slot honesty; invoice read failure/retry/empty; list before create; exact unknown period/key retry after conflict; old organization response exclusion. Source tests do not certify visual quality.

Root browser checks: subscription/invoice priority at desktop/tablet/narrow, no initial simulator/form wall, accessible disclosure keyboard/focus, retained drafts/unknown state, long invoice/policy details,44px targets, no page-wide overflow, actual read error/retry and permission boundaries. No financial writes are needed for visual review. O7 remains broader than this slice (printing,QR,customer/support care and integration screens remain separate).

## Lead integration evidence

Mounted once inside the permission-gated billing panel; removed the three scattered old mounts and outer PolicyEditor duplicate. Central stylesheet import added. Actual workspace entitlement fields lead; Invoices receives showServiceSummary=false while preserving its own real warning/read/create/recovery state. Captures67/71/72/73 and subscription comparison show desktop/tablet/narrow and keyboard draft retention. Broader O7 acceptance is not inferred from this single corrected surface. See SUBSCRIPTION-VISIT-PLATFORM-CHECKPOINT.md.
