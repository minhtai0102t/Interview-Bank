import { strToU8, zipSync, type Zippable } from "fflate";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function paragraph(text: string, style?: string): string {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function heading(level: 1 | 2 | 3, text: string): string {
  return paragraph(text, `Heading${level}`);
}

export function codeParagraph(text: string): string {
  return paragraph(text, "Code");
}

export function boldRun(text: string): string {
  return `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function table(rows: string[][]): string {
  const body = rows
    .map((cells) => `<w:tr>${cells.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join("")}</w:tr>`)
    .join("");
  return `<w:tbl><w:tblPr/><w:tblGrid/>${body}</w:tbl>`;
}

export function imageParagraph(relationshipId: string, description = "diagram"): string {
  return (
    `<w:p><w:r><w:drawing>` +
    `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:docPr id="1" name="Picture 1" descr="${escapeXml(description)}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:blipFill><a:blip r:embed="${relationshipId}"/></pic:blipFill>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

const stylesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}">` +
  [
    ["Heading1", "heading 1"],
    ["Heading2", "heading 2"],
    ["Heading3", "heading 3"],
    ["Code", "Code"],
  ]
    .map(([id, name]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`)
    .join("") +
  `</w:styles>`;

const contentTypesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Default Extension="png" ContentType="image/png"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `</Types>`;

const rootRelationshipsXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

/** 1x1 transparent PNG. */
export const tinyPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (character) => character.charCodeAt(0),
);

export interface DocxOptions {
  /** Body XML built from the paragraph/heading/table helpers. */
  body: string;
  /** Embedded images, keyed by relationship ID. */
  images?: Record<string, Uint8Array>;
  /** Additional or replacement package parts. */
  extraParts?: Record<string, Uint8Array>;
}

export function buildDocxParts(options: DocxOptions): Zippable {
  const images = options.images ?? {};
  const imageRelationships = Object.keys(images)
    .map(
      (id) =>
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${id}.png"/>`,
    )
    .join("");

  const parts: Zippable = {
    "[Content_Types].xml": strToU8(contentTypesXml),
    "_rels/.rels": strToU8(rootRelationshipsXml),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${options.body}</w:body></w:document>`,
    ),
    "word/styles.xml": strToU8(stylesXml),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imageRelationships}</Relationships>`,
    ),
  };

  for (const [id, data] of Object.entries(images)) parts[`word/media/${id}.png`] = data;
  Object.assign(parts, options.extraParts);
  return parts;
}

export function buildDocx(options: DocxOptions): Uint8Array {
  return zipSync(buildDocxParts(options));
}

/** Level 2 question headings, each followed by answer paragraphs and a code line. */
export function buildQuestionnaire(options: { questions: number; answerParagraphs: number }): Uint8Array {
  const sentence = "Explain the trade-offs, describe one failure mode and name a way to measure the result in production.";
  let body = heading(1, "Generated questionnaire");
  for (let question = 1; question <= options.questions; question += 1) {
    body += heading(2, `Question ${question}: what are the trade-offs of approach ${question}?`);
    for (let part = 1; part <= options.answerParagraphs; part += 1) {
      body += paragraph(`${sentence} (${question}.${part})`);
    }
    body += codeParagraph(`const result${question} = measure(approach${question});`);
  }
  return buildDocx({ body });
}

/* ---------- Byte-level helpers for hostile archives ---------- */

const CENTRAL_SIGNATURE = 0x02014b50;

function viewOf(zip: Uint8Array): DataView {
  return new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
}

/** Offset of the central directory header that describes the named entry. */
export function centralHeaderOffset(zip: Uint8Array, name: string): number {
  const view = viewOf(zip);
  const target = strToU8(name);
  for (let offset = 0; offset + 46 <= zip.length; offset += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) continue;
    const nameLength = view.getUint16(offset + 28, true);
    const entryName = zip.subarray(offset + 46, offset + 46 + nameLength);
    if (nameLength === target.length && entryName.every((byte, index) => byte === target[index])) return offset;
  }
  throw new Error(`No central directory entry named ${name}`);
}

export function patchCentralEntry(
  zip: Uint8Array,
  name: string,
  patch: { flags?: number; method?: number; uncompressedSize?: number; compressedSize?: number; localOffset?: number },
): Uint8Array {
  const copy = zip.slice();
  const view = viewOf(copy);
  const offset = centralHeaderOffset(copy, name);
  if (patch.flags !== undefined) view.setUint16(offset + 8, patch.flags, true);
  if (patch.method !== undefined) view.setUint16(offset + 10, patch.method, true);
  if (patch.compressedSize !== undefined) view.setUint32(offset + 20, patch.compressedSize, true);
  if (patch.uncompressedSize !== undefined) view.setUint32(offset + 24, patch.uncompressedSize, true);
  if (patch.localOffset !== undefined) view.setUint32(offset + 42, patch.localOffset, true);
  return copy;
}

/** Overwrites the first bytes of an entry's compressed data so the stream no longer inflates. */
export function corruptEntryData(zip: Uint8Array, name: string): Uint8Array {
  const copy = zip.slice();
  const view = viewOf(copy);
  const central = centralHeaderOffset(copy, name);
  const local = view.getUint32(central + 42, true);
  const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  copy.fill(0xff, dataStart, dataStart + 4);
  return copy;
}

/** Marks the archive as ZIP64 by saturating the entry count in the end-of-central-directory record. */
export function markAsZip64(zip: Uint8Array): Uint8Array {
  const copy = zip.slice();
  const view = viewOf(copy);
  const eocd = copy.length - 22;
  view.setUint16(eocd + 8, 0xffff, true);
  view.setUint16(eocd + 10, 0xffff, true);
  return copy;
}

/** A DOCX-shaped archive whose single large part inflates to `bytes` zero bytes. */
export function buildZipBomb(bytes: number, parts = 1): Uint8Array {
  const zeros = new Uint8Array(Math.floor(bytes / parts));
  const archive: Zippable = {
    ...buildDocxParts({ body: paragraph("bomb") }),
  };
  for (let index = 0; index < parts; index += 1) {
    archive[`word/filler${index}.bin`] = [zeros, { level: 9 }];
  }
  return zipSync(archive);
}

/** A well-formed document plus extra parts that inflate to the given sizes and compress to almost nothing. */
export function buildDocxWithParts(sizes: number[], extension = "xml"): Uint8Array {
  const archive: Zippable = { ...buildDocxParts({ body: paragraph("Hello") }) };
  sizes.forEach((size, index) => {
    archive[`customXml/filler${index}.${extension}`] = [new Uint8Array(size), { level: 9 }];
  });
  return zipSync(archive);
}
