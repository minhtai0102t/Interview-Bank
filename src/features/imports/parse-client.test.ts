import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IMPORT_LIMITS } from "./limits";
import { startParse } from "./parse-client";
import type { ParseResult, ParseStage } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  sent: Array<{ message: WorkerRequest; transfer: Transferable[] | undefined }> = [];

  constructor(
    readonly url: URL,
    readonly options?: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: WorkerRequest, transfer?: Transferable[]) {
    this.sent.push({ message, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  reply(response: WorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
  }
}

const result: ParseResult = { format: "markdown", structure: "labels", candidates: [], warnings: [] };

async function spawnedWorker(): Promise<FakeWorker> {
  await vi.waitFor(() => expect(FakeWorker.instances).toHaveLength(1));
  return FakeWorker.instances[0]!;
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startParse validation", () => {
  it("rejects unsupported files without starting a worker", async () => {
    const handle = startParse(new File(["x"], "scan.pdf"), "auto", () => {});
    await expect(handle.promise).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("rejects empty files without starting a worker", async () => {
    const handle = startParse(new File([], "empty.md"), "auto", () => {});
    await expect(handle.promise).rejects.toMatchObject({ code: "EMPTY_FILE" });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("rejects oversized files without reading them", async () => {
    const big = new File([new Uint8Array(IMPORT_LIMITS.maxFileBytes + 1)], "big.md");
    const handle = startParse(big, "auto", () => {});
    await expect(handle.promise).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(FakeWorker.instances).toHaveLength(0);
  });
});

describe("startParse", () => {
  it("hands the file to a module worker, forwards stages and resolves with the result", async () => {
    const stages: ParseStage[] = [];
    const handle = startParse(new File(["Q: a?\nA: b\n"], "bank.md"), "h2", (stage) => stages.push(stage));

    const worker = await spawnedWorker();
    expect(worker.options).toEqual({ type: "module" });
    expect(String(worker.url)).toMatch(/parser\.worker\.ts$/);

    const [request] = worker.sent;
    expect(request?.message).toMatchObject({ fileName: "bank.md", structure: "h2" });
    expect(request?.message.bytes.byteLength).toBe(11);
    expect(request?.transfer).toEqual([request?.message.bytes]);

    worker.reply({ type: "stage", stage: "converting" });
    worker.reply({ type: "stage", stage: "extracting" });
    worker.reply({ type: "result", result });

    await expect(handle.promise).resolves.toBe(result);
    expect(stages).toEqual(["reading", "converting", "extracting"]);
    expect(worker.terminated).toBe(true);
  });

  it("turns a worker error response into a coded error", async () => {
    const handle = startParse(new File(["x"], "bank.md"), "auto", () => {});
    const worker = await spawnedWorker();

    worker.reply({ type: "error", code: "NOT_UTF8" });

    await expect(handle.promise).rejects.toMatchObject({ code: "NOT_UTF8" });
    expect(worker.terminated).toBe(true);
  });

  it("treats a crashed worker as a failed parse", async () => {
    const handle = startParse(new File(["x"], "bank.md"), "auto", () => {});
    const worker = await spawnedWorker();

    worker.onerror?.({} as ErrorEvent);

    await expect(handle.promise).rejects.toMatchObject({ code: "PARSE_FAILED" });
    expect(worker.terminated).toBe(true);
  });

  it("cancel() terminates the worker and rejects with CANCELLED", async () => {
    const handle = startParse(new File(["x"], "bank.md"), "auto", () => {});
    const worker = await spawnedWorker();

    handle.cancel();

    await expect(handle.promise).rejects.toMatchObject({ code: "CANCELLED" });
    expect(worker.terminated).toBe(true);
  });

  it("cancel() before the file is read never starts a worker", async () => {
    const handle = startParse(new File(["x"], "bank.md"), "auto", () => {});

    handle.cancel();

    await expect(handle.promise).rejects.toMatchObject({ code: "CANCELLED" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("stops a worker that takes too long", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const handle = startParse(new File(["x"], "bank.md"), "auto", () => {});
    const outcome = expect(handle.promise).rejects.toMatchObject({ code: "TIMEOUT" });
    const worker = await spawnedWorker();

    vi.advanceTimersByTime(IMPORT_LIMITS.workerTimeoutMs);

    await outcome;
    expect(worker.terminated).toBe(true);
  });

  it("ignores messages that arrive after it has finished", async () => {
    const stages: ParseStage[] = [];
    const handle = startParse(new File(["x"], "bank.md"), "auto", (stage) => stages.push(stage));
    const worker = await spawnedWorker();

    handle.cancel();
    worker.reply({ type: "stage", stage: "extracting" });
    worker.reply({ type: "result", result });

    await expect(handle.promise).rejects.toMatchObject({ code: "CANCELLED" });
    expect(stages).toEqual(["reading"]);
  });
});
