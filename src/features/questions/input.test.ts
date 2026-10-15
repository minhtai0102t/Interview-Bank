import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";

import { QUESTION_LIMITS } from "./limits";
import { parseQuestionInput } from "./input";

const validInput = {
  title: "What is a closure?",
  promptMarkdown: "Explain what a closure is.",
  answerMarkdown: "A function together with the scope it was created in.",
  topicId: "0199e9ff-92c1-7f25-93b2-5d0460f2f2bf",
  difficulty: "MEDIUM",
  tags: ["javascript", "functions"],
};

describe("parseQuestionInput", () => {
  it("accepts a complete valid question", () => {
    expect(parseQuestionInput(validInput)).toEqual(validInput);
  });

  it("rejects a blank title", () => {
    expect(() => parseQuestionInput({ ...validInput, title: "  \n " })).toThrow(DomainError);
  });

  it("counts UTF-8 bytes for prompt and answer", () => {
    expect(() =>
      parseQuestionInput({
        ...validInput,
        promptMarkdown: "é".repeat(QUESTION_LIMITS.maxPromptBytes / 2 + 1),
      }),
    ).toThrow(DomainError);

    expect(() =>
      parseQuestionInput({
        ...validInput,
        answerMarkdown: "界".repeat(Math.floor(QUESTION_LIMITS.maxAnswerBytes / 3) + 1),
      }),
    ).toThrow(DomainError);
  });

  it("rejects an invalid difficulty and topic id", () => {
    expect(() => parseQuestionInput({ ...validInput, difficulty: "BRUTAL" })).toThrow(DomainError);
    expect(() => parseQuestionInput({ ...validInput, topicId: "topic-1" })).toThrow(DomainError);
  });

  it("normalizes tags and rejects duplicates or too many", () => {
    expect(parseQuestionInput({ ...validInput, tags: ["  JavaScript  ", "Functions"] }).tags).toEqual([
      "javascript",
      "functions",
    ]);

    expect(() => parseQuestionInput({ ...validInput, tags: ["javascript", " JavaScript "] })).toThrow(DomainError);
    expect(() =>
      parseQuestionInput({
        ...validInput,
        tags: Array.from({ length: QUESTION_LIMITS.maxTags + 1 }, (_, index) => `tag-${index}`),
      }),
    ).toThrow(DomainError);
  });
});