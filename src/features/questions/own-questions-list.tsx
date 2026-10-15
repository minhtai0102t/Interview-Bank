"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";

import type { OwnQuestionSummary, TopicListItem } from "./service";
import { archiveQuestionAction, publishQuestionAction, unpublishQuestionAction } from "./actions";

interface OwnQuestionsListProps {
  questions: OwnQuestionSummary[];
  topics: TopicListItem[];
  returnTo: string;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function OwnQuestionsList({ questions, topics, returnTo }: OwnQuestionsListProps) {
  const topicLabels = useMemo(() => new Map(topics.map((topic) => [topic.id, topic.label])), [topics]);
  const published = questions.filter((question) => question.publishedRevision !== null && question.archivedAt === null);
  const drafts = questions.filter((question) => question.publishedRevision === null && question.archivedAt === null);
  const archived = questions.filter((question) => question.archivedAt !== null);

  return (
    <div className="space-y-6">
      <QuestionSection
        title="Drafts"
        emptyMessage="No drafts yet. Start a new question or save selected imports."
        questions={drafts}
        topicLabels={topicLabels}
        returnTo={returnTo}
      />
      <QuestionSection
        title="Published"
        emptyMessage="Nothing is public yet. Publish a draft when it is ready for the library."
        questions={published}
        topicLabels={topicLabels}
        returnTo={returnTo}
      />
      <QuestionSection
        title="Archived"
        emptyMessage="Archived questions will appear here."
        questions={archived}
        topicLabels={topicLabels}
        returnTo={returnTo}
      />
    </div>
  );
}

function QuestionSection({
  title,
  emptyMessage,
  questions,
  topicLabels,
  returnTo,
}: {
  title: string;
  emptyMessage: string;
  questions: OwnQuestionSummary[];
  topicLabels: Map<string, string>;
  returnTo: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted">{emptyMessage}</p>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line bg-surface px-4 py-6 text-sm text-muted">{emptyMessage}</div>
      ) : (
        <ul className="space-y-3">
          {questions.map((question) => (
            <li key={question.id}>
              <OwnQuestionRow question={question} topicLabel={topicLabels.get(question.topicId) ?? "Unknown topic"} returnTo={returnTo} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OwnQuestionRow({ question, topicLabel, returnTo }: { question: OwnQuestionSummary; topicLabel: string; returnTo: string }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ActionFeedbackState | null>(null);

  const publishLabel =
    question.publishedRevision && question.publishedRevision.draftVersion === question.draftVersion ? "Republish" : "Publish";

  function onPublish() {
    startTransition(async () => {
      setNotice(null);
      const result = await publishQuestionAction(question.id, question.draftVersion, returnTo);
      if (!result.ok) {
        setNotice({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setNotice({ kind: "success", message: result.data.message });
    });
  }

  function onUnpublish() {
    startTransition(async () => {
      setNotice(null);
      const result = await unpublishQuestionAction(question.id, returnTo);
      if (!result.ok) {
        setNotice({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setNotice({ kind: "success", message: result.data.message });
    });
  }

  function onArchive() {
    startTransition(async () => {
      setNotice(null);
      const result = await archiveQuestionAction(question.id, returnTo);
      if (!result.ok) {
        setNotice({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setNotice({ kind: "success", message: result.data.message });
    });
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 text-xs font-medium text-muted">
            <span className="rounded-control bg-canvas px-2 py-1">{topicLabel}</span>
            <span className="rounded-control bg-canvas px-2 py-1">{question.difficulty}</span>
            <span className="rounded-control bg-canvas px-2 py-1">v{question.draftVersion}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold">{question.title}</h3>
          <p className="mt-1 text-sm text-muted">Updated {formatDate(question.updatedAt)}</p>
          {question.tags.length > 0 ? <p className="mt-2 text-sm text-muted">#{question.tags.join(" #")}</p> : null}
          <ActionFeedback feedback={notice} className="mt-2" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/my-questions/${question.id}/edit`}
            className="inline-flex min-h-11 items-center rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas"
          >
            Edit
          </Link>
          {question.archivedAt ? null : (
            <button
              type="button"
              onClick={onPublish}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-control bg-primary px-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {publishLabel}
            </button>
          )}
          {question.publishedRevision ? (
            <button
              type="button"
              onClick={onUnpublish}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-control border border-line px-3 text-sm font-medium hover:bg-canvas disabled:opacity-60"
            >
              Unpublish
            </button>
          ) : null}
          {!question.archivedAt ? (
            <button
              type="button"
              onClick={onArchive}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-control border border-line px-3 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
            >
              Archive
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}