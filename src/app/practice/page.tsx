import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { listCollections } from "@/features/collections/service";
import { PracticeDashboard } from "@/features/practice/dashboard";
import { getPracticeOverview, getPracticeSession, listActivePracticeSessions } from "@/features/practice/service";
import { getPublicQuestion, listTopics } from "@/features/questions/service";
import { getCurrentActor } from "@/lib/current-actor";
import { isDomainError } from "@/lib/errors";
import { signInHref } from "@/lib/redirect";

export const metadata: Metadata = { title: "Practice", robots: { index: false } };

const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function returnToFromQuery(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const first = firstValue(value);
    if (first) params.set(key, first);
  }
  const search = params.toString();
  return search ? `/practice?${search}` : "/practice";
}

export default async function PracticePage({ searchParams }: PageProps<"/practice">) {
  const query = await searchParams;
  const actor = await getCurrentActor();
  const returnTo = returnToFromQuery(query);
  if (!actor) redirect(signInHref(returnTo));

  const sessionId = firstValue(query.sessionId)?.trim() || undefined;
  const questionId = firstValue(query.questionId)?.trim() || undefined;
  const [overview, activeSessions, topics, collections, selectedQuestion] = await Promise.all([
    getPracticeOverview(actor),
    listActivePracticeSessions(actor),
    listTopics(),
    listCollections(actor),
    questionId ? getPublicQuestion(questionId, actor) : Promise.resolve(null),
  ]);

  let session = null;
  if (sessionId) {
    try {
      session = await getPracticeSession(actor, sessionId);
    } catch (error) {
      if (isDomainError(error, "NOT_FOUND")) notFound();
      throw error;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Practice</h1>
        <p className="mt-2 text-sm text-muted">Run review sessions with FSRS scheduling or timed mock sessions, then resume exactly where you left off.</p>
      </div>
      <PracticeDashboard
        overview={overview}
        activeSessions={activeSessions}
        topics={topics}
        collections={collections}
        selectedQuestion={selectedQuestion}
        selectedQuestionRequested={Boolean(questionId)}
        session={session}
      />
    </div>
  );
}