"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type MouseEvent } from "react";

import { IMPORT_ERROR_MESSAGES, ImportParseError, type ImportErrorCode } from "./errors";
import { IMPORT_LIMITS } from "./limits";
import { startParse, type ParseHandle } from "./parse-client";
import {
  STRUCTURE_MODES,
  type CandidateProblem,
  type DetectedStructure,
  type ImportCandidate,
  type ParseResult,
  type ParseStage,
  type StructureMode,
} from "./types";

const stageText: Record<ParseStage, string> = {
  reading: "Reading the file",
  converting: "Converting to Markdown",
  extracting: "Finding questions",
};

const structureOptions: ReadonlyArray<{ value: StructureMode; label: string }> = [
  { value: "auto", label: "Detect automatically" },
  { value: "h2", label: "Level 2 headings are questions" },
  { value: "h3", label: "Level 3 headings are questions" },
  { value: "h1", label: "Level 1 headings are questions" },
  { value: "labels", label: "Q: and A: labels" },
  { value: "table", label: "Table with Question and Answer columns" },
];

const detectedText: Record<DetectedStructure, string> = {
  labels: "Q: and A: labels",
  table: "a Question and Answer table",
  h1: "level 1 headings",
  h2: "level 2 headings",
  h3: "level 3 headings",
  none: "no recognised structure",
};

const kib = (bytes: number) => `${bytes / 1024} KiB`;

const problemText: Record<CandidateProblem, string> = {
  EMPTY_PROMPT: "The question is empty.",
  EMPTY_ANSWER: "There is no answer.",
  PROMPT_TOO_LONG: `The question is longer than ${kib(IMPORT_LIMITS.maxPromptBytes)}.`,
  ANSWER_TOO_LONG: `The answer is longer than ${kib(IMPORT_LIMITS.maxAnswerBytes)}.`,
};

const isStructureMode = (value: string): value is StructureMode => (STRUCTURE_MODES as readonly string[]).includes(value);

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

type View =
  | { phase: "idle" }
  | { phase: "working"; stage: ParseStage }
  | { phase: "done"; result: ParseResult }
  | { phase: "failed"; code: ImportErrorCode };

const controlClass = "min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm";

