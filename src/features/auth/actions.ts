"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { configuredProviders, parseSignInRequest } from "@/features/auth/sign-in";
import { getAuth } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/auth-options";
import { getAuthEnv } from "@/lib/env";

const signInFailed = (code: string) => `${SIGN_IN_PATH}?error=${code}`;

/** Starts signing in: sends the browser to the chosen provider, or back to the sign-in page with a reason. */
export async function signInWithProvider(formData: FormData): Promise<never> {
  const offered = configuredProviders(getAuthEnv()).map(({ id }) => id);
  const request = parseSignInRequest({ provider: formData.get("provider"), next: formData.get("next") }, offered);
  if (!request) redirect(signInFailed("provider_unavailable"));

  let providerUrl: string | undefined;
  try {
    const result = await getAuth().api.signInSocial({
      body: { provider: request.provider, callbackURL: request.next },
      headers: await headers(),
    });
    providerUrl = result.url;
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
  }

  // redirect() works by throwing, so it stays outside the try block.
  redirect(providerUrl ?? signInFailed("sign_in_failed"));
}

/** Ends the current session. Safe to repeat: with no session there is nothing to end. */
export async function signOut(): Promise<never> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
