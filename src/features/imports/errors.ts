export type ImportErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "TEXT_TOO_LARGE"
  | "NOT_UTF8"
  | "INVALID_DOCX"
  | "ENCRYPTED_DOCX"
  | "DOCX_TOO_LARGE"
  | "DOCX_TOO_MANY_ENTRIES"
  | "CONTENT_TOO_COMPLEX"
  | "TIMEOUT"
  | "CANCELLED"
  | "PARSE_FAILED";

export class ImportParseError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "ImportParseError";
    this.code = code;
  }
}

/** Safe to show to the person who selected the file; never includes file content. */
export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  UNSUPPORTED_FORMAT: "This file type is not supported. Choose a .html, .md, .txt or .docx file. Legacy .doc files must be saved as .docx first.",
  EMPTY_FILE: "This file is empty.",
  FILE_TOO_LARGE: "This file is larger than 10 MiB. Split it into smaller files and import them one by one.",
  TEXT_TOO_LARGE: "This file has more text than the importer reads at once (about 2 million characters). Split it into smaller files and import them one by one.",
  NOT_UTF8: "This file is not UTF-8 text. Open it in an editor and save it with UTF-8 encoding, then try again.",
  INVALID_DOCX: "This does not look like a valid .docx file. It may be damaged or saved in another format.",
  ENCRYPTED_DOCX: "This .docx file is password protected. Remove the password and try again.",
  DOCX_TOO_LARGE: "This .docx file holds more than the importer accepts (over 3 MiB of document text, or over 20 MiB once unpacked). Split it into smaller documents and import them one by one.",
  DOCX_TOO_MANY_ENTRIES: "This .docx file contains more internal parts than the importer accepts.",
  CONTENT_TOO_COMPLEX: "This document is too deeply nested or too large to process safely.",
  TIMEOUT: "Reading this file took too long and was stopped. Try a smaller file.",
  CANCELLED: "The import was cancelled.",
  PARSE_FAILED: "This file could not be read. It may be damaged.",
};
