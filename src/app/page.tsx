import Link from "next/link";

export default function LibraryPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Library</h1>
      <p className="mt-3 text-muted">
        No questions have been published yet. Published questions will appear here, searchable by topic and difficulty.
      </p>
      <p className="mt-6">
        <Link
          href="/imports"
          className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white hover:bg-primary-strong"
        >
          Try the import preview
        </Link>
      </p>
    </div>
  );
}
