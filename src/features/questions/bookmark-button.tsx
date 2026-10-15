"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";
import { signInHref } from "@/lib/redirect";

import { setBookmarkAction } from "./actions";

export function BookmarkButton({
  questionId,
  initialSaved,
  canBookmark,
  returnTo,
}: {
  questionId: string;
  initialSaved: boolean;
  canBookmark: boolean;
  returnTo: string;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(initialSaved);
  const [feedback, setFeedback] = useState<ActionFeedbackState | null>(null);

  if (!canBookmark) {
    return (
      <Link href={signInHref(returnTo)} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas">
        Sign in to save
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          startTransition(async () => {
            setFeedback(null);
            const result = await setBookmarkAction(questionId, !saved, returnTo);
            if (!result.ok) {
              setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
              return;
            }
            setSaved(result.data.saved);
          });
        }}
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60"
      >
        {saved ? "Remove bookmark" : "Save bookmark"}
      </button>
      <ActionFeedback feedback={feedback} />
    </div>
  );
}