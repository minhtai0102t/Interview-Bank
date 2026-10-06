import type { AuthEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/redirect";

export const PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
}

/** The providers that have credentials in this environment, in display order. */
export function configuredProviders(env: AuthEnv): Provider[] {
  return PROVIDERS.filter(({ id }) => env.providers[id]);
}

export interface SignInRequest {
  readonly provider: ProviderId;
  /** A path on this site to return to after signing in. */
  readonly next: string;
}

/** Checks what a sign-in form posted. Returns null when the provider is not one that is offered here. */
export function parseSignInRequest(
  input: { readonly provider: unknown; readonly next: unknown },
  offered: readonly ProviderId[],
): SignInRequest | null {
  const provider = offered.find((id) => id === input.provider);
  if (!provider) return null;
  return { provider, next: safeRedirectPath(input.next) };
}

const SESSION_EXPIRED = "That sign-in attempt expired or was started in another browser. Please try again.";

/** Only codes listed here are explained; the page never shows text taken from the address. */
const MESSAGES = new Map([
  ["access_denied", "Sign-in was cancelled. You can try again when you are ready."],
  [
    "account_not_linked",
    "This email address already belongs to an account that signs in with a different provider. Use the provider you chose the first time.",
  ],
  ["state_mismatch", SESSION_EXPIRED],
  ["state_invalid", SESSION_EXPIRED],
  ["state_not_found", SESSION_EXPIRED],
  ["email_not_found", "The provider did not share an email address. Add a verified email address there, or choose another provider."],
  ["provider_unavailable", "That sign-in option is not available."],
]);

const GENERAL_MESSAGE = "Sign-in did not finish. Please try again.";

/** What to tell someone who came back to the sign-in page with `?error=<code>`; null when nothing went wrong. */
export function signInErrorMessage(code: unknown): string | null {
  if (typeof code !== "string" || code === "") return null;
  return MESSAGES.get(code) ?? GENERAL_MESSAGE;
}
