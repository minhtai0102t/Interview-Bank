import Link from "next/link";

import { signOut } from "@/features/auth/actions";
import { SIGN_IN_PATH } from "@/lib/auth-options";
import { getCurrentActor } from "@/lib/current-actor";

/** Who is signed in, with a way to sign out; a link to sign in for everyone else. */
export async function AccountMenu() {
  const actor = await getCurrentActor();

  if (!actor) {
    return (
      <Link
        href={SIGN_IN_PATH}
        className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium hover:bg-canvas"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="max-w-40 truncate text-sm text-muted" title={actor.name}>
        {actor.name}
      </span>
      <form action={signOut}>
        <button type="submit" className="min-h-11 rounded-control px-3 text-sm font-medium hover:bg-canvas">
          Sign out
        </button>
      </form>
    </div>
  );
}
