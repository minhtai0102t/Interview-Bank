import { ImportParseError } from "./errors";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

/**
 * Parser worker: receives one file, replies with stage updates and then a result or a coded error.
 * It never persists anything and the page terminates it as soon as the answer arrives.
 */
const scope = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

scope.onmessage = async (event) => {
  const { fileName, bytes, structure } = event.data;
  try {
    // Loaded on demand: a dependency that cannot start in this browser fails here, where it is reported,
    // instead of while the worker script loads, where the page would never hear about it.
    const { parseImport } = await import("./parsers");
    const result = await parseImport({ fileName, bytes: new Uint8Array(bytes), structure }, (stage) =>
      scope.postMessage({ type: "stage", stage }),
    );
    scope.postMessage({ type: "result", result });
  } catch (error) {
    scope.postMessage({ type: "error", code: error instanceof ImportParseError ? error.code : "PARSE_FAILED" });
  }
};
