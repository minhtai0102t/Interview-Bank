import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { moderateQuestion, listModerationQuestions } from "@/features/admin/service";
import { STARTER_BANK } from "@/features/questions/starter-bank";
import { saveProfileSettings, getProfileSettings } from "@/features/profile/service";
import { archiveQuestion, getPublicQuestion, publishQuestion, saveQuestion, unpublishQuestion } from "@/features/questions/service";
import { MAX_ALIAS_CHARS } from "@/features/questions/limits";
import type { Actor } from "@/lib/actor";
import type { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

import { seedStarterBank } from "../../scripts/seed";
import { createTopic, createUser, disconnectDatabase, resetDatabase } from "../helpers/database";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const prisma = getPrisma();

function actorFromUser(user: { id: string; name: string; role: string }): Actor {
  return { userId: user.id, role: user.role as Actor["role"], name: user.name };
}

async function createPublishedQuestion(owner: Actor, title: string) {
  const topic = await createTopic();
  const draft = await saveQuestion(owner, {
    title,
    promptMarkdown: `${title} prompt`,
    answerMarkdown: `${title} answer`,
    topicId: topic.id,
    difficulty: "MEDIUM",
    tags: ["task-4"],
  });

  return publishQuestion(owner, draft.id, draft.draftVersion);
}

describe("profile settings", () => {
  it("defaults to UTC, validates inputs, and exposes only the public alias on published questions", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner Name", email: "owner@example.test" }));

    expect(await getProfileSettings(owner)).toEqual({ publicAlias: null, timeZone: "UTC" });

    await expect(
      saveProfileSettings(owner, { publicAlias: "x".repeat(MAX_ALIAS_CHARS + 1), timeZone: "UTC" }),
    ).rejects.toThrow(expect.objectContaining<Partial<DomainError>>({ code: "INVALID_INPUT" }));

    await expect(
      saveProfileSettings(owner, { publicAlias: "Owner", timeZone: "Mars/Olympus_Mons" }),
    ).rejects.toThrow(expect.objectContaining<Partial<DomainError>>({ code: "INVALID_INPUT" }));

    await expect(
      saveProfileSettings(owner, { publicAlias: "  Focus Friend  ", timeZone: "US/Eastern" }),
    ).resolves.toEqual({ publicAlias: "Focus Friend", timeZone: "America/New_York" });

    const aliased = await createPublishedQuestion(owner, "Aliased question");
    expect((await getPublicQuestion(aliased.id))?.authorAlias).toBe("Focus Friend");

    const anonymousOwner = actorFromUser(await createUser({ name: "Private Name", email: "private@example.test" }));
    const anonymous = await createPublishedQuestion(anonymousOwner, "Anonymous question");
    const publicQuestion = await getPublicQuestion(anonymous.id);

    expect(publicQuestion?.authorAlias).toBe("Anonymous");
    expect(publicQuestion?.authorAlias).not.toBe("Private Name");
    expect(publicQuestion?.authorAlias).not.toBe("private@example.test");
  });
});

