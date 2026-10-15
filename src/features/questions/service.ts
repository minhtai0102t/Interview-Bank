import { createHash } from "node:crypto";

import { ModerationState } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import type { Difficulty } from "@/generated/prisma/client";
import type { Actor } from "@/lib/actor";
import { requireActor } from "@/lib/actor";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

import { parseQuestionInput, type QuestionInput } from "./input";

const LIBRARY_PAGE_SIZE = 20;
const ANONYMOUS_ALIAS = "Anonymous";
const REQUEST_ID_PATTERN = /^\S.{0,119}$/;

export const PUBLIC_QUESTION_WHERE = {
  archivedAt: null,
  moderationState: ModerationState.ACTIVE,
  currentPublishedRevisionId: { not: null },
} satisfies Prisma.QuestionWhereInput;

export interface OwnPublishedRevision {
  id: string;
  draftVersion: number;
  publishedAt: Date | null;
}

export interface OwnQuestion {
  id: string;
  title: string;
  promptMarkdown: string;
  answerMarkdown: string;
  topicId: string;
  difficulty: Difficulty;
  tags: string[];
  draftVersion: number;
  archivedAt: Date | null;
  moderationState: ModerationState;
  currentPublishedRevisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedRevision: OwnPublishedRevision | null;
}

export interface OwnQuestionSummary {
  id: string;
  title: string;
  topicId: string;
  difficulty: Difficulty;
  tags: string[];
  draftVersion: number;
  archivedAt: Date | null;
  moderationState: ModerationState;
  publishedRevision: OwnPublishedRevision | null;
  updatedAt: Date;
}

export interface TopicListItem {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  publishedQuestionCount: number;
}

export interface LibraryFilters {
  q?: string;
  topic?: string;
  difficulty?: Difficulty;
  tag?: string;
  page?: number;
  saved?: boolean;
}

export interface LibraryQuestionSummary {
  id: string;
  title: string;
  promptMarkdown: string;
  topicId: string;
  topicSlug: string;
  topicLabel: string;
  difficulty: Difficulty;
  tags: string[];
  publishedAt: Date | null;
  saved: boolean;
  authorAlias: string;
}

