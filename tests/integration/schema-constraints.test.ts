import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { MAX_ALIAS_CHARS, QUESTION_LIMITS } from "@/features/questions/limits";
import { getPrisma } from "@/lib/prisma";

import {
  createQuestion,
  createRevision,
  createTopic,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/database";

const prisma = getPrisma();

/** The database must refuse the operation, and the error must name the rule that refused it. */
async function expectRefused(operation: PromiseLike<unknown>, rule: string): Promise<void> {
  await expect(Promise.resolve(operation)).rejects.toThrow(rule);
}

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("user", () => {
  it("defaults the role to USER", async () => {
    const user = await createUser();

    expect(user.role).toBe("USER");
  });

  it("accepts ADMIN and refuses any other role", async () => {
    expect((await createUser({ role: "ADMIN" })).role).toBe("ADMIN");

    await expectRefused(createUser({ role: "OWNER" }), "user_role_check");
    await expectRefused(createUser({ role: "admin" }), "user_role_check");
  });

  it("keeps emails unique", async () => {
    await createUser({ email: "same@example.test" });

    await expectRefused(createUser({ email: "same@example.test" }), "Unique constraint");
  });
});

describe("account", () => {
  it("lets one provider identity belong to one user only", async () => {
    const [first, second] = await Promise.all([createUser(), createUser()]);
    const identity = { providerId: "google", accountId: "109876" };
    await prisma.account.create({ data: { id: "a1", userId: first.id, ...identity } });

    await expectRefused(prisma.account.create({ data: { id: "a2", userId: second.id, ...identity } }), "Unique constraint");
  });
});

describe("profile", () => {
  it("defaults the time zone to UTC and the alias to none", async () => {
    const user = await createUser();

    const profile = await prisma.profile.create({ data: { userId: user.id } });

    expect(profile).toMatchObject({ timeZone: "UTC", publicAlias: null });
  });

  it("limits the public alias to a visible name of reasonable length", async () => {
    const user = await createUser();
    const withAlias = (publicAlias: string) => prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, publicAlias },
      update: { publicAlias },
    });

    await expect(withAlias("a".repeat(MAX_ALIAS_CHARS))).resolves.toMatchObject({ publicAlias: "a".repeat(MAX_ALIAS_CHARS) });
    await expectRefused(withAlias("a".repeat(MAX_ALIAS_CHARS + 1)), "profile_alias_check");
    await expectRefused(withAlias("   "), "profile_alias_check");
    await expectRefused(withAlias(""), "profile_alias_check");
  });

  it("is removed together with its user", async () => {
    const user = await createUser();
    await prisma.profile.create({ data: { userId: user.id } });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.profile.count()).toBe(0);
  });
});

describe("topic", () => {
  it("requires a lowercase hyphenated slug and a visible label", async () => {
    await expect(createTopic({ slug: "system-design" })).resolves.toMatchObject({ slug: "system-design" });

    for (const slug of ["System-Design", "system design", "-system", "system-", "system--design", ""]) {
      await expectRefused(createTopic({ slug }), "topic_slug_check");
    }
    await expectRefused(createTopic({ label: "  " }), "topic_label_check");
  });

  it("keeps slugs unique", async () => {
    await createTopic({ slug: "algorithms" });

    await expectRefused(createTopic({ slug: "algorithms" }), "Unique constraint");
  });

  it("cannot be deleted while questions use it", async () => {
    const question = await createQuestion();

    await expectRefused(prisma.topic.delete({ where: { id: question.topicId } }), "Foreign key constraint");
  });
});

