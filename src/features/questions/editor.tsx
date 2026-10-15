"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";
import { SafeMarkdown } from "@/components/markdown";

import {
  archiveQuestionAction,
  publishQuestionAction,
  saveQuestionAction,
  unpublishQuestionAction,
  type EditableQuestionState,
} from "./actions";
import { QUESTION_LIMITS } from "./limits";
import type { TopicListItem } from "./service";

const difficulties = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
] as const;

interface QuestionEditorProps {
  mode: "new" | "edit";
  topics: TopicListItem[];
  initialQuestion?: EditableQuestionState;
  returnTo: string;
}

function tagsToInput(tags: readonly string[]) {
  return tags.join(", ");
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function QuestionEditor({ mode, topics, initialQuestion, returnTo }: QuestionEditorProps) {
  const [pending, startTransition] = useTransition();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [title, setTitle] = useState(initialQuestion?.title ?? "");
  const [promptMarkdown, setPromptMarkdown] = useState(initialQuestion?.promptMarkdown ?? "");
  const [answerMarkdown, setAnswerMarkdown] = useState(initialQuestion?.answerMarkdown ?? "");
  const [topicId, setTopicId] = useState(initialQuestion?.topicId ?? topics[0]?.id ?? "");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">(initialQuestion?.difficulty ?? "MEDIUM");
  const [tags, setTags] = useState(tagsToInput(initialQuestion?.tags ?? []));
  const [question, setQuestion] = useState<EditableQuestionState | null>(initialQuestion ?? null);
  const [notice, setNotice] = useState<ActionFeedbackState | null>(null);

  const hasTopics = topics.length > 0;
  const canPublish = question !== null && !question.archived;
  const controlsDisabled = pending || !hydrated;

  function syncFromQuestion(nextQuestion: EditableQuestionState) {
    setQuestion(nextQuestion);
    setTitle(nextQuestion.title);
    setPromptMarkdown(nextQuestion.promptMarkdown);
    setAnswerMarkdown(nextQuestion.answerMarkdown);
    setTopicId(nextQuestion.topicId);
    setDifficulty(nextQuestion.difficulty);
    setTags(tagsToInput(nextQuestion.tags));
  }

  function onSave() {
    startTransition(async () => {
      setNotice(null);
      const result = await saveQuestionAction(
        { title, promptMarkdown, answerMarkdown, topicId, difficulty, tags: parseTags(tags) },
        question ? { id: question.id, expectedVersion: question.draftVersion, returnTo } : { returnTo },
      );

      if (!result.ok) {
        setNotice({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }

      syncFromQuestion(result.data.question);
      setNotice({ kind: "success", message: result.data.message });
    });
  }

  function onPublish() {
    if (!question) return;

    startTransition(async () => {
      setNotice(null);
      const result = await publishQuestionAction(question.id, question.draftVersion, returnTo);
      if (!result.ok) {
        setNotice({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }

      syncFromQuestion(result.data.question);
      setNotice({ kind: "success", message: result.data.message });
    });
  }

  function onUnpublish() {
    if (!question) return;

    startTransition(async () => {
      setNotice(null);
      const result = await unpublishQuestionAction(question.id, returnTo);
      if (!result.ok) {
        setNotice({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }

      syncFromQuestion(result.data.question);
      setNotice({ kind: "success", message: result.data.message });
    });
  }

  function onArchive() {
    if (!question) return;

    startTransition(async () => {
      setNotice(null);
      const result = await archiveQuestionAction(question.id, returnTo);
      if (!result.ok) {
        setNotice({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }

      syncFromQuestion(result.data.question);
      setNotice({ kind: "success", message: result.data.message });
    });
  }

  if (!hasTopics) {
    return (
      <div className="rounded-panel border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Topics are not ready yet</h2>
        <p className="mt-2 text-sm text-muted">
          Add topics before writing questions. Imports and starter data will fill this in for normal environments.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ActionFeedback feedback={notice} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <section className="space-y-4 rounded-panel border border-line bg-surface p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="question-title" className="block text-sm font-medium">
                Title
              </label>
              <input
                id="question-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={controlsDisabled}
                maxLength={QUESTION_LIMITS.maxTitleChars}
                className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="question-topic" className="block text-sm font-medium">
                Topic
              </label>
              <select
                id="question-topic"
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
                disabled={controlsDisabled}
                className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
              >
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="question-difficulty" className="block text-sm font-medium">
                Difficulty
              </label>
              <select
                id="question-difficulty"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as "EASY" | "MEDIUM" | "HARD")}
                disabled={controlsDisabled}
                className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
              >
                {difficulties.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="question-tags" className="block text-sm font-medium">
                Tags
              </label>
              <input
                id="question-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                disabled={controlsDisabled}
                placeholder="arrays, sorting"
                className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
              />
              <p className="mt-1 text-xs text-muted">Comma-separated, up to {QUESTION_LIMITS.maxTags} tags.</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="question-prompt" className="block text-sm font-medium">
                Question
              </label>
              <textarea
                id="question-prompt"
                value={promptMarkdown}
                onChange={(event) => setPromptMarkdown(event.target.value)}
                disabled={controlsDisabled}
                rows={7}
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="question-answer" className="block text-sm font-medium">
                Answer
              </label>
              <textarea
                id="question-answer"
                value={answerMarkdown}
                onChange={(event) => setAnswerMarkdown(event.target.value)}
                disabled={controlsDisabled}
                rows={10}
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={controlsDisabled}
              className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={onPublish}
              disabled={!canPublish || controlsDisabled}
              className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium disabled:opacity-60"
            >
              Publish
            </button>
            {question?.published ? (
              <button
                type="button"
                onClick={onUnpublish}
                disabled={controlsDisabled}
                className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium disabled:opacity-60"
              >
                Unpublish
              </button>
            ) : null}
            {question ? (
              <button
                type="button"
                onClick={onArchive}
                disabled={controlsDisabled || question.archived}
                className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-danger disabled:opacity-60"
              >
                Archive
              </button>
            ) : null}
            <Link href="/my-questions" className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-muted hover:text-ink">
              Back to my questions
            </Link>
          </div>

          {mode === "new" && !question ? (
            <p className="text-sm text-muted">Save the draft once before publishing it.</p>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="rounded-panel border border-line bg-surface p-4 sm:p-6">
            <div className="flex flex-wrap gap-2 text-xs font-medium text-muted">
              <span className="rounded-control bg-canvas px-2 py-1">{difficulty}</span>
              {(parseTags(tags).length > 0 ? parseTags(tags) : ["untagged"]).map((tag) => (
                <span key={tag} className="rounded-control bg-canvas px-2 py-1">
                  #{tag}
                </span>
              ))}
            </div>
            <h2 className="mt-3 text-lg font-semibold">Question preview</h2>
            <div className="mt-3 space-y-4 text-sm leading-6 text-ink">
              <h3 className="text-base font-semibold">{title.trim() || "Untitled question"}</h3>
              <SafeMarkdown markdown={promptMarkdown || "Question preview will appear here."} className="space-y-3" />
            </div>
          </div>

          <div className="rounded-panel border border-line bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold">Answer preview</h2>
            <div className="mt-3 text-sm leading-6 text-ink">
              <SafeMarkdown markdown={answerMarkdown || "Answer preview will appear here."} className="space-y-3" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}