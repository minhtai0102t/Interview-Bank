import { describe, expect, it } from "vitest";

import { ImportParseError } from "./errors";
import { htmlToCanonicalMarkdown, markdownToCanonicalMarkdown } from "./canonical";
import { IMPORT_LIMITS } from "./limits";
import type { ImportWarning } from "./types";

function warning(warnings: ImportWarning[], code: ImportWarning["code"]) {
  return warnings.find((candidate) => candidate.code === code);
}

describe("htmlToCanonicalMarkdown", () => {
  it("converts common content blocks to Markdown", () => {
    const { markdown } = htmlToCanonicalMarkdown(
      [
        "<h2>What is a closure?</h2>",
        "<p>A function with <strong>captured</strong> scope.</p>",
        "<ul><li>one</li><li>two</li></ul>",
        '<pre><code class="language-js">const a = 1;\n</code></pre>',
      ].join("\n"),
    );

    expect(markdown).toContain("## What is a closure?");
    expect(markdown).toContain("A function with **captured** scope.");
    expect(markdown).toContain("- one\n- two");
    expect(markdown).toContain("```js\nconst a = 1;\n```");
  });

  it("converts tables and keeps Unicode text", () => {
    const { markdown } = htmlToCanonicalMarkdown(
      "<table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody><tr><td>Qué es null?</td><td>Café ☕ 日本語</td></tr></tbody></table>",
    );

    expect(markdown).toContain("| Question | Answer |");
    expect(markdown).toContain("| Qué es null? | Café ☕ 日本語 |");
  });

  it("promotes the first row of a table without header cells instead of adding an empty header", () => {
    const { markdown } = htmlToCanonicalMarkdown(
      "<table><tr><td>Question</td><td>Answer</td></tr><tr><td>Q1</td><td>A1</td></tr></table>",
    );

    expect(markdown).toBe("| Question | Answer |\n| - | - |\n| Q1 | A1 |\n");
  });

  it("leaves a table that already has header cells unchanged", () => {
    const { markdown } = htmlToCanonicalMarkdown(
      "<table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody><tr><td>Q1</td><td>A1</td></tr><tr><td>Q2</td><td>A2</td></tr></tbody></table>",
    );

    expect(markdown).toBe("| Question | Answer |\n| - | - |\n| Q1 | A1 |\n| Q2 | A2 |\n");
  });

  it("removes scripts, styles, frames, embeds, forms, vector graphics, images and event handlers", () => {
    const { markdown, warnings } = htmlToCanonicalMarkdown(
      [
        "<p>Hello</p>",
        "<script>alert('xss-script')</script>",
        "<style>p { color: red }</style>",
        '<iframe src="https://evil.test/frame"></iframe>',
        '<object data="https://evil.test/object"></object>',
        '<img src="https://evil.test/p.png" alt="logo-alt">',
        '<form action="/x"><input name="q"><button>Go-button</button></form>',
        "<svg><circle/><text>svg-text</text></svg>",
        '<p onclick="boom()" style="color:red">World</p>',
      ].join(""),
    );

    expect(markdown).toBe("Hello\n\nWorld\n");
    expect(markdown).not.toMatch(/xss-script|evil\.test|logo-alt|Go-button|svg-text|boom/);
    expect(warning(warnings, "IMAGES_OMITTED")?.count).toBe(1);
  });

  it("keeps http, https and mailto links and unwraps every other link target", () => {
    const { markdown, warnings } = htmlToCanonicalMarkdown(
      [
        "<p>",
        '<a href="https://example.com/a?b=1">ok</a> ',
        '<a href="javascript:alert(1)">js-link</a> ',
        '<a href="  JaVaScRiPt:alert(1)">spaced-js-link</a> ',
        '<a href="data:text/html;base64,PHNjcmlwdD4=">data-link</a> ',
        '<a href="mailto:me@example.com">mail</a> ',
        '<a href="#frag">frag-link</a> ',
        '<a href="/relative">rel-link</a>',
        "</p>",
      ].join(""),
    );

    expect(markdown).toContain("[ok](https://example.com/a?b=1)");
    expect(markdown).toContain("[mail](mailto:me@example.com)");
    expect(markdown).toContain("js-link spaced-js-link data-link");
    expect(markdown).toContain("frag-link rel-link");
    expect(markdown).not.toMatch(/javascript:|data:text|\(#frag\)|\(\/relative\)/i);
    expect(warning(warnings, "UNSAFE_LINKS_REMOVED")?.count).toBe(4);
  });

  it("rejects documents nested deeper than the safety limit", () => {
    const html = `${"<div>".repeat(1000)}deep${"</div>".repeat(1000)}`;

    expect(() => htmlToCanonicalMarkdown(html)).toThrow(ImportParseError);
    expect(() => htmlToCanonicalMarkdown(html)).toThrow(expect.objectContaining({ code: "CONTENT_TOO_COMPLEX" }));
  });

  it("rejects a document with more tags than the markup limit before it is parsed", () => {
    // Plain paragraphs stay under the node limit and parse quickly, so only the markup guard can turn this away.
    const html = "<p>x</p>".repeat(IMPORT_LIMITS.maxMarkupTokens / 2 + 1);

    expect(() => htmlToCanonicalMarkdown(html)).toThrow(expect.objectContaining({ code: "CONTENT_TOO_COMPLEX" }));
  });
});

describe("markdownToCanonicalMarkdown", () => {
  it("normalizes headings, lists, tables, task lists and Unicode", () => {
    const { markdown, warnings } = markdownToCanonicalMarkdown(
      "## Qué es `null`?\r\n\r\n* one\r\n* two\r\n\r\n| a | b |\r\n|---|---|\r\n| 1 | 2 |\r\n\r\n- [x] done\r\n\r\nCafé ☕ 日本語\r\n",
    );

    expect(markdown).toContain("## Qué es `null`?");
    expect(markdown).toContain("- one\n- two");
    expect(markdown).toContain("| a | b |");
    expect(markdown).toContain("| 1 | 2 |");
    expect(markdown).toContain("- [x] done");
    expect(markdown).toContain("Café ☕ 日本語");
    expect(markdown).not.toContain("\r");
    expect(warnings).toEqual([]);
  });

  it("drops raw HTML, images and unsafe links but keeps their readable text and fenced code", () => {
    const { markdown, warnings } = markdownToCanonicalMarkdown(
      [
        "## Q",
        "",
        "<script>alert('xss-block')</script>",
        "",
        'Some <b onclick="x()">bold</b> text, ![logo-alt](https://evil.test/p.png), [bad](javascript:alert(1)) and [ok](https://example.com).',
        "",
        "<div>block-html</div>",
        "",
        "```html",
        "<script>keep()</script>",
        "```",
        "",
      ].join("\n"),
    );

    expect(markdown).toContain("Some bold text, , bad and [ok](https://example.com).");
    expect(markdown).toContain("```html\n<script>keep()</script>\n```");
    expect(markdown).not.toMatch(/xss-block|onclick|logo-alt|evil\.test|javascript:|block-html/);
    expect(warning(warnings, "RAW_HTML_REMOVED")?.count).toBe(4);
    expect(warning(warnings, "IMAGES_OMITTED")?.count).toBe(1);
    expect(warning(warnings, "UNSAFE_LINKS_REMOVED")?.count).toBe(1);
  });

  it("turns <br> into a line break instead of discarding it as raw HTML", () => {
    const { markdown, warnings } = markdownToCanonicalMarkdown("| a | b |\n|---|---|\n| one<br>two | x |\n");

    expect(markdown).not.toContain("<br");
    expect(markdown).toMatch(/one\\?\s*\n?two/);
    expect(warning(warnings, "RAW_HTML_REMOVED")).toBeUndefined();
  });

  it("removes link reference definitions with unsafe targets", () => {
    const { markdown, warnings } = markdownToCanonicalMarkdown("See [this][1] and [that][2].\n\n[1]: javascript:alert(1)\n[2]: https://example.com\n");

    expect(markdown).not.toContain("javascript:");
    expect(markdown).toContain("[2]: https://example.com");
    expect(warning(warnings, "UNSAFE_LINKS_REMOVED")?.count).toBe(1);
  });

  it("trims the spaces left at the edges of a heading, paragraph or table cell once an image or comment is removed", () => {
    const { markdown } = markdownToCanonicalMarkdown(
      [
        "## ![icon](x.png) What is X? ![icon](y.png)",
        "",
        "![diagram](d.png) The answer. <!-- note -->",
        "",
        "| Question | Answer |",
        "| --- | --- |",
        "| ![i](x.png) Why? | Because. <!-- c --> |",
        "| What? | <br> |",
        "",
      ].join("\n"),
    );

    expect(markdown).toBe(
      ["## What is X?", "", "The answer.", "", "| Question | Answer |", "| - | - |", "| Why? | Because. |", "| What? | |", ""].join("\n"),
    );
  });

  it("drops a line that holds only <br> instead of writing it out as a backslash", () => {
    const { markdown, warnings } = markdownToCanonicalMarkdown("## Q?\n\nLine one\n\n<br>\n\nLine two\n\n<br/>\n");

    expect(markdown).toBe("## Q?\n\nLine one\n\nLine two\n");
    expect(warning(warnings, "RAW_HTML_REMOVED")).toBeUndefined();
  });

  it("drops the spaces around a <br> inside a line", () => {
    const { markdown } = markdownToCanonicalMarkdown(
      ["## Q?", "", "line one <br> line two", "", "| a | b |", "| --- | --- |", "| one <br> two | x |", ""].join("\n"),
    );

    expect(markdown).toBe(["## Q?", "", "line one\\", "line two", "", "| a | b |", "| - | - |", "| one two | x |", ""].join("\n"));
  });

  it("rejects documents nested deeper than the safety limit", () => {
    expect(() => markdownToCanonicalMarkdown(`${">".repeat(500)} deep`)).toThrow(
      expect.objectContaining({ code: "CONTENT_TOO_COMPLEX" }),
    );
  });
});
