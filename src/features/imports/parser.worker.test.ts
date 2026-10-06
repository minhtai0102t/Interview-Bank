import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

type Handler = (event: { data: WorkerRequest }) => Promise<void>;

/** Stands in for the worker's global scope: collects what the worker posts back. */
async function startWorker() {
  const posted: WorkerResponse[] = [];
  // A real worker's `self` is its global object, so inherit the rest of the globals (some dependencies probe them).
  const scope = Object.assign(Object.create(globalThis) as object, {
    postMessage: (message: WorkerResponse) => void posted.push(message),
    onmessage: null as Handler | null,
  });
  vi.stubGlobal("self", scope);

  await import("./parser.worker");

  const handler = scope.onmessage;
  if (!handler) throw new Error("The worker did not register a message handler.");
  return { posted, send: (request: WorkerRequest) => handler({ data: request }) };
}

const markdownRequest = (text: string): WorkerRequest => ({
  fileName: "questions.md",
  bytes: new TextEncoder().encode(text).buffer,
  structure: "auto",
});

// Every test loads the whole parsing stack afresh (`resetModules`), which can take several seconds while other test
// files are using the CPU, so the default 5 seconds is too tight.
describe("parser worker", { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("./parsers");
    vi.unstubAllGlobals();
  });

  it("reports its stages and then the questions it found", async () => {
    const { posted, send } = await startWorker();

    await send(markdownRequest("## What is a closure?\n\nA function that keeps its scope.\n"));

    expect(posted.map((message) => (message.type === "stage" ? message.stage : message.type))).toEqual([
      "converting",
      "extracting",
      "result",
    ]);
    const last = posted.at(-1);
    expect(last?.type === "result" && last.result.candidates.map((candidate) => candidate.title)).toEqual(["What is a closure?"]);
  });

  it("reports the code of a rejected file", async () => {
    const { posted, send } = await startWorker();

    await send({ ...markdownRequest("ignored"), bytes: new ArrayBuffer(0) });

    expect(posted).toEqual([{ type: "error", code: "EMPTY_FILE" }]);
  });

  it("reports an error instead of staying silent when the parser cannot start in this browser", async () => {
    vi.doMock("./parsers", () => {
      throw new ReferenceError("document is not defined");
    });
    const { posted, send } = await startWorker();

    await send(markdownRequest("## Question?\n\nAnswer.\n"));

    expect(posted).toEqual([{ type: "error", code: "PARSE_FAILED" }]);
  });
});
