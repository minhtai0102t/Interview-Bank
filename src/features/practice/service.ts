import { PracticeMode } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/actor";
import { requireActor } from "@/lib/actor";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

import { PUBLIC_QUESTION_WHERE } from "../questions/service";
import type { Grade } from "ts-fsrs";
import { scheduleReview } from "./scheduler";

export interface PracticeSessionItem {
  id: string;
  revisionId: string;
  questionId: string;
  position: number;
  title: string;
  promptMarkdown: string;
  answerMarkdown: string;
  topicId: string;
  topicLabel: string;
  difficulty: string;
  tags: string[];
  responseMarkdown: string;
  revealedAt: Date | null;
  rating: number | null;
  reviewedAt: Date | null;
}

export interface PracticeSessionView {
  id: string;
  mode: PracticeMode;
  currentPosition: number;
  startedAt: Date;
  completedAt: Date | null;
  timeLimitMinutes: number | null;
  expiresAt: Date | null;
  items: PracticeSessionItem[];
}

export interface ActivePracticeSessionSummary {
  id: string;
  mode: PracticeMode;
  currentPosition: number;
  questionCount: number;
  startedAt: Date;
  expiresAt: Date | null;
}

export interface CreatePracticeSessionInput {
  mode: PracticeMode | "REVIEW" | "MOCK";
  topicId?: string;
  collectionId?: string;
  questionId?: string;
  count: number;
  timeLimitMinutes?: number;
}

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

function conflict(message: string): never {
  throw new DomainError("CONFLICT", message);
}

function notFound(message = "Practice session not found."): never {
  throw new DomainError("NOT_FOUND", message);
}

function parseMode(mode: CreatePracticeSessionInput["mode"]): PracticeMode {
  if (mode === "REVIEW") return PracticeMode.REVIEW;
  if (mode === "MOCK") return PracticeMode.MOCK;
  invalid("mode must be REVIEW or MOCK.");
}

function parseCount(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) invalid("count must be an integer between 1 and 100.");
  return value;
}

function parseTimeLimitMinutes(value: number | undefined, mode: PracticeMode): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 480) invalid("timeLimitMinutes must be an integer between 1 and 480.");
  if (mode !== PracticeMode.MOCK) invalid("timeLimitMinutes is only available for mock sessions.");
  return value;
}

function expiresAtFrom(session: { startedAt: Date; timeLimitMinutes: number | null }): Date | null {
  if (session.timeLimitMinutes == null) return null;
  return new Date(session.startedAt.getTime() + session.timeLimitMinutes * 60_000);
}

