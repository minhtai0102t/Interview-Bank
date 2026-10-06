import type { ImportErrorCode } from "./errors";
import type { ParseResult, ParseStage, StructureMode } from "./types";

/** Sent once to a fresh worker. `bytes` is transferred, not copied. */
export interface WorkerRequest {
  fileName: string;
  bytes: ArrayBuffer;
  structure: StructureMode;
}

export type WorkerResponse =
  | { type: "stage"; stage: ParseStage }
  | { type: "result"; result: ParseResult }
  | { type: "error"; code: ImportErrorCode };
