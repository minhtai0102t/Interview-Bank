export const IMPORT_FORMATS = ["html", "markdown", "text", "docx"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const STRUCTURE_MODES = ["auto", "h1", "h2", "h3", "labels", "table"] as const;
export type StructureMode = (typeof STRUCTURE_MODES)[number];

/** The structure that actually produced the candidates; "none" when nothing recognisable was found. */
export type DetectedStructure = Exclude<StructureMode, "auto"> | "none";

export type WarningCode =
  | "IMAGES_OMITTED"
  | "RAW_HTML_REMOVED"
  | "UNSAFE_LINKS_REMOVED"
  | "NO_STRUCTURE"
  | "PREAMBLE_IGNORED"
  | "CANDIDATE_LIMIT";

export interface ImportWarning {
  code: WarningCode;
  message: string;
  count?: number;
}

export type CandidateProblem = "EMPTY_PROMPT" | "EMPTY_ANSWER" | "PROMPT_TOO_LONG" | "ANSWER_TOO_LONG";

export interface ImportCandidate {
  /** Zero-based position of the candidate in the source, stable across re-parses. */
  sourceIndex: number;
  title: string;
  promptMarkdown: string;
  answerMarkdown: string;
  problems: CandidateProblem[];
}

export interface ParseResult {
  format: ImportFormat;
  structure: DetectedStructure;
  candidates: ImportCandidate[];
  warnings: ImportWarning[];
}

export type ParseStage = "reading" | "converting" | "extracting";
