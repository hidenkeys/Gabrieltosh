# Install Bing Chun on the store computer

Use a maintained x64 Windows computer (Windows 11 recommended), the store router, and both USB printers. Install the application on **one** computer. Tablets need only a browser and the public store CA certificate.

## Get the installer

Open the repository's **Actions → Build Windows installer**, select a successful run, then download **BingChun-Windows-x64** from Artifacts. Extract the ZIP and run `BingChun-Setup-<version>-x64.exe`. The accompanying `.sha256` file lets you compare the installer with `Get-FileHash -Algorithm SHA256`. GitHub artifact downloads require a GitHub sign-in; artifacts expire after 30 days, so keep the accepted installer offline.

The build bundles Node, PostgreSQL 17, Python, printing libraries, Chromium and WinSW. Internet is needed on the build machine; the installed application does not download these runtimes. Manufacturer printer drivers are separate. The package is not code-signed; a publisher certificate is needed before distributing a signed installer. Obtain it from this repository's successful build rather than unrelated download sites.

## Guided setup

1. Run the installer and permit its Windows administrator prompt. Select **Configure database, network and printers** at the end, or open **Bing Chun POS → Store setup** from Start.
2. **Database & login:** keep the default local database port unless occupied. Enter the administrator name, username and a unique password of at least ten characters. Database credentials and a backup encryption key are generated automatically. Existing accounts are preserved on repair.
3. **Store network:** select the computer's actual private IPv4 address. Reserve that same address in the router. Keep the default HTTPS port unless occupied. Set the Windows network profile to **Private**; setup deliberately does not change network trust automatically. Disable guest/client isolation on the staff network.
4. **Printers:** begin with **Simulation**. Install the matching Xprinter drivers, print Windows test pages, then refresh and select the receipt and sticker queues. Measure the sticker width and height; configure matching paper size and gap sensing in Windows. Receipt paper is 58 mm.
5. Choose **Apply setup**. This creates local PostgreSQL, loads the menu, creates the initial admin, generates/trusts HTTPS certificates, configures the local-subnet firewall rule and starts three automatic Windows services.
6. On **Test & finish**, run **Check services & printers**. Then use **Open POS** and sign in. Create cashier/supervisor accounts in Team & access.

Application files are in `C:\Program Files\BingChunPOS`. Persistent data, configuration, logs, certificates, print output and encrypted backups are under `C:\ProgramData\BingChunPOS`. The database listens only on loopback. All services use the restricted Windows LocalService identity with separate service SIDs and filesystem permissions; they do not run as Administrator/LocalSystem. The CA private key and database superuser credential are restricted to administrators/System.

## Connect Android tablets

1. Copy **only** `C:\ProgramData\BingChunPOS\tablet\Store-Tablet-CA.cer` to each managed tablet, using USB or your approved device-management method. The wizard's **Tablet certificate** button opens the folder.
2. Install it as a **CA certificate**, usually under Settings → Security → Encryption & credentials → Install a certificate. Android wording and management restrictions vary. Do not transfer `ca-key.pem`, `store-key.pem` or `.env`.
3. Join the same Wi-Fi, open the tablet HTTPS address displayed by setup, and sign in with a staff account. Example: `https://192.168.1.20:3443`. **localhost on a tablet refers to that tablet**, not the Windows computer.
4. Add the site to the tablet's home screen. Admin sign-in is restricted to `https://localhost:<port>` on Windows.

Certificates last one year. Run Store setup and Apply setup to renew the server certificate before expiry. The existing store CA is preserved, so tablets do not need a new CA installation. If the server IP changes, reserve the new IP and apply setup again; bookmarks must use the new displayed address.

## Test real printing

Use **Check system and printers** from Start. Queue enumeration and test output run through the **actual background worker**, not the elevated desktop user. Choose **Print test receipt** and **Print test sticker**; these submit physical installation tests even when order printing remains in simulation. Check the paper yourself: Windows accepting a job does not prove it printed.

After the tests pass, choose **Windows - physical printing** and Apply setup. In Receipt studio, set the receipt details and matching label dimensions. Wizard dimensions size installation test output; Receipt studio controls order labels. New paid orders print automatically without a browser print dialog. Old simulated jobs are not replayed. EOD currently uses the browser print dialog.

Complete [the printer acceptance checklist](PRINTER-COMMISSIONING.md), including multiple tablets, different options/toppings, receipt-before-sticker sequencing, long receipts, retries, interruption recovery and reprints. If a label exceeds its selected height or a receipt exceeds the driver's roll height, the adapter reports an error instead of shrinking text to fit. Configure the driver/media and retry only after checking physical output.

## Backups, updates and recovery

- Local encrypted backups run at worker startup and every six hours. **Back up now** in Start requests an immediate backup. Copy accepted backups to an independent device/location; the same disk alone does not protect against disk failure.
- Keep the `BACKUP_ENCRYPTION_KEY` from the administrator-protected `.env` in a separate secure offline location. Losing the key makes encrypted backups unreadable. The installer does not set up a cloud account; optional S3 configuration is described in [Windows setup](WINDOWS-SETUP.md).
- An installer update first attempts a backup using the existing installation, then stops the services before replacing files. After update, run Apply setup to apply migrations and restart. Application uninstall stops/removes services and the firewall rule, and **preserves store data**. Reinstallation can reuse it. PostgreSQL major upgrades require a planned dump/restore; do not point a different major version at the existing data folder.
- Recovery into a new database is documented in [Windows setup](WINDOWS-SETUP.md#6-recovery-drill). Complete a restore drill before real sales. Do not overwrite a running production database.
- Keep Windows awake during trading. Restart Windows and verify services/printing, then disconnect only the internet uplink and verify local operation with the router still powered.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Cached login page opens but cannot connect | Check system; make sure BingChunDatabase and BingChunPOS are running. |
| Windows works, tablet cannot connect | Correct IP/port, same Wi-Fi, Private network profile, firewall, guest isolation, and tablet CA installation. |
| Printer visible on desktop, missing in worker checks | Install a machine-wide local queue and grant the worker permission in printer Security; per-user printer connections may be invisible to LocalService. |
| Print queue reports uncertain output | Inspect actual paper/labels before retrying; an interrupted submission might already have printed. |
| Setup fails partway | Keep the data folder. Correct the displayed problem and rerun setup; saved database credentials and existing users are reused. Inspect service logs if necessary. |

The build's Windows smoke test validates install, restricted services, HTTPS/login, persistent data, encrypted backups and repair. It cannot certify USB hardware, driver margins, Android certificate installation, or the store router; validate those on site.
