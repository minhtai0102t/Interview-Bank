import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signInWithProvider } from "@/features/auth/actions";
import { configuredProviders, signInErrorMessage } from "@/features/auth/sign-in";
import { getCurrentActor } from "@/lib/current-actor";
import { getAuthEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const firstValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const query = await searchParams;
  const next = safeRedirectPath(firstValue(query.next));

  if (await getCurrentActor()) redirect(next);

  const providers = configuredProviders(getAuthEnv());
  const errorMessage = signInErrorMessage(firstValue(query.error));

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-muted">Sign in to import questions and keep your own practice progress.</p>
      {errorMessage ? (
        <p role="alert" className="mt-4 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {errorMessage}
        </p>
      ) : null}
      <ul className="mt-6 space-y-3">
        {providers.map(({ id, label }) => (
          <li key={id}>
            <form action={signInWithProvider}>
              <input type="hidden" name="provider" value={id} />
              <input type="hidden" name="next" value={next} />
              <button
                type="submit"
                className="min-h-11 w-full rounded-control border border-line bg-surface px-4 text-sm font-medium hover:bg-canvas"
              >
                Continue with {label}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
