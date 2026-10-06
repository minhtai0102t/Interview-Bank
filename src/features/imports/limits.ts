import { QUESTION_LIMITS } from "@/features/questions/limits";

export const IMPORT_LIMITS = {
  /** What a question may hold; an imported candidate must fit the same limits as one written by hand. */
  ...QUESTION_LIMITS,
  maxFileBytes: 10 * 1024 * 1024,
  /** Characters in a Markdown or plain text file. Reading time and memory grow with the amount of text. */
  maxTextChars: 2 * 1024 * 1024,
  maxDocxExpandedBytes: 20 * 1024 * 1024,
  /**
   * Unpacked size of a Word file's XML parts, which are turned into trees many times their size. Measured on a
   * development machine: densely formatted XML of 2.9 MiB peaked near 730 MB, and 4.9 MiB near 1.1 GB.
   */
  maxDocxXmlBytes: 3 * 1024 * 1024,
  maxZipEntries: 2048,
  /**
   * Places where markup starts in an HTML document, counted before the document is parsed. Conversion time and
   * memory grow with the number of tags (measured on a development machine: 128,000 tags took 4 to 14 seconds
   * and about 500 MB), so 100,000 keeps a normal document well inside the time limit.
   */
  maxMarkupTokens: 100_000,
  maxCandidates: 1000,
  maxTreeDepth: 200,
  maxTreeNodes: 500_000,
  workerTimeoutMs: 15_000,
} as const;