export interface LibraryPage {
  items: LibraryQuestionSummary[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface PublicQuestion {
  id: string;
  title: string;
  promptMarkdown: string;
  answerMarkdown: string;
  topicId: string;
  topicSlug: string;
  topicLabel: string;
  difficulty: Difficulty;
  tags: string[];
  publishedAt: Date | null;
  saved: boolean;
  authorAlias: string;
}

export interface BookmarkResult {
  questionId: string;
  saved: boolean;
}

export interface ImportSaveResult {
  requestId: string;
  questionIds: string[];
}

type OwnQuestionRecord = Prisma.QuestionGetPayload<{
  include: { currentPublishedRevision: true };
}>;

type PublicQuestionRecord = Prisma.QuestionGetPayload<{
  select: {
    id: true;
    author: { select: { profile: { select: { publicAlias: true } } } };
    bookmarks: { select: { userId: true } };
    currentPublishedRevision: {
      select: {
        id: true;
        title: true;
        promptMarkdown: true;
        answerMarkdown: true;
        difficulty: true;
        tags: true;
        publishedAt: true;
        topic: { select: { id: true; slug: true; label: true } };
      };
    };
  };
}>;

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

function conflict(message: string): never {
  throw new DomainError("CONFLICT", message);
}

function pageFrom(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) invalid("page must be a positive integer.");
  return value;
}

function normalizeSearch(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeTag(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function authorAliasFrom(record: { author: { profile: { publicAlias: string | null } | null } | null }): string {
  const alias = record.author?.profile?.publicAlias?.trim();
  return alias ? alias : ANONYMOUS_ALIAS;
}

function mapOwnQuestion(record: OwnQuestionRecord): OwnQuestion {
  return {
    id: record.id,
    title: record.title,
    promptMarkdown: record.promptMarkdown,
    answerMarkdown: record.answerMarkdown,
    topicId: record.topicId,
    difficulty: record.difficulty,
    tags: record.tags,
    draftVersion: record.draftVersion,
    archivedAt: record.archivedAt,
    moderationState: record.moderationState,
    currentPublishedRevisionId: record.currentPublishedRevisionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    publishedRevision: record.currentPublishedRevision
      ? {
          id: record.currentPublishedRevision.id,
          draftVersion: record.currentPublishedRevision.draftVersion,
          publishedAt: record.currentPublishedRevision.publishedAt,
        }
      : null,
  };
}

function mapPublicQuestion(record: PublicQuestionRecord, saved: boolean): PublicQuestion {
  const revision = record.currentPublishedRevision;
  if (!revision) throw new Error("Published question is missing its revision.");

  return {
    id: record.id,
    title: revision.title,
    promptMarkdown: revision.promptMarkdown,
    answerMarkdown: revision.answerMarkdown,
    topicId: revision.topic.id,
    topicSlug: revision.topic.slug,
    topicLabel: revision.topic.label,
    difficulty: revision.difficulty,
    tags: revision.tags,
    publishedAt: revision.publishedAt,
    saved,
    authorAlias: authorAliasFrom(record),
  };
}

async function ensureTopicExists(topicId: string): Promise<void> {
  const exists = await getPrisma().topic.count({ where: { id: topicId } });
  if (exists === 0) invalid("topicId does not match a known topic.");
}

async function lockOwnedQuestion(tx: Prisma.TransactionClient, actor: Actor, id: string): Promise<OwnQuestionRecord> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "question"
    WHERE "id" = ${id}::uuid AND "authorId" = ${actor.userId}
    FOR UPDATE
  `;

  if (rows.length === 0) throw new DomainError("NOT_FOUND", "Question not found.");

  const question = await tx.question.findFirst({
    where: { id, authorId: actor.userId },
    include: { currentPublishedRevision: true },
  });
  if (!question) throw new DomainError("NOT_FOUND", "Question not found.");
  return question;
}

function parseRequestId(requestId: string): string {
  const normalized = requestId.trim();
  if (!REQUEST_ID_PATTERN.test(normalized)) invalid("requestId must be non-empty and short.");
  return normalized;
}

function buildImportContentHash(inputs: readonly QuestionInput[]): string {
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
}

async function lockImportRequest(tx: Prisma.TransactionClient, userId: string, requestId: string): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${requestId}))
  `;
}

function buildLibraryWhere(filters: LibraryFilters, actor: Actor | null): Prisma.QuestionWhereInput {
  const clauses: Prisma.QuestionWhereInput[] = [PUBLIC_QUESTION_WHERE];
  const q = normalizeSearch(filters.q);
  const topic = normalizeSearch(filters.topic);
  const tag = normalizeTag(filters.tag);

  if (topic) {
    clauses.push({ currentPublishedRevision: { is: { topic: { slug: topic } } } });
  }
  if (filters.difficulty) {
    clauses.push({ currentPublishedRevision: { is: { difficulty: filters.difficulty } } });
  }
  if (tag) {
    clauses.push({ currentPublishedRevision: { is: { tags: { has: tag } } } });
  }
  if (q) {
    clauses.push({
      currentPublishedRevision: {
        is: {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { promptMarkdown: { contains: q, mode: "insensitive" } },
            { answerMarkdown: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    });
  }
  if (filters.saved) {
    if (!actor) return { id: "00000000-0000-7000-8000-000000000000" };
    clauses.push({ bookmarks: { some: { userId: actor.userId } } });
  }

  return clauses.length === 1 ? clauses[0]! : { AND: clauses };
}

function bookmarkSelect(actor: Actor | null): { where: { userId: string }; select: { userId: true } } {
  return { where: { userId: actor?.userId ?? "" }, select: { userId: true } };
}

export async function saveQuestion(actor: Actor | null, input: QuestionInput, id?: string, expectedVersion?: number): Promise<OwnQuestion> {
  const author = requireActor(actor);
  const parsed = parseQuestionInput(input);
  await ensureTopicExists(parsed.topicId);

  if (!id) {
    const created = await getPrisma().question.create({
      data: {
        authorId: author.userId,
        title: parsed.title,
        promptMarkdown: parsed.promptMarkdown,
        answerMarkdown: parsed.answerMarkdown,
        topicId: parsed.topicId,
        difficulty: parsed.difficulty,
        tags: parsed.tags,
      },
      include: { currentPublishedRevision: true },
    });
    return mapOwnQuestion(created);
  }

  if (!Number.isInteger(expectedVersion) || (expectedVersion ?? 0) < 1) invalid("expectedVersion must be a positive integer.");

  const updated = await getPrisma().question.updateMany({
    where: { id, authorId: author.userId, draftVersion: expectedVersion, archivedAt: null },
    data: {
      title: parsed.title,
      promptMarkdown: parsed.promptMarkdown,
      answerMarkdown: parsed.answerMarkdown,
      topicId: parsed.topicId,
      difficulty: parsed.difficulty,
      tags: parsed.tags,
      draftVersion: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    const existing = await getPrisma().question.findFirst({
      where: { id, authorId: author.userId },
      select: { archivedAt: true },
    });
    if (!existing) throw new DomainError("NOT_FOUND", "Question not found.");
    if (existing.archivedAt) conflict("Archived questions cannot be edited.");
    conflict("The question was changed by another request.");
  }

  const question = await getPrisma().question.findFirst({
    where: { id, authorId: author.userId },
    include: { currentPublishedRevision: true },
  });
  if (!question) throw new DomainError("NOT_FOUND", "Question not found.");
  return mapOwnQuestion(question);
}

export async function publishQuestion(actor: Actor | null, id: string, expectedVersion: number): Promise<OwnQuestion> {
  const author = requireActor(actor);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) invalid("expectedVersion must be a positive integer.");

  return getPrisma().$transaction(async (tx) => {
    const question = await lockOwnedQuestion(tx, author, id);
    const parsed = parseQuestionInput(question, { requireAnswer: true });

    if (question.archivedAt) conflict("Archived questions cannot be published.");
    if (question.moderationState !== ModerationState.ACTIVE) conflict("Moderated questions cannot be republished by the author.");
    if (question.draftVersion !== expectedVersion) conflict("The question was changed by another request.");

    let revision = await tx.questionRevision.findUnique({
      where: { questionId_draftVersion: { questionId: question.id, draftVersion: question.draftVersion } },
    });

    const publishedAt = new Date();
    if (!revision) {
      revision = await tx.questionRevision.create({
        data: {
          questionId: question.id,
          draftVersion: question.draftVersion,
          title: parsed.title,
          promptMarkdown: parsed.promptMarkdown,
          answerMarkdown: parsed.answerMarkdown,
          topicId: parsed.topicId,
          difficulty: parsed.difficulty,
          tags: parsed.tags,
          publishedAt,
        },
      });
    } else if (!revision.publishedAt || question.currentPublishedRevisionId !== revision.id) {
      revision = await tx.questionRevision.update({ where: { id: revision.id }, data: { publishedAt } });
    }

    const updated = await tx.question.update({
      where: { id: question.id },
      data: { currentPublishedRevisionId: revision.id },
      include: { currentPublishedRevision: true },
    });
    return mapOwnQuestion(updated);
  });
}

export async function unpublishQuestion(actor: Actor | null, id: string): Promise<OwnQuestion> {
  const author = requireActor(actor);
  const updated = await getPrisma().question.updateMany({
    where: { id, authorId: author.userId },
    data: { currentPublishedRevisionId: null },
  });
  if (updated.count === 0) throw new DomainError("NOT_FOUND", "Question not found.");

  const question = await getPrisma().question.findFirst({
    where: { id, authorId: author.userId },
    include: { currentPublishedRevision: true },
  });
  if (!question) throw new DomainError("NOT_FOUND", "Question not found.");
  return mapOwnQuestion(question);
}

export async function archiveQuestion(actor: Actor | null, id: string): Promise<OwnQuestion> {
  const author = requireActor(actor);
  const updated = await getPrisma().question.updateMany({
    where: { id, authorId: author.userId },
    data: { archivedAt: new Date() },
  });
  if (updated.count === 0) throw new DomainError("NOT_FOUND", "Question not found.");

  const question = await getPrisma().question.findFirst({
    where: { id, authorId: author.userId },
    include: { currentPublishedRevision: true },
  });
  if (!question) throw new DomainError("NOT_FOUND", "Question not found.");
  return mapOwnQuestion(question);
}

export async function getOwnQuestion(actor: Actor | null, id: string): Promise<OwnQuestion> {
  const author = requireActor(actor);
  const question = await getPrisma().question.findFirst({
    where: { id, authorId: author.userId },
    include: { currentPublishedRevision: true },
  });
  if (!question) throw new DomainError("NOT_FOUND", "Question not found.");
  return mapOwnQuestion(question);
}

export async function listOwnQuestions(actor: Actor | null): Promise<OwnQuestionSummary[]> {
  const author = requireActor(actor);
  const questions = await getPrisma().question.findMany({
    where: { authorId: author.userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: { currentPublishedRevision: true },
  });

  return questions.map((question) => ({
    id: question.id,
    title: question.title,
    topicId: question.topicId,
    difficulty: question.difficulty,
    tags: question.tags,
    draftVersion: question.draftVersion,
    archivedAt: question.archivedAt,
    moderationState: question.moderationState,
    publishedRevision: question.currentPublishedRevision
      ? {
          id: question.currentPublishedRevision.id,
          draftVersion: question.currentPublishedRevision.draftVersion,
          publishedAt: question.currentPublishedRevision.publishedAt,
        }
      : null,
    updatedAt: question.updatedAt,
  }));
}

export async function listTopics(): Promise<TopicListItem[]> {
  const topics = await getPrisma().topic.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: {
      revisions: {
        where: { publishedFor: { some: PUBLIC_QUESTION_WHERE } },
        select: { id: true },
      },
    },
  });

  return topics.map((topic) => ({
    id: topic.id,
    slug: topic.slug,
    label: topic.label,
    sortOrder: topic.sortOrder,
    publishedQuestionCount: topic.revisions.length,
  }));
}

export async function listLibrary(filters: LibraryFilters = {}, actor: Actor | null = null): Promise<LibraryPage> {
  const requestedPage = pageFrom(filters.page);
  const where = buildLibraryWhere(filters, actor);
  const total = await getPrisma().question.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const questions = await getPrisma().question.findMany({
    where,
    orderBy: [{ currentPublishedRevision: { publishedAt: "desc" } }, { id: "desc" }],
    skip: (page - 1) * LIBRARY_PAGE_SIZE,
    take: LIBRARY_PAGE_SIZE,
    select: {
      id: true,
      author: { select: { profile: { select: { publicAlias: true } } } },
      bookmarks: bookmarkSelect(actor),
      currentPublishedRevision: {
        select: {
          id: true,
          title: true,
          promptMarkdown: true,
          answerMarkdown: true,
          difficulty: true,
          tags: true,
          publishedAt: true,
          topic: { select: { id: true, slug: true, label: true } },
        },
      },
    },
  });

  return {
    items: questions.map((question) => {
      const mapped = mapPublicQuestion(question, question.bookmarks.length > 0);
      return {
        id: mapped.id,
        title: mapped.title,
        promptMarkdown: mapped.promptMarkdown,
        topicId: mapped.topicId,
        topicSlug: mapped.topicSlug,
        topicLabel: mapped.topicLabel,
        difficulty: mapped.difficulty,
        tags: mapped.tags,
        publishedAt: mapped.publishedAt,
        saved: mapped.saved,
        authorAlias: mapped.authorAlias,
      };
    }),
    page,
    pageSize: LIBRARY_PAGE_SIZE,
    total,
    pageCount,
  };
}

export async function getPublicQuestion(id: string, actor: Actor | null = null): Promise<PublicQuestion | null> {
  const question = await getPrisma().question.findFirst({
    where: { id, ...PUBLIC_QUESTION_WHERE },
    select: {
      id: true,
      author: { select: { profile: { select: { publicAlias: true } } } },
      bookmarks: bookmarkSelect(actor),
      currentPublishedRevision: {
        select: {
          id: true,
          title: true,
          promptMarkdown: true,
          answerMarkdown: true,
          difficulty: true,
          tags: true,
          publishedAt: true,
          topic: { select: { id: true, slug: true, label: true } },
        },
      },
    },
  });

  return question ? mapPublicQuestion(question, question.bookmarks.length > 0) : null;
}

export async function setBookmark(actor: Actor | null, questionId: string, saved: boolean): Promise<BookmarkResult> {
  const currentActor = requireActor(actor);
  const question = await getPublicQuestion(questionId, currentActor);
  if (!question) throw new DomainError("NOT_FOUND", "Question not found.");

  if (saved) {
    await getPrisma().bookmark.upsert({
      where: { userId_questionId: { userId: currentActor.userId, questionId } },
      create: { userId: currentActor.userId, questionId },
      update: {},
    });
  } else {
    await getPrisma().bookmark.deleteMany({ where: { userId: currentActor.userId, questionId } });
  }

  return { questionId, saved };
}

export async function saveImportedQuestions(actor: Actor | null, requestId: string, inputs: readonly QuestionInput[]): Promise<ImportSaveResult> {
  const author = requireActor(actor);
  const normalizedRequestId = parseRequestId(requestId);
  if (inputs.length === 0) invalid("At least one question is required.");

  const normalizedInputs = inputs.map((input) => parseQuestionInput(input));
  await Promise.all(normalizedInputs.map((input) => ensureTopicExists(input.topicId)));
  const contentHash = buildImportContentHash(normalizedInputs);

  return getPrisma().$transaction(async (tx) => {
    await lockImportRequest(tx, author.userId, normalizedRequestId);

    const existing = await tx.importReceipt.findUnique({
      where: { userId_requestId: { userId: author.userId, requestId: normalizedRequestId } },
    });

    if (existing) {
      if (existing.contentHash !== contentHash) conflict("requestId was already used for different content.");
      return { requestId: normalizedRequestId, questionIds: existing.questionIds };
    }

    const questionIds: string[] = [];
    for (const input of normalizedInputs) {
      const question = await tx.question.create({
        data: {
          authorId: author.userId,
          title: input.title,
          promptMarkdown: input.promptMarkdown,
          answerMarkdown: input.answerMarkdown,
          topicId: input.topicId,
          difficulty: input.difficulty,
          tags: input.tags,
        },
        select: { id: true },
      });
      questionIds.push(question.id);
    }

    await tx.importReceipt.create({
      data: {
        userId: author.userId,
        requestId: normalizedRequestId,
        contentHash,
        questionIds,
      },
    });

    return { requestId: normalizedRequestId, questionIds };
  });
}