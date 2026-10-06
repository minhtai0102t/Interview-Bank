import { ImportParseError } from "./errors";
import { formatFromFileName } from "./formats";
import { IMPORT_LIMITS } from "./limits";
import type { ParseResult, ParseStage, StructureMode } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

export interface ParseHandle {
  promise: Promise<ParseResult>;
  /** Stops reading immediately: the worker is terminated, so no further work happens. */
  cancel(): void;
}

/**
 * Parses a file in a dedicated worker so the page stays responsive.
 * The file is read in the browser and is never uploaded.
 */
export function startParse(file: File, structure: StructureMode, onStage: (stage: ParseStage) => void): ParseHandle {
  let cancel: () => void = () => {};

  const promise = new Promise<ParseResult>((resolve, reject) => {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const settle = (outcome: { result: ParseResult } | { code: ImportParseError["code"] }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker?.terminate();
      if ("result" in outcome) resolve(outcome.result);
      else reject(new ImportParseError(outcome.code));
    };

    cancel = () => settle({ code: "CANCELLED" });

    if (!formatFromFileName(file.name)) return settle({ code: "UNSUPPORTED_FORMAT" });
    if (file.size === 0) return settle({ code: "EMPTY_FILE" });
    if (file.size > IMPORT_LIMITS.maxFileBytes) return settle({ code: "FILE_TOO_LARGE" });

    onStage("reading");
    file.arrayBuffer().then(
      (bytes) => {
        if (settled) return;

        worker = new Worker(new URL("./parser.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (settled) return;
          const message = event.data;
          if (message.type === "stage") onStage(message.stage);
          else if (message.type === "result") settle({ result: message.result });
          else settle({ code: message.code });
        };
        worker.onerror = () => settle({ code: "PARSE_FAILED" });
        timer = setTimeout(() => settle({ code: "TIMEOUT" }), IMPORT_LIMITS.workerTimeoutMs);

        const request: WorkerRequest = { fileName: file.name, bytes, structure };
        worker.postMessage(request, [bytes]);
      },
      () => settle({ code: "PARSE_FAILED" }),
    );
  });

  return { promise, cancel: () => cancel() };
}
