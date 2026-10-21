# Receipt and sticker commissioning

Profiles are based on photographs: XP-58IIH, USB, 58 mm receipt paper; XP-235B, USB, 20–60 mm media, 203 dpi label printer. The XP-235B stock's actual height and gap are not known yet. Bluetooth/Wi-Fi are not assumed for these specific units.

## Before hardware arrives

Keep PRINT_MODE=simulation. The worker saves HTML output locally and marks jobs as simulated. A paid order remains `paid` until its original receipt and all original label jobs have been submitted. One sticker is generated for every unit of a product with `label_required`; toppings attached to a drink are rendered on that drink's sticker. Standalone topping products are receipt-only by default. Queue simulation validates application sequencing, not the hardware.

Receipt studio edits business name, tagline, address, phone, footer, alignment, heading size, staff/options/payment/product-code visibility, label dimensions and label staff visibility. Templates are snapshotted into each job: editing a template cannot silently change an already queued receipt. No taxes are added automatically.

## Windows setup

1. Install manufacturer-supplied drivers and print a Windows test page on each unit.
2. Set exact roll/label media in Windows printer preferences; calibrate the XP-235B gap sensor using the manufacturer's procedure.
3. Name the queues `Customer Receipt` and `Cup Stickers`, or put their actual names in RECEIPT_PRINTER and LABEL_PRINTER.
4. Install Python and `pywin32`, `pillow`, `playwright`, and run `python -m playwright install chromium` under the account used by the worker. The adapter invokes `python` on PATH.
5. Test visibility and printing while logged on as the worker service account, not only the counter user.
6. Set PRINT_MODE=windows and restart the worker. The rasterised driver adapter is in scripts/windows_print.py. It deliberately fails instead of shrinking a long receipt or oversized label to unreadable text; configure roll height correctly.

## Acceptance matrix

- One drink: one receipt, then one sticker, then preparing.
- Five identical drinks: one receipt and five correctly numbered stickers.
- Mixed drinks with different sweetness/ice/toppings: separate accurate labels.
- Long product names, long receipt, currency glyphs, zero discount, fixed and percent discounts.
- Custom receipt/footer and different supported label dimensions.
- Multiple tablets confirming different orders simultaneously; no interleaved documents or duplicate originals.
- Receipt printer unavailable: do not dispatch dependent labels.
- Sticker printer unavailable: keep successful receipt; retry only affected stickers.
- Restart during submission: uncertain output requires physical inspection before retry.
- Paper exhausted, cover open and network interruption; document what the installed driver can actually detect.
- Reprint: duplicate receipt is visibly marked and reason appears in audit.
- Internet uplink down, local Wi-Fi up: orders and printing still work.

The driver spooler accepting output is not proof of physical paper output. Hardware-specific paper/error feedback may require a later manufacturer SDK/command adapter. Do not label this release hardware-validated before completing these checks.
