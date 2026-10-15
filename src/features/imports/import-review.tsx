"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type ChangeEvent, type MouseEvent } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { saveImportedQuestionsAction } from "@/features/questions/actions";
import { parseQuestionInput, type QuestionInput } from "@/features/questions/input";
import type { TopicListItem } from "@/features/questions/service";
import type { ActionRecovery } from "@/lib/action-result";

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
const SAVE_BATCH_LIMIT = 10;
const SAVE_BATCH_BYTES = 180_000;

type EditableCandidate = {
  sourceIndex: number;
  title: string;
  promptMarkdown: string;
  answerMarkdown: string;
  tags: string;
  selected: boolean;
};

type SaveState = {
  kind: "idle" | "success" | "error";
  message: string;
  questionIds: string[];
  recovery?: ActionRecovery;
};

const difficultyOptions: ReadonlyArray<{ value: QuestionInput["difficulty"]; label: string }> = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

const encoder = new TextEncoder();

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function batchInputs(inputs: readonly QuestionInput[]) {
  const batches: QuestionInput[][] = [];
  let current: QuestionInput[] = [];
  let currentBytes = 0;

  for (const input of inputs) {
    const inputBytes = encoder.encode(JSON.stringify(input)).length;
    if (current.length > 0 && (current.length >= SAVE_BATCH_LIMIT || currentBytes + inputBytes > SAVE_BATCH_BYTES)) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(input);
    currentBytes += inputBytes;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

async function stableRequestId(batch: readonly QuestionInput[], index: number, total: number) {
  const payload = JSON.stringify({ batch, index, total });
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(payload));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `import-${hex.slice(0, 24)}-${index + 1}-of-${total}`;
}

export function ImportReview({ topics, returnTo }: { topics: TopicListItem[]; returnTo: string }) {
  const fileInputId = useId();
  const structureId = useId();
  const hintId = useId();
  const topicId = useId();
  const difficultyId = useId();
  const [savePending, startSaveTransition] = useTransition();

  const [structure, setStructure] = useState<StructureMode>("auto");
  const [view, setView] = useState<View>({ phase: "idle" });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [defaultTopicId, setDefaultTopicId] = useState(topics[0]?.id ?? "");
  const [defaultDifficulty, setDefaultDifficulty] = useState<QuestionInput["difficulty"]>("MEDIUM");
  const [editableCandidates, setEditableCandidates] = useState<EditableCandidate[]>([]);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle", message: "", questionIds: [] });
  const file = useRef<File | null>(null);
  const current = useRef<ParseHandle | null>(null);

  useEffect(() => () => current.current?.cancel(), []);

  function run(selected: File, mode: StructureMode) {
    current.current?.cancel();
    setExpanded(null);
    setSaveState({ kind: "idle", message: "", questionIds: [] });

    const handle = startParse(selected, mode, (stage) => setView({ phase: "working", stage }));
    current.current = handle;

    handle.promise.then(
      (result) => {
        if (current.current !== handle) return;
        setEditableCandidates(
          result.candidates.map((candidate) => ({
            sourceIndex: candidate.sourceIndex,
            title: candidate.title,
            promptMarkdown: candidate.promptMarkdown,
            answerMarkdown: candidate.answerMarkdown,
            tags: "",
            selected: candidate.problems.length === 0,
          })),
        );
        setView({ phase: "done", result });
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
  const canSave = topics.length > 0 && view.phase === "done";

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

      {view.phase === "done" && (
        <Review
          result={view.result}
          topics={topics}
          defaultTopicId={defaultTopicId}
          defaultDifficulty={defaultDifficulty}
          editableCandidates={editableCandidates}
          saveState={saveState}
          savePending={savePending}
          expanded={expanded}
          onToggle={setExpanded}
          onDefaultTopicChange={setDefaultTopicId}
          onDefaultDifficultyChange={setDefaultDifficulty}
          onCandidateChange={(sourceIndex, patch) => {
            setEditableCandidates((currentCandidates) =>
              currentCandidates.map((candidate) =>
                candidate.sourceIndex === sourceIndex ? { ...candidate, ...patch } : candidate,
              ),
            );
          }}
          onSave={() => {
            if (!canSave) return;
            startSaveTransition(async () => {
              const selectedInputs: QuestionInput[] = [];

              for (const candidate of editableCandidates) {
                if (!candidate.selected) continue;
                try {
                  selectedInputs.push(
                    parseQuestionInput({
                      title: candidate.title,
                      promptMarkdown: candidate.promptMarkdown,
                      answerMarkdown: candidate.answerMarkdown,
                      topicId: defaultTopicId,
                      difficulty: defaultDifficulty,
                      tags: parseTags(candidate.tags),
                    }),
                  );
                } catch (error) {
                  setSaveState({
                    kind: "error",
                    message: error instanceof Error ? error.message : "Could not validate the selected drafts.",
                    questionIds: [],
                  });
                  return;
                }
              }

              if (selectedInputs.length === 0) {
                setSaveState({ kind: "error", message: "Select at least one valid question to save.", questionIds: [] });
                return;
              }

              const batches = batchInputs(selectedInputs);
              const questionIds: string[] = [];

              for (const [index, batch] of batches.entries()) {
                const requestId = await stableRequestId(batch, index, batches.length);
                const result = await saveImportedQuestionsAction(requestId, batch, returnTo);
                if (!result.ok) {
                  setSaveState({
                    kind: "error",
                    message: questionIds.length > 0 ? `${result.error} Already-saved drafts stay available below.` : result.error,
                    questionIds,
                    recovery: result.recovery,
                  });
                  return;
                }
                questionIds.push(...result.data.questionIds);
              }

              setSaveState({
                kind: "success",
                message: `Saved ${questionIds.length} draft${questionIds.length === 1 ? "" : "s"}.`,
                questionIds,
                recovery: undefined,
              });
            });
          }}
          topicId={topicId}
          difficultyId={difficultyId}
        />
      )}
    </div>
  );
}

function Review({
  result,
  topics,
  defaultTopicId,
  defaultDifficulty,
  editableCandidates,
  saveState,
  savePending,
  expanded,
  onToggle,
  onDefaultTopicChange,
  onDefaultDifficultyChange,
  onCandidateChange,
  onSave,
  topicId,
  difficultyId,
}: {
  result: ParseResult;
  topics: TopicListItem[];
  defaultTopicId: string;
  defaultDifficulty: QuestionInput["difficulty"];
  editableCandidates: EditableCandidate[];
  saveState: SaveState;
  savePending: boolean;
  expanded: number | null;
  onToggle: (sourceIndex: number | null) => void;
  onDefaultTopicChange: (value: string) => void;
  onDefaultDifficultyChange: (value: QuestionInput["difficulty"]) => void;
  onCandidateChange: (sourceIndex: number, patch: Partial<EditableCandidate>) => void;
  onSave: () => void;
  topicId: string;
  difficultyId: string;
}) {
  const needAttention = result.candidates.filter((candidate) => candidate.problems.length > 0).length;
  const selectedCount = editableCandidates.filter((candidate) => candidate.selected).length;

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

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div>
            <label htmlFor={topicId} className="block text-sm font-medium">
              Default topic
            </label>
            <select id={topicId} value={defaultTopicId} onChange={(event) => onDefaultTopicChange(event.target.value)} className={`${controlClass} mt-1`}>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={difficultyId} className="block text-sm font-medium">
              Default difficulty
            </label>
            <select
              id={difficultyId}
              value={defaultDifficulty}
              onChange={(event) => onDefaultDifficultyChange(event.target.value as QuestionInput["difficulty"])}
              className={`${controlClass} mt-1`}
            >
              {difficultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={selectedCount === 0 || savePending || topics.length === 0}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {savePending ? "Saving…" : "Save selected drafts"}
          </button>
        </div>

        {saveState.kind !== "idle" ? (
          <div className="mt-4 space-y-2">
            <ActionFeedback
              feedback={{ kind: saveState.kind, message: saveState.message, recovery: saveState.recovery }}
              className="text-sm"
            />
            {saveState.questionIds.length > 0 ? (
              <ol className="flex flex-wrap gap-2 text-sm">
                {saveState.questionIds.map((questionId, index) => (
                  <li key={questionId}>
                    <Link href={`/my-questions/${questionId}/edit`} className="text-primary underline-offset-2 hover:underline">
                      Open saved draft {index + 1}
                    </Link>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>

      {result.candidates.length > 0 && (
        <ol aria-label="Detected questions" className="divide-y divide-line">
          {result.candidates.map((candidate) => {
            const editable = editableCandidates.find((item) => item.sourceIndex === candidate.sourceIndex);
            if (!editable) return null;
            return (
            <CandidateRow
              key={candidate.sourceIndex}
              candidate={candidate}
              editable={editable}
              open={expanded === candidate.sourceIndex}
              onToggle={() => onToggle(expanded === candidate.sourceIndex ? null : candidate.sourceIndex)}
              onChange={(patch) => onCandidateChange(candidate.sourceIndex, patch)}
            />
            );
          })}
        </ol>
      )}
    </section>
  );
}

function CandidateRow({
  candidate,
  editable,
  open,
  onToggle,
  onChange,
}: {
  candidate: ImportCandidate;
  editable: EditableCandidate;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<EditableCandidate>) => void;
}) {
  const panelId = useId();

  return (
    <li>
      <h3>
        <div className="flex min-h-11 items-start gap-3 px-4 py-3 sm:px-6">
          <label className="mt-1 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={`Select question ${candidate.sourceIndex + 1}`}
              checked={editable.selected}
              onChange={(event) => onChange({ selected: event.target.checked })}
            />
          </label>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={onToggle}
            className="flex min-h-11 min-w-0 flex-1 items-start gap-3 text-left hover:text-primary"
          >
            <span className="w-10 shrink-0 text-sm text-muted tabular-nums">{candidate.sourceIndex + 1}</span>
            <span className="min-w-0 flex-1 break-words font-medium">{editable.title || "Untitled"}</span>
            {candidate.problems.length > 0 && (
              <span className="shrink-0 rounded-control bg-due-soft px-2 py-0.5 text-xs font-medium text-due-ink">Needs attention</span>
            )}
          </button>
        </div>
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
          <div>
            <label htmlFor={`title-${candidate.sourceIndex}`} className="block text-sm font-medium">
              Title
            </label>
            <input
              id={`title-${candidate.sourceIndex}`}
              value={editable.title}
              onChange={(event) => onChange({ title: event.target.value })}
              className={`${controlClass} mt-1`}
            />
          </div>
          <SourceField label="Question" value={editable.promptMarkdown} onChange={(value) => onChange({ promptMarkdown: value })} />
          <SourceField label="Answer" value={editable.answerMarkdown} onChange={(value) => onChange({ answerMarkdown: value })} />
          <div>
            <label htmlFor={`tags-${candidate.sourceIndex}`} className="block text-sm font-medium">
              Tags
            </label>
            <input
              id={`tags-${candidate.sourceIndex}`}
              value={editable.tags}
              onChange={(event) => onChange({ tags: event.target.value })}
              placeholder="optional, comma-separated"
              className={`${controlClass} mt-1`}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function SourceField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        className="mt-1 w-full rounded-control border border-line bg-canvas p-3 font-mono text-sm"
      />
    </div>
  );
}