export function ImportReview() {
  const fileInputId = useId();
  const structureId = useId();
  const hintId = useId();

  const [structure, setStructure] = useState<StructureMode>("auto");
  const [view, setView] = useState<View>({ phase: "idle" });
  const [expanded, setExpanded] = useState<number | null>(null);
  const file = useRef<File | null>(null);
  const current = useRef<ParseHandle | null>(null);

  useEffect(() => () => current.current?.cancel(), []);

  function run(selected: File, mode: StructureMode) {
    current.current?.cancel();
    setExpanded(null);

    const handle = startParse(selected, mode, (stage) => setView({ phase: "working", stage }));
    current.current = handle;

    handle.promise.then(
      (result) => {
        if (current.current === handle) setView({ phase: "done", result });
      },
      (error: unknown) => {
        if (current.current !== handle) return;
        setView({ phase: "failed", code: error instanceof ImportParseError ? error.code : "PARSE_FAILED" });
      },
    );
  }

  function onFileClick(event: MouseEvent<HTMLInputElement>) {
    // A browser reports a change only when the chosen path differs, so a file read before could not be chosen again.
    event.currentTarget.value = "";
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    file.current = selected;
    run(selected, structure);
  }

  function onStructureChange(event: ChangeEvent<HTMLSelectElement>) {
    const mode = event.target.value;
    if (!isStructureMode(mode)) return;
    setStructure(mode);
    if (file.current) run(file.current, mode);
  }

  const working = view.phase === "working";

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${fileInputId}-heading`} className="rounded-panel border border-line bg-surface p-4 sm:p-6">
        <h2 id={`${fileInputId}-heading`} className="text-lg font-semibold">
          Choose a file
        </h2>
        <p id={hintId} className="mt-1 text-sm text-muted">
          HTML, Markdown, plain text or Word (.docx), up to {IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MiB. Markdown and plain text
          may hold about 2 million characters. The file is read in your browser and is not uploaded. Legacy .doc and PDF files are
          not supported.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={fileInputId} className="block text-sm font-medium">
              Import file
            </label>
            <input
              id={fileInputId}
              type="file"
              accept=".html,.htm,.md,.markdown,.txt,.docx"
              aria-describedby={hintId}
              onClick={onFileClick}
              onChange={onFileChange}
              className={`${controlClass} mt-1 py-2 file:mr-3 file:rounded-control file:border-0 file:bg-canvas file:px-3 file:py-1 file:text-sm file:font-medium`}
            />
          </div>
          <div>
            <label htmlFor={structureId} className="block text-sm font-medium">
              Question structure
            </label>
            <select id={structureId} value={structure} onChange={onStructureChange} className={`${controlClass} mt-1`}>
              {structureOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex min-h-11 flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted">
            {working && `${stageText[view.stage]}…`}
            {view.phase === "failed" && view.code === "CANCELLED" && IMPORT_ERROR_MESSAGES.CANCELLED}
          </p>
          {working && (
            <button
              type="button"
              onClick={() => current.current?.cancel()}
              className="min-h-11 rounded-control border border-line bg-surface px-4 text-sm font-medium hover:bg-canvas"
            >
              Cancel
            </button>
          )}
        </div>

        {view.phase === "failed" && view.code !== "CANCELLED" && (
          <p role="alert" className="mt-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            {IMPORT_ERROR_MESSAGES[view.code]}
          </p>
        )}
      </section>

      {view.phase === "done" && <Review result={view.result} expanded={expanded} onToggle={setExpanded} />}
    </div>
  );
}

function Review({
  result,
  expanded,
  onToggle,
}: {
  result: ParseResult;
  expanded: number | null;
  onToggle: (sourceIndex: number | null) => void;
}) {
  const needAttention = result.candidates.filter((candidate) => candidate.problems.length > 0).length;

  return (
    <section aria-labelledby="review-heading" className="rounded-panel border border-line bg-surface">
      <div className="border-b border-line p-4 sm:p-6">
        <h2 id="review-heading" className="text-lg font-semibold">
          Questions found
        </h2>
        <p className="mt-1 text-sm text-muted">
          {plural(result.candidates.length, "question")} found using {detectedText[result.structure]}
          {needAttention > 0 && `; ${needAttention} need attention`}. Nothing has been saved.
        </p>

        {result.warnings.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-due-ink">
            {result.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
        )}
      </div>

      {result.candidates.length > 0 && (
        <ol aria-label="Detected questions" className="divide-y divide-line">
          {result.candidates.map((candidate) => (
            <CandidateRow
              key={candidate.sourceIndex}
              candidate={candidate}
              open={expanded === candidate.sourceIndex}
              onToggle={() => onToggle(expanded === candidate.sourceIndex ? null : candidate.sourceIndex)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function CandidateRow({ candidate, open, onToggle }: { candidate: ImportCandidate; open: boolean; onToggle: () => void }) {
  const panelId = useId();

  return (
    <li>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
          className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas sm:px-6"
        >
          <span className="w-10 shrink-0 text-sm text-muted tabular-nums">{candidate.sourceIndex + 1}</span>
          <span className="min-w-0 flex-1 break-words font-medium">{candidate.title || "Untitled"}</span>
          {candidate.problems.length > 0 && (
            <span className="shrink-0 rounded-control bg-due-soft px-2 py-0.5 text-xs font-medium text-due-ink">Needs attention</span>
          )}
        </button>
      </h3>

      {open && (
        <div id={panelId} className="space-y-4 px-4 pb-4 sm:px-6 sm:pl-[4.75rem]">
          {candidate.problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-due-ink">
              {candidate.problems.map((problem) => (
                <li key={problem}>{problemText[problem]}</li>
              ))}
            </ul>
          )}
          <SourceText label="Question" text={candidate.promptMarkdown} />
          <SourceText label="Answer" text={candidate.answerMarkdown} />
        </div>
      )}
    </li>
  );
}

/** Shows Markdown source as plain text; imported content is never rendered as HTML here. */
function SourceText({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-control border border-line bg-canvas p-3 font-mono text-sm">
        {text || "(empty)"}
      </pre>
    </div>
  );
}
