"use client";

import { Clock3, Layers3, ListChecks, PlayCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";
import { SafeMarkdown } from "@/components/markdown";
import type { CollectionSummary } from "@/features/collections/service";
import type { TopicListItem, PublicQuestion } from "@/features/questions/service";

import {
  completePracticeSessionAction,
  createPracticeSessionAction,
  gradePracticeItemAction,
  movePracticeSessionAction,
  revealPracticeAnswerAction,
  savePracticeResponseAction,
} from "./actions";
import type { ActivePracticeSessionSummary, PracticeSessionView } from "./service";

interface PracticeDashboardProps {
  overview: { dueCount: number; newCount: number };
  activeSessions: ActivePracticeSessionSummary[];
  topics: TopicListItem[];
  collections: CollectionSummary[];
  selectedQuestion: PublicQuestion | null;
  selectedQuestionRequested: boolean;
  session: PracticeSessionView | null;
}

function withQuery(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function practiceSessionHref(sessionId: string): string {
  return `/practice/${sessionId}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusOf(session: PracticeSessionView, nowMs: number): "active" | "expired" | "completed" {
  if (session.completedAt) return "completed";
  if (session.expiresAt && session.expiresAt.getTime() <= nowMs) return "expired";
  return "active";
}

function ratingLabel(rating: number | null) {
  return rating === 1 ? "Again" : rating === 2 ? "Hard" : rating === 3 ? "Good" : rating === 4 ? "Easy" : null;
}

export function PracticeDashboard({
  overview,
  activeSessions,
  topics,
  collections,
  selectedQuestion,
  selectedQuestionRequested,
  session,
}: PracticeDashboardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [feedback, setFeedback] = useState<ActionFeedbackState | null>(null);
  const [topicId, setTopicId] = useState(searchParams.get("topicId") ?? "");
  const [collectionId, setCollectionId] = useState(searchParams.get("collectionId") ?? "");
  const [reviewCount, setReviewCount] = useState(searchParams.get("count") ?? (selectedQuestion ? "1" : "10"));
  const [mockCount, setMockCount] = useState(searchParams.get("count") ?? (selectedQuestion ? "1" : "10"));
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(searchParams.get("timeLimitMinutes") ?? "15");
  const [nowMs, setNowMs] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const controlsDisabled = pending || !hydrated;

  useEffect(() => {
    const refreshNow = () => setNowMs(Date.now());
    const initialTimer = window.setTimeout(refreshNow, 0);
    if (!session?.expiresAt || session.completedAt) {
      return () => window.clearTimeout(initialTimer);
    }
    const timer = window.setInterval(refreshNow, 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [session?.expiresAt, session?.completedAt]);

  const returnTo = withQuery(pathname, new URLSearchParams(searchParams));

  function startSession(mode: "REVIEW" | "MOCK") {
    startTransition(async () => {
      setFeedback(null);
      const result = await createPracticeSessionAction(
        {
          mode,
          questionId: selectedQuestion?.id,
          topicId: selectedQuestion ? undefined : topicId || undefined,
          collectionId: selectedQuestion ? undefined : collectionId || undefined,
          count: Number.parseInt(mode === "REVIEW" ? reviewCount : mockCount, 10),
          timeLimitMinutes: mode === "MOCK" ? Number.parseInt(timeLimitMinutes, 10) : undefined,
        },
        returnTo,
      );
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      router.push(practiceSessionHref(result.data.sessionId));
    });
  }

  if (!session) {
    return (
      <div className="space-y-6">
        <ActionFeedback feedback={feedback} />

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-panel border border-line bg-surface p-4">
            <div className="flex items-center gap-2 text-primary">
              <ListChecks className="size-4" aria-hidden />
              <h2 className="text-base font-semibold text-ink">Review queue</h2>
            </div>
            <p className="mt-3 text-3xl font-semibold">{overview.dueCount}</p>
            <p className="mt-1 text-sm text-muted">Due now</p>
          </section>
          <section className="rounded-panel border border-line bg-surface p-4">
            <div className="flex items-center gap-2 text-primary">
              <Layers3 className="size-4" aria-hidden />
              <h2 className="text-base font-semibold text-ink">New material</h2>
            </div>
            <p className="mt-3 text-3xl font-semibold">{overview.newCount}</p>
            <p className="mt-1 text-sm text-muted">Published questions you have not scheduled yet</p>
          </section>
        </div>

        {activeSessions.length > 0 ? (
          <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold">Resume a session</h2>
            <ul className="mt-4 space-y-3">
              {activeSessions.map((active) => (
                <li key={active.id} className="rounded-control border border-line px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{active.mode === "REVIEW" ? "Review session" : "Mock session"}</p>
                      <p className="mt-1 text-sm text-muted">
                        Question {active.currentPosition} of {active.questionCount} · started {formatDate(active.startedAt)}
                      </p>
                      {active.expiresAt ? <p className="mt-1 text-sm text-muted">Expires {formatDate(active.expiresAt)}</p> : null}
                    </div>
                    <Link href={practiceSessionHref(active.id)} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas">
                      Resume
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {selectedQuestionRequested ? (
          <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold">Question-specific practice</h2>
            {selectedQuestion ? (
              <div className="mt-3">
                <p className="font-medium">{selectedQuestion.title}</p>
                <p className="mt-1 text-sm text-muted">{selectedQuestion.topicLabel} · {selectedQuestion.difficulty}</p>
                <p className="mt-2 text-sm text-muted">Direct question entry starts this visible question even if its review card is not due yet.</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">That question is no longer available for new practice sessions.</p>
            )}
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <ListChecks className="size-4 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold">Start review</h2>
            </div>
            <p className="mt-2 text-sm text-muted">Use due cards, a topic, a collection, or one specific published question.</p>
            {!selectedQuestion ? (
              <div className="mt-4 grid gap-3">
                <div>
                  <label htmlFor="practice-topic" className="block text-sm font-medium">Topic</label>
                  <select id="practice-topic" value={topicId} onChange={(event) => setTopicId(event.target.value)} className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm">
                    <option value="">All topics</option>
                    {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="practice-collection" className="block text-sm font-medium">Collection</label>
                  <select id="practice-collection" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm">
                    <option value="">No collection filter</option>
                    {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                  </select>
                </div>
              </div>
            ) : null}
            <div className="mt-4">
              <label htmlFor="practice-review-count" className="block text-sm font-medium">Question count</label>
              <input
                id="practice-review-count"
                value={selectedQuestion ? "1" : reviewCount}
                onChange={(event) => setReviewCount(event.target.value)}
                disabled={controlsDisabled || Boolean(selectedQuestion)}
                inputMode="numeric"
                className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:opacity-60"
              />
            </div>
            <button type="button" onClick={() => startSession("REVIEW")} disabled={controlsDisabled || (selectedQuestionRequested && !selectedQuestion)} className="mt-4 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-60">
              Start review
            </button>
          </section>

          <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <PlayCircle className="size-4 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold">Start mock</h2>
            </div>
            <p className="mt-2 text-sm text-muted">The server enforces the time limit on every response and navigation write.</p>
            {!selectedQuestion ? (
              <div className="mt-4 grid gap-3">
                <div>
                  <label htmlFor="mock-topic" className="block text-sm font-medium">Topic</label>
                  <select id="mock-topic" value={topicId} onChange={(event) => setTopicId(event.target.value)} disabled={controlsDisabled} className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm">
                    <option value="">All topics</option>
                    {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="mock-collection" className="block text-sm font-medium">Collection</label>
                  <select id="mock-collection" value={collectionId} onChange={(event) => setCollectionId(event.target.value)} disabled={controlsDisabled} className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm">
                    <option value="">No collection filter</option>
                    {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                  </select>
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="practice-mock-count" className="block text-sm font-medium">Question count</label>
                <input
                  id="practice-mock-count"
                  value={selectedQuestion ? "1" : mockCount}
                  onChange={(event) => setMockCount(event.target.value)}
                  disabled={controlsDisabled || Boolean(selectedQuestion)}
                  inputMode="numeric"
                  className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="practice-time" className="block text-sm font-medium">Time limit (minutes)</label>
                <input
                  id="practice-time"
                  value={timeLimitMinutes}
                  onChange={(event) => setTimeLimitMinutes(event.target.value)}
                  disabled={controlsDisabled}
                  inputMode="numeric"
                  className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:opacity-60"
                />
              </div>
            </div>
            <button type="button" onClick={() => startSession("MOCK")} disabled={controlsDisabled || (selectedQuestionRequested && !selectedQuestion)} className="mt-4 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-60">
              Start mock
            </button>
          </section>
        </div>
      </div>
    );
  }

  const activeSession = session;
  const state = statusOf(activeSession, nowMs);
  const currentItem = activeSession.items.find((item) => item.position === activeSession.currentPosition) ?? activeSession.items[0]!;
  const response = responses[currentItem.id] ?? currentItem.responseMarkdown;
  const reviewedCount = activeSession.items.filter((item) => item.reviewedAt !== null).length;
  const answeredCount = activeSession.items.filter((item) => item.responseMarkdown.trim() !== "").length;
  const millisecondsLeft = activeSession.expiresAt ? Math.max(0, activeSession.expiresAt.getTime() - nowMs) : null;

  function navigate(position: number) {
    startTransition(async () => {
      setFeedback(null);
      const result = await movePracticeSessionAction(activeSession.id, currentItem.id, response, position, returnTo);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  function saveOnly() {
    startTransition(async () => {
      setFeedback(null);
      const result = await savePracticeResponseAction(currentItem.id, response, returnTo);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  function reveal() {
    startTransition(async () => {
      setFeedback(null);
      const result = await revealPracticeAnswerAction(currentItem.id, response, returnTo);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  function grade(rating: 1 | 2 | 3 | 4) {
    startTransition(async () => {
      setFeedback(null);
      const result = await gradePracticeItemAction(currentItem.id, response, rating, returnTo);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  function complete() {
    startTransition(async () => {
      setFeedback(null);
      const result = await completePracticeSessionAction(activeSession.id, currentItem.id, response, returnTo);
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  return (
    <div className="space-y-6">
      <ActionFeedback feedback={feedback} />

      <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">{activeSession.mode === "REVIEW" ? "Review mode" : "Mock mode"}</p>
            <h2 className="mt-1 text-xl font-semibold">
              {state === "active" ? `Question ${activeSession.currentPosition} of ${activeSession.items.length}` : "Session summary"}
            </h2>
            <p className="mt-2 text-sm text-muted">Started {formatDate(activeSession.startedAt)}</p>
          </div>
          {activeSession.expiresAt ? (
            <div className="rounded-control border border-line px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Clock3 className="size-4 text-primary" aria-hidden />
                <span>{state === "expired" ? "Expired" : "Time limit"}</span>
              </div>
              <p className="mt-1 text-muted">
                {state === "active" && millisecondsLeft !== null ? `${Math.ceil(millisecondsLeft / 60_000)} min left` : formatDate(activeSession.expiresAt)}
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
          <span>{reviewedCount} reviewed</span>
          <span>{answeredCount} answered</span>
          <span>{activeSession.items.length - reviewedCount} remaining</span>
        </div>
      </section>

      {state === "active" ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <div className="space-y-4">
            <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
              <div className="flex flex-wrap gap-2 text-xs font-medium text-muted">
                <span className="rounded-control bg-canvas px-2 py-1">{currentItem.topicLabel}</span>
                <span className="rounded-control bg-canvas px-2 py-1">{currentItem.difficulty}</span>
                {currentItem.tags.map((tag) => (
                  <span key={tag} className="rounded-control bg-canvas px-2 py-1">#{tag}</span>
                ))}
              </div>
              <h3 className="mt-3 text-lg font-semibold">{currentItem.title}</h3>
              <div className="mt-3 text-sm leading-6 text-ink">
                <SafeMarkdown markdown={currentItem.promptMarkdown} className="space-y-3" />
              </div>
            </section>

            <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
              <label htmlFor="practice-response" className="block text-sm font-medium">
                {activeSession.mode === "REVIEW" ? "Optional response" : "Your response"}
              </label>
              <textarea
                id="practice-response"
                value={response}
                onChange={(event) => setResponses((current) => ({ ...current, [currentItem.id]: event.target.value }))}
                disabled={controlsDisabled}
                rows={10}
                className="mt-2 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm disabled:opacity-60"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={saveOnly} disabled={controlsDisabled} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60">
                  Save response
                </button>
                {activeSession.mode === "REVIEW" ? (
                  <button type="button" onClick={reveal} disabled={controlsDisabled || currentItem.revealedAt !== null} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60">
                    {currentItem.revealedAt ? "Answer revealed" : "Reveal answer"}
                  </button>
                ) : null}
                {activeSession.mode === "MOCK" ? (
                  <button type="button" onClick={complete} disabled={controlsDisabled} className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-60">
                    Complete mock
                  </button>
                ) : null}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            {activeSession.mode === "REVIEW" && currentItem.revealedAt ? (
              <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
                <h3 className="text-base font-semibold">Answer</h3>
                <div className="mt-3 text-sm leading-6 text-ink">
                  <SafeMarkdown markdown={currentItem.answerMarkdown} className="space-y-3" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    [1, "Again"],
                    [2, "Hard"],
                    [3, "Good"],
                    [4, "Easy"],
                  ] as const).map(([rating, label]) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => grade(rating)}
                      disabled={pending || currentItem.reviewedAt !== null}
                      className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {currentItem.reviewedAt ? <p className="mt-3 text-sm text-muted">Rated {ratingLabel(currentItem.rating)}.</p> : null}
              </section>
            ) : null}

            <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
              <h3 className="text-base font-semibold">Navigation</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => navigate(Math.max(1, activeSession.currentPosition - 1))} disabled={pending || activeSession.currentPosition <= 1} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60">
                  Previous
                </button>
                <button type="button" onClick={() => navigate(Math.min(activeSession.items.length, activeSession.currentPosition + 1))} disabled={pending || activeSession.currentPosition >= activeSession.items.length} className="inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium hover:bg-canvas disabled:opacity-60">
                  Next
                </button>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {activeSession.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigate(item.position)}
                      disabled={pending || item.position === activeSession.currentPosition}
                      className={`w-full rounded-control border px-3 py-2 text-left ${item.position === activeSession.currentPosition ? "border-primary bg-emerald-50 text-primary" : "border-line hover:bg-canvas"}`}
                    >
                      <span className="block font-medium">{item.position}. {item.title}</span>
                      <span className="mt-1 block text-muted">
                        {item.reviewedAt ? `Rated ${ratingLabel(item.rating)}` : item.responseMarkdown.trim() ? "Response saved" : "Not answered yet"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="rounded-panel border border-line bg-surface p-4 sm:p-6">
            <h3 className="text-lg font-semibold">{state === "completed" ? "Completed session" : "Expired session"}</h3>
            <p className="mt-2 text-sm text-muted">
              {state === "completed"
                ? "Responses and grading are locked. You can review the exact prompts, answers, and your own notes below."
                : "The time limit passed. Responses are locked, and the session remains inspectable."}
            </p>
          </div>
          <ul className="space-y-4">
            {activeSession.items.map((item) => (
              <li key={item.id} className="rounded-panel border border-line bg-surface p-4 sm:p-6">
                <div className="flex flex-wrap gap-2 text-xs font-medium text-muted">
                  <span className="rounded-control bg-canvas px-2 py-1">Question {item.position}</span>
                  <span className="rounded-control bg-canvas px-2 py-1">{item.topicLabel}</span>
                  <span className="rounded-control bg-canvas px-2 py-1">{item.difficulty}</span>
                  {item.rating ? <span className="rounded-control bg-canvas px-2 py-1">{ratingLabel(item.rating)}</span> : null}
                </div>
                <h4 className="mt-3 text-lg font-semibold">{item.title}</h4>
                <div className="mt-3 text-sm leading-6 text-ink">
                  <SafeMarkdown markdown={item.promptMarkdown} className="space-y-3" />
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <h5 className="text-sm font-semibold">Your response</h5>
                    {item.responseMarkdown.trim() ? (
                      <div className="mt-2 text-sm leading-6 text-ink"><SafeMarkdown markdown={item.responseMarkdown} className="space-y-3" /></div>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No response saved.</p>
                    )}
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold">Answer</h5>
                    <div className="mt-2 text-sm leading-6 text-ink"><SafeMarkdown markdown={item.answerMarkdown} className="space-y-3" /></div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}