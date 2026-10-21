# Windows store installation

## 1. Prepare the machine

Use a maintained Windows computer with Node.js 22.12+ (or 24 LTS), Git, PostgreSQL 17+ including `pg_dump`/`pg_restore`, and the vendor drivers for XP-58IIH and XP-235B. Keep PostgreSQL bound to loopback; do not expose database port 5432 to the Wi-Fi network. Create a dedicated PostgreSQL database and owner with a unique password. Confirm the PostgreSQL service starts automatically.

Clone the repository to a stable folder such as `C:\BingChun`. Run `npm ci` and `npm run build`. Copy `.env.example` to `.env`; fill in DATABASE_URL and set NODE_ENV=production. Percent-encode special characters in the database URL password. Keep `.env`, certificates, database data and backups out of Git. Run `npm run bootstrap` interactively to create the first administrator. The bootstrap password prompt is visible; use the BOOTSTRAP_PASSWORD environment variable when an unattended setup is required and clear it afterward.

## 2. Network and HTTPS

Reserve the Windows computer's address in the router, e.g. `192.168.1.20`. This is an example, not an assumed existing address. Disable guest/client isolation for the store devices. No internet port forwarding is needed.

Configure a TLS certificate covering the actual reserved IP/hostname and localhost, issued by a CA the tablets trust. Install the local CA certificate on the managed tablets as part of commissioning; keep the CA private key secure. Do not tell staff to bypass browser certificate warnings. Supply TLS_CERT_PATH and TLS_KEY_PATH in `.env`; configure HTTPS_PORT=3443 and HTTPS_HOST=0.0.0.0. Set PUBLIC_ORIGIN to the exact tablet address, such as `https://192.168.1.20:3443`, and COOKIE_SECURE=true. Keep HOST=127.0.0.1 and PORT=3001 for the local HTTP listener; with secure cookies use `https://localhost:3443` for admin sign-in.

Allow inbound TCP 3443 only on the Windows Private network profile and only from the store subnet. Example (Administrator PowerShell; replace subnet/address as appropriate):

```powershell
New-NetFirewallRule -DisplayName 'Bing Chun tablet HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3443 -Profile Private -RemoteAddress LocalSubnet
```

The admin restriction checks the client address, including a forwarded address only from a trusted loopback proxy. Avoid adding an external reverse proxy without revisiting this configuration. ADMIN_ALLOW_REMOTE remains false. Admin users open localhost on the Windows machine. Cashier/supervisor accounts use the LAN address on tablets. Do not expose the development Vite server for production.

## 3. Initial verification

Start `npm start` and `npm run worker` in separate terminals. Sign in locally as admin, check Menu library, set business details and receipt/sticker dimensions, create staff accounts and sign in on a tablet. Test a sale in simulation first. Physically disconnect only the internet uplink (keep router/Wi-Fi powered) and verify ordering and simulated output continue. Test reconnect and service restart. Use non-production records for commissioning and create the production database separately before launch.

## 4. Automatic Windows services

Download WinSW from its official project releases, verify the release and supply its path to the installer. The repository intentionally does not bundle an arbitrary executable.

```powershell
.\scripts\install-windows.ps1 -WinSWPath C:\Tools\WinSW-x64.exe
```

This creates two automatically restarting services: BingChunPOS and BingChunWorker. PostgreSQL is the third running service. Review the service logon account in Windows Services. A dedicated least-privilege local account must have read access to the application/environment/certificates, write access to backups and print-output, access to the database and permission to print to both installed queues. Do not assume printers installed only for an interactive user are visible to the service account. Add the PostgreSQL bin directory to the service's PATH or use an appropriately configured system PATH so backup commands work. Restart after PATH changes.

WinSW's default service identity is not the recommended final least-privilege configuration: change and validate it during installation. Stop services via their WinSW wrappers before updating the checkout. Build the release, restart, check health and test output. The provided service script must be exercised on the actual Windows machine before production.

## 5. Backups

Set BACKUP_ENCRYPTION_KEY to a randomly generated 32-byte key encoded as 64 hex characters. Keep an offline copy of the key separate from the Windows computer; losing it makes encrypted backups unrecoverable. Configure an S3-compatible private bucket and restricted credentials using S3_BUCKET, S3_REGION, optional S3_ENDPOINT and AWS credential variables. The worker starts a backup at launch and at BACKUP_INTERVAL_HOURS, then retries pending uploads every minute. Failed local backups retry at the next backup interval. No unencrypted backups are uploaded. Successful cloud-backed encrypted local files are eligible for deletion after BACKUP_RETENTION_DAYS; failed/unuploaded backups are retained. Also configure bucket retention/versioning and monitor storage usage.

Review Store settings for backup status. Keep at least one backup destination on a separate disk/device; backups on the same disk alone cannot protect against disk failure. The printer output folder can contain transaction data; restrict its permissions and apply an operational retention policy.

## 6. Recovery drill

Before launch, create a backup, restore it to a NEW empty database and compare users, products, orders, payment totals and templates. A restore drill has not been run against the store's own infrastructure.

For encrypted backups:

```powershell
node --env-file=.env scripts/restore-backup.js backups\snapshot.dump.enc recovered.dump
pg_restore --no-owner --no-privileges --dbname=NEW_RECOVERY_DATABASE recovered.dump
```

Use PostgreSQL environment variables or its password-file support for credentials. Confirm a successful restore before changing DATABASE_URL. Never restore over a running production database. Stop the worker before recovery, and classify any `processing` jobs as uncertain to avoid reprinting old work after a crash. Retain the previous database until the recovery is accepted.
