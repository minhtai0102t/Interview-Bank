"use client";

import { useState, useTransition } from "react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";

import { moderateQuestionAction } from "./actions";
import type { ModerationQuestionSummary } from "./service";

function formatDate(value: Date | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ModerationTable({ questions }: { questions: ModerationQuestionSummary[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedbackState | null>(null);
  const [pending, startTransition] = useTransition();

  function onModerate(questionId: string, state: "ACTIVE" | "REMOVED") {
    startTransition(async () => {
      setPendingId(questionId);
      setFeedback(null);
      const result = await moderateQuestionAction(questionId, state);
      if (!result.ok) {
        setPendingId(null);
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setPendingId(null);
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  return (
    <div className="space-y-4">
      <ActionFeedback feedback={feedback} />
      {questions.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line bg-surface px-4 py-8 text-sm text-muted">No published questions need moderation right now.</div>
      ) : (
        <div className="overflow-x-auto rounded-panel border border-line bg-surface">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-canvas text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Question</th>
                <th className="px-4 py-3 font-medium">Topic</th>
                <th className="px-4 py-3 font-medium">Author label</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => {
                const removing = question.moderationState === "ACTIVE";
                const actionLabel = removing ? "Remove" : "Restore";
                const nextState = removing ? "REMOVED" : "ACTIVE";
                const rowPending = pending && pendingId === question.id;

                return (
                  <tr key={question.id} className="border-t border-line align-top">
                    <td className="px-4 py-4">
                      <p className="font-medium text-ink">{question.title}</p>
                      <p className="mt-1 text-xs text-muted">{question.difficulty}</p>
                    </td>
                    <td className="px-4 py-4 text-muted">{question.topicLabel}</td>
                    <td className="px-4 py-4 text-muted">{question.authorAlias}</td>
                    <td className="px-4 py-4 text-muted">{formatDate(question.publishedAt)}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-control px-2 py-1 text-xs font-medium ${question.moderationState === "ACTIVE" ? "bg-emerald-50 text-primary" : "bg-danger-soft text-danger"}`}>
                        {question.moderationState}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button type="button" onClick={() => onModerate(question.id, nextState)} disabled={rowPending} className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium disabled:opacity-60 ${removing ? "border border-line text-danger hover:bg-danger-soft" : "border border-line hover:bg-canvas"}`}>
                        {actionLabel}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}