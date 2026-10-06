import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  buildDocx,
  buildDocxParts,
  buildDocxWithParts,
  buildZipBomb,
  corruptEntryData,
  markAsZip64,
  paragraph,
  patchCentralEntry,
  tinyPng,
} from "../../../tests/helpers/docx";
import { ImportParseError } from "./errors";
import { IMPORT_LIMITS } from "./limits";
import { preflightDocx } from "./zip";

const MIB = 1024 * 1024;

function failureCode(action: () => void): string {
  try {
    action();
  } catch (error) {
    return error instanceof ImportParseError ? error.code : `unexpected: ${String(error)}`;
  }
  return "no error";
}

const valid = () => buildDocx({ body: paragraph("Hello"), images: { rId9: tinyPng } });

describe("preflightDocx accepts", () => {
  it("a well-formed document with an embedded image", () => {
    expect(() => preflightDocx(valid())).not.toThrow();
  });

  it("an archive at exactly the entry limit", () => {
    const parts = buildDocxParts({ body: paragraph("Hello") });
    const spare = IMPORT_LIMITS.maxZipEntries - Object.keys(parts).length;
    for (let index = 0; index < spare; index += 1) parts[`customXml/item${index}.xml`] = strToU8("<a/>");
    expect(Object.keys(parts)).toHaveLength(IMPORT_LIMITS.maxZipEntries);
    expect(() => preflightDocx(zipSync(parts))).not.toThrow();
  });

  it("content that inflates to just under the expanded-size limit", () => {
    expect(() => preflightDocx(buildZipBomb(19 * MIB, 4))).not.toThrow();
  });

  it("XML parts that stay just under the XML limit", () => {
    expect(() => preflightDocx(buildDocxWithParts([IMPORT_LIMITS.maxDocxXmlBytes - 64 * 1024]))).not.toThrow();
  });

  it("pictures and other non-XML parts far larger than the XML limit", () => {
    expect(() => preflightDocx(buildDocxWithParts([IMPORT_LIMITS.maxDocxXmlBytes * 3], "png"))).not.toThrow();
  });
});

describe("preflightDocx rejects input that is not a usable DOCX", () => {
  it.each([
    ["empty input", new Uint8Array(0)],
    ["tiny input", Uint8Array.of(0x50, 0x4b, 0x03, 0x04)],
    ["plain text", strToU8("Q: What is a closure?\nA: A function with its scope.\n".repeat(20))],
  ])("%s", (_label, bytes) => {
    expect(failureCode(() => preflightDocx(bytes))).toBe("INVALID_DOCX");
  });

  it("a truncated archive", () => {
    const bytes = valid();
    expect(failureCode(() => preflightDocx(bytes.subarray(0, bytes.length - 30)))).toBe("INVALID_DOCX");
  });

  it("a zip that has no word/document.xml", () => {
    const parts = buildDocxParts({ body: paragraph("Hello") });
    delete parts["word/document.xml"];
    expect(failureCode(() => preflightDocx(zipSync(parts)))).toBe("INVALID_DOCX");
  });

  it("an entry whose local header offset points outside the archive", () => {
    const bytes = patchCentralEntry(valid(), "word/document.xml", { localOffset: 0x7fffffff });
    expect(failureCode(() => preflightDocx(bytes))).toBe("INVALID_DOCX");
  });

  it("an unsupported compression method", () => {
    const bytes = patchCentralEntry(valid(), "word/document.xml", { method: 12 });
    expect(failureCode(() => preflightDocx(bytes))).toBe("INVALID_DOCX");
  });

  it("a ZIP64 archive", () => {
    expect(failureCode(() => preflightDocx(markAsZip64(valid())))).toBe("INVALID_DOCX");
  });

  it("a corrupt compressed stream", () => {
    const bytes = corruptEntryData(valid(), "word/document.xml");
    expect(failureCode(() => preflightDocx(bytes))).toBe("INVALID_DOCX");
  });

  it("declared sizes that are smaller than the real content", () => {
    const bytes = patchCentralEntry(valid(), "word/document.xml", { uncompressedSize: 10 });
    expect(failureCode(() => preflightDocx(bytes))).toBe("INVALID_DOCX");
  });

  it("declared sizes that are larger than the real content", () => {
    const bytes = patchCentralEntry(valid(), "word/document.xml", { uncompressedSize: 5 * MIB });
    expect(failureCode(() => preflightDocx(bytes))).toBe("INVALID_DOCX");
  });
});

describe("preflightDocx enforces its limits", () => {
  it("rejects encrypted entries", () => {
    const bytes = patchCentralEntry(valid(), "word/document.xml", { flags: 0x0001 });
    expect(failureCode(() => preflightDocx(bytes))).toBe("ENCRYPTED_DOCX");
  });

  it("rejects archives with too many entries", () => {
    const parts = buildDocxParts({ body: paragraph("Hello") });
    for (let index = 0; index <= IMPORT_LIMITS.maxZipEntries; index += 1) parts[`customXml/item${index}.xml`] = strToU8("<a/>");
    expect(failureCode(() => preflightDocx(zipSync(parts)))).toBe("DOCX_TOO_MANY_ENTRIES");
  });

  it("rejects a single part that inflates past the limit", () => {
    expect(failureCode(() => preflightDocx(buildZipBomb(25 * MIB)))).toBe("DOCX_TOO_LARGE");
  });

  it("rejects many parts whose combined size passes the limit", () => {
    expect(failureCode(() => preflightDocx(buildZipBomb(30 * MIB, 10)))).toBe("DOCX_TOO_LARGE");
  });

  it("measures real inflated bytes instead of trusting declared sizes", () => {
    const lying = patchCentralEntry(buildZipBomb(25 * MIB), "word/filler0.bin", { uncompressedSize: 100 });
    expect(failureCode(() => preflightDocx(lying))).toBe("DOCX_TOO_LARGE");
  });

  it("rejects an XML part that inflates past the XML limit", () => {
    expect(failureCode(() => preflightDocx(buildDocxWithParts([IMPORT_LIMITS.maxDocxXmlBytes + 1])))).toBe("DOCX_TOO_LARGE");
  });

  it("adds up every XML part, relationship parts included, rather than judging each alone", () => {
    const third = Math.ceil(IMPORT_LIMITS.maxDocxXmlBytes / 3);
    expect(failureCode(() => preflightDocx(buildDocxWithParts([third, third, third])))).toBe("DOCX_TOO_LARGE");
    expect(failureCode(() => preflightDocx(buildDocxWithParts([third, third, third], "rels")))).toBe("DOCX_TOO_LARGE");
  });
});
