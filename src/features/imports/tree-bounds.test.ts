import { describe, expect, it } from "vitest";

import { ImportParseError } from "./errors";
import { assertMarkupBounds, assertTreeBounds } from "./tree-bounds";

interface TestNode {
  type: string;
  children?: TestNode[];
}

function chain(depth: number): TestNode {
  let node: TestNode = { type: "text" };
  for (let level = 0; level < depth; level += 1) {
    node = { type: "element", children: [node] };
  }
  return { type: "root", children: [node] };
}

describe("assertTreeBounds", () => {
  it("accepts a tree within both limits", () => {
    expect(() => assertTreeBounds(chain(3), { maxDepth: 10, maxNodes: 10 })).not.toThrow();
  });

  it("rejects a tree deeper than the depth limit", () => {
    expect(() => assertTreeBounds(chain(20), { maxDepth: 10, maxNodes: 1000 })).toThrow(ImportParseError);
    try {
      assertTreeBounds(chain(20), { maxDepth: 10, maxNodes: 1000 });
    } catch (error) {
      expect((error as ImportParseError).code).toBe("CONTENT_TOO_COMPLEX");
    }
  });

  it("rejects a tree with more nodes than the node limit", () => {
    const wide: TestNode = { type: "root", children: Array.from({ length: 50 }, () => ({ type: "text" })) };

    expect(() => assertTreeBounds(wide, { maxDepth: 10, maxNodes: 20 })).toThrow(ImportParseError);
  });

  it("walks iteratively so a very deep tree is rejected instead of overflowing the stack", () => {
    expect(() => assertTreeBounds(chain(200_000), { maxDepth: 200, maxNodes: 1_000_000 })).toThrow(ImportParseError);
  });
});

describe("assertMarkupBounds", () => {
  it("accepts markup with exactly as many tags as the limit and rejects one more", () => {
    expect(() => assertMarkupBounds("<p>a</p>", 2)).not.toThrow();
    expect(() => assertMarkupBounds("<p>a</p>", 1)).toThrow(expect.objectContaining({ code: "CONTENT_TOO_COMPLEX" }));
  });

  it("counts opening tags, closing tags, comments, doctypes and processing instructions", () => {
    const html = "<a></a><!--c--><?x?><!DOCTYPE html>";

    expect(() => assertMarkupBounds(html, 5)).not.toThrow();
    expect(() => assertMarkupBounds(html, 4)).toThrow(ImportParseError);
  });

  it("does not count a less-than sign that is only text", () => {
    expect(() => assertMarkupBounds("1 < 2 <3 << 4 <", 0)).not.toThrow();
  });
});
