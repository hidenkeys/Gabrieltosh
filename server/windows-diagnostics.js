import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
  unlink,
} from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dataPath, pythonExecutable } from "./paths.js";
const run = promisify(execFile);

// Requests can only be written by administrators/the worker's service account.
// Run through the real worker identity so a successful desktop print cannot mask
// service-account printer visibility or permissions problems.
export async function processDiagnostic() {
  if (process.platform !== "win32" || !process.env.POS_DATA_DIR) return;
  const folder = dataPath("diagnostics");
  await mkdir(folder, { recursive: true });
  const file = (await readdir(folder)).find((f) =>
    /^[a-f0-9-]{36}\.request\.json$/.test(f),
  );
  if (!file) return;
  const source = resolve(folder, file);
  const claimed = source.replace(".request.json", ".processing.json");
  await rename(source, claimed);
  let result;
  try {
    const request = JSON.parse(await readFile(claimed, "utf8"));
    if (!["status", "receipt", "label"].includes(request.kind))
      throw new Error("Unknown printer check.");
    const { stdout } = await run(
      pythonExecutable(),
      [resolve("scripts/windows_print.py"), "--list"],
      { timeout: 30000 },
    );
    const printers = JSON.parse(stdout);
    if (request.kind !== "status") {
      const printer =
        request.kind === "receipt"
          ? process.env.RECEIPT_PRINTER
          : process.env.LABEL_PRINTER;
      if (!printers.includes(printer))
        throw new Error("The worker cannot see the configured printer queue.");
      const width = request.kind === "receipt" ? 58 : Number(request.width);
      const height = Number(request.height);
      if (!(width >= 20 && width <= 60 && height >= 15 && height <= 200))
        throw new Error("Invalid test media dimensions.");
      const html = claimed + ".html";
      await writeFile(
        html,
        `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{width:${width}mm;margin:0;padding:3mm;font:12px Arial;color:black}b{display:block;font-size:16px}</style><body><b>BING CHUN</b><p>INSTALLATION TEST<br>NOT A SALE</p><p>${request.kind === "receipt" ? "Receipt printer" : "Cup sticker"}<br>Check alignment and readable text.</p></body>`,
      );
      await run(
        pythonExecutable(),
        [
          resolve("scripts/windows_print.py"),
          html,
          printer,
          request.kind,
          String(width),
          String(height),
        ],
        { timeout: 90000 },
      );
    }
    result = {
      ok: true,
      printers,
      submitted: request.kind !== "status",
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    result = {
      ok: false,
      error: e.message,
      checkedAt: new Date().toISOString(),
    };
  }
  await writeFile(
    source.replace(".request.json", ".result.json"),
    JSON.stringify(result),
  );
  await unlink(claimed);
}
