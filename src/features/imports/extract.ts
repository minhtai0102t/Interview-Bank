import type { PhrasingContent, Root, RootContent, Table } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import { type CanonicalMarkdown, gfmOptions, stringifyOptions } from "./canonical";
import { IMPORT_LIMITS } from "./limits";
import type { CandidateProblem, DetectedStructure, ImportCandidate, ImportWarning, StructureMode } from "./types";

export interface ExtractionResult {
  structure: DetectedStructure;
  candidates: ImportCandidate[];
  warnings: ImportWarning[];
}

export interface Draft {
  /** Called at most once, and only for questions that are kept, so questions beyond the limit cost nothing. */
  prompt: () => string;
  answer: () => string;
  /** Labels mode only: an explicit A: label was seen for this question. */
  answered?: boolean;
}

interface Extraction {
  drafts: Draft[];
  /** Content outside the detected questions that was left out. */
  ignored: boolean;
}

type ConcreteMode = Exclude<StructureMode, "auto">;

const parser = unified().use(remarkParse).use(remarkGfm, gfmOptions);
const serializer = unified().use(remarkStringify, stringifyOptions).use(remarkGfm, gfmOptions);
const encoder = new TextEncoder();

function serialize(nodes: RootContent[]): string {
  return serializer.stringify({ type: "root", children: nodes }).trim();
}

function serializeInline(children: PhrasingContent[]): string {
  return serialize([{ type: "paragraph", children }]);
}

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

function titleFrom(promptMarkdown: string): string {
  const firstBlock = parser.parse(promptMarkdown).children[0];
  if (firstBlock) {
    visit(firstBlock, "break", (_node, index, parent) => {
      if (parent && index !== undefined) parent.children[index] = { type: "text", value: " " };
    });
  }
  const text = (firstBlock ? toString(firstBlock) : "").replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  if (characters.length <= IMPORT_LIMITS.maxTitleChars) return text;
  return `${characters.slice(0, IMPORT_LIMITS.maxTitleChars - 1).join("").trimEnd()}…`;
}

