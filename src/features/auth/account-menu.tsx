import Link from "next/link";
import { LogIn, LogOut, Settings2, Shield } from "lucide-react";

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
        className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium hover:bg-canvas"
      >
        <LogIn className="size-4" aria-hidden />
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <span className="max-w-40 truncate text-sm text-muted" title={actor.name}>
        {actor.name}
      </span>
      <Link href="/settings" className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium hover:bg-canvas">
        <Settings2 className="size-4" aria-hidden />
        Settings
      </Link>
      {actor.role === "ADMIN" ? (
        <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium hover:bg-canvas">
          <Shield className="size-4" aria-hidden />
          Admin
        </Link>
      ) : null}
      <form action={signOut}>
        <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium hover:bg-canvas">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}
