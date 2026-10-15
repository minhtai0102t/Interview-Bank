import type { Metadata } from "next";

import { QuestionEditor } from "@/features/questions/editor";
import { listTopics } from "@/features/questions/service";
import { requirePageActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "New question", robots: { index: false } };

export default async function NewQuestionPage() {
  await requirePageActor("/my-questions/new");
  const topics = await listTopics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New question</h1>
        <p className="mt-2 text-sm text-muted">Write a draft, preview the Markdown, then publish it when the wording is ready.</p>
      </div>
      <QuestionEditor mode="new" topics={topics} returnTo="/my-questions/new" />
    </div>
  );
}