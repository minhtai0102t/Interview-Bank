import type { Metadata } from "next";

import { ImportReview } from "@/features/imports/import-review";
import { requirePageActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "Import" };

export default async function ImportsPage() {
  await requirePageActor("/imports");

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Import questions</h1>
      <p className="mt-2 text-muted">
        Preview the questions found in a file before anything is saved. Saving imported questions arrives in a later step.
      </p>
      <div className="mt-6">
        <ImportReview />
      </div>
    </div>
  );
}
