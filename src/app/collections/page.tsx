import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CollectionManager } from "@/features/collections/manager";
import { getCollection, listCollections } from "@/features/collections/service";
import { getPublicQuestion, listLibrary, listTopics } from "@/features/questions/service";
import { getCurrentActor } from "@/lib/current-actor";
import { isDomainError } from "@/lib/errors";
import { signInHref } from "@/lib/redirect";

export const metadata: Metadata = { title: "Collections", robots: { index: false } };

const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function returnToFromQuery(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const first = firstValue(value);
    if (first) params.set(key, first);
  }
  const search = params.toString();
  return search ? `/collections?${search}` : "/collections";
}

export default async function CollectionsPage({ searchParams }: PageProps<"/collections">) {
  const query = await searchParams;
  const actor = await getCurrentActor();
  const returnTo = returnToFromQuery(query);
  if (!actor) redirect(signInHref(returnTo));

  const topic = firstValue(query.topic)?.trim() || undefined;
  const q = firstValue(query.q)?.trim() || undefined;
  const saved = firstValue(query.saved) === "1" ? true : undefined;
  const selectedQuestionId = firstValue(query.questionId)?.trim() || undefined;
  const selectedCollectionId = firstValue(query.collectionId)?.trim() || undefined;

  const [collections, topics, library, selectedQuestion] = await Promise.all([
    listCollections(actor),
    listTopics(),
    listLibrary({ q, topic, saved, page: 1 }, actor),
    selectedQuestionId ? getPublicQuestion(selectedQuestionId, actor) : Promise.resolve(null),
  ]);

  const fallbackCollectionId = selectedCollectionId ?? collections[0]?.id;
  let selectedCollection = null;
  if (fallbackCollectionId) {
    try {
      selectedCollection = await getCollection(actor, fallbackCollectionId);
    } catch (error) {
      if (!isDomainError(error, "NOT_FOUND")) throw error;
    }
  }

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