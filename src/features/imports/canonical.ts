import type { Element, Root as HastRoot } from "hast";
import type { Nodes, Root as MdastRoot } from "mdast";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

import { ImportParseError } from "./errors";
import { IMPORT_LIMITS } from "./limits";
import { assertMarkupBounds, assertTreeBounds } from "./tree-bounds";
import type { ImportWarning } from "./types";

export interface CanonicalMarkdown {
  markdown: string;
  /** The tree `markdown` was written from. Reading questions from it avoids parsing the text a second time. */
  tree: MdastRoot;
  warnings: ImportWarning[];
}

interface Removals {
  images: number;
  links: number;
  html: number;
}

export const stringifyOptions = {
  bullet: "-",
  emphasis: "*",
  strong: "*",
  fences: true,
  listItemIndent: "one",
  rule: "-",
  setext: false,
} as const;

export const gfmOptions = { tablePipeAlign: false, tableCellPadding: true } as const;

/** Elements whose content is never wanted, removed together with their children. */
const removedElements = new Set([
  "script", "style", "noscript", "template", "iframe", "frame", "frameset", "object", "embed", "applet",
  "form", "input", "button", "select", "textarea", "svg", "math", "img", "picture", "video", "audio",
  "source", "track", "canvas", "link", "meta", "base", "head", "title",
]);

const imageElements = new Set(["img", "picture"]);