describe("question moderation", () => {
  it("requires an admin to read moderation data or remove and restore public visibility", async () => {
    const admin = actorFromUser(await createUser({ name: "Admin", role: "ADMIN" }));
    const member = actorFromUser(await createUser({ name: "Member", role: "USER" }));
    const author = actorFromUser(await createUser({ name: "Author", role: "USER" }));
    const published = await createPublishedQuestion(author, "Moderated question");

    await expect(listModerationQuestions(member)).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "FORBIDDEN" }),
    );
    await expect(moderateQuestion(member, published.id, "REMOVED")).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "FORBIDDEN" }),
    );

    const queue = await listModerationQuestions(admin);
    expect(queue.map((question) => question.id)).toContain(published.id);

    await moderateQuestion(admin, published.id, "REMOVED");
    expect(await getPublicQuestion(published.id)).toBeNull();

    const removedRecord = await prisma.question.findUniqueOrThrow({ where: { id: published.id } });
    expect(removedRecord).toMatchObject({
      title: "Moderated question",
      answerMarkdown: "Moderated question answer",
      moderationState: "REMOVED",
    });

    await moderateQuestion(admin, published.id, "ACTIVE");
    expect((await getPublicQuestion(published.id))?.title).toBe("Moderated question");
  });

  it("does not let crafted admin calls moderate never-published, unpublished, or archived questions", async () => {
    const admin = actorFromUser(await createUser({ name: "Admin", role: "ADMIN" }));
    const author = actorFromUser(await createUser({ name: "Author", role: "USER" }));
    const topic = await createTopic();

    const draftOnly = await saveQuestion(author, {
      title: "Draft only",
      promptMarkdown: "Draft only prompt",
      answerMarkdown: "Draft only answer",
      topicId: topic.id,
      difficulty: "MEDIUM",
      tags: ["task-4"],
    });

    const publishedThenUnpublished = await createPublishedQuestion(author, "Unpublished question");
    const unpublished = await unpublishQuestion(author, publishedThenUnpublished.id);

    const publishedThenArchived = await createPublishedQuestion(author, "Archived question");
    await archiveQuestion(author, publishedThenArchived.id);

    await expect(moderateQuestion(admin, draftOnly.id, "REMOVED")).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "NOT_FOUND" }),
    );
    await expect(moderateQuestion(admin, unpublished.id, "REMOVED")).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "NOT_FOUND" }),
    );
    await expect(moderateQuestion(admin, publishedThenArchived.id, "REMOVED")).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }),
    );

    expect((await prisma.question.findUniqueOrThrow({ where: { id: draftOnly.id } })).moderationState).toBe("ACTIVE");
    expect((await prisma.question.findUniqueOrThrow({ where: { id: unpublished.id } })).moderationState).toBe("ACTIVE");
    expect((await prisma.question.findUniqueOrThrow({ where: { id: publishedThenArchived.id } })).moderationState).toBe("ACTIVE");

    await expect(publishQuestion(author, unpublished.id, unpublished.draftVersion)).resolves.toMatchObject({
      id: unpublished.id,
      currentPublishedRevisionId: expect.any(String),
    });
  });
});

describe("starter bank seed", () => {
  it("is idempotent and does not overwrite existing user-authored content", async () => {
    const author = actorFromUser(await createUser({ name: "Existing Author", role: "USER" }));
    const customTopic = await createTopic({ slug: "custom-topic", label: "Custom Topic", sortOrder: 99 });
    const customDraft = await saveQuestion(author, {
      title: "Existing user question",
      promptMarkdown: "Keep this prompt.",
      answerMarkdown: "Keep this answer.",
      topicId: customTopic.id,
      difficulty: "EASY",
      tags: ["custom"],
    });
    await publishQuestion(author, customDraft.id, customDraft.draftVersion);

    await seedStarterBank();
    const firstCounts = {
      topics: await prisma.topic.count(),
      questions: await prisma.question.count(),
      revisions: await prisma.questionRevision.count(),
    };

    await seedStarterBank();
    const secondCounts = {
      topics: await prisma.topic.count(),
      questions: await prisma.question.count(),
      revisions: await prisma.questionRevision.count(),
    };

    expect(firstCounts).toEqual(secondCounts);
    expect(secondCounts.topics).toBeGreaterThanOrEqual(6);
    expect(secondCounts.questions).toBeGreaterThanOrEqual(48);

    const customQuestion = await prisma.question.findUniqueOrThrow({ where: { id: customDraft.id } });
    expect(customQuestion).toMatchObject({
      title: "Existing user question",
      promptMarkdown: "Keep this prompt.",
      answerMarkdown: "Keep this answer.",
      authorId: author.userId,
    });
  });

  it("fails clearly and leaves no partial writes when a starter topic slug collides with a different existing topic id", async () => {
    const starterTopic = STARTER_BANK[0]!;

    await createTopic({
      id: "10000000-0000-4000-8000-999999999999",
      slug: starterTopic.slug,
      label: "User Topic",
      sortOrder: 77,
    });

    await expect(seedStarterBank()).rejects.toThrow(/starter topic conflict/i);

    expect(await prisma.topic.count()).toBe(1);
    expect(await prisma.question.count()).toBe(0);
    expect(await prisma.questionRevision.count()).toBe(0);
  });
});