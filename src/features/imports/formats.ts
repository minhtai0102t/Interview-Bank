import type { ImportFormat } from "./types";

const formatByExtension = new Map<string, ImportFormat>([
  [".html", "html"],
  [".htm", "html"],
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".txt", "text"],
  [".docx", "docx"],
]);

/**
 * Decides how to read a file from its extension; the file's content is never trusted to name its own type.
 * Kept free of heavy imports so the page can use it without loading the parsers.
 */
export function formatFromFileName(fileName: string): ImportFormat | undefined {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? undefined : formatByExtension.get(fileName.slice(dot).toLowerCase());
}
