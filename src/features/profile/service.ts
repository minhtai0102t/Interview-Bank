import type { Actor } from "@/lib/actor";
import { requireActor } from "@/lib/actor";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

import { MAX_ALIAS_CHARS } from "../questions/limits";

export interface ProfileSettings {
  publicAlias: string | null;
  timeZone: string;
}

function invalid(message: string): never {
  throw new DomainError("INVALID_INPUT", message);
}

function parsePublicAlias(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > MAX_ALIAS_CHARS) invalid(`Public alias must be ${MAX_ALIAS_CHARS} characters or fewer.`);
  return normalized;
}

function parseTimeZone(value: string): string {
  const normalized = value.trim();
  if (!normalized) invalid("Choose a valid time zone.");

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: normalized }).resolvedOptions().timeZone;
  } catch {
    invalid("Choose a valid time zone.");
  }
}

export async function getProfileSettings(actor: Actor | null): Promise<ProfileSettings> {
  const signedIn = requireActor(actor);
  const profile = await getPrisma().profile.findUnique({
    where: { userId: signedIn.userId },
    select: { publicAlias: true, timeZone: true },
  });

  return profile ?? { publicAlias: null, timeZone: "UTC" };
}

export async function saveProfileSettings(actor: Actor | null, input: ProfileSettings): Promise<ProfileSettings> {
  const signedIn = requireActor(actor);
  const publicAlias = parsePublicAlias(input.publicAlias);
  const timeZone = parseTimeZone(input.timeZone);

  const profile = await getPrisma().profile.upsert({
    where: { userId: signedIn.userId },
    create: { userId: signedIn.userId, publicAlias, timeZone },
    update: { publicAlias, timeZone },
    select: { publicAlias: true, timeZone: true },
  });

  return profile;
}