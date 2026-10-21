# Bing Chun · local store workspace

A tablet-friendly restaurant/drinks POS for one store. The Windows counter computer hosts the application, PostgreSQL and a background print/backup worker. Handheld browsers connect over the store network. Normal sales do not require internet.

## Included

- Category-based menu, search, quantities, sweetness/ice and paid toppings.
- Held orders, server-calculated pricing, supervisor discounts and manual cash/card/transfer confirmation.
- Audited order progression: unpaid → paid → receipt submission → sticker submissions → preparing → ready → fulfilled.
- Cashier/supervisor/admin accounts, password hashing, expiring HTTP-only sessions and backend permission checks.
- Administration restricted to loopback (the Windows server itself) by default. Staff accounts can sign in from the LAN.
- Menu editor, separate receipt/sticker designers and live previews.
- Print queue, simulation output, controlled retries/reprints and Windows driver adapter.
- Product/payment/staff reporting data, CSV transaction exports, browser-printable EOD, cash reconciliation, closure/reopening and full refunds.
- Local PostgreSQL backups, optional AES-256-GCM encrypted S3-compatible uploads and a decryption utility.
- Installable web manifest and public-shell cache; authenticated API data is never cached by the service worker.

## Quick development preview

Requires Node 22.12+ and npm. No production credentials or real transactions should be entered in the preview.

```sh
npm ci
npm run build
npm run preview:local
```

This starts an isolated PostgreSQL instance, the app at `http://localhost:3002`, and a simulated print worker. The first run prints a randomly generated preview admin password in the terminal. Preview data persists under ignored `data/preview-db`. Do not use its fixed database credentials for deployment. The preview does not perform backups.

## Production deployment

Follow [Windows setup](docs/WINDOWS-SETUP.md). Production uses an independently installed PostgreSQL Windows service. Copy `.env.example` to `.env`, supply a unique database credential, build the frontend and create the initial admin:

```sh
npm ci
npm run build
npm run bootstrap
npm start
npm run worker
```

Run the application and worker in separate processes. `bootstrap` refuses to create a second initial admin; further users are created in Team & access. There are no default production accounts. Services can be installed with the supplied WinSW installation script after validating configuration.

The initial printing mode is **simulation**. It generates HTML in ignored `print-output/`, marks the jobs as simulated and exercises the order sequence. It does not prove physical printing works. Switch to `PRINT_MODE=windows` only during printer commissioning. See [printer validation](docs/PRINTER-COMMISSIONING.md).

## Checks

```sh
npm run build
npm test
npm run test:postgres
```

`npm test` uses an in-memory PostgreSQL emulator for API/domain checks. `test:postgres` starts a temporary real PostgreSQL server, runs API/domain plus worker/closure/refund tests and removes the temporary database. Do not point tests at production: the API test creates users and transactions. Docker is not required for this isolated test runtime.

## Menu provenance and financial boundaries

The seed contains 34 products readable from the supplied photographs. Confirm the full menu and all prices before trading. These obscured entries were not invented: A36 Chocolate Blueberry Sundae, A15 Ice Cream Black Tea, A16 Ice Cream Green Tea. The photographs reuse A15 for Mulberry Sundae and Ice Cream Black Tea; product UUIDs remain independent of display codes. Administrators can add/correct these entries in Menu library.

All monetary values are integer kobo; calculations and permission enforcement occur on the server. Taxes/service charges are not automatically added: tax configuration/rates have not been approved. EOD is based on calendar days in Africa/Lagos; sales are recognised on payment date, refunds on refund date. Product quantities/gross values are before refunds/discount allocation; add-on quantities are separate and their revenue is included in the parent product. Cash reconciliation counts sales cash only; opening floats/expenses are outside this release. Refunds record money already returned manually; the application does not execute bank/POS refunds.

## Operating constraints

- The router and Windows server must remain running. Reserve the server address, disable sleep during trading, use trusted TLS and consider a UPS.
- The server database is authoritative. Tablets retain draft baskets but cannot finalise transactions without reaching the local server.
- With internet unavailable, cloud uploads wait. Cloud storage is a backup destination, not a live failover server.
- Windows printer queue submission cannot guarantee physical paper output. Interrupted/failed submissions are marked uncertain and require staff to check before retrying.
- EOD printing currently uses the Windows browser print dialog. Select the receipt printer and appropriate roll settings if printing it thermally.
- Physical Windows service installation, Android device validation, paper/label calibration, and cloud credentials are store commissioning steps; they cannot be validated on this Mac without the store hardware.
