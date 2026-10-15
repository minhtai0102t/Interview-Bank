import type { Metadata } from "next";

import { ImportReview } from "@/features/imports/import-review";
import { listTopics } from "@/features/questions/service";
import { requirePageActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "Import" };

export default async function ImportsPage() {
  await requirePageActor("/imports");
  const topics = await listTopics();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Import questions</h1>
      <p className="mt-2 text-muted">
        Preview the questions found in a file before anything is saved. Save only the reviewed drafts you actually want.
      </p>
      <div className="mt-6">
        <ImportReview topics={topics} returnTo="/imports" />
      </div>
    </div>
  );
}
