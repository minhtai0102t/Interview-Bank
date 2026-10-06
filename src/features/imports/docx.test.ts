import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import {
  boldRun,
  buildDocx,
  codeParagraph,
  heading,
  imageParagraph,
  paragraph,
  patchCentralEntry,
  table,
  tinyPng,
} from "../../../tests/helpers/docx";
import { docxToCanonicalMarkdown } from "./docx";
import { ImportParseError } from "./errors";

async function failureCode(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return error instanceof ImportParseError ? error.code : `unexpected: ${String(error)}`;
  }
  return "no error";
}

describe("docxToCanonicalMarkdown", () => {
  it("converts headings, paragraphs and bold text to Markdown", async () => {
    const bytes = buildDocx({
      body: heading(2, "What is a closure?") + paragraph("A function that keeps its scope.") + boldRun("Remember this"),
    });

    const result = await docxToCanonicalMarkdown(bytes);

    expect(result.markdown).toBe("## What is a closure?\n\nA function that keeps its scope.\n\n**Remember this**\n");
    expect(result.warnings).toEqual([]);
  });

  it("converts tables to GFM tables", async () => {
    const bytes = buildDocx({
      body: table([
        ["Question", "Answer"],
        ["What is `let`?", "A block scoped binding."],
      ]),
    });

    const { markdown } = await docxToCanonicalMarkdown(bytes);

    expect(markdown).toContain("| Question");
    expect(markdown).toContain("A block scoped binding.");
    expect(markdown.split("\n").filter((line) => line.startsWith("|"))).toHaveLength(3);
  });

  it("turns consecutive Code-styled paragraphs into one fenced block", async () => {
    const bytes = buildDocx({ body: codeParagraph("const a = 1;") + codeParagraph("const b = 2;") });

    const { markdown } = await docxToCanonicalMarkdown(bytes);

    expect(markdown).toBe("```\nconst a = 1;\nconst b = 2;\n```\n");
  });

  it("omits embedded images and says so", async () => {
    const bytes = buildDocx({
      body: paragraph("Before") + imageParagraph("rId9") + paragraph("After"),
      images: { rId9: tinyPng },
    });

    const { markdown, warnings } = await docxToCanonicalMarkdown(bytes);

    expect(markdown).toBe("Before\n\nAfter\n");
    expect(warnings).toEqual([{ code: "IMAGES_OMITTED", count: 1, message: expect.stringContaining("1 image") }]);
  });

  it("does not touch linked external images", async () => {
    const linked =
      `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:link="rIdLinked"/></pic:blipFill></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    const bytes = buildDocx({
      body: paragraph("Text") + linked,
      extraParts: {
        "word/_rels/document.xml.rels": strToU8(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
            `<Relationship Id="rIdLinked" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="file:///C:/Windows/win.ini" TargetMode="External"/>` +
            `</Relationships>`,
        ),
      },
    });

    const { markdown, warnings } = await docxToCanonicalMarkdown(bytes);

    expect(markdown).toBe("Text\n");
    expect(warnings.map((warning) => warning.code)).toEqual(["IMAGES_OMITTED"]);
  });

  it("rejects files that are not DOCX archives", async () => {
    expect(await failureCode(() => docxToCanonicalMarkdown(strToU8("not a zip file at all, just text")))).toBe("INVALID_DOCX");
  });

  it("rejects a package whose main document is not valid XML", async () => {
    const bytes = buildDocx({ body: "", extraParts: { "word/document.xml": strToU8("<w:document><w:body><w:p>") } });
    expect(await failureCode(() => docxToCanonicalMarkdown(bytes))).toBe("INVALID_DOCX");
  });

  it("reports password-protected packages", async () => {
    const bytes = patchCentralEntry(buildDocx({ body: paragraph("Secret") }), "word/document.xml", { flags: 1 });
    expect(await failureCode(() => docxToCanonicalMarkdown(bytes))).toBe("ENCRYPTED_DOCX");
  });
});
