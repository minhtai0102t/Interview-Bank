import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { listCollections } from "@/features/collections/service";
import { PracticeDashboard } from "@/features/practice/dashboard";
import { getPracticeOverview, getPracticeSession, listActivePracticeSessions } from "@/features/practice/service";
import { listTopics } from "@/features/questions/service";
import { requirePageActor } from "@/lib/current-actor";
import { isDomainError } from "@/lib/errors";

export const metadata: Metadata = { title: "Practice", robots: { index: false } };

async function loadPracticeSessionPage(actor: Awaited<ReturnType<typeof requirePageActor>>, id: string) {
  try {
    const [overview, activeSessions, topics, collections, session] = await Promise.all([
      getPracticeOverview(actor),
      listActivePracticeSessions(actor),
      listTopics(),
      listCollections(actor),
      getPracticeSession(actor, id),
    ]);

    return { overview, activeSessions, topics, collections, session };
  } catch (error) {
    if (isDomainError(error, "NOT_FOUND")) notFound();
    throw error;
  }
}

export default async function PracticeSessionPage({ params }: PageProps<"/practice/[id]">) {
  const { id } = await params;
  const actor = await requirePageActor(`/practice/${id}`);
  const { overview, activeSessions, topics, collections, session } = await loadPracticeSessionPage(actor, id);

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
        selectedQuestion={null}
        selectedQuestionRequested={false}
        session={session}
      />
    </div>
  );
}