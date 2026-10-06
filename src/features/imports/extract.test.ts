import { readFileSync } from "node:fs";

import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it, vi } from "vitest";

import { gfmOptions, htmlToCanonicalMarkdown, markdownToCanonicalMarkdown } from "./canonical";
import { buildCandidates, extractCandidates as extractFromSource } from "./extract";
import { IMPORT_LIMITS } from "./limits";
import { STRUCTURE_MODES, type StructureMode } from "./types";

const markdownParser = unified().use(remarkParse).use(remarkGfm, gfmOptions);

/** Most tests describe a document as Markdown text, so this parses it the way the importer's first stage does. */
const extractCandidates = (markdown: string, mode?: StructureMode) =>
  extractFromSource({ markdown, tree: markdownParser.parse(markdown) }, mode);

describe("labels structure", () => {
  it("extracts Q:/A: pairs", () => {
    const result = extractCandidates(
      "Q: What is a closure?\nA: A function bundled with its lexical scope.\n\nQ: What is hoisting?\nA: Declarations are moved to the top.\n",
      "auto",
    );

    expect(result.structure).toBe("labels");
    expect(result.candidates).toEqual([
      {
        sourceIndex: 0,
        title: "What is a closure?",
        promptMarkdown: "What is a closure?",
        answerMarkdown: "A function bundled with its lexical scope.",
        problems: [],
      },
      {
        sourceIndex: 1,
        title: "What is hoisting?",
        promptMarkdown: "What is hoisting?",
        answerMarkdown: "Declarations are moved to the top.",
        problems: [],
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("accepts Question:/Answer:, bold labels, lowercase labels and numbering", () => {
    const result = extractCandidates(
      "**Q:** Bold label?\n**A:** Yes.\n\nQuestion 2: Long label?\nAnswer 2: Yes.\n\nq: lowercase?\na: yes\n",
      "auto",
    );

    expect(result.candidates.map((candidate) => [candidate.promptMarkdown, candidate.answerMarkdown])).toEqual([
      ["Bold label?", "Yes."],
      ["Long label?", "Yes."],
      ["lowercase?", "yes"],
    ]);
  });

  it("keeps multi-line answers and ignores markers inside fenced code", () => {
    const markdown = [
      "Q: Explain the output",
      "A: It prints:",
      "",
      "```",
      "Q: not a question",
      "A: not an answer",
      "```",
      "",
      "Second paragraph.",
      "",
      "Q: Next",
      "A: Done",
      "",
    ].join("\n");

    const result = extractCandidates(markdown, "labels");

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.answerMarkdown).toBe(
      "It prints:\n\n```\nQ: not a question\nA: not an answer\n```\n\nSecond paragraph.",
    );
    expect(result.candidates[1]).toMatchObject({ promptMarkdown: "Next", answerMarkdown: "Done" });
  });

  it("flags a question without an answer instead of dropping it", () => {
    const result = extractCandidates("Q: Lonely question\n\nQ: Second\nA: yes\n", "labels");

    expect(result.candidates[0]).toMatchObject({ promptMarkdown: "Lonely question", answerMarkdown: "", problems: ["EMPTY_ANSWER"] });
    expect(result.candidates[1]?.problems).toEqual([]);
  });

  it("warns when text before the first question is ignored", () => {
    const result = extractCandidates("Some intro text.\n\nQ: One\nA: Uno\n", "labels");

    expect(result.candidates).toHaveLength(1);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["PREAMBLE_IGNORED"]);
  });

  it("does not treat a lone answer label as a structure in auto mode", () => {
    const result = extractCandidates("Q: Only a question here\n\nNothing else.\n", "auto");

    expect(result.structure).toBe("none");
    expect(result.candidates).toEqual([]);
  });
});

describe("heading structure", () => {
  const document = [
    "# Interview Questions",
    "",
    "Intro text.",
    "",
    "## What does `let` do?",
    "",
    "Declares a block-scoped variable.",
    "",
    "### Example",
    "",
    "```js",
    "## not a heading",
    "let a = 1;",
    "```",
    "",
    "## What is hoisting?",
    "",
    "Declarations move to the top.",
    "",
  ].join("\n");

  it("uses H2 sections in auto mode and keeps deeper headings inside the answer", () => {
    const result = extractCandidates(document, "auto");

    expect(result.structure).toBe("h2");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      title: "What does let do?",
      promptMarkdown: "What does `let` do?",
      problems: [],
    });
    expect(result.candidates[0]?.answerMarkdown).toBe(
      "Declares a block-scoped variable.\n\n### Example\n\n```js\n## not a heading\nlet a = 1;\n```",
    );
    expect(result.candidates[1]).toMatchObject({ promptMarkdown: "What is hoisting?", answerMarkdown: "Declarations move to the top." });
    expect(result.warnings.map((warning) => warning.code)).toEqual(["PREAMBLE_IGNORED"]);
  });

  it("honours an explicitly chosen heading level", () => {
    const text = "## Section\n\n### Q one\n\nAnswer one.\n\n### Q two\n\nAnswer two.\n";

    expect(extractCandidates(text, "h3").candidates.map((candidate) => candidate.promptMarkdown)).toEqual(["Q one", "Q two"]);
    expect(extractCandidates(text, "auto").structure).toBe("h2");
    expect(extractCandidates(text, "h1")).toMatchObject({ structure: "none", candidates: [] });
  });

  it("falls back to H3 when there are no H2 sections", () => {
    const result = extractCandidates("### One\n\nUno.\n\n### Two\n\nDos.\n", "auto");

    expect(result.structure).toBe("h3");
    expect(result.candidates).toHaveLength(2);
  });

  it("needs at least two H1 sections before auto mode treats H1 as questions", () => {
    expect(extractCandidates("# Only a title\n\nSome text.\n", "auto").structure).toBe("none");
    expect(extractCandidates("# One\n\nUno.\n\n# Two\n\nDos.\n", "auto").structure).toBe("h1");
  });

  it("reports that no structure was found", () => {
    const result = extractCandidates("Just a paragraph of prose without any structure.\n", "auto");

    expect(result.structure).toBe("none");
    expect(result.candidates).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["NO_STRUCTURE"]);
  });
});

