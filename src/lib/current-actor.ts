import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { Actor } from "@/lib/actor";
import { SIGN_IN_PATH } from "@/lib/auth-options";
import { safeRedirectPath } from "@/lib/redirect";
import { actorFromHeaders } from "@/lib/session";

/** Who is making the current request, or null. Looked up once per request however often it is called. */
export const getCurrentActor = cache(async (): Promise<Actor | null> => actorFromHeaders(await headers()));

/** For pages that need a signed-in person: anyone else is sent to sign in and brought back to `returnTo`. */
export async function requirePageActor(returnTo: string): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(safeRedirectPath(returnTo))}`);
  return actor;
}