describe("question", () => {
  it("stores a complete question with defaults for the lifecycle columns", async () => {
    const author = await createUser();

    const question = await createQuestion({ authorId: author.id });

    expect(question).toMatchObject({
      authorId: author.id,
      draftVersion: 1,
      currentPublishedRevisionId: null,
      archivedAt: null,
      moderationState: "ACTIVE",
    });
    expect(question.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("limits the title to a visible text of at most the allowed length", async () => {
    const { maxTitleChars } = QUESTION_LIMITS;

    await expect(createQuestion({ title: "t".repeat(maxTitleChars) })).resolves.toBeDefined();
    await expectRefused(createQuestion({ title: "t".repeat(maxTitleChars + 1) }), "question_title_check");
    await expectRefused(createQuestion({ title: " \n\t " }), "question_title_check");
  });

  it("limits the prompt by its size in bytes, not characters", async () => {
    const { maxPromptBytes } = QUESTION_LIMITS;

    await expect(createQuestion({ promptMarkdown: "p".repeat(maxPromptBytes) })).resolves.toBeDefined();
    await expectRefused(createQuestion({ promptMarkdown: "p".repeat(maxPromptBytes + 1) }), "question_prompt_check");
    // Half as many characters, each two bytes long: still one byte too many.
    await expectRefused(createQuestion({ promptMarkdown: "é".repeat(maxPromptBytes / 2 + 1) }), "question_prompt_check");
    await expectRefused(createQuestion({ promptMarkdown: "   " }), "question_prompt_check");
  });

  it("allows a working copy without an answer yet but limits its size", async () => {
    const { maxAnswerBytes } = QUESTION_LIMITS;

    await expect(createQuestion({ answerMarkdown: "" })).resolves.toBeDefined();
    await expect(createQuestion({ answerMarkdown: "a".repeat(maxAnswerBytes) })).resolves.toBeDefined();
    await expectRefused(createQuestion({ answerMarkdown: "a".repeat(maxAnswerBytes + 1) }), "question_answer_check");
  });

  it("limits the number and the length of tags", async () => {
    const { maxTags, maxTagChars } = QUESTION_LIMITS;

    await expect(createQuestion({ tags: [] })).resolves.toBeDefined();
    await expect(createQuestion({ tags: Array.from({ length: maxTags }, (_, index) => `tag-${index}`) })).resolves.toBeDefined();
    await expect(createQuestion({ tags: ["t".repeat(maxTagChars)] })).resolves.toBeDefined();

    await expectRefused(createQuestion({ tags: Array.from({ length: maxTags + 1 }, (_, index) => `tag-${index}`) }), "question_tags_check");
    await expectRefused(createQuestion({ tags: ["t".repeat(maxTagChars + 1)] }), "question_tags_check");
    await expectRefused(createQuestion({ tags: ["ok", ""] }), "question_tags_check");
    await expectRefused(createQuestion({ tags: ["ok", "  "] }), "question_tags_check");
  });

  it("refuses a tag list that holds a null", async () => {
    const topic = await createTopic();

    await expectRefused(
      prisma.$executeRaw`INSERT INTO "question" ("id", "title", "promptMarkdown", "answerMarkdown", "topicId", "difficulty", "tags", "updatedAt")
        VALUES (gen_random_uuid(), 't', 'p', 'a', ${topic.id}::uuid, 'EASY', ARRAY['ok', NULL]::text[], now())`,
      "question_tags_check",
    );
  });

  it("refuses a missing tag list", async () => {
    const topic = await createTopic();

    await expectRefused(
      prisma.$executeRaw`INSERT INTO "question" ("id", "title", "promptMarkdown", "answerMarkdown", "topicId", "difficulty", "tags", "updatedAt")
        VALUES (gen_random_uuid(), 't', 'p', 'a', ${topic.id}::uuid, 'EASY', NULL, now())`,
      "question_tags_check",
    );
  });

  it("starts at draft version 1 and never goes below", async () => {
    await expectRefused(createQuestion({ draftVersion: 0 }), "question_draft_version_check");
  });

  it("outlives its author as an anonymous question", async () => {
    const author = await createUser();
    const question = await createQuestion({ authorId: author.id });

    await prisma.user.delete({ where: { id: author.id } });

    expect(await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).toMatchObject({ authorId: null });
  });
});

describe("question revision", () => {
  it("snapshots a complete question", async () => {
    const question = await createQuestion();

    const revision = await createRevision(question);

    expect(revision).toMatchObject({ questionId: question.id, draftVersion: 1, publishedAt: null });
  });

  it("needs visible title, prompt and answer within the same limits as a question", async () => {
    const question = await createQuestion();

    await expectRefused(createRevision(question, { title: "t".repeat(QUESTION_LIMITS.maxTitleChars + 1) }), "question_revision_title_check");
    await expectRefused(createRevision(question, { promptMarkdown: " " }), "question_revision_prompt_check");
    await expectRefused(
      createRevision(question, { promptMarkdown: "p".repeat(QUESTION_LIMITS.maxPromptBytes + 1) }),
      "question_revision_prompt_check",
    );
    await expectRefused(createRevision(question, { answerMarkdown: "" }), "question_revision_answer_check");
    await expectRefused(
      createRevision(question, { answerMarkdown: "a".repeat(QUESTION_LIMITS.maxAnswerBytes + 1) }),
      "question_revision_answer_check",
    );
    await expectRefused(createRevision(question, { tags: ["a", ""] }), "question_revision_tags_check");
    await expectRefused(createRevision(question, { draftVersion: 0 }), "question_revision_draft_version_check");
  });

  it("allows one snapshot per draft version of a question", async () => {
    const question = await createQuestion();
    await createRevision(question, { draftVersion: 1 });

    await expectRefused(createRevision(question, { draftVersion: 1 }), "Unique constraint");
    await expect(createRevision(question, { draftVersion: 2 })).resolves.toBeDefined();
  });

  it("never changes its content once created", async () => {
    const question = await createQuestion();
    const other = await createQuestion();
    const revision = await createRevision(question);
    const update = (data: Parameters<typeof prisma.questionRevision.update>[0]["data"]) =>
      prisma.questionRevision.update({ where: { id: revision.id }, data });

    await expectRefused(update({ title: "Changed" }), "question_revision_immutable");
    await expectRefused(update({ promptMarkdown: "Changed" }), "question_revision_immutable");
    await expectRefused(update({ answerMarkdown: "Changed" }), "question_revision_immutable");
    await expectRefused(update({ difficulty: "HARD" }), "question_revision_immutable");
    await expectRefused(update({ tags: ["changed"] }), "question_revision_immutable");
    await expectRefused(update({ draftVersion: 2 }), "question_revision_immutable");
    await expectRefused(update({ createdAt: new Date("2001-01-01T00:00:00Z") }), "question_revision_immutable");
    await expectRefused(update({ topic: { connect: { id: (await createTopic()).id } } }), "question_revision_immutable");
    await expectRefused(update({ question: { connect: { id: other.id } } }), "question_revision_immutable");

    expect(await prisma.questionRevision.findUniqueOrThrow({ where: { id: revision.id } })).toEqual(revision);
  });

  it("lets its publication time be recorded", async () => {
    const revision = await createRevision(await createQuestion());
    const publishedAt = new Date("2026-01-02T03:04:05.000Z");

    const updated = await prisma.questionRevision.update({ where: { id: revision.id }, data: { publishedAt } });

    expect(updated.publishedAt).toEqual(publishedAt);
    expect(updated.title).toBe(revision.title);
  });

  it("keeps a question from being deleted while it has snapshots", async () => {
    const question = await createQuestion();
    await createRevision(question);

    await expectRefused(prisma.question.delete({ where: { id: question.id } }), "Foreign key constraint");
  });
});

describe("published revision pointer", () => {
  it("points a question at one of its own snapshots", async () => {
    const question = await createQuestion();
    const revision = await createRevision(question);

    const published = await prisma.question.update({
      where: { id: question.id },
      data: { currentPublishedRevisionId: revision.id },
    });

    expect(published.currentPublishedRevisionId).toBe(revision.id);
  });

  it("refuses a snapshot that belongs to another question", async () => {
    const question = await createQuestion();
    const other = await createQuestion();
    const foreignRevision = await createRevision(other);

    await expectRefused(
      prisma.question.update({ where: { id: question.id }, data: { currentPublishedRevisionId: foreignRevision.id } }),
      "Foreign key constraint",
    );
  });

  it("keeps the published snapshot from being deleted", async () => {
    const question = await createQuestion();
    const revision = await createRevision(question);
    await prisma.question.update({ where: { id: question.id }, data: { currentPublishedRevisionId: revision.id } });

    await expectRefused(prisma.questionRevision.delete({ where: { id: revision.id } }), "Foreign key constraint");
  });

  it("can be cleared again", async () => {
    const question = await createQuestion();
    const revision = await createRevision(question);
    await prisma.question.update({ where: { id: question.id }, data: { currentPublishedRevisionId: revision.id } });

    const unpublished = await prisma.question.update({ where: { id: question.id }, data: { currentPublishedRevisionId: null } });

    expect(unpublished.currentPublishedRevisionId).toBeNull();
  });
});

describe("bookmark", () => {
  it("is stored once per user and question", async () => {
    const [user, question] = await Promise.all([createUser(), createQuestion()]);
    await prisma.bookmark.create({ data: { userId: user.id, questionId: question.id } });

    await expectRefused(prisma.bookmark.create({ data: { userId: user.id, questionId: question.id } }), "Unique constraint");
  });

  it("disappears with its question or its user", async () => {
    const [user, other, question] = await Promise.all([createUser(), createUser(), createQuestion()]);
    await prisma.bookmark.createMany({
      data: [
        { userId: user.id, questionId: question.id },
        { userId: other.id, questionId: question.id },
      ],
    });

    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.bookmark.count()).toBe(1);

    await prisma.question.delete({ where: { id: question.id } });
    expect(await prisma.bookmark.count()).toBe(0);
  });
});
