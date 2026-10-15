"use client";

import { useState, useSyncExternalStore, useTransition } from "react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";

import { saveProfileSettingsAction } from "./actions";
import type { ProfileSettings } from "./service";
import { COMMON_TIME_ZONES } from "./time-zones";

interface SettingsFormProps {
  initialSettings: ProfileSettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [pending, startTransition] = useTransition();
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [feedback, setFeedback] = useState<ActionFeedbackState | null>(null);
  const [publicAlias, setPublicAlias] = useState(initialSettings.publicAlias ?? "");
  const [timeZone, setTimeZone] = useState(initialSettings.timeZone);
  const controlsDisabled = pending || !hydrated;
  const timeZones = COMMON_TIME_ZONES.some((option) => option.value === timeZone)
    ? COMMON_TIME_ZONES
    : [...COMMON_TIME_ZONES, { value: timeZone, label: timeZone }];

  function onSubmit() {
    startTransition(async () => {
      setFeedback(null);
      const result = await saveProfileSettingsAction({ publicAlias, timeZone });
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error, recovery: result.recovery });
        return;
      }

      setPublicAlias(result.data.settings.publicAlias ?? "");
      setTimeZone(result.data.settings.timeZone);
      setFeedback({ kind: "success", message: result.data.message });
    });
  }

  return (
    <section className="rounded-panel border border-line bg-surface p-4 sm:p-6">
      <div className="max-w-2xl space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Profile visibility</h2>
          <p className="mt-2 text-sm text-muted">Published questions show this alias. If you leave it blank, public contributions stay anonymous.</p>
        </div>

        <div>
          <label htmlFor="settings-public-alias" className="block text-sm font-medium">Public alias</label>
          <input
            id="settings-public-alias"
            value={publicAlias}
            onChange={(event) => setPublicAlias(event.target.value)}
            disabled={controlsDisabled}
            maxLength={40}
            className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:opacity-60"
          />
          <p className="mt-2 text-sm text-muted">Never uses your provider name or email. Maximum 40 characters.</p>
        </div>

        <div>
          <label htmlFor="settings-time-zone" className="block text-sm font-medium">Time zone</label>
          <select
            id="settings-time-zone"
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            disabled={controlsDisabled}
            className="mt-1 min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm disabled:opacity-60"
          >
            {timeZones.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-muted">Practice due dates, activity history, and calendar group by this IANA time zone.</p>
        </div>

        <ActionFeedback feedback={feedback} />

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onSubmit} disabled={controlsDisabled} className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-60">
            Save settings
          </button>
          <span className="text-sm text-muted">Changes apply immediately to progress and public author labels.</span>
        </div>
      </div>
    </section>
  );
}