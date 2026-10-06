import { htmlToCanonicalMarkdown, markdownToCanonicalMarkdown, type CanonicalMarkdown } from "./canonical";
import { docxToCanonicalMarkdown } from "./docx";
import { ImportParseError } from "./errors";
import { extractCandidates } from "./extract";
import { formatFromFileName } from "./formats";
import { IMPORT_LIMITS } from "./limits";
import type { ImportFormat, ParseResult, ParseStage, StructureMode } from "./types";

export interface ParseRequest {
  fileName: string;
  bytes: Uint8Array;
  structure: StructureMode;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    // A byte order mark is consumed by the decoder; invalid sequences throw instead of becoming U+FFFD.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new ImportParseError("NOT_UTF8", { cause });
  }
}

async function toCanonicalMarkdown(format: ImportFormat, bytes: Uint8Array): Promise<CanonicalMarkdown> {
  switch (format) {
    case "docx":
      return docxToCanonicalMarkdown(bytes);
    case "html":
      return htmlToCanonicalMarkdown(decodeUtf8(bytes));
    case "markdown":
    case "text":
      // Plain text is read as Markdown so labels, lists and fenced code behave the same way.
      return markdownToCanonicalMarkdown(decodeUtf8(bytes));
  }
}

/**
 * Turns a file into reviewable question candidates. Runs entirely on the caller's machine:
 * no network access, and nothing here persists anything.
 */
export async function parseImport(request: ParseRequest, report: (stage: ParseStage) => void = () => {}): Promise<ParseResult> {
  const format = formatFromFileName(request.fileName);
  if (!format) throw new ImportParseError("UNSUPPORTED_FORMAT");
  if (request.bytes.byteLength === 0) throw new ImportParseError("EMPTY_FILE");
  if (request.bytes.byteLength > IMPORT_LIMITS.maxFileBytes) throw new ImportParseError("FILE_TOO_LARGE");

  report("converting");
  const canonical = await toCanonicalMarkdown(format, request.bytes);

  report("extracting");
  const extraction = extractCandidates(canonical, request.structure);

  return {
    format,
    structure: extraction.structure,
    candidates: extraction.candidates,
    warnings: [...canonical.warnings, ...extraction.warnings],
  };
}