function isExpired(session: { startedAt: Date; timeLimitMinutes: number | null }, now: Date): boolean {
  const expiresAt = expiresAtFrom(session);
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

function mapSession(record: Prisma.PracticeSessionGetPayload<{
  include: {
    items: {
      orderBy: { position: "asc" };
      include: { revision: { include: { topic: true } } };
    };
  };
}>): PracticeSessionView {
  return {
    id: record.id,
    mode: record.mode,
    currentPosition: record.currentPosition,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    timeLimitMinutes: record.timeLimitMinutes,
    expiresAt: expiresAtFrom(record),
    items: record.items.map((item) => ({
      id: item.id,
      revisionId: item.revisionId,
      questionId: item.revision.questionId,
      position: item.position,
      title: item.revision.title,
      promptMarkdown: item.revision.promptMarkdown,
      answerMarkdown: item.revision.answerMarkdown,
      topicId: item.revision.topicId,
      topicLabel: item.revision.topic.label,
      difficulty: item.revision.difficulty,
      tags: item.revision.tags,
      responseMarkdown: item.responseMarkdown,
      revealedAt: item.revealedAt,
      rating: item.rating,
      reviewedAt: item.reviewedAt,
    })),
  };
}

async function selectCandidateQuestions(actor: Actor, input: { questionId?: string; topicId?: string; collectionId?: string; count: number }) {
  const where: Prisma.QuestionWhereInput = {
    AND: [
      PUBLIC_QUESTION_WHERE,
      input.topicId ? { currentPublishedRevision: { is: { topicId: input.topicId } } } : {},
      input.questionId ? { id: input.questionId } : {},
      input.collectionId ? { collectionItems: { some: { collectionId: input.collectionId } } } : {},
    ],
  };

  if (input.collectionId) {
    const collection = await getPrisma().collection.findFirst({
      where: { id: input.collectionId, userId: actor.userId },
      select: { id: true },
    });
    if (!collection) throw new DomainError("NOT_FOUND", "Collection not found.");
  }

  const questions = await getPrisma().question.findMany({
    where,
    orderBy: [{ currentPublishedRevision: { publishedAt: "desc" } }, { id: "desc" }],
    take: input.questionId ? undefined : input.count,
    select: {
      id: true,
      currentPublishedRevisionId: true,
    },
  });

  if (input.questionId) {
    const pinned = questions.find((question) => question.id === input.questionId);
    if (!pinned || !pinned.currentPublishedRevisionId) throw new DomainError("NOT_FOUND", "Question not found.");
    return [pinned];
  }

  const selected = questions.filter((question) => question.currentPublishedRevisionId !== null).slice(0, input.count);
  if (selected.length === 0) throw new DomainError("NOT_FOUND", "No published questions match this practice setup.");
  return selected;
}

async function selectAutomaticReviewQuestions(
  actor: Actor,
  input: { topicId?: string; collectionId?: string; count: number },
) {
  const now = new Date();
  const visibilityWhere: Prisma.QuestionWhereInput = {
    AND: [
      PUBLIC_QUESTION_WHERE,
      input.topicId ? { currentPublishedRevision: { is: { topicId: input.topicId } } } : {},
      input.collectionId ? { collectionItems: { some: { collectionId: input.collectionId } } } : {},
    ],
  };

  if (input.collectionId) {
    const collection = await getPrisma().collection.findFirst({
      where: { id: input.collectionId, userId: actor.userId },
      select: { id: true },
    });
    if (!collection) throw new DomainError("NOT_FOUND", "Collection not found.");
  }

  const dueQuestions = await getPrisma().reviewCard.findMany({
    where: {
      userId: actor.userId,
      dueAt: { lte: now },
      question: visibilityWhere,
    },
    orderBy: [{ dueAt: "asc" }, { questionId: "asc" }],
    take: input.count,
    select: {
      questionId: true,
      question: { select: { currentPublishedRevisionId: true } },
    },
  });

  const remaining = input.count - dueQuestions.length;
  const newQuestions = remaining > 0
    ? await getPrisma().question.findMany({
        where: {
          AND: [
            visibilityWhere,
            { reviewCards: { none: { userId: actor.userId } } },
          ],
        },
        orderBy: [{ currentPublishedRevision: { publishedAt: "desc" } }, { id: "desc" }],
        take: remaining,
        select: { id: true, currentPublishedRevisionId: true },
      })
    : [];

  const selected = [
    ...dueQuestions.map((entry) => ({ id: entry.questionId, currentPublishedRevisionId: entry.question.currentPublishedRevisionId })),
    ...newQuestions,
  ].filter((question) => question.currentPublishedRevisionId !== null);

  if (selected.length === 0) throw new DomainError("NOT_FOUND", "No published questions match this practice setup.");
  return selected;
}

async function getOwnedSession(actor: Actor, id: string) {
  const session = await getPrisma().practiceSession.findFirst({
    where: { id, userId: actor.userId },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: { revision: { include: { topic: true } } },
      },
    },
  });
  if (!session) notFound();
  return session;
}

async function lockOwnedItem(tx: Prisma.TransactionClient, actor: Actor, itemId: string) {
  const rows = await tx.$queryRaw<Array<{
    id: string;
    sessionId: string;
    responseMarkdown: string;
    revealedAt: Date | null;
    rating: number | null;
    reviewedAt: Date | null;
    questionId: string;
    mode: PracticeMode;
    startedAt: Date;
    completedAt: Date | null;
    timeLimitMinutes: number | null;
  }>>`
    SELECT
      item."id",
      item."sessionId",
      item."responseMarkdown",
      item."revealedAt",
      item."rating",
      item."reviewedAt",
      revision."questionId",
      session."mode",
      session."startedAt",
      session."completedAt",
      session."timeLimitMinutes"
    FROM "practice_item" item
    INNER JOIN "practice_session" session ON session."id" = item."sessionId"
    INNER JOIN "question_revision" revision ON revision."id" = item."revisionId"
    WHERE item."id" = ${itemId}::uuid AND session."userId" = ${actor.userId}
    FOR UPDATE OF item, session
  `;

  const row = rows[0];
  if (!row) notFound();
  return row;
}

