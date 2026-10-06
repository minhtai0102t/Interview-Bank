import { describe, expect, it } from "vitest";

import { formatFromFileName } from "./formats";

describe("formatFromFileName", () => {
  it.each([
    ["questions.md", "markdown"],
    ["questions.markdown", "markdown"],
    ["QUESTIONS.MD", "markdown"],
    ["notes.txt", "text"],
    ["page.html", "html"],
    ["page.htm", "html"],
    ["bank.v2.docx", "docx"],
  ])("maps %s to %s", (name, format) => {
    expect(formatFromFileName(name)).toBe(format);
  });

  it.each(["legacy.doc", "scan.pdf", "archive.zip", "README", "trailing-dot.", ".md.exe", ""])("does not support %j", (name) => {
    expect(formatFromFileName(name)).toBeUndefined();
  });
});
