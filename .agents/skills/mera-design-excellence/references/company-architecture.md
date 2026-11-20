# Consolidated MeraTech authority

User brief adopted November20: company pages, product information, consultancy, signup/onboarding, organization operations and restricted operators are distinct experiences.

| Offering | Truthful status | Next action |
|---|---|---|
| Mera QR | Existing hospitality application in staging | Explore, actual demo, secure signup when delivery is available |
| MeraTravel Suite | Planned; application not built | Register interest only |
| MeraTech Consultancy | Bespoke software enquiry workflow | Submit a project brief for review |

Reference folder `/Users/oluwateniolasobande/Downloads/meratech` inspected as source context, not executed. It has14HTML files,2CSS files and1JS file. Useful ideas: distinct parent/products, guest→preparation→owner story, travel-business direction. Rejected claims: two live products, template counts, all prices, ingredient tracking, live WhatsApp/Paystack/Flutterwave/USSD/AI, paid booking examples, response times, offices, phone and email placeholders. Its localStorage login and toast-only contact submission are not working application features.

New supplied logo attachments are byte-identical to existing preserved `public/mera/brand` variants (SHA256 dark2ecedeff…ec6b8; light1d4e4466…e263). White variant has real nontransparent white geometry; it is not blank. Existing `MeraBrand.tsx` preserves exact artwork with transparent margins clipped.

Routes agreed for implementation: `/mera` parent; `/mera/products`, `/mera/qr`, `/mera/travel`, `/mera/consultancy`, `/mera/about`, `/mera/contact`, `/mera/sign-in`, `/mera/legal`. Mera QR business registration remains `/mera/signup`, organization operations `/mera/workspace`, operator login `/mera/platform/sign-in` with MFA at `/mera/platform`. Route agreement alone is not proof of implementation.

Demonstration venue: Juniper House, explicitly fictional. Use accessible semantic menus, order summaries, preparation tickets, tables/reservations and overview compositions; optional demonstration controls must change a real illustrative state. Do not imply a payment occurred or the venue is a customer. Travel concepts have no working-product signup or invented launch date.

Preserved components: `src/mera/ui/MeraBrand.tsx`, `mera-foundations.css`, `src/mera/MeraSignIn.tsx`, `Signup.tsx`, `workspace/OwnerSetup.tsx`, `workspace/CreateOrganization.tsx`, `Platform.tsx`; reuse existing focus and authorization behavior. New enquiry modules and loading references must be added after files exist and are inspected.