async function lockReviewCardScope(tx: Prisma.TransactionClient, userId: string, questionId: string): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${questionId}))
  `;
}

function assertSessionWritable(session: { completedAt: Date | null; startedAt: Date; timeLimitMinutes: number | null }, now: Date): void {
  if (session.completedAt) conflict("Completed sessions cannot be changed.");
  if (isExpired(session, now)) conflict("This practice session already expired.");
}

export async function createPracticeSession(actor: Actor | null, input: CreatePracticeSessionInput): Promise<PracticeSessionView> {
  const owner = requireActor(actor);
  const mode = parseMode(input.mode);
  const count = parseCount(input.count);
  const timeLimitMinutes = parseTimeLimitMinutes(input.timeLimitMinutes, mode);
  const candidates = input.questionId
    // Explicit question drills intentionally allow a chosen visible question even when its review card is not due yet.
    ? await selectCandidateQuestions(owner, {
        questionId: input.questionId,
        topicId: input.topicId,
        collectionId: input.collectionId,
        count,
      })
    : mode === PracticeMode.REVIEW
      ? await selectAutomaticReviewQuestions(owner, {
          topicId: input.topicId,
          collectionId: input.collectionId,
          count,
        })
      : await selectCandidateQuestions(owner, {
          questionId: input.questionId,
          topicId: input.topicId,
          collectionId: input.collectionId,
          count,
        });

  const session = await getPrisma().practiceSession.create({
    data: {
      userId: owner.userId,
      mode,
      currentPosition: 1,
      timeLimitMinutes,
      items: {
        create: candidates.map((question, index) => ({
          revisionId: question.currentPublishedRevisionId!,
          position: index + 1,
        })),
      },
    },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: { revision: { include: { topic: true } } },
      },
    },
  });

  return mapSession(session);
}

export async function getPracticeSession(actor: Actor | null, id: string): Promise<PracticeSessionView> {
  const owner = requireActor(actor);
  return mapSession(await getOwnedSession(owner, id));
}

export async function savePracticeResponse(actor: Actor | null, itemId: string, responseMarkdown: string): Promise<void> {
  const owner = requireActor(actor);
  await getPrisma().$transaction(async (tx) => {
    const item = await lockOwnedItem(tx, owner, itemId);
    assertSessionWritable(item, new Date());

    await tx.practiceItem.update({ where: { id: item.id }, data: { responseMarkdown } });
  });
}

export async function revealPracticeAnswer(actor: Actor | null, itemId: string): Promise<void> {
  const owner = requireActor(actor);
  await getPrisma().$transaction(async (tx) => {
    const item = await lockOwnedItem(tx, owner, itemId);
    assertSessionWritable(item, new Date());

    if (!item.revealedAt) {
      await tx.practiceItem.update({ where: { id: item.id }, data: { revealedAt: new Date() } });
    }
  });
}

export async function gradePracticeItem(actor: Actor | null, itemId: string, rating: 1 | 2 | 3 | 4): Promise<void> {
  const owner = requireActor(actor);
  if (![1, 2, 3, 4].includes(rating)) invalid("rating must be between 1 and 4.");

  await getPrisma().$transaction(async (tx) => {
    const item = await lockOwnedItem(tx, owner, itemId);
    if (item.reviewedAt) return;

    const now = new Date();
    assertSessionWritable(item, now);

    if (item.mode !== PracticeMode.REVIEW) conflict("Only review sessions can be graded.");

    await lockReviewCardScope(tx, owner.userId, item.questionId);

    const existingCard = await tx.reviewCard.findUnique({
      where: { userId_questionId: { userId: owner.userId, questionId: item.questionId } },
      select: { card: true },
    });

    const scheduled = scheduleReview(existingCard?.card ?? null, rating as Grade, now);

    await tx.reviewCard.upsert({
      where: { userId_questionId: { userId: owner.userId, questionId: item.questionId } },
      create: { userId: owner.userId, questionId: item.questionId, dueAt: scheduled.dueAt, card: scheduled.card },
      update: { dueAt: scheduled.dueAt, card: scheduled.card },
    });

    await tx.practiceItem.update({
      where: { id: item.id },
      data: {
        revealedAt: item.revealedAt ?? now,
        rating,
        reviewedAt: now,
      },
    });

    const remaining = await tx.practiceItem.count({ where: { sessionId: item.sessionId, reviewedAt: null } });
    if (remaining === 0) {
      await tx.practiceSession.update({ where: { id: item.sessionId }, data: { completedAt: now } });
    } else {
      const nextItem = await tx.practiceItem.findFirst({
        where: { sessionId: item.sessionId, reviewedAt: null },
        orderBy: { position: "asc" },
        select: { position: true },
      });
      if (nextItem) {
        await tx.practiceSession.update({ where: { id: item.sessionId }, data: { currentPosition: nextItem.position } });
      }
    }
  });
}

export async function completePracticeSession(actor: Actor | null, id: string): Promise<void> {
  const owner = requireActor(actor);
  await getPrisma().$transaction(async (tx) => {
    const sessionRows = await tx.$queryRaw<Array<{
      id: string;
      mode: PracticeMode;
      startedAt: Date;
      completedAt: Date | null;
      timeLimitMinutes: number | null;
    }>>`
      SELECT "id", "mode", "startedAt", "completedAt", "timeLimitMinutes"
      FROM "practice_session"
      WHERE "id" = ${id}::uuid AND "userId" = ${owner.userId}
      FOR UPDATE
    `;
    const session = sessionRows[0];
    if (!session) notFound();
    if (session.completedAt) return;

    const now = new Date();
    assertSessionWritable(session, now);

    if (session.mode === PracticeMode.REVIEW) {
      const remaining = await tx.practiceItem.count({ where: { sessionId: id, reviewedAt: null } });
      if (remaining > 0) conflict("Review sessions can only be completed after every item has been revealed and rated.");
    }

    await tx.practiceSession.update({ where: { id }, data: { completedAt: now } });
  });
}

export async function getPracticeOverview(actor: Actor | null): Promise<{ dueCount: number; newCount: number }> {
  const owner = requireActor(actor);
  const now = new Date();
  const [dueCount, newCount] = await Promise.all([
    getPrisma().reviewCard.count({
      where: {
        userId: owner.userId,
        dueAt: { lte: now },
        question: PUBLIC_QUESTION_WHERE,
      },
    }),
    getPrisma().question.count({
      where: {
        ...PUBLIC_QUESTION_WHERE,
        reviewCards: { none: { userId: owner.userId } },
      },
    }),
  ]);

  return { dueCount, newCount };
}

export async function listActivePracticeSessions(actor: Actor | null): Promise<ActivePracticeSessionSummary[]> {
  const owner = requireActor(actor);
  const sessions = await getPrisma().practiceSession.findMany({
    where: { userId: owner.userId, completedAt: null },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    include: { _count: { select: { items: true } } },
  });

  return sessions.map((session) => ({
    id: session.id,
    mode: session.mode,
    currentPosition: session.currentPosition,
    questionCount: session._count.items,
    startedAt: session.startedAt,
    expiresAt: expiresAtFrom(session),
  }));
}

export async function setPracticeSessionPosition(actor: Actor | null, sessionId: string, position: number): Promise<void> {
  const owner = requireActor(actor);
  if (!Number.isInteger(position) || position < 1) invalid("position must be a positive integer.");

  await getPrisma().$transaction(async (tx) => {
    const sessionRows = await tx.$queryRaw<Array<{ id: string; startedAt: Date; completedAt: Date | null; timeLimitMinutes: number | null }>>`
      SELECT "id", "startedAt", "completedAt", "timeLimitMinutes"
      FROM "practice_session"
      WHERE "id" = ${sessionId}::uuid AND "userId" = ${owner.userId}
      FOR UPDATE
    `;
    const session = sessionRows[0];
    if (!session) notFound();
    assertSessionWritable(session, new Date());

    const itemCount = await tx.practiceItem.count({ where: { sessionId } });
    if (position > itemCount) invalid("position is outside this session.");

    await tx.practiceSession.update({ where: { id: sessionId }, data: { currentPosition: position } });
  });
}