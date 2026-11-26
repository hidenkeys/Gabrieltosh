import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { officeText, readZip } from "../server/mera/office-text.js";
export function zip(entries, method = 8) {
  let offset = 0;
  const local = [],
    central = [];
  for (const [name, text] of Object.entries(entries)) {
    const n = Buffer.from(name),
      data = Buffer.from(text),
      packed = method === 8 ? deflateRawSync(data) : data,
      l = Buffer.alloc(30),
      c = Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50);
    l.writeUInt16LE(method, 8);
    l.writeUInt32LE(packed.length, 18);
    l.writeUInt32LE(data.length, 22);
    l.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    local.push(l, n, packed);
    central.push(c, n);
    offset += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(central),
    e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50);
  e.writeUInt16LE(central.length / 2, 8);
  e.writeUInt16LE(central.length / 2, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, e]);
}
test("xlsx extracts sheet names, shared strings, inline strings and numeric prices", () => {
  const b = zip({
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Food &amp; drinks"/></sheets></workbook>',
    "xl/sharedStrings.xml": "<sst><si><t>Rice &amp; beans</t></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><row><c t="s"><v>0</v></c><c><v>2500</v></c><c t="inlineStr"><is><t>Large</t></is></c></row></worksheet>',
  });
  assert.equal(
    officeText(b, "xlsx"),
    "Food & drinks\nRice & beans\t2500\tLarge",
  );
});
test("docx extracts paragraphs and tab-separated table cells, including stored ZIPs", () => {
  const b = zip(
    {
      "word/document.xml":
        "<w:document><w:p><w:r><w:t>Menu &#x26; extras</w:t></w:r></w:p><w:tr><w:tc><w:p><w:t>Rice</w:t></w:p></w:tc><w:tc><w:p><w:t>2500</w:t></w:p></w:tc></w:tr></w:document>",
    },
    0,
  );
  const text = officeText(b, "docx");
  assert.match(text, /Menu & extras\n/);
  assert.match(text, /Rice\t2500\t\n/);
});
test("ZIP rejects uncompressed bombs, excessive entries and truncated archives", () => {
  const bomb = zip({ "word/document.xml": "x".repeat(21 * 1024 * 1024) });
  assert.throws(() => readZip(bomb), /oversized/);
  const b = zip({ a: "b" });
  b.writeUInt16LE(2001, b.length - 12);
  assert.throws(() => readZip(b), /oversized/);
  assert.throws(() => readZip(Buffer.from("PK")), /Invalid/);
});
test("CSV validates UTF-8 and extraction is capped", () => {
  assert.equal(officeText(Buffer.from("Rice,2500"), "csv"), "Rice,2500");
  assert.equal(
    officeText(Buffer.from("a".repeat(210000)), "csv").length,
    200000,
  );
  assert.throws(() => officeText(Buffer.from([0xff]), "csv"));
});
