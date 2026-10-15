import type { Metadata } from "next";
import Link from "next/link";

import { OwnQuestionsList } from "@/features/questions/own-questions-list";
import { listOwnQuestions, listTopics } from "@/features/questions/service";
import { requirePageActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "My questions", robots: { index: false } };

export default async function MyQuestionsPage() {
  const actor = await requirePageActor("/my-questions");
  const [questions, topics] = await Promise.all([listOwnQuestions(actor), listTopics()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My questions</h1>
          <p className="mt-2 text-sm text-muted">Keep drafts private until they are ready for the shared library.</p>
        </div>
        <Link href="/my-questions/new" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white">
          New question
        </Link>
      </div>
      <OwnQuestionsList questions={questions} topics={topics} returnTo="/my-questions" />
    </div>
  );
}