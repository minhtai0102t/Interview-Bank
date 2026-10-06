import "server-only";

import type { Actor } from "@/lib/actor";
import { getAuth } from "@/lib/auth";

/** Resolves the session cookie in `headers` to an actor. The role is read from the database on every call. */
export async function actorFromHeaders(headers: Headers): Promise<Actor | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;

  const { id, name, role } = session.user;
  return { userId: id, name, role: role === "ADMIN" ? "ADMIN" : "USER" };
}
