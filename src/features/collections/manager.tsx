"use client";

import { Bookmark, FolderKanban, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";
import type { PublicQuestion, LibraryPage, TopicListItem } from "@/features/questions/service";

import { deleteCollectionAction, saveCollectionAction, setCollectionQuestionAction } from "./actions";
import type { CollectionDetail, CollectionSummary } from "./service";

interface CollectionManagerProps {
  collections: CollectionSummary[];
  selectedCollection: CollectionDetail | null;
  library: LibraryPage;
  topics: TopicListItem[];
  selectedQuestion: PublicQuestion | null;
  selectedQuestionRequested: boolean;
}

function withQuery(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function collectionPath(collectionId?: string): string {
  return collectionId ? `/collections/${collectionId}` : "/collections";
}

export function CollectionManager({
  collections,
  selectedCollection,
  library,
  topics,
  selectedQuestion,
  selectedQuestionRequested,
}: CollectionManagerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [feedback, setFeedback] = useState<ActionFeedbackState | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [edits, setEdits] = useState<Record<string, { name?: string; description?: string }>>({});
  const editName = selectedCollection ? (edits[selectedCollection.id]?.name ?? selectedCollection.name) : "";
  const editDescription = selectedCollection
    ? (edits[selectedCollection.id]?.description ?? selectedCollection.description)
    : "";
  const controlsDisabled = pending || !hydrated;

  const selectedQuestionInCollection = selectedCollection && selectedQuestion
    ? selectedCollection.items.some((item) => item.questionId === selectedQuestion.id)
    : false;

  const returnTo = withQuery(pathname, new URLSearchParams(searchParams));

  function pushSelection(collectionId?: string) {
    const params = new URLSearchParams(searchParams);
    params.delete("collectionId");
    router.push(withQuery(collectionPath(collectionId), params));
  }

  function onCreate() {
    startTransition(async () => {
      setFeedback(null);
      const result = await saveCollectionAction({ name: newName, description: newDescription }, { returnTo });
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setNewName("");
      setNewDescription("");
      setFeedback({ kind: "success", message: result.data.message });
      pushSelection(result.data.collection.id);
    });
  }

  function onSave() {
    if (!selectedCollection) return;
    startTransition(async () => {
      setFeedback(null);
      const result = await saveCollectionAction(
        { name: editName, description: editDescription },
        { id: selectedCollection.id, returnTo },
      );
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  function onDelete() {
    if (!selectedCollection) return;
    startTransition(async () => {
      setFeedback(null);
      const result = await deleteCollectionAction(selectedCollection.id, returnTo);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setFeedback({ kind: "success", message: result.data.message });
      pushSelection(collections.find((collection) => collection.id !== selectedCollection.id)?.id);
    });
  }

  function onToggleQuestion(questionId: string, included: boolean) {
    if (!selectedCollection) return;
    startTransition(async () => {
      setFeedback(null);
      const result = await setCollectionQuestionAction(selectedCollection.id, questionId, included, returnTo);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-panel border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <FolderKanban className="size-4 text-primary" aria-hidden />
            <h2 className="text-base font-semibold">New collection</h2>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="collection-new-name" className="block text-sm font-medium">
                Name
              </label>
              <input
                id="collection-new-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                disabled={controlsDisabled}
                className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="collection-new-description" className="block text-sm font-medium">
                Description
              </label>
              <textarea
                id="collection-new-description"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                disabled={controlsDisabled}
                rows={3}
                className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={onCreate}
              disabled={controlsDisabled}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              <Plus className="size-4" aria-hidden />
              Create collection
            </button>
          </div>
        </section>

        <section className="rounded-panel border border-line bg-surface p-4">
          <h2 className="text-base font-semibold">Your collections</h2>
          {collections.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Create a private collection to group published questions for focused review or timed mocks.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {collections.map((collection) => {
                const params = new URLSearchParams(searchParams);
                params.delete("collectionId");
                return (
                  <li key={collection.id}>
                    <Link
                      href={withQuery(collectionPath(collection.id), params)}
                      className={`block rounded-control border px-3 py-2 text-sm ${
                        selectedCollection?.id === collection.id ? "border-primary bg-emerald-50 text-primary" : "border-line hover:bg-canvas"
                      }`}
                    >
                      <span className="block font-medium">{collection.name}</span>
                      <span className="mt-1 block text-muted">{collection.itemCount} question{collection.itemCount === 1 ? "" : "s"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      <div className="space-y-4">
        <ActionFeedback feedback={feedback} />

        {selectedQuestionRequested ? (
          <section className="rounded-panel border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <Bookmark className="size-4 text-primary" aria-hidden />
              <h2 className="text-base font-semibold">Question from details page</h2>
            </div>
            {selectedQuestion ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{selectedQuestion.title}</p>
                  <p className="mt-1 text-sm text-muted">{selectedQuestion.topicLabel} · {selectedQuestion.difficulty}</p>
                </div>
                {selectedCollection ? (
                  <button
                    type="button"
                    onClick={() => onToggleQuestion(selectedQuestion.id, !selectedQuestionInCollection)}
                    disabled={pending}
                    className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60"
                  >
                    {selectedQuestionInCollection ? "Remove from collection" : "Add to selected collection"}
                  </button>
                ) : (
                  <span className="text-sm text-muted">Create or choose a collection first.</span>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">That question is no longer available to add to a collection.</p>
            )}
          </section>
        ) : null}

        {selectedCollection ? (
          <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Edit collection</h2>
                <p className="mt-1 text-sm text-muted">Only you can see these notes and memberships.</p>
              </div>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-4 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="collection-edit-name" className="block text-sm font-medium">
                  Name
                </label>
                <input
                  id="collection-edit-name"
                  value={editName}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      [selectedCollection.id]: { ...current[selectedCollection.id], name: event.target.value },
                    }))
                  }
                  disabled={controlsDisabled}
                  className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:opacity-60"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="collection-edit-description" className="block text-sm font-medium">
                  Description
                </label>
                <textarea
                  id="collection-edit-description"
                  value={editDescription}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      [selectedCollection.id]: { ...current[selectedCollection.id], description: event.target.value },
                    }))
                  }
                  disabled={controlsDisabled}
                  rows={3}
                  className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm disabled:opacity-60"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={controlsDisabled}
              className="mt-4 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              Save collection
            </button>
          </section>
        ) : null}

        <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Questions in this collection</h2>
              <p className="mt-1 text-sm text-muted">Unavailable questions stay visible here so you can remove them without exposing private drafts.</p>
            </div>
            {selectedCollection ? (
              <Link
                href={`/practice?collectionId=${selectedCollection.id}`}
                className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas"
              >
                Practice this collection
              </Link>
            ) : null}
          </div>
          {!selectedCollection ? (
            <p className="mt-4 text-sm text-muted">Choose a collection to inspect its membership.</p>
          ) : selectedCollection.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No questions yet. Add one from the published bank below or from a question detail page.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {selectedCollection.items.map((item) => (
                <li key={item.questionId} className="rounded-control border border-line px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 text-sm text-muted">{item.topicLabel} · {item.difficulty}</p>
                      {item.tags.length > 0 ? <p className="mt-1 text-sm text-muted">#{item.tags.join(" #")}</p> : null}
                      {!item.available ? <p className="mt-2 text-sm text-danger">No longer available for new sessions.</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleQuestion(item.questionId, false)}
                      disabled={pending}
                      className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Published bank</h2>
              <p className="mt-1 text-sm text-muted">Filter the shared bank or saved questions, then add them into your private collection.</p>
            </div>
          </div>
          <form className="mt-4 grid gap-3 rounded-control border border-line p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] sm:items-end">
            <input type="hidden" name="collectionId" value={selectedCollection?.id ?? ""} />
            <input type="hidden" name="questionId" value={selectedQuestion?.id ?? (selectedQuestionRequested ? searchParams.get("questionId") ?? "" : "")} />
            <div>
              <label htmlFor="collections-q" className="block text-sm font-medium">
                Search
              </label>
              <input
                id="collections-q"
                name="q"
                defaultValue={searchParams.get("q") ?? ""}
                className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="collections-topic" className="block text-sm font-medium">
                Topic
              </label>
              <select
                id="collections-topic"
                name="topic"
                defaultValue={searchParams.get("topic") ?? ""}
                className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
              >
                <option value="">All topics</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.slug}>
                    {topic.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="saved" value="1" defaultChecked={searchParams.get("saved") === "1"} />
              Saved only
            </label>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-medium text-white">
              Apply
            </button>
          </form>

          {library.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No published questions match these filters.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {library.items.map((question) => {
                const included = selectedCollection?.items.some((item) => item.questionId === question.id) ?? false;
                return (
                  <li key={question.id} className="rounded-control border border-line px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{question.title}</p>
                        <p className="mt-1 text-sm text-muted">{question.topicLabel} · {question.difficulty} · {question.authorAlias}</p>
                        {question.tags.length > 0 ? <p className="mt-1 text-sm text-muted">#{question.tags.join(" #")}</p> : null}
                      </div>
                      {selectedCollection ? (
                        <button
                          type="button"
                          onClick={() => onToggleQuestion(question.id, !included)}
                          disabled={pending}
                          className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60"
                        >
                          {included ? "Remove" : "Add"}
                        </button>
                      ) : (
                        <span className="text-sm text-muted">Choose a collection to add questions.</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}