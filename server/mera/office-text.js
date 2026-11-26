import { inflateRawSync } from "node:zlib";
const bad = () =>
  Object.assign(new Error("Invalid or oversized Office file."), {
    status: 400,
  });
export function readZip(b, binary = false) {
  try {
    let end = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
      if (b.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    if (end < 0) throw bad();
    const count = b.readUInt16LE(end + 10);
    if (count > 2000) throw bad();
    let pos = b.readUInt32LE(end + 16),
      total = 0;
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      if (b.readUInt32LE(pos) !== 0x02014b50) throw bad();
      const method = b.readUInt16LE(pos + 10),
        compressed = b.readUInt32LE(pos + 20),
        size = b.readUInt32LE(pos + 24),
        nl = b.readUInt16LE(pos + 28),
        extra = b.readUInt16LE(pos + 30),
        comment = b.readUInt16LE(pos + 32),
        local = b.readUInt32LE(pos + 42);
      total += size;
      if (total > 20 * 1024 * 1024 || b.readUInt16LE(pos + 8) & 1) throw bad();
      const name = b.subarray(pos + 46, pos + 46 + nl).toString();
      if (b.readUInt32LE(local) !== 0x04034b50) throw bad();
      const start =
        local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      if (start + compressed > b.length) throw bad();
      const raw = b.subarray(start, start + compressed);
      const data =
        method === 0
          ? raw
          : method === 8
            ? inflateRawSync(raw, { maxOutputLength: Math.max(1, size) })
            : null;
      if (!data || data.length !== size) throw bad();
      entries.set(name, binary ? data : data.toString("utf8"));
      pos += 46 + nl + extra + comment;
    }
    return entries;
  } catch {
    throw bad();
  }
}
export const xmlText = (s) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
      e[0] === "#"
        ? String.fromCodePoint(
            e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
          )
        : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e] || "",
    );
export function officeText(buffer, kind, entries) {
  if (kind === "csv") {
    const text = buffer.toString("utf8");
    if (text.includes("\0") || text.includes("\ufffd")) throw bad();
    return text.slice(0, 200000);
  }
  const zip = entries || readZip(buffer);
  if (kind === "docx")
    return (zip.get("word/document.xml") || "")
      .replace(
        /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g,
        (_, cell) =>
          cell
            .replace(/<\/w:p>/g, " ")
            .replace(/<[^>]*>/g, "")
            .trim() + "\t",
      )
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .split("\n")
      .map(xmlText)
      .join("\n")
      .slice(0, 200000);
  const strings = [
    ...(zip.get("xl/sharedStrings.xml") || "").matchAll(
      /<si\b[^>]*>([\s\S]*?)<\/si>/g,
    ),
  ].map((m) => xmlText(m[1]));
  const names = [
    ...(zip.get("xl/workbook.xml") || "").matchAll(
      /<sheet\b[^>]*name="([^"]*)"/g,
    ),
  ].map((m) => xmlText(m[1]));
  let text = "";
  const append = (value) => {
    text = (text + value).slice(0, 200000);
    return text.length === 200000;
  };
  const sheets = [...zip]
    .filter(([n]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
  for (const [i, [, sheet]] of sheets.entries()) {
    if (append((i ? "\n\n" : "") + (names[i] || `Sheet ${i + 1}`))) return text;
    for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of row[1].matchAll(
        /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const reference = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1];
        const column = reference
          ? [...reference].reduce(
              (n, char) => n * 26 + char.charCodeAt(0) - 64,
              0,
            ) - 1
          : cells.length;
        if (column > 16383) throw bad();
        while (cells.length < column) cells.push("");
        const content = c[2] || "",
          v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(content)?.[1] || "";
        cells[column] = /t="s"/.test(c[1])
          ? strings[Number(v)] || ""
          : /t="inlineStr"/.test(c[1])
            ? xmlText(content)
            : xmlText(v);
      }
      if (append("\n" + cells.join("\t"))) return text;
    }
  }
  return text;
}
