import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SafeMarkdown } from "@/components/markdown";
import { BookmarkButton } from "@/features/questions/bookmark-button";
import { getPublicQuestion } from "@/features/questions/service";
import { getCurrentActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "Question" };

export default async function QuestionDetailPage({ params }: PageProps<"/questions/[id]">) {
  const { id } = await params;
  const actor = await getCurrentActor();
  const question = await getPublicQuestion(id, actor);

  if (!question) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-muted">
            <span className="rounded-control bg-surface px-2 py-1">{question.topicLabel}</span>
            <span className="rounded-control bg-surface px-2 py-1">{question.difficulty}</span>
            {question.tags.map((tag) => (
              <span key={tag} className="rounded-control bg-surface px-2 py-1">
                #{tag}
              </span>
            ))}
          </div>
          <h1 className="mt-3 text-2xl font-semibold">{question.title}</h1>
          <p className="mt-2 text-sm text-muted">Shared by {question.authorAlias}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <BookmarkButton questionId={question.id} initialSaved={question.saved} canBookmark={actor !== null} returnTo={`/questions/${question.id}`} />
          <Link href={`/practice?questionId=${question.id}`} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas">
            Practice this question
          </Link>
          <Link href={`/collections?questionId=${question.id}`} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas">
            Add to collection
          </Link>
        </div>
      </div>

      <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Question</h2>
        <div className="mt-3 text-sm leading-6 text-ink">
          <SafeMarkdown markdown={question.promptMarkdown} className="space-y-3" />
        </div>
      </section>

      <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Answer</h2>
        <div className="mt-3 text-sm leading-6 text-ink">
          <SafeMarkdown markdown={question.answerMarkdown} className="space-y-3" />
        </div>
      </section>
    </div>
  );
}