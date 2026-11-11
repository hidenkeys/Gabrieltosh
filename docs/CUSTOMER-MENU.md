# Public customer menu

The [Bing Chun Surulere menu](https://bing-chun-surulere-menu.akporkofi11.chatgpt.site/) can be opened without signing in. It is hosted separately from the POS and serves the last published menu while the store computer is off or offline.

1. Sign in to the local POS as an administrator and open **Customer menu**.
2. Select the products to show. Use **Menu library** to edit names, prices, sizes and categories. Unavailable items and items marked for review cannot be selected.
3. Choose **Publish menu**. Publishing sends only the selected products' customer-facing details to the hosted menu. Editing the store library alone does not update the public menu.
4. Scan the code in admin or download **PNG** for sharing and **SVG** for print design. The URL and code stay the same after publishing.

The publishing connection is set up on the development preview. To enable publishing on the Windows store computer, use a POS build that includes this feature, copy only the `PUBLIC_MENU_PUBLISH_KEY` entry from the protected preview `.env` into the Windows POS `C:\ProgramData\BingChunPOS\.env`, then restart **BingChunPOS**. Keep the key private; never add it to Git or send it to customers. Only the publishing button needs the key; opening and exporting the QR code do not.

The hosted Sites worker is in [customer-menu](../customer-menu/). It stores the latest snapshot in its `BUCKET` binding. The corresponding runtime secret in Sites is `MENU_PUBLISH_KEY`. To update the public site's design or bundled photo library, stage it into its Sites source checkout with `node customer-menu/stage.mjs <checkout> [sharp module directory]` (requires Node with TypeScript stripping and Sharp), then build, save and deploy the resulting source through Sites. Normal price and selection updates do not require a site deployment.
