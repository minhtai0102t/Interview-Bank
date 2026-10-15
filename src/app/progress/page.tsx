import type { Metadata } from "next";

import { formatSessionTimestamp } from "@/features/progress/format";
import { getProgressSnapshot } from "@/features/progress/service";
import { requirePageActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "Progress", robots: { index: false } };

export default async function ProgressPage() {
  const actor = await requirePageActor("/progress");
  const progress = await getProgressSnapshot(actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Progress</h1>
        <p className="mt-2 text-sm text-muted">Completed work, due reviews, and study activity all grouped by {progress.timeZone}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-panel border border-line bg-surface p-4">
          <p className="text-3xl font-semibold">{progress.summary.completedSessions}</p>
          <p className="mt-2 text-sm text-muted">{progress.summary.completedSessions} completed sessions</p>
        </section>
        <section className="rounded-panel border border-line bg-surface p-4">
          <p className="text-3xl font-semibold">{progress.summary.completedReviews}</p>
          <p className="mt-2 text-sm text-muted">{progress.summary.completedReviews} completed reviews</p>
        </section>
        <section className="rounded-panel border border-line bg-surface p-4">
          <p className="text-3xl font-semibold">{progress.summary.dueReviews}</p>
          <p className="mt-2 text-sm text-muted">Due now</p>
        </section>
        <section className="rounded-panel border border-line bg-surface p-4">
          <p className="text-3xl font-semibold">{progress.summary.upcomingReviews}</p>
          <p className="mt-2 text-sm text-muted">Scheduled later</p>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Topic coverage</h2>
              <p className="mt-2 text-sm text-muted">Coverage counts current published questions. Historical study stays with the topic revision you actually practiced.</p>
            </div>
          </div>
          {progress.topicCoverage.length === 0 ? (
            <p className="mt-6 text-sm text-muted">No published topics or study history yet.</p>
          ) : (
            <ul className="mt-6 space-y-4">
              {progress.topicCoverage.map((topic) => {
                const percent = topic.publishedQuestions === 0 ? 0 : Math.round((topic.currentStudiedQuestions / topic.publishedQuestions) * 100);
                const coverageLabel = topic.publishedQuestions === 0
                  ? "No current published questions"
                  : `${topic.currentStudiedQuestions} of ${topic.publishedQuestions} current published questions studied`;
                const historicalLabel = `${topic.historicalStudiedQuestions} studied here historically`;
                return (
                  <li key={topic.topicId}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{topic.topicLabel}</p>
                        <p className="mt-1 text-sm text-muted">{coverageLabel}</p>
                      </div>
                      <div className="text-right text-sm text-muted">
                        <p>{percent}% coverage</p>
                        <p>{historicalLabel}</p>
                        <p>{topic.dueReviews} due · {topic.upcomingReviews} upcoming</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-canvas">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Activity calendar</h2>
          <p className="mt-2 text-sm text-muted">Counts completed sessions per day in your chosen time zone.</p>
          <ol className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label="Session activity calendar">
            {progress.activity.days.map((day) => (
              <li key={day.date} className="rounded-control border border-line bg-canvas px-2 py-3 text-center" aria-label={`${day.date}: ${day.count} completed session${day.count === 1 ? "" : "s"}`}>
                <p className="text-xs text-muted">{day.date.slice(5)}</p>
                <p className="mt-1 text-base font-semibold">{day.count}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Recent sessions</h2>
        {progress.recentSessions.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No completed sessions yet. Start a review or mock session to build history.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {progress.recentSessions.map((session) => (
              <li key={session.id} className="rounded-control border border-line px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{session.mode === "REVIEW" ? "Review session" : "Mock session"}</p>
                    <p className="mt-1 text-sm text-muted">
                      Started {formatSessionTimestamp(session.startedAt, progress.timeZone)} · completed {formatSessionTimestamp(session.completedAt, progress.timeZone)}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted">
                    <p>{session.questionCount} question{session.questionCount === 1 ? "" : "s"}</p>
                    <p>{session.reviewedCount} reviewed</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}