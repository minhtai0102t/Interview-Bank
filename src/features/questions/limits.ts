export const QUESTION_LIMITS = {
  maxTitleChars: 160,
  maxPromptBytes: 20 * 1024,
  maxAnswerBytes: 60 * 1024,
  maxTags: 8,
  maxTagChars: 40,
} as const;

/** Longest name shown next to a published question. */
export const MAX_ALIAS_CHARS = 40;
