import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ModerationTable } from "@/features/admin/moderation-table";
import { listModerationQuestions } from "@/features/admin/service";
import { requirePageActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  const actor = await requirePageActor("/admin");
  if (actor.role !== "ADMIN") notFound();

  const questions = await listModerationQuestions(actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-2 text-sm text-muted">Review currently published questions and remove or restore their public visibility without rewriting the author’s content.</p>
      </div>
      <ModerationTable questions={questions} />
    </div>
  );
}