describe("table structure", () => {
  it("uses rows of a table headed Question and Answer", () => {
    const result = extractCandidates(
      "| Topic | Answer | Question |\n| - | - | - |\n| js | It is **Y**. | What is X? |\n| js | Something `else`. | What is Z? |\n",
      "auto",
    );

    expect(result.structure).toBe("table");
    expect(result.candidates.map((candidate) => [candidate.promptMarkdown, candidate.answerMarkdown])).toEqual([
      ["What is X?", "It is **Y**."],
      ["What is Z?", "Something `else`."],
    ]);
  });

  it("ignores tables without Question and Answer headers", () => {
    const result = extractCandidates("| a | b |\n| - | - |\n| 1 | 2 |\n", "table");

    expect(result.structure).toBe("none");
    expect(result.candidates).toEqual([]);
  });

  it("treats a cell that holds only a line break as empty, the way web editors write empty cells", () => {
    const { markdown, tree } = htmlToCanonicalMarkdown(
      "<table><tr><td>Question</td><td>Answer</td></tr><tr><td>What is X?</td><td><br></td></tr><tr><td><br></td><td>Because.</td></tr></table>",
    );

    const result = extractFromSource({ markdown, tree }, "table");

    expect(result.candidates.map((candidate) => [candidate.promptMarkdown, candidate.answerMarkdown, candidate.problems])).toEqual([
      ["What is X?", "", ["EMPTY_ANSWER"]],
      ["", "Because.", ["EMPTY_PROMPT"]],
    ]);
  });

  it("drops a line break at the start or end of a cell or heading", () => {
    const cells = htmlToCanonicalMarkdown(
      "<table><tr><td>Question</td><td>Answer</td></tr><tr><td><br>Tom &amp; Jerry<br></td><td>Mouse.</td></tr></table>",
    );
    const heading = markdownToCanonicalMarkdown("## What is X?<br>\n\nAnswer.\n");

    expect(extractFromSource(cells, "table").candidates[0]).toMatchObject({ promptMarkdown: "Tom & Jerry", answerMarkdown: "Mouse." });
    expect(extractFromSource(heading, "h2").candidates[0]).toMatchObject({ promptMarkdown: "What is X?", answerMarkdown: "Answer." });
  });

  it("keeps a line break inside a cell as a line break in the answer", () => {
    const source = htmlToCanonicalMarkdown(
      "<table><tr><td>Question</td><td>Answer</td></tr><tr><td>Steps?</td><td>Step 1<br>Step 2</td></tr></table>",
    );

    expect(extractFromSource(source, "table").candidates[0]?.answerMarkdown).toBe("Step 1\\\nStep 2");
  });
});

describe("limits and problems", () => {
  it("stops at the candidate limit and says so", () => {
    const markdown = Array.from({ length: 1001 }, (_, index) => `Q: Question ${index}\nA: Answer ${index}\n`).join("\n");

    const result = extractCandidates(markdown, "auto");

    expect(result.candidates).toHaveLength(1000);
    expect(result.candidates[999]?.sourceIndex).toBe(999);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "CANDIDATE_LIMIT", count: 1 }));
  });

  it("measures prompt and answer sizes in UTF-8 bytes", () => {
    const longAnswer = extractCandidates(`Q: q\nA: ${"é".repeat(31_000)}\n`, "labels");
    const longPrompt = extractCandidates(`Q: ${"y".repeat(20 * 1024 + 1)}\nA: a\n`, "labels");

    expect(longAnswer.candidates[0]?.problems).toEqual(["ANSWER_TOO_LONG"]);
    expect(longPrompt.candidates[0]?.problems).toEqual(["PROMPT_TOO_LONG"]);
  });

  it("truncates long titles at 160 code points without splitting characters", () => {
    const result = extractCandidates(`Q: ${"😀".repeat(200)}\nA: a\n`, "labels");
    const title = result.candidates[0]?.title ?? "";

    expect(Array.from(title)).toHaveLength(160);
    expect(title.endsWith("…")).toBe(true);
    expect(title.isWellFormed()).toBe(true);
  });

  it("keeps the words on either side of a line break apart in the title", () => {
    const result = extractCandidates("Q: Part one\\\npart two?\nA: Because.\n", "labels");

    expect(result.candidates[0]?.title).toBe("Part one part two?");
  });
});

