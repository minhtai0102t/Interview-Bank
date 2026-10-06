import { DomainError } from "@/lib/errors";

export type Role = "USER" | "ADMIN";

/** Who is making a request. Services take an actor instead of reading the session themselves. */
export interface Actor {
  readonly userId: string;
  readonly role: Role;
  readonly name: string;
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new DomainError("UNAUTHORIZED");
  return actor;
}

export function requireAdmin(actor: Actor | null): Actor {
  const signedIn = requireActor(actor);
  if (signedIn.role !== "ADMIN") throw new DomainError("FORBIDDEN");
  return signedIn;
}
