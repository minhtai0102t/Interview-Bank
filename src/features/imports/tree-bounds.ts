import { ImportParseError } from "./errors";
import { IMPORT_LIMITS } from "./limits";

interface TreeNode {
  type: string;
  children?: readonly TreeNode[];
}

export interface TreeBounds {
  maxDepth: number;
  maxNodes: number;
}

const defaultBounds: TreeBounds = {
  maxDepth: IMPORT_LIMITS.maxTreeDepth,
  maxNodes: IMPORT_LIMITS.maxTreeNodes,
};

/**
 * Rejects syntax trees that are too deep or too large. It walks with an explicit stack so a hostile
 * document is refused cleanly instead of overflowing the call stack in a recursive tree utility.
 */
export function assertTreeBounds(root: TreeNode, bounds: TreeBounds = defaultBounds): void {
  const stack: Array<{ node: TreeNode; depth: number }> = [{ node: root, depth: 1 }];
  let nodes = 0;

  for (let entry = stack.pop(); entry; entry = stack.pop()) {
    nodes += 1;
    if (nodes > bounds.maxNodes || entry.depth > bounds.maxDepth) {
      throw new ImportParseError("CONTENT_TOO_COMPLEX");
    }
    for (const child of entry.node.children ?? []) {
      stack.push({ node: child, depth: entry.depth + 1 });
    }
  }
}

/** True for the characters that can follow `<` to begin a tag, a closing tag, a comment, a doctype or a processing instruction. */
function startsMarkup(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 47 || code === 33 || code === 63;
}

/**
 * Rejects HTML with more tags than the limit. Parsing time and memory grow with the number of tags more than
 * with the number of bytes, so they are counted with a cheap scan before any parser sees the text.
 */
export function assertMarkupBounds(html: string, maxTokens: number = IMPORT_LIMITS.maxMarkupTokens): void {
  let tokens = 0;
  for (let at = html.indexOf("<"); at !== -1; at = html.indexOf("<", at + 1)) {
    if (!startsMarkup(html.charCodeAt(at + 1))) continue;
    tokens += 1;
    if (tokens > maxTokens) throw new ImportParseError("CONTENT_TOO_COMPLEX");
  }
}
