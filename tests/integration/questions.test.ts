import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { QuestionInput } from "@/features/questions/input";
import {
  archiveQuestion,
  getPublicQuestion,
  listLibrary,
  listTopics,
  publishQuestion,
  saveQuestion,
  saveImportedQuestions,
  setBookmark,
} from "@/features/questions/service";
import type { Actor } from "@/lib/actor";
import type { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

import {
  createTopic,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/database";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const prisma = getPrisma();

function actorFromUser(user: { id: string; name: string }): Actor {
  return { userId: user.id, role: "USER", name: user.name };
}

describe("questions publication", () => {
  it("keeps draft-only edits out of the public question", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const other = actorFromUser(await createUser({ name: "Other" }));
    const topic = await createTopic();
    const originalInput = {
      title: "What is a closure?",
      promptMarkdown: "Explain what a closure is.",
      answerMarkdown: "A function together with the scope it was created in.",
      topicId: topic.id,
      difficulty: "MEDIUM" as const,
      tags: ["javascript"],
    };

    const draft = await saveQuestion(owner, originalInput);

    await publishQuestion(owner, draft.id, draft.draftVersion);
    await saveQuestion(
      owner,
      { ...originalInput, answerMarkdown: "Private edit" },
      draft.id,
      draft.draftVersion,
    );

    expect((await getPublicQuestion(draft.id))?.answerMarkdown).toBe(originalInput.answerMarkdown);
    await expect(saveQuestion(other, originalInput, draft.id, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("counts published questions under the published topic after the draft topic changes", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const publishedTopic = await createTopic({ slug: "published-topic", label: "Published Topic", sortOrder: 1 });
    const draftTopic = await createTopic({ slug: "draft-topic", label: "Draft Topic", sortOrder: 2 });
    const draft = await saveQuestion(owner, {
      title: "Published under one topic",
      promptMarkdown: "Prompt",
      answerMarkdown: "Answer",
      topicId: publishedTopic.id,
      difficulty: "MEDIUM",
      tags: ["topic-count"],
    });

    await publishQuestion(owner, draft.id, draft.draftVersion);
    await saveQuestion(
      owner,
      {
        title: draft.title,
        promptMarkdown: draft.promptMarkdown,
        answerMarkdown: draft.answerMarkdown,
        topicId: draftTopic.id,
        difficulty: draft.difficulty,
        tags: draft.tags,
      },
      draft.id,
      draft.draftVersion,
    );

    const topics = await listTopics();

    expect(topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: publishedTopic.id, publishedQuestionCount: 1 }),
        expect.objectContaining({ id: draftTopic.id, publishedQuestionCount: 0 }),
      ]),
    );
  });

  it("rejects stale draft updates", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic();
    const draft = await saveQuestion(owner, {
      title: "Original",
      promptMarkdown: "Prompt",
      answerMarkdown: "Answer",
      topicId: topic.id,
      difficulty: "EASY",
      tags: ["basics"],
    });

    await saveQuestion(owner, {
      title: "Updated once",
      promptMarkdown: "Prompt",
      answerMarkdown: "Answer",
      topicId: topic.id,
      difficulty: "EASY",
      tags: ["basics"],
    }, draft.id, draft.draftVersion);

    await expect(
      saveQuestion(owner, {
        title: "Updated twice",
        promptMarkdown: "Prompt",
        answerMarkdown: "Answer",
        topicId: topic.id,
        difficulty: "EASY",
        tags: ["basics"],
      }, draft.id, draft.draftVersion),
    ).rejects.toThrow(expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }));
  });

  it("rejects saving an archived draft from a stale tab", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic();
    const draft = await saveQuestion(owner, {
      title: "Original",
      promptMarkdown: "Prompt",
      answerMarkdown: "Answer",
      topicId: topic.id,
      difficulty: "EASY",
      tags: ["basics"],
    });

    await archiveQuestion(owner, draft.id);

    await expect(
      saveQuestion(
        owner,
        {
          title: "Archived edit",
          promptMarkdown: "Prompt",
          answerMarkdown: "Answer",
          topicId: topic.id,
          difficulty: "EASY",
          tags: ["basics"],
        },
        draft.id,
        draft.draftVersion,
      ),
    ).rejects.toThrow(expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }));
  });

  it("only lists published revisions in the public library and supports bookmarks", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const reader = actorFromUser(await createUser({ name: "Reader" }));
    const topic = await createTopic({ slug: "javascript", label: "JavaScript" });

    const publicQuestion = await saveQuestion(owner, {
      title: "Closures",
      promptMarkdown: "Explain closures.",
      answerMarkdown: "They capture lexical scope.",
      topicId: topic.id,
      difficulty: "MEDIUM",
      tags: ["javascript", "scope"],
    });
    await publishQuestion(owner, publicQuestion.id, publicQuestion.draftVersion);

    const draftOnly = await saveQuestion(owner, {
      title: "Private draft",
      promptMarkdown: "Hidden prompt",
      answerMarkdown: "Hidden answer",
      topicId: topic.id,
      difficulty: "HARD",
      tags: ["private"],
    });

    await setBookmark(reader, publicQuestion.id, true);

    const library = await listLibrary({ q: "closure", topic: "javascript", difficulty: "MEDIUM", tag: "scope", page: 1 }, reader);
    const savedOnly = await listLibrary({ saved: true, page: 1 }, reader);

    expect(library.items.map((item) => item.id)).toEqual([publicQuestion.id]);
    expect(library.items[0]).toMatchObject({ saved: true, title: "Closures" });
    expect(savedOnly.items.map((item) => item.id)).toEqual([publicQuestion.id]);
    expect(await getPublicQuestion(draftOnly.id)).toBeNull();
  });

  it("clamps out-of-range library pages to the nearest valid page", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic({ slug: "javascript", label: "JavaScript" });
    const publicQuestion = await saveQuestion(owner, {
      title: "Closures",
      promptMarkdown: "Explain closures.",
      answerMarkdown: "They capture lexical scope.",
      topicId: topic.id,
      difficulty: "MEDIUM",
      tags: ["javascript", "scope"],
    });

    await publishQuestion(owner, publicQuestion.id, publicQuestion.draftVersion);

    const beyondLastPage = await listLibrary({ q: "closure", page: 999 });
    const zeroResults = await listLibrary({ q: "missing", page: 999 });

    expect(beyondLastPage.page).toBe(1);
    expect(beyondLastPage.pageCount).toBe(1);
    expect(beyondLastPage.items.map((item) => item.id)).toEqual([publicQuestion.id]);

    expect(zeroResults.page).toBe(1);
    expect(zeroResults.pageCount).toBe(1);
    expect(zeroResults.items).toEqual([]);
  });

  it("does not let an author republish archived or moderated questions", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic();

    const archived = await saveQuestion(owner, {
      title: "Archived",
      promptMarkdown: "Prompt",
      answerMarkdown: "Answer",
      topicId: topic.id,
      difficulty: "MEDIUM",
      tags: ["archived"],
    });
    await archiveQuestion(owner, archived.id);

    await expect(publishQuestion(owner, archived.id, archived.draftVersion)).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }),
    );

    const moderated = await saveQuestion(owner, {
      title: "Moderated",
      promptMarkdown: "Prompt",
      answerMarkdown: "Answer",
      topicId: topic.id,
      difficulty: "MEDIUM",
      tags: ["moderated"],
    });
    await prisma.question.update({ where: { id: moderated.id }, data: { moderationState: "REMOVED" } });

    await expect(publishQuestion(owner, moderated.id, moderated.draftVersion)).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }),
    );
  });

  it("retries imports idempotently per actor and checks the content matches", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const other = actorFromUser(await createUser({ name: "Other" }));
    const topic = await createTopic();
    const imported: QuestionInput[] = [
      {
        title: "Imported one",
        promptMarkdown: "Prompt one",
        answerMarkdown: "Answer one",
        topicId: topic.id,
        difficulty: "EASY" as const,
        tags: ["imported"],
      },
      {
        title: "Imported two",
        promptMarkdown: "Prompt two",
        answerMarkdown: "Answer two",
        topicId: topic.id,
        difficulty: "HARD" as const,
        tags: ["imported", "advanced"],
      },
    ];

    const first = await saveImportedQuestions(owner, "import-1", imported);
    const second = await saveImportedQuestions(owner, "import-1", imported);
    const third = await saveImportedQuestions(other, "import-1", imported);

    expect(second).toEqual(first);
    expect(third.questionIds).not.toEqual(first.questionIds);
    await expect(
      saveImportedQuestions(owner, "import-1", [{ ...imported[0]!, answerMarkdown: "Changed" }]),
    ).rejects.toThrow(expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }));
  });

  it("returns the stored receipt during concurrent same-content import retries", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic();
    const imported: QuestionInput[] = [
      {
        title: "Imported one",
        promptMarkdown: "Prompt one",
        answerMarkdown: "Answer one",
        topicId: topic.id,
        difficulty: "EASY",
        tags: ["imported"],
      },
      {
        title: "Imported two",
        promptMarkdown: "Prompt two",
        answerMarkdown: "Answer two",
        topicId: topic.id,
        difficulty: "HARD",
        tags: ["imported", "advanced"],
      },
    ];

    const [first, second] = await Promise.all([
      saveImportedQuestions(owner, "import-concurrent", imported),
      saveImportedQuestions(owner, "import-concurrent", imported),
    ]);

    const [questions, receipts] = await Promise.all([
      prisma.question.findMany({ where: { authorId: owner.userId }, orderBy: { id: "asc" }, select: { id: true } }),
      prisma.importReceipt.findMany({ where: { userId: owner.userId, requestId: "import-concurrent" } }),
    ]);

    expect(second).toEqual(first);
    expect(questions.map((question) => question.id)).toEqual(first.questionIds.slice().sort());
    expect(receipts).toHaveLength(1);
  });

  it("rejects concurrent same-key imports when the content differs", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic();
    const firstInput: QuestionInput[] = [{
      title: "Imported one",
      promptMarkdown: "Prompt one",
      answerMarkdown: "Answer one",
      topicId: topic.id,
      difficulty: "EASY",
      tags: ["imported"],
    }];
    const secondInput: QuestionInput[] = [{
      ...firstInput[0]!,
      answerMarkdown: "Changed answer",
    }];

    const results = await Promise.allSettled([
      saveImportedQuestions(owner, "import-concurrent-conflict", firstInput),
      saveImportedQuestions(owner, "import-concurrent-conflict", secondInput),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    const receipts = await prisma.importReceipt.findMany({ where: { userId: owner.userId, requestId: "import-concurrent-conflict" } });

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toEqual(expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }));
    expect(receipts).toHaveLength(1);
  });
});