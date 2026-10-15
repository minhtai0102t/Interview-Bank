import { DomainError } from "@/lib/errors";

import { QUESTION_LIMITS } from "./limits";

export interface QuestionInput {
  title: string;
  promptMarkdown: string;
  answerMarkdown: string;
  topicId: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
}

const encoder = new TextEncoder();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIFFICULTIES = new Set<QuestionInput["difficulty"]>(["EASY", "MEDIUM", "HARD"]);

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function normalizeVisibleString(value: unknown, field: string, maxChars?: number): string {
  if (typeof value !== "string") invalid(`${field} must be a string.`);
  const normalized = value.trim();
  if (!/\S/.test(normalized)) invalid(`${field} is required.`);
  if (maxChars !== undefined && normalized.length > maxChars) invalid(`${field} is too long.`);
  return normalized;
}

function normalizeMarkdown(value: unknown, field: string, maxBytes: number, required: boolean): string {
  if (typeof value !== "string") invalid(`${field} must be a string.`);
  const normalized = value.trim();
  if (required && !/\S/.test(normalized)) invalid(`${field} is required.`);
  if (byteLength(normalized) > maxBytes) invalid(`${field} is too large.`);
  return normalized;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) invalid("tags must be an array.");
  if (value.length > QUESTION_LIMITS.maxTags) invalid("Too many tags.");

  const tags = value.map((tag) => {
    if (typeof tag !== "string") invalid("tags must only contain text.");
    const normalized = tag.trim().toLowerCase();
    if (!/\S/.test(normalized)) invalid("Tags must be visible text.");
    if (normalized.length > QUESTION_LIMITS.maxTagChars) invalid("A tag is too long.");
    return normalized;
  });

  if (new Set(tags).size !== tags.length) invalid("Tags must be unique.");
  return tags;
}

export function parseQuestionInput(source: unknown, options: { requireAnswer?: boolean } = {}): QuestionInput {
  if (!source || typeof source !== "object") invalid("Question input is required.");

  const input = source as Partial<QuestionInput>;
  const topicId = typeof input.topicId === "string" ? input.topicId.trim() : "";
  if (!UUID_PATTERN.test(topicId)) invalid("topicId must be a UUID.");
  if (!DIFFICULTIES.has(input.difficulty as QuestionInput["difficulty"])) {
    invalid("difficulty must be EASY, MEDIUM or HARD.");
  }

  return {
    title: normalizeVisibleString(input.title, "title", QUESTION_LIMITS.maxTitleChars),
    promptMarkdown: normalizeMarkdown(input.promptMarkdown, "promptMarkdown", QUESTION_LIMITS.maxPromptBytes, true),
    answerMarkdown: normalizeMarkdown(
      input.answerMarkdown,
      "answerMarkdown",
      QUESTION_LIMITS.maxAnswerBytes,
      options.requireAnswer ?? false,
    ),
    topicId,
    difficulty: input.difficulty as QuestionInput["difficulty"],
    tags: normalizeTags(input.tags),
  };
}