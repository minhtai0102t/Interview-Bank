import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionManager } from "@/features/collections/manager";
import { getCollection, listCollections } from "@/features/collections/service";
import { getPublicQuestion, listLibrary, listTopics } from "@/features/questions/service";
import { requirePageActor } from "@/lib/current-actor";
import { isDomainError } from "@/lib/errors";

export const metadata: Metadata = { title: "Collections", robots: { index: false } };

const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function returnTo(id: string, query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const first = firstValue(value);
    if (first) params.set(key, first);
  }
  const search = params.toString();
  return search ? `/collections/${id}?${search}` : `/collections/${id}`;
}

async function loadCollectionDetailPage(
  actor: Awaited<ReturnType<typeof requirePageActor>>,
  id: string,
  filters: { q?: string; topic?: string; saved?: boolean; selectedQuestionId?: string },
) {
  try {
    const [collections, topics, library, selectedQuestion, selectedCollection] = await Promise.all([
      listCollections(actor),
      listTopics(),
      listLibrary({ q: filters.q, topic: filters.topic, saved: filters.saved, page: 1 }, actor),
      filters.selectedQuestionId ? getPublicQuestion(filters.selectedQuestionId, actor) : Promise.resolve(null),
      getCollection(actor, id),
    ]);

    return { collections, topics, library, selectedQuestion, selectedCollection };
  } catch (error) {
    if (isDomainError(error, "NOT_FOUND")) notFound();
    throw error;
  }
}

export default async function CollectionDetailPage({ params, searchParams }: PageProps<"/collections/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await requirePageActor(returnTo(id, query));

  const topic = firstValue(query.topic)?.trim() || undefined;
  const q = firstValue(query.q)?.trim() || undefined;
  const saved = firstValue(query.saved) === "1" ? true : undefined;
  const selectedQuestionId = firstValue(query.questionId)?.trim() || undefined;

  const { collections, topics, library, selectedQuestion, selectedCollection } = await loadCollectionDetailPage(actor, id, {
    q,
    topic,
    saved,
    selectedQuestionId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Collections</h1>
        <p className="mt-2 text-sm text-muted">Build private study sets from the published bank, saved questions, or a specific question page.</p>
      </div>
      <CollectionManager
        collections={collections}
        selectedCollection={selectedCollection}
        library={library}
        topics={topics}
        selectedQuestion={selectedQuestion}
        selectedQuestionRequested={Boolean(selectedQuestionId)}
      />
    </div>
  );
}