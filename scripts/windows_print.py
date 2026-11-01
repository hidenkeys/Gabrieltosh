"""Submit rasterised thermal output through installed Windows drivers.
Install: py -m pip install pywin32 pillow playwright
         py -m playwright install chromium
Physical printer calibration is required before production.
"""
import sys
import json
import win32print
from pathlib import Path
from PIL import Image, ImageWin
from playwright.sync_api import sync_playwright
import win32ui
if sys.argv[1:] == ["--list"]:
    print(json.dumps([p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]))
    sys.exit(0)
if len(sys.argv) == 3 and sys.argv[1] == "--render-check":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 220, "height": 120})
        page.set_content("<b>BING CHUN</b><p>Printing renderer ready</p>")
        page.screenshot(path=sys.argv[2])
        browser.close()
    print(json.dumps({"ok": True}))
    sys.exit(0)
html_path, printer, kind, width, height = sys.argv[1:]
if kind not in ("receipt", "label"):
    raise ValueError("Unknown print kind")
width_mm = 58 if kind == 'receipt' else float(width)
image_path = str(Path(html_path).with_suffix('.png'))
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': round(width_mm / 25.4 * 96), 'height': 400}, device_scale_factor=203/96)
    page.goto(Path(html_path).as_uri())
    page.locator('body').screenshot(path=image_path)
    browser.close()
image = Image.open(image_path).convert('RGB')
dc = win32ui.CreateDC()
dc.CreatePrinterDC(printer)
started = False
try:
    printable_width = dc.GetDeviceCaps(8)
    printable_height = dc.GetDeviceCaps(10)
    target_width = min(printable_width, round(width_mm / 25.4 * dc.GetDeviceCaps(88)))
    target_height = round(image.height * target_width / image.width)
    if kind == "label" and target_height > round(float(height) / 25.4 * dc.GetDeviceCaps(90)):
        raise RuntimeError("Label content exceeds the selected label height. Increase label height or shorten the template.")
    if target_height > printable_height:
        raise RuntimeError('Output exceeds configured paper height. Configure receipt roll or label stock in Windows printer preferences.')
    dc.StartDoc('Bing Chun ' + kind)
    started = True
    dc.StartPage()
    ImageWin.Dib(image).draw(dc.GetHandleOutput(), (0, 0, target_width, target_height))
    dc.EndPage()
    dc.EndDoc()
    started = False
except Exception:
    if started:
        dc.AbortDoc()
    raise
finally:
    dc.DeleteDC()
