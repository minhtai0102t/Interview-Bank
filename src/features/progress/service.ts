import type { PracticeMode } from "@/generated/prisma/client";
import type { Actor } from "@/lib/actor";
import { requireActor } from "@/lib/actor";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

import { PUBLIC_QUESTION_WHERE } from "../questions/service";

export interface ProgressSummary {
  completedSessions: number;
  completedReviews: number;
  dueReviews: number;
  upcomingReviews: number;
}

export interface TopicCoverageSummary {
  topicId: string;
  topicSlug: string;
  topicLabel: string;
  sortOrder: number;
  publishedQuestions: number;
  currentStudiedQuestions: number;
  historicalStudiedQuestions: number;
  dueReviews: number;
  upcomingReviews: number;
}

export interface RecentSessionSummary {
  id: string;
  mode: PracticeMode;
  startedAt: Date;
  completedAt: Date;
  questionCount: number;
  reviewedCount: number;
}

export interface ActivityDaySummary {
  date: string;
  count: number;
}

export interface ProgressSnapshot {
  timeZone: string;
  summary: ProgressSummary;
  topicCoverage: TopicCoverageSummary[];
  recentSessions: RecentSessionSummary[];
  activity: { days: ActivityDaySummary[] };
}

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

export function activityDate(value: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  } catch {
    invalid("Choose a valid time zone.");
  }
}

function addDays(date: string, delta: number): string {
  const utcDate = new Date(`${date}T00:00:00.000Z`);
  utcDate.setUTCDate(utcDate.getUTCDate() + delta);
  return utcDate.toISOString().slice(0, 10);
}

