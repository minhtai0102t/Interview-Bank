import mammoth from "mammoth";

import { htmlToCanonicalMarkdown, type CanonicalMarkdown } from "./canonical";
import { ImportParseError } from "./errors";
import { preflightDocx } from "./zip";

/** Paragraph styles people use for source code; adjacent paragraphs merge into one block, one line each. */
const codeStyles = ["Code", "Source Code", "Preformatted Text", "HTML Preformatted"];
const styleMap = codeStyles.map((style) => `p[style-name='${style}'] => pre:separator('\\n')`);

/**
 * Images are never read. Each one becomes an empty <img>, which the HTML pipeline
 * removes and counts so the review screen can report that images were left out.
 */
const omitImages = mammoth.images.imgElement(async () => ({ src: "" }));

function toMammothInput(bytes: Uint8Array): Parameters<typeof mammoth.convertToHtml>[0] {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // The Node build of Mammoth reads `buffer` and the browser build reads `arrayBuffer`.
  // `Buffer` is looked up on globalThis so browser bundles do not pull in a polyfill.
  const nodeBuffer = (globalThis as { Buffer?: { from(data: ArrayBuffer): unknown } }).Buffer?.from(arrayBuffer);
  return { arrayBuffer, buffer: nodeBuffer } as unknown as Parameters<typeof mammoth.convertToHtml>[0];
}

export async function docxToCanonicalMarkdown(bytes: Uint8Array): Promise<CanonicalMarkdown> {
  preflightDocx(bytes);

  let html: string;
  try {
    const result = await mammoth.convertToHtml(toMammothInput(bytes), {
      styleMap,
      includeEmbeddedStyleMap: false,
      externalFileAccess: false,
      convertImage: omitImages,
    });
    html = result.value;
  } catch (error) {
    throw error instanceof ImportParseError ? error : new ImportParseError("INVALID_DOCX", { cause: error });
  }

  return htmlToCanonicalMarkdown(html);
}