describe("buildCandidates", () => {
  it("only reads the questions it keeps", () => {
    const prompt = vi.fn(() => "A question");
    const answer = vi.fn(() => "An answer");
    const drafts = Array.from({ length: IMPORT_LIMITS.maxCandidates + 100 }, () => ({ prompt, answer }));

    const { candidates, warnings } = buildCandidates(drafts);

    expect(candidates).toHaveLength(IMPORT_LIMITS.maxCandidates);
    expect(prompt).toHaveBeenCalledTimes(IMPORT_LIMITS.maxCandidates);
    expect(answer).toHaveBeenCalledTimes(IMPORT_LIMITS.maxCandidates);
    expect(warnings).toEqual([
      {
        code: "CANDIDATE_LIMIT",
        count: 100,
        message: "Only the first 1000 questions were kept; 100 more were left out. Split the file to import the rest.",
      },
    ]);
  });
});

describe("syntax tree", () => {
  it("reads headings from the tree it is given, not from the Markdown text", () => {
    const tree: Root = {
      type: "root",
      children: [
        { type: "heading", depth: 2, children: [{ type: "text", value: "From the tree?" }] },
        { type: "paragraph", children: [{ type: "text", value: "Yes." }] },
      ],
    };

    const result = extractFromSource({ markdown: "This text is never read as Markdown.", tree }, "h2");

    expect(result.candidates).toMatchObject([{ promptMarkdown: "From the tree?", answerMarkdown: "Yes." }]);
  });
});

const fixture = (name: string) => readFileSync(new URL(`../../../tests/fixtures/imports/${name}`, import.meta.url), "utf8");

const sectionsHtml = [
  '<h1>Front-end questions</h1><p>Intro with <a href="https://example.com">a link</a>.</p>',
  "<h2>What does <code>let</code> do?</h2><p>Declares a <strong>block-scoped</strong> variable &amp; more.</p>",
  "<ul><li>one</li><li>two <em>nested</em><ul><li>deep</li></ul></li></ul>",
  '<pre><code class="language-js">const a = 1; // ## not a heading\nQ: not a label</code></pre>',
  "<h2>Compare</h2><table><tr><td>Question</td><td>Answer</td></tr><tr><td>What is X?</td><td>It is <b>Y</b>.</td></tr></table>",
  "<h3>Detail</h3><blockquote><p>quoted *text* with [brackets] and snake_case_names</p></blockquote><ol><li>first</li><li>second</li></ol>",
].join("\n");

const everythingMarkdown = [
  "# Interview Questions",
  "",
  "Intro text with a [link](https://example.com).",
  "",
  "## What does `let` do?",
  "",
  "Declares a **block-scoped** variable & more.",
  "",
  "* one",
  "* two",
  "  * nested *emphasis*",
  "",
  "```js",
  "## not a heading",
  "Q: not a label",
  "```",
  "",
  "| Question | Answer |",
  "| --- | --- |",
  "| What is X? | It is **Y**. |",
  "",
  "### Detail",
  "",
  "1. first",
  "2. second",
  "",
  "> quoted text",
  "",
  "# Second part",
  "",
  "Closing words.",
  "",
  "Q: A labelled question?",
  "A: A labelled answer.",
  "",
  "Escapes: 1\\. not a list, \\# not a heading, a\\*b\\*c, hard break  ",
  "next line",
  "",
].join("\n");

const converted = {
  "HTML sections with lists, code, quotes and a table": htmlToCanonicalMarkdown(sectionsHtml),
  "HTML fixture": htmlToCanonicalMarkdown(fixture("javascript-questions.html")),
  "Markdown with every structure": markdownToCanonicalMarkdown(everythingMarkdown),
  "Markdown fixture": markdownToCanonicalMarkdown(fixture("database-questions.md")),
  "text fixture": markdownToCanonicalMarkdown(fixture("networking-questions.txt")),
};

describe.each(Object.entries(converted))("%s", (_name, { markdown, tree }) => {
  it("finds questions to compare", () => {
    expect(extractCandidates(markdown, "auto").candidates.length).toBeGreaterThan(0);
  });

  it.each(STRUCTURE_MODES)("reads the same questions from the converted tree as from parsing its Markdown again (%s)", (mode) => {
    expect(tree.type).toBe("root");
    expect(extractFromSource({ markdown, tree }, mode)).toEqual(extractCandidates(markdown, mode));
  });
});
