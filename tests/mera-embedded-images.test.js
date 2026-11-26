import test from "node:test";
import assert from "node:assert/strict";
// Minimal stored ZIP fixtures; no Office software or external files are needed.
function zip(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const n = Buffer.from(name),
      data = Buffer.from(value);
    const l = Buffer.alloc(30),
      c = Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50);
    l.writeUInt32LE(data.length, 18);
    l.writeUInt32LE(data.length, 22);
    l.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    local.push(l, n, data);
    central.push(c, n);
    offset += l.length + n.length + data.length;
  }
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
import { embeddedImages } from "../server/mera/embedded-images.js";
import { uploadParts } from "../server/mera/menu-import.js";
const jpeg = (size = 2100) =>
  Buffer.concat([
    Buffer.from([255, 216, 255]),
    Buffer.alloc(size - 5, 65),
    Buffer.from([255, 217]),
  ]);
export const pdfImages = (...images) =>
  Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    ...images.flatMap((b) => [
      Buffer.from(
        `1 0 obj\n<< /Subtype /Image /Filter /DCTDecode /Length ${b.length} >>\nstream\n`,
      ),
      b,
      Buffer.from("\nendstream\nendobj\n"),
    ]),
  ]);
test("docx resolves media in document order and inserts markers beside text", () => {
  const b = zip({
    "word/document.xml":
      '<w:p><w:t>Rice</w:t><a:blip r:embed="r2"/></w:p><w:p><w:t>Beans</w:t><a:blip r:embed="r1"/></w:p>',
    "word/_rels/document.xml.rels":
      '<Relationships><Relationship Id="r1" Target="media/a.jpg"/><Relationship Id="r2" Target="media/b.jpg"/></Relationships>',
    "word/media/a.jpg": jpeg(2200),
    "word/media/b.jpg": jpeg(2300),
  });
  const result = embeddedImages(b, "docx");
  assert.equal(Buffer.from(result.images.img1.data, "base64").length, 2300);
  assert.equal(Buffer.from(result.images.img2.data, "base64").length, 2200);
  const parts = uploadParts([
    { name: "menu.docx", data: b.toString("base64") },
  ]).parts;
  assert.match(parts[1].text, /Rice\[image img1\]\nBeans\[image img2\]/);
});
test("xlsx resolves sheet drawings and places the marker on its anchored row", () => {
  const b = zip({
    "xl/workbook.xml": "<workbook/>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="4"><c t="inlineStr"><is><t>Rice</t></is></c></row></sheetData><drawing r:id="d"/></worksheet>',
    "xl/worksheets/_rels/sheet1.xml.rels":
      '<Relationship Id="d" Target="../drawings/drawing1.xml"/>',
    "xl/drawings/drawing1.xml":
      '<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>3</xdr:row></xdr:from><a:blip r:embed="i"/></xdr:twoCellAnchor>',
    "xl/drawings/_rels/drawing1.xml.rels":
      '<Relationship Id="i" Target="../media/a.jpg"/>',
    "xl/media/a.jpg": jpeg(),
  });
  const result = uploadParts([
    { name: "menu.xlsx", data: b.toString("base64") },
  ]);
  assert.match(result.parts[1].text, /Rice\t \[image img1\]/);
  assert(result.photos.img1);
});
test("PDF extracts complete raw DCT JPEG streams and skips other filters and invalid bytes", () => {
  const b = pdfImages(jpeg(), Buffer.alloc(2200), jpeg(1000));
  assert.deepEqual(Object.keys(embeddedImages(b, "pdf").images), ["img1"]);
  assert.equal(
    Object.keys(
      embeddedImages(
        Buffer.from(
          b.toString("latin1").replaceAll("DCTDecode", "FlateDecode"),
          "latin1",
        ),
        "pdf",
      ).images,
    ).length,
    0,
  );
});
test("embedded image caps bound count, individual size, and aggregate bytes", () => {
  assert.equal(
    Object.keys(
      embeddedImages(
        pdfImages(...Array.from({ length: 65 }, () => jpeg())),
        "pdf",
      ).images,
    ).length,
    60,
  );
  assert.equal(
    Object.keys(
      embeddedImages(pdfImages(jpeg(4 * 1024 * 1024 + 1)), "pdf").images,
    ).length,
    0,
  );
  assert.equal(
    Object.keys(
      embeddedImages(
        pdfImages(...Array.from({ length: 6 }, () => jpeg(4 * 1024 * 1024))),
        "pdf",
      ).images,
    ).length,
    5,
  );
});
test("multiple uploaded files share the image count and unique reference sequence", () => {
  const data = pdfImages(...Array.from({ length: 40 }, () => jpeg())).toString(
    "base64",
  );
  const result = uploadParts([
    { name: "one.pdf", data },
    { name: "two.pdf", data },
  ]);
  assert.equal(Object.keys(result.photos).length, 60);
  assert(result.photos.img60);
  assert.equal(result.photos.img61, undefined);
  assert.equal(
    Object.keys(
      embeddedImages(pdfImages(jpeg(3000), jpeg(3000)), "pdf", 1, 5000).images,
    ).length,
    1,
  );
});
