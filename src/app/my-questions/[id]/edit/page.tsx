import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QuestionEditor } from "@/features/questions/editor";
import { getOwnQuestion, listTopics } from "@/features/questions/service";
import { isDomainError } from "@/lib/errors";
import { requirePageActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "Edit question", robots: { index: false } };

async function loadEditableQuestion(actor: Awaited<ReturnType<typeof requirePageActor>>, id: string) {
  try {
    return await Promise.all([getOwnQuestion(actor, id), listTopics()]);
  } catch (error) {
    if (isDomainError(error, "NOT_FOUND")) notFound();
    throw error;
  }
}

export default async function EditQuestionPage({ params }: PageProps<"/my-questions/[id]/edit">) {
  const { id } = await params;
  const actor = await requirePageActor(`/my-questions/${id}/edit`);
  const [question, topics] = await loadEditableQuestion(actor, id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit question</h1>
        <p className="mt-2 text-sm text-muted">Version {question.draftVersion}. Published answers always use the current published revision.</p>
      </div>
      <QuestionEditor
        mode="edit"
        topics={topics}
        returnTo={`/my-questions/${id}/edit`}
        initialQuestion={{
          id: question.id,
          title: question.title,
          promptMarkdown: question.promptMarkdown,
          answerMarkdown: question.answerMarkdown,
          topicId: question.topicId,
          difficulty: question.difficulty,
          tags: question.tags,
          draftVersion: question.draftVersion,
          published: question.currentPublishedRevisionId !== null,
          archived: question.archivedAt !== null,
        }}
      />
    </div>
  );
}