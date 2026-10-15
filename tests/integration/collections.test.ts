import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { publishQuestion, saveQuestion, unpublishQuestion } from "@/features/questions/service";
import {
  deleteCollection,
  getCollection,
  listCollections,
  saveCollection,
  setCollectionQuestion,
} from "@/features/collections/service";
import type { Actor } from "@/lib/actor";
import type { DomainError } from "@/lib/errors";

import { createTopic, createUser, disconnectDatabase, resetDatabase } from "../helpers/database";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

function actorFromUser(user: { id: string; name: string }): Actor {
  return { userId: user.id, role: "USER", name: user.name };
}

async function createPublishedQuestion(owner: Actor, title: string) {
  const topic = await createTopic();
  const draft = await saveQuestion(owner, {
    title,
    promptMarkdown: `${title} prompt`,
    answerMarkdown: `${title} answer`,
    topicId: topic.id,
    difficulty: "MEDIUM",
    tags: ["collections"],
  });

  return publishQuestion(owner, draft.id, draft.draftVersion);
}

describe("collections", () => {
  it("lists only the owner's collections and supports create, update, and delete", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const other = actorFromUser(await createUser({ name: "Other" }));

    const created = await saveCollection(owner, { name: "System design", description: "Distributed systems" });
    await saveCollection(other, { name: "Other", description: "Not mine" });

    expect((await listCollections(owner)).map((collection) => collection.id)).toEqual([created.id]);

    const updated = await saveCollection(owner, { name: "System design updated", description: "Queues" }, created.id);
    expect(updated).toMatchObject({ id: created.id, name: "System design updated", description: "Queues" });

    await deleteCollection(owner, created.id);
    expect(await listCollections(owner)).toEqual([]);
  });

  it("lets the owner include or remove published questions but refuses unavailable ones", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const stranger = actorFromUser(await createUser({ name: "Stranger" }));
    const published = await createPublishedQuestion(owner, "Published question");
    const collection = await saveCollection(owner, { name: "Review set", description: "Practice" });

    await setCollectionQuestion(owner, collection.id, published.id, true);

    const stored = await getCollection(owner, collection.id);
    expect(stored.items.map((item) => item.questionId)).toEqual([published.id]);
    expect(stored.items[0]).toMatchObject({ available: true, title: "Published question" });

    await setCollectionQuestion(owner, collection.id, published.id, false);
    expect((await getCollection(owner, collection.id)).items).toEqual([]);

    const privateTopic = await createTopic();
    const privateDraft = await saveQuestion(owner, {
      title: "Private draft",
      promptMarkdown: "Hidden prompt",
      answerMarkdown: "Hidden answer",
      topicId: privateTopic.id,
      difficulty: "HARD",
      tags: ["private"],
    });

    await expect(setCollectionQuestion(owner, collection.id, privateDraft.id, true)).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "NOT_FOUND" }),
    );
    await expect(getCollection(stranger, collection.id)).rejects.toThrow(expect.objectContaining<Partial<DomainError>>({ code: "NOT_FOUND" }));
  });

  it("keeps historical membership private when a collected question later disappears from the library", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const published = await createPublishedQuestion(owner, "Published question");
    const collection = await saveCollection(owner, { name: "Review set", description: "Practice" });

    await setCollectionQuestion(owner, collection.id, published.id, true);
    await unpublishQuestion(owner, published.id);

    const stored = await getCollection(owner, collection.id);

    expect(stored.items[0]).toMatchObject({ questionId: published.id, available: false, title: "Published question" });
  });
});