import { Inflate } from "fflate";

import { ImportParseError } from "./errors";
import { IMPORT_LIMITS } from "./limits";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

const END_RECORD_BYTES = 22;
const CENTRAL_HEADER_BYTES = 46;
const LOCAL_HEADER_BYTES = 30;
const MAX_COMMENT_BYTES = 0xffff;
/** Compressed input is fed in small slices so one push can never expand into an unbounded buffer. */
const INFLATE_SLICE_BYTES = 8 * 1024;

const FLAG_ENCRYPTED = 0x0001;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const FLAG_MASKED_HEADERS = 0x2000;
const ENCRYPTION_FLAGS = FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION | FLAG_MASKED_HEADERS;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;

const MAIN_DOCUMENT = "word/document.xml";
/** Parts that are read as XML and turned into trees, as opposed to pictures and other binary content. */
const XML_PART = /\.(?:xml|rels)$/i;

interface EndRecord {
  offset: number;
  entryCount: number;
  centralSize: number;
  centralOffset: number;
}

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const invalid = () => new ImportParseError("INVALID_DOCX");

function findEndRecord(view: DataView): EndRecord {
  const length = view.byteLength;
  if (length < END_RECORD_BYTES) throw invalid();

  const lowest = Math.max(0, length - END_RECORD_BYTES - MAX_COMMENT_BYTES);
  for (let offset = length - END_RECORD_BYTES; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIRECTORY) continue;

    const diskNumber = view.getUint16(offset + 4, true);
    const centralDisk = view.getUint16(offset + 6, true);
    const entriesOnDisk = view.getUint16(offset + 8, true);
    const entryCount = view.getUint16(offset + 10, true);
    const centralSize = view.getUint32(offset + 12, true);
    const centralOffset = view.getUint32(offset + 16, true);
    const commentLength = view.getUint16(offset + 20, true);

    if (offset + END_RECORD_BYTES + commentLength > length) throw invalid();
    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw invalid();
    if (entryCount === ZIP64_MARKER_16 || centralSize === ZIP64_MARKER_32 || centralOffset === ZIP64_MARKER_32) throw invalid();
    if (entryCount === 0) throw invalid();
    if (entryCount > IMPORT_LIMITS.maxZipEntries) throw new ImportParseError("DOCX_TOO_MANY_ENTRIES");
    if (centralOffset + centralSize > offset) throw invalid();

    return { offset, entryCount, centralSize, centralOffset };
  }

  throw invalid();
}

function readCentralDirectory(view: DataView, bytes: Uint8Array, end: EndRecord): Entry[] {
  const decoder = new TextDecoder();
  const limit = end.centralOffset + end.centralSize;
  const entries: Entry[] = [];
  let offset = end.centralOffset;

  for (let index = 0; index < end.entryCount; index += 1) {
    if (offset + CENTRAL_HEADER_BYTES > limit || view.getUint32(offset, true) !== CENTRAL_FILE_HEADER) throw invalid();

    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const localOffset = view.getUint32(offset + 42, true);

    const next = offset + CENTRAL_HEADER_BYTES + nameLength + extraLength + commentLength;
    if (next > limit) throw invalid();
    if ((flags & ENCRYPTION_FLAGS) !== 0) throw new ImportParseError("ENCRYPTED_DOCX");
    if (diskStart !== 0 || (method !== METHOD_STORED && method !== METHOD_DEFLATE)) throw invalid();
    if (compressedSize === ZIP64_MARKER_32 || uncompressedSize === ZIP64_MARKER_32 || localOffset === ZIP64_MARKER_32) throw invalid();

    const nameStart = offset + CENTRAL_HEADER_BYTES;
    entries.push({
      name: decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)),
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    offset = next;
  }

  return entries;
}

function dataRange(view: DataView, entry: Entry, centralOffset: number): { start: number; end: number } {
  if (entry.localOffset + LOCAL_HEADER_BYTES > centralOffset) throw invalid();
  if (view.getUint32(entry.localOffset, true) !== LOCAL_FILE_HEADER) throw invalid();

  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + LOCAL_HEADER_BYTES + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > centralOffset) throw invalid();
  return { start, end };
}

/** Inflates `data`, reporting each produced chunk size so the caller can stop early. */
function inflateCounting(data: Uint8Array, onChunk: (size: number) => void): number {
  let produced = 0;
  const inflate = new Inflate((chunk) => {
    produced += chunk.length;
    onChunk(chunk.length);
  });

  if (data.length === 0) return 0;
  for (let offset = 0; offset < data.length; offset += INFLATE_SLICE_BYTES) {
    const end = Math.min(offset + INFLATE_SLICE_BYTES, data.length);
    inflate.push(data.subarray(offset, end), end === data.length);
  }
  return produced;
}

function verifyContents(view: DataView, bytes: Uint8Array, entries: Entry[], centralOffset: number): void {
  let expanded = 0;
  let expandedXml = 0;
  let hasMainDocument = false;

  const addExpanded = (size: number, isXml: boolean) => {
    expanded += size;
    if (expanded > IMPORT_LIMITS.maxDocxExpandedBytes) throw new ImportParseError("DOCX_TOO_LARGE");
    if (!isXml) return;
    expandedXml += size;
    if (expandedXml > IMPORT_LIMITS.maxDocxXmlBytes) throw new ImportParseError("DOCX_TOO_LARGE");
  };

  for (const entry of entries) {
    const { start, end } = dataRange(view, entry, centralOffset);
    const isXml = XML_PART.test(entry.name);

    if (entry.method === METHOD_STORED) {
      if (entry.compressedSize !== entry.uncompressedSize) throw invalid();
      addExpanded(entry.uncompressedSize, isXml);
    } else {
      const actual = inflateCounting(bytes.subarray(start, end), (size) => addExpanded(size, isXml));
      if (actual !== entry.uncompressedSize) throw invalid();
    }

    if (entry.name === MAIN_DOCUMENT) hasMainDocument = true;
  }

  if (!hasMainDocument) throw invalid();
}

/**
 * Checks a DOCX archive before any document parser sees it.
 *
 * Declared sizes are never trusted: every entry is inflated in bounded steps and the
 * real output is counted, so a small file that expands enormously stops at the limit.
 * The XML parts are also counted on their own, because they become trees many times
 * their size while pictures and other binary parts are never parsed.
 */
export function preflightDocx(bytes: Uint8Array): void {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = findEndRecord(view);
    const entries = readCentralDirectory(view, bytes, end);
    verifyContents(view, bytes, entries, end.centralOffset);
  } catch (error) {
    throw error instanceof ImportParseError ? error : new ImportParseError("INVALID_DOCX", { cause: error });
  }
}
