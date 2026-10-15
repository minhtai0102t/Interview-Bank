import type { Metadata } from "next";

import { SettingsForm } from "@/features/profile/settings-form";
import { getProfileSettings } from "@/features/profile/service";
import { requirePageActor } from "@/lib/current-actor";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage() {
  const actor = await requirePageActor("/settings");
  const settings = await getProfileSettings(actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted">Choose the alias shown on published questions and the time zone that defines your study calendar.</p>
      </div>
      <SettingsForm initialSettings={settings} />
    </div>
  );
}