import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { buildDocx, heading, paragraph } from "../../../tests/helpers/docx";
import { ImportParseError } from "./errors";
import { IMPORT_LIMITS } from "./limits";
import { parseImport } from "./parsers";
import type { ParseStage } from "./types";

const text = (value: string) => strToU8(value);

async function failureCode(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return error instanceof ImportParseError ? error.code : `unexpected: ${String(error)}`;
  }
  return "no error";
}

describe("parseImport", () => {
  it("reads Markdown with Q/A labels", async () => {
    const result = await parseImport({
      fileName: "bank.md",
      bytes: text("Q: What is a closure?\nA: A function with its scope.\n"),
      structure: "auto",
    });

    expect(result).toEqual({
      format: "markdown",
      structure: "labels",
      candidates: [
        {
          sourceIndex: 0,
          title: "What is a closure?",
          promptMarkdown: "What is a closure?",
          answerMarkdown: "A function with its scope.",
          problems: [],
        },
      ],
      warnings: [],
    });
  });

  it("reads HTML sections and drops active content", async () => {
    const html = "<h2>What is hoisting?</h2><p>Declarations move up.</p><script>alert(1)</script><h2>What is a closure?</h2><p>Scope capture.</p>";

    const result = await parseImport({ fileName: "bank.html", bytes: text(html), structure: "auto" });

    expect(result.format).toBe("html");
    expect(result.structure).toBe("h2");
    expect(result.candidates.map((candidate) => [candidate.title, candidate.answerMarkdown])).toEqual([
      ["What is hoisting?", "Declarations move up."],
      ["What is a closure?", "Scope capture."],
    ]);
    expect(JSON.stringify(result)).not.toContain("alert");
  });

  it("reads plain text with a byte order mark and Windows line endings", async () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...text("Q: One?\r\nA: First\r\nQ: Two?\r\nA: Second\r\n")]);

    const result = await parseImport({ fileName: "bank.txt", bytes, structure: "auto" });

    expect(result.format).toBe("text");
    expect(result.candidates.map((candidate) => [candidate.promptMarkdown, candidate.answerMarkdown])).toEqual([
      ["One?", "First"],
      ["Two?", "Second"],
    ]);
  });

  it("reads Word documents", async () => {
    const bytes = buildDocx({ body: heading(2, "What is a promise?") + paragraph("An eventual value.") });

    const result = await parseImport({ fileName: "bank.docx", bytes, structure: "auto" });

    expect(result.format).toBe("docx");
    expect(result.structure).toBe("h2");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.answerMarkdown).toBe("An eventual value.");
  });

  it("honours an explicit structure choice", async () => {
    const markdown = "## Section\n\n### First?\n\nOne\n\n### Second?\n\nTwo\n";

    const auto = await parseImport({ fileName: "a.md", bytes: text(markdown), structure: "auto" });
    const explicit = await parseImport({ fileName: "a.md", bytes: text(markdown), structure: "h3" });

    expect(auto.structure).toBe("h2");
    expect(auto.candidates).toHaveLength(1);
    expect(explicit.structure).toBe("h3");
    expect(explicit.candidates.map((candidate) => candidate.title)).toEqual(["First?", "Second?"]);
  });

  it("combines cleanup warnings with extraction warnings", async () => {
    const result = await parseImport({
      fileName: "a.md",
      bytes: text("Just a note with an image ![logo](logo.png) and no questions.\n"),
      structure: "auto",
    });

    expect(result.structure).toBe("none");
    expect(result.warnings.map((warning) => warning.code)).toEqual(["IMAGES_OMITTED", "NO_STRUCTURE"]);
  });

  it("reports stages in order", async () => {
    const stages: ParseStage[] = [];

    await parseImport({ fileName: "a.md", bytes: text("Q: A?\nA: B\n"), structure: "auto" }, (stage) => stages.push(stage));

    expect(stages).toEqual(["converting", "extracting"]);
  });

  it("reads text of exactly the text limit, and puts no text limit on HTML", async () => {
    const markdown = parseImport({ fileName: "a.md", bytes: text("a".repeat(IMPORT_LIMITS.maxTextChars)), structure: "auto" });
    const html = parseImport({ fileName: "a.html", bytes: text(`<p>${"a".repeat(IMPORT_LIMITS.maxTextChars + 1)}</p>`), structure: "auto" });

    await expect(markdown).resolves.toMatchObject({ structure: "none" });
    await expect(html).resolves.toMatchObject({ structure: "none" });
  });
});

describe("parseImport rejects", () => {
  it.each(["legacy.doc", "scan.pdf", "README"])("unsupported file %s", async (fileName) => {
    expect(await failureCode(() => parseImport({ fileName, bytes: text("x"), structure: "auto" }))).toBe("UNSUPPORTED_FORMAT");
  });

  it("an empty file", async () => {
    expect(await failureCode(() => parseImport({ fileName: "a.md", bytes: new Uint8Array(0), structure: "auto" }))).toBe("EMPTY_FILE");
  });

  it("a file over the size limit", async () => {
    const bytes = new Uint8Array(IMPORT_LIMITS.maxFileBytes + 1);
    expect(await failureCode(() => parseImport({ fileName: "a.txt", bytes, structure: "auto" }))).toBe("FILE_TOO_LARGE");
  });

  it.each(["a.md", "a.txt"])("%s with more characters than the text limit", async (fileName) => {
    const bytes = text("a".repeat(IMPORT_LIMITS.maxTextChars + 1));
    expect(await failureCode(() => parseImport({ fileName, bytes, structure: "auto" }))).toBe("TEXT_TOO_LARGE");
  });

  it.each(["a.md", "a.txt", "a.html"])("text that is not valid UTF-8 in %s", async (fileName) => {
    const bytes = Uint8Array.of(0x51, 0x3a, 0x20, 0xe9, 0x0a);
    expect(await failureCode(() => parseImport({ fileName, bytes, structure: "auto" }))).toBe("NOT_UTF8");
  });

  it("a .docx that is not a Word document", async () => {
    expect(await failureCode(() => parseImport({ fileName: "a.docx", bytes: text("plain text"), structure: "auto" }))).toBe("INVALID_DOCX");
  });
});