export async function getProgressSnapshot(actor: Actor | null): Promise<ProgressSnapshot> {
  const signedIn = requireActor(actor);
  const prisma = getPrisma();
  const profile = await prisma.profile.findUnique({ where: { userId: signedIn.userId }, select: { timeZone: true } });
  const timeZone = profile?.timeZone ?? "UTC";
  const now = new Date();

  const activityWindowStart = addDays(activityDate(now, timeZone), -27);
  const activityWindowStartUtc = new Date(`${activityWindowStart}T00:00:00.000Z`);

  const [visibleQuestions, studiedItems, reviewCards, completedReviews, completedSessionCount, recentSessions, activitySessions] = await Promise.all([
    prisma.question.findMany({
      where: PUBLIC_QUESTION_WHERE,
      select: {
        id: true,
        currentPublishedRevision: { select: { topic: { select: { id: true, slug: true, label: true, sortOrder: true } } } },
      },
    }),
    prisma.practiceItem.findMany({
      where: {
        OR: [
          {
            reviewedAt: { not: null },
            session: { userId: signedIn.userId, mode: "REVIEW" },
          },
          {
            session: { userId: signedIn.userId, mode: "MOCK", completedAt: { not: null } },
          },
        ],
      },
      select: {
        revision: {
          select: {
            questionId: true,
            topic: { select: { id: true, slug: true, label: true, sortOrder: true } },
          },
        },
      },
    }),
    prisma.reviewCard.findMany({
      where: { userId: signedIn.userId, question: PUBLIC_QUESTION_WHERE },
      select: {
        dueAt: true,
        question: { select: { currentPublishedRevision: { select: { topic: { select: { id: true } } } } } },
      },
    }),
    prisma.practiceItem.count({ where: { reviewedAt: { not: null }, session: { userId: signedIn.userId } } }),
    prisma.practiceSession.count({ where: { userId: signedIn.userId, completedAt: { not: null } } }),
    prisma.practiceSession.findMany({
      where: { userId: signedIn.userId, completedAt: { not: null } },
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      include: { items: { select: { reviewedAt: true } }, _count: { select: { items: true } } },
      take: 10,
    }),
    prisma.practiceSession.findMany({
      where: { userId: signedIn.userId, completedAt: { not: null, gte: activityWindowStartUtc } },
      select: { completedAt: true, startedAt: true },
    }),
  ]);

  const publishedByTopic = new Map<string, TopicCoverageSummary>();
  for (const question of visibleQuestions) {
    const topic = question.currentPublishedRevision?.topic;
    if (!topic) continue;
    const existing = publishedByTopic.get(topic.id);
    if (existing) {
      existing.publishedQuestions += 1;
      continue;
    }
    publishedByTopic.set(topic.id, {
      topicId: topic.id,
      topicSlug: topic.slug,
      topicLabel: topic.label,
      sortOrder: topic.sortOrder,
      publishedQuestions: 1,
      currentStudiedQuestions: 0,
      historicalStudiedQuestions: 0,
      dueReviews: 0,
      upcomingReviews: 0,
    });
  }

  const historicallyStudiedQuestionIds = new Set<string>();
  const historicalTopicQuestions = new Map<string, Set<string>>();
  for (const item of studiedItems) {
    historicallyStudiedQuestionIds.add(item.revision.questionId);

    const topic = item.revision.topic;
    const questionIds = historicalTopicQuestions.get(topic.id) ?? new Set<string>();
    questionIds.add(item.revision.questionId);
    historicalTopicQuestions.set(topic.id, questionIds);

    if (publishedByTopic.has(topic.id)) continue;
    publishedByTopic.set(topic.id, {
      topicId: topic.id,
      topicSlug: topic.slug,
      topicLabel: topic.label,
      sortOrder: topic.sortOrder,
      publishedQuestions: 0,
      currentStudiedQuestions: 0,
      historicalStudiedQuestions: 0,
      dueReviews: 0,
      upcomingReviews: 0,
    });
  }

  for (const question of visibleQuestions) {
    const topic = question.currentPublishedRevision?.topic;
    if (!topic) continue;
    if (!historicallyStudiedQuestionIds.has(question.id)) continue;
    const existing = publishedByTopic.get(topic.id);
    if (existing) existing.currentStudiedQuestions += 1;
  }

  for (const [topicId, questionIds] of historicalTopicQuestions.entries()) {
    const topic = publishedByTopic.get(topicId);
    if (topic) topic.historicalStudiedQuestions = questionIds.size;
  }

  let dueReviews = 0;
  let upcomingReviews = 0;
  for (const reviewCard of reviewCards) {
    const topicId = reviewCard.question.currentPublishedRevision?.topic.id;
    if (!topicId) continue;
    const topic = publishedByTopic.get(topicId);
    if (!topic) continue;
    if (reviewCard.dueAt.getTime() <= now.getTime()) {
      dueReviews += 1;
      topic.dueReviews += 1;
      continue;
    }
    upcomingReviews += 1;
    topic.upcomingReviews += 1;
  }

  const activityByDate = new Map<string, number>();
  for (const session of activitySessions) {
    const date = activityDate(session.completedAt ?? session.startedAt, timeZone);
    activityByDate.set(date, (activityByDate.get(date) ?? 0) + 1);
  }

  const endDate = activityDate(now, timeZone);
  const days: ActivityDaySummary[] = [];
  for (let offset = 27; offset >= 0; offset -= 1) {
    const date = addDays(endDate, -offset);
    days.push({ date, count: activityByDate.get(date) ?? 0 });
  }

  return {
    timeZone,
    summary: {
      completedSessions: completedSessionCount,
      completedReviews,
      dueReviews,
      upcomingReviews,
    },
    topicCoverage: Array.from(publishedByTopic.values()).sort((left, right) => left.sortOrder - right.sortOrder || left.topicLabel.localeCompare(right.topicLabel)),
    recentSessions: recentSessions.map((session) => ({
      id: session.id,
      mode: session.mode,
      startedAt: session.startedAt,
      completedAt: session.completedAt ?? session.startedAt,
      questionCount: session._count.items,
      reviewedCount: session.items.filter((item) => item.reviewedAt !== null).length,
    })),
    activity: { days },
  };
}