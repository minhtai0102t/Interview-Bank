import Link from "next/link";

import { listLibrary, listTopics } from "@/features/questions/service";
import { getCurrentActor } from "@/lib/current-actor";

const difficulties = ["EASY", "MEDIUM", "HARD"] as const;

const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildPageHref(
  current: { q?: string; topic?: string; difficulty?: string; tag?: string; saved?: string },
  page: number,
) {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (current.topic) params.set("topic", current.topic);
  if (current.difficulty) params.set("difficulty", current.difficulty);
  if (current.tag) params.set("tag", current.tag);
  if (current.saved) params.set("saved", current.saved);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export default async function LibraryPage({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const filters = {
    q: firstValue(query.q)?.trim() || undefined,
    topic: firstValue(query.topic)?.trim() || undefined,
    difficulty: difficulties.find((value) => value === firstValue(query.difficulty)),
    tag: firstValue(query.tag)?.trim() || undefined,
    saved: firstValue(query.saved) === "1" ? true : undefined,
    page: parsePage(firstValue(query.page)),
  };

  const actor = await getCurrentActor();
  const [topics, library] = await Promise.all([listTopics(), listLibrary(filters, actor)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="mt-2 text-sm text-muted">Browse the published question bank, then open details, practice, or collections from there.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/practice" className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-3 text-sm font-medium hover:bg-canvas">
            Practice
          </Link>
          <Link href="/collections" className="inline-flex min-h-11 items-center rounded-control border border-line bg-surface px-3 text-sm font-medium hover:bg-canvas">
            Collections
          </Link>
          <Link href="/imports" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white hover:bg-primary-strong">
            Import questions
          </Link>
        </div>
      </div>

      <form className="grid gap-3 rounded-panel border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto] sm:items-end">
        <div>
          <label htmlFor="library-q" className="block text-sm font-medium">
            Search
          </label>
          <input
            id="library-q"
            name="q"
            defaultValue={filters.q}
            placeholder="closures, joins, retries"
            className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="library-topic" className="block text-sm font-medium">
            Topic
          </label>
          <select
            id="library-topic"
            name="topic"
            defaultValue={filters.topic ?? ""}
            className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
          >
            <option value="">All topics</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.slug}>
                {topic.label} ({topic.publishedQuestionCount})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="library-difficulty" className="block text-sm font-medium">
            Difficulty
          </label>
          <select
            id="library-difficulty"
            name="difficulty"
            defaultValue={filters.difficulty ?? ""}
            className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
          >
            <option value="">All levels</option>
            {difficulties.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {difficulty}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="library-tag" className="block text-sm font-medium">
            Tag
          </label>
          <input
            id="library-tag"
            name="tag"
            defaultValue={filters.tag}
            placeholder="sql"
            className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm"
          />
        </div>
        <div className="flex min-h-11 items-center gap-3">
          {actor ? (
            <label className="inline-flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="saved" value="1" defaultChecked={filters.saved === true} />
              Saved only
            </label>
          ) : null}
          <button type="submit" className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white">
            Apply
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between text-sm text-muted">
        <p>
          {library.total === 0 ? "No published questions match these filters." : `${library.total} published question${library.total === 1 ? "" : "s"}`}
        </p>
        <p>
          Page {library.page} of {library.pageCount}
        </p>
      </div>

      {library.items.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line bg-surface px-4 py-8 text-sm text-muted">
          Try another search, or publish a draft from My Questions.
        </div>
      ) : (
        <ul className="space-y-3">
          {library.items.map((question) => (
            <li key={question.id}>
              <article className="rounded-panel border border-line bg-surface p-4">
                <div className="flex flex-wrap gap-2 text-xs font-medium text-muted">
                  <span className="rounded-control bg-canvas px-2 py-1">{question.topicLabel}</span>
                  <span className="rounded-control bg-canvas px-2 py-1">{question.difficulty}</span>
                  {question.saved ? <span className="rounded-control bg-canvas px-2 py-1">Saved</span> : null}
                </div>
                <h2 className="mt-3 text-lg font-semibold">
                  <Link href={`/questions/${question.id}`} className="hover:text-primary">
                    {question.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-muted line-clamp-3">{question.promptMarkdown}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
                  <div className="flex flex-wrap gap-2">
                    {question.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                  <span>{question.authorAlias}</span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <Link
          href={buildPageHref(
            {
              q: filters.q,
              topic: filters.topic,
              difficulty: filters.difficulty,
              tag: filters.tag,
              saved: filters.saved ? "1" : undefined,
            },
            Math.max(1, library.page - 1),
          )}
          aria-disabled={library.page <= 1}
          className={`inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium ${
            library.page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-canvas"
          }`}
        >
          Previous page
        </Link>
        <Link
          href={buildPageHref(
            {
              q: filters.q,
              topic: filters.topic,
              difficulty: filters.difficulty,
              tag: filters.tag,
              saved: filters.saved ? "1" : undefined,
            },
            Math.min(library.pageCount, library.page + 1),
          )}
          aria-disabled={library.page >= library.pageCount}
          className={`inline-flex min-h-11 items-center rounded-control border border-line px-4 text-sm font-medium ${
            library.page >= library.pageCount ? "pointer-events-none opacity-50" : "hover:bg-canvas"
          }`}
        >
          Next page
        </Link>
      </div>
    </div>
  );
}