const labelPattern = /^ {0,3}(?:\*\*|__)?(question|answer|q|a)(?:\s*\d{1,4})?(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?(.*)$/i;
const fencePattern = /^ {0,3}(`{3,}|~{3,})(.*)$/;

function fromLabels(markdown: string): Extraction {
  interface Pending {
    prompt: string[];
    answer: string[];
    answered: boolean;
  }

  const drafts: Draft[] = [];
  let current: Pending | undefined;
  let ignored = false;
  let fence: { character: string; length: number } | undefined;

  const flush = () => {
    if (!current) return;
    const { prompt, answer, answered } = current;
    drafts.push({
      prompt: () => prompt.join("\n").trim(),
      answer: () => answer.join("\n").trim(),
      answered,
    });
    current = undefined;
  };

  const append = (line: string) => {
    if (!current) {
      if (line.trim() !== "") ignored = true;
      return;
    }
    (current.answered ? current.answer : current.prompt).push(line);
  };

  for (const line of markdown.split("\n")) {
    const fenceMatch = fencePattern.exec(line);
    const marker = fenceMatch?.[1];

    if (fence) {
      if (marker && marker.startsWith(fence.character) && marker.length >= fence.length && fenceMatch?.[2]?.trim() === "") {
        fence = undefined;
      }
      append(line);
      continue;
    }

    if (marker) {
      fence = { character: marker.charAt(0), length: marker.length };
      append(line);
      continue;
    }

    const label = labelPattern.exec(line);
    const kind = label?.[1]?.charAt(0).toLowerCase();
    const rest = label?.[2] ?? "";

    if (kind === "q") {
      flush();
      current = { prompt: [rest], answer: [], answered: false };
    } else if (kind === "a" && current && !current.answered) {
      current.answered = true;
      current.answer.push(rest);
    } else {
      append(line);
    }
  }
  flush();

  return { drafts, ignored };
}

function fromHeadings(tree: Root, depth: 1 | 2 | 3): Extraction {
  const drafts: Draft[] = [];
  let ignored = false;
  let current: { question: PhrasingContent[]; body: RootContent[] } | undefined;

  const flush = () => {
    if (!current) return;
    const { question, body } = current;
    drafts.push({ prompt: () => serializeInline(question), answer: () => serialize(body) });
    current = undefined;
  };

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth <= depth) {
      flush();
      if (node.depth === depth) current = { question: node.children, body: [] };
    } else if (current) {
      current.body.push(node);
    } else {
      ignored = true;
    }
  }
  flush();

  return { drafts, ignored };
}

function columnIndex(table: Table, name: string): number {
  return table.children[0]?.children.findIndex((cell) => toString(cell).trim().toLowerCase() === name) ?? -1;
}

function fromTables(tree: Root): Extraction {
  const drafts: Draft[] = [];
  let ignored = false;

  for (const node of tree.children) {
    if (node.type === "heading") continue;

    const questionColumn = node.type === "table" ? columnIndex(node, "question") : -1;
    const answerColumn = node.type === "table" ? columnIndex(node, "answer") : -1;
    if (node.type !== "table" || questionColumn < 0 || answerColumn < 0) {
      ignored = true;
      continue;
    }

    for (const row of node.children.slice(1)) {
      const question = row.children[questionColumn]?.children ?? [];
      const answer = row.children[answerColumn]?.children ?? [];
      drafts.push({ prompt: () => serializeInline(question), answer: () => serializeInline(answer) });
    }
  }

  return { drafts, ignored };
}

const autoOrder: ReadonlyArray<{ mode: ConcreteMode; minimum: number }> = [
  { mode: "labels", minimum: 1 },
  { mode: "table", minimum: 1 },
  { mode: "h2", minimum: 1 },
  { mode: "h3", minimum: 1 },
  { mode: "h1", minimum: 2 },
];

function problemsFor(prompt: string, answer: string): CandidateProblem[] {
  const problems: CandidateProblem[] = [];
  if (prompt === "") problems.push("EMPTY_PROMPT");
  if (answer === "") problems.push("EMPTY_ANSWER");
  if (byteLength(prompt) > IMPORT_LIMITS.maxPromptBytes) problems.push("PROMPT_TOO_LONG");
  if (byteLength(answer) > IMPORT_LIMITS.maxAnswerBytes) problems.push("ANSWER_TOO_LONG");
  return problems;
}

/** Applies the candidate limit first, so only the questions that are kept are ever serialised or measured. */
export function buildCandidates(drafts: readonly Draft[]): { candidates: ImportCandidate[]; warnings: ImportWarning[] } {
  const kept = drafts.slice(0, IMPORT_LIMITS.maxCandidates);
  const candidates = kept.map((draft, sourceIndex): ImportCandidate => {
    const prompt = draft.prompt();
    const answer = draft.answer();
    return { sourceIndex, title: titleFrom(prompt), promptMarkdown: prompt, answerMarkdown: answer, problems: problemsFor(prompt, answer) };
  });

  const dropped = drafts.length - kept.length;
  const warnings: ImportWarning[] = [];
  if (dropped > 0) {
    warnings.push({
      code: "CANDIDATE_LIMIT",
      count: dropped,
      message: `Only the first ${IMPORT_LIMITS.maxCandidates} questions were kept; ${dropped} more were left out. Split the file to import the rest.`,
    });
  }

  return { candidates, warnings };
}

/** What extraction reads: the Markdown (for `Q:`/`A:` labels) and the tree it was written from (for headings and tables). */
export type ExtractionSource = Pick<CanonicalMarkdown, "markdown" | "tree">;

/** Finds question and answer pairs in canonical Markdown. */
export function extractCandidates({ markdown, tree }: ExtractionSource, mode: StructureMode = "auto"): ExtractionResult {
  const run = (concrete: ConcreteMode): Extraction => {
    switch (concrete) {
      case "labels":
        return fromLabels(markdown);
      case "table":
        return fromTables(tree);
      case "h1":
        return fromHeadings(tree, 1);
      case "h2":
        return fromHeadings(tree, 2);
      case "h3":
        return fromHeadings(tree, 3);
    }
  };

  let structure: DetectedStructure = "none";
  let extraction: Extraction = { drafts: [], ignored: false };

  if (mode === "auto") {
    for (const { mode: attempt, minimum } of autoOrder) {
      const found = run(attempt);
      const usable = attempt === "labels" ? found.drafts.some((draft) => draft.answered) : found.drafts.length >= minimum;
      if (usable) {
        structure = attempt;
        extraction = found;
        break;
      }
    }
  } else {
    const found = run(mode);
    if (found.drafts.length > 0) {
      structure = mode;
      extraction = found;
    }
  }

  const warnings: ImportWarning[] = [];
  if (structure === "none") {
    warnings.push({
      code: "NO_STRUCTURE",
      message: "No questions were recognised. Choose a different structure, or add Q:/A: labels or headings to the file.",
    });
    return { structure, candidates: [], warnings };
  }

  if (extraction.ignored) {
    warnings.push({ code: "PREAMBLE_IGNORED", message: "Text outside the recognised questions was ignored." });
  }

  const built = buildCandidates(extraction.drafts);
  warnings.push(...built.warnings);

  return { structure, candidates: built.candidates, warnings };
}
