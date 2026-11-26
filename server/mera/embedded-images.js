import path from "node:path";
import { readZip } from "./office-text.js";
const attrs = (xml) =>
  Object.fromEntries(
    [...xml.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
const relationships = (zip, name) =>
  new Map(
    [
      ...(zip.get(name)?.toString() || "").matchAll(
        /<Relationship\b[^>]*\/?\s*>/g,
      ),
    ].map((m) => {
      const a = attrs(m[0]);
      return [a.Id, a.Target];
    }),
  );
const resolve = (base, target) =>
  target?.startsWith("/")
    ? target.slice(1)
    : path.posix.normalize(
        path.posix.join(path.posix.dirname(base), target || ""),
      );
export function imageMime(b) {
  if (b?.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return "image/jpeg";
  if (b?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (
    b?.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
}
// Only source bytes are extracted. No rendering or image generation occurs here.
export function embeddedImages(
  buffer,
  kind,
  start = 1,
  budget = 20 * 1024 * 1024,
) {
  const images = {},
    markers = new Map();
  let total = 0,
    count = 0;
  const add = (bytes) => {
    const mime = imageMime(bytes);
    if (
      !mime ||
      bytes.length < 2048 ||
      bytes.length > 4 * 1024 * 1024 ||
      count + start > 60 ||
      total + bytes.length > budget
    )
      return null;
    const ref = `img${start + count++}`;
    total += bytes.length;
    images[ref] = { mime, data: bytes.toString("base64") };
    return ref;
  };
  if (kind === "pdf") {
    const raw = buffer.toString("latin1");
    for (const m of raw.matchAll(/<<(?:[^>]|>(?!>))*>>\s*stream\r?\n/g)) {
      if (
        !/\/Subtype\s*\/Image\b/.test(m[0]) ||
        !/\/Filter\s*\/DCTDecode\b/.test(m[0])
      )
        continue;
      const offset = m.index + m[0].length;
      const length = /\/Length\s+(\d+)\s*(?=\/|>>)/.exec(m[0]);
      let bytes;
      if (length) bytes = buffer.subarray(offset, offset + Number(length[1]));
      else {
        const end = raw.indexOf("endstream", offset);
        if (end < 0) continue;
        bytes = buffer.subarray(offset, end);
        const eoi = bytes.lastIndexOf(Buffer.from([255, 217]));
        if (eoi >= 0) bytes = bytes.subarray(0, eoi + 2);
      }
      if (
        imageMime(bytes) === "image/jpeg" &&
        bytes.subarray(-2).equals(Buffer.from([255, 217]))
      )
        add(bytes);
    }
    return { images, markers };
  }
  if (kind !== "docx" && kind !== "xlsx") return { images, markers };
  const zip = readZip(buffer, true);
  if (kind === "docx") {
    const rels = relationships(zip, "word/_rels/document.xml.rels");
    let xml = zip.get("word/document.xml")?.toString() || "";
    xml = xml.replace(/<a:blip\b[^>]*>/g, (tag) => {
      const target = resolve(
        "word/document.xml",
        rels.get(attrs(tag)["r:embed"]),
      );
      const ref =
        /^word\/media\//.test(target) && zip.has(target)
          ? add(zip.get(target))
          : null;
      return tag + (ref ? `[image ${ref}]` : "");
    });
    markers.set("word/document.xml", xml);
  } else {
    for (const [sheet, bytes] of zip) {
      if (!/^xl\/worksheets\/[^/]+\.xml$/.test(sheet)) continue;
      const rels = relationships(
        zip,
        path.posix.join(
          path.posix.dirname(sheet),
          "_rels",
          path.posix.basename(sheet) + ".rels",
        ),
      );
      const rows = new Map();
      for (const m of bytes.toString().matchAll(/<drawing\b[^>]*>/g)) {
        const drawing = resolve(sheet, rels.get(attrs(m[0])["r:id"]));
        const dr = relationships(
          zip,
          path.posix.join(
            path.posix.dirname(drawing),
            "_rels",
            path.posix.basename(drawing) + ".rels",
          ),
        );
        for (const anchor of (zip.get(drawing)?.toString() || "").matchAll(
          /<xdr:(?:oneCellAnchor|twoCellAnchor)\b[^>]*>([\s\S]*?)<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/g,
        )) {
          const row = /<xdr:from\b[^>]*>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(
            anchor[1],
          );
          const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(anchor[1]);
          const target = resolve(drawing, dr.get(embed?.[1]));
          const ref =
            row && /^xl\/media\//.test(target) && zip.has(target)
              ? add(zip.get(target))
              : null;
          if (ref) {
            const n = Number(row[1]) + 1;
            rows.set(n, (rows.get(n) || "") + ` [image ${ref}]`);
          }
        }
      }
      let xml = bytes
        .toString()
        .replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g, (tag, a, body) => {
          const n = Number(attrs(a).r);
          const marker = rows.get(n) || "";
          rows.delete(n);
          if (!marker) return tag;
          return `<row${a}>${body}<c t="inlineStr"><is><t>${marker}</t></is></c></row>`;
        });
      for (const [n, marker] of rows)
        xml = xml.replace(
          /<\/sheetData>/,
          `<row r="${n}"><c t="inlineStr"><is><t>${marker}</t></is></c></row></sheetData>`,
        );
      markers.set(sheet, xml);
    }
  }
  return { images, markers };
}