const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "ul", "ol", "li", "blockquote", "pre", "code",
    "em", "strong", "b", "i", "s", "del", "a", "table", "thead", "tbody", "tr", "th", "td",
  ],
  attributes: {
    a: ["href"],
    code: [["className", /^language-[\w+#.-]+$/]],
    ol: ["start"],
    th: ["align"],
    td: ["align"],
  },
  protocols: { href: ["http", "https", "mailto"] },
  strip: [...removedElements],
  clobber: [],
  clobberPrefix: "",
};

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function isAllowedHref(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

/** In-page anchors are routine in Word and web documents, so they are unwrapped without a warning. */
function isFragment(href: string): boolean {
  return href.trim().startsWith("#");
}

function replaceChild(parent: { children: unknown[] }, index: number, replacement: unknown[]): void {
  parent.children.splice(index, 1, ...replacement);
}

/**
 * GFM tables always have a header row. Tables from Word and many web pages have no
 * header cells, so the first row is promoted instead of being replaced by an empty one.
 */
function promoteFirstRowToHeader(table: Element): void {
  let hasHeaderCell = false;
  let firstRow: Element | undefined;
  visit(table, "element", (node: Element) => {
    if (node.tagName === "th") hasHeaderCell = true;
    if (node.tagName === "tr") firstRow ??= node;
  });
  if (hasHeaderCell || !firstRow) return;

  for (const cell of firstRow.children) {
    if (cell.type === "element" && cell.tagName === "td") cell.tagName = "th";
  }
}

function warningsFrom(removals: Removals): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  if (removals.images > 0) {
    warnings.push({
      code: "IMAGES_OMITTED",
      count: removals.images,
      message: `${removals.images} image${removals.images === 1 ? " was" : "s were"} not imported.`,
    });
  }
  if (removals.html > 0) {
    warnings.push({
      code: "RAW_HTML_REMOVED",
      count: removals.html,
      message: `Raw HTML was removed in ${removals.html} place${removals.html === 1 ? "" : "s"}.`,
    });
  }
  if (removals.links > 0) {
    warnings.push({
      code: "UNSAFE_LINKS_REMOVED",
      count: removals.links,
      message: `${removals.links} link${removals.links === 1 ? " was" : "s were"} replaced by plain text because the target is not http, https or mailto.`,
    });
  }
  return warnings;
}

function toImportError(error: unknown): ImportParseError {
  if (error instanceof ImportParseError) return error;
  // A call stack overflow means the document was nested far deeper than any real question bank.
  if (error instanceof RangeError) return new ImportParseError("CONTENT_TOO_COMPLEX", { cause: error });
  return new ImportParseError("PARSE_FAILED", { cause: error });
}

const leadingSpace = /^[ \t\r\n]+/;
const trailingSpace = /[ \t\r\n]+$/;

/** CommonMark ignores spaces on either side of a hard break, so a `<br>` written with spaces around it should too. */
function trimAroundBreaks(children: Nodes[]): void {
  children.forEach((child, index) => {
    if (child.type !== "break") return;
    const before = children[index - 1];
    if (before?.type === "text") before.value = before.value.replace(trailingSpace, "");
    const after = children[index + 1];
    if (after?.type === "text") after.value = after.value.replace(leadingSpace, "");
  });
}

/** Spaces and line breaks at either end of a line of text are not content. */
function trimEdges(children: Nodes[]): void {
  for (let first = children[0]; first?.type === "break" || first?.type === "text"; first = children[0]) {
    if (first.type === "text") {
      first.value = first.value.replace(leadingSpace, "");
      if (first.value !== "") break;
    }
    children.shift();
  }
  for (let last = children.at(-1); last?.type === "break" || last?.type === "text"; last = children.at(-1)) {
    if (last.type === "text") {
      last.value = last.value.replace(trailingSpace, "");
      if (last.value !== "") break;
    }
    children.pop();
  }
}

/**
 * Removing an image or raw HTML, or writing a `<br>` with spaces around it, can leave spaces at the edge of a heading,
 * paragraph or table cell or beside a line break, and web editors write an empty cell as a line break. Written out,
 * those would become `&#x20;` or a stray backslash.
 */
function tidyInline(tree: MdastRoot): void {
  visit(tree, (node) => {
    if (!("children" in node)) return;
    trimAroundBreaks(node.children);
    if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") trimEdges(node.children);
  });
}

export function htmlToCanonicalMarkdown(html: string): CanonicalMarkdown {
  const removals: Removals = { images: 0, links: 0, html: 0 };

  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(() => (tree: HastRoot) => {
      assertTreeBounds(tree);
    })
    .use(() => (tree: HastRoot) => {
      visit(tree, "element", (node: Element, index, parent) => {
        if (!parent || index === undefined) return;

        if (removedElements.has(node.tagName)) {
          if (imageElements.has(node.tagName)) removals.images += 1;
          parent.children.splice(index, 1);
          return [SKIP, index];
        }

        if (node.tagName === "table") promoteFirstRowToHeader(node);

        if (node.tagName === "a") {
          const href = typeof node.properties.href === "string" ? node.properties.href : undefined;
          if (href === undefined || !isAllowedHref(href)) {
            if (href !== undefined && !isFragment(href)) removals.links += 1;
            replaceChild(parent, index, node.children);
            return index;
          }
        }
        return undefined;
      });
    })
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeRemark)
    .use(remarkGfm, gfmOptions)
    .use(remarkStringify, stringifyOptions);

  try {
    assertMarkupBounds(html);
    const tree = processor.runSync(processor.parse(normalizeText(html)));
    tidyInline(tree);
    return { markdown: processor.stringify(tree), tree, warnings: warningsFrom(removals) };
  } catch (error) {
    throw toImportError(error);
  }
}

const lineBreakHtml = /^<br\s*\/?>$/i;

/** Where HTML is a block of its own rather than part of a line of text. */
const blockParents = new Set<string>(["root", "blockquote", "listItem", "footnoteDefinition"]);

const markdownProcessor = unified().use(remarkParse).use(remarkGfm, gfmOptions).use(remarkStringify, stringifyOptions);

function removeUnsafeMarkdown(tree: MdastRoot, removals: Removals): void {
  visit(tree, (node, index, parent) => {
    if (!parent || index === undefined) return;

    switch (node.type) {
      case "html":
        if (lineBreakHtml.test(node.value.trim())) {
          // On a line of its own a `<br>` is only spacing; a line break has no place between blocks.
          replaceChild(parent, index, blockParents.has(parent.type) ? [] : [{ type: "break" }]);
        } else {
          removals.html += 1;
          replaceChild(parent, index, []);
        }
        return [SKIP, index];
      case "image":
      case "imageReference":
        removals.images += 1;
        replaceChild(parent, index, []);
        return [SKIP, index];
      case "link":
        if (!isAllowedHref(node.url)) {
          if (!isFragment(node.url)) removals.links += 1;
          replaceChild(parent, index, node.children);
          return index;
        }
        return undefined;
      case "definition":
        if (!isAllowedHref(node.url)) {
          if (!isFragment(node.url)) removals.links += 1;
          replaceChild(parent, index, []);
          return [SKIP, index];
        }
        return undefined;
      default:
        return undefined;
    }
  });
}

export function markdownToCanonicalMarkdown(markdown: string): CanonicalMarkdown {
  const removals: Removals = { images: 0, links: 0, html: 0 };

  try {
    // Parsing time and memory grow with the amount of text, so a file beyond the limit is turned away unread.
    if (markdown.length > IMPORT_LIMITS.maxTextChars) throw new ImportParseError("TEXT_TOO_LARGE");
    const tree = markdownProcessor.parse(normalizeText(markdown));
    assertTreeBounds(tree);
    removeUnsafeMarkdown(tree, removals);
    tidyInline(tree);
    return { markdown: markdownProcessor.stringify(tree), tree, warnings: warningsFrom(removals) };
  } catch (error) {
    throw toImportError(error);
  }
}
